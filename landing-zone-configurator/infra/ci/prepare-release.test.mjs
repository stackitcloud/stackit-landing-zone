import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, statSync, rmSync, existsSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { approvedReleaseSource, createReleaseManifest, verifyReleaseManifest } from "./release-artifact.mjs";
const script=fileURLToPath(new URL("./prepare-release.mjs",import.meta.url));
test("migration task can unpack the full release and web routes match the registered callback origin",()=>{
 const web=readFileSync(new URL("../../deploy/cloud-foundry/manifest.yml",import.meta.url),"utf8");
 const migration=readFileSync(new URL("../../deploy/cloud-foundry/migration-manifest.yml",import.meta.url),"utf8");
 const workflow=readFileSync(new URL("../../../.github/workflows/configurator-release.yml",import.meta.url),"utf8");
 assert.match(web,/\n    disk_quota: 6144M\n/);
 assert.match(migration,/\n    disk_quota: 4096M\n/);
 assert.match(workflow,/cf run-task landing-zone-configurator-migrate [^\n]+ -m 128M -k 4096M --wait/);
 const applicationTasks=workflow.split("\n").filter(line=>line.trim().startsWith("cf run-task landing-zone-configurator ")||line.trim().startsWith("run: cf run-task landing-zone-configurator "));
 assert.equal(applicationTasks.length,3);
 for(const task of applicationTasks)assert.match(task,/ -m 128M -k 4096M --wait$/);
 assert.match(web,/\n    routes:\n      - route: lzc-dev-configurator\.apps\.01\.cf\.eu01\.stackit\.cloud\n    env:/);
 assert.ok(!web.includes("lzc-dev-configurator-7dbff805"));
 assert.ok(workflow.indexOf("Retire previous suffixed route after canonical checks")>workflow.indexOf("Public route checks"));
 assert.match(workflow,/cf unmap-route landing-zone-configurator apps\.01\.cf\.eu01\.stackit\.cloud --hostname lzc-dev-configurator-7dbff805/);
});
test("release configuration guards run after the API build, not in infrastructure-only jobs",()=>{
 const workflow=readFileSync(new URL("../../../.github/workflows/validate-configurator.yml",import.meta.url),"utf8");
 const application=workflow.split("\n  application:\n")[1]?.split("\n  infrastructure:\n")[0];
 const infrastructure=workflow.split("\n  infrastructure:\n")[1];
 assert.ok(application,"Application validation job is required");
 assert.ok(infrastructure,"Infrastructure validation job is required");
 assert.match(application,/run: npm run check[\s\S]+run: node --test \.\.\/infra\/ci\/prepare-release\.test\.mjs/);
 assert.doesNotMatch(infrastructure,/prepare-release\.test\.mjs/);
});
test("validation and release both execute native template and stateful platform regressions",()=>{
 const scripts=JSON.parse(readFileSync(new URL("../../app/package.json",import.meta.url),"utf8")).scripts;
 assert.match(scripts["test:platform-database"],/^LZC_PLAN_DATABASE_TEST=true vitest run tests\/platform-plan\.test\.ts --no-file-parallelism --testTimeout=30000$/);
 assert.match(scripts["test:common-contract"],/^node scripts\/prepare-common-contract\.ts && /);
 assert.match(scripts["test:common-contract"],/init -backend=false/);
 assert.match(scripts["test:common-contract"],/validate -no-color/);
 assert.match(scripts["test:common-contract"],/test -no-color$/);
 for(const file of ["validate-configurator.yml","configurator-release.yml"]){
  const workflow=readFileSync(new URL(`../../../.github/workflows/${file}`,import.meta.url),"utf8");
  assert.match(workflow,/run: npm run test:platform-database/);
  assert.match(workflow,/run: npm run test:database -- --maxWorkers=2 --testTimeout=30000/);
  assert.match(workflow,/^\s+npm run test:common-contract$|run: npm run test:common-contract/m);
 }
});
test("release builds require repeated live model qualification and retain multi-turn failures",()=>{
 const release=readFileSync(new URL("../../../.github/workflows/configurator-release.yml",import.meta.url),"utf8");
 const live=readFileSync(new URL("../../../.github/workflows/assistant-live.yml",import.meta.url),"utf8");
 assert.match(release,/uses: \.\/\.github\/workflows\/assistant-live\.yml/);
 assert.match(release,/topic: all\n\s+repetitions: 2/);
 assert.match(release,/\n  build:\n    needs: assistant\n/);
 assert.match(live,/workflow_call:/);
 assert.match(live,/name: assistant-live-qualification/);
 assert.match(live,/environment: assistant-tests/);
 assert.match(live,/group: configurator-assistant-model-serving\n\s+cancel-in-progress: false/);
 assert.match(live,/--repeat "\$LZC_ASSISTANT_TEST_REPETITIONS"/);
 assert.match(live,/scripts\/assistant-journey\.ts \| tee assistant-journey-results\.jsonl/);
 assert.match(live,/steps\.catalogue\.outcome == 'success'/);
 assert.match(live,/if: always\(\)/);
 assert.doesNotMatch(live,/continue-on-error:|retry/);
 assert.doesNotMatch(live,/^\s+LZC_MODEL_SERVING_(?:MODEL|INTENT_MODEL):/m);
 assert.equal((live.match(/LZC_EXECUTION_ENABLED: 'false'/g)||[]).length,2);
 assert.equal((live.match(/LZC_APPLICATION_EXECUTION_ENABLED: 'false'/g)||[]).length,2);
});
test("Configurator provisioning and deployment remain exclusively manual",()=>{
 for(const name of ["configurator-bootstrap.yml","configurator-platform.yml","configurator-runtime.yml","configurator-release.yml"]){
  const workflow=readFileSync(new URL(`../../../.github/workflows/${name}`,import.meta.url),"utf8");
  assert.match(workflow,/\n  workflow_dispatch:/);
  assert.doesNotMatch(workflow,/\n  (?:push|pull_request|schedule|workflow_run):/);
  assert.doesNotMatch(workflow,/github\.event_name == 'push'|LZC_(?:BOOTSTRAP|PLATFORM|RUNTIME)_APPLY_COMMIT/);
 }
});
test("Assistant CI access is separate from platform execution credentials",()=>{
 const spec=JSON.parse(readFileSync(new URL("./github-assistant-environments.json",import.meta.url),"utf8"));
 assert.equal(spec.repository,"stackitcloud/stackit-landing-zone");
 assert.deepEqual(spec.environments,[{name:"assistant-tests",review:false,branches:["main","feature/landing-zone-configurator"]}]);
 const operator=readFileSync(new URL("./configure-github.mjs",import.meta.url),"utf8");
 const assistant=operator.split("if(assistant) {")[1]?.split("const config=parseEnv")[0];
 assert.ok(assistant);
 assert.match(assistant,/const assistantSecrets=\{LZC_MODEL_SERVING_TOKEN:loadLocalModelServingToken\(\)\}/);
 assert.match(assistant,/configureTargets\(\{\},\(\)=>assistantSecrets\)/);
 assert.match(assistant,/process\.exit\(0\)/);
 assert.doesNotMatch(assistant,/LZC_SERVICE_ACCOUNT_KEY|LZC_STATE_KEY_|LZC_MANAGEMENT_/);
});
test("required Accelerator checks remain visible and fail closed on change detection errors",()=>{
 const workflow=readFileSync(new URL("../../../.github/workflows/validate.yml",import.meta.url),"utf8");
 assert.doesNotMatch(workflow.slice(0,workflow.indexOf("\npermissions:")),/\n\s+paths:/);
 for(const name of ["Format","Validate","Configuration Tests","TFLint"]){
  assert.match(workflow,new RegExp(`\\n    name: ${name}\\n    needs: changes\\n`));
 }
 assert.equal(workflow.match(/needs\.changes\.result != 'success'/g)?.length,4);
 assert.match(workflow,/git diff --quiet "\$BASE_SHA" "\$GITHUB_SHA" -- src/);
 assert.match(workflow,/Comparison base unavailable; running all Accelerator checks/);
});
test("actual workflow scope distinguishes docs, Configurator and native changes",()=>{
 const workflow=readFileSync(new URL("../../../.github/workflows/validate.yml",import.meta.url),"utf8");
 const block=workflow.match(/- name: Detect native infrastructure changes[\s\S]*?        run: \|\n([\s\S]*?)\n  format:/)?.[1];
 assert.ok(block);
 const command=block.replace(/^          /gm,"");
 const dir=mkdtempSync(join(tmpdir(),"lzc-change-scope-")),repo=join(dir,"repo"),output=join(dir,"output");
 mkdirSync(repo);
 const git=(args)=>{
  const result=spawnSync("git",args,{cwd:repo,encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);
  return result.stdout.trim();
 };
 const commit=(file,content)=>{
  mkdirSync(join(repo,file,".."),{recursive:true});
  writeFileSync(join(repo,file),content);
  git(["add","."]);git(["commit","-qm","Synthetic scope fixture"]);
  return git(["rev-parse","HEAD"]);
 };
 const run=(base,head,event="pull_request")=>{
  rmSync(output,{force:true});
  return spawnSync("bash",["-c",command],{cwd:repo,encoding:"utf8",env:{...process.env,BASE_SHA:base,GITHUB_SHA:head,GITHUB_EVENT_NAME:event,GITHUB_OUTPUT:output,RUNNER_TEMP:dir}});
 };
 try{
  git(["init","--quiet"]);git(["config","user.name","Scope Test"]);git(["config","user.email","scope@example.invalid"]);git(["config","commit.gpgsign","false"]);
  let head=commit("README.md","base");
  for(const [file,expected]of [
   ["README.md",false],["landing-zone-configurator/app/example.ts",false],
   ["src/example.tf",true],['src/quoted"name.tf',true],["src/newline\nname.tf",true],
   ["mise.toml",true],[".tflint.hcl",true],
   [".github/workflows/validate.yml",true],[".github/workflows/configurator-release.yml",false],
  ]){
   const base=head;head=commit(file,`synthetic ${file}`);
   const result=run(base,head);
   assert.equal(result.status,0,result.stderr);
   assert.equal(readFileSync(output,"utf8"),`accelerator=${expected}\n`,file);
  }
  for(const event of ["pull_request","workflow_dispatch"]){
   const result=run("",head,event);
   assert.equal(result.status,0,result.stderr);
   assert.equal(readFileSync(output,"utf8"),"accelerator=true\n");
  }
  const failed=run(head,"not-a-commit");
  assert.notEqual(failed.status,0);
  assert.equal(existsSync(output),false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test("migration diagnostics export only bounded evidence for the selected run",()=>{
 const parser=fileURLToPath(new URL("./migration-evidence.mjs",import.meta.url));
 const evidence={service:"database-migrations",runId:"123",ok:false,phase:"migrate",version:"053_assistant_conversations.sql",error:"42501",message:"synthetic-private-sql",password:"synthetic-private-password"};
 const run=input=>spawnSync(process.execPath,[parser,"123"],{input,encoding:"utf8"});
 const failure=run(`private router line\nLOG ${JSON.stringify({...evidence,runId:"456"})}\nLOG ${JSON.stringify(evidence)}\n`);
 assert.equal(failure.status,1);
 assert.deepEqual(JSON.parse(failure.stdout),{service:"database-migrations",runId:"123",ok:false,phase:"migrate",version:"053_assistant_conversations.sql",error:"42501"});
 assert.ok(!failure.stdout.includes("synthetic-private"));
 const timeout=run(`LOG ${JSON.stringify({...evidence,phase:"connect",version:undefined,error:"connection-timeout"})}\n`);
 assert.equal(timeout.status,1);
 assert.deepEqual(JSON.parse(timeout.stdout),{service:"database-migrations",runId:"123",ok:false,phase:"connect",error:"connection-timeout"});
 assert.ok(!timeout.stdout.includes("synthetic-private"));
 const success=run(`LOG ${JSON.stringify({service:"database-migrations",runId:"123",ok:true,privateValue:"synthetic-private"})}\n`);
 assert.equal(success.status,0);
 assert.deepEqual(JSON.parse(success.stdout),{service:"database-migrations",runId:"123",ok:true});
 const rejected=run(`LOG ${JSON.stringify({...evidence,error:"synthetic-private"})}\n`);
 assert.equal(rejected.status,1);
 assert.equal(rejected.stdout,"");
 assert.ok(!rejected.stderr.includes("synthetic-private"));
});
test("one release manifest binds both packages to the same immutable build",()=>{
 const directory=mkdtempSync(join(tmpdir(),"lzc-release-artifact-test-"));
 const source={revision:"a".repeat(40),runId:"12345"};
 try {
  writeFileSync(join(directory,"release.tar.gz"),"compiled application and migrations");
  writeFileSync(join(directory,"runner.tar.gz"),"isolated pinned runner");
  const manifest=createReleaseManifest(directory,source);
  assert.deepEqual(verifyReleaseManifest(directory,source),manifest);
  assert.throws(()=>createReleaseManifest(directory,source));
  assert.throws(()=>verifyReleaseManifest(directory,{...source,revision:"b".repeat(40)}));
  assert.throws(()=>verifyReleaseManifest(directory,{...source,runId:"54321"}));
  writeFileSync(join(directory,"runner.tar.gz"),"changed runner");
  assert.throws(()=>verifyReleaseManifest(directory,source),/checksum mismatch/);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
test("promotion requires the successful build's exact repository, source and immutable artifact",()=>{
 const run={id:12345,run_attempt:1,path:".github/workflows/configurator-release.yml",head_sha:"a".repeat(40),head_repository:{full_name:"stackitcloud/stackit-landing-zone"},head_branch:"feature/landing-zone-configurator",event:"workflow_dispatch"};
 const jobs=[{name:"build",status:"completed",conclusion:"success"},{name:"assistant / assistant-live-qualification",status:"completed",conclusion:"success"}];
 const artifact={id:67890,name:"configurator-release-12345",expired:false,workflow_run:{id:12345,head_sha:run.head_sha}};
 assert.deepEqual(approvedReleaseSource(run,jobs,[artifact],"12345"),{revision:run.head_sha,runId:"12345",artifactId:"67890"});
 for(const changed of [{...run,event:"pull_request"},{...run,head_repository:{full_name:"someone/fork"}},{...run,path:".github/workflows/other.yml"},{...run,head_branch:"unapproved"},{...run,run_attempt:2}])
  assert.throws(()=>approvedReleaseSource(changed,jobs,[artifact],"12345"));
 assert.throws(()=>approvedReleaseSource(run,[],[artifact],"12345"));
 assert.throws(()=>approvedReleaseSource(run,[jobs[0]],[artifact],"12345"));
 assert.throws(()=>approvedReleaseSource(run,[jobs[0],{...jobs[1],conclusion:"failure"}],[artifact],"12345"));
 assert.throws(()=>approvedReleaseSource(run,[{...jobs[0],conclusion:"failure"}],[artifact],"12345"));
 assert.throws(()=>approvedReleaseSource(run,jobs,[{...artifact,expired:true}],"12345"));
 assert.throws(()=>approvedReleaseSource(run,jobs,[{...artifact,workflow_run:{id:12345,head_sha:"b".repeat(40)}}],"12345"));
 assert.throws(()=>approvedReleaseSource(run,jobs,[artifact,artifact],"12345"));
});
test("release uses private inputs, rejects wrong destinations and omits privileged credentials",()=>{
 const apiDist=fileURLToPath(new URL("../../app/apps/api/dist",import.meta.url));
 assert.ok(existsSync(join(apiDist,"auth/stackit-device.js")),"Release configuration tests require the built API; run npm ci and npm run build in app first.");
 const dir=mkdtempSync(join(tmpdir(),"lzc-release-test-"));
 const env={...process.env,GITHUB_REPOSITORY:"stackitcloud/stackit-landing-zone",GITHUB_REF:"refs/heads/feature/landing-zone-configurator",LZC_RELEASE_REVISION:"a".repeat(40),RUNNER_TEMP:dir,GITHUB_ENV:join(dir,"environment"),LZC_WORKLOAD_BUCKET:"lzc-dev-state-7dbff805",LZC_STATE_KEY_PLATFORM:"p".repeat(40),LZC_STATE_KEY_RUNTIME:"r".repeat(40),LZC_WORKLOAD_ACCESS_KEY:"test-access",LZC_WORKLOAD_SECRET_KEY:"test-secret"};
 const artifactApi=join(dir,".local/release/apps/api");mkdirSync(artifactApi,{recursive:true});
 symlinkSync(apiDist,join(artifactApi,"dist"),"dir");
 const run=mode=>spawnSync(process.execPath,[script,mode],{env,cwd:dir,encoding:"utf8"});
 Object.assign(env,{LZC_AUTH_ENABLED:"false",LZC_ASSISTANT_ENABLED:"false",LZC_STACKIT_DEVICE_ENABLED:"false",LZC_STACKIT_CLI_CLIENT_APPROVED:"false",LZC_GITHUB_CLIENT_ID:"",LZC_GITHUB_CLIENT_SECRET:"",LZC_RUNNER_POOL_SIZE:"0"});
 try {
  assert.equal(run("backend").status,0);
  const privateDir=join(dir,"lzc-release");
  const cf={api_url:"https://api.system.01.cf.eu01.stackit.cloud",org_id:"a4514c42-d378-4e36-90eb-a3a1e3017e65",username:"cf-user",password:"cf-secret"};
  writeFileSync(join(privateDir,"platform-outputs.json"),JSON.stringify({cf_runtime:{value:cf},database_migration:{value:{host:"test-LZC_DATABASE_HOST",port:"test-LZC_DATABASE_PORT",database:"configurator",username:"configurator_migration",password:"migration-only-secret"}}}));
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
  const app=JSON.parse(readFileSync(vars));
    assert.deepEqual(Object.keys(app),[...keys,"LZC_AUTH_ENABLED","LZC_ASSISTANT_ENABLED","LZC_STACKIT_DEVICE_ENABLED","LZC_STACKIT_CLI_CLIENT_APPROVED","LZC_PUBLIC_ORIGIN","LZC_GITHUB_CLIENT_ID","LZC_GITHUB_CLIENT_SECRET","LZC_STACKIT_AUTH_FLOW","LZC_STACKIT_CLIENT_ID","LZC_STACKIT_REDIRECT_URI","LZC_EXECUTION_ENABLED","LZC_APPLICATION_EXECUTION_ENABLED","LZC_DEPLOYMENT_ARTIFACT_KEY","LZC_RUNNER_DROPLET_ID","LZC_RUNNER_POOL_SIZE","LZC_PLANS_ENABLED","LZC_RUNNER_CF_USERNAME","LZC_RUNNER_CF_PASSWORD","LZC_RUNNER_SPACE_ID","LZC_RUNNER_TEMPLATE_ID","LZC_IMAGE_BUILDPACK"]);
  assert.equal(app.LZC_RUNNER_POOL_SIZE,"0");
  env.LZC_RUNNER_POOL_SIZE="5";
  assert.notEqual(run("application").status,0);
  env.LZC_RUNNER_POOL_SIZE="1";
  assert.notEqual(run("application").status,0,"Warm capacity requires authorized execution");
  env.LZC_RUNNER_POOL_SIZE="0";
  assert.equal(app.LZC_IMAGE_BUILDPACK,`https://github.com/stackitcloud/stackit-landing-zone.git#lzc-image-buildpack-${env.LZC_RELEASE_REVISION}`);
  assert.deepEqual(JSON.parse(readFileSync(join(privateDir,"runner-vars.json"))),{LZC_IMAGE_BUILDPACK:app.LZC_IMAGE_BUILDPACK});
  assert.equal(app.LZC_AUTH_ENABLED,"false");
  assert.equal(app.LZC_ASSISTANT_ENABLED,"false");
  env.LZC_ASSISTANT_ENABLED="true";
  assert.notEqual(run("application").status,0,"Assistant requires authentication");
  env.LZC_ASSISTANT_ENABLED="false";
  assert.equal(app.LZC_PUBLIC_ORIGIN,"https://lzc-dev-configurator.apps.01.cf.eu01.stackit.cloud");
    assert.equal(app.LZC_STACKIT_DEVICE_ENABLED,"false");
    assert.equal(app.LZC_STACKIT_CLI_CLIENT_APPROVED,"false");
  assert.equal(app.LZC_GITHUB_CLIENT_SECRET,"");
  assert.ok(!readFileSync(vars,"utf8").includes("migration-only-secret"));
  const migration=join(privateDir,"migration-vars.json");
  assert.equal(statSync(migration).mode&0o777,0o600);
  const migrationValues=JSON.parse(readFileSync(migration));
  assert.equal(migrationValues.LZC_DATABASE_USER,"configurator_migration");
  assert.equal(migrationValues.LZC_DATABASE_PASSWORD,"migration-only-secret");
  assert.equal(Object.keys(migrationValues).length,5);
  env.LZC_AUTH_ENABLED="true";
  assert.notEqual(run("application").status,0);
  env.LZC_GITHUB_CLIENT_ID="test-client";
  env.LZC_GITHUB_CLIENT_SECRET="test-oauth-secret";
  assert.equal(run("application").status,0);
  const authenticated=JSON.parse(readFileSync(vars));
  assert.equal(authenticated.LZC_AUTH_ENABLED,"true");
  assert.equal(authenticated.LZC_GITHUB_CLIENT_SECRET,"test-oauth-secret");
  env.LZC_ASSISTANT_ENABLED="true";
  assert.equal(run("application").status,0,"Authenticated release must forward Assistant opt-in");
  assert.equal(JSON.parse(readFileSync(vars)).LZC_ASSISTANT_ENABLED,"true");
  assert.ok(!readFileSync(migration,"utf8").includes("LZC_ASSISTANT_ENABLED"));
  env.LZC_APPLICATION_EXECUTION_ENABLED="true";
  assert.notEqual(run("application").status,0,"Application execution requires platform execution");
  env.LZC_EXECUTION_ENABLED="true";
  assert.notEqual(run("application").status,0,"Execution requires a durable artifact key");
  env.LZC_DEPLOYMENT_ARTIFACT_KEY="invalid";
  assert.notEqual(run("application").status,0,"Execution requires a canonical 32-byte key");
  env.LZC_DEPLOYMENT_ARTIFACT_KEY=Buffer.alloc(32,7).toString("base64");
  assert.equal(run("application").status,0);
  assert.equal(JSON.parse(readFileSync(vars)).LZC_APPLICATION_EXECUTION_ENABLED,"true");
  assert.ok(!readFileSync(migration,"utf8").includes(env.LZC_DEPLOYMENT_ARTIFACT_KEY));
  env.LZC_EXECUTION_ENABLED="false";
  env.LZC_APPLICATION_EXECUTION_ENABLED="false";
  env.LZC_DEPLOYMENT_ARTIFACT_KEY="";
    env.LZC_STACKIT_DEVICE_ENABLED="true";
    assert.notEqual(run("application").status,0,"must reject unapproved CLI client use");
    env.LZC_STACKIT_CLI_CLIENT_APPROVED="true";
    env.LZC_GITHUB_CLIENT_ID="";
    env.LZC_GITHUB_CLIENT_SECRET="";
    assert.notEqual(run("application").status,0,"must reject missing PKCE configuration before staging");
    env.LZC_STACKIT_CLI_CLIENT_APPROVED="false";
    env.LZC_STACKIT_AUTH_FLOW="authorization-code";
    env.LZC_STACKIT_CLIENT_ID="registered-web-client";
    env.LZC_STACKIT_REDIRECT_URI="https://lzc-dev-configurator-7dbff805.apps.01.cf.eu01.stackit.cloud/auth/stackit/callback";
    assert.notEqual(run("application").status,0,"must reject the previous public origin callback");
    env.LZC_STACKIT_REDIRECT_URI="https://lzc-dev-configurator.apps.01.cf.eu01.stackit.cloud/auth/stackit/callback";
    const stackitRun=run("application");
    assert.equal(stackitRun.status,0,`STACKIT login without GitHub failed: ${stackitRun.stderr}`);
    const stackit=JSON.parse(readFileSync(vars));
    assert.equal(stackit.LZC_STACKIT_DEVICE_ENABLED,"true");
    assert.equal(stackit.LZC_STACKIT_CLI_CLIENT_APPROVED,"false");
    assert.equal(stackit.LZC_GITHUB_CLIENT_SECRET,"");
    assert.equal(stackit.LZC_STACKIT_AUTH_FLOW,"authorization-code");
    assert.equal(stackit.LZC_STACKIT_CLIENT_ID,"registered-web-client");
    env.LZC_STACKIT_CLIENT_ID="stackit-cli-0000-0000-000000000001";
    assert.notEqual(run("application").status,0,"must reject an unregistered hosted CLI callback");
    env.LZC_STACKIT_CLIENT_ID="registered-web-client";
    env.LZC_GITHUB_CLIENT_ID="test-client";
    assert.notEqual(run("application").status,0,"must reject incomplete optional GitHub credentials");
    env.LZC_GITHUB_CLIENT_SECRET="test-oauth-secret";
    env.LZC_AUTH_ENABLED="false";
    assert.notEqual(run("application").status,0,"must reject STACKIT login without authentication");
    env.LZC_AUTH_ENABLED="true";
    env.LZC_STACKIT_DEVICE_ENABLED="false";
    env.LZC_STACKIT_CLI_CLIENT_APPROVED="false";
    assert.equal(run("application").status,0);
  assert.ok(!readFileSync(migration,"utf8").includes("test-oauth-secret"));
  assert.ok(!readFileSync(env.GITHUB_ENV,"utf8").includes("must-not-be-forwarded"));
  assert.equal(authenticated.LZC_PLANS_ENABLED,"false");
  assert.notEqual(run("runner").status,0);
  const platform=JSON.parse(readFileSync(join(privateDir,"platform-outputs.json")));
  platform.plan_runner_cf={value:{api_url:cf.api_url,org_id:cf.org_id,username:"runner-user",password:"runner-only-secret"}};
  runtime.runner_space={value:{id:"11111111-1111-4111-8111-111111111111",name:"plans",org_id:cf.org_id}};
  writeFileSync(join(privateDir,"platform-outputs.json"),JSON.stringify(platform));
  writeFileSync(join(privateDir,"runtime-outputs.json"),JSON.stringify(runtime));
  assert.notEqual(run("application").status,0,"must reject shared app/runner organisation");
  platform.plan_runner_cf.value.org_id="22222222-2222-4222-8222-222222222222";
  runtime.runner_space.value.org_id=platform.plan_runner_cf.value.org_id;
  writeFileSync(join(privateDir,"platform-outputs.json"),JSON.stringify(platform));
  writeFileSync(join(privateDir,"runtime-outputs.json"),JSON.stringify(runtime));
  assert.equal(run("application").status,0);
  env.LZC_RUNNER_TEMPLATE_ID="33333333-3333-4333-8333-333333333333";
  assert.notEqual(run("runner").status,0,"Runner droplet must be bound explicitly");
  env.LZC_RUNNER_DROPLET_ID="44444444-4444-4444-8444-444444444444";
  assert.equal(run("runner").status,0);
  const enabled=JSON.parse(readFileSync(vars));
  assert.equal(enabled.LZC_PLANS_ENABLED,"true");
  assert.equal(enabled.LZC_RUNNER_CF_PASSWORD,"runner-only-secret");
  assert.equal(enabled.LZC_RUNNER_DROPLET_ID,env.LZC_RUNNER_DROPLET_ID);
  assert.ok(!readFileSync(migration,"utf8").includes("runner-only-secret"));
  env.LZC_EXECUTION_ENABLED="true";
  env.LZC_DEPLOYMENT_ARTIFACT_KEY=Buffer.alloc(32,7).toString("base64");
  env.LZC_RUNNER_POOL_SIZE="1";
  const warm=run("application");
  assert.equal(warm.status,0,warm.stderr);
  assert.equal(JSON.parse(readFileSync(vars)).LZC_RUNNER_POOL_SIZE,"1");

 } finally {rmSync(dir,{recursive:true,force:true});}
});
