import { expect, test } from "./fixtures";

test("developer login is distinct from STACKIT and submits credentials only to its login endpoint", async ({
  page,
}) => {
  let authenticated = false;
  await page.route("**/auth/status", (route) =>
    route.fulfill({
      json: {
        github: false,
        stackit: false,
        primary: "development",
        development: true,
      },
    }),
  );
  await page.route("**/api/v1/session", (route) =>
    authenticated
      ? route.fulfill({
          json: {
            user: {
              id: "11111111-1111-4111-8111-111111111111",
              login: "developer (Entwicklung)",
            },
            tenant: {
              id: "22222222-2222-4222-8222-222222222222",
              kind: "personal",
              roles: [],
            },
            csrfToken: "c".repeat(43),
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            development: true,
            stackitVerified: false,
          },
        })
      : route.fulfill({
          status: 401,
          json: { error: "authentication_required" },
        }),
  );
  await page.route("**/auth/development/login", (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({
      username: "developer",
      password: "synthetic-browser-password",
    });
    authenticated = true;
    return route.fulfill({ json: { authenticated: true, development: true } });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Entwicklerlogin", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("kein verifizierter STACKIT-Benutzer");
  await dialog
    .getByLabel("Passwort", { exact: true })
    .fill("synthetic-browser-password");
  await dialog.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText("Entwicklungsmodus", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Abmelden", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mit STACKIT anmelden", exact: true }),
  ).toHaveCount(0);
});
