import { z } from "zod";
import type { Session } from "../auth/store.js";
import type { VaultConnection } from "../storage/vault.js";
import type { ServiceAccountKey } from "./key.js";

export interface CredentialSecrets {
  put(session: Session, id: string, key: ServiceAccountKey): Promise<void>;
  remove(session: Session, id: string): Promise<void>;
}
export class VaultCredentialSecrets implements CredentialSecrets {
  constructor(private readonly vault: VaultConnection) {}
  private path(session: Session, id: string, metadata = false) {
    const ids = [session.tenantId, session.userId, id].map((value) =>
      z.uuid().parse(value),
    );
    return `${this.vault.config.instance}/${metadata ? "metadata" : "data"}/configurator/tenants/${ids[0]}/users/${ids[1]}/credentials/${ids[2]}`;
  }
  async put(session: Session, id: string, key: ServiceAccountKey) {
    const path = this.path(session, id);
    await this.vault.authorized(async (headers) => {
      const response = await this.vault.call(path, {
        method: "POST",
        headers,
        body: JSON.stringify({
          options: { cas: 0 },
          data: {
            tenantId: session.tenantId,
            userId: session.userId,
            profileId: id,
            kind: "stackit-service-account",
            key,
          },
        }),
      });
      if (!response.ok) throw new Error("Credential storage failed");
      await response.arrayBuffer();
    });
  }
  async remove(session: Session, id: string) {
    const path = this.path(session, id, true);
    await this.vault.authorized(async (headers) => {
      const response = await this.vault.call(path, {
        method: "DELETE",
        headers,
      });
      if (!response.ok && response.status !== 404)
        throw new Error("Credential deletion failed");
      await response.arrayBuffer();
    });
  }
}
