// Compile actual order inputs against the immutable Application Runner source.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applicationExecutionRevisionSchema,
  applicationMvpAcceleratorCommit,
} from "../packages/contracts/dist/index.js";
import {
  compileApplicationPlan,
  defaultApplicationAccessProfile,
} from "../packages/domain/dist/index.js";

const target = process.argv[2];
if (!target?.startsWith("/"))
  throw new Error("Absolute fixture directory required");
if (
  applicationMvpAcceleratorCommit !== "08ac257de1548c8ec5e83dae1a79373711c3d644"
)
  throw new Error(
    "Requalify Application project scope for the new Runner source",
  );
const executionRevision = applicationExecutionRevisionSchema.parse(
  process.argv[3] ?? applicationMvpAcceleratorCommit,
);
const modernNetworking = [
  "9e7fb46c329aca32e878ce1f0ea3b944ea240354",
  "1ed855609d4dcbfded6759c7c8b4fabf7bd6725d",
  applicationMvpAcceleratorCommit,
].includes(executionRevision);
const automaticNetworking = [
  "1ed855609d4dcbfded6759c7c8b4fabf7bd6725d",
  applicationMvpAcceleratorCommit,
].includes(executionRevision);
mkdirSync(resolve(target, "src"), { recursive: true });
const archive = execFileSync("git", [
  "-C",
  fileURLToPath(new URL("../../../", import.meta.url)),
  "archive",
  executionRevision,
  "src/application",
  "src/modules/landing-zone",
]);
execFileSync("tar", ["-x", "-C", target], { input: archive });
const root = resolve(target, "src/application");
copyFileSync(
  new URL("../../deploy/runner/application.lock.hcl", import.meta.url),
  resolve(root, ".terraform.lock.hcl"),
);
// Test-only outputs expose names from the real historical resources, without
// changing their inputs, addresses or implementation in the archived module.
writeFileSync(
  resolve(target, "src/modules/landing-zone/recovery-fixture-outputs.tf"),
  `output "recovery_fixture_names" {
 value = {
  buckets = [stackit_objectstorage_bucket.default.name, stackit_objectstorage_bucket.tfstate.name]
  group = stackit_objectstorage_credentials_group.this.name
 }
}
`,
);
const tests = [
  `mock_provider "stackit" {
  mock_resource "stackit_resourcemanager_project" {
    defaults = { project_id = "44444444-2222-4333-8444-555555555555", container_id = "55555555-2222-4333-8444-555555555555" }
  }
  mock_resource "stackit_objectstorage_credentials_group" {
    defaults = { credentials_group_id = "66666666-2222-4333-8444-555555555555" }
  }
  mock_resource "stackit_service_account" {
    defaults = { email = "automation@sa.stackit.cloud" }
  }
  mock_data "stackit_network_area_region" {
    defaults = {
      ipv4 = {
        default_prefix_length = 28
        min_prefix_length = 24
        max_prefix_length = 28
        default_nameservers = ["192.0.2.53"]
        transfer_network = "10.254.255.0/24"
        network_ranges = [{network_range_id="77777777-2222-4333-8444-555555555555",prefix="10.32.0.0/16"}]
      }
    }
  }
  mock_resource "stackit_routing_table" {
    defaults = { routing_table_id = "77777777-2222-4333-8444-555555555555" }
  }
}
mock_provider "time" {}
`,
];
const id = "11111111-2222-4333-8444-555555555555";
for (const region of ["eu01", "eu02"]) {
  for (const kind of [
    "public-none",
    "public-local",
    "corporate",
    "corporate-automatic",
  ]) {
    if (!modernNetworking && kind !== "public-local") continue;
    if (!automaticNetworking && kind === "corporate-automatic") continue;
    const corporate = kind.startsWith("corporate");
    for (const observability of [false, true]) {
      const name = `${region}_${kind.replaceAll("-", "_")}_${observability ? "observability" : "base"}`;
      const compileInput = {
        platform: {
          schema_version: 1,
          tenant_id: id,
          revision: id,
          organization_id: id,
          targets: {
            selected: {
              folder_id: "platform-folder",
              region,
              corporate,
              network_area_id: corporate ? id : null,
              firewall_next_hop_ip: corporate ? "10.0.2.6" : null,
              ipv4_nameservers: corporate ? ["192.0.2.53"] : null,
            },
          },
        },
        template: {
          schema_version: 2,
          tenant_id: id,
          id: "project-template",
          version: 1,
          status: "published",
          accelerator_revision: executionRevision,
          platform_revision: id,
          target_keys: ["selected"],
          apply_policy: "approval-required",
          env: "dev",
          network_enabled: kind === "public-local",
          network_prefix_length: kind === "corporate-automatic" ? null : 24,
          parameter_policy: { schema_version: 1, fields: {} },
          custom_roles: [],
          role_assignments: [],
          services: {
            secretsmanager_enabled: true,
            observability: {
              enabled: observability,
              plan_name: `Observability-Starter-${region.toUpperCase()}`,
              acl: ["203.0.113.8/32"],
            },
          },
        },
        context: {
          tenant_id: id,
          user_id: id,
          instance_id: id,
          role: "application-owner",
          verified_stackit_email: "owner@stackit.cloud",
          stackit_organization_id: id,
          allowed_accelerator_revision: executionRevision,
        },
        request: {
          name: "Order contract fixture",
          target_key: "selected",
          parameters: {},
        },
      };
      const compiled = compileApplicationPlan(compileInput);
      if (
        executionRevision === applicationMvpAcceleratorCommit &&
        !observability &&
        ["public-local", "corporate"].includes(kind)
      ) {
        for (const mode of ["granular", "owner"]) {
          const profile =
            mode === "owner"
              ? { schemaVersion: 1, mode: "owner" }
              : defaultApplicationAccessProfile("platform-owner@example.test");
          const withAccess = compileApplicationPlan({
            ...compileInput,
            template: { ...compileInput.template, access_profile: profile },
          });
          const accessName = `${name}_${mode}`;
          writeFileSync(
            resolve(root, `${accessName}.json`),
            JSON.stringify(withAccess.variables),
          );
          tests.push(`run "compiled_${accessName}" {
  command = plan
  variables {
    platform_contract = jsondecode(file("${accessName}.json")).platform_contract
    application = jsondecode(file("${accessName}.json")).application
  }
  assert {
    condition = module.application.project_access.initial_owner_email == "${mode === "owner" ? "owner@stackit.cloud" : "platform-owner@example.test"}" && module.application.project_access.automation_role == "${mode === "owner" ? "owner" : "application-automation"}"
    error_message = "Compiled access profile must reach the native project and automation binding without changing the verified requester."
  }
  assert {
    condition = var.application.owner_email == "owner@stackit.cloud" && module.application.project_role_counts.custom_roles == ${mode === "owner" ? 0 : 2} && module.application.project_role_counts.role_assignments == ${mode === "owner" ? 0 : 1}
    error_message = "Team/automation permissions and the separate requester must survive compilation."
  }
}`);
        }
      }
      writeFileSync(
        resolve(root, `${name}.json`),
        JSON.stringify(compiled.variables),
      );
      const network =
        kind === "corporate-automatic"
          ? "var.application.network_prefix_length == null && var.platform_contract.targets.selected.corporate"
          : kind === "public-none"
            ? "module.application.project_network == null"
            : `module.application.project_network != null && module.application.project_network.routed == ${corporate} && module.application.project_network.ipv4_prefix_length == 24`;
      const prefix = `app-${id}-dev`;
      const expectedBucketNames = ["default", "tfstate"].map((purpose) =>
        modernNetworking
          ? `${prefix.slice(0, 63 - purpose.length - 38)}-44444444-2222-4333-8444-555555555555-${purpose}`
          : `${prefix}-${purpose}`,
      );
      const expectedGroupName = [
        "c4b43c36af198985980b17626c48d357795e3fbd",
        "88149782bf8e91dcdbb43a203b54337886023f7f",
      ].includes(executionRevision)
        ? prefix
        : `${prefix.slice(0, 23)}-${createHash("sha256").update(prefix).digest("hex").slice(0, 8)}`;
      tests.push(`run "compiled_${name}" {
  command = plan
  variables {
    platform_contract = jsondecode(file("${name}.json")).platform_contract
    application = jsondecode(file("${name}.json")).application
  }
  assert {
    condition = ${network}
    error_message = "Compiled order must preserve Public/Corporate network semantics."
  }
  assert {
    condition = module.application.recovery_fixture_names.buckets == ${JSON.stringify(expectedBucketNames)} && module.application.recovery_fixture_names.group == "${expectedGroupName}"
    error_message = "Historical resource names must match the source-aware Recovery adoption catalogue."
  }
  assert {
    condition = local.target.region == "${region}" && local.target.folder_id == "platform-folder" && local.target.corporate == ${corporate} && var.application.owner_email == "owner@stackit.cloud" ${modernNetworking ? '&& var.bucket_naming == "project-id"' : ""}
    error_message = "Compiled owner, platform target, region and unique bucket default must be preserved."
  }
  assert {
    condition = var.application.observability.enabled == ${observability} && var.application.observability.plan_name == "Observability-Starter-${region.toUpperCase()}" && var.application.observability.acl[0] == "203.0.113.8/32"
    error_message = "Observability configuration and its explicit ACL must survive compilation."
  }
  assert {
    condition = module.application.secretsmanager_instance_id != null && (module.application.observability_instance_id != null) == ${observability}
    error_message = "Compiled optional services must reach the real project module."
  }
}`);
      if (kind === "corporate-automatic")
        tests.push(`run "compiled_${name}_resolved" {
  # All providers are mocked: exercise the deferred regional read after contract validation.
  command = apply
  variables {
    platform_contract = jsondecode(file("${name}.json")).platform_contract
    application = jsondecode(file("${name}.json")).application
  }
  assert {
    condition = module.application.project_network.ipv4_prefix_length == 28 && tolist(var.platform_contract.targets.selected.ipv4_nameservers) == tolist(["192.0.2.53"])
    error_message = "Automatic must resolve the actual SNA prefix without changing configured DNS."
  }
}`);
    }
  }
}
writeFileSync(
  resolve(root, "tests/compiled-projects.tftest.hcl"),
  tests.join("\n\n"),
);
