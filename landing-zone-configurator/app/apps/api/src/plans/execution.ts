import { createHash } from "node:crypto";
import { planSummarySchema, s3RunnerBackendSchema } from "@lzc/contracts";
import type pg from "pg";
import type { Session } from "../auth/store.js";
import { parseServiceAccountKey } from "../credentials/key.js";
import { CredentialError } from "../credentials/profiles.js";
import {
  type Backends,
  bindStateSource,
  contentHash,
  managementRunnerKey,
  stateDocument,
  stateForSource,
} from "../deployments/backends.js";
import type { PreparationManifest } from "../deployments/preparations.js";
import { type ArtifactCrypto, canonicalBase64 } from "./crypto.js";

type ExecutionRun = {
  id: string;
  operation: "plan" | "apply";
  mode: string;
  status: string;
  input_claimed: boolean;
  plan_id: string | null;
  artifact_sha256: string | null;
  state_key: string;
  state_version: string;
  engine_version: string;
  provider_lock_sha256: string;
  runner_droplet_id: string | null;
  summary: unknown;
};
type PlanArtifact = {
  run_id: string;
  sha256: string;
  ciphertext: Buffer;
  summary: unknown;
  binding_sha256: string;
  state_key: string;
  state_version: string;
  engine_version: string;
  provider_lock_sha256: string;
  runner_droplet_id: string;
};
type PlatformState = {
  state_key: string;
  version: string;
  ciphertext: Buffer | null;
  backend_id: string | null;
  stable_aad: boolean;
  remote_identity: string | null;
  lock_run_id: string | null;
  pending_backend_id: string | null;
  migration_run_id: string | null;
  migration_version: string | null;
  migration_sha256: string | null;
  runner_key_ciphertext: Buffer | null;
};
type CurrentState = PlatformState & {
  remote?: Awaited<ReturnType<Backends["current"]>>;
};

export const artifactLimit = 16 * 1024 * 1024;
export const stateLimit = 16 * 1024 * 1024;
export const engineVersion = "1.12.6";
export const providerLockHash =
  "a52433c424472d6e618caa3a94579bbcd19b60b759d053cf0d5caf9ac6872888";
export const executionLive =
  "('starting','initializing','validating','planning','applying')";
const fail = (code: string, status = 409) => new CredentialError(status, code);
export const sha256 = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        )
      : item,
  );
}
export const manifestBinding = (manifest: PreparationManifest) =>
  sha256(canonicalJson(manifest));
export function stableStateKey(
  session: Session,
  manifest: PreparationManifest,
): string {
  return sha256(
    JSON.stringify([session.tenantId, manifest.source.configurationId]),
  );
}

export function approvableSummary(raw: unknown): boolean {
  const parsed = planSummarySchema.safeParse(raw);
  return (
    parsed.success &&
    parsed.data.completeness === "complete" &&
    parsed.data.checks.fail === 0 &&
    parsed.data.checks.error === 0 &&
    parsed.data.checks.unknown === 0
  );
}

export class PlatformExecution {
  constructor(
    readonly crypto: ArtifactCrypto,
    readonly backends?: Backends,
  ) {}

  async current(
    client: pg.PoolClient,
    session: Session,
    state: PlatformState,
    refresh = false,
  ): Promise<CurrentState> {
    if (!state.backend_id) return state;
    if (!this.backends) throw fail("backend_service_unavailable", 503);
    const backend = await this.backends.runner(
      client,
      session,
      state.backend_id,
    );
    const remote = await this.backends.current(backend);
    if (state.remote_identity !== remote.identity) {
      if (!refresh) throw fail("state_changed");
      const updated = (
        await client.query<PlatformState>(
          "UPDATE lzc.platform_states SET version=version+1,remote_identity=$2 WHERE state_key=$1 RETURNING *",
          [state.state_key, remote.identity],
        )
      ).rows[0];
      if (!updated) throw fail("state_changed");
      return { ...updated, remote };
    }
    return { ...state, remote };
  }

  bootstrap(
    session: Session,
    state: Pick<PlatformState, "ciphertext" | "stable_aad" | "state_key">,
  ): Buffer {
    if (!state.ciphertext || !state.stable_aad)
      throw fail("legacy_state_migration_required");
    return this.crypto.decrypt(
      state.ciphertext,
      session.tenantId,
      state.state_key,
      `state:${state.state_key}`,
    );
  }
  runnerKey(
    session: Session,
    state: Pick<PlatformState, "runner_key_ciphertext" | "state_key">,
  ) {
    if (!state.runner_key_ciphertext) return undefined;
    try {
      return parseServiceAccountKey(
        JSON.parse(
          this.crypto
            .decrypt(
              state.runner_key_ciphertext,
              session.tenantId,
              state.state_key,
              `runner-key:${state.state_key}`,
            )
            .toString("utf8"),
        ),
      );
    } catch {
      throw fail("management_runner_key_not_verified");
    }
  }

  async capture(
    client: pg.PoolClient,
    session: Session,
    manifest: PreparationManifest,
  ) {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`state-source:${session.tenantId}:${manifest.source.configurationId}`],
    );
    const legacy = await client.query(
      "SELECT lzc_auth.has_legacy_state($1) AS present",
      [manifest.source.configurationId],
    );
    if (legacy.rows[0]?.present) throw fail("legacy_state_migration_required");
    const bound = await stateForSource(client, manifest.source.configurationId);
    let key = bound?.state_key ?? stableStateKey(session, manifest);
    if (manifest.backend) {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`state-backend:${session.tenantId}:${manifest.backend.id}`],
      );
      const registered = (
        await client.query(
          "SELECT id,descriptor FROM lzc.state_backends WHERE id=$1",
          [manifest.backend.id],
        )
      ).rows[0];
      if (
        !registered ||
        contentHash(registered.descriptor) !==
          contentHash(manifest.backend.descriptor)
      )
        throw fail("backend_binding_changed");
      const existing = (
        await client.query<{ state_key: string }>(
          "SELECT state_key FROM lzc.platform_states WHERE backend_id=$1",
          [manifest.backend.id],
        )
      ).rows[0];
      if (
        bound &&
        (bound.backend_id !== manifest.backend.id ||
          (existing && existing.state_key !== bound.state_key))
      )
        throw fail("backend_binding_changed");
      key = existing?.state_key ?? key;
    }
    if (manifest.backend && manifest.backend.stateIdentity !== key)
      throw fail("backend_binding_changed");
    await client.query(
      "INSERT INTO lzc.platform_states(state_key,tenant_id,owner_user_id,configuration_id,stable_aad,backend_id) VALUES($1,$2,$3,$4,true,$5) ON CONFLICT DO NOTHING",
      [
        key,
        session.tenantId,
        session.userId,
        manifest.source.configurationId,
        manifest.backend?.id ?? null,
      ],
    );
    const row = (
      await client.query(
        "SELECT * FROM lzc.platform_states WHERE state_key=$1 FOR UPDATE",
        [key],
      )
    ).rows[0];
    if (!row || row.lock_run_id) throw fail("state_locked");
    if (!row.stable_aad) throw fail("legacy_state_migration_required");
    if (manifest.backend && manifest.backend.id !== row.backend_id)
      throw fail("backend_binding_changed");
    await bindStateSource(
      client,
      session,
      manifest.source.configurationId,
      key,
    );
    const current = await this.current(client, session, row, true);
    return { key, version: String(current.version) };
  }

  async artifact(
    client: pg.PoolClient,
    session: Session,
    run: ExecutionRun,
    manifest: PreparationManifest,
    data: string,
    summary: unknown,
  ) {
    if (
      run.operation !== "plan" ||
      run.mode !== "platform-plan" ||
      run.status !== "planning" ||
      !run.input_claimed ||
      !run.runner_droplet_id
    )
      throw fail("invalid_runner_transition");
    let bytes: Buffer;
    try {
      bytes = canonicalBase64(data, artifactLimit);
    } catch {
      throw fail("artifact_invalid", 400);
    }
    const parsed = planSummarySchema.parse(summary);
    const state = (
      await client.query(
        "SELECT * FROM lzc.platform_states WHERE state_key=$1 FOR UPDATE",
        [run.state_key],
      )
    ).rows[0];
    if (state) await this.current(client, session, state);
    if (
      !state ||
      String(state.version) !== String(run.state_version) ||
      (state.lock_run_id && state.lock_run_id !== run.id)
    )
      throw fail("state_changed");
    const hash = sha256(bytes);
    const ciphertext = this.crypto.encrypt(
      bytes,
      session.tenantId,
      session.userId,
      `artifact:${run.id}`,
    );
    const inserted = await client.query(
      "INSERT INTO lzc.plan_artifacts(run_id,tenant_id,owner_user_id,sha256,ciphertext,summary,binding_sha256,state_key,state_version,engine_version,provider_lock_sha256,runner_droplet_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING RETURNING run_id",
      [
        run.id,
        session.tenantId,
        session.userId,
        hash,
        ciphertext,
        JSON.stringify(parsed),
        manifestBinding(manifest),
        run.state_key,
        run.state_version,
        run.engine_version,
        run.provider_lock_sha256,
        run.runner_droplet_id,
      ],
    );
    if (!inserted.rowCount) throw fail("artifact_already_saved");
    return { sha256: hash };
  }

  async approved(
    client: pg.PoolClient,
    run: ExecutionRun,
    manifest: PreparationManifest,
    hash: string,
    session?: Session,
  ) {
    const artifact = (
      await client.query<PlanArtifact>(
        "SELECT * FROM lzc.plan_artifacts WHERE run_id=$1 AND sha256=$2 AND expires_at>now()",
        [run.id, hash],
      )
    ).rows[0];
    const state = (
      await client.query(
        "SELECT * FROM lzc.platform_states WHERE state_key=$1 FOR UPDATE",
        [run.state_key],
      )
    ).rows[0];
    if (state?.backend_id) {
      if (!session) throw fail("state_changed");
      await this.current(client, session, state);
    }
    const used = await client.query(
      "SELECT id FROM lzc.plan_runs WHERE plan_id=$1",
      [run.id],
    );
    if (
      run.operation !== "plan" ||
      run.status !== "succeeded" ||
      run.mode !== "platform-plan" ||
      run.artifact_sha256 !== hash ||
      !artifact ||
      !approvableSummary(artifact.summary) ||
      canonicalJson(run.summary) !== canonicalJson(artifact.summary) ||
      artifact.binding_sha256 !== manifestBinding(manifest) ||
      artifact.engine_version !== engineVersion ||
      artifact.provider_lock_sha256 !== providerLockHash ||
      artifact.runner_droplet_id !== run.runner_droplet_id ||
      artifact.state_key !== run.state_key ||
      String(artifact.state_version) !== String(run.state_version) ||
      !state ||
      state.lock_run_id ||
      String(state.version) !== String(artifact.state_version) ||
      used.rowCount
    )
      throw fail("plan_not_approvable");
    return artifact;
  }

  bytes(session: Session, artifact: PlanArtifact): Buffer {
    try {
      const bytes = this.crypto.decrypt(
        artifact.ciphertext,
        session.tenantId,
        session.userId,
        `artifact:${artifact.run_id}`,
      );
      if (sha256(bytes) !== artifact.sha256) throw fail("artifact_invalid");
      return bytes;
    } catch {
      throw fail("artifact_invalid");
    }
  }

  async state(
    client: pg.PoolClient,
    session: Session,
    run: ExecutionRun,
    action: "read" | "write" | "lock" | "unlock",
    raw?: unknown,
    lockId?: string,
  ) {
    if (
      !run.input_claimed ||
      !["platform-plan", "platform-apply"].includes(run.mode)
    )
      throw fail("invalid_runner_transition");
    const state = (
      await client.query(
        "SELECT * FROM lzc.platform_states WHERE state_key=$1 FOR UPDATE",
        [run.state_key],
      )
    ).rows[0];
    if (!state) throw fail("state_failed");
    if (state.backend_id) throw fail("bootstrap_backend_unavailable", 403);
    if (!state.stable_aad) throw fail("legacy_state_migration_required");
    const migrating = Boolean(state.pending_backend_id);
    if (
      migrating &&
      (run.operation !== "apply" ||
        run.status !== "applying" ||
        state.migration_run_id !== run.id ||
        String(state.migration_version) !== String(state.version) ||
        state.migration_sha256 !==
          contentHash(stateDocument(this.bootstrap(session, state))))
    )
      throw fail("state_changed");
    const snapshotVersion = migrating
      ? state.migration_version
      : run.state_version;
    if (migrating && action === "write")
      throw fail("state_write_forbidden", 403);
    if (action === "lock") {
      if (run.operation === "apply") {
        const artifact = await client.query(
          "SELECT run_id FROM lzc.plan_artifacts WHERE run_id=$1 AND sha256=$2 AND expires_at>now()",
          [run.plan_id, run.artifact_sha256],
        );
        if (!artifact.rowCount) throw fail("artifact_invalid");
      }
      if (
        state.lock_run_id &&
        (state.lock_run_id !== run.id || state.lock_id !== lockId)
      )
        throw fail("state_locked", 423);
      if (String(state.version) !== String(snapshotVersion))
        throw fail("state_changed");
      await client.query(
        "UPDATE lzc.platform_states SET lock_run_id=$2,lock_id=$3 WHERE state_key=$1",
        [run.state_key, run.id, lockId],
      );
      return;
    }
    if (action === "unlock") {
      if (state.lock_run_id !== run.id || state.lock_id !== lockId)
        throw fail("state_locked", 423);
      await client.query(
        "UPDATE lzc.platform_states SET lock_run_id=NULL,lock_id=NULL WHERE state_key=$1",
        [run.state_key],
      );
      return;
    }
    if (action === "write") {
      if (
        run.operation !== "apply" ||
        run.status !== "applying" ||
        state.lock_run_id !== run.id ||
        state.lock_id !== lockId
      )
        throw fail("state_write_forbidden", 403);
      const bytes = Buffer.from(JSON.stringify(raw));
      if (
        bytes.length > stateLimit ||
        !raw ||
        typeof raw !== "object" ||
        Array.isArray(raw)
      )
        throw fail("state_failed", 400);
      const object = raw as Record<string, unknown>;
      if (
        object.version !== 4 ||
        typeof object.lineage !== "string" ||
        !Number.isSafeInteger(object.serial) ||
        (object.serial as number) < 0
      )
        throw fail("state_failed", 400);
      if (state.ciphertext) {
        const previous = JSON.parse(
          this.crypto
            .decrypt(
              state.ciphertext,
              session.tenantId,
              run.state_key,
              `state:${run.state_key}`,
            )
            .toString("utf8"),
        );
        if (
          object.lineage !== previous.lineage ||
          (object.serial as number) < previous.serial ||
          (object.serial === previous.serial &&
            sha256(bytes) !== sha256(JSON.stringify(previous)))
        )
          throw fail("state_changed");
      }
      await client.query(
        "UPDATE lzc.platform_states SET version=version+1,ciphertext=$2 WHERE state_key=$1",
        [
          run.state_key,
          this.crypto.encrypt(
            bytes,
            session.tenantId,
            run.state_key,
            `state:${run.state_key}`,
          ),
        ],
      );
      return;
    }
    if (state.lock_run_id && state.lock_run_id !== run.id)
      throw fail("state_locked", 423);
    if (
      state.lock_run_id !== run.id &&
      String(state.version) !== String(snapshotVersion)
    )
      throw fail("state_changed");
    if (!state.ciphertext) return null;
    try {
      return JSON.parse(
        this.crypto
          .decrypt(
            state.ciphertext,
            session.tenantId,
            run.state_key,
            `state:${run.state_key}`,
          )
          .toString("utf8"),
      );
    } catch {
      throw fail("state_failed");
    }
  }

  async recovery(
    client: pg.PoolClient,
    session: Session,
    run: ExecutionRun,
    data: string,
    hash: string,
  ) {
    if (
      run.operation !== "apply" ||
      run.status !== "applying" ||
      !run.input_claimed
    )
      throw fail("invalid_runner_transition");
    let bytes: Buffer;
    try {
      bytes = canonicalBase64(data, stateLimit);
    } catch {
      throw fail("recovery_invalid", 400);
    }
    stateDocument(bytes);
    if (sha256(bytes) !== hash) throw fail("recovery_invalid", 400);
    const state = (
      await client.query(
        "SELECT * FROM lzc.platform_states WHERE state_key=$1 FOR UPDATE",
        [run.state_key],
      )
    ).rows[0];
    if (!state) throw fail("state_failed");
    if (
      state.ciphertext &&
      stateDocument(this.bootstrap(session, state)).lineage !==
        stateDocument(bytes).lineage
    )
      throw fail("state_changed");
    const inserted = await client.query(
      "INSERT INTO lzc.state_recoveries(run_id,tenant_id,state_key,sha256,ciphertext) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING run_id",
      [
        run.id,
        session.tenantId,
        run.state_key,
        hash,
        this.crypto.encrypt(
          bytes,
          session.tenantId,
          run.state_key,
          `recovery:${run.id}`,
        ),
      ],
    );
    if (!inserted.rowCount) {
      const saved = (
        await client.query(
          "SELECT sha256 FROM lzc.state_recoveries WHERE run_id=$1",
          [run.id],
        )
      ).rows[0];
      if (saved?.sha256 !== hash) throw fail("recovery_already_saved");
    }
    return { sha256: hash };
  }

  async migration(
    client: pg.PoolClient,
    session: Session,
    run: ExecutionRun,
    phase: "prepare" | "complete",
    organizationId?: string,
  ) {
    if (!this.backends) throw fail("backend_service_unavailable", 503);
    if (
      run.operation !== "apply" ||
      run.status !== "applying" ||
      !run.input_claimed
    )
      throw fail("invalid_runner_transition");
    const state = (
      await client.query(
        "SELECT * FROM lzc.platform_states WHERE state_key=$1 FOR UPDATE",
        [run.state_key],
      )
    ).rows[0];
    if (!state || state.lock_run_id || state.backend_id)
      throw fail("migration_not_ready");
    const source = stateDocument(this.bootstrap(session, state));
    const hash = contentHash(source);
    if (phase === "prepare") {
      const credentialResources = source.resources.filter(
        (resource) =>
          resource.module === "module.management" &&
          resource.mode === "managed" &&
          resource.type === "stackit_objectstorage_credential" &&
          resource.name === "this",
      );
      const bucketResources = source.resources.filter(
        (resource) =>
          resource.module === "module.management" &&
          resource.mode === "managed" &&
          resource.type === "stackit_objectstorage_bucket" &&
          resource.name === "tfstate",
      );
      const credentials =
        credentialResources.length === 1 &&
        credentialResources[0]?.instances?.length === 1 &&
        !credentialResources[0].instances[0]?.deposed
          ? credentialResources[0].instances[0]?.attributes
          : undefined;
      const bucket = source.outputs?.management_bucket_name_tfstate?.value;
      if (
        !credentials ||
        typeof credentials.project_id !== "string" ||
        !credentials.project_id ||
        bucketResources.length !== 1 ||
        bucketResources[0]?.instances?.length !== 1 ||
        bucketResources[0].instances[0]?.deposed ||
        bucketResources[0].instances[0]?.attributes?.name !== bucket ||
        bucketResources[0].instances[0]?.attributes?.project_id !==
          credentials.project_id
      )
        throw fail("management_backend_not_verified");
      const backend = {
        descriptor: {
          bucket,
          endpoint: "https://object.storage.eu01.onstackit.cloud",
          region: "eu01",
          key: "terraform.tfstate",
          useLockfile: true,
        },
        credentials: {
          accessKeyId: credentials?.access_key,
          secretAccessKey: credentials?.secret_access_key,
        },
      };
      const parsed = s3RunnerBackendSchema.safeParse({
        kind: "s3",
        ...backend,
      });
      if (!parsed.success) throw fail("management_backend_not_verified");
      if (await this.backends.read(parsed.data, "terraform.tfstate.tflock"))
        throw fail("state_locked", 423);
      const target = await this.backends.read(parsed.data, "terraform.tfstate");
      if (target && contentHash(stateDocument(target.bytes)) !== hash)
        throw fail("migration_target_not_empty");
      let backendId = state.pending_backend_id;
      if (backendId) {
        if (
          state.migration_run_id !== run.id ||
          String(state.migration_version) !== String(state.version) ||
          state.migration_sha256 !== hash
        )
          throw fail("state_changed");
        const saved = await this.backends.runner(client, session, backendId);
        if (contentHash(saved) !== contentHash(parsed.data))
          throw fail("backend_binding_changed");
      } else {
        backendId = (
          await this.backends.insert(client, session, {
            descriptor: parsed.data.descriptor,
            credentials: parsed.data.credentials,
          })
        ).id;
        await client.query(
          "UPDATE lzc.platform_states SET pending_backend_id=$2,migration_run_id=$3,migration_version=version,migration_sha256=$4 WHERE state_key=$1",
          [run.state_key, backendId, run.id, hash],
        );
      }
      return {
        backend: await this.backends.runner(client, session, backendId),
      };
    }
    if (
      state.migration_run_id !== run.id ||
      !state.pending_backend_id ||
      String(state.migration_version) !== String(state.version) ||
      state.migration_sha256 !== hash
    )
      throw fail("state_changed");
    const backend = await this.backends.runner(
      client,
      session,
      state.pending_backend_id,
    );
    const target = await this.backends.current(backend);
    if (
      contentHash(target.document) !== hash ||
      target.document.lineage !== source.lineage ||
      target.document.serial !== source.serial
    )
      throw fail("migration_verification_failed");
    const runnerKey = organizationId
      ? managementRunnerKey(source, organizationId)
      : undefined;
    const switched = await client.query(
      "UPDATE lzc.platform_states SET backend_id=pending_backend_id,ciphertext=NULL,remote_identity=$4,version=version+1,runner_key_ciphertext=$6 WHERE state_key=$1 AND version=$2 AND migration_run_id=$3 AND migration_sha256=$5 RETURNING state_key",
      [
        run.state_key,
        state.migration_version,
        run.id,
        target.identity,
        hash,
        runnerKey
          ? this.crypto.encrypt(
              Buffer.from(JSON.stringify(runnerKey)),
              session.tenantId,
              run.state_key,
              `runner-key:${run.state_key}`,
            )
          : null,
      ],
    );
    if (!switched.rowCount) throw fail("state_changed");
    return { migrated: true };
  }
}
