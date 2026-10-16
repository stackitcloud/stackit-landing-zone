import { modelServingConfiguration } from "../apps/api/src/assistant/model-serving.js";
import { loadLocalModelServingToken } from "./local-assistant-credentials.js";

try {
  if (
    ["LZC_EXECUTION_ENABLED", "LZC_APPLICATION_EXECUTION_ENABLED"].some(
      (name) => process.env[name] === "true",
    )
  )
    throw new Error("execution_not_allowed");
  const token = loadLocalModelServingToken();
  modelServingConfiguration({ ...process.env, LZC_MODEL_SERVING_TOKEN: token });
  process.env.LZC_MODEL_SERVING_TOKEN = token;
  process.env.LZC_ASSISTANT_ENABLED = "true";
  await import("./local-stackit-login.js");
} catch {
  console.error(JSON.stringify({ event: "local_assistant_start_blocked" }));
  process.exitCode = 1;
}
