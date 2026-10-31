import { expect, type Page } from "./fixtures";

export async function openTemplateDrafts(page: Page) {
  await page
    .getByRole("navigation", { name: "Hauptnavigation", exact: true })
    .getByRole("button", { name: "Application Landing Zones", exact: true })
    .click();
  await expect(page).toHaveURL(/\/applications$/);
  const tab = page.getByRole("tab", { name: "Template-Entwürfe", exact: true });
  // Authenticated tabs arrive asynchronously; guests can see the editor directly.
  await expect
    .poll(
      async () =>
        (await tab.isVisible()) ||
        (await page.locator(".template-overview").isVisible()),
    )
    .toBe(true);
  if (await tab.isVisible()) {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
  }
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
