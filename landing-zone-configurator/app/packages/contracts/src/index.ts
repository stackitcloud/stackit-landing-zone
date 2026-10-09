export * from "./backend.js";

import { z } from "zod";

export const platformCheckpointSchema = z.strictObject({
  stateVersion: z.string().regex(/^[1-9][0-9]*$/),
  checkpointSha256: z.string().regex(/^[a-f0-9]{64}$/),
  serial: z.number().int().nonnegative().refine(Number.isSafeInteger),
  lockHeld: z.boolean(),
  pendingMigration: z.boolean(),
  recoveryAvailable: z.boolean(),
  canResume: z.boolean(),
  migration: z
    .strictObject({
      remoteIdentity: z.string().min(1).max(512),
      serial: z.number().int().nonnegative().refine(Number.isSafeInteger),
      lineagePreserved: z.boolean(),
    })
    .optional(),
  resources: z
    .array(
      z.strictObject({
        mode: z.enum(["managed", "data"]),
        type: z.string().regex(/^[a-z][a-z0-9_]{0,127}$/),
        instances: z.number().int().nonnegative().refine(Number.isSafeInteger),
        deposedInstances: z
          .number()
          .int()
          .nonnegative()
          .refine(Number.isSafeInteger),
      }),
    )
    .max(1024),
});
export type PlatformCheckpoint = z.infer<typeof platformCheckpointSchema>;

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("landing-zone-configurator"),
  authentication: z.enum(["not-configured", "github", "stackit"]),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const applicationPlanPurposeSchema = z.enum([
  "standard",
  "destroy",
  "drift",
]);

export const applicationRunnerBindingSchema = z.strictObject({
  tenantId: z.uuid(),
  instanceId: z.uuid(),
  purpose: applicationPlanPurposeSchema.optional(),
});

export const applicationOrderDecisionSchema = z
  .strictObject({
    decision: z.enum(["approved", "rejected"]),
    reason: z.string().trim().max(1000).default(""),
    confirmDecision: z.literal(true),
  })
  .refine((value) => value.decision !== "rejected" || value.reason.length > 0, {
    message: "Eine Ablehnung benötigt eine Begründung.",
    path: ["reason"],
  });

export const applicationInstanceSchema = z.strictObject({
  id: z.uuid(),
  versionId: z.uuid(),
  deploymentPolicy: z.enum(["approval-required", "direct"]).optional(),
  approval: z
    .discriminatedUnion("status", [
      z.strictObject({ status: z.enum(["pending", "not-required"]) }),
      z.strictObject({
        status: z.enum(["approved", "rejected"]),
        decidedBy: z.uuid(),
        decidedAt: z.iso.datetime(),
        reason: z.string().max(1000),
      }),
    ])
    .optional(),
  requestedBy: z.uuid(),
  canDelete: z.boolean().optional(),
  canArchive: z.boolean().optional(),
  executionConfigured: z.boolean().optional(),
  name: z.string().min(1).max(40),
  parameters: z.record(z.string(), z.json()),
  settings: z.record(z.string(), z.json()),
  createdAt: z.iso.datetime(),
  stateKey: z
    .string()
    .regex(/^applications\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/terraform\.tfstate$/),
  planStatus: z.literal("blocked"),
  executionEnabled: z.literal(false),
  blockers: z.array(z.string().min(1)).min(1),
});
export type ApplicationInstance = z.infer<typeof applicationInstanceSchema>;

export const appliedPlatformSourceSchema = z.strictObject({
  applyRunId: z.uuid(),
  stateKey: z.string().min(1).max(512),
  stateVersion: z.string().regex(/^[1-9][0-9]{0,18}$/),
  contractRevision: z.uuid(),
  documentSha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type AppliedPlatformSource = z.infer<typeof appliedPlatformSourceSchema>;

export type { ActionCounts, PlanAction, PlanSummary } from "./plan.js";
export {
  applicationMvpAcceleratorCommit,
  applicationPlanPreview,
  applicationPlanPreviewSchema,
  applicationRunnerSourceSchema,
  InvalidPlan,
  platformRunnerSourceSchema,
  platformUpgradeAcceleratorCommit,
  summarizePlan,
} from "./plan.js";
export const planStageSchema = z.enum([
  "initializing",
  "validating",
  "planning",
  "applying",
]);
const count = z.number().int().min(0).max(100000);
const counts = z
  .object({
    unchanged: count,
    create: count,
    update: count,
    delete: count,
    replace: count,
    read: count,
  })
  .strict();
export const planSummarySchema = z
  .object({
    schemaVersion: z.literal(1),
    execution: z.literal("plan-only"),
    applyAllowed: z.literal(false),
    result: z.enum(["changes", "no-changes"]),
    resources: counts,
    drift: counts,
    changedOutputs: count,
    checks: z
      .object({ pass: count, fail: count, error: count, unknown: count })
      .strict(),
    destructive: z.boolean(),
    completeness: z.enum(["complete", "incomplete", "not-reported"]),
  })
  .strict();
export const planFailureSchema = z.enum([
  "runner_unavailable",
  "credential_changed",
  "access_check_failed",
  "input_invalid",
  "init_failed",
  "validate_failed",
  "plan_failed",
  "summary_failed",
  "timed_out",
  "cancelled",
  "apply_failed",
  "state_failed",
  "artifact_invalid",
]);
export const applicationPlanJobSchema = z.strictObject({
  id: z.uuid(),
  instanceId: z.uuid(),
  requestedBy: z.uuid(),
  approvedBy: z.uuid(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  operation: z.enum(["plan", "apply"]).default("plan"),
  purpose: applicationPlanPurposeSchema.default("standard"),
  planId: z.uuid().nullable().optional(),
  artifactSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable()
    .optional(),
  canApply: z.boolean().default(false),
  status: z.enum([
    "prepared",
    "reserved",
    "starting",
    "initializing",
    "validating",
    "planning",
    "applying",
    "succeeded",
    "failed",
    "reconciliation_required",
  ]),
  grantActive: z.boolean(),
  backendId: z.uuid().nullable(),
  canApproveBackend: z.boolean(),
  canDispatch: z.boolean(),
  delegatedExecution: z.boolean().optional(),
  summary: planSummarySchema.nullable(),
  errorCode: z
    .union([planFailureSchema, z.literal("runner_report_missing")])
    .nullable(),
});
export type ApplicationPlanJob = z.infer<typeof applicationPlanJobSchema>;

export const planResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("succeeded"),
      summary: planSummarySchema.optional(),
      artifactSha256: z
        .string()
        .regex(/^[0-9a-f]{64}$/)
        .optional(),
    })
    .strict(),
  z
    .object({ status: z.literal("failed"), errorCode: planFailureSchema })
    .strict(),
]);

export const platformApplySchema = z.strictObject({
  artifactSha256: z.string().regex(/^[0-9a-f]{64}$/),
  organizationId: z.uuid(),
  confirmApply: z.literal(true),
});
export const runnerArtifactSchema = z.strictObject({
  data: z
    .string()
    .min(4)
    .max(22 * 1024 * 1024),
  summary: planSummarySchema,
});
