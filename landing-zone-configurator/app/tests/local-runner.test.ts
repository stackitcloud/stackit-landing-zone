import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, expect, it, vi } from "vitest";
import { approvableSummary } from "../apps/api/src/plans/execution.js";
import { LocalPlanRunner } from "../apps/api/src/plans/local.js";
import { summarizePlan } from "../apps/worker/src/plans/summary.js";

const id = "11111111-2222-4333-8444-555555555555";
const ticket = "t".repeat(43);
const origin = "http://127.0.0.1:3000";
const directories: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

async function fixture(
  version = "1.12.6",
  live = false,
  broker: "platform" | "application" = "platform",
) {
  const directory = await mkdtemp(join(tmpdir(), "lzc-local-runner-test-"));
  directories.push(directory);
  const root = join(directory, "package");
  const jobs = join(directory, "jobs");
  for (const path of [
    "accelerator",
    "application-src/application",
    "application-src/modules/landing-zone",
    "apps/worker/dist",
    "packages/contracts/dist",
    "providers",
    "tools",
    "runtime/bin",
    "node_modules/zod",
  ])
    await mkdir(join(root, path), { recursive: true });
  await chmod(root, 0o700);
  await copyFile(process.execPath, join(root, "runtime/bin/node"));
  await writeFile(join(root, "package.json"), "{}");
  for (const path of ["runner.tfrc", "package-lock.json"])
    await writeFile(join(root, path), "fixture");
  await writeFile(
    join(root, "run-plan.sh"),
    'test "$1:$2" = initializing:initial-plan-only\n',
  );
  await writeFile(
    join(root, "tools/tofu"),
    `#!/bin/sh\nif [ "$1" = show ]; then printf 'resource "stackit_project" "example" { name = "Example" password = (sensitive value) }'; exit 0; fi\nexec ${JSON.stringify(process.execPath)} -e 'console.log(JSON.stringify({terraform_version:${JSON.stringify(version)}}));'\n`,
    { mode: 0o700 },
  );
  await writeFile(
    join(root, "apps/worker/dist/main.js"),
    `const fs = require("node:fs"); fs.writeFileSync("result.json", JSON.stringify({keys:Object.keys(process.env).sort(), origin:process.env.LZC_BROKER_ORIGIN, local:process.env.LZC_LOCAL_RUNNER, root:process.env.LZC_RUNNER_PACKAGE_ROOT, broker:process.env.LZC_RUNNER_BROKER, ticketValid:/^[A-Za-z0-9_-]{43}$/.test(process.env.LZC_RUN_TICKET)})); ${live ? "setInterval(() => {}, 1000);" : ""}`,
  );
  const runner = await LocalPlanRunner.open(root, jobs, broker);
  return { root: await realpath(root), jobs: await realpath(jobs), runner };
}

it.each(["platform", "application"] as const)(
  "records a stable $0 package identity before launching a private minimal-env worker",
  async (broker) => {
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "must-not-inherit");
    vi.stubEnv("LZC_RUNNER_CF_PASSWORD", "must-not-inherit");
    const { root, jobs, runner } = await fixture("1.12.6", false, broker);
    const recorded = vi.fn(async (appId: string, identity: string) => {
      expect(appId).toBe(id);
      expect(identity).toMatch(/^[a-f0-9-]{36}$/);
      await expect(readFile(join(jobs, id, "result.json"))).rejects.toThrow();
    });
    await runner.start(id, ticket, origin, recorded);
    await vi.waitFor(
      async () => {
        const result = JSON.parse(
          await readFile(join(jobs, id, "result.json"), "utf8"),
        );
        expect(result).toMatchObject({
          origin,
          local: "true",
          root,
          ticketValid: true,
          broker,
        });
        expect(result.keys).not.toContain("AWS_SECRET_ACCESS_KEY");
        expect(result.keys).not.toContain("LZC_RUNNER_CF_PASSWORD");
      },
      { timeout: 4000 },
    );
    expect(recorded).toHaveBeenCalledOnce();
    await runner.remove(id, id);
    await expect(readFile(join(jobs, id, "result.json"))).rejects.toThrow();
  },
);

it("includes application sources and sibling modules in the immutable package identity", async () => {
  const { root, runner } = await fixture("1.12.6", false, "application");
  await writeFile(
    join(root, "application-src/modules/landing-zone/main.tf"),
    "changed",
  );
  const recorded = vi.fn(async () => {});
  await expect(runner.start(id, ticket, origin, recorded)).rejects.toThrow(
    "Local runner package changed",
  );
  expect(recorded).not.toHaveBeenCalled();
});

it("reads only owned live logs and redacts nested credentials without exposing other jobs", async () => {
  const { jobs, runner } = await fixture("1.12.6", true);
  await runner.start(id, ticket, origin, async () => {});
  const work = join(jobs, id, "lzc-runner-fixture");
  await mkdir(work, { mode: 0o700 });
  await writeFile(
    join(work, "credential.json"),
    JSON.stringify({ credentials: { privateKey: "test-private-credential" } }),
  );
  await writeFile(
    join(work, "plan.log"),
    "module.management.stackit_project.example: Refreshing state...\ntest-private-credential\n",
  );
  try {
    const result = await runner.output(id, id);
    expect(result.text).toContain("Refreshing state...");
    expect(result.text).not.toContain("test-private-credential");
    expect(result.text).toContain("(sensitive value)");
    expect(
      await runner.output(
        "22222222-2222-4333-8444-555555555555",
        "22222222-2222-4333-8444-555555555555",
      ),
    ).toMatchObject({ text: "" });
  } finally {
    await runner.remove(id, id);
  }
});

it("reads an exact saved plan without planning/applying or inherited credentials and cleans inspection files", async () => {
  const { jobs, runner } = await fixture();
  let identity = "";
  await runner.start(id, ticket, origin, async (_appId, value) => {
    identity = value;
  });
  const bytes = Buffer.from("saved-plan");
  const saved = {
    bytes,
    identity,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  const result = await runner.output(id, id, saved);
  expect(result.kind).toBe("saved-plan");
  expect(result.text).toContain('name = "Example"');
  expect(result.text).toContain("(sensitive value)");
  expect(
    (await readdir(jobs)).some((name) => name.startsWith("inspect-")),
  ).toBe(false);
  await expect(
    runner.output(id, id, { ...saved, sha256: "0".repeat(64) }),
  ).rejects.toThrow("artifact invalid");
  await expect(
    runner.output(id, id, { ...saved, identity: id }),
  ).rejects.toThrow("artifact invalid");
  await expect(runner.output("../escape", id, saved)).rejects.toThrow();
  await runner.remove(id, id);
});

it.runIf(process.env.LZC_NATIVE_RUNNER_TEST === "true")(
  "shows real native saved plan resource values and keeps OpenTofu sensitive values masked",
  async () => {
    const root = await realpath(
      process.env.LZC_RUNNER_PACKAGE_DIR ??
        fileURLToPath(
          new URL(
            "../../.local/runner-local-20261003-mirror-init/",
            import.meta.url,
          ),
        ),
    );
    const source = await mkdtemp(join(tmpdir(), "lzc-native-show-test-"));
    directories.push(source);
    await writeFile(
      join(source, "main.tf.json"),
      JSON.stringify({
        variable: {
          secret: {
            type: "string",
            description: "Sensitive input for the local read-only plan test",
            sensitive: true,
            default: "native-inspection-sensitive-fixture",
          },
        },
        resource: {
          terraform_data: {
            visible: { input: "Visible native resource value" },
            hidden: { input: "${var.secret}" },
          },
        },
      }),
      { mode: 0o600 },
    );
    const env = {
      PATH: "/usr/bin:/bin",
      HOME: source,
      TMPDIR: "/tmp",
      TF_IN_AUTOMATION: "true",
      TF_INPUT: "0",
    };
    const engine = join(root, "tools/tofu");
    await promisify(execFile)(
      engine,
      ["init", "-backend=false", "-input=false", "-no-color"],
      { cwd: source, env, timeout: 30000, maxBuffer: 65536 },
    );
    await promisify(execFile)(
      engine,
      ["plan", "-input=false", "-no-color", "-out=fixture.bin"],
      { cwd: source, env, timeout: 30000, maxBuffer: 65536 },
    );
    const shown = await promisify(execFile)(
      engine,
      ["show", "-json", "fixture.bin"],
      { cwd: source, env, timeout: 30000, maxBuffer: 65536 },
    );
    const nativePlan = JSON.parse(shown.stdout);
    expect(nativePlan.terraform_version).toBe("1.12.6");
    expect(nativePlan.complete).toBeUndefined();
    expect(approvableSummary(summarizePlan(nativePlan, 2))).toBe(false);
    const summary = summarizePlan(nativePlan, 2, "opentofu-1.12.6");
    expect(summary.completeness).toBe("complete");
    expect(approvableSummary(summary)).toBe(true);
    const runner = await LocalPlanRunner.open(root, join(source, "jobs"));
    let identity = "";
    await runner.start(id, ticket, origin, async (_appId, value) => {
      identity = value;
    });
    try {
      const bytes = await readFile(join(source, "fixture.bin"));
      const result = await runner.output(id, id, {
        bytes,
        identity,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
      expect(result.text).toContain("Visible native resource value");
      expect(result.text).toContain("(sensitive value)");
      expect(result.text).not.toContain("native-inspection-sensitive-fixture");
      expect(result.kind).toBe("saved-plan");
      expect(
        (await readdir(join(source, "jobs"))).some((name) =>
          name.startsWith("inspect-"),
        ),
      ).toBe(false);
    } finally {
      await runner.remove(id, id);
    }
  },
  120000,
);

it("rejects untrusted origins, invalid identifiers and tickets before recording or launch", async () => {
  const { runner } = await fixture();
  expect(await runner.output(id, null)).toEqual({
    text: "",
    truncated: false,
    kind: "live",
  });
  const record = vi.fn();
  for (const broker of [
    "http://localhost:3000",
    "http://127.0.0.1:3000/",
    "https://attacker.example",
  ])
    await expect(runner.start(id, ticket, broker, record)).rejects.toThrow();
  await expect(
    runner.start("../escape", ticket, origin, record),
  ).rejects.toThrow();
  await expect(
    runner.start(id, "bad-ticket", origin, record),
  ).rejects.toThrow();
  expect(record).not.toHaveBeenCalled();
});

it("refuses changed packages and unsupported engines", async () => {
  const { root, runner } = await fixture();
  await writeFile(join(root, "run-plan.sh"), "changed");
  await expect(runner.start(id, ticket, origin, vi.fn())).rejects.toThrow(
    "package changed",
  );
  await expect(fixture("1.11.6")).rejects.toThrow("1.12.6");
});

it("keeps unacknowledged recovery and never kills an untracked process after restart", async () => {
  const { jobs, runner } = await fixture();
  const directory = join(jobs, id);
  await mkdir(join(directory, "work"), { recursive: true, mode: 0o700 });
  await writeFile(
    join(directory, "work/errored.tfstate"),
    "protected-recovery",
    { mode: 0o600 },
  );
  await expect(runner.remove(id, id)).rejects.toThrow("recovery is pending");
  expect(await readFile(join(directory, "work/errored.tfstate"), "utf8")).toBe(
    "protected-recovery",
  );
  await writeFile(join(directory, "running.json"), "{}", { mode: 0o600 });
  await expect(runner.remove(id, id)).rejects.toThrow("restart reconciliation");
  await expect(
    runner.remove(id, "22222222-2222-4333-8444-555555555555"),
  ).rejects.toThrow("identity mismatch");
});
