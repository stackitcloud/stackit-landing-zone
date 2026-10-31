import {
  applicationPlatformImpactSchema,
  applicationUpgradeAssessmentSchema,
  applicationUpgradeSafetySchema,
  classifyApplicationUpgradePlan,
  classifyPlatformApplicationImpactPlan,
} from "@lzc/contracts";
import { expect, it } from "vitest";
import {
  assessApplicationPlatformUpgrade,
  assessApplicationTemplateUpgrade,
  assessPlatformDependencyImpact,
  resolveTemplateParameters,
  type TemplateParameterSource,
} from "../packages/domain/src/index.js";

const tenant = "11111111-1111-4111-8111-111111111111",
  family = "22222222-2222-4222-8222-222222222222",
  oldId = "33333333-3333-4333-8333-333333333333",
  newId = "44444444-4444-4444-8444-444444444444",
  platformId = "55555555-5555-4555-8555-555555555555";
function fixture() {
  const current = {
    id: oldId,
    tenantId: tenant,
    templateId: family,
    version: 1,
    publishedBy: tenant,
    publishedAt: "2026-10-29T00:00:00.000Z",
    deploymentPolicy: "direct" as "direct" | "approval-required",
    acceleratorRevision: "08ac257de1548c8ec5e83dae1a79373711c3d644",
    platformRevision: platformId,
    targetKey: "public",
    template: {
      id: family,
      key: "public",
      name: "Public",
      kind: "public" as const,
      region: "eu01" as const,
      settings: {
        env: "dev",
        network_enabled: true,
        network_prefix_length: 24,
        secretsmanager_enabled: false,
        custom_roles: [],
        role_assignments: [],
        observability: {
          enabled: false,
          plan_name: "Observability-Starter-EU01",
          acl: [],
        },
      },
      parameterPolicy: {
        schema_version: 1 as const,
        fields: {} as Record<string, TemplateParameterSource>,
      },
    },
  };
  const target = { ...structuredClone(current), id: newId, version: 2 };
  const platform = {
    schema_version: 1,
    tenant_id: tenant,
    revision: platformId,
    organization_id: tenant,
    targets: {
      public: {
        folder_id: "folder",
        region: "eu01",
        corporate: false,
        network_area_id: null,
        firewall_next_hop_ip: null,
        ipv4_nameservers: null,
      },
    },
  };
  const currentSettings = {
    ...resolveTemplateParameters(current.template, {}).settings,
    owner_email: "owner@example.test",
  };
  return {
    current,
    target,
    currentSettings,
    parameters: {},
    verifiedStackitEmail: "owner@example.test",
    currentPlatform: platform,
    targetPlatform: structuredClone(platform),
    currentBackendIdentity: "backend-state-identity",
    targetBackendIdentity: "backend-state-identity",
  };
}
it("assesses a same-family metadata upgrade without mutating order decisions or implying execution approval", () => {
  const input = fixture(),
    before = structuredClone(input);
  input.target.template.name = "Updated description";
  const assessment = assessApplicationTemplateUpgrade(input);
  expect(applicationUpgradeAssessmentSchema.parse(assessment)).toMatchObject({
    classification: "ordinary",
    approvalPolicy: "direct",
    retainedParameters: {},
    requiresFreshPlan: true,
    applyAllowed: false,
    targetSettings: { owner_email: "owner@example.test", env: "dev" },
  });
  expect(input.current).toEqual(before.current);
  expect(input.currentSettings).toEqual(before.currentSettings);
});
it("freezes a previously resolved input default instead of applying the target default", () => {
  const input = fixture();
  input.target.template.parameterPolicy.fields = {
    env: {
      source: "input",
      required: true,
      default: "prod",
      choices: ["dev", "prod"],
    },
  };
  expect(assessApplicationTemplateUpgrade(input)).toMatchObject({
    classification: "ordinary",
    retainedParameters: { env: "dev" },
    targetSettings: { env: "dev" },
  });
  expect(
    assessApplicationTemplateUpgrade({
      ...input,
      requestedParameters: { env: "prod" },
    }),
  ).toMatchObject({
    classification: "blocked",
    targetSettings: { env: "prod" },
  });
});
it.each([
  "family",
  "tenant",
  "region",
  "folder",
  "organization",
  "network-mode",
  "network-area",
  "backend",
  "owner",
  "env",
  "component",
  "unknown",
])("blocks identity/migration/removal changes: %s", (change) => {
  const input = fixture();
  switch (change) {
    case "family":
      input.target.templateId = tenant;
      break;
    case "tenant":
      input.target.tenantId = family;
      break;
    case "region":
      input.targetPlatform.targets.public.region = "eu02";
      break;
    case "folder":
      input.targetPlatform.targets.public.folder_id = "other-folder";
      break;
    case "organization":
      input.targetPlatform.organization_id = family;
      break;
    case "network-mode":
      input.targetPlatform.targets.public.corporate = true;
      Object.assign(input.targetPlatform.targets.public, {
        network_area_id: tenant,
      });
      break;
    case "network-area":
      Object.assign(input.targetPlatform.targets.public, {
        network_area_id: tenant,
      });
      break;
    case "backend":
      input.targetBackendIdentity = "different";
      break;
    case "owner":
      input.verifiedStackitEmail = "different@example.test";
      break;
    case "env":
      input.target.template.settings.env = "prod";
      break;
    case "component":
      input.target.template.settings.network_enabled = false;
      break;
    case "unknown":
      Object.assign(input.target.template.settings, { unknown_feature: true });
      break;
  }
  expect(assessApplicationTemplateUpgrade(input).classification).toBe(
    "blocked",
  );
});
it.each(["network_enabled", "network_prefix_length"] as const)(
  "blocks native network topology changes: %s",
  (field) => {
    const input = fixture();
    if (field === "network_enabled") {
      Object.assign(input.currentSettings, { network_enabled: false });
    } else {
      input.target.template.settings.network_prefix_length = 25;
    }
    expect(assessApplicationTemplateUpgrade(input)).toMatchObject({
      classification: "blocked",
      reasons: expect.arrayContaining([
        {
          code: "network-change",
          path: `settings.${field}`,
          classification: "blocked",
        },
      ]),
    });
  },
);
it("never drops stored parameters when the new publication stops accepting them", () => {
  const input = fixture();
  input.current.template.parameterPolicy.fields = {
    env: { source: "input", required: true },
  };
  const result = assessApplicationTemplateUpgrade({
    ...input,
    parameters: { env: "dev" },
  });
  expect(result).toMatchObject({
    classification: "blocked",
    retainedParameters: { env: "dev" },
  });
  expect(
    result.reasons.some((r) => r.code === "parameters-not-compatible"),
  ).toBe(true);
});
it("requires explicit confirmation for a new input without a durable prior decision", () => {
  const input = fixture();
  input.target.template.parameterPolicy.fields = {
    "observability.plan_name": {
      source: "input",
      required: true,
      default: "Observability-Starter-EU01",
    },
  };
  const settings = structuredClone(input.currentSettings) as Record<
    string,
    unknown
  >;
  settings.observability = { enabled: false, acl: [] };
  const result = assessApplicationTemplateUpgrade({
    ...input,
    currentSettings: settings,
  });
  expect(result).toMatchObject({
    classification: "blocked",
    requiredParameters: [
      { path: "observability.plan_name", required: true, hasDefault: true },
    ],
  });
});
it("classifies IAM additions as sensitive and preserves the stricter deployment/edge policy", () => {
  const input = fixture();
  Object.assign(input.target.template.settings, {
    role_assignments: [
      { role: "project.reader", subject: "owner@example.test" },
    ],
  });
  expect(assessApplicationTemplateUpgrade(input)).toMatchObject({
    classification: "sensitive",
    approvalPolicy: "approval-required",
  });
  expect(
    assessApplicationTemplateUpgrade({
      ...input,
      edgePolicy: { sensitive: "direct" },
    }),
  ).toMatchObject({ classification: "sensitive", approvalPolicy: "direct" });
  input.current.deploymentPolicy = "approval-required";
  expect(
    assessApplicationTemplateUpgrade({
      ...input,
      edgePolicy: { sensitive: "direct" },
    }).approvalPolicy,
  ).toBe("approval-required");
  input.current.deploymentPolicy = "direct";
  input.target.deploymentPolicy = "approval-required";
  expect(
    assessApplicationTemplateUpgrade({
      ...input,
      edgePolicy: { sensitive: "direct" },
    }).approvalPolicy,
  ).toBe("approval-required");
});
const change = (type: string, actions: string[], mode = "managed") => ({
  mode,
  type,
  address: "secret@example.test",
  change: {
    actions,
    before: { secret: "DO-NOT-EMIT" },
    after: { secret: "DO-NOT-EMIT" },
  },
});
const plan = (resource_changes: unknown[]) => ({
  format_version: "1.2",
  terraform_version: "1.12.6",
  complete: true,
  planned_values: { root_module: {} },
  resource_changes,
});
it.each([
  "stackit_authorization_project_role_assignment",
  "stackit_authorization_project_custom_role",
  "stackit_service_account_key",
  "stackit_objectstorage_credential",
  "time_rotating",
  "stackit_network",
  "stackit_routing_table_route",
])("requires sensitive approval for actual native %s changes", (type) => {
  const result = classifyApplicationUpgradePlan(
    plan([change(type, ["create"])]),
  );
  expect(applicationUpgradeSafetySchema.parse(result).classification).toBe(
    "sensitive",
  );
  expect(JSON.stringify(result)).not.toMatch(/DO-NOT-EMIT|secret@example/);
});
it.each(["stackit_observability_instance", "stackit_secretsmanager_instance"])(
  "classifies all non-destructive %s service changes conservatively",
  (type) => {
    for (const actions of [["create"], ["update"]]) {
      const resource = {
        ...change(type, actions),
        change: {
          actions,
          before: {
            secret: "DO-NOT-EMIT",
            plan_name: "larger",
            retention_days: 30,
          },
          after: {
            secret: "DO-NOT-EMIT",
            plan_name: "smaller",
            retention_days: 7,
          },
        },
      };
      expect(classifyApplicationUpgradePlan(plan([resource]))).toEqual({
        classification: "sensitive",
        reasons: [
          {
            code: "plan-service-change",
            path: "resource_changes.0",
            classification: "sensitive",
          },
        ],
      });
    }
    expect(
      classifyApplicationUpgradePlan(plan([change(type, ["no-op"])])),
    ).toEqual({ classification: "ordinary", reasons: [] });
    for (const actions of [
      ["delete"],
      ["delete", "create"],
      ["create", "delete"],
    ])
      expect(
        classifyApplicationUpgradePlan(plan([change(type, actions)]))
          .classification,
      ).toBe("blocked");
  },
);
it.each([
  { actions: ["delete"] },
  { actions: ["create", "delete"] },
  { actions: ["delete", "create"] },
  { actions: ["forget"] },
  { actions: ["update", "create"] },
])("hard-blocks destructive/unknown native actions $actions", ({ actions }) => {
  expect(
    classifyApplicationUpgradePlan(plan([change("stackit_network", actions)]))
      .classification,
  ).toBe("blocked");
});
it.each([
  {},
  { ...plan([]), complete: false },
  { ...plan([]), deferred_changes: [{}] },
  { ...plan([]), errored: true },
  plan([
    {
      mode: "managed",
      type: "stackit_network",
      change: { actions: ["update"], before: {} },
    },
  ]),
  plan([change("new_unreviewed_type", ["no-op"])]),
])("fails closed on missing/partial/unreviewed native evidence", (raw) => {
  expect(classifyApplicationUpgradePlan(raw).classification).toBe("blocked");
});
it("allows only non-destructive known ordinary resource changes as ordinary", () => {
  expect(
    classifyApplicationUpgradePlan(
      plan([
        change("stackit_objectstorage_bucket", ["create"]),
        change("stackit_network", ["no-op"]),
      ]),
    ),
  ).toEqual({ classification: "ordinary", reasons: [] });
});
it("shows shared-platform impact before Apply without pretending per-Application isolation", () => {
  const input = fixture();
  input.targetPlatform.targets.public.firewall_next_hop_ip =
    "10.0.0.7" as never;
  const result = assessPlatformDependencyImpact({
    before: input.currentPlatform,
    after: input.targetPlatform,
    dependencies: [{ instanceId: oldId, targetKey: "public" }],
  });
  expect(result).toMatchObject({
    classification: "sensitive",
    affected: [{ instanceId: oldId, classification: "sensitive" }],
    scannedDependencies: 1,
    sharedResourcesChangeImmediately: true,
    perApplicationIsolation: false,
  });
  const after = { ...input.targetPlatform, targets: {} };
  expect(
    assessPlatformDependencyImpact({
      before: input.currentPlatform,
      after,
      dependencies: [{ instanceId: oldId, targetKey: "public" }],
    }).classification,
  ).toBe("blocked");
});

it("rebinds the same immutable publication to an actual new compatible contract, retaining all settings/parameters", () => {
  const input = fixture();
  input.targetPlatform.revision = newId;
  const { target, ...platformInput } = input;
  const baseline = structuredClone(platformInput);
  const result = assessApplicationPlatformUpgrade(platformInput);
  expect(applicationUpgradeAssessmentSchema.parse(result)).toMatchObject({
    classification: "ordinary",
    retainedParameters: platformInput.parameters,
    targetSettings: platformInput.currentSettings,
    requiresFreshPlan: true,
    applyAllowed: false,
  });
  expect(platformInput).toEqual(baseline);
  expect(target.platformRevision).toBe(platformId);
});
it("uses the effective current Platform binding without rewriting its origin publication", () => {
  const input = fixture();
  input.currentPlatform.revision = oldId;
  input.targetPlatform.revision = newId;
  const { target, ...platformInput } = input;
  expect(assessApplicationPlatformUpgrade(platformInput).classification).toBe(
    "blocked",
  );
  expect(
    assessApplicationPlatformUpgrade({
      ...platformInput,
      currentPlatformRevision: oldId,
    }).classification,
  ).toBe("ordinary");
  expect(target.platformRevision).toBe(platformId);
});
it("does not mix parameter edits or state migrations into a Platform-only upgrade", () => {
  const input = fixture();
  input.targetPlatform.revision = newId;
  const { target: _target, ...platformInput } = input;
  expect(
    assessApplicationPlatformUpgrade({
      ...platformInput,
      requestedParameters: { env: "prod" },
    }).classification,
  ).toBe("blocked");
  expect(
    assessApplicationPlatformUpgrade({
      ...platformInput,
      targetBackendIdentity: "different",
    }).classification,
  ).toBe("blocked");
});
it.each([
  "opnsense_firewall_filter",
  "stackit_network_area",
  "stackit_routing_table_route",
  "stackit_dns_zone",
  "stackit_ske_cluster",
  "stackit_observability_instance",
])(
  "projects shared Platform resource %s changes conservatively without private values",
  (type) => {
    const result = classifyPlatformApplicationImpactPlan(
      plan([change(type, ["update"])]),
    );
    expect(applicationPlatformImpactSchema.parse(result)).toMatchObject({
      classification: "sensitive",
      changedResourceTypes: [type],
      sharedChanges: true,
    });
    expect(JSON.stringify(result)).not.toMatch(/DO-NOT-EMIT|secret@example/);
    expect(
      classifyPlatformApplicationImpactPlan(
        plan([change(type, ["delete", "create"])]),
      ),
    ).toMatchObject({ classification: "blocked", sharedChanges: true });
  },
);
it("blocks unknown/partial shared Platform plans without echoing unknown type strings", () => {
  const result = classifyPlatformApplicationImpactPlan(
    plan([change("private-unreviewed-customer-value", ["update"])]),
  );
  expect(result).toMatchObject({
    classification: "blocked",
    changedResourceTypes: [],
    sharedChanges: true,
  });
  expect(JSON.stringify(result)).not.toContain("private-unreviewed");
  expect(classifyPlatformApplicationImpactPlan({}).classification).toBe(
    "blocked",
  );
  expect(
    classifyPlatformApplicationImpactPlan({ ...plan([]), complete: false })
      .classification,
  ).toBe("blocked");
});
it("reports no shared mutation only for complete known no-op/read plans", () => {
  expect(
    classifyPlatformApplicationImpactPlan(
      plan([change("stackit_network", ["no-op"])]),
    ),
  ).toEqual({
    classification: "ordinary",
    reasons: [],
    changedResourceTypes: [],
    sharedChanges: false,
  });
});

it("rejects parameter values the compatibility resolver would otherwise ignore", () => {
  const input = fixture();
  expect(
    assessApplicationTemplateUpgrade({
      ...input,
      requestedParameters: { "observability.acl": ["0.0.0.0/0"] },
    }).classification,
  ).toBe("blocked");
});
it("rejects contradictory managed-read actions and malformed native values", () => {
  const raw = plan([change("stackit_network", ["read"])]);
  expect(classifyApplicationUpgradePlan(raw).classification).toBe("blocked");
  expect(classifyPlatformApplicationImpactPlan(raw).classification).toBe(
    "blocked",
  );
  expect(
    classifyApplicationUpgradePlan(
      plan([
        {
          mode: "managed",
          type: "stackit_network",
          change: {
            actions: ["update"],
            before: {},
            after: "not a resource object",
          },
        },
      ]),
    ).classification,
  ).toBe("blocked");
});
