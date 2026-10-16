import { createHash } from "node:crypto";
import type pg from "pg";
import type { PendingGitHubLogin } from "./github-flow.js";
import type { DeviceIdentity } from "./stackit-device.js";

export const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("base64url");
export type Session = {
  id: string;
  userId: string;
  tenantId: string;
  tokenTenantId?: string;
  tenantKind?: "personal" | "organisation";
  productRoles?: string[];
  manageMembers?: boolean;
  githubId: string;
  login: string;
  csrfToken: string;
  expiresAt: Date;
};
export interface AuthStore {
  beginLogin(pending: PendingGitHubLogin, session?: Session): Promise<void>;
  consumeLogin(
    state: string,
    binding: string,
  ): Promise<PendingGitHubLogin | null>;
  createSession(input: {
    githubId: number;
    login: string;
    id: string;
    hash: string;
    csrfToken: string;
    expiresAt: Date;
  }): Promise<Session>;
  resolveSession(token: string): Promise<Session | null>;
  deleteSession(token: string): Promise<void>;
  createStackitSession?(input: {
    identity: DeviceIdentity;
    id: string;
    hash: string;
    csrfToken: string;
    expiresAt: Date;
    existingSessionId?: string;
  }): Promise<Session>;
  linkGitHub?(
    session: Session,
    githubId: number,
    login: string,
  ): Promise<Session>;
}
export class PostgresAuthStore implements AuthStore {
  constructor(private readonly pool: pg.Pool) {}
  async beginLogin(pending: PendingGitHubLogin, session?: Session) {
    await this.pool.query(
      "DELETE FROM lzc_auth.login_requests WHERE expires_at <= now()",
    );
    await this.pool.query(
      "INSERT INTO lzc_auth.login_requests(state_hash, binding_hash, verifier, expires_at, linked_session_id) VALUES($1, $2, $3, $4, $5)",
      [
        pending.stateHash,
        pending.bindingHash,
        pending.verifier,
        new Date(pending.expiresAt),
        session?.id ?? null,
      ],
    );
  }
  async consumeLogin(
    state: string,
    binding: string,
  ): Promise<PendingGitHubLogin | null> {
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      !/^[A-Za-z0-9_-]{43}$/.test(binding)
    )
      return null;
    const result = await this.pool.query<{
      verifier: string;
      expires_at: Date;
      linked_session_id: string | null;
    }>(
      "DELETE FROM lzc_auth.login_requests WHERE state_hash = $1 AND binding_hash = $2 AND expires_at > now() RETURNING verifier, expires_at, linked_session_id",
      [tokenHash(state), tokenHash(binding)],
    );
    const row = result.rows[0];
    return row
      ? {
          stateHash: tokenHash(state),
          bindingHash: tokenHash(binding),
          verifier: row.verifier,
          expiresAt: row.expires_at.getTime(),
          ...(row.linked_session_id
            ? { linkedSessionId: row.linked_session_id }
            : {}),
        }
      : null;
  }
  async createSession(input: {
    githubId: number;
    login: string;
    id: string;
    hash: string;
    csrfToken: string;
    expiresAt: Date;
  }): Promise<Session> {
    const result = await this.pool.query<{
      user_id: string;
      tenant_id: string;
    }>("SELECT * FROM lzc_auth.complete_login($1, $2, $3, $4, $5, $6)", [
      input.githubId,
      input.login,
      input.id,
      input.hash,
      input.csrfToken,
      input.expiresAt,
    ]);
    const row = result.rows[0];
    if (!row) throw new Error("Session creation failed");
    return {
      id: input.id,
      userId: row.user_id,
      tenantId: row.tenant_id,
      githubId: String(input.githubId),
      login: input.login,
      csrfToken: input.csrfToken,
      expiresAt: input.expiresAt,
    };
  }
  async resolveSession(token: string): Promise<Session | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const result = await this.pool.query<{
      token_tenant_id: string;
      tenant_kind: "personal" | "organisation";
      product_roles: string[];
      manage_members: boolean;
      session_id: string;
      user_id: string;
      tenant_id: string;
      github_id: string;
      github_login: string;
      csrf_token: string;
      expires_at: Date;
    }>("SELECT * FROM lzc_auth.resolve_session($1)", [tokenHash(token)]);
    const row = result.rows[0];
    return row
      ? {
          id: row.session_id,
          userId: row.user_id,
          tenantId: row.tenant_id,
          tokenTenantId: row.token_tenant_id,
          tenantKind: row.tenant_kind,
          productRoles: row.product_roles,
          manageMembers: row.manage_members,
          githubId: row.github_id ?? "",
          login: row.github_login,
          csrfToken: row.csrf_token,
          expiresAt: row.expires_at,
        }
      : null;
  }
  async deleteSession(token: string) {
    if (/^[A-Za-z0-9_-]{43}$/.test(token))
      await this.pool.query("SELECT lzc_auth.delete_session($1)", [
        tokenHash(token),
      ]);
  }
  async createStackitSession(input: {
    identity: DeviceIdentity;
    id: string;
    hash: string;
    csrfToken: string;
    expiresAt: Date;
    existingSessionId?: string;
  }): Promise<Session> {
    const result = await this.pool.query<{
      user_id: string;
      tenant_id: string;
      github_id: string | null;
    }>(
      "SELECT * FROM lzc_auth.complete_stackit_login($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        input.identity.issuer,
        input.identity.subject,
        input.identity.email,
        input.identity.verificationMethod,
        input.id,
        input.hash,
        input.csrfToken,
        input.expiresAt,
        new Date(input.identity.tokenExpiresAt),
        input.existingSessionId ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Session creation failed");
    return {
      id: input.id,
      userId: row.user_id,
      tenantId: row.tenant_id,
      githubId: row.github_id ?? "",
      login: input.identity.email,
      csrfToken: input.csrfToken,
      expiresAt: input.expiresAt,
    };
  }
  async linkGitHub(
    session: Session,
    githubId: number,
    login: string,
  ): Promise<Session> {
    await this.pool.query("SELECT lzc_auth.link_github($1,$2,$3,$4)", [
      session.id,
      session.tenantId,
      githubId,
      login,
    ]);
    return { ...session, githubId: String(githubId) };
  }
}
