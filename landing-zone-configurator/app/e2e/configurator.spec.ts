import { readFile } from "node:fs/promises";
import {
  catalogue,
  createDraft,
  savedDraft,
  type Template,
  upgradeEditorDraft,
} from "@lzc/domain";
import { expect, type Page, test } from "@playwright/test";

async function restoreLegacy(page: Page) {
  const template = catalogue.templates.find(
    (item) => item.id === "standalone",
  ) as Template;
  await page.evaluate(
    ({ draft, sha256 }) =>
      sessionStorage.setItem(
        "lzc-oauth-draft",
        JSON.stringify({ draft, sha256, expires: Date.now() + 600000 }),
      ),
    { draft: createDraft(template), sha256: template.sha256 },
  );
  await page.goto("/configurations/edit/basics");
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/backends*", (route) =>
    new URL(route.request().url()).searchParams.has("configurationId")
      ? route.fulfill({ status: 404, json: { error: "backend_not_found" } })
      : route.fulfill({ json: { backends: [] } }),
  );
  await page.route("**/api/v1/configurations", (route) =>
    route.fulfill({ json: { configurations: [] } }),
  );
  await page.route("**/api/v1/github/forks?*", (route) =>
    route.fulfill({ json: { forks: [], nextPage: null } }),
  );
  await page.route("**/api/v1/plans", (route) =>
    route.fulfill({ status: 404, json: { error: "not_found" } }),
  );
  await page.route("**/api/v1/plans/*/output", (route) =>
    route.fulfill({ json: { text: "", truncated: false, kind: "live" } }),
  );
  await page.route("**/auth/status", (route) =>
    route.fulfill({ json: { github: false } }),
  );
});

test("database configurations save, reopen, protect revisions and delete without GitHub", async ({
  page,
}, testInfo) => {
  page.on("dialog", (dialog) => void dialog.accept());
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
  await page.route("**/auth/status", (route) =>
    route.fulfill({
      json: { github: false, stackit: true, primary: "stackit" },
    }),
  );
  await page.route("**/auth/github/status", (route) =>
    route.fulfill({ json: { connected: false } }),
  );
  type Stored = {
    id: string;
    name: string;
    revision: number;
    updatedAt: string;
    draft: ReturnType<typeof createDraft>;
  };
  const records: Stored[] = [];
  let conflict = false;
  await page.route("**/api/v1/configurations", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: {
          configurations: records.map(
            ({ draft: _draft, ...summary }) => summary,
          ),
        },
      });
    expect(route.request().headers()["x-lzc-csrf"]).toBe("csrf-test");
    const { draft } = route.request().postDataJSON();
    const stored = {
      id: `11111111-2222-4333-8444-${String(records.length + 1).padStart(12, "0")}`,
      name: draft.name,
      revision: 1,
      updatedAt: new Date().toISOString(),
      draft,
    };
    records.push(stored);
    return route.fulfill({ status: 201, json: { configuration: stored } });
  });
  await page.route("**/api/v1/configurations/*", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/").pop();
    const index = records.findIndex((item) => item.id === id);
    const stored = records[index];
    if (!stored)
      return route.fulfill({
        status: 404,
        json: { error: "configuration_not_found" },
      });
    if (route.request().method() === "GET")
      return route.fulfill({ json: { configuration: stored } });
    expect(route.request().headers()["x-lzc-csrf"]).toBe("csrf-test");
    const body = route.request().postDataJSON();
    if (conflict || body.revision !== stored.revision)
      return route.fulfill({
        status: 409,
        json: { error: "configuration_changed" },
      });
    if (route.request().method() === "DELETE") {
      records.splice(index, 1);
      return route.fulfill({ status: 204 });
    }
    stored.draft = body.draft;
    stored.name = body.draft.name;
    stored.revision++;
    return route.fulfill({ json: { configuration: stored } });
  });
  await page.goto("/templates");
  await restoreLegacy(page);
  await page
    .getByRole("textbox", { name: "Name der Konfiguration", exact: true })
    .fill("Ohne GitHub gespeichert");
  await page
    .getByRole("button", { name: "Konfigurationen", exact: true })
    .click();
  const storage = page.getByRole("region", {
    name: "Gespeicherte Konfigurationen",
  });
  await storage
    .getByRole("button", { name: "Konfiguration speichern", exact: true })
    .click();
  await expect(storage.getByRole("status")).toHaveText(
    "Konfiguration in der Datenbank gespeichert.",
  );
  await page.reload();
  await expect(
    storage.getByRole("button", {
      name: "Konfiguration öffnen: Ohne GitHub gespeichert",
      exact: true,
    }),
  ).toBeVisible();
  await storage
    .getByRole("button", {
      name: "Konfiguration öffnen: Ohne GitHub gespeichert",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Name der Konfiguration", exact: true }),
  ).toHaveValue("Ohne GitHub gespeichert");
  await page
    .getByRole("textbox", { name: "Name der Konfiguration", exact: true })
    .fill("Aktualisiert ohne GitHub");
  await page
    .getByRole("button", { name: "Konfigurationen", exact: true })
    .click();
  await storage
    .getByRole("button", { name: "Konfiguration speichern", exact: true })
    .click();
  await expect(storage.getByText(/Revision 2/)).toBeVisible();
  expect(records).toHaveLength(1);
  conflict = true;
  await storage
    .getByRole("button", { name: "Konfiguration speichern", exact: true })
    .click();
  await expect(storage.getByRole("alert")).toContainText("inzwischen geändert");
  await storage
    .getByRole("button", { name: "Als neue Kopie speichern", exact: true })
    .click();
  await expect(storage.getByRole("status")).toHaveText(
    "Konfiguration in der Datenbank gespeichert.",
  );
  expect(records).toHaveLength(2);
  conflict = false;
  await storage
    .getByRole("button", {
      name: "Konfiguration löschen: Aktualisiert ohne GitHub",
      exact: true,
    })
    .last()
    .click();
  await expect(storage.getByRole("status")).toContainText("gelöscht");
  expect(records).toHaveLength(1);
  await expect(
    storage.getByRole("button", {
      name: "Konfiguration speichern",
      exact: true,
    }),
  ).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath("database-configurations.png"),
  });
});

for (const responseKind of ["unavailable", "html"] as const) {
  test(`login status ${responseKind} displays a readable error`, async ({
    page,
  }, testInfo) => {
    await page.route("**/auth/status", (route) =>
      route.fulfill(
        responseKind === "html"
          ? {
              contentType: "text/html",
              body: "<!doctype html><title>UI preview</title>",
            }
          : { status: 503, json: { error: "service_unavailable" } },
      ),
    );
    await page.goto("/");
    const alert = page.locator(".account-error");
    await expect(alert).toHaveText(
      responseKind === "html"
        ? "Anmeldung ist hier nicht eingerichtet."
        : "Anmeldung derzeit nicht erreichbar.",
    );
    const colors = await alert.evaluate((element) => {
      const style = getComputedStyle(element);
      function luminance(color: string) {
        const values = color.match(/[\d.]+/g);
        if (!values || values.length < 3) throw new Error("Invalid RGB color");
        const channels = values
          .slice(0, 3)
          .map(Number)
          .map((channel) => {
            const normalized = channel / 255;
            return normalized <= 0.04045
              ? normalized / 12.92
              : ((normalized + 0.055) / 1.055) ** 2.4;
          });
        return channels.reduce(
          (total, channel, index) =>
            total + channel * ([0.2126, 0.7152, 0.0722][index] ?? 0),
          0,
        );
      }
      const text = luminance(style.color);
      const background = luminance(style.backgroundColor);
      const box = element.getBoundingClientRect();
      return {
        contrast:
          (Math.max(text, background) + 0.05) /
          (Math.min(text, background) + 0.05),
        fits:
          box.left >= 0 &&
          box.right <= innerWidth &&
          box.top >= 0 &&
          box.bottom <= innerHeight,
      };
    });
    expect(colors.contrast).toBeGreaterThanOrEqual(4.5);
    expect(colors.fits).toBe(true);
    await expect(
      page.getByRole("button", { name: /Mit (STACKIT|GitHub) anmelden/ }),
    ).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("login-status-error.png"),
    });
  });
}

test("STACKIT primary login, approval dialog and logout without GitHub", async ({
  page,
}, testInfo) => {
  let loggedIn = false;
  let approved = false;
  const extraRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/v1\/(github|credentials|cloud-catalogues)/.test(request.url()))
      extraRequests.push(request.url());
  });
  await page.route("**/auth/status", (route) =>
    route.fulfill({
      json: { github: false, stackit: true, primary: "stackit" },
    }),
  );
  await page.route("**/api/v1/session", (route) =>
    route.fulfill(
      loggedIn
        ? {
            json: {
              user: {
                id: "11111111-1111-4111-8111-111111111111",
                login: "owner@example.test",
              },
              tenant: {
                id: "22222222-2222-4222-8222-222222222222",
                kind: "organisation",
                roles: ["application-owner"],
              },
              csrfToken: "c".repeat(43),
              expiresAt: new Date(Date.now() + 3600000).toISOString(),
            },
          }
        : { status: 401, json: { error: "authentication_required" } },
    ),
  );
  await page.route("**/api/v1/applications/**", (route) =>
    route.fulfill({ json: { versions: [], instances: [] } }),
  );
  await page.route("**/api/v1/organisation", (route) =>
    route.fulfill({
      json: {
        userId: "11111111-1111-4111-8111-111111111111",
        activeTenantId: "22222222-2222-4222-8222-222222222222",
        tenants: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Mein Arbeitsbereich",
            kind: "organisation",
            organizationId: "33333333-3333-4333-8333-333333333333",
            organizationVerified: false,
            roles: ["application-owner"],
            manageMembers: false,
          },
        ],
        members: [],
      },
    }),
  );
  await page.route("**/auth/stackit/start", (route) =>
    route.fulfill({
      json: {
        verificationUri:
          "https://accounts.stackit.cloud/device?user_code=TEST-CODE",
        userCode: "TEST-CODE",
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        retryAfterMs: 50,
      },
    }),
  );
  await page.route("**/auth/stackit/poll", (route) => {
    if (approved) {
      loggedIn = true;
      return route.fulfill({ json: { status: "verified" } });
    }
    return route.fulfill({ json: { status: "waiting", retryAfterMs: 50 } });
  });
  await page.route("**/auth/logout", (route) => {
    loggedIn = false;
    return route.fulfill({ status: 204 });
  });
  await page.goto("/organisation");
  await page
    .getByRole("button", { name: "Mit STACKIT anmelden", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Anmeldecode")).toHaveText("TEST-CODE");
  await expect(
    dialog.getByRole("link", { name: "Bei STACKIT bestätigen" }),
  ).toHaveAttribute("href", /^https:\/\/accounts\.stackit\.cloud\/device/);
  expect(
    await dialog.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return (
        box.left >= 0 &&
        box.right <= innerWidth &&
        box.top >= 0 &&
        box.bottom <= innerHeight
      );
    }),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("stackit-login.png"),
    fullPage: true,
  });
  approved = true;
  await expect(
    page.getByRole("button", { name: "Abmelden", exact: true }),
  ).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".account")).toContainText("owner@example.test");
  await expect(page).toHaveURL(/\/workspaces$/);
  await expect(
    page.getByRole("button", {
      name: "Arbeitsbereich öffnen: Mein Arbeitsbereich",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Arbeitsbereich öffnen: Mein Arbeitsbereich" })
    .click();
  await expect(page).toHaveURL(/\/applications$/);
  await expect(
    page.getByRole("button", { name: "Mit GitHub anmelden" }),
  ).toHaveCount(0);
  expect(extraRequests).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Abmelden", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mit STACKIT anmelden", exact: true }),
  ).toBeVisible();
});

test("GitHub connection is optional and starts only in the repository workspace", async ({
  page,
}, testInfo) => {
  let forksRequested = 0;
  await page.route("**/auth/status", (route) =>
    route.fulfill({
      json: { github: true, stackit: true, primary: "stackit" },
    }),
  );
  await page.route("**/auth/github/status", (route) =>
    route.fulfill({ json: { connected: false } }),
  );
  await page.route("**/api/v1/session", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "11111111-1111-4111-8111-111111111111",
          login: "engineer@example.test",
        },
        tenant: {
          id: "22222222-2222-4222-8222-222222222222",
          kind: "personal",
        },
        csrfToken: "c".repeat(43),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        stackitVerified: true,
      },
    }),
  );
  await page.route("**/api/v1/github/forks?*", (route) => {
    forksRequested++;
    return route.fulfill({ json: { forks: [], nextPage: null } });
  });
  await page.route("**/auth/github/connect", (route) => {
    expect(route.request().headers()["x-lzc-csrf"]).toBe("c".repeat(43));
    expect(route.request().method()).toBe("POST");
    return route.fulfill({
      json: {
        authorizationUrl: "https://github.com/login/oauth/authorize?state=test",
      },
    });
  });
  await page.route("https://github.com/login/oauth/authorize*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>OAuth test boundary</h1>",
    }),
  );
  await page.goto("/repositories");
  const connect = page.getByRole("button", {
    name: "GitHub verbinden",
    exact: true,
  });
  await expect(connect).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Abmelden", exact: true }),
  ).toBeVisible();
  expect(forksRequested).toBe(0);
  await page.screenshot({
    path: testInfo.outputPath("optional-github.png"),
    fullPage: true,
  });
  await connect.click();
  await expect(page).toHaveURL(
    /^https:\/\/github\.com\/login\/oauth\/authorize/,
  );
});

test("template catalogue, search and network preview", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/templates");
  await expect(
    page.getByRole("heading", { name: "Neue Konfiguration" }),
  ).toBeVisible();
  await expect(page.locator(".template-card")).toHaveCount(8);
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() => document.fonts.check('400 16px "DIN 2014"')),
  ).toBe(true);
  expect(
    await page.evaluate(() => document.fonts.check('500 28px "Univia Pro"')),
  ).toBe(true);
  expect(
    await page
      .getByAltText("STACKIT", { exact: true })
      .evaluate((img: HTMLImageElement) => img.naturalWidth > 0),
  ).toBe(true);
  await expect(
    page.getByRole("navigation", { name: "Konfiguration", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("templates.png"),
    fullPage: true,
  });
  await page.getByRole("searchbox").fill("Firewall");
  await expect(page.locator(".template-card")).toHaveCount(2);
  await page
    .getByRole("button", {
      name: "Template ansehen : Hub & Spoke mit Firewall",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Hub & Spoke mit Firewall" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Konfiguration erstellen" }),
  ).toHaveCount(1);
  await expect(page.locator(".topology")).toContainText("Netzwerk-Hub");
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("edit, validate and download an isolated standalone copy", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/templates");
  await page
    .getByRole("button", { name: "Template ansehen : Standalone", exact: true })
    .click();
  await restoreLegacy(page);
  await page.getByRole("button", { name: "4 Prüfen", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Angaben bitte prüfen");
  await page.getByRole("button", { name: /Organisations-ID: Bitte/ }).click();
  await expect(page.getByLabel("STACKIT Organisations-ID")).toBeFocused();
  await page
    .getByLabel("STACKIT Organisations-ID")
    .fill("11111111-2222-3333-4444-555555555555");
  await page.getByLabel("Name der Konfiguration").fill("Meine Testumgebung");
  await page.getByLabel("Organisation / Unternehmen").fill("Team Configurator");
  await page.getByLabel("Technisch verantwortlich").fill("owner@stackit.cloud");
  await page.screenshot({
    path: testInfo.outputPath("editor.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Weiter zu Ordnern" }).click();
  await page
    .getByRole("textbox", { name: "Platform", exact: true })
    .fill("Meine Plattform");
  await page
    .getByRole("textbox", { name: "Landing Zones - Public", exact: true })
    .fill("Meine Anwendungen");
  await expect(page.locator(".topology")).toContainText("Meine Plattform");
  await expect(page.locator(".topology")).toContainText("Meine Anwendungen");
  await expect(page.locator(".topology")).toContainText("Management");
  await page.screenshot({
    path: testInfo.outputPath("folders.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Weiter zu Projekten" }).click();
  await expect(
    page.getByLabel("Eindeutige Kennung"),
  ).toHaveAccessibleDescription(/Stabile ID/);
  await expect(page.getByLabel("Projektkürzel")).toHaveAccessibleDescription(
    /Ressourcen/,
  );
  await page.getByLabel("Projektname").fill("Kundenportal");
  await page.getByLabel("Projektverantwortlich").fill("owner@stackit.cloud");
  await page.getByLabel("Sandbox-Verantwortlich").fill("sandbox@stackit.cloud");
  await page.getByLabel("Secrets Manager vorsehen").uncheck();
  await page.getByRole("button", { name: "+ Landing Zone hinzufügen" }).click();
  const extra = page.getByRole("group", {
    name: "Neue Landing Zone",
    exact: true,
  });
  await extra.getByLabel("Projektname").fill("Worker");
  const worker = page.getByRole("group", { name: "Worker", exact: true });
  await worker.getByLabel("Eindeutige Kennung").fill("worker");
  await worker.getByLabel("Projektkürzel").fill("worker");
  await page.getByRole("button", { name: "Entwurf prüfen" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "formal gültig" }),
  ).toBeVisible();
  await expect(page.locator(".topology")).toContainText("Kundenportal");
  await expect(page.locator(".topology")).toContainText("Worker");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "tfvars herunterladen" }).click();
  const download = await downloaded;
  const path = await download.path();
  if (!path) throw new Error("No download file");
  expect(download.suggestedFilename()).toBe("landing-zone.tfvars");
  const exported = await readFile(path, "utf8");
  expect(exported).toContain('"project_name" = "Kundenportal"');
  expect(exported).toContain('"secretsmanager_enabled" = false');
  expect(exported).toContain('"worker" = {');
  expect(exported).toContain('"name" = "Meine Plattform"');
  expect(exported).toContain('"name" = "Meine Anwendungen"');
  expect(exported).toContain('"managed_by" = "opentofu"');
  await page.screenshot({
    path: testInfo.outputPath("review.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Konfigurationen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Neue Konfiguration", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Template ansehen : Standalone", exact: true })
    .click();
  await expect(page.locator(".topology")).toContainText(
    "Public · public-exmpl",
  );
  await page
    .getByRole("button", { name: "Konfigurationen", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Meine Testumgebung weiterbearbeiten",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Meine Testumgebung" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("GitHub redirect preserves incomplete draft and logout sends CSRF", async ({
  page,
}) => {
  await page.route("**/auth/status", (route) =>
    route.fulfill({ json: { github: true } }),
  );
  let loggedIn = false;
  await page.route("**/api/v1/session", (route) =>
    route.fulfill(
      loggedIn
        ? {
            json: {
              user: { login: "alice" },
              csrfToken: "test-csrf",
              expiresAt: new Date(Date.now() + 3600000).toISOString(),
            },
          }
        : { status: 401, json: { error: "authentication_required" } },
    ),
  );
  await page.route("**/auth/github/start", (route) => {
    loggedIn = true;
    return route.fulfill({ status: 302, headers: { location: "/" } });
  });
  let csrf = "";
  await page.route("**/auth/logout", (route) => {
    csrf = route.request().headers()["x-lzc-csrf"] ?? "";
    loggedIn = false;
    return route.fulfill({ status: 204 });
  });
  await page.goto("/templates");
  await page
    .getByRole("button", { name: "Template ansehen : Standalone", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Konfiguration erstellen", exact: true })
    .click();
  await page.getByLabel("Name der Konfiguration").fill("Entwurf vor Anmeldung");
  await page.getByRole("button", { name: "Mit GitHub anmelden" }).click();
  await expect(page.getByText("@alice", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Name der Konfiguration")).toHaveValue(
    "Entwurf vor Anmeldung",
  );
  expect(
    await page.evaluate(() => sessionStorage.getItem("lzc-oauth-draft")),
  ).toBeNull();
  await page.getByRole("button", { name: "Abmelden", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mit GitHub anmelden" }),
  ).toBeVisible();
  expect(csrf).toBe("test-csrf");
});

test("URLs and browser back/forward preserve an in-progress draft", async ({
  page,
}) => {
  await page.goto("/templates");
  await page
    .getByRole("button", { name: "Template ansehen : Standalone", exact: true })
    .click();
  await expect(page).toHaveURL(/\/templates\/standalone$/);
  await page
    .getByRole("button", { name: "Konfiguration erstellen", exact: true })
    .click();
  await expect(page).toHaveURL(/\/configurations\/edit\/basics$/);
  await page.getByLabel("Name der Konfiguration").fill("Entwurf mit History");
  await page.getByRole("button", { name: "2 Ordner", exact: true }).click();
  await page
    .getByRole("button", {
      name: "5 Application Landing Zone Templates",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/configurations\/edit\/projects$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/configurations\/edit\/folders$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/configurations\/edit\/basics$/);
  await expect(page.getByLabel("Name der Konfiguration")).toHaveValue(
    "Entwurf mit History",
  );
  await page.goForward();
  await expect(page).toHaveURL(/\/configurations\/edit\/folders$/);
  await page.goForward();
  await expect(
    page.getByRole("heading", {
      name: "Application Landing Zone Templates",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Konfigurationen", exact: true })
    .click();
  await expect(page).toHaveURL(/\/configurations$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/configurations\/edit\/projects$/);
  await page.goBack();
  await page.goBack();
  await expect(page.getByLabel("Name der Konfiguration")).toHaveValue(
    "Entwurf mit History",
  );
});

test("template deep links survive reload; empty editor deep link offers recovery", async ({
  page,
}) => {
  await page.goto("/templates/hub-and-spoke-firewall");
  await expect(
    page.getByRole("heading", {
      name: "Hub & Spoke mit Firewall",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Hub & Spoke mit Firewall",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/configurations/edit/review");
  await expect(
    page.getByRole("heading", { name: "Kein Entwurf in diesem Tab" }),
  ).toBeVisible();
});

test("select a fork, reopen a config and resolve a save conflict as a new copy", async ({
  page,
}, testInfo) => {
  page.on("dialog", (dialog) => void dialog.accept());
  const template = catalogue.templates.find(
    (t) => t.id === "standalone",
  ) as Template;
  const draft = createDraft(template);
  draft.name = "Gespeicherte Landing Zone";
  draft.organization = "11111111-2222-4333-8444-555555555555";
  draft.owner = "owner@stackit.cloud";
  for (const item of [...draft.projects, ...draft.sandboxes])
    item.owner = draft.owner;
  let document = savedDraft("11111111-2222-4333-8444-555555555555", draft);
  let head = "a".repeat(40);
  const fork = {
    owner: "alice",
    name: "accelerator",
    id: 123,
    fullName: "alice/accelerator",
    defaultBranch: "main",
  };
  await page.route("**/auth/status", (route) =>
    route.fulfill({ json: { github: true } }),
  );
  await page.route("**/api/v1/session", (route) =>
    route.fulfill({
      json: {
        user: { id: "alice-id", login: "alice" },
        csrfToken: "csrf-test",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    }),
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
        configurations: [{ id: document.id, name: document.draft.name }],
        unsupported: 0,
        truncated: false,
      },
    }),
  );
  await page.route("**/api/v1/github/configuration/*", (route) =>
    route.fulfill({ json: { document, head } }),
  );
  let attempts = 0;
  await page.route("**/api/v1/github/configuration", async (route) => {
    const body = route.request().postDataJSON();
    expect(route.request().headers()["x-lzc-csrf"]).toBe("csrf-test");
    attempts++;
    if (attempts === 1) {
      expect(body.mode).toBe("update");
      expect(body.head).toBe("a".repeat(40));
      head = "b".repeat(40);
      await route.fulfill({
        status: 409,
        json: { error: "repository_changed" },
      });
    } else {
      expect(body.mode).toBe("create");
      expect(body.head).toBe(head);
      expect(body.document.id).not.toBe(document.id);
      expect(body.document.schemaVersion).toBe(2);
      expect(body.document.draft.folders.platform).toBe("Plattform aus Fork");
      document = body.document;
      head = "c".repeat(40);
      await route.fulfill({
        json: {
          id: document.id,
          head,
          commitUrl: `https://github.com/alice/accelerator/commit/${head}`,
        },
      });
    }
  });
  await page.goto("/repositories");
  await page.getByRole("button", { name: "Forks aktualisieren" }).click();
  await page
    .getByRole("button", { name: "alice/accelerator", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Gespeicherte Landing Zone öffnen" })
    .click();
  await expect(page).toHaveURL(/\/configurations\/edit\/basics$/);
  await page.getByLabel("Name der Konfiguration").fill("Meine neue Kopie");
  await page.getByRole("button", { name: "2 Ordner", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Platform", exact: true })
    .fill("Plattform aus Fork");
  await page.getByRole("button", { name: "1 Grundlagen", exact: true }).click();
  // Fresh entry restores unsaved edits, the selected fork and the original base revision.
  head = "b".repeat(40);
  await page.goto("/configurations/edit/basics");
  await expect(page).toHaveURL(/\/configurations\/edit\/basics$/);
  await expect(page.getByLabel("Name der Konfiguration")).toHaveValue(
    "Meine neue Kopie",
  );
  await page
    .getByRole("button", { name: "Konfigurationen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Im Fork speichern", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("inzwischen verändert");
  await page.getByRole("button", { name: "Entwurf bearbeiten" }).click();
  await expect(page.getByLabel("Name der Konfiguration")).toHaveValue(
    "Meine neue Kopie",
  );
  await page
    .getByRole("button", { name: "Konfigurationen", exact: true })
    .click();
  await page.getByRole("button", { name: "Neue Kopie vorbereiten" }).click();
  await page
    .getByRole("button", { name: "Im Fork speichern", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("im Fork gespeichert");
  await page.screenshot({
    path: testInfo.outputPath("fork-saved.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => window.document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto("/configurations");
  await expect(page).toHaveURL(/\/configurations$/);
  await expect(
    page.getByRole("button", { name: "alice/accelerator", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Entwurf bearbeiten" }).click();
  await expect(page.getByLabel("Name der Konfiguration")).toHaveValue(
    "Meine neue Kopie",
  );

  // Explicit links win over the remembered page, while the draft stays available.
  await page.goto("/templates");
  await expect(page.getByText("@alice", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/templates$/);
  await page
    .getByRole("button", { name: "Konfigurationen", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Meine neue Kopie weiterbearbeiten",
      exact: true,
    }),
  ).toBeEnabled();
  const remembered = await page.evaluate(() =>
    localStorage.getItem("lzc-workspace-v1:personal:alice-id"),
  );
  expect(remembered).not.toContain("csrf-test");

  // Revoked access must not expose a restored draft or erase its local recovery copy.
  await page.route("**/api/v1/github/repository?*", (route) =>
    route.fulfill({ status: 403, json: { error: "repository_access_denied" } }),
  );
  await page.goto("/repositories");
  await expect(page.getByRole("alert")).toContainText("keinen Zugriff");
  await expect(
    page.getByRole("navigation", { name: "Konfiguration", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("lzc-workspace-v1:personal:alice-id"),
    ),
  ).toBe(remembered);

  // A different account in this browser must not restore Alice's configuration.
  await page.route("**/api/v1/session", (route) =>
    route.fulfill({
      json: {
        user: { id: "bob-id", login: "bob" },
        csrfToken: "bob-csrf",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByText("@bob", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Konfiguration", exact: true }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
});

test("personal credentials upload clears the file and supports deletion and history", async ({
  page,
}, testInfo) => {
  await page.route("**/auth/status", (route) =>
    route.fulfill({ json: { github: true } }),
  );
  await page.route("**/api/v1/session", (route) =>
    route.fulfill({
      json: {
        user: { id: "alice", login: "alice" },
        csrfToken: "a".repeat(43),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    }),
  );
  let stored = false;
  let lastCheck: {
    status: string;
    code: string;
    organizationId: string;
    organizationName: string;
    checkedAt: string;
  } | null = null;
  const profile = {
    id: "11111111-2222-4333-8444-555555555555",
    name: "Team Plattform",
    serviceAccount: "platform-team@sa.stackit.cloud",
    keyId: "key-id",
    state: "stored",
  };
  await page.route("**/api/v1/credentials", async (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().headers()["x-lzc-csrf"]).toBe("a".repeat(43));
      expect(route.request().postDataJSON()).toEqual({
        name: "Team Plattform",
        serviceAccountKey: { credentials: { privateKey: "BROWSER-TEST-KEY" } },
      });
      stored = true;
      await route.fulfill({ status: 201, json: { stored: true } });
    } else
      await route.fulfill({
        json: { profiles: stored ? [{ ...profile, lastCheck }] : [] },
      });
  });
  await page.route(`**/api/v1/credentials/${profile.id}`, (route) => {
    expect(route.request().method()).toBe("DELETE");
    expect(route.request().headers()["x-lzc-csrf"]).toBe("a".repeat(43));
    stored = false;
    return route.fulfill({ status: 204 });
  });
  await page.route(`**/api/v1/credentials/${profile.id}/check`, (route) => {
    expect(route.request().headers()["x-lzc-csrf"]).toBe("a".repeat(43));
    const organizationId = route.request().postDataJSON().organizationId;
    lastCheck = {
      status: "passed",
      code: "organization_readable",
      organizationId,
      organizationName: "Customer organization",
      checkedAt: new Date().toISOString(),
    };
    return route.fulfill({ json: { check: lastCheck } });
  });
  await page.goto("/templates");
  await page.getByRole("button", { name: "Zugänge", exact: true }).click();
  await expect(page).toHaveURL(/\/credentials$/);
  await page.getByLabel("Profilname").fill("Team Plattform");
  await page.getByLabel("Service-Account-Schlüssel (JSON)").setInputFiles({
    name: "test-key.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ credentials: { privateKey: "BROWSER-TEST-KEY" } }),
    ),
  });
  await page.getByRole("button", { name: "Zugang sicher speichern" }).click();
  await expect(page.getByRole("status")).toContainText("noch nicht geprüft");
  await expect(page.getByLabel("Service-Account-Schlüssel (JSON)")).toHaveValue(
    "",
  );
  await expect(
    page.getByText(profile.serviceAccount, { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ),
  ).not.toContain("BROWSER-TEST-KEY");
  expect(await page.locator("body").innerText()).not.toContain(
    "BROWSER-TEST-KEY",
  );
  await page
    .getByLabel("Zielorganisation (UUID)")
    .fill("11111111-2222-4333-8444-555555555555");
  await page
    .getByRole("button", { name: "Zugang prüfen", exact: true })
    .click();
  await expect(
    page.getByText("Anmeldung erfolgreich · Organisation lesbar", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "Schreibrechte für ein Deployment sind damit noch nicht bestätigt",
  );
  await page.screenshot({
    path: testInfo.outputPath("credentials.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goBack();
  await expect(page).toHaveURL(/\/templates$/);
  await page.goForward();
  await page.reload();
  await expect(
    page.getByText(profile.serviceAccount, { exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Zugang löschen" }).click();
  await expect(page.getByRole("status")).toContainText("entfernt");
  await expect(
    page.getByText(profile.serviceAccount, { exact: true }),
  ).toHaveCount(0);
});

for (const format of ["legacy", "common"] as const) {
  test(`prepares an immutable ${format} configuration with a personal credential and survives reload`, async ({
    page,
  }, testInfo) => {
    const template = catalogue.templates.find(
      (item) => item.id === "standalone",
    ) as Template;
    const draft = createDraft(template);
    draft.organization = "11111111-2222-4333-8444-555555555555";
    draft.owner = "owner@stackit.cloud";
    for (const project of draft.projects) project.owner = draft.owner;
    for (const sandbox of draft.sandboxes) sandbox.owner = draft.owner;
    const documentId = "22222222-2222-4333-8444-555555555555";
    const document =
      format === "common"
        ? { ...upgradeEditorDraft(draft), id: documentId }
        : savedDraft(documentId, draft);
    const profileId = "33333333-2222-4333-8444-555555555555";
    const head = "a".repeat(40);
    const fork = {
      id: 123,
      owner: "alice",
      name: "accelerator",
      fullName: "alice/accelerator",
      defaultBranch: "main",
    };
    const check = {
      status: "passed",
      code: "organization_readable",
      organizationId: draft.organization,
      organizationName: "Customer organization",
      checkedAt: new Date().toISOString(),
    };
    const record = {
      id: "44444444-2222-4333-8444-555555555555",
      name: draft.name,
      credentialId: profileId,
      createdAt: new Date().toISOString(),
      manifest: {
        source: {
          repository: fork,
          commit: head,
          configurationId: document.id,
        },
        organization: { id: draft.organization, name: "Customer organization" },
        accelerator: { commit: "b".repeat(40) },
        tfvarsSha256: "c".repeat(64),
        check,
      },
    };
    let stored = false;
    let planStatus = "";
    await page.route("**/api/v1/plans", (route) => {
      if (route.request().method() === "POST") {
        expect(route.request().postDataJSON()).toEqual({
          preparationId: record.id,
          confirmStateBinding: true,
        });
        expect(route.request().headers()["x-lzc-csrf"]).toBe("a".repeat(43));
        planStatus = "planning";
        return route.fulfill({ status: 202, json: { id: "plan-one" } });
      }
      return route.fulfill({
        json: {
          runs: planStatus
            ? [
                {
                  id: "plan-one",
                  preparationId: record.id,
                  status: planStatus,
                  errorCode: null,
                  createdAt: new Date().toISOString(),
                  summary:
                    planStatus === "succeeded"
                      ? {
                          schemaVersion: 1,
                          execution: "plan-only",
                          applyAllowed: false,
                          result: "changes",
                          resources: {
                            unchanged: 0,
                            create: 12,
                            update: 0,
                            delete: 0,
                            replace: 0,
                            read: 1,
                          },
                          drift: {
                            unchanged: 0,
                            create: 0,
                            update: 0,
                            delete: 0,
                            replace: 0,
                            read: 0,
                          },
                          changedOutputs: 3,
                          checks: { pass: 0, fail: 0, error: 0, unknown: 0 },
                          destructive: false,
                          completeness: "not-reported",
                        }
                      : null,
                },
              ]
            : [],
        },
      });
    });

    await page.route("**/auth/status", (route) =>
      route.fulfill({ json: { github: true } }),
    );
    await page.route("**/api/v1/session", (route) =>
      route.fulfill({
        json: {
          user: { id: "alice", login: "alice" },
          csrfToken: "a".repeat(43),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
      }),
    );
    await page.route("**/api/v1/github/forks*", (route) =>
      route.fulfill({ json: { forks: [fork], nextPage: null } }),
    );
    await page.route("**/api/v1/github/repository?*", (route) =>
      route.fulfill({
        json: {
          fork,
          head,
          branch: "lzc/configurations",
          branchExists: true,
          configurations: [{ id: document.id, name: draft.name }],
          unsupported: 0,
          truncated: false,
        },
      }),
    );
    await page.route("**/api/v1/github/configuration/*", (route) =>
      route.fulfill({ json: { document, head } }),
    );
    await page.route("**/api/v1/credentials", (route) =>
      route.fulfill({
        json: {
          profiles: [{ id: profileId, name: "Team platform", state: "stored" }],
        },
      }),
    );
    await page.route("**/api/v1/preparations", (route) => {
      if (route.request().method() === "POST") {
        expect(route.request().headers()["x-lzc-csrf"]).toBe("a".repeat(43));
        expect(route.request().postDataJSON()).toEqual({
          target: { id: 123, owner: "alice", name: "accelerator" },
          configurationId: document.id,
          head,
          credentialId: profileId,
        });
        stored = true;
        return route.fulfill({ status: 201, json: { id: record.id } });
      }
      return route.fulfill({ json: { preparations: stored ? [record] : [] } });
    });
    await page.route(`**/api/v1/preparations/${record.id}`, (route) => {
      expect(route.request().method()).toBe("DELETE");
      return route.fulfill({
        status: 409,
        json: { error: "preparation_has_plans" },
      });
    });
    await page.goto("/repositories");
    await page
      .getByRole("button", { name: "Forks aktualisieren", exact: true })
      .click();
    await page
      .getByRole("button", { name: fork.fullName, exact: true })
      .click();
    await page.getByRole("button", { name: /Deployment vorbereiten/ }).click();
    await expect(page).toHaveURL(/\/deployments$/);
    await expect(
      page.getByText(draft.organization, { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Persönlicher Zugang").selectOption(profileId);
    await page
      .getByRole("button", { name: "Zugang prüfen und Vorbereitung speichern" })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Es wurde kein Plan oder Apply ausgeführt",
    );
    await page.reload();
    await page
      .getByLabel("Vorbereitung auswählen", { exact: true })
      .selectOption(record.id);
    await expect(
      page.getByText("Vorbereitet · Apply erst nach Planprüfung und Freigabe", {
        exact: true,
      }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Weiter zu Plan", exact: true })
      .click();
    await page
      .getByLabel("Gespeicherte Vorbereitung", { exact: true })
      .selectOption(record.id);
    const startPlan = page.getByRole("button", {
      name: "Plattform planen",
      exact: true,
      includeHidden: true,
    });
    await expect(startPlan).toBeDisabled();
    await page
      .getByRole("checkbox", {
        name: /Ich bestätige: Zielorganisation und State-Zuordnung/,
      })
      .check();
    await startPlan.click();
    await expect(
      page.getByRole("status").filter({ hasText: /Plan wird berechnet/ }),
    ).toBeVisible();
    await expect(startPlan).toBeDisabled();
    await expect(
      page
        .locator(".plan-runs")
        .getByRole("button", { name: /Apply|Anwenden/ }),
    ).toHaveCount(0);
    planStatus = "succeeded";
    await page.reload();
    await expect(
      page.getByText("Änderungen geplant – nichts angewendet."),
    ).toBeVisible();
    await expect(page.getByText("12", { exact: true })).toBeVisible();
    await page
      .getByRole("navigation", { name: "Konfiguration", exact: true })
      .getByRole("button", { name: "Vorbereitung", exact: true })
      .click();
    await page
      .getByLabel("Vorbereitung auswählen", { exact: true })
      .selectOption(record.id);
    await page.getByText("Versionsnachweise", { exact: true }).click();
    await expect(page.getByText(head, { exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("preparation.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => window.document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /Vorbereitung entfernen/ }).click();
    await expect(page.getByRole("alert")).toContainText(
      "besitzt Plan-Nachweise",
    );
    await expect(
      page.getByText("Vorbereitet · Apply erst nach Planprüfung und Freigabe", {
        exact: true,
      }),
    ).toHaveCount(1);
  });
}

test.describe("explicit saved-plan approval", () => {
  const organizationId = "11111111-2222-4333-8444-555555555555";
  const configurationId = "22222222-2222-4333-8444-555555555555";
  const credentialId = "33333333-2222-4333-8444-555555555555";
  const preparationId = "44444444-2222-4333-8444-555555555555";
  const planId = "55555555-2222-4333-8444-555555555555";
  const applyId = "66666666-2222-4333-8444-555555555555";
  const artifactSha256 = "d".repeat(64);
  const summary = {
    schemaVersion: 1,
    execution: "plan-only",
    applyAllowed: false,
    result: "changes",
    resources: {
      unchanged: 0,
      create: 12,
      update: 2,
      delete: 0,
      replace: 0,
      read: 1,
    },
    drift: {
      unchanged: 0,
      create: 0,
      update: 0,
      delete: 0,
      replace: 0,
      read: 0,
    },
    changedOutputs: 1,
    checks: { pass: 0, fail: 0, error: 0, unknown: 0 },
    destructive: false,
    completeness: "complete",
  };
  const preparation = {
    id: preparationId,
    name: "Datenbank-Plattform",
    credentialId,
    createdAt: new Date().toISOString(),
    manifest: {
      source: {
        kind: "database",
        configurationId,
        revision: 7,
        documentSha256: "c".repeat(64),
      },
      organization: { id: organizationId, name: "Zielorganisation" },
      accelerator: { commit: "b".repeat(40) },
      tfvarsSha256: "c".repeat(64),
      check: {
        status: "passed",
        code: "organization_readable",
        organizationId,
        organizationName: "Zielorganisation",
        checkedAt: new Date().toISOString(),
      },
    },
  };
  function savedPlan() {
    return {
      id: planId,
      preparationId,
      operation: "plan",
      status: "succeeded",
      summary,
      errorCode: null as string | null,
      createdAt: new Date().toISOString(),
      artifactSha256,
      applyAllowed: true,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };
  }
  async function setup(page: Page) {
    const githubRequests: string[] = [];
    await page.route("**/api/v1/**", (route) =>
      route.fulfill({ status: 404, json: { error: "not_found" } }),
    );
    await page.route("**/api/v1/backends*", (route) =>
      new URL(route.request().url()).searchParams.has("configurationId")
        ? route.fulfill({ status: 404, json: { error: "backend_not_found" } })
        : route.fulfill({ json: { backends: [] } }),
    );
    await page.route("**/api/v1/github/**", (route) => {
      githubRequests.push(route.request().url());
      return route.fulfill({
        status: 403,
        json: { error: "github_not_connected" },
      });
    });
    await page.route("**/auth/status", (route) =>
      route.fulfill({
        json: { github: false, stackit: true, primary: "stackit" },
      }),
    );
    await page.route("**/auth/github/status", (route) =>
      route.fulfill({ json: { connected: false } }),
    );
    await page.route("**/api/v1/session", (route) =>
      route.fulfill({
        json: {
          user: { id: "alice", login: "alice" },
          csrfToken: "csrf-apply",
          tenant: { id: "personal", kind: "personal", roles: [] },
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
      }),
    );
    await page.route("**/api/v1/configurations", (route) =>
      route.fulfill({ json: { configurations: [] } }),
    );
    await page.route("**/api/v1/credentials", (route) =>
      route.fulfill({
        json: {
          profiles: [
            { id: credentialId, name: "STACKIT Plattform", state: "stored" },
          ],
        },
      }),
    );
    await page.route("**/api/v1/preparations", (route) =>
      route.fulfill({ json: { preparations: [preparation] } }),
    );
    return githubRequests;
  }
  test("English workflow keeps separate phase histories and explicit saved-plan approval", async ({
    page,
  }, testInfo) => {
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "languages", { value: ["en-US"] }),
    );
    await setup(page);
    const template = catalogue.templates.find(
      (item) => item.id === "standalone",
    ) as Template;
    const draft = createDraft(template);
    draft.name = "Vorbereitung";
    draft.organization = organizationId;
    draft.owner = "pilot@customer.test";
    draft.projects = draft.projects.map((project) => ({
      ...project,
      owner: draft.owner,
    }));
    draft.sandboxes = [];
    const stored = {
      id: configurationId,
      name: draft.name,
      revision: 7,
      updatedAt: new Date().toISOString(),
      draft,
    };
    await page.route("**/api/v1/configurations", (route) =>
      route.fulfill({ json: { configurations: [stored] } }),
    );
    await page.route(`**/api/v1/configurations/${configurationId}`, (route) =>
      route.fulfill({ json: { configuration: stored } }),
    );
    await page.route("**/api/v1/plans", (route) =>
      route.fulfill({ json: { runs: [savedPlan()] } }),
    );
    const mutations: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() !== "GET" &&
        /\/api\/v1\/(plans|preparations|backends|credentials|configurations)(\/|$)/.test(
          new URL(request.url()).pathname,
        )
      )
        mutations.push(request.url());
    });
    await page.goto("/configurations");
    await page
      .getByRole("button", {
        name: "Open configuration: Vorbereitung",
        exact: true,
      })
      .click();
    const tabs = page.getByRole("navigation", {
      name: "Configuration",
      exact: true,
    });
    await tabs
      .getByRole("button", { name: "Preparation", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Preparation", level: 1 }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Select preparation", exact: true })
      .selectOption(preparationId);
    await expect(
      page.getByRole("heading", { name: preparation.name, exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Plan history|Apply history/)).toHaveCount(0);
    await tabs.getByRole("button", { name: "Plan", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Plan", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText("Changes planned. Nothing applied.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", {
        name: "Changes and target organization reviewed",
        exact: true,
      }),
    ).toHaveCount(0);
    await tabs.getByRole("button", { name: "Apply", exact: true }).click();
    const apply = page.getByRole("button", {
      name: "Apply approved plan",
      exact: true,
    });
    await expect(apply).toBeDisabled();
    await expect(page.getByText(artifactSha256, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("checkbox", {
        name: "Changes and target organization reviewed",
        exact: true,
      }),
    ).not.toBeChecked();
    await page
      .getByRole("combobox", { name: "Language", exact: true })
      .selectOption("de");
    await expect(
      page.getByRole("button", {
        name: "Freigegebenen Plan anwenden",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole("checkbox", {
        name: "Änderungen und Zielorganisation geprüft",
        exact: true,
      }),
    ).not.toBeChecked();
    await page
      .getByRole("combobox", { name: "Sprache", exact: true })
      .selectOption("en");
    await tabs.getByRole("button", { name: "History", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "History", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Plan and Apply runs", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /reviewed/ })).toHaveCount(
      0,
    );
    expect(mutations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("english-history.png"),
      fullPage: true,
    });
  });

  test("workspace-first configuration flow keeps revision, reload and readonly history without cloud mutations", async ({
    page,
  }, testInfo) => {
    await setup(page);
    const template = catalogue.templates.find(
      (item) => item.id === "standalone",
    ) as Template;
    const draft = createDraft(template);
    draft.name = "Meine Plattform";
    draft.organization = organizationId;
    draft.owner = "pilot@customer.test";
    draft.projects = draft.projects.map((project) => ({
      ...project,
      owner: draft.owner,
    }));
    draft.sandboxes = [];
    const stored = {
      id: configurationId,
      name: draft.name,
      revision: 7,
      updatedAt: new Date().toISOString(),
      draft,
    };
    const cloudMutations: string[] = [];
    let saves = 0;
    page.on("request", (request) => {
      if (
        request.method() !== "GET" &&
        /\/api\/v1\/(plans|preparations|backends|credentials)(\/|$)/.test(
          new URL(request.url()).pathname,
        )
      )
        cloudMutations.push(request.url());
    });
    await page.route("**/api/v1/organisation", (route) =>
      route.fulfill({
        json: {
          userId: "alice",
          activeTenantId: "personal",
          members: [],
          tenants: [
            {
              id: "personal",
              name: "Persönlich",
              kind: "personal",
              roles: [],
              manageMembers: false,
            },
          ],
        },
      }),
    );
    await page.route("**/api/v1/configurations", (route) =>
      route.fulfill({
        json: {
          configurations: [
            stored,
            {
              ...stored,
              id: "77777777-2222-4333-8444-555555555555",
              name: "Andere Konfiguration",
            },
          ],
        },
      }),
    );
    await page.route(`**/api/v1/configurations/${configurationId}`, (route) => {
      if (route.request().method() === "PUT") {
        expect(route.request().headers()["x-lzc-csrf"]).toBe("csrf-apply");
        const body = route.request().postDataJSON();
        expect(body.revision).toBe(stored.revision);
        stored.draft = body.draft;
        stored.name = body.draft.name;
        stored.revision++;
        saves++;
      }
      return route.fulfill({ json: { configuration: stored } });
    });
    const otherPreparation = {
      ...preparation,
      id: "88888888-2222-4333-8444-555555555555",
      name: "Andere Plattform",
      manifest: {
        ...preparation.manifest,
        source: {
          ...preparation.manifest.source,
          configurationId: "77777777-2222-4333-8444-555555555555",
        },
      },
    };
    await page.route("**/api/v1/preparations", (route) =>
      route.fulfill({
        json: { preparations: [preparation, otherPreparation] },
      }),
    );
    await page.route("**/api/v1/plans", (route) =>
      route.fulfill({
        json: {
          runs: [
            { ...savedPlan(), applyAllowed: stored.revision === 7 },
            {
              ...savedPlan(),
              id: "99999999-2222-4333-8444-555555555555",
              preparationId: otherPreparation.id,
            },
          ],
        },
      }),
    );
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Arbeitsbereiche", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^Templates/ })).toHaveCount(
      0,
    );
    await page
      .getByRole("button", { name: "Arbeitsbereich öffnen: Persönlich" })
      .click();
    await expect(page).toHaveURL(/\/configurations$/);
    await expect(
      page.getByRole("button", { name: "Neue Konfiguration", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Konfiguration öffnen: Meine Plattform" })
      .click();
    const tabs = page.getByRole("navigation", {
      name: "Konfiguration",
      exact: true,
    });
    await expect(tabs).toContainText("Revision 7");
    await tabs
      .getByRole("button", { name: "Vorbereitung", exact: true })
      .click();
    await expect(
      page.getByLabel("Gespeicherte Konfiguration", { exact: true }),
    ).toHaveValue(configurationId);
    await tabs.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(
      page.getByRole("checkbox", {
        name: "Änderungen und Zielorganisation geprüft",
        exact: true,
      }),
    ).not.toBeChecked();
    expect(saves).toBe(0);
    await tabs.getByRole("button", { name: "Verlauf", exact: true }).click();
    await expect(page).toHaveURL(/\/deployments\/history$/);
    await page.locator(".plan-runs > details.project-form > summary").click();
    await expect(
      page
        .locator(".plan-runs")
        .getByRole("heading", { name: "Datenbank-Plattform", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .locator(".plan-runs")
        .getByRole("heading", { name: "Andere Plattform", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Freigegebenen Plan anwenden" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Plattform planen", exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await expect(tabs).toContainText("Revision 7");
    await tabs
      .getByRole("button", { name: "Konfiguration", exact: true })
      .click();
    const name = page.getByRole("textbox", {
      name: "Name der Konfiguration",
      exact: true,
    });
    await expect(name).toHaveValue("Meine Plattform");
    await name.fill("Meine Plattform geändert");
    await expect(
      tabs.getByRole("button", { name: "Vorbereitung", exact: true }),
    ).toBeEnabled();
    await tabs
      .getByRole("button", { name: "Vorbereitung", exact: true })
      .click();
    await expect(tabs).toContainText("Revision 7 · Nicht gespeichert");
    await tabs
      .getByRole("button", { name: "Konfiguration", exact: true })
      .click();
    await expect(name).toHaveValue("Meine Plattform geändert");
    await page
      .getByRole("button", { name: "Arbeitsbereich wechseln", exact: true })
      .click();
    page.once("dialog", (dialog) => dialog.dismiss());
    await page
      .getByRole("button", { name: "Arbeitsbereich öffnen: Persönlich" })
      .click();
    await expect(page).toHaveURL(/\/workspaces$/);
    await page
      .getByRole("button", { name: "Konfigurationen", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Meine Plattform geändert weiterbearbeiten",
        exact: true,
      })
      .click();
    await expect(name).toHaveValue("Meine Plattform geändert");
    await page
      .getByRole("button", {
        name: "Speichern und zur Bereitstellung",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/\/deployments$/);
    await expect(tabs).toContainText("Revision 8");
    expect(saves).toBe(1);
    expect(cloudMutations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("configuration-flow.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Konfigurationen", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Neue Konfiguration", exact: true })
      .click();
    await expect(page).toHaveURL(/\/templates$/);
    await expect(
      page.getByRole("heading", { name: "Neue Konfiguration", level: 1 }),
    ).toBeVisible();
  });

  async function approve(page: Page) {
    await page
      .getByRole("checkbox", {
        name: "Änderungen und Zielorganisation geprüft",
        exact: true,
      })
      .check();
    await page
      .getByLabel("Zielorganisation UUID bestätigen", { exact: true })
      .fill(organizationId);
  }

  for (const useS3 of [false, true]) {
    test(`database preparation and plan preview without GitHub${useS3 ? " using bound S3 state" : ""}`, async ({
      page,
    }, testInfo) => {
      const githubRequests = await setup(page);
      const backendId = "77777777-2222-4333-8444-555555555555";
      if (useS3) {
        await page.route("**/api/v1/session", (route) =>
          route.fulfill({
            json: {
              user: { id: "alice", login: "alice" },
              csrfToken: "csrf-apply",
              tenant: {
                id: organizationId,
                kind: "organisation",
                roles: ["platform-engineer"],
              },
              expiresAt: new Date(Date.now() + 3600000).toISOString(),
            },
          }),
        );
        await page.route("**/api/v1/credentials", (route) =>
          route.fulfill({
            json: {
              profiles: [
                {
                  id: credentialId,
                  name: "STACKIT Plattform",
                  state: "stored",
                },
                {
                  id: "88888888-2222-4333-8444-555555555555",
                  name: "Anderer Zugang",
                  state: "stored",
                },
              ],
            },
          }),
        );
      }
      const descriptor = {
        bucket: "customer-tfstate",
        endpoint: "https://object.storage.eu01.onstackit.cloud",
        region: "eu01",
        key: "terraform.tfstate",
        useLockfile: true,
      } as const;
      if (useS3) {
        await page.route("**/api/v1/backends", (route) =>
          route.fulfill({
            json: { backends: [{ id: backendId, descriptor }] },
          }),
        );
        await page.route("**/api/v1/backends?*", (route) => {
          expect(
            new URL(route.request().url()).searchParams.get("configurationId"),
          ).toBe(configurationId);
          return route.fulfill({ json: { id: backendId, descriptor } });
        });
      }
      const template = catalogue.templates.find(
        (item) => item.id === "standalone",
      ) as Template;
      const draft = createDraft(template);
      draft.organization = organizationId;
      draft.owner = "owner@stackit.cloud";
      for (const project of draft.projects) project.owner = draft.owner;
      for (const sandbox of draft.sandboxes) sandbox.owner = draft.owner;
      const configuration = {
        id: configurationId,
        name: preparation.name,
        revision: 7,
        updatedAt: new Date().toISOString(),
        draft,
      };
      await page.route("**/api/v1/configurations", (route) =>
        route.fulfill({
          json: {
            configurations: useS3
              ? [
                  configuration,
                  {
                    ...configuration,
                    id: "99999999-2222-4333-8444-555555555555",
                    name: "Andere Konfiguration",
                  },
                ]
              : [configuration],
          },
        }),
      );
      await page.route(`**/api/v1/configurations/${configurationId}`, (route) =>
        route.fulfill({ json: { configuration } }),
      );
      let stored = false;
      await page.route("**/api/v1/preparations", (route) => {
        if (route.request().method() === "POST") {
          expect(route.request().postDataJSON()).toEqual({
            source: "database",
            configurationId,
            revision: 7,
            credentialId,
            ...(useS3 ? { backendId } : {}),
          });
          expect(route.request().headers()["x-lzc-csrf"]).toBe("csrf-apply");
          stored = true;
          return route.fulfill({ status: 201, json: { id: preparationId } });
        }
        return route.fulfill({
          json: { preparations: stored ? [preparation] : [] },
        });
      });
      let planned = false;
      await page.route("**/api/v1/plans", (route) => {
        if (route.request().method() === "POST") {
          expect(route.request().postDataJSON()).toEqual({
            preparationId,
            confirmStateBinding: true,
          });
          planned = true;
          return route.fulfill({ status: 202, json: { id: planId } });
        }
        return route.fulfill({
          json: {
            runs: planned
              ? [{ ...savedPlan(), stateBackend: useS3 ? descriptor : null }]
              : [],
          },
        });
      });
      await page.goto("/deployments");
      await expect(page).toHaveURL(/\/deployments$/);
      for (const reload of [false, true]) {
        if (reload) await page.reload();
        if (useS3) {
          await expect(
            page.getByText(/Organisationsarbeitsbereichen sind noch nicht/),
          ).toHaveCount(0);
          await expect(
            page.getByLabel("Gespeicherte Konfiguration", { exact: true }),
          ).toHaveValue(reload ? configurationId : "");
          if (!reload) {
            await page
              .getByLabel("Gespeicherte Konfiguration", { exact: true })
              .selectOption(configurationId);
          }
          await expect(page.getByLabel("Persönlicher Zugang")).toHaveValue("");
          await page
            .getByLabel("Persönlicher Zugang")
            .selectOption(credentialId);
        }
        await expect(
          page.getByLabel("Gespeicherte Konfiguration", { exact: true }),
        ).toHaveValue(configurationId);
        await expect(page.getByLabel("Persönlicher Zugang")).toHaveValue(
          credentialId,
        );
        expect(stored).toBe(false);
        expect(planned).toBe(false);
      }
      await page.getByText(/^State-Backend ·/).click();
      if (!useS3) {
        await expect(
          page.getByText("Accelerator-Standard", { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByText("Management-State-Bucket · Anlage im ersten Apply", {
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByText("terraform.tfstate", { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByLabel("S3 Access Key", { exact: true }),
        ).not.toBeVisible();
      }
      if (useS3) {
        await expect(
          page.getByLabel("Backend der Landing Zone", { exact: true }),
        ).toHaveValue(backendId);
        await expect(
          page.getByLabel("Backend der Landing Zone", { exact: true }),
        ).toBeDisabled();
      }
      await page.getByLabel("Persönlicher Zugang").selectOption(credentialId);
      await page
        .getByRole("button", {
          name: "Zugang prüfen und Vorbereitung speichern",
        })
        .click();
      await expect(page.getByRole("status")).toContainText(
        "Es wurde kein Plan oder Apply ausgeführt",
      );
      await page
        .getByRole("button", { name: "Weiter zu Plan", exact: true })
        .click();
      await page
        .getByLabel("Gespeicherte Vorbereitung", { exact: true })
        .selectOption(preparationId);
      await page
        .getByRole("checkbox", {
          name: /Ich bestätige: Zielorganisation und State-Zuordnung/,
        })
        .check();
      await page
        .getByRole("button", { name: "Plattform planen", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Weiter zu Apply", exact: true })
        .click();
      await expect(
        page.getByText(artifactSha256, { exact: true }),
      ).toBeVisible();
      await expect(page.getByText("Gültig bis", { exact: true })).toBeVisible();
      await expect(page.getByText("12", { exact: true })).toBeVisible();
      if (useS3)
        await expect(
          page
            .getByRole("region", { name: "Plan prüfen und freigeben" })
            .getByText("customer-tfstate / terraform.tfstate", { exact: true }),
        ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Freigegebenen Plan anwenden" }),
      ).toBeDisabled();
      expect(githubRequests).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath("database-plan-preview.png"),
        fullPage: true,
      });
    });
  }

  test("registers an S3 backend and downloads only portable backend metadata", async ({
    page,
  }, testInfo) => {
    const githubRequests = await setup(page);
    const backendId = "77777777-2222-4333-8444-555555555555";
    const descriptor = {
      bucket: "customer-tfstate",
      endpoint: "https://object.storage.eu01.onstackit.cloud",
      region: "eu01",
      key: "terraform.tfstate",
      useLockfile: true,
    };
    const { s3BackendConfiguration } = await import("@lzc/contracts");
    let registered = false;
    await page.route("**/api/v1/backends", (route) => {
      if (route.request().method() === "POST") {
        expect(route.request().headers()["x-lzc-csrf"]).toBe("csrf-apply");
        expect(route.request().postDataJSON()).toEqual({
          descriptor,
          credentials: {
            accessKeyId: "test-access-id",
            secretAccessKey: "test-secret-value",
          },
        });
        registered = true;
        return route.fulfill({
          status: 201,
          json: { id: backendId, descriptor },
        });
      }
      return route.fulfill({
        json: { backends: registered ? [{ id: backendId, descriptor }] : [] },
      });
    });
    await page.route(`**/api/v1/backends/${backendId}/configuration`, (route) =>
      route.fulfill({
        json: {
          descriptor,
          configuration: s3BackendConfiguration(
            descriptor as Parameters<typeof s3BackendConfiguration>[0],
          ),
        },
      }),
    );
    await page.goto("/deployments");
    await page.getByText(/^State-Backend ·/).click();
    await page
      .getByText("Bestehendes S3-Backend registrieren", { exact: true })
      .click();
    await page.getByLabel("Bucket", { exact: true }).fill(descriptor.bucket);
    await page
      .getByLabel("S3 Access Key", { exact: true })
      .fill("test-access-id");
    await page
      .getByLabel("S3 Secret Access Key", { exact: true })
      .fill("test-secret-value");
    await page
      .getByRole("button", { name: "Backend registrieren", exact: true })
      .click();
    await expect(
      page.getByText("S3-Backend registriert.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByLabel("S3 Access Key", { exact: true })).toHaveValue(
      "",
    );
    await expect(
      page.getByLabel("S3 Secret Access Key", { exact: true }),
    ).toHaveValue("");
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: /Backenddatei herunterladen/ })
      .click();
    const saved = await download;
    expect(saved.suggestedFilename()).toBe("backend.tf.json");
    const path = await saved.path();
    expect(path).toBeTruthy();
    const text = await readFile(path!, "utf8");
    expect(JSON.parse(text).terraform.backend.s3).toMatchObject({
      bucket: descriptor.bucket,
      key: descriptor.key,
      use_lockfile: true,
    });
    expect(text).not.toContain("test-secret-value");
    expect(text).not.toContain("test-access-id");
    await page.reload();
    await page.getByText(/^State-Backend ·/).click();
    await page
      .getByText("Bestehendes S3-Backend registrieren", { exact: true })
      .click();
    await expect(
      page.getByText("customer-tfstate / terraform.tfstate", { exact: true }),
    ).toBeVisible();
    expect(githubRequests).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("s3-backend.png"),
      fullPage: true,
    });
  });

  test("shows saved OpenTofu resource details without changing approval or interpreting output as HTML", async ({
    page,
  }, testInfo) => {
    await setup(page);
    await page.route("**/api/v1/plans", (route) =>
      route.fulfill({ json: { runs: [savedPlan()] } }),
    );
    const text =
      '# module.management.stackit_project.example will be created\n+ resource "stackit_project" "example" {\n  + name = "Customer management"\n  + password = (sensitive value)\n  + description = "<img src=x onerror=alert(1)>"\n}\nPlan: 1 to add, 0 to change, 0 to destroy.';
    await page.route(`**/api/v1/plans/${planId}/output`, (route) => {
      expect(route.request().method()).toBe("GET");
      return route.fulfill({
        json: { text, truncated: false, kind: "saved-plan" },
      });
    });
    await page.goto("/deployments/apply");
    await page.getByText("OpenTofu-Ausgabe", { exact: true }).click();
    const console = page.locator("textarea.plan-console");
    await expect(console).toHaveValue(text);
    await expect(console.locator("img")).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Freigegebenen Plan anwenden",
        exact: true,
      }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await console.screenshot({
      path: testInfo.outputPath("opentofu-plan-details.png"),
    });
  });

  test("follows live OpenTofu output and switches to saved plan details when it finishes", async ({
    page,
  }, testInfo) => {
    await setup(page);
    let finished = false;
    let reads = 0;
    let mutations = 0;
    await page.route("**/api/v1/plans", (route) => {
      if (route.request().method() !== "GET") mutations++;
      return route.fulfill({
        json: {
          runs: [
            {
              ...savedPlan(),
              status: finished ? "succeeded" : "planning",
              summary: finished ? savedPlan().summary : null,
              applyAllowed: false,
            },
          ],
        },
      });
    });
    await page.route(`**/api/v1/plans/${planId}/output`, (route) => {
      reads++;
      if (reads >= 2) finished = true;
      return route.fulfill({
        json: {
          text:
            reads === 1
              ? "module.management.stackit_project.example: Refreshing state..."
              : "module.management.stackit_project.example: Refresh complete\nPlan: 1 to add, 0 to change, 0 to destroy.",
          kind: finished ? "saved-plan" : "live",
          truncated: false,
        },
      });
    });
    await page.goto("/deployments/plan");
    const console = page.locator("textarea.plan-console");
    await expect(console).toHaveValue(/Refreshing state\.\.\./);
    await expect(console).toHaveValue(/Plan: 1 to add/, { timeout: 10000 });
    await expect(
      page
        .locator(".plan-runs > article")
        .getByText("Plan abgeschlossen", { exact: false }),
    ).toBeVisible({ timeout: 10000 });
    expect(reads).toBeGreaterThanOrEqual(2);
    expect(mutations).toBe(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await console.screenshot({
      path: testInfo.outputPath("opentofu-live-output.png"),
    });
  });

  test("follows Apply details through completion and reload without another Apply", async ({
    page,
  }, testInfo) => {
    await setup(page);
    let completed = false;
    let reads = 0;
    let applyCalls = 0;
    await page.route("**/api/v1/plans", (route) =>
      route.fulfill({
        json: {
          runs: [
            {
              ...savedPlan(),
              id: applyId,
              planId,
              operation: "apply",
              status: completed ? "succeeded" : "applying",
              summary: null,
              applyAllowed: false,
              finishedAt: completed ? new Date().toISOString() : null,
            },
          ],
        },
      }),
    );
    await page.route(`**/api/v1/plans/${planId}/apply`, (route) => {
      applyCalls++;
      return route.fulfill({
        status: 409,
        json: { error: "apply_already_started" },
      });
    });
    await page.route(`**/api/v1/plans/${applyId}/output`, (route) => {
      reads++;
      if (reads >= 2) completed = true;
      return route.fulfill({
        json: {
          text: completed
            ? "module.management.stackit_project.example: Creation complete\nApply complete! Resources: 1 added, 0 changed, 0 destroyed.\n$ tofu init -migrate-state\nSuccessfully configured the backend S3"
            : "module.management.stackit_project.example: Creating...",
          truncated: false,
          kind: completed ? "execution" : "live",
        },
      });
    });
    await page.goto("/deployments/apply");
    await expect(page.locator("textarea.plan-console")).toHaveValue(
      /Creating\.\.\./,
    );
    await expect(page.locator("textarea.plan-console")).toHaveValue(
      /Apply complete!/,
      { timeout: 10000 },
    );
    await expect(
      page.getByText("Apply: Änderungen angewendet", { exact: false }),
    ).toBeVisible({ timeout: 10000 });
    await page.reload();
    await page.getByText("OpenTofu-Ausgabe", { exact: true }).click();
    await expect(page.locator("textarea.plan-console")).toHaveValue(
      /Successfully configured the backend S3/,
    );
    await page.getByText("Apply-Nachweise", { exact: true }).click();
    await expect(page.getByText(planId, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Freigegebenen Plan anwenden",
        exact: true,
      }),
    ).toHaveCount(0);
    expect(applyCalls).toBe(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("apply-details-reload.png"),
      fullPage: true,
    });
  });

  test("keeps failed Apply diagnostics after reload and blocks automatic retry", async ({
    page,
  }) => {
    await setup(page);
    let applyCalls = 0;
    await page.route("**/api/v1/plans", (route) =>
      route.fulfill({
        json: {
          runs: [
            {
              ...savedPlan(),
              id: applyId,
              planId,
              operation: "apply",
              status: "recovery_required",
              errorCode: "state_failed",
              summary: null,
              applyAllowed: false,
            },
          ],
        },
      }),
    );
    await page.route(`**/api/v1/plans/${applyId}/output`, (route) =>
      route.fulfill({
        json: {
          text: "Error: Backend migration failed after resources were created.\nNo automatic retry.",
          kind: "execution",
          truncated: false,
        },
      }),
    );
    await page.route(`**/api/v1/plans/${planId}/apply`, (route) => {
      applyCalls++;
      return route.fulfill({
        status: 409,
        json: { error: "recovery_required" },
      });
    });
    await page.goto("/deployments/apply");
    await page.getByText("OpenTofu-Ausgabe", { exact: true }).click();
    await expect(page.locator("textarea.plan-console")).toHaveValue(
      /Backend migration failed/,
    );
    await page.reload();
    await page.getByText("OpenTofu-Ausgabe", { exact: true }).click();
    await expect(page.locator("textarea.plan-console")).toHaveValue(
      /No automatic retry/,
    );
    await expect(
      page.getByRole("button", {
        name: "Freigegebenen Plan anwenden",
        exact: true,
      }),
    ).toHaveCount(0);
    expect(applyCalls).toBe(0);
  });

  test("requires exact organization and unchecked approval, sends one explicit POST and exports contract", async ({
    page,
  }, testInfo) => {
    await setup(page);
    const plan = savedPlan();
    let applied = false;
    let calls = 0;
    await page.route("**/api/v1/plans", (route) =>
      route.fulfill({
        json: {
          runs: [
            plan,
            ...(applied
              ? [
                  {
                    ...plan,
                    id: applyId,
                    planId,
                    operation: "apply",
                    status: "succeeded",
                    applyAllowed: false,
                  },
                ]
              : []),
          ],
        },
      }),
    );
    await page.route(`**/api/v1/plans/${planId}/apply`, (route) => {
      calls++;
      expect(route.request().method()).toBe("POST");
      expect(route.request().postDataJSON()).toEqual({
        artifactSha256,
        organizationId,
        confirmApply: true,
      });
      expect(route.request().headers()["x-lzc-csrf"]).toBe("csrf-apply");
      applied = true;
      return route.fulfill({ status: 202, json: { id: applyId } });
    });
    const contract = {
      schema_version: 1,
      organization_id: organizationId,
      targets: {
        public: {
          folder_id: "77777777-2222-4333-8444-555555555555",
          region: "eu01",
          corporate: false,
          network_area_id: null,
          firewall_next_hop_ip: null,
          ipv4_nameservers: null,
        },
      },
    };
    await page.route(`**/api/v1/plans/${applyId}/outputs`, (route) =>
      route.fulfill({ json: { applicationPlatformContract: contract } }),
    );
    await page.goto("/deployments/apply");
    const button = page.getByRole("button", {
      name: "Freigegebenen Plan anwenden",
    });
    const approval = page.getByRole("checkbox", {
      name: "Änderungen und Zielorganisation geprüft",
      exact: true,
    });
    await expect(approval).not.toBeChecked();
    await page
      .getByLabel("Zielorganisation UUID bestätigen")
      .fill(organizationId);
    await expect(button).toBeDisabled();
    await approval.check();
    await page
      .getByLabel("Zielorganisation UUID bestätigen")
      .fill("99999999-2222-4333-8444-555555555555");
    await expect(button).toBeDisabled();
    await page
      .getByLabel("Zielorganisation UUID bestätigen")
      .fill(`${organizationId} `);
    await expect(button).toBeDisabled();
    expect(calls).toBe(0);
    await page
      .getByLabel("Zielorganisation UUID bestätigen")
      .fill(organizationId);
    await expect(button).toBeEnabled();
    await page.screenshot({
      path: testInfo.outputPath("explicit-plan-approval.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await button.evaluate((element: HTMLButtonElement) => {
      element.click();
      element.click();
    });
    await expect(page.getByText(/Apply: Änderungen angewendet/)).toBeVisible();
    expect(calls).toBe(1);
    await expect(button).toHaveCount(0);
    await expect(
      page.getByText("Änderungen geplant – nichts angewendet.", {
        exact: true,
      }),
    ).toHaveCount(0);
    await page.reload();
    await expect(button).toHaveCount(0);
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Plattformvertrag exportieren" })
      .click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(
      `application-platform-contract-${applyId}.json`,
    );
    const downloadPath = await download.path();
    expect(JSON.parse(await readFile(downloadPath as string, "utf8"))).toEqual(
      contract,
    );
    await page.screenshot({
      path: testInfo.outputPath("apply-contract-export.png"),
      fullPage: true,
    });
  });

  for (const [code, message] of [
    ["stale_plan", "nicht mehr aktuell"],
    ["plan_expired", "abgelaufen"],
    ["credential_changed", "Zugang wurde geändert"],
    ["state_changed", "State wurde geändert"],
    ["invalid_plan_request", "Freigabe wurde abgewiesen"],
    ["apply_already_started", "bereits für Apply verwendet"],
    ["recovery_required", "benötigt Wiederherstellung"],
    ["not_found", "nicht verfügbar"],
    ["execution_disabled", "nicht aktiviert"],
    ["plan_not_approvable", "nicht mehr freigabefähig"],
    ["organization_mismatch", "stimmt nicht"],
    ["artifact_invalid", "Plan-Artefakt konnte nicht bestätigt"],
    ["state_locked", "State ist durch eine andere Ausführung gesperrt"],
  ]) {
    test(`blocks replay after ${code}`, async ({ page }) => {
      await setup(page);
      await page.route("**/api/v1/plans", (route) =>
        route.fulfill({ json: { runs: [savedPlan()] } }),
      );
      let calls = 0;
      await page.route(`**/api/v1/plans/${planId}/apply`, (route) => {
        calls++;
        return route.fulfill({
          status: code === "not_found" ? 404 : 409,
          json: { error: code },
        });
      });
      await page.goto("/deployments/apply");
      await approve(page);
      await page
        .getByRole("button", { name: "Freigegebenen Plan anwenden" })
        .click();
      await expect(page.getByRole("alert")).toContainText(message as string);
      await expect(
        page.getByRole("button", { name: "Freigegebenen Plan anwenden" }),
      ).toHaveCount(0);
      await page
        .getByRole("navigation", { name: "Konfiguration", exact: true })
        .getByRole("button", { name: "Plan", exact: true })
        .click();
      await page.getByText("Neuen Plan erstellen", { exact: true }).click();
      await page
        .getByLabel("Gespeicherte Vorbereitung", { exact: true })
        .selectOption(preparationId);
      await page
        .getByRole("navigation", { name: "Konfiguration", exact: true })
        .getByRole("button", { name: "Apply", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Ausführungsstatus aktualisieren" })
        .click();
      await expect(
        page.getByRole("button", { name: "Freigegebenen Plan anwenden" }),
      ).toHaveCount(0);
      expect(calls).toBe(1);
      await expect(page.getByText(/Apply: Änderungen angewendet/)).toHaveCount(
        0,
      );
    });
  }

  test("destructive plan needs extra approval and resets confirmations on hash and preparation changes", async ({
    page,
  }) => {
    await setup(page);
    const plan = {
      ...savedPlan(),
      summary: {
        ...summary,
        destructive: true,
        resources: { ...summary.resources, delete: 1, replace: 2 },
      },
    };
    await page.route("**/api/v1/plans", (route) =>
      route.fulfill({ json: { runs: [plan] } }),
    );
    await page.goto("/deployments/apply");
    await approve(page);
    const button = page.getByRole("button", {
      name: "Freigegebenen Plan anwenden",
    });
    await expect(button).toBeDisabled();
    await expect(page.getByRole("alert")).toContainText("unwiederbringlich");
    await page
      .getByRole("checkbox", {
        name: "Löschungen und Ersetzungen ausdrücklich freigegeben",
      })
      .check();
    await expect(button).toBeEnabled();
    plan.artifactSha256 = "e".repeat(64);
    await page
      .getByRole("button", { name: "Ausführungsstatus aktualisieren" })
      .click();
    await expect(
      page.getByRole("checkbox", {
        name: "Änderungen und Zielorganisation geprüft",
        exact: true,
      }),
    ).not.toBeChecked();
    await expect(
      page.getByLabel("Zielorganisation UUID bestätigen"),
    ).toHaveValue("");
    await approve(page);
    await page
      .getByRole("navigation", { name: "Konfiguration", exact: true })
      .getByRole("button", { name: "Plan", exact: true })
      .click();
    await page.getByText("Neuen Plan erstellen", { exact: true }).click();
    await page
      .getByLabel("Gespeicherte Vorbereitung", { exact: true })
      .selectOption(preparationId);
    await page
      .getByRole("navigation", { name: "Konfiguration", exact: true })
      .getByRole("button", { name: "Apply", exact: true })
      .click();
    await expect(
      page.getByRole("checkbox", {
        name: "Änderungen und Zielorganisation geprüft",
        exact: true,
      }),
    ).not.toBeChecked();
  });

  test("expiry closes an already approved review and idle polling stops", async ({
    page,
  }) => {
    await setup(page);
    await page.clock.install();
    const plan = savedPlan();
    plan.expiresAt = new Date(Date.now() + 60000).toISOString();
    let reads = 0;
    let writes = 0;
    await page.route("**/api/v1/plans", (route) => {
      reads++;
      return route.fulfill({ json: { runs: [plan] } });
    });
    await page.route(`**/api/v1/plans/${planId}/apply`, (route) => {
      writes++;
      return route.fulfill({
        status: 500,
        json: { error: "unexpected_apply" },
      });
    });
    await page.goto("/deployments/apply");
    await approve(page);
    await expect(
      page.getByRole("button", { name: "Freigegebenen Plan anwenden" }),
    ).toBeEnabled();
    const initialReads = reads;
    await page.clock.fastForward(61000);
    await expect(
      page.getByRole("button", { name: "Freigegebenen Plan anwenden" }),
    ).toHaveCount(0);
    await page
      .getByRole("navigation", { name: "Konfiguration", exact: true })
      .getByRole("button", { name: "Plan", exact: true })
      .click();
    await expect(
      page.getByText("Plan-Historie (1)", { exact: true }),
    ).toBeVisible();
    await page.getByText("Plan-Historie (1)", { exact: true }).click();
    await page.locator(".plan-runs > details > details > summary").click();
    await expect(
      page.getByText(/Plan abgelaufen oder keine Gültigkeit bestätigt/),
    ).toBeVisible();
    expect(reads).toBe(initialReads);
    expect(writes).toBe(0);
  });

  test("active polling stops when apply fails and never reports success", async ({
    page,
  }) => {
    await setup(page);
    await page.clock.install();
    let status = "applying";
    let reads = 0;
    await page.route("**/api/v1/plans", (route) => {
      reads++;
      return route.fulfill({
        json: {
          runs: [
            {
              ...savedPlan(),
              id: applyId,
              planId,
              operation: "apply",
              status,
              errorCode: status === "failed" ? "apply_failed" : null,
            },
          ],
        },
      });
    });
    await page.goto("/deployments/apply");
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: /Änderungen werden angewendet/ }),
    ).toBeVisible();
    status = "failed";
    await page.clock.fastForward(5000);
    await expect(
      page.getByText(/Apply: Ausführung fehlgeschlagen/),
    ).toBeVisible();
    const finishedReads = reads;
    await page.clock.fastForward(30000);
    expect(reads).toBe(finishedReads);
    await expect(page.getByText(/Apply: Änderungen angewendet/)).toHaveCount(0);
  });

  for (const status of [
    "starting",
    "initializing",
    "validating",
    "applying",
    "failed",
    "recovery_required",
  ]) {
    test(`apply lifecycle ${status} is distinct and cannot cancel or export`, async ({
      page,
    }) => {
      await setup(page);
      await page.route("**/api/v1/plans", (route) =>
        route.fulfill({
          json: {
            runs: [
              {
                ...savedPlan(),
                id: applyId,
                planId,
                operation: "apply",
                status,
                errorCode: status === "failed" ? "apply_failed" : null,
              },
            ],
          },
        }),
      );
      await page.goto("/deployments/apply");
      await expect(
        page.getByText(
          "Diese Ausführung kann Cloud-Ressourcen bereits verändert haben. Prüfe den Status vor weiteren Aktionen.",
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: /Plan abbrechen|Freigegebenen Plan anwenden|Plattformvertrag exportieren/,
        }),
      ).toHaveCount(0);
      await expect(
        page.getByText("Änderungen geplant – nichts angewendet.", {
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(page.getByText(/Apply: Änderungen angewendet/)).toHaveCount(
        0,
      );
      if (status === "failed")
        await expect(page.getByText(/Apply ist fehlgeschlagen/)).toBeVisible();
      if (status === "recovery_required")
        await expect(
          page
            .locator(".plan-runs > article")
            .getByText(/Apply: Wiederherstellung erforderlich/),
        ).toBeVisible();
    });
  }

  test("deployment steps isolate preparation, plan and apply without automatic execution or retained approval", async ({
    page,
  }, testInfo) => {
    await setup(page);
    let mutations = 0;
    await page.route("**/api/v1/plans", (route) => {
      if (route.request().method() !== "GET") mutations++;
      return route.fulfill({ json: { runs: [savedPlan()] } });
    });
    await page.route(`**/api/v1/plans/${planId}/apply`, (route) => {
      mutations++;
      return route.fulfill({
        status: 500,
        json: { error: "unexpected_apply" },
      });
    });
    await page.goto("/deployments");
    const tabs = page.getByRole("navigation", {
      name: "Konfiguration",
      exact: true,
    });
    await expect(tabs.getByRole("button")).toHaveText([
      "Konfiguration",
      "Vorbereitung",
      "Plan",
      "Apply",
      "Verlauf",
    ]);
    await expect(
      page.getByRole("button", { name: "Plattform planen", exact: true }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Freigegebenen Plan anwenden" }),
    ).toHaveCount(0);
    await page
      .getByLabel("Vorbereitung auswählen", { exact: true })
      .selectOption(preparationId);
    await expect(
      page.getByText("Anmeldung erfolgreich · Organisation lesbar", {
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("deployment-preparation.png"),
    });
    await page
      .getByRole("button", { name: "Weiter zu Plan", exact: true })
      .click();
    await expect(page).toHaveURL(/\/deployments\/plan$/);
    await expect(
      page.getByLabel("Gespeicherte Vorbereitung", { exact: true }),
    ).toHaveValue(preparationId);
    await expect(
      page.getByRole("button", {
        name: "Gespeicherte Konfiguration auswählen",
      }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Freigegebenen Plan anwenden" }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Änderungen geplant – nichts angewendet.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Weiter zu Apply", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: testInfo.outputPath("deployment-plan.png") });
    await page
      .getByRole("button", { name: "Weiter zu Apply", exact: true })
      .click();
    await expect(page).toHaveURL(/\/deployments\/apply$/);
    const approval = page.getByRole("checkbox", {
      name: "Änderungen und Zielorganisation geprüft",
      exact: true,
    });
    await expect(approval).not.toBeChecked();
    await expect(
      page.getByRole("button", { name: "Plattform planen", exact: true }),
    ).not.toBeVisible();
    await expect(
      page.getByLabel("Gespeicherte Konfiguration", { exact: true }),
    ).not.toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("deployment-apply.png"),
    });
    await page
      .getByLabel("Zielorganisation UUID bestätigen")
      .fill(organizationId);
    await approval.check();
    await expect(
      page.getByRole("button", { name: "Freigegebenen Plan anwenden" }),
    ).toBeEnabled();
    await tabs.getByRole("button", { name: "Plan", exact: true }).click();
    await tabs.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(approval).not.toBeChecked();
    await tabs.getByRole("button", { name: "Verlauf", exact: true }).click();
    await expect(page).toHaveURL(/\/deployments\/history$/);
    await expect(
      page.getByRole("button", { name: "Freigegebenen Plan anwenden" }),
    ).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/deployments\/apply$/);
    await expect(approval).not.toBeChecked();
    await page.reload();
    await expect(page).toHaveURL(/\/deployments\/apply$/);
    await expect(approval).not.toBeChecked();
    expect(mutations).toBe(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });

  test("old and expired plans stay collapsed while current and recovery runs remain visible", async ({
    page,
  }, testInfo) => {
    await setup(page);
    const now = Date.now();
    await page.clock.install({ time: new Date(now) });
    const newerPreparationId = "77777777-2222-4333-8444-555555555555";
    const current = {
      ...savedPlan(),
      preparationId: newerPreparationId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 10000).toISOString(),
    };
    const previous = {
      ...savedPlan(),
      id: "88888888-2222-4333-8444-555555555555",
      createdAt: new Date(now - 1000).toISOString(),
    };
    const expiredPlan = {
      ...savedPlan(),
      id: "99999999-2222-4333-8444-555555555555",
      createdAt: new Date(now - 2000).toISOString(),
      expiresAt: new Date(now - 1000).toISOString(),
    };
    const failed = {
      ...savedPlan(),
      id: "aaaaaaaa-2222-4333-8444-555555555555",
      operation: "apply",
      status: "failed",
      summary: null,
      errorCode: "apply_failed",
      createdAt: new Date(now - 3000).toISOString(),
    };
    const recovery = {
      ...savedPlan(),
      id: applyId,
      operation: "apply",
      status: "recovery_required",
      createdAt: new Date(now - 4000).toISOString(),
    };
    await page.route("**/api/v1/preparations", (route) =>
      route.fulfill({
        json: {
          preparations: [
            preparation,
            {
              ...preparation,
              id: newerPreparationId,
              name: "Aktuelle Vorbereitung",
            },
          ],
        },
      }),
    );
    await page.route("**/api/v1/plans", (route) => {
      expect(route.request().method()).toBe("GET");
      return route.fulfill({
        json: { runs: [failed, previous, recovery, expiredPlan, current] },
      });
    });
    await page.goto("/deployments/plan");
    await page.getByText("Neuen Plan erstellen", { exact: true }).click();
    await expect(page.locator(".plan-runs > article")).toHaveCount(2);
    await expect(
      page
        .locator(".plan-runs > article")
        .getByText(/Apply: Wiederherstellung erforderlich/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Plattform planen", exact: true }),
    ).toBeDisabled();
    const history = page
      .locator(".plan-runs > details")
      .filter({ has: page.getByText(/^Plan-Historie \(\d+\)$/) });
    await expect(history.locator(":scope > summary")).toHaveText(
      "Plan-Historie (2)",
    );
    await expect(history).not.toHaveAttribute("open");
    await expect(history.locator("article")).toHaveCount(0);
    await history.locator(":scope > summary").click();
    await expect(history.locator(":scope > details")).toHaveCount(2);
    await expect(
      history.getByRole("button", { name: "Freigegebenen Plan anwenden" }),
    ).toHaveCount(0);
    const expiredEntry = history
      .locator(":scope > details")
      .filter({ hasText: "Abgelaufen" });
    await expiredEntry.locator(":scope > summary").click();
    await expect(
      expiredEntry.getByText(/Plan abgelaufen oder keine Gültigkeit bestätigt/),
    ).toBeVisible();
    await expect(
      expiredEntry.getByRole("button", { name: "Freigegebenen Plan anwenden" }),
    ).toHaveCount(0);
    await page.clock.fastForward(10001);
    await expect(page.locator(".plan-runs > article")).toHaveCount(1);
    await expect(history.locator(":scope > summary")).toHaveText(
      "Plan-Historie (3)",
    );
    await expect(
      page
        .locator(".plan-runs > article")
        .getByText(/Apply: Wiederherstellung erforderlich/),
    ).toBeVisible();
    await history.locator(":scope > summary").click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("collapsed-plan-history.png"),
      fullPage: true,
    });
    const tabs = page.getByRole("navigation", {
      name: "Konfiguration",
      exact: true,
    });
    await tabs.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(
      page.getByText("Plan-Historie (3)", { exact: true }),
    ).toHaveCount(0);
    await page.getByText("Apply-Historie (1)", { exact: true }).click();
    await expect(
      page
        .locator(".plan-runs > details")
        .filter({ has: page.getByText("Apply-Historie (1)", { exact: true }) })
        .locator(":scope > details"),
    ).toHaveCount(1);
    await tabs.getByRole("button", { name: "Verlauf", exact: true }).click();
    await expect(page.getByText(/^(Plan|Apply)-Historie \(/)).toHaveCount(0);
    await expect(page.locator(".plan-runs > details.project-form")).toHaveCount(
      4,
    );
    await expect(page.locator(".plan-runs > article")).toHaveCount(1);
  });

  test("legacy summary cannot grant apply, expired plan and invalid export stay unavailable", async ({
    page,
  }) => {
    await setup(page);
    const plan = {
      ...savedPlan(),
      applyAllowed: false,
      summary: { ...summary, applyAllowed: true },
    };
    await page.route("**/api/v1/plans", (route) =>
      route.fulfill({ json: { runs: [plan] } }),
    );
    await page.goto("/deployments/apply");
    await expect(page.getByText(/nicht vom Server freigegeben/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Freigegebenen Plan anwenden" }),
    ).toHaveCount(0);
    plan.applyAllowed = true;
    plan.expiresAt = new Date(Date.now() - 1000).toISOString();
    await page
      .getByRole("button", { name: "Ausführungsstatus aktualisieren" })
      .click();
    await page
      .getByRole("navigation", { name: "Konfiguration", exact: true })
      .getByRole("button", { name: "Plan", exact: true })
      .click();
    await page.getByText("Plan-Historie (1)", { exact: true }).click();
    await page.locator(".plan-runs > details > details > summary").click();
    await expect(
      page.getByText(/Plan abgelaufen oder keine Gültigkeit bestätigt/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Freigegebenen Plan anwenden" }),
    ).toHaveCount(0);
    await page.route("**/api/v1/plans", (route) =>
      route.fulfill({
        json: {
          runs: [
            { ...plan, id: applyId, operation: "apply", status: "succeeded" },
          ],
        },
      }),
    );
    await page.route(`**/api/v1/plans/${applyId}/outputs`, (route) =>
      route.fulfill({ status: 404, json: { error: "not_found" } }),
    );
    await page
      .getByRole("navigation", { name: "Konfiguration", exact: true })
      .getByRole("button", { name: "Apply", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Ausführungsstatus aktualisieren" })
      .click();
    await page
      .getByRole("button", { name: "Plattformvertrag exportieren" })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "keine State-Daten exportiert",
    );
    let downloads = 0;
    page.on("download", () => downloads++);
    await page.route(`**/api/v1/plans/${applyId}/outputs`, (route) =>
      route.fulfill({
        json: { resources: [], outputs: {}, credentials: "must-not-export" },
      }),
    );
    await page
      .getByRole("button", { name: "Plattformvertrag exportieren" })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "Plattformvertrag ist ungültig",
    );
    await expect(
      page.getByText("must-not-export", { exact: false }),
    ).toHaveCount(0);
    expect(downloads).toBe(0);
  });
});
