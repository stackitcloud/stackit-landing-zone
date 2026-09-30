import { z } from "zod";

const tenantIdSchema = z.uuid();
export const membershipSchema = z.object({
  userId: z.uuid(),
  tenantId: tenantIdSchema,
  role: z.enum(["viewer", "editor", "deployer", "admin"]),
});
export type Membership = z.infer<typeof membershipSchema>;
export type Permission = "read" | "edit" | "deploy" | "admin";

const permissions: Record<Membership["role"], readonly Permission[]> = {
  viewer: ["read"],
  editor: ["read", "edit"],
  deployer: ["read", "deploy"],
  admin: ["read", "edit", "deploy", "admin"],
};

// Membership must come from authenticated server-side storage, never a request header/body.
// This policy does not replace repository rights or credential-use authorization.
export function canAccessTenant(
  trustedMembership: unknown,
  requestedTenantId: unknown,
  permission: Permission,
): boolean {
  const membership = membershipSchema.safeParse(trustedMembership);
  const tenant = tenantIdSchema.safeParse(requestedTenantId);
  if (!membership.success || !tenant.success) return false;
  return (
    membership.data.tenantId === tenant.data &&
    permissions[membership.data.role].includes(permission)
  );
}

export { default as catalogue } from "./catalogue.json" with { type: "json" };
export * from "./common-document.js";
export * from "./common-validation.js";
export * from "./configuration.js";
export * from "./document.js";
export * from "./features.js";
export * from "./tfvars.js";
