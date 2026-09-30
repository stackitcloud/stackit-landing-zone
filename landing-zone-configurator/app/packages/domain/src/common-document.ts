import { z } from "zod";
import catalogue from "./catalogue.json" with { type: "json" };
import {
  type JsonValue,
  objectValue,
  type Template,
  textValue,
  type Values,
} from "./configuration.js";
import { configurationValues, readSavedDraft } from "./document.js";
import {
  assertBoundedJson,
  featureGroups,
  inputGroup,
  type PublicFeatureGroup,
  publicFeatureGroups,
  supportedAcceleratorRevision,
  validatePublicInputs,
} from "./features.js";
import { serializeTfvars } from "./tfvars.js";

const valuesSchema = z.record(z.string(), z.json());
const featuresSchema = z
  .object({
    identity: valuesSchema,
    governance: valuesSchema,
    management: valuesSchema,
    network: valuesSchema,
    platform: valuesSchema,
    projects: valuesSchema,
    firewall: valuesSchema,
  })
  .strict();
const commonShape = z
  .object({
    schemaVersion: z.literal(3),
    kind: z.literal("landing-zone-configurator-configuration"),
    id: z.uuid(),
    name: z.string().min(1).max(4096),
    origin: z
      .object({
        templateId: z.string(),
        source: z.string(),
        sha256: z.string(),
        acceleratorRevision: z.literal(supportedAcceleratorRevision),
      })
      .strict(),
    features: featuresSchema,
    identities: z
      .object({
        landingZones: z.record(z.string(), z.string().min(1).max(512)),
        sandboxes: z.array(z.string().min(1).max(512)),
        networkAreas: z.record(z.string(), z.string().min(1).max(512)),
      })
      .strict(),
  })
  .strict();
export type CommonConfiguration = z.infer<typeof commonShape>;
export type NetworkArea = {
  id: string;
  region: string;
  key: string;
  path: string;
  settings: Values;
};
export type CommonProject = {
  id: string;
  key: string | null;
  kind: "public" | "corporate" | "sandbox";
  folder: "landing_zones_public" | "landing_zones_corporate" | "sandboxes";
  region: string;
  areaId: string | null;
  settings: Values;
};
function templateById(id: string): Template {
  const template = catalogue.templates.find((entry) => entry.id === id);
  if (!template) throw new Error("Unsupported template");
  return template as Template;
}
function flatten(document: CommonConfiguration): Values {
  const values: Values = {};
  for (const group of publicFeatureGroups) {
    for (const [name, value] of Object.entries(document.features[group])) {
      if (inputGroup(name) !== group)
        throw new Error("Input in wrong feature group");
      values[name] = structuredClone(value);
    }
  }
  return values;
}
export function areaLocations(values: Values): Omit<NetworkArea, "id">[] {
  const region = textValue(values.region) || "eu01";
  const configurations =
    values.connectivity_regions != null
      ? Object.entries(objectValue(values.connectivity_regions))
      : ([[region, values.connectivity]] as const);
  return configurations.flatMap(([areaRegion, raw]) => {
    const configuration = objectValue(raw);
    const base =
      values.connectivity_regions != null
        ? `connectivity_regions.${areaRegion}`
        : "connectivity";
    if (configuration.network_areas != null)
      return Object.entries(objectValue(configuration.network_areas)).map(
        ([key, area]) => ({
          region: areaRegion,
          key,
          path: `${base}.network_areas.${key}`,
          settings: structuredClone(objectValue(area)),
        }),
      );
    if (
      values.connectivity_regions == null &&
      configuration.network_area != null
    )
      return [
        {
          region: areaRegion,
          key: "default",
          path: `${base}.network_area`,
          settings: structuredClone(objectValue(configuration.network_area)),
        },
      ];
    return [];
  });
}
function identityIndex(values: Values): CommonConfiguration["identities"] {
  return {
    landingZones: Object.fromEntries(
      Object.keys(objectValue(values.landing_zones)).map((key) => [
        key,
        `project:${key}`,
      ]),
    ),
    sandboxes: (Array.isArray(values.sandboxes) ? values.sandboxes : []).map(
      (_, index) => `sandbox:${index}`,
    ),
    networkAreas: Object.fromEntries(
      areaLocations(values).map((area) => [
        area.path,
        `area:${area.region}:${area.key}`,
      ]),
    ),
  };
}
function fromValues(
  template: Template,
  id: string,
  name: string,
  values: Values,
): CommonConfiguration {
  const features = Object.fromEntries(
    publicFeatureGroups.map((group) => [group, {}]),
  ) as Record<PublicFeatureGroup, Values>;
  for (const [key, value] of Object.entries(values)) {
    const group = inputGroup(key);
    if (group === "credentials")
      throw new Error("Secret requires server binding");
    features[group][key] = structuredClone(value);
  }
  return readCommonConfiguration({
    schemaVersion: 3,
    kind: "landing-zone-configurator-configuration",
    id,
    name,
    origin: {
      templateId: template.id,
      source: template.source,
      sha256: template.sha256,
      acceleratorRevision: supportedAcceleratorRevision,
    },
    features,
    identities: identityIndex(values),
  });
}
export function createCommonConfiguration(
  templateId: string,
  id: string,
  name = "Meine Landing Zone",
): CommonConfiguration {
  const template = templateById(templateId);
  return fromValues(template, id, name, template.values);
}
export function migrateCommonConfiguration(
  input: unknown,
): CommonConfiguration {
  assertBoundedJson(input);
  if (objectValue(input).schemaVersion === 3)
    return readCommonConfiguration(input);
  const legacy = readSavedDraft(input);
  // Compile with the original v1/v2 contract before migrating. This preserves
  // resource keys, optional omissions and exact serialized preparation hashes.
  return fromValues(
    templateById(legacy.template.id),
    legacy.id,
    legacy.draft.name,
    configurationValues(legacy),
  );
}
export function readCommonConfiguration(input: unknown): CommonConfiguration {
  assertBoundedJson(input);
  const parsed = commonShape.parse(input);
  const template = templateById(parsed.origin.templateId);
  if (
    parsed.origin.source !== template.source ||
    parsed.origin.sha256 !== template.sha256
  )
    throw new Error("Unsupported template revision");
  const values = flatten(parsed);
  if (validatePublicInputs(values).length)
    throw new Error("Invalid Accelerator input contract");
  const expected = identityIndex(values);
  for (const group of ["landingZones", "networkAreas"] as const) {
    const keys = Object.keys(parsed.identities[group]);
    if (
      keys.length !== Object.keys(expected[group]).length ||
      keys.some((key) => !Object.hasOwn(expected[group], key))
    )
      throw new Error("Invalid resource identities");
  }
  if (parsed.identities.sandboxes.length !== expected.sandboxes.length)
    throw new Error("Invalid sandbox identities");
  const ids = [
    ...Object.values(parsed.identities.landingZones),
    ...parsed.identities.sandboxes,
    ...Object.values(parsed.identities.networkAreas),
  ];
  if (new Set(ids).size !== ids.length)
    throw new Error("Duplicate resource identity");
  return parsed;
}
export function compileCommonConfiguration(input: CommonConfiguration): Values {
  return flatten(readCommonConfiguration(input));
}
export function exportCommonTfvars(input: CommonConfiguration): string {
  return serializeTfvars(compileCommonConfiguration(input));
}
export function commonNetworkAreas(input: CommonConfiguration): NetworkArea[] {
  const document = readCommonConfiguration(input);
  return areaLocations(flatten(document)).map((area) => ({
    ...area,
    id: document.identities.networkAreas[area.path] as string,
  }));
}
export function commonProjects(input: CommonConfiguration): CommonProject[] {
  const document = readCommonConfiguration(input);
  const values = flatten(document);
  const areas = commonNetworkAreas(document);
  const region = textValue(values.region) || "eu01";
  const projects: CommonProject[] = Object.entries(
    objectValue(values.landing_zones),
  ).map(([key, raw]) => {
    const settings = structuredClone(objectValue(raw));
    const kind = settings.corporate === false ? "public" : "corporate";
    const projectRegion = textValue(settings.region) || region;
    const area = areas.find(
      (item) =>
        item.region === projectRegion &&
        item.key === (textValue(settings.network_area_key) || "default"),
    );
    return {
      id: document.identities.landingZones[key] as string,
      key,
      kind,
      folder:
        kind === "public" ? "landing_zones_public" : "landing_zones_corporate",
      region: projectRegion,
      areaId: kind === "corporate" ? (area?.id ?? null) : null,
      settings,
    };
  });
  if (Array.isArray(values.sandboxes))
    values.sandboxes.forEach((settings, index) => {
      projects.push({
        id: document.identities.sandboxes[index] as string,
        key: null,
        kind: "sandbox",
        folder: "sandboxes",
        region,
        areaId: null,
        settings: structuredClone(objectValue(settings)),
      });
    });
  return projects;
}

// Structural edit only; business validation is separate so an incomplete draft
// remains editable. Caller supplies stable identities when adding/removing entities.
export function setCommonInput(
  input: CommonConfiguration,
  name: string,
  value: JsonValue | undefined,
): CommonConfiguration {
  const document = readCommonConfiguration(input);
  const group = inputGroup(name);
  if (group === "credentials")
    throw new Error("Secret requires server binding");
  if (value === undefined) delete document.features[group][name];
  else document.features[group][name] = structuredClone(value);
  return readCommonConfiguration(document);
}

export function renameCommonProject(
  input: CommonConfiguration,
  id: string,
  key: string,
): CommonConfiguration {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(key))
    throw new Error("Invalid project key");
  const document = readCommonConfiguration(input);
  const oldKey = Object.keys(document.identities.landingZones).find(
    (item) => document.identities.landingZones[item] === id,
  );
  if (!oldKey) throw new Error("Unknown landing zone");
  if (oldKey === key) return document;
  const projects = objectValue(document.features.projects.landing_zones);
  if (Object.hasOwn(projects, key))
    throw new Error("Project key already exists");
  projects[key] = projects[oldKey] as JsonValue;
  delete projects[oldKey];
  document.identities.landingZones[key] = id;
  delete document.identities.landingZones[oldKey];
  const namespaces = objectValue(
    document.features.projects.landing_zone_namespace_services,
  );
  if (Object.hasOwn(namespaces, oldKey)) {
    if (Object.hasOwn(namespaces, key))
      throw new Error("Namespace key already exists");
    namespaces[key] = namespaces[oldKey] as JsonValue;
    delete namespaces[oldKey];
  }
  return readCommonConfiguration(document);
}

export function removeCommonNetworkArea(
  input: CommonConfiguration,
  id: string,
): CommonConfiguration {
  const document = readCommonConfiguration(input);
  const area = commonNetworkAreas(document).find((item) => item.id === id);
  if (!area) throw new Error("Unknown network area");
  const values = flatten(document);
  const base =
    values.connectivity_regions != null
      ? objectValue(
          objectValue(document.features.network.connectivity_regions)[
            area.region
          ],
        )
      : objectValue(document.features.network.connectivity);
  const clusters = Object.values(objectValue(values.platform_kubernetes));
  const clusterReference = clusters.some((raw) => {
    const cluster = objectValue(raw);
    const network = objectValue(cluster.network);
    return (
      cluster.region === area.region &&
      network.sna_enabled === true &&
      network.sna_network_area_id == null &&
      (textValue(network.network_area_key) || "default") === area.key
    );
  });
  const dnsReference = Object.values(objectValue(base.dns_zones)).some(
    (raw) =>
      (textValue(objectValue(raw).network_area_key) || "default") === area.key,
  );
  if (
    commonProjects(document).some((project) => project.areaId === id) ||
    clusterReference ||
    dnsReference ||
    Object.hasOwn(objectValue(base.firewalls), area.key) ||
    base.firewall != null ||
    base.vpn != null
  )
    throw new Error("Network area still referenced by projects or services");
  if (area.path.endsWith(".network_area")) delete base.network_area;
  else delete objectValue(base.network_areas)[area.key];
  delete document.identities.networkAreas[area.path];
  return readCommonConfiguration(document);
}

export const commonFeatureTitles = Object.fromEntries(
  publicFeatureGroups.map((key) => [key, featureGroups[key].title]),
);
