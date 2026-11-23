import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { applicationSourcePayloadSha256 } from "./application-execution.js";
import {
  retirementAdapterCommit,
  retirementProviderLockSha256,
} from "./retirement.js";
export const retirementSourceSchema = z.strictObject({
  schemaVersion: z.literal(1),
  revision: z.literal(retirementAdapterCommit),
  providerLockSha256: z.literal(retirementProviderLockSha256),
  payloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export async function readRetirementSource(root: string) {
  const path = join(root, "retirement-source.json");
  const metadata = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!metadata) return null;
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 65536)
    throw Error("retirement_package_invalid");
  const source = retirementSourceSchema.parse(
    JSON.parse(await readFile(path, "utf8")),
  );
  if (
    (await applicationSourcePayloadSha256(join(root, "retirement-src"))) !==
    source.payloadSha256
  )
    throw Error("retirement_package_changed");
  return source;
}
