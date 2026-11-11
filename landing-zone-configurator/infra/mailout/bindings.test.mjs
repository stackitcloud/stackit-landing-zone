import test from 'node:test';import assert from 'node:assert/strict';import{mailoutEnvironment}from'./bindings.mjs';
import {readFileSync}from'node:fs';
import{assertMailoutBinding}from'../ci/verify-mailout-binding.mjs';
const dev='7dbff805-6788-4d5d-88c0-a5212ac5e90f';const prod='b601468a-e897-4f74-8e10-ac4ab1e448af';
const binding={schemaVersion:1,projectId:dev,domainId:dev,senderId:dev,host:'smtp.mailout.eu01.stackit.cloud',port:25,from:'notifications@dev.landing-zone.runs.onstackit.cloud',username:'fixture',password:'fixture-secret'};
test('leaves email disabled without explicit private bindings',()=>{assert.deepEqual(mailoutEnvironment(undefined,'lzc-dev',dev),{LZC_MAILOUT_ENABLED:'false',LZC_MAILOUT_HOST:'',LZC_MAILOUT_PORT:'25',LZC_MAILOUT_USERNAME:'',LZC_MAILOUT_PASSWORD:'',LZC_MAILOUT_FROM:''});});
test('accepts only stage/project/sender-bound private SMTP settings',()=>{assert.equal(mailoutEnvironment(JSON.stringify(binding),'lzc-dev',dev).LZC_MAILOUT_PASSWORD,'fixture-secret');for(const b of [{...binding,from:'arbitrary@example.test'},{...binding,projectId:prod},{...binding,host:'smtp.evil.example'},{...binding,port:80},{...binding,password:''}])assert.throws(()=>mailoutEnvironment(JSON.stringify(b),'lzc-dev',dev));assert.throws(()=>mailoutEnvironment(JSON.stringify(binding),'lzc-prod',prod));});
test('the real CF manifest carries enabled and disabled bindings through to the runtime',()=>{
 const manifest=readFileSync(new URL('../../deploy/cloud-foundry/manifest.yml',import.meta.url),'utf8');
 for(const raw of [undefined,JSON.stringify(binding)]){
  const expected={...mailoutEnvironment(raw,'lzc-dev',dev),LZC_PUBLIC_ORIGIN:'https://dev.example.test'};
  const actual=Object.fromEntries([...manifest.matchAll(/^\s+(LZC_MAILOUT_[A-Z_]+|LZC_PUBLIC_ORIGIN): \(\(([A-Z_]+)\)\)$/gm)].map(([,key,value])=>[key,expected[value]]));
  assert.equal(assertMailoutBinding(expected,actual).enabled,!!raw);
  assert.throws(()=>assertMailoutBinding(expected,{}),/does not match/);
  if(raw){
   assert.throws(()=>assertMailoutBinding(expected,{...actual,LZC_MAILOUT_ENABLED:'false'}),/does not match/);
   assert.throws(()=>assertMailoutBinding(expected,{...actual,LZC_MAILOUT_PASSWORD:'stale-secret'}),e=>!e.message.includes('secret')&&/does not match/.test(e.message));
  }
 }
 for(const name of ['../../deploy/runner/manifest.yml','../../deploy/cloud-foundry/migration-manifest.yml'])
  assert.doesNotMatch(readFileSync(new URL(name,import.meta.url),'utf8'),/LZC_MAILOUT_/);
});
