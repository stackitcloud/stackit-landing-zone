import type { AssistantRecommendation } from "@lzc/contracts";
import { createEditorConfiguration, editCommonInput } from "@lzc/domain";
import type { Dialogue } from "../apps/api/src/assistant/dialogue";
import { mockEmptyApplicationLists } from "./editor-navigation";
import { expect, test } from "./fixtures";

test.use({ locale: "en-US" });
test("English UI retains a capacity recommendation and offers the actual native default", async ({
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
        content: "Which Git size should we use?",
        recommendations: [] as AssistantRecommendation[],
      },
    ],
    proposal: null as Dialogue | null,
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
      const recommendations: AssistantRecommendation[] = [
        {
          path: "devops.git_flavor",
          value: "git-100",
          label: "Git100",
          description: "Up to 100 users",
          requirements: [{ metric: "users", minimum: 80 }],
          facts: [{ metric: "users", value: 100 }],
          source: {
            kind: "project-catalogue",
            region: "eu01",
            fetchedAt: new Date().toISOString(),
          },
        },
      ];
      const proposal: Dialogue = {
        explanation:
          posts < 3
            ? "Git100 fits your 80 developers. Choose access for the central company Git. Nothing saved."
            : "Git100 uses the Accelerator default 0.0.0.0/0, allowing public IPv4 access. Nothing saved or deployed.",
        recommendations,
        questions:
          posts < 3
            ? [
                {
                  path: "devops.allowed_network_ranges",
                  answerType: "requirements",
                  text: "Which access should Git use?",
                  options:
                    posts === 1
                      ? ["Company/VPN public egress networks only"]
                      : [
                          "Use Accelerator default (0.0.0.0/0)",
                          "Provide company/VPN public egress IPs or CIDRs",
                        ],
                },
              ]
            : [],
        changes:
          posts < 3
            ? []
            : [
                {
                  path: "devops",
                  operation: "merge",
                  value: {
                    git_flavor: "git-100",
                    allowed_network_ranges: ["0.0.0.0/0"],
                  },
                },
              ],
        references: ["devops-git"],
      };
      conversation = {
        ...conversation,
        revision: conversation.revision + 1,
        messages: [
          ...conversation.messages,
          {
            id: `user-${posts}`,
            role: "user",
            content: body.message,
            recommendations: [],
          },
          {
            id: `assistant-${posts}`,
            role: "assistant",
            content: proposal.explanation,
            recommendations,
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
  const recommendations = chat.getByRole("region", {
    name: "Matching recommendations",
    exact: true,
  });
  await expect(recommendations.first()).toContainText("Git100");
  await expect(recommendations.first()).toContainText("80");
  await expect(recommendations.first()).toContainText("100");
  await expect(questions).not.toContainText("Which starting size");
  await questions.screenshot({ path: info.outputPath("git-access.png") });
  await questions
    .getByRole("radio", {
      name: "Company/VPN public egress networks only",
      exact: true,
    })
    .check();
  await questions
    .getByRole("button", { name: "Send answer", exact: true })
    .click();
  await expect(
    questions.getByRole("radio", {
      name: "Use Accelerator default (0.0.0.0/0)",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  const reloadedChat = page.getByRole("region", {
    name: "Configuration chat",
    exact: true,
  });
  await expect(
    reloadedChat
      .getByRole("region", { name: "Matching recommendations", exact: true })
      .last(),
  ).toContainText("Git100");
  await reloadedChat
    .getByRole("radio", {
      name: "Use Accelerator default (0.0.0.0/0)",
      exact: true,
    })
    .check();
  await reloadedChat
    .getByRole("button", { name: "Send answer", exact: true })
    .click();
  await expect(
    reloadedChat.getByRole("region", {
      name: "Follow-up questions",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(reloadedChat.locator(".assistant-proposal")).toContainText(
    "git-100",
  );
  await expect(reloadedChat.locator(".assistant-proposal")).toContainText(
    "0.0.0.0/0",
  );
  await reloadedChat.screenshot({
    path: info.outputPath("git-default-proposal.png"),
  });
  expect(posts).toBe(3);
  expect(writes).toBe(0);
});
