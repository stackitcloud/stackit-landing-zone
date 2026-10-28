import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type ApplicationExecutionManifest,
  applicationExecutionManifestSchema,
} from "../application-execution.js";

/** Stable payload identity excludes its enclosing package path, includes every file. */
export async function applicationSourcePayloadSha256(root: string) {
  const hash = createHash("sha256");
  let count = 0,
    bytes = 0;
  async function add(relative: string) {
    const path = join(root, relative),
      info = await lstat(path);
    if (info.isSymbolicLink() || ++count > 4096)
      throw new Error("Unsafe Application source entry");
    if (
      /(^|\/)(\.terraform|\.terraform\.tfstate\.lock\.info|.*\.tfstate(?:\..*)?|.*\.tfplan|plan\.bin|saved-plan\.bin|credential\.json|.*\.log)(\/|$)/.test(
        relative,
      ) ||
      /(^|\/)(landing-zone|terraform\.auto)\.tfvars(?:\.json)?$/.test(relative)
    )
      throw new Error("Unsafe Application source artifact");
    hash.update(`${relative}\0${info.isDirectory() ? "directory" : "file"}\0`);
    if (info.isDirectory()) {
      for (const name of (await readdir(path)).sort())
        await add(relative ? `${relative}/${name}` : name);
    } else if (info.isFile()) {
      bytes += info.size;
      if (bytes > 64 * 1024 * 1024)
        throw new Error("Application source payload too large");
      hash.update(`${info.size}\0`);
      for await (const chunk of createReadStream(path)) hash.update(chunk);
    } else throw new Error("Unsafe Application source entry");
  }
  await add("");
  return hash.digest("hex");
}
export async function readApplicationExecutionManifest(
  root: string,
): Promise<ApplicationExecutionManifest | null> {
  const path = join(root, "application-execution.json");
  const metadata = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!metadata) return null;
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 65536)
    throw new Error("Invalid Application execution manifest");
  const manifest = applicationExecutionManifestSchema.parse(
    JSON.parse(await readFile(path, "utf8")),
  );
  for (const profile of manifest.profiles) {
    let source = root;
    for (const component of profile.sourcePath.split("/")) {
      source = join(source, component);
      const info = await lstat(source);
      if (!info.isDirectory() || info.isSymbolicLink())
        throw new Error("Unsafe Application source path");
    }
    if (
      (await applicationSourcePayloadSha256(source)) !== profile.payloadSha256
    )
      throw new Error("Application source payload checksum mismatch");
    const lock = await readFile(
      join(source, "application/.terraform.lock.hcl"),
    );
    if (
      createHash("sha256").update(lock).digest("hex") !==
      profile.providerLockSha256
    )
      throw new Error("Application source provider lock mismatch");
  }
  return manifest;
}
