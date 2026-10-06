import { z } from "zod";
import { assertBoundedJson } from "./features.js";
import {
  projectTemplateDraftSchema,
  validateProjectTemplateDraft,
} from "./project-templates.js";
import { resolveTemplateParameters } from "./template-parameters.js";

export const applicationAcceleratorRevisionSchema = z.enum([
  "a256f6896d11134fdc351786f1be5eba4e56b2e2",
  "4d15d7870afa323badd93559d8b37c5a8d138dcf",
  "c4b43c36af198985980b17626c48d357795e3fbd",
]);

export const applicationPublicationSchema = z
  .strictObject({
    template: projectTemplateDraftSchema,
    acceleratorRevision: applicationAcceleratorRevisionSchema.default(
      "a256f6896d11134fdc351786f1be5eba4e56b2e2",
    ),
    deploymentPolicy: z
      .enum(["approval-required", "direct"])
      .default("approval-required"),
    allowedGroupIds: z.array(z.uuid()).max(100).optional(),
    platformRevision: z.uuid().optional(),
    targetKey: z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,47}$/)
      .optional(),
  })
  .refine(
    (input) => Boolean(input.platformRevision) === Boolean(input.targetKey),
    "Platform revision and target must be bound together",
  );

export const applicationOrderSchema = z.strictObject({
  versionId: z.uuid(),
  idempotencyKey: z.uuid(),
  name: z.string().trim().min(1).max(40),
  parameters: z.record(z.string(), z.json()).default({}),
});

export const publishedProjectTemplateSchema = z.strictObject({
  id: z.uuid(),
  tenantId: z.uuid(),
  templateId: z.uuid(),
  version: z.number().int().positive(),
  publishedBy: z.uuid(),
  publishedAt: z.iso.datetime(),
  deploymentPolicy: z.enum(["approval-required", "direct"]).optional(),
  allowedGroupIds: z.array(z.uuid()).max(100).optional(),
  retiredAt: z.iso.datetime().optional(),
  acceleratorRevision: z.string().regex(/^[0-9a-f]{40}$/),
  platformRevision: z.uuid().nullable().optional(),
  targetKey: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,47}$/)
    .nullable()
    .optional(),
  template: projectTemplateDraftSchema,
});

export type PublishedProjectTemplate = z.infer<
  typeof publishedProjectTemplateSchema
>;

export function validateApplicationPublication(input: unknown) {
  assertBoundedJson(input);
  const { template } = applicationPublicationSchema.parse(input);
  validateProjectTemplateDraft(template);
  if (template.kind === "sandbox")
    throw new Error("Sandbox-Veröffentlichungen sind noch nicht qualifiziert.");
  if (!template.name.trim()) throw new Error("Der Template-Name fehlt.");
  for (const source of Object.values(template.parameterPolicy?.fields ?? {}))
    if (source.source === "input" && source.choices?.length === 0)
      throw new Error("Erlaubte Bestellwerte dürfen nicht leer sein.");
  return template;
}

export function resolveApplicationOrder(
  published: unknown,
  input: unknown,
  context?: { verifiedStackitEmail: string },
) {
  assertBoundedJson({ published, input });
  const version = publishedProjectTemplateSchema.parse(published);
  if (version.retiredAt)
    throw new Error("Diese Template-Version wurde stillgelegt.");
  const order = applicationOrderSchema.parse(input);
  if (order.versionId !== version.id)
    throw new Error("Die Bestellung gehört nicht zu dieser Template-Version.");
  const resolution = resolveTemplateParameters(
    version.template,
    order.parameters,
    context,
  );
  return { order, resolution };
}
