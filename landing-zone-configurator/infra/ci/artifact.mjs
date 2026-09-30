import { randomBytes, scryptSync, createCipheriv } from "node:crypto";
import { writeFileSync } from "node:fs";

export function writeProtectedArtifact(path, content, passphrase) {
  if (passphrase.length < 32) throw new Error("Invalid artifact encryption key");
  const salt = randomBytes(16), nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", scryptSync(passphrase, salt, 32), nonce);
  const data = Buffer.concat([cipher.update(content), cipher.final()]);
  writeFileSync(path, JSON.stringify({ version: 1, kdf: "scrypt", cipher: "aes-256-gcm", salt: salt.toString("base64"), nonce: nonce.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") }), { mode: 0o600 });
}
