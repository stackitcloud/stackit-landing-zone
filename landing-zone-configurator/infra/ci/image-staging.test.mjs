import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { prepareFirewallImage } from "../../deploy/cloud-foundry/firewall-image.mjs";
import { buildpackTag, verifyBuildpackSource } from "./buildpack-source.mjs";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const bytes = Buffer.from("synthetic immutable firewall image");
const image = {
  url: "https://image.invalid/pinned.qcow2",
  sha256: createHash("sha256").update(bytes).digest("hex"),
};

test("CF-compatible tags bind to the exact source under active immutable-tag rules", () => {
  const revision = "a".repeat(40);
  const ref = {
    ref: `refs/tags/${buildpackTag(revision)}`,
    object: { type: "commit", sha: revision },
  };
  const policy = {
    name: "Protect LZC buildpack tags",
    target: "tag",
    enforcement: "active",
    conditions: {
      ref_name: { include: ["refs/tags/lzc-image-buildpack-*"], exclude: [] },
    },
    rules: [{ type: "update" }, { type: "deletion" }],
  };
  assert.equal(
    verifyBuildpackSource(revision, ref, policy),
    buildpackTag(revision),
  );
  for (const changed of [
    { ...ref, ref: "refs/tags/mutable" },
    { ...ref, object: { type: "commit", sha: "b".repeat(40) } },
    { ...ref, object: { type: "tag", sha: revision } },
  ])
    assert.throws(() => verifyBuildpackSource(revision, changed, policy));
  for (const changed of [
    { ...policy, enforcement: "disabled" },
    { ...policy, rules: [{ type: "update" }] },
    { ...policy, bypass_actors: [{ actor_id: 1 }] },
    {
      ...policy,
      conditions: { ref_name: { include: ["refs/tags/*"], exclude: [] } },
    },
    {
      ...policy,
      conditions: {
        ref_name: {
          include: policy.conditions.ref_name.include,
          exclude: [ref.ref],
        },
      },
    },
  ])
    assert.throws(() => verifyBuildpackSource(revision, ref, changed));
  assert.throws(() => buildpackTag("main"));
});

test("verified cache is reused without a network request and refuses corruption or links", async () => {
  const work = await mkdtemp(resolve(tmpdir(), "lzc-image-cache-"));
  try {
    const cache = resolve(work, "cache");
    await mkdir(cache);
    const cached = resolve(cache, `${image.sha256}.qcow2`);
    await writeFile(cached, bytes);
    const target = resolve(work, "image.qcow2");
    const result = await prepareFirewallImage(image, cache, target);
    assert.deepEqual(result, {
      sha256: image.sha256,
      bytes: bytes.length,
      cacheHit: true,
    });
    assert.deepEqual(await readFile(target), bytes);
    assert.notEqual((await lstat(target)).ino, (await lstat(cached)).ino);
    assert.equal((await lstat(target)).mode & 0o777, 0o600);
    await assert.rejects(
      prepareFirewallImage(image, cache, target, { consume: true }),
      /absent destination/,
    );
    await writeFile(cached, "corrupt");
    await assert.rejects(
      prepareFirewallImage(image, cache),
      /checksum mismatch/,
    );
    await rm(cached);
    await symlink(target, cached);
    await assert.rejects(prepareFirewallImage(image, cache), /Invalid pinned/);
    await rm(cached);
    await writeFile(cached, bytes);
    await rm(target);
    await symlink(cached, target);
    await assert.rejects(
      prepareFirewallImage(image, cache, target),
      /Invalid pinned/,
    );
    await assert.rejects(
      prepareFirewallImage({ ...image, url: "http://image.invalid/x" }, cache),
      /descriptor/,
    );
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

for (const kind of ["runner", "inspection"]) {
  test(`final buildpack stages ${kind}, consumes its temporary cache and fails closed`, async () => {
    const work = await mkdtemp(resolve(tmpdir(), "lzc-image-buildpack-"));
    try {
      const build = resolve(work, "build");
      const root = kind === "runner" ? build : resolve(build, "inspection");
      const cache = resolve(work, "cache");
      const commands = resolve(work, "commands");
      await mkdir(resolve(build, "runtime/bin"), { recursive: true });
      await symlink(process.execPath, resolve(build, "runtime/bin/node"));
      await mkdir(resolve(build, "packages/contracts/dist"), {
        recursive: true,
      });
      await writeFile(
        resolve(build, "packages/contracts/package.json"),
        '{"type":"module"}',
      );
      await writeFile(
        resolve(build, "packages/contracts/dist/index.js"),
        `export const platformFirewallImage=${JSON.stringify(image)}; export const platformRunnerSourceSchema={parse: value => value};`,
      );
      await mkdir(resolve(root, "accelerator"), { recursive: true });
      const metadata = resolve(root, "platform-source.json");
      await writeFile(
        metadata,
        JSON.stringify({ firewallImageSha256: image.sha256 }),
      );
      await mkdir(commands);
      const fixture = resolve(work, "fixture");
      const calls = resolve(work, "downloads");
      await writeFile(fixture, bytes);
      await writeFile(
        resolve(commands, "curl"),
        `#!/bin/sh\nprintf 'download\\n' >> "$IMAGE_TEST_CALLS"\nwhile [ "$#" -gt 0 ]; do\n if [ "$1" = "--output" ]; then shift; cp "$IMAGE_TEST_FIXTURE" "$1"; exit 0; fi\n shift\ndone\nexit 1\n`,
      );
      await chmod(resolve(commands, "curl"), 0o700);
      function finalize() {
        return spawnSync(resolve(repository, "bin/finalize"), [build, cache], {
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${commands}:/usr/bin:/bin`,
            IMAGE_TEST_CALLS: calls,
            IMAGE_TEST_FIXTURE: fixture,
          },
        });
      }
      assert.equal(
        spawnSync(resolve(repository, "bin/detect"), [build]).status,
        0,
      );
      const cold = finalize();
      assert.equal(cold.status, 0, cold.stderr);
      assert.match(cold.stdout, /"cacheHit":false/);
      const target = resolve(root, "accelerator/firewall-image.qcow2");
      assert.deepEqual(await readFile(target), bytes);
      const cached = resolve(
        cache,
        `lzc-firewall-images/${image.sha256}.qcow2`,
      );
      const staged = await lstat(target);
      assert.equal(staged.nlink, 1);
      await assert.rejects(lstat(cached), { code: "ENOENT" });
      await rm(target);
      await writeFile(cached, bytes);
      const cachedInfo = await lstat(cached);
      const warm = finalize();
      assert.equal(warm.status, 0, warm.stderr);
      assert.match(warm.stdout, /"cacheHit":true/);
      assert.equal((await lstat(target)).ino, cachedInfo.ino);
      await assert.rejects(lstat(cached), { code: "ENOENT" });
      assert.equal(await readFile(calls, "utf8"), "download\n");
      await writeFile(
        metadata,
        JSON.stringify({ firewallImageSha256: "0".repeat(64) }),
      );
      assert.notEqual(
        finalize().status,
        0,
        "Mismatched capability must fail staging",
      );
      await writeFile(
        metadata,
        JSON.stringify({ firewallImageSha256: image.sha256 }),
      );
      await rm(target);
      await writeFile(fixture, "corrupt");
      assert.notEqual(
        finalize().status,
        0,
        "Invalid download must fail staging",
      );
      await assert.rejects(lstat(target), { code: "ENOENT" });
      assert.deepEqual(
        await readdir(resolve(cache, "lzc-firewall-images")),
        [],
      );
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });
}

test("release pins the final buildpack to the approved source and excludes images only from hosted archives", async () => {
  const workflow = await readFile(
    resolve(repository, ".github/workflows/configurator-release.yml"),
    "utf8",
  );
  const pack = await readFile(
    resolve(repository, "landing-zone-configurator/deploy/runner/package.sh"),
    "utf8",
  );
  assert.ok(
    workflow.includes(
      "LZC_RELEASE_REVISION: ${{ steps.source.outputs.release_revision }}",
    ),
  );
  assert.ok(
    workflow.includes(
      "--exclude='./inspection/accelerator/firewall-image.qcow2'",
    ),
  );
  assert.ok(
    workflow.includes("node scripts/check-staged-runner.mjs ../.local"),
  );
  assert.ok(
    workflow.includes(
      "if: failure() && steps.stage_runner.outcome == 'failure'",
    ),
  );
  assert.ok(
    workflow.includes(
      "/v3/builds?app_guids=$app_id&order_by=-created_at&per_page=1",
    ),
  );
  assert.ok(workflow.includes("jq '.resources[] | {guid, state, error}'"));
  assert.ok(pack.includes("--exclude='./accelerator/firewall-image.qcow2'"));
  assert.ok(pack.includes('tar -czf "$runner_dir.tar.gz" -C "$runner_dir" .'));
  for (const manifest of [
    "deploy/runner/manifest.yml",
    "deploy/cloud-foundry/manifest.yml",
  ]) {
    assert.match(
      await readFile(
        resolve(repository, "landing-zone-configurator", manifest),
        "utf8",
      ),
      /buildpacks: \[\(\(LZC_IMAGE_BUILDPACK\)\)\]/,
    );
  }
  assert.match(
    await readFile(
      resolve(
        repository,
        "landing-zone-configurator/deploy/cloud-foundry/migration-manifest.yml",
      ),
      "utf8",
    ),
    /buildpacks: \[binary_buildpack\]/,
  );
});
