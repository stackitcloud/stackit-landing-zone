import {
  assistantProposalConflicts,
  assistantProposalFields,
  assistantValuesEqual,
  mergeAssistantDrafts,
  selectAssistantProposalFields,
} from "@lzc/contracts";
import { expect, it } from "vitest";

it.each([
  "projectTemplates",
  "connectivity.dns_zones",
  "connectivity_regions.eu01.dns_zones",
])(
  "reviews additions and removals separately for %s without erasing unchecked or concurrent entries",
  (path) => {
    const changes = [
      {
        path,
        operation: "replace" as const,
        before: { keep: { name: "Original" }, remove: { name: "Example" } },
        value: { keep: { name: "Updated" }, add: { name: "New" } },
      },
    ];
    const fields = assistantProposalFields(changes);
    expect(fields).toHaveLength(3);
    const removal = fields.find((field) => field.removesEntry);
    expect(removal).toMatchObject({
      keys: ["remove"],
      before: { name: "Example" },
      value: null,
    });
    const current = {
      [path]: {
        keep: { name: "Original" },
        remove: { name: "Locally edited" },
        concurrent: { name: "Independent" },
      },
    };
    const selected = fields
      .filter((field) => !field.removesEntry)
      .map((field) => field.id);
    expect(selectAssistantProposalFields(changes, selected, current)).toEqual([
      {
        path,
        operation: "replace",
        value: {
          keep: { name: "Updated" },
          remove: { name: "Locally edited" },
          concurrent: { name: "Independent" },
          add: { name: "New" },
        },
      },
    ]);
    expect(
      selectAssistantProposalFields(
        changes,
        fields.map((field) => field.id),
        current,
      )[0]?.value,
    ).toEqual({
      keep: { name: "Updated" },
      concurrent: { name: "Independent" },
      add: { name: "New" },
    });
    const partial = selectAssistantProposalFields(changes, selected, current);
    expect(
      selectAssistantProposalFields(changes, [`${path}/remove`], {
        [path]: partial[0]?.value,
      }),
    ).toEqual(
      selectAssistantProposalFields(
        changes,
        fields.map((field) => field.id),
        current,
      ),
    );
    expect(
      assistantProposalConflicts(
        removal ? [removal] : [],
        current,
        () => false,
      ),
    ).toHaveLength(1);
    expect(() => selectAssistantProposalFields(changes, [])).toThrow(
      "assistant_invalid_selection",
    );
    expect(
      assistantProposalFields(
        changes.map((change) => ({ ...change, baselineAvailable: false })),
      ),
    ).toHaveLength(1);
  },
);

it("compares JSON structurally without treating reordered object keys as edits", () => {
  expect(
    assistantValuesEqual(
      {
        firewall: { ha: { backup_zone: "eu01-2", vhid: 23 } },
        labels: { a: 1, b: 2 },
      },
      {
        labels: { b: 2, a: 1 },
        firewall: { ha: { vhid: 23, backup_zone: "eu01-2" } },
      },
    ),
  ).toBe(true);
  expect(assistantValuesEqual({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  expect(assistantValuesEqual({ a: null }, {})).toBe(false);
});

it("merges unrelated local and remote edits without confirmation", () => {
  expect(
    mergeAssistantDrafts(
      { name: "Original", parameters: { a: 1, b: 2 } },
      { name: "Local", parameters: { a: 1, b: 2 } },
      { name: "Original", parameters: { a: 1, b: 3 } },
    ),
  ).toEqual({
    value: { name: "Local", parameters: { a: 1, b: 3 } },
    conflicts: [],
  });
});

it("detects real editor conflicts without exposing protected field contents", () => {
  const result = mergeAssistantDrafts(
    { secret: "original", nested: { value: 1 } },
    { secret: "local", nested: { value: 2 } },
    { secret: "remote", nested: { value: 3 } },
  );
  expect(result.value).toEqual({ secret: "local", nested: { value: 2 } });
  expect(result.conflicts).toEqual([
    { kind: "editor", path: "secret" },
    { kind: "editor", path: "nested.value" },
  ]);
  expect(JSON.stringify(result.conflicts)).not.toMatch(/original|local|remote/);
});

it("preserves independent additions, deletions and unchanged remote arrays", () => {
  expect(
    mergeAssistantDrafts(
      { remove: 1, list: [1], entities: { a: { x: 1 } } },
      { list: [1], entities: { a: { x: 1 }, local: { x: 2 } } },
      { remove: 1, list: [1, 2], entities: { a: { x: 1 }, remote: { x: 3 } } },
    ),
  ).toEqual({
    value: {
      list: [1, 2],
      entities: { a: { x: 1 }, local: { x: 2 }, remote: { x: 3 } },
    },
    conflicts: [],
  });
});

it("requires confirmation when deleting a remotely edited object or changing the same array", () => {
  expect(
    mergeAssistantDrafts(
      { object: { x: 1 }, list: [1] },
      { list: [1, 2] },
      { object: { x: 2 }, list: [1, 3] },
    ).conflicts,
  ).toEqual([
    { kind: "editor", path: "object" },
    { kind: "editor", path: "list" },
  ]);
});

it("does not report identical local and remote changes as conflicts", () => {
  expect(mergeAssistantDrafts({ x: 1 }, { x: 2 }, { x: 2 })).toEqual({
    value: { x: 2 },
    conflicts: [],
  });
});

const changes = [
  {
    path: "connectivity.firewalls",
    before: { default: { ha: { backup_zone: "eu01-2", vhid: 1 } } },
    value: { default: { ha: { backup_zone: "eu01-3", vhid: 23 } } },
  },
];

it("compares only selected nested proposal fields, not unrelated native changes", () => {
  const fields = assistantProposalFields(changes).filter(
    (field) => field.keys.at(-1) === "backup_zone",
  );
  expect(
    assistantProposalConflicts(
      fields,
      {
        "connectivity.firewalls": {
          default: {
            name: "manually edited",
            ha: { backup_zone: "eu01-2", vhid: 55 },
          },
        },
      },
      () => true,
    ),
  ).toEqual([]);
});

it("reports exact original, current and proposed values for real target conflicts", () => {
  expect(
    assistantProposalConflicts(
      assistantProposalFields(changes),
      {
        "connectivity.firewalls": {
          default: { ha: { backup_zone: "eu01-1", vhid: 23 } },
        },
      },
      () => true,
    ),
  ).toEqual([
    {
      kind: "proposal",
      path: "connectivity.firewalls.default.ha.backup_zone",
      before: "eu01-2",
      current: "eu01-1",
      value: "eu01-3",
      baselineAvailable: true,
    },
  ]);
});

it("requires review for unknown legacy baselines, but not already desired values", () => {
  const result = assistantProposalConflicts(
    assistantProposalFields(changes),
    {
      "connectivity.firewalls": {
        default: { ha: { backup_zone: "eu01-3", vhid: 55 } },
      },
    },
    () => false,
  );
  expect(result).toEqual([
    {
      kind: "proposal",
      path: "connectivity.firewalls.default.ha.vhid",
      before: null,
      current: 55,
      value: 23,
      baselineAvailable: false,
    },
  ]);
});

it("preserves prototype-like JSON keys without modifying object prototypes", () => {
  const baseline = JSON.parse('{"__proto__":{"x":1},"constructor":1}');
  const local = JSON.parse('{"__proto__":{"x":2},"constructor":1}');
  const remote = JSON.parse('{"__proto__":{"x":1},"constructor":2}');
  const result = mergeAssistantDrafts(baseline, local, remote);
  expect(result.value).toEqual(
    JSON.parse('{"__proto__":{"x":2},"constructor":2}'),
  );
  expect(result.conflicts).toEqual([]);
  expect(Object.hasOwn({}, "x")).toBe(false);
});

it("selects a complete template access profile atomically and detects concurrent owner changes", () => {
  const before = {
    schemaVersion: 1,
    mode: "granular",
    initialOwnerEmail: "central@example.test",
    permissions: ["iaas.server.get"],
    automationPermissions: ["iaas.server.get"],
  };
  const after = {
    ...before,
    permissions: [...before.permissions, "ske.cluster.create"],
    automationPermissions: [
      ...before.automationPermissions,
      "ske.cluster.create",
    ],
  };
  const changes = [
    {
      path: "projectTemplates",
      operation: "merge" as const,
      before: {
        public: { accessProfile: before },
        corp: { accessProfile: before },
      },
      value: {
        public: { accessProfile: after },
        corp: { accessProfile: after },
      },
    },
  ];
  const fields = assistantProposalFields(changes);
  expect(fields.map((f) => f.id)).toEqual([
    "projectTemplates/public/accessProfile",
    "projectTemplates/corp/accessProfile",
  ]);
  const publicField = fields[0]!;
  expect(publicField.before).toEqual(before);
  expect(publicField.value).toEqual(after);
  expect(selectAssistantProposalFields(changes, [publicField.id])).toEqual([
    {
      path: "projectTemplates",
      operation: "merge",
      value: { public: { accessProfile: after } },
    },
  ]);
  expect(
    assistantProposalConflicts(
      [publicField],
      {
        projectTemplates: {
          public: {
            accessProfile: {
              ...before,
              initialOwnerEmail: "other@example.test",
            },
          },
        },
      },
      () => true,
    ).map((c) => c.path),
  ).toEqual(["projectTemplates.public.accessProfile"]);
  expect(() =>
    selectAssistantProposalFields(changes, [
      "projectTemplates/public/accessProfile/permissions",
    ]),
  ).toThrow("assistant_invalid_selection");
});
