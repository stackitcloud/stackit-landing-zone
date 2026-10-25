import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import {
  applicationRecoveryStrategies,
  deriveApplicationRecoveryImports,
  deriveApplicationRecoveryRevocations,
  normalizeRevokedRecoveryInventory,
  recoveryCloudInventorySchema,
  recoveryRevocationsAbsent,
  verifyImportedRecoveryState,
} from "@lzc/contracts/recovery";
import { expect, it } from "vitest";
import { recoveryFixture } from "./fixtures/application-state-recovery.js";

const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));
function fullFixture() {
  const f = recoveryFixture();
  const prefix = `app-${f.variables.application.instance_id}-dev`;
  const projectId = f.inventory.project.projectId;
  const networkId = f.inventory.networks[0]!.id;
  const organizationId = "55555555-5555-4555-8555-555555555555";
  const areaId = "66666666-6666-4666-8666-666666666666";
  const tableId = "77777777-7777-4777-8777-777777777777";
  const routeId = "88888888-8888-4888-8888-888888888888";
  const variables = {
    ...f.variables,
    application: {
      ...f.variables.application,
      custom_roles: [
        {
          name: "application-reader",
          description: "Application read access",
          permissions: ["iaas.network.get"],
        },
      ],
      secretsmanager_enabled: true,
      observability: { enabled: true, plan_name: "observability-small" },
    },
    platform_contract: {
      ...f.variables.platform_contract,
      organization_id: organizationId,
      targets: {
        public: {
          ...f.variables.platform_contract.targets.public,
          corporate: true,
          network_area_id: areaId,
          firewall_next_hop_ip: "10.0.0.7",
        },
      },
    },
  };
  const inventory = recoveryCloudInventorySchema.parse({
    ...f.inventory,
    networks: [
      {
        ...f.inventory.networks[0],
        name: `${prefix}-routed`,
        routed: true,
        routingTableId: tableId,
      },
    ],
    buckets: ["default", "tfstate"].map(
      (p) => `${prefix.slice(0, 63 - p.length - 38)}-${projectId}-${p}`,
    ),
    credentialsGroups: [
      ...f.inventory.credentialsGroups,
      {
        id: "application-group",
        name: `${prefix.slice(0, 23)}-${createHash("sha256").update(prefix).digest("hex").slice(0, 8)}`,
        platformDefault: false,
        accessKeyIds: [],
      },
    ],
    customRolesComplete: true,
    customRoles: [
      {
        id: "reader-role",
        name: "application-reader",
        description: "Application read access",
        permissions: ["iaas.network.get"],
      },
    ],
    routingScope: { organizationId, networkAreaId: areaId, region: "eu01" },
    routingTables: [
      {
        id: tableId,
        name: prefix,
        labels: f.inventory.project.labels,
        systemRoutes: false,
        routes: [
          {
            id: routeId,
            labels: f.inventory.project.labels,
            destination: { type: "cidrv4", value: "0.0.0.0/0" },
            nextHop: { type: "ipv4", value: "10.0.0.7" },
          },
        ],
      },
    ],
    secretsManagerIds: ["secret-instance"],
    secretsManagers: [{ id: "secret-instance", name: `${prefix}-default` }],
    observabilityIds: ["observability-instance"],
    observability: [
      {
        id: "observability-instance",
        name: prefix,
        planName: "observability-small",
      },
    ],
    roleAssignments: [
      ...f.inventory.roleAssignments,
      {
        projectId,
        role: "owner",
        subject: f.inventory.serviceAccounts[0]!.email,
      },
    ],
  });
  const state = { ...f.state, resources: f.state.resources.slice(0, 1) };
  const input = {
    state: bytes(state),
    variables,
    inventory,
    tenantId: variables.application.tenant_id,
    instanceId: variables.application.instance_id,
  };
  const imports = deriveApplicationRecoveryImports(input);
  expect(imports).toHaveLength(13);
  expect([...new Set(imports.map((i) => i.type))].sort()).toEqual(
    Object.entries(applicationRecoveryStrategies)
      .filter(([, strategy]) => strategy === "import")
      .map(([type]) => type)
      .sort(),
  );
  const resources = imports.map((item) => {
    const match =
      /^module\.application\.([a-z_]+)\.([a-z_]+)(?:\[(.*)\])?$/.exec(
        item.address,
      )!;
    return {
      module: "module.application",
      mode: "managed",
      type: match[1],
      name: match[2],
      provider: "stackit",
      instances: [
        {
          ...(match[3] === undefined
            ? {}
            : { index_key: JSON.parse(match[3]) }),
          attributes: {
            id: item.resourceId,
            ...(item.type === "stackit_resourcemanager_project"
              ? {
                  project_id: projectId,
                  container_id: inventory.project.containerId,
                }
              : {}),
          },
        },
      ],
    };
  });
  return { input, imports, resources, state, networkId };
}
it("recovers every retained/missing subset across all importable Application resources without cloud creates or Runner interruptions", () => {
  const f = fullFixture();
  for (let mask = 0; mask < 2 ** f.resources.length; mask++) {
    const retained = f.resources.filter((_, index) => mask & (1 << index));
    const missing = f.imports.filter((_, index) => !(mask & (1 << index)));
    const before = {
      ...f.state,
      resources: [...f.state.resources, ...retained],
    };
    const imports = deriveApplicationRecoveryImports({
      ...f.input,
      state: bytes(before),
    });
    expect(imports).toEqual(missing);
    const candidate = {
      ...before,
      serial: before.serial + imports.length,
      resources: [...f.state.resources, ...f.resources],
    };
    expect(
      verifyImportedRecoveryState({
        original: bytes(before),
        candidate: bytes(candidate),
        instanceId: f.input.instanceId,
        imports,
      }).candidateResources,
    ).toBe(14);
  }
}, 60000);
it.each([
  "route-scope",
  "route-next-hop",
  "table-label",
  "network-table",
  "service-name",
  "service-plan",
  "role-permissions",
  "bucket-owner",
  "duplicate-group",
])("blocks conflicting %s", (change) => {
  const f = fullFixture();
  switch (change) {
    case "route-scope":
      f.input.inventory.routingScope!.networkAreaId = f.networkId;
      break;
    case "route-next-hop":
      f.input.inventory.routingTables[0]!.routes[0]!.nextHop.value = "10.0.0.8";
      break;
    case "table-label":
      f.input.inventory.routingTables[0]!.labels.lzc_instance = f.networkId;
      break;
    case "network-table":
      f.input.inventory.networks[0]!.routingTableId = f.networkId;
      break;
    case "service-name":
      f.input.inventory.secretsManagers[0]!.name = "foreign";
      break;
    case "service-plan":
      f.input.inventory.observability[0]!.planName = "unapproved";
      break;
    case "role-permissions":
      f.input.inventory.customRoles[0]!.permissions.push("project.delete");
      break;
    case "bucket-owner":
      f.input.inventory.buckets[0] = "foreign-default";
      break;
    case "duplicate-group":
      f.input.inventory.credentialsGroups.push(
        structuredClone(f.input.inventory.credentialsGroups[1]!),
      );
      break;
  }
  expect(() => deriveApplicationRecoveryImports(f.input)).toThrow();
});
it("derives targeted revocations only for lost secrets and permits exactly their removal", () => {
  const f = fullFixture();
  f.input.inventory.serviceAccounts[0]!.keyIds = ["lost-automation-key"];
  f.input.inventory.credentialsGroups[1]!.accessKeyIds = ["lost-storage-key"];
  const revocations = deriveApplicationRecoveryRevocations(f.input);
  expect(revocations.map((r) => r.kind).sort()).toEqual([
    "objectstorage-credential",
    "service-account-key",
  ]);
  expect(recoveryRevocationsAbsent(f.input.inventory, revocations)).toBe(false);
  const current = structuredClone(f.input.inventory);
  current.serviceAccounts[0]!.keyIds = [];
  current.credentialsGroups[1]!.accessKeyIds = [];
  expect(recoveryRevocationsAbsent(current, revocations)).toBe(true);
  expect(
    normalizeRevokedRecoveryInventory(current, f.input.inventory, revocations),
  ).toEqual(f.input.inventory);
  const state = {
    ...f.state,
    resources: [
      ...f.state.resources,
      {
        module: "module.application",
        mode: "managed",
        type: "stackit_service_account_key",
        name: "automation",
        provider: "stackit",
        instances: [
          {
            attributes: {
              id: "retained",
              key_id: "lost-automation-key",
              json: JSON.stringify({
                credentials: { privateKey: "retained-secret" },
              }),
            },
          },
        ],
      },
    ],
  };
  expect(
    deriveApplicationRecoveryRevocations({ ...f.input, state: bytes(state) }),
  ).toHaveLength(1);
});
it("requires a deliberate recovery strategy for every resource reachable from the Application root", async () => {
  const root = new URL("../../../src/", import.meta.url);
  const main = await readFile(new URL("application/main.tf", root), "utf8");
  const folder = new URL("modules/landing-zone/", root);
  const types = new Set<string>();
  const addresses = new Set<string>();
  for (const file of await readdir(folder))
    if (file.endsWith(".tf")) {
      const source = await readFile(new URL(file, folder), "utf8");
      for (const match of source.matchAll(
        /resource\s+"([a-z_]+)"\s+"([a-z_]+)"/g,
      )) {
        // DNS is a native module capability, not wired through the orderable root.
        if (match[1] === "stackit_dns_zone") {
          expect(main).not.toMatch(/^\s*dns_zone_name\s*=/m);
          continue;
        }
        types.add(match[1]!);
        addresses.add(`module.application.${match[1]}.${match[2]}`);
      }
    }
  for (const match of main.matchAll(/resource\s+"([a-z_]+)"/g))
    types.add(match[1]!);
  const expected = new Set(
    fullFixture().imports.map((i) => i.address.replace(/\[.*$/, "")),
  );
  expected.add("module.application.stackit_service_account_key.automation");
  expected.add("module.application.stackit_objectstorage_credential.this");
  expected.add("module.application.time_rotating.key_rotate");
  expect([...addresses].sort()).toEqual([...expected].sort());
  expect([...types].sort()).toEqual(
    Object.keys(applicationRecoveryStrategies).sort(),
  );
});
it.each(["service-account-key", "objectstorage-credential"] as const)(
  "repairs an ID-only %s checkpoint only with its explicit incomplete-State removal manifest",
  (kind) => {
    const f = fullFixture(),
      projectId = f.input.inventory.project.projectId;
    const address =
      kind === "service-account-key"
        ? "module.application.stackit_service_account_key.automation"
        : "module.application.stackit_objectstorage_credential.this";
    const attributes =
      kind === "service-account-key"
        ? {
            id: "incomplete-key",
            project_id: projectId,
            service_account_email: f.input.inventory.serviceAccounts[0]!.email,
            key_id: "lost-key",
            json: null,
          }
        : {
            id: "incomplete-credential",
            project_id: projectId,
            credentials_group_id: "application-group",
            credential_id: "lost-key",
            access_key: null,
            secret_access_key: null,
          };
    if (kind === "service-account-key")
      f.input.inventory.serviceAccounts[0]!.keyIds = ["lost-key"];
    else f.input.inventory.credentialsGroups[1]!.accessKeyIds = ["lost-key"];
    const incomplete = {
      module: "module.application",
      mode: "managed",
      type:
        kind === "service-account-key"
          ? "stackit_service_account_key"
          : "stackit_objectstorage_credential",
      name: kind === "service-account-key" ? "automation" : "this",
      provider: "stackit",
      instances: [{ attributes }],
    };
    const original = bytes({
      ...f.state,
      resources: [...f.state.resources, incomplete],
    });
    const revocations = deriveApplicationRecoveryRevocations({
      ...f.input,
      state: original,
    });
    expect(revocations).toHaveLength(1);
    expect(revocations[0]).toMatchObject({
      address,
      discardIncompleteState: true,
      keyId: "lost-key",
    });
    const candidate = bytes({
      ...f.state,
      serial: 15,
      resources: [...f.state.resources, ...f.resources],
    });
    expect(() =>
      verifyImportedRecoveryState({
        original,
        candidate,
        instanceId: f.input.instanceId,
        imports: f.imports,
      }),
    ).toThrow();
    expect(
      verifyImportedRecoveryState({
        original,
        candidate,
        instanceId: f.input.instanceId,
        imports: f.imports,
        revocations,
      }).retainedResources,
    ).toBe(1);
    // A known-good secret must never be removed by forging a consent flag.
    if (kind === "service-account-key")
      Object.assign(attributes, {
        json: JSON.stringify({ credentials: { privateKey: "saved" } }),
      });
    else
      Object.assign(attributes, {
        access_key: "saved-access",
        secret_access_key: "saved-secret",
      });
    expect(() =>
      verifyImportedRecoveryState({
        original: bytes({
          ...f.state,
          resources: [...f.state.resources, incomplete],
        }),
        candidate,
        instanceId: f.input.instanceId,
        imports: f.imports,
        revocations,
      }),
    ).toThrow();
  },
);
