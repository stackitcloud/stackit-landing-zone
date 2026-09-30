import { expect, it } from "vitest";
import { summarizePlan } from "../apps/worker/src/plans/summary.js";

const secret = "NEVER-EXPOSE-THIS-PRIVATE-VALUE";
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
