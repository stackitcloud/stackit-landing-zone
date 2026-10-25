import { z } from "zod";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().nonnegative().refine(Number.isSafeInteger);

// Public views contain decisions and identities, never State or credential bytes.
export const applicationStateRecoveryPhaseSchema = z.enum([
  "requested",
  "assessing",
  "blocked",
  "prepared",
  "committing",
  "committed",
  "reconciliation-required",
]);
export const applicationStateRecoveryImportSchema = z.strictObject({
  address: z.string().min(1).max(1024),
  type: z.enum([
    "stackit_network",
    "stackit_service_account",
    "stackit_authorization_project_role_assignment",
  ]),
  resourceId: z.string().min(1).max(1024),
});
export const applicationStateRecoveryBlockerSchema = z.enum([
  "runner-not-stopped",
  "execution-capability-active",
  "checkpoint-unavailable",
  "checkpoint-changed",
  "checkpoint-invalid",
  "cloud-inventory-incomplete",
  "cloud-project-mismatch",
  "cloud-resource-ambiguous",
  "unsupported-resource",
  "lost-private-material",
  "unexpected-plan-change",
  "source-changed",
  "proposal-expired",
  "commit-outcome-unknown",
  "native-recovery-failed",
]);
export const applicationStateRecoveryViewSchema = z.strictObject({
  id: z.uuid(),
  jobId: z.uuid(),
  instanceId: z.uuid(),
  phase: applicationStateRecoveryPhaseSchema,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  blockers: z.array(applicationStateRecoveryBlockerSchema).max(32),
  originalStateSha256: sha256.nullable(),
  candidateStateSha256: sha256.nullable(),
  originalSerial: count.nullable(),
  orphanLockId: z
    .string()
    .regex(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/)
    .nullable()
    .default(null),
  candidateSerial: count.nullable(),
  retainedResources: count,
  imports: z.array(applicationStateRecoveryImportSchema).max(100),
  preview: z
    .strictObject({
      create: count,
      unchanged: count,
      update: count,
      delete: count,
      replace: count,
    })
    .nullable(),
  requiresPlatformEngineerReview: z.literal(true),
  canAssess: z.boolean(),
  canCommit: z.boolean(),
  canInspect: z.boolean().default(false),
  startsInfrastructureApply: z.literal(false),
  requiresFreshPlan: z.literal(true),
});
export const applicationStateRecoveryAssessRequestSchema = z.strictObject({
  idempotencyKey: z.uuid(),
  confirmReadOnlyAssessment: z.literal(true),
});
export const applicationStateRecoveryCommitRequestSchema = z.strictObject({
  originalStateSha256: sha256,
  candidateStateSha256: sha256,
  confirmStateRepair: z.literal(true),
  confirmExactOrphanLockRelease: z.literal(true),
  confirmFreshPlanRequired: z.literal(true),
});
export type ApplicationStateRecoveryImport = z.infer<
  typeof applicationStateRecoveryImportSchema
>;
export type ApplicationStateRecoveryView = z.infer<
  typeof applicationStateRecoveryViewSchema
>;
export type ApplicationStateRecoveryBlocker = z.infer<
  typeof applicationStateRecoveryBlockerSchema
>;
