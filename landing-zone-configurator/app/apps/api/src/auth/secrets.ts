import type { Session } from "./store.js";

export interface UserTokenStore {
  put(session: Session, token: string): Promise<void>;
  get(session: Session): Promise<string>;
  remove(session: Session): Promise<void>;
}
export class SecretsManagerTokenStore implements UserTokenStore {
  constructor(
    private readonly config: {
      address: string;
      instance: string;
      username: string;
      password: string;
    },
    private readonly request: typeof fetch = fetch,
  ) {
    if (
      config.address !== "https://prod.sm.eu01.stackit.cloud" ||
      !/^[a-f0-9-]{36}$/.test(config.instance)
    )
      throw new Error("Unexpected Secrets destination");
  }
  private path(session: Session, metadata = false): string {
    for (const id of [session.tenantId, session.userId, session.id])
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        )
      )
        throw new Error("Invalid secret identity");
    return `${this.config.instance}/${metadata ? "metadata" : "data"}/configurator/tenants/${session.tenantId}/users/${session.userId}/github/${session.id}`;
  }
  private async call(path: string, init: RequestInit) {
    return this.request(`${this.config.address}/v1/${path}`, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  }
  private async authorized<T>(
    operation: (headers: Record<string, string>) => Promise<T>,
  ): Promise<T> {
    const login = await this.call(
      `auth/userpass/login/${encodeURIComponent(this.config.username)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: this.config.password }),
      },
    );
    if (!login.ok) throw new Error("Secret authorization failed");
    const value = (await login.json()) as { auth?: { client_token?: unknown } };
    if (typeof value.auth?.client_token !== "string")
      throw new Error("Secret authorization invalid");
    const headers = {
      "X-Vault-Token": value.auth.client_token,
      "Content-Type": "application/json",
    };
    const outcome = await operation(headers).then(
      (result) => ({ ok: true as const, result }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    const cleanup = await this.call("auth/token/revoke-self", {
      method: "POST",
      headers,
    }).then(
      (response) => response.ok,
      () => false,
    );
    if (!outcome.ok) throw outcome.error;
    if (!cleanup) throw new Error("Secret session cleanup failed");
    return outcome.result;
  }

  async put(session: Session, token: string) {
    const path = this.path(session);
    await this.authorized(async (headers) => {
      const response = await this.call(path, {
        method: "POST",
        headers,
        body: JSON.stringify({
          options: { cas: 0 },
          data: {
            token,
            tenantId: session.tenantId,
            userId: session.userId,
            sessionId: session.id,
            githubId: session.githubId,
            expiresAt: session.expiresAt.toISOString(),
          },
        }),
      });
      if (!response.ok) throw new Error("Secret storage failed");
      await response.arrayBuffer();
    });
  }
  async get(session: Session): Promise<string> {
    const path = this.path(session);
    return this.authorized(async (headers) => {
      const response = await this.call(path, { headers });
      if (!response.ok) throw new Error("Secret read failed");
      const value = (await response.json()) as {
        data?: { data?: Record<string, unknown> };
      };
      const data = value.data?.data;
      if (
        !data ||
        data.tenantId !== session.tenantId ||
        data.userId !== session.userId ||
        data.sessionId !== session.id ||
        data.githubId !== session.githubId ||
        typeof data.token !== "string" ||
        !data.token.startsWith("ghu_") ||
        typeof data.expiresAt !== "string" ||
        !(Date.parse(data.expiresAt) > Date.now())
      )
        throw new Error("Secret identity mismatch");
      return data.token;
    });
  }
  async remove(session: Session) {
    const path = this.path(session, true);
    await this.authorized(async (headers) => {
      const response = await this.call(path, { method: "DELETE", headers });
      if (!response.ok && response.status !== 404)
        throw new Error("Secret deletion failed");
      await response.arrayBuffer();
    });
  }
}
