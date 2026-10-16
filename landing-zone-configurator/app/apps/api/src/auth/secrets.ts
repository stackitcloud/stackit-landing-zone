import { VaultConnection } from "../storage/vault.js";
import type { Session } from "./store.js";

export interface UserTokenStore {
  put(session: Session, token: string): Promise<void>;
  get(session: Session): Promise<string>;
  remove(session: Session): Promise<void>;
}
export class SecretsManagerTokenStore implements UserTokenStore {
  private readonly vault: VaultConnection;
  constructor(
    config: ConstructorParameters<typeof VaultConnection>[0],
    request: typeof fetch = fetch,
  ) {
    this.vault = new VaultConnection(config, request);
  }
  private path(session: Session, metadata = false): string {
    for (const id of [
      session.tokenTenantId ?? session.tenantId,
      session.userId,
      session.id,
    ])
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        )
      )
        throw new Error("Invalid secret identity");
    return `${this.vault.config.instance}/${metadata ? "metadata" : "data"}/configurator/tenants/${session.tokenTenantId ?? session.tenantId}/users/${session.userId}/github/${session.id}`;
  }

  async put(session: Session, token: string) {
    const path = this.path(session);
    await this.vault.authorized(async (headers) => {
      const response = await this.vault.call(path, {
        method: "POST",
        headers,
        body: JSON.stringify({
          options: { cas: 0 },
          data: {
            token,
            tenantId: session.tokenTenantId ?? session.tenantId,
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
    return this.vault.authorized(async (headers) => {
      const response = await this.vault.call(path, { headers });
      if (!response.ok) throw new Error("Secret read failed");
      const value = (await response.json()) as {
        data?: { data?: Record<string, unknown> };
      };
      const data = value.data?.data;
      if (
        !data ||
        data.tenantId !== (session.tokenTenantId ?? session.tenantId) ||
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
    await this.vault.authorized(async (headers) => {
      const response = await this.vault.call(path, {
        method: "DELETE",
        headers,
      });
      if (!response.ok && response.status !== 404)
        throw new Error("Secret deletion failed");
      await response.arrayBuffer();
    });
  }
}
