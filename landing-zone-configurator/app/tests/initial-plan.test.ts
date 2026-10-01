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
  recordValues,
  savedDraft,
  serializeTfvars,
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

it("plans reviewed governance subjects and parent folders without rewriting saved exports", () => {
  let document = fixture();
  document = editCommonInput(document, "organization_owners", [
    "admin@stackit.cloud",
  ]);
  document = editCommonInput(document, "organization_auditors", [
    "audit@stackit.cloud",
  ]);
  document = editCommonInput(document, "rm_folder_parent_id", randomUUID());
  for (const description of [undefined, null, ""]) {
    const folders = {
      platform: {
        name: "Platform",
        owner_emails: ["folder-owner@stackit.cloud"],
        reader_emails: ["folder-reader@stackit.cloud"],
        ...(description === undefined ? {} : { description }),
      },
      landing_zones_public: {
        name: "Public",
        owner_emails: [],
        reader_emails: [],
      },
      sandboxes: { name: "Sandbox", owner_emails: [], reader_emails: [] },
    };
    const updated = editCommonInput(document, "rm_folders", folders);
    const before = serializeTfvars(recordValues(updated));
    expect(initialPlanIssues(updated)).toEqual([]);
    expect(serializeTfvars(recordValues(updated))).toBe(before);
    expect(recordValues(updated).rm_folders).toEqual(folders);
  }
  expect(
    initialPlanIssues(
      editCommonInput(document, "rm_folder_parent_id", "not-a-uuid"),
    ),
  ).toContainEqual(
    expect.objectContaining({
      field: "rm_folder_parent_id",
      message: expect.stringContaining("UUID"),
    }),
  );
});
it("explains ignored populated descriptions and keeps federation/network execution gated", () => {
  const document = fixture();
  const updated = editCommonInput(document, "rm_folders", {
    platform: {
      name: "Platform",
      owner_emails: [],
      reader_emails: [],
      description: "Important text",
    },
  });
  expect(initialPlanIssues(updated)).toContainEqual(
    expect.objectContaining({
      field: "rm_folders.platform.description",
      message: expect.stringContaining("#82"),
    }),
  );
  const federation = editCommonInput(document, "federated_identity_providers", [
    {
      name: "github",
      issuer: "https://token.actions.githubusercontent.com",
      assertions: [
        {
          item: "sub",
          operator: "equals",
          value: "repo:example/app:ref:refs/heads/main",
        },
      ],
    },
  ]);
  expect(initialPlanIssues(federation)).toContainEqual(
    expect.objectContaining({
      field: "federated_identity_providers",
      message: expect.stringContaining("federated_identity_providers"),
    }),
  );
});
