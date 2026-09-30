import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type pg from "pg";

export async function migrate(
  client: pg.Client,
  directory: string,
): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(17804291)");
    const role = await client.query<{ current_user: string }>(
      "SELECT current_user",
    );
    if (role.rows[0]?.current_user !== "configurator_migration")
      throw new Error("Migration identity required");
    await client.query(
      "CREATE TABLE IF NOT EXISTS public.lzc_schema_migrations (version text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    await client.query(
      "REVOKE ALL ON public.lzc_schema_migrations FROM PUBLIC, configurator_app",
    );
    const applied = await client.query<{ version: string; sha256: string }>(
      "SELECT version, sha256 FROM public.lzc_schema_migrations",
    );
    const known = new Map(applied.rows.map((row) => [row.version, row.sha256]));
    const files = (await readdir(directory))
      .filter((file) => /^\d{3}_[a-z_]+\.sql$/.test(file))
      .sort();
    if (!files.length) throw new Error("Migration files missing");
    for (const version of known.keys())
      if (!files.includes(version))
        throw new Error("Applied migration missing from release");
    for (const file of files) {
      const sql = await readFile(join(directory, file), "utf8");
      const hash = createHash("sha256").update(sql).digest("hex");
      if (known.has(file)) {
        if (known.get(file) !== hash)
          throw new Error("Applied migration was modified");
        continue;
      }
      await client.query(sql);
      await client.query(
        "INSERT INTO public.lzc_schema_migrations(version, sha256) VALUES($1, $2)",
        [file, hash],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
