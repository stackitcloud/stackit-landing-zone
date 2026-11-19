import { z } from "zod";

const evidenceSchema = z.strictObject({
  turn: z.number().int().min(0).max(40),
  quote: z.string().min(1).max(1000),
});
export const memorySchema = z.strictObject({
  goal: z.string().max(1000),
  decisions: z
    .array(
      z.strictObject({
        key: z.string().min(1).max(120),
        summary: z.string().min(1).max(600),
        status: z.enum(["confirmed", "recommended", "open"]),
        evidence: evidenceSchema.nullable(),
      }),
    )
    .max(16),
  openQuestions: z.array(z.string().min(1).max(300)).max(8),
});
