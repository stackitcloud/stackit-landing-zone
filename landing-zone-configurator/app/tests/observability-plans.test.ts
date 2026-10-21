import {
  type ObservabilityPlanCatalogue,
  observabilityPlanCapabilities,
  observabilityRetentionFindings,
} from "@lzc/domain";
import { expect, it } from "vitest";

const live = (
  value: string,
  capabilities: {
    metricsRetention?: boolean;
    logsRetention?: boolean;
    tracesRetention?: boolean;
  },
): ObservabilityPlanCatalogue => ({
  region: "eu01",
  fetchedAt: new Date().toISOString(),
  observabilityPlans: {
    status: "available",
    options: [{ value, label: value, capabilities }],
  },
});
it("rejects the failed Monitoring/logs combination offline and retains the supplied value", () => {
  const settings = {
    plan_name: "Observability-Monitoring-Medium-EU01",
    logs_retention_days: 30,
    metrics_retention_days: 90,
  };
  const result = observabilityRetentionFindings(settings);
  expect(result.findings.map((finding) => finding.field)).toEqual([
    "logs_retention_days",
  ]);
  expect(settings.logs_retention_days).toBe(30);
  expect(result.capabilities.source).toBe("static");
});
it("uses explicit live zero capacities over a conflicting static plan family", () => {
  const plan = "Observability-Starter-EU01";
  const result = observabilityRetentionFindings(
    { plan_name: plan, logs_retention_days: 5 },
    live(plan, {
      metricsRetention: true,
      logsRetention: false,
      tracesRetention: false,
    }),
  );
  expect(result.capabilities.source).toBe("live");
  expect(result.findings).toContainEqual(
    expect.objectContaining({
      field: "logs_retention_days",
      code: "unsupported-observability-retention",
    }),
  );
});
it("accepts a new live plan and never fabricates missing capabilities", () => {
  const name = "new-plan";
  expect(
    observabilityRetentionFindings(
      { plan_name: name, logs_retention_days: 7 },
      live(name, { logsRetention: true }),
    ).findings,
  ).toEqual([]);
  const unknown = observabilityRetentionFindings(
    { plan_name: name, traces_retention_days: 7 },
    live(name, { logsRetention: true }),
  );
  expect(unknown.findings).toContainEqual(
    expect.objectContaining({
      field: "traces_retention_days",
      code: "unverified-observability-retention",
    }),
  );
  expect(unknown.capabilities.tracesRetention).toBeUndefined();
});
it("falls back per field and refuses stale/future capability claims", () => {
  const name = "Observability-Monitoring-Medium-EU01";
  const partial = observabilityPlanCapabilities(
    name,
    live(name, { metricsRetention: true }),
  );
  expect(partial).toMatchObject({
    source: "live-and-static",
    logsRetention: false,
  });
  for (const offset of [-16 * 60000, 2 * 60000]) {
    const catalogue = live(name, { logsRetention: true });
    catalogue.fetchedAt = new Date(Date.now() + offset).toISOString();
    expect(observabilityPlanCapabilities(name, catalogue)).toMatchObject({
      source: "static",
      logsRetention: false,
    });
  }
});
it("reports absence in a fresh catalogue and permits nullable unsupported options", () => {
  const result = observabilityRetentionFindings({
    plan_name: "Observability-Frontend-Starter-EU01",
    logs_retention_days: null,
    metrics_retention_days: null,
  });
  expect(result.findings).toEqual([]);
  expect(result.capabilities.metricsRetention).toBe(false);
  expect(
    observabilityRetentionFindings(
      { plan_name: "missing" },
      live("present", {}),
    ).findings[0]?.code,
  ).toBe("observability-plan-unavailable");
});
it.each([0, -1, 1.5, 31])(
  "rejects out-of-contract logs retention %s",
  (value) => {
    expect(
      observabilityRetentionFindings({ logs_retention_days: value }).findings,
    ).toContainEqual(
      expect.objectContaining({ code: "invalid-observability-retention" }),
    );
  },
);
it("keeps explicit valid metrics and signals separate", () => {
  expect(
    observabilityRetentionFindings({
      logs_retention_days: 30,
      traces_retention_days: 1,
      metrics_retention_days: 780,
    }).findings,
  ).toEqual([]);
  expect(
    observabilityRetentionFindings({ metrics_retention_days: 781 }).findings,
  ).toContainEqual(
    expect.objectContaining({
      field: "metrics_retention_days",
      code: "invalid-observability-retention",
    }),
  );
});

it("does not enable an option rejected by the reviewed native execution contract", () => {
  const name = "Observability-Monitoring-Medium-EU01";
  const report = observabilityPlanCapabilities(
    name,
    live(name, {
      metricsRetention: true,
      logsRetention: true,
      tracesRetention: true,
    }),
  );
  expect(report).toMatchObject({
    source: "live-and-static",
    logsRetention: false,
    tracesRetention: false,
  });
});

it("recognizes the API Metrics-Endpoint plan spelling in the static fallback", () => {
  const report = observabilityRetentionFindings({
    plan_name: "Observability-Metrics-Endpoint-100k-EU01",
    metrics_retention_days: 90,
  });
  expect(report.capabilities).toMatchObject({
    source: "static",
    metricsRetention: false,
  });
  expect(report.findings).toContainEqual(
    expect.objectContaining({ code: "unsupported-observability-retention" }),
  );
});
