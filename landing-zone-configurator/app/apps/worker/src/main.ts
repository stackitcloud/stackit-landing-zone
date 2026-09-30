import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  cp,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { planResultSchema, summarizePlan } from "@lzc/contracts";

const origin =
  "https://lzc-dev-configurator-7dbff805.apps.01.cf.eu01.stackit.cloud";
const commit = "a256f6896d11134fdc351786f1be5eba4e56b2e2";
const lockHash =
  "a52433c424472d6e618caa3a94579bbcd19b60b759d053cf0d5caf9ac6872888";
const digest = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const deadline = Date.now() + 18 * 60 * 1000;
let work: string | undefined;
let errorCode = "input_invalid";
const ticket = process.env.LZC_RUN_TICKET;
async function report(path: string, body: unknown) {
  if (
    process.env.LZC_BROKER_ORIGIN !== origin ||
    !ticket ||
    !/^[A-Za-z0-9_-]{43}$/.test(ticket)
  )
    throw new Error("Runner configuration invalid");
  const response = await fetch(`${origin}/api/runner/${path}`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(60000),
    headers: {
      Authorization: `Bearer ${ticket}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Runner broker request failed");
  return response.status === 204 ? null : await response.json();
}
try {
  process.umask(0o077);
  const input = await report("input", {});
  if (
    input.id !== process.env.LZC_RUN_ID ||
    input.mode !== "initial-plan-only" ||
    input.acceleratorCommit !== commit ||
    input.lockHash !== lockHash ||
    typeof input.tfvars !== "string" ||
    Buffer.byteLength(input.tfvars) > 1024 * 1024 ||
    digest(input.tfvars) !== input.tfvarsSha256
  )
    throw new Error("Runner input mismatch");
  const root = process.cwd();
  if (
    digest(await readFile(resolve(root, "accelerator/.terraform.lock.hcl"))) !==
    lockHash
  )
    throw new Error("Provider lock mismatch");
  work = await mkdtemp(resolve(tmpdir(), "lzc-initial-plan-"));
  await cp(resolve(root, "accelerator"), work, { recursive: true });
  await writeFile(resolve(work, "landing-zone.tfvars"), input.tfvars, {
    mode: 0o600,
  });
  await writeFile(resolve(work, "credential.json"), JSON.stringify(input.key), {
    mode: 0o600,
  });
  await copyFile(resolve(root, "runner.tfrc"), resolve(work, "runner.tfrc"));
  const env: NodeJS.ProcessEnv = {
    PATH: `${root}/tools:/usr/bin:/bin`,
    HOME: work,
    TMPDIR: work,
    TF_IN_AUTOMATION: "true",
    TF_INPUT: "0",
    TF_CLI_CONFIG_FILE: resolve(work, "runner.tfrc"),
    STACKIT_SERVICE_ACCOUNT_KEY_PATH: resolve(work, "credential.json"),
    LZC_PROVIDER_MIRROR: resolve(root, "providers"),
  };
  // Ticket, CF environment and broker/operator credentials are not inherited by OpenTofu.
  async function command(phase: string) {
    await report("stage", { stage: phase });
    console.log(JSON.stringify({ event: "plan_stage", stage: phase }));
    await new Promise<void>((done, fail) => {
      const child = spawn("/bin/bash", [resolve(root, "run-plan.sh"), phase], {
        cwd: work as string,
        env,
        stdio: ["ignore", "ignore", "ignore"],
        detached: true,
      });
      const timeout = setTimeout(
        () => {
          errorCode = "timed_out";
          try {
            process.kill(-(child.pid as number), "SIGKILL");
          } catch {}
        },
        Math.max(1, deadline - Date.now()),
      );
      child.once("error", () => {
        clearTimeout(timeout);
        fail(new Error("Plan process failed"));
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        code === 0 ? done() : fail(new Error("Plan phase failed"));
      });
    });
  }
  errorCode = "init_failed";
  await command("initializing");
  errorCode = "validate_failed";
  await command("validating");
  errorCode = "plan_failed";
  await command("planning");
  errorCode = "summary_failed";
  const planBytes = await readFile(resolve(work, "plan.json"));
  if (planBytes.length > 32 * 1024 * 1024) throw new Error("Plan too large");
  const exitCode = Number(await readFile(resolve(work, "plan.exit"), "utf8"));
  const result = planResultSchema.parse({
    status: "succeeded",
    summary: summarizePlan(JSON.parse(planBytes.toString("utf8")), exitCode),
  });
  await report("result", result);
  console.log(JSON.stringify({ event: "plan_finished", status: "succeeded" }));
} catch {
  try {
    await report("result", { status: "failed", errorCode });
  } catch {}
  console.error(
    JSON.stringify({ event: "plan_finished", status: "failed", errorCode }),
  );
  process.exitCode = 1;
} finally {
  if (work) await rm(work, { recursive: true, force: true });
}
