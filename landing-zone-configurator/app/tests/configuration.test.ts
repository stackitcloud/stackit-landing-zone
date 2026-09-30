import {
  buildConfiguration,
  catalogue,
  createDraft,
  objectValue,
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
