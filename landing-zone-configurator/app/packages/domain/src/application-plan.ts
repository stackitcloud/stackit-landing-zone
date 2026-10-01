import { z } from "zod";
import { assertBoundedJson } from "./features.js";

const uuid = z.uuid();
const key = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/);
const targetSchema = z
  .strictObject({
    folder_id: uuid,
    region: z.enum(["eu01", "eu02"]),
    corporate: z.boolean(),
    network_area_id: uuid.nullable(),
    firewall_next_hop_ip: z.string().nullable(),
    ipv4_nameservers: z.array(z.string()).nullable(),
  })
  .refine(
    (target) => !target.corporate || target.network_area_id !== null,
    "Corporate target needs SNA",
  );
export const platformContractSchema = z.strictObject({
  schema_version: z.literal(1),
  tenant_id: uuid,
  revision: uuid,
  organization_id: uuid,
  targets: z.record(key, targetSchema),
});
export const applicationTemplateSchema = z.strictObject({
  schema_version: z.literal(1),
  tenant_id: uuid,
  id: key,
  version: z.number().int().positive(),
  status: z.literal("published"),
  accelerator_revision: z.string().regex(/^[0-9a-f]{40}$/),
  platform_revision: uuid,
  target_keys: z.array(key).min(1),
  apply_policy: z.enum(["approval-required", "direct"]),
  services: z.strictObject({
    secretsmanager_enabled: z.boolean(),
    observability: z.strictObject({
      enabled: z.boolean(),
      plan_name: z.string().min(1),
      acl: z.array(z.string()),
    }),
  }),
});
// Loaded from server-side membership, identity verification and an idempotent instance allocation.
const contextSchema = z.strictObject({
  tenant_id: uuid,
  user_id: uuid,
  instance_id: uuid,
  role: z.enum(["platform-engineer", "application-owner"]),
  verified_stackit_email: z.email(),
  stackit_organization_id: uuid,
  allowed_accelerator_revision: z.string().regex(/^[0-9a-f]{40}$/),
});
const requestSchema = z.strictObject({
  name: z.string().trim().min(1).max(40),
  target_key: key,
});

/** Pure compiler for a future server endpoint, not an authorization endpoint or runner dispatcher. */
export function compileApplicationPlan(input: {
  platform: unknown;
  template: unknown;
  context: unknown;
  request: unknown;
}) {
  assertBoundedJson(input);
  const platform = platformContractSchema.parse(input.platform);
  const template = applicationTemplateSchema.parse(input.template);
  const context = contextSchema.parse(input.context);
  const request = requestSchema.parse(input.request);
  if (
    platform.tenant_id !== context.tenant_id ||
    template.tenant_id !== context.tenant_id ||
    platform.organization_id !== context.stackit_organization_id ||
    platform.revision !== template.platform_revision ||
    template.accelerator_revision !== context.allowed_accelerator_revision
  )
    throw new Error("Application contract binding mismatch");
  if (
    !template.target_keys.includes(request.target_key) ||
    !Object.hasOwn(platform.targets, request.target_key)
  )
    throw new Error("Application target is not allowed");
  return {
    entrypoint: "src/application" as const,
    acceleratorRevision: template.accelerator_revision,
    stateKey: `applications/${context.tenant_id}/${context.instance_id}/terraform.tfstate`,
    requestedBy: context.user_id,
    applyPolicy: template.apply_policy,
    // Deliberate execution gate: policy is recorded, never an Apply authorization.
    executionEnabled: false as const,
    variables: {
      platform_contract: {
        ...platform,
        targets: { [request.target_key]: platform.targets[request.target_key] },
      },
      application: {
        tenant_id: context.tenant_id,
        instance_id: context.instance_id,
        platform_revision: platform.revision,
        template_id: template.id,
        template_version: template.version,
        name: request.name,
        owner_email: context.verified_stackit_email,
        target_key: request.target_key,
        ...template.services,
      },
    },
  };
}
