import { setTimeout as delay } from "node:timers/promises";

export async function waitForProductionReplicas({ readProcesses, readStats, now = Date.now, sleep = delay, timeoutMs = 5 * 60_000 }) {
  const deadline = now() + timeoutMs;
  for (;;) {
    const web = (await readProcesses()).resources?.filter(process => process.type === "web");
    if (web?.length !== 1 || web[0].instances !== 3 || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(web[0].guid))
      throw new Error("Production web replica count does not match the reviewed stage");
    const stats = await readStats(web[0].guid);
    if (stats.resources?.length === 3 && stats.resources.every(instance => instance.state === "RUNNING")) return;
    if (!Array.isArray(stats.resources) || stats.resources.length > 3 || stats.resources.some(instance => !["STARTING", "RUNNING", "DOWN", "CRASHED"].includes(instance.state)))
      throw new Error("Production web replica status is invalid");
    if (now() >= deadline) throw new Error("Production web replicas did not all become running before the readiness deadline");
    await sleep(5_000);
  }
}
