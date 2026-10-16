import { createDecipheriv, scryptSync } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function loadLocalModelServingToken() {
  const local = fileURLToPath(new URL("../../.local/", import.meta.url));
  const state = join(local, "assistant-test-platform-state.enc.json");
  const keyPath = join(local, "platform/state.passphrase");
  for (const path of [state, keyPath]) {
    const file = lstatSync(path);
    if (
      !file.isFile() ||
      (file.mode & 0o077) !== 0 ||
      file.uid !== process.getuid?.()
    )
      throw new Error("private_file_required");
  }
  const passphrase = readFileSync(keyPath, "utf8").trim();
  if (passphrase.length < 32) throw new Error("original_key_required");
  return assistantTestTokenFromRecovery(
    readFileSync(state, "utf8"),
    passphrase,
  );
}

export function assistantTestTokenFromRecovery(
  encrypted: string,
  passphrase: string,
) {
  const envelope: unknown = JSON.parse(encrypted);
  if (
    !record(envelope) ||
    envelope.version !== 1 ||
    envelope.kdf !== "scrypt" ||
    envelope.cipher !== "aes-256-gcm" ||
    typeof envelope.salt !== "string" ||
    typeof envelope.nonce !== "string" ||
    typeof envelope.tag !== "string" ||
    typeof envelope.data !== "string" ||
    passphrase.length < 32
  )
    throw new Error("encrypted_recovery_required");
  const salt = Buffer.from(envelope.salt, "base64");
  const nonce = Buffer.from(envelope.nonce, "base64");
  const tag = Buffer.from(envelope.tag, "base64");
  if (salt.length !== 16 || nonce.length !== 12 || tag.length !== 16)
    throw new Error("encrypted_recovery_required");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    scryptSync(passphrase, salt, 32),
    nonce,
  );
  decipher.setAuthTag(tag);
  const snapshot: unknown = JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(envelope.data, "base64")),
      decipher.final(),
    ]).toString("utf8"),
  );
  if (
    !record(snapshot) ||
    !record(snapshot.outputs) ||
    !record(snapshot.outputs.assistant_test_model_serving_token)
  )
    throw new Error("test_token_output_required");
  const output = snapshot.outputs.assistant_test_model_serving_token;
  if (
    output.sensitive !== true ||
    typeof output.value !== "string" ||
    !output.value.trim()
  )
    throw new Error("sensitive_test_token_required");
  return output.value;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
