import { randomUUID } from "node:crypto";
import { type EditorDraft, readEditorDraft } from "@lzc/domain";
import type pg from "pg";
import { z } from "zod";
import type { Session } from "../auth/store.js";
import { withTenant } from "../storage/database.js";

export class ConfigurationError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

type Row = {
  id: string;
  name: string;
  revision: number;
  updated_at: Date;
  document: unknown;
};

function summary(row: Row) {
  return {
    id: row.id,
    name: row.name,
    revision: row.revision,
    updatedAt: row.updated_at.toISOString(),
  };
}

function document(input: unknown): EditorDraft {
  try {
    const draft = readEditorDraft(input);
    z.string().trim().min(1).max(64).parse(draft.name);
    return draft;
  } catch {
    throw new ConfigurationError(400, "invalid_configuration_document");
  }
}

export class Configurations {
  constructor(private readonly pool: pg.Pool) {}

  private work<T>(
    session: Session,
    task: (client: pg.PoolClient) => Promise<T>,
  ) {
    return withTenant(this.pool, session, async (client) => {
      await client.query(
        "SELECT lzc_auth.authorize_application($1,$2,'publish')",
        [session.id, session.tenantId],
      );
      return task(client);
    });
  }

  list(session: Session) {
    return this.work(session, async (client) => {
      const result = await client.query<Row>(
        "SELECT id,name,revision,updated_at FROM lzc.configurations ORDER BY updated_at DESC,id DESC LIMIT 200",
      );
      return result.rows.map(summary);
    });
  }

  get(session: Session, id: string) {
    return this.work(session, async (client) => {
      const result = await client.query<Row>(
        "SELECT * FROM lzc.configurations WHERE id=$1",
        [z.uuid().parse(id)],
      );
      const row = result.rows[0];
      if (!row) throw new ConfigurationError(404, "configuration_not_found");
      return { ...summary(row), draft: readEditorDraft(row.document) };
    });
  }

  create(session: Session, input: unknown) {
    const draft = document(input);
    return this.work(session, async (client) => {
      const result = await client.query<Row>(
        "INSERT INTO lzc.configurations(id,tenant_id,created_by,name,document) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [
          randomUUID(),
          session.tenantId,
          session.userId,
          draft.name,
          JSON.stringify(draft),
        ],
      );
      const row = result.rows[0];
      if (!row) throw new ConfigurationError(503, "configuration_save_failed");
      return { ...summary(row), draft: readEditorDraft(row.document) };
    });
  }

  update(session: Session, id: string, revision: number, input: unknown) {
    const draft = document(input);
    z.uuid().parse(id);
    z.number().int().positive().parse(revision);
    return this.work(session, async (client) => {
      const result = await client.query<Row>(
        "UPDATE lzc.configurations SET name=$3,document=$4,revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$2 RETURNING *",
        [id, revision, draft.name, JSON.stringify(draft)],
      );
      const row = result.rows[0];
      if (!row) {
        const found = await client.query(
          "SELECT id FROM lzc.configurations WHERE id=$1",
          [id],
        );
        throw new ConfigurationError(
          found.rowCount ? 409 : 404,
          found.rowCount ? "configuration_changed" : "configuration_not_found",
        );
      }
      return { ...summary(row), draft: readEditorDraft(row.document) };
    });
  }

  remove(session: Session, id: string, revision: number) {
    z.uuid().parse(id);
    z.number().int().positive().parse(revision);
    return this.work(session, async (client) => {
      const result = await client.query(
        "DELETE FROM lzc.configurations WHERE id=$1 AND revision=$2 RETURNING id",
        [id, revision],
      );
      if (!result.rowCount) {
        const found = await client.query(
          "SELECT id FROM lzc.configurations WHERE id=$1",
          [id],
        );
        throw new ConfigurationError(
          found.rowCount ? 409 : 404,
          found.rowCount ? "configuration_changed" : "configuration_not_found",
        );
      }
    });
  }
}
