import { randomUUID } from "node:crypto";
import {
  catalogue,
  createCommonConfiguration,
  createDraft,
  createEditorConfiguration,
  editCommonInput,
  initialPlanIssues,
  migrateCommonConfiguration,
  objectValue,
  savedDraft,
  type Template,
} from "@lzc/domain";
import { expect, it } from "vitest";

function fixture() {
  const draft = createDraft(
    catalogue.templates.find((t) => t.id === "standalone") as Template,
  );
  draft.organization = randomUUID();
  draft.owner = "owner@stackit.cloud";
  for (const project of draft.projects) project.owner = draft.owner;
  for (const sandbox of draft.sandboxes) sandbox.owner = draft.owner;
  return migrateCommonConfiguration(savedDraft(randomUUID(), draft));
}
it("allows the reviewed public/sandbox subset independently of the origin template label", () => {
  const document = fixture();
  expect(initialPlanIssues(document)).toEqual([]);
  document.origin = createCommonConfiguration(
    "hub-and-spoke",
    randomUUID(),
  ).origin;
  expect(initialPlanIssues(document)).toEqual([]);
  expect(
    initialPlanIssues(editCommonInput(document, "platform_kubernetes", {})),
  ).toEqual([]);
});
it("does not interpret omitted corporate as Public and blocks additional project services", () => {
  const document = fixture();
  const projects = structuredClone(
    objectValue(document.features.projects.landing_zones),
  );
  const key = Object.keys(projects)[0] as string;
  const project = objectValue(projects[key]);
  delete project.corporate;
  expect(
    initialPlanIssues(
      editCommonInput(document, "landing_zones", projects),
    ).some((i) => i.field.endsWith("corporate")),
  ).toBe(true);
  project.corporate = false;
  project.observability = { enabled: true };
  expect(
    initialPlanIssues(
      editCommonInput(document, "landing_zones", projects),
    ).some((i) => i.field.endsWith("observability")),
  ).toBe(true);
});
it("rejects network, Kubernetes and regional execution rather than trusting a Standalone label", () => {
  const document = fixture();
  for (const [key, value] of [
    ["devops", { git_flavor: "git-10" }],
    [
      "platform_kubernetes",
      createCommonConfiguration("hub-and-spoke-multi-region", randomUUID())
        .features.platform.platform_kubernetes,
    ],
    ["observability", {}],
    ["audit_logs", {}],
    ["region", "eu02"],
  ] as const) {
    expect(
      initialPlanIssues(editCommonInput(document, key, value)).some(
        (i) => i.field === key,
      ),
      key,
    ).toBe(true);
  }
});

it("accepts a new Standalone editor draft after filling identities and rejects ignored nested fields", () => {
  let document = createEditorConfiguration("standalone", randomUUID());
  document = editCommonInput(document, "organization_id", randomUUID());
  document = editCommonInput(document, "owner_email", "owner@stackit.cloud");
  const projects = structuredClone(
    objectValue(document.features.projects.landing_zones),
  );
  for (const raw of Object.values(projects))
    objectValue(raw).owner_email = "owner@stackit.cloud";
  document = editCommonInput(document, "landing_zones", projects);
  document = editCommonInput(document, "sandboxes", [
    { project_name: "Sandbox", project_owner_email: "owner@stackit.cloud" },
  ]);
  expect(initialPlanIssues(document)).toEqual([]);
  // Unknown attributes are rejected by the input contract before execution.
  expect(() =>
    editCommonInput(document, "sandboxes", [
      {
        project_name: "Sandbox",
        project_owner_email: "owner@stackit.cloud",
        ignored_feature: true,
      },
    ]),
  ).toThrow();
  const folders = {
    platform: {
      name: "Platform",
      owner_emails: [],
      reader_emails: [],
      description: "Not implemented by Accelerator",
    },
  };
  const modified = editCommonInput(document, "rm_folders", folders);
  expect(
    initialPlanIssues(modified).some((i) => i.field.endsWith("description")),
  ).toBe(true);
});
