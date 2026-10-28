import { deriveApplicationRecoveryImports } from "@lzc/contracts/recovery";
import { describe, expect, it } from "vitest";

import { recoveryFixture as fixture } from "./fixtures/application-state-recovery.js";

const project = "33333333-3333-4333-8333-333333333333";
const tenant = "11111111-1111-4111-8111-111111111111";
const instance = "22222222-2222-4222-8222-222222222222";
const foreign = "44444444-4444-4444-8444-444444444444";
function derive(f: ReturnType<typeof fixture>) {
  return deriveApplicationRecoveryImports({
    state: Buffer.from(JSON.stringify(f.state)),
    variables: f.variables,
    inventory: f.inventory,
    tenantId: tenant,
    instanceId: instance,
  });
}
describe("bounded Application cloud adoption catalogue", () => {
  it("derives exact native addresses and import identities for the retained project", () => {
    const f = fixture();
    expect(derive(f)).toEqual([
      {
        type: "stackit_network",
        address: "module.application.stackit_network.this[0]",
        resourceId: `${project},eu01,${foreign}`,
      },
      {
        type: "stackit_service_account",
        address: "module.application.stackit_service_account.automation",
        resourceId: `${project},${f.inventory.serviceAccounts[0]!.email}`,
      },
      {
        type: "stackit_authorization_project_role_assignment",
        address:
          'module.application.stackit_authorization_project_role_assignment.this["project.member-owner@example.com"]',
        resourceId: `${project},project.member,owner@example.com`,
      },
    ]);
  });
  it.each([
    "tenant",
    "instance",
    "contract",
    "project",
    "folder",
    "labels",
    "region",
    "name",
    "network-label",
    "account-project",
    "role-project",
    "incomplete",
    "duplicate",
    "foreign-account",
    "bucket",
    "group",
    "secrets",
    "observability",
    "corporate",
    "custom-role",
  ])("blocks unresolved or foreign %s", (change) => {
    const f = fixture();
    switch (change) {
      case "tenant":
        f.variables.application.tenant_id = foreign;
        break;
      case "instance":
        f.variables.application.instance_id = foreign;
        break;
      case "contract":
        f.variables.platform_contract.revision = tenant;
        break;
      case "project":
        f.inventory.project.projectId = foreign;
        break;
      case "folder":
        f.inventory.project.parentContainerId = "different";
        break;
      case "labels":
        f.inventory.project.labels.application_instance = foreign;
        break;
      case "region":
        f.inventory.networks[0]!.region = "eu02";
        break;
      case "name":
        f.inventory.networks[0]!.name = "similar-name";
        break;
      case "network-label":
        f.inventory.networks[0]!.labels.lzc_instance = foreign;
        break;
      case "account-project":
        f.inventory.serviceAccounts[0]!.projectId = foreign;
        break;
      case "role-project":
        f.inventory.roleAssignments[0]!.projectId = foreign;
        break;
      case "incomplete":
        f.inventory.complete = false;
        break;
      case "duplicate":
        f.inventory.networks.push(structuredClone(f.inventory.networks[0]!));
        break;
      case "foreign-account":
        f.inventory.serviceAccounts[0]!.email = "other@sa.stackit.cloud";
        break;
      case "key":
        f.inventory.serviceAccounts[0]!.keyIds.push("unrecoverable-key");
        break;
      case "bucket":
        f.inventory.buckets.push("existing-without-state");
        break;
      case "group":
        f.inventory.credentialsGroups[0]!.platformDefault = false;
        break;
      case "secrets":
        f.inventory.secretsManagerIds.push("untracked");
        break;
      case "observability":
        f.inventory.observabilityIds.push("untracked");
        break;
      case "corporate":
        f.variables.platform_contract.targets.public.corporate = true;
        break;
      case "custom-role":
        Object.assign(f.variables.application, {
          custom_roles: [{ name: "unsupported" }],
        });
        break;
    }
    expect(() => derive(f)).toThrow();
  });
  it("ignores internal system accounts and does not invent absent cloud resources", () => {
    const f = fixture();
    f.inventory.networks = [];
    f.inventory.roleAssignments = [];
    f.inventory.serviceAccounts[0]!.internal = true;
    expect(derive(f)).toEqual([]);
  });
});

it.each([
  {
    source: "c4b43c36af198985980b17626c48d357795e3fbd",
    legacyBuckets: true,
    legacyGroup: true,
  },
  {
    source: "88149782bf8e91dcdbb43a203b54337886023f7f",
    legacyBuckets: true,
    legacyGroup: true,
  },
  {
    source: "57ad1f6a651c1787694b74ff8aa8b241a3dcd16f",
    legacyBuckets: true,
    legacyGroup: false,
  },
  {
    source: "9e7fb46c329aca32e878ce1f0ea3b944ea240354",
    legacyBuckets: false,
    legacyGroup: false,
  },
  {
    source: "1ed855609d4dcbfded6759c7c8b4fabf7bd6725d",
    legacyBuckets: false,
    legacyGroup: false,
  },
  {
    source: "08ac257de1548c8ec5e83dae1a79373711c3d644",
    legacyBuckets: false,
    legacyGroup: false,
  },
])(
  "adopts only actual historical bucket and credentials-group identities for $source",
  async ({ source, legacyBuckets, legacyGroup }) => {
    const { createHash } = await import("node:crypto");
    const { deriveApplicationRecoveryRevocations } = await import(
      "@lzc/contracts/recovery"
    );
    const f = fixture(),
      prefix = `app-${instance}-dev`;
    const buckets = ["default", "tfstate"].map((purpose) =>
      legacyBuckets
        ? `${prefix}-${purpose}`
        : `${prefix.slice(0, 63 - purpose.length - 38)}-${project}-${purpose}`,
    );
    const groupName = legacyGroup
      ? prefix
      : `${prefix.slice(0, 23)}-${createHash("sha256").update(prefix).digest("hex").slice(0, 8)}`;
    const input = {
      sourceRevision: source,
      state: Buffer.from(JSON.stringify(f.state)),
      variables: f.variables,
      inventory: {
        ...f.inventory,
        buckets,
        credentialsGroups: [
          {
            id: "application-group",
            name: groupName,
            platformDefault: false,
            accessKeyIds: ["lost-secret-key"],
          },
        ],
      },
      tenantId: tenant,
      instanceId: instance,
    };
    const imports = deriveApplicationRecoveryImports(input);
    expect(
      imports
        .filter((i) => i.type === "stackit_objectstorage_bucket")
        .map((i) => i.resourceId),
    ).toEqual(buckets.map((name) => `${project},eu01,${name}`));
    expect(
      imports.find((i) => i.type === "stackit_objectstorage_credentials_group")
        ?.resourceId,
    ).toBe(`${project},eu01,application-group`);
    expect(deriveApplicationRecoveryRevocations(input)).toMatchObject([
      { kind: "objectstorage-credential", keyId: "lost-secret-key" },
    ]);
    const opposite = legacyBuckets
      ? `${prefix.slice(0, 18)}-${project}-default`
      : `${prefix}-default`;
    expect(() =>
      deriveApplicationRecoveryImports({
        ...input,
        inventory: { ...input.inventory, buckets: [opposite] },
      }),
    ).toThrow("cloud-resource-ambiguous");
    expect(() =>
      deriveApplicationRecoveryImports({
        ...input,
        inventory: {
          ...input.inventory,
          credentialsGroups: [
            {
              ...input.inventory.credentialsGroups[0],
              name: legacyGroup
                ? `${prefix.slice(0, 23)}-${createHash("sha256").update(prefix).digest("hex").slice(0, 8)}`
                : prefix,
            },
          ],
        },
      }),
    ).toThrow("cloud-resource-ambiguous");
  },
);

it.each([
  "retained",
  "absent",
  "different-id",
  "different-name",
  "unrelated-cloud-name",
] as const)(
  "requires exact authoritative retained proof for an older full-prefix group during modern Recovery: %s",
  (mode) => {
    const f = fixture(),
      prefix = `app-${instance}-dev`,
      groupId = "retained-before-upgrade";
    const retainedGroup = {
      module: "module.application",
      mode: "managed",
      type: "stackit_objectstorage_credentials_group",
      name: "this",
      provider: "stackit",
      instances: [
        {
          attributes: {
            id: `${project},eu01,${mode === "different-id" ? "foreign-group" : groupId}`,
            name: mode === "different-name" ? "foreign-name" : prefix,
            credentials_group_id: groupId,
          },
        },
      ],
    };
    const state = {
      ...f.state,
      resources: [
        ...f.state.resources,
        ...(mode === "absent" ? [] : [retainedGroup]),
      ],
    };
    const input = {
      sourceRevision: "08ac257de1548c8ec5e83dae1a79373711c3d644",
      state: Buffer.from(JSON.stringify(state)),
      variables: f.variables,
      inventory: {
        ...f.inventory,
        credentialsGroups: [
          {
            id: groupId,
            name: mode === "unrelated-cloud-name" ? "unrelated-name" : prefix,
            platformDefault: false,
            accessKeyIds: [],
          },
        ],
      },
      tenantId: tenant,
      instanceId: instance,
    };
    if (mode === "retained") {
      const imports = deriveApplicationRecoveryImports(input);
      expect(
        imports.some(
          (item) => item.type === "stackit_objectstorage_credentials_group",
        ),
      ).toBe(false);
    } else
      expect(() => deriveApplicationRecoveryImports(input)).toThrow(
        "cloud-resource-ambiguous",
      );
  },
);
