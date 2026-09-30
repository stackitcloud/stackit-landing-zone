import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { deploymentInputs, planContext, assertApplyExecution } from "./context.mjs";
const env={LZC_ROOT:"bootstrap",LZC_ENVIRONMENT:"lzc-dev",GITHUB_REF:"refs/heads/main",GITHUB_EVENT_NAME:"workflow_dispatch",
  GITHUB_RUN_ATTEMPT:"1",GITHUB_SHA:"a".repeat(40),LZC_PROJECT_ID:"00000000-0000-4000-8000-000000000001",
  LZC_REGION:"eu01",LZC_NAME_PREFIX:"lzc-dev",LZC_MANAGEMENT_BUCKET:"lzc-dev-management-00000000",
  LZC_CREDENTIAL_EXPIRATION:"2026-12-28T00:00:00Z",GITHUB_REPOSITORY:"stackitcloud/stackit-landing-zone",GITHUB_RUN_ID:"123"};
test("trusted manual main context accepted",()=>assert.equal(deploymentInputs(env).root,"bootstrap"));
test("reject untrusted source, retry and wrong backend",()=>{
  for(const patch of [{GITHUB_REF:"refs/pull/1/merge"},{GITHUB_EVENT_NAME:"pull_request_target"},
    {GITHUB_REPOSITORY:"other/repository"},{GITHUB_RUN_ATTEMPT:"2"},{LZC_ROOT:"seed"},{LZC_ENVIRONMENT:"production"},{LZC_MANAGEMENT_BUCKET:"other"}]) {
    assert.throws(()=>deploymentInputs({...env,...patch}));
  }
});
test("plan context binds inputs, root, commit, run and source files",()=>{
  const inputs=deploymentInputs(env);
  const initial=planContext(inputs,"source");
  for(const patch of [{root:"backend"},{commit:"b".repeat(40)},{run:"124"},{expiration:"2027-01-01T00:00:00Z"}]) {
    assert.notEqual(planContext({...inputs,...patch},"source"),initial);
  }
  assert.notEqual(planContext(inputs,"changed-lockfile"),initial);
});

test("local invocation cannot apply even with a valid plan context",()=>{
  const result=spawnSync(process.execPath,[fileURLToPath(new URL("./review.mjs",import.meta.url)),"verify"],{env:{...process.env,...env,GITHUB_ACTIONS:"false"},encoding:"utf8"});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Remote apply is restricted to the serialized GitHub Actions workflow/);
});

test("single-writer apply requires approved workflow identity",()=>{
  const safety={mode:"github-actions-single-writer",concurrencyGroup:"configurator-lzc-dev-mutation"};
  const trusted={GITHUB_ACTIONS:"true",GITHUB_REF:"refs/heads/main",GITHUB_EVENT_NAME:"workflow_dispatch",GITHUB_WORKFLOW_REF:"stackitcloud/stackit-landing-zone/.github/workflows/configurator-bootstrap.yml@refs/heads/main"};
  assert.doesNotThrow(()=>assertApplyExecution(safety,trusted));
  for(const patch of [{GITHUB_ACTIONS:"false"},{GITHUB_WORKFLOW_REF:"other/workflow@refs/heads/main"}]) {
    assert.throws(()=>assertApplyExecution(safety,{...trusted,...patch}));
  }
  assert.throws(()=>assertApplyExecution({...safety,concurrencyGroup:"other"},trusted));
});

test("feature branch push can plan bootstrap but cannot apply",()=>{
  const feature={...env,GITHUB_REF:"refs/heads/feature/landing-zone-configurator",GITHUB_EVENT_NAME:"push"};
  assert.equal(deploymentInputs(feature).root,"bootstrap");
  assert.equal(deploymentInputs({...feature,LZC_ROOT:"backend"}).root,"backend");
  assert.throws(()=>deploymentInputs({...feature,GITHUB_REF:"refs/heads/feature/other"}));
  assert.throws(()=>assertApplyExecution({mode:"github-actions-single-writer",concurrencyGroup:"configurator-lzc-dev-mutation"},{...feature,GITHUB_ACTIONS:"true",GITHUB_WORKFLOW_REF:"stackitcloud/stackit-landing-zone/.github/workflows/configurator-bootstrap.yml@refs/heads/main"}));
});

test("feature apply needs exact explicitly approved commit and correct workflow",()=>{
  const safety={mode:"github-actions-single-writer",concurrencyGroup:"configurator-lzc-dev-mutation"};
  const feature={...env,GITHUB_ACTIONS:"true",GITHUB_REF:"refs/heads/feature/landing-zone-configurator",GITHUB_EVENT_NAME:"push",LZC_APPROVED_APPLY_COMMIT:env.GITHUB_SHA,LZC_APPROVED_APPLY_ROOT:"bootstrap",GITHUB_WORKFLOW_REF:"stackitcloud/stackit-landing-zone/.github/workflows/configurator-bootstrap.yml@refs/heads/feature/landing-zone-configurator"};
  assert.doesNotThrow(()=>assertApplyExecution(safety,feature));
  for(const patch of [{LZC_APPROVED_APPLY_COMMIT:""},{LZC_APPROVED_APPLY_COMMIT:"b".repeat(40)},{GITHUB_WORKFLOW_REF:"wrong"},{LZC_ROOT:"backend"}]) {
    assert.throws(()=>assertApplyExecution(safety,{...feature,...patch}));
  }
});

test("backend apply requires matching root approval",()=>{
 const safety={mode:"github-actions-single-writer",concurrencyGroup:"configurator-lzc-dev-mutation"};
 const backend={...env,LZC_ROOT:"backend",GITHUB_ACTIONS:"true",GITHUB_REF:"refs/heads/feature/landing-zone-configurator",GITHUB_EVENT_NAME:"push",LZC_APPROVED_APPLY_COMMIT:env.GITHUB_SHA,LZC_APPROVED_APPLY_ROOT:"backend",GITHUB_WORKFLOW_REF:"stackitcloud/stackit-landing-zone/.github/workflows/configurator-bootstrap.yml@refs/heads/feature/landing-zone-configurator"};
 assert.doesNotThrow(()=>assertApplyExecution(safety,backend));
 assert.throws(()=>assertApplyExecution(safety,{...backend,LZC_APPROVED_APPLY_ROOT:"bootstrap"}));
 assert.throws(()=>assertApplyExecution(safety,{...backend,LZC_ROOT:"platform",LZC_APPROVED_APPLY_ROOT:"platform"}));
});

test("platform apply is isolated from bootstrap workflow",()=>{
  const safety={mode:"github-actions-single-writer",concurrencyGroup:"configurator-lzc-dev-mutation"};
  const platform={...env,LZC_ROOT:"platform",GITHUB_ACTIONS:"true",GITHUB_REF:"refs/heads/feature/landing-zone-configurator",GITHUB_EVENT_NAME:"push",LZC_APPROVED_APPLY_COMMIT:env.GITHUB_SHA,LZC_APPROVED_APPLY_ROOT:"platform",GITHUB_WORKFLOW_REF:"stackitcloud/stackit-landing-zone/.github/workflows/configurator-platform.yml@refs/heads/feature/landing-zone-configurator"};
  assert.equal(deploymentInputs(platform).root,"platform");
  assert.doesNotThrow(()=>assertApplyExecution(safety,platform));
  assert.throws(()=>assertApplyExecution(safety,{...platform,GITHUB_WORKFLOW_REF:"stackitcloud/stackit-landing-zone/.github/workflows/configurator-bootstrap.yml@refs/heads/feature/landing-zone-configurator"}));
  assert.throws(()=>assertApplyExecution(safety,{...platform,LZC_APPROVED_APPLY_ROOT:"bootstrap"}));
});
