import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";

test("saved typed inputs apply unchanged without external TF_VAR values",()=>{
 const directory=mkdtempSync(join(tmpdir(),"lzc-saved-plan-env-"));
 const tofu=process.env.LZC_TEST_TOFU_BIN??"tofu";
 const environment={...process.env,TF_VAR_production:"true",TF_VAR_replicas:"3",TF_VAR_sources:'["192.0.2.0/24"]',TF_INPUT:"0",TF_ENCRYPTION:"{}",TF_DATA_DIR:join(directory,"data")};
 try{
  writeFileSync(join(directory,"main.tf"),'variable "production" { type = bool }\nvariable "replicas" { type = number }\nvariable "sources" { type = list(string) }\noutput "selected" { value = {production=var.production, replicas=var.replicas, sources=var.sources} }\n');
  writeFileSync(join(directory,"prod.tfvars.json"),JSON.stringify({production:true,replicas:3,sources:["192.0.2.0/24"]}));
  const plan=spawnSync(tofu,[`-chdir=${directory}`,"plan","-input=false","-no-color","-var-file=prod.tfvars.json","-out=review.tfplan"],{env:environment,encoding:"utf8"});
  assert.equal(plan.status,0,plan.stderr||plan.error?.message);
  const unsafe=spawnSync(tofu,[`-chdir=${directory}`,"apply","-input=false","-no-color","review.tfplan"],{env:environment,encoding:"utf8"});
  assert.notEqual(unsafe.status,0);
  assert.match(unsafe.stderr,/Mismatch between input and plan variable value/);
  const shell='source "$1"\n[[ -z "${TF_VAR_production+x}" && -z "${TF_VAR_replicas+x}" && -z "${TF_VAR_sources+x}" ]]\n[[ "$AWS_SECRET_ACCESS_KEY" = "synthetic-only" && "$TF_ENCRYPTION" = "{}" ]]\n"$2" -chdir="$3" apply -input=false -no-color review.tfplan';
  const safe=spawnSync("bash",["-euc",shell,"lzc-apply-test",new URL("./apply-env.sh",import.meta.url).pathname,tofu,directory],{env:{...environment,AWS_SECRET_ACCESS_KEY:"synthetic-only"},encoding:"utf8"});
  assert.equal(safe.status,0,safe.stderr);
  const state=JSON.parse(readFileSync(join(directory,"terraform.tfstate"),"utf8"));
  assert.deepEqual(state.outputs.selected.value,{production:true,replicas:3,sources:["192.0.2.0/24"]});
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test("every infrastructure apply isolates saved inputs after plan approval",()=>{
 for(const workflow of ["configurator-bootstrap.yml","configurator-platform.yml","configurator-runtime.yml"]){
  const source=readFileSync(new URL(`../../../.github/workflows/${workflow}`,import.meta.url),"utf8");
  const step=source.split("      - name: OpenTofu apply reviewed plan")[1]?.split("      - name:")[0];
  assert.ok(step,workflow);
  assert.match(step,/source infra\/ci\/apply-env\.sh/);
  assert.ok(step.indexOf("source infra/ci/apply-env.sh")<step.indexOf('tofu -chdir="infra/$LZC_ROOT" apply'),workflow);
  assert.ok(source.indexOf("review.mjs verify")<source.indexOf("source infra/ci/apply-env.sh"),workflow);
 }
});
