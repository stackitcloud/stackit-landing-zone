import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  acceleratorInputs,
  featureFieldCatalogue,
  featureGroups,
  supportedAcceleratorRevision,
} from "../packages/domain/dist/index.js";

const output = new URL(
  "../../docs/assistant-feature-coverage.json",
  import.meta.url,
);

const inputScenarios: Record<string, string[]> = {
  organization_id: ["A01", "A15"],
  owner_email: ["A01", "A15"],
  company_name: ["A01"],
  company_code: ["A01"],
  region: ["A01", "A05"],
  platform_contract_namespace: ["A01", "A14"],
  labels: ["A01", "A12"],
  rm_folder_parent_id: ["A02"],
  rm_folders: ["A02"],
  organization_owners: ["A02"],
  organization_auditors: ["A02"],
  bucket_naming: ["A03", "A16"],
  observability: ["A03", "A09"],
  audit_logs: ["A03"],
  federated_identity_providers: ["A03"],
  connectivity: ["A04", "A06", "A07"],
  connectivity_regions: ["A05", "A06", "A07"],
  devops: ["A08"],
  platform_kubernetes: ["A09"],
  landing_zones: ["A10", "A14"],
  sandboxes: ["A11"],
  landing_zone_namespace_services: ["A12"],
  firewall_config: ["A13"],
  firewall_admin_username: ["A13"],
  firewall_bootstrap: ["A13"],
  firewall_api_secret_version: ["A13"],
  platform_kubernetes_kube_config_override: ["A09", "A16"],
  vpn_pre_shared_keys: ["A07", "A16"],
  firewall_admin_password: ["A13", "A16"],
  firewall_api_credentials: ["A13", "A16"],
};

export function buildAssistantCoverage() {
  const actual = acceleratorInputs.map((input) => input.name).sort();
  const assigned = Object.keys(inputScenarios).sort();
  if (JSON.stringify(actual) !== JSON.stringify(assigned))
    throw new Error(
      "Assistant scenarios must match every current input exactly",
    );
  const fields = featureFieldCatalogue().map((field) => {
    const input = field.path.split(/[.[]/, 1)[0];
    if (!input || !inputScenarios[input])
      throw new Error("Assistant field has no reviewed scenario assignment");
    return {
      ...field,
      assistantMode: field.sensitive
        ? "requirements-only-no-values"
        : field.commonEditor === "not-effective"
          ? "explain-rejection-no-proposal"
          : "analyze-question-propose-validated-diff",
      scenarios: inputScenarios[input],
      qualification: "not-qualified",
    };
  });
  const sources = [
    "../packages/domain/src/features.ts",
    "../packages/domain/src/accelerator-inputs.json",
    "../packages/domain/src/catalogue.json",
    "../packages/domain/src/project-templates.ts",
    "../packages/domain/src/template-parameters.ts",
    "../packages/domain/src/common-validation.ts",
    "../packages/domain/src/observability-plans.ts",
    "../packages/domain/src/common-document.ts",
    "../packages/domain/src/editor-document.ts",
    "../packages/domain/src/application-catalogue.ts",
    "../packages/domain/src/application-plan.ts",
  ];
  return {
    schemaVersion: 1,
    engineRevision: supportedAcceleratorRevision,
    status: "concept-coverage-not-ai-qualification",
    sourceDigests: Object.fromEntries(
      sources.map((source) => [
        source.replace("../", ""),
        createHash("sha256")
          .update(readFileSync(new URL(source, import.meta.url)))
          .digest("hex"),
      ]),
    ),
    groups: Object.entries(featureGroups).map(([id, group]) => ({
      id,
      inputs: group.inputs.map((input) => ({
        input,
        scenarios: inputScenarios[input],
      })),
    })),
    fields,
    workflowScenarios: [
      "A14",
      "A15",
      "A16",
      "A17",
      "A18",
      "A19",
      "A20",
      "A21",
      "A22",
      "A23",
      "A24",
    ],
    workflows: [
      {
        id: "configuration-lifecycle",
        scenarios: ["A15", "A17", "A18", "A21"],
        mode: "explain-and-propose-draft-only",
        qualification: "not-qualified",
      },
      {
        id: "application-publication-and-orders",
        scenarios: ["A10", "A14", "A22"],
        mode: "propose-template-draft-no-dispatch",
        qualification: "not-qualified",
      },
      {
        id: "tenant-access-and-credentials",
        scenarios: ["A02", "A16", "A23"],
        mode: "requirements-only-no-grants-or-secret-values",
        qualification: "not-qualified",
      },
      {
        id: "catalogues-topology-and-locales",
        scenarios: ["A01", "A09", "A24"],
        mode: "authorized-metadata-and-deterministic-preview",
        qualification: "not-qualified",
      },
      {
        id: "plans-state-and-recovery",
        scenarios: ["A16", "A20", "A23"],
        mode: "explain-sanitized-status-no-execution",
        qualification: "not-qualified",
      },
    ],
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = `${JSON.stringify(buildAssistantCoverage(), null, 2)}\n`;
  if (process.argv.includes("--check")) {
    if (readFileSync(output, "utf8") !== data)
      throw new Error(
        "Assistant coverage is stale; regenerate and review scenarios",
      );
    process.stdout.write(
      "PASS: assistant coverage matches current feature sources.\n",
    );
  } else {
    writeFileSync(output, data);
    process.stdout.write(
      "Generated concept coverage; no AI qualification claimed.\n",
    );
  }
}
