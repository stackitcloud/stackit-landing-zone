import {
  applicationPlatformImpactSchema,
  classifyPlatformApplicationImpactPlan,
} from "@lzc/contracts";
import { expect, it } from "vitest";
import { auditQueryMigrationPlan } from "./fixtures/audit-query-migration.js";

const get = (p: ReturnType<typeof auditQueryMigrationPlan>, suffix: string) => {
  const r = p.resource_changes.find((r) => r.address.endsWith(suffix));
  if (!r) throw new Error("test-resource-missing");
  return r;
};
const object = (v: unknown) => v as Record<string, unknown>;
it("allows only the complete same-project/router audit query-store retirement, without leaking private values", () => {
  const result = applicationPlatformImpactSchema.parse(
    classifyPlatformApplicationImpactPlan(auditQueryMigrationPlan()),
  );
  expect(result).toMatchObject({
    classification: "sensitive",
    sharedChanges: true,
    auditMigration: { kind: "logs-to-observability", retiredResources: 4 },
  });
  expect(
    result.reasons.filter((r) => r.code === "platform-audit-query-migration"),
  ).toHaveLength(4);
  expect(JSON.stringify(result)).not.toMatch(
    /DO-NOT-EMIT|example.test|11111111|33333333/,
  );
});
it.each([
  "missing-target",
  "different-router",
  "different-project",
  "different-endpoint",
  "different-logs-token",
  "changed-plan",
  "changed-retention",
  "contradictory-computed",
  "changed-archive",
  "extra-delete",
  "replacement",
  "wrong-address",
  "unknown-acl",
  "incomplete",
])("blocks unsafe or unproven audit migration: %s", (kind) => {
  const p = auditQueryMigrationPlan();
  if (kind === "missing-target")
    p.resource_changes = p.resource_changes.filter(
      (r) => !r.address.endsWith("audit_observability[0]"),
    );
  if (kind === "different-router")
    object(get(p, "audit_observability[0]").change.after).instance_id =
      "66666666-6666-4666-8666-666666666666";
  if (kind === "different-project")
    object(
      get(p, "stackit_observability_credential.audit[0]").change.after,
    ).project_id = "66666666-6666-4666-8666-666666666666";
  if (kind === "different-endpoint")
    object(
      object(object(get(p, "audit_observability[0]").change.after).config)
        .opentelemetry,
    ).uri = "https://unapproved.example.test/otlp/v1/logs";
  if (kind === "different-logs-token")
    object(get(p, "audit_read[0]").change.before).instance_id =
      "66666666-6666-4666-8666-666666666666";
  if (kind === "changed-plan")
    object(
      get(p, "stackit_observability_instance.this[0]").change.after,
    ).plan_name = "Observability-Large-EU01";
  if (kind === "changed-retention" || kind === "contradictory-computed")
    object(
      get(p, "stackit_observability_instance.this[0]").change.after,
    ).logs_retention_days = 1;
  if (kind === "changed-retention")
    get(p, "stackit_observability_instance.this[0]").change.after_unknown = {};
  if (kind === "changed-archive")
    object(
      get(p, "stackit_objectstorage_bucket.audit_logs").change.after,
    ).name = "other-bucket";
  if (kind === "extra-delete")
    p.resource_changes.push({
      ...structuredClone(get(p, "stackit_logs_instance.audit[0]")),
      address: "module.connectivity.stackit_network.this[0]",
      type: "stackit_network",
    });
  if (kind === "replacement")
    get(p, "stackit_observability_instance.this[0]").change.actions = [
      "delete",
      "create",
    ];
  if (kind === "wrong-address")
    get(p, "stackit_logs_instance.audit[0]").address =
      "module.application.stackit_logs_instance.audit[0]";
  if (kind === "unknown-acl")
    object(get(p, "stackit_observability_instance.this[0]").change.after).acl =
      null;
  if (kind === "incomplete") p.complete = false;
  expect(classifyPlatformApplicationImpactPlan(p).classification).toBe(
    "blocked",
  );
});
it("accepts the native public-range read while still blocking unknown data sources", () => {
  const p = auditQueryMigrationPlan();
  const data = {
    address: "module.management.data.stackit_public_ip_ranges.audit[0]",
    mode: "data",
    type: "stackit_public_ip_ranges",
    change: { actions: ["read"], before: null, after: {} },
  };
  expect(
    classifyPlatformApplicationImpactPlan({
      ...p,
      resource_changes: [...p.resource_changes, data],
    }).classification,
  ).toBe("sensitive");
  expect(
    classifyPlatformApplicationImpactPlan({
      ...p,
      resource_changes: [
        ...p.resource_changes,
        { ...data, type: "unreviewed_data_source" },
      ],
    }).classification,
  ).toBe("blocked");
});
