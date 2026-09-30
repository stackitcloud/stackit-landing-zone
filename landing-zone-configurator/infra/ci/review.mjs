// Bind a saved, encrypted plan to this workflow run. Does not execute OpenTofu.
import { readFileSync, writeFileSync, readdirSync, appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deploymentInputs, digest, planContext, assertApplyExecution } from "./context.mjs";
import { isApplicablePlan } from "../plan-guard.mjs";
const infra = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [command] = process.argv.slice(2);
if (!["seal", "verify"].includes(command)) throw new Error("Usage: review.mjs seal|verify");
const inputs = deploymentInputs(process.env);
if (command === "verify") assertApplyExecution(JSON.parse(readFileSync(resolve(infra,"ci/backend-safety.json"))), process.env);
const pieces = [];
for (const root of ["bootstrap", "backend", "platform"]) {
  for (const file of readdirSync(resolve(infra,root)).filter(f => f.endsWith(".tf") || f === ".terraform.lock.hcl").sort()) {
    pieces.push(`${root}/${file}:${digest(readFileSync(resolve(infra,root,file)))}`);
  }
}
if (inputs.root === "platform") pieces.push(digest(readFileSync(resolve(infra,"environments/lzc-dev.tfvars.json"))));
const contextHash = planContext(inputs, digest(pieces.join("\n")));
const plan = process.env.LZC_PLAN ?? resolve(infra,"../.local/ci-plan/review.tfplan");
const manifest = resolve(dirname(plan),"review.json");
const bytes = readFileSync(plan), planHash = digest(bytes);
const envelope = JSON.parse(bytes);
if (!envelope.encrypted_data || !envelope.encryption_version) throw new Error("Refusing an unencrypted plan artifact");
if (command === "seal") {
  writeFileSync(manifest, JSON.stringify({ status: "ready", contextHash, planHash, createdAt: new Date().toISOString(), ...inputs }, null, 2), { mode: 0o600 });
  const summary = `## OpenTofu ${inputs.root}\nCommit: ${inputs.commit}\nPlan SHA-256: ${planHash}\n\nFull resource diff: see the OpenTofu plan step in this job.\n`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
} else {
  const review = JSON.parse(readFileSync(manifest));
  if (!isApplicablePlan(review, contextHash, planHash)) throw new Error("Plan mismatch or expiry; start a fresh workflow run");
  writeFileSync(manifest, JSON.stringify({ ...review, status: "consumed" }), { mode: 0o600 });
  console.log(`Verified saved ${inputs.root} plan for this commit and run.`);
}
