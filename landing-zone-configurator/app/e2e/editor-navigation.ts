import { expect, type Page } from "./fixtures";

export async function openTemplateDrafts(page: Page) {
  await page
    .getByRole("navigation", { name: "Hauptnavigation", exact: true })
    .getByRole("button", { name: "Application Landing Zones", exact: true })
    .click();
  const tab = page.getByRole("tab", { name: "Template-Entwürfe", exact: true });
  if (await tab.count()) await tab.click();
  await expect(page.locator(".template-overview")).toBeVisible();
}

export async function openConfigurationStep(page: Page, title: string) {
  if (
    !(await page
      .getByRole("navigation", { name: "Konfigurationsschritte", exact: true })
      .isVisible())
  )
    await page
      .getByRole("navigation", { name: "Hauptnavigation", exact: true })
      .getByRole("button", { name: "Konfigurationen", exact: true })
      .click();
  await page
    .getByRole("navigation", { name: "Konfigurationsschritte", exact: true })
    .getByRole("button")
    .filter({ hasText: title })
    .click();
}

export async function mockEmptyApplicationLists(page: Page) {
  for (const [path, body] of Object.entries({
    templates: { versions: [] },
    instances: { instances: [] },
    "platform-contracts": { contracts: [] },
  }))
    await page.route(`**/api/v1/applications/${path}`, (route) => {
      expect(route.request().method()).toBe("GET");
      return route.fulfill({ json: body });
    });
}
