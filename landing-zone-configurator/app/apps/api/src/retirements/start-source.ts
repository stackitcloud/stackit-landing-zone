import { createHash } from "node:crypto";
import { retirementInventory } from "@lzc/contracts/recovery";
import type pg from "pg";
import { z } from "zod";
import type { Session } from "../auth/store.js";
import { CredentialError } from "../credentials/profiles.js";
import type { Backends } from "../deployments/backends.js";
import type { ArtifactCrypto } from "../plans/crypto.js";
import { stateLimit } from "../plans/execution.js";
import { withTenant } from "../storage/database.js";

const sourceSchema = z.object({
  stateKey: z.string(),
  stateVersion: z.string().regex(/^[1-9][0-9]*$/),
  applyRunId: z.uuid(),
  backendId: z.uuid().nullable(),
  stateCiphertext: z.string().nullable(),
});

/** Read only: native folder scope is independent of Application publication. */
export class RetirementStartSource {
  constructor(
    private readonly pool: pg.Pool,
    private readonly crypto: ArtifactCrypto,
    private readonly backends: Backends,
  ) {}

  async read(session: Session, stateKey: string) {
    const context = async () =>
      withTenant(this.pool, session, async (client) =>
        sourceSchema.parse(
          (
            await client.query(
              "SELECT lzc_auth.retirement_start_context($1,$2) AS value",
              [session.id, stateKey],
            )
          ).rows[0].value,
        ),
      );
    const source = await context();
    const backendId = source.backendId;
    const backend = backendId
      ? await withTenant(this.pool, session, (client) =>
          this.backends.runner(client, session, backendId),
        )
      : undefined;
    const read = async () => {
      if (backend) {
        const remote = await this.backends.current(backend, true);
        return { bytes: remote.bytes, identity: remote.identity };
      }
      if (!source.stateCiphertext)
        throw new CredentialError(409, "retirement_state_unavailable");
      return {
        bytes: this.crypto.decrypt(
          Buffer.from(source.stateCiphertext, "base64"),
          session.tenantId,
          source.stateKey,
          `state:${source.stateKey}`,
        ),
        identity: source.stateVersion,
      };
    };
    const first = await read();
    if (first.bytes.length > stateLimit)
      throw new CredentialError(409, "retirement_state_too_large");
    const inventory = retirementInventory(
      JSON.parse(first.bytes.toString("utf8")),
      { includePrivate: true },
    );
    const repeated = await read();
    const hash = (bytes: Buffer) =>
      createHash("sha256").update(bytes).digest("hex");
    if (
      first.identity !== repeated.identity ||
      hash(first.bytes) !== hash(repeated.bytes) ||
      JSON.stringify(source) !== JSON.stringify(await context())
    )
      throw new CredentialError(409, "retirement_state_changed");
    const folders = z
      .array(z.uuid())
      .max(1000)
      .parse(
        inventory.resources
          .filter(
            (resource) => resource.type === "stackit_resourcemanager_folder",
          )
          .map((resource) => resource.id),
      );
    return { applyRunId: source.applyRunId, folders: [...new Set(folders)] };
  }
}
