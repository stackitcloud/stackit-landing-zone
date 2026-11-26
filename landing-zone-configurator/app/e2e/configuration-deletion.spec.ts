import { createEditorConfiguration } from "@lzc/domain";
import { expect, test } from "./fixtures";

test.use({ locale: "en-US" });
for (const outcome of ["delete", "deployed", "changed-after-read"] as const) {
  test(`saved configuration deletion handles ${outcome} without destroying the current draft`, async ({
    page,
  }) => {
    const configuration = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Training configuration",
      revision: 3,
      updatedAt: new Date().toISOString(),
      canDelete: outcome !== "deployed",
      deletionBlocker: outcome === "deployed" ? "instance_exists" : null,
      draft: {
        ...createEditorConfiguration(
          "standalone",
          "22222222-2222-4222-8222-222222222222",
        ),
        name: "Training configuration",
      },
    };
    let deleted = false;
    let deletes = 0;
    const tenant = {
      id: "33333333-3333-4333-8333-333333333333",
      kind: "organisation",
      roles: ["platform-engineer"],
      manageMembers: true,
      organizationVerified: true,
    };
    await page.route("**/auth/status", (route) =>
      route.fulfill({
        json: { stackit: true, primary: "stackit", github: false },
      }),
    );
    await page.route("**/api/v1/session", (route) =>
      route.fulfill({
        json: {
          user: {
            id: "44444444-4444-4444-8444-444444444444",
            login: "owner@example.test",
          },
          tenant,
          csrfToken: "delete-test",
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
      }),
    );
    await page.route("**/api/v1/configurations", (route) =>
      route.fulfill({
        json: { configurations: deleted ? [] : [configuration] },
      }),
    );
    await page.route(
      `**/api/v1/configurations/${configuration.id}`,
      (route) => {
        if (route.request().method() === "GET")
          return route.fulfill({ json: { configuration } });
        expect(route.request().method()).toBe("DELETE");
        expect(route.request().postDataJSON()).toEqual({ revision: 3 });
        expect(route.request().headers()["x-lzc-csrf"]).toBe("delete-test");
        deletes++;
        if (outcome === "changed-after-read")
          return route.fulfill({
            status: 409,
            json: { error: "configuration_instance_exists" },
          });
        deleted = true;
        return route.fulfill({ status: 204 });
      },
    );
    await page.goto("/configurations");
    const remove = page.getByRole("button", {
      name: "Delete configuration: Training configuration",
      exact: true,
    });
    if (outcome === "deployed") {
      await expect(remove).toBeDisabled();
      await expect(
        page.getByText(
          "This configuration belongs to an existing Landing Zone.",
          { exact: false },
        ),
      ).toBeVisible();
    } else {
      await page
        .getByRole("button", {
          name: "Open configuration: Training configuration",
          exact: true,
        })
        .click();
      const editorDelete = page.getByRole("button", {
        name: "Delete configuration",
        exact: true,
      });
      await expect(editorDelete).toBeVisible();
      page.once("dialog", (dialog) => dialog.dismiss());
      await editorDelete.click();
      expect(deletes).toBe(0);
      page.once("dialog", (dialog) => {
        expect(dialog.message()).toContain("Training configuration");
        return dialog.accept();
      });
      await editorDelete.click();
      if (outcome === "delete") {
        await expect(
          page.locator("#configuration-save").getByRole("status"),
        ).toContainText("Saved configuration deleted");
        await expect(editorDelete).toHaveCount(0);
      } else {
        await expect(
          page.locator("#configuration-save").getByRole("alert"),
        ).toContainText("existing Landing Zone");
        await expect(editorDelete).toBeVisible();
      }
      await expect(
        page.getByRole("textbox", { name: "Configuration name", exact: true }),
      ).toHaveValue("Training configuration");
      expect(deletes).toBe(1);
    }
  });
}
