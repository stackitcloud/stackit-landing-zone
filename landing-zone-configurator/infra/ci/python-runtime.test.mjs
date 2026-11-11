import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { materializePythonRuntime } from "../../deploy/runner/materialize-python-runtime.mjs";

test("materializes relative, directory and package-absolute links without reading host files", async () => {
  const work = await mkdtemp(resolve(tmpdir(), "lzc-python-links-"));
  const root = resolve(work, "runtime");
  try {
    await mkdir(resolve(root, "usr/lib"), { recursive: true });
    await mkdir(resolve(root, "etc"));
    await writeFile(resolve(root, "etc/sitecustomize.py"), "package-site");
    await writeFile(resolve(root, "usr/lib/config.py"), "package-config");
    await symlink("config.py", resolve(root, "usr/lib/config-alias.py"));
    await symlink("/etc/sitecustomize.py", resolve(root, "usr/lib/sitecustomize.py"));
    await symlink("lib", resolve(root, "usr/doc"));
    await materializePythonRuntime(root);
    async function regular(path) {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        assert.equal(entry.isSymbolicLink(), false);
        if (entry.isDirectory()) await regular(resolve(path, entry.name));
      }
    }
    await regular(root);
    assert.equal(await readFile(resolve(root, "usr/doc/sitecustomize.py"), "utf8"), "package-site");
    assert.equal(await readFile(resolve(root, "usr/lib/config-alias.py"), "utf8"), "package-config");
  } finally { await rm(work, { recursive: true, force: true }); }
});

for (const mode of ["relative-escape", "absolute-missing", "cycle"]) {
  test(`rejects ${mode} before producing a usable runtime`, async () => {
    const work = await mkdtemp(resolve(tmpdir(), "lzc-python-invalid-"));
    const root = resolve(work, "runtime");
    try {
      await mkdir(root);
      await writeFile(resolve(work, "host-secret"), "must-not-copy");
      await symlink(mode === "relative-escape" ? "../host-secret" : mode === "absolute-missing" ? "/host-secret" : "bad", resolve(root, "bad"));
      await assert.rejects(materializePythonRuntime(root));
      assert.equal(await readFile(resolve(work, "host-secret"), "utf8"), "must-not-copy");
    } finally { await rm(work, { recursive: true, force: true }); }
  });
}
