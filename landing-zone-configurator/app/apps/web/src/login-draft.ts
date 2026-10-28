import { type EditorDraft, readEditorDraft } from "@lzc/domain";
import type { Session } from "./components/Account";
import type { ConfigurationBinding } from "./components/Configurations";
import type { DeploymentStep, EditorStep, View } from "./navigation";
import { standaloneTemplate } from "./templates";

const key = "lzc-oauth-draft";
const ownerKey = (owner: { userId: string; tenantId: string }) =>
  `${key}:${encodeURIComponent(owner.userId)}:${encodeURIComponent(owner.tenantId)}`;
export type LoginDraftContext = {
  owner?: { userId: string; tenantId: string };
  binding?: ConfigurationBinding | null;
  savedDraft?: string | null;
  location?: { view: View; step: EditorStep; deploymentStep: DeploymentStep };
};
export function preserveLoginDraft(
  draft: EditorDraft | null,
  context: LoginDraftContext = {},
): boolean {
  try {
    if (draft) {
      const value = JSON.stringify({
        draft,
        ...context,
        sha256: standaloneTemplate.sha256,
        expires: Date.now() + 24 * 3600000,
      });
      if (value.length > 3 * 1024 * 1024) return false;
      if (context.owner) sessionStorage.setItem(ownerKey(context.owner), value);
      sessionStorage.setItem(key, value);
    } else sessionStorage.removeItem(key);
    return true;
  } catch {
    return !draft;
  }
}
export function readLoginRecovery(
  session: Session | null = null,
): (LoginDraftContext & { draft: EditorDraft }) | null {
  try {
    const raw =
      (session?.user.id && session.tenant?.id
        ? sessionStorage.getItem(
            ownerKey({ userId: session.user.id, tenantId: session.tenant.id }),
          )
        : null) ?? sessionStorage.getItem(key);
    if (!raw || raw.length > 3 * 1024 * 1024) return null;
    const saved = JSON.parse(raw);
    if (
      saved.sha256 !== standaloneTemplate.sha256 ||
      !(saved.expires > Date.now())
    )
      return null;
    if (
      saved.owner &&
      (!session ||
        saved.owner.userId !== session.user.id ||
        saved.owner.tenantId !== session.tenant?.id)
    )
      return null;
    if (
      saved.binding &&
      (!/^[0-9a-f-]{36}$/i.test(saved.binding.id) ||
        !Number.isSafeInteger(saved.binding.revision) ||
        saved.binding.revision < 1)
    )
      return null;
    if (saved.savedDraft != null) readEditorDraft(JSON.parse(saved.savedDraft));
    const location = saved.location;
    if (
      location &&
      (![
        "workspaces",
        "templates",
        "preview",
        "editor",
        "repositories",
        "credentials",
        "deployments",
        "history",
        "organisation",
        "applications",
      ].includes(location.view) ||
        ![
          "basics",
          "folders",
          "network",
          "platform",
          "projects",
          "operations",
          "review",
        ].includes(location.step) ||
        !["preparation", "plan", "apply", "history"].includes(
          location.deploymentStep,
        ))
    )
      return null;
    return {
      draft: readEditorDraft(saved.draft),
      owner: saved.owner,
      binding: saved.binding ?? null,
      savedDraft: saved.savedDraft ?? null,
      location,
    };
  } catch {
    return null;
  }
}
export function readLoginDraft(): EditorDraft | null {
  return readLoginRecovery()?.draft ?? null;
}
export function pendingLoginOwner(
  session: Session,
): { userId: string; tenantId: string } | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw || raw.length > 3 * 1024 * 1024) return null;
    const saved = JSON.parse(raw);
    return saved.sha256 === standaloneTemplate.sha256 &&
      saved.expires > Date.now() &&
      saved.owner?.userId === session.user.id &&
      typeof saved.owner?.tenantId === "string"
      ? saved.owner
      : null;
  } catch {
    return null;
  }
}
export function clearLoginDraft(session?: Session | null) {
  try {
    const raw = sessionStorage.getItem(key);
    const owner = raw ? JSON.parse(raw).owner : null;
    if (session?.user.id && session.tenant?.id) {
      sessionStorage.removeItem(
        ownerKey({ userId: session.user.id, tenantId: session.tenant.id }),
      );
      if (
        owner &&
        (owner.userId !== session.user.id ||
          owner.tenantId !== session.tenant.id)
      )
        return;
    } else if (owner) sessionStorage.removeItem(ownerKey(owner));
    sessionStorage.removeItem(key);
  } catch {
    /* Storage can be disabled. */
  }
}
