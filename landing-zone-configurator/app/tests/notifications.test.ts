import { randomUUID } from "node:crypto";
import {
  notificationCopy,
  notificationKinds,
  notificationPath,
  notificationPreferencesSchema,
} from "@lzc/contracts";
import { expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import type { AuthServices } from "../apps/api/src/auth/routes.js";
import type { Session } from "../apps/api/src/auth/store.js";
import {
  mailFailure,
  mailSettings,
  renderNotificationMail,
} from "../apps/api/src/notifications/mail.js";

const origin = "https://notifications.example.test";
const item = {
  id: randomUUID(),
  kind: "order-pending" as const,
  resourceType: "application" as const,
  resourceId: randomUUID(),
  operation: null,
};
it("renders every event in both locales with embedded branding and text alternatives", () => {
  for (const kind of notificationKinds)
    for (const locale of ["de", "en"] as const) {
      const result = renderNotificationMail(
        { ...item, kind, tenantId: randomUUID() },
        locale,
        origin,
      );
      expect(result.html).toContain("cid:stackit-brand");
      expect(result.html).toContain(`lang="${locale}"`);
      expect(result.html).toContain(notificationCopy(kind, locale).title);
      expect(result.text).toContain(notificationCopy(kind, locale).description);
      expect(result.subject).not.toContain(item.resourceId);
      expect(result.html).not.toMatch(
        /<script|<iframe|<form|javascript:|private key/i,
      );
      expect(result.html).toContain(`${origin}/notifications`);
      expect(result.text).toContain(`${origin}/applications?notification=`);
    }
  expect(() =>
    renderNotificationMail(
      item,
      "de",
      origin,
      "https://elsewhere.example.test/steal",
    ),
  ).toThrow("notification_link_invalid");
});
it("distinguishes bounded retries from a lost SMTP DATA response", () => {
  expect(mailFailure({ responseCode: 451, command: "DATA" })).toBe("temporary");
  expect(mailFailure({ responseCode: 550, command: "DATA" })).toBe("rejected");
  expect(mailFailure({ command: "CONN", code: "ETIMEDOUT" })).toBe("temporary");
  expect(mailFailure({ command: "DATA", code: "ETIMEDOUT" })).toBe("ambiguous");
  expect(mailFailure(Error("private provider diagnostics"))).toBe("ambiguous");
});
it("requires complete explicit MailOut bindings and validates personal preferences", () => {
  expect(mailSettings({})).toBeUndefined();
  expect(() => mailSettings({ LZC_MAILOUT_ENABLED: "true" })).toThrow();
  expect(
    mailSettings({
      LZC_MAILOUT_ENABLED: "true",
      LZC_MAILOUT_HOST: "smtp.mailout.eu01.stackit.cloud",
      LZC_MAILOUT_USERNAME: "sender",
      LZC_MAILOUT_PASSWORD: "synthetic-password",
      LZC_MAILOUT_FROM: "notifications@example.test",
      LZC_PUBLIC_ORIGIN: origin,
    })?.port,
  ).toBe(25);
  expect(
    notificationPreferencesSchema.safeParse({
      locale: "de",
      emailTopics: ["access", "access"],
    }).success,
  ).toBe(false);
  expect(
    notificationPreferencesSchema.safeParse({
      locale: "de",
      emailTopics: ["invitations"],
    }).success,
  ).toBe(false);
  expect(
    notificationPreferencesSchema.parse({ locale: "en", emailTopics: [] }),
  ).toEqual({ locale: "en", emailTopics: [] });
  expect(notificationPath(item)).toContain(item.resourceId);
});
it("enforces authentication, tenant context and CSRF and redacts private failures", async () => {
  const session: Session = {
    id: randomUUID(),
    userId: randomUUID(),
    tenantId: randomUUID(),
    githubId: "101",
    login: "synthetic",
    csrfToken: "c".repeat(43),
    expiresAt: new Date(Date.now() + 60000),
  };
  const store = { resolveSession: vi.fn(async () => session) };
  const auth = {
    store,
    origin,
    cookieName: "lzc_session",
    secureCookie: true,
  } as unknown as AuthServices;
  const list = vi.fn(async () => ({ items: [], unread: 0 }));
  const read = vi.fn(async () => {});
  const preferences = vi.fn(async () => ({
    locale: "de" as const,
    emailTopics: [],
    hasVerifiedEmail: true,
    mailEnabled: true,
  }));
  const app = buildApp({ auth, notifications: { list, read, preferences } });
  expect(
    (await app.inject({ url: "/api/v1/notifications/inbox" })).statusCode,
  ).toBe(401);
  const headers = {
    cookie: `__Host-lzc-session=${"a".repeat(43)}`,
    origin,
    "x-lzc-tenant": session.tenantId,
    "x-lzc-csrf": session.csrfToken,
  };
  const fetched = await app.inject({
    url: "/api/v1/notifications/inbox",
    headers,
  });
  expect(fetched.statusCode).toBe(200);
  expect(fetched.headers["cache-control"]).toBe("no-store");
  expect(
    (
      await app.inject({
        url: "/api/v1/notifications/inbox",
        headers: { ...headers, "x-lzc-tenant": randomUUID() },
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/notifications/read",
        headers: { ...headers, "x-lzc-csrf": "wrong" },
        payload: { id: null },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/notifications/read",
        headers,
        payload: { id: null },
      })
    ).statusCode,
  ).toBe(204);
  expect(
    (
      await app.inject({
        method: "PATCH",
        url: "/api/v1/notifications/preferences",
        headers,
        payload: { locale: "en", emailTopics: ["not-real"] },
      })
    ).statusCode,
  ).toBe(400);
  list.mockRejectedValueOnce(Error("private DSN password"));
  const failed = await app.inject({
    url: "/api/v1/notifications/inbox",
    headers,
  });
  expect(failed.statusCode).toBe(503);
  expect(failed.body).not.toContain("password");
  await app.close();
});
