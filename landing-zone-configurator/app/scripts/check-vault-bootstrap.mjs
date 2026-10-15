import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
if (!process.argv[2]?.startsWith("/"))
  throw new Error("Absolute runner package required");
const root = resolve(process.argv[2]);
const work = await mkdtemp(resolve(repository, ".vault-bootstrap-"));
let requests = 0;
const server = createServer((_request, response) => {
  requests++;
  response.writeHead(403, { "Content-Type": "application/json" });
  response.end('{"errors":["offline fixture denies authentication"]}');
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
try {
  const { port } = server.address();
  const providers = await readFile(
    resolve(root, "accelerator/providers.tf"),
    "utf8",
  );
  const source = providers.match(/provider "vault" \{[\s\S]*?\n\}/)?.[0];
  if (!source) throw new Error("Pinned Vault configuration missing");
  const provider = source
    .replace(
      'address          = "https://prod.sm.eu01.stackit.cloud"',
      `address          = "http://127.0.0.1:${port}"`,
    )
    .replace(
      "module.management.secretsmanager_username",
      "terraform_data.credentials.output.username",
    )
    .replace(
      "module.management.secretsmanager_password",
      "terraform_data.credentials.output.password",
    );
  if (provider.includes("prod.sm.") || provider.includes("module.management"))
    throw new Error("Offline Vault isolation substitution failed");
  await writeFile(
    resolve(work, "main.tf"),
    `terraform {
  required_providers {
    vault = {
      source  = "hashicorp/vault"
      version = "5.11.0"
    }
  }
}

resource "terraform_data" "credentials" {
  input = {
    username = "offline-fixture"
    password = "offline-fixture"
  }
}

${provider}

resource "vault_kv_secret_v2" "fixture" {
  mount     = "offline-fixture"
  name      = "offline-fixture"
  data_json = jsonencode({ fixture = true })
}
`,
  );
  const lock = (
    await readFile(resolve(root, "accelerator/.terraform.lock.hcl"), "utf8")
  ).match(
    /provider "registry\.opentofu\.org\/hashicorp\/vault" \{[\s\S]*?\n\}/,
  )?.[0];
  if (!lock) throw new Error("Pinned Vault dependency lock missing");
  await writeFile(
    resolve(work, ".terraform.lock.hcl"),
    `${lock.replace(/constraints = "[^"]+"/, 'constraints = "5.11.0"')}\n`,
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
  await mkdir(resolve(work, "sockets"));
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
    const result = await new Promise((done, reject) => {
      const child = spawn(resolve(root, "tools/tofu"), args, {
        cwd: work,
        env: {
          PATH: "/usr/bin:/bin",
          HOME: work,
          TMPDIR: resolve(work, "sockets"),
          TF_CLI_CONFIG_FILE: resolve(work, "runner.tfrc"),
          TF_IN_AUTOMATION: "true",
          TF_INPUT: "0",
          CHECKPOINT_DISABLE: "1",
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
    if (result.code !== 0) {
      const errors = result.output
        .split("\n")
        .filter((line) => line.startsWith("Error:"));
      console.error(
        `FAIL: pinned Vault ${args[0]} with unknown bootstrap login; localhost requests=${requests}; ${errors.join("; ")}`,
      );
      process.exitCode = 1;
      break;
    }
  }
  if (!process.exitCode && requests !== 0)
    throw new Error("Bootstrap plan unexpectedly attempted authentication");
  if (!process.exitCode)
    console.log(
      `PASS: real pinned Vault provider plans new secrets with unknown bootstrap login without authentication; localhost requests=${requests}. No cloud endpoint used.`,
    );
} finally {
  await new Promise((done) => server.close(done));
  await rm(work, { recursive: true, force: true });
}
