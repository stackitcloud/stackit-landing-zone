import { fileURLToPath } from "node:url";
import pg from "pg";
import { databaseConfig } from "./storage/database.js";
import { migrate } from "./storage/migrations.js";

const client = new pg.Client(databaseConfig());
try {
  await client.connect();
  await migrate(client, fileURLToPath(new URL("../db/", import.meta.url)));
  console.log(JSON.stringify({ service: "database-migrations", ok: true }));
} catch {
  // SQL errors can contain credential-bearing input or private schema values.
  console.error(JSON.stringify({ service: "database-migrations", ok: false }));
  process.exitCode = 1;
} finally {
  await client.end();
}
