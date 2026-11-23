import { describe, expect, it } from "vitest";
import {
  assertRetirementProtectedResources,
  retirementFolderConflict,
  retirementInventory,
  retirementPlanProjection,
  verifyRetirementApply,
  verifyRetirementPlan,
  verifyRetirementState,
} from "../packages/contracts/src/recovery/retirement.js";

const lineage = "11111111-1111-4111-8111-111111111111";
const folder =
  'module.governance.stackit_resourcemanager_folder.this["platform"]';
const project = "module.management.stackit_resourcemanager_project.this";
function state(serial = 1, includeProject = true, includeFolder = true) {
  return {
    version: 4,
    lineage,
    serial,
    resources: [
      ...(includeFolder
        ? [
            {
              module: "module.governance",
              mode: "managed",
              type: "stackit_resourcemanager_folder",
              name: "this",
              provider:
                'provider["registry.opentofu.org/stackitcloud/stackit"]',
              instances: [
                {
                  index_key: "platform",
                  attributes: {
                    folder_id: "folder-fixture",
                    description: "never include descriptive fields",
                    owner_secret: "never include secret fields",
                  },
                },
              ],
            },
          ]
        : []),
      ...(includeProject
        ? [
            {
              module: "module.management",
              mode: "managed",
              type: "stackit_resourcemanager_project",
              name: "this",
              provider:
                'provider["registry.opentofu.org/stackitcloud/stackit"].eu01',
              instances: [{ attributes: { project_id: "project-fixture" } }],
            },
          ]
        : []),
    ],
  };
}
function plan(removeFolder = false, includeProject = true) {
  return {
    format_version: "1.2",
    complete: true,
    resource_changes: [
      {
        address: folder,
        mode: "managed",
        type: "stackit_resourcemanager_folder",
        change: {
          actions: removeFolder ? ["delete"] : ["no-op"],
          before: { folder_id: "folder-fixture" },
        },
      },
      ...(includeProject
        ? [
            {
              address: project,
              mode: "managed",
              type: "stackit_resourcemanager_project",
              change: {
                actions: ["delete"],
                before: { project_id: "project-fixture" },
              },
            },
          ]
        : []),
    ],
  };
}
const captured = retirementInventory(state());
describe("source-bound native retirement checks", () => {
  it("keeps only cloud identities and addresses, rejects deposed/private-provider States", () => {
    expect(JSON.stringify(captured)).not.toMatch(
      /never include|owner_secret|description/,
    );
    const raw = state();
    raw.resources[0]!.provider =
      'provider["registry.opentofu.org/hashicorp/kubernetes"]';
    expect(() => retirementInventory(raw)).toThrow(
      "retirement_private_provider_cleanup_required",
    );
    const deposed = state();
    Object.assign(deposed.resources[0]!.instances[0]!, { deposed: "previous" });
    expect(() => retirementInventory(deposed)).toThrow(
      "retirement_state_instance_unresolved",
    );
  });
  it("rejects an entirely different or regressed State before planning", () => {
    expect(() =>
      verifyRetirementState(
        { ...captured, lineage: "22222222-2222-4222-8222-222222222222" },
        captured,
      ),
    ).toThrow("retirement_state_lineage_changed");
    expect(() =>
      verifyRetirementState({ ...captured, serial: 0 }, captured),
    ).toThrow("retirement_state_serial_regressed");
  });
  it("permits normal project deletion with unchanged governance and reconciles the exact State transition", () => {
    const checked = verifyRetirementPlan(
      plan(),
      captured,
      captured,
      "remove_projects",
    );
    expect(checked.deletes.map((resource) => resource.address)).toEqual([
      project,
    ]);
    expect(
      verifyRetirementApply(
        captured,
        retirementInventory(state(2, false)),
        checked.deletes,
        true,
      ).removed.map((resource) => resource.address),
    ).toEqual([project]);
  });
  it("rejects provider-403 refresh disappearance and a silently omitted resource", () => {
    const hidden = {
      ...plan(false, false),
      resource_drift: [
        { mode: "managed", address: project, change: { actions: ["delete"] } },
      ],
    };
    expect(() =>
      verifyRetirementPlan(hidden, captured, captured, "remove_projects"),
    ).toThrow("retirement_resource_disappeared_during_refresh");
    expect(() =>
      verifyRetirementPlan(
        plan(false, false),
        captured,
        captured,
        "remove_projects",
      ),
    ).toThrow("retirement_plan_inventory_incomplete");
  });
  it("rejects replacements, wrong resource IDs, deferred work and early folder deletion", () => {
    const replacement = plan();
    replacement.resource_changes[1]!.change.actions = ["delete", "create"];
    expect(() =>
      verifyRetirementPlan(replacement, captured, captured, "remove_projects"),
    ).toThrow("retirement_plan_delete_only_required");
    const changed = plan();
    Object.assign(changed.resource_changes[1]!.change.before, {
      project_id: "foreign",
    });
    expect(() =>
      verifyRetirementPlan(changed, captured, captured, "remove_projects"),
    ).toThrow("retirement_plan_identity_changed");
    expect(() =>
      verifyRetirementPlan(
        { ...plan(), deferred_changes: [{}] },
        captured,
        captured,
        "remove_projects",
      ),
    ).toThrow();
    expect(() =>
      verifyRetirementPlan(plan(true), captured, captured, "remove_projects"),
    ).toThrow("retirement_governance_must_remain");
  });
  it("keeps a failed folder deletion pending and allows a fresh finalization only after project removal", () => {
    expect(() =>
      verifyRetirementPlan(plan(true), captured, captured, "finalize_folders"),
    ).toThrow("retirement_folder_scope_required");
    const before = retirementInventory(state(2, false));
    const checked = verifyRetirementPlan(
      plan(true, false),
      before,
      captured,
      "finalize_folders",
    );
    expect(
      verifyRetirementApply(before, before, checked.deletes, false).removed,
    ).toEqual([]);
    expect(() =>
      verifyRetirementApply(before, before, checked.deletes, true),
    ).toThrow("retirement_apply_incomplete");
    expect(
      verifyRetirementApply(
        before,
        retirementInventory(state(3, false, false)),
        checked.deletes,
        true,
      ).removed,
    ).toHaveLength(1);
  });
  it("rejects unexpected partial removals even when native Apply failed", () => {
    const checked = verifyRetirementPlan(
      plan(),
      captured,
      captured,
      "remove_projects",
    );
    expect(() =>
      verifyRetirementApply(
        captured,
        retirementInventory(state(2, false, false)),
        checked.deletes,
        false,
      ),
    ).toThrow("retirement_apply_unreviewed_removal");
  });
  it("captures known private workloads without allowing project removal before their original-source cleanup", () => {
    const raw = state();
    raw.resources.push({
      module: "module.management",
      mode: "managed",
      type: "vault_kv_secret_v2",
      name: "credentials",
      provider: 'provider["registry.opentofu.org/hashicorp/vault"]',
      instances: [{ attributes: { id: "mount/data/credentials" } }],
    } as unknown as (typeof raw.resources)[number]);
    const original = retirementInventory(raw, { includePrivate: true });
    const privatePlan = {
      format_version: "1.2",
      resource_changes: [
        {
          address: "module.management.vault_kv_secret_v2.credentials",
          mode: "managed",
          type: "vault_kv_secret_v2",
          change: {
            actions: ["delete"],
            before: { id: "mount/data/credentials" },
          },
        },
      ],
    };
    expect(
      verifyRetirementPlan(privatePlan, original, original, "private_workloads")
        .deletes,
    ).toHaveLength(1);
    expect(() =>
      verifyRetirementPlan(plan(), original, original, "remove_projects"),
    ).toThrow("retirement_private_provider_cleanup_required");
    expect(() =>
      verifyRetirementPlan(
        {
          ...privatePlan,
          resource_changes: [
            ...privatePlan.resource_changes,
            ...plan().resource_changes,
          ],
        },
        original,
        original,
        "private_workloads",
      ),
    ).toThrow("retirement_private_cleanup_must_retain_infrastructure");
    expect(() =>
      verifyRetirementPlan(
        { format_version: "1.2", resource_changes: [] },
        original,
        original,
        "private_workloads",
      ),
    ).toThrow("retirement_private_cleanup_incomplete");
  });
  it("binds an IAM resource without generic id to its exact resource, role and subject", () => {
    const raw = state();
    raw.resources.push({
      module: "module.management",
      mode: "managed",
      type: "stackit_authorization_organization_role_assignment",
      name: "automation",
      provider: 'provider["registry.opentofu.org/stackitcloud/stackit"]',
      instances: [
        {
          attributes: {
            resource_id: "org-fixture",
            role: "owner",
            subject: "automation@example.com",
          },
        },
      ],
    } as unknown as (typeof raw.resources)[number]);
    const baseline = retirementInventory(raw);
    const resource = {
      address:
        "module.management.stackit_authorization_organization_role_assignment.automation",
      mode: "managed",
      type: "stackit_authorization_organization_role_assignment",
      change: {
        actions: ["delete"],
        before: {
          resource_id: "org-fixture",
          role: "owner",
          subject: "automation@example.com",
          private_value: "SECRET_SENTINEL",
        },
      },
    };
    const full = {
      ...plan(),
      resource_changes: [...plan().resource_changes, resource],
    };
    const projection = retirementPlanProjection(full);
    expect(
      verifyRetirementPlan(projection, baseline, baseline, "remove_projects")
        .deletes,
    ).toHaveLength(2);
    expect(JSON.stringify(projection)).not.toContain("SECRET_SENTINEL");
    resource.change.before.subject = "foreign@example.com";
    expect(() =>
      verifyRetirementPlan(full, baseline, baseline, "remove_projects"),
    ).toThrow("retirement_plan_identity_changed");
  });
  it("preserves the cleanup account, its keys and the access binding it depends on", () => {
    const input = {
      protectedServiceAccount: "cleanup@example.com",
      protectedProjectIds: [],
    };
    for (const [type, before] of [
      ["stackit_service_account", { email: input.protectedServiceAccount }],
      [
        "stackit_service_account_key",
        { service_account_email: input.protectedServiceAccount },
      ],
      [
        "stackit_authorization_organization_role_assignment",
        { subject: input.protectedServiceAccount },
      ],
    ]) {
      expect(() =>
        assertRetirementProtectedResources(
          {
            resource_changes: [
              { type, change: { actions: ["delete"], before } },
            ],
          },
          input,
        ),
      ).toThrow();
    }
  });
  it("supports the built-in Application contract marker without adding an external provider", () => {
    const raw = {
      version: 4,
      lineage,
      serial: 1,
      resources: [
        {
          mode: "managed",
          type: "terraform_data",
          name: "contract",
          provider: 'provider["terraform.io/builtin/terraform"]',
          instances: [
            {
              attributes: {
                id: "22222222-2222-4222-8222-222222222222",
                input: { value: "opaque contract input" },
              },
            },
          ],
        },
      ],
    };
    const baseline = retirementInventory(raw);
    expect(
      verifyRetirementPlan(
        {
          format_version: "1.2",
          resource_changes: [
            {
              address: "terraform_data.contract",
              mode: "managed",
              type: "terraform_data",
              change: {
                actions: ["delete"],
                before: { id: "22222222-2222-4222-8222-222222222222" },
              },
            },
          ],
        },
        baseline,
        baseline,
        "remove_application",
      ).deletes,
    ).toHaveLength(1);
  });
});

it("recognizes the pinned provider's unaddressed 409 only with matching native folder-failure hooks", () => {
  const version = { type: "version", ui: "1.2" };
  const hook = {
    type: "apply_errored",
    hook: { action: "delete", resource: { addr: folder } },
  };
  const diagnostic = {
    type: "diagnostic",
    diagnostic: {
      severity: "error",
      summary:
        "Error deleting folder. Deletion may fail because associated projects remain hidden for up to 7 days after user deletion due to technical requirements.",
      detail:
        "Calling API: 409 Conflict, status code 409, Body: Folder has children. Deletion not permitted for id: [test]",
    },
  };
  const output = (events: unknown[]) =>
    events.map((e) => JSON.stringify(e)).join("\n");
  expect(
    retirementFolderConflict(output([version, hook, diagnostic]), [folder]),
  ).toBe(true);
  expect(
    retirementFolderConflict(output([version, diagnostic]), [folder]),
  ).toBe(false);
  expect(
    retirementFolderConflict(
      output([
        version,
        { ...hook, hook: { action: "delete", resource: { addr: project } } },
        diagnostic,
      ]),
      [folder],
    ),
  ).toBe(false);
  expect(
    retirementFolderConflict(
      output([
        version,
        hook,
        diagnostic,
        {
          type: "diagnostic",
          diagnostic: {
            severity: "error",
            summary: "Access denied",
            detail: "403",
          },
        },
      ]),
      [folder],
    ),
  ).toBe(false);
  expect(
    retirementFolderConflict(
      output([
        version,
        hook,
        {
          ...diagnostic,
          diagnostic: {
            ...diagnostic.diagnostic,
            detail: "Calling API: 409 Conflict, a different conflict",
          },
        },
      ]),
      [folder],
    ),
  ).toBe(false);
});

it("protects service resources and role assignments inside surviving control projects too", () => {
  const protectedProject = "66666666-6666-4666-8666-666666666666";
  for (const [type, before] of [
    ["stackit_postgresflex_instance", { project_id: protectedProject }],
    [
      "stackit_authorization_project_role_assignment",
      { resource_id: protectedProject, subject: "other@example.test" },
    ],
  ] as const) {
    expect(() =>
      assertRetirementProtectedResources(
        {
          resource_changes: [{ type, change: { actions: ["delete"], before } }],
        },
        {
          protectedServiceAccount: "cleanup@example.test",
          protectedProjectIds: [protectedProject],
        },
      ),
    ).toThrow("retirement_control_inside_target");
  }
});
