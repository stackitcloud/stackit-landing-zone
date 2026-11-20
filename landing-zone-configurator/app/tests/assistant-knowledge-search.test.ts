import { expect, it } from "vitest";
import {
  assistantKnowledgeContext,
  buildAssistantKnowledge,
} from "../apps/api/src/assistant/knowledge.js";
import { searchAssistantKnowledge } from "../apps/api/src/assistant/knowledge-search.js";

const k = buildAssistantKnowledge();
const context = assistantKnowledgeContext({
  engineRevision: k.engineRevision,
  knowledgeSha256: k.sha256,
  groups: k.groups,
});
const sources = context.rules.filter((rule) =>
  context.topics.some((topic) => topic.id === rule.id),
);
it("finds actual State coordination facts without classifying the question as a lifecycle form", () => {
  expect(
    searchAssistantKnowledge(
      sources,
      "concurrent State access conditional S3 writes CLI native locking PostgreSQL",
    )[0]?.id,
  ).toBe("management-state");
});
it("finds DNS role facts and keeps searches inside the supplied bundle", () => {
  expect(
    searchAssistantKnowledge(
      sources,
      "primary secondary authoritative DNS zone",
    )[0]?.id,
  ).toBe("dns-zones");
  expect(
    searchAssistantKnowledge(
      sources.filter((source) => source.id !== "dns-zones"),
      "primary secondary authoritative DNS zone",
    ).some((hit) => hit.id === "dns-zones"),
  ).toBe(false);
});
it("does not turn short generic default replies into an unrelated topic switch", () => {
  expect(
    searchAssistantKnowledge(sources, "My answer: please use the default"),
  ).toEqual([]);
  expect(searchAssistantKnowledge(sources, "qwertyuiop asdfghjkl")).toEqual([]);
});
