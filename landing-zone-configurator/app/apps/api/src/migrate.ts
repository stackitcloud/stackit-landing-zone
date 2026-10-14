import { fileURLToPath } from "node:url";
import pg from "pg";
import { databaseConfig } from "./storage/database.js";
import { migrate, migrationFailure } from "./storage/migrations.js";

const client = new pg.Client(databaseConfig());
const runId = process.argv[2];
if (runId !== undefined && !/^\d+$/.test(runId))
  throw new Error("Invalid migration diagnostic run ID");
let phase = "connect";
let version: string | undefined;
try {
  await client.connect();
  phase = "migrate";
  await migrate(
    client,
    fileURLToPath(new URL("../db/", import.meta.url)),
    (file) => {
      version = file;
    },
  );
  console.log(
    JSON.stringify({ service: "database-migrations", runId, ok: true }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      service: "database-migrations",
      runId,
      ok: false,
      phase,
      version,
      error: migrationFailure(error),
    }),
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
