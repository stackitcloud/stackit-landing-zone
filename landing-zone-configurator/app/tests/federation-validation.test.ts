import {
  createCommonConfiguration,
  editCommonInput,
  editorIssues,
  readCommonConfiguration,
} from "@lzc/domain";
import { expect, it } from "vitest";

const valid = {
  name: "github-actions",
  issuer: "https://token.actions.githubusercontent.com",
  assertions: [
    { item: "aud", operator: "equals", value: "sts.accounts.stackit.cloud" },
    {
      item: "sub",
      operator: "equals",
      value: "repo:example/platform:ref:refs/heads/main",
    },
  ],
};
function document(providers: unknown[]) {
  return editCommonInput(
    createCommonConfiguration("standalone", crypto.randomUUID()),
    "federated_identity_providers",
    providers as (typeof valid)[],
  );
}
it("accepts disabled federation and exact GitHub conditions", () => {
  for (const providers of [[], [valid]])
    expect(
      editorIssues(document(providers)).filter((i) =>
        i.field.startsWith("federated_identity_providers"),
      ),
    ).toEqual([]);
});
it("rejects duplicate names, unsafe issuer URLs, empty claims, missing audience and unsupported operators without rewriting imports", () => {
  const malformed = {
    name: "github-actions",
    issuer: "http://issuer.example.com",
    assertions: [{ item: "", operator: "contains", value: "" }],
  };
  const draft = document([valid, malformed]);
  const restored = readCommonConfiguration(JSON.parse(JSON.stringify(draft)));
  expect(restored).toEqual(draft);
  const fields = editorIssues(restored).map((i) => i.field);
  for (const suffix of [
    "name",
    "issuer",
    "assertions",
    "assertions.0.item",
    "assertions.0.value",
    "assertions.0.operator",
  ])
    expect(fields).toContain(`federated_identity_providers.1.${suffix}`);
});
it("requires names and rejects issuer credentials while preserving arbitrary exact claims", () => {
  const draft = document([
    {
      ...valid,
      name: " ",
      issuer: "https://user:password@issuer.example.com",
      assertions: [
        ...valid.assertions,
        { item: "custom_team", operator: "equals", value: "Team Alpha" },
      ],
    },
  ]);
  const fields = editorIssues(draft)
    .filter((i) => i.field.startsWith("federated_identity_providers"))
    .map((i) => i.field);
  expect(fields).toEqual([
    "federated_identity_providers.0.name",
    "federated_identity_providers.0.issuer",
  ]);
});
