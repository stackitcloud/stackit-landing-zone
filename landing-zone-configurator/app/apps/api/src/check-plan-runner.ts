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
  const runner = new CloudFoundryPlanRunner({
    username: required("LZC_RUNNER_CF_USERNAME"),
    password: required("LZC_RUNNER_CF_PASSWORD"),
    spaceId: required("LZC_RUNNER_SPACE_ID"),
    templateId: required("LZC_RUNNER_TEMPLATE_ID"),
  });
  const application = JSON.parse(required("VCAP_APPLICATION"));
  const timing = await runner.probe(
    required("LZC_PUBLIC_ORIGIN"),
    application.application_id,
  );
  console.log(
    JSON.stringify({
      service: "plan-runner-isolation",
      ok: true,
      runId: process.argv[2] ?? "manual",
      ...timing,
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
