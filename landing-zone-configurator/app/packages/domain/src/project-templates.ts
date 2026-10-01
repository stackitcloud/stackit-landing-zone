import { z } from "zod";
import {
  type CommonConfiguration,
  commonNetworkAreas,
  readCommonConfiguration,
} from "./common-document.js";
import {
  type DraftIssue,
  objectValue,
  textValue,
  type Values,
} from "./configuration.js";
import { effectiveInput, validatePublicInputs } from "./features.js";

export const projectTemplateDraftSchema = z
  .object({
    id: z.uuid(),
    key: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    name: z.string().max(256),
    kind: z.enum(["public", "corporate", "sandbox"]),
    region: z.enum(["eu01", "eu02"]),
    settings: z.record(z.string(), z.json()),
    namespaceServices: z.record(z.string(), z.json()).optional(),
  })
  .strict();
export type ProjectTemplateDraft = z.infer<typeof projectTemplateDraftSchema>;
const instanceFields = [
  "project_name",
  "project_code",
  "owner_email",
  "project_owner_email",
  "corporate",
  "region",
];

// Validate draft settings with the same Accelerator input types as resource instances.
// Placeholders are only used in memory for validation and are never compiled/exported.
export function validateProjectTemplateDraft(
  draft: ProjectTemplateDraft,
): void {
  if (instanceFields.some((field) => Object.hasOwn(draft.settings, field)))
    throw new Error(
      "Projektvorlagen dürfen keine Projektinstanz oder persönliche Eigentümerkennung enthalten.",
    );
  const values: Values =
    draft.kind === "sandbox"
      ? {
          sandboxes: [
            {
              ...draft.settings,
              project_name: "Template validation",
              project_owner_email: "app-owner@validation.invalid",
            },
          ],
        }
      : {
          landing_zones: {
            [draft.key]: {
              ...draft.settings,
              project_name: "Template validation",
              project_code: "template",
              owner_email: "app-owner@validation.invalid",
              corporate: draft.kind === "corporate",
              region: draft.region,
            },
          },
        };
  if (draft.namespaceServices !== undefined) {
    if (draft.kind === "sandbox")
      throw new Error(
        "Sandbox-Vorlagen unterstützen keine Kubernetes-Namespace-Dienste.",
      );
    values.landing_zone_namespace_services = {
      [draft.key]: draft.namespaceServices,
    };
  }
  if (validatePublicInputs(values).length)
    throw new Error(
      "Ungültige Accelerator-Einstellungen in der Projektvorlage.",
    );
}
export function projectTemplates(
  document: CommonConfiguration,
): ProjectTemplateDraft[] {
  return readCommonConfiguration(document).projectTemplates ?? [];
}
export function projectTemplateIssues(
  document: CommonConfiguration,
): DraftIssue[] {
  const templates = projectTemplates(document);
  const issues: DraftIssue[] = [];
  const areas = commonNetworkAreas(document);
  const values = Object.assign(
    {},
    ...Object.values(document.features),
  ) as Values;
  const folders = objectValue(effectiveInput(values, "rm_folders"));
  for (const template of templates) {
    const prefix = `projectTemplates.${template.id}`;
    if (!template.name.trim())
      issues.push({
        field: `${prefix}.name`,
        message: "Bitte einen Namen für die Projektvorlage angeben.",
      });
    if (
      Array.isArray(template.settings.owner_emails) &&
      template.settings.owner_emails.some(
        (email) =>
          typeof email === "string" && /@example\.(com|org|net)$/i.test(email),
      )
    )
      issues.push({
        field: `${prefix}.settings.owner_emails`,
        message:
          "Beispieladressen dürfen nicht als feste Administratorberechtigung übernommen werden. Bitte prüfen und entfernen.",
      });
    const folder =
      template.kind === "sandbox"
        ? "sandboxes"
        : template.kind === "corporate"
          ? "landing_zones_corporate"
          : "landing_zones_public";
    if (!Object.hasOwn(folders, folder))
      issues.push({
        field: `${prefix}.kind`,
        message: "Der Zielordner für diese Projektvorlage fehlt.",
      });
    if (
      template.kind === "corporate" &&
      !areas.some(
        (area) =>
          area.region === template.region &&
          area.key ===
            (textValue(template.settings.network_area_key) || "default"),
      )
    )
      issues.push({
        field: `${prefix}.settings.network_area_key`,
        message:
          "Corporate-Projektvorlagen benötigen eine vorhandene STACKIT Network Area in ihrer Region.",
      });
    // Sandbox projects currently inherit the platform region in the Accelerator.
    if (
      template.kind === "sandbox" &&
      template.region !== (textValue(values.region) || "eu01")
    )
      issues.push({
        field: `${prefix}.region`,
        message:
          "Sandbox-Projektvorlagen verwenden derzeit die Region der Plattform.",
      });
    // Namespace-service execution constraints belong to publication/instantiation.
    // Draft metadata is retained even when no unique reachable cluster exists yet.
  }
  return issues;
}
export function addProjectTemplate(
  document: CommonConfiguration,
  kind: ProjectTemplateDraft["kind"],
  key: string,
): CommonConfiguration {
  const next = readCommonConfiguration(document);
  if (next.projectTemplates === undefined)
    throw new Error(
      "Bestehende Konfiguration zuerst ausdrücklich als Plattform-Entwurf kopieren.",
    );
  if (next.projectTemplates.some((template) => template.key === key))
    throw new Error("Diese Vorlagenkennung existiert bereits.");
  next.projectTemplates.push({
    id: crypto.randomUUID(),
    key,
    name: kind === "sandbox" ? "Neue Sandbox-Vorlage" : "Neue Projektvorlage",
    kind,
    region: (textValue(next.features.identity.region) || "eu01") as
      | "eu01"
      | "eu02",
    settings:
      kind === "sandbox" ? {} : { env: "dev", secretsmanager_enabled: true },
  });
  return readCommonConfiguration(next);
}
export function updateProjectTemplate(
  document: CommonConfiguration,
  id: string,
  patch: {
    name?: string;
    region?: "eu01" | "eu02";
    settings?: Values;
    namespaceServices?: Values | null;
  },
): CommonConfiguration {
  const next = readCommonConfiguration(document);
  const template = next.projectTemplates?.find((entry) => entry.id === id);
  if (!template) throw new Error("Unbekannte Projektvorlage.");
  if (patch.name !== undefined) template.name = patch.name;
  if (patch.region !== undefined) template.region = patch.region;
  if (patch.settings !== undefined)
    template.settings = structuredClone(patch.settings);
  if (patch.namespaceServices === null) delete template.namespaceServices;
  else if (patch.namespaceServices !== undefined)
    template.namespaceServices = structuredClone(patch.namespaceServices);
  return readCommonConfiguration(next);
}
export function removeProjectTemplate(
  document: CommonConfiguration,
  id: string,
): CommonConfiguration {
  const next = readCommonConfiguration(document);
  if (!next.projectTemplates?.some((template) => template.id === id))
    throw new Error("Unbekannte Projektvorlage.");
  next.projectTemplates = next.projectTemplates.filter(
    (template) => template.id !== id,
  );
  return readCommonConfiguration(next);
}
// Explicit copy only. Existing documents and deployed resource/state identities are untouched.
export function createPlatformDraftCopy(
  document: CommonConfiguration,
  id: string,
): CommonConfiguration {
  const next = readCommonConfiguration(document);
  if (next.id === id)
    throw new Error(
      "Eine Plattformkopie benötigt eine neue Konfigurationskennung.",
    );
  next.id = id;
  if (next.projectTemplates !== undefined) {
    next.projectTemplates = next.projectTemplates.map((template) => ({
      ...template,
      id: crypto.randomUUID(),
    }));
    return readCommonConfiguration(next);
  }
  const values = Object.assign({}, ...Object.values(next.features)) as Values;
  const projects = objectValue(values.landing_zones);
  const namespaces = objectValue(values.landing_zone_namespace_services);
  for (const key of Object.keys(namespaces))
    if (!Object.hasOwn(projects, key))
      throw new Error(
        `Namespace-Dienste für „${key}“ haben kein zugehöriges Projekt. Die Konfiguration wurde nicht kopiert.`,
      );
  const templates: ProjectTemplateDraft[] = [];
  const used = new Set<string>();
  function add(
    raw: Values,
    kind: ProjectTemplateDraft["kind"],
    sourceKey: string,
    namespaceServices?: Values,
  ) {
    let key = sourceKey
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .slice(0, 56);
    if (!/^[a-z]/.test(key)) key = `template-${key}`.slice(0, 56);
    let unique = key,
      suffix = 2;
    while (used.has(unique)) unique = `${key}-${suffix++}`;
    used.add(unique);
    const settings = structuredClone(raw);
    for (const field of instanceFields) delete settings[field];
    templates.push({
      id: crypto.randomUUID(),
      key: unique,
      name: `${kind === "sandbox" ? "Sandbox" : kind === "corporate" ? "Corporate" : "Public"} · ${sourceKey}`,
      kind,
      region: (textValue(raw.region) || textValue(values.region) || "eu01") as
        | "eu01"
        | "eu02",
      settings,
      ...(namespaceServices !== undefined
        ? { namespaceServices: structuredClone(namespaceServices) }
        : {}),
    });
  }
  for (const [key, raw] of Object.entries(projects)) {
    const settings = objectValue(raw);
    add(
      settings,
      settings.corporate === false ? "public" : "corporate",
      key,
      Object.hasOwn(namespaces, key) ? objectValue(namespaces[key]) : undefined,
    );
  }
  if (Array.isArray(values.sandboxes))
    values.sandboxes.forEach((raw, index) => {
      add(objectValue(raw), "sandbox", `sandbox-${index + 1}`);
    });
  next.features.projects.landing_zones = {};
  next.features.projects.sandboxes = [];
  next.features.projects.landing_zone_namespace_services = {};
  next.identities.landingZones = {};
  next.identities.sandboxes = [];
  next.projectTemplates = templates;
  return readCommonConfiguration(next);
}
