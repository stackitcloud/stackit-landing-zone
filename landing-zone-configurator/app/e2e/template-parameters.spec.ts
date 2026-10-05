import { expect, test } from "@playwright/test";

test("an empty ACL draft can become an order input without granting unrestricted access", async ({
  page,
}) => {
  await page.goto("/templates/standalone");
  await page
    .getByRole("button", { name: "Konfiguration erstellen", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "5 Application Landing Zone Templates",
      exact: true,
    })
    .click();
  const template = page.locator("section.project-card").first();
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
  const source = template.getByLabel(
    "Wertquelle: Observability-Zugriffsquellen",
    { exact: true },
  );
  await expect(source.locator('option[value="binding"]')).toBeDisabled();
  await expect(template).toContainText(
    "Für Public-Projekte ist die öffentliche Egress-Adresse noch nicht qualifiziert",
  );
  await source.selectOption("input");
  await expect(source).toHaveValue("input");
  await template.getByText("Bestellung testen", { exact: true }).click();
  await expect(template.locator(".parameter-preview")).toContainText(
    "Pflichtangabe fehlt: Observability-Zugriffsquellen",
  );
  const choices = template.getByLabel(
    "Erlaubte Werte: Observability-Zugriffsquellen",
    { exact: true },
  );
  await choices.fill("203.0.113.0/24");
  await choices.blur();
  await template
    .getByRole("group", {
      name: "Bestellung: Observability-Zugriffsquellen",
      exact: true,
    })
    .getByLabel("203.0.113.0/24", { exact: true })
    .check();
  await expect(template.locator(".parameter-preview")).toContainText(
    "Explizite Bestelleingabe",
  );
});

test.beforeEach(async ({ page }) => {
  await page.route("**/auth/status", (r) =>
    r.fulfill({ json: { github: false } }),
  );
  await page.route("**/api/v1/session", (r) =>
    r.fulfill({ status: 401, json: {} }),
  );
});

test("disabled Observability hides dependent details without discarding their values", async ({
  page,
}) => {
  await page.goto("/templates/standalone");
  await page
    .getByRole("button", { name: "Konfiguration erstellen", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "5 Application Landing Zone Templates",
      exact: true,
    })
    .click();
  const template = page.locator("section.project-card").first();
  const planSection = template.getByText(
    "Observability-Leistungsklasse · Fest vorgegeben",
    { exact: true },
  );
  const aclSection = template.getByText(
    "Observability-Zugriffsquellen · Fest vorgegeben",
    { exact: true },
  );
  const name = template.getByText(
    "Fester Name der Observability-Instanz (optional)",
    { exact: true },
  );
  await expect(planSection).toHaveCount(0);
  await expect(aclSection).toHaveCount(0);
  await expect(name).toHaveCount(0);
  await template
    .getByText("STACKIT Observability · Fest vorgegeben", { exact: true })
    .click();
  const enabled = template.getByLabel("Fester Wert: STACKIT Observability", {
    exact: true,
  });
  await enabled.selectOption("true");
  await planSection.click();
  await template
    .getByLabel("Fester Wert: Observability-Leistungsklasse", { exact: true })
    .fill("Observability-Medium-EU01");
  await aclSection.click();
  const acl = template.getByLabel(
    "Fester Wert: Observability-Zugriffsquellen",
    {
      exact: true,
    },
  );
  await acl.fill("203.0.113.0/24");
  await acl.blur();
  await enabled.selectOption("false");
  await expect(planSection).toHaveCount(0);
  await expect(aclSection).toHaveCount(0);
  await expect(name).toHaveCount(0);
  await template.getByText("Bestellung testen", { exact: true }).click();
  await expect(template.locator(".parameter-preview dt")).not.toContainText([
    "Observability-Leistungsklasse",
    "Observability-Zugriffsquellen",
  ]);
  await enabled.selectOption("true");
  await planSection.click();
  await expect(
    template.getByLabel("Fester Wert: Observability-Leistungsklasse", {
      exact: true,
    }),
  ).toHaveValue("Observability-Medium-EU01");
  await aclSection.click();
  await expect(acl).toHaveValue("203.0.113.0/24");
  await enabled.selectOption("false");
  await template
    .getByLabel("Wertquelle: STACKIT Observability", { exact: true })
    .selectOption("input");
  await expect(planSection).toBeVisible();
  await expect(aclSection).toBeVisible();
});

test("a public template retains its local VM network independently of SNA", async ({
  page,
}, testInfo) => {
  await page.goto("/templates/standalone");
  await page
    .getByRole("button", { name: "Konfiguration erstellen", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "5 Application Landing Zone Templates",
      exact: true,
    })
    .click();
  const template = page.locator("section.project-card").first();
  const enabled = template.getByLabel("Lokales Projektnetz anlegen", {
    exact: true,
  });
  const prefix = template.getByLabel("Netzgröße (IPv4-Präfixlänge)", {
    exact: true,
  });
  await expect(enabled).not.toBeChecked();
  await expect(prefix).toHaveCount(0);
  await enabled.check();
  await prefix.fill("24");
  await expect(prefix).toHaveAccessibleDescription(/\/24 umfasst 256 Adressen/);
  await expect(template.getByLabel("STACKIT Network Area (SNA)")).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "1 Grundlagen", exact: true }).click();
  await page
    .getByRole("button", {
      name: "5 Application Landing Zone Templates",
      exact: true,
    })
    .click();
  await expect(enabled).toBeChecked();
  await expect(prefix).toHaveValue("24");
  await expect(template).toContainText("Entwurf · Public");
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await template
    .locator(".form-grid")
    .first()
    .screenshot({
      path: testInfo.outputPath("local-project-network.png"),
    });
  await enabled.uncheck();
  await expect(prefix).toHaveCount(0);
  await enabled.check();
  await expect(prefix).toHaveValue("24");
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
  const source = template.getByLabel(
    "Wertquelle: Observability-Zugriffsquellen",
    { exact: true },
  );
  await expect(source.locator('option[value="binding"]')).toBeEnabled();
  await source.selectOption("binding");
  await expect(source).toHaveValue("binding");
  await template.getByText("Bestellung testen", { exact: true }).click();
  await expect(template.locator(".parameter-preview")).toContainText(
    "Veröffentlichung und Ausführung dieser Bindung bleiben gesperrt",
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
    .getByRole("button", {
      name: "5 Application Landing Zone Templates",
      exact: true,
    })
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
    .getByRole("button", {
      name: "5 Application Landing Zone Templates",
      exact: true,
    })
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
    .getByRole("button", {
      name: "5 Application Landing Zone Templates",
      exact: true,
    })
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
