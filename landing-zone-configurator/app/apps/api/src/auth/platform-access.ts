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
  if (/^\/api\/v1\/(preparations|plans)(\/|$)/.test(path))
    return "organisation_execution_not_enabled";
  if (/^\/api\/v1\/(credentials|cloud-catalogues)(\/|$)/.test(path))
    return "organisation_credentials_not_enabled";
  if (
    /^\/api\/v1\/(github|credentials|cloud-catalogues)(\/|$)/.test(path) &&
    !session.productRoles?.includes("platform-engineer")
  )
    return "platform_engineer_required";
  return null;
}
