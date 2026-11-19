import { defaultApplicationAccessProfile } from "@lzc/domain";
import { expect, it } from "vitest";
import {
  consultationCompilerEvidence,
  consultationProposalDiff,
  consultationTemplateReadiness,
} from "../apps/api/src/assistant/proposal-diff.js";

it("reports granular publication prerequisites without exposing unchanged owner identities", () => {
  const readiness = consultationTemplateReadiness({
    projectTemplates: {
      missing: {
        kind: "public",
        accessProfile: { mode: "granular", initialOwnerEmail: "" },
      },
      existing: {
        kind: "corporate",
        accessProfile: {
          mode: "granular",
          initialOwnerEmail: "private@example.invalid",
        },
      },
      owner: { kind: "public", accessProfile: { mode: "owner" } },
      legacy: {
        kind: "corporate",
        settings: { custom_roles: { private: "value" } },
      },
    },
  });
  expect(
    readiness
      .filter((template) => template.requiresInitialOwnerBeforePublication)
      .map((template) => template.key),
  ).toEqual(["missing"]);
  expect(
    readiness.find((template) => template.key === "legacy")?.legacyInputs,
  ).toEqual(["custom_roles"]);
  expect(JSON.stringify(readiness)).not.toContain("private@example.invalid");
  expect(JSON.stringify(readiness)).not.toContain('"value"');
});

import {
  type ConsultationChange,
  materializeConsultationChanges,
} from "../apps/api/src/assistant/proposal-operations.js";

it("compacts only compiler-matching presets, retaining product removals and omitting unchanged identity", () => {
  const before = {
    projectTemplates: {
      central: {
        accessProfile: {
          ...defaultApplicationAccessProfile("private@example.invalid", "vm"),
          permissions: ["ske.cluster.get"],
        },
      },
    },
  };
  const profile = defaultApplicationAccessProfile("private@example.invalid");
  const candidate = {
    projectTemplates: { central: { accessProfile: profile } },
  };
  const operations: ConsultationChange[] = [
    {
      path: "projectTemplates.central.accessProfile",
      operation: "preset",
      value: {
        id: "application-workloads-v1",
        initialOwnerEmail: "private@example.invalid",
      },
    },
  ];
  const delta = consultationProposalDiff(before, candidate);
  const evidence = consultationCompilerEvidence(
    candidate,
    operations,
    materializeConsultationChanges(operations, before),
    delta,
  );
  expect(evidence.verifiedOperations).toEqual([
    {
      kind: "registered-preset",
      source: "application-workloads-v1",
      templates: ["central"],
      principals: ["requester", "automation"],
    },
  ]);
  expect(evidence.compilerDelta).toContainEqual(
    expect.objectContaining({
      path: "projectTemplates.central.accessProfile.permissions",
      removedGroups: { ske: 1 },
      addedCount: expect.any(Number),
      verifiedOperation: 0,
      effectSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    }),
  );
  expect(JSON.stringify(evidence)).not.toContain("private@example.invalid");
  expect(JSON.stringify(evidence).length).toBeLessThan(
    JSON.stringify(delta).length / 2,
  );
  const reuseOwner: ConsultationChange[] = [
    { ...operations[0]!, value: { id: "application-workloads-v1" } },
  ];
  expect(
    consultationCompilerEvidence(
      candidate,
      reuseOwner,
      materializeConsultationChanges(reuseOwner, before),
      delta,
    ).verifiedOperations,
  ).toHaveLength(1);
});
it("keeps exact custom lists and mismatching compiler outputs fully visible", () => {
  const profile = defaultApplicationAccessProfile("owner@example.test");
  const before = {
    projectTemplates: {
      central: {
        accessProfile: defaultApplicationAccessProfile(
          "owner@example.test",
          "vm",
        ),
      },
    },
  };
  const candidate = {
    projectTemplates: { central: { accessProfile: profile } },
  };
  const replace: ConsultationChange[] = [
    {
      path: "projectTemplates.central.accessProfile",
      operation: "replace",
      value: profile,
    },
  ];
  const delta = consultationProposalDiff(before, candidate);
  expect(
    consultationCompilerEvidence(
      candidate,
      replace,
      materializeConsultationChanges(replace, before),
      delta,
    ),
  ).toEqual({ compilerDelta: delta, verifiedOperations: [] });
  const preset: ConsultationChange[] = [
    {
      ...replace[0]!,
      operation: "preset",
      value: {
        id: "application-workloads-v1",
        initialOwnerEmail: "owner@example.test",
      },
    },
  ];
  const tampered = structuredClone(candidate);
  tampered.projectTemplates.central.accessProfile.permissions.push(
    "iam.member.add",
  );
  const tamperedDelta = consultationProposalDiff(before, tampered);
  expect(
    consultationCompilerEvidence(
      tampered,
      preset,
      materializeConsultationChanges(preset, before),
      tamperedDelta,
    ),
  ).toEqual({ compilerDelta: tamperedDelta, verifiedOperations: [] });
});
it("proves selected catalogue unions but exposes overlapping batches in full", () => {
  const before = {
    projectTemplates: {
      central: {
        accessProfile: defaultApplicationAccessProfile(
          "owner@example.test",
          "vm",
        ),
      },
    },
  };
  const operations: ConsultationChange[] = [
    {
      path: "projectTemplates",
      operation: "add_permissions",
      value: {
        templateKeys: ["central"],
        principals: ["requester"],
        source: { kind: "services", ids: ["ske"] },
      },
    },
  ];
  const materialized = materializeConsultationChanges(operations, before);
  const after = { projectTemplates: materialized[0]!.value };
  const delta = consultationProposalDiff(before, after);
  const evidence = consultationCompilerEvidence(
    after,
    operations,
    materialized,
    delta,
  );
  expect(evidence.verifiedOperations).toHaveLength(1);
  expect(evidence.verifiedOperations[0]?.principals).toEqual(["requester"]);
  expect(
    evidence.compilerDelta.every(
      (entry) => !entry.path.endsWith("automationPermissions"),
    ),
  ).toBe(true);
  expect(
    consultationCompilerEvidence(
      after,
      [...operations, ...operations],
      materialized,
      delta,
    ),
  ).toEqual({ compilerDelta: delta, verifiedOperations: [] });
});

it("exposes removed rights and newly added product groups separately for each principal", () => {
  const before = {
    projectTemplates: {
      central: {
        accessProfile: {
          permissions: ["iaas.server.get", "ske.cluster.create"],
          automationPermissions: ["iaas.server.get"],
        },
      },
    },
  };
  const after = {
    projectTemplates: {
      central: {
        accessProfile: {
          permissions: [
            "iaas.server.get",
            "argus.instance.create",
            "server-backup.backup.create",
          ],
          automationPermissions: [
            "iaas.server.get",
            "server-backup.backup.create",
          ],
        },
      },
    },
  };
  expect(consultationProposalDiff(before, after)).toEqual([
    {
      path: "projectTemplates.central.accessProfile.permissions",
      added: ["argus.instance.create", "server-backup.backup.create"],
      removed: ["ske.cluster.create"],
      addedGroups: { argus: 1, "server-backup": 1 },
      removedGroups: { ske: 1 },
    },
    {
      path: "projectTemplates.central.accessProfile.automationPermissions",
      added: ["server-backup.backup.create"],
      removed: [],
      addedGroups: { "server-backup": 1 },
      removedGroups: {},
    },
  ]);
});
it("omits unchanged identity and IAM metadata, virtual aliases and harmless permission ordering", () => {
  const before = {
    rm_folders: {
      platform: { name: "Platform", owner_emails: ["private@example.invalid"] },
    },
    devops: { git_flavor: "git-100" },
    "assistant.user_email": "private-login@example.invalid",
    "devops.git_flavor": "git-100",
    projectTemplates: {
      central: {
        accessProfile: { permissions: ["iaas.server.get", "ske.cluster.get"] },
      },
    },
  };
  const after = structuredClone(before);
  after.rm_folders.platform.name = "New Platform";
  after.projectTemplates.central.accessProfile.permissions.reverse();
  const delta = consultationProposalDiff(before, after);
  expect(delta).toEqual([
    {
      path: "rm_folders.platform.name",
      before: "Platform",
      after: "New Platform",
    },
  ]);
  expect(JSON.stringify(delta)).not.toContain("private");
});
it("retains meaningful ordering changes for ordinary native arrays", () => {
  expect(
    consultationProposalDiff(
      { nameservers: ["1.1.1.1", "8.8.8.8"] },
      { nameservers: ["8.8.8.8", "1.1.1.1"] },
    ),
  ).toEqual([
    {
      path: "nameservers",
      before: ["1.1.1.1", "8.8.8.8"],
      after: ["8.8.8.8", "1.1.1.1"],
      added: [],
      removed: [],
    },
  ]);
});
