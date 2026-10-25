import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  ApplicationStateRecoveryImport,
  ApplicationStateRecoveryRevocation,
} from "../application-state-recovery.js";
import { readRecoveryState, recoveryCredentialIncomplete } from "./proof.js";

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
        routingTableId: uuid.nullable().optional(),
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
        accessKeyIds: z.array(z.string().min(1).max(256)).max(1000).optional(),
      }),
    )
    .max(1000),
  secretsManagerIds: z.array(z.string().min(1).max(256)).max(1000),
  observabilityIds: z.array(z.string().min(1).max(256)).max(1000),
  secretsManagers: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(256),
        name: z.string().max(256),
      }),
    )
    .max(1000)
    .default([]),
  observability: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(256),
        name: z.string().max(256),
        planName: z.string().min(1).max(256),
      }),
    )
    .max(1000)
    .default([]),
  customRoles: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(256),
        name: z.string().min(1).max(256),
        description: z.string().max(2000),
        permissions: z.array(z.string().min(1).max(256)).max(1000),
      }),
    )
    .max(1000)
    .default([]),
  customRolesComplete: z.boolean().default(false),
  routingScope: z
    .strictObject({
      organizationId: uuid,
      networkAreaId: uuid,
      region: z.enum(["eu01", "eu02"]),
    })
    .nullable()
    .default(null),
  routingTables: z
    .array(
      z.strictObject({
        id: uuid,
        name: z.string().max(256),
        labels,
        systemRoutes: z.boolean(),
        routes: z
          .array(
            z.strictObject({
              id: uuid,
              destination: z.strictObject({
                type: z.string(),
                value: z.string(),
              }),
              nextHop: z.strictObject({ type: z.string(), value: z.string() }),
              labels,
            }),
          )
          .max(1000),
      }),
    )
    .max(1000)
    .default([]),
  // Set only by the bounded server-side inventory collector after every page
  // and service response has been validated. Missing services never mean empty.
  complete: z.literal(true),
});
export type RecoveryCloudInventory = z.infer<
  typeof recoveryCloudInventorySchema
>;
const variables = z.object({
  bucket_naming: z.enum(["project-id", "legacy"]).default("project-id"),
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
    custom_roles: z
      .array(
        z.object({
          name: z.string().min(1),
          description: z.string(),
          permissions: z.array(z.string()),
        }),
      )
      .max(100)
      .optional(),
    secretsmanager_enabled: z.boolean().optional(),
    observability: z
      .object({ enabled: z.boolean(), plan_name: z.string() })
      .optional(),
    role_assignments: z
      .array(z.object({ role: z.string(), subject: z.string() }))
      .max(100),
  }),
  platform_contract: z.object({
    tenant_id: uuid,
    revision: uuid,
    organization_id: uuid.optional(),
    targets: z.record(
      z.string(),
      z.object({
        folder_id: z.string().min(1),
        region: z.enum(["eu01", "eu02"]),
        corporate: z.boolean(),
        network_area_id: uuid.nullable().optional(),
        firewall_next_hop_ip: z.ipv4().nullable().optional(),
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
  const roots = original.instances.filter(
    (i) =>
      i.address === "module.application.stackit_resourcemanager_project.this",
  );
  const p = roots[0]?.instance.attributes;
  if (
    roots.length > 1 ||
    (p &&
      (p.project_id !== cloud.project.projectId ||
        p.container_id !== cloud.project.containerId ||
        p.id !== cloud.project.containerId)) ||
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
  if (!roots.length)
    adopt({
      address: "module.application.stackit_resourcemanager_project.this",
      type: "stackit_resourcemanager_project",
      resourceId: cloud.project.containerId,
    });
  const owned = (value: Record<string, string>) =>
    value.application_instance === a.instance_id &&
    value.lzc_instance === a.instance_id;
  const unique = <T>(items: T[], identity: (v: T) => string) => {
    if (new Set(items.map(identity)).size !== items.length)
      throw new Error("cloud-resource-ambiguous");
  };
  const exactOne = <T>(items: T[]) => {
    if (items.length > 1) throw new Error("cloud-resource-ambiguous");
    return items[0];
  };
  let routingTableId: string | undefined;
  if (target.corporate) {
    if (
      !v.platform_contract.organization_id ||
      !target.network_area_id ||
      !cloud.routingScope ||
      cloud.routingScope.organizationId !==
        v.platform_contract.organization_id ||
      cloud.routingScope.networkAreaId !== target.network_area_id ||
      cloud.routingScope.region !== target.region
    )
      throw new Error("cloud-inventory-incomplete");
    unique(cloud.routingTables, (t) => t.id);
    const tables = cloud.routingTables.filter(
      (t) => owned(t.labels) || t.name === prefix,
    );
    const table = exactOne(tables);
    if (table) {
      if (
        !target.firewall_next_hop_ip ||
        !owned(table.labels) ||
        table.name !== prefix ||
        table.systemRoutes
      )
        throw new Error("cloud-resource-ambiguous");
      routingTableId = table.id;
      const scope = `${cloud.routingScope.organizationId},${target.region},${cloud.routingScope.networkAreaId},${table.id}`;
      adopt({
        address: "module.application.stackit_routing_table.this[0]",
        type: "stackit_routing_table",
        resourceId: scope,
      });
      unique(table.routes, (r) => r.id);
      const route = exactOne(table.routes);
      if (route) {
        if (
          !owned(route.labels) ||
          route.destination.type !== "cidrv4" ||
          route.destination.value !== "0.0.0.0/0" ||
          route.nextHop.type !== "ipv4" ||
          route.nextHop.value !== target.firewall_next_hop_ip
        )
          throw new Error("cloud-resource-ambiguous");
        adopt({
          address: "module.application.stackit_routing_table_route.this[0]",
          type: "stackit_routing_table_route",
          resourceId: `${scope},${route.id}`,
        });
      }
    }
  } else if (cloud.routingScope || cloud.routingTables.length)
    throw new Error("cloud-project-mismatch");
  if (
    new Set(cloud.networks.map((n) => n.id)).size !== cloud.networks.length ||
    new Set(cloud.serviceAccounts.map((s) => s.email)).size !==
      cloud.serviceAccounts.length
  )
    throw new Error("cloud-resource-ambiguous");
  for (const n of cloud.networks) {
    if (
      (!a.network_enabled && !target.corporate) ||
      n.name !== `${prefix}-${target.corporate ? "routed" : "local"}` ||
      n.routed !== target.corporate ||
      (target.corporate &&
        (n.routingTableId ?? undefined) !== routingTableId) ||
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
    // Orphan key metadata is handled by the separately approved revocation
    // manifest. Private material is never fabricated or silently imported.
    void key;
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
  unique(cloud.buckets, (n) => n);
  const expectedBuckets = new Map(
    ["default", "tfstate"].map((purpose) => [
      v.bucket_naming === "project-id"
        ? `${prefix.slice(0, 63 - purpose.length - 38)}-${projectId}-${purpose}`
        : `${prefix}-${purpose}`,
      purpose,
    ]),
  );
  for (const name of cloud.buckets) {
    const purpose = expectedBuckets.get(name);
    if (!purpose) throw new Error("cloud-resource-ambiguous");
    adopt({
      address: `module.application.stackit_objectstorage_bucket.${purpose}`,
      type: "stackit_objectstorage_bucket",
      resourceId: `${projectId},${target.region},${name}`,
    });
  }
  unique(cloud.credentialsGroups, (g) => g.id);
  const group = exactOne(
    cloud.credentialsGroups.filter((g) => !g.platformDefault),
  );
  if (group) {
    const groupName =
      prefix.length <= 32
        ? prefix
        : `${prefix.slice(0, 23)}-${createHash("sha256").update(prefix).digest("hex").slice(0, 8)}`;
    if (group.name !== groupName) throw new Error("cloud-resource-ambiguous");
    // Listing identifies an orphan credential but cannot reconstruct its secret.
    // A missing metadata list must never be interpreted as no credentials.
    if (!group.accessKeyIds) throw new Error("cloud-inventory-incomplete");
    const credential = retained.get(
      "module.application.stackit_objectstorage_credential.this",
    );
    void credential;
    adopt({
      address:
        "module.application.stackit_objectstorage_credentials_group.this",
      type: "stackit_objectstorage_credentials_group",
      resourceId: `${projectId},${target.region},${group.id}`,
    });
  }
  unique(cloud.secretsManagerIds, (id) => id);
  unique(cloud.observabilityIds, (id) => id);
  unique(cloud.secretsManagers, (s) => s.id);
  unique(cloud.observability, (s) => s.id);
  if (
    cloud.secretsManagers.length !== cloud.secretsManagerIds.length ||
    cloud.secretsManagers.some(
      (s) => !cloud.secretsManagerIds.includes(s.id),
    ) ||
    cloud.observability.length !== cloud.observabilityIds.length ||
    cloud.observability.some((s) => !cloud.observabilityIds.includes(s.id))
  )
    throw new Error("cloud-inventory-incomplete");
  const secret = exactOne(cloud.secretsManagers);
  if (secret) {
    if (!a.secretsmanager_enabled || secret.name !== `${prefix}-default`)
      throw new Error("cloud-resource-ambiguous");
    adopt({
      address: "module.application.stackit_secretsmanager_instance.this[0]",
      type: "stackit_secretsmanager_instance",
      resourceId: `${projectId},${secret.id}`,
    });
  }
  const observability = exactOne(cloud.observability);
  if (observability) {
    if (
      !a.observability?.enabled ||
      observability.name !== prefix ||
      observability.planName !== a.observability.plan_name
    )
      throw new Error("cloud-resource-ambiguous");
    adopt({
      address: "module.application.stackit_observability_instance.this[0]",
      type: "stackit_observability_instance",
      resourceId: `${projectId},${observability.id}`,
    });
  }
  if (a.custom_roles?.length && !cloud.customRolesComplete)
    throw new Error("cloud-inventory-incomplete");
  unique(cloud.customRoles, (r) => r.id);
  for (const expected of a.custom_roles ?? []) {
    const role = exactOne(
      cloud.customRoles.filter((r) => r.name === expected.name),
    );
    if (!role) continue;
    if (
      role.description !== expected.description ||
      JSON.stringify([...role.permissions].sort()) !==
        JSON.stringify([...expected.permissions].sort())
    )
      throw new Error("cloud-resource-ambiguous");
    adopt({
      address: `module.application.stackit_authorization_project_custom_role.this[${JSON.stringify(expected.name)}]`,
      type: "stackit_authorization_project_custom_role",
      resourceId: `${projectId},${role.id}`,
    });
  }
  // Dependencies must be imported before resources that evaluate their references.
  const priority = (type: string) =>
    [
      "stackit_resourcemanager_project",
      "stackit_routing_table",
      "stackit_routing_table_route",
      "stackit_network",
      "stackit_authorization_project_custom_role",
      "stackit_service_account",
      "stackit_authorization_project_role_assignment",
      "stackit_objectstorage_bucket",
      "stackit_objectstorage_credentials_group",
      "stackit_secretsmanager_instance",
      "stackit_observability_instance",
    ].indexOf(type);
  return imports.sort((a, b) => priority(a.type) - priority(b.type));
}

/** Exact lost-secret cleanup manifest, reviewed separately from State adoption.
 * Only keys of the already verified automation account/Application group qualify.
 * Retained credentials and their secrets are never revoked. */
export function deriveApplicationRecoveryRevocations(
  input: Parameters<typeof deriveApplicationRecoveryImports>[0],
): ApplicationStateRecoveryRevocation[] {
  deriveApplicationRecoveryImports(input);
  const state = readRecoveryState(input.state, input.instanceId);
  const cloud = recoveryCloudInventorySchema.parse(input.inventory);
  const v = variables.parse(input.variables);
  const region = v.platform_contract.targets[v.application.target_key]!.region;
  const key = state.instances.find(
    (i) =>
      i.address === "module.application.stackit_service_account_key.automation",
  );
  const credential = state.instances.find(
    (i) =>
      i.address === "module.application.stackit_objectstorage_credential.this",
  );
  const result: ApplicationStateRecoveryRevocation[] = [];
  for (const account of cloud.serviceAccounts.filter((a) => !a.internal)) {
    if (new Set(account.keyIds).size !== account.keyIds.length)
      throw new Error("cloud-resource-ambiguous");
    for (const keyId of account.keyIds)
      if (
        key?.instance.attributes.key_id !== keyId ||
        recoveryCredentialIncomplete(key.address, key.instance.attributes)
      )
        result.push({
          kind: "service-account-key",
          address: "module.application.stackit_service_account_key.automation",
          projectId: cloud.project.projectId,
          region,
          accountEmail: account.email,
          keyId,
          discardIncompleteState:
            key?.instance.attributes.key_id === keyId &&
            recoveryCredentialIncomplete(key.address, key.instance.attributes),
        });
  }
  for (const group of cloud.credentialsGroups.filter(
    (g) => !g.platformDefault,
  )) {
    if (new Set(group.accessKeyIds).size !== group.accessKeyIds!.length)
      throw new Error("cloud-resource-ambiguous");
    for (const keyId of group.accessKeyIds!)
      if (
        credential?.instance.attributes.credential_id !== keyId ||
        recoveryCredentialIncomplete(
          credential.address,
          credential.instance.attributes,
        )
      )
        result.push({
          kind: "objectstorage-credential",
          address: "module.application.stackit_objectstorage_credential.this",
          projectId: cloud.project.projectId,
          region,
          groupId: group.id,
          keyId,
          discardIncompleteState:
            credential?.instance.attributes.credential_id === keyId &&
            recoveryCredentialIncomplete(
              credential.address,
              credential.instance.attributes,
            ),
        });
  }
  for (const item of [key, credential]) {
    if (
      !item ||
      !recoveryCredentialIncomplete(item.address, item.instance.attributes)
    )
      continue;
    const attributes = item.instance.attributes;
    const account = cloud.serviceAccounts.find(
      (a) => !a.internal && a.email === attributes.service_account_email,
    );
    const group = cloud.credentialsGroups.find(
      (g) => !g.platformDefault && g.id === attributes.credentials_group_id,
    );
    const keyId = item === key ? attributes.key_id : attributes.credential_id;
    if (
      typeof keyId !== "string" ||
      !keyId ||
      attributes.project_id !== cloud.project.projectId ||
      (item === key ? !account : !group)
    )
      throw new Error("checkpoint-invalid");
    if (result.some((r) => r.address === item.address && r.keyId === keyId))
      continue;
    result.push({
      kind: item === key ? "service-account-key" : "objectstorage-credential",
      address: item.address,
      projectId: cloud.project.projectId,
      region,
      keyId,
      discardIncompleteState: true,
      ...(item === key
        ? { accountEmail: account!.email }
        : { groupId: group!.id }),
    });
  }
  if (result.length > 100) throw new Error("cloud-resource-ambiguous");
  return result.sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  );
}
/** Allow exactly the approved key removals, retaining all other inventory bytes. */
export function normalizeRevokedRecoveryInventory(
  current: unknown,
  original: unknown,
  revocations: ApplicationStateRecoveryRevocation[],
) {
  const now = recoveryCloudInventorySchema.parse(current),
    before = recoveryCloudInventorySchema.parse(original);
  for (const r of revocations) {
    if (r.kind === "service-account-key") {
      const a = now.serviceAccounts.find(
        (a) => a.email === r.accountEmail && a.projectId === r.projectId,
      );
      const b = before.serviceAccounts.find(
        (a) => a.email === r.accountEmail && a.projectId === r.projectId,
      );
      if (
        !a ||
        !b ||
        (!b.keyIds.includes(r.keyId) && a.keyIds.includes(r.keyId))
      )
        throw new Error("cloud-project-mismatch");
      if (b.keyIds.includes(r.keyId) && !a.keyIds.includes(r.keyId))
        a.keyIds.push(r.keyId);
    } else {
      const a = now.credentialsGroups.find(
        (g) => g.id === r.groupId && !g.platformDefault,
      );
      const b = before.credentialsGroups.find(
        (g) => g.id === r.groupId && !g.platformDefault,
      );
      if (
        !a?.accessKeyIds ||
        !b?.accessKeyIds ||
        (!b.accessKeyIds.includes(r.keyId) && a.accessKeyIds.includes(r.keyId))
      )
        throw new Error("cloud-project-mismatch");
      if (b.accessKeyIds.includes(r.keyId) && !a.accessKeyIds.includes(r.keyId))
        a.accessKeyIds.push(r.keyId);
    }
  }
  return now;
}
export function recoveryRevocationsAbsent(
  inventory: unknown,
  revocations: ApplicationStateRecoveryRevocation[],
) {
  const cloud = recoveryCloudInventorySchema.parse(inventory);
  return revocations.every((r) =>
    r.kind === "service-account-key"
      ? !cloud.serviceAccounts.some(
          (a) => a.email === r.accountEmail && a.keyIds.includes(r.keyId),
        )
      : !cloud.credentialsGroups.some(
          (g) => g.id === r.groupId && g.accessKeyIds?.includes(r.keyId),
        ),
  );
}
export function recoveryRevocationStep(
  value: ApplicationStateRecoveryRevocation,
) {
  return `revoke:${createHash("sha256")
    .update(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
        ),
      ),
    )
    .digest("hex")}`;
}
