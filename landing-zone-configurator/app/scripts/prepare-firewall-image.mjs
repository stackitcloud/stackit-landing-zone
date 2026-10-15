import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { chmod, copyFile, lstat, mkdir, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { platformFirewallImage } from "../packages/contracts/dist/index.js";

const directory = fileURLToPath(
  new URL("../../.local/firewall-images/", import.meta.url),
);
const cached = resolve(directory, `${platformFirewallImage.sha256}.qcow2`);
async function verified(path) {
  const info = await lstat(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.size > 1024 ** 3 ||
    !info.size
  )
    throw new Error("Invalid pinned firewall image file");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  if (hash.digest("hex") !== platformFirewallImage.sha256)
    throw new Error("Pinned firewall image checksum mismatch");
  return info.size;
}
await mkdir(directory, { recursive: true, mode: 0o700 });
if (
  !(await lstat(cached).catch((error) => {
    if (error.code !== "ENOENT") throw error;
    return null;
  }))
) {
  const part = `${cached}.${process.pid}.part`;
  try {
    execFileSync(
      "curl",
      [
        "--fail",
        "--location",
        "--proto",
        "=https",
        "--proto-redir",
        "=https",
        "--retry",
        "3",
        "--retry-all-errors",
        "--connect-timeout",
        "20",
        "--max-time",
        "600",
        "--max-filesize",
        String(1024 ** 3),
        "--silent",
        "--show-error",
        "--output",
        part,
        platformFirewallImage.url,
      ],
      { stdio: ["ignore", "ignore", "inherit"], timeout: 650000 },
    );
    await verified(part);
    await chmod(part, 0o600);
    await rename(part, cached);
  } finally {
    await rm(part, { force: true });
  }
}
const bytes = await verified(cached);
if (process.argv[2]) {
  if (!process.argv[2].startsWith("/"))
    throw new Error("Absolute native root required");
  const target = resolve(process.argv[2], "firewall-image.qcow2");
  await copyFile(cached, target, constants.COPYFILE_FICLONE);
  await chmod(target, 0o600);
  await verified(target);
}
console.log(
  `Verified repository-pinned firewall image: sha256=${platformFirewallImage.sha256} bytes=${bytes}`,
);
