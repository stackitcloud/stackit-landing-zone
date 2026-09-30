import { z } from "zod";
import catalogue from "./catalogue.json" with { type: "json" };
import {
  areaLocations,
  type CommonConfiguration,
  commonConfigurationFromValues,
  commonConfigurationSchema,
  commonNetworkAreas,
  compileCommonConfiguration,
  createCommonConfiguration,
  readCommonConfiguration,
  removeCommonNetworkArea,
} from "./common-document.js";
import { assessCommonConfiguration } from "./common-validation.js";
import {
  buildConfiguration,
  type ConfigurationDraft,
  type DraftIssue,
  draftShape,
  objectValue,
  type Template,
  textValue,
  type Values,
  validateDraft,
} from "./configuration.js";
import {
  configurationValues,
  readSavedDraft,
  type SavedDraft,
  savedDraft,
  savedDraftSchema,
} from "./document.js";
import { assertBoundedJson, inputGroup } from "./features.js";

export type EditorDraft = ConfigurationDraft | CommonConfiguration;
export type ConfigurationRecord = SavedDraft | CommonConfiguration;
export const configurationRecordSchema = z.union([
  savedDraftSchema,
  commonConfigurationSchema,
]);
export function isCommonDraft(
  draft: EditorDraft,
): draft is CommonConfiguration {
  return "schemaVersion" in draft;
}
export function readEditorDraft(input: unknown): EditorDraft {
  assertBoundedJson(input);
  return objectValue(input).schemaVersion === 3
    ? readCommonConfiguration(input)
    : draftShape.parse(input);
}
export function readConfigurationRecord(input: unknown): ConfigurationRecord {
  assertBoundedJson(input);
  return objectValue(input).schemaVersion === 3
    ? readCommonConfiguration(input)
    : readSavedDraft(input);
}
export function recordValues(record: ConfigurationRecord): Values {
  return record.schemaVersion === 3
    ? compileCommonConfiguration(record)
    : configurationValues(record);
}
export function recordName(record: ConfigurationRecord): string {
  return record.schemaVersion === 3 ? record.name : record.draft.name;
}
export function recordOrganization(record: ConfigurationRecord): string {
  return textValue(recordValues(record).organization_id);
}
export function recordDraft(record: ConfigurationRecord): EditorDraft {
  return record.schemaVersion === 3 ? record : record.draft;
}
export function saveEditorDraft(
  id: string,
  draft: EditorDraft,
): ConfigurationRecord {
  if (editorIssues(draft).length) throw new Error("Invalid configuration");
  return isCommonDraft(draft)
    ? readCommonConfiguration({ ...draft, id })
    : savedDraft(id, draft);
}
export function upgradeEditorDraft(
  draft: ConfigurationDraft,
): CommonConfiguration {
  const template = catalogue.templates.find(
    (item) => item.id === "standalone",
  ) as Template;
  return commonConfigurationFromValues(
    template,
    crypto.randomUUID(),
    draft.name || "Meine Landing Zone",
    buildConfiguration(template, draftShape.parse(draft)),
  );
}
// Editor presets may repair known example defects; the lossless importer stays unchanged.
export function createEditorConfiguration(
  templateId: string,
  id: string,
): CommonConfiguration {
  const document = createCommonConfiguration(templateId, id);
  if (templateId !== "standalone") return document;
  const projects = structuredClone(
    objectValue(document.features.projects.landing_zones),
  );
  for (const raw of Object.values(projects)) {
    const project = objectValue(raw);
    if (project.corporate === undefined) project.corporate = false;
  }
  return editCommonInput(document, "landing_zones", projects);
}
export function editorIssues(draft: EditorDraft): DraftIssue[] {
  if (!isCommonDraft(draft)) return validateDraft(draft);
  const values = compileCommonConfiguration(draft);
  if (!draft.name.trim())
    return [
      { field: "name", message: "Bitte einen Konfigurationsnamen angeben." },
    ];
  const issues = assessCommonConfiguration(draft)
    .findings.filter(
      (item) => item.scope === "configuration" && item.severity === "error",
    )
    .map((item) => ({ field: item.path, message: item.message }));
  const email = (field: string, raw: unknown) => {
    if (
      typeof raw !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ||
      /@example\.(com|org|net)$/i.test(raw)
    )
      issues.push({
        field,
        message: "Bitte eine eigene gültige E-Mail-Adresse eintragen.",
      });
  };
  if (
    !z.uuid().safeParse(values.organization_id).success ||
    values.organization_id === "00000000-0000-0000-0000-000000000000"
  )
    issues.push({
      field: "organization_id",
      message: "Bitte die Organisations-ID aus dem STACKIT Portal eintragen.",
    });
  email("owner_email", values.owner_email);
  for (const [key, raw] of Object.entries(objectValue(values.landing_zones))) {
    const project = objectValue(raw);
    email(`landing_zones.${key}.owner_email`, project.owner_email);
    for (const field of ["project_name", "project_code"])
      if (!textValue(project[field]).trim())
        issues.push({
          field: `landing_zones.${key}.${field}`,
          message: "Bitte ausfüllen.",
        });
  }
  if (Array.isArray(values.sandboxes))
    values.sandboxes.forEach((raw, index) => {
      email(
        `sandboxes.${index}.project_owner_email`,
        objectValue(raw).project_owner_email,
      );
      if (!textValue(objectValue(raw).project_name).trim())
        issues.push({
          field: `sandboxes.${index}.project_name`,
          message: "Bitte ausfüllen.",
        });
    });
  return issues;
}
// All non-project collection editors preserve existing IDs by source path.
// Project list operations below manage list identities explicitly.
export function editCommonInput(
  input: CommonConfiguration,
  name: string,
  value: Values[string] | undefined,
): CommonConfiguration {
  const document = readCommonConfiguration(input);
  const group = inputGroup(name);
  if (group === "credentials")
    throw new Error("Secret requires server binding");
  if (value === undefined) delete document.features[group][name];
  else document.features[group][name] = structuredClone(value);
  const values = Object.assign(
    {},
    ...Object.values(document.features),
  ) as Values;
  const areas = areaLocations(values);
  for (const area of commonNetworkAreas(input))
    if (
      !areas.some(
        (next) => next.region === area.region && next.key === area.key,
      )
    )
      removeCommonNetworkArea(input, area.id);
  document.identities.networkAreas = Object.fromEntries(
    areas.map((area) => [
      area.path,
      document.identities.networkAreas[area.path] ??
        commonNetworkAreas(input).find(
          (old) => old.region === area.region && old.key === area.key,
        )?.id ??
        crypto.randomUUID(),
    ]),
  );
  return readCommonConfiguration(document);
}
export function addCommonProject(
  input: CommonConfiguration,
  kind: "public" | "corporate" | "sandbox",
  key: string,
): CommonConfiguration {
  const document = readCommonConfiguration(input);
  const identity = document.features.identity;
  if (kind === "sandbox") {
    const existing = document.features.projects.sandboxes;
    document.features.projects.sandboxes = [
      ...(Array.isArray(existing) ? existing : []),
      {
        project_name: "Neue Sandbox",
        project_owner_email: textValue(identity.owner_email),
      },
    ];
    document.identities.sandboxes.push(crypto.randomUUID());
  } else {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(key))
      throw new Error(
        "Bitte eine Kennung aus Kleinbuchstaben, Ziffern und Bindestrichen angeben.",
      );
    const projects = objectValue(document.features.projects.landing_zones);
    if (Object.hasOwn(projects, key))
      throw new Error("Diese Kennung existiert bereits.");
    document.features.projects.landing_zones = {
      ...projects,
      [key]: {
        project_name: "Neues Projekt",
        project_code: key,
        owner_email: textValue(identity.owner_email),
        corporate: kind === "corporate",
        region: textValue(identity.region) || "eu01",
        env: "dev",
      },
    };
    document.identities.landingZones[key] = crypto.randomUUID();
  }
  return readCommonConfiguration(document);
}
export function removeCommonProject(
  input: CommonConfiguration,
  id: string,
): CommonConfiguration {
  const document = readCommonConfiguration(input);
  const key = Object.keys(document.identities.landingZones).find(
    (key) => document.identities.landingZones[key] === id,
  );
  if (key) {
    if (
      Object.hasOwn(
        objectValue(document.features.projects.landing_zone_namespace_services),
        key,
      )
    )
      throw new Error(
        "Bitte zuerst die zugehörigen Namespace-Dienste entfernen.",
      );
    delete objectValue(document.features.projects.landing_zones)[key];
    delete document.identities.landingZones[key];
  } else {
    const index = document.identities.sandboxes.indexOf(id);
    if (index < 0 || !Array.isArray(document.features.projects.sandboxes))
      throw new Error("Unbekanntes Projekt.");
    document.features.projects.sandboxes.splice(index, 1);
    document.identities.sandboxes.splice(index, 1);
  }
  return readCommonConfiguration(document);
}
