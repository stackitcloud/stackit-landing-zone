import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Only repository-owned commands are accepted by the workflow, never user input.
export async function runParallel(lanes) {
  if (!lanes.length || lanes.some(([name, command]) => !name || !command))
    throw new Error("Expected named parallel commands");
  const children = new Set();
  let failed = false;
  let killTimer;
  const stop = () => {
    if (failed) return;
    failed = true;
    killTimer = setTimeout(() => {
      for (const child of children) {
        try { process.kill(-child.pid, "SIGKILL"); } catch { /* Already exited. */ }
      }
    }, 5000);
    killTimer.unref();
    for (const child of children) {
      try { process.kill(-child.pid, "SIGTERM"); } catch { /* Already exited. */ }
    }
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  try {
    const results = await Promise.all(lanes.map(([name, command]) => new Promise(resolve => {
      const started = Date.now();
      console.log(`Starting release lane: ${name}`);
      const child = spawn("bash", ["-e", "-o", "pipefail", "-c", command], {
        stdio: "inherit", detached: true,
      });
      children.add(child);
      child.on("error", () => { children.delete(child); stop(); resolve(false); });
      child.on("exit", (code) => {
        children.delete(child);
        console.log(`Release lane ${name}: ${code === 0 ? "passed" : "failed"} (${Math.round((Date.now() - started) / 1000)}s)`);
        if (code !== 0) stop();
        resolve(code === 0);
      });
    })));
    return !failed && results.every(Boolean);
  } finally {
    clearTimeout(killTimer);
    process.off("SIGTERM", stop);
    process.off("SIGINT", stop);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length % 2) throw new Error("Expected name/command pairs");
  const lanes = [];
  for (let i = 0; i < args.length; i += 2) lanes.push(args.slice(i, i + 2));
  if (!await runParallel(lanes)) process.exitCode = 1;
}
