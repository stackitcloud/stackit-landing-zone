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
    met: true,
  },
];
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
