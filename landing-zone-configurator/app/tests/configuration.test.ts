import {
  buildConfiguration,
  catalogue,
  createDraft,
  folderDefaults,
  objectValue,
  readSavedDraft,
  savedDraft,
  serializeTfvars,
  type Template,
  validateDraft,
} from "@lzc/domain";
import { describe, expect, it } from "vitest";

const template = catalogue.templates.find(
  (t) => t.id === "standalone",
) as Template;
function validDraft() {
  const draft = createDraft(template);
  draft.organization = "11111111-2222-3333-4444-555555555555";
  draft.owner = "owner@stackit.cloud";
  for (const p of draft.projects) p.owner = draft.owner;
  for (const s of draft.sandboxes) s.owner = draft.owner;
  return draft;
}

describe("standalone configuration", () => {
  it("rejects placeholder identity and duplicate project keys before download", () => {
    expect(validateDraft(createDraft(template)).map((i) => i.field)).toContain(
      "organization",
    );
    const draft = validDraft();
    expect(validateDraft(draft)).toEqual([]);
    const first = draft.projects[0];
    if (!first) throw new Error("missing template project");
    draft.projects.push({ ...first, id: "another" });
    expect(validateDraft(draft)).toContainEqual({
      field: "project.another.key",
      message: "Diese Kennung wird bereits verwendet.",
    });
  });
  it("preserves unknown fields and roles, isolates source and makes projects non-corporate", () => {
    const source = structuredClone(template);
    source.values.future_feature = { nested: [true, "kept"] };
    const project = objectValue(
      objectValue(source.values.landing_zones)["public-exmpl"],
    );
    project.role_assignments = [
      { role: "project.reader", subject: "audit@stackit.cloud" },
    ];
    const before = JSON.stringify(source);
    const draft = validDraft();
    const first = draft.projects[0];
    if (!first) throw new Error("missing template project");
    first.key = "renamed";
    first.name = "My API";
    const values = buildConfiguration(source, draft);
    expect(values.future_feature).toEqual(source.values.future_feature);
    const generated = objectValue(objectValue(values.landing_zones).renamed);
    expect(generated.corporate).toBe(false);
    expect(generated.project_name).toBe("My API");
    expect(generated.role_assignments).toEqual(project.role_assignments);
    expect(objectValue(values.landing_zones)["public-exmpl"]).toBeUndefined();
    expect(JSON.stringify(source)).toBe(before);
  });
  it("handles deleting and adding projects without resurrecting removed entries", () => {
    const draft = validDraft();
    draft.projects = [
      {
        id: "new",
        sourceKey: null,
        key: "new",
        name: "New project",
        code: "new",
        owner: draft.owner,
        environment: "dev",
        secretsManager: false,
      },
    ];
    draft.sandboxes = [];
    const values = buildConfiguration(template, draft);
    expect(Object.keys(objectValue(values.landing_zones))).toEqual(["new"]);
    expect(values.sandboxes).toEqual([]);
    expect(
      objectValue(objectValue(values.landing_zones).new).secretsmanager_enabled,
    ).toBe(false);
  });
  it("refuses to flatten unsupported network templates", () => {
    const network = catalogue.templates.find(
      (t) => t.id === "hub-and-spoke",
    ) as Template;
    expect(() => createDraft(network)).toThrow("not supported");
    expect(() => buildConfiguration(network, validDraft())).toThrow(
      "not supported",
    );
  });
});

it("keeps legacy export bytes stable and versions folder edits without changing stable keys or roles", () => {
  const draft = validDraft();
  const id = "11111111-2222-4333-8444-555555555555";
  const legacy = savedDraft(id, draft);
  const before = serializeTfvars(buildConfiguration(template, draft));
  expect(legacy.schemaVersion).toBe(1);
  expect(readSavedDraft(legacy).draft.folders).toBeUndefined();
  expect(
    serializeTfvars(buildConfiguration(template, readSavedDraft(legacy).draft)),
  ).toBe(before);
  expect(before).not.toContain("rm_folders =");
  draft.folders = {
    ...folderDefaults,
    platform: "Plattform",
    landing_zones_public: "Anwendungen",
  };
  const source = structuredClone(template);
  source.values.rm_folders = {
    platform: {
      name: "Bisher",
      owner_emails: ["admin@stackit.cloud"],
      reader_emails: ["audit@stackit.cloud"],
    },
  };
  const edited = savedDraft(id, draft);
  expect(edited.schemaVersion).toBe(2);
  expect(readSavedDraft(edited).draft.folders).toEqual(draft.folders);
  const folders = objectValue(buildConfiguration(source, draft).rm_folders);
  expect(Object.keys(folders).sort()).toEqual(
    Object.keys(folderDefaults).sort(),
  );
  expect(folders.platform).toEqual({
    name: "Plattform",
    owner_emails: ["admin@stackit.cloud"],
    reader_emails: ["audit@stackit.cloud"],
  });
  expect(() => readSavedDraft({ ...edited, schemaVersion: 1 })).toThrow(
    "version 2",
  );
  expect(() => readSavedDraft({ ...legacy, schemaVersion: 2 })).toThrow(
    "version 2",
  );
  draft.folders.platform = " ";
  expect(validateDraft(draft).map((i) => i.field)).toContain("folder.platform");
  draft.folders.platform = "a".repeat(41);
  expect(() => savedDraft(id, draft)).toThrow("Invalid configuration");
});
