import { createHash } from "node:crypto";
import type pg from "pg";
import type { PendingGitHubLogin } from "./github-flow.js";

export const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("base64url");
export type Session = {
  id: string;
  userId: string;
  tenantId: string;
  githubId: string;
  login: string;
  csrfToken: string;
  expiresAt: Date;
};
export interface AuthStore {
  beginLogin(pending: PendingGitHubLogin): Promise<void>;
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
}
export class PostgresAuthStore implements AuthStore {
  constructor(private readonly pool: pg.Pool) {}
  async beginLogin(pending: PendingGitHubLogin) {
    await this.pool.query(
      "DELETE FROM lzc_auth.login_requests WHERE expires_at <= now()",
    );
    await this.pool.query(
      "INSERT INTO lzc_auth.login_requests(state_hash, binding_hash, verifier, expires_at) VALUES($1, $2, $3, $4)",
      [
        pending.stateHash,
        pending.bindingHash,
        pending.verifier,
        new Date(pending.expiresAt),
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
    }>(
      "DELETE FROM lzc_auth.login_requests WHERE state_hash = $1 AND binding_hash = $2 AND expires_at > now() RETURNING verifier, expires_at",
      [tokenHash(state), tokenHash(binding)],
    );
    const row = result.rows[0];
    return row
      ? {
          stateHash: tokenHash(state),
          bindingHash: tokenHash(binding),
          verifier: row.verifier,
          expiresAt: row.expires_at.getTime(),
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
          githubId: row.github_id,
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
}
