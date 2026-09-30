// Prepare only local variable-contract fixtures. OpenTofu is invoked directly
// by the caller, with no provider/backend configuration or cloud credentials.
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  catalogue,
  createCommonConfiguration,
  exportCommonTfvars,
} from "../packages/domain/dist/index.js";

const root = new URL("../../.local/common-contract/", import.meta.url);
mkdirSync(root, { recursive: true });
copyFileSync(
  new URL("../../../src/variables.tf", import.meta.url),
  new URL("variables.tf", root),
);
const runs = catalogue.templates.map((template) => {
  const document = createCommonConfiguration(
    template.id,
    "11111111-2222-4333-8444-555555555555",
  );
  return `run "${template.id.replaceAll("-", "_")}" {
  command = plan
  variables {
${exportCommonTfvars(document)}
  }
${template.id === "standalone" ? "  # Upstream #84: omitted corporate=false must remain observable.\n  expect_failures = [var.landing_zones]" : ""}
}`;
});
writeFileSync(
  new URL("outputs.tf", root),
  `output "audit_object_lock" {
  value = try(var.audit_logs.s3_object_lock, null)
}
`,
);
for (const explicit of [false, true]) {
  runs.push(`run "audit_lock_${explicit ? "explicit_false" : "default"}" {
  command = plan
  variables {
    owner_email = "owner@example.com"
    company_name = "Contract test"
    company_code = "test"
    organization_id = "11111111-2222-4333-8444-555555555555"
    audit_logs = { ${explicit ? "s3_object_lock = false" : ""} }
  }
  assert {
    condition = output.audit_object_lock == ${explicit ? "false" : "true"}
    error_message = "The native Object Lock default differs from the Configurator contract."
  }
}`);
}
writeFileSync(new URL("templates.tftest.hcl", root), `${runs.join("\n\n")}\n`);
process.stdout.write(
  `Prepared ${runs.length} variable-contract tests in ${fileURLToPath(root)}\n`,
);
