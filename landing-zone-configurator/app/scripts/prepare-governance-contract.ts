// Copies real reviewed Accelerator sources, never a reimplementation of resources.
// Hashes bind qualification to the engine pin even on a shallow CI checkout.
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import evidence from "../integration/fixtures/governance/source.json" with {
  type: "json",
};
import { platformUpgradeAcceleratorCommit } from "../packages/contracts/dist/index.js";

const target = process.argv[2];
if (!target?.startsWith("/"))
  throw new Error("Absolute fixture directory required");
if (evidence.acceleratorRevision !== platformUpgradeAcceleratorCommit)
  throw new Error("Requalify governance for the updated engine pin");
for (const [path, expected] of Object.entries(evidence.files)) {
  const source = new URL(`../../../${path}`, import.meta.url);
  if (
    createHash("sha256").update(readFileSync(source)).digest("hex") !== expected
  )
    throw new Error(`Requalify changed Accelerator source: ${path}`);
  if (path.startsWith("src/modules/governance/"))
    copyFileSync(
      source,
      resolve(target, path.slice("src/modules/governance/".length)),
    );
}
mkdirSync(resolve(target, "tests"), { recursive: true });
copyFileSync(
  new URL(
    "../integration/fixtures/governance/governance.tftest.hcl",
    import.meta.url,
  ),
  resolve(target, "tests/governance.tftest.hcl"),
);
// Retain reviewed versions/checksums, restricted to this actual module's dependencies.
const runnerLock = readFileSync(
  new URL("../../deploy/runner/accelerator.lock.hcl", import.meta.url),
  "utf8",
);
const locks = [
  ...runnerLock.matchAll(
    /provider "registry\.opentofu\.org\/(?:stackitcloud\/stackit|hashicorp\/time)" \{[\s\S]*?\n\}/g,
  ),
].map((match) =>
  match[0].replace(
    /constraints = "[^"]+"/,
    `constraints = ">= ${match[0].includes("stackitcloud/stackit") ? "0.114.0" : "0.14.1"}"`,
  ),
);
if (locks.length !== 2)
  throw new Error("Reviewed governance provider locks missing");
writeFileSync(
  resolve(target, ".terraform.lock.hcl"),
  `${locks.join("\n\n")}\n`,
);

console.log(
  "Prepared actual pinned governance module with mocked providers; no cloud credentials or Apply.",
);
