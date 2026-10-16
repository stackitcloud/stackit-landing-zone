import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
test("local seed preparation preserves existing keys and shell-quotes secrets without execution",()=>{
 const repo=mkdtempSync(join(tmpdir(),"lzc-local-")),base=join(repo,"landing-zone-configurator"),infra=join(base,"infra");mkdirSync(infra,{recursive:true});
 for(const name of ["prepare-local.mjs","state-key.mjs"])copyFileSync(fileURLToPath(new URL(name,import.meta.url)),join(infra,name));
 const location=join(base,".local/seed");mkdirSync(location,{recursive:true});
 const key="test-key-".repeat(6)+"'\n$(false)`false`";
 writeFileSync(join(location,"state.passphrase"),key);writeFileSync(join(repo,"landing-zone-configurator.env"),'PROJECT_ID=00000000-0000-4000-8000-000000000001\nREGION=eu01\nNAME_PREFIX=lzc-dev\nSTATE_CREDENTIAL_EXPIRATION=2026-12-28T00:00:00Z\n');writeFileSync(join(repo,"landing-zone-configurator-credentials.json"),'{}');
 try{
  const env={...process.env,CI:"",GITHUB_ACTIONS:""};const r=spawnSync(process.execPath,[join(infra,"prepare-local.mjs"),"seed"],{env,encoding:"utf8"});assert.equal(r.status,0,r.stderr);
  const result=spawnSync('bash',['-c','. "$1"; "$2" -e \'process.stdout.write(process.env.TF_ENCRYPTION)\'','test',join(location,"environment.sh"),process.execPath],{env,encoding:"utf8"});assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).key_provider.pbkdf2.state.passphrase,key);assert.equal(readFileSync(join(location,"state.passphrase"),"utf8"),key);
  const denied=spawnSync(process.execPath,[join(infra,"prepare-local.mjs"),"platform"],{env,encoding:"utf8"});assert.notEqual(denied.status,0);assert.match(denied.stderr,/serialized GitHub workflow/);
 }finally{rmSync(repo,{recursive:true,force:true});}
});
