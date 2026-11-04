import { platformUpgradeAcceleratorCommit } from "@lzc/contracts";
import { resolveApplicationAccessProfile } from "./application-access.js";
import {
  type CommonConfiguration,
  compileCommonConfiguration,
  readCommonConfiguration,
} from "./common-document.js";
import { type JsonValue, objectValue, textValue } from "./configuration.js";
import { resolveTemplateParameters } from "./template-parameters.js";
import { serializeTfvars } from "./tfvars.js";

// A download is a combined-root example, never the hosted platform execution input.
export function acceleratorExampleValues(input: CommonConfiguration) {
  const document = readCommonConfiguration(input);
  const values = compileCommonConfiguration(document);
  if (document.projectTemplates === undefined) return values;
  const zones = structuredClone(objectValue(values.landing_zones));
  const sandboxes = structuredClone((values.sandboxes ?? []) as JsonValue[]);
  const namespaces = structuredClone(
    objectValue(values.landing_zone_namespace_services),
  );
  for (const template of document.projectTemplates ?? []) {
    const requester = `${template.key}@example.com`;
    if (template.kind === "sandbox") {
      sandboxes.push({
        ...template.settings,
        project_name: template.key,
        project_owner_email: requester,
      });
      continue;
    }
    const parameters: Record<string, JsonValue> = {};
    if (
      objectValue(template.settings.observability).access_source ===
      "project-network"
    )
      throw new Error(
        "Für den Accelerator-Export die symbolische Observability-Netzbindung durch explizite Zugriffsquellen ersetzen.",
      );
    for (const [path, source] of Object.entries(
      template.parameterPolicy?.fields ?? {},
    )) {
      // There is no native equivalent for a symbolic ACL; never export [] instead.
      if (source.source === "binding")
        throw new Error(
          "Für den Accelerator-Export die symbolische Observability-Netzbindung durch explizite Zugriffsquellen ersetzen.",
        );
      if (source.source !== "input" || source.default !== undefined) continue;
      const [root, child] = path.split(".");
      const current = child
        ? objectValue(template.settings[root as string])[child]
        : template.settings[root as string];
      if (source.required)
        parameters[path] =
          source.choices?.[0] ??
          current ??
          (path === "env"
            ? "dev"
            : path === "observability.plan_name"
              ? "Observability-Starter-EU01"
              : false);
    }
    const resolution = resolveTemplateParameters(template, parameters, {
      verifiedStackitEmail: requester,
    });
    const profile = template.accessProfile
      ? {
          ...template.accessProfile,
          ...(template.accessProfile.mode === "granular" &&
          !template.accessProfile.initialOwnerEmail
            ? { initialOwnerEmail: "central-owner@example.com" }
            : {}),
        }
      : undefined;
    const resolved = resolveApplicationAccessProfile(
      profile,
      resolution.settings,
      requester,
    );
    const { initial_owner_email, ...settings } = resolved;
    zones[template.key] = {
      ...settings,
      project_name: template.key,
      project_code: template.key,
      owner_email: textValue(initial_owner_email) || requester,
      corporate: template.kind === "corporate",
      region: template.region,
    };
    if (template.namespaceServices !== undefined)
      namespaces[template.key] = structuredClone(template.namespaceServices);
  }
  return {
    ...values,
    landing_zones: zones,
    sandboxes,
    landing_zone_namespace_services: namespaces,
  };
}

export function exportAcceleratorExample(input: CommonConfiguration): string {
  return [
    "# Native STACKIT Landing Zone Accelerator example (combined src/ root).",
    `# Accelerator source: ${platformUpgradeAcceleratorCommit}`,
    "# Each Application template becomes one example project, not a hosted order.",
    "# Before plan/apply: review all entries; replace example.com subjects, project names/codes",
    "# and organization values. Input defaults or the first allowed choice are example values.",
    "# Granular profiles: owner_email is the central owner; requester permissions are role_assignments.",
    "# To add projects, copy entries with new stable map keys and project names/codes.",
    "# Preserve deployed keys and existing entries when reusing the same State.",
    "# Supply provider/backend and other protected credentials separately; no Configurator is required.",
    "",
    serializeTfvars(acceleratorExampleValues(input)),
  ].join("\n");
}
