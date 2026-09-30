import { createHash } from "node:crypto";
import {
  configurationValues,
  readSavedDraft,
  type SavedDraft,
  serializeTfvars,
} from "@lzc/domain";
import { z } from "zod";

export const upstreamId = 1168467997;
export const workBranch = "lzc/configurations";
const ownerPattern = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const namePattern = /^(?!\.{1,2}$)[A-Za-z0-9_.-]{1,100}$/;
const shaSchema = z.string().regex(/^[a-f0-9]{40}$/);
export const repositoryTarget = z
  .object({
    owner: z.string().regex(ownerPattern),
    name: z.string().regex(namePattern),
    id: z.number().int().positive().safe(),
  })
  .strict();
export type RepositoryTarget = z.infer<typeof repositoryTarget>;
export type Fork = RepositoryTarget & {
  fullName: string;
  defaultBranch: string;
};
export class RepositoryError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}
const repoSchema = z.object({
  id: z.number().int().positive().safe(),
  name: z.string().regex(namePattern),
  owner: z.object({ login: z.string().regex(ownerPattern) }),
  fork: z.boolean(),
  archived: z.boolean(),
  disabled: z.boolean().optional(),
  default_branch: z.string().min(1).max(255),
  permissions: z.object({ push: z.boolean() }).optional(),
  source: z.object({ id: z.number() }).optional(),
});
const treeSchema = z.object({
  truncated: z.boolean().optional(),
  tree: z.array(
    z.object({
      path: z.string(),
      mode: z.string(),
      type: z.string(),
      sha: shaSchema,
      size: z.number().optional(),
    }),
  ),
});
type Tree = z.infer<typeof treeSchema>["tree"];
const configPath = (id: string) => `src/config/custom/${id}/landing-zone.json`;
export class Repositories {
  constructor(private readonly request: typeof fetch = fetch) {}
  private async call(
    token: string,
    path: string,
    method = "GET",
    body?: unknown,
    missing = false,
  ): Promise<unknown> {
    if (!token.startsWith("ghu_") || !path.startsWith("/"))
      throw new RepositoryError(401, "github_reauthentication_required");
    let response: Response;
    try {
      response = await this.request(`https://api.github.com${path}`, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2026-03-10",
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new RepositoryError(502, "github_unavailable");
    }
    if (missing && response.status === 404) return null;
    if (!response.ok) {
      if (response.status === 401)
        throw new RepositoryError(401, "github_reauthentication_required");
      if (
        response.status === 403 &&
        response.headers.get("x-ratelimit-remaining") === "0"
      )
        throw new RepositoryError(429, "github_rate_limited");
      if (response.status === 403 || response.status === 404)
        throw new RepositoryError(403, "repository_access_denied");
      if (response.status === 409 || response.status === 422)
        throw new RepositoryError(
          409,
          "repository_conflict_or_branch_protection",
        );
      throw new RepositoryError(502, "github_unavailable");
    }
    return response.json();
  }
  private prefix(target: RepositoryTarget) {
    const parsed = repositoryTarget.parse({
      owner: target.owner,
      name: target.name,
      id: target.id,
    });
    return `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.name)}`;
  }
  async verify(token: string, target: RepositoryTarget): Promise<Fork> {
    const data = repoSchema.parse(await this.call(token, this.prefix(target)));
    if (
      data.id !== target.id ||
      data.id === upstreamId ||
      !data.fork ||
      data.source?.id !== upstreamId ||
      data.archived ||
      data.disabled ||
      !data.permissions?.push
    )
      throw new RepositoryError(403, "not_writable_accelerator_fork");
    return {
      id: data.id,
      owner: data.owner.login,
      name: data.name,
      fullName: `${data.owner.login}/${data.name}`,
      defaultBranch: data.default_branch,
    };
  }
  async list(
    token: string,
    page: number,
  ): Promise<{ forks: Fork[]; nextPage: number | null }> {
    if (!Number.isInteger(page) || page < 1 || page > 100)
      throw new RepositoryError(400, "invalid_page");
    const raw = z
      .array(repoSchema)
      .max(25)
      .parse(
        await this.call(
          token,
          `/user/repos?per_page=25&page=${page}&sort=full_name&affiliation=owner,collaborator,organization_member`,
        ),
      );
    const forks: Fork[] = [];
    // Bounded sequential checks avoid a fan-out burst against GitHub's rate limit.
    for (const repo of raw.filter(
      (r) => r.fork && !r.archived && !r.disabled && r.permissions?.push,
    )) {
      try {
        forks.push(
          await this.verify(token, {
            id: repo.id,
            owner: repo.owner.login,
            name: repo.name,
          }),
        );
      } catch (error) {
        if (!(error instanceof RepositoryError) || error.status !== 403)
          throw error;
      }
    }
    return {
      forks,
      nextPage: raw.length === 25 && page < 100 ? page + 1 : null,
    };
  }
  private async head(token: string, fork: Fork) {
    const prefix = this.prefix(fork);
    const current = await this.call(
      token,
      `${prefix}/git/ref/heads/${workBranch}`,
      "GET",
      undefined,
      true,
    );
    const refSchema = z.object({
      ref: z.string(),
      object: z.object({ type: z.literal("commit"), sha: shaSchema }),
    });
    if (current !== null) {
      const ref = refSchema.parse(current);
      if (ref.ref !== `refs/heads/${workBranch}`)
        throw new RepositoryError(502, "invalid_github_response");
      return { head: ref.object.sha, exists: true };
    }
    const ref = refSchema.parse(
      await this.call(
        token,
        `${prefix}/git/ref/heads/${encodeURIComponent(fork.defaultBranch)}`,
      ),
    );
    if (ref.ref !== `refs/heads/${fork.defaultBranch}`)
      throw new RepositoryError(502, "invalid_github_response");
    return { head: ref.object.sha, exists: false };
  }
  private async tree(token: string, fork: Fork, head: string) {
    const prefix = this.prefix(fork);
    const commit = z
      .object({ tree: z.object({ sha: shaSchema }) })
      .parse(
        await this.call(
          token,
          `${prefix}/git/commits/${shaSchema.parse(head)}`,
        ),
      );
    const tree = treeSchema.parse(
      await this.call(
        token,
        `${prefix}/git/trees/${commit.tree.sha}?recursive=1`,
      ),
    );
    if (tree.truncated)
      throw new RepositoryError(422, "repository_tree_too_large");
    return { sha: commit.tree.sha, entries: tree.tree };
  }
  private ensurePath(
    tree: Tree,
    id: string,
    mode: "create" | "update" | "read",
  ) {
    const path = configPath(id);
    for (const parent of [
      "src",
      "src/config",
      "src/config/custom",
      `src/config/custom/${id}`,
    ]) {
      const entry = tree.find((e) => e.path === parent);
      if (entry && (entry.type !== "tree" || entry.mode !== "040000"))
        throw new RepositoryError(409, "unsafe_configuration_path");
    }
    const entry = tree.find((e) => e.path === path);
    if (mode === "create" && entry)
      throw new RepositoryError(409, "configuration_already_exists");
    if (mode !== "create" && !entry)
      throw new RepositoryError(404, "configuration_not_found");
    if (
      entry &&
      (entry.type !== "blob" ||
        entry.mode !== "100644" ||
        (entry.size ?? 0) > 1024 * 1024)
    )
      throw new RepositoryError(409, "unsafe_configuration_path");
    return entry;
  }
  private async document(
    token: string,
    fork: Fork,
    sha: string,
  ): Promise<SavedDraft> {
    const blob = z
      .object({
        encoding: z.literal("base64"),
        content: z.string().max(1500000),
        size: z.number().max(1024 * 1024),
      })
      .parse(
        await this.call(
          token,
          `${this.prefix(fork)}/git/blobs/${shaSchema.parse(sha)}`,
        ),
      );
    try {
      return readSavedDraft(
        JSON.parse(Buffer.from(blob.content, "base64").toString("utf8")),
      );
    } catch {
      throw new RepositoryError(422, "unsupported_configuration_document");
    }
  }
  async inspect(token: string, target: RepositoryTarget) {
    const fork = await this.verify(token, target);
    const state = await this.head(token, fork);
    const tree = await this.tree(token, fork, state.head);
    const paths = tree.entries.filter((e) =>
      /^src\/config\/custom\/[0-9a-f-]{36}\/landing-zone\.json$/.test(e.path),
    );
    const configurations: { id: string; name: string }[] = [];
    let unsupported = 0;
    for (const entry of paths.slice(0, 30)) {
      const id = entry.path.split("/")[3] ?? "";
      try {
        this.ensurePath(tree.entries, id, "read");
        const document = await this.document(token, fork, entry.sha);
        if (document.id !== id)
          throw new RepositoryError(422, "unsupported_configuration_document");
        configurations.push({ id, name: document.draft.name });
      } catch (error) {
        if (
          !(error instanceof RepositoryError) ||
          ![409, 422].includes(error.status)
        )
          throw error;
        unsupported++;
      }
    }
    return {
      fork,
      head: state.head,
      branchExists: state.exists,
      branch: workBranch,
      configurations,
      unsupported,
      truncated: paths.length > 30,
    };
  }
  async load(token: string, target: RepositoryTarget, id: string) {
    const fork = await this.verify(token, target);
    const state = await this.head(token, fork);
    const tree = await this.tree(token, fork, state.head);
    const entry = this.ensurePath(tree.entries, id, "read");
    if (!entry) throw new RepositoryError(404, "configuration_not_found");
    const document = await this.document(token, fork, entry.sha);
    if (document.id !== id)
      throw new RepositoryError(422, "unsupported_configuration_document");
    return { document, head: state.head };
  }
  async save(
    token: string,
    target: RepositoryTarget,
    expectedHead: string,
    mode: "create" | "update",
    document: SavedDraft,
  ) {
    const valid = readSavedDraft(document);
    const fork = await this.verify(token, target);
    const state = await this.head(token, fork);
    if (state.head !== expectedHead)
      throw new RepositoryError(409, "repository_changed");
    const tree = await this.tree(token, fork, state.head);
    const previous = this.ensurePath(tree.entries, valid.id, mode);
    let previousExport: string | undefined;
    if (mode === "update" && previous) {
      const existing = await this.document(token, fork, previous.sha);
      previousExport = serializeTfvars(configurationValues(existing));
      if (existing.id !== valid.id)
        throw new RepositoryError(409, "unsupported_configuration_document");
    }
    const exportPath = `src/config/custom/${valid.id}/landing-zone.tfvars`;
    const exported = tree.entries.find((entry) => entry.path === exportPath);
    if (exported) {
      // Compare immutable Git blob identity with the previous deterministic export.
      // Never overwrite hand-edited files, directories or symlinks.
      const expectedSha =
        previousExport === undefined
          ? undefined
          : createHash("sha1")
              .update(`blob ${Buffer.byteLength(previousExport)}\0`)
              .update(previousExport)
              .digest("hex");
      if (
        exported.type !== "blob" ||
        exported.mode !== "100644" ||
        exported.sha !== expectedSha
      )
        throw new RepositoryError(409, "generated_configuration_changed");
    }
    const prefix = this.prefix(fork);
    const createdTree = z.object({ sha: shaSchema }).parse(
      await this.call(token, `${prefix}/git/trees`, "POST", {
        base_tree: tree.sha,
        tree: [
          {
            path: configPath(valid.id),
            mode: "100644",
            type: "blob",
            content: `${JSON.stringify(valid, null, 2)}\n`,
          },
          {
            path: exportPath,
            mode: "100644",
            type: "blob",
            content: serializeTfvars(configurationValues(valid)),
          },
        ],
      }),
    );
    const commit = z.object({ sha: shaSchema }).parse(
      await this.call(token, `${prefix}/git/commits`, "POST", {
        message: `Save Landing Zone configuration ${valid.id}`,
        tree: createdTree.sha,
        parents: [state.head],
      }),
    );
    // No force update or automatic retry. A concurrent commit makes this non-fast-forward.
    if (state.exists)
      await this.call(
        token,
        `${prefix}/git/refs/heads/${workBranch}`,
        "PATCH",
        { sha: commit.sha, force: false },
      );
    else
      await this.call(token, `${prefix}/git/refs`, "POST", {
        ref: `refs/heads/${workBranch}`,
        sha: commit.sha,
      });
    return {
      head: commit.sha,
      id: valid.id,
      branch: workBranch,
      commitUrl: `https://github.com/${fork.owner}/${fork.name}/commit/${commit.sha}`,
    };
  }
}
