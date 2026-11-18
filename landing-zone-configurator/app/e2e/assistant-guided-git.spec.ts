import {
  compileCommonConfiguration,
  createEditorConfiguration,
  editCommonInput,
} from "@lzc/domain";
import {
  gitDialogueInputs,
  gitSetupDialogue,
} from "../apps/api/src/assistant/git-dialogue";
import { mockEmptyApplicationLists } from "./editor-navigation";
import { expect, test } from "./fixtures";

test.use({ locale: "en-US" });
test("English UI guides a company-wide Git recommendation after German quoted history", async ({
  page,
}, info) => {
  const id = "33333333-3333-4333-8333-333333333333";
  const draft = editCommonInput(
    createEditorConfiguration("standalone", id),
    "observability",
    {
      plan_name: "Observability-Starter-EU01",
      acl: ["203.0.113.0/24"],
      metrics_retention_days: 30,
      logs_retention_days: 30,
      traces_retention_days: 30,
      metrics_retention_days_1h_downsampling: 30,
      metrics_retention_days_5m_downsampling: 30,
    },
  );
  draft.name = "Guided Git fixture";
  const current = compileCommonConfiguration(draft);
  let posts = 0;
  let writes = 0;
  let conversation = {
    id: "55555555-5555-4555-8555-555555555555",
    revision: 1,
    baseRevision: 1,
    expiresAt: "2027-05-16T09:00:00Z",
    stale: false,
    messages: [
      {
        id: "legacy",
        role: "assistant",
        content: "Welche Git-Größe soll der Entwurf verwenden?",
      },
    ],
    proposal: null as ReturnType<typeof gitSetupDialogue> | null,
  };
  await mockEmptyApplicationLists(page);
  await page.route("**/auth/status", (r) =>
    r.fulfill({ json: { stackit: true, github: false, primary: "stackit" } }),
  );
  await page.route("**/api/v1/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "11111111-1111-4111-8111-111111111111",
          login: "owner@example.test",
        },
        tenant: {
          id: "22222222-2222-4222-8222-222222222222",
          kind: "organisation",
          roles: ["platform-engineer"],
        },
        csrfToken: "csrf-guided-git",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        stackitVerified: true,
      },
    }),
  );
  await page.route("**/api/v1/configurations", (r) =>
    r.fulfill({
      json: {
        configurations: [
          {
            id,
            name: draft.name,
            revision: 1,
            updatedAt: new Date().toISOString(),
            issueCount: 0,
          },
        ],
      },
    }),
  );
  await page.route(`**/api/v1/configurations/${id}`, (r) => {
    if (r.request().method() !== "GET") writes++;
    return r.fulfill({ json: { configuration: { id, revision: 1, draft } } });
  });
  await page.route(`**/api/v1/configurations/${id}/assistant`, async (r) => {
    if (r.request().method() === "POST") {
      const body = r.request().postDataJSON();
      expect(body.language).toBe("en");
      expect(body.revision).toBe(1);
      posts++;
      const inputs = gitDialogueInputs(
        current,
        conversation.messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        body.message,
        { regions: [] },
      );
      const decision = {
        setupSource: posts === 1 ? "current" : "history-1",
        planChoice: posts === 1 ? null : ("recommend" as const),
        planSource: posts === 1 ? null : posts === 2 ? "current" : "history-3",
        networkChoice: posts === 3 ? "observability" : null,
        networkSource: posts === 3 ? "current" : null,
        networkEvidence: null,
      };
      const proposal = gitSetupDialogue(inputs, decision, "en");
      conversation = {
        ...conversation,
        revision: conversation.revision + 1,
        messages: [
          ...conversation.messages,
          { id: `user-${posts}`, role: "user", content: body.message },
          {
            id: `assistant-${posts}`,
            role: "assistant",
            content: proposal.explanation,
          },
        ],
        proposal,
      };
    }
    return r.fulfill({ json: { conversation } });
  });
  await page.goto("/configurations");
  await page
    .getByRole("button", {
      name: "Open configuration: Guided Git fixture",
      exact: true,
    })
    .click();
  const chat = page.getByRole("region", {
    name: "Configuration chat",
    exact: true,
  });
  await chat
    .getByRole("textbox", { name: "Your message", exact: true })
    .fill("Please add a central git instance to the config");
  await chat.getByRole("button", { name: "Send message", exact: true }).click();
  const questions = chat.getByRole("region", {
    name: "Follow-up questions",
    exact: true,
  });
  await expect(
    questions.getByRole("radio", { name: /Git100.*recommended/ }),
  ).toBeVisible();
  await expect(
    questions.getByRole("radio", { name: /Git10.*pilot/ }),
  ).toBeVisible();
  await expect(questions).not.toContainText("Welche");
  await questions.screenshot({ path: info.outputPath("git-plans.png") });
  await questions
    .getByRole("group", {
      name: "Which starting size would you like to use?",
      exact: true,
    })
    .getByRole("textbox", { name: "Your own answer", exact: true })
    .fill(
      "just use a standard git flavor, which is usefull for a company wide git.",
    );
  await questions
    .getByRole("button", { name: "Send answer", exact: true })
    .click();
  await expect(questions.getByRole("group")).toHaveCount(1);
  await expect(questions).not.toContainText("Which starting size");
  await expect(chat.getByRole("log")).toContainText(
    "Starting size selected: Git100",
  );
  await expect(
    questions.getByRole("radio", { name: /saved Observability allowlist/ }),
  ).toBeVisible();
  await questions.screenshot({ path: info.outputPath("git-access.png") });
  await questions
    .getByRole("radio", { name: /saved Observability allowlist/ })
    .check();
  await questions
    .getByRole("button", { name: "Send answer", exact: true })
    .click();
  await expect(questions).toHaveCount(0);
  await expect(chat.locator(".assistant-proposal")).toContainText("git-100");
  expect(posts).toBe(3);
  expect(writes).toBe(0);
});
