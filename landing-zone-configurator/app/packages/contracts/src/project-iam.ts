import { z } from "zod";

export const projectIamMigrationSummarySchema = z.strictObject({
  version: z.literal(1),
  phase: z.enum(["prepare", "cleanup", "complete", "maintenance"]),
  imports: z.number().int().min(0).max(100),
  pendingRemovals: z.number().int().min(0).max(100),
});
export type ProjectIamMigrationSummary = z.infer<
  typeof projectIamMigrationSummarySchema
>;
