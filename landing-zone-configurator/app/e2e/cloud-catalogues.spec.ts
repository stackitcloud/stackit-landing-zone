import { expect, test } from "./fixtures";

for (const kind of ["personal", "organisation"]) {
  test(`automatic technical catalogues require no additional editor setup in ${kind}`, async ({
    page,
  }, testInfo) => {
    const regions: string[] = [];
    const session = {
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        login: "engineer@example.test",
      },
      tenant: {
        id: "22222222-2222-4222-8222-222222222222",
        kind,
        roles: ["platform-engineer"],
      },
      csrfToken: "c".repeat(43),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };
    await page.route("**/auth/status", (route) =>
      route.fulfill({
        json: { github: false, stackit: true, primary: "stackit" },
      }),
    );
    await page.route("**/auth/github/status", (route) =>
      route.fulfill({ json: { connected: false } }),
    );
    await page.route("**/api/v1/session", (route) =>
      route.fulfill({ json: session }),
    );
    await page.route("**/api/v1/cloud-catalogues/automatic", (route) => {
      const input = route.request().postDataJSON();
      expect(Object.keys(input)).toEqual(["region"]);
      expect(route.request().headers()["x-lzc-tenant"]).toBe(session.tenant.id);
      expect(route.request().headers()["x-lzc-csrf"]).toBe(session.csrfToken);
      regions.push(input.region);
      const missing = { status: "unavailable", options: [] };
      return route.fulfill({
        json: {
          region: input.region,
          projectId: "33333333-3333-4333-8333-333333333333",
          fetchedAt: new Date().toISOString(),
          gitFlavors: {
            status: "available",
            options: [{ value: "automatic-git", label: "Automatic Git" }],
          },
          vpnPlans: missing,
          kubernetesVersions: {
            status: "available",
            options: [{ value: "1.35.1", label: "1.35.1" }],
          },
          machineTypes: {
            status: "available",
            options: [{ value: "g3i.4", label: "g3i.4" }],
          },
          volumeTypes: missing,
          availabilityZones: {
            status: "available",
            options: [
              { value: `${input.region}-1`, label: `${input.region}-1` },
            ],
          },
          observabilityPlans: {
            status: "available",
            options: [
              "Observability-Monitoring-Medium-EU01",
              "Observability-Metrics-Endpoint-100k-EU01",
              "Observability-Frontend-Starter-EU01",
            ].map((value) => ({ value, label: value })),
          },
        },
      });
    });
    await page.goto("/templates/standalone");
    await expect.poll(() => [...regions].sort()).toEqual(["eu01", "eu02"]);
    await page
      .getByRole("button", { name: "Konfiguration erstellen", exact: true })
      .click();
    await expect.poll(() => [...regions].sort()).toEqual(["eu01", "eu02"]);
    await expect(page.getByLabel("Katalogzugang")).toHaveCount(0);
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: /STACKIT-Produktkataloge geladen/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: /Nicht verfügbar:.*VPN/ }),
    ).toBeVisible();
    await expect(
      page.getByPlaceholder("UUID eines vorhandenen STACKIT-Projekts"),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "4 Plattform", exact: true })
      .click();
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
    await expect(
      page.getByRole("option", { name: "Automatic Git", exact: true }).first(),
    ).toBeAttached();
    await page.screenshot({
      path: testInfo.outputPath("automatic-catalogues.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", {
        name: "5 Template-Entwürfe",
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
      .getByText("Observability-Leistungsklasse · Fest vorgegeben", {
        exact: true,
      })
      .click();
    await template
      .getByLabel("Wertquelle: Observability-Leistungsklasse", { exact: true })
      .selectOption("input");
    const allowed = template.getByRole("group", {
      name: "Erlaubte Werte: Observability-Leistungsklasse",
      exact: true,
    });
    await expect(allowed.getByRole("checkbox")).toHaveCount(4);
    await expect(allowed).toContainText("nicht im geladenen Katalog");
    expect(
      await allowed
        .locator(".parameter-choice-list")
        .evaluate((element) => getComputedStyle(element).display),
    ).toBe("grid");
    expect(
      await allowed
        .locator(".parameter-choice")
        .evaluateAll((elements) =>
          elements.every(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
        ),
    ).toBe(true);
    await allowed.screenshot({
      path: testInfo.outputPath("observability-choice-grid.png"),
    });
    if (kind === "organisation") {
      await page.route("**/api/v1/credentials", (route) =>
        route.fulfill({ json: { profiles: [] } }),
      );
      await page.getByRole("button", { name: "Zugänge", exact: true }).click();
      await expect(
        page.getByRole("heading", {
          name: "Deployment-Zugänge",
          exact: true,
          level: 2,
        }),
      ).toBeVisible();
      await expect(
        page.getByLabel("Service-Account-Schlüssel (JSON)"),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Zugänge aktualisieren", exact: true })
        .click();
      await expect
        .poll(() => [...regions].sort())
        .toEqual(["eu01", "eu01", "eu02", "eu02"]);
      await page
        .getByRole("button", { name: "Konfigurationen", exact: true })
        .click();
      await page.getByRole("button", { name: /weiterbearbeiten$/ }).click();
      await page
        .getByRole("button", { name: "4 Plattform", exact: true })
        .click();
      await page
        .locator("summary")
        .filter({ hasText: /^Git-Service/ })
        .click();
      await expect(
        page
          .getByRole("option", { name: "Automatic Git", exact: true })
          .first(),
      ).toBeAttached();
    }
  });
}

test("product choices preserve imported values and restore manual fields when catalogue access fails", async ({
  page,
}, testInfo) => {
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
        kubernetesVersions: {
          status: "available",
          options: [{ value: "1.35.1", label: "1.35.1" }],
        },
        machineTypes: {
          status: "available",
          options: [{ value: "g3i.4", label: "g3i.4" }],
        },
        machineImages: {
          status: "available",
          options: [{ value: "flatcar", label: "flatcar" }],
        },
        volumeTypes: {
          status: "available",
          options: [{ value: "storage_premium_perf2", label: "Premium" }],
        },
        availabilityZones: {
          status: "available",
          options: [{ value: "eu01-1", label: "eu01-1" }],
        },
        observabilityPlans: {
          status: "available",
          options: [
            {
              value: "Observability-Starter-EU01",
              label: "Observability-Starter-EU01",
            },
            {
              value: "Observability-Medium-EU01",
              label: "Observability Medium",
            },
          ],
        },
        projectRoles: {
          status: "available",
          options: [
            { value: "viewer", label: "viewer" },
            ...Array.from({ length: 150 }, (_, index) => ({
              value: `service-${index}.reader`,
              label: `service-${index}.reader`,
            })),
          ],
        },
        projectPermissions: {
          status: "available",
          options: [{ value: "project.read", label: "project.read" }],
        },
        projectRoleTemplates: [
          {
            name: "viewer",
            description: "Read only",
            permissions: ["project.read"],
          },
        ],
        bastionMachineTypes: {
          status: "available",
          options: [{ value: "g2i.1", label: "g2i.1" }],
        },
        bastionImages: {
          status: "available",
          options: [
            {
              value: "44444444-4444-4444-8444-444444444444",
              label: "Ubuntu 24.04",
            },
          ],
        },
        bastionAvailabilityZones: {
          status: "available",
          options: [{ value: "eu01-1", label: "eu01-1" }],
        },
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
  await page
    .locator("summary")
    .filter({ hasText: /^Plattform-Kubernetes/ })
    .click();
  await page
    .getByLabel("Neue Kennung für Plattform-Kubernetes", { exact: true })
    .fill("test");
  await page
    .getByRole("button", {
      name: "Eintrag zu Plattform-Kubernetes hinzufügen",
      exact: true,
    })
    .click();
  await page
    .locator("summary")
    .filter({ hasText: /^test$/ })
    .click();
  await page.getByLabel("Region", { exact: true }).selectOption("eu01");
  const cluster = page.locator("details").filter({
    has: page.locator(":scope > summary", { hasText: /^Cluster$/ }),
  });
  await cluster.locator(":scope > summary").click();
  await cluster
    .getByRole("button", {
      name: "Eigene Einstellung: Mindestversion von Kubernetes",
      exact: true,
    })
    .click();
  await cluster
    .getByLabel("Mindestversion von Kubernetes", { exact: true })
    .selectOption("1.35.1");
  await cluster
    .getByRole("button", { name: "Konfigurieren: Knotengruppen", exact: true })
    .click();
  await cluster
    .locator("summary")
    .filter({ hasText: /^Knotengruppen/ })
    .click();
  await cluster
    .getByRole("button", {
      name: "Eintrag zu Knotengruppen hinzufügen",
      exact: true,
    })
    .click();
  await cluster
    .locator("summary")
    .filter({ hasText: /^Knotengruppen 1$/ })
    .click();
  await cluster
    .getByLabel("Maschinentyp", { exact: true })
    .selectOption("g3i.4");
  await cluster
    .locator("summary")
    .filter({ hasText: /^Verfügbarkeitszonen/ })
    .click();
  await cluster
    .getByRole("button", {
      name: "Eintrag zu Verfügbarkeitszonen hinzufügen",
      exact: true,
    })
    .click();
  await cluster
    .getByLabel("Verfügbarkeitszonen 1", { exact: true })
    .selectOption("eu01-1");
  await cluster
    .getByRole("button", {
      name: "Eigene Einstellung: Speichertyp",
      exact: true,
    })
    .click();
  await cluster
    .getByLabel("Speichertyp", { exact: true })
    .selectOption("storage_premium_perf2");
  await cluster
    .getByRole("button", {
      name: "Eigene Einstellung: Betriebssystem",
      exact: true,
    })
    .click();
  await cluster
    .getByLabel("Betriebssystem", { exact: true })
    .selectOption("flatcar");
  await expect(
    cluster.getByLabel("Betriebssystem", { exact: true }),
  ).toHaveValue("flatcar");
  await expect(
    cluster.getByLabel("Mindestversion von Kubernetes", { exact: true }),
  ).toHaveValue("1.35.1");
  await expect(
    cluster.getByLabel("Verfügbarkeitszonen 1", { exact: true }),
  ).toHaveValue("eu01-1");
  await page
    .getByRole("button", {
      name: "Konfigurieren: Diagnose-Bastion für das private Cluster-Netz",
      exact: true,
    })
    .click();
  const bastion = page.locator("details").filter({
    has: page.locator(":scope > summary", { hasText: /^Diagnose-Bastion/ }),
  });
  await bastion.locator(":scope > summary").click();
  for (const label of [
    "Maschinentyp",
    "Systemabbild-ID",
    "Verfügbarkeitszone",
  ]) {
    await bastion
      .getByRole("button", {
        name: `Eigene Einstellung: ${label}`,
        exact: true,
      })
      .click();
    await expect(bastion.getByLabel(label, { exact: true })).toHaveJSProperty(
      "tagName",
      "SELECT",
    );
  }
  await bastion
    .getByLabel("Maschinentyp", { exact: true })
    .selectOption("g2i.1");
  await bastion
    .getByLabel("Systemabbild-ID", { exact: true })
    .selectOption("44444444-4444-4444-8444-444444444444");
  await bastion
    .getByLabel("Verfügbarkeitszone", { exact: true })
    .selectOption("eu01-1");
  await page
    .getByRole("button", {
      name: "Konfigurieren: Cluster-Monitoring · STACKIT Observability",
      exact: true,
    })
    .click();
  const monitoring = page.locator("details").filter({
    has: page.locator(":scope > summary", { hasText: /^Cluster-Monitoring/ }),
  });
  await monitoring.locator(":scope > summary").click();
  await monitoring
    .getByRole("button", {
      name: "Eigene Einstellung: Dienst-Leistungsklasse",
      exact: true,
    })
    .click();
  await expect(
    monitoring.getByLabel("Dienst-Leistungsklasse", { exact: true }),
  ).toHaveJSProperty("tagName", "SELECT");
  await monitoring
    .getByLabel("Dienst-Leistungsklasse", { exact: true })
    .selectOption("Observability-Starter-EU01");
  await page
    .getByRole("button", {
      name: "5 Template-Entwürfe",
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
    .getByText("Observability-Leistungsklasse · Fest vorgegeben", {
      exact: true,
    })
    .click();
  await template
    .getByLabel("Wertquelle: Observability-Leistungsklasse", { exact: true })
    .selectOption("input");
  const allowed = template.getByRole("group", {
    name: "Erlaubte Werte: Observability-Leistungsklasse",
    exact: true,
  });
  await expect(
    allowed.getByLabel("Observability Medium", { exact: true }),
  ).toBeChecked();
  await allowed.getByLabel("Observability Medium", { exact: true }).uncheck();
  await expect(
    allowed.getByLabel("Observability Medium", { exact: true }),
  ).not.toBeChecked();
  await template
    .getByText("Weitere Template-Einstellungen", { exact: true })
    .click();
  await template
    .getByText("Projektdienste und Rechte", { exact: true })
    .click();
  const configureRoles = template.getByRole("button", {
    name: "Konfigurieren: Eigene Projektrollen",
    exact: true,
  });
  if (await configureRoles.count()) await configureRoles.click();
  const roles = template.locator("details").filter({
    has: page.locator(":scope > summary", {
      hasText: /^Eigene Projektrollen ·/,
    }),
  });
  await roles.locator(":scope > summary").click();
  await roles
    .getByLabel("STACKIT-Rollenvorlage", { exact: true })
    .selectOption("viewer");
  await roles.getByText("Eigene Projektrollen 1", { exact: true }).click();
  await expect(roles.getByLabel("Name", { exact: true })).toHaveValue(
    "application-viewer",
  );
  await roles.getByText("Berechtigungen · 1", { exact: true }).click();
  await expect(
    roles.getByLabel("Berechtigungen 1", { exact: true }),
  ).toHaveJSProperty("tagName", "SELECT");
  await expect(
    roles.getByLabel("Berechtigungen 1", { exact: true }),
  ).toHaveValue("project.read");
  await template
    .getByText("Projektrollen der verantwortlichen Person · Fest vorgegeben", {
      exact: true,
    })
    .click();
  await template
    .getByLabel("Wertquelle: Projektrollen der verantwortlichen Person", {
      exact: true,
    })
    .selectOption("context");
  await template.getByLabel("application-viewer", { exact: true }).check();
  const roleList = await template.locator(".role-list").evaluate((element) => ({
    height: element.clientHeight,
    scrollHeight: element.scrollHeight,
    width: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(roleList.height).toBeLessThanOrEqual(320);
  expect(roleList.scrollHeight).toBeGreaterThan(roleList.height);
  expect(roleList.scrollWidth).toBeLessThanOrEqual(roleList.width);
  await template
    .locator(".role-options")
    .screenshot({ path: testInfo.outputPath("role-picker.png") });
  await template
    .getByLabel("Projektrollen durchsuchen", { exact: true })
    .fill("application");
  await expect(template.locator(".role-list input")).toHaveCount(1);
  await template
    .getByLabel("Projektrollen durchsuchen", { exact: true })
    .fill("");
  await template.getByLabel("Nur ausgewählte Rollen", { exact: true }).check();
  await expect(template.locator(".role-list input")).toHaveCount(1);
  await expect(
    template.getByLabel("application-viewer", { exact: true }),
  ).toBeChecked();
  await template.getByText("Bestellung testen", { exact: true }).click();
  await expect(template.locator(".parameter-preview")).toContainText(
    "Projektverantwortliche Person wird bei der Instanziierung zugeordnet",
  );
  await expect(template.locator(".parameter-preview")).toContainText(
    "verifizierten STACKIT-Identität",
  );
  await page.getByLabel("Katalogregion", { exact: true }).selectOption("eu02");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Abmelden", exact: true }),
  ).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: "STACKIT-Produktoptionen laden" })
    .click();
  await expect(page.getByLabel("Katalogzugang", { exact: true })).toHaveValue(
    "11111111-1111-4111-8111-111111111111",
  );
  await expect(page.getByLabel("Referenzprojekt-ID")).toHaveValue(
    "22222222-2222-4222-8222-222222222222",
  );
  await expect(page.getByLabel("Katalogregion", { exact: true })).toHaveValue(
    "eu02",
  );
  const saved = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem(
        "lzc-workspace-v1:personal-one:catalogue-user:catalogue",
      ) ?? "null",
    ),
  );
  expect(Object.keys(saved).sort()).toEqual([
    "profileId",
    "projectId",
    "region",
  ]);
  session.tenant.id = "personal-two";
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Abmelden", exact: true }),
  ).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: "STACKIT-Produktoptionen laden" })
    .click();
  await expect(page.getByLabel("Katalogzugang", { exact: true })).toHaveValue(
    "",
  );
  await expect(page.getByLabel("Referenzprojekt-ID")).toHaveValue("");
  await expect(page.getByLabel("Katalogregion", { exact: true })).toHaveValue(
    "eu01",
  );
});
