import { z } from "zod";
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
    "organization_owners",
    "organization_auditors",
    "rm_folder_parent_id",
    "landing_zones",
    "sandboxes",
  ]);
  const disabledNull = new Set([
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
  const disabledLists = new Set(["federated_identity_providers"]);
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
      `„${key}“ ist noch nicht für Erstbereitstellungspläne freigegeben. Deaktiviere diese Komponente für einen reinen Plattform-/Governance-Plan oder warte auf die zugehörige Runner-Unterstützung. Die Konfiguration kann unverändert gespeichert bleiben.`,
    );
  }
  if (
    values.rm_folder_parent_id != null &&
    !z.uuid().safeParse(values.rm_folder_parent_id).success
  )
    blocked(
      "rm_folder_parent_id",
      "Bitte die UUID des übergeordneten STACKIT-Ordners angeben oder Standard verwenden, um unter der Organisation anzulegen.",
    );
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
      "description",
    ]);
    const description = objectValue(folder).description;
    if (description != null && description !== "")
      blocked(
        `rm_folders.${key}.description`,
        `Die Beschreibung für Ordner „${key}“ wird vom aktuellen Accelerator nicht übernommen (Issue #82). Leere die Beschreibung bzw. verwende Standard; Name und Berechtigungen können geplant werden.`,
      );
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
