import {
  type CommonConfiguration,
  catalogue,
  createCommonConfiguration,
  editCommonInput,
  objectValue,
  readConfigurationRecord,
  recordValues,
} from "@lzc/domain";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/auth/status", (route) =>
    route.fulfill({ json: { github: false } }),
  );
  await page.route("**/api/v1/session", (route) =>
    route.fulfill({ status: 401, json: { error: "authentication_required" } }),
  );
});

test("common editor exposes all presets and preserves network assignments while changing project types", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/templates/hub-and-spoke");
  await page
    .getByRole("button", { name: "Konfiguration erstellen", exact: true })
    .click();
  await page.getByLabel("Name der Konfiguration").fill("Gemeinsamer Entwurf");
  await page.getByRole("button", { name: "5 Projekte", exact: true }).click();
  const corporate = page
    .locator("section.project-card")
    .filter({
      has: page
        .getByLabel("Projektart", { exact: true })
        .locator('option[value="corporate"]'),
    })
    .first();
  await expect(corporate.getByLabel("Projektart", { exact: true })).toHaveValue(
    "corporate",
  );
  await corporate
    .getByLabel("Secrets Manager bereitstellen", { exact: true })
    .selectOption("false");
  await corporate
    .getByLabel("Observability bereitstellen", { exact: true })
    .selectOption("true");
  await page.getByRole("button", { name: "3 Netzwerk", exact: true }).click();
  await page.getByRole("button", { name: "5 Projekte", exact: true }).click();
  await expect(
    corporate.getByLabel("Secrets Manager bereitstellen", { exact: true }),
  ).toHaveValue("false");
  await expect(
    corporate.getByLabel("Observability bereitstellen", { exact: true }),
  ).toHaveValue("true");

  await expect(
    corporate.getByLabel("Netzwerkbereich", { exact: true }),
  ).not.toHaveValue("");
  page.once("dialog", (dialog) => dialog.accept());
  await corporate
    .getByLabel("Projektart", { exact: true })
    .selectOption("public");
  await expect(corporate).toContainText("Zielordner: Landing Zones - Public");
  page.once("dialog", (dialog) => dialog.accept());
  await corporate
    .getByLabel("Projektart", { exact: true })
    .selectOption("corporate");
  await expect(
    corporate.getByLabel("Netzwerkbereich", { exact: true }),
  ).not.toHaveValue("");
  await page.getByLabel("Art des neuen Projekts").selectOption("sandbox");
  const before = await page.locator("section.project-card").count();
  await page
    .getByRole("button", { name: "Projekt hinzufügen", exact: true })
    .click();
  await expect(page.locator("section.project-card")).toHaveCount(before + 1);
  await page.getByRole("button", { name: "3 Netzwerk", exact: true }).click();
  await expect(page).toHaveURL(/\/network$/);
  await page
    .getByRole("button", { name: "Mehrere Netzwerkbereiche verwalten" })
    .click();
  await page.goBack();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(
    corporate.getByLabel("Netzwerkbereich", { exact: true }),
  ).not.toHaveValue("");
  await page.screenshot({
    path: testInfo.outputPath("common-projects.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("shared configuration saves, reopens and restores in the account workspace", async ({
  page,
}, testInfo) => {
  const id = "11111111-2222-4333-8444-555555555555";
  let document = createCommonConfiguration("hub-and-spoke-multi-region", id);
  document = editCommonInput(document, "organization_id", id);
  document = editCommonInput(document, "owner_email", "owner@stackit.cloud");
  const projects = objectValue(recordValues(document).landing_zones);
  for (const project of Object.values(projects))
    objectValue(project).owner_email = "owner@stackit.cloud";
  document = editCommonInput(document, "landing_zones", projects);
  document = editCommonInput(document, "landing_zone_namespace_services", {});
  const originalValues = recordValues(document);
  let head = "a".repeat(40);
  let saves = 0;
  const fork = {
    id: 123,
    owner: "alice",
    name: "accelerator",
    fullName: "alice/accelerator",
    defaultBranch: "main",
  };
  const session = {
    user: { id: "user-alice", login: "alice" },
    tenant: { id: "tenant-one" },
    csrfToken: "a".repeat(43),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
  await page.route("**/auth/status", (route) =>
    route.fulfill({ json: { github: true } }),
  );
  await page.route("**/api/v1/session", (route) =>
    route.fulfill({ json: session }),
  );
  await page.route("**/api/v1/github/forks?*", (route) =>
    route.fulfill({ json: { forks: [fork], nextPage: null } }),
  );
  await page.route("**/api/v1/github/repository?*", (route) =>
    route.fulfill({
      json: {
        fork,
        head,
        branch: "lzc/configurations",
        branchExists: true,
        configurations: [{ id, name: document.name }],
        unsupported: 0,
        truncated: false,
      },
    }),
  );
  await page.route("**/api/v1/github/configuration/*?*", (route) =>
    route.fulfill({ json: { document, head } }),
  );
  await page.route("**/api/v1/github/configuration", async (route) => {
    expect(route.request().headers()["x-lzc-csrf"]).toBe(session.csrfToken);
    const body = route.request().postDataJSON();
    expect(body.head).toBe(head);
    document = readConfigurationRecord(body.document) as CommonConfiguration;
    expect(document.schemaVersion).toBe(3);
    expect(recordValues(document)).toEqual(originalValues);
    expect(recordValues(document).connectivity_regions).toEqual(
      catalogue.templates.find(
        (template) => template.id === "hub-and-spoke-multi-region",
      )?.values.connectivity_regions,
    );
    saves++;
    head = "b".repeat(40);
    await route.fulfill({
      json: {
        id,
        head,
        commitUrl: "https://github.com/alice/accelerator/commit/test",
      },
    });
  });
  await page.goto("/repositories");
  await page
    .getByRole("button", { name: "alice/accelerator", exact: true })
    .click();
  await page
    .getByRole("button", { name: `${document.name} öffnen`, exact: true })
    .click();
  await page
    .getByLabel("Name der Konfiguration")
    .fill("Gemeinsamer Fork-Entwurf");
  await page.getByRole("button", { name: "5 Projekte", exact: true }).click();
  await page
    .getByRole("button", { name: "Komponente hinzufügen", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Hinzufügen: Kubernetes-Namespace-Dienste",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: "Konfiguration schließen: Kubernetes-Namespace-Dienste",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "7 Prüfen", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "tfvars herunterladen", exact: true }),
  ).toBeEnabled();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "tfvars herunterladen", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("landing-zone.tfvars");
  await page
    .getByRole("button", { name: "Im Fork speichern →", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Im Fork speichern", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("JSON und tfvars");
  expect(saves).toBe(1);
  await page
    .getByRole("button", { name: "Entwurf bearbeiten", exact: true })
    .click();
  await page.getByRole("button", { name: "3 Netzwerk", exact: true }).click();
  await page.goto("/");
  await expect(page).toHaveURL(/\/configurations\/edit\/network$/);
  await page.getByRole("button", { name: "1 Grundlagen", exact: true }).click();
  await expect(page.getByLabel("Name der Konfiguration")).toHaveValue(
    "Gemeinsamer Fork-Entwurf",
  );
  await page.getByRole("button", { name: "Zu deinen Forks" }).click();
  await page.getByRole("button", { name: /Deployment vorbereiten/ }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Erstbereitstellungsplan noch nicht verfügbar",
  );
  await page.screenshot({
    path: testInfo.outputPath("common-fork.png"),
    fullPage: true,
  });
});

test("Standalone starts Public and offers regional choices and explicit platform switches", async ({
  page,
}) => {
  await page.goto("/templates/standalone");
  await page
    .getByRole("button", { name: "Konfiguration erstellen", exact: true })
    .click();
  await expect(page.getByLabel("Region", { exact: true })).toHaveJSProperty(
    "tagName",
    "SELECT",
  );
  await page.getByLabel("Region", { exact: true }).selectOption("eu02");
  await page.getByRole("button", { name: "5 Projekte", exact: true }).click();
  await expect(
    page.getByLabel("Projektart", { exact: true }).first(),
  ).toHaveValue("public");
  await expect(
    page.getByText(
      "Corporate-Projekte benötigen einen vorhandenen Netzwerkbereich in ihrer Region.",
      { exact: false },
    ),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "4 Plattform", exact: true }).click();
  await expect(
    page.getByText("Observability stellt zentrales Monitoring bereit.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Konfigurieren: Plattform-Kubernetes",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Komponente hinzufügen", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Hinzufügen: Plattform-Kubernetes",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: "Konfigurieren: Plattform-Kubernetes",
      exact: true,
    })
    .click();
  const kubernetes = page.locator("details.feature-section").filter({
    has: page.locator(":scope > summary", {
      hasText: "Plattform-Kubernetes",
    }),
  });
  await kubernetes.locator(":scope > summary").click();
  await kubernetes
    .getByLabel("Neue Kennung für Plattform-Kubernetes", { exact: true })
    .fill("platform");
  await kubernetes
    .getByRole("button", {
      name: "Eintrag zu Plattform-Kubernetes hinzufügen",
      exact: true,
    })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await kubernetes
    .getByRole("button", { name: "Deaktivieren", exact: true })
    .click();
  await expect(
    kubernetes.getByText("Deaktiviert", { exact: true }),
  ).toBeVisible();
  await expect(
    kubernetes.getByRole("button", { name: "Deaktivieren", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "3 Netzwerk", exact: true }).click();
  const regions = page.getByLabel("Weitere Connectivity-Region", {
    exact: true,
  });
  await expect(regions).toHaveJSProperty("tagName", "SELECT");
  await regions.selectOption("eu02");
  await page
    .getByRole("button", { name: "Region hinzufügen", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Connectivity eu02", exact: true }),
  ).toBeVisible();
  await expect(regions.locator('option[value="eu02"]')).toHaveCount(0);
});

test("regional Connectivity offers a guided VPN draft with both tunnels and missing-input feedback", async ({
  page,
}, testInfo) => {
  await page.goto("/templates/standalone");
  await page
    .getByRole("button", { name: "Konfiguration erstellen", exact: true })
    .click();
  await page.getByRole("button", { name: "3 Netzwerk", exact: true }).click();
  await page
    .getByLabel("Weitere Connectivity-Region", { exact: true })
    .selectOption("eu01");
  await page
    .getByRole("button", { name: "Region hinzufügen", exact: true })
    .click();
  const region = page.getByRole("region", {
    name: "Connectivity eu01",
    exact: true,
  });
  await region
    .getByRole("button", { name: "Komponente hinzufügen in eu01", exact: true })
    .click();
  await region
    .getByRole("button", { name: "Hinzufügen: STACKIT VPN", exact: true })
    .click();
  await region
    .getByRole("button", { name: "STACKIT VPN hinzufügen", exact: true })
    .click();
  await expect(
    region.getByText("Der Accelerator erstellt je SNA dieser Region", {
      exact: false,
    }),
  ).toBeVisible();
  await region
    .getByRole("button", { name: "3. Verbindungen und Tunnel", exact: true })
    .click();
  await region.getByLabel("Kennung der neuen VPN-Verbindung").fill("office");
  await region
    .getByRole("button", { name: "VPN-Verbindung hinzufügen", exact: true })
    .click();
  const peers = region.getByLabel("Öffentliche IP-Adresse der Gegenstelle", {
    exact: true,
  });
  await expect(peers).toHaveCount(2);
  await peers.nth(0).fill("198.51.100.1");
  await peers.nth(1).fill("198.51.100.2");
  await region
    .getByRole("button", { name: "4. Zusammenfassung", exact: true })
    .click();
  await expect(
    region.getByText("Verfügbarkeitszone", { exact: false }).first(),
  ).toBeVisible();
  await region
    .getByRole("button", { name: "3. Verbindungen und Tunnel", exact: true })
    .click();
  await expect(peers.nth(0)).toHaveValue("198.51.100.1");
  await expect(peers.nth(1)).toHaveValue("198.51.100.2");
  await expect(region.locator('input[type="password"]')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("regional-vpn-editor.png"),
    fullPage: true,
  });
});
