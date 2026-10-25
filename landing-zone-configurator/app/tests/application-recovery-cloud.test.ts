import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { StackitRecoveryCloud } from "../apps/api/src/applications/recovery-cloud.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const ownerEmail = "owner@example.com";
const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();
const key = {
  credentials: {
    kid: "key",
    iss: "operator@sa.stackit.cloud",
    sub: projectId,
    aud: "https://accounts.stackit.cloud" as const,
    privateKey,
  },
};
function fixture(
  change?: (url: string, value: Record<string, unknown>) => void,
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const request = async (raw: string | URL | Request, init?: RequestInit) => {
    const url = String(raw);
    calls.push({ url, init: init ?? {} });
    let value: Record<string, unknown>;
    if (url.endsWith("/token"))
      value = { access_token: "secret-token", token_type: "Bearer" };
    else if (url.endsWith(`/v2/projects/${projectId}`))
      value = {
        projectId,
        containerId: "container",
        name: "test",
        lifecycleState: "ACTIVE",
        parent: { containerId: "folder" },
        labels: {},
      };
    else if (url.includes("/routing-tables")) value = { items: [] };
    else if (url.endsWith("/roles"))
      value = { resourceId: projectId, resourceType: "project", roles: [] };
    else if (url.includes("/access-keys?"))
      value = { project: projectId, accessKeys: [] };
    else if (url.endsWith("/networks")) value = { items: [] };
    else if (url.endsWith("/service-accounts"))
      value = {
        items: [
          { email: "account@sa.stackit.cloud", internal: false, projectId },
          { email: "internal@sa.stackit.cloud", internal: true, projectId },
        ],
      };
    else if (url.endsWith("/members"))
      value = {
        resourceId: projectId,
        resourceType: "project",
        members: [{ role: "owner", subject: ownerEmail }],
      };
    else if (url.endsWith("/buckets"))
      value = { project: projectId, buckets: [] };
    else if (url.endsWith("/credentials-groups"))
      value = {
        project: projectId,
        credentialsGroups: [
          {
            credentialsGroupId: "default-id",
            displayName: "default",
            urn: "urn:default",
          },
        ],
      };
    else if (url.includes("secrets-manager")) value = { instances: [] };
    else if (url.includes("argus")) value = { instances: [], message: "ok" };
    else if (url.endsWith("/keys")) value = { items: [{ id: "existing-key" }] };
    else throw new Error("Unexpected endpoint");
    change?.(url, value);
    return Response.json(value);
  };
  return { calls, cloud: new StackitRecoveryCloud(request as typeof fetch) };
}
describe("server-side STACKIT recovery inventory", () => {
  it("reads fixed endpoints with the stored key and requests only key metadata", async () => {
    const { cloud, calls } = fixture();
    const value = await cloud.read(
      { projectId, region: "eu01", ownerEmail },
      key,
    );
    expect(value.complete).toBe(true);
    expect(value.serviceAccounts[0]?.keyIds).toEqual(["existing-key"]);
    expect(value.credentialsGroups[0]?.platformDefault).toBe(true);
    expect(calls.filter((c) => c.init.method !== "GET")).toHaveLength(1);
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls.every((c) => c.init.redirect === "error")).toBe(true);
    expect(calls.filter((c) => c.url.endsWith("/keys"))).toHaveLength(1);
    expect(JSON.stringify(value)).not.toContain("secret-token");
    expect(JSON.stringify(value)).not.toContain(privateKey);
  });
  it.each(["nextPageToken", "nextCursor", "pagination", "total"])(
    "blocks unknown pagination envelope %s",
    async (field) => {
      const { cloud } = fixture((url, body) => {
        if (url.endsWith("/networks")) body[field] = "another-page";
      });
      await expect(
        cloud.read({ projectId, region: "eu01", ownerEmail }, key),
      ).rejects.toThrow();
    },
  );
  it("never interprets missing arrays or inaccessible APIs as an empty cloud", async () => {
    const { cloud } = fixture((url, body) => {
      if (url.endsWith("/buckets")) delete body.buckets;
    });
    await expect(
      cloud.read({ projectId, region: "eu01", ownerEmail }, key),
    ).rejects.toThrow();
    const failed = new StackitRecoveryCloud(
      async () => new Response("private error", { status: 403 }),
    );
    await expect(
      failed.read({ projectId, region: "eu01", ownerEmail }, key),
    ).rejects.toThrow("cloud-inventory-incomplete");
  });
  it("requires the expected project and verified owner membership", async () => {
    for (const mode of ["project", "member"]) {
      const { cloud } = fixture((url, body) => {
        if (mode === "project" && url.endsWith(`/v2/projects/${projectId}`))
          body.projectId = "22222222-2222-4222-8222-222222222222";
        if (mode === "member" && url.endsWith("/members")) body.members = [];
      });
      await expect(
        cloud.read({ projectId, region: "eu01", ownerEmail }, key),
      ).rejects.toThrow("cloud-project-mismatch");
    }
  });
  it("rejects attacker endpoints in stored key metadata before any request", async () => {
    const { cloud, calls } = fixture();
    await expect(
      cloud.read({ projectId, region: "eu01", ownerEmail }, {
        ...key,
        credentials: {
          ...key.credentials,
          tokenEndpoint: "https://attacker.example/token",
        },
      } as never),
    ).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});

it("preserves the literal @ required by STACKIT key-list authorization", async () => {
  const f = fixture();
  await f.cloud.read({ projectId, region: "eu01", ownerEmail }, key);
  const requests = f.calls.filter((c) => c.url.endsWith("/keys"));
  expect(requests).toHaveLength(1);
  expect(requests[0]?.url).toContain(
    "/service-accounts/account@sa.stackit.cloud/keys",
  );
  expect(requests[0]?.url).not.toContain("%40");
});

it("collects named service instances, SNA routing, custom roles and Application-group credential metadata", async () => {
  const tableId = "22222222-2222-4222-8222-222222222222",
    instanceId = "33333333-3333-4333-8333-333333333333";
  const f = fixture((url, value) => {
    if (url.endsWith("/credentials-groups"))
      value.credentialsGroups = [
        {
          credentialsGroupId: "app-group",
          displayName: "application",
          urn: "urn:application",
        },
      ];
    if (url.includes("/access-keys?"))
      value.accessKeys = [{ keyId: "lost-storage-key" }];
    if (url.includes("secrets-manager"))
      value.instances = [{ id: "secrets", name: "application-default" }];
    if (url.includes("argus"))
      value.instances = [
        { id: "observability", name: "application", planName: "small" },
      ];
    if (url.endsWith("/roles"))
      value.roles = [
        {
          id: "reader",
          name: "application-reader",
          description: "Reader",
          permissions: [{ name: "iaas.network.get" }],
        },
      ];
    if (url.endsWith("/routing-tables"))
      value.items = [
        {
          id: tableId,
          name: `app-${instanceId}`,
          labels: {
            application_instance: instanceId,
            lzc_instance: instanceId,
          },
          systemRoutes: false,
        },
      ];
    if (url.endsWith("/routes"))
      value.items = [
        {
          id: projectId,
          labels: {
            application_instance: instanceId,
            lzc_instance: instanceId,
          },
          destination: { type: "cidrv4", value: "0.0.0.0/0" },
          nexthop: { type: "ipv4", value: "10.0.0.7" },
        },
      ];
  });
  const result = await f.cloud.read(
    {
      projectId,
      ownerEmail,
      region: "eu01",
      customRoles: true,
      routing: {
        organizationId: projectId,
        networkAreaId: tableId,
        instanceId,
      },
    },
    key,
  );
  expect(result.credentialsGroups[0]?.accessKeyIds).toEqual([
    "lost-storage-key",
  ]);
  expect(result.secretsManagers[0]?.name).toBe("application-default");
  expect(result.observability[0]?.planName).toBe("small");
  expect(result.customRoles[0]?.permissions).toEqual(["iaas.network.get"]);
  expect(result.routingTables[0]?.routes[0]?.nextHop).toEqual({
    type: "ipv4",
    value: "10.0.0.7",
  });
  expect(
    f.calls.every((c) => c.init.method === "GET" || c.url.endsWith("/token")),
  ).toBe(true);
});
it.each(["service-account-key", "objectstorage-credential"] as const)(
  "revokes only the fixed reviewed %s endpoint once with no retries",
  async (kind) => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const cloud = new StackitRecoveryCloud((async (
      url: unknown,
      init?: RequestInit,
    ) => {
      calls.push({ url: String(url), init });
      return String(url).endsWith("/token")
        ? Response.json({ access_token: "token", token_type: "Bearer" })
        : new Response(null, { status: 204 });
    }) as typeof fetch);
    await cloud.revoke(
      {
        kind,
        address: "module.application.credential",
        discardIncompleteState: false,
        projectId,
        region: "eu01",
        keyId: "key/with+separator==",
        ...(kind === "service-account-key"
          ? { accountEmail: "automation@sa.stackit.cloud" }
          : { groupId: "application-group" }),
      },
      key,
    );
    expect(calls).toHaveLength(2);
    expect(calls[1]?.init?.method).toBe("DELETE");
    expect(calls[1]?.url).toContain("key%2Fwith+separator==");
    expect(calls[1]?.init?.redirect).toBe("error");
    if (kind === "service-account-key")
      expect(calls[1]?.url).toContain("automation@sa.stackit.cloud");
    else expect(calls[1]?.url).toContain("credentials-group=application-group");
  },
);

it("discovers a project only after complete, bounded pagination of the exact folder", async () => {
  const id = "22222222-2222-4222-8222-222222222222",
    calls: string[] = [];
  const cloud = new StackitRecoveryCloud((async (url: unknown) => {
    const target = String(url);
    calls.push(target);
    if (target.endsWith("/token"))
      return Response.json({ access_token: "token", token_type: "Bearer" });
    const query = new URL(target);
    expect(query.searchParams.get("containerParentId")).toBe("bound-folder");
    const offset = Number(query.searchParams.get("offset"));
    return Response.json({
      offset,
      limit: 100,
      items:
        offset === 0
          ? Array.from({ length: 100 }, (_, i) => ({
              projectId: `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111`,
              labels: {},
              parent: { containerId: "bound-folder" },
            }))
          : [
              {
                projectId,
                labels: { application_instance: id, lzc_instance: id },
                parent: { containerId: "bound-folder" },
              },
            ],
    });
  }) as typeof fetch);
  expect(
    await cloud.findProject({ folderId: "bound-folder", instanceId: id }, key),
  ).toBe(projectId);
  expect(calls).toHaveLength(3);
});
