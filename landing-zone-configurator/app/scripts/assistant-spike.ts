import { readFileSync } from "node:fs";
import { buildAssistantKnowledge } from "../apps/api/src/assistant/knowledge.js";
import {
  AssistantModelServing,
  modelServingConfiguration,
} from "../apps/api/src/assistant/model-serving.js";
import { buildAssistantCoverage } from "./assistant-coverage.js";

async function run() {
  const coverage = buildAssistantCoverage();
  const recorded = JSON.parse(
    readFileSync(
      new URL("../../docs/assistant-feature-coverage.json", import.meta.url),
      "utf8",
    ),
  );
  if (JSON.stringify(recorded) !== JSON.stringify(coverage))
    throw new Error("assistant_coverage_stale");
  const configuration = modelServingConfiguration(process.env);
  const knowledge = buildAssistantKnowledge();
  const result = await new AssistantModelServing(
    configuration,
  ).qualifyKnowledge({
    engineRevision: knowledge.engineRevision,
    knowledgeSha256: knowledge.sha256,
    groups: knowledge.groups,
  });
  process.stdout.write(
    `${JSON.stringify({
      status: "synthetic-roundtrip-only",
      model: result.model,
      engineRevision: result.engineRevision,
      knowledgeSha256: result.knowledgeSha256,
      elapsedMs: result.elapsedMs,
      templateId: result.proposal.templateId,
      questionCount: result.proposal.questions.length,
      referenceCount: result.proposal.references.length,
      authorizesExecution: false,
    })}\n`,
  );
}

run().catch((error: unknown) => {
  const allowed = new Set([
    "assistant_model_configuration_invalid",
    "assistant_coverage_stale",
    "assistant_knowledge_version_mismatch",
  ]);
  const reason =
    error instanceof Error && allowed.has(error.message)
      ? error.message
      : "assistant_inference_failed";
  process.stderr.write(
    `${JSON.stringify({ status: "blocked-or-failed", reason })}\n`,
  );
  process.exitCode = 1;
});
