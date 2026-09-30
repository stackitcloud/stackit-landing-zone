import { spawn } from "node:child_process";
import { randomBytes, scryptSync, createCipheriv } from "node:crypto";
import { writeFileSync } from "node:fs";

// One interrupt lets OpenTofu stop providers and persist state. Never use a second
// interrupt as a normal timeout: OpenTofu treats it as an immediate abort.
export function runProcess(binary, args, { env, timeoutMs = 600_000, graceMs = 600_000, heartbeatMs = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    const chunks = { stdout: [], stderr: [] };
    let size = 0, interrupted = false, overflow = false, killTimer;
    const interrupt = () => {
      if (interrupted) return;
      interrupted = true;
      child.kill("SIGINT");
      killTimer = setTimeout(() => child.kill("SIGKILL"), graceMs);
    };
    const timeout = setTimeout(interrupt, timeoutMs);
    const heartbeat = heartbeatMs ? setInterval(() => console.log(interrupted ? "OpenTofu stopping; waiting for state persistence." : "OpenTofu operation still running."), heartbeatMs) : undefined;
    const cleanup = () => {
      clearTimeout(timeout); clearTimeout(killTimer); clearInterval(heartbeat);
      process.off("SIGINT", interrupt); process.off("SIGTERM", interrupt);
    };
    process.on("SIGINT", interrupt); process.on("SIGTERM", interrupt);
    for (const stream of ["stdout", "stderr"]) child[stream].on("data", data => {
      size += data.length;
      if (size <= 16 * 1024 * 1024) chunks[stream].push(data);
      else { overflow = true; interrupt(); }
    });
    child.once("error", () => { cleanup(); reject(new Error("Unable to start OpenTofu process")); });
    child.once("close", (code, signal) => {
      cleanup();
      resolve({ code, signal, interrupted, overflow, stdout: Buffer.concat(chunks.stdout).toString(), stderr: Buffer.concat(chunks.stderr).toString() });
    });
  });
}

// Separate envelope from OpenTofu's state encryption; it also protects diagnostic
// text and any plaintext emergency state produced by a failed backend write.
export function writeProtectedArtifact(path, content, passphrase) {
  if (passphrase.length < 32) throw new Error("Invalid artifact encryption key");
  const salt = randomBytes(16), nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", scryptSync(passphrase, salt, 32), nonce);
  const data = Buffer.concat([cipher.update(content), cipher.final()]);
  writeFileSync(path, JSON.stringify({ version: 1, kdf: "scrypt", cipher: "aes-256-gcm", salt: salt.toString("base64"), nonce: nonce.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") }), { mode: 0o600 });
}
