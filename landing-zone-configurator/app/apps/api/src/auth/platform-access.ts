import type { Session } from "./store.js";

/** Legacy platform APIs are not the Application Owner self-service API. */
export function platformAccessError(
  session: Session & {
    tenantKind?: string;
    productRoles?: readonly string[];
  },
  path: string,
): string | null {
  if (session.tenantKind !== "organisation") return null;
  if (
    /^\/api\/v1\/(github|configurations|credentials|cloud-catalogues|preparations|plans)(\/|$)/.test(
      path,
    ) &&
    !session.productRoles?.includes("platform-engineer")
  )
    return "platform_engineer_required";
  return null;
}
