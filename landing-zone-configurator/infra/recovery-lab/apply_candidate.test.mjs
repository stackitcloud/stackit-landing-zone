import assert from "node:assert/strict";
import {test} from "node:test";
import {configuration,readonly,preflight,inspect,planQuery,candidateQuery} from "./apply_candidate.mjs";

const ids=Array.from({length:9},(_,n)=>`${(n+1).toString(16).padStart(8,"0")}-1111-4111-8111-111111111111`);
const [instanceId,tenantId,planId,runnerSpace,runnerTemplate,sourceDropletId,jobId,appId]=ids;
function fixture(){
 const now=Date.now();
 const binding={version:1,instanceId,tenantId,planId,runnerSpace,runnerTemplate,sourceDropletId,backendSha256:"b".repeat(64),creates:8,
  backend:{bucket:"synthetic-state",endpoint:"https://object.storage.eu01.onstackit.cloud",region:"eu01",key:`applications/${tenantId}/${instanceId}/terraform.tfstate`,useLockfile:true}};
 const c={binding,startedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+600000).toISOString()};
 const cf={cf_api:"https://api.system.01.cf.eu01.stackit.cloud",organization_name:"lzc-dev",space_name:"configurator",application_name:"lzc-recovery-drill-operator-abcdef012345",application_id:appId,application_uris:[]};
 const env={LZC_DATABASE_USER:"configurator_migration",LZC_DATABASE_NAME:"configurator",VCAP_APPLICATION:JSON.stringify(cf)};
 return {c,cf,env,now};
}
test("accepts only bounded route-free Dev read-only observer configuration",()=>{
 const {c,env,now,cf}=fixture();
 assert.deepEqual(configuration(JSON.stringify(c),env,now),c);
 for(const changed of [
  {...c,extra:true},{...c,expiresAt:new Date(now+3600000).toISOString()},
  {...c,startedAt:new Date(now-3600000).toISOString()},
  {...c,binding:{...c.binding,creates:0}},
  {...c,binding:{...c.binding,backend:{...c.binding.backend,key:"foreign/key"}}},
  {...c,binding:{...c.binding,backend:{...c.binding.backend,endpoint:"https://production.example"}}},
 ])assert.throws(()=>configuration(JSON.stringify(changed),env,now));
 for(const changed of [
  {...env,LZC_DATABASE_USER:"configurator_app"},
  {...env,VCAP_APPLICATION:JSON.stringify({...cf,organization_name:"production"})},
  {...env,VCAP_APPLICATION:JSON.stringify({...cf,space_name:"other"})},
  {...env,VCAP_APPLICATION:JSON.stringify({...cf,application_name:"landing-zone-configurator"})},
  {...env,VCAP_APPLICATION:JSON.stringify({...cf,application_uris:["public.example"]})},
 ])assert.throws(()=>configuration(JSON.stringify(c),changed,now));
});
test("commits a short read-only snapshot before returning and rolls back failure",async()=>{
 const calls=[];
 const client={async query(sql,values){calls.push([sql,values]);return {rows:[{ok:true}]};}};
 assert.deepEqual(await readonly(client,"SELECT 1",["bound"]),[{ok:true}]);
 assert.deepEqual(calls.map(c=>c[0]),["BEGIN READ ONLY","SET LOCAL statement_timeout='2s'","SELECT 1","COMMIT"]);
 calls.length=0;
 client.query=async sql=>{calls.push([sql]);if(sql==="SELECT failed")throw Error("private-canary");return {rows:[]};};
 await assert.rejects(readonly(client,"SELECT failed",[]));
 assert.equal(calls.at(-1)[0],"ROLLBACK");
});
test("preflight rejects applied, expired, foreign, unsupported or destructive Plans",async()=>{
 const {c}=fixture();
 const row={status:"succeeded",runner_package_id:sourceDropletId,sha256:"a".repeat(64),diagnosis_available:true,exact_backend:true,unexpired:true,already_applied:false,
  summary:{resources:{create:8,update:0,delete:0,replace:0}}};
 let rows=[row];
 const client={async query(sql,values){if(sql===planQuery){assert.deepEqual(values,[instanceId,planId,tenantId,JSON.stringify(c.binding.backend)]);return {rows};}return {rows:[]};}};
 await preflight(client,c);
 for(const changed of [{status:"planning"},{runner_package_id:jobId},{diagnosis_available:false},{exact_backend:false},{unexpired:false},{already_applied:true},
  {summary:{resources:{create:8,update:1,delete:0,replace:0}}},{summary:{resources:{create:8,update:0,delete:1,replace:0}}},
  {summary:{resources:{create:8,update:0,delete:0,replace:1}}}]){
  rows=[{...row,...changed}];await assert.rejects(preflight(client,c));
 }
 rows=[];await assert.rejects(preflight(client,c));
});
test("emits only exact candidate identifiers; terminal/idle updates invalidate old observations",async()=>{
 const {c}=fixture();
 const row={job_id:jobId,runner_app_id:appId,runner_package_id:sourceDropletId,backend_sha256:c.binding.backendSha256,
  created_at:new Date(),status:"applying",private:"private-canary"};
 let rows=[row];
 const client={async query(sql,values){if(sql===candidateQuery){assert.deepEqual(values,[instanceId,planId,tenantId,c.startedAt,JSON.stringify(c.binding.backend),c.binding.backend.key,sourceDropletId]);return {rows};}return {rows:[]};}};
 const r=await inspect(client,c);assert.equal(r.event,"application_apply_candidate");assert.equal(r.jobId,jobId);
 assert.ok(!JSON.stringify(r).includes("private-canary"));assert.ok(!JSON.stringify(r).includes(c.binding.backend.key));
 rows=[{...row,status:"succeeded"}];assert.equal((await inspect(client,c)).status,"succeeded");
 rows=[];assert.equal((await inspect(client,c)).event,"application_apply_observer_idle");
 rows=[row,row];await assert.rejects(inspect(client,c));
 for(const change of [{runner_package_id:planId},{backend_sha256:"c".repeat(64)},{job_id:"bad"},{created_at:new Date(0)}]){
  rows=[{...row,...change}];await assert.rejects(inspect(client,c));
 }
});
