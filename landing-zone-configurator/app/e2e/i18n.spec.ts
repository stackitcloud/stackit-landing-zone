import { catalogue, createDraft, type Template } from "@lzc/domain";
import { expect, test } from "./fixtures";

test.use({ locale: "en-US" });

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/**", (route) =>
    route.fulfill({ status: 401, json: { error: "unauthenticated" } }),
  );
  await page.route("**/auth/status", (route) =>
    route.fulfill({ json: { github: false, stackit: false } }),
  );
});

for (const [browserLanguage, expectedLanguage, heading] of [
  ["en-US", "en", "Workspaces"],
  ["de-CH", "de", "Arbeitsbereiche"],
  ["fr-FR", "en", "Workspaces"],
] as const) {
  test(`selects ${expectedLanguage} for browser language ${browserLanguage}`, async ({
    page,
  }) => {
    await page.addInitScript(
      (language) =>
        Object.defineProperty(navigator, "languages", { value: [language] }),
      browserLanguage,
    );
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: heading, level: 1 }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(
      "lang",
      expectedLanguage,
    );
    await expect(page.locator(".language-switch")).toHaveValue(
      expectedLanguage,
    );
  });
}

test("explicit language persists across reload and preserves the open draft", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/templates");
  await expect(
    page.getByRole("heading", { name: "New configuration", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Hub & Spoke with firewall/ }),
  ).toBeVisible();
  const template = catalogue.templates.find(
    (item) => item.id === "standalone",
  ) as Template;
  await page.evaluate(
    ({ draft, sha256 }) =>
      sessionStorage.setItem(
        "lzc-oauth-draft",
        JSON.stringify({ draft, sha256, expires: Date.now() + 600000 }),
      ),
    { draft: createDraft(template), sha256: template.sha256 },
  );
  await page.goto("/configurations/edit/basics");
  await page
    .getByRole("textbox", { name: "Configuration name", exact: true })
    .fill("Vorbereitung");
  await page
    .getByRole("textbox", { name: "Organization / company", exact: true })
    .fill("English · unverändert");
  const route = page.url();
  await page
    .getByRole("combobox", { name: "Language", exact: true })
    .selectOption("de");
  await expect(
    page.getByRole("textbox", { name: "Name der Konfiguration", exact: true }),
  ).toHaveValue("Vorbereitung");
  await expect(
    page.getByRole("textbox", {
      name: "Organisation / Unternehmen",
      exact: true,
    }),
  ).toHaveValue("English · unverändert");
  expect(page.url()).toBe(route);
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await page
    .getByRole("combobox", { name: "Sprache", exact: true })
    .selectOption("en");
  await expect(
    page.getByRole("heading", { name: "Vorbereitung", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Configuration name", exact: true }),
  ).toHaveValue("Vorbereitung");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("english-editor.png"),
    fullPage: true,
  });
  await page
    .getByRole("combobox", { name: "Language", exact: true })
    .selectOption("de");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.locator(".language-switch")).toHaveValue("de");
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Arbeitsbereiche", level: 1 }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
