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
