import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type pg from "pg";
import { z } from "zod";
import type { DevelopmentLogin } from "../apps/api/src/auth/development-login.js";
import { tokenHash } from "../apps/api/src/auth/store.js";

const derive = promisify(scrypt);
const accountSchema = z.strictObject({
  id: z.uuid(),
  username: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  salt: z.string().regex(/^[a-f0-9]{64}$/),
  passwordHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type DevelopmentAccount = z.infer<typeof accountSchema>;

export async function developmentPasswordHash(password: string, salt: string) {
  const key = await derive(password, Buffer.from(salt, "hex"), 32);
  if (!Buffer.isBuffer(key))
    throw new Error("development_password_hash_failed");
  return key;
}

export async function openDevelopmentAccount(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const folder = await lstat(directory);
  if (
    !folder.isDirectory() ||
    folder.uid !== process.getuid?.() ||
    (folder.mode & 0o077) !== 0
  )
    throw new Error("private_development_directory_required");
  const path = join(directory, "account.json");
  try {
    const file = await lstat(path);
    if (
      !file.isFile() ||
      file.uid !== process.getuid?.() ||
      (file.mode & 0o077) !== 0
    )
      throw new Error("private_development_account_required");
    return accountSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    )
      throw error;
    const password = randomBytes(32).toString("base64url");
    const salt = randomBytes(32).toString("hex");
    const account = {
      id: randomUUID(),
      username: "developer",
      salt,
      passwordHash: (await developmentPasswordHash(password, salt)).toString(
        "hex",
      ),
    };
    await writeFile(join(directory, "initial-password"), `${password}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    await writeFile(path, `${JSON.stringify(account)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    return account;
  }
}

export async function createDevelopmentSession(
  pool: pg.Pool,
  accountId: string,
) {
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    "SELECT lzc_auth.complete_development_login($1,$2,$3,$4,$5)",
    [
      accountId,
      randomUUID(),
      tokenHash(token),
      randomBytes(32).toString("base64url"),
      new Date(Date.now() + 8 * 3600000),
    ],
  );
  return token;
}

export function developmentLogin(
  pool: pg.Pool,
  account: DevelopmentAccount,
): DevelopmentLogin {
  return {
    async authenticate(username, password) {
      const candidate = await developmentPasswordHash(password, account.salt);
      const expected = Buffer.from(account.passwordHash, "hex");
      const valid = timingSafeEqual(candidate, expected);
      if (!valid || username !== account.username) return null;
      return createDevelopmentSession(pool, account.id);
    },
  };
}
