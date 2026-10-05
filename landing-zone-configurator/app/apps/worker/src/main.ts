import { runWorker } from "./runner.js";

const local = process.env.LZC_LOCAL_RUNNER === "true";
const broker = process.env.LZC_RUNNER_BROKER;
if (broker !== undefined && broker !== "platform" && broker !== "application")
  throw new Error("Invalid runner broker profile");
const outcome = await runWorker({
  root: local ? (process.env.LZC_RUNNER_PACKAGE_ROOT ?? "") : process.cwd(),
  ...(local ? { local: true, workRoot: process.cwd() } : {}),
  id: process.env.LZC_RUN_ID,
  ticket: process.env.LZC_RUN_TICKET,
  brokerOrigin: process.env.LZC_BROKER_ORIGIN,
  broker: broker === "application" ? "application" : "platform",
});
process.exitCode = outcome === "succeeded" ? 0 : 1;
