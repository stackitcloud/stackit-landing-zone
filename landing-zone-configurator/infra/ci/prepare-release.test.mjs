import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, statSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const script=fileURLToPath(new URL("./prepare-release.mjs",import.meta.url));
test("release uses private inputs, rejects wrong destinations and omits privileged credentials",()=>{
 const dir=mkdtempSync(join(tmpdir(),"lzc-release-test-"));
 const env={...process.env,GITHUB_REPOSITORY:"stackitcloud/stackit-landing-zone",GITHUB_REF:"refs/heads/feature/landing-zone-configurator",RUNNER_TEMP:dir,GITHUB_ENV:join(dir,"environment"),LZC_WORKLOAD_BUCKET:"lzc-dev-state-7dbff805",LZC_STATE_KEY_PLATFORM:"p".repeat(40),LZC_STATE_KEY_RUNTIME:"r".repeat(40),LZC_WORKLOAD_ACCESS_KEY:"test-access",LZC_WORKLOAD_SECRET_KEY:"test-secret"};
 const run=mode=>spawnSync(process.execPath,[script,mode],{env,encoding:"utf8"});
 try {
  assert.equal(run("backend").status,0);
  const privateDir=join(dir,"lzc-release");
  const cf={api_url:"https://api.system.01.cf.eu01.stackit.cloud",org_id:"a4514c42-d378-4e36-90eb-a3a1e3017e65",username:"cf-user",password:"cf-secret"};
  writeFileSync(join(privateDir,"platform-outputs.json"),JSON.stringify({cf_runtime:{value:cf}}));
  const keys=["LZC_DATABASE_HOST","LZC_DATABASE_PORT","LZC_DATABASE_NAME","LZC_DATABASE_USER","LZC_DATABASE_PASSWORD","LZC_SECRETS_ADDRESS","LZC_SECRETS_INSTANCE_ID","LZC_SECRETS_USERNAME","LZC_SECRETS_PASSWORD","LZC_MODEL_SERVING_TOKEN"];
  const runtime={space:{value:{id:"space-guid",name:"wrong-space"}},app_environment:{value:Object.fromEntries(keys.map(key=>[key,`test-${key}`]))}};
  runtime.app_environment.value.LZC_SERVICE_ACCOUNT_KEY="must-not-be-forwarded";
  writeFileSync(join(privateDir,"runtime-outputs.json"),JSON.stringify(runtime));
  assert.notEqual(run("application").status,0);
  assert.equal(existsSync(join(privateDir,"app-vars.json")),false);
  runtime.space.value.name="configurator";
  writeFileSync(join(privateDir,"runtime-outputs.json"),JSON.stringify(runtime));
  const result=run("application");assert.equal(result.status,0,result.stderr);
  const vars=join(privateDir,"app-vars.json");assert.equal(statSync(vars).mode&0o777,0o600);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(vars))),keys);
  assert.ok(!readFileSync(env.GITHUB_ENV,"utf8").includes("must-not-be-forwarded"));
 } finally {rmSync(dir,{recursive:true,force:true});}
});
