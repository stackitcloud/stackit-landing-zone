import {
  type CommonConfiguration,
  createEditorConfiguration,
  defaultApplicationAccessProfile,
  editCommonInput,
} from "@lzc/domain";
import { legacyAccessTemplate } from "../tests/fixtures/application-access-transition";
import type { Page } from "./fixtures";
import { expect, test } from "./fixtures";

const userId = "11111111-1111-4111-8111-111111111111";
const tenantId = "22222222-2222-4222-8222-222222222222";
const organizationId = "33333333-3333-4333-8333-333333333333";
const configurationId = "44444444-4444-4444-8444-444444444444";
function configuration(profile = false) {
  const legacy = structuredClone(legacyAccessTemplate);
  if (profile) {
    for (const key of [
      "custom_roles",
      "role_assignments",
      "automation_role",
      "initial_owner_email",
    ])
      delete legacy.settings[key];
    if (legacy.parameterPolicy)
      delete legacy.parameterPolicy.fields.role_assignments;
    legacy.accessProfile =
      defaultApplicationAccessProfile("human@example.test");
  }
  return editCommonInput(
    {
      ...createEditorConfiguration("standalone", configurationId),
      projectTemplates: [legacy],
    },
    "organization_id",
    organizationId,
  );
}
async function setup(page: Page, initial: CommonConfiguration) {
  let stored = structuredClone(initial);
  const mutations: string[] = [];
  await page.route("**/auth/status", (route) =>
    route.fulfill({
      json: { stackit: true, github: false, primary: "stackit" },
    }),
  );
  await page.route("**/api/v1/session", (route) =>
    route.fulfill({
      json: {
        user: { id: userId, login: "untrusted-github@example.test" },
        tenant: {
          id: tenantId,
          name: "Access",
          kind: "organisation",
          roles: ["platform-engineer"],
        },
        csrfToken: "csrf-access",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    }),
  );
  await page.route("**/api/v1/organisation", (route) =>
    route.fulfill({
      json: {
        userId,
        activeTenantId: tenantId,
        tenants: [
          {
            id: tenantId,
            name: "Access",
            kind: "organisation",
            roles: ["platform-engineer"],
            manageMembers: true,
          },
        ],
        members: [],
      },
    }),
  );
  await page.route("**/api/v1/configurations", (route) =>
    route.fulfill({
      json: {
        configurations: [
          {
            id: configurationId,
            name: stored.name,
            revision: 1,
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    }),
  );
  await page.route(`**/api/v1/configurations/${configurationId}`, (route) => {
    if (route.request().method() === "PUT") {
      mutations.push("save");
      stored = route.request().postDataJSON().draft;
    }
    return route.fulfill({
      json: {
        configuration: {
          id: configurationId,
          name: stored.name,
          revision: mutations.length + 1,
          draft: stored,
        },
      },
    });
  });
  await page.goto("/configurations");
  await page
    .getByRole("button", {
      name: `Konfiguration öffnen: ${stored.name}`,
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "5 Template-Entwürfe", exact: true })
    .click();
  return { mutations, saved: () => stored };
}

test("legacy access rules require reviewed atomic replacement and cancel leaves the draft unchanged", async ({
  page,
}) => {
  const original = configuration();
  const state = await setup(page, original);
  const start = page.getByRole("button", {
    name: "Neues Rechteprofil konfigurieren",
    exact: true,
  });
  await start.click();
  const preview = page.getByRole("group", {
    name: "Wechsel zum Rechteprofil prüfen",
    exact: true,
  });
  await expect(preview).toContainText("legacy-operator");
  await expect(preview).toContainText("verified-project-owner");
  const apply = page.getByRole("button", {
    name: "Entwurf auf neues Rechteprofil umstellen",
    exact: true,
  });
  await expect(apply).toBeDisabled();
  await preview.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await expect(start).toBeVisible();
  expect(state.mutations).toEqual([]);
  expect(state.saved()).toEqual(original);
  await start.click();
  await preview
    .getByRole("checkbox", {
      name: "Die angezeigten Rollenregeln in diesem Entwurf ersetzen",
    })
    .check();
  // An actual template edit invalidates the prior confirmation, even when the
  // editor is still mounted; restore the unrelated value before proceeding.
  const name = page.getByLabel("Name des Templates", { exact: true });
  await name.fill("Changed while reviewing");
  await expect(preview).toHaveCount(0);
  await name.fill(legacyAccessTemplate.name);
  await start.click();
  await expect(apply).toBeDisabled();
  await preview
    .getByRole("checkbox", {
      name: "Die angezeigten Rollenregeln in diesem Entwurf ersetzen",
    })
    .check();
  await apply.click();
  const owner = page.getByLabel(
    "Initialer Projekt-Owner (zentraler Benutzer oder Service Account)",
    { exact: true },
  );
  await expect(owner).toHaveValue("");
  await expect(
    page.getByText(/Ein Rechteprofil kann nicht mit zusätzlichen Rollen/),
  ).toHaveCount(0);
  await owner.fill("central@example.test");
  await page
    .locator("#configuration-save")
    .getByRole("button", { name: "Konfiguration speichern", exact: true })
    .click();
  await expect.poll(() => state.mutations.length).toBe(1);
  const expected = structuredClone(original);
  const template = expected.projectTemplates?.[0];
  if (!template) throw new Error("Expected template");
  for (const key of [
    "custom_roles",
    "role_assignments",
    "automation_role",
    "initial_owner_email",
  ])
    delete template.settings[key];
  if (template.parameterPolicy)
    delete template.parameterPolicy.fields.role_assignments;
  template.accessProfile = defaultApplicationAccessProfile(
    "central@example.test",
  );
  expect(state.saved()).toEqual(expected);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

for (const verified of [true, false])
  test(`initial owner context is explicit and accepts only verified human identity (${verified})`, async ({
    page,
  }) => {
    const reads: string[] = [];
    await page.route("**/api/v1/stackit/identity", (route) => {
      expect(route.request().headers()["x-lzc-tenant"]).toBe(tenantId);
      reads.push("identity");
      return route.fulfill({
        json: { verified, identity: { email: "human@example.test" } },
      });
    });
    await page.route("**/api/v1/credentials", (route) => {
      expect(route.request().headers()["x-lzc-tenant"]).toBe(tenantId);
      reads.push("profiles");
      return route.fulfill({
        json: {
          profiles: [
            {
              id: "provisioning",
              name: "Provisioning account",
              serviceAccount: "provisioning@sa.stackit.cloud",
              state: "stored",
              lastCheck: { status: "passed", organizationId },
            },
            {
              id: "unchecked",
              name: "Not checked",
              serviceAccount: "unchecked@sa.stackit.cloud",
              state: "stored",
            },
            {
              id: "foreign",
              name: "Foreign",
              serviceAccount: "foreign@sa.stackit.cloud",
              state: "stored",
              lastCheck: { status: "passed", organizationId: "foreign-org" },
            },
            {
              id: "failed",
              name: "Failed",
              serviceAccount: "failed@sa.stackit.cloud",
              state: "stored",
              lastCheck: { status: "failed", organizationId },
            },
          ],
        },
      });
    });
    const state = await setup(page, configuration(true));
    const source = page.getByLabel("Quelle für den initialen Projekt-Owner", {
      exact: true,
    });
    const owner = page.getByLabel(
      "Initialer Projekt-Owner (zentraler Benutzer oder Service Account)",
      { exact: true },
    );
    await expect(source.locator("option")).toHaveCount(verified ? 4 : 3);
    await expect(source).toHaveValue("manual");
    await expect(owner).toHaveValue("human@example.test");
    await expect(owner).toBeEditable();
    await expect(source).not.toContainText("Foreign");
    await expect(source).not.toContainText("Failed");
    await expect(source).not.toContainText("untrusted-github");
    await source.selectOption("profile:provisioning");
    await expect(owner).toHaveValue("provisioning@sa.stackit.cloud");
    await expect(owner).not.toBeEditable();
    if (verified) {
      await source.selectOption("verified-human");
      await expect(owner).toHaveValue("human@example.test");
    }
    await source.selectOption("manual");
    await expect(owner).toBeEditable();
    await owner.fill("manual@example.test");
    await page
      .locator("#configuration-save")
      .getByRole("button", { name: "Konfiguration speichern", exact: true })
      .click();
    await expect.poll(() => state.mutations.length).toBe(1);
    expect(state.saved().projectTemplates?.[0]?.accessProfile).toEqual(
      defaultApplicationAccessProfile("manual@example.test"),
    );
    expect(reads.sort()).toEqual(["identity", "profiles"]);
  });

test("late owner metadata never replaces or disables a focused manual email", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/stackit/identity", async (route) => {
    await gate;
    await route.fulfill({
      json: { verified: true, identity: { email: "matching@example.test" } },
    });
  });
  await page.route("**/api/v1/credentials", async (route) => {
    await gate;
    await route.fulfill({ json: { profiles: [] } });
  });
  const state = await setup(page, configuration(true));
  const owner = page.getByLabel(
    "Initialer Projekt-Owner (zentraler Benutzer oder Service Account)",
    { exact: true },
  );
  await owner.fill("matching@example.test");
  await owner.focus();
  const input = await owner.elementHandle();
  release();
  const source = page.getByLabel("Quelle für den initialen Projekt-Owner", {
    exact: true,
  });
  await expect(source.locator("option")).toHaveCount(2);
  await expect(source).toHaveValue("manual");
  await expect(owner).toBeEditable();
  await expect(owner).toBeFocused();
  await expect(owner).toHaveValue("matching@example.test");
  expect(
    await owner.evaluate((element, original) => element === original, input),
  ).toBe(true);
  expect(state.mutations).toEqual([]);
});

test("old scoped profile responses cannot repopulate choices after the configuration organization changes", async ({
  page,
}) => {
  const nextOrg = "55555555-5555-4555-8555-555555555555";
  let oldRoute: Parameters<Parameters<Page["route"]>[1]>[0] | undefined;
  let firstSeen!: () => void;
  const seen = new Promise<void>((resolve) => {
    firstSeen = resolve;
  });
  let reads = 0;
  await page.route("**/api/v1/stackit/identity", (route) =>
    route.fulfill({ json: { verified: false, identity: null } }),
  );
  await page.route("**/api/v1/credentials", (route) => {
    expect(route.request().headers()["x-lzc-tenant"]).toBe(tenantId);
    reads++;
    if (reads === 1) {
      oldRoute = route;
      firstSeen();
      return;
    }
    return route.fulfill({
      json: {
        profiles: [
          {
            id: "new",
            name: "New organization",
            serviceAccount: "new@sa.stackit.cloud",
            state: "stored",
            lastCheck: { status: "passed", organizationId: nextOrg },
          },
        ],
      },
    });
  });
  await setup(page, configuration(true));
  await seen;
  await page.getByRole("button", { name: "1 Grundlagen", exact: true }).click();
  await page
    .getByLabel("STACKIT Organisations-ID", { exact: true })
    .fill(nextOrg);
  await page
    .getByRole("button", { name: "5 Template-Entwürfe", exact: true })
    .click();
  const source = page.getByLabel("Quelle für den initialen Projekt-Owner", {
    exact: true,
  });
  await expect(source.locator("option")).toHaveCount(2);
  await expect(source).toContainText("new@sa.stackit.cloud");
  if (!oldRoute) throw new Error("Expected original metadata request");
  await oldRoute
    .fulfill({
      json: {
        profiles: [
          {
            id: "old",
            name: "Old organization",
            serviceAccount: "old@sa.stackit.cloud",
            state: "stored",
            lastCheck: { status: "passed", organizationId },
          },
        ],
      },
    })
    .catch(() => {});
  await expect(source).toHaveValue("manual");
  await expect(source).not.toContainText("old@sa.stackit.cloud");
  const owner = page.getByLabel(
    "Initialer Projekt-Owner (zentraler Benutzer oder Service Account)",
    { exact: true },
  );
  await expect(owner).toHaveValue("human@example.test");
  await expect(owner).toBeEditable();
  expect(reads).toBe(2);
});

test("saved platform preparation keeps its exact accessible service-account choice despite a later failed check", async ({
  page,
}) => {
  const profiles = [
    {
      id: "bound-failed",
      name: "Existing platform deployer",
      serviceAccount: "deployer@sa.stackit.cloud",
      keyId: "key-deployer",
      state: "stored",
      lastCheck: { status: "failed", organizationId },
    },
    {
      id: "bound-other-check",
      name: "Other previously prepared deployer",
      serviceAccount: "other-deployer@sa.stackit.cloud",
      keyId: "key-other",
      state: "stored",
      lastCheck: { status: "passed", organizationId: "another-organization" },
    },
    ...[
      "unbound",
      "foreign-preparation",
      "other-configuration",
      "wrong-key",
    ].map((id) => ({
      id,
      name: id,
      serviceAccount: `${id}@sa.stackit.cloud`,
      keyId: `key-${id}`,
      state: "stored",
      lastCheck: { status: "failed", organizationId },
    })),
  ];
  const preparation = (
    id: string,
    credentialId: string,
    org = organizationId,
    config = configurationId,
    keyId = `key-${credentialId}`,
  ) => ({
    id,
    name: `Preparation ${id}`,
    credentialId,
    manifest: {
      source: { configurationId: config },
      organization: { id: org },
      credential: { id: credentialId, keyId },
    },
  });
  const preparations = [
    preparation(
      "saved-platform",
      "bound-failed",
      organizationId,
      configurationId,
      "key-deployer",
    ),
    preparation(
      "other-platform",
      "bound-other-check",
      organizationId,
      configurationId,
      "key-other",
    ),
    preparation("foreign", "foreign-preparation", "foreign-organization"),
    preparation(
      "other-config",
      "other-configuration",
      organizationId,
      "different-configuration",
    ),
    preparation(
      "old-key",
      "wrong-key",
      organizationId,
      configurationId,
      "wrong-profile-key",
    ),
    // A preparation cannot disclose another user's profile or synthesize its
    // identity: it is not among the accessible credential metadata rows.
    preparation("not-accessible", "another-users-profile"),
  ];
  const reads: string[] = [];
  await page.route("**/api/v1/stackit/identity", (route) =>
    route.fulfill({
      json: { verified: true, identity: { email: "human@example.test" } },
    }),
  );
  for (const [path, payload] of [
    ["credentials", { profiles }],
    ["preparations", { preparations }],
  ] as const) {
    await page.route(`**/api/v1/${path}`, (route) => {
      expect(route.request().method()).toBe("GET");
      const tenant = route.request().headers()["x-lzc-tenant"];
      // Existing preparation/storage navigation also reads its lists without
      // this contextual header. Give those reads no profile/provenance data;
      // only the picker must make the explicit scoped reads asserted below.
      if (tenant === undefined)
        return route.fulfill({
          json:
            path === "credentials" ? { profiles: [] } : { preparations: [] },
        });
      expect(tenant).toBe(tenantId);
      reads.push(path);
      return route.fulfill({ json: payload });
    });
  }
  await page.route("**/api/v1/plans", (route) => {
    if (route.request().headers()["x-lzc-tenant"] !== undefined)
      throw new Error(
        "Owner selection must not request plans or trigger execution checks",
      );
    return route.fulfill({ json: { runs: [] } });
  });
  const state = await setup(page, configuration(true));
  const source = page.getByLabel("Quelle für den initialen Projekt-Owner", {
    exact: true,
  });
  const owner = page.getByLabel(
    "Initialer Projekt-Owner (zentraler Benutzer oder Service Account)",
    { exact: true },
  );
  await expect(source.locator("option")).toHaveCount(4);
  await expect(source).toHaveValue("manual");
  await expect(owner).toHaveValue("human@example.test");
  await expect(
    source.locator('option[value="profile:bound-failed"]'),
  ).toContainText("Plattform-Zugangsprofil aus gespeicherter Vorbereitung");
  await expect(
    source.locator('option[value="profile:bound-failed"]'),
  ).toContainText("Letzte Zugangsprüfung nicht erfolgreich");
  await expect(
    source.locator('option[value="profile:bound-failed"]'),
  ).toContainText("Preparation saved-platform");
  await expect(
    source.locator('option[value="profile:bound-other-check"]'),
  ).toContainText("Letzte Zugangsprüfung betrifft eine andere Organisation");
  for (const id of [
    "unbound",
    "foreign-preparation",
    "other-configuration",
    "wrong-key",
    "another-users-profile",
  ])
    await expect(source.locator(`option[value="profile:${id}"]`)).toHaveCount(
      0,
    );
  await source.selectOption("profile:bound-failed");
  await expect(owner).toHaveValue("deployer@sa.stackit.cloud");
  await expect(owner).not.toBeEditable();
  await page
    .locator("#configuration-save")
    .getByRole("button", { name: "Konfiguration speichern", exact: true })
    .click();
  await expect.poll(() => state.mutations.length).toBe(1);
  const expected = configuration(true);
  const template = expected.projectTemplates?.[0];
  if (!template) throw new Error("Expected template");
  template.accessProfile = defaultApplicationAccessProfile(
    "deployer@sa.stackit.cloud",
  );
  expect(state.saved()).toEqual(expected);
  expect(reads.sort()).toEqual(["credentials", "preparations"]);
});
