import { readFileSync, writeFileSync } from "node:fs";
import { buildAssistantKnowledge } from "../apps/api/src/assistant/knowledge.js";
import {
  AssistantInferenceError,
  modelServingConfiguration,
} from "../apps/api/src/assistant/model-serving.js";
import {
  assistantScenarioFixture,
  assistantScenarios,
  buildAssistantScenarioInventory,
  validateAssistantScenario,
} from "./assistant-scenarios.js";
import {
  assistantTestModel,
  assistantTestRequestIntervalMs,
} from "./assistant-test-model.js";
import { loadLocalModelServingToken } from "./local-assistant-credentials.js";

const inventoryPath = new URL(
  "../../docs/assistant-test-catalogue.json",
  import.meta.url,
);

async function run() {
  const args = process.argv.slice(2);
  const topicIndex = args.indexOf("--topic");
  const caseIndex = args.indexOf("--case");
  const topic = topicIndex >= 0 ? args[topicIndex + 1] : undefined;
  const caseId = caseIndex >= 0 ? args[caseIndex + 1] : undefined;
  const expected = new Set([
    "--check",
    "--generate",
    "--list",
    "--local-credentials",
    "--topic",
    "--case",
  ]);
  if (
    args.filter((arg) => ["--check", "--generate", "--list"].includes(arg))
      .length > 1
  )
    throw new Error("assistant_test_arguments_invalid");
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!arg || !expected.has(arg))
      throw new Error("assistant_test_arguments_invalid");
    if (arg === "--topic" || arg === "--case") index++;
  }
  if (
    (topicIndex >= 0 && !topic) ||
    (caseIndex >= 0 && !caseId) ||
    (topic &&
      topic !== "all" &&
      !assistantScenarios.some((scenario) => scenario.topic === topic)) ||
    (caseId && !assistantScenarios.some((scenario) => scenario.id === caseId))
  )
    throw new Error("assistant_test_arguments_invalid");
  const inventory = buildAssistantScenarioInventory();
  const rendered = `${JSON.stringify(inventory, null, 2)}\n`;
  if (args.includes("--generate")) {
    writeFileSync(inventoryPath, rendered);
    console.log(
      "Generated reviewed field inventory and synthetic scenario catalogue; no AI qualification claimed.",
    );
    return;
  }
  if (readFileSync(inventoryPath, "utf8") !== rendered)
    throw new Error("assistant_test_catalogue_stale");
  const scenarios = assistantScenarios.filter(
    (scenario) =>
      (!topic || topic === "all" || scenario.topic === topic) &&
      (!caseId || scenario.id === caseId),
  );
  if (!scenarios.length) throw new Error("assistant_test_arguments_invalid");
  if (args.includes("--check") || args.includes("--list")) {
    console.log(
      JSON.stringify(
        {
          status: "catalogue-current",
          fields: inventory.topics.reduce(
            (count, entry) => count + entry.fields.length,
            0,
          ),
          topics: inventory.topics.length,
          cases: scenarios.map(({ id, topic, message }) => ({
            id,
            topic,
            message,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }
  if (
    ["LZC_EXECUTION_ENABLED", "LZC_APPLICATION_EXECUTION_ENABLED"].some(
      (name) => process.env[name] === "true",
    )
  )
    throw new Error("execution_not_allowed");
  const token = args.includes("--local-credentials")
    ? loadLocalModelServingToken()
    : process.env.LZC_MODEL_SERVING_TOKEN;
  if (!token?.trim()) throw new Error("assistant_test_token_required");
  const configuration = modelServingConfiguration({
    ...process.env,
    LZC_MODEL_SERVING_TOKEN: token,
  });
  const model = assistantTestModel(configuration);
  const knowledge = buildAssistantKnowledge();
  let failed = 0;
  for (const scenario of scenarios) {
    const started = Date.now();
    let phase = "fixture";
    try {
      const fixture = assistantScenarioFixture(scenario);
      phase = "model";
      const result = await model.converse(
        {
          engineRevision: knowledge.engineRevision,
          knowledgeSha256: knowledge.sha256,
          groups: knowledge.groups,
        },
        fixture.values,
        fixture.history,
        scenario.message,
        fixture.catalogues,
      );
      phase = "validation";
      const checked = validateAssistantScenario(scenario, result);
      if (checked.failures.length) failed++;
      console.log(
        JSON.stringify({
          case: scenario.id,
          topic: scenario.topic,
          status: checked.failures.length ? "failed" : "passed",
          elapsedMs: Date.now() - started,
          failures: checked.failures,
          result: checked.dialogue,
        }),
      );
    } catch (error) {
      failed++;
      console.log(
        JSON.stringify({
          case: scenario.id,
          topic: scenario.topic,
          status: "failed",
          phase,
          elapsedMs: Date.now() - started,
          reason:
            error instanceof AssistantInferenceError
              ? error.reason
              : "scenario_validation_failed",
        }),
      );
    }
  }
  console.log(
    JSON.stringify({
      status: failed ? "failed" : "passed",
      qualification: "synthetic-smoke-and-regression-only",
      model: configuration.model,
      intentModel: configuration.intentModel ?? configuration.model,
      requestIntervalMs: assistantTestRequestIntervalMs,
      knowledgeSha256: knowledge.sha256,
      suiteSha256: inventory.suiteSha256,
      engineRevision: knowledge.engineRevision,
      total: scenarios.length,
      passed: scenarios.length - failed,
      failed,
      authorizesExecution: false,
    }),
  );
  if (failed) process.exitCode = 1;
}

run().catch((error: unknown) => {
  const reasons = new Set([
    "assistant_test_arguments_invalid",
    "assistant_test_catalogue_stale",
    "assistant_test_token_required",
    "assistant_model_configuration_invalid",
    "private_file_required",
    "original_key_required",
    "token_output_required",
    "execution_not_allowed",
  ]);
  console.error(
    JSON.stringify({
      status: "blocked",
      reason:
        error instanceof Error && reasons.has(error.message)
          ? error.message
          : "assistant_test_setup_failed",
    }),
  );
  process.exitCode = 1;
});
