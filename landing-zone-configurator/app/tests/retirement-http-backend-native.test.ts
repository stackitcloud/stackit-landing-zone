import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { retirementHttpBackendHcl } from "../apps/worker/src/retirement.js";
import { retirementInventory } from "../packages/contracts/src/recovery/retirement.js";

const tofu = process.env.LZC_RETIREMENT_NATIVE_TOFU_BIN;

it.skipIf(!tofu)(
  "initializes the actual worker backend and applies a saved Plan with a fresh job credential",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "lzc-retirement-http-"));
    let password = "synthetic-plan-credential";
    let state: Record<string, unknown> | undefined;
    let lock: string | undefined;
    let rejected = 0;
    let writes = 0;
    const server = createServer(async (request, response) => {
      const send = (status: number, data?: unknown) => {
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(data === undefined ? undefined : JSON.stringify(data));
      };
      if (
        request.headers.authorization !==
        `Basic ${Buffer.from(`runner:${password}`).toString("base64")}`
      ) {
        rejected++;
        return send(401);
      }
      const url = new URL(request.url ?? "/", "http://localhost");
      if (request.method === "GET" && url.pathname === "/state") {
        return send(state ? 200 : 404, state);
      }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
      if (request.method !== "POST") return send(405);
      if (url.pathname === "/lock") {
        if (lock) return send(423, { ID: lock });
        lock = body.ID;
        return send(200);
      }
      if (url.pathname === "/unlock") {
        if (!lock || body.ID !== lock) return send(409);
        lock = undefined;
        return send(200);
      }
      if (url.pathname === "/state") {
        if (!lock || url.searchParams.get("ID") !== lock) return send(409);
        state = body;
        writes++;
        return send(200);
      }
      send(404);
    });
    try {
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      const address = server.address();
      if (!address || typeof address === "string") throw Error("missing port");
      const origin = `http://127.0.0.1:${address.port}`;
      await writeFile(
        join(directory, "main.tf"),
        `${retirementHttpBackendHcl}resource "terraform_data" "disposable" { input = "synthetic-only" }\n`,
      );
      const command = async (...args: string[]) => {
        const output: Buffer[] = [];
        const child = spawn(tofu as string, args, {
          cwd: directory,
          env: {
            PATH: process.env.PATH,
            TF_IN_AUTOMATION: "true",
            TF_INPUT: "0",
            CHECKPOINT_DISABLE: "1",
            TF_HTTP_ADDRESS: `${origin}/state`,
            TF_HTTP_LOCK_ADDRESS: `${origin}/lock`,
            TF_HTTP_UNLOCK_ADDRESS: `${origin}/unlock`,
            TF_HTTP_LOCK_METHOD: "POST",
            TF_HTTP_UNLOCK_METHOD: "POST",
            TF_HTTP_USERNAME: "runner",
            TF_HTTP_PASSWORD: password,
            TF_HTTP_RETRY_MAX: "0",
          },
          timeout: 30_000,
        });
        child.stdout.on("data", (chunk) => output.push(chunk));
        child.stderr.on("data", (chunk) => output.push(chunk));
        await new Promise<void>((resolve, reject) => {
          child.once("error", reject);
          child.once("close", (code) => {
            if (code === 0) resolve();
            else
              reject(
                Error(
                  `Native synthetic test failed: ${args[0]}\n${Buffer.concat(output)}`,
                ),
              );
          });
        });
      };
      await command("init", "-input=false", "-no-color");
      await command("apply", "-auto-approve", "-input=false", "-no-color");
      expect(state?.resources).toHaveLength(1);
      expect(retirementInventory(state).resources).toHaveLength(1);
      await command("plan", "-destroy", "-input=false", "-out=saved.plan");
      const backend = JSON.parse(
        await readFile(join(directory, ".terraform/terraform.tfstate"), "utf8"),
      ).backend.config;
      expect(backend.password).toBeNull();
      password = "synthetic-fresh-apply-credential";
      await command("apply", "-json", "-input=false", "saved.plan");
      expect(rejected).toBe(0);
      expect(writes).toBeGreaterThanOrEqual(2);
      expect(lock).toBeUndefined();
      expect(state?.resources ?? []).toHaveLength(0);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await rm(directory, { recursive: true, force: true });
    }
  },
  90_000,
);
