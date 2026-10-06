import {
  createEditorConfiguration,
  publishedProjectTemplateSchema,
} from "@lzc/domain";
import { expect, test } from "@playwright/test";

const userId = "11111111-1111-4111-8111-111111111111";
const tenantId = "22222222-2222-4222-8222-222222222222";
const organisationId = "33333333-3333-4333-8333-333333333333";

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
    .getByRole("button", { name: "Mitglieder & Einstellungen", exact: true })
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

for (const publishing of [true, false]) {
  test(`application catalogue ${publishing ? "immutable publication" : "owner order without fork"}`, async ({
    page,
  }, testInfo) => {
    const versionId = "44444444-4444-4444-8444-444444444444";
    const nextVersionId = "55555555-5555-4555-8555-555555555555";
    const instanceId = "66666666-6666-4666-8666-666666666666";
    const platformRevision = "77777777-7777-4777-8777-777777777777";
    const credentialProfileId = "99999999-9999-4999-8999-999999999999";
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
    await page.route("**/api/v1/applications/**", async (route) => {
      const request = route.request();
      expect(request.headers()["x-lzc-tenant"]).toBe(tenantId);
      const templates = new URL(request.url()).pathname.endsWith("/templates");
      const platforms = new URL(request.url()).pathname.endsWith(
        "/platform-contracts",
      );
      const pathname = new URL(request.url()).pathname;
      if (request.method() === "GET" && pathname.endsWith("/groups"))
        return route.fulfill({
          json: {
            groups,
            members: publishing
              ? [
                  {
                    userId: applicationOwnerId,
                    login: "application-owner",
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
                }
              : { instances },
        });
      expect(request.headers()["x-lzc-csrf"]).toBe("test-csrf");
      const body = request.postDataJSON();
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
          memberIds: [applicationOwnerId],
          confirmMembershipChange: true,
        });
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
          "deploymentPolicy",
          "allowedGroupIds",
          ...(body.platformRevision ? ["platformRevision", "targetKey"] : []),
        ]);
        if (body.platformRevision)
          expect(body).toMatchObject({ platformRevision, targetKey: "public" });
        expect(body.template.settings.network_enabled).toBe(true);
        expect(body.allowedGroupIds).toEqual([defaultGroupId]);
        expect(body.deploymentPolicy).toBe(
          versions.length ? "direct" : "approval-required",
        );
        const published = {
          ...initialVersion,
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
          name: "5 Application Landing Zone Templates",
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
        .getByLabel("Application Landing Zone Template aus meinem Entwurf", {
          exact: true,
        })
        .selectOption({ index: 1 });
      await page
        .getByLabel("Freigegebener Plattformvertrag", { exact: true })
        .selectOption(platformRevision);
      await expect(
        page.getByRole("button", {
          name: "Version veröffentlichen",
          exact: true,
        }),
      ).toBeDisabled();
      await page
        .getByLabel("Plattformziel", { exact: true })
        .selectOption("public");
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
          name: "5 Application Landing Zone Templates",
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
      const membership = page.getByRole("group", {
        name: "Application Owner",
        exact: true,
      });
      await page
        .getByLabel("Gruppe", { exact: true })
        .selectOption(defaultGroupId);
      await expect(
        membership.getByLabel("application-owner", { exact: true }),
      ).toBeChecked();
      await expect(
        membership.getByLabel("application-owner", { exact: true }),
      ).toBeDisabled();
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
      await membership.getByLabel("application-owner", { exact: true }).check();
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
    await page.getByRole("button", { name: "Bestellen", exact: true }).click();
    await expect.poll(() => orderKeys.length).toBe(2);
    expect(orderKeys[0]).toBe(orderKeys[1]);
    expect(instances).toHaveLength(1);
    await page.reload();
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
for (const ownerProof of [true, false]) {
  test(`explicit human organization binding ${ownerProof ? "owner" : "read-only"}`, async ({
    page,
  }, testInfo) => {
    let checked = false;
    let bound = false;
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
              verificationUri:
                "https://accounts.stackit.cloud/device?user_code=ABCD-1234",
              userCode: "ABCD-1234",
              expiresAt: new Date(Date.now() + 300000).toISOString(),
              retryAfterMs: 1000,
            },
          });
        }
        if (path.endsWith("/poll")) {
          expect(request.postDataJSON()).toEqual({});
          checked = true;
          return route.fulfill({ json: { status: "verified" } });
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
            boundAt: new Date().toISOString(),
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
      .getByRole("button", { name: "Mitglieder & Einstellungen", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Nachweis prüfen", exact: true }),
    ).toBeEnabled();
    expect(mutations).toEqual([]);
    await page.getByLabel("Sprache", { exact: true }).selectOption("en");
    expect(mutations).toEqual([]);
    await page
      .getByRole("button", { name: "Check proof", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Open STACKIT", exact: true }),
    ).toHaveAttribute(
      "href",
      "https://accounts.stackit.cloud/device?user_code=ABCD-1234",
    );
    await expect(page.getByText("ABCD-1234", { exact: true })).toBeVisible();
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
      page.getByRole("heading", {
        name: "STACKIT-Organisationsnachweis",
        exact: true,
      }),
    ).toHaveCount(0);
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
      .getByRole("button", { name: "Mitglieder & Einstellungen", exact: true })
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
          name: "Mitglieder & Einstellungen",
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
