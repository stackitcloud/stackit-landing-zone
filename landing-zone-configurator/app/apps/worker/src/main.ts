import { runWorker } from "./runner.js";
import { runWarmRunner } from "./warm-runner.js";

const local = process.env.LZC_LOCAL_RUNNER === "true";
const broker = process.env.LZC_RUNNER_BROKER;
if (broker !== undefined && broker !== "platform" && broker !== "application")
  throw new Error("Invalid runner broker profile");
const pool =
  process.env.LZC_POOL_RUNNER_ID !== undefined ||
  process.env.LZC_POOL_TICKET !== undefined;
const shutdown = new AbortController();
const stop = () => shutdown.abort();
const removeShutdownListeners = () => {
  process.off("SIGTERM", stop);
  process.off("SIGINT", stop);
};
if (pool) {
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}
const outcome = pool
  ? await runWarmRunner(
      { root: process.cwd(), signal: shutdown.signal },
      {
        execute: (options) => {
          removeShutdownListeners();
          return runWorker(options);
        },
      },
    ).finally(removeShutdownListeners)
  : await runWorker({
      root: local ? (process.env.LZC_RUNNER_PACKAGE_ROOT ?? "") : process.cwd(),
      ...(local ? { local: true, workRoot: process.cwd() } : {}),
      id: process.env.LZC_RUN_ID,
      ticket: process.env.LZC_RUN_TICKET,
      brokerOrigin: process.env.LZC_BROKER_ORIGIN,
      broker: broker === "application" ? "application" : "platform",
    });
process.exitCode = outcome === "succeeded" ? 0 : 1;
