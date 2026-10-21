import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { buildApp } from "../apps/api/src/app.js";
import { Applications } from "../apps/api/src/applications/service.js";
import {
  AssistantModelServing,
  modelServingConfiguration,
} from "../apps/api/src/assistant/model-serving.js";
import { AssistantConversations } from "../apps/api/src/assistant/service.js";
import { GitHubClient } from "../apps/api/src/auth/github-client.js";
import {
  configuredStackitFlow,
  stackitCliClientId,
} from "../apps/api/src/auth/stackit-device.js";
import { StackitIdentities } from "../apps/api/src/auth/stackit-identities.js";
import { PostgresAuthStore } from "../apps/api/src/auth/store.js";
import { Configurations } from "../apps/api/src/configurations/service.js";
import { PostgresCloudCatalogues } from "../apps/api/src/credentials/catalogues.js";
import { parseServiceAccountKey } from "../apps/api/src/credentials/key.js";
import { LocalCredentialSecrets } from "../apps/api/src/credentials/local-secrets.js";
import { PostgresCredentialProfiles } from "../apps/api/src/credentials/profiles.js";
import { Backends } from "../apps/api/src/deployments/backends.js";
import { Preparations } from "../apps/api/src/deployments/preparations.js";
import { Invitations } from "../apps/api/src/organisation/invitations.js";
import { PostgresOrganisations } from "../apps/api/src/organisation/service.js";
import { CloudFoundryPlanRunner } from "../apps/api/src/plans/cloud-foundry.js";
import { localArtifactCrypto } from "../apps/api/src/plans/crypto.js";
import { PlatformExecution } from "../apps/api/src/plans/execution.js";
import { LocalPlanRunner } from "../apps/api/src/plans/local.js";
import { Plans } from "../apps/api/src/plans/service.js";
import { migrate } from "../apps/api/src/storage/migrations.js";
import {
  createDevelopmentSession,
  developmentLogin,
  openDevelopmentAccount,
} from "./development-auth.js";
import { openStackitCodeCallback } from "./stackit-code-callback.js";

const workstation = process.argv.includes("--development");
if (
  workstation &&
  (process.env.NODE_ENV === "production" || process.env.VCAP_APPLICATION)
)
  throw new Error(
    "Development authentication is not available in hosted runtimes",
  );
if (
  !workstation &&
  (process.env.LZC_STACKIT_CLIENT_ID ?? stackitCliClientId) ===
    stackitCliClientId &&
  process.env.LZC_STACKIT_CLI_CLIENT_APPROVED !== "true"
) {
  throw new Error("Explicit STACKIT CLI client approval required");
}

const container = "lzc-local-stackit-login";
const database = "configurator_local";
const origin = workstation
  ? (process.env.LZC_DEVELOPMENT_ORIGIN ??
    "https://work.lukas.runs.onstackit.cloud:4181")
  : "http://127.0.0.1:4181";
if (
  workstation &&
  (new URL(origin).protocol !== "https:" || new URL(origin).origin !== origin)
)
  throw new Error("Canonical HTTPS development origin required");
const runtimeRole = workstation
  ? "configurator_development"
  : "configurator_app";
const localExecution = process.argv.includes("--execution");
const assistantModel =
  process.env.LZC_ASSISTANT_ENABLED === "true"
    ? new AssistantModelServing(modelServingConfiguration(process.env))
    : undefined;
let stage = "database";

function docker(args: string[], input?: string) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    ...(input === undefined ? {} : { input }),
    timeout: 120000,
  });
  if (result.status !== 0) throw new Error("Local database command failed");
  return result.stdout;
}

async function start() {
  stage = "listener-check";
  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(3000, "127.0.0.1", () => {
      probe.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });
  stage = "database";
  const inspected = spawnSync("docker", ["inspect", container], {
    encoding: "utf8",
  });
  if (inspected.status === 0) {
    const existing = JSON.parse(inspected.stdout)[0];
    if (existing.Config.Labels?.["io.stackit.lzc.local-login"] !== "true")
      throw new Error("Refusing an unmanaged local database");
    if (!existing.State.Running) docker(["start", container]);
  } else {
    docker([
      "run",
      "--detach",
      "--name",
      container,
      "--label",
      "io.stackit.lzc.local-login=true",
      "--publish",
      "127.0.0.1::5432",
      "--env",
      `POSTGRES_DB=${database}`,
      "--env",
      `POSTGRES_PASSWORD=${randomBytes(32).toString("base64url")}`,
      "postgres:17",
    ]);
  }
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    const result = spawnSync("docker", [
      "exec",
      container,
      "pg_isready",
      "-h",
      "127.0.0.1",
      "-U",
      "postgres",
      "-d",
      database,
    ]);
    if (result.status === 0) {
      ready = true;
      break;
    }
    await setTimeout(250);
  }
  if (!ready) throw new Error("Local database not ready");
  const ports = JSON.parse(
    docker([
      "inspect",
      "--format",
      "{{json .NetworkSettings.Ports}}",
      container,
    ]),
  );
  const binding = ports["5432/tcp"]?.[0];
  if (binding?.HostIp !== "127.0.0.1" || !/^\d+$/.test(binding.HostPort))
    throw new Error("Refusing a non-loopback database binding");
  const migrationPassword = randomBytes(32).toString("base64url");
  const runtimePassword = randomBytes(32).toString("base64url");
  docker(
    [
      "exec",
      "--interactive",
      container,
      "psql",
      "--no-psqlrc",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      database,
    ],
    `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='configurator_migration') THEN
        CREATE ROLE configurator_migration LOGIN;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='configurator_app') THEN
        CREATE ROLE configurator_app LOGIN;
      END IF;
      ${workstation ? "IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='configurator_development') THEN CREATE ROLE configurator_development LOGIN; END IF;" : ""}
    END $$;
    ALTER ROLE configurator_migration PASSWORD '${migrationPassword}';
    ${workstation ? "GRANT configurator_app TO configurator_development;" : ""}
    ALTER ROLE ${runtimeRole} PASSWORD '${runtimePassword}';
    ALTER DATABASE configurator_local OWNER TO configurator_migration;
  `,
  );
  const connection = {
    host: "127.0.0.1",
    port: Number(binding.HostPort),
    database,
  };
  stage = "migrations";
  const migration = new pg.Client({
    ...connection,
    user: "configurator_migration",
    password: migrationPassword,
  });
  const developmentAccount = workstation
    ? await openDevelopmentAccount(
        fileURLToPath(new URL("../../.local/development/", import.meta.url)),
      )
    : undefined;
  try {
    await migration.connect();
    await migrate(
      migration,
      fileURLToPath(new URL("../apps/api/db/", import.meta.url)),
    );
    if (developmentAccount) {
      await migration.query(
        await readFile(
          new URL("./development-auth.sql", import.meta.url),
          "utf8",
        ),
      );
      await migration.query(
        "SELECT lzc_auth.provision_development_account($1,$2)",
        [developmentAccount.id, developmentAccount.username],
      );
    }
  } finally {
    await migration.end();
  }
  const pool = new pg.Pool({
    ...connection,
    user: runtimeRole,
    password: runtimePassword,
  });
  pool.on("error", () => {
    console.error("Local database connection failed");
  });
  const organisations = new PostgresOrganisations(pool);
  stage = "local-secrets";
  const secrets = await LocalCredentialSecrets.open(
    fileURLToPath(new URL("../../.local/credential-secrets/", import.meta.url)),
  );
  const profiles = new PostgresCredentialProfiles(pool, secrets);
  const credentialFlag = process.argv.indexOf("--service-account-file");
  if (credentialFlag !== -1) {
    stage = "development-credentials";
    const path = process.argv[credentialFlag + 1];
    if (!developmentAccount || !path || path.startsWith("--"))
      throw new Error(
        "Development account and explicit private credential file required",
      );
    const file = await lstat(path);
    if (
      !file.isFile() ||
      file.uid !== process.getuid?.() ||
      (file.mode & 0o077) !== 0 ||
      file.size > 32768
    )
      throw new Error("Private development credential file required");
    const key = parseServiceAccountKey(
      JSON.parse(await readFile(path, "utf8")),
    );
    const store = new PostgresAuthStore(pool);
    const token = await createDevelopmentSession(pool, developmentAccount.id);
    try {
      const session = await store.resolveSession(token);
      if (!session) throw new Error("Development credential session missing");
      let profile = (await profiles.list(session)).find(
        (p) =>
          p.keyId === key.credentials.kid &&
          p.serviceAccount === key.credentials.iss,
      );
      if (!profile) {
        await profiles.create(session, "Ubuntu-Entwicklung", key);
        profile = (await profiles.list(session)).find(
          (p) =>
            p.keyId === key.credentials.kid &&
            p.serviceAccount === key.credentials.iss,
        );
      }
      if (profile?.state !== "stored")
        throw new Error("Development credential storage incomplete");
      const organizationFlag = process.argv.indexOf("--organization");
      if (organizationFlag !== -1) {
        const organization = process.argv[organizationFlag + 1];
        if (
          !organization ||
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
            organization,
          )
        )
          throw new Error("Explicit organization UUID required");
        const check = await profiles.check(session, profile.id, organization);
        console.log(
          JSON.stringify({
            event: "development_credential_check",
            status: check.status,
            code: check.code,
          }),
        );
        if (check.status !== "passed")
          throw new Error("Development credential access check failed");
      }
      console.log(
        JSON.stringify({
          event: "development_credential_stored",
          encrypted: true,
        }),
      );
    } finally {
      await store.deleteSession(token);
    }
  }
  const unavailable = async (): Promise<never> => {
    throw new Error("GitHub disabled in local login mode");
  };
  let plans: Plans | undefined;
  const crypto = await localArtifactCrypto(
    fileURLToPath(
      new URL("../../.local/artifacts/master.key", import.meta.url),
    ),
  );
  const backends = new Backends(pool, crypto);
  let platformUpgradeEnabled = false;
  if (localExecution || process.env.LZC_EXECUTION_ENABLED === "true") {
    const required = (key: string) => {
      const value = process.env[key];
      if (!value)
        throw new Error(
          "Local execution requires an explicitly configured runner",
        );
      return value;
    };
    const local = localExecution || process.env.LZC_RUNNER_KIND === "local";
    if (
      process.env.LZC_RUNNER_KIND &&
      !["local", "cloud-foundry"].includes(process.env.LZC_RUNNER_KIND)
    )
      throw new Error("Invalid local execution runner kind");
    const runner = local
      ? await LocalPlanRunner.open(
          process.env.LZC_RUNNER_PACKAGE_DIR ??
            fileURLToPath(
              new URL("../../.local/runner-local/", import.meta.url),
            ),
          join(homedir(), ".local/share/landing-zone-configurator/runner-jobs"),
        )
      : new CloudFoundryPlanRunner({
          username: required("LZC_RUNNER_CF_USERNAME"),
          password: required("LZC_RUNNER_CF_PASSWORD"),
          spaceId: required("LZC_RUNNER_SPACE_ID"),
          templateId: required("LZC_RUNNER_TEMPLATE_ID"),
        });
    platformUpgradeEnabled =
      runner.supportsAccelerator?.(
        "9e7fb46c329aca32e878ce1f0ea3b944ea240354",
      ) === true;
    plans = new Plans(
      pool,
      profiles,
      secrets,
      { prepareSnapshot: unavailable },
      runner,
      local ? "http://127.0.0.1:3000" : origin,
      new PlatformExecution(crypto, backends),
    );
  }
  let applicationRunner: LocalPlanRunner | undefined;
  if (process.env.LZC_APPLICATION_EXECUTION_ENABLED === "true") {
    stage = "application-runner";
    const packageRoot = process.env.LZC_APPLICATION_RUNNER_PACKAGE_DIR;
    if (
      (!localExecution && process.env.LZC_RUNNER_KIND !== "local") ||
      !packageRoot
    )
      throw new Error(
        "Application execution requires an explicitly selected local runner package",
      );
    applicationRunner = await LocalPlanRunner.open(
      packageRoot,
      join(
        homedir(),
        ".local/share/landing-zone-configurator/application-runner-jobs",
      ),
      "application",
    );
  }
  const applications = new Applications(
    pool,
    profiles,
    secrets,
    backends,
    applicationRunner
      ? { runner: applicationRunner, origin: "http://127.0.0.1:3000" }
      : undefined,
    crypto,
    plans,
    {
      recoveryReviewsEnabled:
        process.env.LZC_APPLICATION_RECOVERY_REVIEWS_ENABLED === "true",
    },
  );
  stage = "api";
  let codeCallback:
    | Awaited<ReturnType<typeof openStackitCodeCallback>>
    | undefined;
  const app = buildApp({
    ...(developmentAccount
      ? { developmentLogin: developmentLogin(pool, developmentAccount) }
      : {}),
    ...(workstation
      ? {
          webRoot: fileURLToPath(new URL("../apps/web/dist/", import.meta.url)),
        }
      : {}),
    backends,
    auth: {
      origin,
      primaryStackit: !workstation,
      githubEnabled: false,
      allowLoopbackHttp: !workstation,
      clientId: "",
      store: new PostgresAuthStore(pool),
      github: new GitHubClient({
        clientId: "",
        clientSecret: "",
        callback: `${origin}/auth/github/callback`,
      }),
      tokens: { get: unavailable, put: unavailable, remove: unavailable },
    },
    ...(!workstation
      ? {
          stackit: {
            identities: new StackitIdentities(pool),
            organisations,
            authFlow: "authorization-code",
            createFlow: (organizationId, purpose = "login") => {
              if (!codeCallback) throw new Error("cli_callback_unavailable");
              return configuredStackitFlow({
                ...process.env,
                LZC_STACKIT_AUTH_FLOW:
                  process.env.LZC_STACKIT_AUTH_FLOW ?? "authorization-code",
                LZC_STACKIT_CLIENT_ID:
                  process.env.LZC_STACKIT_CLIENT_ID ?? stackitCliClientId,
                LZC_STACKIT_REDIRECT_URI:
                  process.env.LZC_STACKIT_REDIRECT_URI ??
                  codeCallback.redirectUri,
                LZC_PUBLIC_ORIGIN: origin,
              })(organizationId, purpose);
            },
          },
        }
      : {}),
    organisations,
    invitations: new Invitations(pool),
    configurations: new Configurations(pool),
    ...(assistantModel
      ? {
          assistant: new AssistantConversations(
            pool,
            assistantModel,
            new PostgresCloudCatalogues(pool, secrets),
          ),
        }
      : {}),
    preparations: new Preparations(
      pool,
      { prepareSnapshot: unavailable },
      profiles,
      platformUpgradeEnabled,
    ),
    applications,
    ...(applicationRunner
      ? {
          applicationRunner: {
            applications,
            binding: {
              runnerPackageId: applicationRunner.packageId,
              acceleratorRevision: applicationRunner.acceleratorCommit,
              providerLockSha256:
                "d40debbff204aee590c2a76d09f6ad3234643329b438fd5c6497de60687f6fa5",
            },
          },
        }
      : {}),
    credentials: profiles,
    catalogues: new PostgresCloudCatalogues(pool, secrets),
    ...(plans ? { plans } : {}),
  });
  let maintaining = false;
  const maintenance = plans
    ? setInterval(() => {
        if (maintaining) return;
        maintaining = true;
        void plans
          ?.maintain()
          .catch(() =>
            app.log.warn(
              { event: "plan_cleanup_failed" },
              "Plan cleanup failed",
            ),
          )
          .finally(() => {
            maintaining = false;
          });
      }, 30000)
    : undefined;
  maintenance?.unref();
  app.addHook("onClose", async () => {
    clearInterval(maintenance);
    await codeCallback?.close();
    await pool.end();
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void app.close();
    });
  }
  try {
    stage = "listener";
    if (!workstation) codeCallback = await openStackitCodeCallback(origin);
    await app.listen({ host: "127.0.0.1", port: 3000 });
    console.log(
      workstation
        ? `Development login ready; UI: ${origin}/; account password stays in the private .local/development directory.`
        : "Local STACKIT login ready; UI: http://127.0.0.1:4181/",
    );
  } catch (error) {
    await app.close();
    throw error;
  }
}

void start().catch(() => {
  console.error(
    `Local STACKIT login startup failed (${stage}); no credentials logged.`,
  );
  process.exitCode = 1;
});
