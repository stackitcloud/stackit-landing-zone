export * from "./application-execution.js";
export * from "./application-quota.js";
export * from "./application-state-recovery.js";
export * from "./assistant.js";
export * from "./backend.js";

import { z } from "zod";
import {
  applicationPlatformImpactSchema,
  applicationUpgradeSafetySchema,
} from "./application-upgrades.js";

export const firewallAdministrationSchema = z.strictObject({
  username: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_.@-]+$/),
  password: z
    .string()
    .min(1)
    .max(1024)
    .refine((value) =>
      [...value].every(
        (character) =>
          character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
      ),
    ),
});
export type FirewallAdministration = z.infer<
  typeof firewallAdministrationSchema
>;

export const runnerPoolAssignmentSchema = z.strictObject({
  id: z.uuid(),
  ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  broker: z.enum(["platform", "application"]),
});
export type RunnerPoolAssignment = z.infer<typeof runnerPoolAssignmentSchema>;

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
  authentication: z.enum([
    "not-configured",
    "github",
    "stackit",
    "development",
  ]),
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
  applicationUpgradeId: z.uuid().optional(),
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

export type {
  ActionCounts,
  PlanAction,
  PlanSummary,
  PlatformApplyBlocker,
} from "./plan.js";
export {
  applicationMvpAcceleratorCommit,
  applicationPlanPreview,
  applicationPlanPreviewSchema,
  applicationRunnerSourceSchema,
  InvalidPlan,
  platformFirewallImage,
  platformRunnerSourceSchema,
  platformUpgradeAcceleratorCommit,
  summarizePlan,
} from "./plan.js";
export type { PlanOutput } from "./plan-output.js";
export {
  openTofuProgress,
  planOutputEventSchema,
  planOutputSchema,
} from "./plan-output.js";
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
    upgradeSafety: applicationUpgradeSafetySchema.optional(),
    platformImpact: applicationPlatformImpactSchema.optional(),
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
  canCompleteInterruptedPlan: z.boolean().default(false),
  canInspectInterruptedApply: z.boolean().default(false),
  recoveryReplanApproved: z.boolean().default(false),
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

export const applicationInterruptedPlanRequestSchema = z.strictObject({
  confirmPlanCompletion: z.literal(true),
});
export const applicationInterruptedApplyRequestSchema = z.strictObject({
  confirmInterruptedApply: z.literal(true),
});
export const applicationInterruptedApplyReceiptSchema = z.strictObject({
  jobId: z.uuid(),
  instanceId: z.uuid(),
  status: z.literal("reconciliation_required"),
  recordedAt: z.iso.datetime(),
  runnerStop: z.literal("verified-stopped"),
  stateCheck: z.literal("not-performed"),
  stateLock: z.literal("not-checked"),
  requiresOperatorReview: z.literal(true),
  canReplan: z.literal(false),
  startsExecution: z.literal(false),
});
export const applicationInterruptedPlanReceiptSchema = z.strictObject({
  jobId: z.uuid(),
  instanceId: z.uuid(),
  status: z.literal("failed"),
  recordedAt: z.iso.datetime(),
  statePresent: z.boolean(),
  runnerStop: z.literal("verified-stopped"),
  stateLock: z.literal("free"),
  requiresFreshPlan: z.literal(true),
  startsExecution: z.literal(false),
});

export const applicationRecoveryDiagnosisSchema = z.strictObject({
  jobId: z.uuid(),
  instanceId: z.uuid(),
  operation: applicationPlanJobSchema.shape.operation,
  purpose: applicationPlanPurposeSchema,
  status: applicationPlanJobSchema.shape.status,
  errorCode: applicationPlanJobSchema.shape.errorCode,
  planId: z.uuid().nullable(),
  runnerPackageId: z.uuid().nullable(),
  acceleratorRevision: z.string().regex(/^[a-f0-9]{40}$/),
  bindingSha256: z.string().regex(/^[a-f0-9]{64}$/),
  stateKey: z.string().min(1),
  finishedAt: z.iso.datetime().nullable(),
  assessment: z.enum([
    "not-dispatched",
    "in-progress",
    "completed",
    "operator-review-required",
    "state-recovery-required",
  ]),
  evidence: z
    .array(
      z.strictObject({
        kind: z.enum(["artifact", "output", "recovery"]),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        createdAt: z.iso.datetime(),
        runnerPackageId: z.uuid(),
      }),
    )
    .max(3),
});
export type ApplicationRecoveryDiagnosis = z.infer<
  typeof applicationRecoveryDiagnosisSchema
>;

export const applicationRecoveryReconciliationSchema = z.strictObject({
  observedAt: z.iso.datetime({ offset: true }),
  stage: z.enum([
    "not-dispatched",
    "start-unresolved",
    "execution-in-progress",
    "completion-unresolved",
    "execution-failed",
    "state-recovery-required",
    "reported-completion",
  ]),
  runnerAppId: z.uuid().nullable(),
  runnerStop: z.literal("unknown"),
  stateLock: z.literal("unknown"),
  cloudState: z.literal("unknown"),
  credentialRevocation: z.literal("unknown"),
  authorizesExecution: z.literal(false),
  grant: z.strictObject({
    status: z.enum(["unexpired", "expired", "revoked"]),
    expiresAt: z.iso.datetime({ offset: true }),
    revokedAt: z.iso.datetime({ offset: true }).nullable(),
  }),
  ticket: z
    .strictObject({
      status: z.enum(["unexpired", "expired"]),
      expiresAt: z.iso.datetime({ offset: true }),
      consumedAt: z.iso.datetime({ offset: true }).nullable(),
    })
    .nullable(),
  delegation: z.enum(["not-used", "not-revoked", "revoked"]),
  reports: z
    .array(
      applicationRecoveryDiagnosisSchema.shape.evidence.element.extend({
        createdAt: z.iso.datetime({ offset: true }),
      }),
    )
    .max(3),
});

export const applicationRecoveryReviewContextSchema = z.strictObject({
  jobId: z.uuid(),
  instanceId: z.uuid(),
  bindingSha256: z.string().regex(/^[a-f0-9]{64}$/),
  status: applicationPlanJobSchema.shape.status,
  operation: applicationPlanJobSchema.shape.operation,
  finishedAt: z.iso.datetime({ offset: true }).nullable(),
  recoverySha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  finding: z.enum(["state-review-required", "completion-review-required"]),
  reconciliation: applicationRecoveryReconciliationSchema,
});
export const applicationRecoveryReviewRequestSchema = z.strictObject({
  instanceId: z.uuid(),
  confirmReview: z.literal(true),
  bindingSha256: z.string().regex(/^[a-f0-9]{64}$/),
  recoverySha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
});
export const applicationRecoveryReviewSchema = z.strictObject({
  jobId: z.uuid(),
  reviewedBy: z.uuid(),
  reviewedAt: z.iso.datetime(),
  bindingSha256: z.string().regex(/^[a-f0-9]{64}$/),
  recoverySha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  finding: applicationRecoveryReviewContextSchema.shape.finding,
});
export const applicationRecoveryReviewViewSchema =
  applicationRecoveryReviewContextSchema.extend({
    review: applicationRecoveryReviewSchema.nullable(),
  });

// Checkpoint contents and credentials never cross this API boundary.
export const applicationRecoveryReplanCheckSchema = z.strictObject({
  jobId: z.uuid(),
  runnerAppId: z.uuid(),
  instanceId: z.uuid(),
  observedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  stateSha256: z.string().regex(/^[a-f0-9]{64}$/),
  stateSerial: z.number().int().nonnegative().refine(Number.isSafeInteger),
  stateLock: z.literal("free"),
  resources: z
    .array(
      z.strictObject({
        type: z.string(),
        mode: z.enum(["managed", "data"]),
        count: z.number().int().nonnegative(),
      }),
    )
    .max(1024),
  reviewToken: z.string().min(1).max(8192),
  mode: z.enum(["reported-failure", "operator-attested"]),
  runnerStop: z.enum([
    "reported-command-completed",
    "operator-attestation-required",
  ]),
  cloudState: z.enum([
    "requires-fresh-plan-review",
    "operator-attestation-required",
  ]),
  startsExecution: z.literal(false),
});
export const applicationRecoveryReplanRequestSchema = z.strictObject({
  reviewToken: applicationRecoveryReplanCheckSchema.shape.reviewToken,
  confirmRunnerStopped: z.literal(true).optional(),
  confirmCloudStateCompared: z.literal(true).optional(),
  confirmFreshPlan: z.literal(true),
});
export const applicationRecoveryReplanReceiptSchema = z.strictObject({
  jobId: z.uuid(),
  reviewedBy: z.uuid(),
  reviewedAt: z.iso.datetime(),
  stateSha256: applicationRecoveryReplanCheckSchema.shape.stateSha256,
  stateSerial: applicationRecoveryReplanCheckSchema.shape.stateSerial,
  mode: z.enum(["reported-failure", "operator-attested"]),
  runnerStop: z.enum(["reported-command-completed", "operator-attested"]),
  cloudState: z.enum(["requires-fresh-plan-review", "operator-attested"]),
  requiresFreshPlan: z.literal(true),
  startsExecution: z.literal(false),
});

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

export * from "./application-upgrades.js";
