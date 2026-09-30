import { type ConfigurationDraft, draftShape } from "@lzc/domain";
import { standaloneTemplate } from "./templates";

const key = "lzc-oauth-draft";
export function preserveLoginDraft(draft: ConfigurationDraft | null): boolean {
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
export function readLoginDraft(): ConfigurationDraft | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw || raw.length > 1024 * 1024) return null;
    const saved = JSON.parse(raw);
    if (
      saved.sha256 !== standaloneTemplate.sha256 ||
      !(saved.expires > Date.now())
    )
      return null;
    const parsed = draftShape.safeParse(saved.draft);
    return parsed.success ? parsed.data : null;
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
