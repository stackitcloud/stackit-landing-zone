import { mockEmptyApplicationLists } from "./editor-navigation";
import { expect, test } from "./fixtures";

const tenantId = "22222222-2222-4222-8222-222222222222";
const viewerId = "11111111-1111-4111-8111-111111111111";
const personId = "33333333-3333-4333-8333-333333333333";
const manualId = "44444444-4444-4444-8444-444444444444";
const mailedId = "55555555-5555-4555-8555-555555555555";

test.beforeEach(async ({ page }) => {
  await mockEmptyApplicationLists(page);
});

async function workspace(
  page: import("@playwright/test").Page,
  manager = true,
) {
  let members = [
    {
      userId: viewerId,
      login: null,
      displayName: "Lea Admin",
      email: "lea@example.test",
      roles: ["platform-engineer"],
      manageMembers: true,
    },
    {
      userId: personId,
      login: null,
      displayName: "Ada Owner",
      email: "ada@example.test",
      roles: ["application-owner"],
      manageMembers: false,
    },
  ];
  let denyEdit = true;
  const removed: string[] = [];
  const posted: Record<string, unknown>[] = [];
  let invitations = [
    {
      id: manualId,
      recipientEmail: null as string | null,
      roles: ["application-owner"],
      manageMembers: false,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      createdAt: new Date().toISOString(),
      mailStatus: null as string | null,
    },
  ];
  const roles = [manager ? "platform-engineer" : "application-owner"];
  await page.route("**/auth/status", (r) =>
    r.fulfill({ json: { github: false, stackit: true, primary: "stackit" } }),
  );
  await page.route("**/api/v1/session", (r) =>
    r.fulfill({
      json: {
        user: { id: viewerId, login: "lea@example.test" },
        tenant: {
          id: tenantId,
          name: "Team Atlas",
          kind: "organisation",
          roles,
          manageMembers: manager,
        },
        csrfToken: "c".repeat(43),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    }),
  );
  await page.route("**/api/v1/organisation", (r) =>
    r.fulfill({
      json: {
        userId: viewerId,
        activeTenantId: tenantId,
        tenants: [
          {
            id: tenantId,
            name: "Team Atlas",
            kind: "organisation",
            organizationId: personId,
            organizationVerified: true,
            roles,
            manageMembers: manager,
          },
        ],
        members: manager ? members : [],
      },
    }),
  );
  await page.route("**/api/v1/applications/groups**", (r) =>
    r.fulfill({ json: { groups: [] } }),
  );
  await page.route("**/api/v1/organisation/members**", (r) => {
    expect(r.request().headers()["x-lzc-tenant"]).toBe(tenantId);
    expect(r.request().headers()["x-lzc-csrf"]).toBe("c".repeat(43));
    if (r.request().method() === "DELETE") {
      expect(r.request().headers()["content-type"]).toBeUndefined();
      expect(r.request().postData()).toBeNull();
      const id = r.request().url().split("/").at(-1)!;
      removed.push(id);
      members = members.filter((m) => m.userId !== id);
      return r.fulfill({ status: 204 });
    }
    const change = r.request().postDataJSON();
    if (denyEdit) {
      denyEdit = false;
      return r.fulfill({
        status: 403,
        json: { error: "membership_management_forbidden" },
      });
    }
    members = members.map((m) =>
      m.userId === change.userId
        ? { ...m, roles: change.roles, manageMembers: change.manageMembers }
        : m,
    );
    return r.fulfill({ status: 204 });
  });
  await page.route("**/api/v1/invitations**", (r) => {
    if (r.request().method() === "POST") {
      const body = r.request().postDataJSON();
      posted.push(body);
      invitations.push({
        id: body.mail ? mailedId : personId,
        recipientEmail: body.mail?.email ?? null,
        roles: body.roles,
        manageMembers: body.manageMembers,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        createdAt: new Date().toISOString(),
        mailStatus: body.mail ? "pending" : null,
      });
      return r.fulfill({
        status: 201,
        json: {
          id: body.mail ? mailedId : personId,
          url: `https://example.test/organisation#invite=${"t".repeat(43)}`,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          ...(body.mail ? { emailQueued: true } : {}),
        },
      });
    }
    if (r.request().method() === "DELETE") {
      const id = r.request().url().split("/").at(-1)!;
      expect(r.request().headers()["content-type"]).toBeUndefined();
      expect(r.request().postData()).toBeNull();
      removed.push(id);
      invitations = invitations.filter((i) => i.id !== id);
      return r.fulfill({ status: 204 });
    }
    return r.fulfill({ json: { invitations } });
  });
  await page.goto("/organisation");
  return { removed, posted };
}

test("member identities, scoped role editing and named removal stay clear on desktop and mobile", async ({
  page,
}, testInfo) => {
  const state = await workspace(page);
  await expect(page.getByRole("heading", { name: "Lea Admin" })).toBeVisible();
  await expect(
    page.getByText("ada@example.test", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Lea Admin entfernen", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Mitglieder suchen").fill("ada@example.test");
  await expect(page.getByRole("heading", { name: "Lea Admin" })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Rollen für Ada Owner bearbeiten" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Rollen bearbeiten" });
  await dialog.getByRole("checkbox", { name: /^Platform Engineer/ }).check();
  await dialog.getByRole("button", { name: "Änderungen speichern" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Du darfst die Mitglieder dieses Arbeitsbereichs nicht verwalten.",
  );
  await expect(
    dialog.getByRole("checkbox", { name: /^Platform Engineer/ }),
  ).toBeChecked();
  await dialog.getByRole("button", { name: "Änderungen speichern" }).click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "Ada Owner entfernen", exact: true })
    .click();
  const removal = page.getByRole("dialog", { name: "Mitglied entfernen" });
  await expect(removal).toContainText("Ada Owner aus „Team Atlas“ entfernen?");
  await removal.getByRole("button", { name: "Abbrechen" }).click();
  expect(state.removed).toEqual([]);
  await page
    .getByRole("button", { name: "Ada Owner entfernen", exact: true })
    .click();
  await removal
    .getByRole("button", { name: "Mitglied entfernen", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Ada Owner" })).toHaveCount(0);
  expect(state.removed).toEqual([personId]);
  await page.getByLabel("Mitglieder suchen").clear();
  await expect(page.getByRole("heading", { name: "Lea Admin" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("members.png"),
    fullPage: true,
  });
});

test("email sends in one step, link sharing is separate and pending invitations identify their recipient", async ({
  page,
}, testInfo) => {
  const state = await workspace(page);
  await page
    .getByRole("button", { name: "Person einladen", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Person einladen" });
  await expect(
    dialog.getByRole("button", { name: "Einladung erstellen", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("radio", { name: /^Per E-Mail einladen/ }).check();
  await expect(
    dialog.getByText(
      "Der Einladungslink wird automatisch erstellt und per E-Mail verschickt.",
    ),
  ).toBeVisible();
  await dialog
    .getByLabel("E-Mail-Adresse der eingeladenen Person")
    .fill("new.person@example.test");
  await dialog.getByLabel("Sprache für Nachrichten").selectOption("en");
  const send = dialog.getByRole("button", {
    name: "Einladung senden",
    exact: true,
  });
  await expect(send).toBeVisible();
  await expect(
    dialog.getByRole("button", {
      name: "Einladungslink erstellen",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("invite-email.png") });
  await send.click();
  expect(state.posted).toEqual([
    {
      roles: ["application-owner"],
      manageMembers: false,
      mail: { email: "new.person@example.test", locale: "en" },
    },
  ]);
  const receipt = page.getByRole("dialog", { name: "Einladung erstellt" });
  await expect(receipt).toContainText(
    "Die Einladung an new.person@example.test ist für den Versand vorgemerkt.",
  );
  await receipt.getByRole("button", { name: "Fertig" }).click();
  await expect(
    page.getByRole("heading", { name: "new.person@example.test", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Noch keiner Person zugeordnet", { exact: true }),
  ).toBeVisible();
  const row = page.getByRole("listitem").filter({
    has: page.getByRole("heading", {
      name: "new.person@example.test",
      exact: true,
    }),
  });
  await row
    .getByRole("button", { name: "Einladung widerrufen", exact: true })
    .click();
  const revoke = page.getByRole("dialog", { name: "Einladung widerrufen" });
  await expect(revoke).toContainText(
    "Einladung für new.person@example.test widerrufen?",
  );
  await revoke
    .getByRole("button", { name: "Einladung widerrufen", exact: true })
    .click();
  expect(state.removed).toEqual([mailedId]);
  await page
    .getByRole("button", { name: "Person einladen", exact: true })
    .click();
  await dialog.getByRole("radio", { name: /^Link selbst teilen/ }).check();
  await expect(
    dialog.getByLabel("E-Mail-Adresse der eingeladenen Person"),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Einladungslink erstellen", exact: true })
    .click();
  await expect(
    receipt.getByLabel("Einladungslink – jetzt kopieren"),
  ).toHaveValue(/#invite=/);
  expect(state.posted[1]).toEqual({
    roles: ["application-owner"],
    manageMembers: false,
  });
  await receipt.getByRole("button", { name: "Fertig" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("invitations.png"),
    fullPage: true,
  });
});

test("non-managers see their own access without member or invitation management controls", async ({
  page,
}) => {
  await workspace(page, false);
  await expect(
    page.getByRole("heading", { name: "lea@example.test" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Person einladen", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /Einladungen/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Rollen für/ })).toHaveCount(0);
  await expect(page.getByText("ada@example.test", { exact: true })).toHaveCount(
    0,
  );
});
