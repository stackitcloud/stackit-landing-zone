import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,readFileSync,rmSync,mkdirSync,symlinkSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {productionRelease} from "./production-release.mjs";
import {productionBindings,validateProductionBindings,runtimeKeys} from "./production-bindings.mjs";
import {createReleaseManifest,verifyReleaseManifest,approvedReleaseSource} from "./release-artifact.mjs";
const id="11111111-2222-4333-8444-555555555555",runnerId="22222222-2222-4333-8444-555555555555";
function outputs(){
 const cf={api_url:"https://api.system.01.cf.eu01.stackit.cloud",org_id:id,username:"app-org-manager",password:"app-org-manager-secret"};
 const runner={...cf,org_id:runnerId,username:"runner-org-manager",password:"runner-org-manager-secret"};
 const values=Object.fromEntries(runtimeKeys.map(key=>[key,`synthetic-${key}`]));
 return [{cf_runtime:{value:cf},plan_runner_cf:{value:runner},database_migration:{value:{host:values.LZC_DATABASE_HOST,port:values.LZC_DATABASE_PORT,database:"configurator",username:"configurator_migration",password:"migration-only"}},assistant_test_model_serving_token:{value:"test-token-never-publish"}}, {space:{value:{id,name:"configurator"}},runner_space:{value:{id:runnerId,name:"plans",org_id:runnerId}},app_environment:{value:{...values,LZC_SERVICE_ACCOUNT_KEY:"no"}},release_credentials:{value:{username:"app-space-deployer",password:"app-space-only"}},dispatcher_credentials:{value:{credentials:{username:"runner-space-deployer",password:"runner-space-only"}}},public_endpoint:{value:{origin:"https://app.landing-zone.runs.onstackit.cloud"}}}];
}
test("release publication excludes infrastructure identities and binds both spaces to the production project",()=>{
 const [platform,runtime]=outputs(),binding=productionBindings(platform,runtime,id);
 assert.equal(validateProductionBindings(binding,id),binding);
 for(const privateValue of ["app-org-manager-secret","runner-org-manager-secret","test-token-never-publish","LZC_SERVICE_ACCOUNT_KEY"])assert.ok(!JSON.stringify(binding).includes(privateValue));
 assert.throws(()=>validateProductionBindings({...binding,projectId:runnerId},id));
 assert.throws(()=>validateProductionBindings({...binding,stateKey:"no"},id));
 assert.throws(()=>validateProductionBindings({...binding,runner:{...binding.runner,org_id:id}},id));
 runtime.release_credentials.value=platform.cf_runtime.value;
 assert.throws(()=>productionBindings(platform,runtime,id),/managers/);
});
test("production consumes published stable source-bound releases and never Dev exception builds",()=>{
 const metadata={schemaVersion:1,repository:"stackitcloud/stackit-landing-zone",tag:"v2.0.0",revision:"a".repeat(40),runId:"123",mode:"accepted-assistant-limitations"};
 const release={tag_name:"v2.0.0",draft:false,prerelease:false,published_at:"2026-11-10T00:00:00Z"};
 assert.equal(productionRelease(metadata,release,metadata.revision),metadata);
 for(const change of [{draft:true},{prerelease:true},{tag_name:"v2.0.0-rc.1"},{published_at:null}])assert.throws(()=>productionRelease(metadata,{...release,...change},metadata.revision));
 assert.throws(()=>productionRelease({...metadata,mode:"dev-skip-assistant-qualification"},release,metadata.revision));
 assert.throws(()=>productionRelease(metadata,release,"b".repeat(40)));
 const run={id:123,run_attempt:1,path:".github/workflows/configurator-release.yml",head_sha:metadata.revision,head_repository:{full_name:metadata.repository},head_branch:"main",event:"workflow_dispatch"};
 const jobs=[{name:"build-accepted-assistant-limitations",status:"completed",conclusion:"success"}];
 const artifacts=[{id:456,name:"configurator-release-123",expired:false,workflow_run:{id:123,head_sha:metadata.revision}}];
 assert.equal(approvedReleaseSource(run,jobs,artifacts,"123",metadata.mode,"999").revision,metadata.revision);
 assert.throws(()=>approvedReleaseSource(run,jobs,artifacts,"123","qualified","999"));
 const directory=mkdtempSync(join(tmpdir(),"lzc-prod-artifact-"));
 try{
  for(const name of ["release.tar.gz","runner.tar.gz"])writeFileSync(join(directory,name),"synthetic-bundle");
  const source={revision:metadata.revision,runId:"123",mode:metadata.mode};
  const manifest=createReleaseManifest(directory,source);
  assert.equal(manifest.assistantQualified,false);
  assert.equal(manifest.target,"lzc-prod");
  assert.deepEqual(verifyReleaseManifest(directory,source),manifest);
  assert.throws(()=>verifyReleaseManifest(directory,{...source,mode:"qualified"}));
  writeFileSync(join(directory,"release-manifest.json"),JSON.stringify({...manifest,assistantQualified:true}));
  assert.throws(()=>verifyReleaseManifest(directory,source));
 }finally{rmSync(directory,{recursive:true,force:true});}
});
test("production rolling activation keeps existing replicas running and rejects unsuccessful deployments",()=>{
 const directory=mkdtempSync(join(tmpdir(),"lzc-prod-rolling-"));
 try{
  writeFileSync(join(directory,"app-stage.json"),JSON.stringify({app:id,package:id,build:id,droplet:id}));
  for(const reason of ["DEPLOYED","CANCELED"]){
   const replies={
    [`/v3/apps/${id}`]:{name:"landing-zone-configurator",state:"STARTED",relationships:{space:{data:{guid:id}}}},
    [`/v3/builds/${id}`]:{state:"STAGED",package:{guid:id},droplet:{guid:id}},
    [`/v3/droplets/${id}`]:{state:"STAGED",relationships:{app:{data:{guid:id}}}},
    "/v3/deployments":{guid:id},
    [`/v3/deployments/${id}`]:{relationships:{app:{data:{guid:id}}},status:{value:"FINALIZED",reason}},
    [`/v3/apps/${id}/processes`]:{resources:[{guid:id,type:"web",instances:3}]},
    [`/v3/processes/${id}/stats`]:{resources:[{state:"RUNNING"},{state:"RUNNING"},{state:"RUNNING"}]},
   };
   writeFileSync(join(directory,"cf"),`#!/usr/bin/env node\nconst fs=require('node:fs'),args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(join(directory,"calls"))},JSON.stringify(args)+'\\n');if(args[0]==='curl')console.log(JSON.stringify(${JSON.stringify(replies)}[args[1]]));\n`,{mode:0o700});
   const result=spawnSync(process.execPath,[new URL("./activate-release.mjs",import.meta.url).pathname],{env:{...process.env,PATH:`${directory}:${process.env.PATH}`,LZC_ENVIRONMENT:"lzc-prod",LZC_PRIVATE:directory,LZC_CF_SPACE_ID:id},encoding:"utf8"});
   assert.equal(result.status===0,reason==="DEPLOYED",result.stderr);
  }
  const calls=readFileSync(join(directory,"calls"),"utf8").trim().split("\n").map(JSON.parse);
  assert.ok(!calls.some(call=>["stop","start","set-droplet"].includes(call[0])));
  const post=calls.find(call=>call[1]==="/v3/deployments");
  const body=JSON.parse(post[post.indexOf("-d")+1]);
  assert.equal(body.strategy,"rolling");assert.equal(body.droplet.guid,id);assert.equal(body.options.max_in_flight,1);
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test("production preparation uses scoped bindings, exact PKCE origin and three replicas without state access",()=>{
 const directory=mkdtempSync(join(tmpdir(),"lzc-prod-prepare-"));
 const apiDist=new URL("../../app/apps/api/dist/",import.meta.url).pathname;
 try{
  const artifact=join(directory,".local/release/apps/api");mkdirSync(artifact,{recursive:true});symlinkSync(apiDist,join(artifact,"dist"),"dir");
  const [platform,runtime]=outputs();
  const env={...process.env,GITHUB_REPOSITORY:"stackitcloud/stackit-landing-zone",GITHUB_REF:"refs/heads/main",LZC_ENVIRONMENT:"lzc-prod",LZC_PUBLISHED_RELEASE:"true",LZC_RELEASE_MODE:"accepted-assistant-limitations",LZC_RELEASE_REVISION:"a".repeat(40),RUNNER_TEMP:directory,GITHUB_ENV:join(directory,"environment"),LZC_RELEASE_BINDINGS:JSON.stringify(productionBindings(platform,runtime,id)),LZC_PROJECT_ID:id,LZC_AUTH_ENABLED:"true",LZC_ASSISTANT_ENABLED:"true",LZC_STACKIT_DEVICE_ENABLED:"true",LZC_STACKIT_CLI_CLIENT_APPROVED:"false",LZC_STACKIT_AUTH_FLOW:"authorization-code",LZC_STACKIT_CLIENT_ID:"production-public-client",LZC_STACKIT_REDIRECT_URI:"https://app.landing-zone.runs.onstackit.cloud/auth/stackit/callback",LZC_EXECUTION_ENABLED:"true",LZC_APPLICATION_EXECUTION_ENABLED:"true",LZC_RUNNER_POOL_SIZE:"2",LZC_DEPLOYMENT_ARTIFACT_KEY:Buffer.alloc(32,5).toString("base64"),LZC_GITHUB_CLIENT_ID:"",LZC_GITHUB_CLIENT_SECRET:""};
  const run=mode=>spawnSync(process.execPath,[new URL("./prepare-release.mjs",import.meta.url).pathname,mode],{env,cwd:directory,encoding:"utf8"});
  assert.equal(run("backend").status,0);
  const result=run("application");assert.equal(result.status,0,result.stderr);
  const prepared=JSON.parse(readFileSync(join(directory,"lzc-release/app-vars.json"),"utf8"));
  assert.equal(prepared.LZC_APP_INSTANCES,3);assert.equal(prepared.LZC_APP_ROUTE,"app.landing-zone.runs.onstackit.cloud");assert.equal(prepared.LZC_ASSISTANT_ENABLED,"true");assert.equal(prepared.LZC_RUNNER_CF_USERNAME,"runner-space-deployer");
  assert.ok(!JSON.stringify(prepared).includes("org-manager"));assert.equal(existsSync(join(directory,"lzc-release/platform.backend.hcl")),false);
  env.LZC_STACKIT_REDIRECT_URI="https://lzc-dev-configurator.apps.01.cf.eu01.stackit.cloud/auth/stackit/callback";assert.notEqual(run("application").status,0);
  env.LZC_PUBLISHED_RELEASE="false";assert.notEqual(run("backend").status,0);
  env.LZC_PUBLISHED_RELEASE="true";env.LZC_RELEASE_MODE="dev-skip-assistant-qualification";assert.notEqual(run("backend").status,0);
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test("space-scoped account creation waits for its provisioning principal's developer role",()=>{
 const hcl=readFileSync(new URL("../runtime/2-deployment-identities.tf",import.meta.url),"utf8");
 for(const [name,role] of [["release","deployer"],["dispatcher","runner_developer"]]){
  const resource=hcl.split(`resource "cloudfoundry_service_instance" "${name}" {`)[1]?.split('\n}')[0];
  assert.ok(resource,`missing ${name} service`);
  assert.match(resource,new RegExp(`depends_on\\s*=\\s*\\[cloudfoundry_space_role\\.${role}\\]`));
 }
});
