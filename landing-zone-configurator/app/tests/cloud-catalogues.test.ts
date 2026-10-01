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
const options = {
  kubernetesVersions: [
    { version: "1.35.1", state: "SUPPORTED" },
    { version: "1.24.1", state: "DEPRECATED" },
  ],
  machineTypes: [{ name: "g3i.4" }],
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
    if (target.endsWith("/images?all=true"))
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
    { value: imageId, label: `Ubuntu 24.04 (${imageId})` },
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

it("maps all Observability scopes and bastion fields without confusing VM and Kubernetes catalogues", () => {
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
