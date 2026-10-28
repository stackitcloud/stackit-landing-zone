import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  applicationExecutionCurrentRevision,
  applicationExecutionManifestSchema,
  applicationExecutionProfiles,
} from "../packages/contracts/dist/index.js";
import {
  applicationSourcePayloadSha256,
  readApplicationExecutionManifest,
} from "../packages/contracts/dist/recovery/index.js";

const root = process.argv[2];
if (!root) throw new Error("Runner package root required");
const profiles = [];
for (const profile of applicationExecutionProfiles.filter(
  (entry) => entry.status === "supported",
)) {
  const sourcePath =
    profile.revision === applicationExecutionCurrentRevision
      ? "application-src"
      : `application-sources/${profile.revision}`;
  profiles.push({
    ...profile,
    sourcePath,
    payloadSha256: await applicationSourcePayloadSha256(join(root, sourcePath)),
  });
}
const manifest = applicationExecutionManifestSchema.parse({
  schemaVersion: 1,
  profiles,
});
await writeFile(
  join(root, "application-execution.json"),
  JSON.stringify(manifest),
  { flag: "wx", mode: 0o600 },
);
await readApplicationExecutionManifest(root);
