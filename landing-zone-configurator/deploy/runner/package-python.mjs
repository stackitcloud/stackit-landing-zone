import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

// cflinuxfs4 is Ubuntu 22.04. Carry the matching interpreter and standard
// library instead of relying on a Python executable in the CF stack.
const packages = [
  ["python3.10-minimal", "34e4c7383fdf2562d78321acfee5aa1f7b92be371dd79410496ad35cb773f326"],
  ["libpython3.10-minimal", "ccbd08562769e0a38b34005dc8bde200838e6c6530cc04ac34525129ed42d847"],
  ["libpython3.10-stdlib", "ee09afbc981a4aaa00053f019eab6b45dcc4dbeb4ca4fcc4277eff539e09f228"],
];
const root = resolve(process.argv[2]);
const work = await mkdtemp(resolve(tmpdir(), "lzc-runner-python-"));
try {
  const runtime = resolve(root, "runtime/python");
  await mkdir(runtime, { recursive: true });
  for (const [name, sha256] of packages) {
    const filename = `${name}_3.10.12-1~22.04.18_amd64.deb`;
    const bytes = execFileSync("curl", ["--ipv4", "--fail", "--silent", "--show-error",
      "--proto", "=https", "--tlsv1.2", "--retry", "2", "--connect-timeout", "15", "--max-time", "120",
      `https://security.ubuntu.com/ubuntu/pool/main/p/python3.10/${filename}`],
      { maxBuffer: 16 * 1024 * 1024 });
    if (createHash("sha256").update(bytes).digest("hex") !== sha256)
      throw new Error(`Python package checksum mismatch: ${name}`);
    const path = resolve(work, filename);
    await writeFile(path, bytes, { mode: 0o600, flag: "wx" });
    execFileSync("dpkg-deb", ["--extract", path, runtime], { stdio: "pipe" });
  }
  await mkdir(resolve(root, "tools"), { recursive: true });
  await writeFile(resolve(root, "tools/python3"), `#!/usr/bin/env bash
set -euo pipefail
runtime_root=$(cd -- "$(dirname -- "$0")/../runtime/python/usr" && pwd)
export PYTHONHOME="$runtime_root"
export PYTHONNOUSERSITE=1
export PYTHONDONTWRITEBYTECODE=1
unset PYTHONPATH
exec "$runtime_root/bin/python3.10" "$@"
`, { mode: 0o755, flag: "wx" });
  // Fail packaging before upload if the modules used by the native initializer
  // cannot load. No package installation or network access is needed in CF.
  execFileSync(resolve(root, "tools/python3"), ["-c",
    "import base64, hashlib, html.parser, http.client, http.cookiejar, json, socket, ssl, urllib.request, xml.etree.ElementTree; assert ssl.OPENSSL_VERSION_INFO >= (3,0)"],
    { stdio: "pipe" });
} finally {
  await rm(work, { recursive: true, force: true });
}
