import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/auth/status", (r) =>
    r.fulfill({ json: { github: false } }),
  );
  await page.route("**/api/v1/session", (r) =>
    r.fulfill({ status: 401, json: {} }),
  );
});
test("platform engineer controls stage inputs and can test an order without provisioning", async ({
  page,
}, testInfo) => {
  await page.goto("/templates/standalone");
  await page
    .getByRole("button", { name: "Konfiguration erstellen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "5 Projekt-Templates", exact: true })
    .click();
  const template = page.locator("section.project-card").first();
  await template
    .getByText("Umgebung / Stage · Bei Bestellung auswählbar", { exact: true })
    .click();
  await template
    .getByLabel("Erlaubte Werte: Umgebung / Stage", { exact: true })
    .fill("qa\nstaging");
  await template
    .getByLabel("Erlaubte Werte: Umgebung / Stage", { exact: true })
    .blur();
  await expect(template.getByLabel("Vorauswahl anbieten")).not.toBeChecked();
  await expect(
    template.getByLabel("Erlaubte Werte: Umgebung / Stage", { exact: true }),
  ).toHaveValue("qa\nstaging");
  await template
    .getByLabel("Erlaubte Werte: Umgebung / Stage", { exact: true })
    .fill("dev\nprod");
  await template
    .getByLabel("Erlaubte Werte: Umgebung / Stage", { exact: true })
    .blur();
  await template.getByLabel("Vorauswahl anbieten").check();
  await template
    .getByLabel("Vorauswahl: Umgebung / Stage", { exact: true })
    .selectOption("prod");
  await template.getByText("Bestellung testen", { exact: true }).click();
  await expect(
    template.getByLabel("Bestellung: Umgebung / Stage", { exact: true }),
  ).toHaveValue("prod");
  await expect(
    template.getByLabel("Bestellung: Umgebung / Stage").locator("option"),
  ).toHaveText(["dev", "prod"]);
  await template.getByLabel("Bestellung: Umgebung / Stage").selectOption("dev");
  await expect(template.locator(".parameter-preview")).toContainText(
    "Explizite Bestelleingabe",
  );
  await template
    .getByLabel("Wertquelle: Umgebung / Stage")
    .selectOption("fixed");
  await expect(template.getByLabel("Bestellung: Umgebung / Stage")).toHaveCount(
    0,
  );
  await expect(
    template.getByLabel("Fester Wert: Umgebung / Stage"),
  ).toHaveValue("prod");
  await template
    .getByLabel("Wertquelle: Umgebung / Stage")
    .selectOption("input");
  await template
    .getByLabel("Vorauswahl: Umgebung / Stage")
    .selectOption("prod");
  await page.getByRole("button", { name: "1 Grundlagen", exact: true }).click();
  await page
    .getByRole("button", { name: "5 Projekt-Templates", exact: true })
    .click();
  await template
    .getByText("Umgebung / Stage · Bei Bestellung auswählbar", { exact: true })
    .click();
  await expect(template.getByLabel("Vorauswahl: Umgebung / Stage")).toHaveValue(
    "prod",
  );
  await template.getByText("Bestellung testen", { exact: true }).click();
  await expect(template.locator(".parameter-preview")).toContainText(
    "Es werden keine Ressourcen erstellt",
  );
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("template-parameters.jpg"),
    quality: 70,
    fullPage: true,
  });
});
test("project-network relationship stays visibly blocked without an approved egress path", async ({
  page,
}) => {
  await page.goto("/templates/hub-and-spoke");
  await page
    .getByRole("button", { name: "Konfiguration erstellen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "5 Projekt-Templates", exact: true })
    .click();
  const template = page
    .locator("section.project-card")
    .filter({ hasText: /Entwurf · Corporate/ })
    .first();
  await template
    .getByText("STACKIT Observability · Fest vorgegeben", { exact: true })
    .click();
  await template
    .getByLabel("Fester Wert: STACKIT Observability", { exact: true })
    .selectOption("true");
  await template
    .getByText("Observability-Zugriffsquellen · Fest vorgegeben", {
      exact: true,
    })
    .click();
  page.on("dialog", (dialog) => dialog.accept());
  await template
    .getByLabel("Wertquelle: Observability-Zugriffsquellen")
    .selectOption("binding");
  await template.getByText("Bestellung testen", { exact: true }).click();
  await expect(template.locator(".parameter-preview")).toContainText(
    "Veröffentlichung und Ausführung dieser Bindung bleiben gesperrt",
  );
  await expect(template.locator(".parameter-preview")).toContainText(
    "Wird aus der Ressourcenverknüpfung ermittelt",
  );
});
