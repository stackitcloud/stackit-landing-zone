import { expect, test } from "@playwright/test";

const userId = "11111111-1111-4111-8111-111111111111";
const tenantId = "22222222-2222-4222-8222-222222222222";
const organisationId = "33333333-3333-4333-8333-333333333333";
for (const manager of [true, false]) {
  test(`organisation membership view ${manager ? "manager" : "application owner"}`, async ({
    page,
  }, testInfo) => {
    const roles = [manager ? "platform-engineer" : "application-owner"];
    await page.route("**/auth/status", (route) =>
      route.fulfill({ json: { github: true } }),
    );
    await page.route("**/api/v1/session", (route) =>
      route.fulfill({
        json: {
          user: { id: userId, login: "pilot" },
          tenant: {
            id: tenantId,
            name: "Pilot",
            kind: "organisation",
            roles,
            manageMembers: manager,
          },
          csrfToken: "test-csrf",
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
      }),
    );
    await page.route("**/api/v1/github/**", (route) =>
      route.fulfill({ json: { forks: [], nextPage: null } }),
    );
    await page.route("**/api/v1/organisation", (route) =>
      route.fulfill({
        json: {
          userId,
          activeTenantId: tenantId,
          tenants: [
            {
              id: tenantId,
              name: "Pilot",
              kind: "organisation",
              organizationId: organisationId,
              organizationVerified: false,
              roles,
              manageMembers: manager,
            },
          ],
          members: [{ userId, login: "pilot", roles, manageMembers: manager }],
        },
      }),
    );
    await page.goto("/");
    await expect(
      page.getByText("@pilot", { exact: true }).first(),
    ).toBeVisible();
    if (!manager) {
      await expect(
        page.getByRole("heading", { name: "Application Self-Service" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "GitHub-Forks", exact: true }),
      ).toHaveCount(0);
    }
    await page
      .getByRole("button", { name: "Organisation & Mitglieder", exact: true })
      .click();
    await expect(page).toHaveURL(/\/organisation$/);
    await expect(
      page.getByRole("heading", { name: "Mitglieder in Pilot" }),
    ).toBeVisible();
    await expect(
      page.getByText(/Zuordnung noch nicht verifiziert/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Deployments", exact: true }),
    ).toHaveCount(0);
    if (manager) {
      let body: unknown;
      await page.route("**/api/v1/organisation/members", async (route) => {
        body = route.request().postDataJSON();
        expect(route.request().headers()["x-lzc-csrf"]).toBe("test-csrf");
        expect(route.request().headers()["x-lzc-tenant"]).toBe(tenantId);
        await route.fulfill({ status: 204 });
      });
      await page
        .getByLabel("Persönliche Benutzerkennung", { exact: true })
        .fill("44444444-4444-4444-8444-444444444444");
      await page
        .getByRole("button", { name: "Mitgliedschaft speichern" })
        .click();
      await expect(page.getByRole("status")).toHaveText(
        "Änderung gespeichert.",
      );
      expect(body).toEqual({
        userId: "44444444-4444-4444-8444-444444444444",
        roles: ["application-owner"],
        manageMembers: false,
      });
    } else
      await expect(
        page.getByRole("button", { name: "Mitgliedschaft speichern" }),
      ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("organisation.png"),
      fullPage: true,
    });
    await page.goBack();
    await expect(page).not.toHaveURL(/\/organisation$/);
  });
}
