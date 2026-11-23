import { createHash } from "node:crypto";
import { retirementInventory } from "@lzc/contracts/recovery";
import type pg from "pg";
import { z } from "zod";
import type { Session } from "../auth/store.js";
import { CredentialError } from "../credentials/profiles.js";
import { type Backends, contentHash } from "../deployments/backends.js";
import type { ArtifactCrypto } from "../plans/crypto.js";
import { canonicalJson, stateLimit } from "../plans/execution.js";
import { withTenant } from "../storage/database.js";

const scopeSchema = z.object({
  scopeKey: z.string().min(1).max(1024),
  backendId: z.uuid().nullable(),
  instanceId: z.uuid().optional(),
  requestedBy: z.uuid().optional(),
  descriptor: z.unknown().optional(),
});
const contextSchema = z.object({
  retirementId: z.uuid(),
  generation: z.number().int().positive(),
  organizationId: z.uuid(),
  root: scopeSchema.extend({
    stateVersion: z.number().int().nonnegative(),
    stateCiphertext: z.string().nullable(),
    stateIdentity: z.string().nullable(),
    manifest: z.record(z.string(), z.unknown()),
    appliedRunId: z.uuid(),
  }),
  applications: z
    .array(
      scopeSchema.extend({
        backendId: z.uuid(),
        inputs: z.record(z.string(), z.unknown()),
        appliedRunId: z.uuid(),
        sourceRevision: z.string().regex(/^[a-f0-9]{40}$/),
      }),
    )
    .max(1000),
});
const digest = (value: Buffer) =>
  createHash("sha256").update(value).digest("hex");
/** Captures preparation evidence only. It neither migrates authority nor dispatches Destroy. */
export class RetirementCapture {
  constructor(
    private readonly pool: pg.Pool,
    private readonly crypto: ArtifactCrypto,
    private readonly backends: Backends,
  ) {}
  async capture(session: Session, id: string, generation: number) {
    const snapshot = await withTenant(this.pool, session, async (client) => {
      const row = (
        await client.query(
          "SELECT lzc_auth.retirement_capture_context($1,$2,$3) AS context,lzc_auth.retirement_capture_digest($1,$2,$3) AS digest",
          [
            session.id,
            z.uuid().parse(id),
            z.number().int().positive().parse(generation),
          ],
        )
      ).rows[0];
      return {
        context: contextSchema.parse(row.context),
        digest: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .parse(row.digest),
      };
    });
    const scopes = [snapshot.context.root, ...snapshot.context.applications];
    const captured: {
      scope: z.infer<typeof scopeSchema>;
      identity: string;
      stateSha256: string;
      state: Buffer;
      inventory: Buffer;
      source: Buffer;
    }[] = [];
    for (const scope of scopes) {
      const backendId = scope.backendId;
      const backend = backendId
        ? await withTenant(this.pool, session, (client) =>
            this.backends.runner(client, session, backendId),
          )
        : undefined;
      if (
        backend &&
        scope.descriptor !== undefined &&
        contentHash(backend.descriptor) !== contentHash(scope.descriptor)
      )
        throw new CredentialError(409, "retirement_backend_changed");
      const read = async () => {
        if (backend) {
          const remote = await this.backends.current(backend, true);
          return { bytes: remote.bytes, identity: remote.identity };
        }
        const root = snapshot.context.root;
        if (scope.scopeKey !== root.scopeKey || !root.stateCiphertext)
          throw new CredentialError(409, "retirement_state_unavailable");
        const bytes = this.crypto.decrypt(
          Buffer.from(root.stateCiphertext, "base64"),
          session.tenantId,
          scope.scopeKey,
          `state:${scope.scopeKey}`,
        );
        return {
          bytes,
          identity: `bootstrap:${root.stateVersion}:${digest(bytes)}`,
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
      if (
        first.identity !== repeated.identity ||
        digest(first.bytes) !== digest(repeated.bytes)
      )
        throw new CredentialError(409, "retirement_state_changed");
      const aad = `retirement:${id}:${generation}:${scope.scopeKey}`;
      captured.push({
        scope,
        identity: first.identity,
        stateSha256: digest(first.bytes),
        state: this.crypto.encrypt(
          first.bytes,
          session.tenantId,
          id,
          `${aad}:state`,
        ),
        inventory: this.crypto.encrypt(
          Buffer.from(canonicalJson(inventory)),
          session.tenantId,
          id,
          `${aad}:inventory`,
        ),
        source: this.crypto.encrypt(
          Buffer.from(canonicalJson(scope)),
          session.tenantId,
          id,
          `${aad}:source`,
        ),
      });
    }
    // Every scope commits together under the same generation/context comparison.
    // Slow S3 reads never hold the admission lock or a database transaction open.
    await withTenant(this.pool, session, async (client) => {
      for (const item of captured)
        await client.query(
          "SELECT lzc_auth.retirement_save_inventory($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
          [
            session.id,
            id,
            generation,
            snapshot.digest,
            item.scope.scopeKey,
            item.stateSha256,
            item.identity,
            item.state,
            item.inventory,
            item.source,
          ],
        );
    });
    return { retirementId: id, generation, scopeCount: captured.length };
  }
}
