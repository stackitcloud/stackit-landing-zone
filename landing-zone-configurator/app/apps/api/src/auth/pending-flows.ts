import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { ArtifactCrypto } from "../plans/crypto.js";
import type {
  StackitAuthorization,
  StackitDeviceFlow,
} from "./stackit-device.js";

export type PendingFlow = {
  flow: StackitDeviceFlow;
  busy: boolean;
  expiresAt: number;
  existingSessionId?: string | null;
  authorization?: StackitAuthorization;
  saved?: boolean;
};
type Stored = Omit<PendingFlow, "flow" | "busy"> & {
  snapshot: ReturnType<StackitDeviceFlow["snapshot"]>;
};
export type PendingFlowStorage = {
  pool: Pool;
  crypto: ArtifactCrypto;
};

// Leases deliberately have no automatic takeover: a crashed token exchange is
// ambiguous and must never be replayed on another replica. The flow's TTL bounds
// the abandoned lease. Connections are returned before any provider HTTP call.
export class PendingFlows {
  private readonly memory = new Map<string, PendingFlow>();
  private readonly leases = new WeakMap<PendingFlow, string>();
  private readonly scope: string;
  constructor(
    origin: string,
    private readonly purpose: "login" | "proof",
    private readonly factory: (
      organizationId?: string,
      purpose?: "login" | "proof",
    ) => StackitDeviceFlow,
    private readonly storage?: PendingFlowStorage,
  ) {
    this.scope = JSON.stringify([origin, purpose]);
  }
  private hash(key: string) {
    return createHash("sha256").update(key).digest("hex");
  }
  private encode(key: string, entry: PendingFlow) {
    if (!this.storage) throw new Error("stackit_flow_storage_required");
    const { flow, busy: _busy, ...rest } = entry;
    const bytes = Buffer.from(
      JSON.stringify({ ...rest, snapshot: flow.snapshot() }),
    );
    if (bytes.length > 262116) throw new Error("stackit_flow_too_large");
    return this.storage.crypto.encrypt(
      bytes,
      "stackit-pending-flow",
      this.scope,
      this.hash(key),
    );
  }
  private decode(key: string, bytes: Buffer): PendingFlow {
    if (!this.storage) throw new Error("stackit_flow_storage_required");
    const stored = JSON.parse(
      this.storage.crypto
        .decrypt(bytes, "stackit-pending-flow", this.scope, this.hash(key))
        .toString(),
    ) as Stored;
    const { snapshot, ...rest } = stored;
    return {
      ...rest,
      busy: false,
      flow: this.factory(snapshot.organizationId, this.purpose).restore(
        snapshot,
      ),
    };
  }
  private cleanup() {
    for (const [key, entry] of this.memory)
      if (entry.expiresAt <= Date.now() && !entry.busy) this.memory.delete(key);
  }
  async read(key: string): Promise<PendingFlow | undefined> {
    if (!this.storage) {
      this.cleanup();
      return this.memory.get(key);
    }
    const result = await this.storage.pool.query(
      "SELECT payload, lease FROM lzc_auth.pending_stackit_flows WHERE scope=$1 AND key_hash=$2 AND expires_at>now()",
      [this.scope, this.hash(key)],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    const entry = this.decode(key, row.payload);
    entry.busy = row.lease !== null;
    return entry;
  }
  async get(key: string): Promise<PendingFlow | undefined> {
    if (!this.storage) {
      this.cleanup();
      const entry = this.memory.get(key);
      if (entry && !entry.busy) {
        entry.busy = true;
        const acquired = { ...entry, busy: false };
        this.leases.set(acquired, "memory");
        return acquired;
      }
      return entry;
    }
    const lease = randomUUID();
    const result = await this.storage.pool.query(
      "UPDATE lzc_auth.pending_stackit_flows SET lease=$3 WHERE scope=$1 AND key_hash=$2 AND lease IS NULL AND expires_at>now() RETURNING payload",
      [this.scope, this.hash(key), lease],
    );
    if (!result.rows[0]) {
      const busy = await this.read(key);
      if (busy) busy.busy = true;
      return busy;
    }
    const entry = this.decode(key, result.rows[0].payload);
    this.leases.set(entry, lease);
    return entry;
  }
  async set(key: string, entry: PendingFlow): Promise<boolean> {
    if (!this.storage) {
      this.cleanup();
      if (this.memory.has(key) || this.memory.size >= 100) return false;
      this.memory.set(key, entry);
      this.leases.set(entry, "memory");
      return true;
    }
    const client = await this.storage.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('lzc-pending-stackit-flows',0))",
      );
      await client.query(
        "DELETE FROM lzc_auth.pending_stackit_flows WHERE expires_at<=now()",
      );
      const lease = randomUUID();
      const result = await client.query(
        "INSERT INTO lzc_auth.pending_stackit_flows(scope,key_hash,payload,lease,expires_at) SELECT $1,$2,$3,$4,$5 WHERE (SELECT count(*) FROM lzc_auth.pending_stackit_flows WHERE scope=$1)<100 ON CONFLICT DO NOTHING",
        [
          this.scope,
          this.hash(key),
          this.encode(key, entry),
          lease,
          new Date(entry.expiresAt),
        ],
      );
      await client.query("COMMIT");
      if (!result.rowCount) return false;
      this.leases.set(entry, lease);
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async release(key: string, entry: PendingFlow) {
    const lease = this.leases.get(entry);
    if (!lease) return;
    this.leases.delete(entry);
    entry.busy = false;
    if (!this.storage) this.memory.set(key, entry);
    if (this.storage) {
      const result = await this.storage.pool.query(
        "UPDATE lzc_auth.pending_stackit_flows SET payload=$4,lease=NULL,expires_at=$5 WHERE scope=$1 AND key_hash=$2 AND lease=$3 AND expires_at>now()",
        [
          this.scope,
          this.hash(key),
          lease,
          this.encode(key, entry),
          new Date(entry.expiresAt),
        ],
      );
      if (result.rowCount !== 1) throw new Error("stackit_flow_lease_lost");
    }
  }
  async delete(key: string, entry: PendingFlow) {
    const lease = this.leases.get(entry);
    if (!lease) throw new Error("stackit_flow_busy");
    this.leases.delete(entry);
    if (this.storage)
      await this.storage.pool.query(
        "DELETE FROM lzc_auth.pending_stackit_flows WHERE scope=$1 AND key_hash=$2 AND lease=$3",
        [this.scope, this.hash(key), lease],
      );
    else this.memory.delete(key);
  }
}
