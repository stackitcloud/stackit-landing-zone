import { randomBytes } from "node:crypto";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { z } from "zod";
import {
  DeviceFlowError,
  StackitDeviceFlow,
} from "../apps/api/src/auth/stackit-device.js";

export function buildDeviceSpike(
  createFlow = () =>
    new StackitDeviceFlow(
      fetch,
      Date.now,
      process.env.LZC_SPIKE_ORGANIZATION_ID,
    ),
) {
  const app = Fastify({ logger: false, bodyLimit: 1024 });
  const csrf = randomBytes(32).toString("base64url");
  let flow = createFlow();
  let starting = false;
  let authorization: Awaited<ReturnType<StackitDeviceFlow["begin"]>> | null =
    null;
  const origin = () => {
    const address = app.server.address();
    return `http://127.0.0.1:${address && typeof address === "object" ? address.port : 4181}`;
  };
  app.addHook("onRequest", async (request, reply) => {
    reply.headers({
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy": `default-src 'none'; script-src 'nonce-${csrf}'; style-src 'nonce-${csrf}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
    });
    if (request.headers.host !== new URL(origin()).host)
      return reply.code(403).send({ error: "invalid_host" });
    if (request.url === "/" && request.method === "GET") return;
    if (
      !request.headers.cookie
        ?.split(";")
        .some((cookie) => cookie.trim() === `lzc-device-spike=${csrf}`)
    )
      return reply.code(403).send({ error: "spike_session_required" });
    if (
      request.method !== "GET" &&
      (request.headers.origin !== origin() ||
        request.headers["x-spike-csrf"] !== csrf)
    )
      return reply.code(403).send({ error: "invalid_origin_or_csrf" });
  });
  app.setErrorHandler((error, _request, reply) => {
    reply
      .code(
        error instanceof DeviceFlowError || error instanceof z.ZodError
          ? 400
          : 503,
      )
      .send({
        error:
          error instanceof DeviceFlowError
            ? error.code
            : "spike_request_failed",
      });
  });
  app.get("/", async (_request, reply) => {
    reply.header(
      "set-cookie",
      `lzc-device-spike=${csrf}; HttpOnly; SameSite=Strict; Path=/`,
    );
    return reply.type("text/html; charset=utf-8").send(`<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>STACKIT-Verkn&uuml;pfung</title>
<style nonce="${csrf}">
:root { color-scheme: light; font-family: "Trebuchet MS", sans-serif; color: #20282b; background: #f3f5f6; }
* { box-sizing: border-box; } body { margin: 0; border-top: 5px solid #167b75; } main { max-width: 720px; margin: 48px auto; padding: 0 24px; }
h1 { font-family: Georgia, serif; font-size: 28px; margin-bottom: 8px; } .scope { color: #667479; margin-top: 0; }
.actions { display: flex; flex-wrap: wrap; gap: 12px; padding: 24px 0; } button, .link { font: inherit; border: 1px solid #14766f; border-radius: 4px; padding: 10px 16px; color: white; background: #14766f; text-decoration: none; }
button { cursor: pointer; } button:disabled { opacity: .5; cursor: default; } #cancel { background: transparent; color: #333; border-color: #849297; }
#status { padding: 16px 0; border-top: 1px solid #c8d1d4; border-bottom: 1px solid #c8d1d4; } #status[data-state="failed"] { color: #aa2727; }
dl { display: grid; grid-template-columns: minmax(100px, 150px) minmax(0, 1fr); gap: 16px; } dt { color: #667479; } dd { margin: 0; overflow-wrap: anywhere; }
@media(max-width: 460px) { main { margin-top: 24px; padding: 0 16px; } h1 { font-size: 24px; } dl { grid-template-columns: 1fr; gap: 8px; } dd { margin-bottom: 12px; } }
</style></head><body><main><h1>STACKIT-Verkn&uuml;pfung</h1><p class="scope">Lokaler Auth-Spike</p>
<dl><dt>Anbieter</dt><dd>accounts.stackit.cloud</dd><dt>OAuth-Client</dt><dd>STACKIT CLI</dd></dl>
<div class="actions"><button id="start">STACKIT verbinden</button><button id="cancel" disabled>Abbrechen</button><a id="confirm" class="link" target="_blank" rel="noopener noreferrer" hidden>Anmeldung best&auml;tigen</a></div>
<p id="status" role="status" aria-live="polite">Nicht verbunden</p><p id="code" hidden></p><dl id="result" hidden></dl></main>
<script nonce="${csrf}">
const csrf = ${JSON.stringify(csrf)};
const start = document.getElementById('start'), cancel = document.getElementById('cancel'), confirm = document.getElementById('confirm'), status = document.getElementById('status'), code = document.getElementById('code'), result = document.getElementById('result');
let timer;
async function call(path) { const response = await fetch(path, { method: 'POST', headers: { 'x-spike-csrf': csrf } }); const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; }
function render(data) {
  status.dataset.state = data.status;
  const labels = { idle: 'Nicht verbunden', waiting: 'Best\u00e4tigung ausstehend', verified: 'Identit\u00e4t verifiziert', expired: 'Anmeldung abgelaufen', cancelled: 'Anmeldung abgebrochen', failed: 'Pr\u00fcfung fehlgeschlagen' };
  status.textContent = labels[data.status] + (data.code ? ': ' + data.code : '');
  cancel.disabled = data.status !== 'waiting'; start.disabled = data.status === 'waiting';
  confirm.hidden = data.status !== 'waiting'; code.hidden = data.status !== 'waiting';
  if (data.status === 'waiting') { confirm.href = data.verificationUri; code.textContent = 'Best\u00e4tigungscode: ' + data.userCode; }
  result.replaceChildren(); result.hidden = data.status !== 'verified';
  if (data.identity) {
    const identity = data.identity;
    const fields = { Issuer: identity.issuer, Subject: identity.subject, Nachweis: identity.verificationMethod === 'signed-id-token-and-userinfo' ? 'Signierter ID-Token + STACKIT-Userinfo' : 'Device-Flow + STACKIT-Userinfo', 'E-Mail': identity.email, 'E-Mail verifiziert': identity.emailVerified ? 'Ja' : 'Nein', 'Token g\u00fcltig bis': identity.tokenExpiresAt, Organisation: identity.organization ? identity.organization.name + ' (' + identity.organization.id + ')' : 'Nicht gepr\u00fcft' };
    for (const [label, value] of Object.entries(fields)) { const term = document.createElement('dt'), description = document.createElement('dd'); term.textContent = label; description.textContent = value; result.append(term, description); }
  }
}
async function poll() { try { const data = await call('/poll'); render(data); if (data.status === 'waiting') timer = setTimeout(poll, data.retryAfterMs); } catch (error) { render({ status: 'failed', code: error.message }); } }
start.addEventListener('click', async () => {
  clearTimeout(timer); start.disabled = true;
  try { const data = await call('/start'); render({ ...data, status: 'waiting' }); timer = setTimeout(poll, data.retryAfterMs); } catch (error) { render({ status: 'failed', code: error.message }); }
});
cancel.addEventListener('click', async () => { clearTimeout(timer); try { render(await call('/cancel')); } catch (error) { render({ status: 'failed', code: error.message }); } });
fetch('/status').then(response => response.json()).then(data => { render(data); if (data.status === 'waiting') timer = setTimeout(poll, data.retryAfterMs); }).catch(() => render({ status: 'failed', code: 'spike_unavailable' }));
</script></body></html>`);
  });
  app.post("/start", async (request, reply) => {
    z.strictObject({}).parse(request.body ?? {});
    if (starting || flow.state().status === "waiting")
      return reply.code(409).send({ error: "flow_already_started" });
    starting = true;
    try {
      flow = createFlow();
      authorization = await flow.begin();
      return authorization;
    } finally {
      starting = false;
    }
  });
  app.post("/poll", async (request) => {
    z.strictObject({}).parse(request.body ?? {});
    const state = await flow.poll();
    return state.status === "waiting" ? { ...authorization, ...state } : state;
  });
  app.post("/cancel", async (request) => {
    z.strictObject({}).parse(request.body ?? {});
    authorization = null;
    return flow.cancel();
  });
  app.get("/status", async () => {
    const state = flow.state();
    return state.status === "waiting" ? { ...authorization, ...state } : state;
  });
  app.addHook("onClose", async () => {
    flow.cancel();
  });
  return app;
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = buildDeviceSpike();
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  console.log(`STACKIT Device-Flow Spike: ${address}/`);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void app.close();
    });
  }
}
