import { readdirSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const fallbackUbuntuMirror = 'https://ftp.osuosl.org/pub/ubuntu';
const hosts = new Set(['archive.ubuntu.com', 'security.ubuntu.com', 'azure.archive.ubuntu.com']);
function replacement(value) {
  let url;
  try { url = new URL(value); } catch { return value; }
  if (url.protocol === 'mirror+file:' && !url.host && !url.search && !url.hash &&
      ['/etc/apt/apt-mirrors.txt', '/etc/apt/apt-security-mirrors.txt'].includes(url.pathname)) return fallbackUbuntuMirror;
  if (['http:', 'https:'].includes(url.protocol) && hosts.has(url.hostname) &&
      ['/ubuntu', '/ubuntu/'].includes(url.pathname) && !url.username && !url.password && !url.port && !url.search && !url.hash)
    return fallbackUbuntuMirror;
  return value;
}

export function rewriteUbuntuSources(text, deb822) {
  if (deb822) return text.replace(/^(URIs:[ \t]*)([^\r\n]+)$/gm,
    (_, prefix, values) => prefix + values.replace(/\S+/g, replacement));
  return text.replace(/^(deb(?:-src)?[ \t]+(?:\[[^\]\r\n]*\][ \t]+)?)(\S+)/gm,
    (_, prefix, uri) => prefix + replacement(uri));
}

export function applyUbuntuMirror(directory = '/etc/apt') {
  const files = [resolve(directory, 'sources.list')];
  const parts = resolve(directory, 'sources.list.d');
  for (const name of readdirSync(parts))
    if (/\.(list|sources)$/.test(name)) files.push(resolve(parts, name));
  const changes = [];
  for (const file of files) {
    let stat;
    try { stat = lstatSync(file); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error('APT source must be a regular file');
    const old = readFileSync(file, 'utf8');
    const next = rewriteUbuntuSources(old, file.endsWith('.sources'));
    if (next !== old) changes.push([file, next]);
  }
  if (!changes.length) throw Error('No supported Ubuntu APT source found for fallback');
  // Only repository URIs change. Suites, components, Signed-By and APT's
  // authentication settings retain their existing values.
  for (const [file, next] of changes) writeFileSync(file, next);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== '--apply') throw Error('Expected --apply');
  applyUbuntuMirror();
}
