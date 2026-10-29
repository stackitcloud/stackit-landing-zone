import {
  applicationTemplateUpgradeRequestSchema,
  applicationUpgradeEdgePolicySchema,
} from "@lzc/contracts";
import {
  assessApplicationPlatformUpgrade,
  assessApplicationTemplateUpgrade,
  platformContractSchema,
  publishedProjectTemplateSchema,
} from "@lzc/domain";
import type pg from "pg";
import { z } from "zod";
import type { Session } from "../auth/store.js";

const revision = z.string().regex(/^[a-f0-9]{40}$/);
export const applicationUpgradeCandidateSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["template", "platform"]).default("template"),
  platformEdgeId: z.uuid().nullable().optional(),
  candidateHash: z.string().regex(/^[a-f0-9]{64}$/),
  edgeId: z.uuid().nullable(),
  versionId: z.uuid(),
  platformRevision: z.uuid(),
  parameters: z.record(z.string(), z.json()),
  resolvedSettings: z.record(z.string(), z.json()),
  sourceRevision: revision,
  executionBindingId: z.uuid().nullable(),
  sensitivePolicy: z.enum(["direct", "approval-required"]),
  createdAt: z.string(),
});
export const applicationUpgradeEdgeSchema = z.object({
  id: z.uuid(),
  fromVersionId: z.uuid(),
  toVersionId: z.uuid(),
  policy: applicationUpgradeEdgePolicySchema,
  publishedBy: z.uuid(),
  createdAt: z.string(),
});
export const applicationPlatformUpgradeEdgeSchema = z.object({
  id: z.uuid(),
  fromPlatformRevision: z.uuid(),
  toPlatformRevision: z.uuid(),
  policy: applicationUpgradeEdgePolicySchema,
  publishedBy: z.uuid(),
  createdAt: z.string(),
});
export const applicationPlatformUpgradeRequestSchema =
  applicationTemplateUpgradeRequestSchema.omit({ parameters: true });
export const publishApplicationPlatformUpgradeEdgeSchema = z.strictObject({
  fromPlatformRevision: z.uuid(),
  toPlatformRevision: z.uuid(),
  policy: applicationUpgradeEdgePolicySchema.default({
    sensitive: "approval-required",
  }),
  confirmPublication: z.literal(true),
});
export const applicationUpgradeContextSchema = z
  .object({
    originVersionId: z.uuid(),
    effectiveVersionId: z.uuid(),
    effectivePlatformRevision: z.uuid().nullable(),
    effectiveSettings: z.record(z.string(), z.json()),
    effectiveParameters: z.record(z.string(), z.json()),
    effectiveDeploymentPolicy: z.enum(["direct", "approval-required"]),
    bindingId: z.uuid().nullable(),
    candidate: applicationUpgradeCandidateSchema.nullable(),
    candidates: z.array(applicationUpgradeEdgeSchema).max(500),
    blockers: z.array(z.string().max(128)).max(50),
    lastAppliedVersionId: z.uuid().nullable(),
    lastAppliedPlatformRevision: z.uuid().nullable().default(null),
    platformCandidates: z
      .array(applicationPlatformUpgradeEdgeSchema)
      .max(500)
      .default([]),
  })
  .passthrough();
export const publishApplicationUpgradeEdgeSchema = z.strictObject({
  fromVersionId: z.uuid(),
  toVersionId: z.uuid(),
  policy: applicationUpgradeEdgePolicySchema.default({
    sensitive: "approval-required",
  }),
  confirmPublication: z.literal(true),
});
export const applicationUpgradeApprovalRequestSchema = z.strictObject({
  artifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
  confirmApproval: z.literal(true),
});
export class ApplicationUpgradeError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
export async function readApplicationUpgradeContext(
  client: pg.PoolClient,
  session: Session,
  id: string,
) {
  return applicationUpgradeContextSchema.parse(
    (
      await client.query<{ context: unknown }>(
        "SELECT lzc_auth.application_upgrade_context($1,$2) AS context",
        [session.id, id],
      )
    ).rows[0]?.context,
  );
}
function publication(row: Record<string, unknown>) {
  return publishedProjectTemplateSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    templateId: row.template_id,
    version: row.version,
    publishedBy: row.published_by,
    publishedAt:
      row.published_at instanceof Date
        ? row.published_at.toISOString()
        : row.published_at,
    deploymentPolicy: row.deployment_policy,
    acceleratorRevision: row.accelerator_revision,
    platformRevision: row.platform_revision,
    targetKey: row.target_key,
    template: row.document,
    ...(row.retired_at
      ? {
          retiredAt:
            row.retired_at instanceof Date
              ? row.retired_at.toISOString()
              : row.retired_at,
        }
      : {}),
  });
}
export async function previewApplicationUpgrade(
  client: pg.PoolClient,
  session: Session,
  id: string,
  input: unknown,
) {
  const previewRequest = applicationTemplateUpgradeRequestSchema
    .omit({ confirmUpgrade: true })
    .extend({ confirmUpgrade: z.literal(true).optional() })
    .parse(input);
  const request = { ...previewRequest, confirmUpgrade: true as const };
  const context = await readApplicationUpgradeContext(client, session, id);
  const owner = (
    await client.query<{ requested_by: string }>(
      "SELECT requested_by FROM lzc.application_instances WHERE id=$1",
      [id],
    )
  ).rows[0];
  if (owner?.requested_by !== session.userId)
    throw new ApplicationUpgradeError(403, "application_upgrade_access_denied");
  if (
    context.bindingId !== request.expectedBindingId ||
    context.effectiveVersionId !== request.expectedVersionId
  )
    throw new ApplicationUpgradeError(
      409,
      "application_upgrade_binding_changed",
    );
  const edge = context.candidates.find((e) => e.id === request.edgeId);
  if (!edge)
    throw new ApplicationUpgradeError(
      409,
      "application_upgrade_edge_unavailable",
    );
  const versions = await client.query<Record<string, unknown>>(
    "SELECT v.*,r.retired_at FROM lzc.application_template_versions v LEFT JOIN lzc.application_template_retirements r ON r.version_id=v.id AND r.tenant_id=v.tenant_id WHERE v.id=ANY($1::uuid[])",
    [[context.effectiveVersionId, edge.toVersionId]],
  );
  const current = versions.rows.find(
      (v) => v.id === context.effectiveVersionId,
    ),
    target = versions.rows.find((v) => v.id === edge.toVersionId);
  if (!current || !target || !context.effectivePlatformRevision)
    throw new ApplicationUpgradeError(
      409,
      "application_upgrade_target_unavailable",
    );
  const contracts = await client.query<{
    revision: string;
    document: unknown;
    identity: string | null;
  }>(
    "SELECT c.revision,c.document,d.backend_identity AS identity FROM lzc.application_platform_contracts c LEFT JOIN lzc.application_execution_delegations d ON d.tenant_id=c.tenant_id AND d.platform_revision=c.revision AND d.revoked_at IS NULL WHERE c.revision=ANY($1::uuid[])",
    [[context.effectivePlatformRevision, target.platform_revision]],
  );
  const before = contracts.rows.find(
      (c) => c.revision === context.effectivePlatformRevision,
    ),
    after = contracts.rows.find((c) => c.revision === target.platform_revision);
  if (!before || !after)
    throw new ApplicationUpgradeError(
      409,
      "application_upgrade_target_unavailable",
    );
  const human = (
    await client.query<{ email: string }>(
      "SELECT email FROM lzc.stackit_identities WHERE user_id=$1 AND issuer='https://accounts.stackit.cloud' AND revoked_at IS NULL AND valid_until>now()",
      [session.userId],
    )
  ).rows[0];
  if (!human)
    throw new ApplicationUpgradeError(
      403,
      "application_upgrade_identity_unavailable",
    );
  const assessment = qualifyUpgradeAssessment(
    assessApplicationTemplateUpgrade({
      current: publication(current),
      target: publication(target),
      currentSettings: context.effectiveSettings,
      parameters: context.effectiveParameters,
      requestedParameters: request.parameters ?? {},
      verifiedStackitEmail: human.email,
      currentPlatform: platformContractSchema.parse(before.document),
      targetPlatform: platformContractSchema.parse(after.document),
      currentBackendIdentity: before.identity ?? "",
      targetBackendIdentity: after.identity ?? "",
      edgePolicy: edge.policy,
      currentPlatformRevision: context.effectivePlatformRevision,
    }),
    !!before.identity &&
      !!after.identity &&
      (await upgradePlatformCurrent(
        client,
        session,
        String(target.platform_revision),
      )),
  );
  return {
    context,
    edge,
    assessment,
    request,
    target: publication(target),
    parameters: assessment.retainedParameters,
  };
}

function projectPlatformTarget(
  document: z.infer<typeof platformContractSchema>,
  targetKey: string | null | undefined,
) {
  return {
    ...document,
    targets:
      targetKey && document.targets[targetKey]
        ? { [targetKey]: document.targets[targetKey] }
        : {},
  };
}
export async function enrichApplicationUpgradeContext(
  client: pg.PoolClient,
  context: z.infer<typeof applicationUpgradeContextSchema>,
  session: Session,
) {
  const ids = [
    ...new Set([
      context.originVersionId,
      context.effectiveVersionId,
      ...context.candidates.map((e) => e.toVersionId),
    ]),
  ];
  const rows = await client.query<Record<string, unknown>>(
    "SELECT v.*,r.retired_at FROM lzc.application_template_versions v LEFT JOIN lzc.application_template_retirements r ON r.version_id=v.id AND r.tenant_id=v.tenant_id WHERE v.id=ANY($1::uuid[])",
    [ids],
  );
  const currentRow = rows.rows.find((v) => v.id === context.effectiveVersionId);
  if (!currentRow)
    throw new ApplicationUpgradeError(
      409,
      "application_upgrade_target_unavailable",
    );
  const current = publication(currentRow);
  const contracts = await client.query<{
    revision: string;
    document: unknown;
    identity: string | null;
  }>(
    "SELECT c.revision,c.document,d.backend_identity AS identity FROM lzc.application_platform_contracts c LEFT JOIN lzc.application_execution_delegations d ON d.tenant_id=c.tenant_id AND d.platform_revision=c.revision AND d.revoked_at IS NULL WHERE c.revision=ANY($1::uuid[])",
    [
      [
        context.effectivePlatformRevision,
        ...rows.rows.map((r) => r.platform_revision),
        ...context.platformCandidates.map((e) => e.toPlatformRevision),
      ],
    ],
  );
  const qualified = new Map(
    await Promise.all(
      contracts.rows.map(
        async (c) =>
          [
            c.revision,
            await upgradePlatformCurrent(client, session, c.revision),
          ] as const,
      ),
    ),
  );
  const before = contracts.rows.find(
    (c) => c.revision === context.effectivePlatformRevision,
  );
  const blocked = () => ({
    classification: "blocked" as const,
    reasons: [
      {
        code: "upgrade-context-incomplete",
        path: "identity",
        classification: "blocked" as const,
      },
    ],
    approvalPolicy: "approval-required" as const,
    retainedParameters: context.effectiveParameters,
    targetSettings: {},
    requiredParameters: [],
    requiresFreshPlan: true as const,
    applyAllowed: false as const,
  });
  const assess = <T>(task: () => T): T | ReturnType<typeof blocked> => {
    try {
      return task();
    } catch {
      return blocked();
    }
  };
  const email = context.effectiveSettings.owner_email;
  return {
    ...context,
    current,
    candidates: context.candidates.flatMap((edge) => {
      const row = rows.rows.find((v) => v.id === edge.toVersionId);
      if (!row) return [];
      const target = publication(row);
      const after = contracts.rows.find(
        (c) => c.revision === target.platformRevision,
      );
      const assessment =
        before &&
        after &&
        before.identity &&
        after.identity &&
        qualified.get(after.revision) &&
        typeof email === "string"
          ? assess(() =>
              assessApplicationTemplateUpgrade({
                current,
                target,
                currentSettings: context.effectiveSettings,
                parameters: context.effectiveParameters,
                verifiedStackitEmail: email,
                currentPlatform: platformContractSchema.parse(before.document),
                targetPlatform: platformContractSchema.parse(after.document),
                currentBackendIdentity: before.identity ?? "",
                targetBackendIdentity: after.identity ?? "",
                edgePolicy: edge.policy,
                currentPlatformRevision: before.revision,
              }),
            )
          : blocked();
      return [{ ...edge, target, assessment }];
    }),
    platformCandidates: context.platformCandidates.flatMap((edge) => {
      const after = contracts.rows.find(
        (c) => c.revision === edge.toPlatformRevision,
      );
      if (!after) return [];
      const target = platformContractSchema.parse(after.document);
      const assessment =
        before &&
        before.identity &&
        after.identity &&
        qualified.get(after.revision) &&
        typeof email === "string"
          ? assess(() =>
              assessApplicationPlatformUpgrade({
                current,
                currentSettings: context.effectiveSettings,
                parameters: context.effectiveParameters,
                verifiedStackitEmail: email,
                currentPlatform: platformContractSchema.parse(before.document),
                targetPlatform: target,
                currentBackendIdentity: before.identity ?? "",
                targetBackendIdentity: after.identity ?? "",
                edgePolicy: edge.policy,
                currentPlatformRevision: before.revision,
              }),
            )
          : blocked();
      return [
        {
          ...edge,
          target: projectPlatformTarget(target, current.targetKey),
          assessment,
        },
      ];
    }),
  };
}

export async function previewApplicationPlatformUpgrade(
  client: pg.PoolClient,
  session: Session,
  id: string,
  input: unknown,
) {
  const raw = applicationPlatformUpgradeRequestSchema
    .omit({ confirmUpgrade: true })
    .extend({ confirmUpgrade: z.literal(true).optional() })
    .parse(input);
  const request = { ...raw, confirmUpgrade: true as const };
  const context = await readApplicationUpgradeContext(client, session, id);
  const owner = (
    await client.query<{ requested_by: string }>(
      "SELECT requested_by FROM lzc.application_instances WHERE id=$1",
      [id],
    )
  ).rows[0];
  if (owner?.requested_by !== session.userId)
    throw new ApplicationUpgradeError(403, "application_upgrade_access_denied");
  if (
    context.bindingId !== request.expectedBindingId ||
    context.effectiveVersionId !== request.expectedVersionId
  )
    throw new ApplicationUpgradeError(
      409,
      "application_upgrade_binding_changed",
    );
  const edge = context.platformCandidates.find((e) => e.id === request.edgeId);
  if (!edge)
    throw new ApplicationUpgradeError(
      409,
      "application_upgrade_edge_unavailable",
    );
  const rows = await client.query<Record<string, unknown>>(
    "SELECT v.*,r.retired_at FROM lzc.application_template_versions v LEFT JOIN lzc.application_template_retirements r ON r.version_id=v.id AND r.tenant_id=v.tenant_id WHERE v.id=$1",
    [context.effectiveVersionId],
  );
  const current = rows.rows[0];
  if (!current)
    throw new ApplicationUpgradeError(
      409,
      "application_upgrade_target_unavailable",
    );
  const contracts = await client.query<{
    revision: string;
    document: unknown;
    identity: string | null;
  }>(
    "SELECT c.revision,c.document,d.backend_identity AS identity FROM lzc.application_platform_contracts c LEFT JOIN lzc.application_execution_delegations d ON d.tenant_id=c.tenant_id AND d.platform_revision=c.revision AND d.revoked_at IS NULL WHERE c.revision=ANY($1::uuid[])",
    [[context.effectivePlatformRevision, edge.toPlatformRevision]],
  );
  const before = contracts.rows.find(
      (c) => c.revision === context.effectivePlatformRevision,
    ),
    after = contracts.rows.find((c) => c.revision === edge.toPlatformRevision);
  if (!before || !after)
    throw new ApplicationUpgradeError(
      409,
      "application_upgrade_target_unavailable",
    );
  const human = (
    await client.query<{ email: string }>(
      "SELECT email FROM lzc.stackit_identities WHERE user_id=$1 AND issuer='https://accounts.stackit.cloud' AND revoked_at IS NULL AND valid_until>now()",
      [session.userId],
    )
  ).rows[0];
  if (!human)
    throw new ApplicationUpgradeError(
      403,
      "application_upgrade_identity_unavailable",
    );
  const target = platformContractSchema.parse(after.document);
  const assessment = qualifyUpgradeAssessment(
    assessApplicationPlatformUpgrade({
      current: publication(current),
      currentSettings: context.effectiveSettings,
      parameters: context.effectiveParameters,
      verifiedStackitEmail: human.email,
      currentPlatform: platformContractSchema.parse(before.document),
      targetPlatform: target,
      currentBackendIdentity: before.identity ?? "",
      targetBackendIdentity: after.identity ?? "",
      edgePolicy: edge.policy,
      currentPlatformRevision: before.revision,
    }),
    !!before.identity &&
      !!after.identity &&
      (await upgradePlatformCurrent(client, session, after.revision)),
  );
  return {
    context,
    edge,
    assessment,
    request,
    target: projectPlatformTarget(target, publication(current).targetKey),
    parameters: context.effectiveParameters,
  };
}

async function upgradePlatformCurrent(
  client: pg.PoolClient,
  session: Session,
  revision: string,
) {
  return (
    (
      await client.query<{ current: boolean }>(
        "SELECT lzc_auth.application_upgrade_platform_current($1,$2) AS current",
        [session.id, revision],
      )
    ).rows[0]?.current === true
  );
}
function qualifyUpgradeAssessment<
  T extends {
    classification: string;
    reasons: { code: string; path: string; classification: string }[];
  },
>(assessment: T, qualified: boolean): T {
  return qualified
    ? assessment
    : {
        ...assessment,
        classification: "blocked",
        reasons: [
          ...assessment.reasons,
          {
            code: "upgrade-target-not-qualified",
            path: "platform",
            classification: "blocked",
          },
        ],
      };
}
