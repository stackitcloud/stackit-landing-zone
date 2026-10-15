import { randomUUID } from "node:crypto";
import {
  catalogue,
  createCommonConfiguration,
  createDraft,
  createEditorConfiguration,
  editCommonInput,
  initialPlanIssues,
  initialPlanRequiresFirewallImage,
  type JsonValue,
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
it("rejects Kubernetes and regional execution rather than trusting a Standalone label", () => {
  const document = fixture();
  for (const [key, value] of [
    [
      "platform_kubernetes",
      createCommonConfiguration("hub-and-spoke-multi-region", randomUUID())
        .features.platform.platform_kubernetes,
    ],
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

it("allows packaged management, Git and connectivity services without rewriting exports", () => {
  let document = fixture();
  for (const [key, value] of [
    [
      "devops",
      { git_flavor: "git-10", allowed_network_ranges: ["192.0.2.0/24"] },
    ],
    ["observability", {}],
    ["audit_logs", { s3_object_lock: false }],
    [
      "connectivity",
      {
        network_areas: {
          default: {
            ranges: ["10.0.0.0/16"],
            transfer_network: "10.255.0.0/24",
          },
        },
        dns_zones: { internal: { dns_name: "internal.stackit.run" } },
      },
    ],
  ] satisfies [string, JsonValue][])
    document = editCommonInput(document, key, value);
  const before = serializeTfvars(recordValues(document));
  expect(initialPlanIssues(document)).toEqual([]);
  expect(serializeTfvars(recordValues(document))).toBe(before);
  const scopes = [
    {
      resource_type: "organization",
      resource_id: recordValues(document).organization_id ?? null,
    },
  ];
  expect(
    initialPlanIssues(
      editCommonInput(document, "audit_logs", { link_scopes: scopes }),
    ),
  ).toEqual([]);
  const noAppliances = editCommonInput(fixture(), "connectivity", {
    network_area: {
      ranges: ["10.0.0.0/16"],
      transfer_network: "10.255.0.0/24",
    },
    firewalls: {},
  });
  expect(initialPlanIssues(noAppliances, "apply")).toEqual(
    initialPlanIssues(noAppliances),
  );
  expect(initialPlanRequiresFirewallImage(noAppliances)).toBe(false);
});

it("allows appliance plans but gates apply, VPN connections and unproven audit scopes", () => {
  let document = fixture();
  const connectivity = createCommonConfiguration(
    "hub-and-spoke-firewall",
    randomUUID(),
  ).features.network.connectivity;
  document = editCommonInput(document, "connectivity", connectivity);
  expect(initialPlanIssues(document)).toEqual([]);
  expect(initialPlanRequiresFirewallImage(document)).toBe(true);
  expect(initialPlanIssues(document, "apply")).toContainEqual(
    expect.objectContaining({ field: "connectivity.firewall" }),
  );
  expect(
    initialPlanIssues(editCommonInput(document, "firewall_bootstrap", true)),
  ).toContainEqual(
    expect.objectContaining({
      field: "firewall_bootstrap",
      message: expect.stringContaining("mehrstufigen"),
    }),
  );
  const vpnDocument = editCommonInput(fixture(), "connectivity", {
    network_area: {
      ranges: ["10.0.0.0/16"],
      transfer_network: "10.255.0.0/24",
    },
    vpn: {
      availability_zones: { tunnel1: "eu01-1", tunnel2: "eu01-2" },
      connections: {
        office: {
          static_routes: ["192.0.2.0/24"],
          tunnel1: { remote_address: "192.0.2.1" },
          tunnel2: { remote_address: "198.51.100.1" },
        },
      },
    },
  });
  expect(initialPlanIssues(vpnDocument)).toContainEqual(
    expect.objectContaining({
      field: "connectivity.vpn.connections",
      message: expect.stringContaining("Pre-Shared Keys"),
    }),
  );
  expect(
    initialPlanIssues(
      editCommonInput(fixture(), "connectivity", {
        network_area: {
          ranges: ["10.0.0.0/16"],
          transfer_network: "10.255.0.0/24",
        },
        vpn: { availability_zones: { tunnel1: "eu01-1", tunnel2: "eu01-2" } },
      }),
    ),
  ).toEqual([]);
  for (const scope of [
    { resource_type: "organization", resource_id: randomUUID() },
    { resource_type: "folder", resource_id: randomUUID() },
    { resource_type: "project", resource_id: randomUUID() },
  ])
    expect(
      initialPlanIssues(
        editCommonInput(fixture(), "audit_logs", { link_scopes: [scope] }),
      ),
    ).toContainEqual(
      expect.objectContaining({ field: "audit_logs.link_scopes.0" }),
    );
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
it("explains ignored populated descriptions and keeps federation execution gated", () => {
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
