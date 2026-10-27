import {
  type ApplicationStateRecoveryRevocation,
  applicationStateRecoveryRevocationSchema,
} from "@lzc/contracts";
import { recoveryCloudInventorySchema } from "@lzc/contracts/recovery";
import { z } from "zod";
import { signedAssertion } from "../credentials/check.js";
import {
  parseServiceAccountKey,
  type ServiceAccountKey,
} from "../credentials/key.js";

const uuid = z.uuid();
const scopeSchema = z.strictObject({
  organizationId: uuid,
  networkAreaId: uuid,
  instanceId: uuid,
});
type RecoveryCloudInput = {
  projectId: string;
  region: "eu01" | "eu02";
  ownerEmail: string;
  routing?: z.infer<typeof scopeSchema>;
  customRoles?: boolean;
};
const text = z.string().min(1).max(256);
// Match the pinned SDK's Go url.PathEscape for opaque key IDs. In particular,
// padded Object Storage IDs retain '=' and '+'; path/query delimiters stay escaped.
const keySegment = (value: string) =>
  encodeURIComponent(value)
    .replace(
      /[!'()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    )
    .replaceAll("%3D", "=")
    .replaceAll("%2B", "+")
    .replaceAll("%40", "@")
    .replaceAll("%3A", ":")
    .replaceAll("%26", "&")
    .replaceAll("%24", "$");
const endpoints = {
  "https://accounts.stackit.cloud":
    "https://accounts.stackit.cloud/oauth/v2/token",
  "https://service-account.api.stackit.cloud":
    "https://service-account.api.stackit.cloud/token",
  "https://stackit-service-account-prod.apps.01.cf.eu01.stackit.cloud":
    "https://stackit-service-account-prod.apps.01.cf.eu01.stackit.cloud/token",
} as const;

/** Fixed public API destinations; no endpoint, cursor or credentials supplied by the browser. */
export class StackitRecoveryCloud {
  constructor(private readonly request: typeof fetch = fetch) {}

  private async json(
    url: string,
    init: RequestInit,
    deadline: number,
  ): Promise<unknown> {
    if (Date.now() >= deadline) throw new Error("cloud-inventory-incomplete");
    const response = await this.request(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(
        Math.max(1, Math.min(10_000, deadline - Date.now())),
      ),
    });
    if (!response.ok || !response.body)
      throw new Error("cloud-inventory-incomplete");
    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 4 * 1024 * 1024)
          throw new Error("cloud-inventory-incomplete");
        parts.push(value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  }

  private async token(rawKey: ServiceAccountKey, deadline: number) {
    const key = parseServiceAccountKey(rawKey);
    return z
      .object({
        access_token: z.string().min(1).max(32768),
        token_type: z.string().refine((v) => v.toLowerCase() === "bearer"),
      })
      .parse(
        await this.json(
          key.credentials.tokenEndpoint ?? endpoints[key.credentials.aud],
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
              assertion: signedAssertion(key),
            }).toString(),
          },
          deadline,
        ),
      );
  }
  /** Called only after the API persisted an exact, once-only reviewed intent.
   * No retry: a timeout requires independent inspection of key metadata. */
  async revoke(
    input: ApplicationStateRecoveryRevocation,
    rawKey: ServiceAccountKey,
  ) {
    const r = applicationStateRecoveryRevocationSchema.parse(input);
    const token = await this.token(rawKey, Date.now() + 15_000);
    let url: string;
    if (r.kind === "service-account-key") {
      if (!r.accountEmail || r.groupId)
        throw new Error("cloud-project-mismatch");
      url = `https://service-account.api.stackit.cloud/v2/projects/${r.projectId}/service-accounts/${encodeURIComponent(r.accountEmail).replaceAll("%40", "@")}/keys/${keySegment(r.keyId)}`;
    } else {
      if (!r.groupId || r.accountEmail)
        throw new Error("cloud-project-mismatch");
      url = `https://object-storage.api.stackit.cloud/v2/project/${r.projectId}/regions/${r.region}/access-keys/${keySegment(r.keyId)}?credentials-group=${encodeURIComponent(r.groupId)}`;
    }
    const response = await this.request(url, {
      method: "DELETE",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error("commit-outcome-unknown");
  }
  async findProject(
    input: { folderId: string; instanceId: string },
    rawKey: ServiceAccountKey,
  ) {
    z.object({ folderId: text, instanceId: uuid }).parse(input);
    const deadline = Date.now() + 30_000;
    const token = await this.token(rawKey, deadline);
    const found: string[] = [];
    const seen = new Set<string>();
    for (let offset = 0; offset < 1000; offset += 100) {
      const page = z
        .strictObject({
          offset: z.literal(offset),
          limit: z.literal(100),
          items: z
            .array(
              z.object({
                projectId: uuid,
                labels: z.record(z.string(), z.string()).default({}),
                parent: z.object({ containerId: text }),
              }),
            )
            .max(100),
        })
        .parse(
          await this.json(
            `https://resource-manager.api.stackit.cloud/v2/projects?containerParentId=${encodeURIComponent(input.folderId)}&offset=${offset}&limit=100`,
            {
              method: "GET",
              headers: { Authorization: `Bearer ${token.access_token}` },
            },
            deadline,
          ),
        );
      for (const p of page.items) {
        if (seen.has(p.projectId))
          throw new Error("cloud-inventory-incomplete");
        seen.add(p.projectId);
        if (p.parent.containerId !== input.folderId)
          throw new Error("cloud-project-mismatch");
        if (
          p.labels.application_instance === input.instanceId ||
          p.labels.lzc_instance === input.instanceId
        )
          found.push(p.projectId);
      }
      if (page.items.length < 100) {
        if (found.length !== 1) throw new Error("cloud-resource-ambiguous");
        return found[0]!;
      }
    }
    throw new Error("cloud-inventory-incomplete");
  }
  async read(input: RecoveryCloudInput, rawKey: ServiceAccountKey) {
    try {
      return await this.collect(input, rawKey);
    } catch (error) {
      if (error instanceof Error && error.message === "cloud-project-mismatch")
        throw error;
      throw new Error("cloud-inventory-incomplete");
    }
  }
  private async collect(input: RecoveryCloudInput, rawKey: ServiceAccountKey) {
    const { projectId, region, ownerEmail } = z
      .strictObject({
        projectId: uuid,
        region: z.enum(["eu01", "eu02"]),
        ownerEmail: z.email(),
        routing: scopeSchema.optional(),
        customRoles: z.boolean().optional(),
      })
      .parse(input);
    const deadline = Date.now() + 45_000;
    const token = await this.token(rawKey, deadline);
    const get = (url: string) =>
      this.json(
        url,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${token.access_token}` },
        },
        deadline,
      );
    // These SDK list APIs have no pagination parameters. Strict response
    // envelopes reject newly introduced pagination instead of silently losing it.
    const [
      rawProject,
      rawNetworks,
      rawAccounts,
      rawRoles,
      rawBuckets,
      rawGroups,
      rawSecrets,
      rawObservability,
    ] = await Promise.all([
      get(
        `https://resource-manager.api.stackit.cloud/v2/projects/${projectId}`,
      ),
      get(
        `https://iaas.api.stackit.cloud/v2/projects/${projectId}/regions/${region}/networks`,
      ),
      get(
        `https://service-account.api.stackit.cloud/v2/projects/${projectId}/service-accounts`,
      ),
      get(
        `https://authorization.api.stackit.cloud/v2/project/${projectId}/members`,
      ),
      get(
        `https://object-storage.api.stackit.cloud/v2/project/${projectId}/regions/${region}/buckets`,
      ),
      get(
        `https://object-storage.api.stackit.cloud/v2/project/${projectId}/regions/${region}/credentials-groups`,
      ),
      get(
        `https://secrets-manager.api.${region}.stackit.cloud/v1/projects/${projectId}/instances`,
      ),
      get(
        `https://argus.api.${region}.stackit.cloud/v1/projects/${projectId}/instances`,
      ),
    ]);
    const p = z
      .object({
        projectId: uuid,
        containerId: text,
        name: text,
        lifecycleState: z.literal("ACTIVE"),
        parent: z.object({ containerId: text }),
        labels: z.record(z.string(), z.string()),
      })
      .parse(rawProject);
    if (p.projectId !== projectId) throw new Error("cloud-project-mismatch");
    const networks = z
      .strictObject({
        items: z
          .array(
            z.object({
              id: uuid,
              name: text,
              routed: z.boolean(),
              routingTableId: uuid.nullable().optional(),
              labels: z.record(z.string(), z.string()),
            }),
          )
          .max(999),
      })
      .parse(rawNetworks).items;
    const accounts = z
      .strictObject({
        items: z
          .array(
            z.object({
              email: z.email(),
              internal: z.boolean(),
              projectId: uuid,
            }),
          )
          .max(20),
      })
      .parse(rawAccounts).items;
    const members = z
      .strictObject({
        resourceId: z.literal(projectId),
        resourceType: z.literal("project"),
        members: z
          .array(z.object({ role: text, subject: z.string().min(1).max(254) }))
          .max(999),
      })
      .parse(rawRoles).members;
    if (
      !members.some(
        (m) =>
          m.subject === ownerEmail &&
          ["owner", "project.owner"].includes(m.role),
      )
    )
      throw new Error("cloud-project-mismatch");
    const buckets = z
      .strictObject({
        project: z.literal(projectId),
        buckets: z
          .array(
            z.object({
              name: z.string().min(3).max(63),
              region: z.literal(region),
            }),
          )
          .max(999),
      })
      .parse(rawBuckets).buckets;
    const groups = z
      .strictObject({
        project: z.literal(projectId),
        credentialsGroups: z
          .array(
            z.object({
              credentialsGroupId: text,
              displayName: text,
              urn: text,
            }),
          )
          .max(999),
      })
      .parse(rawGroups).credentialsGroups;
    const secrets = z
      .strictObject({
        instances: z.array(z.object({ id: text, name: text })).max(999),
      })
      .parse(rawSecrets).instances;
    const observability = z
      .strictObject({
        instances: z
          .array(z.object({ id: text, name: text, planName: text }))
          .max(999),
        message: z.string().max(2000),
      })
      .parse(rawObservability).instances;
    const serviceAccounts = [];
    // Bounded metadata reads; never request private key payloads. STACKIT
    // authorizes this path with a literal @; %40 currently yields a false 403.
    for (const a of accounts) {
      const keys = a.internal
        ? []
        : z
            .strictObject({ items: z.array(z.object({ id: text })).max(999) })
            .parse(
              await get(
                `https://service-account.api.stackit.cloud/v2/projects/${projectId}/service-accounts/${encodeURIComponent(a.email).replaceAll("%40", "@")}/keys`,
              ),
            ).items;
      serviceAccounts.push({ ...a, keyIds: keys.map((k) => k.id) });
    }
    const credentialsGroups = [];
    for (const g of groups) {
      const accessKeyIds =
        g.displayName === "default"
          ? []
          : z
              .strictObject({
                project: z.literal(projectId),
                accessKeys: z.array(z.object({ keyId: text })).max(999),
              })
              .parse(
                await get(
                  `https://object-storage.api.stackit.cloud/v2/project/${projectId}/regions/${region}/access-keys?credentials-group=${encodeURIComponent(g.credentialsGroupId)}`,
                ),
              )
              .accessKeys.map((k) => k.keyId);
      credentialsGroups.push({
        id: g.credentialsGroupId,
        name: g.displayName,
        platformDefault: g.displayName === "default",
        accessKeyIds,
      });
    }
    const customRoles = input.customRoles
      ? z
          .strictObject({
            resourceId: z.literal(projectId),
            resourceType: z.literal("project"),
            roles: z
              .array(
                z.object({
                  id: text,
                  name: text,
                  description: z.string().max(2000),
                  permissions: z.array(z.object({ name: text })).max(2000),
                }),
              )
              .max(999),
          })
          .parse(
            await get(
              `https://authorization.api.stackit.cloud/v2/project/${projectId}/roles`,
            ),
          )
          .roles.map((r) => ({
            ...r,
            permissions: r.permissions.map((p) => p.name),
          }))
      : [];
    const routingTables = [];
    if (input.routing) {
      const scope = scopeSchema.parse(input.routing);
      const base = `https://iaas.api.stackit.cloud/v2/organizations/${scope.organizationId}/network-areas/${scope.networkAreaId}/regions/${region}/routing-tables`;
      const tables = z
        .strictObject({
          items: z
            .array(
              z.object({
                id: uuid,
                name: text,
                labels: z.record(z.string(), z.string()),
                systemRoutes: z.boolean(),
              }),
            )
            .max(999),
        })
        .parse(await get(base)).items;
      for (const table of tables) {
        // Shared SNA tables belonging to other Applications are not candidates.
        // A partially matching label/name still reaches the identity verifier.
        if (
          table.labels.application_instance !== scope.instanceId &&
          table.labels.lzc_instance !== scope.instanceId &&
          !table.name.startsWith(`app-${scope.instanceId}`)
        )
          continue;
        const routes = z
          .strictObject({
            items: z
              .array(
                z.object({
                  id: uuid,
                  destination: z.object({ type: text, value: text }),
                  nexthop: z.object({ type: text, value: text }),
                  labels: z.record(z.string(), z.string()),
                }),
              )
              .max(999),
          })
          .parse(await get(`${base}/${table.id}/routes`)).items;
        routingTables.push({
          ...table,
          routes: routes.map(({ nexthop, ...r }) => ({
            ...r,
            nextHop: nexthop,
          })),
        });
      }
    }
    return recoveryCloudInventorySchema.parse({
      complete: true,
      project: {
        projectId: p.projectId,
        containerId: p.containerId,
        parentContainerId: p.parent.containerId,
        name: p.name,
        ownerEmail,
        active: true,
        labels: p.labels,
      },
      networks: networks.map((n) => ({ ...n, projectId, region })),
      serviceAccounts,
      roleAssignments: members.map((r) => ({ ...r, projectId })),
      buckets: buckets.map((b) => b.name),
      credentialsGroups,
      customRoles,
      customRolesComplete: !!input.customRoles,
      routingScope: input.routing
        ? {
            organizationId: input.routing.organizationId,
            networkAreaId: input.routing.networkAreaId,
            region,
          }
        : null,
      routingTables,
      secretsManagers: secrets.map((s) => ({ id: s.id, name: s.name })),
      observability: observability.map((i) => ({
        id: i.id,
        name: i.name,
        planName: i.planName,
      })),
      secretsManagerIds: secrets.map((s) => s.id),
      observabilityIds: observability.map((i) => i.id),
    });
  }
}
