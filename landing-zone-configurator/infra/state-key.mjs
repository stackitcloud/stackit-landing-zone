import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// CI validation is explicitly disposable. Deployment must use an existing key.
export function stateKey(location, { ci = false, validation = false, suppliedKey } = {}) {
  if (ci && !validation) {
    if (typeof suppliedKey !== "string" || suppliedKey.trim().length < 32) {
      throw new Error("CI deployment requires an existing state-encryption key; automatic generation is forbidden");
    }
    return suppliedKey.trim();
  }
  const keyFile = resolve(location, "state.passphrase");
  if (!existsSync(keyFile)) {
    if (existsSync(resolve(location, "data")) || existsSync(resolve(location, "terraform.tfstate"))) {
      throw new Error("Encryption key missing for an existing workspace; restore the original key");
    }
    writeFileSync(keyFile, randomBytes(48).toString("base64url"), { mode: 0o600, flag: "wx" });
  }
  const key = readFileSync(keyFile, "utf8").trim();
  if (key.length < 32) throw new Error("Invalid local state-encryption key");
  return key;
}
