import { recoveryCloudInventorySchema } from "@lzc/contracts/recovery";
import { z } from "zod";
import { signedAssertion } from "../credentials/check.js";
import {
  parseServiceAccountKey,
  type ServiceAccountKey,
} from "../credentials/key.js";

const uuid = z.uuid();
const text = z.string().min(1).max(256);
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

  async read(
    input: { projectId: string; region: "eu01" | "eu02"; ownerEmail: string },
    rawKey: ServiceAccountKey,
  ) {
    try {
      return await this.collect(input, rawKey);
    } catch (error) {
      if (error instanceof Error && error.message === "cloud-project-mismatch")
        throw error;
      throw new Error("cloud-inventory-incomplete");
    }
  }
  private async collect(
    input: {
      projectId: string;
      region: "eu01" | "eu02";
      ownerEmail: string;
    },
    rawKey: ServiceAccountKey,
  ) {
    const { projectId, region, ownerEmail } = z
      .strictObject({
        projectId: uuid,
        region: z.enum(["eu01", "eu02"]),
        ownerEmail: z.email(),
      })
      .parse(input);
    const key = parseServiceAccountKey(rawKey);
    const deadline = Date.now() + 45_000;
    const token = z
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
      .strictObject({ instances: z.array(z.object({ id: text })).max(999) })
      .parse(rawSecrets).instances;
    const observability = z
      .strictObject({
        instances: z.array(z.object({ id: text })).max(999),
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
      // Exclude the service's default group from adoption. This marker never
      // permits importing it; the original Application group has its own name.
      credentialsGroups: groups.map((g) => ({
        id: g.credentialsGroupId,
        name: g.displayName,
        platformDefault: g.displayName === "default",
      })),
      secretsManagerIds: secrets.map((s) => s.id),
      observabilityIds: observability.map((i) => i.id),
    });
  }
}
