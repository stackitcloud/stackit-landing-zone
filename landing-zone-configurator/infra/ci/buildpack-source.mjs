import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = "stackitcloud/stackit-landing-zone";
export function buildpackTag(revision) {
  if (!/^[a-f0-9]{40}$/.test(revision ?? ""))
    throw new Error("Invalid buildpack source revision");
  return `lzc-image-buildpack-${revision}`;
}

function verifyBuildpackProtection(policy) {
  const names = policy?.conditions?.ref_name;
  if (
    policy?.name !== "Protect LZC buildpack tags" ||
    policy.target !== "tag" ||
    policy.enforcement !== "active" ||
    names?.include?.length !== 1 ||
    names.include[0] !== "refs/tags/lzc-image-buildpack-*" ||
    names.exclude?.length !== 0 ||
    !policy.rules?.some((rule) => rule.type === "update") ||
    !policy.rules.some((rule) => rule.type === "deletion") ||
    (policy.bypass_actors !== undefined && policy.bypass_actors.length !== 0)
  )
    throw new Error(
      "Buildpack tag must resolve to the approved commit under active update/deletion protection",
    );
}

export function verifyBuildpackSource(revision, ref, policy) {
  const tag = buildpackTag(revision);
  verifyBuildpackProtection(policy);
  if (
    ref?.ref !== `refs/tags/${tag}` ||
    ref.object?.type !== "commit" ||
    ref.object.sha !== revision
  )
    throw new Error("Buildpack tag must resolve to the approved commit");
  return tag;
}

export async function checkBuildpackSource(
  revision,
  { publish = false, fetchImpl = fetch, token = process.env.GH_TOKEN } = {},
) {
  const tag = buildpackTag(revision);
  if (!token) throw new Error("GitHub token required");
  async function request(path, { method = "GET", body, allow = [] } = {}) {
    const response = await fetchImpl(
      `https://api.github.com/repos/${repository}/${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok && !allow.includes(response.status))
      throw new Error(
        `Buildpack source ${method} ${path} HTTP ${response.status}`,
      );
    return response;
  }
  async function protection() {
    const response = await request("rulesets?per_page=100");
    if (response.headers.get("link")?.includes('rel="next"'))
      throw new Error("Complete buildpack tag protection listing required");
    const policies = await response.json();
    const matches = policies.filter(
      (policy) => policy.name === "Protect LZC buildpack tags",
    );
    if (matches.length !== 1)
      throw new Error("Unique buildpack tag protection required");
    const policy = await (await request(`rulesets/${matches[0].id}`)).json();
    verifyBuildpackProtection(policy);
    return policy;
  }
  const policy = await protection();
  const refPath = `git/ref/tags/${tag}`;
  const response = await request(refPath, { allow: [404] });
  if (response.ok)
    return verifyBuildpackSource(revision, await response.json(), policy);
  if (!publish)
    throw new Error(
      `Buildpack tag ${tag} is missing (HTTP 404); run the release's publish_buildpack job before deployment`,
    );
  const created = await request("git/refs", {
    method: "POST",
    body: { ref: `refs/tags/${tag}`, sha: revision },
    allow: [422],
  });
  // A concurrent creator may return 422; accept only the exact protected tag.
  const published = await request(refPath, { allow: [404] });
  if (!published.ok)
    throw new Error(
      `Buildpack tag creation HTTP ${created.status}; ${tag} is still missing (HTTP 404)`,
    );
  const ref = await published.json();
  verifyBuildpackSource(revision, ref, policy);
  return verifyBuildpackSource(revision, ref, await protection());
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const command = process.argv[2] ?? "verify";
  if (!["verify", "publish"].includes(command))
    throw new Error("Expected verify or publish");
  if (process.env.GITHUB_REPOSITORY !== repository || !process.env.GH_TOKEN)
    throw new Error("Trusted repository and GitHub token required");
  const tag = await checkBuildpackSource(process.env.LZC_RELEASE_REVISION, {
    publish: command === "publish",
  });
  console.log(`Verified protected buildpack source: ${tag}`);
}
