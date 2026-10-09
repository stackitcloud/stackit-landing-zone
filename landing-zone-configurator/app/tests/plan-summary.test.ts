it.each([
  { actions: ["delete"] },
  { actions: ["delete", "create"] },
  { actions: ["create", "delete"] },
])(
  "rejects organization-folder destruction or replacement: $actions",
  ({ actions }) => {
    expect(() =>
      summarizePlan(
        plan({
          resource_changes: [
            { ...resource(actions), type: "stackit_resourcemanager_folder" },
          ],
        }),
        2,
      ),
    ).toThrow();
  },
);

it("allows an unchanged organization folder without weakening the destruction gate", () => {
  expect(
    summarizePlan(
      plan({
        resource_changes: [
          { ...resource(["no-op"]), type: "stackit_resourcemanager_folder" },
        ],
      }),
      0,
    ).result,
  ).toBe("no-changes");
});

import { expect, it } from "vitest";
import { summarizePlan } from "../apps/worker/src/plans/summary.js";
import { applicationPlanPreview } from "../packages/contracts/src/plan.js";

it("projects application resource details while masking sensitive and unknown values", () => {
  const preview = applicationPlanPreview(
    plan({
      resource_changes: [
        {
          mode: "managed",
          type: "stackit_resourcemanager_project",
          name: "application",
          address: `project["${secret}"]`,
          change: {
            actions: ["create"],
            before: null,
            after: {
              name: "Research",
              region: "eu01",
              description: secret,
              password: secret,
              unmarked: secret,
              project_id: secret,
            },
            after_sensitive: { description: true },
            after_unknown: { project_id: true },
          },
        },
      ],
    }),
  );
  expect(JSON.stringify(preview)).not.toContain(secret);
  expect(preview.resources[0]).toMatchObject({
    type: "stackit_resourcemanager_project",
    name: "application",
    action: "create",
  });
  expect(preview.resources[0]?.attributes).toContainEqual({
    name: "name",
    before: null,
    after: "Research",
    sensitive: false,
    unknown: false,
  });
  expect(preview.resources[0]?.attributes).toContainEqual({
    name: "description",
    before: null,
    after: null,
    sensitive: true,
    unknown: false,
  });
});

it("does not expose before-values when a value becomes sensitive", () => {
  const preview = applicationPlanPreview(
    plan({
      resource_changes: [
        {
          type: "stackit_network",
          name: "application",
          change: {
            actions: ["update"],
            before: { name: secret },
            after: { name: secret },
            before_sensitive: {},
            after_sensitive: true,
          },
        },
      ],
    }),
  );
  expect(JSON.stringify(preview)).not.toContain(secret);
  expect(preview.resources[0]?.attributes[0]?.sensitive).toBe(true);
});

const secret = "NEVER-EXPOSE-THIS-PRIVATE-VALUE";
it("separates state-to-cloud drift from cloud-to-desired changes and masks both", () => {
  const preview = applicationPlanPreview(
    plan({
      resource_drift: [
        {
          type: "stackit_network",
          name: "application",
          change: {
            actions: ["update"],
            before: { name: "Deployed", description: secret, password: secret },
            after: { name: "Cloud", description: secret },
            before_sensitive: { description: true },
            after_sensitive: { description: true },
          },
        },
      ],
      resource_changes: [
        {
          type: "stackit_network",
          name: "application",
          change: {
            actions: ["update"],
            before: { name: "Cloud", description: secret },
            after: { name: "Desired", description: secret },
            after_sensitive: { description: true },
          },
        },
      ],
    }),
  );
  expect(preview.drift[0]?.attributes).toContainEqual({
    name: "name",
    before: "Deployed",
    after: "Cloud",
    sensitive: false,
    unknown: false,
  });
  expect(preview.resources[0]?.attributes).toContainEqual({
    name: "name",
    before: "Cloud",
    after: "Desired",
    sensitive: false,
    unknown: false,
  });
  expect(JSON.stringify(preview)).not.toContain(secret);
});
function resource(actions: string[], mode = "managed") {
  return {
    mode,
    address: secret,
    type: secret,
    change: {
      actions,
      before: { password: secret },
      after: { unmarked: secret },
      after_sensitive: {},
    },
  };
}
function plan(extra: Record<string, unknown> = {}) {
  return {
    format_version: "1.2",
    errored: false,
    configuration: {},
    planned_values: {},
    ...extra,
  };
}

it("counts both replacement orders once and always disables apply", () => {
  const summary = summarizePlan(
    plan({
      resource_changes: [
        resource(["create"]),
        resource(["update"]),
        resource(["delete"]),
        resource(["delete", "create"]),
        resource(["create", "delete"]),
        resource(["read"], "data"),
        resource(["no-op"]),
      ],
    }),
    2,
  );
  expect(summary.resources).toEqual({
    create: 1,
    update: 1,
    delete: 1,
    replace: 2,
    read: 1,
    unchanged: 1,
  });
  expect(summary.destructive).toBe(true);
  expect(summary.applyAllowed).toBe(false);
  expect(summary.execution).toBe("plan-only");
});
it("never exports values, addresses, diagnostic text, output names or unknown metadata", () => {
  const summary = summarizePlan(
    plan({
      variables: { token: secret },
      resource_changes: [resource(["create"])],
      output_changes: { [secret]: { actions: ["create"], after: secret } },
      diagnostics: [{ detail: secret }],
      prior_state: { secret },
      future_metadata: secret,
      checks: [
        {
          status: "unknown",
          address: secret,
          instances: [{ problems: [{ message: secret }] }],
        },
      ],
    }),
    2,
  );
  expect(JSON.stringify(summary)).not.toContain(secret);
  expect(summary.changedOutputs).toBe(1);
  expect(summary.checks.unknown).toBe(1);
});
it("distinguishes output-only changes, drift and incomplete plans", () => {
  const summary = summarizePlan(
    plan({
      complete: false,
      resource_drift: [resource(["delete"])],
      output_changes: { value: { actions: ["update"] } },
    }),
    2,
  );
  expect(summary.result).toBe("changes");
  expect(summary.resources.delete).toBe(0);
  expect(summary.drift.delete).toBe(1);
  expect(summary.destructive).toBe(false);
  expect(summary.completeness).toBe("incomplete");
  expect(summarizePlan(plan(), 0).result).toBe("no-changes");
});
it("confirms completeness only for the verified pinned OpenTofu full-plan command", () => {
  const raw = plan({ terraform_version: "1.12.6" });
  expect(summarizePlan(raw, 0).completeness).toBe("not-reported");
  expect(summarizePlan(raw, 0, "opentofu-1.12.6").completeness).toBe(
    "complete",
  );
  expect(
    summarizePlan({ ...raw, complete: false }, 0, "opentofu-1.12.6")
      .completeness,
  ).toBe("incomplete");
});

it.each([
  { terraform_version: undefined },
  { terraform_version: "1.12.7" },
  { format_version: "1.3" },
  { deferred_changes: [] },
])(
  "does not infer OpenTofu completeness from unsupported evidence: %j",
  (extra) => {
    expect(
      summarizePlan(
        plan({ terraform_version: "1.12.6", ...extra }),
        0,
        "opentofu-1.12.6",
      ).completeness,
    ).toBe("not-reported");
  },
);

it.each([
  [plan(), 1],
  [plan(), -1],
  [plan({ errored: true }), 2],
  [plan({ format_version: "2.0" }), 2],
  [plan({ errored: undefined }), 2],
  [{ format_version: "1.0", values: {} }, 0],
  [plan({ resource_changes: [resource(["forget"])] }), 2],
  [plan({ resource_changes: [resource(["create"], "data")] }), 2],
  [plan({ resource_changes: [resource(["create"])] }), 0],
  [plan({ resource_changes: {} }), 2],
  [plan({ checks: [{ status: secret }] }), 2],
])(
  "rejects failed, incompatible, malformed and contradictory evidence without leaking it",
  (raw, code) => {
    expect(() => summarizePlan(raw, code as number)).toThrow(
      "Der Plan ist unvollständig",
    );
  },
);
