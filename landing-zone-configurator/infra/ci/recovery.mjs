import { readFileSync } from "node:fs";
import { randomUUID, sign } from "node:crypto";

// STACKIT SDK key-flow: RS512 JWT bearer exchange, no token or assertion logging.
// https://github.com/stackitcloud/stackit-sdk-go/blob/main/core/clients/key_flow.go
export async function accessToken(keyFile) {
  const { credentials: c } = JSON.parse(readFileSync(keyFile, "utf8"));
  if (c.tokenEndpoint !== "https://accounts.stackit.cloud/oauth/v2/token") throw new Error("Unexpected token endpoint");
  const b64 = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: "RS512", typ: "JWT", kid: c.kid })}.${b64({ iss: c.iss, sub: c.sub, aud: c.aud, jti: randomUUID(), iat: now, exp: now + 600 })}`;
  const assertion = `${unsigned}.${sign("RSA-SHA512", Buffer.from(unsigned), c.privateKey).toString("base64url")}`;
  const r = await fetch(c.tokenEndpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000), headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  if (!r.ok) throw new Error(`Recovery authentication failed (HTTP ${r.status})`);
  const result = await r.json();
  if (!result.access_token) throw new Error("Missing access token");
  return result.access_token;
}

export async function recoverPlatform({ manifest, inputs, credentialsPath, tofu, env }) {
  if (inputs.root !== "platform" || manifest.project !== inputs.project || process.env.LZC_RECOVERY_COMMIT !== inputs.commit) throw new Error("Recovery requires an exact approved platform commit");
  const previousRun = await fetch(`https://api.github.com/repos/stackitcloud/stackit-landing-zone/actions/runs/${manifest.failedRun}`, { redirect: "error", signal: AbortSignal.timeout(30_000), headers: { Accept: "application/vnd.github+json" } });
  if (!previousRun.ok) throw new Error("Cannot verify failed runner completion");
  const previous = await previousRun.json();
  if (previous.status !== "completed" || !["cancelled", "failure", "timed_out"].includes(previous.conclusion)) throw new Error("Recovery source run is not completed with failure");
  // This one-off manifest is reviewed alongside the code. The protected job shares
  // the global mutation group; the failed runner must have completed beforehand.
  await tofu("platform", ["force-unlock", "-force", manifest.lockId], env);
  for (const [address, id] of Object.entries(manifest.imports)) {
    if (!id.startsWith(`${inputs.project},`)) throw new Error("Import project mismatch");
    await tofu("platform", ["import", "-input=false", "-lock-timeout=60s", "-var-file=../environments/lzc-dev.tfvars.json", address, id], env);
    console.log(`Recovered ${address} into encrypted remote state.`);
  }
  // Tokens have no provider importer, and their value is returned only at creation.
  // Revoke only the explicitly inventoried orphan; a fresh reviewed plan creates its successor.
  const token = await accessToken(credentialsPath);
  const url = `https://model-serving.api.stackit.cloud/v1/projects/${inputs.project}/regions/${inputs.region}/tokens/${manifest.unrecoverableToken.id}`;
  const options = { headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(30_000) };
  const current = await fetch(url, options);
  if (current.status === 404) { console.log("Orphan token already absent."); return; }
  if (!current.ok) throw new Error(`Token inventory failed (HTTP ${current.status})`);
  const body = await current.json();
  const details = body.token;
  if (details?.id !== manifest.unrecoverableToken.id || details?.name !== manifest.unrecoverableToken.name) throw new Error("Orphan token identity mismatch");
  const revoked = await fetch(url, { ...options, method: "DELETE", signal: AbortSignal.timeout(30_000) });
  if (!revoked.ok) throw new Error(`Orphan token revocation failed (HTTP ${revoked.status})`);
  console.log("Revoked the inventoried orphan Model Serving token.");
}
