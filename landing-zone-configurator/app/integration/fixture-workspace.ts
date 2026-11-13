import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { Session } from "../apps/api/src/auth/store.js";
import { PostgresOrganisations } from "../apps/api/src/organisation/service.js";

/** Tests that exercise workspace features must explicitly create/select one. */
export async function inWorkspace(
  pool: pg.Pool,
  session: Session,
): Promise<Session> {
  const workspaces = new PostgresOrganisations(pool);
  const tenantId = await workspaces.create(
    session,
    session.login,
    randomUUID(),
  );
  await workspaces.switch(session, tenantId);
  return {
    ...session,
    tokenTenantId: session.tenantId,
    tenantId,
    tenantKind: "organisation",
    productRoles: ["platform-engineer"],
    manageMembers: true,
  };
}
