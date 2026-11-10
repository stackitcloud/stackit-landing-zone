import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { verifyReleaseManifest, releaseMode } from "./release-artifact.mjs";

export function productionRelease(metadata, release, revision) {
  if (!/^v(?:[2-9]|[1-9][0-9]+)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(release?.tag_name ?? "") || release.draft || release.prerelease || !release.published_at) throw new Error("Production requires a published stable GitHub Release");
  if (metadata?.schemaVersion !== 1 || metadata.repository !== "stackitcloud/stackit-landing-zone" || metadata.tag !== release.tag_name || metadata.revision !== revision || !/^[a-f0-9]{40}$/.test(revision ?? "") || !/^[1-9][0-9]*$/.test(String(metadata.runId))) throw new Error("Published release source binding is invalid");
  const mode = releaseMode(metadata.mode);
  if (!["qualified", "accepted-assistant-limitations"].includes(mode)) throw new Error("Dev exception artifacts cannot enter production");
  return metadata;
}
if (process.argv[2] === "metadata") {
  const tag = process.env.LZC_RELEASE_TAG;
  const value = {schemaVersion:1,repository:process.env.GITHUB_REPOSITORY,tag,revision:process.env.LZC_RELEASE_REVISION,runId:process.env.LZC_RELEASE_RUN_ID,mode:process.env.LZC_RELEASE_MODE};
  productionRelease(value,{tag_name:tag,draft:false,prerelease:false,published_at:new Date().toISOString()},value.revision);
  verifyReleaseManifest(resolve(".local"),{revision:value.revision,runId:value.runId,mode:value.mode});
  writeFileSync(".local/production-release.json",JSON.stringify(value),{flag:"wx",mode:0o600});
} else if (process.argv[2] === "source") {
  const repo = process.env.GITHUB_REPOSITORY;
  if (repo !== "stackitcloud/stackit-landing-zone") throw new Error("Unexpected repository");
  const tag = process.env.LZC_RELEASE_TAG;
  if (!/^v(?:[2-9]|[1-9][0-9]+)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(tag ?? "")) throw new Error("Invalid release tag");
  const gh = args => execFileSync("gh",args,{encoding:"utf8",stdio:["ignore","pipe","pipe"]});
  const release = JSON.parse(gh(["api",`repos/${repo}/releases/tags/${tag}`]));
  // gh release creates a lightweight tag; resolve annotated tags too without trusting target_commitish.
  let ref = JSON.parse(gh(["api",`repos/${repo}/git/ref/tags/${tag}`])).object;
  for(let depth=0;ref.type==="tag"&&depth<4;depth++) ref=JSON.parse(gh(["api",`repos/${repo}/git/tags/${ref.sha}`])).object;
  if (ref.type !== "commit") throw new Error("Release tag does not resolve to a commit");
  const metadata=JSON.parse(readFileSync(".local/production-release.json","utf8"));
  productionRelease(metadata,release,ref.sha);
  gh(["attestation","verify",".local/production-release.json","--repo",repo,"--signer-workflow",`${repo}/.github/workflows/configurator-production.yml`,"--source-ref","refs/heads/main","--source-digest",ref.sha,"--signer-digest",ref.sha,"--deny-self-hosted-runners"]);
  const run=JSON.parse(gh(["api",`repos/${repo}/actions/runs/${metadata.runId}`]));
  const jobs=JSON.parse(gh(["api",`repos/${repo}/actions/runs/${metadata.runId}/jobs?per_page=100`]));
  const names=metadata.mode==="qualified"?["build","assistant / assistant-live-qualification"]:["build-accepted-assistant-limitations"];
  if(run.head_sha!==ref.sha || run.path!==".github/workflows/configurator-release.yml" || run.head_branch!=="main" || run.event!=="workflow_dispatch" || run.run_attempt!==1 || run.conclusion!=="success" || run.head_repository?.full_name!==repo || !names.every(name=>jobs.jobs.some(job=>job.name===name&&job.conclusion==="success"))) throw new Error("Published assets do not originate from a successful trusted build");
  appendFileSync(process.env.GITHUB_OUTPUT,`revision=${metadata.revision}\nrun_id=${metadata.runId}\nmode=${metadata.mode}\n`);
}
