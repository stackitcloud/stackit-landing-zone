import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
if (!process.argv[2]?.startsWith("/"))
  throw new Error("Absolute runner package required");
const root = resolve(process.argv[2]);
const work = await mkdtemp(resolve(repository, ".firewall-image-plan-"));
const sockets = await mkdtemp("/tmp/lzc-ipc-");
const image = resolve(root, "accelerator/firewall-image.qcow2");
let requests = 0;
const server = createServer((_request, response) => {
  requests++;
  response.writeHead(403);
  response.end("Offline fixture denies all API requests");
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
try {
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  await writeFile(
    resolve(work, "main.tf"),
    `terraform {
  required_version = ">= 1.7"

  required_providers {
    stackit = {
      source  = "stackitcloud/stackit"
      version = "0.114.0"
    }
  }
}

provider "stackit" {
  default_region        = "eu01"
  service_account_token = "offline-fixture-not-a-service-account-token"
  iaas_custom_endpoint  = ${JSON.stringify(endpoint)}
}

variable "image_path" {
  type        = string
  description = "Verified immutable firewall image under qualification"
  default     = ${JSON.stringify(image)}
}

resource "terraform_data" "project" {
  input = "11111111-1111-4111-8111-111111111111"
}

resource "stackit_image" "firewall" {
  project_id      = terraform_data.project.output
  region          = "eu01"
  name            = "offline-firewall-qualification"
  disk_format     = "qcow2"
  local_file_path = var.image_path
}
`,
  );
  const lock = (
    await readFile(resolve(root, "accelerator/.terraform.lock.hcl"), "utf8")
  ).match(
    /provider "registry\.opentofu\.org\/stackitcloud\/stackit" \{[\s\S]*?\n\}/,
  )?.[0];
  assert(lock, "Pinned STACKIT dependency lock required");
  await writeFile(
    resolve(work, ".terraform.lock.hcl"),
    `${lock.replace(/constraints = "[^"]+"/, 'constraints = "0.114.0"')}\n`,
  );
  await writeFile(
    resolve(work, "runner.tfrc"),
    `provider_installation {
  filesystem_mirror {
    path = ${JSON.stringify(resolve(root, "providers"))}
  }
}
`,
  );
  async function command(args) {
    return new Promise((done, reject) => {
      const child = spawn(resolve(root, "tools/tofu"), args, {
        cwd: work,
        env: {
          PATH: "/usr/bin:/bin",
          HOME: work,
          TMPDIR: sockets,
          TF_CLI_CONFIG_FILE: resolve(work, "runner.tfrc"),
          TF_IN_AUTOMATION: "true",
          TF_INPUT: "0",
          CHECKPOINT_DISABLE: "1",
          HTTP_PROXY: endpoint,
          HTTPS_PROXY: endpoint,
          ALL_PROXY: endpoint,
          NO_PROXY: "127.0.0.1,localhost",
        },
        timeout: 60000,
      });
      let output = "";
      for (const stream of [child.stdout, child.stderr])
        stream.on("data", (chunk) => {
          output += chunk;
        });
      child.on("error", reject);
      child.on("close", (code) => done({ code, output }));
    });
  }
  for (const args of [
    [
      "init",
      "-backend=false",
      "-input=false",
      "-lockfile=readonly",
      "-no-color",
    ],
    [
      "plan",
      "-refresh=false",
      "-input=false",
      "-no-color",
      "-out=offline-plan.bin",
    ],
  ]) {
    const result = await command(args);
    assert.equal(
      result.code,
      0,
      `Pinned STACKIT ${args[0]} failed: ${result.output
        .split("\n")
        .filter((line) => line.startsWith("Error:"))
        .join("; ")}`,
    );
  }
  const shown = await command(["show", "-json", "offline-plan.bin"]);
  assert.equal(shown.code, 0);
  const change = JSON.parse(shown.output).resource_changes.find(
    (item) => item.address === "stackit_image.firewall",
  ).change;
  assert.deepEqual(change.actions, ["create"]);
  assert.equal(change.after.local_file_path, image);
  assert.equal(change.after_unknown.image_id, true);
  const missing = resolve(work, "absent.qcow2");
  const denied = await command([
    "plan",
    "-refresh=false",
    "-input=false",
    "-no-color",
    `-var=image_path=${missing}`,
  ]);
  assert.notEqual(denied.code, 0);
  assert(
    denied.output.includes(missing),
    "Missing image must fail native file validation",
  );
  assert.equal(requests, 0, "An offline image plan must never call an API");
  console.log(
    "PASS: real pinned STACKIT provider plans the actual packaged QCOW2 and rejects a missing image; image ID remains computed, localhost/proxy requests=0. No cloud endpoint or upload used.",
  );
} finally {
  await new Promise((done) => server.close(done));
  await rm(work, { recursive: true, force: true });
  await rm(sockets, { recursive: true, force: true });
}
