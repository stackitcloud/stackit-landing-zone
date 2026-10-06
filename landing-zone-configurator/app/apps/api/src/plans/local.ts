import { type ChildProcess, execFile, spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  chmod,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { platformRunnerSourceSchema } from "@lzc/contracts";
import { z } from "zod";
import type { PlanRunner } from "./cloud-foundry.js";

const origin = "http://127.0.0.1:3000";
const marker = "running.json";

async function fingerprint(
  root: string,
  broker: "platform" | "application" = "platform",
) {
  const hash = createHash("sha256");
  async function add(relative: string) {
    const path = join(root, relative);
    const info = await lstat(path);
    if (info.isSymbolicLink())
      throw new Error("Runner package contains a link");
    hash.update(`${relative}\0`);
    if (info.isDirectory()) {
      for (const name of (await readdir(path)).sort())
        await add(join(relative, name));
    } else if (info.isFile()) {
      for await (const chunk of createReadStream(path)) hash.update(chunk);
    } else throw new Error("Invalid runner package entry");
  }
  for (const relative of [
    "accelerator",
    "apps/worker/dist",
    "packages/contracts/dist",
    "providers",
    "tools",
    "runtime",
    "node_modules/zod",
    "package.json",
    "runner.tfrc",
    "run-plan.sh",
    "package-lock.json",
  ])
    await add(relative);
  if (broker === "application") {
    hash.update("application\0");
    await add("application-src");
  }
  if (broker === "platform") {
    const metadata = await lstat(join(root, "platform-source.json")).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        return null;
      },
    );
    if (metadata) {
      hash.update("platform-source\0");
      await add("platform-source.json");
    }
  }
  const digest = hash.digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

async function hasRecovery(root: string): Promise<boolean> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === "errored.tfstate") return true;
    if (entry.isDirectory() && (await hasRecovery(join(root, entry.name))))
      return true;
  }
  return false;
}

export class LocalPlanRunner implements PlanRunner {
  private inspecting = 0;
  private readonly outputs = new Map<
    string,
    Promise<{ text: string; truncated: boolean; kind: "live" | "saved-plan" }>
  >();
  private readonly children = new Map<
    string,
    { child: ChildProcess; finished: Promise<void> }
  >();

  private constructor(
    private readonly root: string,
    private readonly jobs: string,
    private readonly identity: string,
    private readonly broker: "platform" | "application",
    readonly acceleratorCommit: string,
  ) {}

  static async open(
    root: string,
    jobs: string,
    broker: "platform" | "application" = "platform",
  ) {
    z.enum(["platform", "application"]).parse(broker);
    const packageRoot = await realpath(root);
    const info = await lstat(packageRoot);
    if ((info.mode & 0o022) !== 0)
      throw new Error("Runner package is writable by other users");
    const engine = await promisify(execFile)(
      join(packageRoot, "tools/tofu"),
      ["version", "-json"],
      {
        env: { PATH: "/usr/bin:/bin", CHECKPOINT_DISABLE: "1" },
        timeout: 10000,
        maxBuffer: 65536,
      },
    );
    if (JSON.parse(engine.stdout).terraform_version !== "1.12.6")
      throw new Error("Local runner requires OpenTofu 1.12.6");
    const source =
      broker === "platform"
        ? await readFile(
            join(packageRoot, "platform-source.json"),
            "utf8",
          ).then(
            (value) =>
              platformRunnerSourceSchema.parse(JSON.parse(value))
                .acceleratorCommit,
            (error: NodeJS.ErrnoException) => {
              if (error.code !== "ENOENT") throw error;
              return "a256f6896d11134fdc351786f1be5eba4e56b2e2";
            },
          )
        : "c4b43c36af198985980b17626c48d357795e3fbd";
    const identity = await fingerprint(packageRoot, broker);
    await mkdir(jobs, { recursive: true, mode: 0o700 });
    await chmod(jobs, 0o700);
    return new LocalPlanRunner(
      packageRoot,
      await realpath(jobs),
      identity,
      broker,
      source,
    );
  }

  get packageId() {
    return this.identity;
  }

  supportsAccelerator(commit: string) {
    return this.broker === "platform" && commit === this.acceleratorCommit;
  }

  supportsArtifact(identity: string) {
    return identity === this.identity;
  }

  async output(
    id: string,
    appId: string | null,
    saved?: { bytes: Buffer; sha256: string; identity: string },
  ): Promise<{
    text: string;
    truncated: boolean;
    kind: "live" | "saved-plan";
  }> {
    z.uuid().parse(id);
    if (appId === null && !saved)
      return { text: "", truncated: false, kind: "live" };
    if (appId !== id) throw new Error("Local runner identity mismatch");
    if (saved) {
      if (
        saved.identity !== this.identity ||
        saved.bytes.length > 16 * 1024 * 1024 ||
        createHash("sha256").update(saved.bytes).digest("hex") !== saved.sha256
      )
        throw new Error("Plan artifact invalid");
      const key = `${id}:${saved.sha256}`;
      const cached = this.outputs.get(key);
      if (cached) return cached;
      if (this.outputs.size >= 8)
        this.outputs.delete(this.outputs.keys().next().value as string);
      const result = this.inspect(saved.bytes).catch((error) => {
        this.outputs.delete(key);
        throw error;
      });
      this.outputs.set(key, result);
      return result;
    }
    let text = "";
    let truncated = false;
    if (!this.children.has(id)) return { text, truncated, kind: "live" };
    const directory = join(this.jobs, id);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith("lzc-runner-"))
        continue;
      const work = join(directory, entry.name);
      const credentials = await readFile(
        join(work, "credential.json"),
        "utf8",
      ).then(
        (value) => JSON.parse(value) as Record<string, unknown>,
        () => ({}),
      );
      for (const phase of ["init", "validate", "plan", "apply", "migration"]) {
        const file = await open(join(work, `${phase}.log`), "r").catch(
          () => null,
        );
        if (!file) continue;
        try {
          const limit = Math.max(0, 2 * 1024 * 1024 - Buffer.byteLength(text));
          const buffer = Buffer.alloc(
            Math.min(limit + 32768, (await file.stat()).size),
          );
          const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
          let chunk = buffer.subarray(0, bytesRead).toString("utf8");
          const values: unknown[] = [credentials];
          while (values.length) {
            const value = values.pop();
            if (typeof value === "string" && value.length >= 8)
              chunk = chunk
                .replaceAll(value, "(sensitive value)")
                .replaceAll(
                  JSON.stringify(value).slice(1, -1),
                  "(sensitive value)",
                );
            else if (value && typeof value === "object")
              values.push(...Object.values(value));
          }
          chunk = chunk.replace(
            /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g,
            "(sensitive value)",
          );
          if (Buffer.byteLength(chunk) > limit) {
            chunk = Buffer.from(chunk).subarray(0, limit).toString("utf8");
            truncated = true;
          }
          text += `\n$ tofu ${phase}\n${chunk}`;
          truncated ||= bytesRead < (await file.stat()).size;
        } finally {
          await file.close();
        }
      }
    }
    return { text, truncated, kind: "live" };
  }

  private async inspect(
    bytes: Buffer,
  ): Promise<{ text: string; truncated: boolean; kind: "saved-plan" }> {
    if (this.inspecting >= 2) throw new Error("Plan output busy");
    this.inspecting++;
    let work: string | undefined;
    let workContainer: string | undefined;
    let sockets: string | undefined;
    try {
      if ((await fingerprint(this.root, this.broker)) !== this.identity)
        throw new Error("Local runner package changed");
      workContainer = await mkdtemp(join(this.jobs, "inspect-"));
      work =
        this.broker === "application"
          ? join(workContainer, "application")
          : workContainer;
      sockets = await mkdtemp("/tmp/lzc-view-");
      await cp(
        join(
          this.root,
          this.broker === "application" ? "application-src" : "accelerator",
        ),
        workContainer,
        { recursive: true },
      );
      await writeFile(join(work, "saved-plan.bin"), bytes, { mode: 0o600 });
      await writeFile(
        join(work, "runner.tfrc"),
        `provider_installation {\n  filesystem_mirror {\n    path = ${JSON.stringify(
          join(this.root, "providers"),
        )
          .replaceAll("${", () => "$${")
          .replaceAll("%{", "%%{")}\n  }\n}\ndisable_checkpoint = true\n`,
        { mode: 0o600 },
      );
      const env = {
        PATH: `${this.root}/tools:/usr/bin:/bin`,
        HOME: work,
        TMPDIR: sockets,
        TF_IN_AUTOMATION: "true",
        TF_INPUT: "0",
        TF_CLI_CONFIG_FILE: join(work, "runner.tfrc"),
      };
      await promisify(execFile)(
        "/bin/bash",
        [join(this.root, "run-plan.sh"), "initializing", "initial-plan-only"],
        { cwd: work, env, timeout: 60000, maxBuffer: 65536 },
      );
      const result = await promisify(execFile)(
        join(this.root, "tools/tofu"),
        ["show", "-no-color", "saved-plan.bin"],
        { cwd: work, env, timeout: 60000, maxBuffer: 2 * 1024 * 1024 },
      );
      return { text: result.stdout, truncated: false, kind: "saved-plan" };
    } catch {
      throw new Error("Plan output unavailable");
    } finally {
      this.inspecting--;
      if (workContainer)
        await rm(workContainer, { recursive: true, force: true });
      if (sockets) await rm(sockets, { recursive: true, force: true });
    }
  }

  async start(
    id: string,
    ticket: string,
    broker: string,
    record: (appId: string, sourceDropletId: string) => Promise<void>,
  ) {
    z.uuid().parse(id);
    if (broker !== origin || !/^[A-Za-z0-9_-]{43}$/.test(ticket))
      throw new Error("Invalid local runner dispatch");
    if ((await fingerprint(this.root, this.broker)) !== this.identity)
      throw new Error("Local runner package changed");
    const directory = join(this.jobs, id);
    await mkdir(directory, { mode: 0o700 });
    try {
      await record(id, this.identity);
      const child = spawn(
        join(this.root, "runtime/bin/node"),
        ["--use-system-ca", join(this.root, "apps/worker/dist/main.js")],
        {
          cwd: directory,
          detached: true,
          stdio: "ignore",
          env: {
            PATH: "/usr/bin:/bin",
            HOME: directory,
            LZC_RUN_ID: id,
            LZC_RUN_TICKET: ticket,
            LZC_BROKER_ORIGIN: origin,
            LZC_LOCAL_RUNNER: "true",
            LZC_RUNNER_PACKAGE_ROOT: this.root,
            LZC_RUNNER_BROKER: this.broker,
          },
        },
      );
      const finished = new Promise<void>((resolve) => {
        child.once("error", resolve);
        child.once("close", resolve);
      });
      await new Promise<void>((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", reject);
      });
      this.children.set(id, { child, finished });
      await writeFile(
        join(directory, marker),
        JSON.stringify({ id, pid: child.pid, identity: this.identity }),
        { mode: 0o600 },
      );
      void finished
        .then(async () => {
          await rm(join(directory, marker), { force: true });
          this.children.delete(id);
        })
        .catch(() => {});
    } catch (error) {
      if (!this.children.has(id))
        await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  async probe() {
    const id = randomUUID();
    const started = Date.now();
    const ticket = randomBytes(32).toString("base64url");
    const rejected = await fetch(
      `${origin}/api/${this.broker === "application" ? "application-runner" : "runner"}/input`,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: `Bearer ${ticket}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      },
    );
    await rejected.arrayBuffer();
    if (rejected.status !== 401)
      throw new Error("Local broker did not reject the probe ticket");
    try {
      await this.start(id, ticket, origin, async () => {});
      const running = this.children.get(id);
      if (!running) throw new Error("Local runner probe process missing");
      await running.finished;
      if (running.child.exitCode !== 1)
        throw new Error("Local runner accepted an invalid ticket");
      return {
        service: "local-plan-runner-isolation",
        ok: true,
        completionMilliseconds: Date.now() - started,
      };
    } finally {
      await this.remove(id, id);
    }
  }

  async remove(id: string, appId: string | null) {
    z.uuid().parse(id);
    if (appId !== null && appId !== id)
      throw new Error("Local runner identity mismatch");
    const directory = join(this.jobs, id);
    const info = await lstat(directory).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      },
    );
    if (!info) return;
    if (info.isSymbolicLink() || !info.isDirectory())
      throw new Error("Invalid local job directory");
    const running = this.children.get(id);
    if (running) {
      if (
        running.child.pid &&
        running.child.exitCode === null &&
        running.child.signalCode === null
      )
        process.kill(-running.child.pid, "SIGTERM");
      await running.finished;
      await rm(join(directory, marker), { force: true });
    } else if (
      await readFile(join(directory, marker)).then(
        () => true,
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return false;
          throw error;
        },
      )
    )
      throw new Error("Local runner needs restart reconciliation");
    if (await hasRecovery(directory))
      throw new Error("Local runner recovery is pending");
    await rm(directory, { recursive: true, force: true });
  }
}
