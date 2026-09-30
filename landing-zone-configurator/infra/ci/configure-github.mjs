// Operator entrypoint: idempotent environment configuration and encrypted secret upload via gh.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
const here=dirname(fileURLToPath(import.meta.url));
const infra=resolve(here,"..");
const local=resolve(infra,"../.local");
const repoPath=resolve(infra,"../..");
const release = process.argv[2] === "--release";
const runtime = process.argv[2] === "--runtime";
const platform = process.argv[2] === "--platform" || runtime;
if(process.argv.length > 3 || (process.argv.length > 2 && !platform && !release)) throw new Error("Only --platform, --runtime or --release is supported");
const spec=JSON.parse(readFileSync(resolve(here,release ? "github-release-environments.json" : runtime ? "github-runtime-environments.json" : platform ? "github-platform-environments.json" : "github-environments.json"),"utf8"));
if(spec.repository!=="stackitcloud/stackit-landing-zone")throw new Error("Unexpected secret destination");
function gh(args,input) {
  try {return execFileSync("gh",args,{input,encoding:"utf8",stdio:["pipe","pipe","pipe"]});}
  catch {throw new Error(`GitHub operation failed (${args[0]} ${args[1]}); no secret output retained`);}
}
const api=(path,method="GET",body)=>JSON.parse(gh(["api",path,"--method",method,...(body?["--input","-"]:[])],body?JSON.stringify(body):undefined)||"{}");
const repository=api(`repos/${spec.repository}`);
if(!repository.permissions?.admin)throw new Error("Repository administration permission required");
const reviewer=api(`users/${spec.reviewer}`);
const config=parseEnv(readFileSync(resolve(repoPath,"landing-zone-configurator.env"),"utf8"));
const env={...process.env,TF_DATA_DIR:resolve(local,"seed/data"),TF_ENCRYPTION:JSON.stringify({key_provider:{pbkdf2:{state:{passphrase:readFileSync(resolve(local,"seed/state.passphrase"),"utf8").trim()}}}})};
let outputs;
try {outputs=JSON.parse(execFileSync(process.env.LZC_TOFU_BIN??"tofu",[`-chdir=${resolve(infra,"seed")}`,"output","-json"],{env,encoding:"utf8",stdio:["ignore","pipe","pipe"]}));}
catch {throw new Error("Cannot read encrypted seed outputs");}
const sharedSecrets={
  LZC_MANAGEMENT_ACCESS_KEY:outputs.backend_credentials.value.access_key,
  LZC_MANAGEMENT_SECRET_KEY:outputs.backend_credentials.value.secret_key,
};
const deploySecrets={...sharedSecrets,
  LZC_SERVICE_ACCOUNT_KEY:readFileSync(resolve(repoPath,"landing-zone-configurator-credentials.json"),"utf8"),
  LZC_STATE_KEY_BOOTSTRAP:readFileSync(resolve(local,"bootstrap/state.passphrase"),"utf8").trim(),
  LZC_STATE_KEY_BACKEND:readFileSync(resolve(local,"backend/state.passphrase"),"utf8").trim(),
};
if(platform) deploySecrets.LZC_STATE_KEY_PLATFORM=readFileSync(resolve(local,"platform/state.passphrase"),"utf8").trim();
if(runtime) deploySecrets.LZC_STATE_KEY_RUNTIME=readFileSync(resolve(local,"runtime/state.passphrase"),"utf8").trim();
const recoverySecrets={...sharedSecrets,
  LZC_STATE_KEY_SEED:readFileSync(resolve(local,"seed/state.passphrase"),"utf8").trim(),
  LZC_STATE_KEY_SEED_PROTECTION:readFileSync(resolve(local,"seed-protection/state.passphrase"),"utf8").trim(),
};
let releaseSecrets, workloadBucket;
if (release) {
  const bootstrapEnv={...env,TF_DATA_DIR:resolve(local,"bootstrap/data"),TF_ENCRYPTION:JSON.stringify({key_provider:{pbkdf2:{state:{passphrase:deploySecrets.LZC_STATE_KEY_BOOTSTRAP}}}}),AWS_ACCESS_KEY_ID:sharedSecrets.LZC_MANAGEMENT_ACCESS_KEY,AWS_SECRET_ACCESS_KEY:sharedSecrets.LZC_MANAGEMENT_SECRET_KEY};
  let bootstrap;
  try { bootstrap=JSON.parse(execFileSync(process.env.LZC_TOFU_BIN??"tofu",[`-chdir=${resolve(infra,"bootstrap")}`,"output","-json"],{env:bootstrapEnv,encoding:"utf8",stdio:["ignore","pipe","pipe"]})); }
  catch { throw new Error("Cannot read encrypted workload backend outputs"); }
  workloadBucket=bootstrap.backend.value.bucket;
  releaseSecrets={LZC_WORKLOAD_ACCESS_KEY:bootstrap.backend_credentials.value.access_key,LZC_WORKLOAD_SECRET_KEY:bootstrap.backend_credentials.value.secret_key,
    LZC_STATE_KEY_PLATFORM:readFileSync(resolve(local,"platform/state.passphrase"),"utf8").trim(),
    LZC_STATE_KEY_RUNTIME:readFileSync(resolve(local,"runtime/state.passphrase"),"utf8").trim()};
}
const variables={LZC_PROJECT_ID:config.PROJECT_ID,LZC_REGION:config.REGION,LZC_NAME_PREFIX:config.NAME_PREFIX,
  LZC_MANAGEMENT_BUCKET:outputs.backend.value.bucket,LZC_CREDENTIAL_EXPIRATION:config.STATE_CREDENTIAL_EXPIRATION};
if(release) variables.LZC_WORKLOAD_BUCKET=workloadBucket;
if(Object.values(variables).some(v=>!v))throw new Error("Missing environment configuration");
for(const target of spec.environments) {
  const path=`repos/${spec.repository}/environments/${target.name}`;
  api(path,"PUT",{wait_timer:0,prevent_self_review:false,can_admins_bypass:false,
    reviewers:target.review?[{type:"User",id:reviewer.id}]:[],
    deployment_branch_policy:{protected_branches:false,custom_branch_policies:true}});
  const branches=target.branches ?? [spec.branch];
  const policies=api(`${path}/deployment-branch-policies`).branch_policies;
  if(policies.some(p=>!branches.includes(p.name)||p.type!=="branch"))throw new Error("Unexpected existing deployment policy; inspect before uploading secrets");
  for(const branch of branches) {
    if(!policies.some(p=>p.name===branch&&p.type==="branch"))api(`${path}/deployment-branch-policies`,"POST",{name:branch,type:"branch"});
  }
  const checked=api(path);
  if(checked.deployment_branch_policy?.custom_branch_policies!==true)throw new Error("Environment branch protection missing");
  if(target.review&&!checked.protection_rules.some(r=>r.type==="required_reviewers"&&r.reviewers.some(x=>x.reviewer.id===reviewer.id)))throw new Error("Required reviewer missing");
  for(const [name,value] of Object.entries(variables))gh(["variable","set",name,"--repo",spec.repository,"--env",target.name],value);
  for(const [name,value] of Object.entries(release?releaseSecrets:target.name.endsWith("recovery")?recoverySecrets:deploySecrets)) {
    gh(["secret","set",name,"--repo",spec.repository,"--env",target.name],value);
  }
  console.log(`Configured ${target.name}: branches=${branches.join(",")}, review=${target.review}; secret values not displayed.`);
}

if(platform) gh(["variable","set",runtime ? "LZC_RUNTIME_CI_ENABLED" : "LZC_PLATFORM_CI_ENABLED","--repo",spec.repository],"true");

if(release) gh(["variable","set","LZC_RELEASE_CI_ENABLED","--repo",spec.repository],"true");
