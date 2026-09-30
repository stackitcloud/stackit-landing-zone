// Writes a private shell environment only. Run tofu explicitly after sourcing it.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { stateKey } from "./state-key.mjs";
const infra = dirname(fileURLToPath(import.meta.url)), base = resolve(infra,".."), repository = resolve(base,"..");
const [root, flag, ...extra] = process.argv.slice(2), validation = flag === "--validation";
if (!["seed","seed-protection","bootstrap","backend","platform"].includes(root) || (flag && !validation) || extra.length) throw new Error("Usage: prepare-local.mjs ROOT [--validation]");
if (!validation && !["seed","seed-protection"].includes(root)) throw new Error("Remote deployment preparation belongs to the serialized GitHub workflow; use --validation locally");
if (process.env.CI || process.env.GITHUB_ACTIONS) throw new Error("Use infra/ci/prepare.mjs in CI");
process.umask(0o077);
const location = validation ? resolve(base,".local/validation",root) : resolve(base,".local",root);
mkdirSync(location,{recursive:true,mode:0o700});
const passphrase = stateKey(location, { validation });
const env = { TF_INPUT:"0", TF_DATA_DIR:resolve(location,"data"), TF_ENCRYPTION:JSON.stringify({key_provider:{pbkdf2:{state:{passphrase}}}}) };
if (!validation) {
  const config = parseEnv(readFileSync(resolve(repository,"landing-zone-configurator.env"),"utf8"));
  if (!config.PROJECT_ID || !config.REGION || !config.NAME_PREFIX) throw new Error("Project, region and prefix are required");
  env.TF_VAR_region=config.REGION;
  if (root === "seed") {
    if (!config.STATE_CREDENTIAL_EXPIRATION) throw new Error("Explicit credential expiration required");
    const credentials=resolve(repository,"landing-zone-configurator-credentials.json");
    if (!existsSync(credentials)) throw new Error("Service-account file missing");
    Object.assign(env,{STACKIT_SERVICE_ACCOUNT_KEY_PATH:credentials,TF_VAR_project_id:config.PROJECT_ID,TF_VAR_name_prefix:config.NAME_PREFIX,TF_VAR_state_credential_expiration:config.STATE_CREDENTIAL_EXPIRATION});
  } else {
    let output;
    try { output=JSON.parse(readFileSync(resolve(base,".local/seed/outputs.json"),"utf8")); }
    catch { throw new Error("Capture seed outputs privately with tofu output -json first; see infra/README.md"); }
    if(output.backend?.value?.region!==config.REGION || output.backend?.value?.bucket!==`${config.NAME_PREFIX}-management-${config.PROJECT_ID.slice(0,8)}`) throw new Error("Seed backend does not match project");
    const credentials=output.backend_credentials?.value;
    if(!credentials?.access_key || !credentials?.secret_key) throw new Error("Seed credentials missing");
    Object.assign(env,{AWS_ACCESS_KEY_ID:credentials.access_key,AWS_SECRET_ACCESS_KEY:credentials.secret_key,TF_VAR_state_bucket_name:output.backend.value.bucket});
  }
  writeFileSync(resolve(location,"backend.hcl"),`path = ${JSON.stringify(resolve(location,"terraform.tfstate"))}\n`,{mode:0o600});
}
const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
const inherited=Object.keys(process.env).filter(k=>/^(AWS_|STACKIT_|TF_VAR_|TF_CLI_ARGS|TF_LOG)/.test(k)&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(k));
const script=(inherited.length?`unset ${inherited.join(" ")}\n`:"")+Object.entries(env).map(([k,v])=>`export ${k}=${quote(v)}`).join("\n")+"\n";
writeFileSync(resolve(location,"environment.sh"),script,{mode:0o600});
console.log(`Prepared ${validation?"disposable validation":"local seed"} environment at ${location}/environment.sh. No OpenTofu command executed.`);
