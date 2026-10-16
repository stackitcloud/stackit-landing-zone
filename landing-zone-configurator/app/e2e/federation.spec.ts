import { expect, test } from "./fixtures";

test("CI federation stays optional and creates exact GitHub trust conditions", async ({
  page,
}, testInfo) => {
  await page.route("**/auth/status", (r) =>
    r.fulfill({ json: { github: false } }),
  );
  await page.route("**/api/v1/session", (r) =>
    r.fulfill({ status: 401, json: {} }),
  );
  await page.goto("/templates/standalone");
  await page
    .getByRole("button", { name: "Konfiguration erstellen", exact: true })
    .click();
  await page.getByRole("button", { name: "6 Betrieb", exact: true }).click();
  await expect(
    page.getByRole("region", {
      name: "Service-Account-Föderation",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Komponente hinzufügen", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Hinzufügen: Service-Account-Föderation für CI/CD",
      exact: true,
    })
    .click();
  const editor = page.getByRole("region", {
    name: "Service-Account-Föderation",
    exact: true,
  });
  await expect(editor).toContainText("nicht die Anmeldung von Menschen");
  await expect(
    editor.getByRole("region", { name: "Vertrauensregel 1", exact: true }),
  ).toHaveCount(0);
  await editor
    .getByText("GitHub-Actions-Zugang hinzufügen", { exact: true })
    .click();
  await editor
    .getByLabel("GitHub-Repository", { exact: true })
    .fill("example/platform");
  await editor
    .getByRole("button", {
      name: "GitHub-Vertrauensregel übernehmen",
      exact: true,
    })
    .click();
  const rule = editor.getByRole("region", {
    name: "Vertrauensregel 1",
    exact: true,
  });
  await expect(rule.getByLabel("Token-Aussteller (Issuer-URL)")).toHaveValue(
    "https://token.actions.githubusercontent.com",
  );
  await expect(rule.getByLabel("Erwarteter Wert").nth(0)).toHaveValue(
    "sts.accounts.stackit.cloud",
  );
  await expect(rule.getByLabel("Erwarteter Wert").nth(1)).toHaveValue(
    "repo:example/platform:ref:refs/heads/main",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("federation.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "1 Grundlagen", exact: true }).click();
  await page.getByRole("button", { name: "6 Betrieb", exact: true }).click();
  await expect(rule.getByLabel("Erwarteter Wert").nth(1)).toHaveValue(
    "repo:example/platform:ref:refs/heads/main",
  );
});
