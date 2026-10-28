import { createEditorConfiguration } from "@lzc/domain";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  clearLoginDraft,
  pendingLoginOwner,
  preserveLoginDraft,
  readLoginDraft,
  readLoginRecovery,
} from "../apps/web/src/login-draft.js";

const user = "11111111-1111-4111-8111-111111111111";
const tenant = "22222222-2222-4222-8222-222222222222";
const session = {
  user: { id: user, login: "human@example.test" },
  tenant: { id: tenant },
  csrfToken: "c".repeat(43),
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
};
let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());
it("restores the exact draft, database revision, baseline and page only to its original workspace", () => {
  const draft = createEditorConfiguration("hub-and-spoke", crypto.randomUUID());
  const binding = { id: crypto.randomUUID(), revision: 11 };
  const context = {
    owner: { userId: user, tenantId: tenant },
    binding,
    savedDraft: JSON.stringify(draft),
    location: {
      view: "applications" as const,
      step: "platform" as const,
      deploymentStep: "plan" as const,
    },
  };
  expect(preserveLoginDraft(draft, context)).toBe(true);
  expect(readLoginDraft()).toBeNull();
  expect(readLoginRecovery(session)).toEqual({ ...context, draft });
  expect(
    readLoginRecovery({
      ...session,
      user: { ...session.user, id: "other-user" },
    }),
  ).toBeNull();
  expect(
    readLoginRecovery({ ...session, tenant: { id: "other-tenant" } }),
  ).toBeNull();
  expect(pendingLoginOwner(session)).toEqual(context.owner);
  expect(
    pendingLoginOwner({
      ...session,
      user: { ...session.user, id: "other-user" },
    }),
  ).toBeNull();
});
it("retains separately scoped drafts when another account starts a local draft", () => {
  const a = createEditorConfiguration("standalone", crypto.randomUUID());
  const b = createEditorConfiguration("standalone", crypto.randomUUID());
  const other = { ...session, user: { ...session.user, id: "other-user" } };
  preserveLoginDraft(a, { owner: { userId: user, tenantId: tenant } });
  preserveLoginDraft(b, { owner: { userId: "other-user", tenantId: tenant } });
  expect(readLoginRecovery(session)?.draft).toEqual(a);
  clearLoginDraft(other);
  expect(readLoginRecovery(other)).toBeNull();
  expect(readLoginRecovery(session)?.draft).toEqual(a);
});
it("keeps guest drafts compatible without storing session credentials", () => {
  const draft = createEditorConfiguration("standalone", crypto.randomUUID());
  preserveLoginDraft(draft);
  expect(readLoginDraft()).toEqual(draft);
  expect([...storage.values()].join()).not.toContain(session.csrfToken);
});
it("blocks navigation when browser storage is unavailable", () => {
  vi.stubGlobal("sessionStorage", {
    setItem: () => {
      throw new Error("quota");
    },
  });
  expect(
    preserveLoginDraft(
      createEditorConfiguration("standalone", crypto.randomUUID()),
    ),
  ).toBe(false);
});
