import { createRemoteJWKSet, customFetch, jwtVerify } from "jose";
import type pg from "pg";
import { z } from "zod";
import type { ArtifactCrypto } from "../plans/crypto.js";
import { type StackitRefreshGrant, stackitIssuer } from "./stackit-device.js";
import { type Session, tokenHash } from "./store.js";

const grantSchema = z.strictObject({
  clientId: z.string().min(1).max(255),
  refreshToken: z.string().min(1).max(32768),
  nonce: z.string().min(1).max(128),
  issuer: z.literal(stackitIssuer),
  subject: z.string().min(1).max(255),
  email: z.email().max(254),
  expiresAt: z.iso.datetime(),
});
class ReauthenticationRequired extends Error {}

/** Refreshes only this client grant; it cannot renew the STACKIT Portal browser cookie. */
export class StackitRefreshClient {
  private readonly keys;
  constructor(
    private readonly request: typeof fetch = fetch,
    private readonly now = Date.now,
  ) {
    this.keys = createRemoteJWKSet(
      new URL(`${stackitIssuer}/.well-known/jwks.json`),
      {
        [customFetch]: (input, init) =>
          request(input, { ...init, redirect: "error" }),
      },
    );
  }
  private async call(path: string, init: RequestInit) {
    const response = await this.request(`${stackitIssuer}${path}`, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (Number(response.headers.get("content-length")) > 65536)
      throw new Error("stackit_refresh_unavailable");
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > 65536)
      throw new Error("stackit_refresh_unavailable");
    if (response.status === 429 || response.status >= 500)
      throw new Error("stackit_refresh_unavailable");
    if (!response.ok) throw new ReauthenticationRequired();
    return (text ? JSON.parse(text) : {}) as unknown;
  }
  async refresh(input: StackitRefreshGrant): Promise<StackitRefreshGrant> {
    const grant = grantSchema.parse(input);
    const tokens = z
      .object({
        access_token: z.string().min(1).max(32768),
        refresh_token: z.string().min(1).max(32768).optional(),
        id_token: z.string().min(1).max(32768),
        expires_in: z.number().int().positive().max(86400),
        token_type: z.string().refine((v) => v.toLowerCase() === "bearer"),
      })
      .safeParse(
        await this.call("/oauth/v2/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: grant.clientId,
            grant_type: "refresh_token",
            refresh_token: grant.refreshToken,
          }),
        }),
      );
    if (!tokens.success) throw new ReauthenticationRequired();
    try {
      const { payload } = await jwtVerify(tokens.data.id_token, this.keys, {
        issuer: stackitIssuer,
        audience: grant.clientId,
        algorithms: ["RS256"],
        requiredClaims: ["sub", "iat", "exp"],
        maxTokenAge: "10m",
        currentDate: new Date(this.now()),
      });
      if (
        (payload.azp !== undefined && payload.azp !== grant.clientId) ||
        (Array.isArray(payload.aud) &&
          payload.aud.length > 1 &&
          payload.azp !== grant.clientId) ||
        payload.sub !== grant.subject ||
        (payload.nonce !== undefined && payload.nonce !== grant.nonce) ||
        (payload.email !== undefined && payload.email !== grant.email) ||
        payload.email_verified === false
      )
        throw new ReauthenticationRequired();
      const user = z
        .object({
          sub: z.literal(grant.subject),
          email: z.literal(grant.email),
          email_verified: z.literal(true),
        })
        .safeParse(
          await this.call("/oidc/v1/userinfo", {
            headers: { Authorization: `Bearer ${tokens.data.access_token}` },
          }),
        );
      if (!user.success) throw new ReauthenticationRequired();
      const expiresAt = Math.min(
        this.now() + tokens.data.expires_in * 1000,
        (payload.exp ?? 0) * 1000,
      );
      if (expiresAt <= this.now() + 30000) throw new ReauthenticationRequired();
      return {
        ...grant,
        refreshToken: tokens.data.refresh_token ?? grant.refreshToken,
        expiresAt: new Date(expiresAt).toISOString(),
      };
    } catch (error) {
      // Transport outages permit another bounded check, never an invented proof extension.
      if (
        error instanceof TypeError ||
        (error instanceof Error &&
          (error.message === "stackit_refresh_unavailable" ||
            ["AbortError", "TimeoutError"].includes(error.name) ||
            ("code" in error && error.code === "ERR_JWKS_TIMEOUT")))
      )
        throw error;
      throw new ReauthenticationRequired();
    }
  }
  async revoke(grant: StackitRefreshGrant) {
    await this.call("/oauth/v2/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: grant.clientId,
        token: grant.refreshToken,
        token_type_hint: "refresh_token",
      }),
    });
  }
}

type LockedSession = {
  session_id: string;
  user_id: string;
  token_tenant_id: string;
  refresh_cipher: Buffer | null;
  expires_at: Date;
  issuer: string;
  subject: string;
  email: string;
  proof_expires_at: Date;
};
export type StackitSessionState = {
  status: "active" | "reauthentication-required";
  verifiedUntil?: string;
};
export class StackitSessions {
  constructor(
    private readonly pool: pg.Pool,
    private readonly crypto: ArtifactCrypto,
    private readonly clientId: string,
    private readonly provider = new StackitRefreshClient(),
    private readonly now = Date.now,
  ) {}
  private encrypt(
    session: Pick<Session, "id" | "userId" | "tenantId" | "tokenTenantId">,
    grant: StackitRefreshGrant,
  ) {
    return this.crypto.encrypt(
      Buffer.from(JSON.stringify(grantSchema.parse(grant))),
      session.tokenTenantId ?? session.tenantId,
      session.userId,
      `stackit-refresh:${session.id}`,
    );
  }
  async put(session: Session, hash: string, grant: StackitRefreshGrant) {
    if (grant.clientId !== this.clientId)
      throw new Error("stackit_refresh_binding_invalid");
    const result = await this.pool.query<{ written: boolean }>(
      "SELECT lzc_auth.write_stackit_refresh($1,$2) AS written",
      [hash, this.encrypt(session, grant)],
    );
    if (!result.rows[0]?.written)
      throw new Error("stackit_refresh_session_missing");
  }
  private async locked<T>(
    session: Session,
    token: string,
    work: (
      client: pg.PoolClient,
      row: LockedSession,
      hash: string,
    ) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    let broken = false;
    try {
      await client.query("BEGIN");
      const hash = tokenHash(token);
      const result = await client.query<LockedSession>(
        "SELECT * FROM lzc_auth.lock_stackit_refresh($1)",
        [hash],
      );
      const row = result.rows[0];
      if (
        !row ||
        row.session_id !== session.id ||
        row.user_id !== session.userId ||
        row.expires_at.getTime() <= this.now()
      )
        throw new Error("stackit_refresh_session_missing");
      const value = await work(client, row, hash);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        broken = true;
      }
      throw error;
    } finally {
      client.release(broken);
    }
  }
  private decrypt(row: LockedSession) {
    if (!row.refresh_cipher) return null;
    const grant = grantSchema.parse(
      JSON.parse(
        this.crypto
          .decrypt(
            row.refresh_cipher,
            row.token_tenant_id,
            row.user_id,
            `stackit-refresh:${row.session_id}`,
          )
          .toString("utf8"),
      ),
    );
    if (
      grant.clientId !== this.clientId ||
      grant.issuer !== row.issuer ||
      grant.subject !== row.subject ||
      grant.email !== row.email
    )
      throw new Error("stackit_refresh_binding_invalid");
    return grant;
  }
  async refresh(session: Session, token: string): Promise<StackitSessionState> {
    return this.locked<StackitSessionState>(
      session,
      token,
      async (client, row, hash) => {
        const grant = this.decrypt(row);
        const expires = grant
          ? Date.parse(grant.expiresAt)
          : row.proof_expires_at.getTime();
        if (expires > this.now() + 120000)
          return {
            status: "active",
            verifiedUntil: new Date(expires).toISOString(),
          };
        if (!grant) return { status: "reauthentication-required" };
        let next: StackitRefreshGrant;
        try {
          next = await this.provider.refresh(grant);
        } catch (error) {
          if (!(error instanceof ReauthenticationRequired)) throw error;
          await client.query("SELECT lzc_auth.write_stackit_refresh($1,NULL)", [
            hash,
          ]);
          return { status: "reauthentication-required" };
        }
        const identity = {
          id: row.session_id,
          userId: row.user_id,
          tenantId: row.token_tenant_id,
        };
        await client.query(
          "SELECT lzc_auth.complete_stackit_refresh($1,$2,$3,$4,$5,$6)",
          [
            hash,
            this.encrypt(identity, next),
            next.issuer,
            next.subject,
            next.email,
            new Date(next.expiresAt),
          ],
        );
        return { status: "active", verifiedUntil: next.expiresAt };
      },
    ).catch((error: unknown) => {
      if (
        error instanceof Error &&
        error.message === "stackit_refresh_session_missing"
      )
        return { status: "reauthentication-required" as const };
      throw error;
    });
  }
  async revoke(session: Session, token: string) {
    await this.locked(session, token, async (client, row, hash) => {
      const grant = this.decrypt(row);
      // Delete the local grant even if the provider cannot be reached on logout.
      await client.query("SELECT lzc_auth.write_stackit_refresh($1,NULL)", [
        hash,
      ]);
      if (grant) await this.provider.revoke(grant).catch(() => {});
    });
  }
}
