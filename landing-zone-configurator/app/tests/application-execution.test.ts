import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applicationExecutionCurrentRevision,
  applicationExecutionManifestSchema,
  applicationExecutionProfile,
  applicationExecutionProfiles,
} from "@lzc/contracts";
import {
  applicationSourcePayloadSha256,
  readApplicationExecutionManifest,
} from "@lzc/contracts/recovery";
import { afterEach, expect, it } from "vitest";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "lzc-execution-manifest-"));
  roots.push(root);
  const lock = await readFile(
    new URL("../../deploy/runner/application.lock.hcl", import.meta.url),
  );
  const profiles = [];
  for (const profile of applicationExecutionProfiles.filter(
    (p) => p.status === "supported",
  )) {
    const sourcePath =
      profile.revision === applicationExecutionCurrentRevision
        ? "application-src"
        : `application-sources/${profile.revision}`;
    await mkdir(join(root, sourcePath, "application"), { recursive: true });
    await writeFile(
      join(root, sourcePath, "application/.terraform.lock.hcl"),
      lock,
    );
    await writeFile(
      join(root, sourcePath, "application/main.tf"),
      `# ${profile.revision}`,
    );
    profiles.push({
      ...profile,
      sourcePath,
      payloadSha256: await applicationSourcePayloadSha256(
        join(root, sourcePath),
      ),
    });
  }
  const manifest = { schemaVersion: 1 as const, profiles };
  await writeFile(
    join(root, "application-execution.json"),
    JSON.stringify(manifest),
  );
  return { root, manifest };
}
it("validates all six immutable sources and rejects withdrawn or absent sources with an upgrade path", async () => {
  const { root, manifest } = await fixture();
  expect(await readApplicationExecutionManifest(root)).toEqual(manifest);
  for (const p of manifest.profiles)
    expect(applicationExecutionProfile(manifest, p.revision)).toEqual(p);
  expect(() =>
    applicationExecutionProfile(
      manifest,
      "4d15d7870afa323badd93559d8b37c5a8d138dcf",
    ),
  ).toThrow(`withdrawn; upgrade to ${applicationExecutionCurrentRevision}`);
  expect(() => applicationExecutionProfile(manifest, "0".repeat(40))).toThrow(
    "unavailable; upgrade",
  );
});
it("rejects a tampered historical source even when selecting the current source", async () => {
  const { root, manifest } = await fixture();
  await writeFile(
    join(
      root,
      firstProfile(manifest.profiles).sourcePath,
      "application/main.tf",
    ),
    "changed",
  );
  await expect(readApplicationExecutionManifest(root)).rejects.toThrow();
});
it("checks provider lock independently of the payload digest", async () => {
  const { root, manifest } = await fixture();
  const p = firstProfile(manifest.profiles);
  await writeFile(
    join(root, p.sourcePath, "application/.terraform.lock.hcl"),
    "different lock",
  );
  p.payloadSha256 = await applicationSourcePayloadSha256(
    join(root, p.sourcePath),
  );
  await writeFile(
    join(root, "application-execution.json"),
    JSON.stringify(manifest),
  );
  await expect(readApplicationExecutionManifest(root)).rejects.toThrow();
});
it("rejects symlinked source ancestors, unsafe paths, duplicate profiles and state artifacts", async () => {
  const { root, manifest } = await fixture();
  expect(
    applicationExecutionManifestSchema.safeParse({
      ...manifest,
      profiles: [manifest.profiles[0], manifest.profiles[0]],
    }).success,
  ).toBe(false);
  expect(
    applicationExecutionManifestSchema.safeParse({
      ...manifest,
      profiles: [{ ...manifest.profiles[0], sourcePath: "../elsewhere" }],
    }).success,
  ).toBe(false);
  const source = join(root, firstProfile(manifest.profiles).sourcePath);
  await writeFile(join(source, "application/terraform.tfstate"), "{}");
  await expect(applicationSourcePayloadSha256(source)).rejects.toThrow();
  await rm(join(source, "application/terraform.tfstate"));
  await rm(join(root, "application-sources"), { recursive: true });
  await symlink(
    join(root, "application-src"),
    join(root, "application-sources"),
  );
  await expect(readApplicationExecutionManifest(root)).rejects.toThrow();
});
it("retains absent-manifest compatibility without accepting a malformed present manifest", async () => {
  const { root } = await fixture();
  await rm(join(root, "application-execution.json"));
  expect(await readApplicationExecutionManifest(root)).toBeNull();
  await writeFile(join(root, "application-execution.json"), "{}");
  await expect(readApplicationExecutionManifest(root)).rejects.toThrow();
});

function firstProfile<T>(profiles: T[]): T {
  const first = profiles[0];
  if (!first) throw new Error("missing fixture profile");
  return first;
}

it("preserves legacy bucket defaults only across explicitly selected modern-source upgrades", async () => {
  const { applicationExecutionNativeOverrides, applicationExecutionRevisions } =
    await import("@lzc/contracts");
  for (const origin of [
    "4d15d7870afa323badd93559d8b37c5a8d138dcf",
    ...applicationExecutionRevisions.slice(0, 3),
  ]) {
    for (const selected of applicationExecutionRevisions.slice(3))
      expect(applicationExecutionNativeOverrides(origin, selected)).toEqual({
        bucket_naming: "legacy",
      });
    expect(applicationExecutionNativeOverrides(origin, origin)).toEqual({});
  }
  for (const origin of applicationExecutionRevisions.slice(3))
    expect(
      applicationExecutionNativeOverrides(
        origin,
        applicationExecutionCurrentRevision,
      ),
    ).toEqual({});
  expect(
    applicationExecutionNativeOverrides(
      "unknown",
      applicationExecutionCurrentRevision,
    ),
  ).toEqual({});
});
