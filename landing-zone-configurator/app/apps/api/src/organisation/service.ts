import type pg from "pg";
import type { Session } from "../auth/store.js";
export type ProductRole = "platform-engineer" | "application-owner";
export type OrganisationOverview = {
  userId: string;
  activeTenantId: string;
  tenants: {
    id: string;
    name: string;
    kind: "personal" | "organisation";
    organizationId: string | null;
    organizationVerified: boolean;
    roles: ProductRole[];
    manageMembers: boolean;
  }[];
  members: {
    userId: string;
    login: string | null;
    roles: ProductRole[];
    manageMembers: boolean;
  }[];
};
export interface OrganisationService {
  overview(session: Session): Promise<OrganisationOverview>;
  create(
    session: Session,
    name: string,
    organizationId: string,
  ): Promise<string>;
  switch(session: Session, tenantId: string): Promise<void>;
  editMember(
    session: Session,
    userId: string,
    roles: ProductRole[],
    manageMembers: boolean,
    remove?: boolean,
  ): Promise<void>;
}
export class PostgresOrganisations implements OrganisationService {
  constructor(private readonly pool: pg.Pool) {}
  async overview(session: Session) {
    const result = await this.pool.query<{ value: OrganisationOverview }>(
      "SELECT lzc_auth.organisation_overview($1) AS value",
      [session.id],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Organisation overview unavailable");
    return row.value;
  }
  async create(session: Session, name: string, organizationId: string) {
    const result = await this.pool.query<{ id: string }>(
      "SELECT lzc_auth.create_organisation($1,$2,$3) AS id",
      [session.id, name, organizationId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Organisation creation failed");
    return row.id;
  }
  async switch(session: Session, tenantId: string) {
    await this.pool.query("SELECT lzc_auth.switch_organisation($1,$2)", [
      session.id,
      tenantId,
    ]);
  }
  async editMember(
    session: Session,
    userId: string,
    roles: ProductRole[],
    manageMembers: boolean,
    remove = false,
  ) {
    await this.pool.query(
      "SELECT lzc_auth.edit_organisation_member($1,$2,$3,$4,$5,$6)",
      [session.id, userId, roles, manageMembers, remove, session.tenantId],
    );
  }
}
