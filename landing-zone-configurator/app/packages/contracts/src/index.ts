import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("landing-zone-configurator"),
  authentication: z.enum(["not-configured", "github"]),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export type { ActionCounts, PlanAction, PlanSummary } from "./plan.js";
export { InvalidPlan, summarizePlan } from "./plan.js";
export const planStageSchema = z.enum([
  "initializing",
  "validating",
  "planning",
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
]);
export const planResultSchema = z.discriminatedUnion("status", [
  z
    .object({ status: z.literal("succeeded"), summary: planSummarySchema })
    .strict(),
  z
    .object({ status: z.literal("failed"), errorCode: planFailureSchema })
    .strict(),
]);
