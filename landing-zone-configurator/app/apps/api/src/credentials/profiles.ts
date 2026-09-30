import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { Session } from "../auth/store.js";
import { withTenant } from "../storage/database.js";
import { type CredentialCheck, StackitAccessCheck } from "./check.js";
import type { ServiceAccountKey } from "./key.js";
import type { CredentialSecrets } from "./secrets.js";

export type Profile = {
  id: string;
  name: string;
  serviceAccount: string;
  keyId: string;
  state: "pending" | "stored";
  createdAt: Date;
  lastCheck?: CredentialCheck | null;
};
const columns =
  'id, name, service_account AS "serviceAccount", key_id AS "keyId", state, created_at AS "createdAt", last_check AS "lastCheck"';
export class CredentialError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}
export interface CredentialProfiles {
  list(session: Session): Promise<Profile[]>;
  check(
    session: Session,
    id: string,
    organizationId: string,
  ): Promise<CredentialCheck>;
  create(session: Session, name: string, key: ServiceAccountKey): Promise<void>;
  remove(session: Session, id: string): Promise<void>;
}
export class PostgresCredentialProfiles implements CredentialProfiles {
  constructor(
    private readonly pool: pg.Pool,
    private readonly secrets: CredentialSecrets,
    private readonly cloud: Pick<
      StackitAccessCheck,
      "check"
    > = new StackitAccessCheck(),
  ) {}
  async list(session: Session) {
    return withTenant(
      this.pool,
      session,
      async (c) =>
        (
          await c.query<Profile>(
            `SELECT ${columns} FROM lzc.credential_profiles ORDER BY created_at DESC LIMIT 20`,
          )
        ).rows,
    );
  }
  async create(session: Session, name: string, key: ServiceAccountKey) {
    const id = randomUUID();
    // Persist recovery metadata first: a crash can never leave an untracked secret.
    await withTenant(this.pool, session, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `credential-profile:${session.userId}`,
      ]);
      const role = await c.query(
        "SELECT role FROM lzc.memberships WHERE tenant_id=$1 AND user_id=$2",
        [session.tenantId, session.userId],
      );
      if (!["admin", "deployer"].includes(role.rows[0]?.role))
        throw new CredentialError(403, "credential_role_required");
      const count = await c.query(
        "SELECT count(*)::int AS count FROM lzc.credential_profiles",
      );
      if (count.rows[0].count >= 20)
        throw new CredentialError(409, "credential_limit_reached");
      await c.query(
        "INSERT INTO lzc.credential_profiles(id, tenant_id, owner_user_id, name, service_account, key_id) VALUES($1,$2,$3,$4,$5,$6)",
        [
          id,
          session.tenantId,
          session.userId,
          name,
          key.credentials.iss,
          key.credentials.kid,
        ],
      );
    });
    // Row lock serializes deletion with the write to the external secret store.
    await withTenant(this.pool, session, async (c) => {
      const row = await c.query(
        "SELECT state FROM lzc.credential_profiles WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (row.rows[0]?.state !== "pending")
        throw new CredentialError(409, "credential_changed");
      await this.secrets.put(session, id, key);
      await c.query(
        "UPDATE lzc.credential_profiles SET state='stored' WHERE id=$1",
        [id],
      );
    });
  }
  async check(session: Session, id: string, organizationId: string) {
    return (await this.verifyForPreparation(session, id, organizationId)).check;
  }
  async verifyForPreparation(
    session: Session,
    id: string,
    organizationId: string,
  ) {
    return withTenant(this.pool, session, async (c) => {
      const role = await c.query(
        "SELECT role FROM lzc.memberships WHERE tenant_id=$1 AND user_id=$2",
        [session.tenantId, session.userId],
      );
      if (!["admin", "deployer"].includes(role.rows[0]?.role))
        throw new CredentialError(403, "credential_role_required");
      const row = await c.query<Profile>(
        `SELECT ${columns} FROM lzc.credential_profiles WHERE id=$1 FOR UPDATE`,
        [id],
      );
      const profile = row.rows[0];
      if (!profile) throw new CredentialError(404, "credential_not_found");
      if (profile.state !== "stored")
        throw new CredentialError(409, "credential_not_stored");
      let check: CredentialCheck;
      let version = 0;
      try {
        const secret = await this.secrets.get(session, id);
        if (
          secret.key.credentials.kid !== profile.keyId ||
          secret.key.credentials.iss !== profile.serviceAccount
        )
          throw new Error("Credential identity mismatch");
        version = secret.version;
        check = await this.cloud.check(secret.key, organizationId);
      } catch {
        check = {
          status: "failed",
          code: "secret_unavailable",
          organizationId,
          organizationName: null,
          checkedAt: new Date().toISOString(),
        };
      }
      await c.query(
        "UPDATE lzc.credential_profiles SET last_check=$2::jsonb WHERE id=$1",
        [id, JSON.stringify(check)],
      );
      return { check, version, keyId: profile.keyId };
    });
  }
  async remove(session: Session, id: string) {
    await withTenant(this.pool, session, async (c) => {
      const row = await c.query(
        "SELECT id FROM lzc.credential_profiles WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (!row.rows.length)
        throw new CredentialError(404, "credential_not_found");
      // Delete all Vault versions before the metadata. Failed/ambiguous deletes are retryable.
      await this.secrets.remove(session, id);
      await c.query("DELETE FROM lzc.credential_profiles WHERE id=$1", [id]);
    });
  }
}
