import { z } from "zod";
import {
  parseServiceAccountKey,
  type ServiceAccountKey,
  serviceAccountTokenEndpoints,
  signedAssertion,
} from "./service-account.js";

const uuid = z.uuid(),
  text = z.string().min(1).max(256);
const parent = z.object({
  id: uuid,
  containerId: text,
  type: z.enum(["ORGANIZATION", "FOLDER", "PROJECT"]),
});
const project = z.object({
  projectId: uuid,
  containerId: text,
  parent,
  lifecycleState: z.string().min(1),
});
const folder = z.object({ folderId: uuid, containerId: text, parent });
export class RetirementCloudError extends Error {
  constructor(
    readonly code:
      | "retirement_cloud_unavailable"
      | "retirement_cloud_access_unverified"
      | "retirement_control_inside_target"
      | "retirement_cleanup_identity_unverified"
      | "retirement_foreign_child"
      | "retirement_cloud_inventory_incomplete",
  ) {
    super(code);
  }
}
/** Fixed STACKIT read APIs only. A 403/404 is an observation failure, never a purge receipt. */
export class StackitRetirementCloud {
  constructor(private readonly request: typeof fetch = fetch) {}
  private async json(
    url: string,
    init: RequestInit,
    deadline: number,
  ): Promise<unknown> {
    if (Date.now() >= deadline)
      throw new RetirementCloudError("retirement_cloud_inventory_incomplete");
    const response = await this.request(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(
        Math.max(1, Math.min(10000, deadline - Date.now())),
      ),
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new RetirementCloudError(
        [401, 403, 404].includes(response.status)
          ? "retirement_cloud_access_unverified"
          : "retirement_cloud_unavailable",
      );
    }
    const reader = response.body.getReader(),
      parts: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 4 * 1024 * 1024)
          throw new RetirementCloudError(
            "retirement_cloud_inventory_incomplete",
          );
        parts.push(value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  }
  private async authenticated(raw: ServiceAccountKey, deadline: number) {
    const key = parseServiceAccountKey(raw);
    const token = z
      .object({
        access_token: z.string().min(1).max(32768),
        token_type: z.string().refine((v) => v.toLowerCase() === "bearer"),
      })
      .parse(
        await this.json(
          key.credentials.tokenEndpoint ??
            serviceAccountTokenEndpoints[key.credentials.aud],
          {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
              assertion: signedAssertion(key),
            }).toString(),
          },
          deadline,
        ),
      );
    return (
      path: string,
      service: "resource-manager" | "service-account" = "resource-manager",
    ) =>
      this.json(
        `https://${service}.api.stackit.cloud${path}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${token.access_token}` },
        },
        deadline,
      );
  }
  async control(
    input: {
      organizationId: string;
      cleanupProjectId: string;
      controlProjectIds: string[];
      targetProjectIds: string[];
      targetFolderIds: string[];
    },
    raw: ServiceAccountKey,
  ) {
    const value = z
      .strictObject({
        organizationId: uuid,
        cleanupProjectId: uuid,
        controlProjectIds: z.array(uuid).min(1).max(32),
        targetProjectIds: z.array(uuid).max(2000),
        targetFolderIds: z.array(uuid).max(1000),
      })
      .parse(input);
    const targets = new Set(value.targetProjectIds),
      folders = new Set(value.targetFolderIds);
    const controls = [
      ...new Set([value.cleanupProjectId, ...value.controlProjectIds]),
    ];
    if (controls.some((id) => targets.has(id)))
      throw new RetirementCloudError("retirement_control_inside_target");
    const deadline = Date.now() + 60000,
      get = await this.authenticated(raw, deadline);
    const org = z
      .object({ organizationId: uuid, lifecycleState: z.literal("ACTIVE") })
      .parse(await get(`/v2/organizations/${value.organizationId}`));
    if (org.organizationId !== value.organizationId)
      throw new RetirementCloudError("retirement_cloud_access_unverified");
    // Operator projects are trusted deployment bindings. A customer's cleanup
    // key must neither need nor receive access to the SaaS operator organization.
    // Their immutable IDs are excluded above; verify only the customer's own
    // surviving cleanup home and its ancestry using that customer's credentials.
    for (const id of [value.cleanupProjectId]) {
      const control = project.parse(await get(`/v2/projects/${id}`));
      if (control.projectId !== id || control.lifecycleState !== "ACTIVE")
        throw new RetirementCloudError("retirement_cloud_access_unverified");
      if (control.parent.type === "FOLDER") {
        const scope = folder.parse(
          await get(`/v2/folders/${encodeURIComponent(control.parent.id)}`),
        );
        if (
          scope.folderId !== control.parent.id ||
          scope.containerId !== control.parent.containerId ||
          scope.parent.type !== "ORGANIZATION" ||
          scope.parent.id !== value.organizationId
        )
          throw new RetirementCloudError("retirement_cloud_access_unverified");
        if (folders.has(scope.folderId))
          throw new RetirementCloudError("retirement_control_inside_target");
      } else if (
        control.parent.type !== "ORGANIZATION" ||
        control.parent.id !== value.organizationId
      )
        throw new RetirementCloudError("retirement_cloud_access_unverified");
    }
    const accounts = z
      .object({
        items: z
          .array(z.object({ id: uuid, email: z.email(), projectId: uuid }))
          .max(10000),
      })
      .parse(
        await get(
          `/v2/projects/${value.cleanupProjectId}/service-accounts`,
          "service-account",
        ),
      );
    const matching = accounts.items.filter(
      (a) =>
        a.id === raw.credentials.sub &&
        a.email === raw.credentials.iss &&
        a.projectId === value.cleanupProjectId,
    );
    if (matching.length !== 1)
      throw new RetirementCloudError("retirement_cleanup_identity_unverified");
    return {
      organizationId: value.organizationId,
      cleanupProjectId: value.cleanupProjectId,
      controlProjectIds: controls,
      controlProjectProof: "operator-deployment-binding" as const,
      cleanupSubject: raw.credentials.sub,
      cleanupKeyId: raw.credentials.kid,
      checkedAt: new Date().toISOString(),
    };
  }
  async targets(
    input: {
      organizationId: string;
      projectIds: string[];
      folderIds: string[];
    },
    raw: ServiceAccountKey,
  ) {
    const value = z
      .strictObject({
        organizationId: uuid,
        projectIds: z.array(uuid).max(2000),
        folderIds: z.array(uuid).max(1000),
      })
      .parse(input);
    const deadline = Date.now() + 60000,
      get = await this.authenticated(raw, deadline);
    const parents = new Map<string, string>();
    for (const id of value.folderIds) {
      const item = folder.parse(await get(`/v2/folders/${id}`));
      if (
        item.folderId !== id ||
        item.parent.type !== "ORGANIZATION" ||
        item.parent.id !== value.organizationId
      )
        throw new RetirementCloudError("retirement_cloud_access_unverified");
      parents.set(item.folderId, item.containerId);
    }
    for (const id of value.projectIds) {
      const item = project.parse(await get(`/v2/projects/${id}`));
      if (
        item.projectId !== id ||
        item.lifecycleState !== "ACTIVE" ||
        !(
          item.parent.type === "FOLDER" &&
          parents.get(item.parent.id) === item.parent.containerId
        )
      )
        throw new RetirementCloudError("retirement_cloud_access_unverified");
    }
    return {
      organizationId: value.organizationId,
      projectIds: value.projectIds,
      folderIds: value.folderIds,
      checkedAt: new Date().toISOString(),
    };
  }
  async folderChildren(
    input: { organizationId: string; folderId: string; projectIds: string[] },
    raw: ServiceAccountKey,
  ) {
    const value = z
      .strictObject({
        organizationId: uuid,
        folderId: uuid,
        projectIds: z.array(uuid).max(2000),
      })
      .parse(input);
    const deadline = Date.now() + 60000,
      get = await this.authenticated(raw, deadline);
    const org = z
      .object({ organizationId: uuid, lifecycleState: z.literal("ACTIVE") })
      .parse(await get(`/v2/organizations/${value.organizationId}`));
    if (org.organizationId !== value.organizationId)
      throw new RetirementCloudError("retirement_cloud_access_unverified");
    const scope = folder.parse(await get(`/v2/folders/${value.folderId}`));
    if (
      scope.folderId !== value.folderId ||
      scope.parent.type !== "ORGANIZATION" ||
      scope.parent.id !== value.organizationId
    )
      throw new RetirementCloudError("retirement_cloud_access_unverified");
    const known = new Set(value.projectIds),
      seen = new Set<string>();
    const projects: { projectId: string; lifecycleState: string }[] = [];
    for (let offset = 0; offset < 10000; ) {
      const query = new URLSearchParams({
        containerParentId: scope.containerId,
        limit: "100",
        offset: String(offset),
      });
      const page = z
        .object({
          items: z.array(project).max(100),
          limit: z.number().int().positive().max(100),
          offset: z.number().int().nonnegative(),
        })
        .parse(await get(`/v2/projects?${query}`));
      if (page.offset !== offset || page.items.length > page.limit)
        throw new RetirementCloudError("retirement_cloud_inventory_incomplete");
      for (const child of page.items) {
        if (
          child.parent.id !== scope.folderId ||
          child.parent.containerId !== scope.containerId ||
          child.parent.type !== "FOLDER" ||
          seen.has(child.projectId)
        )
          throw new RetirementCloudError(
            "retirement_cloud_inventory_incomplete",
          );
        if (!known.has(child.projectId))
          throw new RetirementCloudError("retirement_foreign_child");
        seen.add(child.projectId);
        projects.push({
          projectId: child.projectId,
          lifecycleState: child.lifecycleState,
        });
      }
      if (page.items.length < page.limit)
        return {
          folderId: scope.folderId,
          projects,
          checkedAt: new Date().toISOString(),
          purgeConfirmed: false as const,
        };
      offset += page.items.length;
    }
    throw new RetirementCloudError("retirement_cloud_inventory_incomplete");
  }
}
