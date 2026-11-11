import { cp, mkdtemp, readdir, readlink, realpath, rename, rm, symlink } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

// The Runner fingerprints regular files only. Debian absolute links refer to
// the extracted package root, never to files on the build host.
export async function materializePythonRuntime(directory) {
  const root = await realpath(directory);
  const links = [];
  async function collect(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = resolve(path, entry.name);
      if (entry.isSymbolicLink()) links.push(child);
      else if (entry.isDirectory()) await collect(child);
    }
  }
  function contained(path) {
    const suffix = relative(root, path);
    if (suffix === ".." || suffix.startsWith("../") || isAbsolute(suffix))
      throw new Error("Python runtime link escapes package");
  }
  await collect(root);
  for (const path of links) {
    const target = await readlink(path);
    const mapped = isAbsolute(target)
      ? resolve(root, `.${target}`)
      : resolve(dirname(path), target);
    contained(mapped);
    if (isAbsolute(target)) {
      await rm(path);
      await symlink(relative(dirname(path), mapped), path);
    }
  }
  for (const path of links) contained(await realpath(path));
  const regular = await mkdtemp(resolve(dirname(root), ".python-regular-"));
  try {
    await cp(root, regular, { recursive: true, dereference: true });
    await rm(root, { recursive: true });
    await rename(regular, root);
  } finally {
    await rm(regular, { recursive: true, force: true });
  }
}
