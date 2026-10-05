import { generateKeyPairSync, randomUUID } from "node:crypto";
import Fastify from "fastify";
import { expect, it, vi } from "vitest";
import type { AuthServices } from "../apps/api/src/auth/routes.js";
import type { Session } from "../apps/api/src/auth/store.js";
import { registerCloudCatalogues } from "../apps/api/src/credentials/catalogue-routes.js";
import { StackitCatalogueClient } from "../apps/api/src/credentials/catalogues.js";
import { parseServiceAccountKey } from "../apps/api/src/credentials/key.js";
import { catalogueField } from "../apps/web/src/components/cloud-catalogue-fields.js";

it("loads project-scoped IAM role templates and permissions without transferring resource IDs", async () => {
  const request = vi.fn<typeof fetch>(async (url) => {
    const target = String(url);
    if (target.endsWith("/token"))
      return Response.json({
        access_token: "private-token",
        token_type: "Bearer",
      });
    if (target.endsWith(`/project/${input.projectId}/roles`))
      return Response.json({
        resourceId: input.projectId,
        resourceType: "project",
        roles: [
          {
            id: "reference-only",
            name: "viewer",
            description: "Read only",
            permissions: [{ name: "project.read" }],
          },
        ],
      });
    if (target.endsWith("/permissions?resourceType=project"))
      return Response.json({
        permissions: [{ name: "project.read", description: "Read project" }],
      });
    return new Response(null, { status: 403 });
  });
  const result = await new StackitCatalogueClient(request).load(input, key);
  expect(result.projectRoles?.options).toEqual([
    { value: "viewer", label: "viewer" },
  ]);
  expect(result.projectPermissions?.options).toEqual([
    { value: "project.read", label: "project.read" },
  ]);
  expect(result.projectRoleTemplates).toEqual([
    { name: "viewer", description: "Read only", permissions: ["project.read"] },
  ]);
  expect(JSON.stringify(result)).not.toContain("reference-only");
  expect(JSON.stringify(result)).not.toContain("private-token");
});

const key = parseServiceAccountKey({
  credentials: {
    kid: randomUUID(),
    iss: "catalogue@sa.stackit.cloud",
    sub: randomUUID(),
    aud: "https://service-account.api.stackit.cloud",
    privateKey: generateKeyPairSync("rsa", { modulusLength: 2048 })
      .privateKey.export({ format: "pem", type: "pkcs8" })
      .toString(),
  },
});
const input = {
  profileId: randomUUID(),
  projectId: randomUUID(),
  region: "eu02" as const,
};
it.each([randomUUID(), null])(
  "discovers an active reference project using the existing technical key with organisation scope %s",
  async (organizationId) => {
    const request = vi.fn<typeof fetch>(async (url, init) => {
      const target = String(url);
      expect(init?.redirect).toBe("error");
      if (target.endsWith("/token"))
        return Response.json({
          access_token: "private-token",
          token_type: "Bearer",
        });
      expect(init?.headers).toEqual({ Authorization: "Bearer private-token" });
      if (target.includes("resource-manager.api")) {
        expect(new URL(target).pathname).toBe("/v2/projects");
        expect(new URL(target).searchParams.get("containerParentId")).toBe(
          organizationId,
        );
        return Response.json({
          items: [
            { projectId: randomUUID(), lifecycleState: "DELETED" },
            { projectId: input.projectId, lifecycleState: "ACTIVE" },
          ],
        });
      }
      return new Response(null, { status: 403 });
    });
    const result = await new StackitCatalogueClient(request).automatic(
      "eu02",
      key,
      organizationId,
    );
    expect(result.projectId).toBe(input.projectId);
    expect(
      request.mock.calls.some(([url]) =>
        String(url).includes(`/projects/${input.projectId}/`),
      ),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain("private-token");
  },
);
it("discovers reference projects inside organisation folders without searching another organisation", async () => {
  const organizationId = randomUUID();
  const folderId = randomUUID();
  const parents: string[] = [];
  const request = vi.fn<typeof fetch>(async (url) => {
    const target = new URL(String(url));
    if (target.pathname.endsWith("/token"))
      return Response.json({
        access_token: "private-token",
        token_type: "Bearer",
      });
    if (target.hostname === "resource-manager.api.stackit.cloud") {
      const parent = target.searchParams.get("containerParentId");
      expect([organizationId, folderId]).toContain(parent);
      if (target.pathname === "/v2/folders")
        return Response.json({ items: [{ folderId }] });
      parents.push(parent ?? "");
      return Response.json({
        items:
          parent === folderId
            ? [{ projectId: input.projectId, lifecycleState: "ACTIVE" }]
            : [],
      });
    }
    return new Response(null, { status: 403 });
  });
  const result = await new StackitCatalogueClient(request).automatic(
    "eu01",
    key,
    organizationId,
  );
  expect(result.projectId).toBe(input.projectId);
  expect(parents).toEqual([organizationId, folderId]);
});

it("stops cyclic folder discovery and keeps regional catalogues independent", async () => {
  const organizationId = randomUUID();
  const folderId = randomUUID();
  const discovery: string[] = [];
  const request = vi.fn<typeof fetch>(async (url) => {
    const target = new URL(String(url));
    if (target.pathname.endsWith("/token"))
      return Response.json({
        access_token: "private-token",
        token_type: "Bearer",
      });
    if (target.hostname === "resource-manager.api.stackit.cloud") {
      const parent = target.searchParams.get("containerParentId");
      expect([organizationId, folderId]).toContain(parent);
      discovery.push(target.pathname);
      return Response.json({
        items:
          target.pathname === "/v2/projects"
            ? []
            : [
                {
                  folderId:
                    parent === organizationId ? folderId : organizationId,
                },
              ],
      });
    }
    if (target.hostname === "ske.api.stackit.cloud")
      return Response.json(options);
    return new Response(null, { status: 403 });
  });
  const result = await new StackitCatalogueClient(request).automatic(
    "eu01",
    key,
    organizationId,
  );
  expect(result.projectId).toBeNull();
  expect(result.kubernetesVersions.status).toBe("available");
  expect(discovery).toHaveLength(4);
});

it("loads regional catalogues without inventing a reference project when discovery is denied", async () => {
  const request = vi.fn<typeof fetch>(async (url) => {
    if (String(url).endsWith("/token"))
      return Response.json({
        access_token: "private-token",
        token_type: "Bearer",
      });
    if (String(url).includes("ske.api")) return Response.json(options);
    return new Response(null, { status: 403 });
  });
  const result = await new StackitCatalogueClient(request).automatic(
    "eu02",
    key,
    randomUUID(),
  );
  expect(result.projectId).toBeNull();
  expect(result.kubernetesVersions.status).toBe("available");
  expect(result.gitFlavors.status).toBe("unavailable");
  expect(
    request.mock.calls.some(([url]) => String(url).includes("/projects/null")),
  ).toBe(false);
});
const options = {
  kubernetesVersions: [
    { version: "1.35.1", state: "SUPPORTED" },
    { version: "1.24.1", state: "DEPRECATED" },
  ],
  machineTypes: [{ name: "g3i.4" }],
  machineImages: [
    { name: "flatcar", versions: [{ state: "SUPPORTED" }] },
    { name: "retired", versions: [{ state: "DEPRECATED" }] },
    { name: "empty", versions: [] },
  ],
  availabilityZones: [{ name: "eu02-1" }],
  volumeTypes: [{ name: "storage_premium_perf1" }],
};
it("loads fixed product endpoints and excludes unavailable Git/SKE choices without leaking tokens", async () => {
  const request = vi.fn<typeof fetch>(async (url, init) => {
    expect(init?.redirect).toBe("error");
    if (String(url).endsWith("/token"))
      return Response.json({
        access_token: "private-token",
        token_type: "Bearer",
      });
    expect(init?.headers).toEqual({ Authorization: "Bearer private-token" });
    if (String(url).includes("git.api"))
      return Response.json({
        flavors: [
          { id: "git-10", display_name: "Git 10", availability: "available" },
          { id: "git-old", display_name: "Old", availability: "deprecated" },
        ],
      });
    if (String(url).includes("vpn.api"))
      return Response.json({ plans: [{ planId: "p100", name: "VPN 100" }] });
    return Response.json(options);
  });
  const result = await new StackitCatalogueClient(request).load(input, key);
  expect(result.gitFlavors.options).toEqual([
    { value: "git-10", label: "Git 10" },
  ]);
  expect(result.kubernetesVersions.options).toEqual([
    { value: "1.35.1", label: "1.35.1" },
  ]);
  expect(result.availabilityZones.options[0]?.value).toBe("eu02-1");
  expect(result.machineImages?.options).toEqual([
    { value: "flatcar", label: "flatcar" },
  ]);
  expect(
    catalogueField("platform_kubernetes[*].cluster.node_pools[*].os_name"),
  ).toBe("machineImages");
  expect(
    catalogueField("platform_kubernetes[*].debug_bastion.os_name"),
  ).toBeNull();
  expect(result.observabilityPlans?.status).toBe("unavailable");
  expect(
    request.mock.calls.some((call) => String(call[0]).includes("argus.api")),
  ).toBe(false);
  expect(request.mock.calls.map((call) => call[0])).toContain(
    `https://git.api.stackit.cloud/v1beta/projects/${input.projectId}/flavors`,
  );
  expect(request.mock.calls.map((call) => call[0])).toContain(
    "https://ske.api.stackit.cloud/v2/regions/eu02/provider-options?versionState=SUPPORTED",
  );
  expect(JSON.stringify(result)).not.toContain("private-token");
  expect(JSON.stringify(result)).not.toContain("PRIVATE KEY");
});
it("keeps independent catalogues available when another service is denied or malformed", async () => {
  const request = vi.fn<typeof fetch>(async (url) => {
    if (String(url).endsWith("/token"))
      return Response.json({ access_token: "token", token_type: "Bearer" });
    if (String(url).includes("git.api"))
      return new Response(null, { status: 403 });
    if (String(url).includes("vpn.api"))
      return Response.json({ plans: [{ secret: "must-not-leak" }] });
    return Response.json(options);
  });
  const result = await new StackitCatalogueClient(request).load(input, key);
  expect(result.gitFlavors).toEqual({ status: "unavailable", options: [] });
  expect(result.vpnPlans.status).toBe("unavailable");
  expect(result.machineTypes.status).toBe("available");
  expect(JSON.stringify(result)).not.toContain("must-not-leak");
});
it("rejects arbitrary destinations and oversized upstream responses", async () => {
  const request = vi.fn<typeof fetch>();
  const client = new StackitCatalogueClient(request);
  await expect(
    client.load({ ...input, region: "eu01/../../evil" as "eu02" }, key),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
  request.mockResolvedValue(new Response("x".repeat(2_000_001)));
  await expect(client.load(input, key)).rejects.toThrow("catalogue_too_large");
});
it("never offers SKE zones as VPN zones or SKE machine types for unrelated products", () => {
  expect(
    catalogueField("connectivity.vpn.availability_zones.tunnel1"),
  ).toBeNull();
  expect(
    catalogueField(
      "platform_kubernetes[*].cluster.node_pools[*].availability_zones[*]",
    ),
  ).toBe("availabilityZones");
  expect(
    catalogueField("platform_kubernetes[*].cluster.node_pools[*].machine_type"),
  ).toBe("machineTypes");
  expect(catalogueField("platform_kubernetes[*].git.machine_type")).toBeNull();
});
it("requires authentication and CSRF and rejects malformed input before provider access", async () => {
  const app = Fastify();
  const session: Session = {
    id: randomUUID(),
    userId: randomUUID(),
    tenantId: randomUUID(),
    githubId: "1",
    login: "alice",
    csrfToken: "c".repeat(43),
    expiresAt: new Date(Date.now() + 60000),
  };
  const auth = {
    origin: "https://configurator.example",
    store: { resolveSession: vi.fn().mockResolvedValue(session) },
  } as unknown as AuthServices;
  const load = vi.fn().mockResolvedValue({ region: "eu02" });
  registerCloudCatalogues(app, auth, { load });
  const automatic = vi
    .fn()
    .mockResolvedValue({ region: "eu02", projectId: null });
  const automaticApp = Fastify();
  registerCloudCatalogues(automaticApp, auth, { load, automatic });
  const headers = {
    origin: auth.origin,
    cookie: `__Host-lzc-session=${"s".repeat(43)}`,
    "x-lzc-csrf": session.csrfToken,
    "x-lzc-tenant": session.tenantId,
  };
  expect(
    (
      await automaticApp.inject({
        method: "POST",
        url: "/api/v1/cloud-catalogues/automatic",
        headers: { ...headers, "x-lzc-tenant": randomUUID() },
        payload: { region: "eu02" },
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (
      await automaticApp.inject({
        method: "POST",
        url: "/api/v1/cloud-catalogues/automatic",
        headers,
        payload: {
          region: "eu02",
          profileId: input.profileId,
          projectId: input.projectId,
        },
      })
    ).statusCode,
  ).toBe(400);
  expect(automatic).not.toHaveBeenCalled();
  expect(
    (
      await automaticApp.inject({
        method: "POST",
        url: "/api/v1/cloud-catalogues/automatic",
        headers,
        payload: { region: "eu02" },
      })
    ).statusCode,
  ).toBe(200);
  expect(automatic).toHaveBeenCalledWith(session, "eu02");
  await automaticApp.close();
  try {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/cloud-catalogues",
          payload: input,
        })
      ).statusCode,
    ).toBe(401);
    const headers = {
      cookie: `__Host-lzc-session=${"s".repeat(43)}`,
      origin: auth.origin,
      "x-lzc-csrf": session.csrfToken,
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/cloud-catalogues",
          headers: { ...headers, origin: "https://evil.example" },
          payload: input,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/cloud-catalogues",
          headers,
          payload: { ...input, endpoint: "https://evil.example" },
        })
      ).statusCode,
    ).toBe(400);
    expect(load).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/cloud-catalogues",
          headers,
          payload: input,
        })
      ).statusCode,
    ).toBe(200);
    expect(load).toHaveBeenCalledWith(session, input);
  } finally {
    await app.close();
  }
});

it("loads distinct IaaS bastion options and Observability plan names without suggesting private or inactive images", async () => {
  const imageId = "44444444-4444-4444-8444-444444444444";
  const request = vi.fn<typeof fetch>(async (url) => {
    const target = String(url);
    if (target.endsWith("/token"))
      return Response.json({ access_token: "token", token_type: "Bearer" });
    if (target.includes("argus.api"))
      return Response.json({
        plans: [
          { planId: "not-the-tf-input", name: "Observability-Starter-EU01" },
        ],
      });
    if (target.endsWith("/machine-types"))
      return Response.json({ items: [{ name: "g2i.1" }] });
    if (target.endsWith("/availability-zones"))
      return Response.json({ items: ["eu01-1", "eu01-2"] });
    if (target.endsWith("/images"))
      return Response.json({
        items: [
          {
            id: imageId,
            name: "Ubuntu 24.04",
            status: "AVAILABLE",
            scope: "public",
          },
          {
            id: randomUUID(),
            name: "Private",
            status: "AVAILABLE",
            scope: "local",
          },
          {
            id: randomUUID(),
            name: "Unavailable",
            status: "DEACTIVATED",
            scope: "public",
          },
        ],
      });
    return new Response(null, { status: 403 });
  });
  const result = await new StackitCatalogueClient(request).load(
    { ...input, region: "eu01" },
    key,
  );
  expect(result.observabilityPlans?.options).toEqual([
    {
      value: "Observability-Starter-EU01",
      label: "Observability-Starter-EU01",
    },
  ]);
  expect(result.bastionMachineTypes?.options[0]?.value).toBe("g2i.1");
  expect(result.bastionImages?.options).toEqual([
    { value: imageId, label: "Ubuntu 24.04" },
  ]);
  expect(result.bastionAvailabilityZones?.options.map((v) => v.value)).toEqual([
    "eu01-1",
    "eu01-2",
  ]);
  expect(result.machineTypes.status).toBe("unavailable");
  expect(request.mock.calls.map((call) => call[0])).toContain(
    `https://iaas.api.stackit.cloud/v2/projects/${input.projectId}/regions/eu01/machine-types`,
  );
});

it("maps firewall appliances to IaaS catalogues without borrowing VPN or SKE zones", () => {
  for (const root of ["connectivity", "connectivity_regions[*]"]) {
    for (const appliance of ["firewall", "firewalls[*]"]) {
      const prefix = `${root}.${appliance}`;
      expect(catalogueField(`${prefix}.flavor`)).toBe("bastionMachineTypes");
      expect(catalogueField(`${prefix}.zone`)).toBe("bastionAvailabilityZones");
      expect(catalogueField(`${prefix}.ha.backup_zone`)).toBe(
        "bastionAvailabilityZones",
      );
    }
    expect(catalogueField(`${root}.vpn.availability_zones.tunnel1`)).toBeNull();
    expect(catalogueField(`${root}.dns_zones[*].type`)).toBeNull();
  }
});

it("maps all Observability scopes and bastion fields without confusing VM and Kubernetes catalogues", () => {
  for (const prefix of [
    "project-template-settings.ske.cluster",
    "landing_zones[*].ske.cluster",
    "sandbox_projects[*].ske.cluster",
  ]) {
    expect(catalogueField(`${prefix}.kubernetes_version_min`)).toBe(
      "kubernetesVersions",
    );
    expect(catalogueField(`${prefix}.node_pools[*].machine_type`)).toBe(
      "machineTypes",
    );
    expect(
      catalogueField(`${prefix}.node_pools[*].availability_zones[*]`),
    ).toBe("availabilityZones");
    expect(catalogueField(`${prefix}.node_pools[*].volume_type`)).toBe(
      "volumeTypes",
    );
  }
  for (const path of [
    "observability.plan_name",
    "platform_kubernetes[*].observability.plan_name",
    "landing_zones[*].observability.plan_name",
    "sandbox_projects[*].observability.plan_name",
  ])
    expect(catalogueField(path)).toBe("observabilityPlans");
  expect(
    catalogueField("platform_kubernetes[*].debug_bastion.machine_type"),
  ).toBe("bastionMachineTypes");
  expect(catalogueField("platform_kubernetes[*].debug_bastion.image_id")).toBe(
    "bastionImages",
  );
  expect(
    catalogueField("platform_kubernetes[*].debug_bastion.availability_zone"),
  ).toBe("bastionAvailabilityZones");
  expect(
    catalogueField("platform_kubernetes[*].cluster.node_pools[*].machine_type"),
  ).toBe("machineTypes");
});
