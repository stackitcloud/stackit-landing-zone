import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { prepareFirewallImage } from "./firewall-image.mjs";

const [build, cache] = process.argv.slice(2);
if (!build?.startsWith("/") || !cache?.startsWith("/"))
  throw new Error("Absolute CF build and cache directories required");
const { platformFirewallImage, platformRunnerSourceSchema } = await import(
  pathToFileURL(resolve(build, "packages/contracts/dist/index.js"))
);
const roots = [];
for (const candidate of [build, resolve(build, "inspection")]) {
  const metadata = await readFile(
    resolve(candidate, "platform-source.json"),
    "utf8",
  ).then(
    (value) => platformRunnerSourceSchema.parse(JSON.parse(value)),
    (error) => {
      if (error.code !== "ENOENT") throw error;
      return null;
    },
  );
  if (metadata) {
    if (metadata.firewallImageSha256 !== platformFirewallImage.sha256)
      throw new Error(
        "Staging image does not match the qualified runner capability",
      );
    const root = resolve(candidate, "accelerator");
    const info = await lstat(root);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error("Invalid staged accelerator directory");
    roots.push(root);
  }
}
if (roots.length !== 1)
  throw new Error("Exactly one qualified runner root required");
const result = await prepareFirewallImage(
  platformFirewallImage,
  resolve(cache, "lzc-firewall-images"),
  resolve(roots[0], "firewall-image.qcow2"),
  { hardlink: true },
);
console.log(
  `Verified staged firewall image: ${JSON.stringify({ ...result, materialization: "hardlink" })}`,
);
