import {
  mockEmptyApplicationLists,
  openConfigurationStep,
  openTemplateDrafts,
} from "./editor-navigation";
import { expect, test } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockEmptyApplicationLists(page);
});

test("new templates separate cloud project access from requester identity and retain the explicit owner option", async ({
  page,
}) => {
  await page.goto("/templates/standalone");
  await page
    .getByRole("button", { name: "Konfiguration erstellen", exact: true })
    .click();
  await openTemplateDrafts(page);
  await page
    .getByLabel("Template-Kennung", { exact: true })
    .fill("access-test");
  await page
    .getByRole("button", { name: "Template hinzufügen", exact: true })
    .click();
  const template = page.locator("section.project-card").filter({
    has: page.getByRole("group", {
      name: "Application-Rechteprofil",
      exact: true,
    }),
  });
  const profile = template.getByRole("group", {
    name: "Application-Rechteprofil",
    exact: true,
  });
  await expect(
    profile.getByLabel("Projektberechtigungen", { exact: true }),
  ).toHaveValue("granular");
  const owner = profile.getByLabel(
    "Initialer Projekt-Owner (zentraler Benutzer oder Service Account)",
    { exact: true },
  );
  await owner.clear();
  await owner.pressSequentially("central@example.test");
  await expect(owner).toHaveValue("central@example.test");
  await expect(profile).toContainText("kein Nachweis der effektiven Rechte");
  await expect(profile).toContainText("Zukünftiger Besteller");
  await expect(profile).toContainText("Plattform-Service-Account");
  await expect(profile).not.toContainText("Application-Team");
  await expect(profile).not.toContainText("Workload-Automation");
  const requester = profile.locator(":scope > details").nth(0);
  const automation = profile.locator(":scope > details").nth(1);
  await requester.locator(":scope > summary").click();
  await expect(requester.locator('input[type="checkbox"]')).toHaveCount(144);
  await expect(requester.locator('input[type="checkbox"]:checked')).toHaveCount(
    144,
  );
  await expect(
    automation.locator('input[type="checkbox"]:checked'),
  ).toHaveCount(144);
  const storage = requester.locator("details").filter({
    has: page.locator("summary").filter({ hasText: /^Object Storage ·/ }),
  });
  await storage.locator(":scope > summary").click();
  await storage
    .getByRole("checkbox", {
      name: "object-storage.bucket.create",
      exact: true,
    })
    .uncheck();
  await expect(requester.locator('input[type="checkbox"]:checked')).toHaveCount(
    143,
  );
  await expect(
    automation.locator('input[type="checkbox"]:checked'),
  ).toHaveCount(144);
  await profile
    .getByLabel("Berechtigungen durchsuchen", { exact: true })
    .fill(".bucket.");
  await storage
    .getByRole("button", { name: "Alle angezeigten auswählen", exact: true })
    .click();
  await expect(storage.getByRole("checkbox", { checked: true })).toHaveCount(4);
  await storage
    .getByRole("button", { name: "Angezeigte abwählen", exact: true })
    .click();
  await expect(storage.getByRole("checkbox", { checked: true })).toHaveCount(0);
  await profile
    .getByLabel("Berechtigungen durchsuchen", { exact: true })
    .clear();
  await expect(requester.locator('input[type="checkbox"]:checked')).toHaveCount(
    140,
  );
  await expect(
    storage.getByRole("checkbox", {
      name: "object-storage.access-key.create",
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    automation.locator('input[type="checkbox"]:checked'),
  ).toHaveCount(144);
  await storage
    .getByRole("button", { name: "Alle angezeigten auswählen", exact: true })
    .click();
  await expect(requester.locator('input[type="checkbox"]:checked')).toHaveCount(
    144,
  );
  await profile
    .getByLabel("Berechtigungen durchsuchen", { exact: true })
    .fill("Virtuelle Maschinen");
  await expect(requester.locator("details")).toHaveCount(1);
  await expect(requester.locator('input[type="checkbox"]')).not.toHaveCount(0);

  await expect(
    template.getByLabel(
      "Wertquelle: Projektrollen der verantwortlichen Person",
      { exact: true },
    ),
  ).toHaveCount(0);
  await profile
    .getByLabel("Berechtigungen durchsuchen", { exact: true })
    .fill("iam.");
  await expect(profile.locator('input[type="checkbox"]')).toHaveCount(0);
  await profile
    .getByLabel("Projektberechtigungen", { exact: true })
    .selectOption("owner");
  await expect(profile).toContainText(
    "einschließlich IAM und Projektverwaltung",
  );
  await expect(owner).toHaveCount(0);
});

test("MVP Observability has no ACL editor or required order input", async ({
  page,
}) => {
  await page.goto("/templates/standalone");
  await page
    .getByRole("button", { name: "Konfiguration erstellen", exact: true })
    .click();
  await openTemplateDrafts(page);
  const template = page.locator("section.project-card").first();
  await template
    .getByText("STACKIT Observability · Fest vorgegeben", { exact: true })
    .click();
  await template
    .getByLabel("Fester Wert: STACKIT Observability", { exact: true })
    .selectOption("true");
  await expect(template.getByText(/Observability-Zugriffsquellen/)).toHaveCount(
    0,
  );
  await expect(
    template.getByLabel("Wertquelle: Observability-Zugriffsquellen"),
  ).toHaveCount(0);
  await template.getByText("Bestellung testen", { exact: true }).click();
  await expect(template.locator(".parameter-preview")).toContainText(
    "Eingeschaltet",
  );
  await expect(template.locator(".parameter-preview")).not.toContainText(
    "Observability-Zugriffsquellen",
  );
  await expect(template.locator(".parameter-preview")).not.toContainText(
    "Pflichtangabe fehlt",
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
  await openTemplateDrafts(page);
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
  await expect(aclSection).toHaveCount(0);
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
  await expect(aclSection).toHaveCount(0);
  await enabled.selectOption("false");
  await template
    .getByLabel("Wertquelle: STACKIT Observability", { exact: true })
    .selectOption("input");
  await expect(planSection).toBeVisible();
  await expect(aclSection).toHaveCount(0);
});

test("a public template retains its local VM network independently of SNA", async ({
  page,
}, testInfo) => {
  await page.goto("/templates/standalone");
  await page
    .getByRole("button", { name: "Konfiguration erstellen", exact: true })
    .click();
  await openTemplateDrafts(page);
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
  await openConfigurationStep(page, "Grundlagen");
  await openTemplateDrafts(page);
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
  await expect(
    template.getByLabel("Wertquelle: Observability-Zugriffsquellen"),
  ).toHaveCount(0);
  await template.getByText("Bestellung testen", { exact: true }).click();
  await expect(template.locator(".parameter-preview")).not.toContainText(
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
  await openTemplateDrafts(page);
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
  await openConfigurationStep(page, "Grundlagen");
  await openTemplateDrafts(page);
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
test("corporate Observability does not require an ACL network relationship", async ({
  page,
}) => {
  await page.goto("/templates/hub-and-spoke");
  await page
    .getByRole("button", { name: "Konfiguration erstellen", exact: true })
    .click();
  await openTemplateDrafts(page);
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
  await expect(
    template.getByLabel("Wertquelle: Observability-Zugriffsquellen"),
  ).toHaveCount(0);
  await template.getByText("Bestellung testen", { exact: true }).click();
  await expect(template.locator(".parameter-preview")).not.toContainText(
    "Veröffentlichung und Ausführung dieser Bindung bleiben gesperrt",
  );
  await expect(template.locator(".parameter-preview")).not.toContainText(
    "Wird aus der Ressourcenverknüpfung ermittelt",
  );
  await expect(template.locator(".parameter-preview")).toContainText(
    "Eingeschaltet",
  );
});
