import {
  type CommonConfiguration,
  createEditorConfiguration,
  editCommonInput,
} from "@lzc/domain";
import { legacyAccessTemplate } from "../tests/fixtures/application-access-transition";
import { expect, type Page, test } from "./fixtures";

const userId = "11111111-1111-4111-8111-111111111111";
const tenantId = "22222222-2222-4222-8222-222222222222";
const organizationId = "33333333-3333-4333-8333-333333333333";
const configurationId = "44444444-4444-4444-8444-444444444444";
const contractRevision = "55555555-5555-4555-8555-555555555555";

function platformConfiguration(): CommonConfiguration {
  return editCommonInput(
    {
      ...createEditorConfiguration("standalone", configurationId),
      name: "Existing platform workflow",
      projectTemplates: [structuredClone(legacyAccessTemplate)],
    },
    "organization_id",
    organizationId,
  );
}

async function mockWorkspace(page: Page, owner = false) {
  let stored = platformConfiguration();
  let revision = 1;
  const writes: string[] = [];
  const executionWrites: string[] = [];
  const privateReads: string[] = [];
  const tenant = {
    id: tenantId,
    name: "Workflow workspace",
    kind: "organisation",
    roles: [owner ? "application-owner" : "platform-engineer"],
    manageMembers: !owner,
  };
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      request.method() !== "GET" &&
      (/^\/api\/v1\/(preparations|plans)(?:\/|$)/.test(path) ||
        /^\/api\/v1\/applications\//.test(path))
    )
      executionWrites.push(`${request.method()} ${path}`);
    if (
      owner &&
      request.method() === "GET" &&
      /^\/api\/v1\/(configurations|credentials|preparations)(?:\/|$)/.test(path)
    )
      privateReads.push(path);
  });
  await page.route("**/auth/status", (route) =>
    route.fulfill({
      json: { stackit: true, github: false, primary: "stackit" },
    }),
  );
  await page.route("**/api/v1/session", (route) =>
    route.fulfill({
      json: {
        user: { id: userId, login: "workflow@example.test" },
        tenant,
        csrfToken: "csrf-workflow",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    }),
  );
  await page.route("**/api/v1/organisation", (route) =>
    route.fulfill({
      json: {
        userId,
        activeTenantId: tenantId,
        tenants: [tenant],
        members: [],
      },
    }),
  );
  await page.route("**/api/v1/configurations", (route) => {
    expect(route.request().method()).toBe("GET");
    return route.fulfill({
      json: {
        configurations: [
          {
            id: configurationId,
            name: stored.name,
            revision,
            updatedAt: "2026-10-26T10:00:00.000Z",
          },
        ],
      },
    });
  });
  await page.route(`**/api/v1/configurations/${configurationId}`, (route) => {
    if (route.request().method() === "PUT") {
      expect(owner).toBe(false);
      expect(route.request().headers()["x-lzc-csrf"]).toBe("csrf-workflow");
      const input = route.request().postDataJSON();
      expect(input.revision).toBe(revision);
      stored = input.draft;
      revision++;
      writes.push("configuration-save");
    } else expect(route.request().method()).toBe("GET");
    return route.fulfill({
      json: {
        configuration: {
          id: configurationId,
          name: stored.name,
          revision,
          draft: stored,
        },
      },
    });
  });
  await page.route("**/api/v1/applications/**", (route) => {
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers()["x-lzc-tenant"]).toBe(tenantId);
    const path = new URL(route.request().url()).pathname.replace(
      "/api/v1/applications/",
      "",
    );
    if (path === "templates") return route.fulfill({ json: { versions: [] } });
    if (path === "instances") return route.fulfill({ json: { instances: [] } });
    expect(path).toBe("platform-contracts");
    return route.fulfill({
      json: {
        contracts: [
          {
            document: {
              schema_version: 1,
              tenant_id: tenantId,
              revision: contractRevision,
              organization_id: organizationId,
              targets: {
                corporate: {
                  folder_id: "existing-corporate-folder",
                  region: "eu01",
                  corporate: true,
                  network_area_id: contractRevision,
                  firewall_next_hop_ip: "10.0.1.4",
                  ipv4_nameservers: null,
                },
              },
            },
            approvedBy: userId,
            approvedAt: "2026-10-26T10:00:00.000Z",
          },
        ],
      },
    });
  });
  return {
    writes,
    executionWrites,
    privateReads,
    stored: () => stored,
    revision: () => revision,
  };
}

test("Platform Owner edits the same saved configuration inline before platform binding and publication", async ({
  page,
}) => {
  const state = await mockWorkspace(page);
  await page.goto("/configurations");
  await page
    .getByRole("button", {
      name: "Konfiguration öffnen: Existing platform workflow",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/configurations\/edit\/basics$/);
  const navigation = page.getByRole("navigation", {
    name: "Hauptnavigation",
    exact: true,
  });
  await expect(
    navigation.getByRole("button", { name: "Konfigurationen", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    navigation.getByRole("button", { name: "Deployments", exact: true }),
  ).not.toHaveAttribute("aria-current", "page");
  const workflow = page.getByRole("navigation", {
    name: "Konfiguration",
    exact: true,
  });
  await expect(
    workflow.getByRole("button", { name: "Plan", exact: true }),
  ).toHaveCount(0);
  await expect(
    workflow.getByRole("button", { name: "Apply", exact: true }),
  ).toHaveCount(0);
  await navigation
    .getByRole("button", { name: "Application Landing Zones", exact: true })
    .click();
  const tabs = page.getByRole("tablist", {
    name: "Application Landing Zones",
    exact: true,
  });
  await expect(tabs.getByRole("tab")).toHaveText([
    "Template-Entwürfe",
    "Plattformanbindung",
    "Veröffentlichung",
    "Katalog",
    "Bestellungen",
    "Archiv",
  ]);
  await expect(
    tabs.getByRole("tab", { name: "Template-Entwürfe", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  const drafts = page.getByRole("tabpanel", {
    name: "Template-Entwürfe",
    exact: true,
  });
  await expect(drafts).toContainText("Existing platform workflow");
  const templateName = drafts.getByLabel("Name des Templates", { exact: true });
  await expect(templateName).toHaveValue(legacyAccessTemplate.name);
  const next = drafts.getByRole("button", {
    name: "Weiter: Plattformanbindung",
    exact: true,
  });
  await expect(next).toBeEnabled();
  await templateName.fill("Reviewed corporate template");
  await expect(next).toBeDisabled();
  await expect(drafts).toContainText("Speichere zuerst die Konfiguration.");
  await drafts
    .getByRole("button", { name: "Konfiguration speichern", exact: true })
    .click();
  await expect.poll(() => state.writes.length).toBe(1);
  await expect(next).toBeEnabled();
  const expected = platformConfiguration();
  const template = expected.projectTemplates?.[0];
  if (!template) throw new Error("Expected template");
  template.name = "Reviewed corporate template";
  expect(state.stored()).toEqual(expected);
  expect(state.revision()).toBe(2);
  expect(state.executionWrites).toEqual([]);
  await page.reload();
  const restoredDrafts = page.getByRole("tabpanel", {
    name: "Template-Entwürfe",
    exact: true,
  });
  await expect(
    restoredDrafts.getByLabel("Name des Templates", { exact: true }),
  ).toHaveValue("Reviewed corporate template");
  const restoredNext = restoredDrafts.getByRole("button", {
    name: "Weiter: Plattformanbindung",
    exact: true,
  });
  await expect(restoredNext).toBeEnabled();
  await restoredNext.click();
  await expect(
    page.getByRole("heading", {
      name: "2. Plattform anbinden und Ausführung einrichten",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Weiter: Veröffentlichung", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "3. Application Landing Zone Template veröffentlichen",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Weiter: Katalog prüfen", exact: true })
    .click();
  await expect(
    tabs.getByRole("tab", { name: "Katalog", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect(state.writes).toEqual(["configuration-save"]);
  expect(state.executionWrites).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("Application Owner receives the catalogue without platform editor, binding or publication controls", async ({
  page,
}) => {
  const state = await mockWorkspace(page, true);
  await page.goto("/applications");
  const tabs = page.getByRole("tablist", {
    name: "Application Landing Zones",
    exact: true,
  });
  await expect(tabs.getByRole("tab")).toHaveText(["Katalog", "Bestellungen"]);
  await expect(
    tabs.getByRole("tab", { name: "Katalog", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#application-panel-drafts")).toHaveCount(0);
  await expect(page.locator("#application-panel-platform")).toHaveCount(0);
  await expect(page.locator("#application-panel-publish")).toHaveCount(0);
  await expect(
    page.getByLabel("Name des Templates", { exact: true }),
  ).toHaveCount(0);
  expect(state.privateReads).toEqual([]);
  expect(state.writes).toEqual([]);
  expect(state.executionWrites).toEqual([]);
});

test("Configurations resumes editing and only confirms losing a changed draft", async ({
  page,
}) => {
  const state = await mockWorkspace(page);
  const dialogs: string[] = [];
  let discard = false;
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    if (discard) await dialog.accept();
    else await dialog.dismiss();
  });
  await page.goto("/configurations");
  const open = () =>
    page
      .getByRole("button", {
        name: "Konfiguration öffnen: Existing platform workflow",
        exact: true,
      })
      .click();
  await open();
  const name = page.getByRole("textbox", {
    name: "Name der Konfiguration",
    exact: true,
  });
  await expect(name).toHaveValue("Existing platform workflow");
  const navigation = page.getByRole("navigation", {
    name: "Hauptnavigation",
    exact: true,
  });
  await navigation
    .getByRole("button", { name: "Application Landing Zones", exact: true })
    .click();
  await navigation
    .getByRole("button", { name: "Konfigurationen", exact: true })
    .click();
  await expect(page).toHaveURL(/\/configurations\/edit\/basics$/);
  await expect(name).toHaveValue("Existing platform workflow");
  const showList = () =>
    page
      .getByRole("navigation", { name: "Brotkrumennavigation", exact: true })
      .getByRole("link", { name: "Konfigurationen", exact: true })
      .click();
  await showList();
  await open();
  await expect(name).toHaveValue("Existing platform workflow");
  expect(dialogs).toEqual([]);
  await name.fill("Unsaved platform draft");
  await showList();
  await open();
  await expect.poll(() => dialogs.length).toBe(1);
  await expect(page).toHaveURL(/\/configurations$/);
  await page
    .getByRole("button", {
      name: "Unsaved platform draft weiterbearbeiten",
      exact: true,
    })
    .click();
  await expect(name).toHaveValue("Unsaved platform draft");
  await expect(
    page.getByRole("button", { name: "Deployment vorbereiten", exact: true }),
  ).toBeDisabled();
  await showList();
  discard = true;
  await open();
  await expect(name).toHaveValue("Existing platform workflow");
  await expect(
    page.getByRole("button", { name: "Deployment vorbereiten", exact: true }),
  ).toBeEnabled();
  expect(dialogs).toHaveLength(2);
  expect(state.writes).toEqual([]);
  expect(state.executionWrites).toEqual([]);
  expect(state.revision()).toBe(1);
});

test("configuration reopen protects edits made during its read and skips confirmation for equal saved content", async ({
  page,
}) => {
  const state = await mockWorkspace(page);
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await page.goto("/configurations");
  const open = () =>
    page
      .getByRole("button", {
        name: "Konfiguration öffnen: Existing platform workflow",
        exact: true,
      })
      .click();
  const showList = () =>
    page
      .getByRole("navigation", { name: "Brotkrumennavigation", exact: true })
      .getByRole("link", { name: "Konfigurationen", exact: true })
      .click();
  await open();
  const name = page.getByRole("textbox", {
    name: "Name der Konfiguration",
    exact: true,
  });
  await expect(name).toHaveValue("Existing platform workflow");
  await showList();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    `**/api/v1/configurations/${configurationId}`,
    async (route) => {
      expect(route.request().method()).toBe("GET");
      await gate;
      return route.fulfill({
        json: {
          configuration: {
            id: configurationId,
            name: state.stored().name,
            revision: 1,
            draft: state.stored(),
          },
        },
      });
    },
  );
  const pendingRead = page.waitForRequest(
    `**/api/v1/configurations/${configurationId}`,
  );
  await open();
  await pendingRead;
  await page
    .getByRole("button", {
      name: "Existing platform workflow weiterbearbeiten",
      exact: true,
    })
    .click();
  await name.fill("Changed while loading");
  release();
  await expect.poll(() => dialogs.length).toBe(1);
  await expect(name).toHaveValue("Changed while loading");
  await expect(
    page.getByRole("button", { name: "Deployment vorbereiten", exact: true }),
  ).toBeDisabled();
  // Another browser saved exactly the current content. It is dirty relative to
  // this tab's old snapshot, but reopening would discard no actual changes.
  const equivalent = { ...state.stored(), name: "Changed while loading" };
  await page.route(`**/api/v1/configurations/${configurationId}`, (route) => {
    expect(route.request().method()).toBe("GET");
    return route.fulfill({
      json: {
        configuration: {
          id: configurationId,
          name: equivalent.name,
          revision: 2,
          draft: equivalent,
        },
      },
    });
  });
  await showList();
  await open();
  await expect(name).toHaveValue("Changed while loading");
  await expect(
    page.getByRole("button", { name: "Deployment vorbereiten", exact: true }),
  ).toBeEnabled();
  expect(dialogs).toHaveLength(1);
  expect(state.writes).toEqual([]);
  expect(state.executionWrites).toEqual([]);
});
