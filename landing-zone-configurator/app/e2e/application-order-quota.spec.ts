import { expect, test } from "./fixtures";

for (const manage of [true, false]) {
  test(`workspace order quota ${manage ? "management" : "requester visibility"} preserves cloud boundaries`, async ({
    page,
  }) => {
    const tenantId = "22222222-2222-4222-8222-222222222222";
    const userId = "11111111-1111-4111-8111-111111111111";
    const tenant = {
      id: tenantId,
      name: "Quota workspace",
      kind: "organisation",
      organizationId: "33333333-3333-4333-8333-333333333333",
      organizationVerified: true,
      roles: [manage ? "platform-engineer" : "application-owner"],
      manageMembers: manage,
    };
    let quota = {
      maxReservedOrders: null as number | null,
      reservedOrders: 3,
      revision: 0,
    };
    const mutations: unknown[] = [];
    await page.route("**/auth/status", (route) =>
      route.fulfill({
        json: { stackit: true, github: false, primary: "stackit" },
      }),
    );
    await page.route("**/api/v1/session", (route) =>
      route.fulfill({
        json: {
          user: { id: userId, login: "quota@example.test" },
          tenant,
          csrfToken: "csrf-quota",
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
    await page.route("**/auth/stackit/status", (route) =>
      route.fulfill({ json: { identity: null } }),
    );
    await page.route("**/api/v1/applications/**", async (route) => {
      const path = new URL(route.request().url()).pathname.replace(
        "/api/v1/applications/",
        "",
      );
      if (route.request().method() === "GET") {
        if (path === "templates")
          return route.fulfill({ json: { versions: [], orderQuota: quota } });
        if (path === "instances")
          return route.fulfill({ json: { instances: [] } });
        if (path === "platform-contracts")
          return route.fulfill({ json: { contracts: [] } });
      }
      expect(path).toBe("order-quota");
      expect(manage).toBe(true);
      expect(route.request().headers()["x-lzc-tenant"]).toBe(tenantId);
      expect(route.request().headers()["x-lzc-csrf"]).toBe("csrf-quota");
      const input = route.request().postDataJSON();
      mutations.push(input);
      expect(input).toEqual({
        maxReservedOrders: 0,
        expectedRevision: 0,
        confirmQuota: true,
      });
      quota = { maxReservedOrders: 0, reservedOrders: 3, revision: 1 };
      return route.fulfill({ json: quota });
    });
    await page.goto("/applications");
    const region = page.getByRole("region", {
      name: "Bestellkontingent",
      exact: true,
    });
    await expect(region).toBeVisible();
    await expect(region).toContainText(
      "Reservierte Bestellungen: 3 · Grenze: Unbegrenzt",
    );
    await expect(region).toContainText(
      "nicht für einzelne Benutzer oder Cloud-Ressourcen",
    );
    if (manage) {
      await region
        .getByText("Bestellkontingent verwalten", { exact: true })
        .click();
      const save = region.getByRole("button", {
        name: "Bestellkontingent speichern",
        exact: true,
      });
      await expect(save).toBeDisabled();
      await region
        .getByRole("checkbox", { name: "Unbegrenzte Bestellungen erlauben" })
        .uncheck();
      const input = region.getByRole("spinbutton");
      await input.fill("0");
      await region
        .getByRole("checkbox", {
          name: "Dieses Kontingent für neue Bestellungen bestätigen",
        })
        .check();
      await save.click();
      await expect(region).toContainText(
        "Reservierte Bestellungen: 3 · Grenze: 0",
      );
      await page.reload();
      await expect(
        page.getByRole("region", { name: "Bestellkontingent", exact: true }),
      ).toContainText("Reservierte Bestellungen: 3 · Grenze: 0");
      expect(mutations).toHaveLength(1);
    } else {
      await expect(
        region.getByText("Bestellkontingent verwalten", { exact: true }),
      ).toHaveCount(0);
      expect(mutations).toEqual([]);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
