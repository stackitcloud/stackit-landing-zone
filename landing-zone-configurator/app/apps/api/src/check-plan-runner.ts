import {
  CloudFoundryPlanRunner,
  RunnerRequestError,
} from "./plans/cloud-foundry.js";

const required = (key: string) => {
  const value = process.env[key];
  if (!value) throw new Error("Runner configuration missing");
  return value;
};
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
  console.log(
    JSON.stringify({
      service: "plan-runner-isolation",
      ok: true,
      runId: process.argv[2] ?? "manual",
      ...timing,
      ...(applicationTiming ? { application: applicationTiming } : {}),
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
}
