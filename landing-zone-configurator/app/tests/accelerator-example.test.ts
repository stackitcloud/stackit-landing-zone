import { randomUUID } from "node:crypto";
import {
  acceleratorExampleValues,
  addProjectTemplate,
  catalogue,
  compileCommonConfiguration,
  createCommonConfiguration,
  createEditorConfiguration,
  exportAcceleratorExample,
  exportCommonTfvars,
  objectValue,
  projectTemplates,
  updateProjectTemplate,
  validatePublicInputs,
} from "@lzc/domain";
import { expect, it } from "vitest";

it.each(catalogue.templates.map((t) => t.id))(
  "exports %s template drafts as native projects without changing hosted inputs",
  (id) => {
    const draft = createEditorConfiguration(id, randomUUID());
    const before = structuredClone(draft);
    const values = acceleratorExampleValues(draft);
    expect(validatePublicInputs(values)).toEqual([]);
    expect(Object.keys(objectValue(values.landing_zones))).toEqual(
      projectTemplates(draft)
        .filter((t) => t.kind !== "sandbox")
        .map((t) => t.key),
    );
    expect(values.sandboxes).toHaveLength(
      projectTemplates(draft).filter((t) => t.kind === "sandbox").length,
    );
    expect(compileCommonConfiguration(draft).landing_zones).toEqual({});
    expect(exportCommonTfvars(draft)).not.toContain("application-automation");
    expect(draft).toEqual(before);
    const text = exportAcceleratorExample(draft);
    expect(text).toMatch(/^# Native STACKIT/);
    expect(text).toMatch(/# Accelerator source: [a-f0-9]{40}/);
    for (const field of [
      "projectTemplates",
      "accessProfile",
      "parameterPolicy",
      "initial_owner_email",
    ])
      expect(text).not.toContain(`"${field}"`);
  },
);

it("preserves legacy concrete configurations, including explicit nulls", () => {
  const draft = createCommonConfiguration("standalone", randomUUID());
  expect(acceleratorExampleValues(draft)).toEqual(
    compileCommonConfiguration(draft),
  );
});

it("exports granular SKE rights, distinct automation rights and central ownership", () => {
  let draft = createEditorConfiguration("standalone", randomUUID());
  const template = projectTemplates(draft).find((t) => t.kind === "public");
  if (!template) throw new Error("Missing public fixture");
  draft = updateProjectTemplate(draft, template.id, {
    accessProfile: {
      schemaVersion: 1,
      mode: "granular",
      initialOwnerEmail: "platform@sa.example.com",
      permissions: ["ske.cluster.create", "ske.cluster.get"],
      automationPermissions: ["ske.cluster.get"],
    },
    settings: {
      network_enabled: true,
      network_prefix_length: 25,
      secretsmanager_enabled: false,
    },
    parameterPolicy: {
      schema_version: 1,
      fields: {
        env: { source: "input", required: true, choices: ["test", "prod"] },
      },
    },
  });
  const native = objectValue(
    objectValue(acceleratorExampleValues(draft).landing_zones)[template.key],
  );
  expect(native).toMatchObject({
    project_name: template.key,
    project_code: template.key,
    owner_email: "platform@sa.example.com",
    corporate: false,
    env: "test",
    network_enabled: true,
    network_prefix_length: 25,
    secretsmanager_enabled: false,
    automation_role: "application-automation",
    custom_roles: [
      {
        name: "application-workload",
        permissions: ["ske.cluster.create", "ske.cluster.get"],
      },
      { name: "application-automation", permissions: ["ske.cluster.get"] },
    ],
    role_assignments: [
      { role: "application-workload", subject: `${template.key}@example.com` },
    ],
  });
});

it("retains fixed roles and resolves requester context and parameter defaults", () => {
  const draft = createEditorConfiguration("hub-and-spoke", randomUUID());
  const template = projectTemplates(draft).find((t) => t.kind === "corporate");
  if (!template) throw new Error("Missing corporate fixture");
  const changed = updateProjectTemplate(draft, template.id, {
    settings: {
      ...template.settings,
      role_assignments: [{ role: "reader", subject: "audit@example.com" }],
    },
    parameterPolicy: {
      schema_version: 1,
      fields: {
        env: {
          source: "input",
          required: true,
          default: "prod",
          choices: ["dev", "prod"],
        },
        role_assignments: {
          source: "context",
          variable: "verified-project-owner",
          roles: ["project.member"],
        },
      },
    },
  });
  expect(
    objectValue(acceleratorExampleValues(changed).landing_zones)[template.key],
  ).toMatchObject({
    corporate: true,
    env: "prod",
    role_assignments: [
      { role: "reader", subject: "audit@example.com" },
      { role: "project.member", subject: `${template.key}@example.com` },
    ],
  });
});

it("uses a visible placeholder when a granular draft has no central owner yet", () => {
  let draft = addProjectTemplate(
    createEditorConfiguration("standalone", randomUUID()),
    "public",
    "another",
  );
  const template = projectTemplates(draft).find((t) => t.key === "another");
  if (template?.accessProfile?.mode !== "granular")
    throw new Error("Missing granular fixture");
  draft = updateProjectTemplate(draft, template.id, {
    accessProfile: { ...template.accessProfile, initialOwnerEmail: "" },
  });
  expect(
    objectValue(acceleratorExampleValues(draft).landing_zones).another,
  ).toMatchObject({ owner_email: "central-owner@example.com" });
});

it("retains namespace service settings under the exported project key", () => {
  const draft = createEditorConfiguration("hub-and-spoke", randomUUID());
  const template = projectTemplates(draft).find((t) => t.kind === "corporate");
  if (!template) throw new Error("Missing corporate fixture");
  const namespace = { namespace: "sample", labels: { workload: "sample" } };
  const changed = updateProjectTemplate(draft, template.id, {
    namespaceServices: namespace,
  });
  expect(
    objectValue(
      acceleratorExampleValues(changed).landing_zone_namespace_services,
    )[template.key],
  ).toEqual(namespace);
});

it("preserves the deliberate Owner profile without creating granular roles", () => {
  const draft = createEditorConfiguration("standalone", randomUUID());
  const template = projectTemplates(draft).find((t) => t.kind === "public");
  if (!template) throw new Error("Missing public fixture");
  const changed = updateProjectTemplate(draft, template.id, {
    accessProfile: { schemaVersion: 1, mode: "owner" },
  });
  expect(
    objectValue(acceleratorExampleValues(changed).landing_zones)[template.key],
  ).toMatchObject({
    owner_email: `${template.key}@example.com`,
    automation_role: "owner",
  });
  expect(
    objectValue(
      objectValue(acceleratorExampleValues(changed).landing_zones)[
        template.key
      ],
    ).custom_roles ?? [],
  ).toEqual([]);
});

it("refuses symbolic network ACLs instead of broadening them during export", () => {
  const draft = createEditorConfiguration("standalone", randomUUID());
  const template = projectTemplates(draft).find((t) => t.kind === "public");
  if (!template) throw new Error("Missing public fixture");
  const changed = updateProjectTemplate(draft, template.id, {
    settings: { ...template.settings, network_enabled: true },
    parameterPolicy: {
      schema_version: 1,
      fields: {
        "observability.acl": {
          source: "binding",
          binding: "own-project-network",
        },
      },
    },
  });
  expect(() => exportAcceleratorExample(changed)).toThrow(
    "explizite Zugriffsquellen",
  );
  expect(compileCommonConfiguration(changed).landing_zones).toEqual({});
});
