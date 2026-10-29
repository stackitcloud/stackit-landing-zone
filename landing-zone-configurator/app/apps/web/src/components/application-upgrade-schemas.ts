import {
  platformContractSchema,
  publishedProjectTemplateSchema,
} from "@lzc/domain";
import { z } from "zod";
export const parametersSchema = z.record(z.string(), z.json());
const policy = z.enum(["approval-required", "direct"]);
export const assessmentSchema = z.object({
  classification: z.enum(["ordinary", "sensitive", "blocked"]),
  approvalPolicy: policy,
  reasons: z.array(
    z.object({
      code: z.string(),
      path: z.string(),
      classification: z.enum(["ordinary", "sensitive", "blocked"]),
    }),
  ),
  retainedParameters: parametersSchema,
  requiredParameters: z
    .array(
      z.object({
        path: z.string(),
        required: z.boolean(),
        hasDefault: z.boolean(),
      }),
    )
    .default([]),
  targetSettings: parametersSchema.optional(),
  requiresFreshPlan: z.literal(true),
  applyAllowed: z.literal(false),
});
const edgeSchema = z.object({
  id: z.uuid(),
  fromVersionId: z.uuid(),
  toVersionId: z.uuid(),
  policy: z.object({ sensitive: policy }),
  target: publishedProjectTemplateSchema,
  assessment: assessmentSchema,
});
export const contextSchema = z.object({
  originVersionId: z.uuid(),
  effectiveVersionId: z.uuid(),
  effectivePlatformRevision: z.uuid().nullable(),
  effectiveDeploymentPolicy: policy,
  effectiveParameters: parametersSchema,
  bindingId: z.uuid().nullable(),
  lastAppliedVersionId: z.uuid().nullable(),
  lastAppliedPlatformRevision: z.uuid().nullable().default(null),
  candidate: z
    .object({
      id: z.uuid(),
      candidateHash: z.string(),
      edgeId: z.uuid().nullable(),
      platformEdgeId: z.uuid().nullable().optional(),
      kind: z.enum(["template", "platform"]).default("template"),
      versionId: z.uuid(),
      platformRevision: z.uuid(),
      parameters: parametersSchema,
      sourceRevision: z.string(),
      sensitivePolicy: policy,
      createdAt: z.string(),
    })
    .nullable(),
  current: publishedProjectTemplateSchema,
  candidates: z.array(edgeSchema),
  platformCandidates: z
    .array(
      z.object({
        id: z.uuid(),
        fromPlatformRevision: z.uuid(),
        toPlatformRevision: z.uuid(),
        policy: z.object({ sensitive: policy }),
        target: platformContractSchema,
        assessment: assessmentSchema,
      }),
    )
    .default([]),
  blockers: z.array(z.string()),
});
export type Context = z.infer<typeof contextSchema>;
export const previewSchema = z.object({
  assessment: assessmentSchema,
  target: publishedProjectTemplateSchema,
  parameters: parametersSchema,
});
export type Preview = z.infer<typeof previewSchema>;
