import { fileURLToPath } from "node:url";
import { modelServingConfiguration } from "../apps/api/src/assistant/model-serving.js";
import { openDevelopmentAccount } from "./development-auth.js";
import { loadLocalModelServingToken } from "./local-assistant-credentials.js";

let stage = "origin-and-runtime";
try {
  if (process.env.NODE_ENV === "production" || process.env.VCAP_APPLICATION)
    throw new Error("hosted_runtime_not_allowed");
  if (
    process.env.LZC_EXECUTION_ENABLED === "true" &&
    !process.argv.includes("--execution")
  )
    throw new Error("explicit_execution_flag_required");
  if (process.env.LZC_APPLICATION_EXECUTION_ENABLED === "true")
    throw new Error("application_execution_requires_separate_setup");
  const origin = new URL(
    process.env.LZC_DEVELOPMENT_ORIGIN ??
      "https://work.lukas.runs.onstackit.cloud:4181",
  );
  if (
    origin.protocol !== "https:" ||
    origin.origin !== origin.href.replace(/\/$/, "") ||
    origin.username ||
    origin.password
  )
    throw new Error("canonical_https_development_origin_required");
  stage = "private-development-account";
  await openDevelopmentAccount(
    fileURLToPath(new URL("../../.local/development/", import.meta.url)),
  );
  stage = "assistant-credentials";
  const token =
    process.env.LZC_MODEL_SERVING_TOKEN ?? loadLocalModelServingToken();
  modelServingConfiguration({ ...process.env, LZC_MODEL_SERVING_TOKEN: token });
  process.env.LZC_MODEL_SERVING_TOKEN = token;
  process.env.LZC_ASSISTANT_ENABLED = "true";
  process.argv.push("--development");
  stage = "local-runtime";
  await import("./local-stackit-login.js");
} catch (error) {
  console.error(
    JSON.stringify({
      event: "workstation_start_blocked",
      stage,
      ...(error instanceof Error && /^[a-z_]{1,100}$/.test(error.message)
        ? { code: error.message }
        : {}),
    }),
  );
  process.exitCode = 1;
}
