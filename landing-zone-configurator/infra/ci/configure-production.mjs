// Operator-only credential publication; values reach gh through stdin, never argv/logs.
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { productionBindings } from "./production-bindings.mjs";
import { stateKey } from "../state-key.mjs";
const [phase, configPath]=process.argv.slice(2);
if(!["infrastructure","release-protection","release"].includes(phase)||!configPath||process.argv.length!==4)throw new Error("Usage: configure-production.mjs infrastructure|release-protection|release PRIVATE_CONFIG");
process.umask(0o077);
const config=JSON.parse(readFileSync(resolve(configPath),"utf8"));
if(!/^[a-f0-9-]{36}$/.test(config.projectId??"")||!config.reviewer)throw new Error("Explicit project and GitHub reviewer required");
const repo="stackitcloud/stackit-landing-zone",base=resolve(".local/lzc-prod");
function gh(args,input){try{return execFileSync("gh",args,{input,encoding:"utf8",stdio:["pipe","pipe","pipe"]});}catch{throw new Error(`GitHub ${args[0]} failed; secret output suppressed`);}}
const api=(path,method="GET",body)=>JSON.parse(gh(["api",path,"--method",method,...(body?["--input","-"]:[])],body?JSON.stringify(body):undefined)||"{}");
if(!api(`repos/${repo}`).permissions?.admin)throw new Error("Repository administration permission required");
const reviewer=api(`users/${config.reviewer}`);
function configure(name,review,variables,secrets,tags=false){
 const path=`repos/${repo}/environments/${name}`;
 api(path,"PUT",{wait_timer:0,prevent_self_review:false,can_admins_bypass:false,reviewers:review?[{type:"User",id:reviewer.id}]:[],deployment_branch_policy:{protected_branches:false,custom_branch_policies:true}});
 const wanted=[{name:"main",type:"branch"},...(tags?[{name:"v*",type:"tag"}]:[])];
 const policies=api(`${path}/deployment-branch-policies`).branch_policies;
 if(policies.some(policy=>!wanted.some(item=>item.name===policy.name&&item.type===policy.type)))throw new Error("Unexpected production environment branch policy; inspect before credential upload");
 for(const policy of wanted)if(!policies.some(item=>item.name===policy.name&&item.type===policy.type))api(`${path}/deployment-branch-policies`,"POST",policy);
 const checked=api(path);
 if(!checked.deployment_branch_policy?.custom_branch_policies||review&&!checked.protection_rules.some(rule=>rule.type==="required_reviewers"&&rule.reviewers.some(item=>item.reviewer.id===reviewer.id)))throw new Error("Production approval protection missing");
 for(const [key,value]of Object.entries(variables)){
  if(!value)throw new Error(`Missing ${key}`);
  gh(["variable","set",key,"--repo",repo,"--env",name],String(value));
 }
 for(const [key,value]of Object.entries(secrets)){
  if(!value)throw new Error(`Missing ${key}`);
  gh(["secret","set",key,"--repo",repo,"--env",name],String(value));
 }
 console.log(`Configured ${name}; review=${review}. Secret values suppressed.`);
}
const read=path=>JSON.parse(readFileSync(resolve(base,path),"utf8"));
if(phase==="release-protection"){
 configure("lzc-prod-release",true,{LZC_PROJECT_ID:config.projectId},{},true);
}else if(phase==="infrastructure"){
 const seed=read("seed/outputs.json");
 const bucket=`lzc-prod-management-${config.projectId.slice(0,8)}`;
 if(seed.backend?.value?.bucket!==bucket)throw new Error("Wrong production management bucket");
 const variables={LZC_PROJECT_ID:config.projectId,LZC_REGION:"eu01",LZC_NAME_PREFIX:"lzc-prod",LZC_MANAGEMENT_BUCKET:bucket,LZC_CREDENTIAL_EXPIRATION:config.credentialExpiration,LZC_CF_PLATFORM_ID:config.cfPlatformId,LZC_CF_QUOTA_ID:config.cfQuotaId,LZC_OPERATOR_OWNER_EMAIL:config.ownerEmail};
 const shared={LZC_MANAGEMENT_ACCESS_KEY:seed.backend_credentials?.value?.access_key,LZC_MANAGEMENT_SECRET_KEY:seed.backend_credentials?.value?.secret_key,LZC_SERVICE_ACCOUNT_KEY:readFileSync(resolve(base,"provisioning-key.json"),"utf8")};
 for(const root of ["bootstrap","backend","platform","runtime"]){
  const secrets={...shared};
  for(const needed of ["bootstrap","backend",...(["platform","runtime"].includes(root)?["platform"]:[]),...(root==="runtime"?["runtime"]:[])]) {
    mkdirSync(resolve(base,needed),{recursive:true,mode:0o700});
    secrets[`LZC_STATE_KEY_${needed.toUpperCase()}`]=stateKey(resolve(base,needed),{validation:false});
  }
  const kind=["bootstrap","backend"].includes(root)?"bootstrap":root;
  for(const approval of [false,true])configure(`lzc-prod-${kind}-${approval?"apply":"plan"}`,approval,variables,secrets);
 }
 for(const key of ["LZC_PLATFORM_CI_ENABLED","LZC_RUNTIME_CI_ENABLED"])gh(["variable","set",key,"--repo",repo],"true");
}else{
 const binding=productionBindings(read("platform/outputs.json"),read("runtime/outputs.json"),config.projectId);
 // Artifact encryption key is durable across releases and independent from every state key.
 const artifactKey=readFileSync(resolve(base,"artifact.key"),"utf8").trim();
 if(Buffer.from(artifactKey,"base64").length!==32||Buffer.from(artifactKey,"base64").toString("base64")!==artifactKey)throw new Error("Invalid durable artifact key");
 const secrets={LZC_RELEASE_BINDINGS:JSON.stringify(binding),LZC_DEPLOYMENT_ARTIFACT_KEY:artifactKey};
 configure("lzc-prod-release",true,{LZC_PROJECT_ID:config.projectId,LZC_STACKIT_CLIENT_ID:config.stackitClientId},secrets,true);
}
