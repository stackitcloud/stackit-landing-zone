import { execFileSync, spawn } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";
const infra = dirname(fileURLToPath(import.meta.url));
const local = resolve(infra, "../.local");
const binary = process.env.LZC_TOFU_BIN ?? "tofu";
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(AWS_|TF_|STACKIT_|LZC_STATE_KEY_)/.test(k)));
const encryption = (passphrase) => JSON.stringify({key_provider:{pbkdf2:{state:{passphrase}}}});
function invoke(args, env) {
  try { return execFileSync(binary, args, { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch { throw new Error(`Lock test failed during ${args[1]}`); }
}
const seed = JSON.parse(invoke([`-chdir=${resolve(infra, "seed")}`, "output", "-json"], {
  ...cleanEnv, TF_DATA_DIR: resolve(local, "seed/data"),
  TF_ENCRYPTION: encryption(readFileSync(resolve(local, "seed/state.passphrase"), "utf8").trim()),
}));
const { bucket, endpoint, region } = seed.backend.value;
const directory = resolve(local, "lock-check", randomUUID());
mkdirSync(directory, {recursive:true, mode:0o700});
const prefix = `checks/locking/${randomUUID()}/`;
const backend = { bucket, key: `${prefix}terraform.tfstate`, region, endpoints:{s3:endpoint},
  use_path_style:true, use_lockfile:true, skip_credentials_validation:true, skip_region_validation:true,
  skip_requesting_account_id:true, skip_metadata_api_check:true, skip_s3_checksum:true };
writeFileSync(resolve(directory, "main.tf.json"), JSON.stringify({
  terraform:{required_version:"= 1.12.6", backend:{s3:backend}},
  resource:{terraform_data:{probe:{input:"lock-test",provisioner:[{"local-exec":{command:"node hold.mjs"}}]}}}}));
writeFileSync(resolve(directory,"encryption.tf"), `terraform {
  encryption {
    key_provider "pbkdf2" "state" {}
    method "aes_gcm" "state" { keys = key_provider.pbkdf2.state }
    state {
      method = method.aes_gcm.state
      enforced = true
    }
    plan {
      method = method.aes_gcm.state
      enforced = true
    }
  }
}
`);
writeFileSync(resolve(directory,"hold.mjs"), `import {writeFileSync,existsSync} from 'node:fs';\nwriteFileSync('holding','yes');\nconst start=Date.now();\nconst timer=setInterval(()=>{if(existsSync('release')||Date.now()-start>120000)clearInterval(timer)},100);\n`);
const env = {...cleanEnv, AWS_ACCESS_KEY_ID:seed.backend_credentials.value.access_key,
  AWS_SECRET_ACCESS_KEY:seed.backend_credentials.value.secret_key, AWS_DEFAULT_REGION:region,
  AWS_PAGER:"", TF_INPUT:"0", TF_ENCRYPTION:encryption(randomBytes(48).toString("base64url"))};
const firstEnv = {...env,TF_DATA_DIR:resolve(directory,"first")};
const secondEnv = {...env,TF_DATA_DIR:resolve(directory,"second")};
let done;
try {
  for(const runEnv of [firstEnv,secondEnv]) invoke([`-chdir=${directory}`,"init","-input=false","-no-color"],runEnv);
  const first=spawn(binary,[`-chdir=${directory}`,"apply","-auto-approve","-no-color"],{env:firstEnv,stdio:"ignore"});
  done=new Promise((res)=>{first.on("error",()=>res(-1));first.on("exit",res)});
  const deadline=Date.now()+30000;
  while(!existsSync(resolve(directory,"holding"))) {
    if(Date.now()>deadline || first.exitCode!==null)throw new Error("First writer did not acquire state lock");
    await setTimeout(100);
  }
  const listing=JSON.parse(execFileSync("aws",["s3api","list-objects-v2","--bucket",bucket,"--endpoint-url",endpoint,"--prefix",prefix,"--output","json"],{env,encoding:"utf8",stdio:["ignore","pipe","pipe"]}));
  console.log("Objects while first writer is holding:", (listing.Contents??[]).map(x=>x.Key.slice(prefix.length)));
  const conditionalFile=resolve(directory,"conditional-test");
  writeFileSync(conditionalFile,"first");
  const awsPut=["s3api","put-object","--bucket",bucket,"--endpoint-url",endpoint,"--key",`${prefix}conditional-test`,"--body",conditionalFile,"--if-none-match","*","--output","json"];
  execFileSync("aws",awsPut,{env,stdio:["ignore","pipe","pipe"]});
  let conditionalRejected=false;
  try { execFileSync("aws",awsPut,{env,stdio:["ignore","pipe","pipe"]}); }
  catch(error) {conditionalRejected=/PreconditionFailed|412/.test(String(error.stderr));}
  console.log("Conditional S3 overwrite rejected:",conditionalRejected);
  let rejected=false;
  try {execFileSync(binary,[`-chdir=${directory}`,"plan",`-out=${resolve(directory,"contender.tfplan")}`,"-lock-timeout=0s","-no-color"],{env:secondEnv,stdio:["ignore","pipe","pipe"],timeout:30000});}
  catch(error){rejected=/Error acquiring the state lock/.test(String(error.stderr)+String(error.stdout));}
  writeFileSync(resolve(local,"lock-verification.json"),JSON.stringify({checkedAt:new Date().toISOString(),bucket,region,conditionalRejected,competingProcessRejected:rejected},null,2),{mode:0o600});
  if(!rejected || !conditionalRejected)throw new Error("Second writer was not rejected specifically by the state lock");
  console.log("PASS: competing OpenTofu process rejected while first writer holds S3 lock");
  writeFileSync(resolve(directory,"release"),"yes");
  if(await done!==0)throw new Error("First writer failed");
  invoke([`-chdir=${directory}`,"plan","-lock-timeout=0s","-no-color"],secondEnv);
  console.log("PASS: another process can read encrypted state and acquire lock after release");
} finally {
  writeFileSync(resolve(directory,"release"),"yes");
  if(done)await done;
  const aws=(args)=>JSON.parse(execFileSync("aws",["s3api",...args,"--bucket",bucket,"--endpoint-url",endpoint,"--output","json"],{env,encoding:"utf8",stdio:["ignore","pipe","pipe"]})||"{}");
  const result=aws(["list-object-versions","--prefix",prefix]);
  for(const item of [...(result.Versions??[]),...(result.DeleteMarkers??[])]) {
    if(!item.Key.startsWith(prefix))throw new Error("Unexpected object outside test prefix");
    aws(["delete-object","--key",item.Key,"--version-id",item.VersionId]);
  }
  rmSync(directory,{recursive:true,force:true});
}
