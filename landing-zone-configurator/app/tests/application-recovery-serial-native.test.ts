import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { retainRecoveryOutputs } from "@lzc/contracts/recovery";
import { expect, it } from "vitest";

const binary = process.env.LZC_TEST_TOFU_BIN;
const run = promisify(execFile);
it.skipIf(!binary).each([2, 3])(
  "native locked publication preserves an intervening State at serial %i",
  async (serial) => {
    const instance = "11111111-1111-4111-8111-111111111111";
    const resource = (name: string, value: string) => ({
      mode: "managed",
      type: "terraform_data",
      name,
      provider: 'provider["terraform.io/builtin/terraform"]',
      instances: [
        {
          schema_version: 0,
          attributes: {
            id: instance,
            input: { value, type: "string" },
            output: { value, type: "string" },
            triggers_replace: null,
          },
          sensitive_attributes: [],
        },
      ],
    });
    const original = {
      version: 4,
      terraform_version: "1.12.6",
      serial: 1,
      lineage: "22222222-2222-4222-8222-222222222222",
      outputs: {},
      resources: [resource("contract", instance)],
    };
    const bytes = (v: unknown) => Buffer.from(JSON.stringify(v));
    const candidate = retainRecoveryOutputs(
      bytes(original),
      bytes({
        ...original,
        serial: 9,
        resources: [...original.resources, resource("recovered", "recovered")],
      }),
      instance,
    );
    expect(JSON.parse(candidate.toString()).serial).toBe(2);
    const competing = bytes({
      ...original,
      serial,
      outputs: { external: { value: "concurrent-writer", type: "string" } },
    });
    const stateKey = "/recovery-serial/terraform.tfstate";
    const objects = new Map<string, Buffer>([[stateKey, bytes(original)]]);
    let armed = false,
      writes = 0;
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      if (url.searchParams.get("list-type") === "2") {
        res.setHeader("content-type", "application/xml");
        res.end(
          '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>recovery-serial</Name><KeyCount>0</KeyCount><IsTruncated>false</IsTruncated></ListBucketResult>',
        );
        return;
      }
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      if (req.method === "PUT") {
        if (req.headers["if-none-match"] === "*" && objects.has(url.pathname)) {
          res.statusCode = 412;
          res.end();
          return;
        }
        objects.set(url.pathname, Buffer.concat(chunks));
        if (url.pathname === stateKey) writes++;
        if (armed && url.pathname === `${stateKey}.tflock`) {
          objects.set(stateKey, competing);
          armed = false;
        }
      }
      if (req.method === "DELETE") objects.delete(url.pathname);
      const stored = objects.get(url.pathname);
      if (req.method === "GET" && !stored) {
        res.statusCode = 404;
        res.setHeader("content-type", "application/xml");
        res.end("<Error><Code>NoSuchKey</Code></Error>");
        return;
      }
      if (stored)
        res.setHeader(
          "etag",
          `"${createHash("md5").update(stored).digest("hex")}"`,
        );
      res.end(req.method === "GET" ? stored : "");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw Error("Loopback listener required");
    const folder = await mkdtemp(join(tmpdir(), "lzc-recovery-serial-"));
    const command = (args: string[]) =>
      run(binary as string, args, {
        cwd: folder,
        timeout: 20000,
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          HOME: folder,
          TF_IN_AUTOMATION: "true",
          TF_INPUT: "0",
          CHECKPOINT_DISABLE: "1",
          AWS_ACCESS_KEY_ID: "synthetic-access",
          AWS_SECRET_ACCESS_KEY: "synthetic-secret",
          AWS_EC2_METADATA_DISABLED: "true",
        },
      });
    try {
      expect(
        JSON.parse((await command(["version", "-json"])).stdout)
          .terraform_version,
      ).toBe("1.12.6");
      await writeFile(
        join(folder, "backend.tf"),
        `terraform {\n backend "s3" {\n bucket="recovery-serial"\n key="terraform.tfstate"\n region="eu01"\n endpoints={s3="http://127.0.0.1:${address.port}"}\n use_path_style=true\n use_lockfile=true\n skip_credentials_validation=true\n skip_region_validation=true\n skip_metadata_api_check=true\n skip_requesting_account_id=true\n skip_s3_checksum=true\n }\n}\n`,
      );
      await command(["init", "-input=false", "-no-color"]);
      await writeFile(join(folder, "candidate.tfstate"), candidate, {
        mode: 0o600,
      });
      await command(["state", "push", "-lock-timeout=0s", "candidate.tfstate"]);
      expect(
        JSON.parse(objects.get(stateKey)!.toString()).resources,
      ).toHaveLength(2);
      // Simulate the API's successful prechecks, then a legitimate writer in the
      // gap before the native command obtains its lock and refreshes destination.
      objects.set(stateKey, bytes(original));
      writes = 0;
      armed = true;
      await expect(
        command(["state", "push", "-lock-timeout=0s", "candidate.tfstate"]),
      ).rejects.toBeDefined();
      expect(armed).toBe(false);
      expect(objects.get(stateKey)).toEqual(competing);
      expect(writes).toBe(0);
      expect(objects.has(`${stateKey}.tflock`)).toBe(false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(folder, { recursive: true, force: true });
    }
  },
  60000,
);
