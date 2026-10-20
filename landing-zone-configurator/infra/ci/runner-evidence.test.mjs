import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chmodSync,existsSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('./runner-evidence.mjs',import.meta.url));
const runPlan=fileURLToPath(new URL('../../deploy/runner/run-plan.sh',import.meta.url));
const packageRunner=fileURLToPath(new URL('../../deploy/runner/package.sh',import.meta.url));
test('emits only bounded timing values from this run, never raw log data',()=>{
 const secret='must-not-appear';
 const input=[`router GET /auth/github/callback?code=${secret}`,JSON.stringify({service:'plan-runner-isolation',runId:'11',ok:true,dispatchMilliseconds:1,completionMilliseconds:2}),`prefix ${JSON.stringify({service:'plan-runner-isolation',runId:'12',ok:true,dispatchMilliseconds:1234,completionMilliseconds:4321,token:secret})}`].join('\n');
 const result=spawnSync(process.execPath,[script,'12'],{input,encoding:'utf8'});
 assert.equal(result.status,0);assert.ok(!result.stdout.includes(secret));assert.ok(!result.stderr.includes(secret));
 assert.deepEqual(JSON.parse(result.stdout),{service:'plan-runner-isolation',runId:'12',ok:true,dispatchMilliseconds:1234,completionMilliseconds:4321});
 const invalid=spawnSync(process.execPath,[script,'13'],{input,encoding:'utf8'});assert.equal(invalid.status,1);assert.ok(!invalid.stdout.includes(secret));
});
test('requires warm handoff and replacement evidence when the manual release enables reserves',()=>{
 const value={service:'plan-runner-isolation',runId:'12',ok:true,dispatchMilliseconds:1234,completionMilliseconds:4321};
 const run=input=>spawnSync(process.execPath,[script,'12','1'],{input:JSON.stringify(input),encoding:'utf8'});
 assert.equal(run(value).status,1);
 const warm={readyWaitMilliseconds:12,dispatchMilliseconds:3,assignmentMilliseconds:500,replenishMilliseconds:20000};
 const valid=run({...value,warm:{...warm,secret:'must-not-appear'}});
 assert.equal(valid.status,0);
 assert.deepEqual(JSON.parse(valid.stdout).warm,warm);
 assert.ok(!valid.stdout.includes('must-not-appear'));
 assert.equal(run({...value,warm:{...warm,assignmentMilliseconds:-1}}).status,1);
 const workflow=readFileSync(fileURLToPath(new URL('../../../.github/workflows/configurator-release.yml',import.meta.url)),'utf8');
 assert.ok(workflow.includes('runner_pool_size:'));
 assert.ok(workflow.includes('LZC_RUNNER_POOL_SIZE: ${{ inputs.runner_pool_size }}'));
 assert.ok(workflow.includes('"${{ inputs.runner_pool_size }}"'));
});
test('rejects apply before invoking OpenTofu',()=>{
 const directory=mkdtempSync(join(tmpdir(),'lzc-run-plan-contract-'));
 const marker=join(directory,'tofu-called');
 try{
  const tofu=join(directory,'tofu');
  writeFileSync(tofu,'#!/bin/sh\n: > "$RUNNER_MARKER"\n');chmodSync(tofu,0o700);
  const result=spawnSync('/bin/bash',[runPlan,'apply'],{cwd:directory,encoding:'utf8',env:{PATH:directory,RUNNER_MARKER:marker}});
  assert.equal(result.status,1);assert.equal(existsSync(marker),false);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
test('removes initialized provider cache and rejects Terraform state from the package',()=>{
 const source=readFileSync(packageRunner,'utf8');
 assert.match(source,/"\$tofu_bin" -chdir="\$runner_dir\/accelerator" init -backend=false -input=false -lockfile=readonly/);
 assert.match(source,/rm -rf "\$runner_dir\/accelerator\/\.terraform"/);
 assert.match(source,/test ! -e "\$runner_dir\/accelerator\/terraform\.tfstate"/);
 assert.match(source,/test ! -e "\$runner_dir\/accelerator\/terraform\.auto\.tfvars"/);
 assert.ok(source.includes("-name '*.tfstate.*'"));
 assert.ok(source.includes("-name 'saved-plan.bin'"));
 assert.ok(source.includes("-name 'credential.json'"));
});

test('qualifies initial platform capabilities against source identity and lock before packaging',()=>{
 const source=readFileSync(packageRunner,'utf8');
 const qualification=source.indexOf('LZC_TEST_RUNNER_ROOT="$(cd "$runner_dir" && pwd)" bash scripts/test-initial-plan-contract.sh');
 assert.ok(qualification>source.indexOf('a52433c424472d6e618caa3a94579bbcd19b60b759d053cf0d5caf9ac6872888'));
 assert.ok(source.indexOf('prepare-firewall-image.mjs')<qualification);
 assert.ok(source.includes('firewallImageSha256:platformFirewallImage.sha256'));
 assert.ok(qualification<source.indexOf('tar -czf'));
 const native=readFileSync(fileURLToPath(new URL('../../app/scripts/test-initial-plan-contract.sh',import.meta.url)),'utf8');
 assert.ok(native.includes('platformRunnerSourceSchema.parse'));
 assert.ok(native.includes('git -C "$repo_dir" archive "$accelerator_commit"'));
 assert.ok(native.includes('cmp "$app_dir/../deploy/runner/accelerator.lock.hcl" "$runner_root/accelerator/.terraform.lock.hcl"'));
 assert.ok(native.includes('verify-initial-plan-contract.mjs'));
 assert.ok(native.includes('check-vault-bootstrap.mjs'));
 assert.ok(native.includes('check-firewall-image-plan.mjs'));
 assert.ok(native.includes('verify-runner-budget.mjs'));
 assert.ok(native.includes('LZC_FIREWALL_IMAGE_PACKAGE="$runner_root"'));
 assert.ok(native.includes('LZC_MIRROR_TEST_PACKAGE="$runner_root"'));
 assert.ok(native.includes('tests/runner-packaging.test.ts'));
 assert.ok(native.includes('|proves unpacked native provider checksums'));
 const mirrorPreparation=source.indexOf('prepare-provider-mirror.sh');
 assert.ok(mirrorPreparation>0&&mirrorPreparation<qualification);
 const contracts=readFileSync(fileURLToPath(new URL('../../app/packages/contracts/src/plan.ts',import.meta.url)),'utf8');
 const distribution=readFileSync(fileURLToPath(new URL('../../../.github/workflows/verify-deployment.yml',import.meta.url)),'utf8');
 for(const pin of ['https://opnsense.object.storage.eu01.onstackit.cloud/opnsense-26.1-amd64-21-05-2026.qcow2','5d0fb1cb4375eb258859cafc688f1e5e6f830f54f8d86b9e8bb815611bae1068']){
  assert.ok(contracts.includes(pin));assert.ok(distribution.includes(pin));
 }
});

test('verifies the staged runner image before migrating or replacing the web application',()=>{
 const workflow=readFileSync(fileURLToPath(new URL('../../../.github/workflows/configurator-release.yml',import.meta.url)),'utf8');
 const imageTask=workflow.indexOf('--name "image-$GITHUB_RUN_ID"');
 assert.ok(imageTask>workflow.indexOf('cf push --task -f deploy/runner/manifest.yml'));
 assert.ok(imageTask<workflow.indexOf('name: Stage isolated database migration task'));
 const command=workflow.slice(workflow.lastIndexOf('cf run-task',imageTask),imageTask);
 assert.ok(command.includes('import { platformFirewallImage }'));
 assert.ok(command.includes('accelerator/firewall-image.qcow2'));
 assert.ok(command.includes('sha256sum --check'));
 assert.ok(workflow.slice(imageTask,workflow.indexOf('\n',imageTask)).includes('-k 4096M --wait'));
});

test('qualification provider sockets stay independent of long checkout paths',()=>{
 const native=readFileSync(fileURLToPath(new URL('../../app/scripts/test-initial-plan-contract.sh',import.meta.url)),'utf8');
 assert.ok(native.includes('mktemp -d /tmp/lzc-ipc.XXXXXX'));
 assert.ok(native.includes('TMPDIR="$socket_dir"'));
 assert.ok(native.includes('trap \'rm -rf "$work_dir" "$socket_dir"\' EXIT'));
 for(const name of ['check-vault-bootstrap.mjs','check-firewall-image-plan.mjs']){
  const source=readFileSync(fileURLToPath(new URL(`../../app/scripts/${name}`,import.meta.url)),'utf8');
  assert.ok(source.includes('mkdtemp("/tmp/lzc-ipc-")'));
  assert.ok(source.includes('TMPDIR: sockets'));
  assert.ok(source.includes('rm(sockets, { recursive: true, force: true })'));
 }
});

test('explicit platform apply uses only a private saved plan and never a fresh plan',()=>{
 const directory=mkdtempSync(join(tmpdir(),'lzc-saved-plan-contract-'));
 const marker=join(directory,'tofu-called');
 try{
  const tofu=join(directory,'tofu');
  writeFileSync(tofu,'#!/bin/sh\nprintf "%s\\n" "$@" > "$RUNNER_MARKER"\nprintf "private-provider-output"\nprintf "private-provider-error" >&2\n');chmodSync(tofu,0o700);
  writeFileSync(join(directory,'saved-plan.bin'),'reviewed-artifact',{mode:0o600});
  const env={PATH:directory,RUNNER_MARKER:marker,TF_HTTP_ADDRESS:'https://broker/api/runner/state',TF_HTTP_LOCK_ADDRESS:'https://broker/api/runner/state/lock',TF_HTTP_UNLOCK_ADDRESS:'https://broker/api/runner/state/unlock',TF_HTTP_USERNAME:'runner',TF_HTTP_PASSWORD:'private-ticket',TF_HTTP_LOCK_METHOD:'POST',TF_HTTP_UNLOCK_METHOD:'POST'};
  for(const mode of ['initial-plan-only','platform-plan','forged']){
   const denied=spawnSync('/bin/bash',[runPlan,'applying',mode],{cwd:directory,encoding:'utf8',env});
   assert.equal(denied.status,1);assert.equal(existsSync(marker),false);
  }
  const result=spawnSync('/bin/bash',[runPlan,'applying','platform-apply'],{cwd:directory,encoding:'utf8',env});
  assert.equal(result.status,0);assert.equal(result.stdout,'');assert.equal(result.stderr,'');
  assert.deepEqual(readFileSync(marker,'utf8').trim().split('\n'),['apply','-input=false','-no-color','-parallelism=4','-lock-timeout=0s','saved-plan.bin']);
  assert.equal(readFileSync(join(directory,'apply.log'),'utf8'),'private-provider-outputprivate-provider-error');
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('platform apply rejects missing artifact or backend before invoking OpenTofu',()=>{
 const directory=mkdtempSync(join(tmpdir(),'lzc-missing-plan-contract-'));
 const marker=join(directory,'tofu-called');
 try{
  const tofu=join(directory,'tofu');writeFileSync(tofu,'#!/bin/sh\n: > "$RUNNER_MARKER"\n');chmodSync(tofu,0o700);
  for(const phase of ['applying','planning','initializing']){
   const result=spawnSync('/bin/bash',[runPlan,phase,'platform-apply'],{cwd:directory,encoding:'utf8',env:{PATH:directory,RUNNER_MARKER:marker}});
   assert.equal(result.status,1);assert.equal(existsSync(marker),false);
  }
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('native S3 init and exact apply use AWS env, while migration requires both backends and apply mode',()=>{
 const directory=mkdtempSync(join(tmpdir(),'lzc-s3-runner-contract-'));
 const marker=join(directory,'tofu-called');
 try{
  const tofu=join(directory,'tofu');
  writeFileSync(tofu,'#!/bin/sh\nprintf "%s\\n" "$@" > "$RUNNER_MARKER"\nprintf "private-aws-output"\n');chmodSync(tofu,0o700);
  writeFileSync(join(directory,'backend.tf.json'),JSON.stringify({terraform:{backend:{s3:{bucket:'fixture',key:'terraform.tfstate',region:'eu01',use_lockfile:true}}}}),{mode:0o600});
  writeFileSync(join(directory,'saved-plan.bin'),'reviewed-artifact',{mode:0o600});
  const env={PATH:directory,RUNNER_MARKER:marker,LZC_BACKEND_KIND:'s3',AWS_ACCESS_KEY_ID:'test-access-key',AWS_SECRET_ACCESS_KEY:'private-aws-secret',AWS_REGION:'eu01',AWS_DEFAULT_REGION:'eu01'};
  for(const mode of ['platform-plan','platform-apply']){
   const result=spawnSync('/bin/bash',[runPlan,'initializing',mode],{cwd:directory,encoding:'utf8',env});
   assert.equal(result.status,0);assert.equal(result.stdout,'');assert.equal(result.stderr,'');
   assert.deepEqual(readFileSync(marker,'utf8').trim().split('\n'),['init','-input=false','-no-color','-lockfile=readonly','-lock-timeout=0s']);
  }
  const applied=spawnSync('/bin/bash',[runPlan,'applying','platform-apply'],{cwd:directory,encoding:'utf8',env});
  assert.equal(applied.status,0);
  assert.deepEqual(readFileSync(marker,'utf8').trim().split('\n'),['apply','-input=false','-no-color','-parallelism=4','-lock-timeout=0s','saved-plan.bin']);
  const migrationEnv={...env,TF_HTTP_ADDRESS:'https://broker/api/runner/state',TF_HTTP_LOCK_ADDRESS:'https://broker/api/runner/state/lock',TF_HTTP_UNLOCK_ADDRESS:'https://broker/api/runner/state/unlock',TF_HTTP_USERNAME:'runner',TF_HTTP_PASSWORD:'private-ticket',TF_HTTP_LOCK_METHOD:'POST',TF_HTTP_UNLOCK_METHOD:'POST'};
  const migrated=spawnSync('/bin/bash',[runPlan,'migrating','platform-apply'],{cwd:directory,encoding:'utf8',env:migrationEnv});
  assert.equal(migrated.status,0);assert.equal(migrated.stdout,'');assert.equal(migrated.stderr,'');
  assert.deepEqual(readFileSync(marker,'utf8').trim().split('\n'),['init','-migrate-state','-force-copy','-input=false','-no-color','-lockfile=readonly']);
  const deniedCases=[
   ['migrating','platform-plan',migrationEnv],
   ['migrating','initial-plan-only',migrationEnv],
   ['migrating','platform-apply',env],
   ['initializing','platform-plan',migrationEnv],
   ['applying','platform-apply',{...env,AWS_SECRET_ACCESS_KEY:''}],
   ['initializing','platform-plan',{...env,AWS_REGION:'other'}],
   ['initializing','platform-plan',{...env,LZC_BACKEND_KIND:'forged'}],
  ];
  for(const [phase,mode,caseEnv] of deniedCases){
   rmSync(marker,{force:true});
   const result=spawnSync('/bin/bash',[runPlan,phase,mode],{cwd:directory,encoding:'utf8',env:caseEnv});
   assert.equal(result.status,1);assert.equal(existsSync(marker),false);
   assert.equal(result.stdout,'');assert.equal(result.stderr,'');
  }
 }finally{rmSync(directory,{recursive:true,force:true});}
});
