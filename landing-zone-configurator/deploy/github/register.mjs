// One-time operator helper for GitHub's manifest registration flow.
// Explicitly authorized owner: lweberru. No operator/user tokens are read.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const manifest = JSON.parse(readFileSync(new URL('./app-manifest.json', import.meta.url)));
const output = fileURLToPath(new URL('../../.local/github/app-registration.json', import.meta.url));
if (existsSync(output)) throw new Error('Registration file already exists; reuse the existing app.');
const state = randomBytes(32).toString('base64url');
const entry = randomBytes(24).toString('base64url');
const binding = randomBytes(32).toString('base64url');
const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
let origin, consumed = false;
const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action https://github.com; frame-ancestors 'none'");
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (request.headers.host !== new URL(origin).host || request.method !== 'GET') { response.writeHead(400); response.end('Ungültige Anfrage'); return; }
  const url = new URL(request.url, origin);
  if (url.pathname === `/${entry}`) {
    response.setHeader('Set-Cookie', `lzc-registration=${binding}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600`);
    const value = escape(JSON.stringify({ ...manifest, name: 'LZ Configurator Dev 7dbff805', redirect_url: `${origin}/callback` }));
    response.end(`<!doctype html><html lang="de"><meta charset="utf-8"><title>Configurator · GitHub-Registrierung</title><style>body{font:17px system-ui;max-width:750px;margin:60px auto;padding:24px;line-height:1.6}button{padding:12px 20px;margin:8px 0;font:inherit}h1{line-height:1.2}</style><h1>GitHub-Anmeldung für den Configurator einrichten</h1><p>Bitte bei GitHub als <strong>lweberru</strong> angemeldet sein. Diese einmalige Registrierung gehört zum Configurator-Entwicklungsprojekt.</p><p>Berechtigungen: Repository-Metadaten lesen, Inhalte schreiben und Administration schreiben (von GitHub für Forks verlangt). Installiere die App nur auf benötigten Repositories. Der Configurator verwendet später ausschließlich die Autorisierung des jeweiligen Benutzers.</p><form method="post" action="https://github.com/settings/apps/new?state=${state}"><input type="hidden" name="manifest" value="${value}"><button>GitHub App unter lweberru registrieren</button></form><p>Nach deiner GitHub-Bestätigung werden die Client-Zugangsdaten automatisch lokal mit eingeschränkten Dateirechten gespeichert. Du musst keine Tokens kopieren oder im Chat senden.</p></html>`);
    return;
  }
  if (url.pathname !== '/callback' || consumed || url.searchParams.get('state') !== state || !request.headers.cookie?.split(';').some(v => v.trim() === `lzc-registration=${binding}`)) {
    response.writeHead(403); response.end('Registrierung ungültig oder abgelaufen.'); return;
  }
  const code = url.searchParams.get('code');
  if (!code || !/^[a-zA-Z0-9_-]{10,200}$/.test(code)) { response.writeHead(400); response.end('Registrierungscode fehlt.'); return; }
  consumed = true;
  try {
    const result = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' },
    });
    if (!result.ok) throw new Error('Registration conversion failed');
    const app = await result.json();
    if (app.owner?.login !== 'lweberru' || !Number.isSafeInteger(app.id) || typeof app.client_id !== 'string' || typeof app.client_secret !== 'string' || !/^[a-z0-9-]+$/.test(app.slug)) throw new Error('Invalid registration response or owner');
    mkdirSync(new URL('../../.local/github/', import.meta.url), { recursive: true, mode: 0o700 });
    // Never retain/use an App private key for customer repository operations.
    writeFileSync(output, JSON.stringify({ appId: app.id, slug: app.slug, owner: app.owner.login, clientId: app.client_id, clientSecret: app.client_secret }, null, 2), { mode: 0o600, flag: 'wx' });
    response.end(`<html lang="de"><meta charset="utf-8"><title>Registriert</title><h1>GitHub App registriert</h1><p>Die Zugangsdaten wurden lokal gespeichert. Teile Codex bitte mit, dass die Registrierung abgeschlossen ist.</p><p>Vor Repository-Zugriffen muss die App außerdem auf den gewünschten Repositories installiert werden:</p><a href="https://github.com/apps/${app.slug}/installations/new">GitHub App installieren</a></html>`);
    console.log(`GitHub App registered: ${app.slug}. Credentials saved privately; no secret output.`);
    response.on('finish', () => server.close());
  } catch {
    response.writeHead(502); response.end('Registrierung konnte nicht abgeschlossen werden. Bitte den App-Status in GitHub prüfen und Codex informieren.');
    console.error('Registration conversion/storage failed; no credentials logged.');
  }
});
server.listen(0, '127.0.0.1', () => {
  origin = `http://127.0.0.1:${server.address().port}`;
  console.log(`Registration page (valid for one hour): ${origin}/${entry}`);
});
const timeout = setTimeout(() => { server.close(); }, 60 * 60 * 1000);
timeout.unref();
server.on('close', () => clearTimeout(timeout));
