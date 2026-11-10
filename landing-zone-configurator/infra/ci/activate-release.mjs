import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { join } from "node:path";
import { waitForProductionReplicas } from "./production-readiness.mjs";

const receipt = JSON.parse(readFileSync(join(process.env.LZC_PRIVATE, "app-stage.json"), "utf8"));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
if (![receipt.app, receipt.package, receipt.build, receipt.droplet].every(x => typeof x === "string" && uuid.test(x)))
  throw new Error("Invalid staged application binding");
function cf(args, json = false) {
  const result = spawnSync("cf", args, { encoding: "utf8", ...(json ? { timeout: 45_000 } : { stdio: "inherit" }) });
  if (result.status !== 0) throw new Error("CF release activation failed");
  return json ? JSON.parse(result.stdout) : undefined;
}
const app = cf(["curl", `/v3/apps/${receipt.app}`], true);
const build = cf(["curl", `/v3/builds/${receipt.build}`], true);
const droplet = cf(["curl", `/v3/droplets/${receipt.droplet}`], true);
if (app.name !== "landing-zone-configurator" || app.relationships.space.data.guid !== process.env.LZC_CF_SPACE_ID ||
    build.state !== "STAGED" || build.package.guid !== receipt.package || build.droplet.guid !== receipt.droplet ||
    droplet.state !== "STAGED" || droplet.relationships.app.data.guid !== receipt.app)
  throw new Error("Staged application no longer matches the verified release");
cf(["apply-manifest", "-f", "deploy/cloud-foundry/manifest.yml", "--vars-file", join(process.env.LZC_PRIVATE, "app-vars.json"), "--redact-env"]);
if (process.env.LZC_ENVIRONMENT === "lzc-prod" && app.state === "STARTED") {
  const deployment = cf(["curl", "/v3/deployments", "-X", "POST", "-d", JSON.stringify({
    relationships: {app: {data: {guid: receipt.app}}}, droplet: {guid: receipt.droplet}, strategy: "rolling", options: {max_in_flight: 1},
  })], true);
  if (!uuid.test(deployment.guid)) throw new Error("Missing rolling deployment identity");
  const deadline = Date.now() + 20 * 60_000;
  for (;;) {
    const current = cf(["curl", `/v3/deployments/${deployment.guid}`], true);
    if (current.relationships?.app?.data?.guid !== receipt.app) throw new Error("Rolling deployment destination changed");
    if (current.status?.value === "FINALIZED") {
      if (current.status.reason !== "DEPLOYED") throw new Error("Rolling deployment did not complete successfully");
      break;
    }
    if (Date.now() >= deadline) throw new Error("Rolling deployment timed out; inspect CF before another release");
    await delay(5_000);
  }
} else {
  if (process.env.LZC_ENVIRONMENT !== "lzc-prod") cf(["stop", "landing-zone-configurator"]);
  cf(["set-droplet", "landing-zone-configurator", receipt.droplet]);
  cf(["start", "landing-zone-configurator"]);
}
if (process.env.LZC_ENVIRONMENT === "lzc-prod") {
  await waitForProductionReplicas({
    readProcesses: () => cf(["curl", `/v3/apps/${receipt.app}/processes`], true),
    readStats: guid => cf(["curl", `/v3/processes/${guid}/stats`], true),
  });
}
