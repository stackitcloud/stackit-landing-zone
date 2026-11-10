// Public destinations only. Credentials and provisioned IDs stay in protected Environments.
const stages = {
  "lzc-dev": {
    name: "lzc-dev",
    region: "eu01",
    prefix: "lzc-dev",
    publicOrigin: "https://lzc-dev-configurator.apps.01.cf.eu01.stackit.cloud",
    route: "lzc-dev-configurator.apps.01.cf.eu01.stackit.cloud",
    mutationGroup: "configurator-lzc-dev-mutation",
    appInstances: 1,
    runnerPoolSize: 1,
  },
  "lzc-prod": {
    name: "lzc-prod",
    region: "eu01",
    prefix: "lzc-prod",
    publicOrigin: "https://app.landing-zone.runs.onstackit.cloud",
    route: "app.landing-zone.runs.onstackit.cloud",
    mutationGroup: "configurator-lzc-prod-mutation",
    appInstances: 3,
    runnerPoolSize: 2,
    zone: "landing-zone.runs.onstackit.cloud",
  },
};

export function deploymentStage(name) {
  if (!Object.hasOwn(stages, name)) throw new Error("Unsupported environment");
  return Object.freeze({ ...stages[name] });
}
