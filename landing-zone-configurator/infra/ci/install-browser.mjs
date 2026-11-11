import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function runInstall() {
  return new Promise((accept, reject) => {
    const child = spawn('npx', ['--no-install', 'playwright', 'install', '--with-deps', 'chromium'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let diagnostics = '';
    for (const [stream, output] of [[child.stdout, process.stdout], [child.stderr, process.stderr]])
      stream.on('data', bytes => { output.write(bytes); diagnostics = (diagnostics + bytes.toString()).slice(-262144); });
    child.once('error', reject);
    child.once('close', status => accept({ status, diagnostics }));
  });
}
function configureMirror() {
  execFileSync('sudo', ['--', process.execPath, fileURLToPath(new URL('./ubuntu-mirror.mjs', import.meta.url)), '--apply'], { stdio: 'inherit' });
}
export function ubuntuRepositoryDnsFails(resolveHost = host => spawnSync('getent', ['ahostsv4', host], { timeout: 5000, maxBuffer: 65536 })) {
  for (const host of ['azure.archive.ubuntu.com', 'archive.ubuntu.com', 'security.ubuntu.com']) {
    const result = resolveHost(host);
    if (result.status === 2 || result.error?.code === 'ETIMEDOUT') return true;
    if (result.status !== 0) throw Error('Ubuntu DNS preflight could not complete');
  }
  return false;
}
export async function installBrowser(run = runInstall, configure = configureMirror, dnsFails = ubuntuRepositoryDnsFails) {
  if (dnsFails()) {
    console.log('Ubuntu DNS preflight failed; installing the browser with the approved HTTPS mirror and unchanged APT signature verification.');
    configure();
    if ((await run()).status !== 0) throw Error('Browser installation failed after the single Ubuntu mirror fallback');
    return;
  }
  const first = await run();
  if (first.status === 0) return;
  const ubuntuDnsFailure = /(?:Temporary failure resolving\s+['"]|Could not resolve host:\s*)(?:azure\.archive|archive|security)\.ubuntu\.com\b/.test(first.diagnostics);
  if (first.status === null || !ubuntuDnsFailure) throw Error('Browser installation failed; Ubuntu DNS fallback does not apply');
  console.log('Ubuntu repository DNS failure; retrying browser installation once with the approved HTTPS mirror and unchanged APT signature verification.');
  configure();
  if ((await run()).status !== 0) throw Error('Browser installation failed after the single Ubuntu mirror fallback');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await installBrowser();
}
