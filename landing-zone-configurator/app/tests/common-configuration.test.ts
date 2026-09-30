import { createHash } from "node:crypto";
import {
  acceleratorInputs,
  assessCommonConfiguration,
  type CommonConfiguration,
  catalogue,
  commonNetworkAreas,
  commonProjects,
  compileCommonConfiguration,
  configurationValues,
  createCommonConfiguration,
  createDraft,
  effectiveInput,
  exportCommonTfvars,
  featureFieldCatalogue,
  featureGroups,
  migrateCommonConfiguration,
  objectValue,
  readCommonConfiguration,
  removeCommonNetworkArea,
  renameCommonProject,
  savedDraft,
  savedDraftSchema,
  serializeTfvars,
  setCommonInput,
  type Template,
  validatePublicInputs,
} from "@lzc/domain";
import { describe, expect, it } from "vitest";

const id = "11111111-2222-4333-8444-555555555555";
const create = (template = "standalone") =>
  createCommonConfiguration(template, id);
const values = (document: CommonConfiguration) =>
  compileCommonConfiguration(document);
const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");

describe("shared accelerator feature contract", () => {
  it("assigns all 28 inputs exactly once, including every protected input", () => {
    const assigned = Object.values(featureGroups).flatMap((group) => [
      ...group.inputs,
    ]);
    expect(assigned.length).toBe(28);
    expect(new Set(assigned).size).toBe(28);
    expect([...assigned].sort()).toEqual(
      acceleratorInputs.map((input) => input.name).sort(),
    );
    const protectedNames = acceleratorInputs
      .filter((input) => input.sensitive)
      .map((input) => input.name)
      .sort();
    expect([...featureGroups.credentials.inputs].sort()).toEqual(
      protectedNames,
    );
    const fields = featureFieldCatalogue();
    expect(new Set(fields.map((field) => field.path)).size).toBe(fields.length);
    expect(fields.some((field) => field.type === "dynamic")).toBe(false);
    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "connectivity_regions[*].network_areas[*].ranges[*]",
          group: "network",
        }),
        expect.objectContaining({
          path: "platform_kubernetes[*].cluster.node_pools[*].maximum",
          group: "platform",
        }),
        expect.objectContaining({
          path: "vpn_pre_shared_keys[*].tunnel1",
          sensitive: true,
        }),
      ]),
    );
  });
  for (const template of catalogue.templates) {
    it(`imports and exports ${template.id} without flattening or default insertion`, () => {
      const before = JSON.stringify(template);
      const document = create(template.id);
      expect(values(document)).toEqual(template.values);
      expect(exportCommonTfvars(document)).toBe(
        serializeTfvars(template.values),
      );
      expect(
        readCommonConfiguration(JSON.parse(JSON.stringify(document))),
      ).toEqual(document);
      expect(JSON.stringify(template)).toBe(before);
      const errors = assessCommonConfiguration(document).findings.filter(
        (item) => item.scope === "configuration" && item.severity === "error",
      );
      // Upstream #84: Standalone omits corporate=false. Import must not hide it.
      expect(errors.map((item) => item.code)).toEqual(
        template.id === "standalone" ? ["project-area-reference"] : [],
      );
    });
  }
  it("distinguishes omitted, explicit null and explicit settings", () => {
    const original = create();
    expect(Object.hasOwn(values(original), "audit_logs")).toBe(false);
    const disabled = setCommonInput(original, "audit_logs", null);
    expect(values(disabled).audit_logs).toBe(null);
    const enabled = setCommonInput(original, "audit_logs", {});
    expect(values(enabled).audit_logs).toEqual({});
    expect(
      objectValue(effectiveInput(values(enabled), "audit_logs")).s3_object_lock,
    ).toBe(true);
    expect(values(enabled).audit_logs).toEqual({});
    expect(assessCommonConfiguration(enabled).findings).toContainEqual(
      expect.objectContaining({ code: "object-lock-default", issue: 81 }),
    );
    expect(
      exportCommonTfvars(setCommonInput(disabled, "audit_logs", undefined)),
    ).toBe(exportCommonTfvars(original));
    const explicit = setCommonInput(enabled, "audit_logs", {
      s3_object_lock: false,
    });
    expect(
      objectValue(effectiveInput(values(explicit), "audit_logs"))
        .s3_object_lock,
    ).toBe(false);
  });
  for (const version of [1, 2]) {
    it(`migrates v${version} with byte-identical tfvars and preparation hash`, () => {
      const template = catalogue.templates.find(
        (item) => item.id === "standalone",
      ) as Template;
      const draft = createDraft(template);
      draft.organization = id;
      draft.owner = "owner@stackit.cloud";
      for (const project of draft.projects) project.owner = draft.owner;
      for (const sandbox of draft.sandboxes) sandbox.owner = draft.owner;
      if (version === 2)
        draft.folders = {
          platform: "Plattform",
          landing_zones_corporate: "Intern",
          landing_zones_public: "Anwendungen",
          sandboxes: "Experimente",
        };
      const old = savedDraft(id, draft);
      expect(old.schemaVersion).toBe(version);
      const oldBytes = serializeTfvars(configurationValues(old));
      const document = migrateCommonConfiguration(old);
      expect(document.name).toBe(draft.name);
      expect(exportCommonTfvars(document)).toBe(oldBytes);
      expect(digest(exportCommonTfvars(document))).toBe(digest(oldBytes));
      expect(migrateCommonConfiguration(document)).toEqual(document);
      expect(old.schemaVersion).toBe(version);
    });
  }
  it("keeps the legacy document schema separate from the common storage format", () => {
    expect(savedDraftSchema.safeParse(create()).success).toBe(false);
  });
  it("removes unreferenced areas but retains their identity until removal", () => {
    const document = create("hub-and-spoke");
    document.features.projects.landing_zones = {};
    document.identities.landingZones = {};
    const network = objectValue(document.features.network.connectivity);
    network.dns_zones = {};
    const area = commonNetworkAreas(document)[0];
    if (!area) throw new Error("Missing area");
    const removed = removeCommonNetworkArea(document, area.id);
    expect(commonNetworkAreas(removed)).toEqual([]);
    expect(commonNetworkAreas(document)[0]?.id).toBe(area.id);
  });
  it("preserves explicit false and optional nested defaults independently", () => {
    const document = setCommonInput(create(), "platform_kubernetes", {
      central: {
        region: "eu01",
        cluster: { name: "central", node_pools: [] },
        dns: { enabled: false },
      },
    });
    const cluster = objectValue(
      objectValue(effectiveInput(values(document), "platform_kubernetes"))
        .central,
    );
    expect(objectValue(cluster.dns).enabled).toBe(false);
    expect(objectValue(cluster.dns).gateway_api).toBe(true);
    expect(objectValue(cluster.network).sna_enabled).toBe(false);
    expect(objectValue(cluster.cluster).node_pools).toEqual([]);
    expect(
      objectValue(objectValue(values(document).platform_kubernetes).central)
        .network,
    ).toBeUndefined();
  });
  it("rejects unknown inputs, nested options, type coercion and secrets", () => {
    for (const [name, value] of [
      ["firewall_admin_password", "secret"],
      ["vpn_pre_shared_keys", {}],
      ["future_flag", true],
    ] as const)
      expect(() => setCommonInput(create(), name, value)).toThrow();
    expect(() =>
      setCommonInput(create(), "devops", { future_flag: true }),
    ).toThrow();
    expect(() =>
      setCommonInput(create(), "audit_logs", { retention_days: "7" }),
    ).toThrow();
    expect(() =>
      setCommonInput(create(), "devops", {
        allowed_network_ranges: ["0.0.0.0/0"],
        git_flavor: "git-100",
      }),
    ).not.toThrow();
    expect(
      validatePublicInputs({
        connectivity_regions: {
          eu01: { firewall_admin_password: "SECRET_SENTINEL" },
        },
      }),
    ).toEqual([
      {
        path: "connectivity_regions.eu01.firewall_admin_password",
        code: "unknown-attribute",
      },
    ]);
    expect(
      JSON.stringify(
        validatePublicInputs({
          connectivity_regions: {
            eu01: { firewall_admin_password: "SECRET_SENTINEL" },
          },
        }),
      ),
    ).not.toContain("SECRET_SENTINEL");
    expect(
      validatePublicInputs({
        connectivity_regions: { eu01: { network_area: {} } },
      })[0]?.code,
    ).toBe("unknown-attribute");
  });
  it("rejects invalid provenance, prototype pollution and identity tampering", () => {
    const document = create();
    document.origin.sha256 = "changed";
    expect(() => readCommonConfiguration(document)).toThrow("revision");
    const wrongGroup = create();
    wrongGroup.features.platform.labels = {};
    expect(() => readCommonConfiguration(wrongGroup)).toThrow("group");
    const duplicate = create();
    duplicate.identities.sandboxes[0] = Object.values(
      duplicate.identities.landingZones,
    )[0] as string;
    expect(() => readCommonConfiguration(duplicate)).toThrow("identity");
    const polluted = JSON.parse('{"__proto__":{"polluted":true}}');
    expect(() => readCommonConfiguration(polluted)).toThrow("Reserved");
    let deep: unknown = {};
    for (let depth = 0; depth < 40; depth++) deep = [deep];
    expect(() => readCommonConfiguration(deep)).toThrow("complex");
  });
});

describe("project and network projections", () => {
  it("unifies project kinds with actual folder and area references", () => {
    const document = create("hub-and-spoke");
    const projects = commonProjects(document);
    expect(new Set(projects.map((project) => project.kind))).toEqual(
      new Set(["public", "corporate", "sandbox"]),
    );
    const corporate = projects.find((project) => project.kind === "corporate");
    expect(corporate?.folder).toBe("landing_zones_corporate");
    expect(corporate?.areaId).toBe(commonNetworkAreas(document)[0]?.id);
  });
  it("keeps distinct multi-region and multi-area identities", () => {
    const document = create("hub-and-spoke-multi-region");
    const areas = commonNetworkAreas(document);
    expect(new Set(areas.map((area) => area.region))).toEqual(
      new Set(["eu01", "eu02"]),
    );
    expect(new Set(areas.map((area) => area.id)).size).toBe(areas.length);
    for (const project of commonProjects(document).filter(
      (item) => item.kind === "corporate",
    ))
      expect(areas.find((area) => area.id === project.areaId)?.region).toBe(
        project.region,
      );
    expect(
      commonNetworkAreas(create("hub-and-spoke-prod-nonprod-firewall")).length,
    ).toBeGreaterThan(1);
  });
  it("renames keys explicitly, keeps stable IDs and follows namespace references", () => {
    let document = create();
    const project = commonProjects(document)[0];
    if (!project?.key) throw new Error("Missing project");
    document = setCommonInput(document, "landing_zone_namespace_services", {
      [project.key]: {},
    });
    const renamed = renameCommonProject(document, project.id, "renamed");
    expect(commonProjects(renamed)[0]?.id).toBe(project.id);
    expect(
      objectValue(values(renamed).landing_zones)[project.key],
    ).toBeUndefined();
    expect(
      objectValue(values(renamed).landing_zone_namespace_services).renamed,
    ).toEqual({});
    expect(
      objectValue(values(document).landing_zones)[project.key],
    ).toBeDefined();
  });
  it("blocks removing areas with project, DNS or appliance references", () => {
    for (const template of [
      "hub-and-spoke",
      "hub-and-spoke-prod-nonprod-firewall",
      "hub-and-spoke-multi-region",
    ]) {
      const document = create(template);
      const area = commonNetworkAreas(document)[0];
      if (!area) throw new Error("Missing area");
      expect(() => removeCommonNetworkArea(document, area.id)).toThrow(
        "referenced",
      );
    }
  });
});

describe("combination and execution boundaries", () => {
  it("separates private API reachability from regional namespace wiring", () => {
    let document = create("hub-and-spoke-multi-region");
    const projects = objectValue(values(document).landing_zones);
    const key = Object.keys(projects)[0] as string;
    document = setCommonInput(document, "landing_zone_namespace_services", {
      [key]: {},
    });
    const report = assessCommonConfiguration(document);
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: "private-kubernetes-unreachable",
        scope: "execution",
        issue: 37,
      }),
    );
    expect(report.findings).toContainEqual(
      expect.objectContaining({ code: "regional-namespace-wiring", issue: 80 }),
    );
    const clusters = objectValue(values(document).platform_kubernetes);
    for (const cluster of Object.values(clusters))
      objectValue(cluster).network = { sna_enabled: false };
    const publicClusters = setCommonInput(
      document,
      "platform_kubernetes",
      clusters,
    );
    const publicReport = assessCommonConfiguration(publicClusters);
    expect(publicReport.findings.some((item) => item.issue === 37)).toBe(false);
    expect(publicReport.findings.some((item) => item.issue === 80)).toBe(true);
  });
  it("flags multi-appliance policy limits without rejecting infrastructure", () => {
    const document = create("hub-and-spoke-prod-nonprod-firewall");
    expect(
      assessCommonConfiguration(document).findings.some(
        (item) => item.issue === 65,
      ),
    ).toBe(false);
    expect(
      assessCommonConfiguration(setCommonInput(document, "firewall_config", {}))
        .findings,
    ).toContainEqual(
      expect.objectContaining({ issue: 65, scope: "execution" }),
    );
  });
  it("detects lost corporate references and all regional project requirements", () => {
    const document = create("hub-and-spoke-multi-region");
    const projects = objectValue(values(document).landing_zones);
    for (const project of Object.values(projects)) {
      objectValue(project).network_area_key = "missing";
      delete objectValue(project).region;
    }
    const changed = setCommonInput(document, "landing_zones", projects);
    const codes = assessCommonConfiguration(changed).findings.map(
      (item) => item.code,
    );
    expect(codes).toContain("project-region-reference");
    expect(codes).toContain("project-area-reference");
  });
});
