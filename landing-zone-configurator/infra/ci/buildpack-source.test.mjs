import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { buildpackTag, checkBuildpackSource } from "./buildpack-source.mjs";
import { approvedReleaseSource } from "./release-artifact.mjs";

const repository = "stackitcloud/stackit-landing-zone";
const revision = "a".repeat(40);
const tag = buildpackTag(revision);
const refPath = `git/ref/tags/${tag}`;
const ref = {
  ref: `refs/tags/${tag}`,
  object: { type: "commit", sha: revision },
};
const policy = {
  id: 123,
  name: "Protect LZC buildpack tags",
  target: "tag",
  enforcement: "active",
  conditions: {
    ref_name: { include: ["refs/tags/lzc-image-buildpack-*"], exclude: [] },
  },
  rules: [{ type: "update" }, { type: "deletion" }],
  bypass_actors: [],
};

function protection(value = policy) {
  return [
    ["GET rulesets?per_page=100", [{ id: policy.id, name: policy.name }]],
    ["GET rulesets/123", value],
  ];
}

function api(responses) {
  const calls = [];
  return {
    calls,
    options: {
      publish: true,
      token: "synthetic-test-token",
      fetchImpl: async (url, options) => {
        const [expected, body, status = 200, headers = {}] =
          responses.shift() ?? [];
        const path = url.replace(
          `https://api.github.com/repos/${repository}/`,
          "",
        );
        assert.equal(`${options.method} ${path}`, expected);
        assert.equal(
          options.headers.Authorization,
          "Bearer synthetic-test-token",
        );
        assert.equal(options.redirect, "error");
        assert.ok(options.signal instanceof AbortSignal);
        calls.push({ path, ...options });
        return new Response(JSON.stringify(body), { status, headers });
      },
    },
    done() {
      assert.equal(responses.length, 0, "All expected requests must execute");
      assert.ok(calls.every(({ method }) => ["GET", "POST"].includes(method)));
    },
  };
}

test("missing protected tag is created at exactly the approved revision and read back", async () => {
  const mock = api([
    ...protection(),
    [`GET ${refPath}`, {}, 404],
    ["POST git/refs", ref, 201],
    [`GET ${refPath}`, ref],
    ...protection(),
  ]);
  assert.equal(await checkBuildpackSource(revision, mock.options), tag);
  assert.deepEqual(
    JSON.parse(mock.calls.find(({ method }) => method === "POST").body),
    { ref: ref.ref, sha: revision },
  );
  mock.done();
});

test("existing exact protected tags are idempotent in publication and read-only mode", async () => {
  for (const publish of [true, false]) {
    const mock = api([...protection(), [`GET ${refPath}`, ref]]);
    assert.equal(
      await checkBuildpackSource(revision, { ...mock.options, publish }),
      tag,
    );
    assert.ok(mock.calls.every(({ method }) => method === "GET"));
    mock.done();
  }
});

test("read-only verification reports a missing tag without creating it", async () => {
  const mock = api([...protection(), [`GET ${refPath}`, {}, 404]]);
  await assert.rejects(
    checkBuildpackSource(revision, { ...mock.options, publish: false }),
    /missing \(HTTP 404\); publish it during the qualified build.*operator backfill/,
  );
  mock.done();
});

test("wrong existing tags fail without any update or creation", async () => {
  for (const changed of [
    { ...ref, ref: "refs/tags/other" },
    { ...ref, object: { type: "commit", sha: "b".repeat(40) } },
    { ...ref, object: { type: "tag", sha: revision } },
  ]) {
    const mock = api([...protection(), [`GET ${refPath}`, changed]]);
    await assert.rejects(
      checkBuildpackSource(revision, mock.options),
      /approved commit/,
    );
    assert.ok(mock.calls.every(({ method }) => method === "GET"));
    mock.done();
  }
});

test("weakened protection fails before looking up or writing any tag", async () => {
  for (const changed of [
    { ...policy, target: "branch" },
    { ...policy, enforcement: "disabled" },
    { ...policy, rules: [{ type: "update" }] },
    { ...policy, rules: [{ type: "deletion" }] },
    { ...policy, bypass_actors: [{ actor_id: 1 }] },
    {
      ...policy,
      conditions: { ref_name: { include: ["refs/tags/*"], exclude: [] } },
    },
    {
      ...policy,
      conditions: {
        ref_name: {
          include: policy.conditions.ref_name.include,
          exclude: [ref.ref],
        },
      },
    },
  ]) {
    const mock = api(protection(changed));
    await assert.rejects(
      checkBuildpackSource(revision, mock.options),
      /active update\/deletion protection/,
    );
    mock.done();
  }
});

test("missing, ambiguous or incomplete policy listings cannot authorize publication", async () => {
  for (const [policies, headers] of [
    [[], {}],
    [[policy, { ...policy, id: 456 }], {}],
    [[policy], { link: '<https://api.github.com/next>; rel="next"' }],
  ]) {
    const mock = api([["GET rulesets?per_page=100", policies, 200, headers]]);
    await assert.rejects(
      checkBuildpackSource(revision, mock.options),
      /buildpack tag protection/,
    );
    mock.done();
  }
});

test("only an exact protected concurrently created tag resolves a creation conflict", async () => {
  const mock = api([
    ...protection(),
    [`GET ${refPath}`, {}, 404],
    ["POST git/refs", {}, 422],
    [`GET ${refPath}`, ref],
    ...protection(),
  ]);
  assert.equal(await checkBuildpackSource(revision, mock.options), tag);
  mock.done();
  for (const changed of [
    { ...ref, object: { type: "commit", sha: "b".repeat(40) } },
    { ...ref, object: { type: "tag", sha: revision } },
  ]) {
    const conflict = api([
      ...protection(),
      [`GET ${refPath}`, {}, 404],
      ["POST git/refs", {}, 422],
      [`GET ${refPath}`, changed],
    ]);
    await assert.rejects(
      checkBuildpackSource(revision, conflict.options),
      /approved commit/,
    );
    conflict.done();
  }
});

test("creation conflicts without a tag and protection changes after creation fail explicitly", async () => {
  const missing = api([
    ...protection(),
    [`GET ${refPath}`, {}, 404],
    ["POST git/refs", {}, 422],
    [`GET ${refPath}`, {}, 404],
  ]);
  await assert.rejects(
    checkBuildpackSource(revision, missing.options),
    /creation HTTP 422.*still missing/,
  );
  missing.done();
  const weakened = api([
    ...protection(),
    [`GET ${refPath}`, {}, 404],
    ["POST git/refs", ref, 201],
    [`GET ${refPath}`, ref],
    ...protection({ ...policy, enforcement: "disabled" }),
  ]);
  await assert.rejects(
    checkBuildpackSource(revision, weakened.options),
    /active update\/deletion protection/,
  );
  weakened.done();
});

test("HTTP failures retain the operation and status and never trigger hidden retries", async () => {
  for (const status of [401, 403, 500]) {
    for (const [responses, expected] of [
      [
        [["GET rulesets?per_page=100", {}, status]],
        `GET rulesets?per_page=100 HTTP ${status}`,
      ],
      [
        [...protection(), [`GET ${refPath}`, {}, status]],
        `GET ${refPath} HTTP ${status}`,
      ],
      [
        [
          ...protection(),
          [`GET ${refPath}`, {}, 404],
          ["POST git/refs", {}, status],
        ],
        `POST git/refs HTTP ${status}`,
      ],
    ]) {
      const mock = api(responses);
      await assert.rejects(
        checkBuildpackSource(revision, mock.options),
        (error) =>
          error.message.includes(expected) &&
          !error.message.includes(mock.options.token),
      );
      mock.done();
    }
  }
});

test("invalid revisions or missing tokens fail before any network operation", async () => {
  const mock = api([]);
  await assert.rejects(
    checkBuildpackSource("main", mock.options),
    /Invalid buildpack source revision/,
  );
  await assert.rejects(
    checkBuildpackSource(revision, { ...mock.options, token: "" }),
    /GitHub token required/,
  );
  mock.done();
});

test("forbidden historical publication explains the token restriction without retrying or weakening protection", async () => {
  const mock = api([
    ...protection(),
    [`GET ${refPath}`, {}, 404],
    ["POST git/refs", {}, 403],
  ]);
  await assert.rejects(
    checkBuildpackSource(revision, mock.options),
    /POST git\/refs HTTP 403.*GITHUB_TOKEN may reject historical commits.*operator backfill; keep tag protection enabled/,
  );
  mock.done();
});

const workflow = readFileSync(
  new URL(
    "../../../.github/workflows/configurator-release.yml",
    import.meta.url,
  ),
  "utf8",
);
const publisher = workflow
  .split("\n  publish_buildpack:\n")[1]
  ?.split("\n  deploy:\n")[0];
const deploy = workflow.split("\n  deploy:\n")[1];

test("only the isolated publisher gets write access; deployment verifies independently with read access", () => {
  assert.ok(publisher);
  assert.ok(deploy);
  assert.equal(workflow.match(/contents: write/g)?.length, 1);
  assert.match(
    publisher,
    /permissions:\n      actions: read\n      contents: write/,
  );
  assert.doesNotMatch(publisher, /environment:|secrets[.:]|cf push|tofu /);
  assert.match(publisher, /persist-credentials: false/);
  assert.doesNotMatch(
    publisher,
    /ref: \$\{\{ steps.source.outputs.release_revision \}\}/,
  );
  assert.ok(
    publisher.indexOf("release-artifact.mjs source") <
      publisher.indexOf("buildpack-source.mjs publish"),
  );
  assert.match(publisher, /LZC_RELEASE_RUN_ID: \$\{\{ github.run_id \}\}/);
  assert.doesNotMatch(
    publisher,
    /LZC_RELEASE_RUN_ID: \$\{\{ inputs.release_run_id/,
  );
  assert.match(publisher, /test "\$head" = "\$GITHUB_SHA"/);
  assert.ok(
    publisher.indexOf('test "$head" = "$GITHUB_SHA"') <
      publisher.indexOf("buildpack-source.mjs publish"),
  );
  assert.match(publisher, /manifest.yml\?ref=\$LZC_RELEASE_REVISION/);
  assert.match(publisher, /grep -q 'LZC_IMAGE_BUILDPACK'/);
  assert.match(
    publisher,
    /LZC_RELEASE_REVISION: \$\{\{ steps.source.outputs.release_revision \}\}/,
  );
  assert.match(deploy, /needs: \[build, publish_buildpack\]/);
  assert.match(
    deploy,
    /permissions:\n      actions: read\n      contents: read/,
  );
  assert.match(deploy, /environment:\n      name: lzc-dev-release/);
  assert.ok(
    deploy.indexOf("buildpack-source.mjs") <
      deploy.indexOf("Install pinned CF CLI"),
  );
  assert.doesNotMatch(deploy, /buildpack-source.mjs publish/);
});

test("actual publication and deployment conditions enforce manual trusted qualified releases", () => {
  const context = {
    always: () => true,
    cancelled: () => false,
    github: {
      event_name: "workflow_dispatch",
      run_attempt: 1,
      ref: "refs/heads/main",
    },
    inputs: { build_only: false, release_run_id: "" },
    vars: { LZC_RELEASE_CI_ENABLED: "true" },
    needs: {
      build: { result: "success" },
      publish_buildpack: { result: "success" },
    },
  };
  const allowed = (job, overrides = {}) =>
    runInNewContext(job.match(/^\s+if: (.+)$/m)[1], {
      ...context,
      ...overrides,
    });
  for (const job of [publisher, deploy]) {
    assert.equal(allowed(job), true);
    for (const overrides of [
      { cancelled: () => true },
      { github: { ...context.github, event_name: "push" } },
      { github: { ...context.github, run_attempt: 2 } },
      { github: { ...context.github, ref: "refs/heads/untrusted" } },
      { vars: { LZC_RELEASE_CI_ENABLED: "false" } },
      { needs: { ...context.needs, build: { result: "failure" } } },
      { needs: { ...context.needs, build: { result: "skipped" } } },
    ])
      assert.equal(allowed(job, overrides), false);
  }
  const buildOnly = { inputs: { ...context.inputs, build_only: true } };
  assert.equal(allowed(publisher, buildOnly), true);
  assert.equal(allowed(deploy, buildOnly), false);
  const promotion = {
    inputs: { ...context.inputs, release_run_id: "123" },
    needs: {
      build: { result: "skipped" },
      publish_buildpack: { result: "skipped" },
    },
  };
  assert.equal(allowed(publisher, promotion), false);
  assert.equal(allowed(deploy, promotion), true);
  assert.equal(
    allowed(publisher, {
      inputs: { ...context.inputs, release_run_id: "123" },
    }),
    false,
  );
  assert.equal(
    allowed(deploy, {
      ...promotion,
      inputs: { ...promotion.inputs, build_only: true },
    }),
    false,
  );
  for (const result of ["failure", "cancelled", "skipped"]) {
    assert.equal(
      allowed(deploy, {
        needs: { ...context.needs, publish_buildpack: { result } },
      }),
      false,
    );
  }
  assert.equal(
    allowed(deploy, {
      ...promotion,
      needs: { ...promotion.needs, publish_buildpack: { result: "failure" } },
    }),
    false,
  );
});

test("failed deployments remain promotable only when qualification, build and immutable artifact succeeded", () => {
  const run = {
    id: 123,
    run_attempt: 1,
    path: ".github/workflows/configurator-release.yml",
    head_sha: revision,
    head_repository: { full_name: repository },
    head_branch: "main",
    event: "workflow_dispatch",
    conclusion: "failure",
  };
  const jobs = [
    { name: "build", status: "completed", conclusion: "success" },
    {
      name: "assistant / assistant-live-qualification",
      status: "completed",
      conclusion: "success",
    },
    { name: "deploy", status: "completed", conclusion: "failure" },
  ];
  const artifacts = [
    {
      id: 456,
      name: "configurator-release-123",
      expired: false,
      workflow_run: { id: 123, head_sha: revision },
    },
  ];
  assert.deepEqual(approvedReleaseSource(run, jobs, artifacts, "123"), {
    revision,
    runId: "123",
    artifactId: "456",
  });
  for (const name of ["build", "assistant / assistant-live-qualification"])
    assert.throws(
      () =>
        approvedReleaseSource(
          run,
          jobs.map((job) =>
            job.name === name ? { ...job, conclusion: "failure" } : job,
          ),
          artifacts,
          "123",
        ),
      /Only successful trusted release builds/,
    );
});
