import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseEnv, promisify } from "node:util";

const exec = promisify(execFile);
const repoRoot = new URL("../../../", import.meta.url);
const projectFile = new URL("landing-zone-configurator.env", repoRoot);
const credentialFile = new URL(
  "landing-zone-configurator-credentials.json",
  repoRoot,
);

// Only aggregate metadata is printed. Tokens and raw service responses stay in memory.
// The only non-GET request is the CLI's short-lived authentication token exchange.
async function main() {
  const config = parseEnv(await readFile(projectFile, "utf8"));
  const project = config.PROJECT_ID;
  if (
    !project ||
    !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(project)
  ) {
    throw new Error("Invalid project configuration");
  }
  const region = config.REGION ?? "eu01";
  if (!["eu01", "eu02"].includes(region)) throw new Error("Unsupported region");
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("STACKIT_")),
  );
  const auth = await exec(
    "stackit",
    [
      "auth",
      "activate-service-account",
      "--service-account-key-path",
      fileURLToPath(credentialFile),
      "--only-print-access-token",
      "--verbosity",
      "error",
    ],
    { env, timeout: 30000 },
  );
  const token = auth.stdout.trim();
  if (!token || /\s/.test(token))
    throw new Error("Invalid authentication response");
  env.STACKIT_ACCESS_TOKEN = token;

  const counts = (data) => {
    if (Array.isArray(data)) return { items: data.length };
    if (!data || typeof data !== "object") return {};
    return Object.fromEntries(
      Object.entries(data)
        .filter(([, value]) => Array.isArray(value))
        .map(([key, value]) => [key, value.length]),
    );
  };
  const get = async (name, url) => {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
      const result = {
        check: name,
        httpStatus: response.status,
        ok: response.ok,
      };
      // STACKIT's ProjectEnabled helper maps this specific endpoint's 404 to disabled.
      if (name === "object-storage-status" && response.status === 404) {
        return {
          check: name,
          httpStatus: 404,
          ok: true,
          enabled: false,
          action: "provision-via-iac",
        };
      }
      if (response.ok) result.counts = counts(await response.json());
      return result;
    } catch {
      return { check: name, ok: false, error: "network-or-response-error" };
    }
  };
  const cli = async (name, args) => {
    try {
      const response = await exec(
        "stackit",
        [
          ...args,
          "--project-id",
          project,
          "--region",
          region,
          "--output-format",
          "json",
          "--verbosity",
          "error",
        ],
        { env, timeout: 30000 },
      );
      const data = JSON.parse(response.stdout);
      return {
        check: name,
        ok: true,
        counts: counts(data),
        ...(name === "project"
          ? { projectMatches: data.projectId === project }
          : {}),
      };
    } catch (error) {
      const raw = `${error.stdout ?? ""} ${error.stderr ?? ""}`;
      return {
        check: name,
        ok: false,
        error: /\b404\b/.test(raw) ? "not-found-404" : "cli-or-response-error",
      };
    }
  };
  const results = await Promise.all([
    cli("project", ["project", "describe"]),
    get(
      "cf-organizations",
      `https://scf.api.stackit.cloud/v1/projects/${project}/regions/${region}/organizations`,
    ),
    get(
      "cf-platforms",
      `https://scf.api.stackit.cloud/v1/projects/${project}/regions/${region}/platforms`,
    ),
    get(
      "postgres-instances",
      `https://postgres-flex-service.api.stackit.cloud/v3/projects/${project}/regions/${region}/instances`,
    ),
    get(
      "postgres-flavors",
      `https://postgres-flex-service.api.stackit.cloud/v3/projects/${project}/regions/${region}/flavors`,
    ),
    get(
      "secrets-instances",
      `https://secrets-manager.api.${region === "eu01" ? "" : `${region}.`}stackit.cloud/v1/projects/${project}/instances`,
    ),
    get(
      "model-catalog",
      `https://model-serving.api.stackit.cloud/v1/regions/${region}/models`,
    ),
    get(
      "object-storage-status",
      `https://object-storage.api.stackit.cloud/v2/project/${project}/regions/${region}`,
    ),
  ]);
  console.log(
    JSON.stringify(
      {
        region,
        regionSource: config.REGION ? "configured" : "default-probe-only",
        results,
      },
      null,
      2,
    ),
  );
  if (results.some((result) => !result.ok)) process.exitCode = 1;
}

main().catch(() => {
  console.error(
    "Platform check failed; credential and raw error details withheld.",
  );
  process.exitCode = 1;
});
