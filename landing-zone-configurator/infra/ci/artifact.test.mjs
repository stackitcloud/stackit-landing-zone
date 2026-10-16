import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDecipheriv, scryptSync } from "node:crypto";
import { writeProtectedArtifact } from "./artifact.mjs";
test("state snapshots are authenticated ciphertext decryptable with the state key", () => {
  const dir = mkdtempSync(join(tmpdir(), "lzc-artifact-"));
  try {
    const path = join(dir, "log.enc"), key = "k".repeat(40), secret = "example-sensitive-output";
    writeProtectedArtifact(path, secret, key); const raw = readFileSync(path, "utf8"); assert.ok(!raw.includes(secret));
    const e = JSON.parse(raw), decode = s => Buffer.from(s, "base64");
    const d = createDecipheriv("aes-256-gcm", scryptSync(key, decode(e.salt), 32), decode(e.nonce));d.setAuthTag(decode(e.tag));
    assert.equal(Buffer.concat([d.update(decode(e.data)), d.final()]).toString(), secret);
    e.data = Buffer.from("corrupt").toString("base64");
    const bad = createDecipheriv("aes-256-gcm", scryptSync(key, decode(e.salt), 32), decode(e.nonce)); bad.setAuthTag(decode(e.tag));
    assert.throws(()=>{bad.update(decode(e.data));bad.final()});
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
