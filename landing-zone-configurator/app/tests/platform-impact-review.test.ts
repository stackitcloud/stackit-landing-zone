import { classifyPlatformApplicationImpactPlan } from "@lzc/contracts";
import { expect, it } from "vitest";
import { auditQueryMigrationPlan } from "./fixtures/audit-query-migration.js";

it("lets the Platform Owner review destructive audit migration without an address-specific exception", () => {
  const p = auditQueryMigrationPlan();
  expect(classifyPlatformApplicationImpactPlan(p)).toMatchObject({
    classification: "sensitive",
    sharedChanges: true,
  });
  p.resource_changes.push({
    address: "module.management.stackit_network.old",
    mode: "managed",
    type: "stackit_network",
    change: { actions: ["delete"], before: {}, after: null },
  } as never);
  expect(classifyPlatformApplicationImpactPlan(p).classification).toBe(
    "sensitive",
  );
});
it.each(
  [["delete"], ["create", "delete"], ["delete", "create"]].map((actions) => ({
    actions,
  })),
)(
  "requires explicit review of destructive platform actions %j",
  ({ actions }) => {
    expect(
      classifyPlatformApplicationImpactPlan({
        ...auditQueryMigrationPlan(),
        resource_changes: [
          {
            mode: "managed",
            type: "stackit_network",
            change: {
              actions,
              before: { private: "DO-NOT-EMIT" },
              after: null,
            },
          },
        ],
      }),
    ).toMatchObject({
      classification: "sensitive",
      changedResourceTypes: ["stackit_network"],
    });
  },
);
it.each(
  [
    ["delete", "read"],
    ["delete", "delete"],
    ["create", "delete", "create"],
  ].map((actions) => ({ actions })),
)("blocks unrecognized native action combinations %j", ({ actions }) => {
  expect(
    classifyPlatformApplicationImpactPlan({
      ...auditQueryMigrationPlan(),
      resource_changes: [
        {
          mode: "managed",
          type: "stackit_network",
          change: { actions, before: {}, after: null },
        },
      ],
    }).classification,
  ).toBe("blocked");
});
it("accepts native public IP range reads but retains unknown/partial plan blockers", () => {
  const p = auditQueryMigrationPlan();
  p.resource_changes.push({
    address: "data.stackit_public_ip_ranges.current",
    mode: "data",
    type: "stackit_public_ip_ranges",
    change: { actions: ["read"], before: null, after: {} },
  } as never);
  expect(classifyPlatformApplicationImpactPlan(p).classification).toBe(
    "sensitive",
  );
  p.resource_changes.at(-1)!.type = "unreviewed_data";
  expect(classifyPlatformApplicationImpactPlan(p).classification).toBe(
    "blocked",
  );
  expect(
    classifyPlatformApplicationImpactPlan({ ...p, complete: false })
      .classification,
  ).toBe("blocked");
});
