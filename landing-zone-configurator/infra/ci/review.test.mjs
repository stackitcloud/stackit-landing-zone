import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const script=fileURLToPath(new URL("./review.mjs",import.meta.url));
test("saved plan is bound to run and bytes, and can be consumed only once",()=>{
 const dir=mkdtempSync(join(tmpdir(),"lzc-review-")),plan=join(dir,"review.tfplan");
 const bytes=JSON.stringify({encryption_version:"v0",encrypted_data:"fake-test-ciphertext"});
 const env={...process.env,LZC_PLAN:plan,LZC_ROOT:"platform",LZC_ENVIRONMENT:"lzc-dev",GITHUB_REF:"refs/heads/feature/landing-zone-configurator",GITHUB_EVENT_NAME:"push",GITHUB_RUN_ATTEMPT:"1",GITHUB_SHA:"a".repeat(40),LZC_PROJECT_ID:"00000000-0000-4000-8000-000000000001",LZC_REGION:"eu01",LZC_NAME_PREFIX:"lzc-dev",LZC_MANAGEMENT_BUCKET:"lzc-dev-management-00000000",LZC_CREDENTIAL_EXPIRATION:"2026-12-28T00:00:00Z",GITHUB_REPOSITORY:"stackitcloud/stackit-landing-zone",GITHUB_RUN_ID:"123",GITHUB_ACTIONS:"true",GITHUB_WORKFLOW_REF:"stackitcloud/stackit-landing-zone/.github/workflows/configurator-platform.yml@refs/heads/feature/landing-zone-configurator",LZC_APPROVED_APPLY_COMMIT:"a".repeat(40),LZC_APPROVED_APPLY_ROOT:"platform",GITHUB_STEP_SUMMARY:join(dir,"summary")};
 const run=(command,patch={})=>spawnSync(process.execPath,[script,command],{env:{...env,...patch},encoding:"utf8"});
 try {
  writeFileSync(plan,bytes);assert.equal(run("seal").status,0);
  assert.notEqual(run("verify",{GITHUB_RUN_ID:"124"}).status,0);
  writeFileSync(plan,bytes.replace("fake-test","altered-test"));assert.notEqual(run("verify").status,0);
  writeFileSync(plan,bytes);const ok=run("verify");assert.equal(ok.status,0,ok.stderr);assert.notEqual(run("verify").status,0);
  writeFileSync(plan,JSON.stringify({values:{}}));assert.notEqual(run("seal").status,0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
