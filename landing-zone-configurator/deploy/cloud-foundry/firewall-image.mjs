import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { chmod, copyFile, lstat, mkdir, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";

export async function prepareFirewallImage(
  image,
  directory,
  target,
  { consume = false } = {},
) {
  const url = new URL(image.url);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !/^[a-f0-9]{64}$/.test(image.sha256)
  )
    throw new Error("Invalid pinned firewall image descriptor");
  const cached = resolve(directory, `${image.sha256}.qcow2`);
  async function verified(path) {
    const info = await lstat(path);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      !info.size ||
      info.size > 1024 ** 3
    )
      throw new Error("Invalid pinned firewall image file");
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    if (hash.digest("hex") !== image.sha256)
      throw new Error("Pinned firewall image checksum mismatch");
    return info.size;
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const cacheInfo = await lstat(directory);
  if (!cacheInfo.isDirectory() || cacheInfo.isSymbolicLink())
    throw new Error("Invalid firewall image cache directory");
  const hit = await lstat(cached).then(
    () => true,
    (error) => {
      if (error.code !== "ENOENT") throw error;
      return false;
    },
  );
  if (!hit) {
    const part = `${cached}.${randomUUID()}.part`;
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
          image.url,
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
  if (target) {
    const existing = await lstat(target).then(
      () => true,
      (error) => {
        if (error.code !== "ENOENT") throw error;
        return false;
      },
    );
    if (existing) {
      if (consume)
        throw new Error("Image consumption requires an absent destination");
      await verified(target);
    } else {
      if (consume) await rename(cached, target);
      else await copyFile(cached, target, constants.COPYFILE_FICLONE);
      await chmod(target, 0o600);
      await verified(target);
    }
  }
  return { sha256: image.sha256, bytes, cacheHit: hit };
}
