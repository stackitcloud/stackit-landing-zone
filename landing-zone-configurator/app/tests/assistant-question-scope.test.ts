import { expect, it } from "vitest";
import {
  assistantAuditQueryAuthenticationFailures,
  assistantQuestionScopeFailures,
} from "../scripts/assistant-scenarios.js";

const answer = {
  explanation: "Choose the missing audit settings.",
  changes: [],
  references: ["audit-logs"],
  questions: [
    "observability",
    "audit_logs.link_scopes",
    "audit_logs.acl",
    "audit_logs.s3_object_lock",
    "audit_logs.retention_days",
  ].map((path) => ({ path, text: `Choose ${path}`, options: [] })),
};
it("allows five independent audit decisions within the canonical dialogue budget", () => {
  expect(
    assistantQuestionScopeFailures(answer, ["audit_logs", "observability"]),
  ).toEqual([]);
});
it("rejects mutations, no questions and questions over the public schema budget", () => {
  for (const candidate of [
    { ...answer, changes: [{ path: "audit_logs", value: null }] },
    { ...answer, questions: [] },
    {
      ...answer,
      questions: Array.from({ length: 9 }, () => answer.questions[0]!),
    },
  ])
    expect(
      assistantQuestionScopeFailures(candidate, [
        "audit_logs",
        "observability",
      ]),
    ).toContain("missing_safe_questions_only");
});
it("rejects unrelated questions and a repeated plan question after Git sizing is resolved", () => {
  for (const path of ["vpn", "devops.git_flavor"]) {
    expect(
      assistantQuestionScopeFailures(
        { ...answer, questions: [{ path, text: "Choose", options: [] }] },
        ["devops.allowed_network_ranges"],
      ),
    ).toContain("unrelated_or_resolved_question");
  }
});
const authentication = {
  ...answer,
  questions: [],
  explanation:
    "With Observability, use Grafana SSO for the dashboard. Technical data credentials are separate from human login. Without Observability, a separate Logs instance provides read and write API tokens and a query URL in Secrets Manager. Use its API or a configured Grafana datasource; not a promised Logs SSO console. Do not put secrets in chat.",
};
it("requires separate human dashboard login and fallback query credentials", () => {
  expect(assistantAuditQueryAuthenticationFailures(authentication)).toEqual([]);
  expect(
    assistantAuditQueryAuthenticationFailures({
      ...authentication,
      explanation:
        "With Observability use Grafana SSO. Without Observability use the Logs SSO console, with no credentials managed. Nothing changed.",
    }),
  ).toEqual(
    expect.arrayContaining([
      "fallback_logs_query_credentials_missing",
      "unsupported_logs_console_promise",
    ]),
  );
  expect(
    assistantAuditQueryAuthenticationFailures({
      ...authentication,
      explanation: authentication.explanation.replace(
        "read and write API tokens",
        "access",
      ),
    }),
  ).toContain("fallback_logs_query_credentials_missing");
});
