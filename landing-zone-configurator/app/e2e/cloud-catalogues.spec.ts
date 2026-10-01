import { expect, test } from "@playwright/test";

test("product choices preserve imported values and restore manual fields when catalogue access fails", async ({
  page,
}) => {
  const session = {
    user: { id: "catalogue-user", login: "alice" },
    tenant: { id: "personal-one" },
    csrfToken: "a".repeat(43),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
  await page.route("**/auth/status", (route) =>
    route.fulfill({ json: { github: true } }),
  );
  await page.route("**/api/v1/session", (route) =>
    route.fulfill({ json: session }),
  );
  await page.route("**/api/v1/organisation", (route) =>
    route.fulfill({ status: 404, json: {} }),
  );
  await page.route("**/api/v1/tenants", (route) =>
    route.fulfill({ json: { tenants: [] } }),
  );
  await page.route("**/api/v1/credentials", (route) =>
    route.fulfill({
      json: {
        profiles: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Eigener Zugang",
            state: "stored",
          },
        ],
      },
    }),
  );
  let available = true;
  const missing = { status: "unavailable", options: [] };
  await page.route("**/api/v1/cloud-catalogues", (route) =>
    route.fulfill({
      json: {
        region: "eu01",
        projectId: "22222222-2222-4222-8222-222222222222",
        fetchedAt: new Date().toISOString(),
        gitFlavors: available
          ? {
              status: "available",
              options: [{ value: "git-10", label: "Git 10" }],
            }
          : missing,
        vpnPlans: missing,
        kubernetesVersions: missing,
        machineTypes: missing,
        volumeTypes: missing,
        availabilityZones: missing,
      },
    }),
  );
  await page.goto("/templates/standalone");
  await expect(page.getByRole("button", { name: "Abmelden" })).toBeVisible();
  await page
    .getByRole("button", { name: "Konfiguration erstellen", exact: true })
    .click();
  await page.getByRole("button", { name: "4 Plattform", exact: true }).click();
  await page
    .getByRole("button", { name: "Komponente hinzufügen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Hinzufügen: Git-Service", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Konfigurieren: Git-Service", exact: true })
    .click();
  await page
    .locator("summary")
    .filter({ hasText: /^Git-Service/ })
    .click();
  await page
    .getByRole("button", {
      name: "Eigene Einstellung: Git-Leistungsklasse",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Git-Leistungsklasse", { exact: true })
    .fill("git-existing");
  await page
    .locator("summary")
    .filter({ hasText: "STACKIT-Produktoptionen laden" })
    .click();
  await page
    .getByLabel("Katalogzugang", { exact: true })
    .selectOption("11111111-1111-4111-8111-111111111111");
  await page
    .getByLabel("Referenzprojekt-ID")
    .fill("22222222-2222-4222-8222-222222222222");
  await page
    .getByRole("button", { name: "Produktoptionen aktualisieren" })
    .click();
  const flavor = page.getByLabel("Git-Leistungsklasse", { exact: true });
  await expect(flavor).toHaveJSProperty("tagName", "SELECT");
  await expect(flavor).toHaveValue("git-existing");
  await expect(flavor.locator('option[value="git-existing"]')).toContainText(
    "nicht im geladenen Katalog",
  );
  await flavor.selectOption("git-10");
  available = false;
  await page
    .getByRole("button", { name: "Produktoptionen aktualisieren" })
    .click();
  await expect(flavor).toHaveJSProperty("tagName", "INPUT");
  await expect(flavor).toHaveValue("git-10");
  await expect(
    page.getByText(
      "STACKIT Git: nicht verfügbar; manuelle Eingabe bleibt möglich",
    ),
  ).toBeVisible();
});
