import { expect, it } from "vitest";
import { assistantPolicyBoundaryFailures } from "../scripts/assistant-scenarios.js";

const answer = {
  explanation:
    "The native firewall_config has these inputs, but chat cannot configure rules or NAT. The firewall administrator configures policy manually in OPNsense after provisioning. Nothing has been configured or saved.",
  questions: [],
  changes: [],
  references: ["firewall-policy"],
};
it("checks capabilities and the manual path, without prescribing a literal issue-reference sentence", () => {
  expect(assistantPolicyBoundaryFailures(answer)).toEqual([]);
  expect(
    assistantPolicyBoundaryFailures({
      ...answer,
      explanation: "GitHub-Issue #101",
    }),
  ).not.toEqual([]);
});
it.each([
  [
    "chat boundary",
    answer.explanation.replace(
      "chat cannot configure rules or NAT",
      "chat configures all rules automatically",
    ),
  ],
  [
    "manual operation",
    answer.explanation.replace(
      "manually in OPNsense",
      "in an unspecified tool",
    ),
  ],
  [
    "unchanged configuration",
    answer.explanation.replace("Nothing has been configured or saved.", ""),
  ],
])("rejects a missing %s", (_reason, explanation) => {
  expect(
    assistantPolicyBoundaryFailures({ ...answer, explanation }),
  ).not.toEqual([]);
});

it("recognizes the firewall administrator's equivalent German role name", () => {
  expect(
    assistantPolicyBoundaryFailures({
      ...answer,
      explanation: answer.explanation.replace(
        "firewall administrator",
        "Firewall-Verantwortliche",
      ),
    }),
  ).toEqual([]);
});
