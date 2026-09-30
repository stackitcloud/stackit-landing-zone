import { type ConfigurationDraft, draftShape } from "@lzc/domain";
import type { Session } from "./components/Account";
import { standaloneTemplate } from "./templates";

export type Fork = {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
};
export type Binding = { id: string; head: string; mode: "create" | "update" };
export type Workspace = {
  fork: Fork | null;
  binding: Binding | null;
  draft: ConfigurationDraft | null;
  path: string;
};
export function workspaceKey(session: Session | null): string | null {
  return session?.user.id
    ? `lzc-workspace-v1:${encodeURIComponent(session.tenant?.id ?? "personal")}:${encodeURIComponent(session.user.id)}`
    : null;
}
export function workspacePath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    /^\/(?:templates(?:\/[a-z0-9-]+)?|repositories|credentials|deployments|configurations\/edit\/(?:basics|folders|projects|review))$/.test(
      path,
    )
  );
}
export function readWorkspace(key: string | null): Workspace | null {
  try {
    const raw = key && localStorage.getItem(key);
    if (!raw || raw.length > 1024 * 1024) return null;
    const value = JSON.parse(raw);
    if (
      value.version !== 1 ||
      value.sha256 !== standaloneTemplate.sha256 ||
      !workspacePath(value.path)
    )
      return null;
    const draft = value.draft === null ? null : draftShape.parse(value.draft);
    const f = value.fork;
    if (
      f !== null &&
      (!f ||
        !Number.isSafeInteger(f.id) ||
        f.id <= 0 ||
        ![f.owner, f.name, f.fullName, f.defaultBranch].every(
          (s) => typeof s === "string" && s.length > 0 && s.length <= 256,
        ))
    )
      return null;
    const b = value.binding;
    if (
      b !== null &&
      (!f ||
        !draft ||
        !b ||
        typeof b.id !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(b.id) ||
        typeof b.head !== "string" ||
        !/^[0-9a-f]{40}$/i.test(b.head) ||
        !["create", "update"].includes(b.mode))
    )
      return null;
    return { fork: f, binding: b, draft, path: value.path };
  } catch {
    return null;
  }
}
export function writeWorkspace(key: string | null, value: Workspace): boolean {
  if (!key) return true;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        ...value,
        version: 1,
        sha256: standaloneTemplate.sha256,
      }),
    );
    return true;
  } catch {
    return false;
  }
}
