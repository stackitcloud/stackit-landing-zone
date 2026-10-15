import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = "stackitcloud/stackit-landing-zone";
export function buildpackTag(revision) {
  if (!/^[a-f0-9]{40}$/.test(revision ?? ""))
    throw new Error("Invalid buildpack source revision");
  return `lzc-image-buildpack-${revision}`;
}

export function verifyBuildpackSource(revision, ref, policy) {
  const tag = buildpackTag(revision);
  const names = policy.conditions?.ref_name;
  if (
    ref.ref !== `refs/tags/${tag}` ||
    ref.object?.type !== "commit" ||
    ref.object.sha !== revision ||
    policy.name !== "Protect LZC buildpack tags" ||
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
  return tag;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.env.GITHUB_REPOSITORY !== repository || !process.env.GH_TOKEN)
    throw new Error("Trusted repository and read-only GitHub token required");
  const revision = process.env.LZC_RELEASE_REVISION;
  const tag = buildpackTag(revision);
  async function request(path) {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/${path}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.GH_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok)
      throw new Error(`Buildpack source metadata HTTP ${response.status}`);
    return response.json();
  }
  const [ref, policies] = await Promise.all([
    request(`git/ref/tags/${tag}`),
    request("rulesets?per_page=100"),
  ]);
  const matches = policies.filter(
    (policy) => policy.name === "Protect LZC buildpack tags",
  );
  if (matches.length !== 1)
    throw new Error("Unique buildpack tag protection required");
  const policy = await request(`rulesets/${matches[0].id}`);
  verifyBuildpackSource(revision, ref, policy);
  console.log(`Verified protected buildpack source: ${tag}`);
}
