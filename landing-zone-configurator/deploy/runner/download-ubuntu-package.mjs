import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const ubuntuPackageMirrors = Object.freeze([
  'https://security.ubuntu.com/ubuntu',
  'https://archive.ubuntu.com/ubuntu',
  'https://ftp.osuosl.org/pub/ubuntu',
]);
const unavailable = new Set([6, 7, 18, 22, 28, 52, 56]);
function fetchPackage(url) {
  return execFileSync('curl', ['--disable', '--ipv4', '--fail', '--silent', '--show-error',
    '--proto', '=https', '--tlsv1.2', '--retry', '2', '--connect-timeout', '8', '--max-time', '30', url],
    { maxBuffer: 16 * 1024 * 1024, timeout: 100000 });
}

export function downloadUbuntuPackage(filename, sha256, fetch = fetchPackage) {
  if (!/^[a-z0-9][a-z0-9.+-]*_[a-zA-Z0-9.+~:-]+_amd64\.deb$/.test(filename) || !/^[a-f0-9]{64}$/.test(sha256))
    throw Error('Invalid pinned Ubuntu package');
  for (const mirror of ubuntuPackageMirrors) {
    let bytes;
    try {
      bytes = fetch(`${mirror}/pool/main/p/python3.10/${filename}`);
    } catch (error) {
      if (!unavailable.has(error.status)) throw Error(`Ubuntu package transport failed: ${filename}`, { cause: error });
      continue;
    }
    // A reachable source with different bytes is an integrity failure, not a
    // reason to hide the result by trying another mirror.
    if (createHash('sha256').update(bytes).digest('hex') !== sha256)
      throw Error(`Python package checksum mismatch: ${filename}`);
    return bytes;
  }
  throw Error(`All approved Ubuntu package mirrors unavailable: ${filename}`);
}
