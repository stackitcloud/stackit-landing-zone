import { createEditorConfiguration } from "@lzc/domain";
import { expect, test } from "./fixtures";

for (const context of ["configuration", "templates"] as const) {
  test(`discard in ${context} preserves conversation and dirty saved binding across reload and another turn`, async ({
    page,
  }) => {
    const user = "11111111-1111-4111-8111-111111111111";
    const tenant = "22222222-2222-4222-8222-222222222222";
    const id = "33333333-3333-4333-8333-333333333333";
    const conversationId = "55555555-5555-4555-8555-555555555555";
    const original = createEditorConfiguration(
      "standalone",
      "44444444-4444-4444-8444-444444444444",
    );
    original.name = "Saved discard fixture";
    let stored = original;
    let revision = 1;
    const originalMessages = [
      { id: "question", role: "user", content: "Mein bisheriger Auftrag" },
      { id: "answer", role: "assistant", content: "Meine bisherige Antwort" },
    ];
    let conversation: {
      id: string;
      revision: number;
      baseRevision: number;
      expiresAt: string;
      stale: boolean;
      messages: {
        id: string;
        role: string;
        content: string;
        proposalDiscarded?: boolean;
      }[];
      proposal: {
        explanation: string;
        questions: never[];
        changes: { path: string; before: string; value: string }[];
        references: string[];
      } | null;
    } = {
      id: conversationId,
      revision: 2,
      baseRevision: 1,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      stale: false,
      messages: originalMessages,
      proposal: {
        explanation: "Vorschlag zur Prüfung",
        questions: [],
        changes: [
          { path: "company_name", before: "", value: "NEVER APPLY THIS" },
        ],
        references: ["identity-foundations"],
      },
    };
    let discarded = 0,
      sent = 0,
      saves = 0;
    const forbidden: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() !== "GET" &&
        /\/assistant\/accept$|\/api\/v1\/(?:plans|preparations)(?:\/|$)|\/api\/v1\/applications\//.test(
          new URL(request.url()).pathname,
        )
      )
        forbidden.push(request.url());
    });
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
            kind: "organisation",
            roles: ["platform-engineer"],
          },
          csrfToken: "csrf-discard",
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          stackitVerified: true,
        },
      }),
    );
    await page.route("**/api/v1/configurations", (route) =>
      route.fulfill({
        json: {
          configurations: [
            {
              id,
              name: stored.name,
              revision,
              updatedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              issueCount: 0,
            },
          ],
        },
      }),
    );
    await page.route(`**/api/v1/configurations/${id}`, (route) => {
      if (route.request().method() === "PUT") {
        expect(route.request().postDataJSON().revision).toBe(1);
        stored = route.request().postDataJSON().draft;
        revision++;
        saves++;
      } else expect(route.request().method()).toBe("GET");
      return route.fulfill({
        json: { configuration: { id, revision, draft: stored } },
      });
    });
    for (const [path, body] of Object.entries({
      templates: { versions: [] },
      instances: { instances: [] },
      "platform-contracts": { contracts: [] },
    }))
      await page.route(`**/api/v1/applications/${path}`, (route) =>
        route.fulfill({ json: body }),
      );
    await page.route(`**/api/v1/configurations/${id}/assistant`, (route) => {
      if (route.request().method() === "POST") {
        expect(route.request().headers()["x-lzc-csrf"]).toBe("csrf-discard");
        expect(route.request().postDataJSON()).toEqual({
          revision: 1,
          message: "Bitte jetzt nur die Grundlagen erklären.",
          draft: { ...original, name: "Unsaved preserved discard draft" },
        });
        sent++;
        conversation = {
          ...conversation,
          revision: 4,
          messages: [
            ...conversation.messages,
            {
              id: "new-question",
              role: "user",
              content: "Bitte jetzt nur die Grundlagen erklären.",
            },
            {
              id: "new-answer",
              role: "assistant",
              content: "Neue Beratung ohne früheren Vorschlag",
            },
          ],
          proposal: {
            explanation: "Neue Beratung ohne früheren Vorschlag",
            questions: [],
            changes: [],
            references: ["identity-foundations"],
          },
        };
      } else expect(route.request().method()).toBe("GET");
      return route.fulfill({ json: { conversation } });
    });
    await page.route(
      `**/api/v1/configurations/${id}/assistant/discard`,
      (route) => {
        expect(route.request().method()).toBe("POST");
        expect(route.request().headers()["x-lzc-csrf"]).toBe("csrf-discard");
        expect(route.request().postDataJSON()).toEqual({
          conversationId,
          revision: 2,
        });
        discarded++;
        conversation = {
          ...conversation,
          revision: 3,
          proposal: null,
          messages: originalMessages.map((entry, index) =>
            index === 1 ? { ...entry, proposalDiscarded: true } : entry,
          ),
        };
        return route.fulfill({ json: { conversation } });
      },
    );
    await page.goto("/configurations");
    await page
      .getByRole("button", {
        name: "Konfiguration öffnen: Saved discard fixture",
        exact: true,
      })
      .click();
    await page
      .getByLabel("Name der Konfiguration", { exact: true })
      .fill("Unsaved preserved discard draft");
    if (context === "templates") {
      await page
        .getByRole("navigation", { name: "Hauptnavigation", exact: true })
        .getByRole("button", { name: "Application Landing Zones", exact: true })
        .click();
      await page
        .getByRole("tab", { name: "Template-Entwürfe", exact: true })
        .click();
    }
    const chat = page.getByRole("region", {
      name: "Konfigurations-Chat",
      exact: true,
    });
    await expect(
      chat.getByText("NEVER APPLY THIS", { exact: true }),
    ).toBeVisible();
    await chat
      .getByRole("button", { name: "Vorschlag verwerfen", exact: true })
      .click();
    await expect(
      chat.getByRole("button", { name: "Vorschlag verwerfen", exact: true }),
    ).toHaveCount(0);
    await expect(
      chat.getByText("NEVER APPLY THIS", { exact: true }),
    ).toHaveCount(0);
    await expect(
      chat.getByText("Mein bisheriger Auftrag", { exact: true }),
    ).toBeVisible();
    await expect(
      chat.getByText("Meine bisherige Antwort", { exact: true }),
    ).toBeVisible();
    expect(discarded).toBe(1);
    expect(sent).toBe(0);
    expect(saves).toBe(0);
    await expect
      .poll(() =>
        page.evaluate(
          (key) => sessionStorage.getItem(key),
          `lzc-oauth-draft:${user}:${tenant}`,
        ),
      )
      .toContain("Unsaved preserved discard draft");
    await page.reload();
    await expect(
      chat.getByText("Vorschlag verworfen.", { exact: true }),
    ).toBeVisible();
    await expect(
      chat.getByRole("button", { name: "Vorschlag verwerfen", exact: true }),
    ).toHaveCount(0);
    await chat
      .getByLabel("Deine Nachricht", { exact: true })
      .fill("Bitte jetzt nur die Grundlagen erklären.");
    await chat
      .getByRole("button", { name: "Nachricht senden", exact: true })
      .click();
    await expect(
      chat.getByText("Neue Beratung ohne früheren Vorschlag", { exact: true }),
    ).toBeVisible();
    await expect(chat.locator(".assistant-proposal")).toHaveCount(0);
    expect(sent).toBe(1);
    await page
      .getByRole("navigation", { name: "Hauptnavigation", exact: true })
      .getByRole("button", { name: "Konfigurationen", exact: true })
      .click();
    await expect(
      page.getByLabel("Name der Konfiguration", { exact: true }),
    ).toHaveValue("Unsaved preserved discard draft");
    expect(saves).toBe(0);
    await page
      .locator("#configuration-save")
      .getByRole("button", { name: "Konfiguration speichern", exact: true })
      .click();
    await expect.poll(() => saves).toBe(1);
    expect(forbidden).toEqual([]);
  });
}
