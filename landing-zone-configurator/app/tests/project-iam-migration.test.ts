import {
  assertProjectIamScope,
  decodeProjectIamPlan,
  deriveApplicationRecoveryImports,
  encodeProjectIamPlan,
  prepareProjectIamMigration,
  projectIamAddress,
  projectIamEffectiveVariables,
  projectIamSummary,
} from "@lzc/contracts/recovery";
import { describe, expect, it } from "vitest";
import { verifyIamCompletion } from "../apps/worker/src/project-iam.js";
import { recoveryFixture } from "./fixtures/application-state-recovery.js";

function fixture() {
  const f = recoveryFixture();
  const variables = {
    ...f.variables,
    application: {
      ...f.variables.application,
      initial_owner_email: "platform@sa.stackit.cloud",
      automation_role: "application-automation",
      role_assignments: [
        { role: "application-workload", subject: "owner@example.com" },
      ],
    },
  };
  const members = {
    resourceId: f.inventory.project.projectId,
    resourceType: "project" as const,
    members: ["owner", "project.owner", "project.admin"].map((role) => ({
      role,
      subject: "owner@example.com",
    })),
  };
  const state = () => Buffer.from(JSON.stringify(f.state));
  return { ...f, variables, members, state };
}
function adoptedState(
  f: ReturnType<typeof fixture>,
  c: NonNullable<ReturnType<typeof prepareProjectIamMigration>>,
) {
  const state = JSON.parse(f.state().toString());
  state.resources.push({
    mode: "managed",
    type: "stackit_authorization_project_role_assignment",
    name: "lzc_project_iam",
    provider: "stackit",
    instances: Object.entries(c.bindings).map(([key, b]) => ({
      index_key: key,
      attributes: {
        id: `${c.projectId},${b.role},${b.subject}`,
        resource_id: c.projectId,
        ...b,
      },
    })),
  });
  return Buffer.from(JSON.stringify(state));
}
describe("direct project owner migration", () => {
  it("imports historical direct grants while securing the central owner, then removes them in a separate plan", () => {
    const f = fixture();
    const c = prepareProjectIamMigration({
      variables: f.variables,
      state: f.state(),
      members: f.members,
    })!;
    expect(projectIamSummary(c)).toEqual({
      version: 1,
      phase: "prepare",
      imports: 3,
      pendingRemovals: 3,
    });
    expect(Object.keys(c.bindings)).toHaveLength(4);
    f.members.members.push({ role: "owner", subject: c.centralOwner });
    const next = prepareProjectIamMigration({
      variables: f.variables,
      state: adoptedState(f, c),
      members: f.members,
    })!;
    expect(next.phase).toBe("cleanup");
    expect(next.bindings).toEqual({
      [`owner-${c.centralOwner}`]: { role: "owner", subject: c.centralOwner },
    });
    expect(next.imports).toEqual({});
    expect(() => verifyIamCompletion(next, f.members)).toThrow(
      "iam-direct-owner-remains",
    );
    expect(() =>
      verifyIamCompletion(next, {
        ...f.members,
        members: [{ role: "owner", subject: c.centralOwner }],
      }),
    ).not.toThrow();
  });
  it("imports an existing central owner instead of attempting the provider's duplicate create", () => {
    const f = fixture();
    f.members.members.push({
      role: "owner",
      subject: f.variables.application.initial_owner_email,
    });
    const c = prepareProjectIamMigration({
      variables: f.variables,
      state: f.state(),
      members: f.members,
    })!;
    expect(Object.keys(c.imports)).toHaveLength(4);
  });
  it("retains module-managed broad grants during preparation instead of importing at a second address", () => {
    const f = fixture();
    const state = JSON.parse(f.state().toString());
    state.resources.push({
      module: "module.application",
      mode: "managed",
      type: "stackit_authorization_project_role_assignment",
      name: "this",
      provider: "stackit",
      instances: [
        {
          index_key: "owner-owner@example.com",
          attributes: {
            role: "owner",
            subject: "owner@example.com",
            resource_id: f.members.resourceId,
          },
        },
      ],
    });
    const c = prepareProjectIamMigration({
      variables: f.variables,
      state: Buffer.from(JSON.stringify(state)),
      members: f.members,
    })!;
    expect(c.retainedAssignments).toEqual([
      { role: "owner", subject: "owner@example.com" },
    ]);
    expect(c.imports).not.toHaveProperty("owner-owner@example.com");
  });
  it("leaves unrelated direct assignments alone and never asks for inherited permissions", () => {
    const f = fixture();
    f.members.members.push({ role: "owner", subject: "other@example.com" });
    const c = prepareProjectIamMigration({
      variables: f.variables,
      state: f.state(),
      members: f.members,
    })!;
    expect(c.oldBindings).toHaveLength(3);
    expect(Object.keys(c.bindings).join()).not.toContain("other@example.com");
  });
  it("keeps full owner as an explicit customer choice", () => {
    const f = fixture();
    delete (f.variables.application as { initial_owner_email?: string })
      .initial_owner_email;
    f.variables.application.automation_role = "owner";
    const c = prepareProjectIamMigration({
      variables: f.variables,
      state: f.state(),
      members: f.members,
    })!;
    expect(c.mode).toBe("owner");
    expect(c.oldBindings).toEqual([]);
    expect(c.phase).toBe("complete");
  });
  it.each(["drift", "destroy"] as const)(
    "does not adopt or remove new IAM grants for %s",
    (purpose) => {
      const f = fixture();
      expect(
        prepareProjectIamMigration({
          variables: f.variables,
          state: f.state(),
          members: f.members,
          purpose,
        }),
      ).toBeNull();
      const c = prepareProjectIamMigration({
        variables: f.variables,
        state: f.state(),
        members: f.members,
      })!;
      const maintenance = prepareProjectIamMigration({
        variables: f.variables,
        state: adoptedState(f, c),
        members: f.members,
        purpose,
      })!;
      expect(maintenance.bindings).toEqual(c.bindings);
      expect(maintenance.imports).toEqual({});
      expect(maintenance.phase).toBe("maintenance");
    },
  );
  it.each(["project", "duplicate", "instance"])(
    "rejects a mismatched or incomplete %s inventory",
    (kind) => {
      const f = fixture();
      if (kind === "project")
        f.members.resourceId = "44444444-4444-4444-8444-444444444444";
      if (kind === "duplicate") f.members.members.push(f.members.members[0]!);
      if (kind === "instance")
        f.variables.application.instance_id =
          "44444444-4444-4444-8444-444444444444";
      expect(() =>
        prepareProjectIamMigration({
          variables: f.variables,
          state: f.state(),
          members: f.members,
        }),
      ).toThrow();
    },
  );
  it("binds the native plan and frozen migration under one artifact digest and supports raw historical artifacts", () => {
    const f = fixture(),
      c = prepareProjectIamMigration({
        variables: f.variables,
        state: f.state(),
        members: f.members,
      })!;
    const bytes = Buffer.from("native-saved-plan");
    const wrapped = encodeProjectIamPlan(bytes, c);
    expect(decodeProjectIamPlan(wrapped)).toEqual({ native: bytes, iam: c });
    expect(decodeProjectIamPlan(bytes)).toEqual({ native: bytes, iam: null });
    expect(() =>
      decodeProjectIamPlan(wrapped.subarray(0, wrapped.length - 2)),
    ).toThrow();
    expect(() =>
      decodeProjectIamPlan(Buffer.from("LZC-APPLICATION-PLAN-IAM/2\ninvalid")),
    ).toThrow();
    expect(() =>
      assertProjectIamScope(
        { ...c, requester: "foreign@example.com" },
        f.variables,
      ),
    ).toThrow();
  });
  it("recovers the same root imports with frozen context, preserving exact identities", () => {
    const f = fixture();
    f.members.members.push({
      role: "owner",
      subject: f.variables.application.initial_owner_email,
    });
    const c = prepareProjectIamMigration({
      variables: f.variables,
      state: f.state(),
      members: f.members,
    })!;
    f.inventory.project.ownerEmail = c.centralOwner;
    f.inventory.roleAssignments = f.members.members.map((b) => ({
      ...b,
      projectId: c.projectId,
    }));
    const imports = deriveApplicationRecoveryImports({
      state: f.state(),
      variables: projectIamEffectiveVariables(f.variables, c),
      inventory: f.inventory,
      tenantId: f.variables.application.tenant_id,
      instanceId: c.instanceId,
    });
    for (const [key, id] of Object.entries(c.imports))
      expect(imports).toContainEqual({
        type: "stackit_authorization_project_role_assignment",
        address: projectIamAddress(key),
        resourceId: id,
      });
  });
});
