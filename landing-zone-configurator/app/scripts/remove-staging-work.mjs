import { chmod, lstat, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

export async function removeStagingWork(directory) {
  async function writableDirectories(path) {
    const info = await lstat(path);
    if (!info.isDirectory()) return;
    await chmod(path, info.mode | 0o700);
    for (const name of await readdir(path))
      await writableDirectories(join(path, name));
  }
  // Provider mirrors stay immutable through qualification. Only the temporary
  // staging tree needs writable directories for removal; never follow links.
  await writableDirectories(directory);
  await rm(directory, { recursive: true, force: true });
}
