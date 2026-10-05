import { createHash, randomUUID } from "node:crypto";
import { s3BackendConfiguration } from "@lzc/contracts";
import {
  catalogue,
  configurationValues,
  createDraft,
  createPlatformDraftCopy,
  editCommonInput,
  exportCommonTfvars,
  folderDefaults,
  migrateCommonConfiguration,
  savedDraft,
  serializeTfvars,
  type Template,
} from "@lzc/domain";
import Fastify from "fastify";
import { expect, it, vi } from "vitest";
import type { AuthServices } from "../apps/api/src/auth/routes.js";
import type { Session } from "../apps/api/src/auth/store.js";
import { CredentialError } from "../apps/api/src/credentials/profiles.js";
import {
  Repositories,
  upstreamId,
} from "../apps/api/src/github/repositories.js";
import { registerRepositories } from "../apps/api/src/github/routes.js";

const original = "a".repeat(40),
  treeSha = "b".repeat(40),
  blobSha = "c".repeat(40),
  createdTree = "d".repeat(40),
  createdCommit = "e".repeat(40);
const id = "11111111-2222-4333-8444-555555555555";
const target = { id: 123, owner: "alice", name: "accelerator" };
const token = "ghu_only_this_user";
const descriptor = {
  bucket: "customer-management-tfstate",
  endpoint: "https://object.storage.eu01.onstackit.cloud",
  region: "eu01",
  key: `platform/${id}/terraform.tfstate`,
  useLockfile: true,
} as const;
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
    backendSha: "",
    backendMode: "100644",
    backendType: "blob",
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
          ...(state.backendSha
            ? [
                {
                  path: `src/config/custom/${id}/backend.tf.json`,
                  type: state.backendType,
                  mode: state.backendMode,
                  sha: state.backendSha,
                },
              ]
            : []),
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
it("exports a standard non-secret S3 backend alongside unchanged JSON and tfvars", async () => {
  const test = fixture();
  await test.service.save(
    token,
    target,
    original,
    "update",
    test.document,
    descriptor,
  );
  const tree = test.writes[0]?.body.tree as { path: string; content: string }[];
  expect(tree).toHaveLength(4);
  expect(JSON.parse(tree[0]?.content ?? "{}")).toEqual(test.document);
  expect(tree[1]?.content).toBe(
    serializeTfvars(configurationValues(test.document)),
  );
  expect(tree[2]).toMatchObject({
    path: `src/config/custom/${id}/backend.tf.json`,
    content: s3BackendConfiguration(descriptor),
  });
  const backend = JSON.parse(tree[2]?.content ?? "{}").terraform.backend.s3;
  expect(backend).toMatchObject({
    bucket: descriptor.bucket,
    key: descriptor.key,
    use_lockfile: true,
  });
  expect(Object.keys(backend).sort()).toEqual([
    "bucket",
    "endpoints",
    "key",
    "region",
    "skip_credentials_validation",
    "skip_region_validation",
    "skip_requesting_account_id",
    "skip_s3_checksum",
    "use_lockfile",
  ]);
  expect(tree[3]?.content).toContain(
    `tofu plan -var-file=config/custom/${id}/landing-zone.tfvars`,
  );
  expect(tree[3]?.content).toContain("exactly one active backend block");
  expect(tree.some((entry) => entry.path.endsWith("terraform.tfstate"))).toBe(
    false,
  );
  expect(JSON.stringify(tree)).not.toContain(token);
  expect(JSON.stringify(tree)).not.toContain("secret_access_key");
  expect(JSON.stringify(tree)).not.toContain("service_account_key");
});

it("accepts only the exact immutable current backend and never overwrites manual changes", async () => {
  const configuration = s3BackendConfiguration(descriptor);
  const backendSha = createHash("sha1")
    .update(`blob ${Buffer.byteLength(configuration)}\0`)
    .update(configuration)
    .digest("hex");
  const matching = fixture();
  matching.state.backendSha = backendSha;
  await matching.service.save(
    token,
    target,
    original,
    "update",
    matching.document,
    descriptor,
  );
  expect(matching.writes).toHaveLength(3);
  for (const change of [
    { backendSha: "f".repeat(40) },
    { backendSha, backendMode: "120000" },
    { backendSha, backendType: "tree", backendMode: "040000" },
  ]) {
    const test = fixture();
    Object.assign(test.state, change);
    await expect(
      test.service.save(
        token,
        target,
        original,
        "update",
        test.document,
        descriptor,
      ),
    ).rejects.toMatchObject({ code: "backend_configuration_changed" });
    expect(test.writes).toHaveLength(0);
  }
  const missing = fixture();
  missing.state.backendSha = backendSha;
  await expect(
    missing.service.save(token, target, original, "update", missing.document),
  ).rejects.toMatchObject({ code: "backend_configuration_missing" });
  expect(missing.writes).toHaveLength(0);
});

it("rejects credential-bearing descriptors before any GitHub request", async () => {
  const test = fixture();
  await expect(
    test.service.save(token, target, original, "update", test.document, {
      ...descriptor,
      secretAccessKey: "must-not-be-exported",
    } as typeof descriptor),
  ).rejects.toThrow();
  expect(test.request).not.toHaveBeenCalled();
});

it("resolves exports from the authenticated source binding and fails closed on backend errors", async () => {
  const test = fixture();
  const app = Fastify();
  const session: Session = {
    id: randomUUID(),
    userId: randomUUID(),
    tenantId: randomUUID(),
    githubId: "101",
    login: "alice",
    csrfToken: "c".repeat(43),
    expiresAt: new Date(Date.now() + 60000),
  };
  const resolveSession = vi.fn(async () => session);
  const auth: AuthServices = {
    origin: "https://configurator.example",
    clientId: "client",
    store: {
      resolveSession,
      beginLogin: async () => {},
      consumeLogin: async () => null,
      createSession: async () => session,
      deleteSession: async () => {},
    },
    github: {
      authorize: async () => {
        throw new Error("unused");
      },
    },
    tokens: {
      get: async () => token,
      put: async () => {},
      remove: async () => {},
    },
  };
  const lookup = vi.fn(async (_session: Session, _id: string) => ({
    id: randomUUID(),
    descriptor,
    configuration: "not trusted rendered content",
  }));
  registerRepositories(app, auth, test.service, {
    configurationForSource: lookup,
  });
  const sourceConfigurationId = randomUUID();
  const payload = {
    target,
    head: original,
    mode: "update",
    document: test.document,
  };
  const post = (body: object) =>
    app.inject({
      method: "POST",
      url: "/api/v1/github/configuration",
      headers: {
        cookie: `__Host-lzc-session=${"s".repeat(43)}`,
        origin: auth.origin,
        "x-lzc-csrf": session.csrfToken,
      },
      payload: body,
    });
  try {
    expect((await post({ ...payload, sourceConfigurationId })).statusCode).toBe(
      200,
    );
    expect(lookup).toHaveBeenLastCalledWith(session, sourceConfigurationId);
    expect(resolveSession).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(test.writes)).toContain("use_lockfile");
    expect(JSON.stringify(test.writes)).not.toContain(
      "not trusted rendered content",
    );
    test.state.head = original;
    lookup.mockRejectedValueOnce(new CredentialError(404, "backend_not_found"));
    expect((await post(payload)).statusCode).toBe(200);
    expect(lookup).toHaveBeenLastCalledWith(session, id);
    const noBackendTree = test.writes[3]?.body.tree as { path: string }[];
    expect(noBackendTree).toHaveLength(3);
    expect(
      noBackendTree.some((entry) => entry.path.endsWith("backend.tf.json")),
    ).toBe(false);
    for (const [error, status, code] of [
      [
        new CredentialError(403, "backend_access_denied"),
        403,
        "backend_access_denied",
      ],
      [new CredentialError(404, "other_not_found"), 404, "other_not_found"],
      [
        new CredentialError(503, "backend_unavailable"),
        503,
        "backend_unavailable",
      ],
      [new Error("database unavailable"), 503, "backend_request_failed"],
    ] as const) {
      const before = test.writes.length;
      lookup.mockRejectedValueOnce(error);
      const response = await post(payload);
      expect(response.statusCode).toBe(status);
      expect(response.json()).toEqual({ error: code });
      expect(test.writes).toHaveLength(before);
    }
    for (const extra of [
      { descriptor },
      { sourceConfigurationId: "invalid" },
    ]) {
      const before = lookup.mock.calls.length;
      expect((await post({ ...payload, ...extra })).statusCode).toBe(400);
      expect(lookup).toHaveBeenCalledTimes(before);
    }
    const configuration = s3BackendConfiguration(descriptor);
    test.state.backendSha = createHash("sha1")
      .update(`blob ${Buffer.byteLength(configuration)}\0`)
      .update(configuration)
      .digest("hex");
    test.state.head = original;
    lookup.mockRejectedValueOnce(new CredentialError(404, "backend_not_found"));
    const before = test.writes.length;
    const response = await post(payload);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "backend_configuration_missing" });
    expect(test.writes).toHaveLength(before);
  } finally {
    await app.close();
  }
});
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
it("exports config paths and CLI instructions and advances the work branch without force", async () => {
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
      {
        path: `src/config/custom/${id}/README.md`,
        mode: "100644",
        type: "blob",
        content: expect.stringContaining("first-bootstrap"),
      },
    ],
  });
  expect(f.writes[0]?.body.tree as unknown[]).toHaveLength(3);
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

it("atomically saves a common document alongside its full tfvars export", async () => {
  const f = fixture();
  f.state.file = false;
  const document = migrateCommonConfiguration(f.document);
  await f.service.save(token, target, original, "create", document);
  const tree = f.writes.find((write) => write.path.endsWith("/git/trees"))?.body
    .tree as { content: string }[];
  expect(JSON.parse(tree[0]?.content ?? "{}").schemaVersion).toBe(3);
  expect(tree[1]?.content).toBe(exportCommonTfvars(document));
});

it("rejects unsupported common-format components before reading credentials", async () => {
  const f = fixture();
  const document = editCommonInput(
    migrateCommonConfiguration(f.document),
    "devops",
    { git_flavor: "git-10" },
  );
  const request: typeof fetch = async (input, init) => {
    if (new URL(String(input)).pathname.endsWith(`/git/blobs/${blobSha}`))
      return Response.json({
        encoding: "base64",
        content: Buffer.from(JSON.stringify(document)).toString("base64"),
        size: 5000,
      });
    return f.request(input, init);
  };
  const service = new Repositories(request);
  await expect(
    service.prepareSnapshot(token, target, id, original),
  ).rejects.toMatchObject({ code: "configuration_execution_not_supported" });
});

it("prepares an unchanged standalone common-format configuration with its exact export", async () => {
  const f = fixture();
  const document = migrateCommonConfiguration(f.document);
  const tfvars = exportCommonTfvars(document);
  f.state.exportSha = createHash("sha1")
    .update(`blob ${Buffer.byteLength(tfvars)}\0`)
    .update(tfvars)
    .digest("hex");
  const request: typeof fetch = async (input, init) => {
    if (new URL(String(input)).pathname.endsWith(`/git/blobs/${blobSha}`))
      return Response.json({
        encoding: "base64",
        content: Buffer.from(JSON.stringify(document)).toString("base64"),
        size: 5000,
      });
    return f.request(input, init);
  };
  expect(
    await new Repositories(request).prepareSnapshot(
      token,
      target,
      id,
      original,
    ),
  ).toEqual({ document, head: original, tfvars });
  expect(f.writes).toHaveLength(0);
});

it("persists project-template metadata atomically while preparing only platform resources", async () => {
  const f = fixture();
  const source = migrateCommonConfiguration({
    ...f.document,
    id: randomUUID(),
  });
  let stored = createPlatformDraftCopy(source, id);
  const templates = structuredClone(stored.projectTemplates);
  const request: typeof fetch = async (input, init) => {
    if (new URL(String(input)).pathname.endsWith(`/git/blobs/${blobSha}`))
      return Response.json({
        encoding: "base64",
        content: Buffer.from(JSON.stringify(stored)).toString("base64"),
        size: 5000,
      });
    return f.request(input, init);
  };
  const service = new Repositories(request);
  f.state.file = false;
  await service.save(token, target, original, "create", stored);
  const tree = f.writes.find((write) => write.path.endsWith("/git/trees"))?.body
    .tree as { content: string }[];
  stored = JSON.parse(tree[0]?.content ?? "{}");
  expect(stored.projectTemplates).toEqual(templates);
  expect(stored.projectTemplates?.length).toBeGreaterThan(0);
  const exported = tree[1]?.content ?? "";
  expect(exported).toContain("landing_zones = {}\n");
  expect(exported).toContain("sandboxes = []\n");
  expect(exported).toContain("landing_zone_namespace_services = {}\n");
  expect(exported).not.toContain("projectTemplates");
  expect(exported).not.toContain("project_name");
  f.state.file = true;
  f.state.exportSha = createHash("sha1")
    .update(`blob ${Buffer.byteLength(exported)}\0`)
    .update(exported)
    .digest("hex");
  const snapshot = await service.prepareSnapshot(
    token,
    target,
    id,
    createdCommit,
  );
  expect(snapshot.document).toEqual(stored);
  expect(snapshot.tfvars).toBe(exported);
  const writesBefore = f.writes.length;
  stored.features.projects.landing_zones = structuredClone(
    source.features.projects.landing_zones ?? {},
  );
  stored.identities.landingZones = structuredClone(
    source.identities.landingZones,
  );
  await expect(
    service.save(token, target, createdCommit, "update", stored),
  ).rejects.toThrow("Projektinstanzen");
  await expect(
    service.prepareSnapshot(token, target, id, createdCommit),
  ).rejects.toMatchObject({ code: "unsupported_configuration_document" });
  expect(f.writes).toHaveLength(writesBefore);
});
