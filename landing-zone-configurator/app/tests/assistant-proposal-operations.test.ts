import {
  applicationProjectPermissionNames,
  defaultApplicationAccessProfile,
  objectValue,
} from "@lzc/domain";
import { expect, it } from "vitest";
import { applyAssistantChanges } from "../apps/api/src/assistant/dialogue.js";
import { materializeConsultationChanges } from "../apps/api/src/assistant/proposal-operations.js";
import {
  assistantScenarioFixture,
  assistantScenarios,
} from "../scripts/assistant-scenarios.js";

function fixture() {
  const scenario = assistantScenarios.find(
    (entry) =>
      entry.id === "application-server-operations-permissions-proposal",
  )!;
  return assistantScenarioFixture(scenario);
}
it("unions official service rights for both principals without losing owner or unrelated rights", () => {
  const { draft, values } = fixture();
  const before = structuredClone(draft);
  const changes = materializeConsultationChanges(
    ["permissions", "automationPermissions"].map((principal) => ({
      path: `projectTemplates.central.accessProfile.${principal}`,
      operation: "union",
      value: {
        catalogueServices: ["server-backup", "server-update", "run-command"],
      },
    })),
    values,
  );
  expect(changes).toHaveLength(1);
  const candidate = applyAssistantChanges(draft, changes);
  const original = before.projectTemplates!.find(
    (entry) => entry.key === "central",
  )!;
  const actual = candidate.projectTemplates!.find(
    (entry) => entry.key === "central",
  )!;
  if (
    actual.accessProfile?.mode !== "granular" ||
    original.accessProfile?.mode !== "granular"
  )
    throw Error("fixture");
  expect(actual.accessProfile.initialOwnerEmail).toBe(
    original.accessProfile.initialOwnerEmail,
  );
  for (const principal of ["permissions", "automationPermissions"] as const) {
    expect(actual.accessProfile?.mode).toBe("granular");
    if (
      actual.accessProfile?.mode !== "granular" ||
      original.accessProfile?.mode !== "granular"
    )
      throw Error("fixture");
    expect(actual.accessProfile[principal]).toEqual([
      ...new Set([
        ...original.accessProfile[principal],
        ...applicationProjectPermissionNames.filter((permission) =>
          ["server-backup", "server-update", "run-command"].includes(
            permission.split(".")[0]!,
          ),
        ),
      ]),
    ]);
  }
  expect({ ...actual, accessProfile: original.accessProfile }).toEqual(
    original,
  );
  expect(draft).toEqual(before);
});
it("materializes the registered native preset without making the model reproduce hundreds of permissions", () => {
  const { draft, values } = fixture();
  const changes = materializeConsultationChanges(
    [
      {
        path: "projectTemplates.central.accessProfile",
        operation: "preset",
        value: {
          id: "application-workloads-v1",
          initialOwnerEmail: "platform-owner@example.test",
        },
      },
    ],
    values,
  );
  const actual = applyAssistantChanges(draft, changes).projectTemplates!.find(
    (entry) => entry.key === "central",
  )!;
  expect(actual.accessProfile).toEqual(
    defaultApplicationAccessProfile("platform-owner@example.test"),
  );
});
it("retains preceding local preset and principal changes in a combined operation", () => {
  const { values } = fixture();
  const changes = materializeConsultationChanges(
    [
      {
        path: "projectTemplates.central.accessProfile",
        operation: "preset",
        value: {
          id: "application-vm-v1",
          initialOwnerEmail: "platform-owner@example.test",
        },
      },
      {
        path: "projectTemplates.central.accessProfile.permissions",
        operation: "union",
        value: ["ske.cluster.get"],
      },
      {
        path: "projectTemplates.central.accessProfile.automationPermissions",
        operation: "union",
        value: ["ske.cluster.get"],
      },
    ],
    values,
  );
  const profile = objectValue(
    objectValue(objectValue(changes[0]!.value).central).accessProfile,
  );
  expect(profile.permissions).toContain("ske.cluster.get");
  expect(profile.automationPermissions).toContain("ske.cluster.get");
  expect(profile.initialOwnerEmail).toBe("platform-owner@example.test");
});
it.each([
  {
    path: "projectTemplates.central.accessProfile.permissions",
    operation: "union" as const,
    value: { catalogueServices: ["invented-service"] },
  },
  {
    path: "projectTemplates.new.accessProfile",
    operation: "preset" as const,
    value: { id: "application-workloads-v1" },
  },
  {
    path: "projectTemplates.central.accessProfile",
    operation: "preset" as const,
    value: { id: "invented-preset" },
  },
  {
    path: "projectTemplates.__proto__.permissions",
    operation: "union" as const,
    value: [],
  },
])("rejects unknown or unsafe transformation %s", (change) => {
  expect(() =>
    materializeConsultationChanges([change], fixture().values),
  ).toThrow();
});

it("materializes one business operation for all requested principals without copying their different existing rights", () => {
  const { draft, values } = fixture();
  const changes = materializeConsultationChanges(
    [
      {
        path: "projectTemplates",
        operation: "add_permissions",
        value: {
          templateKeys: ["central"],
          principals: ["requester", "automation"],
          source: {
            kind: "services",
            ids: ["server-backup", "server-update", "run-command"],
          },
        },
      },
    ],
    values,
  );
  const actual = applyAssistantChanges(draft, changes).projectTemplates!.find(
    (entry) => entry.key === "central",
  )!;
  if (actual.accessProfile?.mode !== "granular") throw Error("fixture");
  expect(actual.accessProfile.permissions).toContain(
    "resource-manager.project.get",
  );
  expect(actual.accessProfile.automationPermissions).not.toContain(
    "resource-manager.project.get",
  );
  const services = applicationProjectPermissionNames.filter((permission) =>
    /^(server-backup|server-update|run-command)\./.test(permission),
  );
  for (const permission of services) {
    expect(actual.accessProfile.permissions).toContain(permission);
    expect(actual.accessProfile.automationPermissions).toContain(permission);
  }
});

it("materializes the explicit full Owner preset as its complete native variant", () => {
  const current = {
    projectTemplates: {
      central: {
        accessProfile: {
          schemaVersion: 1,
          mode: "granular",
          initialOwnerEmail: "owner@example.test",
          permissions: ["iaas.server.get"],
          automationPermissions: [],
        },
        settings: { region: "eu01" },
      },
    },
  };
  expect(
    materializeConsultationChanges(
      [
        {
          path: "projectTemplates.central.accessProfile",
          operation: "preset",
          value: { id: "owner" },
        },
      ],
      current,
    ),
  ).toEqual([
    {
      path: "projectTemplates",
      operation: "merge",
      value: {
        central: { accessProfile: { schemaVersion: 1, mode: "owner" } },
      },
    },
  ]);
  expect(current.projectTemplates.central.accessProfile.mode).toBe("granular");
  expect(() =>
    materializeConsultationChanges(
      [
        {
          path: "projectTemplates.central.accessProfile",
          operation: "preset",
          value: { id: "owner", initialOwnerEmail: "owner@example.test" },
        },
      ],
      current,
    ),
  ).toThrow("assistant_owner_preset_parameter");
});

it("retains an earlier owner edit when the same local batch adds permissions", () => {
  const current = {
    projectTemplates: {
      central: {
        accessProfile: {
          schemaVersion: 1,
          mode: "granular",
          initialOwnerEmail: "old@example.test",
          permissions: ["iaas.server.get"],
          automationPermissions: ["ske.cluster.get"],
        },
      },
    },
  };
  const result = materializeConsultationChanges(
    [
      {
        path: "projectTemplates.central.accessProfile.initialOwnerEmail",
        operation: "replace",
        value: "new@example.test",
      },
      {
        path: "projectTemplates",
        operation: "add_permissions",
        value: {
          templateKeys: ["central"],
          principals: ["requester"],
          source: { kind: "permissions", ids: ["iaas.server.delete"] },
        },
      },
    ],
    current,
  );
  expect(result).toEqual([
    {
      path: "projectTemplates",
      operation: "merge",
      value: {
        central: {
          accessProfile: {
            schemaVersion: 1,
            mode: "granular",
            initialOwnerEmail: "new@example.test",
            permissions: ["iaas.server.get", "iaas.server.delete"],
            automationPermissions: ["ske.cluster.get"],
          },
        },
      },
    },
  ]);
  expect(current.projectTemplates.central.accessProfile.initialOwnerEmail).toBe(
    "old@example.test",
  );
});
