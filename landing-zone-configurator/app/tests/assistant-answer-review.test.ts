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
    const complete = vi
      .fn()
      .mockResolvedValue({ ready: true, findings: [], boundaryChecks });
    expect((await reviewConsultationAnswer({ ...input, complete })).ready).toBe(
      false,
    );
  },
);
it("retains a reviewed answer and source-bound memory with actual boundary evidence", async () => {
  const complete = vi.fn().mockResolvedValue({
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
