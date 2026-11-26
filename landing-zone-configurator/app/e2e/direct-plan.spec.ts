import { platformUpgradeAcceleratorCommit } from "@lzc/contracts";
import { createEditorConfiguration, editCommonInput } from "@lzc/domain";
import { expect, type Page, test } from "./fixtures";

const userId = "11111111-1111-4111-8111-111111111111",
  tenantId = "22222222-2222-4222-8222-222222222222",
  orgId = "33333333-3333-4333-8333-333333333333",
  configId = "44444444-4444-4444-8444-444444444444",
  credentialId = "55555555-5555-4555-8555-555555555555",
  prepId = "66666666-6666-4666-8666-666666666666",
  runId = "77777777-7777-4777-8777-777777777777";
async function setup(
  page: Page,
  options: {
    credentials?: boolean;
    failedApply?: boolean;
    locked?: boolean;
  } = {},
) {
  let revision = 1;
  let draft = {
    ...editCommonInput(
      editCommonInput(
        createEditorConfiguration("standalone", configId),
        "organization_id",
        orgId,
      ),
      "owner_email",
      "platform@company.test",
    ),
    name: "Direct plan platform",
  };
  let profiles =
    options.credentials === false
      ? []
      : [
          {
            id: credentialId,
            name: "Deployment service account",
            state: "stored",
          },
        ];
  const mutations: { path: string; body: Record<string, unknown> }[] = [];
  const preparation = () => ({
    id: prepId,
    name: draft.name,
    credentialId,
    createdAt: new Date().toISOString(),
    manifest: {
      source: { kind: "database", configurationId: configId, revision },
      organization: { id: orgId, name: "Test organization" },
      accelerator: { commit: platformUpgradeAcceleratorCommit },
      check: { status: "passed" },
    },
  });
  let runs: Record<string, unknown>[] = options.failedApply
    ? [
        {
          id: runId,
          preparationId: prepId,
          operation: "apply",
          status: options.locked ? "recovery_required" : "failed",
          createdAt: new Date().toISOString(),
          errorCode: "apply_failed",
          retryCheckpointRequired: options.locked === true,
        },
      ]
    : [];
  await page.route("**/auth/status", (r) =>
    r.fulfill({ json: { github: false, stackit: true, primary: "stackit" } }),
  );
  await page.route("**/api/v1/session", (r) =>
    r.fulfill({
      json: {
        user: { id: userId, login: "platform@example.test" },
        tenant: {
          id: tenantId,
          kind: "organisation",
          roles: ["platform-engineer"],
        },
        csrfToken: "direct-plan-csrf",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    }),
  );
  await page.route("**/api/v1/configurations", (r) =>
    r.fulfill({
      json: { configurations: [{ id: configId, name: draft.name, revision }] },
    }),
  );
  await page.route(`**/api/v1/configurations/${configId}`, async (r) => {
    if (r.request().method() === "PUT") {
      const body = r.request().postDataJSON();
      expect(body.revision).toBe(revision);
      revision++;
      draft = body.draft;
      mutations.push({ path: "save", body });
    }
    await r.fulfill({
      json: {
        configuration: { id: configId, name: draft.name, revision, draft },
      },
    });
  });
  await page.route("**/api/v1/credentials", async (r) => {
    if (r.request().method() === "POST") {
      const body = r.request().postDataJSON();
      expect(r.request().headers()["x-lzc-csrf"]).toBe("direct-plan-csrf");
      profiles = [{ id: credentialId, name: body.name, state: "stored" }];
      mutations.push({ path: "credential", body });
      return r.fulfill({
        status: 201,
        json: { stored: true, profileId: credentialId },
      });
    }
    await r.fulfill({ json: { profiles } });
  });
  await page.route("**/api/v1/backends*", (r) =>
    r.fulfill(
      new URL(r.request().url()).search
        ? { status: 404, json: { error: "backend_not_found" } }
        : { json: { backends: [] } },
    ),
  );
  await page.route("**/api/v1/preparations", (r) => {
    if (r.request().method() === "POST") {
      const body = r.request().postDataJSON();
      expect(body).toEqual({
        source: "database",
        configurationId: configId,
        revision,
        credentialId,
        platformUpgrade: {
          confirm: true,
          acceleratorCommit: platformUpgradeAcceleratorCommit,
        },
      });
      mutations.push({ path: "prepare", body });
      return r.fulfill({ status: 201, json: preparation() });
    }
    return r.fulfill({
      json: {
        preparations:
          options.failedApply || mutations.some((m) => m.path === "prepare")
            ? [preparation()]
            : [],
        capabilities: {
          platformUpgradeEnabled: true,
          runnerAcceleratorCommit: platformUpgradeAcceleratorCommit,
        },
      },
    });
  });
  await page.route("**/api/v1/plans", (r) => {
    if (r.request().method() === "POST") {
      const body = r.request().postDataJSON();
      expect(body).toEqual({
        preparationId: prepId,
        confirmStateBinding: true,
      });
      mutations.push({ path: "plan", body });
      runs = [
        {
          id: crypto.randomUUID(),
          preparationId: prepId,
          operation: "plan",
          status: "failed",
          createdAt: new Date().toISOString(),
          errorCode: "plan_failed",
        },
        ...runs,
      ];
      return r.fulfill({ status: 201, json: runs[0] });
    }
    return r.fulfill({ json: { runs } });
  });
  return { mutations, revision: () => revision };
}
async function openSavedPlan(page: Page) {
  await page.goto("/configurations");
  await page
    .getByRole("button", {
      name: "Plan erstellen: Direct plan platform",
      exact: true,
    })
    .click();
  return page.getByRole("dialog", { name: "Plan erstellen", exact: true });
}
async function confirmAndStart(page: Page) {
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("checkbox", {
      name: "Ich bestätige Zielorganisation und State-Zuordnung für diesen Plan.",
      exact: true,
    })
    .check();
  await dialog
    .getByRole("button", { name: /^(Speichern und )?Plan erstellen$/ })
    .click();
  await expect(dialog).toHaveCount(0);
}
test("starts directly from the saved configuration, retains exact bindings and offers retry after a failed Plan", async ({
  page,
}, testInfo) => {
  const state = await setup(page);
  const dialog = await openSavedPlan(page);
  await expect(
    dialog.getByLabel("Deployment-Zugang", { exact: true }),
  ).toHaveValue(credentialId);
  await expect(
    dialog.getByRole("button", { name: "Plan erstellen", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Vorbereitung", exact: true }),
  ).toHaveCount(0);
  expect(state.mutations).toEqual([]);
  await confirmAndStart(page);
  await expect(
    page.getByText("OpenTofu konnte keinen vollständigen Plan erstellen.", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Neuen Plan erstellen", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("direct-plan.png"),
    fullPage: true,
  });
  expect(state.mutations.map((m) => m.path)).toEqual(["prepare", "plan"]);
  await dialog.getByRole("button", { name: "Schließen", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("adds credentials inside the plan dialog and selects the returned profile without navigating away", async ({
  page,
}) => {
  const state = await setup(page, { credentials: false });
  const dialog = await openSavedPlan(page);
  await dialog
    .getByRole("button", { name: "Zugang hinzufügen", exact: true })
    .click();
  await dialog
    .getByRole("textbox", { name: "Profilname", exact: true })
    .fill("New deployment account");
  await dialog
    .getByLabel("Service-Account-Schlüssel (JSON)", { exact: true })
    .setInputFiles({
      name: "synthetic-key.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ synthetic: "key-for-mocked-api" })),
    });
  await dialog
    .getByRole("button", { name: "Zugang sicher speichern", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Deployment-Zugang", { exact: true }),
  ).toHaveValue(credentialId);
  await expect(page).toHaveURL(/\/deployments\/plan$/);
  await expect(
    dialog.getByLabel("Service-Account-Schlüssel (JSON)", { exact: true }),
  ).toHaveCount(0);
  await confirmAndStart(page);
  expect(state.mutations.map((m) => m.path)).toEqual([
    "credential",
    "prepare",
    "plan",
  ]);
});
for (const viaDeployments of [false, true])
  test(`saves an edited configuration only after explicit confirmation and plans the resulting revision${viaDeployments ? " through Deployments" : " from the editor"}`, async ({
    page,
  }) => {
    const state = await setup(page);
    await page.goto("/configurations");
    await page
      .getByRole("button", {
        name: "Konfiguration öffnen: Direct plan platform",
        exact: true,
      })
      .click();
    await page
      .getByRole("textbox", { name: "Name der Konfiguration", exact: true })
      .fill("Direct plan platform edited");
    if (viaDeployments) {
      await page
        .getByRole("navigation", { name: "Hauptnavigation", exact: true })
        .getByRole("button", { name: "Deployments", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Neuen Plan erstellen", exact: true })
        .click();
    } else {
      await page
        .getByRole("navigation", { name: "Konfiguration", exact: true })
        .getByRole("button", {
          name: "Speichern und Plan erstellen",
          exact: true,
        })
        .click();
    }
    expect(state.mutations).toEqual([]);
    await expect(
      page
        .getByRole("dialog")
        .getByText("Direct plan platform edited", { exact: true }),
    ).toBeVisible();
    await confirmAndStart(page);
    expect(state.revision()).toBe(2);
    expect(state.mutations.map((m) => m.path)).toEqual([
      "save",
      "prepare",
      "plan",
    ]);
  });
for (const locked of [false, true])
  test(`Apply retry ${locked ? "automatically reconciles a verified retained State" : "creates a fresh Plan without replaying an old Apply"}`, async ({
    page,
  }) => {
    const state = await setup(page, { failedApply: true, locked });
    const recovery: string[] = [];
    await page.route(`**/api/v1/plans/${runId}/checkpoint`, (r) => {
      recovery.push("checkpoint");
      return r.fulfill({
        json: {
          stateVersion: "1",
          checkpointSha256: "a".repeat(64),
          serial: 1,
          lockHeld: false,
          pendingMigration: false,
          recoveryAvailable: false,
          canResume: true,
          resources: [],
        },
      });
    });
    await page.route(`**/api/v1/plans/${runId}/reconcile`, (r) => {
      expect(r.request().postDataJSON()).toMatchObject({
        confirmRetainState: true,
        stateVersion: "1",
        checkpointSha256: "a".repeat(64),
      });
      recovery.push("reconcile");
      return r.fulfill({ json: { id: runId, reconciled: true } });
    });
    await page.goto("/deployments/apply");
    await page
      .getByRole("button", { name: "Apply erneut versuchen", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Apply erneut versuchen",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByLabel("Deployment-Zugang", { exact: true }),
    ).toHaveValue(credentialId);
    expect(state.mutations).toEqual([]);
    await confirmAndStart(page);
    expect(state.mutations.map((m) => m.path)).toEqual(["prepare", "plan"]);
    expect(recovery).toEqual(locked ? ["checkpoint", "reconcile"] : []);
  });

test("Apply retry requires a deliberate credential choice when the previous profile is unavailable", async ({
  page,
}) => {
  const state = await setup(page, { failedApply: true });
  const replacement = "88888888-8888-4888-8888-888888888888";
  await page.route("**/api/v1/credentials", (route) =>
    route.fulfill({
      json: {
        profiles: [
          { id: replacement, name: "Replacement account", state: "stored" },
        ],
      },
    }),
  );
  await page.goto("/deployments/apply");
  await page
    .getByRole("button", { name: "Apply erneut versuchen", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Apply erneut versuchen",
    exact: true,
  });
  const credential = dialog.getByLabel("Deployment-Zugang", { exact: true });
  await expect(credential).toHaveValue("");
  await expect(
    dialog.getByText(
      "Der bisherige Zugang ist nicht mehr verfügbar. Wähle einen Zugang oder lege ihn hier an.",
      { exact: true },
    ),
  ).toBeVisible();
  await dialog.getByRole("checkbox").check();
  await expect(
    dialog.getByRole("button", { name: "Plan erstellen", exact: true }),
  ).toBeDisabled();
  expect(state.mutations).toEqual([]);
  await credential.selectOption(replacement);
  await expect(
    dialog.getByRole("button", { name: "Plan erstellen", exact: true }),
  ).toBeEnabled();
  expect(state.mutations).toEqual([]);
});

test("Apply retry keeps a locked State blocked without technical confirmation in the normal flow", async ({
  page,
}) => {
  const state = await setup(page, { failedApply: true, locked: true });
  let reconciled = false;
  await page.route(`**/api/v1/plans/${runId}/checkpoint`, (route) =>
    route.fulfill({
      json: {
        stateVersion: "1",
        checkpointSha256: "a".repeat(64),
        serial: 1,
        lockHeld: true,
        pendingMigration: false,
        recoveryAvailable: false,
        canResume: false,
        resources: [],
      },
    }),
  );
  await page.route(`**/api/v1/plans/${runId}/reconcile`, (route) => {
    reconciled = true;
    return route.fulfill({ status: 409, json: { error: "state_locked" } });
  });
  await page.goto("/deployments/apply");
  await page
    .getByRole("button", { name: "Apply erneut versuchen", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Aktualisiere den Ausführungsstatus" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Apply erneut versuchen", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", { name: /Ich habe den Checkpoint geprüft/ }),
  ).toBeHidden();
  expect(reconciled).toBe(false);
  expect(state.mutations).toEqual([]);
});
