import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { Session } from "../auth/store.js";
import { parseServiceAccountKey, type ServiceAccountKey } from "./key.js";
import type { CredentialSecrets } from "./secrets.js";

export class LocalCredentialSecrets implements CredentialSecrets {
  private constructor(
    private readonly directory: string,
    private readonly masterKey: Buffer,
  ) {}

  static async open(directory: string) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const info = await stat(directory);
    if (
      !info.isDirectory() ||
      (info.mode & 0o077) !== 0 ||
      info.uid !== process.getuid?.()
    )
      throw new Error("Local secret directory must be owner-only");
    const keyPath = join(directory, "master.key");
    try {
      await writeFile(keyPath, randomBytes(32), { flag: "wx", mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const keyInfo = await stat(keyPath);
    if (
      !keyInfo.isFile() ||
      (keyInfo.mode & 0o077) !== 0 ||
      keyInfo.uid !== process.getuid?.()
    )
      throw new Error("Local encryption key must be owner-only");
    const masterKey = await readFile(keyPath);
    if (masterKey.length !== 32)
      throw new Error("Invalid local encryption key");
    return new LocalCredentialSecrets(directory, masterKey);
  }

  private location(session: Session, id: string) {
    const binding = [session.tenantId, session.userId, id]
      .map((value) => z.uuid().parse(value))
      .join("_");
    return {
      path: join(this.directory, `${binding}.sealed`),
      binding: Buffer.from(binding),
    };
  }

  async put(session: Session, id: string, rawKey: ServiceAccountKey) {
    const key = parseServiceAccountKey(rawKey);
    const { path, binding } = this.location(session, id);
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.masterKey, nonce);
    cipher.setAAD(binding);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(key), "utf8"),
      cipher.final(),
    ]);
    await writeFile(
      path,
      Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]),
      { flag: "wx", mode: 0o600 },
    );
  }

  async get(session: Session, id: string) {
    const { path, binding } = this.location(session, id);
    const sealed = await readFile(path);
    if (sealed.length <= 28 || sealed.length > 32768)
      throw new Error("Invalid local secret");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.masterKey,
      sealed.subarray(0, 12),
    );
    decipher.setAAD(binding);
    decipher.setAuthTag(sealed.subarray(12, 28));
    const plaintext = Buffer.concat([
      decipher.update(sealed.subarray(28)),
      decipher.final(),
    ]);
    return {
      key: parseServiceAccountKey(JSON.parse(plaintext.toString("utf8"))),
      version: 1,
    };
  }

  async remove(session: Session, id: string) {
    await rm(this.location(session, id).path, { force: true });
  }
}
