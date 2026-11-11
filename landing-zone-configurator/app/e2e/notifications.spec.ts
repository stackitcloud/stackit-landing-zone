import { mockEmptyApplicationLists } from "./editor-navigation";
import { expect, test } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockEmptyApplicationLists(page);
});

const userId = "11111111-1111-4111-8111-111111111111",
  tenantId = "22222222-2222-4222-8222-222222222222",
  id = "33333333-3333-4333-8333-333333333333";
test("Application Owner can read notices and personally choose email topics and language", async ({
  page,
}, testInfo) => {
  let read = false;
  let saved: unknown;
  await page.route("**/auth/status", (r) =>
    r.fulfill({ json: { github: false, stackit: true, primary: "stackit" } }),
  );
  await page.route("**/api/v1/session", (r) =>
    r.fulfill({
      json: {
        user: { id: userId, login: "notification-tester" },
        tenant: {
          id: tenantId,
          name: "Notification Test",
          kind: "organisation",
          roles: ["application-owner"],
        },
        csrfToken: "c".repeat(43),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    }),
  );
  await page.route("**/api/v1/notifications/inbox*", (r) =>
    r.fulfill({
      json: {
        unread: read ? 0 : 1,
        items: [
          {
            id,
            topic: "execution-failure",
            kind: "execution-failed",
            resourceType: "application",
            resourceId: id,
            operation: "apply",
            createdAt: "2026-11-11T08:00:00Z",
            readAt: read ? "2026-11-11T08:01:00Z" : null,
            emailStatus: "accepted",
          },
        ],
      },
    }),
  );
  let preferences = {
    locale: "de",
    emailTopics: ["approvals", "execution-failure"],
    hasVerifiedEmail: true,
    mailEnabled: true,
  };
  await page.route("**/api/v1/notifications/preferences", (r) => {
    if (r.request().method() === "PATCH") {
      saved = r.request().postDataJSON();
      preferences = { ...preferences, ...r.request().postDataJSON() };
      expect(r.request().headers()["x-lzc-tenant"]).toBe(tenantId);
      expect(r.request().headers()["x-lzc-csrf"]).toBe("c".repeat(43));
    }
    return r.fulfill({ json: preferences });
  });
  await page.route("**/api/v1/notifications/read", (r) => {
    read = true;
    return r.fulfill({ status: 204 });
  });
  await page.goto("/notifications");
  await expect(
    page.getByRole("heading", { level: 1, name: "Benachrichtigungen" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Ausführung fehlgeschlagen",
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Bestellungen und Freigaben" })
    .uncheck();
  await page.getByLabel("Sprache für Nachrichten").selectOption("en");
  await page
    .getByRole("button", { name: "Als gelesen markieren", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Benachrichtigungen: 0/ }),
  ).toBeVisible();

  await expect(
    page.getByRole("checkbox", { name: "Bestellungen und Freigaben" }),
  ).not.toBeChecked();
  await expect(page.getByLabel("Sprache für Nachrichten")).toHaveValue("en");
  await page.getByRole("button", { name: "Einstellungen speichern" }).click();
  expect(saved).toEqual({ locale: "en", emailTopics: ["execution-failure"] });
  await expect(
    page.getByRole("heading", { name: "Execution failed", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Vorgang öffnen" }),
  ).toHaveAttribute(
    "href",
    new RegExp(
      `/applications\\?notification=${id}&resource=${id}&tenant=${tenantId}`,
    ),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("notifications.png"),
    fullPage: true,
  });
});
test("inviter chooses recipient and mail language without claiming delivery", async ({
  page,
}) => {
  let posted: unknown;
  await page.route("**/auth/status", (r) =>
    r.fulfill({ json: { github: true } }),
  );
  await page.route("**/api/v1/session", (r) =>
    r.fulfill({
      json: {
        user: { id: userId, login: "inviter" },
        tenant: {
          id: tenantId,
          name: "Mail Test",
          kind: "organisation",
          roles: ["platform-engineer"],
        },
        csrfToken: "c".repeat(43),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    }),
  );
  await page.route("**/api/v1/organisation", (r) =>
    r.fulfill({
      json: {
        userId,
        activeTenantId: tenantId,
        tenants: [
          {
            id: tenantId,
            name: "Mail Test",
            kind: "organisation",
            organizationId: id,
            organizationVerified: false,
            roles: ["platform-engineer"],
            manageMembers: true,
          },
        ],
        members: [],
      },
    }),
  );
  await page.route("**/api/v1/application-groups", (r) =>
    r.fulfill({ json: { groups: [] } }),
  );
  await page.route("**/api/v1/invitations", (r) => {
    if (r.request().method() === "POST") {
      posted = r.request().postDataJSON();
      return r.fulfill({
        status: 201,
        json: {
          id,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          url: `https://example.test/organisation#invite=${"t".repeat(43)}`,
          emailQueued: true,
        },
      });
    }
    return r.fulfill({ json: { invitations: [] } });
  });
  await page.goto("/organisation");
  await page
    .getByRole("button", { name: "Person einladen", exact: true })
    .click();
  await page.getByRole("radio", { name: /^Per E-Mail einladen/ }).check();
  await page
    .getByLabel("E-Mail-Adresse der eingeladenen Person")
    .fill("invitee@example.test");
  await page.getByLabel("Sprache für Nachrichten").selectOption("en");
  await page
    .getByRole("button", { name: "Einladung senden", exact: true })
    .click();
  expect(posted).toMatchObject({
    mail: { email: "invitee@example.test", locale: "en" },
  });
  await expect(
    page.getByText(
      "Die Einladung an invitee@example.test ist für den Versand vorgemerkt.",
    ),
  ).toBeVisible();
});
