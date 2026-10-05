import {
  addCommonProject,
  assessCommonConfiguration,
  commonNetworkAreas,
  commonProjects,
  compileCommonConfiguration,
  createCommonConfiguration,
  createEditorConfiguration,
  editCommonInput,
  editorIssues,
  featureFieldCatalogue,
  type InputType,
  migrateCommonConfiguration,
  objectValue,
  projectTemplates,
  readEditorDraft,
  removeCommonProject,
  saveEditorDraft,
} from "@lzc/domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { labels } from "../apps/web/src/components/feature-labels.js";
import { StructuredField } from "../apps/web/src/components/StructuredField.js";

it("offers documented STACKIT DNS and VPN enums without dropping imported values", () => {
  for (const [path, choices] of [
    ["connectivity.dns_zones[*].type", ["primary", "secondary"]],
    ["connectivity_regions[*].dns_zones[*].type", ["primary", "secondary"]],
    [
      "connectivity.vpn.connections.example.tunnel1.phase1.encryption_algorithms[*]",
      ["aes256", "aes128gcm16", "aes256gcm16"],
    ],
    [
      "connectivity.vpn.connections.example.tunnel2.phase2.integrity_algorithms[*]",
      ["sha1", "sha2_256", "sha2_384", "sha2_512"],
    ],
    [
      "connectivity.vpn.connections.example.tunnel1.phase1.dh_groups[*]",
      ["modp1024", "modp2048", "ecp256", "ecp384", "modp2048s256"],
    ],
  ] as const) {
    const markup = renderToStaticMarkup(
      createElement(StructuredField, {
        name: "enum",
        path,
        type: "string",
        value: "imported-value",
        onChange: () => {},
      }),
    );
    expect(markup).toContain("<select");
    for (const choice of choices) expect(markup).toContain(`value="${choice}"`);
    expect(markup).toContain('value="imported-value" disabled="" selected=""');
  }
});

it("hides inactive structured template details recursively without changing values", () => {
  const service: InputType = [
    "object",
    { enabled: "bool", plan_name: "string" },
  ];
  const type: InputType = [
    "object",
    {
      service,
      services: ["list", service],
      catalogue: ["map", service],
      demo_enabled: "bool",
      demo_description: "string",
    },
  ];
  const value = {
    service: { enabled: false, plan_name: "retained-object-plan" },
    services: [{ enabled: false, plan_name: "retained-list-plan" }],
    catalogue: {
      example: { enabled: false, plan_name: "retained-map-plan" },
    },
    demo_enabled: false,
    demo_description: "retained-demo-detail",
  };
  const before = structuredClone(value);
  const render = (hideInactiveDetails: boolean) =>
    renderToStaticMarkup(
      createElement(StructuredField, {
        name: "template-services",
        type,
        value,
        hideInactiveDetails,
        onChange: () => {},
      }),
    );
  const hidden = render(true);
  const visible = render(false);
  for (const retained of [
    "retained-object-plan",
    "retained-list-plan",
    "retained-map-plan",
    "retained-demo-detail",
  ]) {
    expect(hidden).not.toContain(retained);
    expect(visible).toContain(retained);
  }
  value.service.enabled = true;
  expect(render(true)).toContain("retained-object-plan");
  value.service.enabled = false;
  value.demo_enabled = true;
  expect(render(true)).toContain("retained-demo-detail");
  value.demo_enabled = false;
  expect(value).toEqual(before);
});

const id = "11111111-2222-4333-8444-555555555555";
it("provides human labels for every editable feature field", () => {
  const missing = featureFieldCatalogue()
    .filter((field) => !field.sensitive)
    .map((field) => (field.path.split(".").at(-1) ?? "").replaceAll("[*]", ""))
    .filter((name) => !labels[name]);
  expect([...new Set(missing)]).toEqual([]);
});
it("adds all project kinds with stable identities and removes only the selected sandbox", () => {
  let document = createCommonConfiguration("hub-and-spoke", id);
  document = addCommonProject(document, "public", "new-public");
  document = addCommonProject(document, "corporate", "new-corp");
  document = addCommonProject(document, "sandbox", "");
  const projects = commonProjects(document);
  expect(projects.find((project) => project.key === "new-public")?.kind).toBe(
    "public",
  );
  expect(projects.find((project) => project.key === "new-corp")?.kind).toBe(
    "corporate",
  );
  const last = projects.at(-1);
  if (!last) throw new Error("Missing sandbox");
  const oldIds = document.identities.sandboxes.slice(0, -1);
  document = removeCommonProject(document, last.id);
  expect(document.identities.sandboxes).toEqual(oldIds);
  expect(() => addCommonProject(document, "public", "new-public")).toThrow(
    "existiert",
  );
});
it("normalizes a legacy single area without changing references or identities", () => {
  const document = createCommonConfiguration("hub-and-spoke", id);
  const before = commonNetworkAreas(document)[0];
  const network = { ...objectValue(document.features.network.connectivity) };
  network.network_areas = { default: network.network_area ?? null };
  delete network.network_area;
  const converted = editCommonInput(document, "connectivity", network);
  expect(commonNetworkAreas(converted)[0]?.id).toBe(before?.id);
  expect(
    commonProjects(converted).find((project) => project.kind === "corporate")
      ?.areaId,
  ).toBe(before?.id);
  expect(() => editCommonInput(converted, "connectivity", null)).toThrow(
    "referenced",
  );
});
it("restores unfinished common browser drafts but rejects saving placeholder identities", () => {
  const document = createCommonConfiguration("hub-and-spoke", id);
  document.name = "";
  expect(readEditorDraft(JSON.parse(JSON.stringify(document)))).toEqual(
    document,
  );
  expect(editorIssues(document).length).toBeGreaterThan(0);
  expect(() => saveEditorDraft(id, document)).toThrow("Invalid");
  expect(migrateCommonConfiguration(document)).toEqual(document);
});

it("repairs only new Standalone editor presets without changing the source/import contract", () => {
  const source = createCommonConfiguration("standalone", id);
  const original = compileCommonConfiguration(source);
  const draft = createEditorConfiguration("standalone", id);
  expect(
    projectTemplates(draft).find((project) => project.key === "public-exmpl")
      ?.kind,
  ).toBe("public");
  expect(
    assessCommonConfiguration(draft).findings.filter(
      (finding) =>
        finding.scope === "configuration" && finding.severity === "error",
    ),
  ).toEqual([]);
  expect(commonProjects(draft)).toEqual([]);
  expect(compileCommonConfiguration(source)).toEqual(original);
  expect(
    commonProjects(source).find((project) => project.key === "public-exmpl")
      ?.kind,
  ).toBe("corporate");
  expect(readEditorDraft(source)).toEqual(source);
});

it("checks VPN prerequisites without treating an editor draft as deployable", () => {
  let document = createCommonConfiguration("standalone", id);
  document = editCommonInput(document, "connectivity_regions", {
    eu01: {
      vpn: {
        availability_zones: { tunnel1: "", tunnel2: "" },
        connections: {
          office: {
            tunnel1: { remote_address: "" },
            tunnel2: { remote_address: "" },
          },
        },
      },
    },
  });
  const codes = assessCommonConfiguration(document).findings.map(
    (finding) => finding.code,
  );
  expect(codes).toContain("vpn-needs-sna");
  expect(codes).toContain("vpn-availability-zone");
  expect(codes).toContain("vpn-peer-address");
  expect(codes).toContain("vpn-routing-input");
});
