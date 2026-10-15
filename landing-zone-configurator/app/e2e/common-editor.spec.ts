import {
  type CommonConfiguration,
  catalogue,
  createCommonConfiguration,
  createEditorConfiguration,
  editCommonInput,
  objectValue,
  readConfigurationRecord,
  recordValues,
} from "@lzc/domain";
import { expect, test } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.route("**/auth/status", (route) =>
    route.fulfill({ json: { github: false } }),
  );
  await page.route("**/api/v1/session", (route) =>
    route.fulfill({ status: 401, json: { error: "authentication_required" } }),
  );
});

test("platform editor defines project templates without concrete application projects", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/templates/hub-and-spoke");
  await page
    .getByRole("button", { name: "Konfiguration erstellen", exact: true })
    .click();
  await page
    .getByLabel("Name der Konfiguration")
    .fill("Plattform mit Templates");
  await page
    .getByRole("button", {
      name: "5 Template-Entwürfe",
      exact: true,
    })
    .click();
  const corporate = page
    .locator("section.project-card")
    .filter({ hasText: /Entwurf · Corporate/ })
    .first();
  await expect(corporate).toBeVisible();
  await expect(page.getByLabel("Projektname", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Verantwortlich", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Projekt hinzufügen", exact: true }),
  ).toHaveCount(0);
  await corporate
    .getByText("STACKIT Secrets Manager · Fest vorgegeben", { exact: true })
    .click();
  await corporate
    .getByLabel("Fester Wert: STACKIT Secrets Manager", { exact: true })
    .selectOption("false");
  await corporate
    .getByText("STACKIT Observability · Fest vorgegeben", { exact: true })
    .click();
  await corporate
    .getByLabel("Fester Wert: STACKIT Observability", { exact: true })
    .selectOption("true");
  await page.getByRole("button", { name: "3 Netzwerk", exact: true }).click();
  await page
    .getByRole("button", {
      name: "5 Template-Entwürfe",
      exact: true,
    })
    .click();
  await expect(
    corporate.getByLabel("Fester Wert: STACKIT Secrets Manager", {
      exact: true,
    }),
  ).toHaveValue("false");
  await expect(
    corporate.getByLabel("Fester Wert: STACKIT Observability", {
      exact: true,
    }),
  ).toHaveValue("true");
  await expect(
    corporate.getByLabel("STACKIT Network Area (SNA)", { exact: true }),
  ).not.toHaveValue("");
  await page
    .getByLabel("Art des Application Landing Zone Templates")
    .selectOption("sandbox");
  await page.getByLabel("Template-Kennung", { exact: true }).fill("experiment");
  const overview = page.getByRole("region", {
    name: "Template-Übersicht",
    exact: true,
  });
  const before = await overview.getByRole("button").count();
  await page
    .getByRole("button", { name: "Template hinzufügen", exact: true })
    .click();
  await expect(overview.getByRole("button")).toHaveCount(before + 1);
  await expect(
    overview.getByRole("button", {
      name: "Template auswählen: Neue Sandbox-Vorlage (experiment)",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  const details = page.locator("#project-template-details");
  await expect(details).toHaveCount(1);
  await expect(
    details.getByRole("heading", { name: "Neue Sandbox-Vorlage", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", {
      name: "Application Landing Zone Template-Entwürfe",
      exact: true,
    }),
  ).toContainText("Neue Sandbox-Vorlage");
  await expect(
    page.locator(".topology").first().locator(".tree-children").first(),
  ).not.toContainText("External API Gateway");
  await page.getByRole("button", { name: "3 Netzwerk", exact: true }).click();
  await page.goBack();
  await expect(page).toHaveURL(/\/projects$/);
  await page.screenshot({
    path: testInfo.outputPath("project-templates.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("platform structure shows components with only name and type in their owning project", async ({
  page,
}, testInfo) => {
  const id = "11111111-2222-4333-8444-555555555556";
  let draft = createEditorConfiguration("hub-and-spoke", id);
  draft = editCommonInput(draft, "company_code", "acme");
  draft = editCommonInput(draft, "company_name", "Example Company");
  draft = editCommonInput(draft, "observability", {});
  draft = editCommonInput(draft, "audit_logs", { retention_days: 90 });
  draft = editCommonInput(draft, "devops", { git_flavor: "synthetic-git" });
  const area = { ranges: ["10.0.0.0/16"], transfer_network: "100.64.0.0/24" };
  const firewall = {
    name: "Corporate edge",
    zone: "eu01-1",
    flavor: "g2i.2",
    lan_network_range: "10.0.1.0/24",
    wan_network_range: "192.168.0.0/24",
    ha: { backup_zone: "eu01-2", backup_name: "Corporate standby" },
  };
  draft = editCommonInput(draft, "connectivity_regions", {
    eu01: {
      network_areas: {
        default: { ...area, name: "Corporate network" },
        dmz: area,
      },
      firewalls: {
        default: firewall,
        dmz: { ...firewall, name: "DMZ edge", ha: null },
      },
      dns_zones: {
        corporate: { dns_name: "corporate.example", name: "Corporate DNS" },
        dmz: { dns_name: "dmz.example", network_area_key: "dmz" },
      },
      vpn: {
        display_name: "Office VPN",
        plan_id: "synthetic-vpn-plan",
        availability_zones: { tunnel1: "eu01-1", tunnel2: "eu01-2" },
      },
    },
    eu02: { network_areas: { default: area } },
  });
  draft = editCommonInput(draft, "platform_kubernetes", {
    primary: {
      region: "eu01",
      cluster: { name: "platform-cluster" },
      network: { sna_enabled: true },
      dns: { zones: ["platform.example"] },
      observability: { name: "Cluster monitoring" },
    },
  });
  let saves = 0;
  await page.route("**/auth/status", (route) =>
    route.fulfill({
      json: { github: false, stackit: true, primary: "stackit" },
    }),
  );
  await page.route("**/api/v1/session", (route) =>
    route.fulfill({
      json: {
        user: { id: "alice-id", login: "alice" },
        csrfToken: "csrf-test",
        tenant: { id: "personal", kind: "personal", roles: [] },
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    }),
  );
  await page.route("**/api/v1/configurations", (route) =>
    route.fulfill({
      json: {
        configurations: [
          {
            id,
            name: draft.name,
            revision: 1,
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    }),
  );
  await page.route(`**/api/v1/configurations/${id}`, (route) => {
    if (route.request().method() === "PUT") saves++;
    return route.fulfill({
      json: { configuration: { id, name: draft.name, revision: 1, draft } },
    });
  });
  await page.goto("/configurations");
  await page
    .getByRole("button", {
      name: `Konfiguration öffnen: ${draft.name}`,
      exact: true,
    })
    .click();
  const tree = page.locator(".topology").first();
  const management = tree
    .locator(".tree-project")
    .filter({ hasText: "acme-pltfm-mgmt-prod" });
  await expect(management.getByRole("listitem")).toHaveCount(8);
  await expect(management).toContainText("Service Account");
  await expect(management).toContainText("STACKIT Secrets Manager");
  await expect(management).toContainText("STACKIT Logs");
  await expect(management).toContainText("Telemetry Router");
  const corporate = tree
    .locator(".tree-project")
    .filter({ hasText: "Konnektivität · eu01 · default" });
  await expect(corporate).toContainText("Corporate network");
  await expect(corporate).toContainText("Corporate edge");
  await expect(corporate).toContainText("Corporate standby");
  await expect(corporate).toContainText("Corporate DNS");
  await expect(corporate).toContainText("Office VPN");
  await expect(corporate).not.toContainText("dmz.example");
  const dmz = tree
    .locator(".tree-project")
    .filter({ hasText: "Konnektivität · eu01 · dmz" });
  await expect(dmz).toContainText("dmz.example");
  await expect(dmz).not.toContainText("Corporate DNS");
  const eu02 = tree
    .locator(".tree-project")
    .filter({ hasText: "Konnektivität · eu02 · default" });
  await expect(eu02.getByRole("listitem")).toHaveCount(1);
  const kubernetes = tree
    .locator(".tree-project")
    .filter({ hasText: "Plattform-Kubernetes" });
  await expect(kubernetes).toContainText("platform-cluster");
  await expect(kubernetes).toContainText("platform-cluster-sna");
  await expect(kubernetes).toContainText("platform.example");
  await expect(kubernetes).toContainText("Cluster monitoring");
  await expect(
    tree.locator(".tree-project").filter({ hasText: "DevOps" }),
  ).toContainText("example-company");
  for (const item of await tree.locator(".project-components li").all())
    await expect(item.locator(":scope > *")).toHaveCount(2);
  const components = (
    await tree.locator(".project-components").allTextContents()
  ).join(" ");
  expect(components).not.toContain("10.0.0.0");
  expect(components).not.toContain("synthetic-vpn-plan");
  expect(components).not.toContain("retention_days");
  await page.getByLabel("Unternehmenskürzel", { exact: true }).fill("changed");
  await expect(tree).toContainText("changed-pltfm-mgmt-prod-default");
  await expect(tree).not.toContainText("acme-pltfm-mgmt-prod-default");
  await page.getByLabel("Sprache", { exact: true }).selectOption("en");
  await expect(tree).toContainText("Corporate network");
  await expect(tree).toContainText("Object storage bucket");
  await expect(tree).toContainText("DNS zone");
  await expect(tree).toContainText("Corporate DNS");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await tree.screenshot({
    path: testInfo.outputPath("platform-components.png"),
  });
  expect(saves).toBe(0);
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
  let savedPlatform: CommonConfiguration | null = null;
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
  await page.route("**/api/v1/configurations", (route) => {
    expect(route.request().method()).toBe("GET");
    return route.fulfill({ json: { configurations: [] } });
  });
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
    if (body.document.projectTemplates !== undefined) {
      expect(body.mode).toBe("create");
      savedPlatform = readConfigurationRecord(
        body.document,
      ) as CommonConfiguration;
      expect(savedPlatform.id).not.toBe(document.id);
      expect(savedPlatform.projectTemplates?.length).toBeGreaterThan(0);
      expect(recordValues(savedPlatform).landing_zones).toEqual({});
      expect(recordValues(savedPlatform).sandboxes).toEqual([]);
      expect(recordValues(document)).toEqual(originalValues);
      return route.fulfill({
        json: {
          id: savedPlatform.id,
          head: "c".repeat(40),
          commitUrl:
            "https://github.com/alice/accelerator/commit/platform-copy",
        },
      });
    }
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
  await page
    .getByRole("button", { name: "5 Projekte (Bestand)", exact: true })
    .click();
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
    .getByRole("button", { name: "Konfiguration speichern →", exact: true })
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
  await page.goto("/configurations/edit/network");
  await expect(page).toHaveURL(/\/configurations\/edit\/network$/);
  await page.getByRole("button", { name: "1 Grundlagen", exact: true }).click();
  await expect(page.getByLabel("Name der Konfiguration")).toHaveValue(
    "Gemeinsamer Fork-Entwurf",
  );
  await page
    .getByRole("button", { name: "Konfigurationen", exact: true })
    .click();
  await page.getByRole("button", { name: /Deployment vorbereiten/ }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Erstbereitstellungsplan noch nicht verfügbar",
  );
  await page.screenshot({
    path: testInfo.outputPath("common-fork.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Entwurf bearbeiten", exact: true })
    .click();
  await page
    .getByRole("button", { name: "5 Projekte (Bestand)", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", {
      name: "Als neue Plattformkonfiguration übernehmen",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Template-Entwürfe",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Projektname", { exact: true })).toHaveCount(0);
  await page.getByLabel("Name des Templates").first().fill("Team-Anwendungen");
  const firstTemplate = page.locator("section.project-card").first();
  await firstTemplate
    .getByText("Umgebung / Stage · Fest vorgegeben", { exact: true })
    .click();
  await firstTemplate
    .getByLabel("Wertquelle: Umgebung / Stage")
    .selectOption("input");
  await firstTemplate
    .getByLabel("Vorauswahl: Umgebung / Stage")
    .selectOption("prod");
  await page.getByRole("button", { name: "7 Prüfen", exact: true }).click();
  await page
    .getByRole("button", { name: "Konfiguration speichern →", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Im Fork speichern", exact: true })
    .click();
  await expect
    .poll(() => savedPlatform?.projectTemplates?.[0]?.name)
    .toBe("Team-Anwendungen");
  await expect
    .poll(
      () => savedPlatform?.projectTemplates?.[0]?.parameterPolicy?.fields.env,
    )
    .toMatchObject({ source: "input", default: "prod" });
  await page.reload();
  await page
    .getByRole("button", { name: "Entwurf bearbeiten", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "5 Template-Entwürfe",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Name des Templates").first()).toHaveValue(
    "Team-Anwendungen",
  );
  await page
    .locator("section.project-card")
    .first()
    .getByText("Umgebung / Stage · Bei Bestellung auswählbar", { exact: true })
    .click();
  await expect(
    page.getByLabel("Vorauswahl: Umgebung / Stage").first(),
  ).toHaveValue("prod");
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
  await page
    .getByRole("button", {
      name: "5 Template-Entwürfe",
      exact: true,
    })
    .click();
  await expect(page.locator("section.project-card").first()).toContainText(
    "Entwurf · Public",
  );
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
