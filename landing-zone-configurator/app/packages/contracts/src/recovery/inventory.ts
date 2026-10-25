import { z } from "zod";
import type { ApplicationStateRecoveryImport } from "../application-state-recovery.js";
import { readRecoveryState } from "./proof.js";

const uuid = z.uuid();
const labels = z.record(z.string(), z.string());
const email = z.email().max(254);
const project = z.object({
  projectId: uuid,
  containerId: z.string().min(1).max(128),
  parentContainerId: z.string().min(1).max(128),
  name: z.string().max(256),
  ownerEmail: email,
  active: z.literal(true),
  labels,
});
export const recoveryCloudInventorySchema = z.strictObject({
  project,
  networks: z
    .array(
      z.strictObject({
        projectId: uuid,
        region: z.enum(["eu01", "eu02"]),
        id: uuid,
        name: z.string().max(256),
        routed: z.boolean(),
        labels,
      }),
    )
    .max(1000),
  serviceAccounts: z
    .array(
      z.strictObject({
        projectId: uuid,
        email,
        internal: z.boolean(),
        keyIds: z.array(z.string().min(1).max(128)).max(1000),
      }),
    )
    .max(1000),
  roleAssignments: z
    .array(
      z.strictObject({
        projectId: uuid,
        role: z.string().min(1).max(256),
        subject: z.string().min(1).max(254),
      }),
    )
    .max(2000),
  buckets: z.array(z.string().min(3).max(63)).max(1000),
  credentialsGroups: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(256),
        name: z.string().max(256),
        platformDefault: z.boolean(),
      }),
    )
    .max(1000),
  secretsManagerIds: z.array(z.string().min(1).max(256)).max(1000),
  observabilityIds: z.array(z.string().min(1).max(256)).max(1000),
  // Set only by the bounded server-side inventory collector after every page
  // and service response has been validated. Missing services never mean empty.
  complete: z.literal(true),
});
export type RecoveryCloudInventory = z.infer<
  typeof recoveryCloudInventorySchema
>;
const variables = z.object({
  application: z.object({
    configurator_execution: z.literal(true),
    tenant_id: uuid,
    instance_id: uuid,
    platform_revision: uuid,
    template_id: z.string().min(1),
    name: z.string().min(1),
    env: z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,15}$/)
      .nullable()
      .optional(),
    owner_email: email,
    target_key: z.string().min(1),
    network_enabled: z.boolean().optional(),
    custom_roles: z.array(z.unknown()).optional(),
    role_assignments: z
      .array(z.object({ role: z.string(), subject: z.string() }))
      .max(100),
  }),
  platform_contract: z.object({
    tenant_id: uuid,
    revision: uuid,
    targets: z.record(
      z.string(),
      z.object({
        folder_id: z.string().min(1),
        region: z.enum(["eu01", "eu02"]),
        corporate: z.boolean(),
      }),
    ),
  }),
});

/** Conservative, versioned adoption catalogue. No caller-supplied address/ID is executed. */
export function deriveApplicationRecoveryImports(input: {
  state: Buffer;
  variables: unknown;
  inventory: unknown;
  tenantId: string;
  instanceId: string;
}): ApplicationStateRecoveryImport[] {
  const original = readRecoveryState(input.state, input.instanceId);
  const v = variables.parse(input.variables);
  const cloud = recoveryCloudInventorySchema.parse(input.inventory);
  const a = v.application;
  const target = v.platform_contract.targets[a.target_key];
  if (
    a.instance_id !== input.instanceId ||
    a.tenant_id !== input.tenantId ||
    v.platform_contract.tenant_id !== input.tenantId ||
    v.platform_contract.revision !== a.platform_revision ||
    !target
  )
    throw new Error("cloud-project-mismatch");
  // Corporate routing needs an independently complete SNA inventory; do not
  // silently treat a project-local network scan as a routing-table assessment.
  if (target.corporate || a.custom_roles?.length)
    throw new Error("unsupported-resource");
  const roots = original.instances.filter(
    (i) =>
      i.address === "module.application.stackit_resourcemanager_project.this",
  );
  const p = roots[0]?.instance.attributes;
  if (
    roots.length !== 1 ||
    p?.project_id !== cloud.project.projectId ||
    p.container_id !== cloud.project.containerId ||
    p.id !== cloud.project.containerId ||
    cloud.project.name !== a.name ||
    cloud.project.ownerEmail !== a.owner_email ||
    cloud.project.parentContainerId !== target.folder_id ||
    cloud.project.labels.application_instance !== a.instance_id ||
    cloud.project.labels.lzc_instance !== a.instance_id ||
    cloud.project.labels.application_template !== a.template_id ||
    cloud.project.labels.managed_by !== "landing-zone-configurator"
  )
    throw new Error("cloud-project-mismatch");
  const projectId = cloud.project.projectId;
  if (
    cloud.networks.some(
      (n) => n.projectId !== projectId || n.region !== target.region,
    ) ||
    cloud.serviceAccounts.some((s) => s.projectId !== projectId) ||
    cloud.roleAssignments.some((r) => r.projectId !== projectId)
  )
    throw new Error("cloud-project-mismatch");
  const prefix = `app-${a.instance_id}${a.env == null ? "" : `-${a.env}`}`;
  const retained = new Map(original.instances.map((r) => [r.address, r]));
  const imports: ApplicationStateRecoveryImport[] = [];
  const adopt = (item: ApplicationStateRecoveryImport) => {
    const old = retained.get(item.address);
    if (old && old.instance.attributes.id !== item.resourceId)
      throw new Error("cloud-resource-ambiguous");
    if (!old) imports.push(item);
  };
  if (
    new Set(cloud.networks.map((n) => n.id)).size !== cloud.networks.length ||
    new Set(cloud.serviceAccounts.map((s) => s.email)).size !==
      cloud.serviceAccounts.length
  )
    throw new Error("cloud-resource-ambiguous");
  for (const n of cloud.networks) {
    if (
      !a.network_enabled ||
      n.name !== `${prefix}-local` ||
      n.routed ||
      n.labels.application_instance !== a.instance_id ||
      n.labels.lzc_instance !== a.instance_id
    )
      throw new Error("cloud-resource-ambiguous");
    adopt({
      address: "module.application.stackit_network.this[0]",
      type: "stackit_network",
      resourceId: `${projectId},${target.region},${n.id}`,
    });
  }
  if (cloud.networks.length > 1) throw new Error("cloud-resource-ambiguous");
  const accountName = `${prefix}-automation`.replaceAll("-", "").slice(0, 20);
  const accounts = cloud.serviceAccounts.filter((s) => !s.internal);
  if (accounts.length > 1) throw new Error("cloud-resource-ambiguous");
  for (const s of accounts) {
    if (
      !s.email.startsWith(`${accountName}-`) ||
      !s.email.endsWith("@sa.stackit.cloud")
    )
      throw new Error("cloud-resource-ambiguous");
    const key = retained.get(
      "module.application.stackit_service_account_key.automation",
    );
    // A key listing cannot recover the private key material; do not fabricate it
    // or silently replace a potentially used key to make a Plan look green.
    if (s.keyIds.some((id) => key?.instance.attributes.key_id !== id))
      throw new Error("lost-private-material");
    adopt({
      address: "module.application.stackit_service_account.automation",
      type: "stackit_service_account",
      resourceId: `${projectId},${s.email}`,
    });
    const own = cloud.roleAssignments.filter(
      (r) => r.role === "owner" && r.subject === s.email,
    );
    if (own.length > 1) throw new Error("cloud-resource-ambiguous");
    if (own.length === 1)
      adopt({
        address:
          "module.application.stackit_authorization_project_role_assignment.sa_owner",
        type: "stackit_authorization_project_role_assignment",
        resourceId: `${projectId},owner,${s.email}`,
      });
  }
  const plannedRoles = new Set<string>();
  for (const r of a.role_assignments) {
    const key = `${r.role}-${r.subject}`;
    if (plannedRoles.has(key)) throw new Error("cloud-resource-ambiguous");
    plannedRoles.add(key);
    const matches = cloud.roleAssignments.filter(
      (i) => i.role === r.role && i.subject === r.subject,
    );
    if (matches.length > 1) throw new Error("cloud-resource-ambiguous");
    if (matches.length === 1)
      adopt({
        address: `module.application.stackit_authorization_project_role_assignment.this[${JSON.stringify(key)}]`,
        type: "stackit_authorization_project_role_assignment",
        resourceId: `${projectId},${r.role},${r.subject}`,
      });
  }
  // Additional service importers require their own identity/secret contracts.
  // This first catalogue may continue when those services are absent, but never
  // assumes a missing State entry means an absent cloud service.
  const known = (type: string, attribute: string, id: string) =>
    original.instances.some(
      (r) =>
        r.resource.type === type && r.instance.attributes[attribute] === id,
    );
  if (
    cloud.buckets.some(
      (name) => !known("stackit_objectstorage_bucket", "name", name),
    ) ||
    cloud.credentialsGroups.some(
      (g) =>
        !g.platformDefault &&
        !known(
          "stackit_objectstorage_credentials_group",
          "credentials_group_id",
          g.id,
        ),
    ) ||
    cloud.secretsManagerIds.some(
      (id) => !known("stackit_secretsmanager_instance", "instance_id", id),
    ) ||
    cloud.observabilityIds.some(
      (id) => !known("stackit_observability_instance", "instance_id", id),
    )
  )
    throw new Error("unsupported-resource");
  return imports;
}
