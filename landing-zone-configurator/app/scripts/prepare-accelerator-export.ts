import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createEditorConfiguration,
  exportAcceleratorExample,
  projectTemplates,
  updateProjectTemplate,
} from "../packages/domain/dist/index.js";

const directory = process.argv[2];
if (!directory?.startsWith("/"))
  throw new Error("Absolute fixture directory required");
let draft = createEditorConfiguration(
  "hub-and-spoke",
  "11111111-2222-4333-8444-555555555555",
);
for (const template of projectTemplates(draft)) {
  if (template.kind === "sandbox") continue;
  draft = updateProjectTemplate(draft, template.id, {
    settings: {
      ...template.settings,
      network_enabled: true,
      network_prefix_length: 24,
      observability: {
        enabled: true,
        plan_name: "Observability-Starter-EU01",
        acl: ["192.0.2.1/32"],
      },
    },
    accessProfile: {
      schemaVersion: 1,
      mode: "granular",
      initialOwnerEmail: "central@example.com",
      permissions: ["ske.cluster.create", "ske.cluster.get"],
      automationPermissions: ["ske.cluster.get"],
    },
    parameterPolicy: null,
  });
}
const exported = exportAcceleratorExample(draft);
writeFileSync(resolve(directory, "example.tfvars"), exported);
const mocks = readFileSync(
  new URL("../../../src/tests/hub_spoke.tftest.hcl", import.meta.url),
  "utf8",
).split("\nvariables {")[0];
const checks = projectTemplates(draft)
  .filter((t) => t.kind !== "sandbox")
  .map(
    (template) => `
  assert {
    condition = var.landing_zones["${template.key}"].owner_email == "central@example.com" && toset(var.landing_zones["${template.key}"].custom_roles[0].permissions) == toset(["ske.cluster.create", "ske.cluster.get"]) && var.landing_zones["${template.key}"].role_assignments[0].subject == "${template.key}@example.com" && module.landing_zone["${template.key}"].project_role_counts.custom_roles == 2 && module.landing_zone["${template.key}"].project_role_counts.role_assignments == 1 && module.landing_zone["${template.key}"].landing_zone_type == "${template.kind}" && module.landing_zone["${template.key}"].project_network.routed == ${template.kind === "corporate"}
    error_message = "Exported permissions and central owner must reach actual native resources."
  }`,
  )
  .join("\n");
writeFileSync(
  resolve(directory, "tests/export.tftest.hcl"),
  `${mocks}
run "exported_public_and_corporate" {
  command = plan
${checks}
}
`,
);
