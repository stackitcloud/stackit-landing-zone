// Embedded into both deployment workflows so rollback of an older application
// still preserves the current operator policy. Regenerate with embed-runtime-features.mjs.
import { readFileSync, writeFileSync, lstatSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const featureKeys = ["LZC_RETIREMENTS_ENABLED", "LZC_ASSISTANT_ENABLED", "LZC_MAILOUT_ENABLED"];
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
function boolean(value) {
  if (value !== "true" && value !== "false") throw new Error("Runtime feature values must be true or false");
  return value;
}
function projectIds(value) {
  const ids = JSON.parse(value ?? "[]");
  if (!Array.isArray(ids) || ids.length > 32 || ids.some(id => typeof id !== "string" || !uuid.test(id)))
    throw new Error("Invalid retirement control projects");
  return ids;
}
export function featureVariables(requested, current, operatorProjectId) {
  if (!uuid.test(operatorProjectId ?? "")) throw new Error("Runtime feature policy requires the operator project ID");
  const result = { ...requested };
  for (const key of featureKeys) result[key] = boolean(Object.hasOwn(current, key) ? current[key] : requested[key] ?? "false");
  if (result.LZC_ASSISTANT_ENABLED === "true" && (result.LZC_AUTH_ENABLED !== "true" || !result.LZC_MODEL_SERVING_TOKEN))
    throw new Error("Assistant runtime prerequisites unavailable");
  if (result.LZC_MAILOUT_ENABLED === "true" && ["LZC_MAILOUT_HOST", "LZC_MAILOUT_PORT", "LZC_MAILOUT_USERNAME", "LZC_MAILOUT_PASSWORD", "LZC_MAILOUT_FROM", "LZC_DEPLOYMENT_ARTIFACT_KEY"].some(key => !result[key]))
    throw new Error("MailOut runtime prerequisites unavailable");
  if (result.LZC_RETIREMENTS_ENABLED === "true" && (result.LZC_EXECUTION_ENABLED !== "true" || result.LZC_APPLICATION_EXECUTION_ENABLED !== "true" || !result.LZC_DEPLOYMENT_ARTIFACT_KEY))
    throw new Error("Retirement runtime prerequisites unavailable");
  const controls = [...new Set([operatorProjectId, ...projectIds(requested.LZC_RETIREMENT_CONTROL_PROJECT_IDS), ...projectIds(current.LZC_RETIREMENT_CONTROL_PROJECT_IDS)])];
  if (controls.length > 32) throw new Error("Too many retirement control projects");
  result.LZC_RETIREMENT_CONTROL_PROJECT_IDS = JSON.stringify(controls);
  return result;
}
export function preserveRuntimeFeatures({ directory, spaceId, operatorProjectId, cf }) {
  if (!uuid.test(spaceId ?? "")) throw new Error("Invalid runtime feature target space");
  const appFile = join(directory, "app-vars.json"), stageFile = join(directory, "app-stage-vars.json");
  for (const file of [appFile, stageFile]) {
    const stat = lstatSync(file);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid()) throw new Error("Private feature variable files required");
  }
  const requested = JSON.parse(readFileSync(appFile, "utf8"));
  const stage = JSON.parse(readFileSync(stageFile, "utf8"));
  const apps = cf(["curl", `/v3/apps?names=landing-zone-configurator&space_guids=${spaceId}`]);
  if (!Array.isArray(apps.resources) || apps.resources.length > 1 || (apps.pagination?.total_results ?? apps.resources.length) !== apps.resources.length)
    throw new Error("Runtime feature application lookup failed");
  let current = {};
  if (apps.resources.length) {
    const app = apps.resources[0];
    if (app.name !== "landing-zone-configurator" || !uuid.test(app.guid) || app.relationships?.space?.data?.guid !== spaceId) throw new Error("Runtime feature application target mismatch");
    current = cf(["curl", `/v3/apps/${app.guid}/environment_variables`]).var;
    if (!current || typeof current !== "object" || Array.isArray(current)) throw new Error("Runtime feature environment lookup failed");
  }
  const active = featureVariables(requested, current, operatorProjectId);
  // Preserve only explicit feature choices and protected project IDs. Secrets,
  // origins, authentication and execution permissions always use the reviewed release.
  const suspended = { ...stage, LZC_EXECUTION_ENABLED: "false", LZC_APPLICATION_EXECUTION_ENABLED: "false", LZC_RUNNER_POOL_SIZE: "0" };
  for (const key of featureKeys) suspended[key] = "false";
  writeFileSync(appFile, JSON.stringify(active), { mode: 0o600 });
  writeFileSync(stageFile, JSON.stringify(suspended), { mode: 0o600 });
  return Object.fromEntries(featureKeys.map(key => [key, active[key]]));
}
if (process.argv[1] === "-" || (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)) {
  try {
    const flags = preserveRuntimeFeatures({ directory: process.env.LZC_PRIVATE, spaceId: process.env.LZC_CF_SPACE_ID, operatorProjectId: process.env.LZC_FEATURE_OPERATOR_PROJECT_ID, cf(args) {
      const result = spawnSync("cf", args, { encoding: "utf8", timeout: 45_000, maxBuffer: 4 * 1024 * 1024 });
      if (result.status !== 0) throw new Error("CF feature lookup failed");
      return JSON.parse(result.stdout);
    } });
    console.log(JSON.stringify({ event: "runtime_features_preserved", flags }));
  } catch {
    // CF responses and private variable files can contain credentials. Never log them.
    console.error("Runtime feature policy could not be verified; deployment stopped before staging.");
    process.exitCode = 1;
  }
}
