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
  await runner.probe(required("LZC_PUBLIC_ORIGIN"));
  console.log(JSON.stringify({ service: "plan-runner-isolation", ok: true }));
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
