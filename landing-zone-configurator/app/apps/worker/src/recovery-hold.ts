import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { z } from "zod";

export const devPlanHoldMilliseconds = 30_000;
const api = "https://api.system.01.cf.eu01.stackit.cloud";
const origin = "https://lzc-dev-configurator.apps.01.cf.eu01.stackit.cloud";
const configuration = z.strictObject({
  version: z.literal(1),
  instanceId: z.uuid(),
  appId: z.uuid(),
  spaceId: z.uuid(),
  expiresAt: z.iso.datetime(),
});
const context = z.object({
  cf_api: z.literal(api),
  organization_name: z.literal("lzc-dev-runners"),
  space_name: z.literal("plans"),
  application_id: z.uuid(),
  application_name: z.string().regex(/^lzc-warm-[a-f0-9-]{36}$/),
  space_id: z.uuid(),
  process_type: z.literal("web"),
  application_uris: z.array(z.string()).length(0),
});

// Only an operator-prepared, one-shot Dev warm app can opt into this drill.
export function devPlanHoldConfiguration(
  job: {
    mode: unknown;
    instanceId?: string | undefined;
    purpose?: string | undefined;
    origin?: string | undefined;
    local?: boolean | undefined;
  },
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
) {
  if (
    job.mode !== "application-plan" ||
    job.local ||
    job.origin !== origin ||
    (job.purpose !== undefined && job.purpose !== "standard") ||
    !env.LZC_RECOVERY_PLAN_HOLD ||
    !z.uuid().safeParse(env.CF_INSTANCE_GUID).success
  )
    return undefined;
  try {
    const config = configuration.parse(JSON.parse(env.LZC_RECOVERY_PLAN_HOLD));
    const cf = context.parse(JSON.parse(env.VCAP_APPLICATION ?? ""));
    const expiresAt = Date.parse(config.expiresAt);
    if (
      config.instanceId !== job.instanceId ||
      cf.application_id !== config.appId ||
      cf.space_id !== config.spaceId ||
      expiresAt <= now + devPlanHoldMilliseconds ||
      expiresAt > now + 15 * 60_000
    )
      return undefined;
    return config;
  } catch {
    return undefined;
  }
}

async function stoppedNativePlan(group: number) {
  const children = await readFile(
    `/proc/${group}/task/${group}/children`,
    "utf8",
  ).catch(() => "");
  for (const pid of [
    group,
    ...children.trim().split(/\s+/).filter(Boolean).map(Number),
  ]) {
    const [stat, command] = await Promise.all([
      readFile(`/proc/${pid}/stat`, "utf8").catch(() => ""),
      readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => ""),
    ]);
    const fields = stat.slice(stat.lastIndexOf(") ") + 2).split(" ");
    const args = command.split("\0");
    if (
      fields[0] === "T" &&
      Number(fields[2]) === group &&
      basename(args[0] ?? "") === "tofu" &&
      args[1] === "plan"
    )
      return true;
  }
  return false;
}

export function createDevPlanHold(
  enabled: ReturnType<typeof devPlanHoldConfiguration>,
  observation: (phase: "native-plan-held" | "native-plan-released") => void,
) {
  let attempted = false;
  let pid: number | undefined;
  let confirmed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const release = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (pid === undefined) return;
    const group = pid;
    pid = undefined;
    try {
      process.kill(-group, "SIGCONT");
    } catch {
      /* The child may already be gone. */
    }
    if (confirmed) observation("native-plan-released");
  };
  return {
    hold(childPid: number | undefined, deadline: number) {
      if (
        !enabled ||
        attempted ||
        !childPid ||
        !Number.isInteger(childPid) ||
        childPid <= 1 ||
        Date.parse(enabled.expiresAt) <= Date.now() + devPlanHoldMilliseconds ||
        deadline <= Date.now() + devPlanHoldMilliseconds + 10_000
      )
        return;
      attempted = true;
      try {
        process.kill(-childPid, "SIGSTOP");
        pid = childPid;
        timer = setTimeout(release, devPlanHoldMilliseconds);
      } catch {
        return;
      }
      // Confirm both the shell leader and its native Plan are stopped, not merely a finished shell.
      void (async () => {
        for (let attempt = 0; attempt < 50 && pid === childPid; attempt++) {
          const status = await readFile(
            `/proc/${childPid}/status`,
            "utf8",
          ).catch(() => "");
          if (pid !== childPid) return;
          if (
            /^State:\s+T\b/m.test(status) &&
            (await stoppedNativePlan(childPid)) &&
            pid === childPid
          ) {
            confirmed = true;
            observation("native-plan-held");
            return;
          }
          await new Promise((done) => setTimeout(done, 10));
        }
        release();
      })().catch(release);
    },
    close: release,
  };
}
