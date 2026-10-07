import { expect, test } from "./fixtures";

test("invitation survives login redirect without joining until confirmation", async ({
  page,
}) => {
  let loggedIn = false;
  let accepted = 0;
  const token = "t".repeat(43);
  await page.route("**/auth/status", (r) =>
    r.fulfill({ json: { github: true } }),
  );
  await page.route("**/api/v1/session", (r) =>
    loggedIn
      ? r.fulfill({
          json: {
            user: { id: "person", login: "new-person" },
            tenant: { id: "personal" },
            csrfToken: "c".repeat(43),
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
          },
        })
      : r.fulfill({ status: 401, json: {} }),
  );
  await page.route("**/api/v1/organisation", (r) =>
    r.fulfill({
      json: {
        userId: "person",
        activeTenantId: "personal",
        tenants: [],
        members: [],
      },
    }),
  );
  await page.route("**/api/v1/github/**", (r) =>
    r.fulfill({ json: { forks: [] } }),
  );
  await page.route("**/api/v1/invitations/*", (r) => {
    expect(r.request().url()).not.toContain(token);
    expect(r.request().postDataJSON()).toEqual({ token });
    if (r.request().url().endsWith("/accept")) accepted++;
    return r.fulfill({
      json: {
        tenantId: "team",
        name: "Platform team",
        organizationId: "org",
        roles: ["application-owner"],
        manageMembers: false,
      },
    });
  });
  await page.goto(`/organisation#invite=${token}`);
  await expect(page).toHaveURL(/\/organisation$/);
  await expect(
    page.getByText(/Auch bei deiner ersten Anmeldung/),
  ).toBeVisible();
  expect(accepted).toBe(0);
  loggedIn = true;
  // The real GitHub callback returns to / in this same browser tab.
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Platform team", exact: true }),
  ).toBeVisible();
  expect(accepted).toBe(0);
  await page
    .getByRole("button", { name: "Beitreten und Arbeitsbereich öffnen" })
    .click();
  await expect(page).toHaveURL(/\/organisation$/);
  expect(accepted).toBe(1);
  expect(
    await page.evaluate(() => sessionStorage.getItem("lzc.pending-invitation")),
  ).toBeNull();
});

test("a second invitation opened in the same document replaces the first", async ({
  page,
}) => {
  await page.route("**/auth/status", (r) =>
    r.fulfill({ json: { github: true } }),
  );
  await page.route("**/api/v1/session", (r) =>
    r.fulfill({ status: 401, json: {} }),
  );
  const first = "a".repeat(43);
  const second = "b".repeat(43);
  await page.goto(`/organisation#invite=${first}`);
  const panel = page.getByRole("region", { name: "Einladung annehmen" });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Einladung schließen" }).click();
  await expect(panel).not.toBeVisible();
  await page.evaluate((token) => {
    window.location.hash = `invite=${token}`;
  }, second);
  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(/\/organisation$/);
  expect(
    await page.evaluate(() => sessionStorage.getItem("lzc.pending-invitation")),
  ).toBe(second);
});

test("an invitation remains usable with browser storage blocked", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "sessionStorage", {
      get() {
        throw new DOMException("Storage blocked", "SecurityError");
      },
    });
  });
  await page.route("**/auth/status", (r) =>
    r.fulfill({ json: { github: true } }),
  );
  await page.route("**/api/v1/session", (r) =>
    r.fulfill({ status: 401, json: {} }),
  );
  await page.goto(`/organisation#invite=${"c".repeat(43)}`);
  const panel = page.getByRole("region", { name: "Einladung annehmen" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("status")).toContainText(
    "nach der Anmeldung bitte erneut",
  );
  await expect(page).toHaveURL(/\/organisation$/);
  await panel.getByRole("button", { name: "Einladung schließen" }).click();
  await expect(panel).not.toBeVisible();
});
