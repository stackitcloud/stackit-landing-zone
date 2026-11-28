import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  appendFile,
  cp,
  lstat,
  mkdtemp,
  open,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  applicationExecutionProfile,
  platformRunnerSourceSchema,
  retirementPlanFailureCodeSchema,
} from "@lzc/contracts";
import {
  assertRetirementProtectedResources,
  bucketCleanupErrors,
  emptyRetirementBuckets,
  parseServiceAccountKey,
  readApplicationExecutionManifest,
  readRetirementSource,
  retirementAdapterCommit,
  retirementBuckets,
  retirementCompletedDeletes,
  retirementFolderConflict,
  retirementInventory,
  retirementPlanProjection,
  retirementPrivateTargets,
  retirementProviderLockSha256,
  retirementStateSha256,
  retirementWorkerInputSchema,
  verifyRetirementApply,
  verifyRetirementPlan,
} from "@lzc/contracts/recovery";
import { z } from "zod";
import {
  retirementOutput,
  retirementOutputSecrets,
} from "./retirement-output.js";
import { readRetirementBackendState } from "./retirement-state.js";
import { hostedBrokerOrigin, localBrokerOrigin } from "./runner.js";

const hash = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
const limit = 16 * 1024 * 1024;
export const retirementHttpBackendHcl = 'terraform {\n  backend "http" {}\n}\n';
type Report = (path: string, body: unknown) => Promise<unknown>;
export type RetirementWorkerOptions = {
  root: string;
  id: string | undefined;
  ticket: string | undefined;
  brokerOrigin: string | undefined;
  local?: boolean;
  workRoot?: string;
  timeoutMilliseconds?: number;
  report?: Report;
  recoveryRetryMilliseconds?: number;
  fetch?: typeof fetch;
  bucketCleanup?: typeof emptyRetirementBuckets;
};
async function bounded(path: string) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size > limit)
      throw Error("retirement_native_output_invalid");
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}
/** A separate broker profile; normal Application and Platform jobs cannot select this mode. */
export async function runRetirementWorker(
  options: RetirementWorkerOptions,
): Promise<"succeeded" | "failed"> {
  const origin = options.local
    ? localBrokerOrigin
    : hostedBrokerOrigin(options.brokerOrigin);
  const deadline = Date.now() + (options.timeoutMilliseconds ?? 18 * 60 * 1000);
  const report: Report =
    options.report ??
    (async (path, body) => {
      const response = await fetch(`${origin}/api/retirement-runner/${path}`, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(
          path === "recovery" || path === "result"
            ? 60000
            : Math.max(1, Math.min(60000, deadline - Date.now())),
        ),
        headers: {
          authorization: `Bearer ${options.ticket}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw Error("retirement_broker_failed");
      return response.status === 204 ? null : response.json();
    });
  let directory: string | undefined,
    workPath: string | undefined,
    claimed = false,
    applying = false,
    preserveRecovery = false;
  let retainedState: Buffer | undefined;
  let recoveryRequired = false;
  let outputSecrets: string[] = [];
  let acknowledgedOutput: { text: string; truncated: boolean } | undefined;
  const publishOutput = async (live = false) => {
    if (!workPath) return;
    try {
      const output = await retirementOutput(workPath, outputSecrets, live);
      if (
        output.text === acknowledgedOutput?.text &&
        output.truncated === acknowledgedOutput.truncated
      )
        return;
      await report("output", output);
      acknowledgedOutput = output;
    } catch {
      /* Output transport must not retry or change native cloud work. */
      console.error(JSON.stringify({ event: "retirement_output_failed" }));
    }
  };
  try {
    process.umask(0o077);
    if (
      !origin ||
      origin !== options.brokerOrigin ||
      !options.ticket ||
      !/^[A-Za-z0-9_-]{43}$/.test(options.ticket)
    )
      throw Error("retirement_worker_configuration_invalid");
    const input = retirementWorkerInputSchema.parse(await report("input", {}));
    claimed = true;
    applying = input.operation === "apply";
    outputSecrets = retirementOutputSecrets(
      input.key,
      options.ticket,
      input.variables,
    );
    if (
      input.id !== z.uuid().parse(options.id) ||
      input.backend.password !== options.ticket ||
      input.protectedServiceAccount !==
        parseServiceAccountKey(input.key).credentials.iss ||
      retirementStateSha256(input.variables) !== input.variablesSha256
    )
      throw Error("retirement_input_invalid");
    for (const [field, suffix] of [
      ["address", ""],
      ["lockAddress", "/lock"],
      ["unlockAddress", "/unlock"],
    ] as const)
      if (
        input.backend[field] !==
        `${origin}/api/retirement-runner/state${suffix}`
      )
        throw Error("retirement_backend_invalid");
    if (applying !== Boolean(input.plan))
      throw Error("retirement_artifact_invalid");
    const root = resolve(options.root);
    let packageSource: string, sourceRelative: string;
    if (input.phase === "remove_application") {
      const manifest = await readApplicationExecutionManifest(root);
      if (!manifest) throw Error("retirement_source_unavailable");
      const profile = applicationExecutionProfile(
        manifest,
        input.sourceRevision,
      );
      if (
        !profile.maintenanceEnabled ||
        profile.providerLockSha256 !== input.providerLockSha256
      )
        throw Error("retirement_source_unavailable");
      packageSource = join(root, profile.sourcePath);
      sourceRelative = "application";
    } else if (input.phase === "private_workloads") {
      const metadata = platformRunnerSourceSchema.parse(
        JSON.parse(await readFile(join(root, "platform-source.json"), "utf8")),
      );
      if (
        metadata.acceleratorCommit !== input.sourceRevision ||
        input.providerLockSha256 !==
          "a52433c424472d6e618caa3a94579bbcd19b60b759d053cf0d5caf9ac6872888"
      )
        throw Error("retirement_source_unavailable");
      packageSource = join(root, "accelerator");
      sourceRelative = "";
    } else {
      const metadata = await readRetirementSource(root);
      if (!metadata) throw Error("retirement_source_unavailable");
      packageSource = join(root, "retirement-src");
      sourceRelative = "retirement";
      if (
        input.sourceRevision !== retirementAdapterCommit ||
        input.providerLockSha256 !== retirementProviderLockSha256 ||
        input.variables.retirement_phase !== input.phase
      )
        throw Error("retirement_source_unavailable");
    }
    const sourceInfo = await lstat(packageSource);
    if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink())
      throw Error("retirement_package_invalid");
    const entries = await readdir(packageSource, { recursive: true });
    for (const relative of entries) {
      const info = await lstat(join(packageSource, relative));
      if (
        info.isSymbolicLink() ||
        (!info.isFile() && !info.isDirectory()) ||
        /(^|\/)(\.terraform|.*\.tfstate(?:\..*)?|.*\.tfplan|plan\.bin|saved-plan\.bin|credential\.json|.*\.log)(\/|$)/.test(
          relative,
        ) ||
        /(^|\/)(landing-zone|terraform\.auto)\.tfvars(?:\.json)?$/.test(
          relative,
        )
      )
        throw Error("retirement_package_invalid");
    }
    if (
      hash(
        await readFile(
          join(packageSource, sourceRelative, ".terraform.lock.hcl"),
        ),
      ) !== input.providerLockSha256
    )
      throw Error("retirement_provider_lock_changed");
    directory = await mkdtemp(
      join(options.workRoot ?? "/tmp", "lzc-retirement-"),
    );
    const materialized = join(directory, "source");
    await cp(packageSource, materialized, {
      recursive: true,
      mode: constants.COPYFILE_FICLONE,
      filter: (path) => path !== join(packageSource, "firewall-image.qcow2"),
    });
    const work = join(materialized, sourceRelative),
      tofu = join(root, "tools/tofu");
    workPath = work;
    // Replace the reviewed source's backend block; never migrate into a target-owned S3 bucket.
    await rm(join(work, "backend.tf"), { force: true });
    await writeFile(join(work, "backend.tf"), retirementHttpBackendHcl, {
      mode: 0o600,
    });
    await writeFile(
      join(work, "retirement.tfvars.json"),
      JSON.stringify(input.variables),
      { mode: 0o600 },
    );
    await writeFile(
      join(work, "credential.json"),
      JSON.stringify(parseServiceAccountKey(input.key)),
      { mode: 0o600 },
    );
    const mirror = JSON.stringify(join(root, "providers"))
      .replaceAll("${", "$${")
      .replaceAll("%{", "%%{");
    await writeFile(
      join(work, "runner.tfrc"),
      `provider_installation { filesystem_mirror { path = ${mirror} } }\ndisable_checkpoint = true\n`,
      { mode: 0o600 },
    );
    const env: NodeJS.ProcessEnv = {
      PATH: `${join(root, "tools")}:/usr/bin:/bin`,
      HOME: work,
      TMPDIR: directory,
      TF_IN_AUTOMATION: "true",
      TF_INPUT: "0",
      CHECKPOINT_DISABLE: "1",
      TF_CLI_CONFIG_FILE: join(work, "runner.tfrc"),
      STACKIT_SERVICE_ACCOUNT_KEY_PATH: join(work, "credential.json"),
      TF_HTTP_ADDRESS: input.backend.address,
      TF_HTTP_LOCK_ADDRESS: input.backend.lockAddress,
      TF_HTTP_UNLOCK_ADDRESS: input.backend.unlockAddress,
      TF_HTTP_LOCK_METHOD: "POST",
      TF_HTTP_UNLOCK_METHOD: "POST",
      TF_HTTP_USERNAME: "runner",
      TF_HTTP_PASSWORD: options.ticket,
      TF_HTTP_RETRY_MAX: "0",
    };
    async function command(name: string, args: string[], accepted = [0]) {
      if (Date.now() >= deadline) throw Error("retirement_timed_out");
      const output = await open(join(work, `${name}.out`), "wx", 0o600),
        error = await open(join(work, `${name}.err`), "wx", 0o600);
      let outputStopped = false;
      let pending: Promise<void> | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const poll = () => {
        pending = publishOutput(true).finally(() => {
          if (!outputStopped) timer = setTimeout(poll, 500);
        });
      };
      timer = setTimeout(poll, 500);
      try {
        const exit = await new Promise<number>((done, fail) => {
          const child = spawn(tofu, args, {
            cwd: work,
            env,
            stdio: ["ignore", output.fd, error.fd],
            detached: true,
          });
          const stop = (signal: NodeJS.Signals) => {
            try {
              if (child.pid) process.kill(-child.pid, signal);
            } catch {}
          };
          let forced: ReturnType<typeof setTimeout> | undefined;
          const timer = setTimeout(
            () => {
              stop("SIGTERM");
              forced = setTimeout(() => stop("SIGKILL"), 10000);
            },
            Math.max(1, deadline - Date.now()),
          );
          const clear = () => {
            clearTimeout(timer);
            if (forced) clearTimeout(forced);
          };
          child.once("error", () => {
            clear();
            fail(Error("retirement_native_start_failed"));
          });
          child.once("exit", (code) => {
            clear();
            if (Date.now() >= deadline) {
              stop("SIGKILL");
              fail(Error("retirement_timed_out"));
            } else done(code ?? -1);
          });
        });
        if (!accepted.includes(exit)) throw Error(`retirement_${name}_failed`);
        return {
          exit,
          stdout: await bounded(join(work, `${name}.out`)),
          stderr: await bounded(join(work, `${name}.err`)),
        };
      } finally {
        outputStopped = true;
        clearTimeout(timer);
        await pending;
        await output.close();
        await error.close();
        await publishOutput();
      }
    }
    const version = JSON.parse(
      (await command("version", ["version", "-json"])).stdout.toString("utf8"),
    );
    if (version.terraform_version !== "1.12.6")
      throw Error("retirement_engine_changed");
    await report("stage", { stage: "initializing" });
    await command("init", [
      "init",
      "-input=false",
      "-no-color",
      "-lockfile=readonly",
      "-lock-timeout=0s",
    ]);
    const beforeBytes = (await command("before", ["state", "pull"])).stdout;
    const authoritativeState = await readRetirementBackendState(
      input.backend.address,
      options.ticket,
      deadline,
      options.fetch,
    );
    if (retirementStateSha256(authoritativeState) !== input.beforeStateSha256)
      throw Error("retirement_state_changed");
    const before = retirementInventory(
      JSON.parse(beforeBytes.toString("utf8")),
      { includePrivate: true },
    );
    if (retirementStateSha256(before) !== retirementStateSha256(input.before))
      throw Error("retirement_state_changed");
    await report("stage", { stage: "validating" });
    await command("validate", ["validate", "-no-color"]);
    let planBytes: Buffer, rawPlan: unknown;
    if (!applying) {
      await report("stage", { stage: "planning" });
      const targets =
        input.phase === "private_workloads"
          ? retirementPrivateTargets(before)
          : [];
      if (input.phase === "private_workloads" && !targets.length)
        throw Error("retirement_private_cleanup_empty");
      await command(
        "plan",
        [
          "plan",
          "-json",
          ...(input.phase === "remove_application" ||
          input.phase === "private_workloads"
            ? ["-destroy"]
            : []),
          ...targets.map((address) => `-target=${address}`),
          "-input=false",
          "-no-color",
          "-parallelism=4",
          "-lock-timeout=0s",
          "-detailed-exitcode",
          "-var-file=retirement.tfvars.json",
          "-out=retirement.plan",
        ],
        [0, 2],
      );
      planBytes = await bounded(join(work, "retirement.plan"));
      rawPlan = JSON.parse(
        (
          await command("show", ["show", "-json", "retirement.plan"])
        ).stdout.toString("utf8"),
      );
    } else {
      const saved = input.plan;
      if (!saved) throw Error("retirement_artifact_invalid");
      planBytes = Buffer.from(saved.data, "base64");
      if (
        !planBytes.length ||
        planBytes.length > limit ||
        planBytes.toString("base64") !== saved.data ||
        hash(planBytes) !== saved.sha256
      )
        throw Error("retirement_artifact_invalid");
      await writeFile(join(work, "retirement.plan"), planBytes, {
        mode: 0o600,
      });
      rawPlan = JSON.parse(
        (
          await command("show", ["show", "-json", "retirement.plan"])
        ).stdout.toString("utf8"),
      );
    }
    assertRetirementProtectedResources(rawPlan, input);
    const checked = verifyRetirementPlan(
      rawPlan,
      before,
      input.baseline,
      input.phase,
    );
    if (!applying)
      await command("plan-details", ["show", "-no-color", "retirement.plan"]);
    if (!applying) {
      await report("artifact", {
        data: planBytes.toString("base64"),
        sha256: hash(planBytes),
        projection: retirementPlanProjection(rawPlan),
        planSha256: checked.planSha256,
      });
      await report("result", { status: "succeeded" });
      return "succeeded";
    }
    let applyingStage = false;
    const beginApplying = async () => {
      await report("stage", { stage: "applying" });
      applyingStage = true;
    };
    const buckets = retirementBuckets(
      checked.deletes,
      input.protectedProjectIds,
    );
    if (buckets.length) {
      if (input.bucketCleanupPolicy !== 1)
        throw Error("retirement_bucket_cleanup_confirmation_required");
      const progressFile = join(work, "bucket-cleanup.out");
      await writeFile(progressFile, "", { mode: 0o600, flag: "wx" });
      const progress = async (line: string) => {
        await appendFile(progressFile, line, { mode: 0o600 });
        await publishOutput();
      };
      try {
        await (options.bucketCleanup ?? emptyRetirementBuckets)({
          buckets,
          key: input.key,
          jobId: input.id,
          deadline,
          ...(options.fetch ? { request: options.fetch } : {}),
          progress,
          beforeDelete: beginApplying,
        });
      } catch (error) {
        const code = bucketCleanupErrors.includes(
          (error as Error).message as (typeof bucketCleanupErrors)[number],
        )
          ? (error as Error).message
          : "retirement_bucket_cleanup_unavailable";
        await progress(
          `Bucket cleanup stopped: ${code}. OpenTofu Apply has not started.\n`,
        );
        const unchanged = await readRetirementBackendState(
          input.backend.address,
          options.ticket,
          deadline,
          options.fetch,
        );
        if (retirementStateSha256(unchanged) !== input.beforeStateSha256)
          throw Error("retirement_state_changed");
        await report("result", {
          status: "failed",
          stateSha256: input.beforeStateSha256,
          removed: [],
          completedDeletes: [],
          errorCode: code,
        });
        return "failed";
      }
    }
    if (!applyingStage) await beginApplying();
    const applied = await command(
      "apply",
      [
        "apply",
        "-json",
        "-input=false",
        "-no-color",
        "-parallelism=4",
        "-lock-timeout=0s",
        "retirement.plan",
      ],
      [0, 1],
    );
    if (
      await lstat(join(work, "errored.tfstate")).then(
        () => true,
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return false;
          throw error;
        },
      )
    )
      throw Error("retirement_state_recovery_required");
    const afterBytes = (await command("after", ["state", "pull"])).stdout;
    const after = retirementInventory(JSON.parse(afterBytes.toString("utf8")), {
      includePrivate: true,
    });
    const authoritativeAfter = await readRetirementBackendState(
      input.backend.address,
      options.ticket,
      deadline,
      options.fetch,
    );
    if (
      retirementStateSha256(
        retirementInventory(authoritativeAfter, { includePrivate: true }),
      ) !== retirementStateSha256(after)
    )
      throw Error("retirement_state_changed");
    const receipt = verifyRetirementApply(
      before,
      after,
      checked.deletes,
      applied.exit === 0,
    );
    const completedDeletes = retirementCompletedDeletes(
      applied.stdout.toString("utf8"),
      checked.deletes.map((resource) => resource.address),
    );
    if (
      receipt.removed.some(
        (resource) => !completedDeletes.includes(resource.address),
      ) ||
      completedDeletes.some(
        (address) =>
          !receipt.removed.some((resource) => resource.address === address),
      )
    )
      throw Error("retirement_apply_receipt_incomplete");
    const waiting =
      input.phase === "finalize_folders" &&
      applied.exit !== 0 &&
      retirementFolderConflict(
        applied.stdout.toString("utf8") + applied.stderr.toString("utf8"),
        checked.deletes
          .filter(
            (resource) => resource.type === "stackit_resourcemanager_folder",
          )
          .map((resource) => resource.address),
      );
    await report("result", {
      status: applied.exit === 0 ? "succeeded" : "failed",
      stateSha256: retirementStateSha256(authoritativeAfter),
      removed: receipt.removed,
      completedDeletes,
      errorCode:
        applied.exit === 0
          ? null
          : waiting
            ? "retirement_folder_purge_pending"
            : "retirement_native_apply_failed",
    });
    return applied.exit === 0 ? "succeeded" : "failed";
  } catch (failure) {
    preserveRecovery = applying && directory !== undefined;
    if (applying && workPath) {
      const recoveryExists = await lstat(
        join(workPath, "errored.tfstate"),
      ).then(
        () => true,
        (error: NodeJS.ErrnoException) => error.code !== "ENOENT",
      );
      if (recoveryExists) {
        recoveryRequired = true;
        preserveRecovery = true;
        const recovery = await bounded(join(workPath, "errored.tfstate")).catch(
          () => undefined,
        );
        retainedState = recovery;
        try {
          if (!recovery) throw Error("retirement_recovery_unreadable");
          const accepted = z.strictObject({ accepted: z.literal(true) }).parse(
            await report("recovery", {
              data: recovery.toString("base64"),
              sha256: hash(recovery),
            }),
          );
          if (accepted.accepted) preserveRecovery = false;
        } catch {}
      }
    }
    // Native output and input can contain credentials. Retain server-side State;
    // an unknown Apply outcome requires stopped-runner inspection, never a retry.
    if (claimed)
      await report("result", {
        status: "failed",
        ...(recoveryRequired ? { recoveryRequired: true } : {}),
        errorCode: applying
          ? "retirement_apply_outcome_unconfirmed"
          : (retirementPlanFailureCodeSchema.safeParse(
              failure instanceof Error ? failure.message : "",
            ).data ?? "retirement_native_plan_failed"),
      }).catch(() => undefined);
    // A CF task's filesystem disappears on exit. Keep this task alive until its
    // interrupted State is durably acknowledged; never retry native cloud work.
    while (!options.local && recoveryRequired && preserveRecovery) {
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.max(
            1,
            Math.min(60000, options.recoveryRetryMilliseconds ?? 10000),
          ),
        ),
      );
      try {
        if (!retainedState && workPath)
          retainedState = await bounded(join(workPath, "errored.tfstate"));
        if (!retainedState) continue;
        z.strictObject({ accepted: z.literal(true) }).parse(
          await report("recovery", {
            data: retainedState.toString("base64"),
            sha256: hash(retainedState),
          }),
        );
        preserveRecovery = false;
        await report("result", {
          status: "failed",
          recoveryRequired: true,
          errorCode: "retirement_apply_outcome_unconfirmed",
        }).catch(() => undefined);
      } catch {}
    }
    return "failed";
  } finally {
    if (directory && !preserveRecovery)
      await rm(directory, { recursive: true, force: true });
  }
}
