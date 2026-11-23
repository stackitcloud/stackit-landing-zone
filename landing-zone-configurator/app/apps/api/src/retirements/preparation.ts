import { createHash, randomUUID } from "node:crypto";
import {
  retirementAdapterCommit,
  retirementInventory,
  retirementInventorySchema,
  retirementPrivateTargets,
  retirementStateSha256,
  type StackitRetirementCloud,
} from "@lzc/contracts/recovery";
import type pg from "pg";
import { z } from "zod";
import type { Session } from "../auth/store.js";
import {
  CredentialError,
  type PostgresCredentialProfiles,
} from "../credentials/profiles.js";
import type { CredentialSecrets } from "../credentials/secrets.js";
import type { Backends } from "../deployments/backends.js";
import type { PlanRunner } from "../plans/cloud-foundry.js";
import type { ArtifactCrypto } from "../plans/crypto.js";
import { withTenant } from "../storage/database.js";
import { RetirementCapture } from "./capture.js";
import { retirementSourceInputs } from "./source-inputs.js";

export const retirementPrepareSchema = z.strictObject({
  generation: z.number().int().positive().refine(Number.isSafeInteger),
  credentialProfileId: z.uuid(),
  cleanupProjectId: z.uuid(),
  confirmStateHandoff: z.literal(true),
  confirmCleanupPermissionsSurvive: z.literal(true),
});
const contextSchema = z.object({
  retirementId: z.uuid(),
  generation: z.number().int().positive(),
  organizationId: z.uuid(),
  phase: z.string(),
  parentFolderIds: z.array(z.uuid()),
  notBefore: z.iso.datetime({ offset: true }),
  scopes: z.array(
    z.object({
      id: z.uuid(),
      scopeKey: z.string(),
      instanceId: z.uuid().nullable(),
      inventoryId: z.uuid(),
      stateCiphertext: z.string(),
      stateSha256: z.string(),
      stateVersion: z.number().int().positive(),
      lockRunId: z.uuid().nullable(),
    }),
  ),
});
const snapshotSchema = z.object({
  id: z.uuid(),
  retirement_id: z.uuid(),
  generation: z.coerce.number().int().positive(),
  scope_key: z.string(),
  instance_id: z.uuid().nullable(),
  state_ciphertext: z.instanceof(Buffer),
  inventory_ciphertext: z.instanceof(Buffer),
  source_ciphertext: z.instanceof(Buffer),
  state_sha256: z.string(),
});
export class RetirementPreparation {
  constructor(
    private readonly pool: pg.Pool,
    private readonly crypto: ArtifactCrypto,
    private readonly backends: Backends,
    private readonly profiles: Pick<
      PostgresCredentialProfiles,
      "verifyForPreparation"
    >,
    private readonly secrets: CredentialSecrets,
    private readonly cloud: Pick<
      StackitRetirementCloud,
      "control" | "targets" | "folderChildren"
    >,
    private readonly controlProjectIds: readonly string[],
    private readonly executionRunner: Pick<
      PlanRunner,
      "retirementEnabled" | "supportsRetirement"
    >,
    private readonly applicationRunner?: PlanRunner,
  ) {
    z.array(z.uuid()).min(1).max(32).parse(controlProjectIds);
    if (
      executionRunner.retirementEnabled !== true ||
      !executionRunner.supportsRetirement
    )
      throw Error("Retirement runner package required");
  }
  private async stopped(session: Session, id: string, generation: number) {
    const writers = await withTenant(this.pool, session, async (client) =>
      z
        .array(
          z.object({
            jobId: z.uuid(),
            appId: z.uuid().nullable(),
            packageId: z.uuid().nullable(),
            status: z.string(),
          }),
        )
        .parse(
          (
            await client.query(
              "SELECT lzc_auth.retirement_writers($1,$2,$3) AS value",
              [session.id, id, generation],
            )
          ).rows[0].value,
        ),
    );
    for (const writer of writers) {
      if (
        !writer.appId ||
        !writer.packageId ||
        ![
          "succeeded",
          "failed",
          "cancelled",
          "reconciliation_required",
        ].includes(writer.status) ||
        !this.applicationRunner?.isStopped ||
        !(await this.applicationRunner.isStopped(
          writer.jobId,
          writer.appId,
          writer.packageId,
        ))
      )
        throw new CredentialError(409, "retirement_writers_unresolved");
      await withTenant(this.pool, session, (client) =>
        client.query(
          "SELECT lzc_auth.retirement_record_writer_stop($1,$2,$3,$4,$5,$6)",
          [
            session.id,
            id,
            generation,
            writer.jobId,
            writer.appId,
            writer.packageId,
          ],
        ),
      );
    }
  }
  async prepare(session: Session, id: string, raw: unknown) {
    const input = retirementPrepareSchema.parse(raw);
    z.uuid().parse(id);
    await this.stopped(session, id, input.generation);
    const context = await withTenant(this.pool, session, async (client) =>
      contextSchema.parse(
        (
          await client.query(
            "SELECT lzc_auth.retirement_execution_context($1,$2,$3) AS value",
            [session.id, id, input.generation],
          )
        ).rows[0].value,
      ),
    );
    if (Date.parse(context.notBefore) > Date.now())
      throw new CredentialError(409, "retirement_preparation_window");
    if (context.scopes.some((scope) => scope.lockRunId))
      throw new CredentialError(409, "retirement_writers_unresolved");
    const capture = new RetirementCapture(
      this.pool,
      this.crypto,
      this.backends,
    );
    if (!context.scopes.length)
      await capture.capture(session, id, input.generation);
    const rows = await withTenant(this.pool, session, async (client) =>
      z
        .array(snapshotSchema)
        .parse(
          (
            await client.query(
              "SELECT * FROM lzc_auth.retirement_read_inventories($1,$2,$3)",
              [session.id, id, input.generation],
            )
          ).rows,
        ),
    );
    if (!rows.length)
      throw new CredentialError(409, "retirement_inventory_incomplete");
    const opened = rows.map((row) => {
      const aad = `retirement:${id}:${row.generation}:${row.scope_key}`;
      const state = this.crypto.decrypt(
        row.state_ciphertext,
        session.tenantId,
        id,
        `${aad}:state`,
      );
      if (createHash("sha256").update(state).digest("hex") !== row.state_sha256)
        throw new CredentialError(409, "retirement_inventory_changed");
      const inventory = retirementInventorySchema.parse(
        JSON.parse(
          this.crypto
            .decrypt(
              row.inventory_ciphertext,
              session.tenantId,
              id,
              `${aad}:inventory`,
            )
            .toString("utf8"),
        ),
      );
      if (
        retirementStateSha256(inventory) !==
        retirementStateSha256(
          retirementInventory(JSON.parse(state.toString("utf8")), {
            includePrivate: true,
          }),
        )
      )
        throw new CredentialError(409, "retirement_inventory_changed");
      const source = z
        .record(z.string(), z.unknown())
        .parse(
          JSON.parse(
            this.crypto
              .decrypt(
                row.source_ciphertext,
                session.tenantId,
                id,
                `${aad}:source`,
              )
              .toString("utf8"),
          ),
        );
      return { row, state, inventory, source };
    });
    if (
      new Set(opened.map((scope) => scope.inventory.lineage)).size !==
      opened.length
    )
      throw new CredentialError(409, "retirement_shared_scope_requires_review");
    for (const scope of opened) {
      if (
        scope.inventory.resources.some((resource) =>
          resource.provider.includes("registry.terraform.org/"),
        )
      )
        throw new CredentialError(409, "retirement_engine_migration_required");

      const source = retirementSourceInputs(
        scope.source,
        Boolean(scope.row.instance_id),
        scope.row.instance_id ? "remove_application" : "remove_projects",
      );
      if (
        !scope.row.instance_id &&
        source.variables.organization_id !== context.organizationId
      )
        throw new CredentialError(409, "retirement_source_inputs_unavailable");
      // SNA-only Kubernetes/Helm/firewall APIs cannot be reached by the shared CF
      // runner. Refuse custody before it would strand such a deployment.
      const privateAddresses = new Set(
        retirementPrivateTargets(scope.inventory),
      );
      if (
        scope.inventory.resources.some(
          (resource) =>
            privateAddresses.has(resource.address) &&
            !/\/(?:vault|grafana)"\]/.test(resource.provider),
        )
      )
        throw new CredentialError(409, "retirement_private_runner_required");

      const revision = scope.row.instance_id
        ? z.string().parse(scope.source.sourceRevision)
        : retirementAdapterCommit;
      const phase = scope.row.instance_id
        ? "remove_application"
        : "remove_projects";
      if (!this.executionRunner.supportsRetirement?.(revision, phase))
        throw new CredentialError(409, "retirement_source_unavailable");
      if (
        !scope.row.instance_id &&
        retirementPrivateTargets(scope.inventory).length
      ) {
        const manifest = z
          .object({ accelerator: z.object({ commit: z.string() }) })
          .parse(scope.source.manifest);
        if (
          !this.executionRunner.supportsRetirement?.(
            manifest.accelerator.commit,
            "private_workloads",
          )
        )
          throw new CredentialError(409, "retirement_source_unavailable");
      }
    }
    const identities = (type: string) =>
      opened.flatMap((scope) =>
        scope.inventory.resources
          .filter((resource) => resource.type === type)
          .map((resource) => z.uuid().parse(resource.id)),
      );
    const projectIds = identities("stackit_resourcemanager_project"),
      folderIds = identities("stackit_resourcemanager_folder");
    if (context.parentFolderIds.some((id) => !folderIds.includes(id)))
      throw new CredentialError(409, "retirement_shared_scope_requires_review");
    if (
      new Set(projectIds).size !== projectIds.length ||
      new Set(folderIds).size !== folderIds.length
    )
      throw new CredentialError(409, "retirement_shared_scope_requires_review");
    const checked = await this.profiles.verifyForPreparation(
      session,
      input.credentialProfileId,
      context.organizationId,
    );
    const secret = await this.secrets.get(session, input.credentialProfileId);
    if (
      checked.check.status !== "passed" ||
      checked.check.organizationId !== context.organizationId ||
      checked.version !== secret.version ||
      checked.keyId !== secret.key.credentials.kid
    )
      throw new CredentialError(409, "retirement_cleanup_identity_unverified");
    const control = await this.cloud.control(
      {
        organizationId: context.organizationId,
        cleanupProjectId: input.cleanupProjectId,
        controlProjectIds: [...this.controlProjectIds],
        targetProjectIds: projectIds,
        targetFolderIds: folderIds,
      },
      secret.key,
    );
    const ownership = !context.scopes.length
      ? await this.cloud.targets(
          { organizationId: context.organizationId, projectIds, folderIds },
          secret.key,
        )
      : null;
    const currentFolders = !context.scopes.length
      ? folderIds
      : context.scopes.flatMap((scope) =>
          retirementInventory(
            JSON.parse(
              this.crypto
                .decrypt(
                  Buffer.from(scope.stateCiphertext, "base64"),
                  session.tenantId,
                  id,
                  `retirement-state:${scope.id}`,
                )
                .toString("utf8"),
            ),
            { includePrivate: true },
          )
            .resources.filter(
              (resource) => resource.type === "stackit_resourcemanager_folder",
            )
            .map((resource) => z.uuid().parse(resource.id)),
        );
    const children: Awaited<
      ReturnType<StackitRetirementCloud["folderChildren"]>
    >[] = [];
    for (const folderId of currentFolders)
      children.push(
        await this.cloud.folderChildren(
          { organizationId: context.organizationId, folderId, projectIds },
          secret.key,
        ),
      );
    if (!context.scopes.length)
      await capture.capture(session, id, input.generation);
    const handoffs = context.scopes.length
      ? []
      : opened.map((scope) => {
          const scopeId = randomUUID();
          return {
            id: scopeId,
            inventoryId: scope.row.id,
            stage: scope.row.instance_id
              ? "remove_application"
              : retirementPrivateTargets(scope.inventory).length
                ? "private_workloads"
                : "remove_projects",
            stateCiphertext: this.crypto
              .encrypt(
                scope.state,
                session.tenantId,
                id,
                `retirement-state:${scopeId}`,
              )
              .toString("base64"),
            stateSha256: retirementStateSha256(
              JSON.parse(scope.state.toString("utf8")),
            ),
          };
        });
    const witness = this.crypto.encrypt(
      Buffer.from(
        JSON.stringify({ control, ownership, children, projectIds, folderIds }),
      ),
      session.tenantId,
      id,
      `retirement-control:${input.generation}`,
    );
    const grant = await withTenant(
      this.pool,
      session,
      async (client) =>
        (
          await client.query(
            "SELECT lzc_auth.retirement_prepare_control($1,$2,$3,$4,$5,$6,$7,$8,$9) AS id",
            [
              session.id,
              id,
              input.generation,
              input.credentialProfileId,
              secret.version,
              secret.key.credentials.kid,
              input.cleanupProjectId,
              witness,
              JSON.stringify(handoffs),
            ],
          )
        ).rows[0].id,
    );
    return {
      id: z.uuid().parse(grant),
      retirementId: id,
      generation: input.generation,
      scopeCount: context.scopes.length || handoffs.length,
    };
  }
}
