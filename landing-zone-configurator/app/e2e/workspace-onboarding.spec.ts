import { expect, test } from "./fixtures";

test.use({ locale: "en-US" });
test("a new account chooses a normal workspace, without an implicit personal workspace or private API reads", async ({
  page,
}) => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const tenantId = "22222222-2222-4222-8222-222222222222";
  const organizationId = "33333333-3333-4333-8333-333333333333";
  let created = false;
  let selected = false;
  const unexpected: string[] = [];
  await page.route("**/auth/status", (route) =>
    route.fulfill({
      json: { stackit: true, github: false, primary: "stackit" },
    }),
  );
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const tenant = {
      id: tenantId,
      name: "Platform team",
      kind: "organisation",
      organizationId,
      organizationVerified: false,
      roles: ["platform-engineer"],
      manageMembers: true,
    };
    if (path === "/api/v1/session")
      return route.fulfill({
        json: {
          user: { id: userId, login: "owner@example.test" },
          ...(selected ? { tenant } : { workspaceRequired: true }),
          csrfToken: "csrf-workspace",
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
      });
    if (path === "/api/v1/organisation" && method === "GET")
      return route.fulfill({
        json: {
          userId,
          activeTenantId: selected ? tenantId : null,
          tenants: created ? [tenant] : [],
          members: [],
        },
      });
    if (path === "/api/v1/organisation" && method === "POST") {
      expect(route.request().postDataJSON()).toEqual({
        name: "Platform team",
        organizationId,
      });
      created = true;
      return route.fulfill({ status: 201, json: { id: tenantId } });
    }
    if (path === "/api/v1/organisation/switch") {
      expect(created).toBe(true);
      expect(route.request().postDataJSON()).toEqual({ tenantId });
      selected = true;
      return route.fulfill({ json: { switched: true } });
    }
    if (!selected) unexpected.push(path);
    return route.fulfill({
      status: 401,
      json: { error: "authentication_required" },
    });
  });
  await page.goto("/configurations");
  await expect(
    page.getByText(
      "Create a workspace or open an invitation to start working together.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Persönlicher Arbeitsbereich", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Personal workspace", { exact: true }),
  ).toHaveCount(0);
  expect(unexpected).toEqual([]);
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Workspace name", exact: true })
    .fill("Platform team");
  await page
    .getByRole("textbox", { name: "STACKIT organization ID", exact: true })
    .fill(organizationId);
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .last()
    .click();
  await expect(page.locator(".workspace-switch")).toContainText(
    "Platform team",
  );
  expect(selected).toBe(true);
  expect(unexpected).toEqual([]);
});
