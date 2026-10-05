export * from "./backend.js";

import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("landing-zone-configurator"),
  authentication: z.enum(["not-configured", "github", "stackit"]),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const applicationInstanceSchema = z.strictObject({
  id: z.uuid(),
  versionId: z.uuid(),
  deploymentPolicy: z.enum(["approval-required", "direct"]).optional(),
  requestedBy: z.uuid(),
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

export type { ActionCounts, PlanAction, PlanSummary } from "./plan.js";
export { InvalidPlan, summarizePlan } from "./plan.js";
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
