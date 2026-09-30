// CI-only entrypoint. No local .env, seed output, state or encryption key is required.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, appendFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deploymentInputs, digest, planContext, assertApplyExecution } from "./context.mjs";
import { isApplicablePlan } from "../plan-guard.mjs";
import { runProcess, writeProtectedArtifact } from "./process.mjs";
import { recoverPlatform } from "./recovery.mjs";
const infra = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [command, ...extra] = process.argv.slice(2);
if (!["plan", "apply", "recover"].includes(command) || extra.length) throw new Error("Usage: node infra/ci/run.mjs plan|apply|recover");
const inputs = deploymentInputs(process.env);
const safety = JSON.parse(readFileSync(resolve(infra,"ci/backend-safety.json"),"utf8"));
if(command !== "plan") assertApplyExecution(safety, process.env);
const startedAt = Date.now();
const binary = process.env.LZC_TOFU_BIN ?? "tofu";
const temporary = resolve(process.env.RUNNER_TEMP ?? infra, `lzc-ci-${inputs.run}-${command}`);
const artifact = resolve(infra,"../.local/ci-plan");
process.umask(0o077);
mkdirSync(temporary,{recursive:true,mode:0o700});
mkdirSync(artifact,{recursive:true,mode:0o700});
const recoveryArtifact = resolve(infra,"../.local/ci-recovery");
mkdirSync(recoveryArtifact,{recursive:true,mode:0o700});
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(AWS_|TF_|STACKIT_|LZC_)/.test(k)));
const secret = (name) => { if(!process.env[name])throw new Error(`Missing ${name}`); return process.env[name]; };
const credentialsPath=resolve(temporary,"service-account.json");
const encryption = (root) => {
  const passphrase=secret(`LZC_STATE_KEY_${root.toUpperCase()}`).trim();
  if(passphrase.length<32)throw new Error("Invalid encryption key");
  return JSON.stringify({key_provider:{pbkdf2:{state:{passphrase}}}});
};
const environment = (root) => ({...cleanEnv, TF_DATA_DIR:resolve(temporary,root), TF_INPUT:"0", TF_ENCRYPTION:encryption(root),
  AWS_ACCESS_KEY_ID:secret("LZC_MANAGEMENT_ACCESS_KEY"), AWS_SECRET_ACCESS_KEY:secret("LZC_MANAGEMENT_SECRET_KEY"),
  STACKIT_SERVICE_ACCOUNT_KEY_PATH:credentialsPath, TF_VAR_project_id:inputs.project, TF_VAR_region:inputs.region,
  TF_VAR_name_prefix:inputs.prefix, TF_VAR_state_credential_expiration:inputs.expiration });
async function tofu(root,args,env, snapshot = false) {
  const remaining = Math.max(1, (inputs.root === "platform" ? 80 : 25)*60_000 - (Date.now()-startedAt));
  const timeoutMs = snapshot ? 60_000 : Math.min(remaining, args[0] === "apply" && root === "platform" ? 70*60_000 : 10*60_000);
  const result = await runProcess(binary,[`-chdir=${resolve(infra,root)}`,...args],{env, timeoutMs, graceMs: snapshot ? 30_000 : 10*60_000});
  if (args[0] === "apply" || result.code !== 0 || result.interrupted) {
    writeProtectedArtifact(resolve(recoveryArtifact,`${root}-${args[0]}-${Date.now()}.enc.json`),JSON.stringify(result),secret(`LZC_STATE_KEY_${root.toUpperCase()}`).trim());
  }
  if(result.code !== 0 || result.interrupted || result.overflow) throw new Error(`OpenTofu ${root}/${args[0]} failed or was interrupted; inspect encrypted diagnostics`);
  return result.stdout;
}
async function preserveState(env) {
  const key = secret(`LZC_STATE_KEY_${inputs.root.toUpperCase()}`).trim();
  const emergency = resolve(infra,inputs.root,"errored.tfstate");
  if(existsSync(emergency)) writeProtectedArtifact(resolve(recoveryArtifact,"emergency-state.enc.json"),readFileSync(emergency),key);
  try {
    const state = await tofu(inputs.root,["state","pull"],env,true);
    writeProtectedArtifact(resolve(recoveryArtifact,"remote-state.enc.json"),state,key);
    console.log("Protected remote-state snapshot saved.");
  } catch { console.log("Remote-state snapshot unavailable; inspect protected diagnostics and emergency artifact."); }
}
async function initialize(root, storage) {
  const env=environment(root);
  if(storage) { env.AWS_ACCESS_KEY_ID=storage.credentials.access_key; env.AWS_SECRET_ACCESS_KEY=storage.credentials.secret_key; }
  const backend={bucket:storage?.bucket ?? inputs.bucket,key:`configurator/${inputs.prefix}/${root}/terraform.tfstate`,region:inputs.region,
    endpoints:{s3:`https://object.storage.${inputs.region}.onstackit.cloud`},use_path_style:true,use_lockfile:true,
    skip_credentials_validation:true,skip_region_validation:true,skip_requesting_account_id:true,skip_metadata_api_check:true,skip_s3_checksum:true};
  const file=resolve(temporary,`${root}.backend.hcl`);
  writeFileSync(file,Object.entries(backend).map(([k,v])=>`${k} = ${JSON.stringify(v)}`).join("\n"));
  await tofu(root,["init",`-backend-config=${file}`,"-lockfile=readonly","-input=false","-no-color"],env);
  return env;
}
function sourceDigest() {
  const pieces=[];
  for(const root of ["bootstrap","backend","platform"]) {
    for(const file of readdirSync(resolve(infra,root)).filter(f=>f.endsWith(".tf")||f===".terraform.lock.hcl").sort()) {
      pieces.push(`${root}/${file}:${digest(readFileSync(resolve(infra,root,file)))}`);
    }
  }
  if(inputs.root === "platform") pieces.push(digest(readFileSync(resolve(infra,"environments/lzc-dev.tfvars.json"))));
  return digest(pieces.join("\n"));
}
try {
  const version=JSON.parse(execFileSync(binary,["version","-json"],{encoding:"utf8"}));
  if(version.terraform_version!=="1.12.6")throw new Error("OpenTofu 1.12.6 required");
  const credentialJson=secret("LZC_SERVICE_ACCOUNT_KEY");
  try { JSON.parse(credentialJson); } catch { throw new Error("Invalid service-account JSON"); }
  writeFileSync(credentialsPath,credentialJson,{mode:0o600});
  let storage;
  if(inputs.root === "platform") {
    const bootstrapEnv=await initialize("bootstrap");
    const outputs=JSON.parse(await tofu("bootstrap",["output","-json"],bootstrapEnv));
    const protection=JSON.parse(await tofu("backend",["output","-json"],await initialize("backend")));
    if(outputs.backend?.value?.region !== inputs.region || protection.versioning_enabled?.value !== true || protection.state_bucket_name?.value !== outputs.backend.value.bucket) throw new Error("Versioned platform backend is not ready");
    storage={bucket:outputs.backend.value.bucket,credentials:outputs.backend_credentials.value};
  }
  const env=await initialize(inputs.root,storage);
  if(inputs.root==="backend") {
    const bootstrapEnv=await initialize("bootstrap");
    const outputs=JSON.parse(await tofu("bootstrap",["output","-json"],bootstrapEnv));
    if(outputs.backend?.value?.region!==inputs.region)throw new Error("Bootstrap region mismatch");
    env.TF_VAR_state_bucket_name=outputs.backend.value.bucket;
    env.TF_VAR_storage_access_key=outputs.backend_credentials.value.access_key;
    env.TF_VAR_storage_secret_key=outputs.backend_credentials.value.secret_key;
  }
  const contextHash=planContext(inputs,sourceDigest());
  const plan=resolve(artifact,"review.tfplan");
  const manifest=resolve(artifact,"review.json");
  if(command==="recover") {
    try { await recoverPlatform({manifest:JSON.parse(readFileSync(resolve(infra,"ci/recovery/lzc-dev-20260930.json"),"utf8")), inputs, credentialsPath, tofu, env}); }
    finally { await preserveState(env); }
  } else if(command==="plan") {
    writeFileSync(manifest,JSON.stringify({status:"planning"}));
    const parameters=inputs.root === "platform" ? [`-var-file=${resolve(infra,"environments/lzc-dev.tfvars.json")}`] : [];
    if(inputs.root === "platform" && process.env.LZC_RECOVERY_COMMIT === inputs.commit) parameters.push("-replace=stackit_scf_organization_manager.configurator","-replace=stackit_secretsmanager_user.provisioner");
    await tofu(inputs.root,["plan",...parameters,`-out=${plan}`,"-input=false","-lock-timeout=60s","-no-color"],env);
    const envelope=JSON.parse(readFileSync(plan,"utf8"));
    if(!envelope.encrypted_data||!envelope.encryption_version)throw new Error("Refusing an unencrypted plan artifact");
    const details=JSON.parse(await tofu(inputs.root,["show","-json",plan],env));
    const summary=(details.resource_changes??[]).map(r=>({address:r.address,actions:r.change.actions}));
    const review={status:"ready",contextHash,planHash:digest(readFileSync(plan)),createdAt:new Date().toISOString(),...inputs};
    writeFileSync(manifest,JSON.stringify(review,null,2));
    const text=`## ${inputs.environment}: ${inputs.root}\nCommit: ${inputs.commit}\n\n${summary.map(r=>`- ${r.address}: ${r.actions.join(", ")}`).join("\n")}\n\nPlan SHA-256: ${review.planHash}\n`;
    writeFileSync(resolve(artifact,"summary.md"),text);
    if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,text);
    console.log(text);
  } else {
    const review=JSON.parse(readFileSync(manifest,"utf8"));
    if(!isApplicablePlan(review,contextHash,digest(readFileSync(plan))))throw new Error("Plan mismatch or expiry; start a fresh workflow run");
    // Saved plan applies exactly the reviewed actions. No fresh plan is generated here.
    writeFileSync(manifest,JSON.stringify({...review,status:"consumed"}));
    try { await tofu(inputs.root,["apply","-lock-timeout=60s","-no-color",plan],env); }
    finally { await preserveState(env); }
    console.log(`Applied reviewed ${inputs.root} plan successfully.`);
  }
} finally {
  rmSync(temporary,{recursive:true,force:true});
}
