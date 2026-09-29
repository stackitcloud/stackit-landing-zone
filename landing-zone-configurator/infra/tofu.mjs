import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { stateKey } from "./state-key.mjs";
import { isApplicablePlan } from "./plan-guard.mjs";

const infra = dirname(fileURLToPath(import.meta.url));
const repository = resolve(infra, "../..");
const local = resolve(infra, "../.local");
const [root, command, ...extra] = process.argv.slice(2);
const allowed = ["init", "validate", "plan", "apply", "test", "fmt", "providers"];
if (!["seed", "seed-protection", "bootstrap", "backend", "platform"].includes(root) || !allowed.includes(command)) {
  console.error("Usage: node infra/tofu.mjs <seed|seed-protection|bootstrap|backend|platform> <init|validate|plan|apply|test|fmt|providers> [options]");
  process.exit(1);
}
const binary = process.env.LZC_TOFU_BIN ?? "tofu";
const version = JSON.parse(execFileSync(binary, ["version", "-json"], { encoding: "utf8" }));
if (version.terraform_version !== "1.12.6") throw new Error("OpenTofu 1.12.6 is required");
process.umask(0o077);
mkdirSync(local, { recursive: true, mode: 0o700 });

function rootEnvironment(name) {
  const location = resolve(local, name);
  mkdirSync(location, { recursive: true, mode: 0o700 });
  const ci = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
  const validation = ["validate", "test", "fmt", "providers"].includes(command) ||
    (command === "init" && extra.includes("-backend=false"));
  // Fail closed until durable remote state has been integrated for every root.
  if (ci && !validation) throw new Error("CI cloud operations require the remote-state integration; local CI state is forbidden");
  const passphrase = stateKey(location, {
    ci, validation, suppliedKey: process.env[`LZC_STATE_KEY_${name.toUpperCase()}`],
  });
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !key.startsWith("LZC_STATE_KEY_") && !key.startsWith("STACKIT_") && !key.startsWith("TF_VAR_") && !key.startsWith("TF_LOG") &&
    !key.startsWith("TF_CLI_ARGS") && !key.startsWith("AWS_")));
  env.TF_DATA_DIR = resolve(location, "data");
  env.TF_INPUT = "0";
  env.TF_ENCRYPTION = JSON.stringify({ key_provider: { pbkdf2: { state: { passphrase } } } });
  return env;
}

try {
  if(command === "apply" && ["bootstrap","backend","platform"].includes(root)) {
    const safety=JSON.parse(readFileSync(resolve(infra,"ci/backend-safety.json"),"utf8"));
    if(safety.mode === "github-actions-single-writer" || safety.s3LockingVerified !== true)throw new Error("Local remote apply disabled: use the serialized GitHub Actions workflow");
  }
  const env = rootEnvironment(root);
  const configFile = resolve(repository, "landing-zone-configurator.env");
  const config = existsSync(configFile) ? parseEnv(readFileSync(configFile, "utf8")) : {};
  const cloudOperation = ["plan", "apply"].includes(command) || (["bootstrap", "backend", "platform"].includes(root) && command === "init" && !extra.includes("-backend=false"));
  if (cloudOperation) {
    if (!config.PROJECT_ID || !config.REGION || !config.NAME_PREFIX) {
      throw new Error("Set PROJECT_ID, REGION and NAME_PREFIX in the local configurator env file before planning/applying");
    }
    const credentials = resolve(repository, "landing-zone-configurator-credentials.json");
    if (!existsSync(credentials)) throw new Error("Configurator credential file is missing");
    env.STACKIT_SERVICE_ACCOUNT_KEY_PATH = credentials;
    env.TF_VAR_project_id = config.PROJECT_ID;
    env.TF_VAR_region = config.REGION;
    env.TF_VAR_name_prefix = config.NAME_PREFIX;
    if (["seed", "bootstrap"].includes(root)) {
      if (!config.STATE_CREDENTIAL_EXPIRATION) throw new Error("Set STATE_CREDENTIAL_EXPIRATION explicitly");
      env.TF_VAR_state_credential_expiration = config.STATE_CREDENTIAL_EXPIRATION;
    }
  }
  const args = [`-chdir=${resolve(infra, root)}`, command, ...extra];
  if (["seed", "seed-protection"].includes(root) && command === "init" && !extra.includes("-backend=false")) {
    args.push(`-backend-config=path=${resolve(local, root, "terraform.tfstate")}`);
  }
  function readOutputs(name) {
    try {
      return JSON.parse(execFileSync(binary, [`-chdir=${resolve(infra, name)}`, "output", "-json"],
        { env: rootEnvironment(name), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    } catch { throw new Error(`Outputs unavailable for ${name}; initialize/apply or restore it first`); }
  }
  function credentialsFrom(outputs) {
    const credentials = outputs.backend_credentials?.value;
    if (!credentials) throw new Error("Backend credentials missing");
    return credentials;
  }
  if (["seed-protection", "bootstrap", "backend", "platform"].includes(root) && cloudOperation) {
    const management = readOutputs("seed");
    const managementCredentials = credentialsFrom(management);
    let source = management;
    if (root === "platform") {
      // Read bootstrap with its management backend credentials, without printing outputs.
      const bootstrapEnv = rootEnvironment("bootstrap");
      bootstrapEnv.AWS_ACCESS_KEY_ID = managementCredentials.access_key;
      bootstrapEnv.AWS_SECRET_ACCESS_KEY = managementCredentials.secret_key;
      try {
        source = JSON.parse(execFileSync(binary, [`-chdir=${resolve(infra, "bootstrap")}`, "output", "-json"],
          { env: bootstrapEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
      } catch { throw new Error("Bootstrap outputs unavailable"); }
    }
    const backend = source.backend?.value;
    const credentials = credentialsFrom(source);
    if (!backend || backend.region !== config.REGION) throw new Error("Backend region mismatch");
    env.AWS_ACCESS_KEY_ID = credentials.access_key;
    env.AWS_SECRET_ACCESS_KEY = credentials.secret_key;
    if (root === "seed-protection") env.TF_VAR_state_bucket_name = backend.bucket;
    if (root === "backend" && command !== "init") {
      const bootstrapEnv = { ...rootEnvironment("bootstrap"), AWS_ACCESS_KEY_ID: managementCredentials.access_key,
        AWS_SECRET_ACCESS_KEY: managementCredentials.secret_key };
      let outputs;
      try {
        outputs = JSON.parse(execFileSync(binary, [`-chdir=${resolve(infra, "bootstrap")}`, "output", "-json"],
          { env: bootstrapEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
      } catch { throw new Error("Bootstrap outputs unavailable"); }
      env.TF_VAR_state_bucket_name = outputs.backend.value.bucket;
      // AWS provider uses explicit credentials; S3 state backend retains management credentials.
      const workload = credentialsFrom(outputs);
      env.TF_VAR_storage_access_key = workload.access_key;
      env.TF_VAR_storage_secret_key = workload.secret_key;
    }
    if (["bootstrap", "backend", "platform"].includes(root) && command === "init") {
      if (root === "platform") {
        const protectionEnv = { ...rootEnvironment("backend"), AWS_ACCESS_KEY_ID: managementCredentials.access_key,
          AWS_SECRET_ACCESS_KEY: managementCredentials.secret_key };
        let protection;
        try {
          protection = JSON.parse(execFileSync(binary, [`-chdir=${resolve(infra, "backend")}`, "output", "-json"],
            { env: protectionEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
        } catch { throw new Error("Backend protection outputs unavailable"); }
        if (protection.versioning_enabled?.value !== true || protection.state_bucket_name?.value !== backend.bucket) {
          throw new Error("Apply workload bucket versioning first");
        }
      } else {
        const protection = readOutputs("seed-protection");
        if (protection.versioning_enabled?.value !== true || protection.state_bucket_name?.value !== backend.bucket) {
          throw new Error("Apply management bucket versioning first");
        }
      }
      const backendFile = resolve(local, root, "backend.hcl");
      const settings = [
        `bucket = ${JSON.stringify(backend.bucket)}`,
        `key = ${JSON.stringify(`configurator/${config.NAME_PREFIX}/${root}/terraform.tfstate`)}`,
        `region = ${JSON.stringify(backend.region)}`,
        `endpoints = { s3 = ${JSON.stringify(backend.endpoint)} }`,
        "use_path_style = true", "use_lockfile = true", "skip_credentials_validation = true",
        "skip_region_validation = true", "skip_requesting_account_id = true", "skip_metadata_api_check = true",
        "skip_s3_checksum = true",
      ];
      writeFileSync(backendFile, `${settings.join("\n")}\n`, { mode: 0o600 });
      args.push(`-backend-config=${backendFile}`);
    }
  }
  const planPath = resolve(local, root, "review.tfplan");
  const manifestPath = resolve(local, root, "review.json");
  const contextHash = createHash("sha256").update(JSON.stringify(Object.entries(config).sort())).digest("hex");
  const hashPlan = () => createHash("sha256").update(readFileSync(planPath)).digest("hex");
  if (command === "plan") {
    writeFileSync(manifestPath, JSON.stringify({ status: "planning" }), { mode: 0o600 });
    if (extra.some((arg) => arg.startsWith("-out"))) throw new Error("Plan path is managed by the wrapper");
    args.push(`-out=${planPath}`, "-input=false");
  }
  if (command === "apply") {
    if (extra.length) throw new Error("Apply takes no additional options; it applies only the saved review plan");
    if (!existsSync(planPath) || !existsSync(manifestPath)) throw new Error("Create and review a plan first");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (!isApplicablePlan(manifest, contextHash, hashPlan())) {
      throw new Error("Saved plan is failed, changed, expired or belongs to different inputs; plan again");
    }
    args.push(planPath);
  }
  const result = spawnSync(binary, args, { env, stdio: "inherit" });
  if (result.error) throw new Error("OpenTofu could not start");
  if (command === "plan" && [0, 2].includes(result.status) && existsSync(planPath)) {
    writeFileSync(manifestPath, JSON.stringify({ status: "ready", contextHash, planHash: hashPlan(), createdAt: new Date().toISOString() }), { mode: 0o600 });
  }
  if (command === "apply") {
    writeFileSync(manifestPath, JSON.stringify({ status: "consumed" }), { mode: 0o600 });
  }
  process.exitCode = result.status ?? 1;
} catch (error) {
  // No child-process output or credentials are incorporated in these operator errors.
  console.error(error instanceof Error ? error.message : "Infrastructure command failed");
  process.exitCode = 1;
}
