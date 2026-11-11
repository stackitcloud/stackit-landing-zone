// Declarative MailOut reconciliation against the published v1beta1 API.
// The pinned STACKIT Terraform provider has no MailOut resources. Never invent them.
import {readFileSync,writeFileSync,mkdirSync,existsSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hostname=/^(?:[a-z0-9_][a-z0-9_-]*\.)+[a-z0-9-]+$/;
export function validateManifest(c) {
 if(c.environment!=='lzc-dev'||c.projectId!=='7dbff805-6788-4d5d-88c0-a5212ac5e90f'||c.region!=='eu01'||c.domain!=='dev.landing-zone.runs.onstackit.cloud'||c.from!==`notifications@${c.domain}`||!uuid.test(c.dnsProjectId)||!uuid.test(c.dnsZoneId)||c.dnsZone!=='landing-zone.runs.onstackit.cloud'||!c.senderDescription||c.senderDescription.length>100)throw Error('mailout_manifest_invalid');
 return c;
}
export function dnsRecords(c,config) {
 const records=config?.dnsRecords;
 if(!records?.spf||!records?.dmarc||!Array.isArray(records.dkim)||!records.dkim.length)throw Error('mailout_dns_records_not_ready');
 return [records.spf,records.dmarc,...records.dkim,...(records.returnPath?[records.returnPath]:[])].map(r=>{
  let host=r.host.replace(/\.$/,'');
  if(host==='@'||host==='')host=c.domain;
  else if(host!==c.domain&&!host.endsWith(`.${c.domain}`))host=`${host}.${c.domain}`;
  if(!hostname.test(host)||!(host===c.domain||host.endsWith(`.${c.domain}`))||!['TXT','CNAME'].includes(r.type)||typeof r.value!=='string'||!r.value||/[\r\n]/.test(r.value))throw Error('mailout_dns_record_outside_scope');
  return {name:`${host}.`,type:r.type,ttl:300,records:[{content:r.type==='CNAME'?`${r.value.replace(/\.$/,'')}.`:r.value}],comment:'Landing Zone Configurator Dev MailOut'};
 });
}
export async function reconcile(c,request,{apply=false,binding,saveBinding=()=>{},saveRecovery=()=>{},record=()=>{}}={}) {
 validateManifest(c);
 const base=`/v1beta1/projects/${c.projectId}/regions/${c.region}/sending-domains`;
 const dns=`/v1/projects/${c.dnsProjectId}/zones/${c.dnsZoneId}`;
 const zone=await request('dns',dns);
 if(zone.zone?.dnsName.replace(/\.$/,'')!==c.dnsZone||zone.zone?.type!=='primary')throw Error('mailout_dns_zone_mismatch');
 const inventory=await request('mailout',base);
 const matches=inventory.items.filter(d=>d.domain===c.domain);
 if(matches.length>1)throw Error('mailout_domain_ambiguous');
 let domain=matches[0];
 if(!domain&&!apply)return {createDomain:true,createSender:true,dnsScope:c.domain,changes:'generated authentication records only; inspect after domain creation'};
 if(!domain){domain=await request('mailout',base,'POST',{domain:c.domain});record({action:'domain-created',id:domain.id});}
 if(!uuid.test(domain.id))throw Error('mailout_domain_identity_invalid');
 const root=`${base}/${domain.id}`;
 const detail=await request('mailout',root);
 const desired=dnsRecords(c,detail.config);
 const existing=await request('dns',`${dns}/rrsets?pageSize=10000`);
 if(existing.totalPages>1||!Array.isArray(existing.rrSets))throw Error('mailout_dns_inventory_incomplete');
 const missing=[];
 for(const r of desired) {
  const sameName=existing.rrSets.filter(e=>e.name.replace(/\.$/,'')===r.name.replace(/\.$/,''));
  const match=sameName.find(e=>e.type===r.type);
  const values=e=>(e.records??[]).map(v=>String(v.content).replace(/^"(.*)"$/,'$1')).sort();
  if(match&&JSON.stringify(values(match))===JSON.stringify(values(r)))continue;
  if(match||sameName.some(e=>e.type==='CNAME'||r.type==='CNAME'))throw Error('mailout_existing_dns_conflict');
  missing.push(r);
 }
 if(!apply)return {domainId:domain.id,domainState:detail.state,dnsCreates:missing,createSender:!binding};
 for(const r of missing){const created=await request('dns',`${dns}/rrsets`,'POST',r);record({action:'dns-created',name:r.name,type:r.type,id:created.rrset?.id});}
 if(detail.state!=='active'){
  await request('mailout',`${root}/validate`,'POST');
  return {domainId:domain.id,state:'validation-pending',dnsCreates:missing.length,ready:false};
 }
 const senders=await request('mailout',`${root}/authorized-senders`);
 const owned=senders.items.filter(s=>s.description===c.senderDescription);
 if(owned.length>1)throw Error('mailout_sender_ambiguous');
 if(binding){
  if(binding.projectId!==c.projectId||binding.domainId!==domain.id||binding.from!==c.from||!binding.password||owned[0]?.id!==binding.senderId||owned[0]?.username!==binding.username)throw Error('mailout_binding_identity_mismatch');
  return {domainId:domain.id,senderId:binding.senderId,ready:owned[0].state==='active',state:owned[0].state,changed:false};
 }
 if(owned.length)throw Error('mailout_sender_password_recovery_required');
 const sender=await request('mailout',`${root}/authorized-senders`,'POST',{description:c.senderDescription});
 saveRecovery(sender);
 if(!uuid.test(sender.id)||typeof sender.password!=='string'||!sender.password||!sender.username||!/^smtp[0-9]*\.[a-z0-9.-]+\.stackit\.cloud:(25|587|465)$/.test(sender.smtpEndpoint))throw Error('mailout_sender_response_invalid');
 const [host,port]=sender.smtpEndpoint.split(':');
 saveBinding({schemaVersion:1,projectId:c.projectId,domainId:domain.id,senderId:sender.id,host,port:Number(port),username:sender.username,password:sender.password,from:c.from});
 record({action:'sender-created',id:sender.id});
 return {domainId:domain.id,senderId:sender.id,ready:sender.state==='active',state:sender.state,changed:true};
}
async function main() {
 process.umask(0o077);
 const mode=process.argv[2];if(!['plan','apply'].includes(mode))throw Error('expected_plan_or_apply');
 const c=validateManifest(JSON.parse(readFileSync(new URL('./environments/lzc-dev.json',import.meta.url))));
 const dir=resolve(process.env.LZC_MAILOUT_PRIVATE??fileURLToPath(new URL('../../.local/mailout/',import.meta.url)));mkdirSync(dir,{recursive:true,mode:0o700});
 if(statSync(dir).mode&0o077)throw Error('mailout_private_directory_permissions');
 const file=resolve(dir,'bindings.private.json');let binding;
 if(existsSync(file)){if(statSync(file).mode&0o077)throw Error('mailout_binding_permissions');binding=JSON.parse(readFileSync(file));}
 else if(process.env.LZC_MAILOUT_BINDINGS)binding=JSON.parse(process.env.LZC_MAILOUT_BINDINGS);
 const key=process.env.STACKIT_SERVICE_ACCOUNT_KEY_PATH;
 if(!key)throw Error('operator_service_account_key_required');
 const result=spawnSync(process.env.STACKIT_CLI_BIN??'stackit',['auth','activate-service-account','--service-account-key-path',key,'--only-print-access-token'],{encoding:'utf8',timeout:45000});
 if(result.status!==0||!result.stdout.trim())throw Error('operator_authentication_failed');
 const token=result.stdout.trim();
 const request=async(service,path,method='GET',body)=>{
  const base=service==='dns'?'https://dns.api.stackit.cloud':'https://mailout.api.eu01.stackit.cloud';
  if(!path.startsWith('/v1/')&&!path.startsWith('/v1beta1/'))throw Error('invalid_api_path');
  const r=await fetch(base+path,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw Error(`${service}_http_${r.status}`);
  if(r.status===204)return null;
  const text=await r.text();if(text.length>2_000_000)throw Error('provider_response_too_large');return JSON.parse(text);
 };
 const journal=[];
 try{
  const summary=await reconcile(c,request,{apply:mode==='apply',binding,saveBinding:value=>writeFileSync(file,JSON.stringify(value),{mode:0o600,flag:'wx'}),saveRecovery:value=>writeFileSync(resolve(dir,`sender-create-response-${randomUUID()}.private.json`),JSON.stringify(value),{mode:0o600,flag:'wx'}),record:event=>{journal.push(event);writeFileSync(resolve(dir,'operations.private.json'),JSON.stringify(journal),{mode:0o600});}});
  writeFileSync(resolve(dir,`${mode}.private.json`),JSON.stringify(summary,null,2),{mode:0o600});
  console.log(JSON.stringify({environment:c.environment,mode,...summary}));
 }catch(error){console.error(JSON.stringify({mode,error:/^[a-z_0-9]+$/.test(error.message)?error.message:'mailout_operation_failed'}));process.exitCode=1;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
