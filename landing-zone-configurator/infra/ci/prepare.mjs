// Prepare files/environment only. Every OpenTofu invocation stays in the workflow.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { deploymentInputs } from "./context.mjs";

const [mode] = process.argv.slice(2);
if (!["management", "workload", "validation"].includes(mode)) throw new Error("Usage: prepare.mjs management|workload|validation");
process.umask(0o077);
const privateDir = resolve(process.env.RUNNER_TEMP, "lzc-private");
mkdirSync(privateDir, { recursive: true, mode: 0o700 });
const required = name => { if (!process.env[name]) throw new Error(`Missing ${name}`); return process.env[name]; };
const mask = value => console.log(`::add-mask::${String(value).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A")}`);
function publish(name, value, sensitive = false) {
  if (sensitive) mask(value);
  const delimiter = `lzc_${randomUUID()}`;
  appendFileSync(required("GITHUB_ENV"), `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}
function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new Error("Required private JSON input missing or invalid"); }
}
function encryption(root, passphrase) {
  if (passphrase.trim().length < 32) throw new Error("Invalid state encryption key");
  mask(passphrase.trim());
  const value = JSON.stringify({ key_provider: { pbkdf2: { state: { passphrase: passphrase.trim() } } } });
  writeFileSync(resolve(privateDir, `${root}.encryption.json`), value, { mode: 0o600 });
  return value;
}
function backend(root, bucket, inputs) {
  const settings = { bucket, key: `configurator/${inputs.prefix}/${root}/terraform.tfstate`, region: inputs.region,
    endpoints: { s3: `https://object.storage.${inputs.region}.onstackit.cloud` }, use_path_style: true, use_lockfile: true,
    skip_credentials_validation: true, skip_region_validation: true, skip_requesting_account_id: true,
    skip_metadata_api_check: true, skip_s3_checksum: true };
  writeFileSync(resolve(privateDir, `${root}.backend.hcl`), Object.entries(settings).map(([k,v]) => `${k} = ${JSON.stringify(v)}`).join("\n"), { mode: 0o600 });
}
if (mode === "validation") {
  const root = required("LZC_ROOT");
  if (!["seed", "seed-protection", "bootstrap", "backend", "platform"].includes(root)) throw new Error("Invalid validation root");
  publish("TF_ENCRYPTION", encryption(root, randomBytes(48).toString("base64url")), true);
  publish("TF_DATA_DIR", resolve(privateDir, `${root}-data`));
} else {
  const inputs = deploymentInputs(process.env);
  if (mode === "management") {
    // Environment-scoped GitHub variables are read in this step, then passed to
    // subsequent steps through GITHUB_ENV (not evaluated at workflow scope).
    for (const name of ["LZC_PROJECT_ID", "LZC_REGION", "LZC_NAME_PREFIX", "LZC_MANAGEMENT_BUCKET", "LZC_CREDENTIAL_EXPIRATION"]) publish(name, required(name));
    const key = required("LZC_SERVICE_ACCOUNT_KEY");
    try { JSON.parse(key); } catch { throw new Error("Invalid service account JSON"); }
    writeFileSync(resolve(privateDir, "service-account.json"), key, { mode: 0o600 });
    const roots = inputs.root === "platform" ? ["bootstrap", "backend", "platform"] : ["bootstrap", "backend"];
    for (const root of roots) {
      const config = encryption(root, required(`LZC_STATE_KEY_${root.toUpperCase()}`));
      if (root === inputs.root) publish("TF_ENCRYPTION", config, true);
      backend(root, inputs.bucket, inputs);
    }
    publish("STACKIT_SERVICE_ACCOUNT_KEY_PATH", resolve(privateDir, "service-account.json"));
    publish("AWS_ACCESS_KEY_ID", required("LZC_MANAGEMENT_ACCESS_KEY"), true);
    publish("AWS_SECRET_ACCESS_KEY", required("LZC_MANAGEMENT_SECRET_KEY"), true);
    publish("TF_VAR_project_id", inputs.project);
    publish("TF_VAR_region", inputs.region);
    publish("TF_VAR_name_prefix", inputs.prefix);
    publish("TF_VAR_state_credential_expiration", inputs.expiration);
    publish("TF_DATA_DIR", resolve(privateDir, `${inputs.root}-data`));
    publish("LZC_PLAN", resolve(".local/ci-plan/review.tfplan"));
    mkdirSync(resolve(".local/ci-plan"), { recursive: true, mode: 0o700 });
  } else {
    if (!["backend", "platform"].includes(inputs.root)) throw new Error("Workload inputs not required for this root");
    const outputs = readJson(resolve(privateDir, "bootstrap-outputs.json"));
    const storage = outputs.backend?.value, credentials = outputs.backend_credentials?.value;
    if (storage?.bucket !== `${inputs.prefix}-state-${inputs.project.slice(0,8)}` || storage?.region !== inputs.region || !credentials?.access_key || !credentials?.secret_key) throw new Error("Invalid workload backend outputs");
    if (inputs.root === "platform") {
      const protection = readJson(resolve(privateDir, "backend-outputs.json"));
      if (protection.versioning_enabled?.value !== true || protection.state_bucket_name?.value !== storage.bucket) throw new Error("Versioned workload backend is not ready");
      backend("platform", storage.bucket, inputs);
      publish("AWS_ACCESS_KEY_ID", credentials.access_key, true);
      publish("AWS_SECRET_ACCESS_KEY", credentials.secret_key, true);
    } else {
      publish("TF_VAR_state_bucket_name", storage.bucket);
      publish("TF_VAR_storage_access_key", credentials.access_key, true);
      publish("TF_VAR_storage_secret_key", credentials.secret_key, true);
    }
  }
}
publish("LZC_PRIVATE", privateDir);
publish("TF_INPUT", "0");
publish("TF_IN_AUTOMATION", "1");
