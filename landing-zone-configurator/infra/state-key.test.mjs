import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { stateKey } from "./state-key.mjs";

function workspace(t) {
  const path = mkdtempSync(join(tmpdir(), "lzc-key-"));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}
test("CI deployment refuses to generate a key", (t) => {
  const path = workspace(t);
  assert.throws(() => stateKey(path, { ci: true }), /existing state-encryption key/);
  assert.equal(existsSync(join(path, "state.passphrase")), false);
});
test("CI deployment uses supplied key without persisting it", (t) => {
  const path = workspace(t);
  const key = "test-only-key-".repeat(4);
  assert.equal(stateKey(path, { ci: true, suppliedKey: key }), key);
  assert.equal(existsSync(join(path, "state.passphrase")), false);
});
test("local validation reuses its key", (t) => {
  const path = workspace(t);
  const key = stateKey(path, { ci: true, validation: true });
  assert.equal(stateKey(path, { ci: true, validation: true }), key);
});
test("lost local key is never silently replaced", (t) => {
  const path = workspace(t);
  writeFileSync(join(path, "terraform.tfstate"), "existing encrypted state");
  assert.throws(() => stateKey(path), /restore the original key/);
});
