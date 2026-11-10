import { createHash } from "node:crypto";
import { deploymentStage } from "./stages.mjs";
export const digest = (value) => createHash("sha256").update(value).digest("hex");
export function deploymentInputs(env) {
  const required = (name) => {
    if (!env[name]?.trim()) throw new Error(`Missing ${name}`);
    return env[name].trim();
  };
  if (required("GITHUB_REPOSITORY") !== "stackitcloud/stackit-landing-zone") throw new Error("Unexpected repository");
  const root = required("LZC_ROOT");
  if (!["bootstrap", "backend", "platform", "runtime"].includes(root)) throw new Error("Unsupported CI root");
  const stage = deploymentStage(required("LZC_ENVIRONMENT"));
  const ref = required("GITHUB_REF");
  const event = required("GITHUB_EVENT_NAME");
  const manualMain = ref === "refs/heads/main" && event === "workflow_dispatch";
  if (!manualMain) throw new Error("Unsupported deployment trigger or branch");
  if (required("GITHUB_RUN_ATTEMPT") !== "1") throw new Error("Start a new workflow run instead of retrying a previous plan");
  const commit = required("GITHUB_SHA");
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Invalid commit");
  const project = required("LZC_PROJECT_ID");
  if (!/^[a-f0-9-]{36}$/.test(project)) throw new Error("Invalid project ID");
  const region = required("LZC_REGION");
  if (region !== stage.region) throw new Error("Unexpected region");
  const prefix = required("LZC_NAME_PREFIX");
  if (prefix !== stage.prefix) throw new Error("Unexpected prefix");
  const bucket = required("LZC_MANAGEMENT_BUCKET");
  if (bucket !== `${prefix}-management-${project.slice(0,8)}`) throw new Error("Management bucket does not match project");
  const expiration = required("LZC_CREDENTIAL_EXPIRATION");
  if (!Number.isFinite(Date.parse(expiration))) throw new Error("Invalid expiration");
  const parameters = {};
  if (stage.name === "lzc-prod" && root === "platform") {
    for (const name of ["LZC_CF_PLATFORM_ID", "LZC_CF_QUOTA_ID"]) {
      const id = required(name);
      if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid platform catalogue selection");
      parameters[name] = id;
    }
  }
  if (stage.name === "lzc-prod" && root === "runtime") {
    const contact = required("LZC_OPERATOR_OWNER_EMAIL");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) throw new Error("Invalid operator contact");
    Object.assign(parameters, {publicDomain: stage.route, dnsZone: stage.zone, contact});
  }
  return { root, environment:stage.name, project, region, prefix, bucket, expiration, parameters,
    commit, ref, event, repository:required("GITHUB_REPOSITORY"), run:required("GITHUB_RUN_ID"), attempt:"1" };
}
export function planContext(inputs, sourceDigest) {
  return digest(JSON.stringify({ inputs, sourceDigest }));
}

export function assertApplyExecution(safety, env) {
  const stage = deploymentStage(env.LZC_ENVIRONMENT ?? "lzc-dev");
  if (safety.mode !== "github-actions-single-writer" ||
      safety.concurrencyGroup !== stage.mutationGroup ||
      (safety.environment !== undefined && safety.environment !== stage.name)) {
    throw new Error("Apply requires the approved single-writer configuration");
  }
  const main = env.GITHUB_REF === "refs/heads/main" && env.GITHUB_EVENT_NAME === "workflow_dispatch";
  const workflowName = env.LZC_ROOT === "runtime" ? "configurator-runtime.yml" : env.LZC_ROOT === "platform" ? "configurator-platform.yml" : "configurator-bootstrap.yml";
  const workflow = `stackitcloud/stackit-landing-zone/.github/workflows/${workflowName}@${env.GITHUB_REF}`;
  if (env.GITHUB_ACTIONS !== "true" || !main || env.GITHUB_WORKFLOW_REF !== workflow) {
    throw new Error("Remote apply is restricted to the serialized GitHub Actions workflow");
  }
}
