import {
  applicationServiceAccountKeyPermissions,
  defaultApplicationAccessProfile,
} from "@lzc/domain";
import { expect, it } from "vitest";
import { validateConsultationPermissionSources } from "../apps/api/src/assistant/permission-sources.js";
import type { ConsultationChange } from "../apps/api/src/assistant/proposal-operations.js";

const current = {
  projectTemplates: {
    central: {
      accessProfile: {
        schemaVersion: 1,
        mode: "granular",
        initialOwnerEmail: "owner@example.test",
        permissions: ["iaas.server.get"],
        automationPermissions: ["iaas.server.get"],
      },
    },
  },
};
const keys: ConsultationChange = {
  path: "projectTemplates",
  operation: "add_permissions",
  value: {
    templateKeys: ["central"],
    principals: ["requester"],
    source: { kind: "permission_set", id: "service-account-keys" },
  },
};
const proposal = (permissions: string[]) => [
  {
    path: "projectTemplates",
    value: {
      central: {
        accessProfile: {
          ...current.projectTemplates.central.accessProfile,
          permissions: ["iaas.server.get", ...permissions],
        },
      },
    },
  },
];
it("rejects a guessed Git service from a pipeline key-management purpose, including a materialized profile bypass", () => {
  const sources = [
    "Let the requester manage keys of the existing service account for pipelines.",
  ];
  expect(() =>
    validateConsultationPermissionSources(
      [keys],
      proposal([...applicationServiceAccountKeyPermissions]),
      current,
      sources,
    ),
  ).not.toThrow();
  for (const operations of [
    [],
    [keys],
    [
      keys,
      {
        path: "projectTemplates",
        operation: "add_permissions",
        value: {
          templateKeys: ["central"],
          principals: ["requester"],
          source: { kind: "services", ids: ["git"] },
        },
      },
    ],
  ] as ConsultationChange[][])
    expect(() =>
      validateConsultationPermissionSources(
        operations,
        proposal([
          ...applicationServiceAccountKeyPermissions,
          "git.instance.delete",
        ]),
        current,
        sources,
      ),
    ).toThrow("assistant_permission_service_unconfirmed");
});
it("allows actually named services and reviewed aliases while preserving existing unrelated rights", () => {
  expect(() =>
    validateConsultationPermissionSources(
      [],
      proposal(["git.instance.get", "ske.cluster.create"]),
      current,
      ["Add Git and Kubernetes rights for the requester."],
    ),
  ).not.toThrow();
  const before = structuredClone(current);
  before.projectTemplates.central.accessProfile.permissions.push(
    "git.instance.get",
  );
  expect(() =>
    validateConsultationPermissionSources(
      [keys],
      proposal([
        ...applicationServiceAccountKeyPermissions,
        "git.instance.get",
      ]),
      before,
      ["Manage service account keys."],
    ),
  ).not.toThrow();
});
it("does not turn quoted question alternatives into an additional service request", () => {
  expect(() =>
    validateConsultationPermissionSources(
      [],
      proposal(["git.instance.get"]),
      current,
      ["Choose Git or Kubernetes? My answer: Kubernetes"],
    ),
  ).toThrow("assistant_permission_service_unconfirmed");
});
it("allows registered native presets without requiring every included service to be named", () => {
  const operation: ConsultationChange = {
    path: "projectTemplates.central.accessProfile",
    operation: "preset",
    value: { id: "application-vm-v1" },
  };
  const profile = defaultApplicationAccessProfile("owner@example.test", "vm");
  expect(() =>
    validateConsultationPermissionSources(
      [operation],
      [
        {
          path: "projectTemplates",
          value: { central: { accessProfile: profile } },
        },
      ],
      current,
      ["Use the standard VM profile."],
    ),
  ).not.toThrow();
});
it("retains actual creation-default semantics for a new template and bounds explicit IAM edits", () => {
  const profile = defaultApplicationAccessProfile("owner@example.test");
  expect(() =>
    validateConsultationPermissionSources(
      [],
      [
        {
          path: "projectTemplates",
          value: { newTemplate: { accessProfile: profile } },
        },
      ],
      current,
      ["Add a new template."],
    ),
  ).not.toThrow();
  expect(() =>
    validateConsultationPermissionSources(
      [],
      proposal(["iam.service-account-key.get"]),
      current,
      ["Add exactly iam.service-account-key.get."],
    ),
  ).not.toThrow();
  expect(() =>
    validateConsultationPermissionSources(
      [],
      proposal(["iam.role.create"]),
      current,
      ["Allow IAM service-account key management."],
    ),
  ).toThrow("assistant_permission_service_unconfirmed");
});

it("allows an exact observed profile copy for a new template, without authorizing additions to an existing one", () => {
  const profile = {
    ...current.projectTemplates.central.accessProfile,
    permissions: ["git.instance.get"],
  };
  const values = { projectTemplates: { central: { accessProfile: profile } } };
  expect(() =>
    validateConsultationPermissionSources(
      [],
      [
        {
          path: "projectTemplates",
          value: { copy: { accessProfile: profile } },
        },
      ],
      values,
      ["Copy the existing template."],
    ),
  ).not.toThrow();
  expect(() =>
    validateConsultationPermissionSources(
      [],
      proposal(["git.instance.get"]),
      current,
      ["Only add key management."],
    ),
  ).toThrow("assistant_permission_service_unconfirmed");
});
