import {
  createEditorConfiguration,
  publishedProjectTemplateSchema,
} from "@lzc/domain";
import { expect, test } from "./fixtures";

const userId = "11111111-1111-4111-8111-111111111111";
const tenantId = "22222222-2222-4222-8222-222222222222";
const organisationId = "33333333-3333-4333-8333-333333333333";

for (const scenario of [
  "owner",
  "pending",
  "rejected",
  "disabled",
  "engineer",
  "dispatch-failed",
  "prepare-retry",
  "prepare-refresh-retry",
  "delete-owner",
  "delete-engineer",
  "delete-started",
  "delete-failed",
  "revision-required",
  "delegated-owner",
  "delegated-missing",
  "apply-running",
  "apply-failed",
  "apply-report-missing",
  "archive-failed",
  "archive-blocked",
  "order-table",
  "maintenance-destroy",
  "maintenance-drift",
  "maintenance-expired",
  "maintenance-running",
  "unavailable",
] as const) {
  test(`application plan lifecycle ${scenario} uses explicit role-bound steps`, async ({
    page,
  }, testInfo) => {
    const instanceId = "44444444-4444-4444-8444-444444444444";
    const jobId = "77777777-7777-4777-8777-777777777777";
    const backendId = "88888888-8888-4888-8888-888888888888";
    const maintenance = scenario.startsWith("maintenance-");
    const purpose = scenario === "maintenance-destroy" ? "destroy" : "drift";
    let maintenanceStarted = false;
    const initialApply =
      scenario.startsWith("apply-") ||
      scenario.startsWith("archive-") ||
      scenario === "order-table" ||
      scenario === "maintenance-expired" ||
      scenario === "maintenance-running";
    const engineer =
      scenario === "engineer" ||
      scenario === "dispatch-failed" ||
      scenario === "delete-engineer";
    const delegated =
      scenario === "delegated-owner" ||
      scenario === "delegated-missing" ||
      initialApply ||
      maintenance;
    const requesterId = engineer
      ? "66666666-6666-4666-8666-666666666666"
      : userId;
    const tenant = {
      id: tenantId,
      name: "Pilot",
      kind: "organisation",
      organizationId: organisationId,
      roles: [engineer ? "platform-engineer" : "application-owner"],
      manageMembers: engineer,
    };
    const instance = {
      id: instanceId,
      versionId: "55555555-5555-4555-8555-555555555555",
      requestedBy: requesterId,
      canDelete: scenario !== "delete-started" && !initialApply,
      canArchive: initialApply && scenario !== "apply-running",
      name: "Plan application",
      deploymentPolicy: "approval-required",
      parameters: {},
      settings: {},
      createdAt: "2026-10-08T10:15:00.000Z",
      stateKey: `applications/${tenantId}/${instanceId}/terraform.tfstate`,
      executionEnabled: false,
      ...(delegated
        ? { executionConfigured: scenario !== "delegated-missing" }
        : {}),
      planStatus: "blocked",
      blockers: [
        "Der isolierte Application-Plan-Runner ist noch nicht freigegeben. Es wurde kein Cloud-Plan ausgeführt.",
      ],
      approval:
        scenario === "pending"
          ? { status: "pending" }
          : {
              status: scenario === "rejected" ? "rejected" : "approved",
              decidedBy: "99999999-9999-4999-8999-999999999999",
              decidedAt: new Date().toISOString(),
              reason: "Reviewed",
            },
    };
    let prepared = engineer || initialApply;
    let backendApproved = scenario === "delegated-owner" || initialApply;
    let dispatched = scenario === "delete-started" || initialApply;
    let deleted = false;
    let applied = initialApply;
    let readsAfterDispatch = 0;
    let refreshFailed = false;
    const preparations: string[] = [];
    const mutations: string[] = [];
    const summary = {
      schemaVersion: 1,
      execution: "plan-only",
      applyAllowed: false,
      result: "changes",
      resources: {
        unchanged: 0,
        create: maintenance ? 0 : 3,
        update: maintenance && purpose === "drift" ? 1 : 0,
        delete: maintenance && purpose === "destroy" ? 1 : 0,
        replace: 0,
        read: 1,
      },
      drift: {
        unchanged: 0,
        create: 0,
        update: 0,
        delete: 0,
        replace: 0,
        read: 0,
      },
      changedOutputs: 1,
      checks: { pass: 1, fail: 0, error: 0, unknown: 0 },
      destructive: maintenance && purpose === "destroy",
      completeness: "complete",
    };
    await page.route("**/auth/status", (route) =>
      route.fulfill({
        json: { stackit: true, github: false, primary: "stackit" },
      }),
    );
    await page.route("**/api/v1/session", (route) =>
      route.fulfill({
        json: {
          user: { id: userId, login: "pilot@example.test" },
          tenant,
          csrfToken: "csrf-plan",
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
    await page.route("**/api/v1/credentials", (route) =>
      route.fulfill({ json: { profiles: [] } }),
    );
    await page.route("**/api/v1/backends", (route) => {
      expect(engineer).toBe(true);
      expect(route.request().headers()["x-lzc-tenant"]).toBe(tenantId);
      return route.fulfill({
        json: {
          backends: [
            { id: backendId, descriptor: { bucket: "application-state-test" } },
          ],
        },
      });
    });
    await page.route("**/api/v1/applications/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace(
        "/api/v1/applications/",
        "",
      );
      if (request.method() === "GET") {
        if (scenario === "unavailable" && path === "templates")
          return route.fulfill({ status: 502, body: "" });
        if (path === "templates")
          return route.fulfill({ json: { versions: [] } });
        if (path === "platform-contracts")
          return route.fulfill({ json: { contracts: [] } });
        if (path === "instances")
          return route.fulfill({
            json: {
              instances: [
                ...(deleted
                  ? []
                  : [
                      {
                        ...instance,
                        canDelete: applied ? false : instance.canDelete,
                      },
                    ]),
                ...(["delete-owner", "order-table"].includes(scenario)
                  ? [
                      {
                        ...instance,
                        id: "99999999-9999-4999-8999-999999999999",
                        name:
                          scenario === "order-table"
                            ? instance.name
                            : "Application with Apply",
                        createdAt: "2026-10-09T09:30:00.000Z",
                        canDelete: false,
                        canArchive: false,
                        stateKey: `applications/${tenantId}/99999999-9999-4999-8999-999999999999/terraform.tfstate`,
                      },
                    ]
                  : []),
              ],
              orderDeletionEnabled: true,
              planJobsEnabled: true,
              execution: {
                planEnabled: scenario !== "disabled",
                applyEnabled: delegated,
                delegatedExecutionEnabled: delegated,
                maintenanceEnabled: maintenance,
              },
            },
          });
        if (path === "instances/99999999-9999-4999-8999-999999999999/jobs")
          return route.fulfill({
            json: {
              jobs: [
                {
                  id: "bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                  instanceId: "99999999-9999-4999-8999-999999999999",
                  requestedBy: requesterId,
                  approvedBy: "99999999-9999-4999-8999-999999999999",
                  createdAt: "2026-10-09T09:30:00.000Z",
                  expiresAt: new Date(Date.now() + 120000).toISOString(),
                  operation: "apply",
                  status: "applying",
                  grantActive: true,
                  backendId,
                  canApproveBackend: false,
                  canDispatch: false,
                  summary: null,
                  errorCode: null,
                },
              ],
            },
          });
        if (path === `instances/${instanceId}/jobs`) {
          if (
            scenario === "prepare-refresh-retry" &&
            prepared &&
            !refreshFailed
          ) {
            refreshFailed = true;
            return route.fulfill({
              status: 503,
              json: { error: "application_request_failed" },
            });
          }
          const succeeded = dispatched && ++readsAfterDispatch > 1;
          const jobs = !prepared
            ? []
            : [
                ...(applied
                  ? [
                      {
                        id: "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                        instanceId,
                        requestedBy: requesterId,
                        approvedBy: "99999999-9999-4999-8999-999999999999",
                        createdAt: new Date().toISOString(),
                        expiresAt: new Date(
                          Date.now() +
                            (scenario === "maintenance-expired"
                              ? -60000
                              : 120000),
                        ).toISOString(),
                        operation: "apply",
                        purpose:
                          maintenanceStarted && !initialApply
                            ? purpose
                            : "standard",
                        planId: jobId,
                        status:
                          scenario === "apply-running" ||
                          scenario === "maintenance-running"
                            ? "applying"
                            : initialApply
                              ? "reconciliation_required"
                              : "succeeded",
                        grantActive: true,
                        backendId,
                        canApproveBackend: false,
                        canDispatch: false,
                        delegatedExecution: true,
                        summary: null,
                        errorCode:
                          scenario === "apply-report-missing" ||
                          scenario === "maintenance-expired"
                            ? "runner_report_missing"
                            : initialApply && scenario !== "apply-running"
                              ? "apply_failed"
                              : null,
                      },
                    ]
                  : []),
                {
                  id: jobId,
                  purpose: maintenanceStarted ? purpose : "standard",
                  instanceId,
                  requestedBy: requesterId,
                  approvedBy: engineer
                    ? userId
                    : "99999999-9999-4999-8999-999999999999",
                  createdAt: new Date().toISOString(),
                  expiresAt: new Date(Date.now() + 120000).toISOString(),
                  status: dispatched
                    ? succeeded
                      ? "succeeded"
                      : "planning"
                    : "prepared",
                  grantActive: true,
                  backendId: backendApproved ? backendId : null,
                  canApproveBackend:
                    engineer && !backendApproved && !dispatched,
                  canDispatch:
                    (engineer || delegated) && backendApproved && !dispatched,
                  ...(delegated ? { delegatedExecution: true } : {}),
                  summary: succeeded ? summary : null,
                  errorCode: null,
                  canApply:
                    delegated &&
                    succeeded &&
                    !applied &&
                    !(maintenanceStarted && purpose === "drift"),
                  artifactSha256: succeeded ? "a".repeat(64) : null,
                },
              ];
          if (applied) {
            const plan = jobs.find((job) => job.id === jobId);
            if (plan)
              jobs.push({
                ...plan,
                id: "bbbbbbb2-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              });
          }
          return route.fulfill({ json: { jobs } });
        }
        if (path === "jobs/aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa/output")
          return route.fulfill({
            json: {
              text:
                scenario === "apply-report-missing"
                  ? ""
                  : scenario === "apply-running"
                    ? "Creating project..."
                    : initialApply
                      ? "Error: Error creating credentials group\nString should have at most 32 characters"
                      : "Apply complete",
              truncated: false,
              kind: scenario === "apply-running" ? "live" : "execution",
            },
          });
        if (path === `jobs/${jobId}/preview`)
          return route.fulfill({
            json: {
              jobId,
              artifactSha256: "a".repeat(64),
              drift:
                maintenance && purpose === "drift"
                  ? [
                      {
                        type: "stackit_resourcemanager_project",
                        name: "application",
                        action: "update",
                        attributes: [
                          {
                            name: "name",
                            before: instance.name,
                            after: "Cloud name",
                            sensitive: false,
                            unknown: false,
                          },
                        ],
                      },
                    ]
                  : [],
              resources: [
                {
                  type: "stackit_resourcemanager_project",
                  name: "application",
                  action: maintenance
                    ? purpose === "destroy"
                      ? "delete"
                      : "update"
                    : "create",
                  attributes: [
                    {
                      name: "name",
                      before: maintenance ? "Cloud name" : null,
                      after:
                        maintenance && purpose === "destroy"
                          ? null
                          : instance.name,
                      sensitive: false,
                      unknown: false,
                    },
                    {
                      name: "region",
                      before: null,
                      after: "eu01",
                      sensitive: false,
                      unknown: false,
                    },
                    {
                      name: "project_id",
                      before: null,
                      after: null,
                      sensitive: false,
                      unknown: true,
                    },
                  ],
                },
                ...(maintenance
                  ? []
                  : [
                      {
                        type: "stackit_network",
                        name: "application",
                        action: "create",
                        attributes: [
                          {
                            name: "ipv4_cidr",
                            before: null,
                            after: "10.20.0.0/24",
                            sensitive: false,
                            unknown: false,
                          },
                        ],
                      },
                    ]),
              ],
            },
          });
      }
      if (request.method() === "DELETE") {
        expect(path).toBe(`instances/${instanceId}`);
        expect(request.headers()["x-lzc-tenant"]).toBe(tenantId);
        expect(request.headers()["x-lzc-csrf"]).toBe("csrf-plan");
        expect(request.postDataJSON()).toEqual(
          initialApply ? { confirmArchive: true } : { confirmDeletion: true },
        );
        mutations.push(path);
        if (scenario === "archive-blocked")
          return route.fulfill({
            status: 409,
            json: { error: "application_order_archive_unavailable" },
          });
        if (scenario === "delete-failed")
          return route.fulfill({
            status: 409,
            json: { error: "application_order_execution_started" },
          });
        deleted = true;
        return route.fulfill({
          json: {
            instanceId,
            deletedBy: userId,
            deletedAt: new Date().toISOString(),
          },
        });
      }
      expect(request.method()).toBe("POST");
      expect(request.headers()["x-lzc-tenant"]).toBe(tenantId);
      expect(request.headers()["x-lzc-csrf"]).toBe("csrf-plan");
      mutations.push(path);
      if (path === `jobs/${jobId}/apply`) {
        expect(delegated).toBe(true);
        expect(request.postDataJSON()).toEqual({
          artifactSha256: "a".repeat(64),
          ...(maintenance ? { confirmDestroy: true, instanceId } : {}),
        });
        applied = true;
        return route.fulfill({
          status: 202,
          json: {
            jobId: "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            dispatched: true,
          },
        });
      }
      if (path === `instances/${instanceId}/plan`) {
        expect(engineer).toBe(false);
        const input = request.postDataJSON();
        expect(input).toEqual({
          idempotencyKey: expect.any(String),
          ...(maintenance ? { purpose } : {}),
        });
        if (maintenance) maintenanceStarted = true;
        preparations.push(input.idempotencyKey);
        if (scenario === "revision-required")
          return route.fulfill({
            status: 409,
            json: { error: "application_runner_revision_required" },
          });
        prepared = true;
        if (delegated) dispatched = true;
        if (scenario === "prepare-retry" && preparations.length === 1)
          return route.abort();
        return route.fulfill({
          json: {
            jobId,
            dispatched: delegated,
          },
        });
      }
      if (path === `jobs/${jobId}/backend-approval`) {
        expect(engineer).toBe(true);
        expect(request.postDataJSON()).toEqual({
          stateBackendId: backendId,
          confirmBackendApproval: true,
        });
        backendApproved = true;
        return route.fulfill({
          json: { jobId, backendId, stateKey: instance.stateKey },
        });
      }
      if (path === `jobs/${jobId}/dispatch`) {
        expect((engineer || delegated) && backendApproved).toBe(true);
        expect(request.postDataJSON()).toEqual({ confirmPlan: true });
        if (scenario === "dispatch-failed")
          return route.fulfill({
            status: 503,
            json: {
              error: "application_dispatch_failed",
              privateDetail: "not-for-ui",
            },
          });
        dispatched = true;
        return route.fulfill({
          status: 202,
          json: { jobId, dispatched: true },
        });
      }
      throw new Error(`Unexpected Application mutation ${path}`);
    });
    async function details() {
      await page
        .getByRole("tab", { name: "Bestellungen", exact: true })
        .click();
      if (scenario !== "delete-owner")
        await page
          .getByRole("button", {
            name: /Details anzeigen\s*:\s*Plan application/,
          })
          .click();
      return page.getByRole("region", {
        name: "Application-Plan",
        exact: true,
      });
    }
    await page.goto("/applications");
    if (scenario === "unavailable") {
      await expect(page.getByRole("alert")).toHaveText(
        "Der Application-Dienst ist derzeit nicht erreichbar.",
      );
      await expect(page.locator("body")).not.toContainText(
        "Unexpected end of JSON input",
      );
      expect(mutations).toEqual([]);
      return;
    }
    if (scenario === "order-table") {
      await page
        .getByRole("tab", { name: "Bestellungen", exact: true })
        .click();
      const table = page.getByRole("table", {
        name: "Bestellungen",
        exact: true,
      });
      await expect(table.getByRole("columnheader")).toHaveText([
        "Bestellung",
        "Bestelldatum",
        "Freigabe",
        "Ausführung",
        "Aktionen",
      ]);
      const failed = table.getByRole("row").filter({ hasText: "44444444" });
      const running = table.getByRole("row").filter({ hasText: "99999999" });
      await expect(table.getByRole("rowheader")).toHaveCount(2);
      await expect(failed).toContainText("Plan application");
      await expect(running).toContainText("Plan application");
      await expect(failed.locator("time")).toHaveAttribute(
        "datetime",
        instance.createdAt,
      );
      await expect(running.locator("time")).toHaveAttribute(
        "datetime",
        "2026-10-09T09:30:00.000Z",
      );
      await expect(failed).toContainText("08.10.2026");
      await expect(running).toContainText("09.10.2026");
      await expect(failed).toContainText("Apply · Abschluss prüfen");
      await expect(running).toContainText("Apply · Läuft");
      expect(
        (await failed.getByRole("cell").nth(1).boundingBox())?.width,
      ).toBeGreaterThanOrEqual(150);
      expect(
        (await failed.getByRole("cell").nth(2).boundingBox())?.width,
      ).toBeGreaterThanOrEqual(200);
      await expect(
        failed.getByRole("button", {
          name: "Bestellung archivieren",
          exact: true,
        }),
      ).toHaveCount(1);
      await expect(
        running.getByRole("button", {
          name: /Bestellung archivieren|Bestellung löschen/,
        }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath("application-orders-table.png"),
        fullPage: true,
      });
      await failed.getByRole("button", { name: /Details anzeigen/ }).click();
      await expect(failed).toHaveAttribute("data-selected", "true");
      await expect(
        page.getByRole("region", { name: "Bestelldetails", exact: true }),
      ).toBeVisible();
      expect(mutations).toEqual([]);
      return;
    }
    const plan = await details();
    if (maintenance) {
      const orderDetails = page.getByRole("region", {
        name: "Bestelldetails",
        exact: true,
      });
      await expect(
        orderDetails.getByRole("tablist", { name: "Bestellablauf" }),
      ).toHaveCSS("position", "static");
      await expect(
        orderDetails
          .getByRole("tablist", { name: "Bestellablauf" })
          .getByRole("tab"),
      ).toHaveCount(6);
      await orderDetails
        .getByRole("tab", {
          name: purpose === "destroy" ? "Destroy" : "Drift",
          exact: true,
        })
        .click();
      const prepare = plan.getByRole("button", {
        name: purpose === "destroy" ? "Destroy-Plan erstellen" : "Drift prüfen",
        exact: true,
      });
      if (scenario === "maintenance-running") {
        await expect(prepare).toBeDisabled();
        expect(mutations).toEqual([]);
        return;
      }
      await expect(prepare).toBeEnabled();
      expect(mutations).toEqual([]);
      await prepare.click();
      await plan
        .getByRole("button", { name: "Planstatus aktualisieren", exact: true })
        .click();
      await expect(
        plan.getByRole("heading", {
          name:
            purpose === "destroy"
              ? "Zu löschende Ressourcen"
              : "Cloud → Soll-Konfiguration",
          exact: true,
        }),
      ).toBeVisible();
      expect(mutations).toEqual([`instances/${instanceId}/plan`]);
      await expect(
        plan.getByRole("button", {
          name: "Application Landing Zone erstellen",
          exact: true,
        }),
      ).toHaveCount(0);
      if (purpose === "destroy") {
        const destroy = plan.getByRole("button", {
          name: "Application Landing Zone löschen",
          exact: true,
        });
        const confirmation = plan.getByRole("checkbox", {
          name: "Ich bestätige das Löschen der Ressourcen dieser Application Landing Zone.",
          exact: true,
        });
        await expect(destroy).toBeDisabled();
        await confirmation.check();
        await expect(destroy).toBeEnabled();
        await orderDetails
          .getByRole("tab", { name: "Drift", exact: true })
          .click();
        await orderDetails
          .getByRole("tab", { name: "Destroy", exact: true })
          .click();
        await expect(confirmation).not.toBeChecked();
        await expect(destroy).toBeDisabled();
        await confirmation.check();
        await destroy.click();
        await expect(
          plan.getByRole("heading", {
            name: "Application Landing Zone gelöscht",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          plan.getByRole("region", { name: "Ausführungslogs", exact: true }),
        ).toContainText("Apply complete");
        expect(mutations).toEqual([
          `instances/${instanceId}/plan`,
          `jobs/${jobId}/apply`,
        ]);
      } else {
        await expect(plan).toContainText(
          "Abweichungen zwischen gespeichertem State und Cloud: 1",
        );
        await expect(plan).toContainText("State → Cloud");
        await expect(plan).not.toContainText(
          "Dieser Plan ist nicht mehr ausführbar",
        );
        await expect(
          plan.getByRole("button", {
            name: "Application Landing Zone löschen",
            exact: true,
          }),
        ).toHaveCount(0);
        await plan
          .locator("details")
          .filter({ hasText: "State → Cloud" })
          .locator("summary")
          .click();
        await expect(plan).toContainText("Plan application → Cloud name");
        if (scenario === "maintenance-drift") {
          await page.getByLabel("Sprache").selectOption("en");
          const englishPlan = page.getByRole("region", {
            name: "Application plan",
            exact: true,
          });
          await expect(
            englishPlan.getByRole("heading", {
              name: "Cloud → Desired configuration",
              exact: true,
            }),
          ).toBeVisible();
          await expect(englishPlan).toContainText(
            "Differences between stored state and cloud: 1",
          );
          await expect(englishPlan).not.toContainText(
            "This plan is no longer executable",
          );
          await page.getByLabel("Language").selectOption("de");
        }
        if (scenario === "maintenance-expired") {
          await orderDetails
            .getByRole("tab", { name: "Apply", exact: true })
            .click();
          await expect(
            plan.getByRole("heading", {
              name: "Application-Apply: Abschluss prüfen",
              exact: true,
            }),
          ).toBeVisible();
          await expect(plan).not.toContainText(
            "Application Landing Zone erstellt",
          );
          await orderDetails
            .getByRole("tab", { name: "Drift", exact: true })
            .click();
        }
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`${scenario}.png`),
        fullPage: true,
      });
      return;
    }
    if (scenario === "apply-running") {
      const orderDetails = page.getByRole("region", {
        name: "Bestelldetails",
        exact: true,
      });
      await page
        .getByRole("table", { name: "Bestellungen", exact: true })
        .getByRole("button", { name: "Apply · Läuft", exact: true })
        .click();
      await expect(
        orderDetails.getByRole("tab", { name: "Apply", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await orderDetails
        .getByRole("tab", { name: "Übersicht", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: /Details anzeigen\s*:\s*Plan application/,
        })
        .click();
      await expect(
        orderDetails.getByRole("tab", { name: "Apply", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        orderDetails.getByRole("region", {
          name: "Ausführungslogs",
          exact: true,
        }),
      ).toContainText("Creating project...");
    }
    if (scenario !== "delete-owner")
      await expect(
        plan.getByRole("button", {
          name: "Planstatus aktualisieren",
          exact: true,
        }),
      ).toBeVisible();
    expect(mutations).toEqual([]);
    if (initialApply) {
      const details = page.getByRole("region", {
        name: "Bestelldetails",
        exact: true,
      });
      const tabs = details.getByRole("tablist", {
        name: "Bestellablauf",
        exact: true,
      });
      await expect(tabs.getByRole("tab")).toHaveCount(4);
      await expect(
        tabs.getByRole("tab", { name: "Apply", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        plan.getByRole("heading", {
          name:
            scenario === "apply-running"
              ? "Application Landing Zone wird erstellt"
              : "Application-Apply: Abschluss prüfen",
          exact: true,
        }),
      ).toBeVisible();
      await expect(plan.locator(".application-plan-job")).toHaveCount(1);
      if (scenario === "apply-report-missing") {
        await expect(plan).not.toContainText(
          "Application-Apply fehlgeschlagen",
        );
        await expect(plan.getByRole("alert")).toContainText(
          "ihre Abschlussmeldung fehlt",
        );
        await expect(plan).toContainText(
          "Noch keine Ausführungslogs verfügbar.",
        );
        await expect(
          plan.getByRole("button", {
            name: "Application-Apply freigeben",
            exact: true,
          }),
        ).toHaveCount(0);
        await page.screenshot({
          path: testInfo.outputPath("application-report-missing.png"),
          fullPage: true,
        });
      } else {
        await expect(
          plan.getByRole("region", { name: "Ausführungslogs", exact: true }),
        ).toHaveCount(1);
        await expect(
          plan.getByLabel("Ausführungslogs", { exact: true }),
        ).toContainText(
          scenario === "apply-running"
            ? "Creating project..."
            : "String should have at most 32 characters",
        );
      }
      await expect(plan).not.toContainText("Dieser Plan ist bereits verwendet");
      await expect(
        plan.getByRole("button", {
          name: "Application Landing Zone erstellen",
          exact: true,
        }),
      ).toHaveCount(0);
      await tabs.getByRole("tab", { name: "Verlauf", exact: true }).click();
      await expect(plan.locator(".application-plan-job")).toHaveCount(3);
      await expect(
        plan.getByRole("button", { name: "Cloud-Plan starten", exact: true }),
      ).toHaveCount(0);
      await tabs.getByRole("tab", { name: "Übersicht", exact: true }).click();
      await expect(
        details.getByText(instance.stateKey, { exact: true }),
      ).toBeVisible();
      await tabs.getByRole("tab", { name: "Apply", exact: true }).click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await details.screenshot({
        path: testInfo.outputPath("application-order-apply-flow.png"),
      });
      const archive = details.getByRole("button", {
        name: "Bestellung archivieren",
        exact: true,
      });
      if (scenario === "apply-running") {
        await expect(archive).toHaveCount(0);
      } else {
        await expect(
          plan.getByRole("alert").filter({ hasText: "Cloud-Ressourcen" }),
        ).toBeVisible();
        await expect(archive).toBeVisible();
      }
      if (scenario.startsWith("archive-")) {
        page.once("dialog", (dialog) => dialog.dismiss());
        await archive.click();
        expect(mutations).toEqual([]);
        page.once("dialog", (dialog) => {
          expect(dialog.message()).toContain(
            "State und Ausführungshistorie bleiben erhalten",
          );
          return dialog.accept();
        });
        await archive.click();
        if (scenario === "archive-blocked") {
          await expect(
            page.getByRole("alert").filter({ hasText: "Nur abgeschlossene" }),
          ).toBeVisible();
          await expect(details).toBeVisible();
        } else {
          await expect(page.getByRole("status")).toContainText(
            "Bestellung archiviert.",
          );
          await page.reload();
          await page
            .getByRole("tab", { name: "Bestellungen", exact: true })
            .click();
          await expect(
            page.getByRole("button", {
              name: /Details anzeigen\s*:\s*Plan application/,
            }),
          ).toHaveCount(0);
        }
        expect(mutations).toEqual([`instances/${instanceId}`]);
      }
      return;
    }
    if (scenario.startsWith("delete-")) {
      const deletionArea =
        scenario === "delete-owner"
          ? page.locator(".application-orders")
          : page.getByRole("region", { name: "Bestelldetails", exact: true });
      if (scenario === "delete-owner") {
        await expect(
          page.getByRole("region", { name: "Bestelldetails", exact: true }),
        ).toHaveCount(0);
        await expect(
          page
            .getByRole("table", { name: "Bestellungen", exact: true })
            .getByRole("row")
            .filter({ hasText: "Application with Apply" })
            .getByRole("button", { name: "Bestellung löschen", exact: true }),
        ).toHaveCount(0);
      }
      const deletion = deletionArea.getByRole("button", {
        name: "Bestellung löschen",
        exact: true,
      });
      if (scenario === "delete-started") {
        await expect(deletion).toHaveCount(0);
        return;
      }
      await expect(deletion).toBeVisible();
      page.once("dialog", (dialog) => dialog.dismiss());
      await deletion.click();
      expect(mutations).toEqual([]);
      if (scenario === "delete-owner")
        await page.screenshot({
          path: testInfo.outputPath("application-order-deletion-list.png"),
          fullPage: true,
        });
      page.once("dialog", (dialog) => dialog.accept());
      await deletion.click();
      if (scenario === "delete-failed") {
        await expect(page.getByRole("alert")).toContainText(
          "Ausführung bereits begonnen",
        );
        await expect(
          page.getByRole("heading", { name: instance.name, exact: true }),
        ).toBeVisible();
      } else {
        await expect(page.getByRole("status")).toContainText(
          "Bestellung gelöscht.",
        );
        await page.reload();
        await page
          .getByRole("tab", { name: "Bestellungen", exact: true })
          .click();
        await expect(
          page.getByRole("button", {
            name: /Details anzeigen\s*:\s*Plan application/,
          }),
        ).toHaveCount(0);
      }
      expect(mutations).toEqual([`instances/${instanceId}`]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath("application-order-deletion.png"),
        fullPage: true,
      });
      return;
    }
    if (scenario === "pending" || scenario === "rejected") {
      await expect(
        plan.getByRole("button", { name: "Cloud-Plan starten", exact: true }),
      ).toHaveCount(0);
      return;
    }
    if (scenario === "disabled") {
      await expect(
        plan.getByRole("button", { name: "Cloud-Plan starten", exact: true }),
      ).toBeDisabled();
      await expect(
        plan.getByText("Der Application-Plan-Runner ist nicht aktiviert.", {
          exact: true,
        }),
      ).toBeVisible();
      return;
    }
    if (scenario === "delegated-missing") {
      await expect(
        plan.getByRole("button", { name: "Cloud-Plan starten", exact: true }),
      ).toBeDisabled();
      await expect(
        plan.getByText(
          "Die Plattform-Ausführung ist noch nicht eingerichtet. Bitte den Platform Owner kontaktieren.",
          { exact: true },
        ),
      ).toBeVisible();
      expect(mutations).toEqual([]);
      return;
    }
    if (!engineer) {
      const prepare = plan.getByRole("button", {
        name: "Cloud-Plan starten",
        exact: true,
      });
      await expect(prepare).toBeEnabled();
      await prepare.click();
      if (scenario === "revision-required") {
        await expect(plan.getByRole("alert")).toContainText(
          "Accelerator-Revision",
        );
        await expect(plan.getByRole("alert")).not.toContainText(
          "nicht erreichbar",
        );
        expect(prepared).toBe(false);
        expect(mutations).toEqual([`instances/${instanceId}/plan`]);
        return;
      }
      if (
        scenario === "prepare-retry" ||
        scenario === "prepare-refresh-retry"
      ) {
        await expect(plan.getByRole("alert")).toBeVisible();
        await prepare.click();
        expect(preparations).toHaveLength(2);
        expect(preparations[0]).toBe(preparations[1]);
      }
      if (delegated) {
        await expect(
          plan.getByRole("button", {
            name: "State-Backend freigeben",
            exact: true,
          }),
        ).toHaveCount(0);
        await page.reload();
        await details();
        await expect(
          plan.getByText("Cloud-Plan erfolgreich", { exact: true }),
        ).toBeVisible({ timeout: 12000 });
        expect(mutations).toEqual([`instances/${instanceId}/plan`]);
        await expect(
          plan.getByRole("heading", {
            name: "Geplante Ressourcen",
            exact: true,
          }),
        ).toBeVisible();
        await expect(plan).toContainText(
          "stackit_resourcemanager_project.application",
        );
        await expect(plan).toContainText("10.20.0.0/24");
        await expect(plan).toContainText("Erst nach Apply bekannt");
        await expect(
          plan.getByLabel("Cloud-Plan bestätigen", { exact: true }),
        ).toHaveCount(0);
        await expect(
          plan.getByLabel("Plan-Vorbereitung bestätigen", { exact: true }),
        ).toHaveCount(0);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath("application-delegated-owner.png"),
          fullPage: true,
        });
        await plan
          .getByRole("button", {
            name: "Application Landing Zone erstellen",
            exact: true,
          })
          .click();
        await expect(
          plan.getByRole("heading", {
            name: "Application Landing Zone erstellt",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          plan.getByRole("button", {
            name: "Application Landing Zone erstellen",
            exact: true,
          }),
        ).toHaveCount(0);
        expect(mutations).toEqual([
          `instances/${instanceId}/plan`,
          `jobs/${jobId}/apply`,
        ]);
        await page.reload();
        await details();
        await expect(
          plan.getByRole("heading", {
            name: "Application Landing Zone erstellt",
            exact: true,
          }),
        ).toBeVisible();
        await page.screenshot({
          path: testInfo.outputPath("application-applied.png"),
          fullPage: true,
        });
        return;
      }
      await expect(
        plan.getByText("Plan vorbereitet", { exact: true }),
      ).toBeVisible();
      await expect(
        plan.getByRole("button", { name: "Cloud-Plan starten", exact: true }),
      ).toBeDisabled();
      await expect(
        plan.getByRole("button", {
          name: "State-Backend freigeben",
          exact: true,
        }),
      ).toHaveCount(0);
      await page.reload();
      await details();
      await expect(
        plan.getByText("Plan vorbereitet", { exact: true }),
      ).toBeVisible();
      expect(
        mutations.every((path) => path === `instances/${instanceId}/plan`),
      ).toBe(true);
      return;
    }
    const approve = plan.getByRole("button", {
      name: "State-Backend freigeben",
      exact: true,
    });
    await expect(approve).toBeDisabled();
    await plan
      .getByLabel("State-Backend", { exact: true })
      .selectOption(backendId);
    await expect(approve).toBeDisabled();
    await plan
      .getByLabel("State-Backend-Freigabe bestätigen", { exact: true })
      .check();
    await approve.click();
    const start = plan.getByRole("button", {
      name: "Cloud-Plan starten",
      exact: true,
    });
    await expect(start).toBeEnabled();
    expect(mutations).toEqual([`jobs/${jobId}/backend-approval`]);
    await page.reload();
    await details();
    await expect(start).toBeEnabled();
    expect(mutations).toHaveLength(1);
    await page.screenshot({
      path: testInfo.outputPath("application-plan-confirmation.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await start.click();
    if (scenario === "dispatch-failed") {
      await expect(plan.getByRole("alert")).toHaveText(
        "Der Application-Plan konnte nicht gestartet werden.",
      );
      await expect(page.locator("body")).not.toContainText("not-for-ui");
      return;
    }
    await expect(
      plan.getByText("Cloud-Plan läuft", { exact: true }),
    ).toBeVisible();
    await expect(
      plan.getByText("Cloud-Plan erfolgreich", { exact: true }),
    ).toBeVisible({ timeout: 12000 });
    await page.reload();
    await details();
    await expect(
      plan.getByText("Cloud-Plan erfolgreich", { exact: true }),
    ).toBeVisible();
    expect(mutations).toEqual([
      `jobs/${jobId}/backend-approval`,
      `jobs/${jobId}/dispatch`,
    ]);
    await page.screenshot({
      path: testInfo.outputPath("application-plan-summary.png"),
      fullPage: true,
    });
  });
}

for (const scenario of [
  "approved",
  "rejected",
  "self",
  "application-owner",
] as const) {
  test(`application order decision ${scenario} respects role and confirmation without cloud execution`, async ({
    page,
  }, testInfo) => {
    const instanceId = "44444444-4444-4444-8444-444444444444";
    const actorIsOwner =
      scenario === "self" || scenario === "application-owner";
    const tenant = {
      id: tenantId,
      name: "Pilot",
      kind: "organisation",
      organizationId: organisationId,
      organizationVerified: true,
      roles: [
        scenario === "application-owner"
          ? "application-owner"
          : "platform-engineer",
      ],
      manageMembers: scenario !== "application-owner",
    };
    let order = {
      id: instanceId,
      versionId: "55555555-5555-4555-8555-555555555555",
      requestedBy: actorIsOwner
        ? userId
        : "66666666-6666-4666-8666-666666666666",
      name: "Decision application",
      deploymentPolicy: "approval-required",
      parameters: {},
      settings: { network_enabled: true, owner_email: "owner@example.test" },
      createdAt: new Date().toISOString(),
      stateKey: `applications/${tenantId}/${instanceId}/terraform.tfstate`,
      planStatus: "blocked",
      executionEnabled: false,
      blockers: ["Application execution disabled"],
      approval: { status: "pending" } as {
        status: string;
        decidedBy?: string;
        decidedAt?: string;
        reason?: string;
      },
    };
    let decisions = 0;
    const forbiddenMutations: string[] = [];
    await page.route("**/auth/status", (route) =>
      route.fulfill({
        json: { stackit: true, github: false, primary: "stackit" },
      }),
    );
    await page.route("**/api/v1/session", (route) =>
      route.fulfill({
        json: {
          user: { id: userId, login: "reviewer@example.test" },
          tenant,
          csrfToken: "csrf-decision",
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
    await page.route("**/api/v1/credentials", (route) =>
      route.fulfill({ json: { profiles: [] } }),
    );
    await page.route("**/auth/stackit/status", (route) =>
      route.fulfill({ json: { identity: null } }),
    );
    await page.route("**/api/v1/applications/**", async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace("/api/v1/applications/", "");
      if (route.request().method() === "GET") {
        if (path === "templates")
          return route.fulfill({ json: { versions: [] } });
        if (path === "platform-contracts")
          return route.fulfill({ json: { contracts: [] } });
        if (path === "instances")
          return route.fulfill({
            json: { instances: [order], orderDecisionEnabled: true },
          });
      }
      if (
        path === `instances/${instanceId}/decision` &&
        route.request().method() === "POST"
      ) {
        expect(actorIsOwner).toBe(false);
        const input = route.request().postDataJSON();
        expect(input).toEqual({
          decision: scenario,
          reason: scenario === "rejected" ? "Outside approved scope" : "",
          confirmDecision: true,
        });
        expect(route.request().headers()["x-lzc-tenant"]).toBe(tenantId);
        expect(route.request().headers()["x-lzc-csrf"]).toBe("csrf-decision");
        decisions++;
        order = {
          ...order,
          approval: {
            status: scenario,
            decidedBy: userId,
            decidedAt: new Date().toISOString(),
            reason: input.reason,
          },
        };
        return route.fulfill({ json: order });
      }
      forbiddenMutations.push(path);
      return route.abort();
    });
    await page.goto("/applications");
    await page.getByRole("tab", { name: "Bestellungen", exact: true }).click();
    await page
      .getByRole("button", {
        name: /Details anzeigen\s*:\s*Decision application/,
      })
      .click();
    const details = page.getByRole("region", {
      name: "Bestelldetails",
      exact: true,
    });
    await details.getByRole("tab", { name: "Übersicht", exact: true }).click();
    await page.screenshot({
      path: testInfo.outputPath("application-order-decision.png"),
      fullPage: true,
    });
    if (actorIsOwner) {
      await expect(
        details.getByRole("button", {
          name: "Bestellung freigeben",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        details.getByRole("button", {
          name: "Bestellung ablehnen",
          exact: true,
        }),
      ).toHaveCount(0);
    } else {
      const approve = details.getByRole("button", {
        name: "Bestellung freigeben",
        exact: true,
      });
      const reject = details.getByRole("button", {
        name: "Bestellung ablehnen",
        exact: true,
      });
      await expect(approve).toBeDisabled();
      await expect(reject).toBeDisabled();
      await details
        .getByLabel("Bestellentscheidung bestätigen", { exact: true })
        .check();
      await expect(approve).toBeEnabled();
      await expect(reject).toBeDisabled();
      if (scenario === "rejected")
        await details
          .getByLabel("Begründung", { exact: true })
          .fill("Outside approved scope");
      await (scenario === "approved" ? approve : reject).click();
      await expect(
        details.getByText(
          scenario === "approved"
            ? "Bestellung freigegeben"
            : "Bestellung abgelehnt",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        details.getByRole("button", {
          name: "Bestellung freigeben",
          exact: true,
        }),
      ).toHaveCount(0);
      await page.reload();
      await page
        .getByRole("tab", { name: "Bestellungen", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: /Details anzeigen\s*:\s*Decision application/,
        })
        .click();
      await details
        .getByRole("tab", { name: "Übersicht", exact: true })
        .click();
      await expect(
        details.getByText(
          scenario === "approved"
            ? "Bestellung freigegeben"
            : "Bestellung abgelehnt",
          { exact: true },
        ),
      ).toBeVisible();
    }
    expect(decisions).toBe(actorIsOwner ? 0 : 1);
    expect(order.executionEnabled).toBe(false);
    expect(forbiddenMutations).toEqual([]);
  });
}

test("workspace-first creation opens configurations, remembers access and ignores stale preference", async ({
  page,
}, testInfo) => {
  const createdId = "44444444-4444-4444-8444-444444444444";
  const existingId = "66666666-6666-4666-8666-666666666666";
  const configuration = {
    id: "77777777-7777-4777-8777-777777777777",
    name: "Gespeicherte Plattform",
    revision: 7,
    updatedAt: new Date().toISOString(),
    draft: createEditorConfiguration(
      "standalone",
      "77777777-7777-4777-8777-777777777777",
    ),
  };
  let activeId = tenantId;
  let creates = 0;
  let switches = 0;
  const tenants = [
    {
      id: tenantId,
      name: "Persönlich",
      kind: "personal",
      organizationId: null as string | null,
      organizationVerified: false,
      roles: [] as string[],
      manageMembers: false,
    },
    {
      id: existingId,
      name: "Bestehender Bereich",
      kind: "organisation",
      organizationId: organisationId,
      organizationVerified: false,
      roles: ["platform-engineer"],
      manageMembers: true,
    },
  ];
  await page.route("**/api/v1/**", (route) =>
    route.fulfill({ status: 404, json: { error: "not_found" } }),
  );
  await page.route("**/auth/status", (route) =>
    route.fulfill({
      json: { stackit: true, github: false, primary: "stackit" },
    }),
  );
  await page.route("**/auth/github/status", (route) =>
    route.fulfill({ json: { connected: false } }),
  );
  await page.route("**/api/v1/session", (route) =>
    route.fulfill({
      json: {
        user: { id: userId, login: "pilot" },
        tenant: tenants.find((tenant) => tenant.id === activeId),
        csrfToken: "csrf-workspace",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    }),
  );
  await page.route("**/api/v1/configurations", (route) =>
    route.fulfill({
      json: { configurations: activeId === existingId ? [configuration] : [] },
    }),
  );
  await page.route("**/api/v1/organisation", (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().headers()["x-lzc-csrf"]).toBe("csrf-workspace");
      expect(route.request().postDataJSON()).toEqual({
        name: "Projektteam",
        organizationId: organisationId,
      });
      creates++;
      tenants.push({
        id: createdId,
        name: "Projektteam",
        kind: "organisation",
        organizationId: organisationId,
        organizationVerified: false,
        roles: ["platform-engineer"],
        manageMembers: true,
      });
      return route.fulfill({ status: 201, json: { id: createdId } });
    }
    return route.fulfill({
      json: { userId, activeTenantId: activeId, tenants, members: [] },
    });
  });
  await page.route("**/api/v1/organisation/switch", (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers()["x-lzc-csrf"]).toBe("csrf-workspace");
    activeId = route.request().postDataJSON().tenantId;
    switches++;
    return route.fulfill({ json: { switched: true } });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Arbeitsbereiche", level: 1 }),
  ).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Hauptnavigation" });
  await expect(navigation.getByRole("button").first()).toHaveText(
    "Arbeitsbereiche",
  );
  await page
    .getByRole("button", { name: "Arbeitsbereich öffnen: Bestehender Bereich" })
    .click();
  await expect(page).toHaveURL(/\/configurations$/);
  await expect(
    page.getByRole("button", {
      name: "Konfiguration öffnen: Gespeicherte Plattform",
      exact: true,
    }),
  ).toBeVisible();
  await navigation
    .getByRole("button", { name: "Benutzerverwaltung", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Mitglieder in Bestehender Bereich" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Arbeitsbereich öffnen:/ }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Name des Arbeitsbereichs", { exact: true }),
  ).toHaveCount(0);
  await navigation
    .getByRole("button", { name: "Arbeitsbereiche", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Arbeitsbereich erstellen", exact: true })
    .click();
  await page
    .getByLabel("Name des Arbeitsbereichs", { exact: true })
    .fill("Projektteam");
  await page
    .getByLabel("STACKIT Organisations-ID", { exact: true })
    .fill(organisationId);
  await page
    .getByRole("button", { name: "Arbeitsbereich anlegen", exact: true })
    .click();
  await expect(page).toHaveURL(/\/configurations$/);
  await expect(
    page.getByRole("heading", { name: "Konfigurationen", level: 1 }),
  ).toBeVisible();
  expect(creates).toBe(1);
  expect(switches).toBe(2);
  await page.goto("/");
  await expect(page).toHaveURL(/\/configurations$/);
  expect(switches).toBe(2);
  await page
    .getByRole("button", { name: "Arbeitsbereich wechseln", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workspaces$/);
  await expect(
    page.getByRole("button", { name: "Arbeitsbereich öffnen: Projektteam" }),
  ).toBeVisible();
  await page.evaluate(
    (key) => localStorage.setItem(key, "55555555-5555-4555-8555-555555555555"),
    `lzc-workspace:${userId}`,
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Arbeitsbereich öffnen: Persönlich" }),
  ).toBeVisible();
  expect(switches).toBe(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("workspace-selection.png"),
    fullPage: true,
  });
});

for (const { publishing, applied, renewProof, executing } of [
  { publishing: true, applied: false, renewProof: false, executing: false },
  { publishing: true, applied: true, renewProof: false, executing: false },
  { publishing: true, applied: true, renewProof: true, executing: false },
  { publishing: false, applied: false, renewProof: false, executing: false },
  { publishing: false, applied: false, renewProof: false, executing: true },
]) {
  test(`application catalogue ${publishing ? `immutable publication${applied ? " from applied platform" : ""}${renewProof ? " after owner renewal" : ""}` : executing ? "owner order starts plan" : "owner order without fork"}`, async ({
    page,
  }, testInfo) => {
    const versionId = "44444444-4444-4444-8444-444444444444";
    const nextVersionId = "55555555-5555-4555-8555-555555555555";
    const instanceId = "66666666-6666-4666-8666-666666666666";
    const platformRevision = "77777777-7777-4777-8777-777777777777";
    const credentialProfileId = "99999999-9999-4999-8999-999999999999";
    const source = {
      applyRunId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      stateKey: `platforms/${tenantId}/terraform.tfstate`,
      stateVersion: "4",
      contractRevision: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      documentSha256: "a".repeat(64),
    };
    const defaultGroupId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const customGroupId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const applicationOwnerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const groups = [
      {
        id: defaultGroupId,
        name: "Application Owners",
        isDefault: true,
        memberIds: [publishing ? applicationOwnerId : userId],
      },
    ];
    let ownerProofVerified = !renewProof;
    const proofMutations: string[] = [];
    await page.route("**/api/v1/stackit/identity**", async (route) => {
      const request = route.request();
      expect(request.headers()["x-lzc-tenant"]).toBe(tenantId);
      if (request.method() === "GET")
        return route.fulfill({
          json: {
            bindingEnabled: true,
            verified: true,
            organizationAdminVerified: ownerProofVerified,
            identity: { email: "pilot@example.test" },
          },
        });
      expect(request.headers()["x-lzc-csrf"]).toBe("test-csrf");
      expect(request.postDataJSON()).toEqual({});
      const path = new URL(request.url()).pathname;
      proofMutations.push(path);
      if (path.endsWith("/start"))
        return route.fulfill({
          json: {
            verificationUri:
              "https://accounts.stackit.cloud/oauth/v2/authorize?response_type=code&code_challenge_method=S256",
            expiresAt: new Date(Date.now() + 300000).toISOString(),
            retryAfterMs: 1000,
          },
        });
      expect(path.endsWith("/poll")).toBe(true);
      ownerProofVerified = true;
      return route.fulfill({
        status: 409,
        json: { error: "stackit_flow_missing" },
      });
    });
    const approvedContract = {
      document: {
        schema_version: 1,
        tenant_id: tenantId,
        revision: platformRevision,
        organization_id: organisationId,
        targets: {
          public: {
            folder_id: "88888888-8888-4888-8888-888888888888",
            region: "eu01",
            corporate: false,
            network_area_id: null,
            firewall_next_hop_ip: null,
            ipv4_nameservers: null,
          },
        },
      },
      approvedBy: userId,
      approvedAt: "2026-10-02T00:00:00.000Z",
    };
    const contracts: unknown[] = publishing ? [] : [approvedContract];
    const template = {
      id: organisationId,
      key: "local-network",
      name: "Local VM network",
      kind: "public",
      region: "eu01",
      settings: {
        env: "dev",
        network_enabled: true,
        network_prefix_length: 24,
      },
      parameterPolicy: {
        schema_version: 1,
        fields: {
          env: {
            source: "input",
            required: true,
            default: "dev",
            choices: ["dev", "prod"],
          },
        },
      },
    };
    const initialVersion = {
      id: versionId,
      tenantId,
      templateId: template.id,
      version: 1,
      publishedBy: userId,
      publishedAt: "2026-10-02T00:00:00.000Z",
      acceleratorRevision: "a".repeat(40),
      deploymentPolicy: executing ? "direct" : "approval-required",
      allowedGroupIds: [defaultGroupId],
      platformRevision,
      targetKey: "public",
      template: publishing
        ? template
        : {
            ...template,
            parameterPolicy: {
              ...template.parameterPolicy,
              fields: {
                ...template.parameterPolicy.fields,
                secretsmanager_enabled: { source: "input", required: true },
              },
            },
          },
    };
    const versions: unknown[] = publishing ? [] : [initialVersion];
    const setupRequests: string[] = [];
    page.on("request", (request) => {
      if (
        /\/api\/v1\/(github|credentials|cloud-catalogues)/.test(request.url())
      )
        setupRequests.push(request.url());
    });
    const instances: unknown[] = [];
    const orderKeys: string[] = [];
    const planKeys: string[] = [];
    if (publishing)
      await page.route("**/api/v1/credentials", (route) =>
        route.fulfill({
          json: {
            profiles: [
              {
                id: credentialProfileId,
                name: "Tenant automation",
                state: "stored",
              },
            ],
          },
        }),
      );
    await page.route("**/api/v1/github/**", (route) =>
      route.fulfill({ json: { forks: [], nextPage: null } }),
    );
    await page.route("**/api/v1/invitations**", (route) =>
      route.fulfill({ json: { invitations: [] } }),
    );
    await page.route("**/auth/github/status", (route) =>
      route.fulfill({ json: { connected: false } }),
    );
    await page.route("**/auth/status", (route) =>
      route.fulfill({
        json: { github: false, stackit: true, primary: "stackit" },
      }),
    );
    await page.route("**/api/v1/session", (route) =>
      route.fulfill({
        json: {
          user: { id: userId, login: "pilot" },
          tenant: {
            id: tenantId,
            name: "Pilot",
            kind: "organisation",
            roles: [publishing ? "platform-engineer" : "application-owner"],
            manageMembers: publishing,
          },
          csrfToken: "test-csrf",
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
              name: "Pilot",
              kind: "organisation",
              organizationId: organisationId,
              organizationVerified: true,
              roles: [publishing ? "platform-engineer" : "application-owner"],
              manageMembers: publishing,
            },
          ],
          members: [
            {
              userId,
              login: "pilot",
              roles: [publishing ? "platform-engineer" : "application-owner"],
              manageMembers: publishing,
            },
            {
              userId: applicationOwnerId,
              login: "application-owner",
              roles: ["application-owner"],
              manageMembers: false,
            },
          ],
        },
      }),
    );
    await page.route("**/api/v1/applications/**", async (route) => {
      const request = route.request();
      expect(request.headers()["x-lzc-tenant"]).toBe(tenantId);
      const templates = new URL(request.url()).pathname.endsWith("/templates");
      const platforms = new URL(request.url()).pathname.endsWith(
        "/platform-contracts",
      );
      const pathname = new URL(request.url()).pathname;
      if (
        request.method() === "GET" &&
        pathname === `/api/v1/applications/instances/${instanceId}/jobs`
      )
        return route.fulfill({
          json: {
            jobs: planKeys.length
              ? [
                  {
                    id: "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                    instanceId,
                    requestedBy: userId,
                    approvedBy: userId,
                    createdAt: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + 120000).toISOString(),
                    status: "planning",
                    operation: "plan",
                    grantActive: true,
                    backendId: null,
                    canApproveBackend: false,
                    canDispatch: false,
                    delegatedExecution: true,
                    summary: null,
                    errorCode: null,
                  },
                ]
              : [],
          },
        });
      if (
        request.method() === "GET" &&
        pathname.endsWith("/applied-platforms")
      ) {
        expect(applied).toBe(true);
        return route.fulfill({
          json: {
            platforms: ownerProofVerified
              ? [
                  {
                    id: source.applyRunId,
                    stateKey: source.stateKey,
                    stateVersion: source.stateVersion,
                    organizationId: organisationId,
                    finishedAt: approvedContract.approvedAt,
                    configurationName: "Pilot Landing Zone",
                  },
                ]
              : [],
          },
        });
      }
      if (request.method() === "GET" && pathname.endsWith("/preview")) {
        expect(pathname).toBe(
          `/api/v1/applications/applied-platforms/${source.applyRunId}/preview`,
        );
        return route.fulfill({
          json: {
            document: {
              ...approvedContract.document,
              revision: source.contractRevision,
            },
            source,
          },
        });
      }
      if (request.method() === "GET" && pathname.endsWith("/groups"))
        return route.fulfill({
          json: {
            groups,
            members: publishing
              ? [
                  {
                    userId: applicationOwnerId,
                    login: null,
                    email: "application-owner@example.test",
                    roles: ["application-owner"],
                  },
                ]
              : [],
          },
        });
      if (request.method() === "GET")
        return route.fulfill({
          json: platforms
            ? { contracts }
            : templates
              ? {
                  versions,
                  retirementEnabled: true,
                  deploymentPolicyEnabled: true,
                  groupAccessEnabled: true,
                  appliedPlatformsEnabled: applied,
                }
              : {
                  instances,
                  planJobsEnabled: executing,
                  execution: {
                    planEnabled: executing,
                    applyEnabled: false,
                    delegatedExecutionEnabled: executing,
                    acceleratorRevision:
                      "c4b43c36af198985980b17626c48d357795e3fbd",
                  },
                },
        });
      expect(request.headers()["x-lzc-csrf"]).toBe("test-csrf");
      const body = request.postDataJSON();
      if (pathname === `/api/v1/applications/instances/${instanceId}/plan`) {
        expect(executing).toBe(true);
        expect(body).toEqual({ idempotencyKey: orderKeys.at(-1) });
        planKeys.push(body.idempotencyKey);
        return route.fulfill({
          status: 202,
          json: {
            jobId: "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            dispatched: planKeys.length === 1,
          },
        });
      }
      if (request.method() === "DELETE") {
        expect(publishing).toBe(true);
        expect(pathname).toBe(`/api/v1/applications/groups/${customGroupId}`);
        expect(body).toEqual({ confirmDeletion: true });
        const index = groups.findIndex((group) => group.id === customGroupId);
        expect(index).toBeGreaterThanOrEqual(0);
        groups.splice(index, 1);
        return route.fulfill({ json: { id: customGroupId } });
      }
      if (pathname.endsWith("/applied-platforms/approve")) {
        expect(body).toEqual({
          source,
          confirmApproval: true,
          credentialProfileId,
        });
        contracts.push(approvedContract);
        return route.fulfill({ json: { ...approvedContract, source } });
      }
      if (pathname === "/api/v1/applications/groups") {
        expect(publishing).toBe(true);
        expect(body).toEqual({ name: "Research applications" });
        groups.push({
          id: customGroupId,
          name: body.name,
          isDefault: false,
          memberIds: [],
        });
        return route.fulfill({ json: { id: customGroupId } });
      }
      if (pathname.endsWith("/members")) {
        expect(publishing).toBe(true);
        expect(pathname).toBe(
          `/api/v1/applications/groups/${customGroupId}/members`,
        );
        expect(body).toEqual({
          memberIds: expect.any(Array),
          confirmMembershipChange: true,
        });
        expect(
          body.memberIds.every((id: string) => id === applicationOwnerId),
        ).toBe(true);
        const group = groups.find((item) => item.id === customGroupId);
        if (!group) throw new Error("Expected new group");
        group.memberIds = body.memberIds;
        return route.fulfill({ json: { id: customGroupId } });
      }
      if (pathname.endsWith("/groups")) {
        expect(publishing).toBe(true);
        expect(pathname).toBe(
          `/api/v1/applications/templates/${versionId}/groups`,
        );
        expect(body).toEqual({
          groupIds: [customGroupId],
          confirmAccessChange: true,
        });
        const index = versions.findIndex(
          (item) => publishedProjectTemplateSchema.parse(item).id === versionId,
        );
        versions[index] = {
          ...publishedProjectTemplateSchema.parse(versions[index]),
          allowedGroupIds: body.groupIds,
        };
        return route.fulfill({ json: { id: versionId } });
      }
      if (new URL(request.url()).pathname.endsWith("/retire")) {
        expect(publishing).toBe(true);
        expect(body).toEqual({ confirmRetirement: true });
        const retiringId = new URL(request.url()).pathname.split("/").at(-2);
        const index = versions.findIndex(
          (value) =>
            publishedProjectTemplateSchema.parse(value).id === retiringId,
        );
        expect(index).toBeGreaterThanOrEqual(0);
        const published = publishedProjectTemplateSchema.parse(versions[index]);
        const retiredAt = new Date().toISOString();
        versions[index] = { ...published, retiredAt };
        return route.fulfill({
          json: { versionId: published.id, retiredAt, retiredBy: userId },
        });
      }
      if (new URL(request.url()).pathname.endsWith("/plan-input")) {
        expect(body).toEqual({});
        expect(request.url()).toContain(`/instances/${instanceId}/plan-input`);
        return route.fulfill({
          json: {
            kind: "application-plan-input",
            cloudPlanExecuted: false,
            blockers: ["Application-Runner noch nicht freigegeben."],
            plan: {
              entrypoint: "src/application",
              acceleratorRevision: "a".repeat(40),
              requestedBy: userId,
              stateKey: `applications/${tenantId}/${instanceId}/terraform.tfstate`,
              executionEnabled: false,
              variables: {
                platform_contract: approvedContract.document,
                application: {
                  instance_id: instanceId,
                  tenant_id: tenantId,
                  name: "Network application",
                  owner_email: "pilot@example.test",
                  target_key: "public",
                  network_enabled: true,
                  network_prefix_length: 24,
                  secretsmanager_enabled: false,
                  observability: {
                    enabled: false,
                    acl: [],
                    plan_name: "Observability-Starter-EU01",
                  },
                },
              },
            },
          },
        });
      }
      if (platforms) {
        expect(publishing).toBe(true);
        expect(body).toEqual({
          schema_version: 1,
          organization_id: organisationId,
          targets: approvedContract.document.targets,
          confirmApproval: true,
          credentialProfileId,
        });
        contracts.push(approvedContract);
        return route.fulfill({ json: approvedContract });
      }
      if (templates) {
        expect(publishing).toBe(true);
        expect(Object.keys(body)).toEqual([
          "template",
          "acceleratorRevision",
          "deploymentPolicy",
          "allowedGroupIds",
          ...(body.platformRevision ? ["platformRevision", "targetKey"] : []),
        ]);
        expect(body.acceleratorRevision).toBe(
          "c4b43c36af198985980b17626c48d357795e3fbd",
        );
        if (body.platformRevision)
          expect(body).toMatchObject({ platformRevision, targetKey: "public" });
        expect(body.template.settings.network_enabled).toBe(true);
        expect(body.allowedGroupIds).toEqual([defaultGroupId]);
        expect(body.deploymentPolicy).toBe(
          versions.length ? "direct" : "approval-required",
        );
        const published = {
          ...initialVersion,
          acceleratorRevision: body.acceleratorRevision,
          deploymentPolicy: body.deploymentPolicy,
          allowedGroupIds: body.allowedGroupIds,
          id: versions.length ? nextVersionId : versionId,
          version: versions.length + 1,
          templateId: body.template.id,
          template: structuredClone(body.template),
          platformRevision: body.platformRevision ?? null,
          targetKey: body.targetKey ?? null,
        };
        versions.push(published);
        return route.fulfill({ json: published });
      }
      expect(body).toEqual({
        versionId,
        idempotencyKey: expect.any(String),
        name: "Network application",
        parameters: publishing
          ? { env: "prod" }
          : { env: "prod", secretsmanager_enabled: false },
      });
      orderKeys.push(body.idempotencyKey);
      const instance = {
        id: instanceId,
        versionId,
        requestedBy: userId,
        deploymentPolicy: executing ? "direct" : "approval-required",
        executionConfigured: executing,
        name: body.name,
        parameters: body.parameters,
        settings: {
          owner_email: "pilot@example.test",
          env: "prod",
          network_enabled: true,
          network_prefix_length: 24,
        },
        createdAt: "2026-10-02T00:00:00.000Z",
        stateKey: `applications/${tenantId}/${instanceId}/terraform.tfstate`,
        planStatus: "blocked",
        executionEnabled: false,
        blockers: ["Kein Cloud-Plan ausgeführt."],
      };
      if (!instances.length) instances.push(instance);
      return route.fulfill({ json: instance });
    });
    await page.goto(publishing ? "/templates/standalone" : "/applications");
    await expect(page.locator(".account")).toContainText("pilot");
    if (publishing) {
      await page
        .getByRole("button", { name: "Konfiguration erstellen", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "5 Template-Entwürfe",
          exact: true,
        })
        .click();
      const editor = page.locator("section.project-card").first();
      await editor.getByLabel(/Lokales/).check();
      await editor
        .getByLabel("Netzgröße (IPv4-Präfixlänge)", { exact: true })
        .fill("24");
      await page
        .getByRole("button", {
          name: "Application Landing Zones",
          exact: true,
        })
        .click();
      if (applied) {
        await expect(
          page.getByRole("tab", { name: "Veröffentlichung", exact: true }),
        ).toHaveAttribute("aria-selected", "true");
        await page
          .getByRole("tab", { name: "Plattformanbindung", exact: true })
          .click();
        if (renewProof) {
          await expect(
            page
              .getByLabel("Erfolgreicher Plattform-Apply", { exact: true })
              .locator("option"),
          ).toHaveCount(1);
          await page
            .getByRole("button", { name: "Nachweis prüfen", exact: true })
            .click();
        }
        const applyOption = page.getByRole("option", {
          name: /Pilot Landing Zone · Apply/,
        });
        await expect(applyOption).toHaveCount(1);
        if (renewProof)
          expect(proofMutations).toEqual([
            "/api/v1/stackit/identity/start",
            "/api/v1/stackit/identity/poll",
          ]);
        await expect(applyOption).not.toContainText(source.stateKey);
        await expect(
          page.getByLabel("Plattform-Outputs · JSON-Vertrag", { exact: true }),
        ).toHaveCount(0);
        await page
          .getByLabel("Erfolgreicher Plattform-Apply", { exact: true })
          .selectOption(source.applyRunId);
        await page
          .getByRole("button", { name: "Plattform prüfen", exact: true })
          .click();
        await expect(
          page.locator(".application-properties").first(),
        ).toContainText(source.applyRunId);
      } else {
        await page
          .getByRole("tab", { name: "Plattformanbindung", exact: true })
          .click();
        await expect(
          page.getByLabel("Plattform-Outputs · JSON-Vertrag", { exact: true }),
        ).toBeHidden();
        await page.getByText("Kompatibilitätsimport", { exact: true }).click();
        await page
          .getByLabel("Plattform-Outputs · JSON-Vertrag", { exact: true })
          .setInputFiles({
            name: "platform-contract.json",
            mimeType: "application/json",
            buffer: Buffer.from(
              JSON.stringify({
                schema_version: 1,
                organization_id: organisationId,
                targets: approvedContract.document.targets,
              }),
            ),
          });
      }
      await page.screenshot({
        path: testInfo.outputPath("application-platform-binding.png"),
        fullPage: true,
      });
      await expect(
        page.getByRole("button", {
          name: "Plattformvertrag freigeben",
          exact: true,
        }),
      ).toBeDisabled();
      await page
        .getByLabel("Angewendete Plattform-Outputs und Zielordner geprüft", {
          exact: true,
        })
        .check();
      await page
        .getByRole("button", {
          name: "Plattformvertrag freigeben",
          exact: true,
        })
        .click();
      await expect(page.getByRole("status")).toContainText(
        "Plattformvertrag freigegeben",
      );
      await page
        .getByRole("tab", { name: "Veröffentlichung", exact: true })
        .click();
      await page
        .getByLabel("Freigegebener Plattformvertrag", { exact: true })
        .selectOption(platformRevision);
      await expect(
        page.getByLabel("Plattformziel", { exact: true }),
      ).toBeDisabled();
      await page
        .getByLabel("Application Landing Zone Template aus meinem Entwurf", {
          exact: true,
        })
        .selectOption({ index: 1 });
      await expect(
        page.getByLabel("Plattformziel", { exact: true }),
      ).toBeEnabled();
      await expect(
        page.getByRole("button", {
          name: "Version veröffentlichen",
          exact: true,
        }),
      ).toBeDisabled();
      await page
        .getByLabel("Plattformziel", { exact: true })
        .selectOption("public");
      await expect(
        page.getByLabel("Freigegebene Runner-Revision", { exact: true }),
      ).toHaveValue("c4b43c36af198985980b17626c48d357795e3fbd");
      await expect(
        page.getByRole("button", {
          name: "Version veröffentlichen",
          exact: true,
        }),
      ).toBeEnabled();
      await page.screenshot({
        path: testInfo.outputPath("application-publication.png"),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Version veröffentlichen", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText(
        "Version 1 veröffentlicht",
      );
      await page
        .getByRole("button", { name: "Konfigurationen", exact: true })
        .click();
      await page.getByRole("button", { name: /weiterbearbeiten$/ }).click();
      await page
        .getByRole("button", {
          name: "5 Template-Entwürfe",
          exact: true,
        })
        .click();
      await editor
        .getByLabel("Netzgröße (IPv4-Präfixlänge)", { exact: true })
        .fill("26");
      await page
        .getByRole("button", {
          name: "Application Landing Zones",
          exact: true,
        })
        .click();
      await page
        .getByLabel("Application Landing Zone Template aus meinem Entwurf", {
          exact: true,
        })
        .selectOption({ index: 1 });
      await page
        .getByLabel("Bereitstellungsrichtlinie", { exact: true })
        .selectOption("direct");
      await page
        .getByRole("button", { name: "Version veröffentlichen", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText(
        "Version 2 veröffentlicht",
      );
      await page.getByLabel("Sprache", { exact: true }).selectOption("en");
      await expect(page.getByRole("status")).toContainText(
        "Version 2 published",
      );
      await expect(page.getByRole("status")).toContainText(
        publishedProjectTemplateSchema.parse(versions[1]).template.name,
      );
      await page.getByRole("button", { name: /, version 2,/i }).click();
      await expect(page.locator(".application-properties")).toContainText(
        "Direct deployment",
      );
      await expect(
        page.getByRole("button", { name: "Retire version", exact: true }),
      ).toBeDisabled();
      await page
        .getByLabel("Block this template version for new orders", {
          exact: true,
        })
        .check();
      await page
        .getByRole("button", { name: "Retire version", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText("Version 2 retired");
      await page.getByLabel("Language", { exact: true }).selectOption("de");
      await expect(page.getByRole("status")).toContainText(
        "Version 2 stillgelegt",
      );
      await expect(
        page.getByRole("button", { name: /, Version 2,.*Stillgelegt/ }),
      ).toBeVisible();
      await expect(page.getByLabel("Projektname", { exact: true })).toHaveCount(
        0,
      );
      await page.screenshot({
        path: testInfo.outputPath("application-retired.png"),
        fullPage: true,
      });
      expect(versions).toEqual([
        expect.objectContaining({
          version: 1,
          template: expect.objectContaining({
            settings: expect.objectContaining({ network_prefix_length: 24 }),
          }),
        }),
        expect.objectContaining({
          version: 2,
          template: expect.objectContaining({
            settings: expect.objectContaining({ network_prefix_length: 26 }),
          }),
        }),
      ]);
    } else {
      await expect(page).toHaveURL(/\/applications$/);
      await expect(
        page.getByRole("tab", { name: "Katalog", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        page.getByRole("tab", { name: "Veröffentlichung", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("tab", { name: "Plattformanbindung", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("tab", { name: "Gruppen", exact: true }),
      ).toHaveCount(0);
      await page.getByRole("tab", { name: "Katalog", exact: true }).focus();
      await page.keyboard.press("ArrowRight");
      await expect(
        page.getByRole("tab", { name: "Bestellungen", exact: true }),
      ).toBeFocused();
      await expect(
        page.getByRole("tabpanel", { name: "Bestellungen", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Home");
      await expect(
        page.getByRole("tab", { name: "Katalog", exact: true }),
      ).toBeFocused();
      await expect(
        page.getByRole("heading", { name: "Application-Gruppen", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Freigaben speichern", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Konfigurationen", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", {
          name: "Application Landing Zone Template veröffentlichen",
          exact: true,
        }),
      ).toHaveCount(0);
    }
    await page.getByRole("tab", { name: "Katalog", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Application Landing Zone Templates",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: /, Version 1, eu01, Public$/,
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: /, Version 1, eu01, Public$/,
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    if (publishing) {
      await expect(
        page.getByRole("tab", { name: "Gruppen", exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole("navigation", { name: "Hauptnavigation" })
        .getByRole("button", { name: "Benutzerverwaltung", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Benutzerverwaltung", exact: true }),
      ).toBeVisible();
      const membership = page.getByRole("group", {
        name: "Gruppenmitglieder",
        exact: true,
      });
      await page
        .getByLabel("Gruppe", { exact: true })
        .selectOption(defaultGroupId);
      await expect(
        membership.getByLabel("application-owner@example.test", {
          exact: true,
        }),
      ).toBeChecked();
      await expect(
        membership.getByLabel("application-owner@example.test", {
          exact: true,
        }),
      ).toBeDisabled();
      await expect(membership).not.toContainText(applicationOwnerId);
      await page
        .getByLabel("Gruppenname", { exact: true })
        .fill("Research applications");
      await page
        .getByRole("button", { name: "Gruppe anlegen", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText(
        "Gruppenänderung gespeichert.",
      );
      await expect(page.getByLabel("Gruppe", { exact: true })).toHaveValue(
        customGroupId,
      );
      await membership
        .getByLabel("application-owner@example.test", { exact: true })
        .check();
      await expect(
        page.getByRole("button", {
          name: "Mitgliedschaften speichern",
          exact: true,
        }),
      ).toBeDisabled();
      await page
        .getByLabel("Gruppenmitgliedschaften geprüft", { exact: true })
        .check();
      await page
        .getByRole("button", {
          name: "Mitgliedschaften speichern",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Mitgliedschaften speichern",
          exact: true,
        }),
      ).toBeDisabled();
      await membership
        .getByLabel("application-owner@example.test", { exact: true })
        .uncheck();
      await page
        .getByLabel("Gruppenmitgliedschaften geprüft", { exact: true })
        .check();
      await page
        .getByRole("button", {
          name: "Mitgliedschaften speichern",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Mitgliedschaften speichern",
          exact: true,
        }),
      ).toBeDisabled();
      expect(
        groups.find((group) => group.id === customGroupId)?.memberIds,
      ).toEqual([]);
      page.once("dialog", (dialog) => dialog.accept());
      await page
        .getByRole("button", { name: "Gruppe löschen", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText("Gruppe gelöscht.");
      await expect(page.getByLabel("Gruppe", { exact: true })).toHaveValue("");
      await expect(
        page.getByRole("heading", { name: "Mitglieder in Pilot", exact: true }),
      ).toBeVisible();
      await page
        .getByLabel("Gruppenname", { exact: true })
        .fill("Research applications");
      await page
        .getByRole("button", { name: "Gruppe anlegen", exact: true })
        .click();
      await expect(page.getByLabel("Gruppe", { exact: true })).toHaveValue(
        customGroupId,
      );
      await membership
        .getByLabel("application-owner@example.test", { exact: true })
        .check();
      await page
        .getByLabel("Gruppenmitgliedschaften geprüft", { exact: true })
        .check();
      await page
        .getByRole("button", {
          name: "Mitgliedschaften speichern",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Mitgliedschaften speichern",
          exact: true,
        }),
      ).toBeDisabled();
      await page.screenshot({
        path: testInfo.outputPath("user-management-groups.png"),
        fullPage: true,
      });
      await page
        .getByRole("navigation", { name: "Hauptnavigation" })
        .getByRole("button", { name: "Application Landing Zones", exact: true })
        .click();
      await page.getByRole("tab", { name: "Katalog", exact: true }).click();
      await page
        .getByRole("button", { name: /, Version 1, eu01, Public$/ })
        .click();
      const access = page.getByRole("group", {
        name: "Freigaben dieser Template-Version",
        exact: true,
      });
      const immutableVersion = publishedProjectTemplateSchema.parse(
        versions[0],
      );
      await access.getByLabel("Application Owners", { exact: true }).uncheck();
      await access.getByLabel("Research applications", { exact: true }).check();
      await expect(
        access.getByRole("button", {
          name: "Freigaben speichern",
          exact: true,
        }),
      ).toBeDisabled();
      await access
        .getByLabel("Template-Freigaben geprüft", { exact: true })
        .check();
      await access
        .getByRole("button", { name: "Freigaben speichern", exact: true })
        .click();
      await expect(
        access.getByRole("button", {
          name: "Freigaben speichern",
          exact: true,
        }),
      ).toBeDisabled();
      expect(publishedProjectTemplateSchema.parse(versions[0])).toEqual({
        ...immutableVersion,
        allowedGroupIds: [customGroupId],
      });
      await page.screenshot({
        path: testInfo.outputPath("application-groups.png"),
        fullPage: true,
      });
    }
    await expect(
      page.getByText("Lokal, ohne SNA", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Projektname", { exact: true })
      .fill("Network application");
    if (!publishing)
      await page
        .getByLabel("Umgebung / Stage", { exact: true })
        .selectOption("prod");
    await expect(page.getByLabel("Eigentümer", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Bestellen", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(
      "Bestellung gespeichert",
    );
    if (executing) {
      await expect(page.getByRole("status")).toContainText(
        "Cloud-Plan gestartet",
      );
      await expect(
        page.getByRole("heading", { name: "Cloud-Plan läuft", exact: true }),
      ).toBeVisible();
      expect(planKeys).toEqual([orderKeys[0]]);
    }
    await expect(
      page.getByRole("tab", { name: "Bestellungen", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Katalog", exact: true }).click();
    await page.getByRole("button", { name: "Bestellen", exact: true }).click();
    await expect.poll(() => orderKeys.length).toBe(2);
    expect(orderKeys[0]).toBe(orderKeys[1]);
    expect(instances).toHaveLength(1);
    if (executing) expect(new Set(planKeys).size).toBe(1);
    await page.reload();
    await page.getByRole("tab", { name: "Bestellungen", exact: true }).click();
    await page
      .getByRole("button", {
        name: /Details anzeigen\s*:\s*Network application/,
      })
      .click();
    const details = page.getByRole("region", {
      name: "Bestelldetails",
      exact: true,
    });
    await expect(details).toContainText(
      `applications/${tenantId}/${instanceId}/terraform.tfstate`,
    );
    if (executing) {
      await expect(
        details.getByRole("heading", { name: "Cloud-Plan läuft", exact: true }),
      ).toBeVisible();
      await expect(details).not.toContainText("Plan-Vorbereitung bestätigen");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath("application-order-auto-plan.png"),
        fullPage: true,
      });
      expect(setupRequests).toEqual([]);
      return;
    }
    await details.getByRole("tab", { name: "Übersicht", exact: true }).click();
    await expect(details).toContainText(
      "Gesperrt · Kein Cloud-Plan ausgeführt",
    );
    await expect(details).toContainText("Noch nicht ermittelt");
    await expect(details).toContainText(
      "Bei Bestellung verifiziert: pilot@example.test",
    );
    await expect(details).toContainText(platformRevision);
    await details
      .getByRole("button", { name: "Plan-Input prüfen", exact: true })
      .click();
    await expect(
      details.getByRole("heading", {
        name: "Plan-Input geprüft · Kein Cloud-Plan ausgeführt",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      details.getByLabel("Terraform-Variablen · JSON", { exact: true }),
    ).toHaveValue(/"network_enabled": true/);
    await expect(details).toContainText(
      "Application-Runner noch nicht freigegeben.",
    );
    const viewer = await details
      .getByLabel("Terraform-Variablen · JSON", { exact: true })
      .boundingBox();
    const panel = await details.boundingBox();
    expect(viewer).not.toBeNull();
    expect(panel).not.toBeNull();
    expect(viewer?.width ?? 0).toBeGreaterThan((panel?.width ?? 1) * 0.9);
    await expect(
      page.getByRole("button", { name: /Apply|Anwenden/ }),
    ).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("application-order.png"),
      fullPage: true,
    });
    if (!publishing) expect(setupRequests).toEqual([]);
  });
}
const proofFailures = {
  organization_access_denied:
    "The signed-in STACKIT user has no access to this organization.",
  organization_permissions_response_invalid_response:
    "STACKIT returned an unexpected permissions response. Organization binding remains blocked.",
  identity_binding_conflict:
    "The confirmed STACKIT account does not belong to the signed-in Configurator user.",
  "unsafe-provider-detail": "The organization proof could not be verified.",
  constructor: "The organization proof could not be verified.",
  stackit_flow_missing: "The STACKIT proof expired. Please check again.",
};
for (const proofOutcome of [
  true,
  false,
  "organization_access_denied",
  "organization_permissions_response_invalid_response",
  "identity_binding_conflict",
  "unsafe-provider-detail",
  "constructor",
  "pkce-owner",
  "pkce-return",
  "bound-owner",
  "pkce-completed",
  "stackit_flow_missing",
] as const) {
  const codeFlow =
    proofOutcome === "pkce-owner" ||
    proofOutcome === "pkce-return" ||
    proofOutcome === "pkce-completed";
  const alreadyBound = proofOutcome === "bound-owner";
  const ownerProof = proofOutcome === true || codeFlow || alreadyBound;
  const failureCode =
    typeof proofOutcome === "string" && !codeFlow && !alreadyBound
      ? proofOutcome
      : null;
  const verificationUri = codeFlow
    ? "https://accounts.stackit.cloud/oauth/v2/authorize?response_type=code&code_challenge_method=S256"
    : "https://accounts.stackit.cloud/device?user_code=ABCD-1234";
  test(`explicit human organization binding ${codeFlow || alreadyBound ? proofOutcome : (failureCode ?? (ownerProof ? "owner" : "read-only"))}`, async ({
    page,
  }, testInfo) => {
    let checked = false;
    let bound = alreadyBound;
    const mutations: string[] = [];
    await page.route("**/auth/status", (route) =>
      route.fulfill({
        json: { github: false, stackit: true, primary: "stackit" },
      }),
    );
    await page.route("**/api/v1/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/v1/cloud-catalogues/automatic")
        return route.fulfill({
          status: 404,
          json: { error: "catalogue_backend_unavailable" },
        });
      if (request.method() !== "GET") {
        expect(path.startsWith("/api/v1/stackit/identity/")).toBe(true);
        expect(request.headers()["x-lzc-csrf"]).toBe("test-csrf");
        expect(request.headers()["x-lzc-tenant"]).toBe(tenantId);
        mutations.push(path);
        if (path.endsWith("/start")) {
          expect(request.postDataJSON()).toEqual({});
          checked = false;
          return route.fulfill({
            json: {
              verificationUri,
              ...(codeFlow ? {} : { userCode: "ABCD-1234" }),
              expiresAt: new Date(Date.now() + 300000).toISOString(),
              retryAfterMs: 1000,
            },
          });
        }
        if (path.endsWith("/poll")) {
          expect(request.postDataJSON()).toEqual({});
          checked = true;
          if (
            proofOutcome === "pkce-completed" ||
            failureCode === "stackit_flow_missing"
          )
            return route.fulfill({
              status: 409,
              json: { error: "stackit_flow_missing" },
            });
          if (failureCode === "identity_binding_conflict")
            return route.fulfill({
              status: 409,
              json: {
                error: failureCode,
                privateDetail: "do-not-display-provider-details",
              },
            });
          return route.fulfill({
            json: failureCode
              ? {
                  status: "failed",
                  code: failureCode,
                  privateDetail: "do-not-display-provider-details",
                }
              : { status: "verified" },
          });
        }
        expect(path.endsWith("/bind-organization")).toBe(true);
        expect(ownerProof && checked).toBe(true);
        expect(request.postDataJSON()).toEqual({
          confirmOrganizationBinding: true,
        });
        bound = true;
        return route.fulfill({
          json: {
            tenantId,
            organizationId: organisationId,
            authorizationId: userId,
            boundBy: userId,
            boundAt: new Date().toISOString().replace("Z", "+00:00"),
          },
        });
      }
      if (path === "/api/v1/session")
        return route.fulfill({
          json: {
            user: { id: userId, login: "pilot" },
            tenant: {
              id: tenantId,
              name: "Pilot",
              kind: "organisation",
              roles: ["platform-engineer"],
              manageMembers: true,
            },
            csrfToken: "test-csrf",
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            stackitVerified: true,
          },
        });
      if (path === "/api/v1/organisation")
        return route.fulfill({
          json: {
            userId,
            activeTenantId: tenantId,
            organizationBindingEnabled: true,
            tenants: [
              {
                id: tenantId,
                name: "Pilot",
                kind: "organisation",
                organizationId: organisationId,
                organizationVerified: bound,
                roles: ["platform-engineer"],
                manageMembers: true,
              },
            ],
            members: [
              {
                userId,
                login: "pilot",
                roles: ["platform-engineer"],
                manageMembers: true,
              },
            ],
          },
        });
      if (path === "/api/v1/stackit/identity")
        return route.fulfill({
          json: {
            bindingEnabled: true,
            organizationAdminVerified: checked && ownerProof,
            verified: true,
            identity: { email: "pilot@example.test" },
          },
        });
      if (path === "/api/v1/invitations")
        return route.fulfill({ json: { invitations: [] } });
      if (path === "/api/v1/configurations")
        return route.fulfill({ json: { configurations: [] } });
      if (path === "/api/v1/preparations")
        return route.fulfill({ json: { preparations: [] } });
      if (path === "/api/v1/plans")
        return route.fulfill({ json: { plans: [] } });
      return route.fulfill({ json: {} });
    });
    await page.goto("/organisation");
    await page
      .getByRole("button", { name: "Benutzerverwaltung", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Nachweis prüfen", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByText("pilot@example.test", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Configurator-Benutzer", { exact: true }),
    ).toBeVisible();
    expect(mutations).toEqual([]);
    await page.getByLabel("Sprache", { exact: true }).selectOption("en");
    expect(mutations).toEqual([]);
    await page
      .getByRole("button", { name: "Check proof", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Open STACKIT", exact: true }),
    ).toHaveAttribute("href", verificationUri);
    if (codeFlow)
      await expect(page.getByText("ABCD-1234", { exact: true })).toHaveCount(0);
    else
      await expect(page.getByText("ABCD-1234", { exact: true })).toBeVisible();
    if (proofOutcome === "pkce-return") {
      await page.goto("/organisation#stackit-proof");
      await page.reload();
      await expect(page).toHaveURL(/\/organisation$/);
    }
    if (failureCode) {
      await expect(page.getByRole("alert")).toContainText(
        proofFailures[failureCode],
      );
      await expect(
        page.getByRole("button", { name: "Bind organization", exact: true }),
      ).toHaveCount(0);
      expect(bound).toBe(false);
      expect(
        mutations.filter((path) => path.endsWith("/bind-organization")),
      ).toEqual([]);
      await expect(page.locator("body")).not.toContainText(
        "do-not-display-provider-details",
      );
      await expect(page.locator("body")).not.toContainText(
        "unsafe-provider-detail",
      );
      await page.screenshot({
        path: testInfo.outputPath("organization-proof-failure.png"),
        fullPage: true,
      });
      return;
    }
    if (!ownerProof) {
      await expect(page.getByRole("alert")).toContainText(
        "Full organization owner permissions have not been verified.",
      );
      await expect(
        page.getByRole("button", { name: "Bind organization", exact: true }),
      ).toHaveCount(0);
      expect(bound).toBe(false);
      expect(
        mutations.filter((path) => path.endsWith("/bind-organization")),
      ).toEqual([]);
      return;
    }
    if (alreadyBound) {
      await expect(
        page.getByText("Organization owner permissions verified", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Check proof", exact: true }),
      ).toBeEnabled();
      await expect(
        page.getByRole("button", { name: "Bind organization", exact: true }),
      ).toHaveCount(0);
      expect(
        mutations.filter((path) => path.endsWith("/bind-organization")),
      ).toEqual([]);
      expect(bound).toBe(true);
      return;
    }
    await expect(
      page.getByRole("button", { name: "Bind organization", exact: true }),
    ).toBeDisabled();
    await page.getByLabel("Language", { exact: true }).selectOption("de");
    await expect(
      page.getByLabel("Organisationsbindung bestätigen", { exact: true }),
    ).not.toBeChecked();
    await expect(
      page.getByRole("button", { name: "Organisation verbinden", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText("Organisations-Owner-Rechte geprüft", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("organization-owner-proof.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page
      .getByLabel("Organisationsbindung bestätigen", { exact: true })
      .check();
    await page
      .getByRole("button", { name: "Organisation verbinden", exact: true })
      .click();
    await expect(page.getByText(/Zuordnung verifiziert/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Organisation verbinden", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Nachweis prüfen", exact: true }),
    ).toBeEnabled();
    expect(
      mutations.filter((path) => path.endsWith("/bind-organization")),
    ).toHaveLength(1);
  });
}

for (const manager of [true, false]) {
  test(`organisation membership view ${manager ? "manager" : "application owner"}`, async ({
    page,
  }, testInfo) => {
    const roles = [manager ? "platform-engineer" : "application-owner"];
    await page.route("**/api/v1/applications/**", (route) =>
      route.fulfill({
        json: new URL(route.request().url()).pathname.endsWith("/templates")
          ? { versions: [] }
          : { instances: [] },
      }),
    );
    await page.route("**/auth/status", (route) =>
      route.fulfill({ json: { github: true } }),
    );
    await page.route("**/api/v1/session", (route) =>
      route.fulfill({
        json: {
          user: { id: userId, login: "pilot" },
          tenant: {
            id: tenantId,
            name: "Pilot",
            kind: "organisation",
            roles,
            manageMembers: manager,
          },
          csrfToken: "test-csrf",
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
      }),
    );
    await page.route("**/api/v1/github/**", (route) =>
      route.fulfill({ json: { forks: [], nextPage: null } }),
    );
    await page.route("**/api/v1/organisation", (route) =>
      route.fulfill({
        json: {
          userId,
          activeTenantId: tenantId,
          tenants: [
            {
              id: tenantId,
              name: "Pilot",
              kind: "organisation",
              organizationId: organisationId,
              organizationVerified: false,
              canArchive: manager,
              roles,
              manageMembers: manager,
            },
          ],
          members: [{ userId, login: "pilot", roles, manageMembers: manager }],
        },
      }),
    );
    await page.goto(manager ? "/organisation" : "/workspaces");
    if (!manager)
      await page
        .getByRole("button", { name: "Arbeitsbereich öffnen: Pilot" })
        .click();
    await expect(
      page.getByText("@pilot", { exact: true }).first(),
    ).toBeVisible();
    if (!manager) {
      await expect(
        page.getByRole("heading", {
          name: "Application Landing Zones",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Konfigurationen", exact: true }),
      ).toHaveCount(0);
    }
    await page
      .getByRole("button", { name: "Benutzerverwaltung", exact: true })
      .click();
    await expect(page).toHaveURL(/\/organisation$/);
    await expect(
      page.getByRole("heading", { name: "Mitglieder in Pilot" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Anmeldung erforderlich",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByText(/Zuordnung noch nicht verifiziert/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Deployments", exact: true }),
    ).toHaveCount(manager ? 1 : 0);
    if (manager) {
      await page
        .getByRole("button", { name: "Konfigurationen", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Konfigurationen", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Arbeitsbereiche", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", {
          name: "Anmeldung erforderlich",
          exact: true,
        }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Konfigurationen", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Neue Konfiguration", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Arbeitsbereiche", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", {
          name: "Anmeldung erforderlich",
          exact: true,
        }),
      ).toHaveCount(0);
      await page
        .getByRole("button", {
          name: "Benutzerverwaltung",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("heading", { name: "Mitglieder in Pilot" }),
      ).toBeVisible();
      await expect(
        page.getByLabel("Persönliche Benutzerkennung", { exact: true }),
      ).toHaveCount(0);
      let revoked = false;
      await page.route("**/api/v1/invitations**", async (route) => {
        const method = route.request().method();
        if (method === "DELETE") {
          revoked = true;
          return route.fulfill({ status: 204 });
        }
        if (method === "POST") {
          expect(route.request().postDataJSON()).toEqual({
            roles: ["application-owner"],
            manageMembers: false,
          });
          return route.fulfill({
            status: 201,
            json: {
              id: userId,
              url: `https://configurator.example/organisation#invite=${"x".repeat(43)}`,
              expiresAt: new Date(Date.now() + 86400000).toISOString(),
            },
          });
        }
        return route.fulfill({
          json: {
            invitations: revoked
              ? []
              : [
                  {
                    id: userId,
                    roles: ["application-owner"],
                    manageMembers: false,
                    expiresAt: new Date(Date.now() + 86400000).toISOString(),
                  },
                ],
          },
        });
      });
      await page
        .getByRole("button", { name: "Einladungslink erstellen" })
        .click();
      await expect(
        page.getByLabel("Einladungslink – jetzt kopieren"),
      ).toHaveValue(/#invite=/);
      await page.getByRole("button", { name: "Einladung widerrufen" }).click();
      await expect(page.getByText("Keine offenen Einladungen.")).toBeVisible();
      let deletionCalled = false;
      await page.route(
        `**/api/v1/organisation/workspaces/${tenantId}`,
        async (route) => {
          deletionCalled = true;
          expect(route.request().method()).toBe("DELETE");
          expect(route.request().headers()["x-lzc-tenant"]).toBe(tenantId);
          await route.fulfill({
            status: 409,
            json: { error: "organisation_not_empty_draft" },
          });
        },
      );
      await page
        .getByRole("navigation", { name: "Hauptnavigation" })
        .getByRole("button", { name: "Arbeitsbereiche", exact: true })
        .click();
      page.once("dialog", (dialog) => dialog.dismiss());
      await page
        .getByRole("button", { name: "Arbeitsbereich löschen", exact: true })
        .click();
      expect(deletionCalled).toBe(false);
      page.once("dialog", (dialog) => dialog.accept());
      await page
        .getByRole("button", { name: "Arbeitsbereich löschen", exact: true })
        .click();
      await expect(page.getByRole("alert")).toContainText(
        "Nur leere, unbestätigte Arbeitsbereiche",
      );
      expect(deletionCalled).toBe(true);
    } else
      await expect(
        page.getByRole("button", { name: "Mitgliedschaft speichern" }),
      ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("organisation.png"),
      fullPage: true,
    });
    await page.goBack();
    await expect(page).toHaveURL(
      manager ? /\/organisation$/ : /\/applications$/,
    );
  });
}
