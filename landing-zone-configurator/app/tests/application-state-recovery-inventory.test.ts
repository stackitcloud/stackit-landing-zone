import { deriveApplicationRecoveryImports } from "@lzc/contracts/recovery";
import { describe, expect, it } from "vitest";

import { recoveryFixture as fixture } from "./fixtures/application-state-recovery.js";

const project = "33333333-3333-4333-8333-333333333333";
const tenant = "11111111-1111-4111-8111-111111111111";
const instance = "22222222-2222-4222-8222-222222222222";
const foreign = "44444444-4444-4444-8444-444444444444";
function derive(f: ReturnType<typeof fixture>) {
  return deriveApplicationRecoveryImports({
    state: Buffer.from(JSON.stringify(f.state)),
    variables: f.variables,
    inventory: f.inventory,
    tenantId: tenant,
    instanceId: instance,
  });
}
describe("bounded Application cloud adoption catalogue", () => {
  it("derives exact native addresses and import identities for the retained project", () => {
    const f = fixture();
    expect(derive(f)).toEqual([
      {
        type: "stackit_network",
        address: "module.application.stackit_network.this[0]",
        resourceId: `${project},eu01,${foreign}`,
      },
      {
        type: "stackit_service_account",
        address: "module.application.stackit_service_account.automation",
        resourceId: `${project},${f.inventory.serviceAccounts[0]!.email}`,
      },
      {
        type: "stackit_authorization_project_role_assignment",
        address:
          'module.application.stackit_authorization_project_role_assignment.this["project.member-owner@example.com"]',
        resourceId: `${project},project.member,owner@example.com`,
      },
    ]);
  });
  it.each([
    "tenant",
    "instance",
    "contract",
    "project",
    "folder",
    "labels",
    "region",
    "name",
    "network-label",
    "account-project",
    "role-project",
    "incomplete",
    "duplicate",
    "foreign-account",
    "bucket",
    "group",
    "secrets",
    "observability",
    "corporate",
    "custom-role",
  ])("blocks unresolved or foreign %s", (change) => {
    const f = fixture();
    switch (change) {
      case "tenant":
        f.variables.application.tenant_id = foreign;
        break;
      case "instance":
        f.variables.application.instance_id = foreign;
        break;
      case "contract":
        f.variables.platform_contract.revision = tenant;
        break;
      case "project":
        f.inventory.project.projectId = foreign;
        break;
      case "folder":
        f.inventory.project.parentContainerId = "different";
        break;
      case "labels":
        f.inventory.project.labels.application_instance = foreign;
        break;
      case "region":
        f.inventory.networks[0]!.region = "eu02";
        break;
      case "name":
        f.inventory.networks[0]!.name = "similar-name";
        break;
      case "network-label":
        f.inventory.networks[0]!.labels.lzc_instance = foreign;
        break;
      case "account-project":
        f.inventory.serviceAccounts[0]!.projectId = foreign;
        break;
      case "role-project":
        f.inventory.roleAssignments[0]!.projectId = foreign;
        break;
      case "incomplete":
        f.inventory.complete = false;
        break;
      case "duplicate":
        f.inventory.networks.push(structuredClone(f.inventory.networks[0]!));
        break;
      case "foreign-account":
        f.inventory.serviceAccounts[0]!.email = "other@sa.stackit.cloud";
        break;
      case "key":
        f.inventory.serviceAccounts[0]!.keyIds.push("unrecoverable-key");
        break;
      case "bucket":
        f.inventory.buckets.push("existing-without-state");
        break;
      case "group":
        f.inventory.credentialsGroups[0]!.platformDefault = false;
        break;
      case "secrets":
        f.inventory.secretsManagerIds.push("untracked");
        break;
      case "observability":
        f.inventory.observabilityIds.push("untracked");
        break;
      case "corporate":
        f.variables.platform_contract.targets.public.corporate = true;
        break;
      case "custom-role":
        Object.assign(f.variables.application, {
          custom_roles: [{ name: "unsupported" }],
        });
        break;
    }
    expect(() => derive(f)).toThrow();
  });
  it("ignores internal system accounts and does not invent absent cloud resources", () => {
    const f = fixture();
    f.inventory.networks = [];
    f.inventory.roleAssignments = [];
    f.inventory.serviceAccounts[0]!.internal = true;
    expect(derive(f)).toEqual([]);
  });
});
