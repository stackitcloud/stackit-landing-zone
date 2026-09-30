import {
  addCommonProject,
  commonNetworkAreas,
  commonProjects,
  createCommonConfiguration,
  editCommonInput,
  editorIssues,
  featureFieldCatalogue,
  migrateCommonConfiguration,
  objectValue,
  readEditorDraft,
  removeCommonProject,
  saveEditorDraft,
} from "@lzc/domain";
import { expect, it } from "vitest";
import { labels } from "../apps/web/src/components/feature-labels.js";

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
