import { createHash } from "node:crypto";
export const digest = (value) => createHash("sha256").update(value).digest("hex");
export function deploymentInputs(env) {
  const required = (name) => {
    if (!env[name]?.trim()) throw new Error(`Missing ${name}`);
    return env[name].trim();
  };
  if (required("GITHUB_REPOSITORY") !== "stackitcloud/stackit-landing-zone") throw new Error("Unexpected repository");
  const root = required("LZC_ROOT");
  if (!["bootstrap", "backend"].includes(root)) throw new Error("Unsupported CI root");
  if (required("LZC_ENVIRONMENT") !== "lzc-dev") throw new Error("Unsupported environment");
  if (required("GITHUB_REF") !== "refs/heads/main") throw new Error("Deployment requires main");
  if (required("GITHUB_EVENT_NAME") !== "workflow_dispatch") throw new Error("Deployment requires manual dispatch");
  if (required("GITHUB_RUN_ATTEMPT") !== "1") throw new Error("Start a new workflow run instead of retrying a previous plan");
  const commit = required("GITHUB_SHA");
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Invalid commit");
  const project = required("LZC_PROJECT_ID");
  if (!/^[a-f0-9-]{36}$/.test(project)) throw new Error("Invalid project ID");
  const region = required("LZC_REGION");
  if (region !== "eu01") throw new Error("Unexpected region");
  const prefix = required("LZC_NAME_PREFIX");
  if (prefix !== "lzc-dev") throw new Error("Unexpected prefix");
  const bucket = required("LZC_MANAGEMENT_BUCKET");
  if (bucket !== `${prefix}-management-${project.slice(0,8)}`) throw new Error("Management bucket does not match project");
  const expiration = required("LZC_CREDENTIAL_EXPIRATION");
  if (!Number.isFinite(Date.parse(expiration))) throw new Error("Invalid expiration");
  return { root, environment:"lzc-dev", project, region, prefix, bucket, expiration,
    commit, repository:required("GITHUB_REPOSITORY"), run:required("GITHUB_RUN_ID"), attempt:"1" };
}
export function planContext(inputs, sourceDigest) {
  return digest(JSON.stringify({ inputs, sourceDigest }));
}

export function assertApplyExecution(safety, env) {
  if (safety.mode !== "github-actions-single-writer" ||
      safety.concurrencyGroup !== "configurator-lzc-dev-mutation") {
    throw new Error("Apply requires the approved single-writer configuration");
  }
  if (env.GITHUB_ACTIONS !== "true" ||
      env.GITHUB_WORKFLOW_REF !== "stackitcloud/stackit-landing-zone/.github/workflows/configurator-bootstrap.yml@refs/heads/main") {
    throw new Error("Remote apply is restricted to the serialized GitHub Actions workflow");
  }
}
