import { mockEmptyApplicationLists } from "./editor-navigation";
import { expect, test } from "./fixtures";

test.use({ locale: "en-US" });
const tenant = "22222222-2222-4222-8222-222222222222",
  user = "11111111-1111-4111-8111-111111111111",
  id = "33333333-3333-4333-8333-333333333333";
const stateKey = `platform/${tenant}/fixture/terraform.tfstate`;
test("announces retirement with an explicit scope and seven-day window, and fences pause by generation", async ({
  page,
}, info) => {
  await mockEmptyApplicationLists(page);
  await page.route("**/api/v1/backends", (route) =>
    route.fulfill({ json: { backends: [] } }),
  );
  await page.route("**/auth/status", (route) =>
    route.fulfill({
      json: { stackit: true, github: false, primary: "stackit" },
    }),
  );
  await page.route("**/api/v1/session", (route) =>
    route.fulfill({
      json: {
        user: { id: user, login: "owner@example.test" },
        tenant: {
          id: tenant,
          name: "Kundenbereich",
          kind: "organisation",
          roles: ["platform-engineer"],
          manageMembers: true,
        },
        csrfToken: "retirement-csrf",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        stackitVerified: true,
      },
    }),
  );
  let current: Record<string, unknown> | null = null;
  const mutations: Record<string, unknown>[] = [];
  await page.route("**/api/v1/retirements**", async (route) => {
    expect(route.request().headers()["x-lzc-tenant"]).toBe(tenant);
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "GET")
      return route.fulfill({
        json: path.endsWith("/candidates")
          ? current
            ? []
            : [{ stateKey, name: "Company platform", applicationCount: 1 }]
          : current
            ? [current]
            : [],
      });
    const body = route.request().postDataJSON();
    mutations.push(body);
    expect(route.request().headers()["x-lzc-csrf"]).toBe("retirement-csrf");
    if (!current) {
      expect(body.confirmRetirement).toBe(true);
      expect(body.stateKey).toBe(stateKey);
      expect(Date.parse(body.notBefore) - Date.now()).toBeGreaterThan(
        6.9 * 86400000,
      );
      current = {
        id,
        name: "Company platform",
        stateKey,
        organizationId: "44444444-4444-4444-8444-444444444444",
        createdBy: user,
        reason: body.reason,
        notBefore: body.notBefore,
        createdAt: new Date().toISOString(),
        phase: "RETIRING",
        generation: 1,
        applications: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            name: "Forschungsumgebung",
            requestedBy: user,
          },
        ],
        blockers: ["retirement-preparation-window"],
      };
    } else {
      expect(body.generation).toBe(current.generation);
      current = {
        ...current,
        phase: body.action === "pause" ? "PAUSED" : "RETIRING",
        generation: Number(current.generation) + 1,
      };
    }
    return route.fulfill({ json: current });
  });
  await page.goto("/deployments/history");
  const panel = page.getByRole("region", { name: "Retire landing zones" });
  await expect(panel).toHaveCount(0);
  const retireTab = page.getByRole("button", { name: "Retire", exact: true });
  await retireTab.click();
  await expect(page).toHaveURL(/\/deployments\/retire$/);
  await expect(retireTab).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "Retire", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(panel).toBeVisible();
  const submit = panel.getByRole("button", {
    name: "Announce retirement and block new deployments",
  });
  await expect(submit).toBeDisabled();
  await panel.getByLabel("Select platform").selectOption(stateKey);
  await panel.getByLabel("Reason for retirement").fill("Demo abgeschlossen");
  await panel.getByRole("checkbox").check();
  await submit.click();
  await expect(panel.getByRole("status")).toHaveText("Retirement announced");
  await expect(panel).toContainText("Forschungsumgebung");
  await expect(panel).toContainText("Demo abgeschlossen");
  await expect(panel).toContainText(
    "The announced preparation window has not ended.",
  );
  await panel
    .getByRole("button", { name: "Pause retirement", exact: true })
    .click();
  await expect(panel.getByRole("status")).toHaveText("Retirement paused");
  expect(mutations).toHaveLength(2);
  await expect(panel).not.toContainText("Rückbau");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("retirement.png"),
    fullPage: true,
  });
});

test("reviews exact deletions before Apply and preserves the folder purge wait", async ({
  page,
}, info) => {
  await mockEmptyApplicationLists(page);
  await page.route("**/api/v1/backends", (route) =>
    route.fulfill({ json: { backends: [] } }),
  );
  await page.route("**/auth/status", (route) =>
    route.fulfill({
      json: { stackit: true, github: false, primary: "stackit" },
    }),
  );
  await page.route("**/api/v1/session", (route) =>
    route.fulfill({
      json: {
        user: { id: user, login: "owner@example.test" },
        tenant: {
          id: tenant,
          name: "Dev retirement pilot",
          kind: "organisation",
          roles: ["platform-engineer"],
          manageMembers: true,
        },
        csrfToken: "retirement-csrf",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        stackitVerified: true,
      },
    }),
  );
  const scopeId = "66666666-6666-4666-8666-666666666666",
    planId = "77777777-7777-4777-8777-777777777777",
    applyId = "88888888-8888-4888-8888-888888888888",
    profileId = "99999999-9999-4999-8999-999999999999",
    hash = "a".repeat(64);
  const current = {
    id,
    name: "Disposable Dev platform",
    stateKey,
    organizationId: "44444444-4444-4444-8444-444444444444",
    createdBy: user,
    reason: "Dev qualification",
    notBefore: new Date(Date.now() - 60000).toISOString(),
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    phase: "PREPARED",
    generation: 1,
    applications: [],
    blockers: [],
  };
  let handoff = false,
    planned = false,
    inspected = false,
    applied = false,
    applyInspected = false;
  await page.route("**/api/v1/credentials", (route) =>
    route.fulfill({
      json: {
        profiles: [
          {
            id: profileId,
            name: "Independent cleanup",
            serviceAccount: "cleanup@example.test",
            state: "stored",
          },
        ],
      },
    }),
  );
  const review = () => ({
    retirementId: id,
    generation: 1,
    hasHandoff: handoff,
    prepared: handoff,
    canPrepare: !handoff,
    scopes: handoff
      ? [
          {
            id: scopeId,
            name: current.name,
            instanceId: null,
            stage: "finalize_folders",
            stateVersion: "1",
            canPlan: !planned || (applied && applyInspected),
          },
        ]
      : [],
    jobs: planned
      ? [
          {
            id: planId,
            scopeId,
            operatorId: user,
            generation: 1,
            operation: "plan",
            phase: "finalize_folders",
            status: "succeeded",
            nativeStatus: "succeeded",
            createdAt: current.createdAt,
            sourceRevision: "a".repeat(40),
            providerLockSha256: "b".repeat(64),
            artifactSha256: hash,
            deleteCount: 1,
            canApply: inspected && !applied,
            canInspect: !inspected,
            recoveryAvailable: false,
            recoveryPending: false,
            errorCode: null,
          },
          ...(applied
            ? [
                {
                  id: applyId,
                  scopeId,
                  operatorId: user,
                  generation: 1,
                  operation: "apply",
                  phase: "finalize_folders",
                  status: applyInspected ? "failed" : "recovery_required",
                  nativeStatus: "failed",
                  createdAt: new Date().toISOString(),
                  sourceRevision: "a".repeat(40),
                  providerLockSha256: "b".repeat(64),
                  artifactSha256: null,
                  deleteCount: 0,
                  canApply: false,
                  canInspect: !applyInspected,
                  recoveryAvailable: false,
                  recoveryPending: false,
                  errorCode: "retirement_folder_purge_pending",
                },
              ]
            : []),
        ]
      : [],
  });
  await page.route("**/api/v1/retirements**", async (route) => {
    expect(route.request().headers()["x-lzc-tenant"]).toBe(tenant);
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "GET") {
      if (path.endsWith("/candidates")) return route.fulfill({ json: [] });
      if (path.endsWith("/execution")) return route.fulfill({ json: review() });
      if (path.endsWith("/preview"))
        return route.fulfill({
          json: {
            id: planId,
            phase: "finalize_folders",
            artifactSha256: hash,
            deletes: [
              {
                address:
                  'module.governance.stackit_resourcemanager_folder.this["platform"]',
                type: "stackit_resourcemanager_folder",
                id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              },
            ],
          },
        });
      return route.fulfill({ json: [current] });
    }
    const body = route.request().postDataJSON();
    expect(body.generation).toBe(1);
    expect(route.request().headers()["x-lzc-csrf"]).toBe("retirement-csrf");
    if (path.endsWith("/prepare")) {
      expect(body).toMatchObject({
        credentialProfileId: profileId,
        confirmStateHandoff: true,
        confirmCleanupPermissionsSurvive: true,
      });
      handoff = true;
    }
    if (path.endsWith("/plans")) {
      expect(body.scopeId).toBe(scopeId);
      planned = true;
    }
    if (path.endsWith("/inspect")) {
      if (path.includes(applyId)) {
        applyInspected = true;
        current.phase = "WAITING_FOR_PURGE";
      } else inspected = true;
    }
    if (path.endsWith("/apply")) {
      expect(inspected).toBe(true);
      expect(body).toMatchObject({
        artifactSha256: hash,
        confirmDestroyResources: true,
        confirmDataRetentionReviewed: true,
      });
      applied = true;
      current.phase = "NEEDS_ATTENTION";
    }
    return route.fulfill({ json: { id: applyId } });
  });
  await page.goto("/deployments/retire");
  const panel = page.getByRole("region", { name: "Retire landing zones" });
  await panel
    .getByRole("button", { name: "Retirement steps and approvals" })
    .click();
  await panel
    .getByRole("combobox", { name: "Service account profile", exact: true })
    .selectOption(profileId);
  await panel
    .getByLabel("Independent service account's home project ID")
    .fill("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  const prepare = panel.getByRole("button", {
    name: "Verify retirement credentials and hand over state",
  });
  await expect(prepare).toBeDisabled();
  await panel
    .getByRole("checkbox", {
      name: "I confirm that the retirement credentials and their permissions will remain available.",
    })
    .check();
  await panel
    .getByRole("checkbox", { name: /I confirm the state handover/ })
    .check();
  await prepare.click();
  await panel.getByRole("button", { name: "Create retirement plan" }).click();
  await panel
    .getByRole("button", { name: "Review deletions", exact: true })
    .click();
  const apply = panel.getByRole("button", {
    name: "Apply reviewed retirement plan",
  });
  await expect(apply).toBeDisabled();
  await panel
    .getByRole("checkbox", {
      name: "Data exports, backups and retention requirements have been reviewed.",
    })
    .check();
  await panel
    .getByRole("checkbox", {
      name: "I confirm permanent deletion of exactly this reviewed scope.",
    })
    .check();
  await expect(apply).toBeDisabled();
  await panel
    .getByRole("button", { name: "Verify runner stop and result" })
    .click();
  // A refreshed review invalidates the previous selection; approve the exact Plan again.
  await panel
    .getByRole("button", { name: "Review deletions", exact: true })
    .click();
  await panel
    .getByRole("checkbox", {
      name: "Data exports, backups and retention requirements have been reviewed.",
    })
    .check();
  await panel
    .getByRole("checkbox", {
      name: "I confirm permanent deletion of exactly this reviewed scope.",
    })
    .check();
  await expect(apply).toBeEnabled();
  await apply.click();
  await panel
    .getByRole("button", { name: "Verify runner stop and result" })
    .click();
  await expect(
    panel.getByText("Waiting for STACKIT project removal", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText(/STACKIT has not yet allowed folder deletion/),
  ).toBeVisible();
  await expect(panel.getByText("Failed", { exact: true })).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Create retirement plan" }),
  ).toBeEnabled();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("retirement-execution.png"),
    fullPage: true,
  });
});
