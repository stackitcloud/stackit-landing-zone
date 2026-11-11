import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{validateManifest,dnsRecords,reconcile}from'./provision.mjs';
const c=JSON.parse(readFileSync(new URL('./environments/lzc-dev.json',import.meta.url)));
const domainId='11111111-2222-4333-8444-555555555555';const senderId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const config={dnsRecords:{spf:{host:'@',type:'TXT',value:'v=spf1 include:mailout.example.test -all'},dmarc:{host:'_dmarc',type:'TXT',value:'v=DMARC1; p=reject'},dkim:[{host:'key._domainkey',type:'CNAME',value:'key.dkim.example.test'}]}};
function fixture({domain=true,state='active',records=[],senders=[]}={}){
 const calls=[];const saved=[];const base=`/v1beta1/projects/${c.projectId}/regions/eu01/sending-domains`;const dns=`/v1/projects/${c.dnsProjectId}/zones/${c.dnsZoneId}`;
 const request=async(service,path,method='GET',body)=>{calls.push({service,path,method,body});
  if(path===dns)return{zone:{dnsName:c.dnsZone,type:'primary'}};
  if(path===base)return method==='POST'?{id:domainId,domain:c.domain,state:'validating'}:{items:domain?[{id:domainId,domain:c.domain,state}]:[]};
  if(path===`${base}/${domainId}`)return{id:domainId,domain:c.domain,state,config};
  if(path===`${dns}/rrsets?pageSize=10000`)return{totalPages:1,rrSets:records};
  if(path===`${dns}/rrsets`&&method==='POST')return{rrset:{id:domainId}};
  if(path.endsWith('/validate'))return null;
  if(path.endsWith('/authorized-senders'))return method==='POST'?{id:senderId,description:c.senderDescription,username:'synthetic',password:'fixture-only-secret',smtpEndpoint:'smtp01.mailout.eu01.stackit.cloud:25',state:'active'}:{items:senders};
  throw Error('unexpected fixture request');};
 return{request,calls,saved,options:{saveBinding:value=>saved.push(value)}};
}
test('limits the manifest and generated records to the reviewed Dev scope',()=>{
 assert.equal(validateManifest(c),c);assert.throws(()=>validateManifest({...c,environment:'lzc-prod'}));assert.throws(()=>validateManifest({...c,projectId:c.dnsProjectId}));
 assert.ok(dnsRecords(c,config).every(r=>r.name.endsWith(`.${c.domain}.`)||r.name===`${c.domain}.`));
 assert.throws(()=>dnsRecords(c,{dnsRecords:{...config.dnsRecords,spf:{host:'@',type:'A',value:'1.2.3.4'}}}));
});
test('planning never creates resources or credentials',async()=>{const f=fixture({domain:false});const result=await reconcile(c,f.request);assert.equal(result.createDomain,true);assert.ok(f.calls.every(r=>r.method==='GET'));assert.equal(f.saved.length,0);});
test('creates only missing DNS records and captures the one-time sender credential privately',async()=>{
 const f=fixture();const result=await reconcile(c,f.request,{...f.options,apply:true});assert.equal(result.ready,true);assert.equal(f.saved.length,1);assert.equal(f.calls.filter(r=>r.method==='POST'&&r.service==='dns').length,3);
 assert.ok(!JSON.stringify(result).includes('fixture-only-secret'));assert.equal(f.saved[0].password,'fixture-only-secret');
});
test('does not overwrite existing records or conflicting authentication policy',async()=>{
 const records=dnsRecords(c,config);const f=fixture({records:records.map((r,i)=>i===0?{...r,records:[{content:'different existing SPF'}]}:r)});
 await assert.rejects(reconcile(c,f.request,{apply:true}),/mailout_existing_dns_conflict/);assert.ok(f.calls.every(r=>r.method==='GET'));
});
test('reconciles repeated applies without rotating or creating another sender',async()=>{
 const binding={projectId:c.projectId,domainId,senderId,from:c.from,username:'synthetic',password:'fixture-only-secret'};
 const f=fixture({records:dnsRecords(c,config),senders:[{id:senderId,username:'synthetic',description:c.senderDescription,state:'active'}]});
 assert.equal((await reconcile(c,f.request,{apply:true,binding})).changed,false);assert.ok(f.calls.every(r=>r.method==='GET'));
});
test('fails closed if an existing sender password has been lost',async()=>{
 const f=fixture({senders:[{id:senderId,username:'synthetic',description:c.senderDescription}]});
 await assert.rejects(reconcile(c,f.request,{apply:true}),/mailout_sender_password_recovery_required/);assert.equal(f.calls.filter(r=>r.path.endsWith('/authorized-senders')&&r.method==='POST').length,0);
});
test('does not issue sender credentials before domain validation succeeds',async()=>{
 const f=fixture({state:'validating'});assert.equal((await reconcile(c,f.request,{apply:true})).ready,false);assert.equal(f.saved.length,0);assert.ok(!f.calls.some(r=>r.path.endsWith('/authorized-senders')));
});
