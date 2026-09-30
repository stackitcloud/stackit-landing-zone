import pg from "pg";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error("missing-configuration");
  return value;
}

export async function checkDatabase(): Promise<void> {
  const host = required("LZC_DATABASE_HOST");
  const client = new pg.Client({
    host,
    port: Number(required("LZC_DATABASE_PORT")),
    database: required("LZC_DATABASE_NAME"),
    user: required("LZC_DATABASE_USER"),
    password: required("LZC_DATABASE_PASSWORD"),
    ssl: { rejectUnauthorized: true, servername: host },
    connectionTimeoutMillis: 15000,
    query_timeout: 15000,
    statement_timeout: 10000,
    application_name: "lzc-connectivity-check",
  });
  try {
    await client.connect();
    const result = await client.query<{ ssl: boolean }>(
      "SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()",
    );
    if (result.rows[0]?.ssl !== true) throw new Error("tls-required");
    await client.query("SELECT 1");
  } finally {
    await client.end();
  }
}

export async function checkSecrets(): Promise<void> {
  const address = required("LZC_SECRETS_ADDRESS");
  if (address !== "https://prod.sm.eu01.stackit.cloud")
    throw new Error("unexpected-service-address");
  const instance = required("LZC_SECRETS_INSTANCE_ID");
  if (!/^[a-f0-9-]{36}$/.test(instance)) throw new Error("invalid-instance");
  const request = (path: string, init: RequestInit) =>
    fetch(`${address}/v1/${path}`, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  const login = await request(
    `auth/userpass/login/${encodeURIComponent(required("LZC_SECRETS_USERNAME"))}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: required("LZC_SECRETS_PASSWORD") }),
    },
  );
  if (!login.ok) throw new Error(`login-http-${login.status}`);
  const auth = (await login.json()) as { auth?: { client_token?: string } };
  const token = auth.auth?.client_token;
  if (!token) throw new Error("missing-session-token");
  const headers = {
    "X-Vault-Token": token,
    "Content-Type": "application/json",
  };
  let revokeSucceeded = false;
  try {
    // Verify the instance-specific read policy, without reading any tenant secrets.
    const path = `${instance}/data/configurator/connectivity-probe`;
    const capabilities = await request("sys/capabilities-self", {
      method: "POST",
      headers,
      body: JSON.stringify({ paths: [path] }),
    });
    if (!capabilities.ok)
      throw new Error(`capabilities-http-${capabilities.status}`);
    const data = (await capabilities.json()) as Record<string, unknown>;
    const permissions = data[path];
    if (
      !Array.isArray(permissions) ||
      !permissions.includes("read") ||
      permissions.includes("create") ||
      permissions.includes("update")
    ) {
      throw new Error("unexpected-runtime-policy");
    }
    const listing = await request(`${instance}/metadata/?list=true`, {
      headers,
    });
    // An empty, authorized KV store returns 404. A denied request returns 403.
    if (listing.status !== 200 && listing.status !== 404)
      throw new Error(`metadata-http-${listing.status}`);
    await listing.arrayBuffer(); // Discard secret names; never log responses.
  } finally {
    const revoked = await request("auth/token/revoke-self", {
      method: "POST",
      headers,
    });
    revokeSucceeded = revoked.ok;
  }
  if (!revokeSucceeded) throw new Error("session-revoke-failed");
}

export function safeFailure(error: unknown): string {
  // Raw network/driver errors may contain credentials or service responses.
  if (
    error instanceof Error &&
    /^(missing-configuration|tls-required|unexpected-service-address|invalid-instance|missing-session-token|unexpected-runtime-policy|session-revoke-failed|(?:login|capabilities|metadata)-http-\d{3})$/.test(
      error.message,
    )
  )
    return error.message;
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  return /^(ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ECONNRESET|CERT_HAS_EXPIRED|UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT_IN_CHAIN|DEPTH_ZERO_SELF_SIGNED_CERT|ERR_TLS_CERT_ALTNAME_INVALID|28P01|28000|42501|3D000)$/.test(
    code,
  )
    ? code
    : "connection-or-response-failed";
}
