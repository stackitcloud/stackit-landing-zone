/** Service capabilities, never proof of availability or permission to provision. */
export type ObservabilityPlanCapabilities = {
  metricsRetention?: boolean;
  logsRetention?: boolean;
  tracesRetention?: boolean;
};
export type ObservabilityPlanOption = {
  value: string;
  label: string;
  capabilities?: ObservabilityPlanCapabilities;
};
export type ObservabilityPlanCatalogue = {
  region: string;
  fetchedAt: string;
  observabilityPlans?: {
    status: "available" | "unavailable";
    options: ObservabilityPlanOption[];
  };
};
export const observabilityRetentionPolicy = {
  source:
    "https://docs.stackit.cloud/products/logging-and-monitoring/observability/reference/service-plans-observability/",
  checkedOn: "2026-10-21",
  metricsMaxDays: 780,
  logsMaxDays: 30,
  tracesMaxDays: 30,
} as const;

export function observabilityPlanCapabilities(
  planName: string,
  catalogue?: ObservabilityPlanCatalogue,
) {
  let fallback: ObservabilityPlanCapabilities = {};
  if (/^Observability-Monitoring-.+-EU0[12]$/.test(planName))
    fallback = {
      metricsRetention: true,
      logsRetention: false,
      tracesRetention: false,
    };
  else if (
    /^Observability-(?:Frontend|Metrics-?Endpoint)(?:-.+)?-EU0[12]$/.test(
      planName,
    )
  )
    fallback = {
      metricsRetention: false,
      logsRetention: false,
      tracesRetention: false,
    };
  else if (
    /^Observability-(?:Observability-)?(?:Starter|Small|Medium|Large|XLarge)-EU0[12]$/.test(
      planName,
    )
  )
    fallback = {
      metricsRetention: true,
      logsRetention: true,
      tracesRetention: true,
    };
  const fetchedAt = Date.parse(catalogue?.fetchedAt ?? "");
  const age = Date.now() - fetchedAt;
  const part =
    Number.isFinite(age) && age >= -60000 && age <= 15 * 60 * 1000
      ? catalogue?.observabilityPlans
      : undefined;
  const entry =
    part?.status === "available"
      ? part.options.find((option) => option.value === planName)
      : undefined;
  const live = entry?.capabilities ?? {};
  // Live metadata may restrict the reviewed native contract. It cannot enable
  // settings which this pinned engine explicitly rejects for a known family.
  const capabilities: ObservabilityPlanCapabilities = { ...fallback, ...live };
  let nativeRestriction = false;
  for (const field of [
    "metricsRetention",
    "logsRetention",
    "tracesRetention",
  ] as const)
    if (fallback[field] === false) {
      capabilities[field] = false;
      if (live[field] === true) nativeRestriction = true;
    }
  const liveFields = Object.values(live).filter(
    (value) => typeof value === "boolean",
  ).length;
  return {
    ...capabilities,
    source:
      liveFields === 3 && !nativeRestriction
        ? "live"
        : liveFields
          ? "live-and-static"
          : Object.keys(fallback).length
            ? "static"
            : "unknown",
    available: part?.status === "available" ? Boolean(entry) : undefined,
    fetchedAt: liveFields ? catalogue?.fetchedAt : undefined,
    policy: observabilityRetentionPolicy,
  };
}

export function observabilityRetentionFindings(
  values: Record<string, unknown>,
  catalogue?: ObservabilityPlanCatalogue,
) {
  const planName =
    typeof values.plan_name === "string"
      ? values.plan_name
      : "Observability-Starter-EU01";
  const capabilities = observabilityPlanCapabilities(planName, catalogue);
  const findings: { field: string; code: string; message: string }[] = [];
  if (capabilities.available === false)
    findings.push({
      field: "plan_name",
      code: "observability-plan-unavailable",
      message:
        "Der gewählte Observability-Tarif fehlt im aktuellen Katalog. Tarif prüfen; vorhandene Werte werden beibehalten.",
    });
  for (const [field, supported, maximum] of [
    [
      "logs_retention_days",
      capabilities.logsRetention,
      observabilityRetentionPolicy.logsMaxDays,
    ],
    [
      "traces_retention_days",
      capabilities.tracesRetention,
      observabilityRetentionPolicy.tracesMaxDays,
    ],
    [
      "metrics_retention_days",
      capabilities.metricsRetention,
      observabilityRetentionPolicy.metricsMaxDays,
    ],
    [
      "metrics_retention_days_5m_downsampling",
      capabilities.metricsRetention,
      observabilityRetentionPolicy.metricsMaxDays,
    ],
    [
      "metrics_retention_days_1h_downsampling",
      capabilities.metricsRetention,
      observabilityRetentionPolicy.metricsMaxDays,
    ],
  ] as const) {
    const value = values[field];
    if (value == null) continue;
    if (supported === false)
      findings.push({
        field,
        code: "unsupported-observability-retention",
        message:
          "Der gewählte Observability-Tarif unterstützt diese Aufbewahrungseinstellung nicht. Wert entfernen oder auf null setzen; Tarif nicht automatisch ändern.",
      });
    else if (supported === undefined)
      findings.push({
        field,
        code: "unverified-observability-retention",
        message:
          "Die Unterstützung dieser Aufbewahrungseinstellung ist weder live noch durch den geprüften Fallback bekannt. Vor Ausführung prüfen.",
      });
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > maximum
    )
      findings.push({
        field,
        code: "invalid-observability-retention",
        message: `Die Aufbewahrung muss eine ganze Zahl zwischen 1 und ${maximum} Tagen sein (dokumentierter Servicegrenzwert).`,
      });
  }
  return { capabilities, findings };
}
