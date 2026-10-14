import { createInterface } from "node:readline";

const runId = process.argv[2];
if (!/^\d+$/.test(runId ?? "")) throw new Error("Expected CI run ID");
let evidence;
for await (const line of createInterface({ input: process.stdin })) {
  if (!line.includes('"service":"database-migrations"')) continue;
  const start = line.indexOf("{");
  const end = line.lastIndexOf("}");
  if (start < 0 || end < start) continue;
  let value;
  try {
    value = JSON.parse(line.slice(start, end + 1));
  } catch (error) {
    if (error instanceof SyntaxError) continue;
    throw error;
  }
  if (
    value.service !== "database-migrations" ||
    value.runId !== runId ||
    typeof value.ok !== "boolean"
  )
    continue;
  if (value.ok) {
    evidence = { service: "database-migrations", runId, ok: true };
  } else if (
    ["connect", "migrate"].includes(value.phase) &&
    (value.version === undefined || /^\d{3}_[a-z_]+\.sql$/.test(value.version)) &&
    /^(?:[A-Z0-9]{5}|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ECONNRESET|CERT_HAS_EXPIRED|UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT_IN_CHAIN|DEPTH_ZERO_SELF_SIGNED_CERT|ERR_TLS_CERT_ALTNAME_INVALID|migration-identity-required|migration-files-missing|applied-migration-missing|applied-migration-modified|connection-or-response-failed)$/.test(value.error)
  ) {
    evidence = {
      service: "database-migrations",
      runId,
      ok: false,
      phase: value.phase,
      version: value.version,
      error: value.error,
    };
  }
}
if (!evidence) {
  console.error("Sanitized migration evidence unavailable");
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(evidence));
  if (!evidence.ok) process.exitCode = 1;
}
