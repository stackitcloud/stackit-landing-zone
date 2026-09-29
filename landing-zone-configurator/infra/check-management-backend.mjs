// Integration check and encrypted seed-state backup. Never uploads encryption keys.
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const infra = dirname(fileURLToPath(import.meta.url));
const local = resolve(infra, "../.local");
const binary = process.env.LZC_TOFU_BIN ?? "tofu";
const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(AWS_|TF_|STACKIT_|LZC_STATE_KEY_)/.test(k)));
const seedEnv = { ...baseEnv, TF_DATA_DIR: resolve(local, "seed/data"),
  TF_ENCRYPTION: JSON.stringify({ key_provider: { pbkdf2: { state: {
    passphrase: readFileSync(resolve(local, "seed/state.passphrase"), "utf8").trim(),
  } } } }) };
function run(command, args, env) {
  try { return execFileSync(command, args, { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch { throw new Error(`Backend check failed: ${command === binary ? "seed output" : args[1]}`); }
}
const outputs = JSON.parse(run(binary, [`-chdir=${resolve(infra, "seed")}`, "output", "-json"], seedEnv));
const { bucket, endpoint, region } = outputs.backend.value;
const credentials = outputs.backend_credentials.value;
const env = { ...baseEnv, AWS_ACCESS_KEY_ID: credentials.access_key,
  AWS_SECRET_ACCESS_KEY: credentials.secret_key, AWS_DEFAULT_REGION: region, AWS_PAGER: "" };
function s3(operation, args = []) {
  const output = run("aws", ["s3api", operation, "--bucket", bucket, "--endpoint-url", endpoint, "--output", "json", ...args], env);
  return output.trim() ? JSON.parse(output) : {};
}
const directory = resolve(local, "backend-check", randomUUID());
mkdirSync(directory, { recursive: true, mode: 0o700 });
const key = `checks/${randomUUID()}/restore.txt`;
const versions = [];
try {
  if (s3("get-bucket-versioning").Status !== "Enabled") throw new Error("Versioning is not enabled");
  console.log("PASS: bucket versioning enabled");
  for (const value of ["first-version", "second-version"]) {
    const path = resolve(directory, "input");
    writeFileSync(path, value, { mode: 0o600 });
    const result = s3("put-object", ["--key", key, "--body", path]);
    if (!result.VersionId) throw new Error("Object version ID missing");
    versions.push(result.VersionId);
  }
  const restored = resolve(directory, "restored");
  s3("get-object", ["--key", key, "--version-id", versions[0], restored]);
  if (readFileSync(restored, "utf8") !== "first-version") throw new Error("Version restore mismatch");
  console.log("PASS: previous object version restored and verified");
  for (const root of ["seed", "seed-protection"]) {
    const path = resolve(local, root, "terraform.tfstate");
    const contents = readFileSync(path);
    const envelope = JSON.parse(contents);
    if (!envelope.encrypted_data || !envelope.encryption_version) throw new Error("Refusing to back up unencrypted state");
    const backupKey = `recovery/${root}/terraform.tfstate`;
    s3("put-object", ["--key", backupKey, "--body", path]);
    const restoredState = resolve(directory, root);
    s3("get-object", ["--key", backupKey, restoredState]);
    const hash = (data) => createHash("sha256").update(data).digest("hex");
    if (hash(readFileSync(restoredState)) !== hash(contents)) throw new Error("State backup mismatch");
    console.log(`PASS: encrypted ${root} state backup verified (keys remain separate)`);
  }
} finally {
  for (const version of versions) s3("delete-object", ["--key", key, "--version-id", version]);
  rmSync(directory, { recursive: true, force: true });
}
