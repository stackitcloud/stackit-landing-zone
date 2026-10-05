import type pg from "pg";
import { z } from "zod";
import { withTenant } from "../storage/database.js";
import type { DeviceIdentity } from "./stackit-device.js";
import type { Session } from "./store.js";

const proofSchema = z.object({
  issuer: z.literal("https://accounts.stackit.cloud"),
  subject: z.string().min(1).max(255),
  email: z
    .email()
    .max(254)
    .refine((value) => !/@sa\.stackit\.cloud$/i.test(value)),
  emailVerified: z.literal(true),
  verificationMethod: z.enum([
    "signed-id-token-and-userinfo",
    "device-grant-userinfo",
  ]),
  tokenExpiresAt: z.iso.datetime(),
  organization: z
    .object({
      id: z.uuid(),
      name: z.string().min(1).max(256),
      permissions: z
        .array(z.string().regex(/^[a-z](?:[-.]?[a-z]){1,63}$/))
        .max(512)
        .optional(),
      ownerPermissions: z
        .array(z.string().regex(/^[a-z](?:[-.]?[a-z]){1,63}$/))
        .min(1)
        .max(512)
        .optional(),
    })
    .nullable(),
});

export class StackitBindingError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export type StackitIdentityStatus = {
  identity: DeviceIdentity | null;
  verified: boolean;
  organizationVerified: boolean;
  organizationAdminVerified?: boolean;
};

export class StackitIdentities {
  constructor(private readonly pool: pg.Pool) {}

  async status(session: Session): Promise<StackitIdentityStatus> {
    return withTenant(this.pool, session, async (client) => {
      const result = await client.query<{
        issuer: string;
        subject: string;
        email: string;
        verification_method: DeviceIdentity["verificationMethod"];
        valid_until: Date;
        revoked_at: Date | null;
        organization_id: string | null;
        organization_name: string | null;
        organization_valid_until: Date | null;
        organization_permissions: string[] | null;
        organization_owner_permissions: string[] | null;
      }>(
        "SELECT i.*, a.organization_id, a.organization_name, a.valid_until AS organization_valid_until, a.permissions AS organization_permissions, a.owner_permissions AS organization_owner_permissions FROM lzc.stackit_identities i LEFT JOIN lzc.stackit_organization_access a ON a.user_id=i.user_id AND a.tenant_id=$2 AND a.verified_at >= i.verified_at WHERE i.user_id=$1",
        [session.userId, session.tenantId],
      );
      const row = result.rows[0];
      if (!row)
        return { identity: null, verified: false, organizationVerified: false };
      const verified =
        !row.revoked_at && row.valid_until.getTime() > Date.now();
      const organizationVerified =
        verified && (row.organization_valid_until?.getTime() ?? 0) > Date.now();
      return {
        identity: {
          issuer: row.issuer,
          subject: row.subject,
          email: row.email,
          emailVerified: true,
          verificationMethod: row.verification_method,
          tokenExpiresAt: row.valid_until.toISOString(),
          organization:
            organizationVerified && row.organization_id && row.organization_name
              ? {
                  id: row.organization_id,
                  name: row.organization_name,
                  ...(row.organization_permissions === null
                    ? {}
                    : { permissions: row.organization_permissions }),
                  ...(row.organization_owner_permissions === null
                    ? {}
                    : { ownerPermissions: row.organization_owner_permissions }),
                }
              : null,
        },
        verified,
        organizationVerified,
        ...(row.organization_permissions === null
          ? {}
          : {
              organizationAdminVerified:
                organizationVerified &&
                (row.organization_owner_permissions?.length ?? 0) > 0 &&
                row.organization_owner_permissions?.every((permission) =>
                  row.organization_permissions?.includes(permission),
                ) === true,
            }),
      };
    });
  }

  async save(session: Session, identity: DeviceIdentity): Promise<void> {
    const proof = proofSchema.parse(identity);
    const validUntil = new Date(proof.tokenExpiresAt);
    if (
      validUntil.getTime() <= Date.now() ||
      validUntil.getTime() > Date.now() + 86400000
    )
      throw new StackitBindingError("identity_proof_expired");
    try {
      await withTenant(this.pool, session, async (client) => {
        const result = await client.query(
          "INSERT INTO lzc.stackit_identities(user_id,issuer,subject,email,verification_method,valid_until) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,verification_method=excluded.verification_method,verified_at=now(),valid_until=excluded.valid_until,revoked_at=NULL WHERE stackit_identities.issuer=excluded.issuer AND stackit_identities.subject=excluded.subject RETURNING user_id",
          [
            session.userId,
            proof.issuer,
            proof.subject,
            proof.email,
            proof.verificationMethod,
            validUntil,
          ],
        );
        if (result.rowCount !== 1)
          throw new StackitBindingError("identity_binding_conflict");
        if (proof.organization) {
          await client.query(
            "INSERT INTO lzc.stackit_organization_access(tenant_id,user_id,organization_id,organization_name,valid_until,permissions,owner_permissions) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(tenant_id,user_id) DO UPDATE SET organization_id=excluded.organization_id,organization_name=excluded.organization_name,verified_at=now(),valid_until=excluded.valid_until,permissions=excluded.permissions,owner_permissions=excluded.owner_permissions",
            [
              session.tenantId,
              session.userId,
              proof.organization.id,
              proof.organization.name,
              validUntil,
              proof.organization.permissions === undefined
                ? null
                : [...new Set(proof.organization.permissions)].sort(),
              proof.organization.ownerPermissions === undefined
                ? null
                : [...new Set(proof.organization.ownerPermissions)].sort(),
            ],
          );
        }
      });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "23505"
      )
        throw new StackitBindingError("identity_already_bound");
      throw error;
    }
  }

  async clearOrganizationProof(session: Session): Promise<void> {
    await withTenant(this.pool, session, async (client) => {
      await client.query(
        "DELETE FROM lzc.stackit_organization_access WHERE tenant_id=$1 AND user_id=$2",
        [session.tenantId, session.userId],
      );
    });
  }

  async bindOrganization(session: Session, input: unknown) {
    z.strictObject({ confirmOrganizationBinding: z.literal(true) }).parse(
      input,
    );
    return withTenant(this.pool, session, async (client) => {
      const result = await client.query<{
        binding: {
          tenantId: string;
          organizationId: string;
          authorizationId: string;
          boundBy: string;
          boundAt: string;
        };
      }>("SELECT lzc_auth.bind_organization($1) AS binding", [session.id]);
      const binding = result.rows[0]?.binding;
      if (!binding)
        throw new StackitBindingError("organization_binding_missing");
      return binding;
    });
  }

  async revoke(session: Session): Promise<void> {
    await withTenant(this.pool, session, async (client) => {
      await client.query(
        "UPDATE lzc.stackit_identities SET revoked_at=now() WHERE user_id=$1",
        [session.userId],
      );
    });
  }
}
