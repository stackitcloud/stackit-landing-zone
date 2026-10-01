import { randomUUID } from "node:crypto";
import {
  addProjectTemplate,
  catalogue,
  commonNetworkAreas,
  commonProjects,
  compileCommonConfiguration,
  createCommonConfiguration,
  createEditorConfiguration,
  createPlatformDraftCopy,
  editCommonInput,
  exportCommonTfvars,
  objectValue,
  projectTemplateIssues,
  projectTemplates,
  readCommonConfiguration,
  removeCommonNetworkArea,
  removeProjectTemplate,
  updateProjectTemplate,
} from "@lzc/domain";
import { expect, it } from "vitest";

it.each(catalogue.templates.map((template) => template.id))(
  "creates platform-only %s drafts without losing project policies",
  (templateId) => {
    const source = createCommonConfiguration(templateId, randomUUID());
    const before = compileCommonConfiguration(source);
    const draft = createEditorConfiguration(templateId, randomUUID());
    const values = compileCommonConfiguration(draft);
    expect(values.landing_zones).toEqual({});
    expect(values.sandboxes).toEqual([]);
    expect(values.landing_zone_namespace_services).toEqual({});
    expect(commonProjects(draft)).toEqual([]);
    expect(projectTemplates(draft)).toHaveLength(commonProjects(source).length);
    for (const template of projectTemplates(draft)) {
      for (const field of [
        "project_name",
        "project_code",
        "owner_email",
        "project_owner_email",
        "corporate",
        "region",
      ])
        expect(template.settings).not.toHaveProperty(field);
    }
    for (const [key, value] of Object.entries(before))
      if (
        ![
          "landing_zones",
          "sandboxes",
          "landing_zone_namespace_services",
        ].includes(key)
      )
        expect(values[key]).toEqual(value);
    expect(compileCommonConfiguration(source)).toEqual(before);
    expect(source.projectTemplates).toBeUndefined();
    expect(exportCommonTfvars(draft)).not.toContain("projectTemplates");
  },
);
it("requires explicit new identity for a copy and never permits instances in a platform draft", () => {
  const source = createCommonConfiguration("standalone", randomUUID());
  expect(() => createPlatformDraftCopy(source, source.id)).toThrow("neue");
  const draft = createPlatformDraftCopy(source, randomUUID());
  expect(() =>
    editCommonInput(
      draft,
      "landing_zones",
      source.features.projects.landing_zones,
    ),
  ).toThrow("Projektinstanzen");
  expect(() =>
    editCommonInput(draft, "sandboxes", [
      { project_name: "Hidden", project_owner_email: "owner@stackit.cloud" },
    ]),
  ).toThrow("Projektinstanzen");
  expect(readCommonConfiguration(source)).toEqual(source);
});
it("retains namespace service policies in metadata and refuses orphan conversion", () => {
  const source = createCommonConfiguration("hub-and-spoke", randomUUID());
  const key = Object.keys(
    objectValue(source.features.projects.landing_zones),
  )[0] as string;
  const namespace = {
    namespace: "retained",
    secrets_enforcement: { enabled: true, mode: "strict" },
    labels: { team: "app" },
  };
  const withNamespace = editCommonInput(
    source,
    "landing_zone_namespace_services",
    { [key]: namespace },
  );
  const copy = createPlatformDraftCopy(withNamespace, randomUUID());
  expect(
    projectTemplates(copy).find((template) => template.key === key)
      ?.namespaceServices,
  ).toEqual(namespace);
  expect(
    compileCommonConfiguration(copy).landing_zone_namespace_services,
  ).toEqual({});
  expect(
    projectTemplateIssues(copy).filter((issue) =>
      issue.field.endsWith("namespaceServices"),
    ),
  ).toEqual([]);
  const orphan = editCommonInput(source, "landing_zone_namespace_services", {
    missing: namespace,
  });
  expect(() => createPlatformDraftCopy(orphan, randomUUID())).toThrow(
    "kein zugehöriges Projekt",
  );
});
it("edits independent template drafts, validates settings and keeps referenced SNAs", () => {
  let draft = createEditorConfiguration("standalone", randomUUID());
  draft = addProjectTemplate(draft, "public", "application");
  const template = projectTemplates(draft).find(
    (entry) => entry.key === "application",
  );
  if (!template) throw new Error("Missing template fixture");
  draft = updateProjectTemplate(draft, template.id, {
    name: "My template",
    settings: {
      secretsmanager_enabled: false,
      observability: { enabled: true },
    },
  });
  expect(
    projectTemplates(draft).find((entry) => entry.id === template.id)?.settings,
  ).toEqual({
    secretsmanager_enabled: false,
    observability: { enabled: true },
  });
  expect(() =>
    updateProjectTemplate(draft, template.id, {
      settings: { owner_email: "app@stackit.cloud" },
    }),
  ).toThrow("Eigentümerkennung");
  expect(() =>
    updateProjectTemplate(draft, template.id, {
      settings: { unknown_feature: true },
    }),
  ).toThrow("Ungültige");
  expect(() => addProjectTemplate(draft, "corporate", "application")).toThrow(
    "existiert",
  );
  expect(
    projectTemplates(removeProjectTemplate(draft, template.id)).some(
      (entry) => entry.id === template.id,
    ),
  ).toBe(false);
  const network = createEditorConfiguration("hub-and-spoke", randomUUID());
  const area = commonNetworkAreas(network)[0];
  if (!area) throw new Error("Missing area fixture");
  expect(() => removeCommonNetworkArea(network, area.id)).toThrow("referenced");
  const corporate = projectTemplates(network).find(
    (entry) => entry.kind === "corporate",
  );
  if (!corporate) throw new Error("Missing corporate fixture");
  const changed = updateProjectTemplate(network, corporate.id, {
    region: "eu02",
  });
  expect(
    projectTemplateIssues(changed).some((issue) =>
      issue.field.includes(corporate.id),
    ),
  ).toBe(true);
});
