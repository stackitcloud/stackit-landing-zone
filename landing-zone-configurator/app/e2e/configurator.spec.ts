import { readFile } from "node:fs/promises";
import { catalogue, createDraft, savedDraft, type Template } from "@lzc/domain";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/auth/status", (route) =>
    route.fulfill({ json: { github: false } }),
  );
});

test("template catalogue, search and read-only network preview", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Landing Zone Templates" }),
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
    page.getByRole("button", { name: "Mein Entwurf" }),
  ).toBeDisabled();
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
  ).toHaveCount(0);
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
  await page.goto("/");
  await page
    .getByRole("button", { name: "Template ansehen : Standalone", exact: true })
    .click();
  await page.getByRole("button", { name: "Konfiguration erstellen" }).click();
  await page.getByRole("button", { name: "3 Prüfen", exact: true }).click();
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
  await page.getByRole("button", { name: "Weiter zu Projekten" }).click();
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
  await page.getByRole("button", { name: "Entwurf herunterladen" }).click();
  const download = await downloaded;
  const path = await download.path();
  if (!path) throw new Error("No download file");
  const document = JSON.parse(await readFile(path, "utf8"));
  expect(document.kind).toBe("landing-zone-configurator-draft");
  expect(document.template.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(document.configuration.landing_zones["public-exmpl"]).toMatchObject({
    project_name: "Kundenportal",
    corporate: false,
    secretsmanager_enabled: false,
  });
  expect(document.configuration.landing_zones.worker.corporate).toBe(false);
  expect(document.configuration.labels).toEqual({ managed_by: "opentofu" });
  await page.screenshot({
    path: testInfo.outputPath("review.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: /^Templates/ }).click();
  await page
    .getByRole("button", { name: "Template ansehen : Standalone", exact: true })
    .click();
  await expect(page.locator(".topology")).toContainText("External API Gateway");
  await page.getByRole("button", { name: "Mein Entwurf" }).click();
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
  await page.goto("/");
  await page
    .getByRole("button", { name: "Template ansehen : Standalone", exact: true })
    .click();
  await page.getByRole("button", { name: "Konfiguration erstellen" }).click();
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
  await page.getByRole("button", { name: "Konfiguration erstellen" }).click();
  await expect(page).toHaveURL(/\/configurations\/edit\/basics$/);
  await page.getByLabel("Name der Konfiguration").fill("Entwurf mit History");
  await page.getByRole("button", { name: "Weiter zu Projekten" }).click();
  await expect(page).toHaveURL(/\/configurations\/edit\/projects$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/configurations\/edit\/basics$/);
  await expect(page.getByLabel("Name der Konfiguration")).toHaveValue(
    "Entwurf mit History",
  );
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: "Projekte & Sandboxes", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "GitHub-Forks", exact: true }).click();
  await expect(page).toHaveURL(/\/repositories$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/configurations\/edit\/projects$/);
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
      head = "b".repeat(40);
      await route.fulfill({
        status: 409,
        json: { error: "repository_changed" },
      });
    } else {
      expect(body.mode).toBe("create");
      expect(body.head).toBe(head);
      expect(body.document.id).not.toBe(document.id);
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
  await page.getByRole("button", { name: "GitHub-Forks", exact: true }).click();
  await page
    .getByRole("button", { name: "Im Fork speichern", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("inzwischen verändert");
  await page.getByRole("button", { name: "Entwurf bearbeiten" }).click();
  await expect(page.getByLabel("Name der Konfiguration")).toHaveValue(
    "Meine neue Kopie",
  );
  await page.getByRole("button", { name: "GitHub-Forks", exact: true }).click();
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
  await page.reload();
  await page.getByRole("button", { name: "Forks aktualisieren" }).click();
  await page
    .getByRole("button", { name: "alice/accelerator", exact: true })
    .click();
  await page.getByRole("button", { name: "Meine neue Kopie öffnen" }).click();
  await expect(page.getByLabel("Name der Konfiguration")).toHaveValue(
    "Meine neue Kopie",
  );
});
