import { t } from "./i18n";

type Workspace = { name?: string; kind?: "personal" | "organisation" };

export function workspaceName(
  workspace: Workspace & { name: string },
  login?: string,
): string;
export function workspaceName(
  workspace?: Workspace,
  login?: string,
): string | undefined;
export function workspaceName(
  workspace?: Workspace,
  login?: string,
): string | undefined {
  const name = workspace?.name;
  if (workspace?.kind !== "personal") return name;
  if (name === "Persönlicher Arbeitsbereich")
    return t("Persönlicher Arbeitsbereich");
  // Older accounts include the login in the generated default name. Keep that
  // identity unchanged, and only translate the known system-generated suffix.
  if (login && name === `${login} · Persönlicher Arbeitsbereich`)
    return `${login} · ${t("Persönlicher Arbeitsbereich")}`;
  return name;
}
