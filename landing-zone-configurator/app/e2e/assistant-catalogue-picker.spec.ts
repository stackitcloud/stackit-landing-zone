import { createEditorConfiguration } from "@lzc/domain";
import { enrichCatalogueQuestions } from "../apps/api/src/assistant/catalogue-guidance";
import type { AssistantCatalogueContext } from "../apps/api/src/assistant/model-serving";
import { mockEmptyApplicationLists } from "./editor-navigation";
import { expect, test } from "./fixtures";

test.use({ locale: "en-US" });
test("service questions share a searchable described picker and send selected values without saving", async ({
  page,
}, info) => {
  const id = "33333333-3333-4333-8333-333333333333";
  const draft = createEditorConfiguration("standalone", id);
  draft.name = "Catalogue dialogue";
  const catalogues: AssistantCatalogueContext = {
    regions: [
      {
        region: "eu01",
        fetchedAt: "2026-11-18T00:00:00Z",
        products: Object.fromEntries(
          ["gitFlavors", "vpnPlans", "observabilityPlans"].map((field) => [
            field,
            {
              status: "available",
              totalOptions: 3,
              truncated: false,
              options:
                field === "gitFlavors"
                  ? [
                      { value: "git-10", label: "Git10" },
                      { value: "git-100", label: "Git100" },
                      { value: "git-other", label: "Another offered plan" },
                    ]
                  : [
                      { value: "small", label: "Small plan" },
                      { value: "medium", label: "Medium plan" },
                      { value: "large", label: "Large plan" },
                    ],
            },
          ]),
        ),
      },
    ],
  };
  const proposal = enrichCatalogueQuestions(
    {
      explanation: "Choose a starting plan for each service. Nothing saved.",
      questions: [
        {
          path: "devops.git_flavor",
          text: "Which Git starting plan?",
          options: ["Git100", "Help me estimate my needs"],
        },
        {
          path: "connectivity.vpn.plan_id",
          text: "Which VPN plan?",
          options: [],
        },
        {
          path: "observability.plan_name",
          text: "Which Observability plan?",
          options: [],
        },
      ],
      changes: [],
      references: ["devops-git", "vpn", "observability"],
    },
    { region: "eu01" },
    catalogues,
    "en",
  );
  const sends: string[] = [];
  let writes = 0;
  const conversation = {
    id,
    revision: 1,
    baseRevision: 1,
    stale: false,
    expiresAt: "2027-05-16T09:00:00Z",
    messages: [],
    proposal,
  };
  await mockEmptyApplicationLists(page);
  await page.route("**/auth/status", (route) =>
    route.fulfill({
      json: { stackit: true, github: false, primary: "stackit" },
    }),
  );
  await page.route("**/api/v1/session", (route) =>
    route.fulfill({
      json: {
        user: { id, login: "owner@example.test" },
        tenant: { id, kind: "organisation", roles: ["platform-engineer"] },
        csrfToken: "csrf-picker",
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
            name: draft.name,
            revision: 1,
            updatedAt: new Date().toISOString(),
            issueCount: 0,
          },
        ],
      },
    }),
  );
  await page.route(`**/api/v1/configurations/${id}`, (route) => {
    if (route.request().method() !== "GET") writes++;
    return route.fulfill({
      json: { configuration: { id, revision: 1, draft } },
    });
  });
  await page.route(`**/api/v1/configurations/${id}/assistant`, (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(body.language).toBe("en");
      sends.push(body.message);
    }
    return route.fulfill({ json: { conversation } });
  });
  await page.goto("/configurations");
  await page
    .getByRole("button", {
      name: "Open configuration: Catalogue dialogue",
      exact: true,
    })
    .click();
  const chat = page.getByRole("region", {
    name: "Configuration chat",
    exact: true,
  });
  const questions = chat.getByRole("region", {
    name: "Follow-up questions",
    exact: true,
  });
  const git = questions.getByRole("group", {
    name: "Which Git starting plan?",
    exact: true,
  });
  const picker = git.getByRole("combobox");
  await expect(picker.locator("option")).toHaveCount(2); // Prompt plus grounded conversational subset, no automatic choice.
  await expect(picker).toHaveValue("");
  await expect(
    questions.getByRole("button", { name: "Send answer", exact: true }),
  ).toBeDisabled();
  await git.getByRole("checkbox").check();
  await expect(picker.locator("option")).toHaveCount(4);
  await git.getByRole("searchbox").fill("100");
  await expect(picker.locator("option")).toHaveCount(2);
  await picker.selectOption("git-100");
  await expect(git).toContainText("up to 100 users");
  const vpn = questions.getByRole("group", {
    name: "Which VPN plan?",
    exact: true,
  });
  await vpn.getByRole("searchbox").fill("medium");
  await vpn.getByRole("combobox").selectOption("medium");
  const obs = questions.getByRole("group", {
    name: "Which Observability plan?",
    exact: true,
  });
  await obs.getByRole("combobox").selectOption("small");
  await questions.screenshot({
    path: info.outputPath("service-catalogue-pickers.png"),
  });
  await questions
    .getByRole("button", { name: "Send answer", exact: true })
    .click();
  await expect.poll(() => sends.length).toBe(1);
  expect(sends[0]).toContain("Git100 (git-100)");
  expect(sends[0]).toContain("Medium plan (medium)");
  expect(sends[0]).toContain("Small plan (small)");
  expect(writes).toBe(0);
});
