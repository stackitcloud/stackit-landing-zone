import { randomUUID } from "node:crypto";
import {
  createEditorConfiguration,
  defaultApplicationAccessProfile,
  previewApplicationAccessTransition,
  projectTemplates,
  readCommonConfiguration,
  updateProjectTemplate,
  validateApplicationAccessProfile,
} from "@lzc/domain";
import { describe, expect, it } from "vitest";

import { legacyAccessTemplate as legacy } from "./fixtures/application-access-transition.js";

describe("explicit legacy Application access transition", () => {
  it("previews exact removed values without changing anything, then applies one validated patch preserving unrelated data", () => {
    const draft = readCommonConfiguration({
      ...createEditorConfiguration("standalone", randomUUID()),
      projectTemplates: [legacy],
    });
    const before = structuredClone(draft);
    const current = projectTemplates(draft)[0];
    if (!current) throw new Error("Expected legacy template");
    const preview = previewApplicationAccessTransition(current);
    expect(preview.removed).toEqual([
      { path: "settings.custom_roles", value: legacy.settings.custom_roles },
      {
        path: "settings.role_assignments",
        value: legacy.settings.role_assignments,
      },
      {
        path: "settings.automation_role",
        value: legacy.settings.automation_role,
      },
      {
        path: "parameterPolicy.fields.role_assignments",
        value: legacy.parameterPolicy?.fields.role_assignments,
      },
    ]);
    // Merely previewing (and abandoning/cancelling the preview) never writes a draft.
    expect(draft).toEqual(before);
    expect(current).toEqual(legacy);
    const next = updateProjectTemplate(draft, current.id, preview.patch);
    const expected = structuredClone(legacy);
    for (const field of [
      "custom_roles",
      "role_assignments",
      "automation_role",
      "initial_owner_email",
    ])
      delete expected.settings[field];
    if (expected.parameterPolicy)
      delete expected.parameterPolicy.fields.role_assignments;
    expected.accessProfile = defaultApplicationAccessProfile();
    expect(projectTemplates(next)).toEqual([expected]);
    expect({ ...next, projectTemplates: before.projectTemplates }).toEqual(
      before,
    );
    expect(expected.accessProfile.initialOwnerEmail).toBe("");
    expect(draft).toEqual(before);
    expect(() =>
      validateApplicationAccessProfile(
        preview.patch.accessProfile,
        legacy.settings,
        legacy.parameterPolicy?.fields.role_assignments,
      ),
    ).toThrow(/kombiniert/);
    expect(() =>
      updateProjectTemplate(draft, current.id, {
        accessProfile: defaultApplicationAccessProfile(),
      }),
    ).toThrow(/kombiniert/);
  });
  it("also previews and removes an explicit initial-owner override if retained in raw metadata", () => {
    const raw = {
      ...legacy,
      settings: {
        ...legacy.settings,
        initial_owner_email: "previous-central@example.test",
      },
    };
    const before = structuredClone(raw);
    const preview = previewApplicationAccessTransition(raw);
    expect(preview.removed).toContainEqual({
      path: "settings.initial_owner_email",
      value: "previous-central@example.test",
    });
    expect(preview.patch.settings).not.toHaveProperty("initial_owner_email");
    expect(preview.patch.accessProfile).toEqual(
      defaultApplicationAccessProfile(),
    );
    expect(raw).toEqual(before);
  });
  it("preserves absent policies and refuses to overwrite an existing profile or a Sandbox", () => {
    const minimal = {
      ...legacy,
      settings: { env: "dev" },
      parameterPolicy: undefined,
      namespaceServices: undefined,
    };
    const preview = previewApplicationAccessTransition(minimal);
    expect(preview.removed).toEqual([]);
    expect(preview.patch).not.toHaveProperty("parameterPolicy");
    expect(minimal.accessProfile).toBeUndefined();
    expect(() =>
      previewApplicationAccessTransition({
        ...minimal,
        accessProfile: defaultApplicationAccessProfile(),
      }),
    ).toThrow();
    expect(() =>
      previewApplicationAccessTransition({ ...minimal, kind: "sandbox" }),
    ).toThrow();
  });
});
