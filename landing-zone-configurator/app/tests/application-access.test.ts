import { applicationMvpAcceleratorCommit } from "@lzc/contracts";
import { deriveApplicationRecoveryImports } from "@lzc/contracts/recovery";
import { describe, expect, it } from "vitest";
import {
  applicationAccessProfileSchema,
  applicationProjectPermissionNames,
  applicationWorkloadPermissions,
  defaultApplicationAccessProfile,
  resolveApplicationAccessProfile,
  unknownApplicationPermissions,
  validateApplicationAccessProfile,
} from "../packages/domain/src/application-access.js";
import {
  resolveApplicationOrder,
  validateApplicationPublication,
} from "../packages/domain/src/application-catalogue.js";
import { compileApplicationPlan } from "../packages/domain/src/application-plan.js";
import { recoveryFixture } from "./fixtures/application-state-recovery.js";

const id = "11111111-2222-4333-8444-555555555555";
function fixture() {
  const profile = defaultApplicationAccessProfile("platform@example.com");
  return {
    platform: {
      schema_version: 1,
      tenant_id: id,
      revision: id,
      organization_id: id,
      targets: {
        public: {
          folder_id: id,
          region: "eu01",
          corporate: false,
          network_area_id: null,
          firewall_next_hop_ip: null,
          ipv4_nameservers: null,
        },
      },
    },
    template: {
      schema_version: 2,
      tenant_id: id,
      id: "application",
      version: 1,
      status: "published",
      accelerator_revision: applicationMvpAcceleratorCommit,
      platform_revision: id,
      target_keys: ["public"],
      apply_policy: "approval-required",
      env: "dev",
      network_enabled: true,
      network_prefix_length: null,
      parameter_policy: { schema_version: 1, fields: {} },
      access_profile: profile,
      services: {
        secretsmanager_enabled: true,
        observability: {
          enabled: false,
          plan_name: "Observability-Starter-EU01",
          acl: [],
        },
      },
    },
    context: {
      tenant_id: id,
      user_id: id,
      instance_id: id,
      role: "application-owner",
      verified_stackit_email: "requester@example.com",
      stackit_organization_id: id,
      allowed_accelerator_revision: applicationMvpAcceleratorCommit,
    },
    request: { name: "App", target_key: "public", parameters: {} },
  };
}

describe("versioned Application project access", () => {
  it("separates verified order ownership, central initial owner and two explicit workload roles", () => {
    const compiled = compileApplicationPlan(fixture());
    expect(compiled.variables.application).toMatchObject({
      owner_email: "requester@example.com",
      initial_owner_email: "platform@example.com",
      automation_role: "application-automation",
      role_assignments: [
        { role: "application-workload", subject: "requester@example.com" },
      ],
    });
    const definitions = compiled.variables.application.custom_roles;
    expect(definitions).toHaveLength(2);
    expect(JSON.stringify(definitions)).not.toContain('"owner"');
    expect(compiled.stateKey).toBe(
      `applications/${id}/${id}/terraform.tfstate`,
    );
    expect(compiled.requestedBy).toBe(id);
    expect(compiled.executionEnabled).toBe(false);
  });
  it("preserves explicit customer choice of full owner without inventing a restriction", () => {
    const f = fixture();
    const result = compileApplicationPlan({
      ...f,
      template: {
        ...f.template,
        access_profile: { schemaVersion: 1, mode: "owner" },
      },
    });
    expect(result.variables.application.owner_email).toBe(
      "requester@example.com",
    );
    expect(result.variables.application.automation_role).toBe("owner");
    expect(result.variables.application.initial_owner_email).toBeUndefined();
  });
  it("never changes legacy permissions merely by reading or compiling an old template", () => {
    const { access_profile: _, ...template } = fixture().template;
    const result = compileApplicationPlan({ ...fixture(), template });
    expect(result.variables.application.automation_role).toBeUndefined();
    expect(result.variables.application.initial_owner_email).toBeUndefined();
    expect(result.variables.application.owner_email).toBe(
      "requester@example.com",
    );
  });
  it.each([
    "access_profile",
    "initial_owner_email",
    "automation_role",
    "custom_roles",
    "role_assignments",
  ])("rejects requester escalation through %s", (field) => {
    const f = fixture();
    expect(() =>
      compileApplicationPlan({
        ...f,
        request: { ...f.request, parameters: { [field]: "owner" } },
      }),
    ).toThrow();
  });
  it("fails on ambiguous owner and on source revisions lacking the native contract", () => {
    const f = fixture();
    expect(() =>
      compileApplicationPlan({
        ...f,
        context: {
          ...f.context,
          verified_stackit_email: "PLATFORM@example.com",
        },
      }),
    ).toThrow("anderen initialen");
    expect(() =>
      compileApplicationPlan({
        ...f,
        template: {
          ...f.template,
          accelerator_revision: "1ed855609d4dcbfded6759c7c8b4fabf7bd6725d",
        },
        context: {
          ...f.context,
          allowed_accelerator_revision:
            "1ed855609d4dcbfded6759c7c8b4fabf7bd6725d",
        },
      }),
    ).toThrow("source mismatch");
  });
  it.each([
    "iam.member.add",
    "iam.role.add",
    "iam.role.edit",
    "resource-manager.project.delete",
    "telemetry-link.delete",
    "iaas.server.service-account.add",
    "unknown.permission",
  ])(
    "does not advertise %s as a granular workload permission",
    (permission) => {
      expect(applicationWorkloadPermissions).not.toContain(permission);
      const profile = {
        ...defaultApplicationAccessProfile(),
        permissions: [permission],
      };
      expect(applicationAccessProfileSchema.safeParse(profile).success).toBe(
        true,
      );
      expect(unknownApplicationPermissions(profile)).toEqual(
        applicationProjectPermissionNames.includes(permission)
          ? []
          : [permission],
      );
    },
  );
  it("allows incomplete owner text in drafts but requires a valid owner for publication", () => {
    const p = {
      ...defaultApplicationAccessProfile(),
      initialOwnerEmail: "in-progress",
    };
    expect(applicationAccessProfileSchema.safeParse(p).success).toBe(true);
    expect(() =>
      validateApplicationAccessProfile(p, {}, undefined, true),
    ).toThrow("initialen");
    expect(() =>
      validateApplicationAccessProfile(
        defaultApplicationAccessProfile("platform@example.com"),
        {
          role_assignments: [
            { role: "owner", subject: "requester@example.com" },
          ],
        },
        undefined,
        true,
      ),
    ).toThrow("kombiniert");
  });
  it("binds publication and post-login resolution to one immutable profile", () => {
    const template = validateApplicationPublication({
      acceleratorRevision: applicationMvpAcceleratorCommit,
      template: {
        id,
        key: "app",
        name: "App",
        kind: "public",
        region: "eu01",
        settings: { env: "dev", network_enabled: true },
        accessProfile: defaultApplicationAccessProfile("platform@example.com"),
      },
    });
    const version = {
      id,
      tenantId: id,
      templateId: id,
      version: 1,
      publishedBy: id,
      publishedAt: "2026-10-26T00:00:00Z",
      acceleratorRevision: applicationMvpAcceleratorCommit,
      template,
    };
    const request = {
      versionId: id,
      idempotencyKey: id,
      name: "App",
      parameters: {},
    };
    const before = resolveApplicationOrder(version, request).resolution
      .settings;
    const after = resolveApplicationOrder(version, request, {
      verifiedStackitEmail: "requester@example.com",
    }).resolution.settings;
    expect(before.initial_owner_email).toBe("platform@example.com");
    expect(before.role_assignments).toEqual([]);
    expect(after.role_assignments).toEqual([
      { role: "application-workload", subject: "requester@example.com" },
    ]);
    expect(after.custom_roles).toEqual(before.custom_roles);
  });
  it("recovers the selected initial owner and automation role instead of assuming owner", () => {
    const f = recoveryFixture();
    const variables = {
      ...f.variables,
      application: {
        ...f.variables.application,
        initial_owner_email: "platform@example.com",
        automation_role: "application-automation",
      },
    };
    f.inventory.project.ownerEmail = "platform@example.com";
    const sa = f.inventory.serviceAccounts[0]!;
    f.inventory.roleAssignments.push({
      projectId: f.inventory.project.projectId,
      role: "application-automation",
      subject: sa.email,
    });
    const result = deriveApplicationRecoveryImports({
      variables,
      state: Buffer.from(JSON.stringify(f.state)),
      inventory: f.inventory,
      tenantId: variables.application.tenant_id,
      instanceId: variables.application.instance_id,
    });
    expect(
      result.some(
        (i) =>
          i.address.endsWith(".sa_owner") &&
          i.resourceId.includes(",application-automation,"),
      ),
    ).toBe(true);
    f.inventory.project.ownerEmail = "requester@example.com";
    expect(() =>
      deriveApplicationRecoveryImports({
        variables,
        state: Buffer.from(JSON.stringify(f.state)),
        inventory: f.inventory,
        tenantId: variables.application.tenant_id,
        instanceId: variables.application.instance_id,
      }),
    ).toThrow();
  });
});

it("rejects a new rights profile published against an older native source", () => {
  expect(() =>
    validateApplicationPublication({
      acceleratorRevision: "1ed855609d4dcbfded6759c7c8b4fabf7bd6725d",
      template: {
        id,
        key: "app",
        name: "App",
        kind: "public",
        region: "eu01",
        settings: {},
        accessProfile: { schemaVersion: 1, mode: "owner" },
      },
    }),
  ).toThrow("Runner-Quelle");
});

it("offers registered service permissions without turning the VM-only preset into a broader workload grant", () => {
  const workload = defaultApplicationAccessProfile("central@example.test");
  const vm = defaultApplicationAccessProfile("central@example.test", "vm");
  for (const permission of [
    "argus.instance.get",
    "object-storage.bucket.list",
    "secrets-manager.secret.get",
  ]) {
    expect(workload.permissions).toContain(permission);
    expect(applicationWorkloadPermissions).toContain(permission);
    expect(vm.permissions).not.toContain(permission);
  }
  expect(workload.permissions).not.toContain("iam.member.add");
  expect(workload.permissions).not.toContain(
    "argus.grafana.server-administrate",
  );
});

it("compiles all current STACKIT project permissions without expanding the 144-permission default", () => {
  expect(applicationProjectPermissionNames.length).toBeGreaterThan(900);
  expect(defaultApplicationAccessProfile().permissions).toHaveLength(144);
  for (const permission of applicationProjectPermissionNames)
    expect(
      unknownApplicationPermissions({
        ...defaultApplicationAccessProfile(),
        permissions: [permission],
      }),
    ).toEqual([]);
  const f = fixture();
  f.template.access_profile.permissions = [
    ...applicationProjectPermissionNames,
  ];
  const result = compileApplicationPlan(f);
  expect(result.variables.application.custom_roles?.[0]?.permissions).toEqual(
    applicationProjectPermissionNames,
  );
  expect(result.variables.application.custom_roles?.[0]?.permissions).toContain(
    "ske.cluster.create",
  );
  expect(result.variables.application.custom_roles?.[0]?.permissions).toContain(
    "iam.role.add",
  );
  expect(f.template.access_profile.automationPermissions).toHaveLength(144);
  expect(
    unknownApplicationPermissions(
      {
        ...defaultApplicationAccessProfile(),
        permissions: ["future-service.instance.create"],
      },
      ["future-service.instance.create"],
    ),
  ).toEqual([]);
  expect(
    applicationAccessProfileSchema.safeParse({
      ...defaultApplicationAccessProfile(),
      permissions: ["*", "owner"],
    }).success,
  ).toBe(false);
});
