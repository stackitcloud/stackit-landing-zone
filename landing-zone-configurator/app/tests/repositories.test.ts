import { createHash } from "node:crypto";
import {
  catalogue,
  configurationValues,
  createDraft,
  folderDefaults,
  savedDraft,
  serializeTfvars,
  type Template,
} from "@lzc/domain";
import { expect, it, vi } from "vitest";
import {
  Repositories,
  upstreamId,
} from "../apps/api/src/github/repositories.js";

const original = "a".repeat(40),
  treeSha = "b".repeat(40),
  blobSha = "c".repeat(40),
  createdTree = "d".repeat(40),
  createdCommit = "e".repeat(40);
const id = "11111111-2222-4333-8444-555555555555";
const target = { id: 123, owner: "alice", name: "accelerator" };
const token = "ghu_only_this_user";
function validDocument() {
  const template = catalogue.templates.find(
    (t) => t.id === "standalone",
  ) as Template;
  const draft = createDraft(template);
  draft.organization = "11111111-2222-4333-8444-555555555555";
  draft.owner = "owner@stackit.cloud";
  for (const project of draft.projects) project.owner = draft.owner;
  for (const sandbox of draft.sandboxes) sandbox.owner = draft.owner;
  return savedDraft(id, draft);
}
function fixture() {
  const document = validDocument();
  const state = {
    exists: true,
    source: upstreamId,
    push: true,
    repoId: 123,
    race: false,
    file: true,
    symlink: false,
    head: original,
    truncated: false,
    exportSha: "",
    exportMode: "100644",
  };
  const metadata = () => ({
    id: state.repoId,
    name: target.name,
    owner: { login: "alice" },
    fork: true,
    archived: false,
    disabled: false,
    default_branch: "main",
    permissions: { push: state.push },
    source: { id: state.source },
  });
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const request = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    expect(url.origin).toBe("https://api.github.com");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      `Bearer ${token}`,
    );
    expect(init?.redirect).toBe("error");
    const path = url.pathname;
    const method = init?.method ?? "GET";
    if (method !== "GET") {
      const body = JSON.parse(String(init?.body));
      writes.push({ path, body });
      if (path.endsWith("/git/trees"))
        return Response.json({ sha: createdTree });
      if (path.endsWith("/git/commits"))
        return Response.json({ sha: createdCommit });
      if (state.race) return new Response(null, { status: 422 });
      state.head = createdCommit;
      return Response.json({});
    }
    if (path === "/user/repos")
      return Response.json([
        { ...metadata(), id: 456, name: ".github", fork: false },
        metadata(),
      ]);
    if (path === "/repos/alice/accelerator") return Response.json(metadata());
    if (path.endsWith("/git/ref/heads/lzc/configurations"))
      return state.exists
        ? Response.json({
            ref: "refs/heads/lzc/configurations",
            object: { type: "commit", sha: state.head },
          })
        : new Response(null, { status: 404 });
    if (path.endsWith("/git/ref/heads/main"))
      return Response.json({
        ref: "refs/heads/main",
        object: { type: "commit", sha: original },
      });
    if (path.includes("/git/commits/"))
      return Response.json({ tree: { sha: treeSha } });
    if (path.includes("/git/trees/"))
      return Response.json({
        truncated: state.truncated,
        tree: [
          ...(state.exportSha
            ? [
                {
                  path: `src/config/custom/${id}/landing-zone.tfvars`,
                  type: "blob",
                  mode: state.exportMode,
                  sha: state.exportSha,
                },
              ]
            : []),
          {
            path: "src",
            mode: state.symlink ? "120000" : "040000",
            type: state.symlink ? "blob" : "tree",
            sha: treeSha,
          },
          ...(state.file
            ? [
                {
                  path: `src/config/custom/${id}/landing-zone.json`,
                  mode: "100644",
                  type: "blob",
                  sha: blobSha,
                  size: 100,
                },
              ]
            : []),
        ],
      });
    if (path.includes("/git/blobs/"))
      return Response.json({
        encoding: "base64",
        size: 100,
        content: Buffer.from(JSON.stringify(document)).toString("base64"),
      });
    throw new Error(`Unexpected mocked request ${path}`);
  });
  return {
    service: new Repositories(request),
    request,
    state,
    writes,
    document,
  };
}
it("lists only verified writable Accelerator forks using the user's token", async () => {
  const f = fixture();
  expect((await f.service.list(token, 1)).forks).toHaveLength(1);
  f.state.source = 999;
  expect((await f.service.list(token, 2)).forks).toHaveLength(0);
  expect(
    f.request.mock.calls.some(([url]) => String(url).includes("page=2")),
  ).toBe(true);
});
it("rejects forged repository IDs, upstream/non-forks and revoked write rights", async () => {
  for (const change of [
    { source: 999 },
    { push: false },
    { repoId: 999 },
    { repoId: upstreamId },
  ]) {
    const f = fixture();
    Object.assign(f.state, change);
    await expect(
      f.service.save(token, target, original, "update", f.document),
    ).rejects.toMatchObject({ status: 403 });
    expect(f.writes).toHaveLength(0);
  }
});
it("reads valid documents from an immutable branch snapshot", async () => {
  const f = fixture();
  const listing = await f.service.inspect(token, target);
  expect(listing.configurations).toEqual([{ id, name: f.document.draft.name }]);
  expect((await f.service.load(token, target, id)).document).toEqual(
    f.document,
  );
});
it("changes only the two fixed config paths and advances the work branch without force", async () => {
  const f = fixture();
  const result = await f.service.save(
    token,
    target,
    original,
    "update",
    f.document,
  );
  expect(result.head).toBe(createdCommit);
  expect(f.writes[0]?.body).toMatchObject({
    base_tree: treeSha,
    tree: [
      {
        path: `src/config/custom/${id}/landing-zone.json`,
        mode: "100644",
        type: "blob",
      },
      {
        path: `src/config/custom/${id}/landing-zone.tfvars`,
        mode: "100644",
        type: "blob",
        content: serializeTfvars(configurationValues(f.document)),
      },
    ],
  });
  expect(f.writes[0]?.body.tree as unknown[]).toHaveLength(2);
  expect(f.writes[1]?.body.parents).toEqual([original]);
  expect(f.writes[2]).toEqual({
    path: "/repos/alice/accelerator/git/refs/heads/lzc/configurations",
    body: { sha: createdCommit, force: false },
  });
});
it("creates the dedicated branch only when saving, preserving the upstream default branch", async () => {
  const f = fixture();
  f.state.exists = false;
  f.state.file = false;
  expect((await f.service.inspect(token, target)).branchExists).toBe(false);
  expect(f.writes).toHaveLength(0);
  await f.service.save(token, target, original, "create", f.document);
  expect(f.writes.at(-1)).toEqual({
    path: "/repos/alice/accelerator/git/refs",
    body: { ref: "refs/heads/lzc/configurations", sha: createdCommit },
  });
});
it("refuses stale revisions before writing and rejects races without retry/force", async () => {
  const f = fixture();
  await expect(
    f.service.save(token, target, "f".repeat(40), "update", f.document),
  ).rejects.toMatchObject({ code: "repository_changed" });
  expect(f.writes).toHaveLength(0);
  f.state.race = true;
  await expect(
    f.service.save(token, target, original, "update", f.document),
  ).rejects.toMatchObject({ status: 409 });
  expect(f.writes.filter((w) => w.path.includes("/git/refs/"))).toHaveLength(1);
});
it("never overwrites an existing ID while creating or traverses symlinks/truncated trees", async () => {
  const f = fixture();
  await expect(
    f.service.save(token, target, original, "create", f.document),
  ).rejects.toMatchObject({ code: "configuration_already_exists" });
  f.state.symlink = true;
  await expect(
    f.service.save(token, target, original, "update", f.document),
  ).rejects.toMatchObject({ code: "unsafe_configuration_path" });
  f.state.truncated = true;
  await expect(
    f.service.save(token, target, original, "update", f.document),
  ).rejects.toMatchObject({ code: "repository_tree_too_large" });
  expect(f.writes).toHaveLength(0);
});
it("rejects incompatible templates and invalid configuration input before GitHub writes", async () => {
  for (const name of [".", "..", "../repository", "repo?redirect=other"]) {
    const invalid = fixture();
    await expect(
      invalid.service.verify(token, { ...target, name }),
    ).rejects.toThrow();
    expect(invalid.request).not.toHaveBeenCalled();
  }

  const f = fixture();
  f.document.template.sha256 = "f".repeat(64);
  await expect(
    f.service.save(token, target, original, "update", f.document),
  ).rejects.toThrow();
  expect(f.request).not.toHaveBeenCalled();
});

it("updates a matching export but refuses manual edits, orphan files and symlinks before writes", async () => {
  const matching = fixture();
  const text = serializeTfvars(configurationValues(matching.document));
  const sha = createHash("sha1")
    .update(`blob ${Buffer.byteLength(text)}\0`)
    .update(text)
    .digest("hex");
  matching.state.exportSha = sha;
  const changed = structuredClone(matching.document);
  changed.draft.company = "Changed company";
  await matching.service.save(token, target, original, "update", changed);
  expect(JSON.stringify(matching.writes[0])).toContain("Changed company");
  for (const change of [
    { exportSha: "f".repeat(40) },
    { exportSha: sha, exportMode: "120000" },
    { exportSha: sha, file: false },
  ]) {
    const f = fixture();
    Object.assign(f.state, change);
    await expect(
      f.service.save(
        token,
        target,
        original,
        f.state.file ? "update" : "create",
        f.document,
      ),
    ).rejects.toMatchObject({ code: "generated_configuration_changed" });
    expect(f.writes).toHaveLength(0);
  }
});

it("prepares only an unchanged work-branch snapshot with matching native tfvars", async () => {
  const f = fixture();
  const tfvars = serializeTfvars(configurationValues(f.document));
  f.state.exportSha = createHash("sha1")
    .update(`blob ${Buffer.byteLength(tfvars)}\0`)
    .update(tfvars)
    .digest("hex");
  expect(await f.service.prepareSnapshot(token, target, id, original)).toEqual({
    document: f.document,
    head: original,
    tfvars,
  });
  expect(f.writes).toHaveLength(0);
  f.state.head = "f".repeat(40);
  await expect(
    f.service.prepareSnapshot(token, target, id, original),
  ).rejects.toMatchObject({ code: "repository_changed" });
  f.state.head = original;
  f.state.exportSha = "f".repeat(40);
  await expect(
    f.service.prepareSnapshot(token, target, id, original),
  ).rejects.toMatchObject({ code: "generated_configuration_changed" });
  f.state.exportSha = "";
  await expect(
    f.service.prepareSnapshot(token, target, id, original),
  ).rejects.toMatchObject({ code: "generated_configuration_changed" });
  expect(f.writes).toHaveLength(0);
});

it("upgrades a legacy document and its matching tfvars atomically when folder names change", async () => {
  const f = fixture();
  const oldExport = serializeTfvars(configurationValues(f.document));
  f.state.exportSha = createHash("sha1")
    .update(`blob ${Buffer.byteLength(oldExport)}\0`)
    .update(oldExport)
    .digest("hex");
  const upgraded = savedDraft(id, {
    ...f.document.draft,
    folders: { ...folderDefaults, platform: "Betriebsplattform" },
  });
  await f.service.save(token, target, original, "update", upgraded);
  const tree = f.writes[0]?.body.tree as { path: string; content: string }[];
  expect(JSON.parse(tree[0]?.content ?? "").schemaVersion).toBe(2);
  expect(tree[1]?.content).toContain('"name" = "Betriebsplattform"');
  expect(tree[1]?.content).toBe(serializeTfvars(configurationValues(upgraded)));
});
