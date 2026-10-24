import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it, vi } from "vitest";
import {
  createDevPlanHold,
  devPlanHoldConfiguration,
  devPlanHoldMilliseconds,
} from "../apps/worker/src/recovery-hold.js";

const instanceId = randomUUID();
const appId = randomUUID();
const spaceId = randomUUID();
const job = {
  mode: "application-plan",
  instanceId,
  origin: "https://lzc-dev-configurator.apps.01.cf.eu01.stackit.cloud",
};
const make = () => ({
  CF_INSTANCE_GUID: randomUUID(),
  LZC_RECOVERY_PLAN_HOLD: JSON.stringify({
    version: 1,
    instanceId,
    appId,
    spaceId,
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  }),
  VCAP_APPLICATION: JSON.stringify({
    cf_api: "https://api.system.01.cf.eu01.stackit.cloud",
    organization_name: "lzc-dev-runners",
    space_name: "plans",
    application_id: appId,
    application_name: `lzc-warm-${randomUUID()}`,
    space_id: spaceId,
    process_type: "web",
    application_uris: [],
  }),
});
afterEach(() => vi.restoreAllMocks());
it("requires explicit short-lived exact-instance opt-in in the route-free Dev warm app", () => {
  const env = make();
  expect(devPlanHoldConfiguration(job, env)?.instanceId).toBe(instanceId);
  expect(devPlanHoldConfiguration(job, {})).toBeUndefined();
  for (const changes of [
    { mode: "application-apply" },
    { mode: "platform-plan" },
    { local: true },
    { purpose: "drift" },
    { purpose: "destroy" },
    { instanceId: randomUUID() },
    { origin: "https://production.example" },
  ])
    expect(
      devPlanHoldConfiguration({ ...job, ...changes }, env),
    ).toBeUndefined();
  for (const key of [
    "CF_INSTANCE_GUID",
    "LZC_RECOVERY_PLAN_HOLD",
    "VCAP_APPLICATION",
  ])
    expect(
      devPlanHoldConfiguration(job, { ...env, [key]: "invalid" }),
    ).toBeUndefined();
  for (const changes of [
    { organization_name: "production" },
    { space_name: "production" },
    { application_id: randomUUID() },
    { space_id: randomUUID() },
    { application_name: "lzc-plan-template" },
    { process_type: "task" },
    { application_uris: ["public.example"] },
  ])
    expect(
      devPlanHoldConfiguration(job, {
        ...env,
        VCAP_APPLICATION: JSON.stringify({
          ...JSON.parse(env.VCAP_APPLICATION),
          ...changes,
        }),
      }),
    ).toBeUndefined();
  for (const changes of [
    { expiresAt: new Date(Date.now() - 1).toISOString() },
    { expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
    { command: "arbitrary" },
    { instanceId: randomUUID() },
  ])
    expect(
      devPlanHoldConfiguration(job, {
        ...env,
        LZC_RECOVERY_PLAN_HOLD: JSON.stringify({
          ...JSON.parse(env.LZC_RECOVERY_PLAN_HOLD),
          ...changes,
        }),
      }),
    ).toBeUndefined();
});
it("does not signal any process without opt-in, a safe child PID and remaining deadline", () => {
  const kill = vi.spyOn(process, "kill");
  const disabled = createDevPlanHold(undefined, vi.fn());
  disabled.hold(999999, Date.now() + 60_000);
  disabled.close();
  const hold = createDevPlanHold(
    devPlanHoldConfiguration(job, make()),
    vi.fn(),
  );
  for (const pid of [undefined, 0, -1, 1, 1.5])
    hold.hold(pid, Date.now() + 60_000);
  hold.hold(999999, Date.now() + 1000);
  hold.close();
  expect(kill).not.toHaveBeenCalled();
});
it("does not claim a native Plan hold for a different stopped process", async () => {
  const child = spawn("/bin/sleep", ["60"], {
    detached: true,
    stdio: "ignore",
  });
  const exited = new Promise<void>((done) => child.once("exit", () => done()));
  await new Promise<void>((done, fail) => {
    child.once("spawn", done);
    child.once("error", fail);
  });
  const emit = vi.fn();
  const hold = createDevPlanHold(devPlanHoldConfiguration(job, make()), emit);
  try {
    hold.hold(child.pid, Date.now() + 60_000);
    await vi.waitFor(
      async () => {
        expect(await readFile(`/proc/${child.pid}/status`, "utf8")).not.toMatch(
          /^State:\s+T\b/m,
        );
      },
      { timeout: 2000 },
    );
    expect(emit).not.toHaveBeenCalledWith("native-plan-held");
  } finally {
    hold.close();
    if (child.pid) process.kill(-child.pid, "SIGKILL");
    await exited;
  }
});

it
  .skipIf(!process.env.LZC_TEST_TOFU_BIN)
  .each(["resume", "kill", "auto"] as const)(
  "holds a real pinned OpenTofu Plan with synthetic loopback State (%s)",
  async (outcome) => {
    const binary = process.env.LZC_TEST_TOFU_BIN as string;
    const realTimeout = setTimeout;
    const timer = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation(((fn: () => void, ms?: number, ...args: unknown[]) =>
        realTimeout(
          fn,
          outcome === "auto" && ms === devPlanHoldMilliseconds ? 800 : ms,
          ...args,
        )) as typeof setTimeout);
    const root = await mkdtemp(join(tmpdir(), "lzc-native-plan-hold-"));
    let released = false;
    const waiting: (() => void)[] = [];
    const server = createServer((_req, res) => {
      const send = () => {
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            version: 4,
            terraform_version: "1.12.6",
            serial: 1,
            lineage: randomUUID(),
            outputs: { marker: { value: "synthetic", type: "string" } },
            resources: [],
          }),
        );
      };
      if (released) send();
      else waiting.push(send);
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string")
      throw Error("fixture address missing");
    const env = {
      PATH: "/usr/bin:/bin",
      HOME: root,
      TF_IN_AUTOMATION: "true",
      CHECKPOINT_DISABLE: "1",
      TF_CLI_CONFIG_FILE: join(root, "fixture.tfrc"),
    };
    let child: ReturnType<typeof spawn> | undefined;
    let exit: Promise<number | null> | undefined;
    const emit = vi.fn();
    const hold = createDevPlanHold(devPlanHoldConfiguration(job, make()), emit);
    try {
      await writeFile(
        join(root, "fixture.tfrc"),
        "disable_checkpoint = true\n",
      );
      await writeFile(
        join(root, "main.tf"),
        `data "terraform_remote_state" "fixture" {\n backend = "http"\n config = { address = "http://127.0.0.1:${address.port}/state" }\n}\noutput "marker" { value = data.terraform_remote_state.fixture.outputs.marker }\n`,
      );
      const version = await promisify(execFile)(binary, ["version", "-json"], {
        env,
        cwd: root,
      });
      expect(JSON.parse(version.stdout).terraform_version).toBe("1.12.6");
      await promisify(execFile)(
        binary,
        ["init", "-backend=false", "-input=false", "-no-color"],
        { env, cwd: root },
      );
      child = spawn(
        "/bin/bash",
        [
          "-c",
          '"$1" plan -json -input=false -out=fixture.plan; result=$?; exit "$result"',
          "fixture",
          binary,
        ],
        { env, cwd: root, detached: true, stdio: ["ignore", "pipe", "ignore"] },
      );
      const running = child;
      exit = new Promise((done, fail) => {
        running.once("exit", done);
        running.once("error", fail);
      });
      let output = "";
      running.stdout?.on("data", (chunk) => {
        output += chunk.toString();
        if (
          output.includes('"type":"version"') ||
          output.includes('"type": "version"')
        )
          hold.hold(running.pid, Date.now() + 60_000);
      });
      await vi.waitFor(() =>
        expect(emit).toHaveBeenCalledWith("native-plan-held"),
      );
      expect(await readFile(`/proc/${running.pid}/status`, "utf8")).toMatch(
        /^State:\s+T\b/m,
      );
      expect(running.exitCode).toBeNull();
      if (outcome === "kill") {
        if (!running.pid) throw Error("fixture PID missing");
        process.kill(-running.pid, "SIGKILL");
        expect(await exit).toBeNull();
        expect(running.signalCode).toBe("SIGKILL");
        await expect(
          promisify(execFile)(binary, ["show", "-json", "fixture.plan"], {
            env,
            cwd: root,
          }),
        ).rejects.toBeDefined();
        return;
      }
      released = true;
      waiting.splice(0).forEach((send) => {
        send();
      });
      if (outcome !== "auto") hold.close();
      await vi.waitFor(
        () => expect(emit).toHaveBeenCalledWith("native-plan-released"),
        { timeout: 2000 },
      );
      expect(timer.mock.calls.some((x) => x[1] === 30_000)).toBe(true);
      expect(await exit).toBe(0);
      const shown = await promisify(execFile)(
        binary,
        ["show", "-json", "fixture.plan"],
        { env, cwd: root },
      );
      expect(JSON.parse(shown.stdout).planned_values.outputs.marker.value).toBe(
        "synthetic",
      );
    } finally {
      hold.close();
      released = true;
      waiting.splice(0).forEach((send) => {
        send();
      });
      if (child?.pid && child.exitCode === null)
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {}
      await exit?.catch(() => {});
      await new Promise<void>((done) => server.close(() => done()));
      await rm(root, { recursive: true, force: true });
    }
  },
  15_000,
);
