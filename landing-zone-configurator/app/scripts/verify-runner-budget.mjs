import assert from "node:assert/strict";
import { lstat, readdir } from "node:fs/promises";
import { resolve } from "node:path";

async function bytes(path) {
  const info = await lstat(path);
  if (info.isSymbolicLink()) return 0;
  if (!info.isDirectory()) return info.size;
  let total = 0;
  for (const name of await readdir(path))
    total += await bytes(resolve(path, name));
  return total;
}
const packageBytes = await bytes(resolve(process.argv[2]));
const initializedWorkBytes = await bytes(resolve(process.argv[3]));
const reserve = 256 * 1024 ** 2;
const quota = 4096 * 1024 ** 2;
assert(
  packageBytes + initializedWorkBytes + reserve < quota,
  "Runner package + independent image/root/provider working copy + 256 MiB reserve exceeds 4096 MiB droplet disk quota",
);
console.log(
  `PASS: disk budget package=${packageBytes} initializedWork=${initializedWorkBytes} reserve=${reserve} quota=${quota}; conservative independent copies, no reflink savings assumed.`,
);
