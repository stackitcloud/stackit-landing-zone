import type { ProjectTemplateDraft } from "@lzc/domain";
export const legacyAccessTemplate: ProjectTemplateDraft = {
  id: "11111111-2222-4333-8444-555555555555",
  key: "legacy",
  name: "Existing corporate access",
  kind: "corporate",
  region: "eu01",
  settings: {
    env: "dev",
    network_enabled: true,
    network_prefix_length: 25,
    secretsmanager_enabled: true,
    observability: {
      enabled: false,
      plan_name: "Observability-Starter-EU01",
      acl: [],
    },
    custom_roles: [
      {
        name: "legacy-operator",
        description: "Retain until explicitly replaced",
        permissions: ["iaas.server.get"],
      },
    ],
    role_assignments: [
      { role: "legacy-operator", subject: "legacy@example.test" },
    ],
    automation_role: "legacy-operator",
  },
  namespaceServices: {},
  parameterPolicy: {
    schema_version: 1,
    fields: {
      env: {
        source: "input",
        required: true,
        choices: ["dev", "prod"],
        default: "dev",
      },
      role_assignments: {
        source: "context",
        variable: "verified-project-owner",
        roles: ["legacy-operator"],
      },
      secretsmanager_enabled: { source: "fixed" },
    },
  },
};
