import pg from "pg";
import {
  CloudFoundryPlanRunner,
  RunnerRequestError,
} from "./plans/cloud-foundry.js";
import { ArtifactCrypto } from "./plans/crypto.js";
import { RunnerPool, runnerPoolSize } from "./plans/runner-pool.js";
import { databaseConfig } from "./storage/database.js";

const required = (key: string) => {
  const value = process.env[key];
  if (!value) throw new Error("Runner configuration missing");
  return value;
};
let database: pg.Pool | undefined;
try {
  const config = {
    username: required("LZC_RUNNER_CF_USERNAME"),
    password: required("LZC_RUNNER_CF_PASSWORD"),
    spaceId: required("LZC_RUNNER_SPACE_ID"),
    templateId: required("LZC_RUNNER_TEMPLATE_ID"),
    ...(process.env.LZC_EXECUTION_ENABLED === "true"
      ? { dropletId: required("LZC_RUNNER_DROPLET_ID") }
      : {}),
  };
  const runner = new CloudFoundryPlanRunner(config);
  const application = JSON.parse(required("VCAP_APPLICATION"));
  const timing = await runner.probe(
    required("LZC_PUBLIC_ORIGIN"),
    application.application_id,
  );
  const applicationTiming =
    process.env.LZC_APPLICATION_EXECUTION_ENABLED === "true"
      ? await new CloudFoundryPlanRunner({
          ...config,
          broker: "application",
        }).probe(required("LZC_PUBLIC_ORIGIN"), application.application_id)
      : undefined;
  const size = runnerPoolSize(process.env.LZC_RUNNER_POOL_SIZE);
  let warm: Awaited<ReturnType<RunnerPool["probe"]>> | undefined;
  if (size > 0) {
    database = new pg.Pool(databaseConfig());
    database.on("error", () => {
      console.error(JSON.stringify({ event: "runner_probe_database_error" }));
    });
    const pool = new RunnerPool(
      database,
      new ArtifactCrypto(required("LZC_DEPLOYMENT_ARTIFACT_KEY")),
      runner,
      {
        ...config,
        dropletId: required("LZC_RUNNER_DROPLET_ID"),
        size,
        origin: required("LZC_PUBLIC_ORIGIN"),
      },
    );
    warm = await pool.probe();
  }
  console.log(
    JSON.stringify({
      service: "plan-runner-isolation",
      ok: true,
      runId: process.argv[2] ?? "manual",
      ...timing,
      ...(applicationTiming ? { application: applicationTiming } : {}),
      ...(warm ? { warm } : {}),
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      service: "plan-runner-isolation",
      ok: false,
      ...(error instanceof RunnerRequestError
        ? { operation: error.operation, httpStatus: error.status }
        : {}),
    }),
  );
  process.exitCode = 1;
} finally {
  await database?.end();
}
