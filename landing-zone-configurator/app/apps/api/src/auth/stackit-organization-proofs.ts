import type pg from "pg";
import { withTenant } from "../storage/database.js";
import {
  DeviceFlowError,
  type StackitRefreshGrant,
  stackitIssuer,
  verifyStackitOrganization,
} from "./stackit-device.js";
import type { Session } from "./store.js";

export type OrganizationProofState = {
  status:
    | "verified"
    | "not-required"
    | "denied"
    | "unavailable"
    | "reauthentication-required";
  verifiedUntil?: string;
};
type Context = {
  organization_id: string;
  subject: string;
  email: string;
  valid_until: Date;
  verified_at: Date;
  proof_valid_until: Date | null;
  proof_verified_at: Date | null;
  permissions: string[] | null;
  owner_permissions: string[] | null;
};

/** Uses only the encrypted personal login grant, never a deployment Service Account. */
export class StackitOrganizationProofs {
  private readonly pending = new Map<string, Promise<OrganizationProofState>>();
  constructor(
    private readonly pool: pg.Pool,
    private readonly request: typeof fetch = fetch,
    private readonly now = Date.now,
  ) {}
  ensure(
    session: Session,
    grant: StackitRefreshGrant | null,
  ): Promise<OrganizationProofState> {
    const key = `${session.id}:${session.tenantId}`;
    const running = this.pending.get(key);
    if (running) return running;
    const work = this.check(session, grant).finally(() => {
      if (this.pending.get(key) === work) this.pending.delete(key);
    });
    this.pending.set(key, work);
    return work;
  }
  private context(session: Session) {
    return withTenant(
      this.pool,
      session,
      async (client) =>
        (
          await client.query<Context>(
            `SELECT t.organization_id::text,i.subject,i.email,i.valid_until,i.verified_at,a.valid_until AS proof_valid_until,a.verified_at AS proof_verified_at,a.permissions,a.owner_permissions
      FROM lzc.tenants t JOIN lzc.memberships m ON m.tenant_id=t.id AND m.user_id=$1
      JOIN lzc.stackit_identities i ON i.user_id=m.user_id AND i.revoked_at IS NULL
      LEFT JOIN lzc.stackit_organization_access a ON a.tenant_id=t.id AND a.user_id=m.user_id AND a.organization_id=t.organization_id AND a.verified_at>=i.verified_at
      WHERE t.id=$2 AND t.kind='organisation' AND t.organization_verified AND t.archived_at IS NULL
      AND ('platform-engineer'=ANY(m.product_roles) OR m.role='admin')`,
            [session.userId, session.tenantId],
          )
        ).rows[0],
    );
  }
  private async clear(session: Session, organizationId: string) {
    await withTenant(this.pool, session, (client) =>
      client.query(
        "DELETE FROM lzc.stackit_organization_access WHERE tenant_id=$1 AND user_id=$2 AND organization_id=$3",
        [session.tenantId, session.userId, organizationId],
      ),
    );
  }
  private async check(
    session: Session,
    grant: StackitRefreshGrant | null,
  ): Promise<OrganizationProofState> {
    const context = await this.context(session);
    if (!context) return { status: "not-required" };
    if (session.expiresAt.getTime() <= this.now())
      return { status: "reauthentication-required" };
    const hasOwner =
      (context.owner_permissions?.length ?? 0) > 0 &&
      context.owner_permissions?.every((p) =>
        context.permissions?.includes(p),
      ) === true;
    if (
      hasOwner &&
      context.valid_until.getTime() > this.now() + 120000 &&
      context.proof_valid_until &&
      context.proof_verified_at &&
      context.proof_valid_until.getTime() <=
        context.proof_verified_at.getTime() + 300000 &&
      context.proof_valid_until.getTime() > this.now() + 120000
    )
      return {
        status: "verified",
        verifiedUntil: context.proof_valid_until.toISOString(),
      };
    if (
      !grant?.accessToken ||
      grant.issuer !== stackitIssuer ||
      grant.subject !== context.subject ||
      grant.email !== context.email ||
      Date.parse(grant.expiresAt) <= this.now() + 30000 ||
      context.valid_until.getTime() <= this.now()
    )
      return { status: "reauthentication-required" };
    try {
      const organization = await verifyStackitOrganization(
        this.request,
        context.organization_id,
        context.email,
        grant.accessToken,
      );
      if (
        !organization.ownerPermissions?.length ||
        !organization.ownerPermissions.every((p) =>
          organization.permissions?.includes(p),
        )
      ) {
        await this.clear(session, context.organization_id);
        return { status: "denied" };
      }
      const until = new Date(
        Math.min(
          Date.parse(grant.expiresAt),
          context.valid_until.getTime(),
          this.now() + 300000,
          session.expiresAt.getTime(),
        ),
      );
      const saved = await withTenant(this.pool, session, async (client) => {
        const current = (
          await client.query<Context>(
            `SELECT t.organization_id::text,i.subject,i.email,i.valid_until,i.verified_at
          FROM lzc.tenants t JOIN lzc.memberships m ON m.tenant_id=t.id AND m.user_id=$1
          JOIN lzc.stackit_identities i ON i.user_id=m.user_id AND i.revoked_at IS NULL
          WHERE t.id=$2 AND t.organization_id=$3 AND t.organization_verified AND t.archived_at IS NULL
          AND ('platform-engineer'=ANY(m.product_roles) OR m.role='admin') FOR SHARE OF i`,
            [session.userId, session.tenantId, context.organization_id],
          )
        ).rows[0];
        if (
          !current ||
          current.subject !== grant.subject ||
          current.email !== grant.email ||
          current.verified_at.getTime() !== context.verified_at.getTime() ||
          current.valid_until.getTime() < until.getTime() ||
          session.expiresAt.getTime() <= this.now()
        )
          return false;
        await client.query(
          `INSERT INTO lzc.stackit_organization_access(tenant_id,user_id,organization_id,organization_name,valid_until,permissions,owner_permissions)
          VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(tenant_id,user_id) DO UPDATE SET organization_id=excluded.organization_id,organization_name=excluded.organization_name,verified_at=now(),valid_until=excluded.valid_until,permissions=excluded.permissions,owner_permissions=excluded.owner_permissions`,
          [
            session.tenantId,
            session.userId,
            organization.id,
            organization.name,
            until,
            organization.permissions,
            organization.ownerPermissions,
          ],
        );
        return true;
      });
      return saved
        ? { status: "verified", verifiedUntil: until.toISOString() }
        : { status: "reauthentication-required" };
    } catch (error) {
      if (
        error instanceof DeviceFlowError &&
        [
          "organization_access_denied",
          "organization_permissions_denied",
        ].includes(error.code)
      ) {
        await this.clear(session, context.organization_id);
        return { status: "denied" };
      }
      return { status: "unavailable" };
    }
  }
}
