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
