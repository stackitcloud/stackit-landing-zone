import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  cp,
  lstat,
  mkdtemp,
  open,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import {
  applicationRunnerBindingSchema,
  planResultSchema,
  platformRunnerSourceSchema,
  type S3RunnerBackend,
  s3BackendConfiguration,
  s3RunnerBackendSchema,
  summarizePlan,
} from "@lzc/contracts";

export const brokerOrigin =
  "https://lzc-dev-configurator-7dbff805.apps.01.cf.eu01.stackit.cloud";
export const localBrokerOrigin = "http://127.0.0.1:3000";
export const acceleratorCommit = "a256f6896d11134fdc351786f1be5eba4e56b2e2";
export const applicationAcceleratorCommit =
  "c4b43c36af198985980b17626c48d357795e3fbd";
export const applicationProviderLockHash =
  "d40debbff204aee590c2a76d09f6ad3234643329b438fd5c6497de60687f6fa5";
export const providerLockHash =
  "a52433c424472d6e618caa3a94579bbcd19b60b759d053cf0d5caf9ac6872888";
const artifactLimit = 16 * 1024 * 1024;
const backendSourceHash =
  "35d9b754956962f5d163c6900b726e89715e941703d5652c4d87813889b63054";
const applicationBackendSourceHash =
  "180a355bc7d4e61186860d7c78cd8e044585bffbbbff4cdc86b63b49d55d507c";
const digest = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
type Report = (path: string, body: unknown) => Promise<unknown>;
export interface WorkerOptions {
  root: string;
  id: string | undefined;
  ticket: string | undefined;
  brokerOrigin: string | undefined;
  broker?: "platform" | "application";
  local?: boolean;
  workRoot?: string;
  report?: Report;
  timeoutMilliseconds?: number;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid object");
  return value as Record<string, unknown>;
}

function validatedS3Backend(value: unknown): S3RunnerBackend {
  const backend = s3RunnerBackendSchema.parse(value);
  if (
    Object.values(backend.credentials).some((credential) =>
      Array.from(credential).some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
      }),
    )
  )
    throw new Error("Invalid backend credentials");
  return backend;
}

function artifact(value: unknown): Buffer {
  const plan = object(value);
  if (
    typeof plan.data !== "string" ||
    plan.data.length === 0 ||
    plan.data.length > 4 * Math.ceil(artifactLimit / 3) ||
    typeof plan.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(plan.sha256)
  )
    throw new Error("Invalid artifact");
  const bytes = Buffer.from(plan.data, "base64");
  if (
    bytes.length === 0 ||
    bytes.length > artifactLimit ||
    bytes.toString("base64") !== plan.data ||
    digest(bytes) !== plan.sha256
  )
    throw new Error("Invalid artifact");
  return bytes;
}

async function boundedFile(path: string, limit: number): Promise<Buffer> {
  const info = await stat(path);
  if (!info.isFile() || info.size > limit) throw new Error("File too large");
  const bytes = await readFile(path);
  if (bytes.length > limit) throw new Error("File too large");
  return bytes;
}

export async function runWorker(
  options: WorkerOptions,
): Promise<"succeeded" | "failed"> {
  let work: string | undefined;
  let workContainer: string | undefined;
  let pluginTemp: string | undefined;
  let errorCode = "input_invalid";
  let recoveryState = false;
  let publishOutput = async () => {};
  const expectedOrigin = options.local ? localBrokerOrigin : brokerOrigin;
  const broker = options.broker ?? "platform";
  const brokerPath = broker === "application" ? "application-runner" : "runner";
  const deadline = Date.now() + (options.timeoutMilliseconds ?? 18 * 60 * 1000);
  const report: Report =
    options.report ??
    (async (path, body) => {
      if (
        options.brokerOrigin !== expectedOrigin ||
        !options.ticket ||
        !/^[A-Za-z0-9_-]{43}$/.test(options.ticket)
      )
        throw new Error("Runner configuration invalid");
      const response = await fetch(
        `${expectedOrigin}/api/${brokerPath}/${path}`,
        {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(
            path === "recovery" || path === "output"
              ? 60000
              : Math.max(1, Math.min(60000, deadline - Date.now())),
          ),
          headers: {
            Authorization: `Bearer ${options.ticket}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) throw new Error("Runner broker request failed");
      return response.status === 204 ? null : await response.json();
    });
  try {
    process.umask(0o077);
    if (
      options.brokerOrigin !== expectedOrigin ||
      !["platform", "application"].includes(broker) ||
      !options.ticket ||
      !/^[A-Za-z0-9_-]{43}$/.test(options.ticket) ||
      !options.id
    )
      throw new Error("Runner configuration invalid");
    const input = object(await report("input", {}));
    const mode = input.mode === undefined ? "initial-plan-only" : input.mode;
    const applicationJob =
      mode === "application-plan" || mode === "application-apply";
    const applying = mode === "platform-apply" || mode === "application-apply";
    const platformSource = applicationJob
      ? undefined
      : await readFile(
          resolve(options.root, "platform-source.json"),
          "utf8",
        ).then(
          (value) => platformRunnerSourceSchema.parse(JSON.parse(value)),
          (error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
            return undefined;
          },
        );
    const expectedCommit = applicationJob
      ? applicationAcceleratorCommit
      : (platformSource?.acceleratorCommit ?? acceleratorCommit);
    const expectedLockHash = applicationJob
      ? applicationProviderLockHash
      : providerLockHash;
    if (
      input.id !== options.id ||
      applicationJob !== (broker === "application") ||
      typeof mode !== "string" ||
      ![
        "initial-plan-only",
        "platform-plan",
        "platform-apply",
        "application-plan",
        "application-apply",
      ].includes(mode) ||
      input.acceleratorCommit !== expectedCommit ||
      input.lockHash !== expectedLockHash ||
      typeof input.tfvars !== "string" ||
      Buffer.byteLength(input.tfvars) > 1024 * 1024 ||
      digest(input.tfvars) !== input.tfvarsSha256
    )
      throw new Error("Runner input mismatch");
    const key = object(input.key);
    if (
      mode === "initial-plan-only" &&
      (input.backend !== undefined || input.plan !== undefined)
    )
      throw new Error("Unexpected capability");
    if (!applying && input.plan !== undefined)
      throw new Error("Unexpected artifact");
    const applicationBinding = applicationJob
      ? applicationRunnerBindingSchema.parse(input.application)
      : undefined;
    if (!applicationJob && input.application !== undefined)
      throw new Error("Unexpected application binding");
    const httpEnv: NodeJS.ProcessEnv = {};
    let s3Backend: S3RunnerBackend | undefined;
    if (mode !== "initial-plan-only") {
      errorCode = "state_failed";
      const backend = object(input.backend);
      if (applicationJob && backend.kind !== "s3")
        throw new Error("Application requires instance S3 state");
      if (backend.kind === "s3") {
        s3Backend = validatedS3Backend(backend);
        if (
          applicationBinding &&
          s3Backend.descriptor.key !==
            `applications/${applicationBinding.tenantId}/${applicationBinding.instanceId}/terraform.tfstate`
        )
          throw new Error("Application state binding mismatch");
      } else {
        if (
          (backend.kind !== undefined && backend.kind !== "bootstrap") ||
          Object.keys(backend).some(
            (name) =>
              ![
                "kind",
                "address",
                "lockAddress",
                "unlockAddress",
                "username",
                "password",
              ].includes(name),
          ) ||
          backend.address !== `${expectedOrigin}/api/runner/state` ||
          backend.lockAddress !== `${expectedOrigin}/api/runner/state/lock` ||
          backend.unlockAddress !==
            `${expectedOrigin}/api/runner/state/unlock` ||
          backend.username !== "runner" ||
          backend.password !== options.ticket
        )
          throw new Error("Backend mismatch");
        Object.assign(httpEnv, {
          TF_HTTP_ADDRESS: backend.address,
          TF_HTTP_LOCK_ADDRESS: backend.lockAddress,
          TF_HTTP_UNLOCK_ADDRESS: backend.unlockAddress,
          TF_HTTP_LOCK_METHOD: "POST",
          TF_HTTP_UNLOCK_METHOD: "POST",
          TF_HTTP_USERNAME: "runner",
          TF_HTTP_PASSWORD: options.ticket,
          TF_HTTP_RETRY_MAX: "0",
        });
      }
    }
    errorCode = "artifact_invalid";
    const savedPlan = applying ? artifact(input.plan) : undefined;
    errorCode = "input_invalid";
    const root = resolve(options.root);
    const packageSource = resolve(
      root,
      applicationJob ? "application-src" : "accelerator",
    );
    const source = applicationJob
      ? resolve(packageSource, "application")
      : packageSource;
    const packagedFiles = await readdir(packageSource, {
      recursive: true,
    });
    if (
      packagedFiles.some(
        (path) =>
          /(^|\/)(\.terraform|\.terraform\.tfstate\.lock\.info|.*\.tfstate(?:\..*)?|.*\.tfplan|plan\.bin|saved-plan\.bin|credential\.json|.*\.log)(\/|$)/.test(
            path,
          ) ||
          /(^|\/)(landing-zone|terraform\.auto)\.tfvars(?:\.json)?$/.test(path),
      )
    )
      throw new Error("Unsafe accelerator package");
    if (
      digest(await readFile(resolve(source, ".terraform.lock.hcl"))) !==
      expectedLockHash
    )
      throw new Error("Provider lock mismatch");
    const engine = await promisify(execFile)(
      resolve(root, "tools/tofu"),
      ["version", "-json"],
      {
        env: { PATH: `${root}/tools:/usr/bin:/bin`, CHECKPOINT_DISABLE: "1" },
        timeout: Math.max(1, Math.min(10000, deadline - Date.now())),
        maxBuffer: 65536,
      },
    );
    if (object(JSON.parse(engine.stdout)).terraform_version !== "1.12.6")
      throw new Error("Engine mismatch");
    if (
      digest(await readFile(resolve(source, "backend.tf"))) !==
      (applicationJob ? applicationBackendSourceHash : backendSourceHash)
    )
      throw new Error("Backend source mismatch");
    workContainer = await mkdtemp(
      resolve(
        options.local ? (options.workRoot ?? tmpdir()) : tmpdir(),
        "lzc-runner-",
      ),
    );
    work = applicationJob
      ? resolve(workContainer, "application")
      : workContainer;
    if (options.local) pluginTemp = await mkdtemp("/tmp/lzc-sock-");
    await cp(packageSource, workContainer, { recursive: true });
    async function configureS3(backend: S3RunnerBackend) {
      await rm(resolve(work as string, "backend.tf"), { force: true });
      await writeFile(
        resolve(work as string, "backend.tf.json"),
        s3BackendConfiguration(backend.descriptor),
        { mode: 0o600 },
      );
      return {
        LZC_BACKEND_KIND: "s3",
        AWS_ACCESS_KEY_ID: backend.credentials.accessKeyId,
        AWS_SECRET_ACCESS_KEY: backend.credentials.secretAccessKey,
        AWS_REGION: backend.descriptor.region,
        AWS_DEFAULT_REGION: backend.descriptor.region,
      };
    }
    const backendEnv = s3Backend
      ? await configureS3(s3Backend)
      : { LZC_BACKEND_KIND: "bootstrap", ...httpEnv };
    if (mode !== "initial-plan-only" && !s3Backend)
      await writeFile(
        resolve(work, "backend.tf"),
        'terraform {\n  backend "http" {}\n}\n',
        { mode: 0o600 },
      );
    if (savedPlan)
      await writeFile(resolve(work, "saved-plan.bin"), savedPlan, {
        mode: 0o600,
      });
    else
      await writeFile(resolve(work, "landing-zone.tfvars"), input.tfvars, {
        mode: 0o600,
      });
    await writeFile(resolve(work, "credential.json"), JSON.stringify(key), {
      mode: 0o600,
    });
    if (options.local)
      await writeFile(
        resolve(work, "runner.tfrc"),
        `provider_installation {\n  filesystem_mirror {\n    path = ${JSON.stringify(
          resolve(root, "providers"),
        )
          .replaceAll("${", () => "$${")
          .replaceAll("%{", "%%{")}\n  }\n}\ndisable_checkpoint = true\n`,
        { mode: 0o600 },
      );
    else
      await copyFile(
        resolve(root, "runner.tfrc"),
        resolve(work, "runner.tfrc"),
      );
    const env: NodeJS.ProcessEnv = {
      PATH: `${root}/tools:/usr/bin:/bin`,
      HOME: work,
      TMPDIR: pluginTemp ?? work,
      TF_IN_AUTOMATION: "true",
      TF_INPUT: "0",
      TF_CLI_CONFIG_FILE: resolve(work, "runner.tfrc"),
      STACKIT_SERVICE_ACCOUNT_KEY_PATH: resolve(work, "credential.json"),
      LZC_PROVIDER_MIRROR: resolve(root, "providers"),
      ...backendEnv,
    };
    publishOutput = async () => {
      try {
        const values: unknown[] = [
          key,
          options.ticket,
          env.AWS_ACCESS_KEY_ID,
          env.AWS_SECRET_ACCESS_KEY,
          env.TF_HTTP_PASSWORD,
        ];
        const secrets: string[] = [];
        while (values.length) {
          const value = values.pop();
          if (typeof value === "string" && value.length >= 8)
            secrets.push(value, JSON.stringify(value).slice(1, -1));
          else if (value && typeof value === "object")
            values.push(...Object.values(value));
        }
        let text = "";
        let truncated = false;
        for (const [fileName, commandName] of [
          ["init", "init"],
          ["validate", "validate"],
          ["plan", "plan"],
          ["apply", "apply saved-plan.bin"],
          ["migration", "init -migrate-state"],
        ]) {
          const file = await open(
            resolve(work as string, `${fileName}.log`),
            "r",
          ).catch(() => null);
          if (!file) continue;
          try {
            const remaining = Math.max(
              0,
              2 * 1024 * 1024 - Buffer.byteLength(text),
            );
            const size = (await file.stat()).size;
            const buffer = Buffer.alloc(Math.min(size, remaining + 32768));
            const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
            let chunk = `$ tofu ${commandName}\n${buffer.subarray(0, bytesRead).toString("utf8")}\n`;
            for (const secret of secrets)
              chunk = chunk.replaceAll(secret, "(sensitive value)");
            chunk = chunk.replace(
              /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g,
              "(sensitive value)",
            );
            truncated ||=
              bytesRead < size || Buffer.byteLength(chunk) > remaining;
            text += Buffer.from(chunk).subarray(0, remaining).toString("utf8");
          } finally {
            await file.close();
          }
        }
        await report("output", { text, truncated });
      } catch {}
    };
    async function command(phase: string, reportStage = true) {
      if (Date.now() >= deadline) {
        errorCode = "timed_out";
        throw new Error("Deadline exceeded");
      }
      if (reportStage) await report("stage", { stage: phase });
      if (Date.now() >= deadline) {
        errorCode = "timed_out";
        throw new Error("Deadline exceeded");
      }
      await new Promise<void>((done, fail) => {
        const child = spawn(
          "/bin/bash",
          [
            resolve(root, "run-plan.sh"),
            phase,
            applying
              ? "platform-apply"
              : mode === "initial-plan-only"
                ? mode
                : "platform-plan",
          ],
          {
            cwd: work as string,
            env,
            stdio: ["ignore", "ignore", "ignore"],
            detached: true,
          },
        );
        let killTimer: ReturnType<typeof setTimeout> | undefined;
        const stop = (signal: NodeJS.Signals) => {
          try {
            if (child.pid) process.kill(-child.pid, signal);
          } catch {}
        };
        const timeout = setTimeout(
          () => {
            errorCode = "timed_out";
            stop("SIGTERM");
            killTimer = setTimeout(() => stop("SIGKILL"), 10000);
          },
          Math.max(1, deadline - Date.now()),
        );
        const clear = () => {
          clearTimeout(timeout);
          if (killTimer) clearTimeout(killTimer);
        };
        child.once("error", () => {
          clear();
          fail(new Error("Runner process failed"));
        });
        child.once("exit", (code) => {
          if (errorCode === "timed_out") stop("SIGKILL");
          clear();
          code === 0 && errorCode !== "timed_out"
            ? done()
            : fail(new Error("Runner phase failed"));
        });
      });
    }
    errorCode = "init_failed";
    await command("initializing");
    errorCode = "validate_failed";
    await command("validating");
    if (applying) {
      errorCode = "apply_failed";
      await command("applying");
      if (
        await lstat(resolve(work, "errored.tfstate")).then(
          () => true,
          () => false,
        )
      )
        throw new Error("Recovery state present");
      if (!s3Backend) {
        errorCode = "state_failed";
        const prepared = object(
          await report("migration", { phase: "prepare" }),
        );
        s3Backend = validatedS3Backend(prepared.backend);
        Object.assign(env, await configureS3(s3Backend));
        await command("migrating", false);
        if (
          await lstat(resolve(work, "errored.tfstate")).then(
            () => true,
            () => false,
          )
        )
          throw new Error("Recovery state present");
        await report("migration", { phase: "complete" });
      }
      await publishOutput();
      await report("result", { status: "succeeded" });
    } else {
      errorCode = "plan_failed";
      await command("planning");
      errorCode = "summary_failed";
      const planBytes = await boundedFile(
        resolve(work, "plan.json"),
        32 * 1024 * 1024,
      );
      const exitCode = Number(
        await readFile(resolve(work, "plan.exit"), "utf8"),
      );
      const summary = summarizePlan(
        JSON.parse(planBytes.toString("utf8")),
        exitCode,
        "opentofu-1.12.6",
      );
      if (mode !== "initial-plan-only") {
        errorCode = "artifact_invalid";
        const bytes = await boundedFile(
          resolve(work, "plan.bin"),
          artifactLimit,
        );
        if (!bytes.length) throw new Error("Empty artifact");
        const uploaded = object(
          await report("artifact", { data: bytes.toString("base64"), summary }),
        );
        if (uploaded.sha256 !== digest(bytes))
          throw new Error("Artifact receipt mismatch");
        errorCode = "plan_failed";
        await publishOutput();
        await report("result", {
          status: "succeeded",
          summary,
          artifactSha256: uploaded.sha256,
        });
      } else {
        await publishOutput();
        await report(
          "result",
          planResultSchema.parse({ status: "succeeded", summary }),
        );
      }
    }
    console.log(
      JSON.stringify({ event: "plan_finished", status: "succeeded" }),
    );
    return "succeeded";
  } catch {
    if (work) {
      recoveryState = await lstat(resolve(work, "errored.tfstate")).then(
        () => true,
        () => false,
      );
      if (recoveryState) {
        errorCode = "state_failed";
        try {
          const path = resolve(work, "errored.tfstate");
          if (!(await lstat(path)).isFile())
            throw new Error("Invalid recovery file");
          const bytes = await boundedFile(path, artifactLimit);
          const state = object(JSON.parse(bytes.toString("utf8")));
          if (
            state.version !== 4 ||
            typeof state.lineage !== "string" ||
            !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
              state.lineage,
            ) ||
            !Number.isSafeInteger(state.serial) ||
            (state.serial as number) < 0 ||
            !Array.isArray(state.resources)
          )
            throw new Error("Invalid recovery state");
          const sha256 = digest(bytes);
          const received = object(
            await report("recovery", {
              data: bytes.toString("base64"),
              sha256,
            }),
          );
          if (received.sha256 !== sha256)
            throw new Error("Recovery receipt mismatch");
          await rm(path);
          recoveryState = false;
        } catch {}
      }
    }
    await publishOutput();
    try {
      await report("result", { status: "failed", errorCode });
    } catch {}
    console.error(
      JSON.stringify({ event: "plan_finished", status: "failed", errorCode }),
    );
    return "failed";
  } finally {
    if (pluginTemp) await rm(pluginTemp, { recursive: true, force: true });
    if (work) {
      if (recoveryState) {
        for (const entry of await readdir(work))
          if (entry !== "errored.tfstate")
            await rm(resolve(work, entry), { recursive: true, force: true });
        if (workContainer && workContainer !== work)
          for (const entry of await readdir(workContainer))
            if (resolve(workContainer, entry) !== work)
              await rm(resolve(workContainer, entry), {
                recursive: true,
                force: true,
              });
      } else await rm(workContainer ?? work, { recursive: true, force: true });
    }
  }
}
