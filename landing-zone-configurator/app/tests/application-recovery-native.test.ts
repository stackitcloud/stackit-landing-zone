import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import {
  applicationAcceleratorCommit,
  applicationProviderLockHash,
} from "../apps/worker/src/runner.js";
import {
  prepareNativeStateRecovery,
  type RecoveryNativeCommand,
} from "../apps/worker/src/state-recovery-native.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
const tenant = "11111111-1111-4111-8111-111111111111";
const instance = "22222222-2222-4222-8222-222222222222";
const project = "33333333-3333-4333-8333-333333333333";
const network = "44444444-4444-4444-8444-444444444444";
const labels = {
  application_instance: instance,
  lzc_instance: instance,
  application_template: "template",
  managed_by: "landing-zone-configurator",
};
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "lzc-recovery-test-"));
  roots.push(root);
  await mkdir(join(root, "application-src/application"), { recursive: true });
  await copyFile(
    fileURLToPath(
      new URL("../../deploy/runner/application.lock.hcl", import.meta.url),
    ),
    join(root, "application-src/application/.terraform.lock.hcl"),
  );
  await copyFile(
    fileURLToPath(
      new URL("../../../src/application/backend.tf", import.meta.url),
    ),
    join(root, "application-src/application/backend.tf"),
  );
  await writeFile(join(root, "runner.tfrc"), "# test mirror");
  const original = {
    version: 4,
    terraform_version: "1.12.6",
    lineage: network,
    serial: 1,
    resources: [
      {
        mode: "managed",
        type: "terraform_data",
        name: "contract",
        provider: "builtin",
        instances: [{ attributes: { input: instance } }],
      },
      {
        module: "module.application",
        mode: "managed",
        type: "stackit_resourcemanager_project",
        name: "this",
        provider: "stackit",
        instances: [
          {
            attributes: {
              id: "container",
              container_id: "container",
              project_id: project,
            },
          },
        ],
      },
    ],
  };
  const calls: Parameters<RecoveryNativeCommand>[0][] = [];
  const command: RecoveryNativeCommand = async (c) => {
    calls.push(c);
    if (c.args[0] === "version")
      return JSON.stringify({ terraform_version: "1.12.6" });
    expect(await stat(join(c.cwd, "backend.tf")).catch(() => null)).toBeNull();
    expect(Object.keys(c.env).some((k) => k.startsWith("AWS_"))).toBe(false);
    if (c.args[0] === "import") {
      const state = {
        ...structuredClone(original),
        serial: 2,
        resources: [
          ...original.resources,
          {
            module: "module.application",
            mode: "managed",
            type: "stackit_network",
            name: "this",
            provider: "stackit",
            instances: [
              {
                index_key: 0,
                attributes: { id: `${project},eu01,${network}` },
              },
            ],
          },
        ],
      };
      await writeFile(join(c.cwd, "terraform.tfstate"), JSON.stringify(state));
    }
    if (c.args[0] === "show")
      return JSON.stringify({
        resource_changes: [
          "terraform_data.contract",
          "module.application.stackit_resourcemanager_project.this",
          "module.application.stackit_network.this[0]",
        ].map((address) => ({
          address,
          mode: "managed",
          change: { actions: ["no-op"] },
        })),
      });
    return "";
  };
  return {
    calls,
    command,
    input: {
      root,
      tenantId: tenant,
      instanceId: instance,
      sourceRevision: applicationAcceleratorCommit,
      providerLockSha256: applicationProviderLockHash,
      key: { neverLog: "private-key-fixture" },
      original: Buffer.from(JSON.stringify(original)),
      variables: {
        application: {
          configurator_execution: true,
          tenant_id: tenant,
          instance_id: instance,
          platform_revision: network,
          template_id: "template",
          name: "test",
          env: "dev",
          owner_email: "owner@example.com",
          target_key: "public",
          network_enabled: true,
          role_assignments: [],
        },
        platform_contract: {
          tenant_id: tenant,
          revision: network,
          targets: {
            public: { folder_id: "folder", region: "eu01", corporate: false },
          },
        },
      },
      inventory: {
        complete: true,
        project: {
          projectId: project,
          containerId: "container",
          parentContainerId: "folder",
          name: "test",
          ownerEmail: "owner@example.com",
          active: true,
          labels,
        },
        networks: [
          {
            projectId: project,
            region: "eu01",
            id: network,
            name: `app-${instance}-dev-local`,
            routed: false,
            labels,
          },
        ],
        serviceAccounts: [],
        roleAssignments: [],
        buckets: [],
        credentialsGroups: [],
        secretsManagerIds: [],
        observabilityIds: [],
      },
    },
  };
}
it("prepares a native candidate locally, exposes no remote credentials and removes all temporary files", async () => {
  const f = await fixture();
  const result = await prepareNativeStateRecovery(f.input, f.command);
  expect(result.imports).toHaveLength(1);
  expect(result.proof).toMatchObject({
    retainedResources: 2,
    candidateResources: 3,
  });
  expect(result.summary).toMatchObject({ unchanged: 3, delete: 0 });
  expect(f.calls.map((c) => c.args[0])).toEqual([
    "version",
    "init",
    "import",
    "plan",
    "show",
  ]);
  expect(f.calls.flatMap((c) => c.args)).not.toContain("apply");
  expect(f.calls.flatMap((c) => c.args)).not.toContain("state");
  expect(f.calls.flatMap((c) => c.args)).not.toContain("force-unlock");
  expect(await stat(f.calls[0]!.cwd).catch(() => null)).toBeNull();
});
it("cleans private files after native failure and never continues to another import/Plan", async () => {
  const f = await fixture();
  let cwd = "";
  await expect(
    prepareNativeStateRecovery(f.input, async (c) => {
      cwd = c.cwd;
      if (c.args[0] === "init") throw new Error("native-recovery-failed");
      return f.command(c);
    }),
  ).rejects.toThrow("native-recovery-failed");
  expect(await stat(cwd).catch(() => null)).toBeNull();
  expect(f.calls.map((c) => c.args[0])).toEqual(["version"]);
});
it("rejects changed source/lock/backend before invoking a native process", async () => {
  const f = await fixture();
  for (const change of [
    { sourceRevision: "a".repeat(40) },
    { providerLockSha256: "b".repeat(64) },
  ])
    await expect(
      prepareNativeStateRecovery({ ...f.input, ...change }, f.command),
    ).rejects.toThrow("source-changed");
  await writeFile(
    join(f.input.root, "application-src/application/backend.tf"),
    'terraform { backend "http" {} }',
  );
  await expect(prepareNativeStateRecovery(f.input, f.command)).rejects.toThrow(
    "source-changed",
  );
  expect(f.calls).toEqual([]);
  expect(await readFile(join(f.input.root, "runner.tfrc"), "utf8")).toBe(
    "# test mirror",
  );
});
