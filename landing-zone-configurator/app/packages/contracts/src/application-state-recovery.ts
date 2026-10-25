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
    "stackit_resourcemanager_project",
    "stackit_routing_table",
    "stackit_routing_table_route",
    "stackit_authorization_project_custom_role",
    "stackit_objectstorage_bucket",
    "stackit_objectstorage_credentials_group",
    "stackit_secretsmanager_instance",
    "stackit_observability_instance",
    "stackit_network",
    "stackit_service_account",
    "stackit_authorization_project_role_assignment",
  ]),
  resourceId: z.string().min(1).max(1024),
});
export const applicationStateRecoveryRevocationSchema = z.strictObject({
  kind: z.enum(["service-account-key", "objectstorage-credential"]),
  address: z.string().min(1).max(1024),
  projectId: z.uuid(),
  region: z.enum(["eu01", "eu02"]),
  accountEmail: z.email().optional(),
  groupId: z.string().min(1).max(256).optional(),
  keyId: z.string().min(1).max(256),
  discardIncompleteState: z.boolean().default(false),
});
export type ApplicationStateRecoveryRevocation = z.infer<
  typeof applicationStateRecoveryRevocationSchema
>;
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
  imports: z.array(applicationStateRecoveryImportSchema).max(500),
  credentialRevocations: z
    .array(applicationStateRecoveryRevocationSchema)
    .max(100)
    .default([]),
  preview: z
    .strictObject({
      create: count,
      unchanged: count,
      update: count,
      delete: count,
      replace: count,
    })
    .nullable(),
  requiresPlatformEngineerReview: z.boolean(),
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
  confirmCredentialRevocations: z
    .array(applicationStateRecoveryRevocationSchema)
    .max(100)
    .default([]),
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
