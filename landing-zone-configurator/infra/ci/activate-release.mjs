import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const receipt = JSON.parse(readFileSync(join(process.env.LZC_PRIVATE, "app-stage.json"), "utf8"));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
if (![receipt.app, receipt.package, receipt.build, receipt.droplet].every(x => typeof x === "string" && uuid.test(x)))
  throw new Error("Invalid staged application binding");
function cf(args, json = false) {
  const result = spawnSync("cf", args, { encoding: "utf8", ...(json ? {} : { stdio: "inherit" }) });
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
cf(["stop", "landing-zone-configurator"]);
cf(["set-droplet", "landing-zone-configurator", receipt.droplet]);
cf(["start", "landing-zone-configurator"]);
