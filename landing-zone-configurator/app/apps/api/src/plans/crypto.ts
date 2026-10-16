import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, open, readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";

export function canonicalBase64(value: string, limit: number): Buffer {
  if (
    value.length > Math.ceil(limit / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  )
    throw new Error("artifact_invalid");
  const bytes = Buffer.from(value, "base64");
  if (
    !bytes.length ||
    bytes.length > limit ||
    bytes.toString("base64") !== value
  )
    throw new Error("artifact_invalid");
  return bytes;
}

export class ArtifactCrypto {
  private readonly key: Buffer;

  constructor(base64: string) {
    this.key = canonicalBase64(base64, 32);
    if (this.key.length !== 32)
      throw new Error("deployment_artifact_key_invalid");
  }

  encrypt(bytes: Buffer, tenant: string, owner: string, key: string): Buffer {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    cipher.setAAD(Buffer.from(JSON.stringify([tenant, owner, key])));
    const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]);
  }

  decrypt(bytes: Buffer, tenant: string, owner: string, key: string): Buffer {
    if (bytes.length < 28) throw new Error("artifact_invalid");
    const cipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      bytes.subarray(0, 12),
    );
    cipher.setAAD(Buffer.from(JSON.stringify([tenant, owner, key])));
    cipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]);
  }
}

export async function localArtifactCrypto(
  path: string,
): Promise<ArtifactCrypto> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  try {
    const handle = await open(path, "wx", 0o600);
    try {
      await handle.writeFile(randomBytes(32).toString("base64"));
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const metadata = await stat(path);
  if (metadata.mode & 0o077 || metadata.uid !== process.getuid?.())
    throw new Error("deployment_artifact_key_permissions");
  return new ArtifactCrypto(await readFile(path, "utf8"));
}
