import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { StackitRetirementCloud } from "../packages/contracts/src/recovery/retirement-cloud.js";
import { parseServiceAccountKey } from "../packages/contracts/src/recovery/service-account.js";

const org = "11111111-1111-4111-8111-111111111111",
  control = "22222222-2222-4222-8222-222222222222",
  target = "33333333-3333-4333-8333-333333333333",
  folder = "44444444-4444-4444-8444-444444444444",
  subject = "55555555-5555-4555-8555-555555555555";
const key = parseServiceAccountKey({
  credentials: {
    kid: "fixture-key",
    iss: "retirement-fixture@sa.stackit.cloud",
    sub: subject,
    aud: "https://accounts.stackit.cloud",
    privateKey: generateKeyPairSync("rsa", { modulusLength: 2048 })
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString(),
  },
});
const orgParent = {
  id: org,
  containerId: "organization-fixture",
  type: "ORGANIZATION",
};
const folderParent = {
  id: folder,
  containerId: "folder-fixture",
  type: "FOLDER",
};
const project = (
  id: string,
  parent = orgParent,
  lifecycleState = "ACTIVE",
) => ({ projectId: id, containerId: `project-${id}`, parent, lifecycleState });
const input = {
  organizationId: org,
  cleanupProjectId: control,
  controlProjectIds: [control],
  targetProjectIds: [target],
  targetFolderIds: [folder],
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
function fixture(
  override: (url: URL) => Response | undefined = () => undefined,
  accessToken = "TOKEN_FIXTURE",
) {
  const calls: { url: string; method: string }[] = [];
  const request: typeof fetch = async (address, init) => {
    const url = new URL(String(address));
    calls.push({ url: url.toString(), method: init?.method ?? "GET" });
    expect(init?.redirect).toBe("error");
    if (url.hostname === "accounts.stackit.cloud")
      return json({ access_token: accessToken, token_type: "Bearer" });
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Bearer ${accessToken}`,
    );
    const replaced = override(url);
    if (replaced) return replaced;
    if (url.pathname === `/v2/organizations/${org}`)
      return json({ organizationId: org, lifecycleState: "ACTIVE" });
    if (url.pathname === `/v2/projects/${control}`)
      return json(project(control));
    if (url.pathname === `/v2/projects/${control}/service-accounts`)
      return json({
        items: [
          { id: subject, email: key.credentials.iss, projectId: control },
        ],
      });
    if (url.pathname === `/v2/folders/${folder}`)
      return json({
        folderId: folder,
        containerId: "folder-fixture",
        parent: orgParent,
      });
    if (url.pathname === "/v2/projects")
      return json({ items: [], offset: 0, limit: 100 });
    throw new Error("Unexpected fixture request");
  };
  return { cloud: new StackitRetirementCloud(request), calls };
}
describe("retirement read-only STACKIT observations", () => {
  it("resolves existing profiles from a token project hint only after independent API verification", async () => {
    const token = `e30.${Buffer.from(JSON.stringify({ "stackit/project/project.id": control })).toString("base64url")}.signature`;
    const { cloud, calls } = fixture(() => undefined, token);
    expect(
      (await cloud.homeProject({ organizationId: org }, key)).projectId,
    ).toBe(control);
    expect(calls.some((c) => new URL(c.url).pathname === "/v2/projects")).toBe(
      false,
    );
    expect(
      calls.some(
        (c) =>
          new URL(c.url).pathname ===
          `/v2/projects/${control}/service-accounts`,
      ),
    ).toBe(true);
  });
  it("does not treat a token project claim as proof of account ownership", async () => {
    const token = `e30.${Buffer.from(JSON.stringify({ "stackit/project/project.id": target })).toString("base64url")}.signature`;
    const { cloud } = fixture(
      (url) =>
        url.pathname === `/v2/projects/${target}/service-accounts`
          ? json({ items: [] })
          : url.pathname === "/v2/projects"
            ? json({ items: [project(control)], offset: 0, limit: 100 })
            : undefined,
      token,
    );
    expect(
      (await cloud.homeProject({ organizationId: org }, key)).projectId,
    ).toBe(control);
  });
  it("verifies the project hint retained in an uploaded key instead of trusting it", async () => {
    const hinted = parseServiceAccountKey({ ...key, projectId: control });
    expect(hinted.projectId).toBe(control);
    const { cloud, calls } = fixture();
    expect(await cloud.homeProject({ organizationId: org }, hinted)).toEqual({
      projectId: control,
      name: control,
    });
    expect(calls.some((c) => new URL(c.url).pathname === "/v2/projects")).toBe(
      false,
    );
    expect(
      calls.some(
        (c) =>
          new URL(c.url).pathname ===
          `/v2/projects/${control}/service-accounts`,
      ),
    ).toBe(true);
  });
  it("discovers legacy profiles by their actual account identity and tolerates an unreadable unrelated project", async () => {
    const { cloud, calls } = fixture((url) => {
      if (url.pathname === "/v2/projects") {
        expect(url.searchParams.get("member")).toBe(key.credentials.iss);
        return json({
          items: [project(target), project(control)],
          limit: 100,
          offset: 0,
        });
      }
      if (url.pathname === `/v2/projects/${target}/service-accounts`)
        return json({}, 403);
      if (url.pathname === `/v2/projects/${control}`)
        return json({ ...project(control), name: "Customer bootstrap" });
      return undefined;
    });
    expect(await cloud.homeProject({ organizationId: org }, key)).toEqual({
      projectId: control,
      name: "Customer bootstrap",
    });
    expect(calls.every((c) => ["GET", "POST"].includes(c.method))).toBe(true);
  });
  it("does not use an unrelated project ID from the key as authority", async () => {
    const { cloud } = fixture((url) =>
      url.pathname === `/v2/projects/${target}/service-accounts`
        ? json({ items: [] })
        : url.pathname === "/v2/projects"
          ? json({ items: [project(control)], limit: 100, offset: 0 })
          : undefined,
    );
    expect(
      (
        await cloud.homeProject(
          { organizationId: org },
          parseServiceAccountKey({ ...key, projectId: target }),
        )
      ).projectId,
    ).toBe(control);
  });
  it("rejects contradictory owning-project observations", async () => {
    const { cloud } = fixture((url) =>
      url.pathname === "/v2/projects"
        ? json({
            items: [project(control), project(target)],
            limit: 100,
            offset: 0,
          })
        : url.pathname === `/v2/projects/${target}/service-accounts`
          ? json({
              items: [
                { id: subject, email: key.credentials.iss, projectId: target },
              ],
            })
          : undefined,
    );
    await expect(
      cloud.homeProject({ organizationId: org }, key),
    ).rejects.toMatchObject({ code: "retirement_cleanup_identity_unverified" });
  });
  it("requires both subject and email to match and fails on an incomplete project inventory", async () => {
    const mismatch = fixture((url) =>
      url.pathname === `/v2/projects/${control}/service-accounts`
        ? json({
            items: [
              { id: target, email: key.credentials.iss, projectId: control },
            ],
          })
        : undefined,
    );
    await expect(
      mismatch.cloud.homeProject(
        { organizationId: org },
        parseServiceAccountKey({ ...key, projectId: control }),
      ),
    ).rejects.toMatchObject({ code: "retirement_cleanup_identity_unverified" });
    const repeated = fixture((url) =>
      url.pathname === "/v2/projects"
        ? json({ items: [project(target)], limit: 1, offset: 0 })
        : url.pathname === `/v2/projects/${target}/service-accounts`
          ? json({ items: [] })
          : undefined,
    );
    await expect(
      repeated.cloud.homeProject({ organizationId: org }, key),
    ).rejects.toMatchObject({ code: "retirement_cloud_inventory_incomplete" });
  });
  it("checks the complete ancestry of the discovered home and rejects a target ancestor", async () => {
    const outer = "66666666-6666-4666-8666-666666666666",
      inner = "77777777-7777-4777-8777-777777777777";
    const { cloud } = fixture((url) => {
      if (url.pathname === `/v2/projects/${control}`)
        return json(
          project(control, { type: "FOLDER", id: inner, containerId: "inner" }),
        );
      if (url.pathname === `/v2/folders/${inner}`)
        return json({
          folderId: inner,
          containerId: "inner",
          parent: { type: "FOLDER", id: outer, containerId: "outer" },
        });
      if (url.pathname === `/v2/folders/${outer}`)
        return json({
          folderId: outer,
          containerId: "outer",
          parent: orgParent,
        });
      return undefined;
    });
    const hinted = parseServiceAccountKey({ ...key, projectId: control });
    expect(
      (await cloud.homeProject({ organizationId: org }, hinted)).projectId,
    ).toBe(control);
    await expect(cloud.control(input, key)).resolves.toMatchObject({
      cleanupProjectId: control,
    });
    await expect(
      cloud.control({ ...input, targetFolderIds: [outer] }, key),
    ).rejects.toMatchObject({ code: "retirement_control_inside_target" });
  });
  it("does not require customer credentials to read the operator's separate SaaS projects", async () => {
    const operator = "66666666-6666-4666-8666-666666666666";
    const { cloud, calls } = fixture((url) =>
      url.pathname === `/v2/projects/${operator}`
        ? json({ message: "Operator project is private" }, 403)
        : undefined,
    );
    const witness = await cloud.control(
      { ...input, controlProjectIds: [operator] },
      key,
    );
    expect(witness.controlProjectIds).toEqual([control, operator]);
    expect(witness.controlProjectProof).toBe("operator-deployment-binding");
    expect(
      calls.some(
        (call) => new URL(call.url).pathname === `/v2/projects/${operator}`,
      ),
    ).toBe(false);
    await expect(
      cloud.control(
        {
          ...input,
          controlProjectIds: [operator],
          targetProjectIds: [operator],
        },
        key,
      ),
    ).rejects.toMatchObject({ code: "retirement_control_inside_target" });
  });

  it("verifies the actual cleanup account and independently surviving control project", async () => {
    const { cloud, calls } = fixture();
    const witness = await cloud.control(input, key);
    expect(witness.cleanupSubject).toBe(subject);
    expect(witness.controlProjectIds).toEqual([control]);
    expect(
      calls
        .filter((call) => call.method !== "GET")
        .map((call) => new URL(call.url).hostname),
    ).toEqual(["accounts.stackit.cloud"]);
  });
  it("refuses a control project selected for deletion without sending any cloud request", async () => {
    const { cloud, calls } = fixture();
    await expect(
      cloud.control({ ...input, targetProjectIds: [control] }, key),
    ).rejects.toMatchObject({ code: "retirement_control_inside_target" });
    expect(calls).toEqual([]);
  });
  it("refuses control infrastructure nested in a target folder", async () => {
    const { cloud } = fixture((url) =>
      url.pathname === `/v2/projects/${control}`
        ? json(project(control, folderParent))
        : undefined,
    );
    await expect(cloud.control(input, key)).rejects.toMatchObject({
      code: "retirement_control_inside_target",
    });
  });
  it("does not accept a different service-account ID or home project", async () => {
    const { cloud } = fixture((url) =>
      url.pathname.endsWith("/service-accounts")
        ? json({
            items: [
              { id: target, email: key.credentials.iss, projectId: control },
            ],
          })
        : undefined,
    );
    await expect(cloud.control(input, key)).rejects.toMatchObject({
      code: "retirement_cleanup_identity_unverified",
    });
  });
  it.each([403, 404])(
    "does not report project purge on HTTP %i",
    async (status) => {
      const { cloud } = fixture((url) =>
        url.pathname.startsWith("/v2/folders/")
          ? json({ private: "HIDDEN_SENTINEL" }, status)
          : undefined,
      );
      await expect(
        cloud.folderChildren(
          { organizationId: org, folderId: folder, projectIds: [target] },
          key,
        ),
      ).rejects.toMatchObject({ code: "retirement_cloud_access_unverified" });
    },
  );
  it("reports an empty visible child list as an observation, never as confirmed purge", async () => {
    const { cloud } = fixture();
    expect(
      await cloud.folderChildren(
        { organizationId: org, folderId: folder, projectIds: [target] },
        key,
      ),
    ).toMatchObject({ projects: [], purgeConfirmed: false });
  });
  it("fully paginates and keeps a DELETING project visible", async () => {
    const { cloud, calls } = fixture((url) =>
      url.pathname === "/v2/projects"
        ? json({
            items:
              url.searchParams.get("offset") === "0"
                ? [project(target, folderParent, "DELETING")]
                : [],
            limit: 1,
            offset: Number(url.searchParams.get("offset")),
          })
        : undefined,
    );
    expect(
      await cloud.folderChildren(
        { organizationId: org, folderId: folder, projectIds: [target] },
        key,
      ),
    ).toMatchObject({
      projects: [{ projectId: target, lifecycleState: "DELETING" }],
      purgeConfirmed: false,
    });
    expect(
      calls.filter((call) => new URL(call.url).pathname === "/v2/projects"),
    ).toHaveLength(2);
  });
  it("blocks an unmanaged child rather than combining Landing Zones", async () => {
    const { cloud } = fixture((url) =>
      url.pathname === "/v2/projects"
        ? json({
            items: [project(control, folderParent)],
            limit: 100,
            offset: 0,
          })
        : undefined,
    );
    await expect(
      cloud.folderChildren(
        { organizationId: org, folderId: folder, projectIds: [target] },
        key,
      ),
    ).rejects.toMatchObject({ code: "retirement_foreign_child" });
  });
  it("refuses repeated pagination instead of accepting a partial list", async () => {
    const { cloud } = fixture((url) =>
      url.pathname === "/v2/projects"
        ? json({ items: [project(target, folderParent)], limit: 1, offset: 0 })
        : undefined,
    );
    await expect(
      cloud.folderChildren(
        { organizationId: org, folderId: folder, projectIds: [target] },
        key,
      ),
    ).rejects.toMatchObject({ code: "retirement_cloud_inventory_incomplete" });
  });
});
