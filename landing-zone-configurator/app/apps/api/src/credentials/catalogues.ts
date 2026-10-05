import type pg from "pg";
import { z } from "zod";
import type { Session } from "../auth/store.js";
import { withTenant } from "../storage/database.js";
import { signedAssertion } from "./check.js";
import { parseServiceAccountKey, type ServiceAccountKey } from "./key.js";
import { CredentialError } from "./profiles.js";
import type { CredentialSecrets } from "./secrets.js";

export const catalogueRequest = z
  .object({
    profileId: z.uuid(),
    projectId: z.uuid(),
    region: z.enum(["eu01", "eu02"]),
  })
  .strict();
export type CatalogueRequest = z.infer<typeof catalogueRequest>;
export type CatalogueOption = { value: string; label: string };
export type CataloguePart = {
  status: "available" | "unavailable";
  options: CatalogueOption[];
};
export type CloudCatalogue = {
  region: string;
  projectId: string | null;
  fetchedAt: string;
  gitFlavors: CataloguePart;
  vpnPlans: CataloguePart;
  kubernetesVersions: CataloguePart;
  machineTypes: CataloguePart;
  machineImages?: CataloguePart;
  availabilityZones: CataloguePart;
  volumeTypes: CataloguePart;
  observabilityPlans?: CataloguePart;
  bastionMachineTypes?: CataloguePart;
  bastionImages?: CataloguePart;
  bastionAvailabilityZones?: CataloguePart;
  projectRoles?: CataloguePart;
  projectPermissions?: CataloguePart;
  projectRoleTemplates?: {
    name: string;
    description: string;
    permissions: string[];
  }[];
};
const text = z.string().min(1).max(256);
const names = z.array(z.object({ name: text })).max(2000);
const git = z.object({
  flavors: z
    .array(z.object({ id: text, display_name: text, availability: text }))
    .max(2000),
});
const vpn = z.object({
  plans: z.array(z.object({ planId: text, name: text.optional() })).max(2000),
});
const ske = z.object({
  kubernetesVersions: z
    .array(z.object({ version: text, state: text.optional() }))
    .max(2000),
  machineTypes: names,
  machineImages: z
    .array(
      z.object({
        name: text,
        versions: z.array(z.object({ state: text })).max(2000),
      }),
    )
    .max(2000)
    .optional(),
  availabilityZones: names,
  volumeTypes: names,
});
const observability = z.object({
  plans: z.array(z.object({ name: text.optional() })).max(2000),
});
const iaasMachines = z.object({ items: names });
const iaasImages = z.object({
  items: z
    .array(
      z.object({
        id: z.uuid().optional(),
        name: text,
        status: text.optional(),
        scope: text.optional(),
      }),
    )
    .max(2000),
});
const iaasZones = z.object({ items: z.array(text).max(2000) });
const projectPermissions = z.object({
  permissions: z
    .array(z.object({ name: text, description: text.optional() }))
    .max(2000),
});
const projectRoles = z.object({
  resourceId: z.uuid(),
  resourceType: z.literal("project"),
  roles: z
    .array(
      z.object({
        name: text,
        description: z.string().max(2000),
        permissions: z.array(z.object({ name: text })).max(2000),
      }),
    )
    .max(2000),
});
const unavailable = (): CataloguePart => ({
  status: "unavailable",
  options: [],
});
const available = (options: CatalogueOption[]): CataloguePart => ({
  status: "available",
  options,
});
const named = (items: { name: string }[]) =>
  items.map(({ name }) => ({ value: name, label: name }));
const tokenEndpoints: Record<ServiceAccountKey["credentials"]["aud"], string> =
  {
    "https://accounts.stackit.cloud":
      "https://accounts.stackit.cloud/oauth/v2/token",
    "https://service-account.api.stackit.cloud":
      "https://service-account.api.stackit.cloud/token",
    "https://stackit-service-account-prod.apps.01.cf.eu01.stackit.cloud":
      "https://stackit-service-account-prod.apps.01.cf.eu01.stackit.cloud/token",
  };
/** Product metadata only. No token, private key or raw provider response leaves this service. */
export class StackitCatalogueClient {
  constructor(private readonly request: typeof fetch = fetch) {}
  private async json(url: string, init: RequestInit = {}) {
    const response = await this.request(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("catalogue_unavailable");
    // Product catalogues are bounded; never buffer unbounded upstream data.
    const reader = response.body?.getReader();
    if (!reader) throw new Error("catalogue_unavailable");
    const parts: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2_000_000) throw new Error("catalogue_too_large");
        parts.push(value);
      }
    } finally {
      await reader.cancel();
    }
    return JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown;
  }
  async load(
    input: CatalogueRequest,
    rawKey: ServiceAccountKey,
  ): Promise<CloudCatalogue> {
    const { projectId, region } = catalogueRequest.parse(input);
    return this.loadWithToken(
      region,
      projectId,
      await this.authenticate(rawKey),
    );
  }
  private async authenticate(rawKey: ServiceAccountKey): Promise<string> {
    const key = parseServiceAccountKey(rawKey);
    const token = z
      .object({
        access_token: z.string().min(1).max(32768),
        token_type: z.string().refine((v) => v.toLowerCase() === "bearer"),
      })
      .parse(
        await this.json(
          key.credentials.tokenEndpoint ?? tokenEndpoints[key.credentials.aud],
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
              assertion: signedAssertion(key),
            }).toString(),
          },
        ),
      );
    return token.access_token;
  }
  async automatic(
    region: "eu01" | "eu02",
    rawKey: ServiceAccountKey,
    organizationId: string | null,
  ): Promise<CloudCatalogue> {
    z.enum(["eu01", "eu02"]).parse(region);
    const token = await this.authenticate(rawKey);
    let projectId: string | null = null;
    const organization = organizationId ? z.uuid().parse(organizationId) : null;
    const parents: (string | null)[] = [organization];
    const visited = new Set<string | null>();
    const deadline = Date.now() + 15000;
    while (parents.length && visited.size < 32 && Date.now() < deadline) {
      const parent = parents.shift();
      if (parent === undefined || visited.has(parent)) continue;
      visited.add(parent);
      try {
        const query = new URLSearchParams({
          limit: "100",
          offset: "0",
        });
        if (parent) query.set("containerParentId", parent);
        const projects = z
          .object({
            items: z
              .array(
                z.object({ projectId: z.uuid(), lifecycleState: z.string() }),
              )
              .max(100),
          })
          .parse(
            await this.json(
              `https://resource-manager.api.stackit.cloud/v2/projects?${query}`,
              { headers: { Authorization: `Bearer ${token}` } },
            ),
          );
        projectId =
          projects.items
            .filter((project) => project.lifecycleState === "ACTIVE")
            .sort((first, second) =>
              first.projectId.localeCompare(second.projectId),
            )[0]?.projectId ?? null;
        if (projectId || !parent) break;
        const folders = z
          .object({ items: z.array(z.object({ folderId: z.uuid() })).max(100) })
          .parse(
            await this.json(
              `https://resource-manager.api.stackit.cloud/v2/folders?${query}`,
              { headers: { Authorization: `Bearer ${token}` } },
            ),
          );
        for (const folder of folders.items.sort((first, second) =>
          first.folderId.localeCompare(second.folderId),
        )) {
          if (!visited.has(folder.folderId)) parents.push(folder.folderId);
        }
      } catch {
        projectId = null;
      }
    }
    return this.loadWithToken(region, projectId, token);
  }
  private async loadWithToken(
    region: "eu01" | "eu02",
    projectId: string | null,
    token: string,
  ): Promise<CloudCatalogue> {
    const headers = { Authorization: `Bearer ${token}` };
    const [
      gitResult,
      vpnResult,
      skeResult,
      observabilityResult,
      machinesResult,
      imagesResult,
      zonesResult,
      rolesResult,
      permissionsResult,
    ] = await Promise.allSettled([
      projectId
        ? this.json(
            `https://git.api.stackit.cloud/v1beta/projects/${projectId}/flavors`,
            { headers },
          ).then((v) => git.parse(v))
        : Promise.reject(new Error("reference_project_unavailable")),
      this.json(`https://vpn.api.stackit.cloud/v1/regions/${region}/plans`, {
        headers,
      }).then((v) => vpn.parse(v)),
      this.json(
        `https://ske.api.stackit.cloud/v2/regions/${region}/provider-options?versionState=SUPPORTED`,
        { headers },
      ).then((v) => ske.parse(v)),
      region === "eu01" && projectId
        ? this.json(
            `https://argus.api.eu01.stackit.cloud/v1/projects/${projectId}/plans`,
            { headers },
          ).then((v) => observability.parse(v))
        : Promise.reject(new Error("catalogue_region_not_documented")),
      projectId
        ? this.json(
            `https://iaas.api.stackit.cloud/v2/projects/${projectId}/regions/${region}/machine-types`,
            { headers },
          ).then((v) => iaasMachines.parse(v))
        : Promise.reject(new Error("reference_project_unavailable")),
      projectId
        ? this.json(
            `https://iaas.api.stackit.cloud/v2/projects/${projectId}/regions/${region}/images`,
            { headers },
          ).then((v) => iaasImages.parse(v))
        : Promise.reject(new Error("reference_project_unavailable")),
      this.json(
        `https://iaas.api.stackit.cloud/v2/regions/${region}/availability-zones`,
        { headers },
      ).then((v) => iaasZones.parse(v)),
      projectId
        ? this.json(
            `https://authorization.api.stackit.cloud/v2/project/${projectId}/roles`,
            { headers },
          ).then((value) => projectRoles.parse(value))
        : Promise.reject(new Error("reference_project_unavailable")),
      this.json(
        "https://authorization.api.stackit.cloud/v2/permissions?resourceType=project",
        { headers },
      ).then((value) => projectPermissions.parse(value)),
    ]);
    const result: CloudCatalogue = {
      region,
      projectId,
      fetchedAt: new Date().toISOString(),
      gitFlavors: unavailable(),
      vpnPlans: unavailable(),
      kubernetesVersions: unavailable(),
      machineTypes: unavailable(),
      machineImages: unavailable(),
      availabilityZones: unavailable(),
      volumeTypes: unavailable(),
      observabilityPlans: unavailable(),
      bastionMachineTypes: unavailable(),
      bastionImages: unavailable(),
      bastionAvailabilityZones: unavailable(),
      projectRoles: unavailable(),
      projectPermissions: unavailable(),
    };
    if (gitResult.status === "fulfilled")
      result.gitFlavors = available(
        gitResult.value.flavors
          .filter((v) => v.availability === "available")
          .map((v) => ({ value: v.id, label: v.display_name })),
      );
    if (vpnResult.status === "fulfilled")
      result.vpnPlans = available(
        vpnResult.value.plans.map((v) => ({
          value: v.planId,
          label: v.name ?? v.planId,
        })),
      );
    if (skeResult.status === "fulfilled") {
      const data = skeResult.value;
      result.kubernetesVersions = available(
        data.kubernetesVersions
          .filter(
            (v) => !v.state || ["supported", "SUPPORTED"].includes(v.state),
          )
          .map((v) => ({ value: v.version, label: v.version })),
      );
      result.machineTypes = available(named(data.machineTypes));
      if (data.machineImages)
        result.machineImages = available(
          named(
            data.machineImages.filter((image) =>
              image.versions.some(
                (version) => version.state.toUpperCase() === "SUPPORTED",
              ),
            ),
          ),
        );
      result.availabilityZones = available(named(data.availabilityZones));
      result.volumeTypes = available(named(data.volumeTypes));
    }
    if (observabilityResult.status === "fulfilled")
      result.observabilityPlans = available(
        observabilityResult.value.plans.flatMap((v) =>
          v.name ? [{ value: v.name, label: v.name }] : [],
        ),
      );
    if (machinesResult.status === "fulfilled")
      result.bastionMachineTypes = available(named(machinesResult.value.items));
    // Only available public images can be reused in newly created target projects.
    // A reference project's private image does not imply access in the future platform project.
    if (imagesResult.status === "fulfilled")
      result.bastionImages = available(
        imagesResult.value.items
          .flatMap((v) =>
            v.id && v.status === "AVAILABLE" && v.scope === "public"
              ? [{ value: v.id, label: v.name }]
              : [],
          )
          .sort(
            (first, second) =>
              first.label.localeCompare(second.label) ||
              first.value.localeCompare(second.value),
          ),
      );
    if (zonesResult.status === "fulfilled")
      result.bastionAvailabilityZones = available(
        zonesResult.value.items.map((value) => ({ value, label: value })),
      );
    if (
      rolesResult.status === "fulfilled" &&
      rolesResult.value.resourceId === projectId
    ) {
      result.projectRoles = available(named(rolesResult.value.roles));
      result.projectRoleTemplates = rolesResult.value.roles.map((role) => ({
        name: role.name,
        description: role.description,
        permissions: role.permissions.map((permission) => permission.name),
      }));
    }
    if (permissionsResult.status === "fulfilled")
      result.projectPermissions = available(
        named(permissionsResult.value.permissions),
      );
    return result;
  }
}
export class PostgresCloudCatalogues {
  constructor(
    private readonly pool: pg.Pool,
    private readonly secrets: CredentialSecrets,
    private readonly cloud = new StackitCatalogueClient(),
  ) {}
  async load(session: Session, input: CatalogueRequest) {
    const parsed = catalogueRequest.parse(input);
    // Explicit owner/tenant filters in addition to RLS: never borrow a colleague's access.
    const profile = await withTenant(
      this.pool,
      session,
      async (c) =>
        (
          await c.query<{ key_id: string; service_account: string }>(
            "SELECT key_id, service_account FROM lzc.credential_profiles WHERE id=$1 AND tenant_id=$2 AND owner_user_id=$3 AND state='stored'",
            [parsed.profileId, session.tenantId, session.userId],
          )
        ).rows[0],
    );
    if (!profile) throw new CredentialError(404, "credential_not_found");
    const secret = await this.secrets.get(session, parsed.profileId);
    if (
      secret.key.credentials.kid !== profile.key_id ||
      secret.key.credentials.iss !== profile.service_account
    )
      throw new Error("credential_identity_mismatch");
    return this.cloud.load(parsed, secret.key);
  }
  async automatic(session: Session, region: "eu01" | "eu02") {
    const profile = await withTenant(
      this.pool,
      session,
      async (client) =>
        (
          await client.query<{
            id: string;
            key_id: string;
            service_account: string;
            organization_id: string | null;
          }>(
            "SELECT p.id,p.key_id,p.service_account,coalesce(t.organization_id,CASE WHEN p.last_check->>'status'='passed' THEN (p.last_check->>'organizationId')::uuid END) AS organization_id FROM lzc.credential_profiles p JOIN lzc.tenants t ON t.id=p.tenant_id WHERE p.tenant_id=$1 AND p.owner_user_id=$2 AND p.state='stored' ORDER BY p.created_at DESC,p.id LIMIT 1",
            [session.tenantId, session.userId],
          )
        ).rows[0],
    );
    if (!profile) throw new CredentialError(404, "credential_not_found");
    const secret = await this.secrets.get(session, profile.id);
    if (
      secret.key.credentials.kid !== profile.key_id ||
      secret.key.credentials.iss !== profile.service_account
    )
      throw new Error("credential_identity_mismatch");
    return this.cloud.automatic(region, secret.key, profile.organization_id);
  }
}
