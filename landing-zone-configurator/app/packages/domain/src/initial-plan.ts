import type { DraftIssue, JsonValue } from "./configuration.js";
import { objectValue } from "./configuration.js";
import {
  type ConfigurationRecord,
  editorIssues,
  recordValues,
} from "./editor-document.js";

// This is an execution allowlist, independent of the editable/importable feature set.
// Keep it bound to the reviewed Accelerator revision and expand only with runner tests.
export function initialPlanIssues(record: ConfigurationRecord): DraftIssue[] {
  if (record.schemaVersion !== 3) return [];
  const issues = [...editorIssues(record)];
  const values = recordValues(record);
  const blocked = (field: string, message: string) =>
    issues.push({ field, message });
  const roots = new Set([
    "owner_email",
    "company_name",
    "company_code",
    "organization_id",
    "region",
    "labels",
    "rm_folders",
    "landing_zones",
    "sandboxes",
  ]);
  const disabledNull = new Set([
    "rm_folder_parent_id",
    "devops",
    "observability",
    "audit_logs",
    "connectivity",
    "connectivity_regions",
    "firewall_config",
    "firewall_api_credentials",
    "platform_kubernetes_kube_config_override",
  ]);
  const disabledMaps = new Set([
    "platform_kubernetes",
    "landing_zone_namespace_services",
  ]);
  const disabledLists = new Set([
    "organization_owners",
    "organization_auditors",
    "federated_identity_providers",
  ]);
  for (const [key, value] of Object.entries(values)) {
    if (roots.has(key)) continue;
    if (disabledNull.has(key) && value === null) continue;
    if (
      disabledMaps.has(key) &&
      value !== null &&
      !Array.isArray(value) &&
      typeof value === "object" &&
      Object.keys(value).length === 0
    )
      continue;
    if (disabledLists.has(key) && Array.isArray(value) && value.length === 0)
      continue;
    blocked(
      key,
      "Dieser Baustein ist für Erstbereitstellungspläne noch nicht freigegeben. Unterstützt werden derzeit einfache Public- und Sandbox-Projekte ohne zusätzliche Plattform-, Netzwerk- oder Kubernetes-Komponenten.",
    );
  }
  if ((values.region ?? "eu01") !== "eu01")
    blocked(
      "region",
      "Erstbereitstellungspläne sind derzeit nur für eu01 freigegeben.",
    );
  const projectFields = new Set([
    "project_name",
    "project_code",
    "owner_email",
    "env",
    "corporate",
    "region",
    "secretsmanager_enabled",
  ]);
  for (const [key, raw] of Object.entries(objectValue(values.landing_zones))) {
    const project = objectValue(raw);
    // Accelerator defaults corporate to true, so absence must never mean Public.
    if (project.corporate !== false)
      blocked(
        `landing_zones.${key}.corporate`,
        "Für diesen Plan müssen Projekte ausdrücklich als Public konfiguriert sein.",
      );
    if ((project.region ?? values.region ?? "eu01") !== "eu01")
      blocked(
        `landing_zones.${key}.region`,
        "Erstbereitstellungspläne sind derzeit nur für eu01 freigegeben.",
      );
    for (const field of Object.keys(project)) {
      if (!projectFields.has(field))
        blocked(
          `landing_zones.${key}.${field}`,
          "Diese zusätzliche Projekteinstellung ist für Erstbereitstellungspläne noch nicht freigegeben.",
        );
    }
  }
  const nestedFields = (
    path: string,
    raw: JsonValue,
    allowed: readonly string[],
  ) => {
    for (const key of Object.keys(objectValue(raw))) {
      if (!allowed.includes(key))
        blocked(
          `${path}.${key}`,
          "Diese zusätzliche Einstellung ist für Erstbereitstellungspläne noch nicht freigegeben.",
        );
    }
  };
  for (const [key, folder] of Object.entries(objectValue(values.rm_folders))) {
    nestedFields(`rm_folders.${key}`, folder, [
      "name",
      "owner_emails",
      "reader_emails",
    ]);
  }
  if (Array.isArray(values.sandboxes))
    values.sandboxes.forEach((sandbox, index) => {
      nestedFields(`sandboxes.${index}`, sandbox, [
        "project_name",
        "project_owner_email",
        "owner_emails",
      ]);
    });
  return issues;
}
