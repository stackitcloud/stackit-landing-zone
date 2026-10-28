import { expect, type Page, test } from "./fixtures";

const userId = "11111111-1111-4111-8111-111111111111";
const tenantId = "22222222-2222-4222-8222-222222222222";
const otherTenant = "99999999-9999-4999-8999-999999999999";
const instanceId = "44444444-4444-4444-8444-444444444444";
const origin = "9e7fb46c329aca32e878ce1f0ea3b944ea240354";
const target = "08ac257de1548c8ec5e83dae1a79373711c3d644";
const unrelated = "1ed855609d4dcbfded6759c7c8b4fabf7bd6725d";
const checkbox =
  "Ich aktualisiere dieselbe Bestellung mit demselben State. Den neuen Plan prüfe ich einschließlich Ersetzungen und Löschungen. Jetzt wird keine Infrastruktur geändert und kein Plan oder Apply gestartet.";
function lifecycle(
  revision = origin,
  sourceStatus: "supported" | "withdrawn" | "unavailable" = "supported",
) {
  return {
    revision,
    bindingId:
      revision === origin ? null : "55555555-5555-4555-8555-555555555555",
    originRevision: origin,
    lastAppliedRevision: origin,
    sourceStatus,
    replacementRevision: target,
    canUpgrade: revision !== target,
    blockers: [] as string[],
    profiles: [origin, target, unrelated].map((revision) => ({
      revision,
      providerLockSha256: "a".repeat(64),
      openTofuVersion: "1.12.6",
      contractVersion: 1,
      status:
        revision === origin && sourceStatus === "withdrawn"
          ? "withdrawn"
          : "supported",
      replacementRevision: target,
      maintenanceEnabled: true,
    })),
  };
}
async function fixture(
  page: Page,
  options: {
    status?: "supported" | "withdrawn" | "unavailable";
    foreign?: boolean;
    stale?: boolean;
    blocked?: boolean;
    pending?: boolean;
    pendingUpgrade?: boolean;
    planError?: string;
  } = {},
) {
  let activeTenant = tenantId;
  let value = lifecycle(origin, options.status);
  if (options.blocked) {
    value.canUpgrade = false;
    value.blockers = [
      "execution-or-recovery-active",
      "runner-ticket-active",
      "guided-recovery-active",
      "apply-grant-active",
      "execution-claim-active",
    ];
  }
  let reads = 0,
    instanceReads = 0;
  let upgradeResponseFinished = false;
  const mutations: { path: string; body: unknown }[] = [];
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/auth/status", (route) =>
    route.fulfill({
      json: { stackit: true, github: false, primary: "stackit" },
    }),
  );
  const tenant = () => ({
    id: activeTenant,
    name: "Lifecycle fixture",
    kind: "organisation",
    organizationId: "33333333-3333-4333-8333-333333333333",
    roles: [options.foreign ? "platform-engineer" : "application-owner"],
    manageMembers: false,
  });
  await page.route("**/api/v1/session", (route) =>
    route.fulfill({
      json: {
        user: { id: userId, login: "owner@example.test" },
        tenant: tenant(),
        csrfToken: "csrf-lifecycle",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    }),
  );
  await page.route("**/api/v1/organisation", (route) =>
    route.fulfill({
      json: {
        userId,
        activeTenantId: activeTenant,
        tenants: [tenant()],
        members: [],
      },
    }),
  );
  await page.route("**/api/v1/applications/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(
      "/api/v1/applications/",
      "",
    );
    if (request.method() === "GET") {
      if (path === "templates")
        return route.fulfill({ json: { versions: [] } });
      if (path === "platform-contracts")
        return route.fulfill({ json: { contracts: [] } });
      if (path === "instances") {
        instanceReads++;
        return route.fulfill({
          json: {
            instances:
              activeTenant === tenantId
                ? [
                    {
                      id: instanceId,
                      versionId: "66666666-6666-4666-8666-666666666666",
                      requestedBy: options.foreign
                        ? "77777777-7777-4777-8777-777777777777"
                        : userId,
                      name: "Existing pinned order",
                      deploymentPolicy: "direct",
                      approval: { status: "not-required" },
                      parameters: {},
                      settings: { owner_email: "owner@example.test" },
                      createdAt: "2026-10-08T10:15:00.000Z",
                      stateKey: `applications/${tenantId}/${instanceId}/terraform.tfstate`,
                      executionEnabled: false,
                      planStatus: "blocked",
                      blockers: ["Synthetic existing order."],
                    },
                  ]
                : [],
            executionLifecycleEnabled: true,
            planJobsEnabled: true,
            execution: {
              planEnabled: true,
              applyEnabled: true,
              maintenanceEnabled: true,
            },
          },
        });
      }
      if (path === `instances/${instanceId}/jobs`)
        return route.fulfill({ json: { jobs: [] } });
      if (path === `instances/${instanceId}/execution-lifecycle`) {
        expect(request.headers()["x-lzc-tenant"]).toBe(tenantId);
        reads++;
        if (options.pending && reads === 1) {
          await gate;
          return route.fulfill({ json: value }).catch(() => {});
        }
        return route.fulfill({ json: value });
      }
      throw new Error(`Unexpected GET ${path}`);
    }
    mutations.push({ path, body: request.postDataJSON() });
    if (options.planError && path === `instances/${instanceId}/plan`) {
      expect(request.method()).toBe("POST");
      expect(request.headers()["x-lzc-tenant"]).toBe(tenantId);
      expect(request.headers()["x-lzc-csrf"]).toBe("csrf-lifecycle");
      return route.fulfill({ status: 409, json: { error: options.planError } });
    }
    expect(path).toBe(`instances/${instanceId}/execution-lifecycle`);
    expect(request.method()).toBe("POST");
    expect(request.headers()["x-lzc-tenant"]).toBe(tenantId);
    expect(request.headers()["x-lzc-csrf"]).toBe("csrf-lifecycle");
    expect(request.postDataJSON()).toEqual({
      targetRevision: target,
      expectedRevision: origin,
      confirmUpgrade: true,
    });
    if (options.stale)
      return route.fulfill({
        status: 409,
        json: { error: "application_execution_upgrade_changed" },
      });
    value = lifecycle(target);
    if (options.pendingUpgrade) await gate;
    upgradeResponseFinished = true;
    return route.fulfill({ json: value }).catch(() => {});
  });
  await page.goto("/applications");
  await page.getByRole("tab", { name: "Bestellungen", exact: true }).click();
  await page
    .getByRole("button", { name: /Details anzeigen: Existing pinned order/ })
    .click();
  const component = page.getByRole("region", {
    name: "Ausführungsstand der Bestellung",
    exact: true,
  });
  await expect(component).toBeVisible();
  return {
    component,
    mutations,
    reads: () => reads,
    instanceReads: () => instanceReads,
    upgradeResponseFinished: () => upgradeResponseFinished,
    release,
    switchTenant: async () => {
      activeTenant = otherTenant;
      await page.evaluate(() => {
        const channel = new BroadcastChannel("lzc-auth-session");
        channel.postMessage("changed");
        channel.close();
      });
    },
  };
}

test("explicit upgrade retains the existing order, origin and State across reload without starting Plan or Apply", async ({
  page,
}) => {
  const f = await fixture(page);
  await expect(f.component.getByTitle(origin, { exact: true })).toHaveCount(3);
  await expect(
    f.component.getByRole("combobox", { name: "Ziel-Ausführungsstand" }),
  ).toHaveValue(target);
  await expect(f.component.locator("option")).toHaveCount(1);
  const upgrade = f.component.getByRole("button", {
    name: "Ausführungsbindung aktualisieren",
    exact: true,
  });
  await expect(upgrade).toBeDisabled();
  expect(f.mutations).toEqual([]);
  await page.getByRole("tab", { name: "Drift", exact: true }).click();
  await expect(f.component.getByTitle(origin, { exact: true })).toHaveCount(3);
  expect(f.mutations).toEqual([]);
  await f.component
    .getByRole("checkbox", { name: checkbox, exact: true })
    .check();
  await upgrade.click();
  await expect(f.component).toContainText(
    "es wurde kein Plan oder Apply ausgeführt",
  );
  await expect(f.component.getByTitle(origin, { exact: true })).toHaveCount(2);
  await expect(f.component.getByTitle(target, { exact: true })).toHaveCount(2);
  await expect(
    f.component.getByRole("button", {
      name: "Ausführungsbindung aktualisieren",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(f.mutations).toHaveLength(1);
  expect(f.instanceReads()).toBeGreaterThan(1);
  await page.reload();
  await page.getByRole("tab", { name: "Bestellungen", exact: true }).click();
  await page
    .getByRole("button", { name: /Details anzeigen: Existing pinned order/ })
    .click();
  await expect(f.component.getByTitle(origin, { exact: true })).toHaveCount(2);
  await expect(f.component.getByTitle(target, { exact: true })).toHaveCount(2);
  expect(f.mutations).toHaveLength(1);
  await page.getByRole("tab", { name: "Übersicht", exact: true }).click();
  await expect(page.locator("#application-order-details")).toContainText(
    `applications/${tenantId}/${instanceId}/terraform.tfstate`,
  );
});

test("withdrawn source offers only its reviewed replacement; active execution blocks upgrade", async ({
  page,
}) => {
  const f = await fixture(page, { status: "withdrawn", blocked: true });
  await expect(f.component).toContainText("Zurückgezogen");
  await expect(f.component).toContainText(
    "Eine Ausführung oder die Klärung eines fehlgeschlagenen Apply ist noch offen.",
  );
  await expect(f.component).toContainText(
    "Eine Runner-Berechtigung ist noch aktiv.",
  );
  await expect(f.component).toContainText(
    "Eine geführte State-Wiederherstellung ist noch aktiv.",
  );
  await expect(f.component).not.toContainText("execution-or-recovery-active");
  await expect(f.component.locator("option")).toHaveCount(1);
  await expect(f.component.getByRole("combobox")).toBeDisabled();
  await expect(f.component.getByRole("checkbox")).toBeDisabled();
  expect(f.mutations).toEqual([]);
  await expect(f.component).not.toContainText("neu bestellen");
  await page.getByLabel("Sprache", { exact: true }).selectOption("en");
  const english = page.getByRole("region", {
    name: "Order execution version",
    exact: true,
  });
  await expect(english).toContainText("Withdrawn");
  await expect(english).toContainText("A runner capability is still active.");
  await expect(english).toContainText("Guided state recovery is still active.");
});

test("stale upgrade response preserves source and requires a fresh review", async ({
  page,
}) => {
  const f = await fixture(page, { stale: true });
  await f.component
    .getByRole("checkbox", { name: checkbox, exact: true })
    .check();
  await f.component
    .getByRole("button", {
      name: "Ausführungsbindung aktualisieren",
      exact: true,
    })
    .click();
  await expect(f.component).toContainText("zwischenzeitlich geändert");
  await expect(f.component.getByTitle(origin, { exact: true })).toHaveCount(3);
  await expect(
    f.component.getByRole("checkbox", { name: checkbox, exact: true }),
  ).not.toBeChecked();
  await expect(
    f.component.getByRole("button", {
      name: "Ausführungsbindung aktualisieren",
      exact: true,
    }),
  ).toBeDisabled();
  await f.component
    .getByRole("button", {
      name: "Ausführungsstatus aktualisieren",
      exact: true,
    })
    .click();
  await expect.poll(f.reads).toBe(2);
  expect(f.mutations).toHaveLength(1);
});

test("foreign order and unavailable source remain read-only without recommending a duplicate order", async ({
  page,
}) => {
  const f = await fixture(page, { foreign: true, status: "unavailable" });
  await expect(f.component).toContainText("Runner-Paket nicht verfügbar");
  await expect(f.component.getByRole("checkbox")).toHaveCount(0);
  await expect(
    f.component.getByRole("button", {
      name: "Ausführungsbindung aktualisieren",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(f.component).not.toContainText("neu bestellen");
  expect(f.mutations).toEqual([]);
});

test("a delayed old-tenant lifecycle response cannot restore old order actions after workspace change", async ({
  page,
}) => {
  const f = await fixture(page, { pending: true });
  await expect.poll(f.reads).toBe(1);
  await f.switchTenant();
  await expect(
    page.getByRole("region", { name: "Bestelldetails", exact: true }),
  ).toHaveCount(0);
  f.release();
  await expect(
    page.getByRole("region", {
      name: "Ausführungsstand der Bestellung",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Ausführungsbindung aktualisieren",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(f.mutations).toEqual([]);
});

test("a late upgrade response cannot reload the previous workspace's order list", async ({
  page,
}) => {
  const f = await fixture(page, { pendingUpgrade: true });
  await f.component
    .getByRole("checkbox", { name: checkbox, exact: true })
    .check();
  await f.component
    .getByRole("button", {
      name: "Ausführungsbindung aktualisieren",
      exact: true,
    })
    .click();
  await expect.poll(() => f.mutations.length).toBe(1);
  await f.switchTenant();
  await expect(
    page.getByRole("region", { name: "Bestelldetails", exact: true }),
  ).toHaveCount(0);
  f.release();
  await expect.poll(f.upgradeResponseFinished).toBe(true);
  await expect(
    page.getByRole("region", {
      name: "Ausführungsstand der Bestellung",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Ausführungsbindung aktualisieren",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(f.mutations).toHaveLength(1);
});

for (const action of ["plan", "drift"] as const) {
  for (const failure of [
    {
      code: "application_execution_source_withdrawn",
      detail:
        "Dieser Ausführungsstand wurde zurückgezogen. Prüfe den angebotenen Upgrade-Pfad für dieselbe Bestellung und denselben State.",
    },
    {
      code: "application_execution_package_unavailable",
      detail:
        "Das gebundene Runner-Paket ist derzeit nicht verfügbar. Die Bestellung und ihr State bleiben erhalten.",
    },
    {
      code: "application_execution_binding_changed",
      detail:
        "Die Ausführungsbindung passt nicht mehr zum Prüfstand. Lade den Status erneut; Bestellung und State bleiben erhalten.",
    },
    {
      code: "application_recovery_source_unavailable",
      detail:
        "Die ursprüngliche Recovery-Quelle wurde zurückgezogen oder ihr geprüftes Paket fehlt. Ein Operator muss ein geprüftes kompatibles Recovery-Paket bereitstellen.",
    },
  ]) {
    test(`existing order ${action} reports ${failure.code} with an actionable retained-State explanation`, async ({
      page,
    }) => {
      const f = await fixture(page, { planError: failure.code });
      const details = page.getByRole("region", {
        name: "Bestelldetails",
        exact: true,
      });
      await details
        .getByRole("tab", {
          name: action === "drift" ? "Drift" : "Plan",
          exact: true,
        })
        .click();
      const panel = details.locator("#application-order-panel-execution");
      const button = panel.getByRole("button", {
        name: action === "drift" ? "Drift prüfen" : "Cloud-Plan starten",
        exact: true,
      });
      await expect(button).toBeEnabled();
      await button.click();
      const alert = panel.getByRole("alert");
      await expect(alert).toContainText(failure.detail);
      await expect(alert).not.toContainText(
        "Der Application-Dienst ist derzeit nicht erreichbar.",
      );
      await expect(alert).not.toContainText(failure.code);
      await expect(alert).not.toContainText("neu bestellen");
      if (failure.code === "application_recovery_source_unavailable") {
        await expect(alert).toContainText(
          "Bestellung, State und Sperre bleiben erhalten",
        );
        await expect(alert).toContainText(
          "Upgrade und Apply sind bis zum Abgleich gesperrt",
        );
      }
      await expect(f.component.getByTitle(origin, { exact: true })).toHaveCount(
        3,
      );
      expect(f.mutations).toHaveLength(1);
      expect(f.mutations[0]).toMatchObject({
        path: `instances/${instanceId}/plan`,
        body: {
          idempotencyKey: expect.stringMatching(/^[a-f0-9-]{36}$/),
          ...(action === "drift" ? { purpose: "drift" } : {}),
        },
      });
      expect(f.instanceReads()).toBe(1);
      await details
        .getByRole("tab", { name: "Übersicht", exact: true })
        .click();
      await expect(details).toContainText(
        `applications/${tenantId}/${instanceId}/terraform.tfstate`,
      );
      expect(f.mutations).toHaveLength(1);
    });
  }
}
