import type pg from "pg";
import { z } from "zod";
import type { Session } from "../auth/store.js";

/** Email provenance only. Never reads keys or implies a current access check. */
export async function preparedPlatformServiceAccountEmails(
  client: pg.PoolClient,
  session: Session,
  configurationId: string,
  organizationId: unknown,
): Promise<string[]> {
  if (
    !z.uuid().safeParse(configurationId).success ||
    !z.uuid().safeParse(organizationId).success
  )
    return [];
  const result = await client.query<{ email: string }>(
    `SELECT DISTINCT credential.service_account AS email
     FROM lzc.deployment_preparations preparation
     JOIN lzc.credential_profiles credential
       ON credential.id=preparation.credential_id
       AND preparation.manifest#>>'{credential,id}'=credential.id::text
       AND preparation.manifest#>>'{credential,keyId}'=credential.key_id
     WHERE preparation.tenant_id=$1 AND preparation.owner_user_id=$2
       AND credential.tenant_id=$1 AND credential.owner_user_id=$2
       AND credential.state='stored'
       AND preparation.manifest#>>'{source,configurationId}'=$3
       AND preparation.manifest#>>'{organization,id}'=$4
     ORDER BY email LIMIT 201`,
    [session.tenantId, session.userId, configurationId, organizationId],
  );
  // Do not truncate an ambiguous choice into a seemingly unique identity.
  if (result.rows.length > 200) return [];
  return [
    ...new Set(
      result.rows.flatMap(({ email }) =>
        z.email().safeParse(email).success &&
        email.endsWith("@sa.stackit.cloud")
          ? [email]
          : [],
      ),
    ),
  ];
}
