import { expect, test } from "./fixtures";

test.use({ locale: "en-US" });
for (const result of ["success", "not-empty", "unavailable"] as const) {
  test(`workspace deletion sends no empty JSON body and reports ${result} clearly`, async ({
    page,
  }) => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const tenantId = "22222222-2222-4222-8222-222222222222";
    const tenant = {
      id: tenantId,
      name: "Workspace",
      kind: "organisation",
      organizationId: null,
      organizationVerified: false,
      roles: ["platform-engineer"],
      manageMembers: true,
      canArchive: true,
    };
    let deleted = false;
    let deletes = 0;
    await page.route("**/auth/status", (route) =>
      route.fulfill({
        json: { stackit: true, primary: "stackit", github: false },
      }),
    );
    await page.route("**/api/v1/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/v1/session")
        return route.fulfill({
          json: {
            user: { id: userId, login: "owner@example.test" },
            tenant,
            csrfToken: "c".repeat(43),
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
          },
        });
      if (path === "/api/v1/organisation")
        return route.fulfill({
          json: {
            userId,
            activeTenantId: deleted ? null : tenantId,
            tenants: deleted ? [] : [tenant],
            members: [],
          },
        });
      if (path === `/api/v1/organisation/workspaces/${tenantId}`) {
        expect(route.request().method()).toBe("DELETE");
        expect(route.request().headers()["content-type"]).toBeUndefined();
        expect(route.request().postData()).toBeNull();
        expect(route.request().headers()["x-lzc-csrf"]).toBe("c".repeat(43));
        expect(route.request().headers()["x-lzc-tenant"]).toBe(tenantId);
        deletes++;
        if (result === "not-empty")
          return route.fulfill({
            status: 409,
            json: { error: "organisation_not_empty_draft" },
          });
        if (result === "unavailable")
          return route.fulfill({
            status: 503,
            json: { error: "organisation_operation_failed" },
          });
        deleted = true;
        return route.fulfill({ json: { archived: true } });
      }
      return route.fulfill({
        status: 401,
        json: { error: "authentication_required" },
      });
    });
    await page.goto("/workspaces");
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Delete workspace", exact: true })
      .click();
    if (result === "success")
      await expect(
        page.getByRole("heading", {
          level: 3,
          name: "Workspace · Active",
          exact: true,
        }),
      ).toHaveCount(0);
    else {
      await expect(page.getByRole("alert")).toContainText(
        result === "not-empty"
          ? "Only empty"
          : "The change could not be saved. Please try again later.",
      );
      await expect(page.getByRole("alert")).not.toContainText(
        "at least one member",
      );
      await expect(
        page.getByRole("button", { name: "Delete workspace", exact: true }),
      ).toBeVisible();
    }
    expect(deletes).toBe(1);
  });
}
