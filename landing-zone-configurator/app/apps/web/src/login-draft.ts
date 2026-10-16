import { type EditorDraft, readEditorDraft } from "@lzc/domain";
import { standaloneTemplate } from "./templates";

const key = "lzc-oauth-draft";
export function preserveLoginDraft(draft: EditorDraft | null): boolean {
  try {
    if (draft)
      sessionStorage.setItem(
        key,
        JSON.stringify({
          draft,
          sha256: standaloneTemplate.sha256,
          expires: Date.now() + 10 * 60 * 1000,
        }),
      );
    else sessionStorage.removeItem(key);
    return true;
  } catch {
    return !draft;
  }
}
export function readLoginDraft(): EditorDraft | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw || raw.length > 1024 * 1024) return null;
    const saved = JSON.parse(raw);
    if (
      saved.sha256 !== standaloneTemplate.sha256 ||
      !(saved.expires > Date.now())
    )
      return null;
    return readEditorDraft(saved.draft);
  } catch {
    return null;
  }
}
export function clearLoginDraft() {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* Storage can be disabled. */
  }
}
