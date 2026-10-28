import { createEditorConfiguration } from "@lzc/domain";
import type { Session } from "../apps/web/src/components/Account";
import { expect, type Page, test } from "./fixtures";

const user = "11111111-1111-4111-8111-111111111111";
const tenant = "22222222-2222-4222-8222-222222222222";
const rowId = "33333333-3333-4333-8333-333333333333";
const documentId = "44444444-4444-4444-8444-444444444444";
const makeSession = (): Session => ({
  user: { id: user, login: "owner@example.test" },
  tenant: {
    id: tenant,
    name: "Owner workspace",
    kind: "organisation",
    roles: ["platform-engineer"],
  },
  csrfToken: "csrf-session-lifecycle",
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
  stackitVerified: true,
});

async function setup(page: Page, renewalEnabled = true) {
  let current: Session | null = makeSession();
  let refreshStatus = 200;
  let refreshes = 0;
  let renewalStatus = "active";
  let refreshGate: Promise<void> | null = null;
  let writes = 0;
  const original = {
    ...createEditorConfiguration("standalone", documentId),
    name: "Saved private platform",
  };
  await page.route("**/auth/status", (route) =>
    route.fulfill({
      json: {
        github: false,
        stackit: true,
        primary: "stackit",
        stackitRenewal: renewalEnabled,
      },
    }),
  );
  await page.route("**/api/v1/session", (route) =>
    route.fulfill(
      current
        ? { json: current }
        : { status: 401, json: { error: "authentication_required" } },
    ),
  );
  await page.route("**/auth/stackit/refresh", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers()["x-lzc-csrf"]).toBe(current?.csrfToken);
    refreshes++;
    if (refreshGate) await refreshGate;
    return route.fulfill(
      refreshStatus === 200
        ? { json: { status: renewalStatus } }
        : { status: refreshStatus, json: { error: "provider_unavailable" } },
    );
  });
  await page.route("**/api/v1/configurations", (route) => {
    expect(route.request().method()).toBe("GET");
    return route.fulfill({
      json: {
        configurations:
          current?.tenant?.id === tenant
            ? [
                {
                  id: rowId,
                  name: original.name,
                  templateId: "standalone",
                  revision: 1,
                  updatedAt: new Date().toISOString(),
                  createdAt: new Date().toISOString(),
                  issueCount: 0,
                },
              ]
            : [],
      },
    });
  });
  await page.route(`**/api/v1/configurations/${rowId}`, (route) => {
    expect(current?.tenant?.id).toBe(tenant);
    if (route.request().method() === "GET")
      return route.fulfill({
        json: {
          configuration: {
            id: rowId,
            name: original.name,
            revision: 1,
            draft: original,
          },
        },
      });
    expect(route.request().method()).toBe("PUT");
    expect(route.request().postDataJSON().revision).toBe(1);
    writes++;
    return route.fulfill({
      json: {
        configuration: {
          id: rowId,
          revision: 2,
          draft: route.request().postDataJSON().draft,
        },
      },
    });
  });
  for (const [name, body] of Object.entries({
    templates: { versions: [] },
    instances: { instances: [] },
    "platform-contracts": { contracts: [] },
  }))
    await page.route(`**/api/v1/applications/${name}`, (route) => {
      expect(route.request().method()).toBe("GET");
      return route.fulfill({ json: body });
    });
  await page.goto("/configurations");
  await page
    .getByRole("button", {
      name: `Konfiguration öffnen: ${original.name}`,
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("Name der Konfiguration", { exact: true }),
  ).toHaveValue(original.name);
  if (renewalEnabled) await expect.poll(() => refreshes).toBeGreaterThan(0);
  return {
    session: () => current,
    setSession: (next: Session | null) => {
      current = next;
    },
    holdRefresh: (status: string) => {
      renewalStatus = status;
      let release!: () => void;
      refreshGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => {
        refreshGate = null;
        release();
      };
    },
    setRefreshStatus: (status: number) => {
      refreshStatus = status;
    },
    refreshes: () => refreshes,
    writes: () => writes,
  };
}

async function focusHeartbeat(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}

test("STACKIT heartbeat preserves focused unsaved draft and persisted binding", async ({
  page,
}) => {
  await page.clock.install();
  const state = await setup(page);
  const name = page.getByLabel("Name der Konfiguration", { exact: true });
  await name.fill("Unsaved heartbeat draft");
  await name.focus();
  const input = await name.elementHandle();
  const initial = state.refreshes();
  const next = makeSession();
  next.expiresAt = new Date(Date.now() + 7200000).toISOString();
  state.setSession(next);
  await page.clock.fastForward(60_001);
  await expect.poll(state.refreshes).toBeGreaterThan(initial);
  await expect(name).toBeFocused();
  await expect(name).toHaveValue("Unsaved heartbeat draft");
  expect(
    await name.evaluate((element, original) => element === original, input),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Deployment vorbereiten", exact: true }),
  ).toBeDisabled();
  expect(state.writes()).toBe(0);
  await page
    .locator("#configuration-save")
    .getByRole("button", { name: "Konfiguration speichern", exact: true })
    .click();
  await expect.poll(state.writes).toBe(1);
  await expect(
    page.getByRole("button", { name: "Deployment vorbereiten", exact: true }),
  ).toBeEnabled();
});

test("transient renewal errors and session expiry preserve the owned draft for the same account", async ({
  page,
}) => {
  const state = await setup(page);
  const name = page.getByLabel("Name der Konfiguration", { exact: true });
  await name.fill("Unsaved expired draft");
  state.setRefreshStatus(503);
  const initial = state.refreshes();
  await focusHeartbeat(page);
  await expect.poll(state.refreshes).toBeGreaterThan(initial);
  await expect(page.locator(".account")).toContainText(
    "Dein Entwurf bleibt erhalten",
  );
  await expect(name).toHaveValue("Unsaved expired draft");
  state.setSession(null);
  await focusHeartbeat(page);
  await expect(
    page.getByRole("button", { name: "Mit STACKIT anmelden", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Deine Sitzung ist abgelaufen.", { exact: false }),
  ).toBeVisible();
  await expect(name).toHaveValue("Unsaved expired draft");
  state.setRefreshStatus(200);
  state.setSession(makeSession());
  // Another tab may have completed sign-in; the next focus must recover this account only.
  await focusHeartbeat(page);
  await expect(
    page.getByRole("button", { name: "Abmelden", exact: true }),
  ).toBeVisible();
  await expect(name).toHaveValue("Unsaved expired draft");
  await expect(
    page.getByRole("button", { name: "Deployment vorbereiten", exact: true }),
  ).toBeDisabled();
  expect(state.writes()).toBe(0);
});

test("session scope switches hide private drafts and restore only their original workspace", async ({
  page,
}) => {
  const state = await setup(page);
  await page
    .getByLabel("Name der Konfiguration", { exact: true })
    .fill("Private unsaved workspace draft");
  const other = makeSession();
  other.user = {
    id: "55555555-5555-4555-8555-555555555555",
    login: "other@example.test",
  };
  other.tenant = {
    id: "66666666-6666-4666-8666-666666666666",
    name: "Other workspace",
    kind: "organisation",
    roles: ["application-owner"],
  };
  other.csrfToken = "other-csrf";
  state.setSession(other);
  await focusHeartbeat(page);
  await expect(page.locator(".account")).toContainText("other@example.test");
  await expect(page).toHaveURL(/\/applications$/);
  await expect(
    page.getByLabel("Name der Konfiguration", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Private unsaved workspace draft", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation", { name: "Hauptnavigation", exact: true })
      .getByRole("button", { name: "Konfigurationen", exact: true }),
  ).toHaveCount(0);
  state.setSession(makeSession());
  await focusHeartbeat(page);
  await expect(page.locator(".account")).toContainText("owner@example.test");
  await expect(page).toHaveURL(/\/configurations\/edit\/basics$/);
  await expect(
    page.getByLabel("Name der Konfiguration", { exact: true }),
  ).toHaveValue("Private unsaved workspace draft");
  await expect(
    page.getByRole("button", { name: "Deployment vorbereiten", exact: true }),
  ).toBeDisabled();
  expect(state.writes()).toBe(0);
  await page
    .locator("#configuration-save")
    .getByRole("button", { name: "Konfiguration speichern", exact: true })
    .click();
  await expect.poll(state.writes).toBe(1);
  await expect(
    page.getByRole("button", { name: "Deployment vorbereiten", exact: true }),
  ).toBeEnabled();
});

test("legacy auth status never opts into STACKIT refresh implicitly", async ({
  page,
}) => {
  const state = await setup(page, false);
  await page
    .getByLabel("Name der Konfiguration", { exact: true })
    .fill("Legacy session draft");
  await focusHeartbeat(page);
  await expect(
    page.getByLabel("Name der Konfiguration", { exact: true }),
  ).toHaveValue("Legacy session draft");
  expect(state.refreshes()).toBe(0);
  expect(state.writes()).toBe(0);
});

test("an explicit renewal-required response becomes visible without replacing the draft", async ({
  page,
}) => {
  const state = await setup(page);
  const initial = state.refreshes();
  const release = state.holdRefresh("reauthentication-required");
  await focusHeartbeat(page);
  await expect.poll(state.refreshes).toBeGreaterThan(initial);
  const name = page.getByLabel("Name der Konfiguration", { exact: true });
  await name.fill("Edited while renewal is pending");
  release();
  await expect(
    page.getByRole("button", {
      name: "STACKIT-Anmeldung erneuern",
      exact: true,
    }),
  ).toBeVisible();
  await expect(name).toHaveValue("Edited while renewal is pending");
  expect(state.writes()).toBe(0);
});

async function broadcastLogout(page: Page, session: Session) {
  await page.evaluate(
    ({ userId, expiresAt }) => {
      const sync = new BroadcastChannel("lzc-auth-session");
      sync.postMessage({ type: "logout", userId, expiresAt });
      sync.close();
    },
    { userId: session.user.id, expiresAt: session.expiresAt },
  );
}

test("a matching scoped logout clears a draft even after the local session expired", async ({
  page,
}) => {
  const state = await setup(page);
  const session = state.session()!;
  await page
    .getByLabel("Name der Konfiguration", { exact: true })
    .fill("Expired private logout draft");
  state.setSession(null);
  await focusHeartbeat(page);
  await expect(
    page.getByRole("button", { name: "Mit STACKIT anmelden", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Name der Konfiguration", { exact: true }),
  ).toHaveValue("Expired private logout draft");
  await broadcastLogout(page, session);
  await expect(
    page.getByLabel("Name der Konfiguration", { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        Object.keys(sessionStorage).filter((key) =>
          key.startsWith("lzc-oauth-draft"),
        ).length,
    ),
  ).toBe(0);
  state.setSession(session);
  await focusHeartbeat(page);
  await expect(
    page.getByRole("button", { name: "Abmelden", exact: true }),
  ).toBeVisible();
  expect(
    await page
      .locator("input")
      .evaluateAll((inputs) =>
        inputs.some(
          (input) =>
            input instanceof HTMLInputElement &&
            input.value === "Expired private logout draft",
        ),
      ),
  ).toBe(false);
  expect(state.writes()).toBe(0);
});

test("logout from an older session generation cannot clear the renewed owned draft", async ({
  page,
}) => {
  const state = await setup(page);
  const previous = state.session()!;
  await page
    .getByLabel("Name der Konfiguration", { exact: true })
    .fill("New generation unsaved draft");
  const renewed = {
    ...makeSession(),
    csrfToken: "new-generation-csrf",
    expiresAt: new Date(Date.now() + 7200000).toISOString(),
  };
  state.setSession(renewed);
  let initial = state.refreshes();
  await focusHeartbeat(page);
  await expect.poll(state.refreshes).toBeGreaterThan(initial);
  initial = state.refreshes();
  await broadcastLogout(page, previous);
  await expect.poll(state.refreshes).toBeGreaterThan(initial);
  await expect(
    page.getByRole("button", { name: "Abmelden", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Name der Konfiguration", { exact: true }),
  ).toHaveValue("New generation unsaved draft");
  await expect(
    page.getByRole("button", { name: "Deployment vorbereiten", exact: true }),
  ).toBeDisabled();
  expect(state.writes()).toBe(0);
});

test("authenticated STACKIT renewal redirects directly and preserves the dirty saved configuration", async ({
  page,
  context,
}) => {
  const state = await setup(page, false);
  const name = page.getByLabel("Name der Konfiguration", { exact: true });
  await name.fill("Private draft across direct renewal");
  state.setSession({ ...makeSession(), stackitVerified: false });
  await focusHeartbeat(page);
  const renewal = page.getByRole("button", {
    name: "STACKIT-Anmeldung erneuern",
    exact: true,
  });
  await expect(renewal).toBeVisible();
  let starts = 0;
  let providerVisits = 0;
  let polls = 0;
  const callback = new URL("/#stackit-login", page.url()).toString();
  await page.route("**/auth/stackit/start", (route) => {
    starts++;
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers()["x-lzc-csrf"]).toBe(
      makeSession().csrfToken,
    );
    return route.fulfill({
      json: {
        verificationUri:
          "https://accounts.stackit.cloud/oauth/v2/authorize?response_type=code&code_challenge_method=S256",
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        retryAfterMs: 50,
      },
    });
  });
  await page.route(
    "https://accounts.stackit.cloud/oauth/v2/authorize*",
    (route) => {
      providerVisits++;
      state.setSession(makeSession());
      return route.fulfill({ status: 302, headers: { location: callback } });
    },
  );
  await page.route("**/auth/stackit/poll", (route) => {
    polls++;
    return route.fulfill({ json: { status: "verified" } });
  });
  await renewal.click();
  await expect(name).toHaveValue("Private draft across direct renewal");
  await expect(renewal).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".account")).toContainText("owner@example.test");
  expect(starts).toBe(1);
  expect(providerVisits).toBe(1);
  expect(polls).toBe(1);
  expect(context.pages()).toEqual([page]);
  expect(state.writes()).toBe(0);
  await page
    .locator("#configuration-save")
    .getByRole("button", { name: "Konfiguration speichern", exact: true })
    .click();
  await expect.poll(() => state.writes()).toBe(1);
});

test("an explicit URL wins over an older draft checkpoint location on immediate reload", async ({
  page,
}) => {
  const clockStart = new Date();
  await page.clock.install({ time: clockStart });
  await page.clock.pauseAt(new Date(clockStart.getTime() + 1000));
  await setup(page, false);
  await page
    .getByLabel("Name der Konfiguration", { exact: true })
    .fill("Draft with older editor location");
  await page.clock.fastForward(1000);
  await page
    .getByRole("navigation", { name: "Hauptnavigation", exact: true })
    .getByRole("button", { name: "Application Landing Zones", exact: true })
    .click();
  await expect(page).toHaveURL(/\/applications$/);
  // The clock is paused: the new location has not reached the 500ms checkpoint.
  await page.reload();
  await expect(page).toHaveURL(/\/applications$/);
  await expect(
    page.getByRole("tab", { name: "Template-Entwürfe", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("navigation", { name: "Hauptnavigation", exact: true })
    .getByRole("button", { name: "Konfigurationen", exact: true })
    .click();
  await expect(
    page.getByLabel("Name der Konfiguration", { exact: true }),
  ).toHaveValue("Draft with older editor location");
});
