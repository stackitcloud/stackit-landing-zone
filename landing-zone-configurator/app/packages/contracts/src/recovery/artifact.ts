import { gunzipSync, gzipSync } from "node:zlib";
import { z } from "zod";
import { recoverySha256 } from "./proof.js";

export const recoveryArtifactSchema = z.strictObject({
  encoding: z.literal("gzip"),
  data: z
    .string()
    .min(1)
    .max(4 * Math.ceil((4 * 1024 * 1024) / 3)),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type RecoveryArtifact = z.infer<typeof recoveryArtifactSchema>;
export function encodeRecoveryArtifact(value: Buffer): RecoveryArtifact {
  if (!value.length || value.length > 16 * 1024 * 1024)
    throw new Error("checkpoint-invalid");
  const compressed = gzipSync(value);
  if (compressed.length > 4 * 1024 * 1024)
    throw new Error("checkpoint-invalid");
  return {
    encoding: "gzip",
    data: compressed.toString("base64"),
    sha256: recoverySha256(value),
  };
}
export function decodeRecoveryArtifact(input: unknown): Buffer {
  const a = recoveryArtifactSchema.parse(input);
  const compressed = Buffer.from(a.data, "base64");
  if (
    compressed.toString("base64") !== a.data ||
    compressed.length > 4 * 1024 * 1024
  )
    throw new Error("checkpoint-invalid");
  const bytes = gunzipSync(compressed, { maxOutputLength: 16 * 1024 * 1024 });
  if (!bytes.length || recoverySha256(bytes) !== a.sha256)
    throw new Error("checkpoint-invalid");
  return bytes;
}
