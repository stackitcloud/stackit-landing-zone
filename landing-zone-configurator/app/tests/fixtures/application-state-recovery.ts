const tenant = "11111111-1111-4111-8111-111111111111";
const instance = "22222222-2222-4222-8222-222222222222";
const project = "33333333-3333-4333-8333-333333333333";
const foreign = "44444444-4444-4444-8444-444444444444";
const labels = {
  application_instance: instance,
  lzc_instance: instance,
  application_template: "test-template",
  managed_by: "landing-zone-configurator",
};
export function recoveryFixture() {
  const variables = {
    application: {
      configurator_execution: true,
      tenant_id: tenant,
      instance_id: instance,
      platform_revision: foreign,
      template_id: "test-template",
      name: "test-app",
      env: "dev",
      owner_email: "owner@example.com",
      target_key: "public",
      network_enabled: true,
      custom_roles: [],
      role_assignments: [
        { role: "project.member", subject: "owner@example.com" },
      ],
    },
    platform_contract: {
      tenant_id: tenant,
      revision: foreign,
      targets: {
        public: { folder_id: "test-folder", region: "eu01", corporate: false },
      },
    },
  };
  const name = `app-${instance}-dev`;
  const email = `${`${name}-automation`.replaceAll("-", "").slice(0, 20)}-suffix@sa.stackit.cloud`;
  const inventory = {
    complete: true,
    project: {
      projectId: project,
      containerId: "app-container",
      parentContainerId: "test-folder",
      name: "test-app",
      ownerEmail: "owner@example.com",
      active: true,
      labels: { ...labels },
    },
    networks: [
      {
        projectId: project,
        region: "eu01",
        id: foreign,
        name: `${name}-local`,
        routed: false,
        labels: { ...labels },
      },
    ],
    serviceAccounts: [
      { projectId: project, email, internal: false, keyIds: [] as string[] },
    ],
    roleAssignments: [
      {
        projectId: project,
        role: "project.member",
        subject: "owner@example.com",
      },
    ],
    buckets: [] as string[],
    credentialsGroups: [
      { id: "default", name: "default", platformDefault: true },
    ],
    secretsManagerIds: [] as string[],
    observabilityIds: [] as string[],
  };
  const state = {
    version: 4,
    terraform_version: "1.12.6",
    serial: 1,
    lineage: foreign,
    resources: [
      {
        mode: "managed",
        type: "terraform_data",
        name: "contract",
        provider: "builtin",
        instances: [{ attributes: { input: instance } }],
      },
      {
        module: "module.application",
        mode: "managed",
        type: "stackit_resourcemanager_project",
        name: "this",
        provider: "stackit",
        instances: [
          {
            attributes: {
              id: "app-container",
              container_id: "app-container",
              project_id: project,
            },
          },
        ],
      },
    ],
  };
  return { variables, inventory, state };
}
