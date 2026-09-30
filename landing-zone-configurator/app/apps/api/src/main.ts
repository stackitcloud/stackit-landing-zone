import pg from "pg";
import { buildApp } from "./app.js";
import { GitHubClient } from "./auth/github-client.js";
import type { AuthServices } from "./auth/routes.js";
import { SecretsManagerTokenStore } from "./auth/secrets.js";
import { PostgresAuthStore } from "./auth/store.js";
import { PostgresCredentialProfiles } from "./credentials/profiles.js";
import { VaultCredentialSecrets } from "./credentials/secrets.js";
import { Preparations } from "./deployments/preparations.js";
import { Repositories } from "./github/repositories.js";
import { databaseConfig } from "./storage/database.js";
import { VaultConnection } from "./storage/vault.js";

let pool: pg.Pool | undefined;
let auth: AuthServices | undefined;
let credentials: PostgresCredentialProfiles | undefined;
if (process.env.LZC_AUTH_ENABLED === "true") {
  const required = (key: string) => {
    const value = process.env[key];
    if (!value) throw new Error("Authentication configuration incomplete");
    return value;
  };
  const origin = required("LZC_PUBLIC_ORIGIN");
  const clientId = required("LZC_GITHUB_CLIENT_ID");
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
  credentials = new PostgresCredentialProfiles(
    pool,
    new VaultCredentialSecrets(new VaultConnection(secretConfig)),
  );
  await pool.query("SELECT id FROM lzc.credential_profiles LIMIT 0");
  auth = {
    origin,
    clientId,
    store: new PostgresAuthStore(pool),
    github: new GitHubClient({
      clientId,
      clientSecret: required("LZC_GITHUB_CLIENT_SECRET"),
      callback: `${origin}/auth/github/callback`,
    }),
    tokens: new SecretsManagerTokenStore(secretConfig),
  };
}

const repositories = new Repositories();
const app = buildApp({
  repositories,
  ...(pool && credentials
    ? { preparations: new Preparations(pool, repositories, credentials) }
    : {}),
  ...(process.env.LZC_WEB_ROOT ? { webRoot: process.env.LZC_WEB_ROOT } : {}),
  ...(auth ? { auth } : {}),
  ...(credentials ? { credentials } : {}),
});
app.addHook("onClose", async () => {
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
