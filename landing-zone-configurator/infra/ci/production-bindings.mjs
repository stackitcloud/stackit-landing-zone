import { deploymentStage } from "./stages.mjs";

export const runtimeKeys = ["LZC_DATABASE_HOST", "LZC_DATABASE_PORT", "LZC_DATABASE_NAME", "LZC_DATABASE_USER", "LZC_DATABASE_PASSWORD", "LZC_SECRETS_ADDRESS", "LZC_SECRETS_INSTANCE_ID", "LZC_SECRETS_USERNAME", "LZC_SECRETS_PASSWORD", "LZC_MODEL_SERVING_TOKEN"];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function exact(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join() !== [...keys].sort().join()) throw new Error("Unexpected production binding fields");
}
function credential(value) {
  const c = value?.credentials ?? value;
  if (typeof c?.username !== "string" || !c.username || typeof c?.password !== "string" || !c.password) throw new Error("Missing space-scoped CF credentials");
  return { username: c.username, password: c.password };
}
export function productionBindings(platform, runtime, projectId) {
  const stage = deploymentStage("lzc-prod");
  const values = Object.fromEntries(runtimeKeys.map(key => [key, runtime.app_environment?.value?.[key]]));
  const app = platform.cf_runtime?.value, runner = platform.plan_runner_cf?.value;
  if (!app || !runner || runtime.runner_space?.value?.org_id !== runner.org_id || runtime.public_endpoint?.value?.origin !== stage.publicOrigin) throw new Error("Production output destinations do not match");
  const result = {
    schemaVersion: 1, environment: stage.name, projectId, origin: stage.publicOrigin,
    cf: {api_url:app.api_url, org_id:app.org_id, ...credential(runtime.release_credentials?.value)},
    runner: {api_url:runner.api_url, org_id:runner.org_id, ...credential(runtime.dispatcher_credentials?.value)},
    space: runtime.space?.value, runnerSpace: runtime.runner_space?.value,
    values, migration: platform.database_migration?.value,
  };
  // Never retain the organization-manager passwords or qualification token.
  validateProductionBindings(result, projectId);
  if (result.cf.username === app.username || result.runner.username === runner.username) throw new Error("Organization managers cannot be production deployers");
  return result;
}
export function validateProductionBindings(value, projectId) {
  exact(value, ["schemaVersion", "environment", "projectId", "origin", "cf", "runner", "space", "runnerSpace", "values", "migration"]);
  if (value.schemaVersion !== 1 || value.environment !== "lzc-prod" || !uuid.test(projectId ?? "") || value.projectId !== projectId || value.origin !== deploymentStage("lzc-prod").publicOrigin) throw new Error("Wrong production project or origin");
  for (const cf of [value.cf, value.runner]) {
    exact(cf, ["api_url", "org_id", "username", "password"]);
    if (cf.api_url !== "https://api.system.01.cf.eu01.stackit.cloud" || !uuid.test(cf.org_id)) throw new Error("Wrong production CF destination");
    credential(cf);
  }
  exact(value.space, ["id", "name"]);
  exact(value.runnerSpace, ["id", "name", "org_id"]);
  if (!uuid.test(value.space.id) || !uuid.test(value.runnerSpace.id) || value.space.name !== "configurator" || value.runnerSpace.name !== "plans" || value.runnerSpace.org_id !== value.runner.org_id || value.cf.org_id === value.runner.org_id || value.cf.username === value.runner.username || value.space.id === value.runnerSpace.id) throw new Error("Application and Runner isolation is missing");
  exact(value.values, runtimeKeys);
  if (!runtimeKeys.every(key => typeof value.values[key] === "string" && value.values[key])) throw new Error("Missing production runtime credentials");
  exact(value.migration, ["host", "port", "database", "username", "password"]);
  if (value.migration.host !== value.values.LZC_DATABASE_HOST || String(value.migration.port) !== value.values.LZC_DATABASE_PORT || value.migration.database !== "configurator" || value.migration.username !== "configurator_migration" || !value.migration.password) throw new Error("Wrong production migration destination");
  return value;
}
