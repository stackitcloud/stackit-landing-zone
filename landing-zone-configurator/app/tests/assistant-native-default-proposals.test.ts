import { expect, it, vi } from "vitest";
import { consultationNativeDefault } from "../apps/api/src/assistant/consultation.js";
import { assistantEditorPolicies } from "../apps/api/src/assistant/editor.js";
import { materializeNativeDefaultProposals } from "../apps/api/src/assistant/native-default-proposals.js";

it("fills omitted creation inputs from the native contract without inventing a Git plan or mutating the input", () => {
  const input = [
    {
      path: "devops",
      operation: "merge" as const,
      value: { git_flavor: "git-100" },
    },
  ];
  const result = materializeNativeDefaultProposals(
    input,
    {},
    assistantEditorPolicies,
    consultationNativeDefault,
    () => true,
  );
  expect(result.changes[0]?.value).toEqual({
    git_flavor: "git-100",
    allowed_network_ranges: ["0.0.0.0/0"],
  });
  expect(input[0]?.value).toEqual({ git_flavor: "git-100" });
  expect(result.defaults).toContainEqual({
    path: "devops.allowed_network_ranges",
    value: ["0.0.0.0/0"],
    source: "src/variables.tf",
    origin: "proposal-default",
  });
  const empty = materializeNativeDefaultProposals(
    [{ path: "devops", operation: "merge", value: {} }],
    {},
    assistantEditorPolicies,
    consultationNativeDefault,
    () => true,
  );
  expect(empty.changes[0]?.value).not.toHaveProperty("git_flavor");
});
it("preserves explicit null, false, empty lists and existing component omissions", () => {
  const read = () => ({ found: true, value: 42, source: "native" });
  const policies = {
    sample: { creationDecisions: ["sample.a", "sample.b", "sample.c"] },
  };
  const values = { a: null, b: false, c: [] };
  expect(
    materializeNativeDefaultProposals(
      [{ path: "sample", operation: "merge", value: values }],
      {},
      policies,
      read,
      () => true,
    ).changes[0]?.value,
  ).toEqual(values);
  expect(
    materializeNativeDefaultProposals(
      [{ path: "sample", operation: "merge", value: {} }],
      { sample: { a: 7 } },
      policies,
      read,
      () => true,
    ).changes[0]?.value,
  ).toEqual({});
});
it("does not materialize unknown nested inputs or read protected defaults", () => {
  const read = vi.fn(() => ({ found: false, value: null, source: "native" }));
  const result = materializeNativeDefaultProposals(
    [{ path: "sample", operation: "merge", value: {} }],
    {},
    {
      sample: { creationDecisions: ["sample.missing.child", "sample.secret"] },
    },
    read,
    (path) => !path.includes("secret"),
  );
  expect(result.changes[0]?.value).toEqual({});
  expect(read.mock.calls.flat()).not.toContain("sample.secret");
});
it("records default-reset provenance without converting null to a guessed retention", () => {
  const result = materializeNativeDefaultProposals(
    [
      {
        path: "observability.metrics_retention_days",
        operation: "default",
        value: null,
      },
    ],
    {},
    assistantEditorPolicies,
    consultationNativeDefault,
    () => true,
  );
  expect(result.changes[0]?.value).toBeNull();
  expect(result.defaults).toContainEqual({
    path: "observability.metrics_retention_days",
    value: null,
    source: "src/variables.tf",
    origin: "proposal-default",
  });
});
