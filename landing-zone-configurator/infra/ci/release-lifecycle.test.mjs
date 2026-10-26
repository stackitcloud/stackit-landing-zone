import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { copyTree, packageMigration } from "./package-migration.mjs";

const root = resolve(import.meta.dirname, "../..");
const parallel = join(import.meta.dirname, "run-parallel.mjs");
const env = { ...process.env, PATH: `${resolve(process.execPath, "..")}:/usr/bin:/bin` };

test("parallel lanes overlap and any failed lane prevents continuation", () => {
  const dir = mkdtempSync(join(tmpdir(), "lzc-parallel-"));
  try {
    const a = `touch '${dir}/a'; for i in {1..100}; do [ ! -f '${dir}/b' ] || exit 0; sleep .02; done; exit 1`;
    const b = `touch '${dir}/b'; for i in {1..100}; do [ ! -f '${dir}/a' ] || exit 0; sleep .02; done; exit 1`;
    assert.equal(spawnSync(process.execPath, [parallel, "a", a, "b", b], { env }).status, 0);
    const failure = spawnSync(process.execPath, [parallel, "failed", "sleep .05; exit 7", "slow", `trap "touch '${dir}/cleanup'" EXIT; sleep 10; touch '${dir}/unsafe'`], { env, timeout: 8000 });
    assert.equal(failure.status, 1);
    assert.equal(existsSync(join(dir, "unsafe")), false);
    assert.equal(existsSync(join(dir, "cleanup")), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("migration bundle preserves SQL and executable imports but excludes inspection, web and unrelated API dependencies", () => {
  const dir = mkdtempSync(join(tmpdir(), "lzc-migration-"));
  const source = join(dir, "release"), destination = join(dir, "migration");
  try {
    mkdirSync(source);
    writeFileSync(join(source, "package.json"), '{"type":"module"}');
    for (const file of ["migrate.js", "storage/database.js", "storage/migrations.js", "connectivity.js"]) {
      const target = join(source, "apps/api/dist", file);
      mkdirSync(resolve(target, ".."), { recursive: true });
      cpSync(join(root, "app/apps/api/dist", file), target);
    }
    cpSync(join(root, "app/apps/api/db"), join(source, "apps/api/db"), { recursive: true });
    mkdirSync(join(source, "runtime/bin"), { recursive: true });
    cpSync(process.execPath, join(source, "runtime/bin/node"));
    writeFileSync(join(source, "runtime/LICENSE"), "fixture Node license");
    // Install exactly the existing pg closure into the fixture, with no resolution/network.
    const modules = join(root, "app/node_modules");
    const todo = ["pg"], copied = new Set();
    while (todo.length) {
      const name = todo.pop();
      if (copied.has(name)) continue;
      copied.add(name);
      const module = join(modules, name);
      const meta = JSON.parse(readFileSync(join(module, "package.json")));
      copyTree(module, join(source, "node_modules", name));
      todo.push(...Object.keys(meta.dependencies ?? {}));
      for (const dep of Object.keys(meta.optionalDependencies ?? {})) if (existsSync(join(modules, dep))) todo.push(dep);
    }
    mkdirSync(join(source, "inspection"));
    writeFileSync(join(source, "inspection/private-sentinel"), "must not copy");
    const copiedNames = packageMigration(source, destination);
    assert.ok(copiedNames.includes("pg"));
    assert.equal(copiedNames.includes("@aws-sdk/client-s3"), false);
    assert.equal(existsSync(join(destination, "inspection")), false);
    assert.equal(existsSync(join(destination, "public")), false);
    for (const file of readdirSync(join(source, "apps/api/db")))
      assert.deepEqual(readFileSync(join(destination, "apps/api/db", file)), readFileSync(join(source, "apps/api/db", file)));
    const smoke = spawnSync(join(destination, "runtime/bin/node"), ["--input-type=module", "-e", "await import('./apps/api/dist/storage/migrations.js'); await import('./apps/api/dist/storage/database.js');"], { cwd: destination, encoding: "utf8" });
    assert.equal(smoke.status, 0, smoke.stderr);
    assert.ok(statSync(join(destination, "runtime/bin/node")).mode & 0o100);
    assert.throws(() => packageMigration(source, destination), /already exists/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("activation rejects a mismatched droplet before manifest mutation or restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "lzc-activation-"));
  try {
    const id = "11111111-2222-4333-8444-555555555555";
    writeFileSync(join(dir, "app-stage.json"), JSON.stringify({ app: id, package: id, build: id, droplet: id }));
    writeFileSync(join(dir, "cf"), `#!/bin/bash\nif [ "$1" != curl ]; then touch '${dir}/unsafe'; exit 0; fi\nprintf '%s' '{"name":"wrong-app"}'\n`, { mode: 0o700 });
    const result = spawnSync(process.execPath, [join(import.meta.dirname, "activate-release.mjs")], { env: { ...env, PATH: `${dir}:${env.PATH}`, LZC_PRIVATE: dir }, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(join(dir, "unsafe")), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("workflow activation is downstream of all staging lanes, while browser success gates artifact creation", () => {
  const workflow = readFileSync(join(root, "../.github/workflows/configurator-release.yml"), "utf8");
  const app = readFileSync(join(import.meta.dirname, "stage-release-application.sh"), "utf8");
  assert.match(app, /cf push --no-start/);
  assert.match(app, /cf stage-package .*--package-guid/);
  assert.doesNotMatch(app, /^cf (?:start|restart|set-droplet)/m);
  assert.ok(workflow.indexOf("stage-release-migration.sh") < workflow.indexOf("run: node infra/ci/activate-release.mjs"));
  assert.ok(workflow.indexOf("run-parallel.mjs browser") < workflow.indexOf("release-artifact.mjs create"));
  assert.match(readFileSync(join(import.meta.dirname, "prepare-release.mjs"), "utf8"), /app-stage-vars.json.*LZC_EXECUTION_ENABLED:"false".*LZC_APPLICATION_EXECUTION_ENABLED:"false".*LZC_RUNNER_POOL_SIZE:"0"/);
  assert.match(readFileSync(join(import.meta.dirname, "stage-release-runner.sh"), "utf8"), /CF_HOME="\$LZC_PRIVATE\/cf-runner"/);
  assert.match(readFileSync(join(import.meta.dirname, "stage-release-migration.sh"), "utf8"), /CF_HOME="\$LZC_PRIVATE\/cf-migration"/);
});

test("successful activation applies final variables then assigns only the verified droplet before start", () => {
  const dir = mkdtempSync(join(tmpdir(), "lzc-activation-success-"));
  try {
    const id = "11111111-2222-4333-8444-555555555555";
    writeFileSync(join(dir, "app-stage.json"), JSON.stringify({ app: id, package: id, build: id, droplet: id }));
    const replies = {
      [`/v3/apps/${id}`]: { name: "landing-zone-configurator", relationships: { space: { data: { guid: id } } } },
      [`/v3/builds/${id}`]: { state: "STAGED", package: { guid: id }, droplet: { guid: id } },
      [`/v3/droplets/${id}`]: { state: "STAGED", relationships: { app: { data: { guid: id } } } },
    };
    writeFileSync(join(dir, "cf"), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(join(dir, "calls"))}, JSON.stringify(args)+'\\n');
if (args[0] === 'curl') console.log(JSON.stringify(${JSON.stringify(replies)}[args[1]]));
`, { mode: 0o700 });
    const result = spawnSync(process.execPath, [join(import.meta.dirname, "activate-release.mjs")], { env: { ...env, PATH: `${dir}:${env.PATH}`, LZC_PRIVATE: dir, LZC_CF_SPACE_ID: id }, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const calls = readFileSync(join(dir, "calls"), "utf8").trim().split("\n").map(JSON.parse);
    assert.deepEqual(calls.map(x => x[0]), ["curl", "curl", "curl", "apply-manifest", "stop", "set-droplet", "start"]);
    assert.deepEqual(calls[5], ["set-droplet", "landing-zone-configurator", id]);
    assert.ok(calls[3].includes(join(dir, "app-vars.json")));
    assert.ok(calls[3].includes("--redact-env"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
