import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = "stackitcloud/stackit-landing-zone";
const artifactFiles = ["release.tar.gz", "runner.tar.gz"];

function checksum(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function validSource(source) {
  if (
    !/^[a-f0-9]{40}$/.test(source.revision) ||
    !/^[1-9][0-9]*$/.test(String(source.runId)) ||
    !Number.isSafeInteger(Number(source.runId))
  )
    throw new Error("Invalid immutable release source");
}

export function createReleaseManifest(directory, source) {
  validSource(source);
  const manifest = {
    schemaVersion: 1,
    sourceRevision: source.revision,
    releaseRunId: String(source.runId),
    artifacts: Object.fromEntries(
      artifactFiles.map((name) => [name, checksum(resolve(directory, name))]),
    ),
  };
  writeFileSync(
    resolve(directory, "release-manifest.json"),
    JSON.stringify(manifest),
    { flag: "wx", mode: 0o600 },
  );
  return manifest;
}

export function verifyReleaseManifest(directory, source) {
  validSource(source);
  const manifest = JSON.parse(
    readFileSync(resolve(directory, "release-manifest.json"), "utf8"),
  );
  if (
    manifest.schemaVersion !== 1 ||
    manifest.sourceRevision !== source.revision ||
    manifest.releaseRunId !== String(source.runId) ||
    !manifest.artifacts ||
    Object.keys(manifest.artifacts).sort().join(",") !==
      [...artifactFiles].sort().join(",")
  )
    throw new Error("Release manifest does not match the approved build");
  for (const name of artifactFiles)
    if (manifest.artifacts[name] !== checksum(resolve(directory, name)))
      throw new Error(`Release artifact checksum mismatch: ${name}`);
  return manifest;
}

export function approvedReleaseSource(run, jobs, artifacts, runId) {
  validSource({ revision: run.head_sha, runId });
  if (
    run.id !== Number(runId) ||
    run.run_attempt !== 1 ||
    run.path !== ".github/workflows/configurator-release.yml" ||
    run.head_repository?.full_name !== repository ||
    !["main", "feature/landing-zone-configurator"].includes(run.head_branch) ||
    !["push", "workflow_dispatch"].includes(run.event) ||
    !jobs.some(
      (job) =>
        job.name === "build" &&
        job.status === "completed" &&
        job.conclusion === "success",
    )
  )
    throw new Error("Only successful trusted release builds can be promoted");
  const matches = artifacts.filter(
    (artifact) => artifact.name === `configurator-release-${runId}`,
  );
  if (
    matches.length !== 1 ||
    matches[0].expired ||
    matches[0].workflow_run?.id !== run.id ||
    matches[0].workflow_run?.head_sha !== run.head_sha ||
    !Number.isSafeInteger(matches[0].id)
  )
    throw new Error("Immutable release artifact is missing or has expired");
  return {
    revision: run.head_sha,
    runId: String(runId),
    artifactId: String(matches[0].id),
  };
}

async function resolveSource() {
  if (process.env.GITHUB_REPOSITORY !== repository)
    throw new Error("Unexpected release repository");
  const runId = process.env.LZC_RELEASE_RUN_ID;
  if (!/^[1-9][0-9]*$/.test(runId ?? ""))
    throw new Error("A numeric release build run ID is required");
  const request = async (path) => {
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
      headers: {
        Authorization: `Bearer ${process.env.GH_TOKEN ?? ""}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Release metadata HTTP ${response.status}`);
    return response.json();
  };
  const [run, jobs, artifacts] = await Promise.all([
    request(`actions/runs/${runId}`),
    request(`actions/runs/${runId}/jobs?per_page=100`),
    request(`actions/runs/${runId}/artifacts?per_page=100`),
  ]);
  const source = approvedReleaseSource(run, jobs.jobs, artifacts.artifacts, runId);
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `release_revision=${source.revision}\nrelease_run_id=${source.runId}\nartifact_id=${source.artifactId}\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = {
    revision: process.env.LZC_RELEASE_REVISION ?? process.env.GITHUB_SHA,
    runId: process.env.LZC_RELEASE_RUN_ID ?? process.env.GITHUB_RUN_ID,
  };
  if (process.argv[2] === "source") await resolveSource();
  else if (process.argv[2] === "create")
    createReleaseManifest(resolve(process.argv[3]), source);
  else if (process.argv[2] === "verify")
    verifyReleaseManifest(resolve(process.argv[3]), source);
  else throw new Error("Expected create, verify or source");
}