import { createEditorConfiguration } from "@lzc/domain";
import { mockEmptyApplicationLists } from "./editor-navigation";
import { expect, type Page, test } from "./fixtures";

test.use({ locale: "en-US" });
const userId = "11111111-1111-4111-8111-111111111111";
const tenantId = "22222222-2222-4222-8222-222222222222";
const configurationId = "33333333-3333-4333-8333-333333333333";
const roles = ["platform-engineer", "application-owner"];

async function authenticated(page: Page) {
  await mockEmptyApplicationLists(page);
  await page.route("**/auth/status", (route) =>
    route.fulfill({
      json: { stackit: true, github: false, primary: "stackit" },
    }),
  );
  await page.route("**/api/v1/session", (route) =>
    route.fulfill({
      json: {
        user: { id: userId, login: "owner@example.test" },
        tenant: {
          id: tenantId,
          name: "Vorbereitung",
          kind: "organisation",
          roles,
          manageMembers: true,
        },
        csrfToken: "csrf-locale",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        stackitVerified: true,
      },
    }),
  );
}

for (const [kind, name, english] of [
  ["personal", "Persönlicher Arbeitsbereich", "Personal workspace"],
  [
    "personal",
    "owner@example.test · Persönlicher Arbeitsbereich",
    "owner@example.test · Personal workspace",
  ],
  ["personal", "Vorbereitung", "Vorbereitung"],
  [
    "organisation",
    "Persönlicher Arbeitsbereich",
    "Persönlicher Arbeitsbereich",
  ],
] as const) {
  test(`workspace display localizes only the generated default: ${kind} ${name}`, async ({
    page,
  }) => {
    await authenticated(page);
    const tenant = {
      id: tenantId,
      name,
      kind,
      roles,
      manageMembers: true,
      organizationId: null,
      organizationVerified: false,
    };
    await page.route("**/api/v1/session", (route) =>
      route.fulfill({
        json: {
          user: { id: userId, login: "owner@example.test" },
          tenant,
          csrfToken: "csrf-locale",
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
    await page.goto("/workspaces");
    const switcher = page.locator(".workspace-switch");
    await expect(switcher).toContainText(english);
    await expect(switcher).toHaveAttribute("title", english);
    await expect(page.locator(".sidebar .workspace strong")).toHaveText(
      english,
    );
    await expect(
      page.getByRole("heading", {
        level: 3,
        name: `${english} · Active`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: `Open workspace: ${english}`,
        exact: true,
      }),
    ).toBeVisible();
    await page.locator(".language-switch").selectOption("de");
    await expect(switcher).toHaveAttribute("title", name);
    await expect(
      page.getByRole("heading", {
        level: 3,
        name: `${name} · Aktiv`,
        exact: true,
      }),
    ).toBeVisible();
    await page.locator(".language-switch").selectOption("en");
    await expect(switcher).toHaveAttribute("title", english);
  });
}

test("English membership tabs, role dialogs and invitation controls preserve German customer names", async ({
  page,
}, testInfo) => {
  await authenticated(page);
  const tenant = {
    id: tenantId,
    name: "Vorbereitung",
    kind: "organisation",
    organizationId: configurationId,
    organizationVerified: true,
    roles,
    manageMembers: true,
  };
  await page.route("**/api/v1/organisation", (route) =>
    route.fulfill({
      json: {
        userId,
        activeTenantId: tenantId,
        tenants: [tenant],
        members: [
          {
            userId,
            login: null,
            displayName: "Vorbereitung",
            email: "owner@example.test",
            roles,
            manageMembers: true,
          },
        ],
      },
    }),
  );
  await page.route("**/api/v1/applications/groups**", (route) =>
    route.fulfill({ json: { groups: [], members: [] } }),
  );
  await page.goto("/organisation");
  await expect(
    page.getByRole("heading", { name: "User management", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Members in Vorbereitung", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: /^Members/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /^Invitations/ })).toBeVisible();
  await page
    .getByRole("button", { name: "Edit roles for Vorbereitung" })
    .click();
  const rolesDialog = page.getByRole("dialog", {
    name: "Edit roles",
    exact: true,
  });
  await expect(
    rolesDialog.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeVisible();
  await rolesDialog.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("button", { name: "Invite person", exact: true })
    .click();
  const invitation = page.getByRole("dialog", {
    name: "Invite person",
    exact: true,
  });
  await invitation.getByRole("radio", { name: /^Invite by email/ }).check();
  await expect(
    invitation.getByRole("button", { name: "Send invitation", exact: true }),
  ).toBeVisible();
  await invitation.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Language", exact: true })
    .selectOption("de");
  await expect(page.getByRole("tab", { name: /^Einladungen/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page
    .getByRole("combobox", { name: "Sprache", exact: true })
    .selectOption("en");
  await expect(page.getByRole("tab", { name: /^Invitations/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByRole("heading", { name: "Members in Vorbereitung", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("english-membership.png"),
    fullPage: true,
  });
});

test("template advice chrome and existing diagnostics change language while questions and answers remain intact", async ({
  page,
}, testInfo) => {
  await authenticated(page);
  let sends = 0;
  const question = "Diese Frage bleibt unverändert";
  const answer = "Vorbereitung {{value0}}";
  await page.route("**/api/v1/configurations/template-advice", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: {
          advice: {
            id: "advice-locale",
            expiresAt: "2027-05-16T09:00:00Z",
            stale: false,
            messages: [
              {
                id: "advice-answer",
                role: "assistant",
                content: "Modellinhalt bleibt unverändert",
              },
            ],
            recommendation: {
              templateId: "standalone",
              explanation: "Bestehende Empfehlung",
              questions: [{ text: question, options: [] }],
            },
          },
        },
      });
    expect(route.request().method()).toBe("POST");
    sends++;
    expect(route.request().postDataJSON().message).toBe(
      `${question}\nMy answer: ${answer}`,
    );
    return route.fulfill({
      status: 503,
      json: {
        error: "assistant_inference_failed",
        reason: "response_truncated",
        requestId: "req-language-switch",
      },
    });
  });
  await page.goto("/templates");
  const panel = page.getByRole("region", {
    name: "Template advice",
    exact: true,
  });
  await expect(
    panel.getByRole("heading", { name: "Template advice", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("heading", { name: "Open questions", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "View template", exact: true }),
  ).toBeVisible();
  await panel.getByLabel("Your own answer", { exact: true }).fill(answer);
  await panel.getByRole("button", { name: "Send answer", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("cut off");
  await expect(panel.getByRole("alert")).toContainText("req-language-switch");
  await page
    .getByRole("combobox", { name: "Language", exact: true })
    .selectOption("de");
  const german = page.getByRole("region", {
    name: "Template-Beratung",
    exact: true,
  });
  await expect(german.getByRole("alert")).toContainText("abgeschnitten");
  await expect(
    german.getByLabel("Eigene Antwort", { exact: true }),
  ).toHaveValue(answer);
  await page
    .getByRole("combobox", { name: "Sprache", exact: true })
    .selectOption("en");
  await expect(panel.getByRole("alert")).toContainText("cut off");
  await expect(
    panel.getByText("Modellinhalt bleibt unverändert", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByLabel("Your own answer", { exact: true }),
  ).toHaveValue(answer);
  expect(sends).toBe(1);
  let confirmation = "";
  page.once("dialog", async (dialog) => {
    confirmation = dialog.message();
    await dialog.dismiss();
  });
  await panel
    .getByRole("button", { name: "Delete template advice", exact: true })
    .click();
  expect(confirmation).toBe(
    "Permanently delete the template advice conversation and recommendation?",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("english-template-advice.png"),
    fullPage: true,
  });
});

test("configuration chat headings, proposal columns and accessible field choices follow the selected language", async ({
  page,
}, testInfo) => {
  await authenticated(page);
  const draft = createEditorConfiguration("standalone", configurationId);
  draft.name = "Vorbereitung";
  await page.route("**/api/v1/configurations", (route) =>
    route.fulfill({
      json: {
        configurations: [
          {
            id: configurationId,
            name: draft.name,
            revision: 1,
            updatedAt: new Date().toISOString(),
            issueCount: 0,
          },
        ],
      },
    }),
  );
  await page.route(`**/api/v1/configurations/${configurationId}`, (route) =>
    route.fulfill({
      json: { configuration: { id: configurationId, revision: 1, draft } },
    }),
  );
  await page.route(
    `**/api/v1/configurations/${configurationId}/assistant`,
    (route) => {
      expect(route.request().method()).toBe("GET");
      return route.fulfill({
        json: {
          conversation: {
            id: tenantId,
            revision: 2,
            baseRevision: 1,
            expiresAt: "2027-05-16T09:00:00Z",
            stale: false,
            messages: [
              {
                id: "question",
                role: "user",
                content: "Meine Eingabe bleibt unverändert",
              },
            ],
            proposal: {
              explanation: "Modellinhalt bleibt unverändert",
              references: ["identity-foundations"],
              questions: [],
              changes: [
                { path: "company_name", before: "", value: "Mitglieder" },
              ],
            },
          },
        },
      });
    },
  );
  await page.goto("/configurations");
  await page
    .getByRole("button", {
      name: "Open configuration: Vorbereitung",
      exact: true,
    })
    .click();
  const chat = page.getByRole("region", {
    name: "Configuration chat",
    exact: true,
  });
  const steps = page.getByRole("navigation", { name: "Configuration steps" });
  for (const name of [
    "Basics",
    "Folders",
    "Network",
    "Platform",
    "Operations",
    "Check",
  ])
    await expect(
      steps.getByRole("button", { name: new RegExp(name) }),
    ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Basics", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Current STACKIT product options are unavailable.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    chat.getByRole("heading", { name: "Proposed changes", exact: true }),
  ).toBeVisible();
  for (const name of ["Selection", "Field", "Proposal"]) {
    await expect(
      chat.locator("thead th").filter({ hasText: new RegExp(`^${name}$`) }),
    ).toHaveText(name);
    if (testInfo.project.name === "mobile")
      await expect(
        chat
          .locator(".assistant-diff-label")
          .filter({ hasText: new RegExp(`^${name}$`) }),
      ).toBeVisible();
    else
      await expect(
        chat.getByRole("columnheader", { name, exact: true }),
      ).toBeVisible();
  }
  await expect(
    chat.getByRole("checkbox", { name: "Select company_name", exact: true }),
  ).toBeVisible();
  await expect(chat.getByText("Mitglieder", { exact: true })).toBeVisible();
  await expect(
    chat.getByText(/Conversation valid until.*16\/05\/2027/),
  ).toBeVisible();
  const message = "Vorbereitung {{value0}}";
  await chat
    .getByRole("textbox", { name: "Your message", exact: true })
    .fill(message);
  await page
    .getByRole("combobox", { name: "Language", exact: true })
    .selectOption("de");
  const german = page.getByRole("region", {
    name: "Konfigurations-Chat",
    exact: true,
  });
  await expect(
    page.getByRole("heading", { name: "Grundlagen", exact: true }),
  ).toBeVisible();
  await expect(
    german.getByRole("heading", { name: "Änderungsvorschlag", exact: true }),
  ).toBeVisible();
  await expect(
    german.getByRole("textbox", { name: "Deine Nachricht", exact: true }),
  ).toHaveValue(message);
  await page
    .getByRole("combobox", { name: "Sprache", exact: true })
    .selectOption("en");
  await expect(
    chat.getByRole("heading", { name: "Proposed changes", exact: true }),
  ).toBeVisible();
  await expect(
    chat.getByRole("textbox", { name: "Your message", exact: true }),
  ).toHaveValue(message);
  await expect(
    chat.getByText("Meine Eingabe bleibt unverändert", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("english-configuration-chat.png"),
    fullPage: true,
  });
});
