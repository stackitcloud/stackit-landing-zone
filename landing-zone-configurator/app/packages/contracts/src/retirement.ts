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
  action: z.enum(["pause", "resume", "cancel", "inspect"]),
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
