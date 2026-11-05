import { readFile } from "node:fs/promises";
import { platformUpgradeAcceleratorCommit } from "@lzc/contracts";
import {
  createEditorConfiguration,
  editCommonInput,
  recordValues,
  saveEditorDraft,
  serializeTfvars,
} from "@lzc/domain";
import {
  type PreparationManifest,
  preparationManifest,
  preparationTfvars,
} from "../apps/api/src/deployments/preparations.js";
import {
  mockEmptyApplicationLists,
  openConfigurationStep,
} from "./editor-navigation";
import { expect, test } from "./fixtures";

test("normal save preserves managed audit through the saved list and a separately created preparation", async ({
  page,
}) => {
  await mockEmptyApplicationLists(page);
  const id = "11111111-2222-4333-8444-555555555555";
  const storedId = "22222222-2222-4333-8444-555555555555";
  const credentialId = "33333333-2222-4333-8444-555555555555";
  let draft = createEditorConfiguration("hub-and-spoke", id);
  draft = editCommonInput(draft, "owner_email", "owner@stackit.cloud");
  draft = editCommonInput(draft, "organization_id", id);
  draft = editCommonInput(draft, "audit_logs", {});
  const stored = {
    id: storedId,
    name: draft.name,
    draft,
    revision: 15,
    updatedAt: new Date().toISOString(),
  };
  const preparations: {
    id: string;
    name: string;
    credentialId: string;
    createdAt: string;
    manifest: PreparationManifest;
  }[] = [];
  let writes = 0;
  await page.route("**/auth/status", (r) =>
    r.fulfill({ json: { github: false, stackit: true } }),
  );
  await page.route("**/api/v1/session", (r) =>
    r.fulfill({
      json: {
        user: { id, login: "synthetic-owner" },
        tenant: { id, kind: "personal", roles: [] },
        csrfToken: "synthetic-csrf",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    }),
  );
  await page.route("**/api/v1/configurations", (r) =>
    r.fulfill({ json: { configurations: [stored] } }),
  );
  await page.route(`**/api/v1/configurations/${storedId}`, async (r) => {
    if (r.request().method() === "PUT") {
      const body = r.request().postDataJSON();
      expect(body.revision).toBe(stored.revision);
      stored.draft = body.draft;
      stored.revision++;
      writes++;
    }
    await r.fulfill({ json: { configuration: stored } });
  });
  await page.route("**/api/v1/credentials", (r) =>
    r.fulfill({
      json: {
        profiles: [
          {
            id: credentialId,
            name: "Synthetic deployment account",
            state: "stored",
          },
        ],
      },
    }),
  );
  await page.route("**/api/v1/backends*", (r) =>
    r.fulfill(
      new URL(r.request().url()).search
        ? { status: 404, json: { error: "backend_not_found" } }
        : { json: { backends: [] } },
    ),
  );
  await page.route("**/api/v1/preparations", async (r) => {
    if (r.request().method() === "POST") {
      const input = r.request().postDataJSON();
      expect(input.configurationId).toBe(storedId);
      expect(input.revision).toBe(16);
      const document = saveEditorDraft(storedId, stored.draft);
      expect(recordValues(document).audit_logs).toMatchObject({
        managed_resources: true,
      });
      const manifest = preparationManifest(
        input,
        {
          document,
          head: String(stored.revision),
          tfvars: serializeTfvars(recordValues(document)),
        },
        {
          version: 1,
          keyId: "synthetic-key",
          check: {
            status: "passed",
            code: "organization_readable",
            organizationId: id,
            organizationName: "Synthetic organization",
            checkedAt: new Date().toISOString(),
          },
        },
        id,
      );
      expect(manifest.accelerator.commit).toBe(
        platformUpgradeAcceleratorCommit,
      );
      expect(preparationTfvars(manifest)).toMatch(/managed_resources.*true/);
      const preparation = {
        id: "44444444-2222-4333-8444-555555555555",
        name: "Saved audit revision",
        credentialId,
        createdAt: new Date().toISOString(),
        manifest,
      };
      preparations.push(preparation);
      return r.fulfill({ json: preparation });
    }
    return r.fulfill({
      json: {
        preparations,
        capabilities: {
          platformUpgradeEnabled: true,
          runnerAcceleratorCommit: platformUpgradeAcceleratorCommit,
        },
      },
    });
  });
  await page.goto("/configurations");
  await page
    .getByRole("button", {
      name: `Konfiguration öffnen: ${stored.name}`,
      exact: true,
    })
    .click();
  await openConfigurationStep(page, "Plattform");
  await page
    .locator("summary")
    .filter({ hasText: /^Audit-Protokollierung$/ })
    .click();
  const label = "Alle verwalteten Projekte und Ordner automatisch anbinden";
  await page
    .getByRole("button", { name: `Eigene Einstellung: ${label}`, exact: true })
    .click();
  await page.getByLabel(label, { exact: true }).selectOption("true");
  await openConfigurationStep(page, "Prüfen");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Accelerator-Beispiel herunterladen",
      exact: true,
    })
    .click();
  const path = await (await download).path();
  expect(await readFile(path as string, "utf8")).toMatch(
    /managed_resources.*true/,
  );
  expect(writes).toBe(0);
  await page
    .getByRole("button", { name: "Speicheroptionen öffnen →", exact: true })
    .click();
  expect(writes).toBe(0);
  let warned = false;
  page.once("dialog", async (dialog) => {
    warned = true;
    expect(dialog.message()).toContain("nicht gespeicherte Änderungen");
    await dialog.dismiss();
  });
  await page
    .getByRole("button", {
      name: `Deployment vorbereiten: ${stored.name}`,
      exact: true,
    })
    .click();
  await expect.poll(() => warned).toBe(true);
  expect(preparations).toHaveLength(0);
  const storage = page.getByRole("region", {
    name: "Gespeicherte Konfigurationen",
    exact: true,
  });
  await storage
    .getByRole("button", { name: "Konfiguration speichern", exact: true })
    .click();
  await expect(storage.getByRole("status")).toHaveText(
    "Konfiguration in der Datenbank gespeichert.",
  );
  expect(stored.revision).toBe(16);
  expect(writes).toBe(1);
  await page.reload();
  await expect(storage.getByText(/Revision 16/)).toBeVisible();
  await storage
    .getByRole("button", {
      name: `Deployment vorbereiten: ${stored.name}`,
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/deployments$/);
  await page
    .getByLabel(
      "Ich bestätige: Diese Vorbereitung verwendet den aktuellen Accelerator-Stand für Plattformverträge.",
      { exact: false },
    )
    .check();
  await page
    .getByRole("button", {
      name: "Zugang prüfen und Vorbereitung speichern",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Vorbereitung gespeichert.", { exact: false }),
  ).toBeVisible();
  expect(preparations).toHaveLength(1);
  expect(writes).toBe(1);
});
