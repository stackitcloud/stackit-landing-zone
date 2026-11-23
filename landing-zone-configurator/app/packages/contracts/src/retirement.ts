import { z } from "zod";

export const retirementPhaseSchema = z.enum([
  "RETIRING",
  "DRAINING",
  "PREPARED",
  "TEARING_DOWN",
  "WAITING_FOR_PURGE",
  "FINALIZING",
  "COMPLETE",
  "PAUSED",
  "NEEDS_ATTENTION",
  "CANCELLED",
]);
export const retirementStartSchema = z.strictObject({
  stateKey: z.string().min(1).max(1024),
  reason: z.string().trim().min(1).max(1000),
  notBefore: z.iso.datetime({ offset: true }).optional(),
  confirmRetirement: z.literal(true),
});
export const retirementMutationSchema = z.strictObject({
  generation: z.number().int().positive().refine(Number.isSafeInteger),
  action: z.enum(["pause", "resume", "cancel", "inspect", "reschedule"]),
  notBefore: z.iso.datetime({ offset: true }).optional(),
});
export const retirementSchema = z.strictObject({
  id: z.uuid(),
  stateKey: z.string(),
  name: z.string().min(1).max(256),
  organizationId: z.uuid(),
  phase: retirementPhaseSchema,
  generation: z.number().int().positive().refine(Number.isSafeInteger),
  reason: z.string(),
  notBefore: z.iso.datetime({ offset: true }),
  createdAt: z.iso.datetime({ offset: true }),
  createdBy: z.uuid(),
  canCancel: z.boolean().optional(),
  applications: z.array(
    z.strictObject({
      id: z.uuid(),
      name: z.string(),
      requestedBy: z.uuid(),
    }),
  ),
  blockers: z.array(z.string()),
});
export type Retirement = z.infer<typeof retirementSchema>;

export const retirementCandidateSchema = z.strictObject({
  stateKey: z.string(),
  name: z.string(),
  applicationCount: z.number().int().nonnegative(),
});

export const retirementJobPhaseSchema = z.enum([
  "private_workloads",
  "remove_application",
  "remove_projects",
  "finalize_folders",
]);
export const retirementExecutionReviewSchema = z.strictObject({
  retirementId: z.uuid(),
  generation: z.number().int().positive().refine(Number.isSafeInteger),
  hasHandoff: z.boolean(),
  prepared: z.boolean(),
  canPrepare: z.boolean(),
  scopes: z.array(
    z.strictObject({
      id: z.uuid(),
      name: z.string(),
      instanceId: z.uuid().nullable(),
      stage: z.enum([...retirementJobPhaseSchema.options, "complete"]),
      stateVersion: z.string(),
      canPlan: z.boolean(),
    }),
  ),
  jobs: z.array(
    z.strictObject({
      id: z.uuid(),
      scopeId: z.uuid(),
      operatorId: z.uuid(),
      generation: z.number().int().positive(),
      operation: z.enum(["plan", "apply"]),
      phase: retirementJobPhaseSchema,
      status: z.enum([
        "starting",
        "initializing",
        "validating",
        "planning",
        "applying",
        "succeeded",
        "failed",
        "recovery_required",
      ]),
      nativeStatus: z.enum(["succeeded", "failed"]).nullable(),
      createdAt: z.iso.datetime({ offset: true }),
      sourceRevision: z.string(),
      providerLockSha256: z.string(),
      artifactSha256: z.string().nullable(),
      deleteCount: z.number().int().nonnegative(),
      canApply: z.boolean(),
      canInspect: z.boolean(),
      recoveryAvailable: z.boolean(),
      recoveryPending: z.boolean(),
      errorCode: z.string().nullable(),
    }),
  ),
});
export type RetirementExecutionReview = z.infer<
  typeof retirementExecutionReviewSchema
>;
export const retirementPlanRequestSchema = z.strictObject({
  generation: z.number().int().positive().refine(Number.isSafeInteger),
  scopeId: z.uuid(),
});
export const retirementApplyRequestSchema = z.strictObject({
  generation: z.number().int().positive().refine(Number.isSafeInteger),
  artifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
  confirmDestroyResources: z.literal(true),
  confirmDataRetentionReviewed: z.literal(true),
});
export const retirementInspectSchema = z.strictObject({
  generation: z.number().int().positive().refine(Number.isSafeInteger),
});
