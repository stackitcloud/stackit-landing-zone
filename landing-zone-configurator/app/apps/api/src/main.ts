import pg from "pg";
import { buildApp } from "./app.js";
import { Applications } from "./applications/service.js";
import { GitHubClient } from "./auth/github-client.js";
import type { AuthServices } from "./auth/routes.js";
import { SecretsManagerTokenStore } from "./auth/secrets.js";
import { StackitIdentities } from "./auth/stackit-identities.js";
import type { StackitServices } from "./auth/stackit-routes.js";
import { PostgresAuthStore } from "./auth/store.js";
import { Configurations } from "./configurations/service.js";
import { PostgresCloudCatalogues } from "./credentials/catalogues.js";
import { PostgresCredentialProfiles } from "./credentials/profiles.js";
import { VaultCredentialSecrets } from "./credentials/secrets.js";
import { Backends } from "./deployments/backends.js";
import { Preparations } from "./deployments/preparations.js";
import { Repositories } from "./github/repositories.js";
import { Invitations } from "./organisation/invitations.js";
import { PostgresOrganisations } from "./organisation/service.js";
import { CloudFoundryPlanRunner } from "./plans/cloud-foundry.js";
import { ArtifactCrypto } from "./plans/crypto.js";
import { PlatformExecution } from "./plans/execution.js";
import { Plans } from "./plans/service.js";
import { databaseConfig } from "./storage/database.js";
import { VaultConnection } from "./storage/vault.js";

const repositories = new Repositories();
let plans: Plans | undefined;
let backends: Backends | undefined;
let catalogues: PostgresCloudCatalogues | undefined;
let pool: pg.Pool | undefined;
let auth: AuthServices | undefined;
let credentials: PostgresCredentialProfiles | undefined;
let applications: Applications | undefined;
let stackit: StackitServices | undefined;
const executionEnabled = process.env.LZC_EXECUTION_ENABLED === "true";
const artifactCrypto = executionEnabled
  ? new ArtifactCrypto(process.env.LZC_DEPLOYMENT_ARTIFACT_KEY ?? "")
  : undefined;
if (
  executionEnabled &&
  (process.env.LZC_AUTH_ENABLED !== "true" ||
    process.env.LZC_PLANS_ENABLED !== "true")
)
  throw new Error(
    "Execution requires authentication and plan runner configuration",
  );
if (process.env.LZC_AUTH_ENABLED === "true") {
  const required = (key: string) => {
    const value = process.env[key];
    if (!value) throw new Error("Authentication configuration incomplete");
    return value;
  };
  const origin = required("LZC_PUBLIC_ORIGIN");
  const primaryStackit = process.env.LZC_STACKIT_DEVICE_ENABLED === "true";
  const clientId = process.env.LZC_GITHUB_CLIENT_ID ?? "";
  const clientSecret = process.env.LZC_GITHUB_CLIENT_SECRET ?? "";
  if (
    (!primaryStackit && (!clientId || !clientSecret)) ||
    !!clientId !== !!clientSecret
  )
    throw new Error("GitHub configuration incomplete");
  pool = new pg.Pool(databaseConfig());
  pool.on("error", () => {
    console.error(JSON.stringify({ event: "database_pool_error" }));
  });
  // Readiness is checked before opening the HTTP listener.
  await pool.query("SELECT * FROM lzc_auth.resolve_session($1)", [
    "startup-readiness-not-a-token",
  ]);
  const secretConfig = {
    address: required("LZC_SECRETS_ADDRESS"),
    instance: required("LZC_SECRETS_INSTANCE_ID"),
    username: required("LZC_SECRETS_USERNAME"),
    password: required("LZC_SECRETS_PASSWORD"),
  };
  const credentialSecrets = new VaultCredentialSecrets(
    new VaultConnection(secretConfig),
  );
  credentials = new PostgresCredentialProfiles(pool, credentialSecrets);
  catalogues = new PostgresCloudCatalogues(pool, credentialSecrets);
  backends = artifactCrypto ? new Backends(pool, artifactCrypto) : undefined;
  if (process.env.LZC_PLANS_ENABLED === "true") {
    plans = new Plans(
      pool,
      credentials,
      credentialSecrets,
      repositories,
      new CloudFoundryPlanRunner({
        username: required("LZC_RUNNER_CF_USERNAME"),
        password: required("LZC_RUNNER_CF_PASSWORD"),
        spaceId: required("LZC_RUNNER_SPACE_ID"),
        templateId: required("LZC_RUNNER_TEMPLATE_ID"),
      }),
      origin,
      artifactCrypto
        ? new PlatformExecution(artifactCrypto, backends)
        : undefined,
      (session) => new SecretsManagerTokenStore(secretConfig).get(session),
    );
  }
  await pool.query("SELECT id FROM lzc.credential_profiles LIMIT 0");
  await pool.query("SELECT id FROM lzc.configurations LIMIT 0");
  if (process.env.LZC_APPLICATIONS_ENABLED === "true") {
    await pool.query(
      "SELECT id FROM lzc.application_template_versions LIMIT 0",
    );
    applications = new Applications(pool, credentials, credentialSecrets);
  }
  auth = {
    origin,
    clientId,
    primaryStackit,
    githubEnabled: !!clientId,
    store: new PostgresAuthStore(pool),
    github: new GitHubClient({
      clientId,
      clientSecret,
      callback: `${origin}/auth/github/callback`,
    }),
    tokens: new SecretsManagerTokenStore(secretConfig),
  };
  if (process.env.LZC_STACKIT_DEVICE_ENABLED === "true") {
    if (process.env.LZC_STACKIT_CLI_CLIENT_APPROVED !== "true")
      throw new Error(
        "STACKIT CLI client use must be explicitly approved before enabling Device integration",
      );
    await pool.query("SELECT user_id FROM lzc.stackit_identities LIMIT 0");
    await pool.query(
      "SELECT user_id FROM lzc.stackit_organization_access LIMIT 0",
    );
    stackit = {
      identities: new StackitIdentities(pool),
      organisations: new PostgresOrganisations(pool),
    };
  }
}

const app = buildApp({
  repositories,
  ...(pool
    ? {
        organisations: new PostgresOrganisations(pool),
        configurations: new Configurations(pool),
        invitations: new Invitations(pool),
      }
    : {}),
  ...(catalogues ? { catalogues } : {}),
  ...(applications ? { applications } : {}),
  ...(plans ? { plans } : {}),
  ...(backends ? { backends } : {}),
  ...(pool && credentials
    ? { preparations: new Preparations(pool, repositories, credentials) }
    : {}),
  ...(process.env.LZC_WEB_ROOT ? { webRoot: process.env.LZC_WEB_ROOT } : {}),
  ...(auth ? { auth } : {}),
  ...(stackit ? { stackit } : {}),
  ...(credentials ? { credentials } : {}),
});
let maintaining = false;
const maintenance = plans
  ? setInterval(() => {
      if (maintaining) return;
      maintaining = true;
      void plans
        ?.maintain()
        .catch(() =>
          app.log.warn({ event: "plan_cleanup_failed" }, "Plan cleanup failed"),
        )
        .finally(() => {
          maintaining = false;
        });
    }, 30000)
  : undefined;
maintenance?.unref();
app.addHook("onClose", async () => {
  clearInterval(maintenance);
  await pool?.end();
});
const port = Number(process.env.PORT ?? "3000");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    void app.close().catch(() => {
      process.exitCode = 1;
    });
  });
}
try {
  await app.listen({ port, host: process.env.HOST ?? "127.0.0.1" });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
