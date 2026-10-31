import { expect, type Page, test } from "./fixtures";

const user = "11111111-1111-4111-8111-111111111111",
  tenant = "22222222-2222-4222-8222-222222222222",
  instance = "44444444-4444-4444-8444-444444444444",
  old = "55555555-5555-4555-8555-555555555555",
  target = "66666666-6666-4666-8666-666666666666",
  family = "77777777-7777-4777-8777-777777777777",
  platform = "88888888-8888-4888-8888-888888888888",
  edge = "99999999-9999-4999-8999-999999999999";
const confirmation =
  "Ich übernehme nur den gewünschten Stand derselben Bestellung. Ich erstelle und prüfe danach einen neuen Plan; diese Aktion startet und genehmigt keinen Apply.";
function version(id: string, number: number) {
  return {
    id,
    tenantId: tenant,
    templateId: family,
    version: number,
    publishedBy: user,
    publishedAt: "2026-10-29T00:00:00.000Z",
    deploymentPolicy: "direct",
    acceleratorRevision: "08ac257de1548c8ec5e83dae1a79373711c3d644",
    platformRevision: platform,
    targetKey: "public",
    template: {
      id: family,
      key: "public",
      name: "Public",
      kind: "public",
      region: "eu01",
      settings: {
        env: "dev",
        network_enabled: true,
        network_prefix_length: 24,
        secretsmanager_enabled: false,
        custom_roles: [],
        role_assignments: [],
        observability: {
          enabled: false,
          plan_name: "Observability-Starter-EU01",
          acl: [],
        },
      },
      parameterPolicy: {
        schema_version: 1,
        fields:
          number === 2
            ? { secretsmanager_enabled: { source: "input", required: true } }
            : {},
      },
    },
  };
}
async function setup(
  page: Page,
  blocked = false,
  stale = false,
  pe = false,
  approvePlan = false,
  platformMode = false,
  unbound = false,
  noPath = false,
) {
  let approved = false;
  const nextPlatform = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const platformDoc = (revision: string) => ({
    schema_version: 1,
    tenant_id: tenant,
    revision,
    organization_id: user,
    targets: {
      public: {
        folder_id: user,
        region: "eu01",
        corporate: false,
        network_area_id: null,
        firewall_next_hop_ip: null,
        ipv4_nameservers: null,
      },
    },
  });
  const assessment = (parameters: Record<string, unknown>) => ({
    classification:
      blocked || typeof parameters.secretsmanager_enabled !== "boolean"
        ? "blocked"
        : "sensitive",
    approvalPolicy: "approval-required",
    reasons: blocked
      ? [
          {
            code: "component-removal",
            path: "network_enabled",
            classification: "blocked",
          },
        ]
      : [],
    retainedParameters: {},
    requiredParameters:
      typeof parameters.secretsmanager_enabled !== "boolean"
        ? [
            {
              path: "secretsmanager_enabled",
              required: true,
              hasDefault: false,
            },
          ]
        : [],
    requiresFreshPlan: true,
    applyAllowed: false,
  });
  const context = {
    originVersionId: old,
    effectiveVersionId: old,
    effectivePlatformRevision: unbound ? null : platform,
    effectiveDeploymentPolicy: "direct",
    effectiveParameters: {},
    bindingId: null as string | null,
    lastAppliedVersionId: old,
    lastAppliedPlatformRevision: platform,
    candidate: null as unknown,
    current: version(old, 1),
    platformCandidates: platformMode
      ? [
          {
            id: edge,
            fromPlatformRevision: platform,
            toPlatformRevision: nextPlatform,
            policy: { sensitive: "approval-required" },
            target: platformDoc(nextPlatform),
            assessment: assessment({ secretsmanager_enabled: false }),
          },
        ]
      : [],
    candidates: noPath
      ? []
      : [
          {
            id: edge,
            fromVersionId: old,
            toVersionId: target,
            policy: { sensitive: "approval-required" },
            target: version(target, 2),
            assessment: assessment({}),
          },
        ],
    blockers: [],
  };
  const mutations: { path: string; body: Record<string, unknown> }[] = [];
  const workspace = {
    id: tenant,
    name: "Upgrade workspace",
    kind: "organisation",
    organizationId: user,
    roles: [pe ? "platform-engineer" : "application-owner"],
    manageMembers: false,
  };
  await page.route("**/auth/status", (r) =>
    r.fulfill({ json: { stackit: true, github: false, primary: "stackit" } }),
  );
  await page.route("**/api/v1/session", (r) =>
    r.fulfill({
      json: {
        user: { id: user, login: "owner@example.test" },
        tenant: workspace,
        csrfToken: "upgrade-csrf",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    }),
  );
  await page.route("**/api/v1/organisation", (r) =>
    r.fulfill({
      json: {
        userId: user,
        activeTenantId: tenant,
        tenants: [workspace],
        members: [],
      },
    }),
  );
  await page.route("**/api/v1/applications/**", async (r) => {
    const request = r.request(),
      path = new URL(request.url()).pathname.replace(
        "/api/v1/applications/",
        "",
      );
    if (request.method() === "GET") {
      if (path === "platform-upgrades")
        return r.fulfill({ json: { edges: [] } });
      if (path === "template-upgrades")
        return r.fulfill({ json: { edges: [] } });
      if (path === "templates")
        return r.fulfill({
          json: {
            versions: [
              version(old, 1),
              version(target, 2),
              ...(pe
                ? [
                    {
                      ...version("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 3),
                      templateId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                      template: {
                        ...version(target, 2).template,
                        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                        name: "Other family",
                      },
                    },
                  ]
                : []),
            ],
          },
        });
      if (path === "platform-contracts")
        return r.fulfill({
          json: {
            contracts: pe
              ? [platform, nextPlatform].map((revision) => ({
                  document: platformDoc(revision),
                  approvedBy: user,
                  approvedAt: "2026-10-29T00:00:00.000Z",
                }))
              : [],
          },
        });
      if (path === "instances")
        return r.fulfill({
          json: {
            instances: [
              {
                id: instance,
                versionId: old,
                requestedBy: user,
                name: "Existing upgrade order",
                deploymentPolicy: "direct",
                approval: { status: "not-required" },
                parameters: {},
                settings: { owner_email: "owner@example.test" },
                createdAt: "2026-10-08T10:15:00.000Z",
                stateKey: `applications/${tenant}/${instance}/terraform.tfstate`,
                executionEnabled: false,
                planStatus: "blocked",
                blockers: ["Synthetic fixture"],
              },
            ],
            upgradesEnabled: true,
            planJobsEnabled: true,
            execution: {
              planEnabled: true,
              applyEnabled: true,
              maintenanceEnabled: true,
            },
          },
        });
      if (path === `instances/${instance}/jobs`)
        return r.fulfill({
          json: {
            jobs: approvePlan
              ? [
                  {
                    id: family,
                    instanceId: instance,
                    requestedBy: user,
                    approvedBy: user,
                    createdAt: "2026-10-29T00:00:00.000Z",
                    expiresAt: new Date(Date.now() + 3600000).toISOString(),
                    operation: "plan",
                    status: "succeeded",
                    grantActive: true,
                    backendId: platform,
                    canApproveBackend: false,
                    canDispatch: false,
                    summary: null,
                    errorCode: null,
                    artifactSha256: "a".repeat(64),
                    canApply: false,
                  },
                ]
              : [],
          },
        });
      if (path === `jobs/${family}/output`)
        return r.fulfill({
          json: { text: "", truncated: false, kind: "execution" },
        });
      if (path === `jobs/${family}/preview`)
        return r.fulfill({
          json: {
            jobId: family,
            artifactSha256: "a".repeat(64),
            resources: [],
            drift: [],
          },
        });
      if (path === `jobs/${family}/upgrade-approval`)
        return r.fulfill({
          json: {
            upgradeId: edge,
            candidateHash: "b".repeat(64),
            artifactSha256: "a".repeat(64),
            requiresApproval: true,
            approved,
            canApprove: true,
            blocked: false,
            blockers: [],
          },
        });
      if (path === `instances/${instance}/upgrades`)
        return r.fulfill({ json: context });
      throw Error(`Unexpected GET ${path}`);
    }
    expect(request.headers()["x-lzc-tenant"]).toBe(tenant);
    expect(request.headers()["x-lzc-csrf"]).toBe("upgrade-csrf");
    const body = request.postDataJSON();
    mutations.push({ path, body });
    if (path === "platform-upgrades")
      return r.fulfill({ json: { id: edge, ...body } });
    if (path === "template-upgrades")
      return r.fulfill({ json: { id: edge, ...body } });
    if (path === `jobs/${family}/upgrade-approval`) {
      approved = true;
      return r.fulfill({ json: { approved: true } });
    }
    if (path === `instances/${instance}/platform-upgrades/preview`)
      return r.fulfill({
        json: {
          assessment: assessment({ secretsmanager_enabled: false }),
          target: platformDoc(nextPlatform),
          parameters: {},
        },
      });
    if (path === `instances/${instance}/platform-upgrades`) {
      expect(body).toEqual({
        edgeId: edge,
        expectedBindingId: null,
        expectedVersionId: old,
        confirmUpgrade: true,
      });
      context.candidate = {
        id: edge,
        candidateHash: "a".repeat(64),
        kind: "platform",
        edgeId: null,
        platformEdgeId: edge,
        versionId: old,
        platformRevision: nextPlatform,
        parameters: {},
        sourceRevision: "08ac257de1548c8ec5e83dae1a79373711c3d644",
        sensitivePolicy: "approval-required",
        createdAt: "2026-10-29T00:00:00.000Z",
      };
      return r.fulfill({ json: context });
    }
    expect(body.edgeId).toBe(edge);
    expect(body.expectedBindingId).toBeNull();
    expect(body.expectedVersionId).toBe(old);
    if (path === `instances/${instance}/upgrades/preview`)
      return r.fulfill({
        json: {
          assessment: assessment(body.parameters),
          target: version(target, 2),
          parameters: body.parameters,
        },
      });
    expect(path).toBe(`instances/${instance}/upgrades`);
    expect(body.confirmUpgrade).toBe(true);
    if (stale)
      return r.fulfill({
        status: 409,
        json: { error: "application_upgrade_binding_changed" },
      });
    context.bindingId = edge;
    context.effectiveVersionId = target;
    context.current = version(target, 2);
    context.candidate = {
      id: edge,
      candidateHash: "a".repeat(64),
      edgeId: edge,
      versionId: target,
      platformRevision: platform,
      parameters: body.parameters,
      sourceRevision: "08ac257de1548c8ec5e83dae1a79373711c3d644",
      sensitivePolicy: "approval-required",
      createdAt: "2026-10-29T00:00:00.000Z",
    };
    return r.fulfill({ json: context });
  });
  await page.goto("/applications");
  await page.getByRole("tab", { name: "Bestellungen", exact: true }).click();
  await page
    .getByRole("button", { name: /Details anzeigen: Existing upgrade order/ })
    .click();
  await page
    .getByRole("region", { name: "Bestelldetails", exact: true })
    .getByRole("tab", { name: "Updates", exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "Template- und Plattform-Updates",
    exact: true,
  });
  await expect(panel).toBeVisible();
  if (!unbound && !noPath)
    await panel.getByLabel("Freigegebene Zielversion").selectOption(edge);
  return { panel, mutations };
}

test("existing order previews new answers and selects desired snapshot without Plan or Apply", async ({
  page,
}) => {
  const { panel, mutations } = await setup(page);
  await panel
    .getByRole("button", { name: "Upgrade prüfen", exact: true })
    .click();
  await expect(
    panel.getByText("Upgrade blockiert", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("checkbox", { name: confirmation }),
  ).toBeDisabled();
  await panel
    .locator(`select[id$="secretsmanager_enabled"]`)
    .selectOption("false");
  await panel
    .getByRole("button", { name: "Upgrade prüfen", exact: true })
    .click();
  await expect(
    panel.getByText("Sensitives Upgrade", { exact: true }),
  ).toBeVisible();
  await panel.getByRole("checkbox", { name: confirmation }).check();
  await panel
    .getByRole("button", { name: "Gewünschten Upgrade-Stand übernehmen" })
    .click();
  await expect(
    panel.getByText(/Der gewünschte Upgrade-Stand ist gespeichert/),
  ).toBeVisible();
  await expect(
    panel
      .locator("dd")
      .filter({ has: page.locator(`abbr[title="${target}"]`) }),
  ).toHaveCount(1);
  await expect(panel.locator(`abbr[title="${old}"]`)).toHaveCount(2);
  expect(mutations.map((m) => m.path)).toEqual([
    `instances/${instance}/upgrades/preview`,
    `instances/${instance}/upgrades/preview`,
    `instances/${instance}/upgrades`,
  ]);
  await page.reload();
  await page.getByRole("tab", { name: "Bestellungen", exact: true }).click();
  await page
    .getByRole("button", { name: /Details anzeigen: Existing upgrade order/ })
    .click();
  await page
    .getByRole("region", { name: "Bestelldetails", exact: true })
    .getByRole("tab", { name: "Updates", exact: true })
    .click();
  await expect(page.locator(`abbr[title="${target}"]`)).toHaveCount(1);
  expect(mutations).toHaveLength(3);
});
test("blocked component removal cannot be confirmed", async ({ page }) => {
  const { panel, mutations } = await setup(page, true);
  await panel
    .locator(`select[id$="secretsmanager_enabled"]`)
    .selectOption("false");
  await panel
    .getByRole("button", { name: "Upgrade prüfen", exact: true })
    .click();
  await expect(
    panel.getByText(/bestehende Komponente entfernen/),
  ).toBeVisible();
  await expect(
    panel.getByRole("checkbox", { name: confirmation }),
  ).toBeDisabled();
  await expect(
    panel.getByRole("button", { name: "Gewünschten Upgrade-Stand übernehmen" }),
  ).toBeDisabled();
  expect(mutations).toHaveLength(1);
});
test("concurrent desired binding change preserves order and requires refresh", async ({
  page,
}) => {
  const { panel, mutations } = await setup(page, false, true);
  await panel
    .locator(`select[id$="secretsmanager_enabled"]`)
    .selectOption("false");
  await panel
    .getByRole("button", { name: "Upgrade prüfen", exact: true })
    .click();
  await panel.getByRole("checkbox", { name: confirmation }).check();
  await panel
    .getByRole("button", { name: "Gewünschten Upgrade-Stand übernehmen" })
    .click();
  await expect(panel.getByRole("alert")).toContainText(
    "Bestellung und State bleiben erhalten",
  );
  await expect(panel.locator(`abbr[title="${target}"]`)).toHaveCount(0);
  expect(mutations).toHaveLength(2);
});

test("Platform Owner publishes only same-family upgrade path without changing an order", async ({
  page,
}) => {
  const { mutations } = await setup(page, false, false, true);
  await page
    .getByRole("tab", { name: "Veröffentlichung", exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "Upgrade-Pfade veröffentlichen",
    exact: true,
  });
  await panel.getByLabel("Ausgangsversion für das Upgrade").selectOption(old);
  const targetSelect = panel.getByLabel(
    "Neue Version derselben Template-Familie",
  );
  await expect(targetSelect.locator("option")).toHaveCount(2);
  await expect(targetSelect).not.toContainText("Other family");
  await targetSelect.selectOption(target);
  await expect(
    panel.getByRole("button", {
      name: "Upgrade-Pfad veröffentlichen",
      exact: true,
    }),
  ).toBeDisabled();
  await panel
    .getByRole("checkbox", { name: /Ich veröffentliche nur den Upgrade-Pfad/ })
    .check();
  await panel
    .getByRole("button", { name: "Upgrade-Pfad veröffentlichen", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText(
    "Bestehende Bestellungen bleiben unverändert",
  );
  expect(mutations).toEqual([
    {
      path: "template-upgrades",
      body: {
        fromVersionId: old,
        toVersionId: target,
        policy: { sensitive: "approval-required" },
        confirmPublication: true,
      },
    },
  ]);
});

test("Platform Owner separately approves only the actual saved upgrade Plan without Apply", async ({
  page,
}) => {
  const { mutations } = await setup(page, false, false, true, true);
  await page
    .getByRole("region", { name: "Bestelldetails", exact: true })
    .getByRole("tab", { name: "Plan", exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "Upgrade-Plan separat freigeben",
    exact: true,
  });
  await expect(panel).toBeVisible();
  const button = panel.getByRole("button", {
    name: "Diesen Upgrade-Plan freigeben",
    exact: true,
  });
  await expect(button).toBeDisabled();
  await panel.getByRole("checkbox").check();
  await button.click();
  await expect(panel.getByRole("status")).toContainText(
    "bereits separat freigegeben",
  );
  expect(mutations).toEqual([
    {
      path: `jobs/${family}/upgrade-approval`,
      body: { artifactSha256: "a".repeat(64), confirmApproval: true },
    },
  ]);
});

test("platform-only upgrade keeps template and existing State with separate preview and desired selection", async ({
  page,
}) => {
  const { mutations } = await setup(page, false, false, false, false, true);
  const panel = page.getByRole("region", {
    name: "Plattformvertrag derselben Bestellung aktualisieren",
    exact: true,
  });
  await panel
    .getByLabel("Freigegebener Ziel-Plattformvertrag")
    .selectOption(edge);
  await panel
    .getByRole("button", { name: "Plattform-Upgrade prüfen", exact: true })
    .click();
  await expect(
    panel.getByText("Sensitives Upgrade", { exact: true }),
  ).toBeVisible();
  await panel.getByRole("checkbox").check();
  await panel
    .getByRole("button", { name: "Gewünschten Plattformstand übernehmen" })
    .click();
  await expect(panel.getByRole("status")).toContainText(
    "kein Plan oder Apply gestartet",
  );
  expect(mutations.map((item) => item.path)).toEqual([
    `instances/${instance}/platform-upgrades/preview`,
    `instances/${instance}/platform-upgrades`,
  ]);
  expect(mutations[0]?.body).toEqual({
    edgeId: edge,
    expectedBindingId: null,
    expectedVersionId: old,
  });
  await expect(page.locator(`abbr[title="${old}"]`)).toHaveCount(3);
});
test("Platform Owner publishes a path between actual approved platform contracts without execution", async ({
  page,
}) => {
  const { mutations } = await setup(page, false, false, true);
  await page
    .getByRole("tab", { name: "Veröffentlichung", exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "Plattform-Upgrade-Pfade veröffentlichen",
    exact: true,
  });
  await panel.getByLabel("Ausgangs-Plattformvertrag").selectOption(platform);
  await panel
    .getByLabel("Ziel-Plattformvertrag", { exact: true })
    .selectOption("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
  await panel
    .getByRole("checkbox", {
      name: /Ich veröffentliche nur den Plattform-Upgrade-Pfad/,
    })
    .check();
  await panel
    .getByRole("button", {
      name: "Plattform-Upgrade-Pfad veröffentlichen",
      exact: true,
    })
    .click();
  await expect(panel.getByRole("status")).toContainText(
    "Bestehende Bestellungen bleiben unverändert",
  );
  expect(mutations).toEqual([
    {
      path: "platform-upgrades",
      body: {
        fromPlatformRevision: platform,
        toPlatformRevision: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        policy: { sensitive: "approval-required" },
        confirmPublication: true,
      },
    },
  ]);
});

test("late preview from previous workspace cannot restore upgrade confirmation", async ({
  page,
}) => {
  const { panel, mutations } = await setup(page);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  await page.route(
    `**/api/v1/applications/instances/${instance}/upgrades/preview`,
    async (route) => {
      started = true;
      await gate;
      await route
        .fulfill({
          json: {
            assessment: {
              classification: "ordinary",
              approvalPolicy: "direct",
              reasons: [],
              retainedParameters: {},
              requiredParameters: [],
              requiresFreshPlan: true,
              applyAllowed: false,
            },
            target: version(target, 2),
            parameters: { secretsmanager_enabled: false },
          },
        })
        .catch(() => {});
    },
  );
  await panel
    .locator('select[id$="secretsmanager_enabled"]')
    .selectOption("false");
  await panel
    .getByRole("button", { name: "Upgrade prüfen", exact: true })
    .click();
  await expect.poll(() => started).toBe(true);
  const other = {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    name: "Other workspace",
    kind: "organisation",
    organizationId: user,
    roles: ["application-owner"],
    manageMembers: false,
  };
  await page.route("**/api/v1/session", (route) =>
    route.fulfill({
      json: {
        user: { id: user, login: "owner@example.test" },
        tenant: other,
        csrfToken: "other-csrf",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    }),
  );
  await page.route("**/api/v1/applications/instances", (route) =>
    route.fulfill({ json: { instances: [], upgradesEnabled: true } }),
  );
  await page.evaluate(() => {
    const channel = new BroadcastChannel("lzc-auth-session");
    channel.postMessage("changed");
    channel.close();
  });
  await expect(
    page.getByRole("region", { name: "Bestelldetails", exact: true }),
  ).toHaveCount(0);
  release();
  await expect(
    page.getByRole("button", { name: "Gewünschten Upgrade-Stand übernehmen" }),
  ).toHaveCount(0);
  expect(mutations).toEqual([]);
});

test("blocked platform target has no confirmation override", async ({
  page,
}) => {
  const { mutations } = await setup(page, true, false, false, false, true);
  const panel = page.getByRole("region", {
    name: "Plattformvertrag derselben Bestellung aktualisieren",
    exact: true,
  });
  await panel
    .getByLabel("Freigegebener Ziel-Plattformvertrag")
    .selectOption(edge);
  await panel
    .getByRole("button", { name: "Plattform-Upgrade prüfen", exact: true })
    .click();
  await expect(
    panel.getByText("Upgrade blockiert", { exact: true }),
  ).toBeVisible();
  await expect(panel.getByRole("checkbox")).toBeDisabled();
  await expect(
    panel.getByRole("button", {
      name: "Gewünschten Plattformstand übernehmen",
    }),
  ).toBeDisabled();
  expect(mutations.map((item) => item.path)).toEqual([
    `instances/${instance}/platform-upgrades/preview`,
  ]);
});

test("a different desired template binding clears an already confirmed platform preview", async ({
  page,
}) => {
  const { panel, mutations } = await setup(
    page,
    false,
    false,
    false,
    false,
    true,
  );
  const platformPanel = page.getByRole("region", {
    name: "Plattformvertrag derselben Bestellung aktualisieren",
    exact: true,
  });
  await platformPanel
    .getByLabel("Freigegebener Ziel-Plattformvertrag")
    .selectOption(edge);
  await platformPanel
    .getByRole("button", { name: "Plattform-Upgrade prüfen", exact: true })
    .click();
  await platformPanel.getByRole("checkbox").check();
  await expect(
    platformPanel.getByRole("button", {
      name: "Gewünschten Plattformstand übernehmen",
    }),
  ).toBeEnabled();
  await panel
    .locator('select[id$="secretsmanager_enabled"]')
    .selectOption("false");
  await panel
    .getByRole("button", { name: "Upgrade prüfen", exact: true })
    .click();
  await panel.getByRole("checkbox", { name: confirmation }).check();
  await panel
    .getByRole("button", { name: "Gewünschten Upgrade-Stand übernehmen" })
    .click();
  await expect(
    panel.getByText(/Der gewünschte Upgrade-Stand ist gespeichert/),
  ).toBeVisible();
  await expect(platformPanel.getByRole("checkbox")).toHaveCount(0);
  await expect(
    platformPanel.getByLabel("Freigegebener Ziel-Plattformvertrag"),
  ).toHaveValue("");
  await expect(
    platformPanel.getByRole("button", {
      name: "Gewünschten Plattformstand übernehmen",
    }),
  ).toHaveCount(0);
  expect(mutations.map((item) => item.path)).toEqual([
    `instances/${instance}/platform-upgrades/preview`,
    `instances/${instance}/upgrades/preview`,
    `instances/${instance}/upgrades`,
  ]);
});

test("unbound legacy order keeps history visible and blocks upgrade actions without a schema error", async ({
  page,
}) => {
  const { panel, mutations } = await setup(
    page,
    false,
    false,
    false,
    false,
    false,
    true,
  );
  await expect(
    panel.getByText(
      /Diese ältere Bestellung ist an keinen Plattformvertrag gebunden/,
    ),
  ).toBeVisible();
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await expect(panel.getByLabel("Freigegebene Zielversion")).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: /übernehmen|prüfen/ }),
  ).toHaveCount(0);
  await page
    .getByRole("region", { name: "Bestelldetails", exact: true })
    .getByRole("tab", { name: "Verlauf", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Application-Plan", exact: true }),
  ).toBeVisible();
  expect(mutations).toEqual([]);
});

test("updates explain a missing path with named versions and hide technical identifiers", async ({
  page,
}, testInfo) => {
  const { panel, mutations } = await setup(
    page,
    false,
    false,
    false,
    false,
    false,
    false,
    true,
  );
  await expect(panel.getByText("Public · Version 1").first()).toBeVisible();
  await expect(
    panel.getByText("Keine passende Freigabe vorhanden").first(),
  ).toBeVisible();
  await expect(
    panel.getByText(
      /Ein Plattform-Upgrade-Pfad oder ein Pfad ab einer anderen Version reicht/,
    ),
  ).toBeVisible();
  await expect(panel.getByLabel("Freigegebene Zielversion")).toHaveCount(0);
  await expect(panel.locator(`abbr[title="${old}"]`).first()).toBeHidden();
  await panel
    .getByText("Technische Details zu Versionen und Plattform", { exact: true })
    .click();
  await expect(panel.locator(`abbr[title="${old}"]`).first()).toBeVisible();
  await panel
    .getByText("Technische Details zu Versionen und Plattform", { exact: true })
    .click();
  expect(mutations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("updates.png"),
    fullPage: true,
  });
});
