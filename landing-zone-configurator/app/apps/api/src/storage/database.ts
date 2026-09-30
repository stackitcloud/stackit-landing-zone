import type pg from "pg";

export function databaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): pg.PoolConfig {
  const required = (key: string) => {
    const value = env[key];
    if (!value) throw new Error("Database configuration missing");
    return value;
  };
  const host = required("LZC_DATABASE_HOST");
  const port = Number(required("LZC_DATABASE_PORT"));
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Database port invalid");
  return {
    host,
    port,
    database: required("LZC_DATABASE_NAME"),
    user: required("LZC_DATABASE_USER"),
    password: required("LZC_DATABASE_PASSWORD"),
    ssl: { rejectUnauthorized: true, servername: host },
    max: 5,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
    query_timeout: 15000,
    statement_timeout: 10000,
    application_name: "landing-zone-configurator",
  };
}

export async function withTenant<T>(
  pool: pg.Pool,
  identity: { userId: string; tenantId: string },
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('lzc.user_id', $1, true), set_config('lzc.tenant_id', $2, true)",
      [identity.userId, identity.tenantId],
    );
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      broken = true;
    }
    throw error;
  } finally {
    client.release(broken);
  }
}
