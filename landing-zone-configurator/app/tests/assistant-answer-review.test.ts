import { expect, it, vi } from "vitest";
import { reviewConsultationAnswer } from "../apps/api/src/assistant/answer-review.js";
import { ensureDraftNotice } from "../apps/api/src/assistant/catalogue-guidance.js";

const explanation =
  "Key management is project-wide and lets keys use every right of the account, also outside this project. Keep privileged platform accounts outside application projects.";
const answer = {
  explanation,
  questions: [],
  changes: [],
  references: ["project-templates"],
};
const input = {
  turns: [{ role: "user" as const, content: "Explain the VM preset." }],
  language: "en" as const,
  rules: [],
  inspections: [],
  serviceFacts: {
    "project-templates": {
      criticalBoundaries: [{ id: "keys", mustExplain: true }],
    },
  },
  answer,
  delta: [],
};
const requestChecks = [
  {
    userTurn: 0,
    requirement: "Explain the VM preset.",
    expected: "Explain the requested profile and its boundaries",
    actual: explanation,
    resolution: "advice",
    met: true,
  },
];
it("accepts a necessary clarification without inventing changes and rejects missing question or proposal evidence", async () => {
  const check = {
    ...requestChecks[0]!,
    resolution: "clarification",
    questionIndices: [0],
  };
  const answerWithQuestion = {
    ...answer,
    questions: [
      {
        path: "devops.allowed_network_ranges",
        text: "Which clients need access?",
        answerType: "requirements" as const,
      },
    ],
  };
  const complete = vi.fn().mockResolvedValue({
    ready: true,
    findings: [],
    requestChecks: [check],
    boundaryChecks: [],
  });
  expect(
    (
      await reviewConsultationAnswer({
        ...input,
        serviceFacts: {},
        complete,
        answer: answerWithQuestion,
      })
    ).ready,
  ).toBe(true);
  expect(
    (await reviewConsultationAnswer({ ...input, serviceFacts: {}, complete }))
      .ready,
  ).toBe(false);
  complete.mockResolvedValue({
    ready: true,
    findings: [],
    requestChecks: [{ ...check, questionIndices: [4] }],
    boundaryChecks: [],
  });
  expect(
    (
      await reviewConsultationAnswer({
        ...input,
        serviceFacts: {},
        complete,
        answer: answerWithQuestion,
      })
    ).ready,
  ).toBe(false);
  complete.mockResolvedValue({
    ready: true,
    findings: [],
    requestChecks: [{ ...check, resolution: "proposed", questionIndices: [] }],
    boundaryChecks: [],
  });
  expect(
    (
      await reviewConsultationAnswer({
        ...input,
        serviceFacts: {},
        complete,
        answer: answerWithQuestion,
      })
    ).ready,
  ).toBe(false);
});
it("allows validated default-reset operations with an unchanged effective compiler value", async () => {
  const complete = vi.fn().mockResolvedValue({
    ready: true,
    findings: [],
    requestChecks: [{ ...requestChecks[0], resolution: "proposed" }],
    boundaryChecks: [],
  });
  expect(
    (
      await reviewConsultationAnswer({
        ...input,
        serviceFacts: {},
        complete,
        answer: {
          ...answer,
          changes: [
            { path: "devops.git_flavor", operation: "default", value: null },
          ],
        },
      })
    ).ready,
  ).toBe(true);
});
it("requires actual structured questions or user-bound deferrals for source-required decisions", async () => {
  const requiredDecisions = [
    {
      id: "missing-owner",
      path: "projectTemplates",
      requirement: "Choose the central initial owner.",
    },
  ];
  const response = {
    ready: true,
    findings: [],
    requestChecks,
    boundaryChecks: [],
  };
  const reviewInput = { ...input, serviceFacts: {}, requiredDecisions };
  for (const decisionChecks of [
    [],
    [{ id: "missing-owner", disposition: "question", questionIndices: [0] }],
    [
      {
        id: "missing-owner",
        disposition: "deferred",
        questionIndices: [],
        deferral: { userTurn: 0, quote: "invented deferral" },
      },
    ],
  ]) {
    const complete = vi.fn().mockResolvedValue({ ...response, decisionChecks });
    expect(
      (await reviewConsultationAnswer({ ...reviewInput, complete })).ready,
    ).toBe(false);
  }
  const questionCheck = [
    { id: "missing-owner", disposition: "question", questionIndices: [0] },
  ];
  const complete = vi
    .fn()
    .mockResolvedValue({ ...response, decisionChecks: questionCheck });
  expect(
    (
      await reviewConsultationAnswer({
        ...reviewInput,
        complete,
        answer: {
          ...answer,
          questions: [
            {
              path: "projectTemplates",
              text: "Which central initial owner?",
              answerType: "requirements",
            },
          ],
        },
      })
    ).ready,
  ).toBe(true);
  expect(
    (
      await reviewConsultationAnswer({
        ...reviewInput,
        complete,
        answer: {
          ...answer,
          questions: [
            {
              path: "devops.git_flavor",
              text: "Which plan?",
              answerType: "requirements",
            },
          ],
        },
      })
    ).ready,
  ).toBe(false);
  const alternativePath =
    "projectTemplates.central.accessProfile.initialOwnerEmail";
  expect(
    (
      await reviewConsultationAnswer({
        ...reviewInput,
        complete,
        requiredDecisions: requiredDecisions.map((decision) => ({
          ...decision,
          alternativePaths: [alternativePath],
        })),
        answer: {
          ...answer,
          questions: [
            {
              path: alternativePath,
              text: "Which initial owner?",
              answerType: "requirements",
            },
          ],
        },
      })
    ).ready,
  ).toBe(true);
  expect(
    (
      await reviewConsultationAnswer({
        ...reviewInput,
        complete,
        requiredDecisions: requiredDecisions.map((decision) => ({
          ...decision,
          alternativePaths: [alternativePath],
        })),
        answer: {
          ...answer,
          questions: [
            {
              path: "projectTemplates.unknown.accessProfile.initialOwnerEmail",
              text: "Which initial owner?",
              answerType: "requirements",
            },
          ],
        },
      })
    ).ready,
  ).toBe(false);
  const deferral = { userTurn: 0, quote: "Set the owner later." };
  const deferred = vi.fn().mockResolvedValue({
    ...response,
    decisionChecks: [
      {
        id: "missing-owner",
        disposition: "deferred",
        questionIndices: [],
        deferral,
      },
    ],
  });
  expect(
    (
      await reviewConsultationAnswer({
        ...reviewInput,
        complete: deferred,
        turns: [{ role: "user", content: deferral.quote }],
      })
    ).ready,
  ).toBe(true);
  expect(
    (
      await reviewConsultationAnswer({
        ...reviewInput,
        complete: deferred,
        turns: [{ role: "assistant", content: deferral.quote }],
      })
    ).ready,
  ).toBe(false);
});
it.each([
  { boundaryChecks: [] },
  {
    boundaryChecks: [
      { id: "keys", applicable: true, covered: false, paragraphs: [] },
    ],
  },
  {
    boundaryChecks: [
      {
        id: "keys",
        applicable: true,
        covered: true,
        paragraphs: [9],
      },
    ],
  },
])(
  "rejects missing or unsupported critical-boundary coverage (%j)",
  async ({ boundaryChecks }) => {
    const complete = vi.fn().mockResolvedValue({
      requestChecks,
      ready: true,
      findings: [],
      boundaryChecks,
    });
    expect((await reviewConsultationAnswer({ ...input, complete })).ready).toBe(
      false,
    );
  },
);
it("retains a reviewed answer and source-bound memory with actual boundary evidence", async () => {
  const complete = vi.fn().mockResolvedValue({
    requestChecks,
    ready: true,
    findings: [],
    boundaryChecks: [
      { id: "keys", applicable: true, covered: true, paragraphs: [0] },
    ],
    memory: {
      goal: "Application VM rights",
      decisions: [],
      openQuestions: [],
    },
  });
  const result = await reviewConsultationAnswer({ ...input, complete });
  expect(result.ready).toBe(true);
  expect(result.memory?.goal).toBe("Application VM rights");
});
it("normalizes null evidence only for explicitly inapplicable boundaries", async () => {
  const complete = vi.fn().mockResolvedValue({
    requestChecks,
    ready: true,
    findings: [],
    boundaryChecks: [
      { id: "keys", applicable: false, covered: null, paragraphs: null },
    ],
  });
  expect((await reviewConsultationAnswer({ ...input, complete })).ready).toBe(
    true,
  );
  complete.mockResolvedValue({
    requestChecks,
    ready: true,
    findings: [],
    boundaryChecks: [
      { id: "keys", applicable: true, covered: null, paragraphs: null },
    ],
  });
  await expect(
    reviewConsultationAnswer({ ...input, complete }),
  ).rejects.toThrow();
});
it("rejects a mismatched request or invented user evidence even when ready is true", async () => {
  for (const check of [
    {
      ...requestChecks[0]!,
      met: false,
      actual: "A different profile was explained",
    },
    { ...requestChecks[0]!, userTurn: 40 },
  ]) {
    const complete = vi.fn().mockResolvedValue({
      ready: true,
      findings: [],
      requestChecks: [check],
      boundaryChecks: [
        { id: "keys", applicable: false, covered: false, paragraphs: [] },
      ],
    });
    expect((await reviewConsultationAnswer({ ...input, complete })).ready).toBe(
      false,
    );
  }
});
it("requires boundary coverage when a source-registered preset is described", async () => {
  const complete = vi.fn().mockResolvedValue({
    ready: true,
    findings: [],
    requestChecks,
    boundaryChecks: [
      { id: "keys", applicable: false, covered: false, paragraphs: [] },
    ],
  });
  expect(
    (
      await reviewConsultationAnswer({
        ...input,
        complete,
        answer: { ...answer, explanation: "Use application-vm-v1." },
        serviceFacts: {
          "project-templates": {
            criticalBoundaries: [
              {
                id: "keys",
                mustExplain: true,
                triggerIdentifiers: ["application-vm-v1"],
              },
            ],
          },
        },
      })
    ).ready,
  ).toBe(false);
});
it("requires the critical boundary of a compiler-proven preset even without its ID in the prose", async () => {
  const complete = vi.fn().mockResolvedValue({
    ready: true,
    findings: [],
    requestChecks,
    boundaryChecks: [
      { id: "keys", applicable: false, covered: false, paragraphs: [] },
    ],
  });
  expect(
    (
      await reviewConsultationAnswer({
        ...input,
        complete,
        compilerEvidence: {
          compilerDelta: [],
          verifiedOperations: [
            {
              kind: "registered-preset",
              source: "application-vm-v1",
              templates: ["central"],
              principals: ["requester", "automation"],
            },
          ],
        },
        serviceFacts: {
          "project-templates": {
            criticalBoundaries: [
              {
                id: "keys",
                mustExplain: true,
                triggerIdentifiers: ["application-vm-v1"],
              },
            ],
          },
        },
      })
    ).ready,
  ).toBe(false);
});
it("never silently truncates a contextual answer when adding the draft notice", () => {
  const text = "a".repeat(3500) + " Important final boundary.";
  expect(
    ensureDraftNotice(
      {
        ...answer,
        explanation: text,
        questions: [{ path: "devops.git_flavor", text: "Which plan?" }],
      },
      "en",
    ).explanation,
  ).toBe(text + "\n\nNothing has been saved.");
  expect(() =>
    ensureDraftNotice(
      {
        ...answer,
        explanation: "a".repeat(16380),
        questions: [{ path: "devops.git_flavor", text: "Which plan?" }],
      },
      "en",
    ),
  ).toThrow();
});

it("requires the current follow-up to be reviewed instead of replaying an earlier completed request", async () => {
  const turns = [
    { role: "user" as const, content: "Set Audit retention to 120 days." },
    { role: "assistant" as const, content: "Audit proposal accepted." },
    { role: "user" as const, content: "For Git, use the Accelerator default." },
  ];
  const pendingQuestions = [
    {
      path: "devops.allowed_network_ranges",
      text: "Who should reach Git?",
      answerType: "requirements" as const,
    },
  ];
  const complete = vi.fn().mockResolvedValue({
    ready: true,
    findings: [],
    boundaryChecks: [],
    requestChecks,
  });
  const checked = await reviewConsultationAnswer({
    ...input,
    turns,
    serviceFacts: {},
    pendingQuestions,
    complete,
  });
  expect(checked.ready).toBe(false);
  expect(checked.findings.join(" ")).toContain("current USER turn");
  const payload = JSON.parse(complete.mock.calls[0]![0][1].content);
  expect(payload.currentRequest).toMatchObject({
    userTurn: 2,
    text: turns[2]!.content,
  });
  expect(payload.pendingQuestions).toEqual(pendingQuestions);
  complete.mockResolvedValue({
    ready: true,
    findings: [],
    boundaryChecks: [],
    requestChecks: [{ ...requestChecks[0], userTurn: 2 }],
  });
  expect(
    (
      await reviewConsultationAnswer({
        ...input,
        turns,
        serviceFacts: {},
        pendingQuestions,
        complete,
      })
    ).ready,
  ).toBe(true);
});
