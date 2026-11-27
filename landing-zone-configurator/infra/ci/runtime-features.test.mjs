import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { featureVariables, preserveRuntimeFeatures, featureKeys } from "./runtime-features.mjs";
const project = "11111111-1111-4111-8111-111111111111", space = "22222222-2222-4222-8222-222222222222", app = "33333333-3333-4333-8333-333333333333";
const requested = {
  LZC_RETIREMENTS_ENABLED: "false", LZC_ASSISTANT_ENABLED: "true", LZC_MAILOUT_ENABLED: "true",
  LZC_AUTH_ENABLED: "true", LZC_EXECUTION_ENABLED: "true", LZC_APPLICATION_EXECUTION_ENABLED: "true",
  LZC_MODEL_SERVING_TOKEN: "new-model-secret", LZC_DEPLOYMENT_ARTIFACT_KEY: "new-artifact-secret",
  LZC_DATABASE_PASSWORD: "new-database-secret", LZC_PUBLIC_ORIGIN: "https://new.example.test",
  LZC_MAILOUT_HOST: "smtp.example.test", LZC_MAILOUT_PORT: "587", LZC_MAILOUT_USERNAME: "new-smtp-user", LZC_MAILOUT_PASSWORD: "new-smtp-secret", LZC_MAILOUT_FROM: "notifications@example.test",
  LZC_RETIREMENT_CONTROL_PROJECT_IDS: "[]",
};
test("retains both enabled and disabled operator flags but never inherits old credentials, origin or authorization", () => {
  const other = "44444444-4444-4444-8444-444444444444";
  const active = featureVariables(requested, {
    LZC_RETIREMENTS_ENABLED: "true", LZC_ASSISTANT_ENABLED: "false", LZC_MAILOUT_ENABLED: "false",
    LZC_RETIREMENT_CONTROL_PROJECT_IDS: JSON.stringify([other]),
    LZC_AUTH_ENABLED: "false", LZC_EXECUTION_ENABLED: "false", LZC_DATABASE_PASSWORD: "old-secret", LZC_PUBLIC_ORIGIN: "https://old.example.test",
  }, project);
  assert.equal(active.LZC_RETIREMENTS_ENABLED, "true");
  assert.equal(active.LZC_ASSISTANT_ENABLED, "false");
  assert.equal(active.LZC_MAILOUT_ENABLED, "false");
  for (const key of ["LZC_AUTH_ENABLED", "LZC_EXECUTION_ENABLED", "LZC_DATABASE_PASSWORD", "LZC_PUBLIC_ORIGIN"]) assert.equal(active[key], requested[key]);
  assert.deepEqual(JSON.parse(active.LZC_RETIREMENT_CONTROL_PROJECT_IDS), [project, other]);
});
test("bootstrap uses explicit defaults and preconfigures self-protection even while retirement is off", () => {
  const active = featureVariables(requested, {}, project);
  for (const key of featureKeys) assert.equal(active[key], requested[key]);
  assert.deepEqual(JSON.parse(active.LZC_RETIREMENT_CONTROL_PROJECT_IDS), [project]);
});
test("rejects invalid operator values or missing feature prerequisites before modifying deployment configuration", () => {
  for (const key of featureKeys) for (const value of ["TRUE", "", null, true]) assert.throws(() => featureVariables(requested, { [key]: value }, project));
  assert.throws(() => featureVariables(requested, {}, undefined));
  assert.throws(() => featureVariables({ ...requested, LZC_EXECUTION_ENABLED: "false" }, { LZC_RETIREMENTS_ENABLED: "true" }, project));
  assert.throws(() => featureVariables({ ...requested, LZC_AUTH_ENABLED: "false" }, {}, project));
  assert.throws(() => featureVariables({ ...requested, LZC_MAILOUT_PASSWORD: "" }, {}, project));
  assert.throws(() => featureVariables(requested, { LZC_RETIREMENT_CONTROL_PROJECT_IDS: '["not-a-project"]' }, project));
});
function fixture(work) {
  const directory = mkdtempSync(join(tmpdir(), "lzc-features-"));
  try {
    writeFileSync(join(directory, "app-vars.json"), JSON.stringify(requested), { mode: 0o600 });
    writeFileSync(join(directory, "app-stage-vars.json"), JSON.stringify({ ...requested, LZC_RUNNER_POOL_SIZE: "2" }), { mode: 0o600 });
    work(directory);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
test("captures only the target app before staging, suspends features during staging and preserves its private final settings", () => fixture(directory => {
  const calls = [];
  const flags = preserveRuntimeFeatures({ directory, spaceId: space, operatorProjectId: project, cf(args) {
    calls.push(args);
    return calls.length === 1 ? { resources: [{ guid: app, name: "landing-zone-configurator", relationships: { space: { data: { guid: space } } } }] } : { var: { LZC_RETIREMENTS_ENABLED: "true", LZC_ASSISTANT_ENABLED: "false", LZC_MAILOUT_ENABLED: "false", LZC_DATABASE_PASSWORD: "old-secret-must-not-copy" } };
  } });
  assert.equal(flags.LZC_RETIREMENTS_ENABLED, "true");
  assert.ok(calls[0][1].includes(`space_guids=${space}`));
  assert.equal(calls[1][1], `/v3/apps/${app}/environment_variables`);
  const active = JSON.parse(readFileSync(join(directory, "app-vars.json")));
  const stage = JSON.parse(readFileSync(join(directory, "app-stage-vars.json")));
  assert.equal(active.LZC_DATABASE_PASSWORD, "new-database-secret");
  for (const key of [...featureKeys, "LZC_EXECUTION_ENABLED", "LZC_APPLICATION_EXECUTION_ENABLED"]) assert.equal(stage[key], "false");
  assert.equal(stage.LZC_RUNNER_POOL_SIZE, "0");
  for (const name of ["app-vars.json", "app-stage-vars.json"]) assert.equal(statSync(join(directory, name)).mode & 0o077, 0);
}));
test("fails closed on ambiguous apps, wrong space or failed CF lookup without rewriting private files", () => {
  for (const response of [{ errors: [] }, { resources: [{}, {}] }, { resources: [{ guid: app, name: "landing-zone-configurator", relationships: { space: { data: { guid: project } } } }] }]) fixture(directory => {
    const before = readFileSync(join(directory, "app-vars.json"), "utf8");
    assert.throws(() => preserveRuntimeFeatures({ directory, spaceId: space, operatorProjectId: project, cf: () => response }));
    assert.equal(readFileSync(join(directory, "app-vars.json"), "utf8"), before);
  });
});
test("both workflows embed the reviewed helper, including legacy release redeployment, before any staging lane", () => {
  const source = readFileSync(new URL("./runtime-features.mjs", import.meta.url), "utf8").trimEnd();
  for (const name of ["configurator-release.yml", "configurator-production.yml"]) {
    const workflow = readFileSync(new URL(`../../../.github/workflows/${name}`, import.meta.url), "utf8");
    const embedded = workflow.split("node --input-type=module <<'LZC_RUNTIME_FEATURES'\n")[1]?.split("\n          LZC_RUNTIME_FEATURES")[0]?.split("\n").map(line => line.slice(10)).join("\n");
    assert.equal(embedded, source);
    assert.ok(workflow.indexOf("# END GENERATED RUNTIME FEATURE POLICY") < workflow.indexOf("- name: Stage runner, migration and application"));
    assert.match(workflow, /LZC_FEATURE_OPERATOR_PROJECT_ID: \$\{\{ vars.LZC_PROJECT_ID \}\}/);
  }
});
test("CLI does not expose CF or variable-file secrets on errors", () => fixture(directory => {
  writeFileSync(join(directory, "cf"), '#!/bin/sh\nprintf \'{"errors":[{"detail":"PRIVATE_RUNTIME_SECRET"}]}\'\n', { mode: 0o700 });
  const result = spawnSync(process.execPath, [new URL("./runtime-features.mjs", import.meta.url).pathname], { encoding: "utf8", env: { ...process.env, PATH: `${directory}:/usr/bin:/bin`, LZC_PRIVATE: directory, LZC_CF_SPACE_ID: space, LZC_FEATURE_OPERATOR_PROJECT_ID: project } });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_RUNTIME_SECRET|new-database-secret|new-model-secret/);
  assert.match(result.stderr, /deployment stopped before staging/);
}));
