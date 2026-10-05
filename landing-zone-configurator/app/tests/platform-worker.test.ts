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
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, expect, it, vi } from "vitest";
import {
  acceleratorCommit,
  brokerOrigin,
  localBrokerOrigin,
  providerLockHash,
  runWorker,
} from "../apps/worker/src/runner.js";

const runner = fileURLToPath(new URL("../../deploy/runner/", import.meta.url));
const ticket = "t".repeat(43);
const secret = "private-provider-value";
const plan = Buffer.from("reviewed-saved-plan");
const s3Backend = {
  kind: "s3",
  descriptor: {
    bucket: "management-tfstate",
    endpoint: "https://object.storage.eu01.onstackit.cloud",
    region: "eu01",
    key: "landing-zone/terraform.tfstate",
    useLockfile: true,
  },
  credentials: {
    accessKeyId: "test-access-key",
    secretAccessKey: "private-aws-secret",
  },
};
const recovery = JSON.stringify({
  version: 4,
  lineage: "11111111-1111-4111-8111-111111111111",
  serial: 2,
  outputs: {},
  resources: [
    {
      mode: "managed",
      type: "test",
      name: "fixture",
      instances: [{ attributes: { secret } }],
    },
  ],
});
const digest = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

async function fixture(
  mode: string | undefined = "platform-plan",
  behavior = "success",
  expectedOrigin = brokerOrigin,
) {
  const root = await mkdtemp(join(tmpdir(), "lzc-worker-test-"));
  directories.push(root);
  await mkdir(join(root, "tools"));
  await mkdir(join(root, "accelerator"));
  await copyFile(
    join(runner, "accelerator.lock.hcl"),
    join(root, "accelerator/.terraform.lock.hcl"),
  );
  await copyFile(
    fileURLToPath(new URL("../../../src/backend.tf", import.meta.url)),
    join(root, "accelerator/backend.tf"),
  );
  await copyFile(join(runner, "run-plan.sh"), join(root, "run-plan.sh"));
  await writeFile(join(root, "runner.tfrc"), "disable_checkpoint = true\n");
  const callsPath = join(root, "calls.jsonl");
  await writeFile(
    join(root, "tools/tofu"),
    `#!/bin/sh
  exec ${JSON.stringify(process.execPath)} - "$@" <<'LZC_FAKE_TOFU'
const fs = require("node:fs");
const crypto = require("node:crypto");
const args = process.argv.slice(2);
const phase = args[0];
if (phase === "version") {
  console.log(JSON.stringify({terraform_version: ${JSON.stringify(behavior === "wrong-engine" ? "1.11.6" : "1.12.6")}}));
  process.exit(0);
}
const env = process.env;
const http = Boolean(env.TF_HTTP_ADDRESS);
const s3 = env.LZC_BACKEND_KIND === "s3";
const backend = s3 ? JSON.parse(fs.readFileSync("backend.tf.json", "utf8")) : null;
fs.appendFileSync(${JSON.stringify(callsPath)}, JSON.stringify({args, work: process.cwd(), http, s3, backend,
  cliConfig: fs.readFileSync(env.TF_CLI_CONFIG_FILE, "utf8"),
  cliConfigMode: fs.statSync(env.TF_CLI_CONFIG_FILE).mode & 0o777,
  temp: env.TMPDIR,
  tempMode: fs.statSync(env.TMPDIR).mode & 0o777,
  aws: Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY),
  httpVariables: Object.keys(env).filter(name => name.startsWith("TF_HTTP_")),
  backendMode: s3 ? fs.statSync("backend.tf.json").mode & 0o777 : null,
  sourceBackendPresent: fs.existsSync("backend.tf")}) + "\\n");
if (env.LZC_RUN_TICKET || env.LZC_BROKER_ORIGIN || env.CF_SECRET || env.TF_CLI_ARGS || env.TF_HTTP_PASSWORD && !http) process.exit(88);
if (s3) {
  if (env.AWS_ACCESS_KEY_ID !== ${JSON.stringify(s3Backend.credentials.accessKeyId)} ||
      env.AWS_SECRET_ACCESS_KEY !== ${JSON.stringify(s3Backend.credentials.secretAccessKey)} ||
      env.AWS_REGION !== "eu01" || env.AWS_DEFAULT_REGION !== "eu01" ||
      env.AWS_SESSION_TOKEN || env.AWS_PROFILE || env.AWS_CONFIG_FILE || env.AWS_SHARED_CREDENTIALS_FILE ||
      fs.existsSync("backend.tf") || (!args.includes("-migrate-state") && http)) process.exit(92);
}
if (http) {
    if (env.TF_HTTP_ADDRESS !== ${JSON.stringify(`${expectedOrigin}/api/runner/state`)} ||
      env.TF_HTTP_LOCK_ADDRESS !== ${JSON.stringify(`${expectedOrigin}/api/runner/state/lock`)} ||
      env.TF_HTTP_UNLOCK_ADDRESS !== ${JSON.stringify(`${expectedOrigin}/api/runner/state/unlock`)} ||
      env.TF_HTTP_PASSWORD !== ${JSON.stringify(ticket)} || env.TF_HTTP_USERNAME !== "runner" ||
      env.TF_HTTP_LOCK_METHOD !== "POST" || env.TF_HTTP_UNLOCK_METHOD !== "POST" || env.TF_HTTP_RETRY_MAX !== "0") process.exit(89);
  if (!args.includes("-migrate-state") && fs.readFileSync("backend.tf", "utf8") !== 'terraform {\\n  backend "http" {}\\n}\\n') process.exit(90);
}
if (args.includes("-migrate-state") && ${JSON.stringify(behavior)} === "migration-failure") process.exit(93);
if (args.includes("-migrate-state") && ${JSON.stringify(behavior)} === "migration-recovery") {
  fs.writeFileSync("errored.tfstate", ${JSON.stringify(recovery)}, {mode:0o600});
  process.exit(93);
}
if (phase === "plan") {
  fs.writeFileSync("plan.bin", ${JSON.stringify(plan.toString())});
  console.log(${JSON.stringify(secret)});
  process.exit(2);
}
if (phase === "show") {
  console.log(JSON.stringify({format_version:"1.2", terraform_version:"1.12.6", errored:false, configuration:{secret:${JSON.stringify(secret)}}, planned_values:{}, resource_changes:[{mode:"managed", change:{actions:["create"], after:{secret:${JSON.stringify(secret)}}}}]}));
  process.exit(0);
}
if (phase === "apply") {
  if (args.at(-1) !== "saved-plan.bin" || fs.readFileSync("saved-plan.bin", "utf8") !== ${JSON.stringify(plan.toString())} ||
      fs.existsSync("landing-zone.tfvars") || args.some(arg => arg.includes("auto-approve") || arg.includes("var-file"))) process.exit(91);
  if (${JSON.stringify(behavior)}.startsWith("recovery-")) fs.writeFileSync("errored.tfstate", ${JSON.stringify(recovery)}, {mode:0o600});
  if (${JSON.stringify(behavior)}.startsWith("recovery-invalid-")) {
    const state = JSON.parse(${JSON.stringify(recovery)});
    state[${JSON.stringify(behavior.replace("recovery-invalid-", ""))}] = ${JSON.stringify(behavior.endsWith("serial") ? -1 : null)};
    fs.writeFileSync("errored.tfstate", JSON.stringify(state), {mode:0o600});
  }
  if (${JSON.stringify(behavior)} === "recovery-oversized") fs.truncateSync("errored.tfstate", 16 * 1024 * 1024 + 1);
  if (${JSON.stringify(behavior)} === "state-failure") fs.writeFileSync("errored.tfstate", "private-recovery-state", {mode:0o600});
  if (${JSON.stringify(behavior)} === "timeout" || ${JSON.stringify(behavior)} === "recovery-timeout") { setInterval(() => {}, 1000); }
  else { console.log(${JSON.stringify(secret)}); console.error(${JSON.stringify(secret)}); process.exit(${behavior === "apply-failure" || behavior === "state-failure" || (behavior.startsWith("recovery-") && behavior !== "recovery-success-exit") ? 1 : 0}); }
}
LZC_FAKE_TOFU
`,
  );
  await chmod(join(root, "tools/tofu"), 0o700);
  await promisify(execFile)(join(root, "tools/tofu"), ["version", "-json"]);
  const input: Record<string, unknown> = {
    id: "run-id",
    acceleratorCommit,
    lockHash: providerLockHash,
    tfvars: 'organization_id = "fixture"\n',
    tfvarsSha256: digest('organization_id = "fixture"\n'),
    key: { secret },
    ...(mode === undefined ? {} : { mode }),
    ...(mode === "platform-plan" || mode === "platform-apply"
      ? {
          backend: {
            kind: "bootstrap",
            address: `${brokerOrigin}/api/runner/state`,
            lockAddress: `${brokerOrigin}/api/runner/state/lock`,
            unlockAddress: `${brokerOrigin}/api/runner/state/unlock`,
            username: "runner",
            password: ticket,
          },
        }
      : {}),
    ...(mode === "platform-apply"
      ? { plan: { data: plan.toString("base64"), sha256: digest(plan) } }
      : {}),
  };
  const reports: { path: string; body: unknown }[] = [];
  const report = vi.fn(
    async (path: string, body: unknown): Promise<unknown> => {
      reports.push({ path, body });
      if (path === "input") return input;
      if (path === "migration") return { backend: s3Backend };
      if (path === "recovery") {
        if (behavior === "recovery-upload-failure") throw new Error(secret);
        return {
          sha256:
            behavior === "recovery-wrong-receipt"
              ? "0".repeat(64)
              : digest(recovery),
        };
      }
      if (path === "artifact") {
        if (behavior === "upload-failure") throw new Error(secret);
        return {
          sha256: behavior === "upload-hash" ? "0".repeat(64) : digest(plan),
        };
      }
      return null;
    },
  );
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const execute = (timeoutMilliseconds?: number) =>
    runWorker({
      root,
      id: "run-id",
      ticket,
      brokerOrigin,
      report,
      ...(timeoutMilliseconds === undefined ? {} : { timeoutMilliseconds }),
    });
  const calls = async (): Promise<
    {
      args: string[];
      cliConfig: string;
      cliConfigMode: number;
      temp: string;
      tempMode: number;
      work: string;
      http: boolean;
      s3: boolean;
      aws: boolean;
      backend: unknown;
      httpVariables: string[];
      backendMode: number;
      sourceBackendPresent: boolean;
    }[]
  > =>
    readFile(callsPath, "utf8").then(
      (text) =>
        text
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line)),
      () => [],
    );
  return { root, input, execute, calls, reports, report, output, errors };
}

it("allows the fixed local broker only explicitly and keeps work in the private job directory", async () => {
  const test = await fixture("platform-plan", "success", localBrokerOrigin);
  const backend = test.input.backend as {
    address: string;
    lockAddress: string;
    unlockAddress: string;
  };
  backend.address = `${localBrokerOrigin}/api/runner/state`;
  backend.lockAddress = `${localBrokerOrigin}/api/runner/state/lock`;
  backend.unlockAddress = `${localBrokerOrigin}/api/runner/state/unlock`;
  const outcome = await runWorker({
    root: test.root,
    id: "run-id",
    ticket,
    brokerOrigin: localBrokerOrigin,
    local: true,
    workRoot: test.root,
    report: test.report,
  });
  expect(
    outcome,
    JSON.stringify(
      test.reports.map(({ path, body }) => ({
        path,
        ...(path === "result" ? { body } : {}),
      })),
    ),
  ).toBe("succeeded");
  for (const call of await test.calls()) {
    expect(call.work.startsWith(await realpath(test.root))).toBe(true);
    expect(call.cliConfig).toContain(
      JSON.stringify(join(test.root, "providers")),
    );
    expect(call.cliConfig).not.toContain("/home/vcap/app/providers");
    expect(call.cliConfigMode).toBe(0o600);
    expect(call.temp.startsWith("/tmp/lzc-sock-")).toBe(true);
    expect(call.tempMode).toBe(0o700);
    await expect(stat(call.temp)).rejects.toThrow("ENOENT");
  }
});

it.runIf(process.env.LZC_NATIVE_RUNNER_TEST === "true")(
  "initializes and validates real native providers without credentials or cloud planning",
  async () => {
    const root = await realpath(
      process.env.LZC_RUNNER_PACKAGE_DIR ??
        fileURLToPath(new URL("../../.local/runner-local/", import.meta.url)),
    );
    const workRoot = await mkdtemp(join(tmpdir(), "lzc-native-init-test-"));
    const { runWorker: nativeWorker }: { runWorker: typeof runWorker } =
      await import(
        pathToFileURL(join(root, "apps/worker/dist/runner.js")).href
      );
    directories.push(workRoot);
    const stages: string[] = [];
    const diagnostics: string[] = [];
    const tfvars = 'organization_id = "fixture"\n';
    vi.spyOn(console, "error").mockImplementation(() => {});
    const outcome = await nativeWorker({
      root,
      workRoot,
      local: true,
      id: "native-init-test",
      ticket,
      brokerOrigin: localBrokerOrigin,
      report: async (path, body) => {
        if (path === "input")
          return {
            id: "native-init-test",
            mode: "initial-plan-only",
            acceleratorCommit,
            lockHash: providerLockHash,
            tfvars,
            tfvarsSha256: digest(tfvars),
            key: {},
          };
        if (path === "stage") {
          const { stage } = body as { stage: string };
          stages.push(stage);
          if (stage === "planning")
            throw new Error("Stop before cloud planning");
        }
        if (path === "result" && stages.length <= 2) {
          for (const entry of await readdir(workRoot)) {
            const log = await readFile(
              join(
                workRoot,
                entry,
                stages.length === 1 ? "init.log" : "validate.log",
              ),
              "utf8",
            ).catch(() => "");
            diagnostics.push(
              ...log
                .split("\n")
                .filter((line) => line.startsWith("Error:"))
                .map((line) => line.slice(0, 160)),
            );
            diagnostics.push(
              JSON.stringify({
                checksums: /checksum/i.test(log),
                unavailable: /not (found|available)|no such file/i.test(log),
                permissions: /permission denied|operation not permitted/i.test(
                  log,
                ),
                archive: /invalid zip|invalid archive/i.test(log),
                mismatch: /doesn't match|does not match|mismatch/i.test(log),
                pluginSocket:
                  /bind: invalid argument|unix.*too long|socket.*too long/i.test(
                    log,
                  ),
                provider: log
                  .match(/Error while installing ([a-zA-Z0-9_/-]+) v([0-9.]+)/)
                  ?.slice(1),
              }),
            );
          }
        }
        return null;
      },
    });
    expect(outcome).toBe("failed");
    expect(stages, JSON.stringify(diagnostics)).toEqual([
      "initializing",
      "validating",
      "planning",
    ]);
    expect(await readdir(workRoot)).toEqual([]);
  },
  120000,
);

it.each(["success", "apply-failure", "migration-failure"])(
  "publishes redacted Apply output before the terminal result and cleanup: %s",
  async (behavior) => {
    const test = await fixture("platform-apply", behavior);
    await test.execute();
    const published = test.reports.find(({ path }) => path === "output");
    expect(published).toBeDefined();
    expect(published?.body).toMatchObject({
      text: expect.stringContaining("$ tofu apply saved-plan.bin"),
      truncated: false,
    });
    expect(JSON.stringify(published?.body)).not.toContain(secret);
    expect(
      test.reports.findIndex(({ path }) => path === "output"),
    ).toBeLessThan(test.reports.findIndex(({ path }) => path === "result"));
    for (const call of await test.calls())
      await expect(stat(call.work)).rejects.toThrow("ENOENT");
  },
);

it("rejects loopback brokers in production mode and foreign brokers in local mode", async () => {
  const test = await fixture();
  for (const configuration of [
    { brokerOrigin: localBrokerOrigin },
    { brokerOrigin, local: true },
    { brokerOrigin: "http://localhost:3000", local: true },
    { brokerOrigin: "http://127.0.0.1:3001", local: true },
  ])
    expect(
      await runWorker({
        root: test.root,
        id: "run-id",
        ticket,
        report: test.report,
        ...configuration,
      }),
    ).toBe("failed");
  expect(test.reports.some((report) => report.path === "input")).toBe(false);
  expect(await test.calls()).toEqual([]);
});

it("uploads only the saved artifact and sanitized counts before platform-plan success", async () => {
  const test = await fixture();
  expect(await test.execute()).toBe("succeeded");
  expect(test.reports.map((report) => report.path)).toEqual([
    "input",
    "stage",
    "stage",
    "stage",
    "artifact",
    "output",
    "result",
  ]);
  expect(
    test.reports
      .filter((report) => report.path === "stage")
      .map((report) => report.body),
  ).toEqual([
    { stage: "initializing" },
    { stage: "validating" },
    { stage: "planning" },
  ]);
  expect(
    test.reports.find((report) => report.path === "artifact")?.body,
  ).toMatchObject({
    data: plan.toString("base64"),
    summary: { resources: { create: 1 }, applyAllowed: false },
  });
  expect(test.reports.at(-1)?.body).toMatchObject({
    status: "succeeded",
    artifactSha256: digest(plan),
  });
  const calls = await test.calls();
  expect(calls.map((call) => call.args[0])).toEqual([
    "init",
    "validate",
    "plan",
    "show",
  ]);
  expect(calls[0]?.args).toContain("-lockfile=readonly");
  expect(calls.every((call) => call.http)).toBe(true);
  expect(JSON.stringify(test.reports)).not.toContain(secret);
  expect(
    JSON.stringify([test.output.mock.calls, test.errors.mock.calls]),
  ).not.toContain(ticket);
  expect(await stat(calls[0]?.work as string).catch(() => null)).toBeNull();
});

it("executes exactly the approved saved plan, without planning, and cleans private logs", async () => {
  vi.stubEnv("CF_SECRET", secret);
  vi.stubEnv("LZC_RUN_TICKET", ticket);
  vi.stubEnv("TF_CLI_ARGS", "-auto-approve");
  vi.stubEnv("TF_HTTP_PASSWORD", "parent-secret");
  const test = await fixture("platform-apply");
  expect(await test.execute()).toBe("succeeded");
  const calls = await test.calls();
  expect(calls.map((call) => call.args[0])).toEqual([
    "init",
    "validate",
    "apply",
    "init",
  ]);
  expect(calls[2]?.args).toEqual([
    "apply",
    "-input=false",
    "-no-color",
    "-parallelism=4",
    "-lock-timeout=0s",
    "saved-plan.bin",
  ]);
  expect(
    test.reports.filter((report) => report.path === "stage").at(-1)?.body,
  ).toEqual({ stage: "applying" });
  expect(test.reports.at(-1)?.body).toEqual({ status: "succeeded" });
  expect(
    JSON.stringify([
      test.reports,
      test.output.mock.calls,
      test.errors.mock.calls,
    ]),
  ).not.toContain(secret);
  expect(await stat(calls[0]?.work as string).catch(() => null)).toBeNull();
});

it.each(["initial-plan-only", undefined])(
  "retains legacy backend-disabled plan-only behavior (%s)",
  async (mode) => {
    const test = await fixture(mode ?? "initial-plan-only");
    if (mode === undefined) delete test.input.mode;
    expect(await test.execute()).toBe("succeeded");
    const calls = await test.calls();
    expect(calls.map((call) => call.args[0])).toEqual([
      "init",
      "validate",
      "plan",
      "show",
    ]);
    expect(calls[0]?.args).toContain("-backend=false");
    expect(calls.every((call) => !call.http)).toBe(true);
    expect(test.reports.some((report) => report.path === "artifact")).toBe(
      false,
    );
  },
);

it.each([
  "mode",
  "tfvars",
  "commit",
  "lock",
  "address",
  "lockAddress",
  "unlockAddress",
  "username",
  "password",
  "hash",
  "base64",
  "empty",
  "oversized",
])("refuses forged %s before init", async (tamper) => {
  const test = await fixture("platform-apply");
  const backend = test.input.backend as Record<string, unknown>;
  const artifact = test.input.plan as Record<string, unknown>;
  if (tamper === "mode") test.input.mode = "apply";
  else if (tamper === "tfvars") test.input.tfvarsSha256 = "0".repeat(64);
  else if (tamper === "commit") test.input.acceleratorCommit = "mutable";
  else if (tamper === "lock") test.input.lockHash = "0".repeat(64);
  else if (["address", "lockAddress", "unlockAddress"].includes(tamper))
    backend[tamper] = `${brokerOrigin}/api/runner/state?attacker=1`;
  else if (tamper === "username" || tamper === "password")
    backend[tamper] = "other";
  else if (tamper === "hash") artifact.sha256 = "0".repeat(64);
  else if (tamper === "base64") artifact.data = `${artifact.data}\n`;
  else if (tamper === "empty") {
    artifact.data = "";
    artifact.sha256 = digest("");
  } else {
    const bytes = Buffer.alloc(16 * 1024 * 1024 + 1);
    artifact.data = bytes.toString("base64");
    artifact.sha256 = digest(bytes);
  }
  expect(await test.execute()).toBe("failed");
  expect(await test.calls()).toEqual([]);
  expect(test.reports.at(-1)?.body).toMatchObject({ status: "failed" });
});

it("rejects backend credentials and artifacts in legacy mode", async () => {
  const test = await fixture("initial-plan-only");
  test.input.plan = { data: plan.toString("base64"), sha256: digest(plan) };
  expect(await test.execute()).toBe("failed");
  expect(await test.calls()).toEqual([]);
});

it("refuses a different local engine without initializing", async () => {
  const test = await fixture("platform-apply", "wrong-engine");
  expect(await test.execute()).toBe("failed");
  expect(await test.calls()).toEqual([]);
});

it("keeps immutable example tfvars without treating them as runtime state", async () => {
  const test = await fixture();
  await mkdir(join(test.root, "accelerator/config"));
  await writeFile(
    join(test.root, "accelerator/config/example.tfvars"),
    "example = true\n",
  );
  expect(await test.execute()).toBe("succeeded");
});

it.each(["upload-failure", "upload-hash"])(
  "never reports eligibility after %s",
  async (behavior) => {
    const test = await fixture("platform-plan", behavior);
    expect(await test.execute()).toBe("failed");
    expect(test.reports.at(-1)?.body).toEqual({
      status: "failed",
      errorCode: "artifact_invalid",
    });
    expect(
      test.reports.some(
        (report) => (report.body as { status?: string }).status === "succeeded",
      ),
    ).toBe(false);
  },
);

it("does not retry a failed saved-plan apply", async () => {
  const test = await fixture("platform-apply", "apply-failure");
  expect(await test.execute()).toBe("failed");
  expect(
    (await test.calls()).filter((call) => call.args[0] === "apply"),
  ).toHaveLength(1);
  expect(test.reports.at(-1)?.body).toEqual({
    status: "failed",
    errorCode: "apply_failed",
  });
  expect(test.reports.some((entry) => entry.path === "migration")).toBe(false);
});

it.each(["platform-plan", "platform-apply"])(
  "uses native S3 before init for %s without HTTP or ambient AWS credentials",
  async (mode) => {
    for (const name of [
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_SESSION_TOKEN",
      "AWS_PROFILE",
      "AWS_CONFIG_FILE",
      "AWS_SHARED_CREDENTIALS_FILE",
      "TF_HTTP_ADDRESS",
      "TF_HTTP_PASSWORD",
    ])
      vi.stubEnv(name, "untrusted-parent-value");
    const test = await fixture(mode);
    test.input.backend = structuredClone(s3Backend);
    expect(await test.execute()).toBe("succeeded");
    const calls = await test.calls();
    expect(calls.map((call) => call.args[0])).toEqual(
      mode === "platform-plan"
        ? ["init", "validate", "plan", "show"]
        : ["init", "validate", "apply"],
    );
    expect(calls[0]?.args).toEqual([
      "init",
      "-input=false",
      "-no-color",
      "-lockfile=readonly",
      "-lock-timeout=0s",
    ]);
    for (const call of calls) {
      expect(call).toMatchObject({
        s3: true,
        aws: true,
        http: false,
        httpVariables: [],
        backendMode: 0o600,
        sourceBackendPresent: false,
      });
      expect(call.backend).toEqual({
        terraform: {
          backend: {
            s3: {
              bucket: s3Backend.descriptor.bucket,
              endpoints: { s3: s3Backend.descriptor.endpoint },
              region: "eu01",
              key: s3Backend.descriptor.key,
              use_lockfile: true,
              skip_credentials_validation: true,
              skip_region_validation: true,
              skip_requesting_account_id: true,
              skip_s3_checksum: true,
            },
          },
        },
      });
    }
    if (mode === "platform-apply")
      expect(calls[2]?.args).toEqual([
        "apply",
        "-input=false",
        "-no-color",
        "-parallelism=4",
        "-lock-timeout=0s",
        "saved-plan.bin",
      ]);
    expect(test.reports.some((entry) => entry.path === "migration")).toBe(
      false,
    );
    expect(
      JSON.stringify([
        calls,
        test.reports,
        test.output.mock.calls,
        test.errors.mock.calls,
      ]),
    ).not.toContain(s3Backend.credentials.secretAccessKey);
    expect(
      await readFile(join(test.root, "accelerator/backend.tf"), "utf8"),
    ).not.toContain('backend "http"');
  },
);

it("migrates bootstrap only after exact saved-plan apply and server prepare, before terminal success", async () => {
  const test = await fixture("platform-apply");
  let work: string | undefined;
  test.report.mockImplementation(async (path, body) => {
    test.reports.push({ path, body });
    if (path === "input") return test.input;
    if (path === "migration") {
      const calls = await test.calls();
      work = calls[0]?.work;
      if ((body as { phase: string }).phase === "prepare") {
        expect(calls.map((call) => call.args[0])).toEqual([
          "init",
          "validate",
          "apply",
        ]);
        return { backend: s3Backend };
      }
      expect(
        JSON.parse(
          await readFile(join(work as string, "backend.tf.json"), "utf8"),
        ),
      ).toMatchObject({
        terraform: { backend: { s3: { use_lockfile: true } } },
      });
    }
    return null;
  });
  expect(await test.execute()).toBe("succeeded");
  const calls = await test.calls();
  expect(calls[3]).toMatchObject({ http: true, s3: true, aws: true });
  expect(calls[3]?.args).toEqual([
    "init",
    "-migrate-state",
    "-force-copy",
    "-input=false",
    "-no-color",
    "-lockfile=readonly",
  ]);
  expect(
    test.reports.filter((report) => report.path !== "output").slice(-3),
  ).toEqual([
    { path: "migration", body: { phase: "prepare" } },
    { path: "migration", body: { phase: "complete" } },
    { path: "result", body: { status: "succeeded" } },
  ]);
  expect(await stat(work as string).catch(() => null)).toBeNull();
});

it.each([
  "migration-failure",
  "prepare-invalid",
  "prepare-failure",
  "complete-failure",
])("never succeeds or replans after %s", async (behavior) => {
  const test = await fixture("platform-apply", behavior);
  if (behavior !== "migration-failure") {
    const original = test.report.getMockImplementation();
    if (!original) throw new Error("Missing mock implementation");
    test.report.mockImplementation(async (path, body) => {
      if (path === "migration") {
        const phase = (body as { phase: string }).phase;
        if (behavior === `${phase}-failure`) throw new Error(secret);
        if (behavior === "prepare-invalid")
          return {
            backend: {
              ...s3Backend,
              descriptor: {
                ...s3Backend.descriptor,
                endpoint: "https://attacker.invalid",
              },
            },
          };
      }
      return original(path, body);
    });
  }
  expect(await test.execute()).toBe("failed");
  expect(test.reports.at(-1)?.body).toEqual({
    status: "failed",
    errorCode: "state_failed",
  });
  expect(
    (await test.calls()).filter((call) => call.args[0] === "apply"),
  ).toHaveLength(1);
  expect((await test.calls()).some((call) => call.args[0] === "plan")).toBe(
    false,
  );
  expect(
    test.reports.some(
      (entry) => (entry.body as { status?: string }).status === "succeeded",
    ),
  ).toBe(false);
});

it.each([
  "kind",
  "bucket",
  "endpoint",
  "region",
  "key",
  "useLockfile",
  "credentials",
  "extra",
])("rejects malformed S3 %s before engine execution", async (field) => {
  const test = await fixture("platform-apply");
  const backend = structuredClone(s3Backend) as unknown as Record<
    string,
    unknown
  >;
  if (["kind", "credentials"].includes(field)) backend[field] = "invalid";
  else if (field === "extra") backend.extra = true;
  else
    (backend.descriptor as Record<string, unknown>)[field] =
      field === "useLockfile" ? false : "";
  test.input.backend = backend;
  expect(await test.execute()).toBe("failed");
  expect(await test.calls()).toEqual([]);
  expect(test.reports.at(-1)?.body).toEqual({
    status: "failed",
    errorCode: "state_failed",
  });
});

it.each(["recovery-received", "recovery-success-exit"])(
  "uploads valid recovery before failure and cleans only after hash receipt (%s)",
  async (behavior) => {
    const test = await fixture("platform-apply", behavior);
    const original = test.report.getMockImplementation();
    if (!original) throw new Error("Missing mock implementation");
    test.report.mockImplementation(async (path, body) => {
      if (path === "recovery") {
        const work = (await test.calls())[0]?.work as string;
        expect(await readFile(join(work, "errored.tfstate"), "utf8")).toBe(
          recovery,
        );
        expect(body).toEqual({
          data: Buffer.from(recovery).toString("base64"),
          sha256: digest(recovery),
        });
        expect(test.reports.some((entry) => entry.path === "result")).toBe(
          false,
        );
      }
      return original(path, body);
    });
    expect(await test.execute()).toBe("failed");
    expect(
      test.reports.filter((report) => report.path !== "output").slice(-2),
    ).toEqual([
      {
        path: "recovery",
        body: {
          data: Buffer.from(recovery).toString("base64"),
          sha256: digest(recovery),
        },
      },
      { path: "result", body: { status: "failed", errorCode: "state_failed" } },
    ]);
    expect(
      await stat((await test.calls())[0]?.work as string).catch(() => null),
    ).toBeNull();
    expect(test.reports.some((entry) => entry.path === "migration")).toBe(
      false,
    );
    expect(
      JSON.stringify([test.output.mock.calls, test.errors.mock.calls]),
    ).not.toContain(secret);
  },
);

it.each([
  "recovery-wrong-receipt",
  "recovery-upload-failure",
  "recovery-oversized",
])(
  "retains private state on %s without success or apply retry",
  async (behavior) => {
    const test = await fixture("platform-apply", behavior);
    expect(await test.execute()).toBe("failed");
    const calls = await test.calls();
    const work = calls[0]?.work as string;
    directories.push(work);
    expect(await readdir(work)).toEqual(["errored.tfstate"]);
    expect((await stat(join(work, "errored.tfstate"))).mode & 0o777).toBe(
      0o600,
    );
    expect(calls.filter((call) => call.args[0] === "apply")).toHaveLength(1);
    expect(test.reports.at(-1)?.body).toEqual({
      status: "failed",
      errorCode: "state_failed",
    });
    if (behavior === "recovery-oversized")
      expect(test.reports.some((entry) => entry.path === "recovery")).toBe(
        false,
      );
  },
);

it("accepts only specifically validated no-kind legacy bootstrap", async () => {
  const test = await fixture("platform-apply");
  delete (test.input.backend as Record<string, unknown>).kind;
  expect(await test.execute()).toBe("succeeded");
  expect((await test.calls())[3]?.args).toContain("-migrate-state");
});

it.each(["accessKeyId", "secretAccessKey"])(
  "rejects control characters in S3 %s",
  async (field) => {
    const test = await fixture("platform-apply");
    const backend = structuredClone(s3Backend);
    backend.credentials[field as keyof typeof backend.credentials] =
      "unsafe\nvalue";
    test.input.backend = backend;
    expect(await test.execute()).toBe("failed");
    expect(await test.calls()).toEqual([]);
  },
);

it.each(["version", "lineage", "serial", "resources"])(
  "retains recovery with invalid %s without uploading it",
  async (field) => {
    const test = await fixture("platform-apply", `recovery-invalid-${field}`);
    expect(await test.execute()).toBe("failed");
    const work = (await test.calls())[0]?.work as string;
    directories.push(work);
    expect(await readdir(work)).toEqual(["errored.tfstate"]);
    expect(test.reports.some((entry) => entry.path === "recovery")).toBe(false);
    expect(test.reports.at(-1)?.body).toEqual({
      status: "failed",
      errorCode: "state_failed",
    });
  },
);

it.each(["migration-recovery", "recovery-timeout"])(
  "durably reports recovery from %s before terminal failure",
  async (behavior) => {
    const test = await fixture("platform-apply", behavior);
    expect(
      await test.execute(behavior === "recovery-timeout" ? 2000 : undefined),
    ).toBe("failed");
    expect(
      test.reports.filter((report) => report.path !== "output").slice(-2),
    ).toEqual([
      {
        path: "recovery",
        body: {
          data: Buffer.from(recovery).toString("base64"),
          sha256: digest(recovery),
        },
      },
      { path: "result", body: { status: "failed", errorCode: "state_failed" } },
    ]);
    expect(
      await stat((await test.calls())[0]?.work as string).catch(() => null),
    ).toBeNull();
    expect(
      test.reports.some(
        (entry) =>
          entry.path === "migration" &&
          (entry.body as { phase: string }).phase === "complete",
      ),
    ).toBe(false);
  },
);

it("retains only private recovery state when the remote backend cannot persist it", async () => {
  const test = await fixture("platform-apply", "state-failure");
  expect(await test.execute()).toBe("failed");
  const work = (await test.calls())[0]?.work as string;
  expect(work).toBeTypeOf("string");
  directories.push(work);
  expect(await readdir(work)).toEqual(["errored.tfstate"]);
  expect((await stat(join(work, "errored.tfstate"))).mode & 0o777).toBe(0o600);
  expect(test.reports.at(-1)?.body).toEqual({
    status: "failed",
    errorCode: "state_failed",
  });
});

it("times out apply once, without retry or replan", async () => {
  const test = await fixture("platform-apply", "timeout");
  expect(await test.execute(2000)).toBe("failed");
  const calls = await test.calls();
  expect(calls.map((call) => call.args[0])).toEqual([
    "init",
    "validate",
    "apply",
  ]);
  expect(test.reports.at(-1)?.body).toEqual({
    status: "failed",
    errorCode: "timed_out",
  });
  expect(await stat(calls[0]?.work as string).catch(() => null)).toBeNull();
});

it.each([
  "terraform.tfstate",
  "terraform.tfstate.backup",
  "nested/errored.tfstate",
  ".terraform/terraform.tfstate",
])("refuses packaged state %s", async (path) => {
  const test = await fixture("platform-apply");
  const target = join(test.root, "accelerator", path);
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, secret);
  expect(await test.execute()).toBe("failed");
  expect(await test.calls()).toEqual([]);
});

it("authenticates broker requests without forwarding credentials in bodies or accepting redirects", async () => {
  const test = await fixture("platform-apply");
  const fetchMock = vi.fn(async (url: string, request: RequestInit) => {
    expect(url.startsWith(`${brokerOrigin}/api/runner/`)).toBe(true);
    expect(request.redirect).toBe("error");
    expect(request.method).toBe("POST");
    expect(request.headers).toMatchObject({
      Authorization: `Bearer ${ticket}`,
    });
    expect(request.body).not.toContain(ticket);
    const response = await test.report(
      url.slice(`${brokerOrigin}/api/runner/`.length),
      JSON.parse(request.body as string),
    );
    return response === null
      ? new Response(null, { status: 204 })
      : new Response(JSON.stringify(response), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  expect(
    await runWorker({ root: test.root, id: "run-id", ticket, brokerOrigin }),
  ).toBe("succeeded");
  expect(fetchMock).toHaveBeenCalledTimes(8);
});

it("refuses an untrusted broker origin before any network or engine execution", async () => {
  const test = await fixture("platform-apply");
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  expect(
    await runWorker({
      root: test.root,
      id: "run-id",
      ticket,
      brokerOrigin: "https://attacker.invalid",
    }),
  ).toBe("failed");
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await test.calls()).toEqual([]);
});
