import { mockEmptyApplicationLists } from "./editor-navigation";
import { expect, test } from "./fixtures";

test.use({ locale: "en-US" });
const tenant = "22222222-2222-4222-8222-222222222222",
  user = "11111111-1111-4111-8111-111111111111",
  id = "33333333-3333-4333-8333-333333333333";
const stateKey = `platform/${tenant}/fixture/terraform.tfstate`;
test("announces retirement with an explicit scope and archives cancellation after a generation-fenced pause", async ({
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
    if (route.request().method() === "GET" && path.endsWith("/execution"))
      return route.fulfill({
        json: {
          retirementId: id,
          generation: current?.generation ?? 1,
          hasHandoff: false,
          prepared: false,
          canPrepare: false,
          scopes: [],
          jobs: [],
        },
      });
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
        canCancel: true,
      };
    } else {
      expect(body.generation).toBe(current.generation);
      current = {
        ...current,
        phase:
          body.action === "cancel"
            ? "CANCELLED"
            : body.action === "pause"
              ? "PAUSED"
              : "RETIRING",
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
  await panel
    .getByText("Announcement and affected landing zones", { exact: true })
    .click();
  await expect(panel).toContainText("Forschungsumgebung");
  await expect(panel).toContainText("Demo abgeschlossen");
  await expect(panel).toContainText(
    "The announced preparation window has not ended.",
  );
  await panel.getByText("Manage retirement", { exact: true }).click();
  await panel
    .getByRole("button", { name: "Pause retirement", exact: true })
    .click();
  await expect(panel.getByRole("status")).toHaveText("Retirement paused");
  expect(mutations).toHaveLength(2);
  await panel
    .getByRole("button", { name: "Resume retirement", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await panel
    .getByRole("button", { name: "Cancel retirement", exact: true })
    .click();
  await expect(panel.locator(".retirement-current")).toHaveCount(0);
  await expect(
    panel.getByText(
      "No retirement is in progress. Previous attempts are available in the history.",
    ),
  ).toBeVisible();
  await expect(
    panel.getByText("Retirement history (1)", { exact: true }),
  ).toBeVisible();
  expect(mutations).toHaveLength(4);
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
    homeAttempts = 0,
    planned = false,
    inspected = false,
    inspectionAttempts = 0,
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
      if (path.endsWith("/output"))
        return route.fulfill({
          json: {
            text: "$ tofu plan\nPlan: 0 to add, 0 to change, 1 to destroy.\n",
            truncated: false,
          },
        });
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
    if (path.endsWith("/credential-project")) {
      expect(body.credentialProfileId).toBe(profileId);
      if (++homeAttempts === 1)
        return route.fulfill({
          status: 503,
          json: { error: "retirement_cloud_unavailable" },
        });
      return route.fulfill({
        json: {
          credentialProfileId: profileId,
          projectId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          name: "Customer bootstrap",
        },
      });
    }
    if (path.endsWith("/prepare")) {
      expect(body.cleanupProjectId).toBeUndefined();
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
      } else {
        if (++inspectionAttempts === 1)
          return route.fulfill({
            status: 409,
            json: { error: "retirement_runner_not_stopped" },
          });
        inspected = true;
      }
      return route.fulfill({ json: review() });
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
    .getByRole("combobox", { name: "Service account profile", exact: true })
    .selectOption(profileId);
  await expect(
    panel.getByText(
      "The service account’s project could not be determined. Check the selected credentials and their permissions.",
    ),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", {
      name: "Verify retirement credentials and hand over state",
    }),
  ).toBeDisabled();
  await panel
    .getByRole("button", { name: "Check project assignment again" })
    .click();
  await expect(
    panel.getByText("Project assignment verified.", { exact: true }),
  ).toBeVisible();
  await panel
    .getByText("Service account project details", { exact: true })
    .click();
  await expect(panel.getByText("Customer bootstrap")).toBeVisible();
  await page.screenshot({
    path: info.outputPath("retirement-home-project.png"),
    fullPage: true,
  });
  await expect(
    panel.getByLabel("Independent service account's home project ID"),
  ).toHaveCount(0);
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
  await expect(
    panel.getByText(
      "The completion check has not finished yet. It will retry automatically.",
    ),
  ).toBeVisible();
  expect(applied).toBe(false);
  // The app verifies completion and retries a not-yet-stopped result without
  // requiring a technical action or losing the owner's exact deletion review.
  await expect(apply).toBeEnabled({ timeout: 15000 });
  expect(inspectionAttempts).toBe(2);
  expect(applied).toBe(false);
  await expect(
    panel.getByRole("checkbox", {
      name: "I confirm permanent deletion of exactly this reviewed scope.",
    }),
  ).toBeChecked();
  await apply.click();
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

test("keeps the selected profile's home project when an older lookup finishes late", async ({
  page,
}) => {
  await mockEmptyApplicationLists(page);
  const first = "55555555-5555-4555-8555-555555555555",
    second = "66666666-6666-4666-8666-666666666666";
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
          name: "Workspace",
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
  await page.route("**/api/v1/credentials", (route) =>
    route.fulfill({
      json: {
        profiles: [
          {
            id: first,
            name: "First profile",
            serviceAccount: "first@example.test",
            state: "stored",
          },
          {
            id: second,
            name: "Second profile",
            serviceAccount: "second@example.test",
            state: "stored",
          },
        ],
      },
    }),
  );
  let oldSeen = false,
    releaseOld: (() => Promise<void>) | undefined;
  await page.route("**/api/v1/retirements**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/candidates")) return route.fulfill({ json: [] });
    if (path.endsWith("/execution"))
      return route.fulfill({
        json: {
          retirementId: id,
          generation: 1,
          hasHandoff: false,
          prepared: false,
          canPrepare: true,
          scopes: [],
          jobs: [],
        },
      });
    if (path.endsWith("/credential-project")) {
      const body = route.request().postDataJSON();
      if (body.credentialProfileId === first) {
        oldSeen = true;
        releaseOld = () =>
          route
            .fulfill({
              json: {
                credentialProfileId: first,
                projectId: first,
                name: "Stale bootstrap project",
              },
            })
            .catch(() => {});
        return;
      }
      expect(body.credentialProfileId).toBe(second);
      return route.fulfill({
        json: {
          credentialProfileId: second,
          projectId: second,
          name: "Selected bootstrap project",
        },
      });
    }
    return route.fulfill({
      json: [
        {
          id,
          stateKey,
          name: "Company platform",
          organizationId: "44444444-4444-4444-8444-444444444444",
          createdBy: user,
          reason: "Retire",
          notBefore: new Date(Date.now() - 60000).toISOString(),
          createdAt: new Date().toISOString(),
          phase: "PREPARED",
          generation: 1,
          applications: [],
          blockers: [],
        },
      ],
    });
  });
  await page.goto("/deployments/retire");
  const panel = page.getByRole("region", { name: "Retire landing zones" });
  const select = panel.getByRole("combobox", {
    name: "Service account profile",
    exact: true,
  });
  await select.selectOption(first);
  await expect.poll(() => oldSeen).toBe(true);
  const aborted = page.waitForEvent("requestfailed", {
    predicate: (r) =>
      r.url().endsWith("/credential-project") &&
      r.postDataJSON()?.credentialProfileId === first,
  });
  await select.selectOption(second);
  await aborted;
  await expect(
    panel.getByText("Project assignment verified.", { exact: true }),
  ).toBeVisible();
  await panel
    .getByText("Service account project details", { exact: true })
    .click();
  await expect(panel.getByText("Selected bootstrap project")).toBeVisible();
  await releaseOld?.();
  await expect(panel.getByText("Selected bootstrap project")).toBeVisible();
  await expect(panel.getByText("Stale bootstrap project")).toHaveCount(0);
});

test("refreshes a running retirement automatically and shows native output, failure and step details", async ({
  page,
}, info) => {
  await mockEmptyApplicationLists(page);
  await page.route("**/auth/status", (route) =>
    route.fulfill({
      json: { stackit: true, github: false, primary: "stackit" },
    }),
  );
  await page.route("**/api/v1/backends", (route) =>
    route.fulfill({ json: { backends: [] } }),
  );
  await page.route("**/api/v1/credentials", (route) =>
    route.fulfill({ json: { profiles: [] } }),
  );
  await page.route("**/api/v1/session", (route) =>
    route.fulfill({
      json: {
        user: { id: user, login: "owner@example.test" },
        tenant: {
          id: tenant,
          name: "Retirement output test",
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
  const jobId = "77777777-7777-4777-8777-777777777777",
    scopeId = "66666666-6666-4666-8666-666666666666";
  const current = {
    id,
    name: "Retirement output pilot",
    stateKey,
    organizationId: "44444444-4444-4444-8444-444444444444",
    createdBy: user,
    reason: "Synthetic retirement progress",
    notBefore: new Date(Date.now() - 60000).toISOString(),
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    phase: "PREPARED",
    generation: 1,
    applications: [],
    blockers: [],
  };
  let stage: "starting" | "planning" | "recovery_required" = "starting";
  let mutationCount = 0;
  let outputReads = 0,
    reviewReads = 0;
  const delayed: {
    output?: () => Promise<void>;
    review?: () => Promise<void>;
    slowOutput?: () => Promise<void>;
    slowFailure?: () => string | null;
  } = {};
  await page.route("**/api/v1/retirements**", async (route) => {
    expect(route.request().headers()["x-lzc-tenant"]).toBe(tenant);
    if (route.request().method() !== "GET") {
      mutationCount++;
      return route.fulfill({
        status: 405,
        json: { error: "no mutation in this test" },
      });
    }
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/candidates")) return route.fulfill({ json: [] });
    if (path.endsWith("/output")) {
      if (++outputReads === 1)
        return new Promise<void>((resolve) => {
          delayed.output = async () => {
            await route
              .fulfill({
                json: { text: "STALE_STARTING_OUTPUT", truncated: false },
              })
              .catch(() => {});
            resolve();
          };
        });
      if (outputReads === 3)
        return new Promise<void>((resolve) => {
          delayed.slowFailure = () =>
            route.request().failure()?.errorText ?? null;
          delayed.slowOutput = async () => {
            await route.fulfill({
              json: {
                text: "$ tofu plan\nRefreshing state...\n",
                truncated: false,
              },
            });
            resolve();
          };
        });
      return route.fulfill({
        json: {
          text:
            stage === "starting"
              ? ""
              : stage === "planning"
                ? "$ tofu plan\nRefreshing state...\n"
                : "$ tofu plan\nError: Provider access denied\n",
          truncated: false,
        },
      });
    }
    if (path.endsWith("/execution")) {
      const value = {
        retirementId: id,
        generation: 1,
        hasHandoff: true,
        prepared: true,
        canPrepare: false,
        scopes: [
          {
            id: scopeId,
            name: current.name,
            instanceId: null,
            stage: "private_workloads",
            stateVersion: "1",
            canPlan: false,
          },
        ],
        jobs: [
          {
            id: jobId,
            scopeId,
            operatorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            generation: 1,
            operation: "plan",
            phase: "private_workloads",
            status: stage,
            nativeStatus: stage === "recovery_required" ? "failed" : null,
            createdAt: current.createdAt,
            sourceRevision: "a".repeat(40),
            providerLockSha256: "b".repeat(64),
            artifactSha256: null,
            deleteCount: 0,
            canApply: false,
            canInspect: stage === "recovery_required",
            recoveryAvailable: false,
            recoveryPending: false,
            errorCode:
              stage === "recovery_required" ? "retirement_plan_failed" : null,
          },
        ],
      };
      if (++reviewReads === 1)
        return new Promise<void>((resolve) => {
          delayed.review = async () => {
            await route.fulfill({ json: value });
            resolve();
          };
        });
      return route.fulfill({ json: value });
    }
    return route.fulfill({ json: [current] });
  });
  await page.goto("/deployments/retire");
  const panel = page.getByRole("region", { name: "Retire landing zones" });
  await expect(panel.getByText("Starting", { exact: true })).toBeVisible();
  await expect(
    panel.getByRole("list", { name: "Retirement steps" }),
  ).toBeVisible();
  await expect.poll(() => Boolean(delayed.output && delayed.review)).toBe(true);
  stage = "planning";
  await expect(panel.getByText("Creating plan", { exact: true })).toBeVisible({
    timeout: 7000,
  });
  const output = panel.getByRole("region", { name: "OpenTofu output" });
  await expect.poll(() => Boolean(delayed.slowOutput)).toBe(true);
  const statusReadsDuringDownload = reviewReads;
  await expect
    .poll(() => reviewReads)
    .toBeGreaterThan(statusReadsDuringDownload);
  expect(delayed.slowFailure?.()).toBe(null);
  await delayed.slowOutput?.();
  await expect(output).toContainText("Refreshing state...");
  await delayed.review?.();
  await delayed.output?.();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(panel.getByText("Starting", { exact: true })).toHaveCount(0);
  await expect(output).toContainText("Refreshing state...");
  await expect(output).not.toContainText("STALE_STARTING_OUTPUT");
  stage = "recovery_required";
  current.phase = "NEEDS_ATTENTION";
  await expect(output).toContainText("Provider access denied", {
    timeout: 7000,
  });
  await expect(
    panel.locator(".retirement-job").getByText("Failed", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText(
      "OpenTofu could not create the retirement Plan. Check the OpenTofu output.",
    ),
  ).toBeVisible();
  await expect(panel.getByText("Starting", { exact: true })).toHaveCount(0);
  await panel.getByText("Technical evidence", { exact: true }).click();
  await expect(panel.getByText(jobId, { exact: true })).toBeVisible();
  expect(mutationCount).toBe(0);
  await page.screenshot({
    path: info.outputPath("retirement-live-output.png"),
    fullPage: true,
  });
});

for (const paused of [false, true]) {
  test(`keeps protected runs visible without automatic mutation (${paused ? "paused" : "active"})`, async ({
    page,
  }) => {
    await mockEmptyApplicationLists(page);
    await page.route("**/auth/status", (route) =>
      route.fulfill({
        json: { stackit: true, github: false, primary: "stackit" },
      }),
    );
    await page.route("**/api/v1/backends", (route) =>
      route.fulfill({ json: { backends: [] } }),
    );
    await page.route("**/api/v1/session", (route) =>
      route.fulfill({
        json: {
          user: { id: user, login: "owner@example.test" },
          tenant: {
            id: tenant,
            name: "Completion boundaries",
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
    const current = {
      id,
      name: "Completion boundaries",
      stateKey,
      organizationId: "44444444-4444-4444-8444-444444444444",
      createdBy: user,
      reason: "Synthetic completion boundaries",
      notBefore: new Date(Date.now() - 60000).toISOString(),
      createdAt: new Date().toISOString(),
      phase: paused ? "PAUSED" : "PREPARED",
      generation: 1,
      applications: [],
      blockers: [],
    };
    const job = {
      scopeId: "66666666-6666-4666-8666-666666666666",
      operatorId: user,
      generation: 1,
      operation: "plan",
      phase: "private_workloads",
      status: "recovery_required",
      nativeStatus: "succeeded",
      createdAt: current.createdAt,
      sourceRevision: "a".repeat(40),
      providerLockSha256: "b".repeat(64),
      artifactSha256: null,
      deleteCount: 0,
      canApply: false,
      canInspect: true,
      recoveryAvailable: false,
      recoveryPending: false,
      errorCode: null,
    };
    let reads = 0,
      mutations = 0;
    await page.route("**/api/v1/retirements**", (route) => {
      if (route.request().method() !== "GET") {
        mutations++;
        return route.fulfill({
          status: 409,
          json: { error: "unexpected_completion" },
        });
      }
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/candidates")) return route.fulfill({ json: [] });
      if (path.endsWith("/output"))
        return route.fulfill({ json: { text: "", truncated: false } });
      if (path.endsWith("/execution")) {
        reads++;
        return route.fulfill({
          json: {
            retirementId: id,
            generation: 1,
            hasHandoff: true,
            prepared: true,
            canPrepare: false,
            scopes: [],
            jobs: [
              {
                ...job,
                id: "77777777-7777-4777-8777-777777777770",
                nativeStatus: null,
                status: "planning",
              },
              {
                ...job,
                id: "77777777-7777-4777-8777-777777777771",
                nativeStatus: "failed",
                recoveryPending: true,
              },
              {
                ...job,
                id: "77777777-7777-4777-8777-777777777772",
                nativeStatus: "failed",
                recoveryAvailable: true,
              },
              {
                ...job,
                id: "77777777-7777-4777-8777-777777777773",
                operatorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              },
              {
                ...job,
                id: "77777777-7777-4777-8777-777777777774",
                generation: 2,
              },
              ...(paused
                ? [{ ...job, id: "77777777-7777-4777-8777-777777777775" }]
                : []),
            ],
          },
        });
      }
      return route.fulfill({ json: [current] });
    });
    await page.goto("/deployments/retire");
    await expect.poll(() => reads, { timeout: 7000 }).toBeGreaterThanOrEqual(3);
    expect(mutations).toBe(0);
    if (paused)
      await expect(
        page.getByRole("button", { name: "Resume retirement", exact: true }),
      ).toBeVisible();
    await expect(page.locator(".retirement-job")).toHaveCount(paused ? 6 : 5);
    await expect(
      page.getByRole("button", { name: "Apply reviewed retirement plan" }),
    ).toHaveCount(0);
  });
}

test("keeps the current retirement and its approval together while older attempts are read-only history", async ({
  page,
}, info) => {
  await mockEmptyApplicationLists(page);
  await page.route("**/auth/status", (route) =>
    route.fulfill({
      json: { stackit: true, github: false, primary: "stackit" },
    }),
  );
  await page.route("**/api/v1/backends", (route) =>
    route.fulfill({ json: { backends: [] } }),
  );
  await page.route("**/api/v1/session", (route) =>
    route.fulfill({
      json: {
        user: { id: user, login: "owner@example.test" },
        tenant: {
          id: tenant,
          name: "Guided retirement",
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
  const archiveId = "33333333-3333-4333-8333-333333333334";
  const scopeId = "66666666-6666-4666-8666-666666666666";
  const latestId = "77777777-7777-4777-8777-777777777770";
  const oldId = "77777777-7777-4777-8777-777777777771";
  const oldApplyId = "77777777-7777-4777-8777-777777777772";
  const archiveJobId = "77777777-7777-4777-8777-777777777773";
  const current = {
    id,
    name: "My company platform",
    stateKey,
    organizationId: "44444444-4444-4444-8444-444444444444",
    createdBy: user,
    reason: "Current attempt",
    notBefore: new Date(Date.now() - 60000).toISOString(),
    createdAt: new Date().toISOString(),
    phase: "PREPARED",
    generation: 1,
    applications: [],
    blockers: [],
  };
  const cancelled = {
    ...current,
    id: archiveId,
    reason: "Superseded attempt",
    phase: "CANCELLED",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  };
  const job = {
    scopeId,
    operatorId: user,
    generation: 1,
    operation: "plan",
    phase: "remove_projects",
    status: "succeeded",
    nativeStatus: "succeeded",
    createdAt: current.createdAt,
    sourceRevision: "a".repeat(40),
    providerLockSha256: "b".repeat(64),
    artifactSha256: "c".repeat(64),
    deleteCount: 2,
    canApply: true,
    canInspect: false,
    recoveryAvailable: false,
    recoveryPending: false,
    errorCode: null,
  };
  const previousJobs = [
    {
      ...job,
      id: oldId,
      createdAt: cancelled.createdAt,
      status: "failed",
      nativeStatus: "failed",
      canApply: false,
      errorCode: "retirement_plan_failed",
    },
    {
      ...job,
      id: oldApplyId,
      createdAt: cancelled.createdAt,
      operation: "apply",
      phase: "private_workloads",
      canApply: false,
    },
  ];
  const outputRequests: string[] = [];
  let writes = 0,
    archiveReads = 0;
  await page.route("**/api/v1/retirements**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") {
      writes++;
      return route.fulfill({
        status: 409,
        json: { error: "unexpected_mutation" },
      });
    }
    if (path.endsWith("/candidates")) return route.fulfill({ json: [] });
    if (path.endsWith("/execution")) {
      const archived = path.includes(archiveId);
      if (archived) archiveReads++;
      return route.fulfill({
        json: {
          retirementId: archived ? archiveId : id,
          generation: 1,
          hasHandoff: true,
          prepared: true,
          canPrepare: true,
          scopes: [
            {
              id: scopeId,
              name: "My company platform",
              instanceId: null,
              stage: "remove_projects",
              stateVersion: "2",
              canPlan: false,
            },
          ],
          jobs: archived
            ? [
                {
                  ...job,
                  id: archiveJobId,
                  canInspect: true,
                  recoveryAvailable: true,
                },
              ]
            : [previousJobs[0], { ...job, id: latestId }, previousJobs[1]],
        },
      });
    }
    if (path.endsWith("/preview"))
      return route.fulfill({
        json: {
          id: latestId,
          phase: "remove_projects",
          artifactSha256: "c".repeat(64),
          deletes: [
            {
              address: "module.management.example",
              type: "example",
              id: "synthetic-resource",
            },
          ],
        },
      });
    if (path.endsWith("/output")) {
      const jobId = path.split("/").at(-2)!;
      outputRequests.push(jobId);
      return route.fulfill({
        json: {
          text:
            jobId === latestId ? "CURRENT_PLAN_OUTPUT" : "HISTORICAL_OUTPUT",
          truncated: false,
        },
      });
    }
    return route.fulfill({ json: [cancelled, current] });
  });
  await page.goto("/deployments/retire");
  const panel = page.getByRole("region", { name: "Retire landing zones" });
  const active = panel.locator(".retirement-current");
  await expect(active).toHaveCount(1);
  await expect(active.locator(".retirement-job:visible")).toHaveCount(1);
  await expect(
    active
      .getByRole("list", { name: "Retirement steps" })
      .getByRole("listitem")
      .first(),
  ).toContainText("Completed");
  await active
    .locator(".retirement-scope > .retirement-job")
    .getByText("OpenTofu output", { exact: true })
    .click();
  await expect(active.getByText("CURRENT_PLAN_OUTPUT")).toBeVisible();
  await active
    .locator(".retirement-scope > .retirement-job")
    .getByText("OpenTofu output", { exact: true })
    .click();
  await expect(
    panel.getByText("Superseded attempt", { exact: true }),
  ).toBeHidden();
  await expect(
    active.getByText(
      "OpenTofu could not create the retirement Plan. Check the OpenTofu output.",
    ),
  ).toBeHidden();
  expect(archiveReads).toBe(0);
  expect(outputRequests.every((value) => value === latestId)).toBe(true);
  await expect(
    active.getByRole("heading", { name: "Reconfirm retirement credentials" }),
  ).toBeHidden();
  await active
    .getByRole("button", { name: "Review deletions", exact: true })
    .click();
  const currentJob = active.locator(".retirement-scope > .retirement-job");
  await expect(
    currentJob.getByRole("region", { name: "Planned deletions" }),
  ).toBeVisible();
  const apply = currentJob.getByRole("button", {
    name: "Apply reviewed retirement plan",
  });
  await expect(apply).toBeDisabled();
  await currentJob
    .getByRole("checkbox", {
      name: "Data exports, backups and retention requirements have been reviewed.",
    })
    .check();
  await currentJob
    .getByRole("checkbox", {
      name: "I confirm permanent deletion of exactly this reviewed scope.",
    })
    .check();
  await expect(apply).toBeEnabled();
  expect(writes).toBe(0);
  const renewal = active
    .locator("summary")
    .filter({ hasText: /^Reconfirm retirement credentials$/ });
  await renewal.click();
  await expect(
    active.getByRole("heading", { name: "Reconfirm retirement credentials" }),
  ).toBeVisible();
  await renewal.click();
  await expect(
    active.getByRole("heading", { name: "Reconfirm retirement credentials" }),
  ).toBeHidden();
  await expect(apply).toBeEnabled();
  expect(writes).toBe(0);
  await active
    .getByText("Completed steps and previous runs (2)", { exact: true })
    .click();
  await expect(
    active.getByText(
      "OpenTofu could not create the retirement Plan. Check the OpenTofu output.",
    ),
  ).toBeVisible();
  await panel.getByText("Retirement history (1)", { exact: true }).click();
  await panel.locator(".retirement-history > details > summary").click();
  const archive = panel.locator(".retirement-archived");
  await expect.poll(() => archiveReads).toBe(1);
  await expect(archive.locator(".retirement-job")).toHaveCount(1);
  await expect(archive.getByRole("button")).toHaveCount(0);
  await archive.getByText("OpenTofu output", { exact: true }).click();
  await expect(archive.getByText("HISTORICAL_OUTPUT")).toBeVisible();
  expect(writes).toBe(0);
  // History browsing cannot reset or move the current plan's approval.
  await expect(apply).toBeEnabled();
  await panel.getByText("Retirement history (1)", { exact: true }).click();
  await active
    .getByText("Completed steps and previous runs (2)", { exact: true })
    .click();
  await page.screenshot({
    path: info.outputPath("retirement-guided-overview.png"),
    fullPage: true,
  });
});
