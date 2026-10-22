// Compile actual order inputs against the immutable Application Runner source.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applicationMvpAcceleratorCommit } from "../packages/contracts/dist/index.js";
import { compileApplicationPlan } from "../packages/domain/dist/index.js";

const target = process.argv[2];
if (!target?.startsWith("/"))
  throw new Error("Absolute fixture directory required");
if (
  applicationMvpAcceleratorCommit !== "1ed855609d4dcbfded6759c7c8b4fabf7bd6725d"
)
  throw new Error(
    "Requalify Application project scope for the new Runner source",
  );
mkdirSync(resolve(target, "src"), { recursive: true });
const archive = execFileSync("git", [
  "-C",
  fileURLToPath(new URL("../../../", import.meta.url)),
  "archive",
  applicationMvpAcceleratorCommit,
  "src/application",
  "src/modules/landing-zone",
]);
execFileSync("tar", ["-x", "-C", target], { input: archive });
const root = resolve(target, "src/application");
copyFileSync(
  new URL("../../deploy/runner/application.lock.hcl", import.meta.url),
  resolve(root, ".terraform.lock.hcl"),
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
    const corporate = kind.startsWith("corporate");
    for (const observability of [false, true]) {
      const name = `${region}_${kind.replaceAll("-", "_")}_${observability ? "observability" : "base"}`;
      const compiled = compileApplicationPlan({
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
          accelerator_revision: applicationMvpAcceleratorCommit,
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
          allowed_accelerator_revision: applicationMvpAcceleratorCommit,
        },
        request: {
          name: "Order contract fixture",
          target_key: "selected",
          parameters: {},
        },
      });
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
    condition = local.target.region == "${region}" && local.target.folder_id == "platform-folder" && local.target.corporate == ${corporate} && var.application.owner_email == "owner@stackit.cloud" && var.bucket_naming == "project-id"
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
