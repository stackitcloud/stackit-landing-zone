import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { copyFile, lstat, mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LocalPlanRunner } from "../apps/api/dist/plans/local.js";
import { platformFirewallImage } from "../packages/contracts/dist/index.js";

const directory = resolve(process.argv[2]);
const repository = fileURLToPath(new URL("../../../", import.meta.url));
const work = await mkdtemp(resolve(directory, "staging-check-"));
function command(executable, args) {
  const result = spawnSync(executable, args, {
    stdio: "inherit",
    timeout: 180000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Staging qualification failed: ${executable}`);
}
try {
  const original = await LocalPlanRunner.open(
    resolve(directory, "runner"),
    resolve(work, "original-jobs"),
  );
  const cache = resolve(work, "cache");
  await mkdir(resolve(cache, "lzc-firewall-images"), {
    recursive: true,
    mode: 0o700,
  });
  for (const [name, relative] of [
    ["runner", ""],
    ["release", "inspection"],
  ]) {
    const archive = resolve(directory, `${name}.tar.gz`);
    assert(
      (await lstat(archive)).size < 384 * 1024 ** 2,
      "CF archive must stay below 384 MiB",
    );
    const build = resolve(work, name);
    await mkdir(build, { mode: 0o700 });
    command("tar", ["-xzf", archive, "-C", build]);
    const root = resolve(build, relative);
    await assert.rejects(
      lstat(resolve(root, "accelerator/firewall-image.qcow2")),
      { code: "ENOENT" },
    );
    command(resolve(repository, "bin/detect"), [build]);
    const cachedPath = resolve(
      cache,
      `lzc-firewall-images/${platformFirewallImage.sha256}.qcow2`,
    );
    await copyFile(
      resolve(directory, "runner/accelerator/firewall-image.qcow2"),
      cachedPath,
      constants.COPYFILE_FICLONE,
    );
    const cachedImage = await lstat(cachedPath);
    command(resolve(repository, "bin/finalize"), [build, cache]);
    const stagedImage = await lstat(
      resolve(root, "accelerator/firewall-image.qcow2"),
    );
    assert.equal(stagedImage.dev, cachedImage.dev);
    assert.equal(
      stagedImage.ino,
      cachedImage.ino,
      "Staging must move the verified image, not allocate a second image",
    );
    await assert.rejects(lstat(cachedPath), { code: "ENOENT" });
    command("diff", ["-qr", resolve(directory, "runner"), root]);
    const staged = await LocalPlanRunner.open(
      root,
      resolve(work, `${name}-jobs`),
    );
    assert.equal(
      staged.packageId,
      original.packageId,
      "Staging must restore the exact qualified package identity",
    );
    assert.equal(staged.firewallPlansEnabled, true);
    console.log(
      JSON.stringify({
        archive: name,
        bytes: (await lstat(archive)).size,
        packageId: staged.packageId,
      }),
    );
  }
  console.log(
    "PASS: both thin CF archives below 384 MiB restore the exact image-qualified Runner identity during staging; runtime package/disk footprint unchanged.",
  );
} finally {
  await rm(work, { recursive: true, force: true });
}
