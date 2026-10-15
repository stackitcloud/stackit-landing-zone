import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareFirewallImage } from "../../deploy/cloud-foundry/firewall-image.mjs";
import { platformFirewallImage } from "../packages/contracts/dist/index.js";

if (process.argv[2] && !process.argv[2].startsWith("/"))
  throw new Error("Absolute native root required");
const result = await prepareFirewallImage(
  platformFirewallImage,
  fileURLToPath(new URL("../../.local/firewall-images/", import.meta.url)),
  process.argv[2]
    ? resolve(process.argv[2], "firewall-image.qcow2")
    : undefined,
);
console.log(
  `Verified repository-pinned firewall image: ${JSON.stringify(result)}`,
);
