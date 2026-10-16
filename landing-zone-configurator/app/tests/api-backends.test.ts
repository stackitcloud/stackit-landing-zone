import { spawn } from "node:child_process";
import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type S3RunnerBackend, s3BackendConfiguration } from "@lzc/contracts";
import type pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import type { AuthServices } from "../apps/api/src/auth/routes.js";
import type { Session } from "../apps/api/src/auth/store.js";
import { CredentialError } from "../apps/api/src/credentials/profiles.js";
import {
  Backends,
  contentHash,
  managementRunnerKey,
  migrationStateMatches,
  registerBackendSchema,
  stateDocument,
  type TerraformState,
} from "../apps/api/src/deployments/backends.js";
import type { PreparationManifest } from "../apps/api/src/deployments/preparations.js";
import { ArtifactCrypto } from "../apps/api/src/plans/crypto.js";
import {
  PlatformExecution,
  sha256,
  stableStateKey,
} from "../apps/api/src/plans/execution.js";

it.each([
  "full",
  "native",
  "changed-content",
  "changed-version",
  "same-lineage-reset",
  "wrong-serial",
])("verifies migration payload and pinned native metadata: %s", (variant) => {
  const source = stateDocument(
    Buffer.from(
      JSON.stringify({
        version: 4,
        terraform_version: "1.12.6",
        serial: 7,
        lineage: randomUUID(),
        outputs: { proof: { value: "test-only" } },
        resources: [],
      }),
    ),
  );
  const target =
    variant === "full"
      ? { ...source }
      : { ...source, lineage: randomUUID(), serial: 1 };
  if (variant === "changed-content")
    target.outputs = { proof: { value: "different" } };
  if (variant === "changed-version") target.terraform_version = "1.12.5";
  if (variant === "same-lineage-reset") target.lineage = source.lineage;
  if (variant === "wrong-serial") target.serial = 2;
  expect(migrationStateMatches(source, target)).toBe(
    variant === "full" || variant === "native",
  );
});

it.each([
  "reordered",
  "changed-status",
  "changed-check-object",
  "removed-check",
  "duplicated-check",
  "reordered-nested-objects",
  "changed-resource",
  "reordered-resources",
  "reordered-output-array",
  "unknown-engine",
  "wrong-serial",
])(
  "only normalizes complete top-level migration check order: %s",
  (variant) => {
    const source = stateDocument(
      Buffer.from(
        JSON.stringify({
          version: 4,
          terraform_version: "1.12.6",
          serial: 4,
          lineage: randomUUID(),
          outputs: { proof: { value: ["first", "second"], sensitive: false } },
          resources: [
            {
              type: "terraform_data",
              name: "first",
              instances: [{ attributes: { input: "first" } }],
            },
            {
              type: "terraform_data",
              name: "second",
              instances: [{ attributes: { input: "second" } }],
            },
          ],
          check_results: [
            {
              object_kind: "var",
              config_addr: "var.first",
              status: "pass",
              objects: [{ object_addr: "var.first", status: "pass" }],
            },
            {
              object_kind: "resource",
              config_addr: "terraform_data.second",
              status: "pass",
              objects: [
                { object_addr: "terraform_data.second[0]", status: "pass" },
                { object_addr: "terraform_data.second[1]", status: "pass" },
              ],
            },
          ],
        }),
      ),
    );
    const originalHash = contentHash(source);
    const target: TerraformState = {
      ...structuredClone(source),
      lineage: randomUUID(),
      serial: 1,
    };
    const checks = target.check_results;
    if (!Array.isArray(checks)) throw new Error("Test check results required");
    checks.reverse();
    if (variant === "changed-status") checks[0].status = "fail";
    if (variant === "changed-check-object")
      checks[0].objects[0].object_addr = "terraform_data.other";
    if (variant === "removed-check") checks.pop();
    if (variant === "duplicated-check") checks.push(structuredClone(checks[0]));
    if (variant === "reordered-nested-objects") checks[0].objects.reverse();
    if (variant === "changed-resource")
      target.resources[0]!.instances![0]!.attributes!.input = "changed";
    if (variant === "reordered-resources") target.resources.reverse();
    if (variant === "reordered-output-array")
      target.outputs = {
        proof: { value: ["second", "first"], sensitive: false },
      };
    if (variant === "unknown-engine")
      source.terraform_version = target.terraform_version = "1.12.5";
    if (variant === "wrong-serial") target.serial = 2;
    const targetHash = contentHash(target);
    expect(migrationStateMatches(source, target)).toBe(variant === "reordered");
    expect(contentHash(target)).toBe(targetHash);
    if (variant !== "unknown-engine")
      expect(contentHash(source)).toBe(originalHash);
  },
);

it.skipIf(process.env.LZC_NATIVE_RUNNER_TEST !== "true")(
  "verifies actual OpenTofu HTTP-to-S3 metadata transformation without any cloud credentials",
  async () => {
    let source: TerraformState | undefined;
    const objects = new Map<string, Buffer>();
    const server = createServer(async (request, response) => {
      const address = new URL(request.url ?? "/", "http://localhost");
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const bytes = Buffer.concat(chunks);
      if (address.pathname === "/source") {
        if (request.method === "POST") source = stateDocument(bytes);
        if (request.method === "GET" && !source) response.statusCode = 404;
        response.setHeader("content-type", "application/json");
        response.end(
          request.method === "GET" && source ? JSON.stringify(source) : "{}",
        );
        return;
      }
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      if (address.searchParams.get("list-type") === "2") {
        response.setHeader("content-type", "application/xml");
        response.end(
          '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>migration-probe</Name><KeyCount>0</KeyCount><IsTruncated>false</IsTruncated></ListBucketResult>',
        );
        return;
      }
      if (request.method === "PUT") objects.set(address.pathname, bytes);
      if (request.method === "DELETE") objects.delete(address.pathname);
      const stored = objects.get(address.pathname);
      if (request.method === "GET" && !stored) {
        response.statusCode = 404;
        response.setHeader("content-type", "application/xml");
        response.end("<Error><Code>NoSuchKey</Code></Error>");
        return;
      }
      if (stored) response.setHeader("etag", `"${sha256(stored)}"`);
      response.end(request.method === "GET" ? stored : "");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const directory = await mkdtemp(join(tmpdir(), "lzc-native-s3-migration-"));
    const binding = server.address();
    if (!binding || typeof binding === "string")
      throw new Error("Loopback test listener required");
    const endpoint = `http://127.0.0.1:${binding.port}`;
    async function command(args: string[]) {
      const child = spawn(process.env.LZC_NATIVE_TOFU_BINARY ?? "tofu", args, {
        cwd: directory,
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          HOME: directory,
          TF_IN_AUTOMATION: "true",
          AWS_ACCESS_KEY_ID: "test-access",
          AWS_SECRET_ACCESS_KEY: "test-secret",
          AWS_EC2_METADATA_DISABLED: "true",
        },
      });
      let output = "";
      child.stdout.on("data", (bytes) => {
        output += bytes;
      });
      child.stderr.on("data", (bytes) => {
        output += bytes;
      });
      await new Promise<void>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code) =>
          code === 0 ? resolve() : reject(new Error(output)),
        );
      });
    }
    try {
      const validationVariables = Array.from(
        { length: 24 },
        (_, index) =>
          `variable "proof_${index}" {\n type = number\n default = ${index}\n validation {\n condition = var.proof_${index} >= 0\n error_message = "Synthetic proof must be nonnegative."\n }\n}\n`,
      ).join("\n");
      await writeFile(
        join(directory, "main.tf"),
        `${validationVariables}\nresource "terraform_data" "proof" { input = "synthetic-only" }\noutput "proof" { value = terraform_data.proof.output }\n`,
        { mode: 0o600 },
      );
      await writeFile(
        join(directory, "backend.tf"),
        `terraform {\n backend "http" {\n address = "${endpoint}/source"\n lock_address = "${endpoint}/source"\n unlock_address = "${endpoint}/source"\n }\n}\n`,
        { mode: 0o600 },
      );
      await command(["init", "-input=false", "-no-color"]);
      await command(["apply", "-auto-approve", "-input=false", "-no-color"]);
      await writeFile(
        join(directory, "main.tf"),
        `${validationVariables}\nresource "terraform_data" "proof" { input = "synthetic-updated" }\noutput "proof" { value = terraform_data.proof.output }\n`,
      );
      await command(["apply", "-auto-approve", "-input=false", "-no-color"]);
      if (!source) throw new Error("Native HTTP state missing");
      expect(source.terraform_version).toBe("1.12.6");
      expect(source.serial).toBeGreaterThan(1);
      const sourceChecks = source.check_results;
      if (!Array.isArray(sourceChecks))
        throw new Error("Native checks missing");
      expect(sourceChecks).toHaveLength(24);
      await writeFile(
        join(directory, "backend.tf"),
        `terraform {\n backend "s3" {\n bucket = "migration-probe"\n key = "terraform.tfstate"\n region = "eu01"\n endpoints = { s3 = "${endpoint}" }\n use_path_style = true\n use_lockfile = true\n skip_credentials_validation = true\n skip_region_validation = true\n skip_metadata_api_check = true\n skip_requesting_account_id = true\n skip_s3_checksum = true\n }\n}\n`,
      );
      await command([
        "init",
        "-migrate-state",
        "-force-copy",
        "-input=false",
        "-no-color",
      ]);
      const bytes = objects.get("/migration-probe/terraform.tfstate");
      if (!bytes) throw new Error("Native S3 state missing");
      const target = stateDocument(bytes);
      expect(target.serial).toBe(1);
      expect(target.lineage).not.toBe(source.lineage);
      expect(target.resources).toEqual(source.resources);
      expect(target.outputs).toEqual(source.outputs);
      expect(target.check_results).toEqual(
        expect.arrayContaining(sourceChecks),
      );
      expect(target.check_results).toHaveLength(sourceChecks.length);
      expect(migrationStateMatches(source, target)).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  },
  60000,
);

const descriptor = {
  bucket: "customer-management-tfstate",
  endpoint: "https://object.storage.eu01.onstackit.cloud",
  region: "eu01",
  key: "terraform.tfstate",
  useLockfile: true,
} as const;
const credentials = {
  accessKeyId: "private-access-key",
  secretAccessKey: "private-secret-key",
};
const backend: S3RunnerBackend = { kind: "s3", descriptor, credentials };
const session = { tenantId: randomUUID(), userId: randomUUID() } as Session;
const crypto = new ArtifactCrypto(randomBytes(32).toString("base64"));
function fixture() {
  const source = {
    version: 4 as const,
    serial: 7,
    lineage: randomUUID(),
    outputs: { management_bucket_name_tfstate: { value: descriptor.bucket } },
    resources: [
      {
        module: "module.management",
        mode: "managed",
        type: "stackit_objectstorage_credential",
        name: "this",
        instances: [
          {
            attributes: {
              access_key: credentials.accessKeyId,
              secret_access_key: credentials.secretAccessKey,
              project_id: "management-project",
            },
          },
        ],
      },
      {
        module: "module.management",
        mode: "managed",
        type: "stackit_objectstorage_bucket",
        name: "tfstate",
        instances: [
          {
            attributes: {
              name: descriptor.bucket,
              project_id: "management-project",
            },
          },
        ],
      },
    ],
  };
  const run = {
    id: randomUUID(),
    operation: "apply" as const,
    mode: "platform-apply",
    status: "applying",
    input_claimed: true,
    state_key: "stable-state",
    state_version: "1",
    plan_id: randomUUID(),
    artifact_sha256: "0".repeat(64),
    engine_version: "1.12.6",
    provider_lock_sha256: "0".repeat(64),
    runner_droplet_id: randomUUID(),
    summary: null,
  };
  const state = {
    state_key: run.state_key,
    stable_aad: true,
    version: "1",
    ciphertext: crypto.encrypt(
      Buffer.from(JSON.stringify(source)),
      session.tenantId,
      run.state_key,
      `state:${run.state_key}`,
    ) as Buffer | null,
    backend_id: null as string | null,
    runner_key_ciphertext: null as Buffer | null,
    lock_run_id: null as string | null,
    lock_id: null as string | null,
    migration_run_id: null as string | null,
    migration_version: null as string | null,
    migration_sha256: null as string | null,
    pending_backend_id: null as string | null,
    remote_identity: null as string | null,
  };
  let target: Buffer | null = null;
  let lock = false;
  let recovery: { sha256: string; ciphertext: Buffer } | undefined;
  let stored:
    | { id: string; descriptor: unknown; credentials_ciphertext: Buffer }
    | undefined;
  const query = vi.fn(async (sql: string, values: any[] = []) => {
    if (sql.startsWith("SELECT * FROM lzc.platform_states"))
      return { rows: [{ ...state }], rowCount: 1 };
    if (sql.startsWith("SELECT run_id FROM lzc.plan_artifacts"))
      return { rows: [{ run_id: run.plan_id }], rowCount: 1 };
    if (sql.startsWith("UPDATE lzc.platform_states SET lock_run_id=$2")) {
      state.lock_run_id = values[1];
      state.lock_id = values[2];
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith("UPDATE lzc.platform_states SET lock_run_id=NULL")) {
      state.lock_run_id = null;
      state.lock_id = null;
      return { rows: [], rowCount: 1 };
    }
    if (
      sql.startsWith(
        "UPDATE lzc.platform_states SET version=version+1,ciphertext",
      )
    ) {
      state.version = String(Number(state.version) + 1);
      state.ciphertext = values[1];
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith("INSERT INTO lzc.state_backends")) {
      stored = {
        id: values[0],
        descriptor: JSON.parse(values[2]),
        credentials_ciphertext: values[4],
      };
      return {
        rows: [{ id: stored.id, descriptor: stored.descriptor }],
        rowCount: 1,
      };
    }
    if (sql.startsWith("SELECT * FROM lzc.state_backends"))
      return { rows: stored ? [stored] : [], rowCount: stored ? 1 : 0 };
    if (sql.startsWith("UPDATE lzc.platform_states SET pending_backend_id")) {
      state.pending_backend_id = values[1];
      state.migration_run_id = values[2];
      state.migration_version = state.version;
      state.migration_sha256 = values[3];
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith("UPDATE lzc.platform_states SET backend_id")) {
      if (state.version !== values[1]) return { rows: [], rowCount: 0 };
      state.backend_id = state.pending_backend_id;
      state.ciphertext = null;
      state.remote_identity = values[3];
      state.version = String(Number(state.version) + 1);
      return { rows: [{ state_key: state.state_key }], rowCount: 1 };
    }
    if (sql.startsWith("INSERT INTO lzc.state_recoveries")) {
      if (recovery) return { rows: [], rowCount: 0 };
      recovery = { sha256: values[3], ciphertext: values[4] };
      return { rows: [{ run_id: run.id }], rowCount: 1 };
    }
    if (sql.startsWith("SELECT sha256 FROM lzc.state_recoveries"))
      return { rows: recovery ? [recovery] : [], rowCount: recovery ? 1 : 0 };
    throw new Error(`Unexpected test query: ${sql}`);
  });
  const client = { query } as unknown as pg.PoolClient;
  const read = vi.fn(async (_backend: S3RunnerBackend, key: string) =>
    key.endsWith(".tflock")
      ? lock
        ? { bytes: Buffer.from("lock"), identity: "lock" }
        : null
      : target
        ? { bytes: target, identity: sha256(target) }
        : null,
  );
  const backends = new Backends({} as pg.Pool, crypto, read);
  return {
    source,
    run,
    state,
    client,
    backends,
    execution: new PlatformExecution(crypto, backends),
    query,
    read,
    target: (bytes: Buffer | null) => {
      target = bytes;
    },
    lock: () => {
      lock = true;
    },
    recovery: () => recovery,
    stored: () => stored,
  };
}

describe("API state backend lifecycle without cloud calls", () => {
  it("allows only the bound migration snapshot after real HTTP state writes", async () => {
    const test = fixture();
    test.state.version = "0";
    test.state.ciphertext = null;
    test.run.state_version = "0";
    await test.execution.state(
      test.client,
      session,
      test.run,
      "lock",
      undefined,
      "apply-lock",
    );
    await test.execution.state(
      test.client,
      session,
      test.run,
      "write",
      test.source,
      "apply-lock",
    );
    await test.execution.state(
      test.client,
      session,
      test.run,
      "unlock",
      undefined,
      "apply-lock",
    );
    await expect(
      test.execution.state(test.client, session, test.run, "read"),
    ).rejects.toMatchObject({ code: "state_changed" });
    await test.execution.migration(test.client, session, test.run, "prepare");
    expect(test.run.state_version).toBe("0");
    await expect(
      test.execution.state(test.client, session, test.run, "read"),
    ).resolves.toEqual(test.source);
    const unrelated = { ...test.run, id: randomUUID(), state_version: "1" };
    for (const action of ["read", "lock", "unlock"] as const) {
      await expect(
        test.execution.state(
          test.client,
          session,
          unrelated,
          action,
          undefined,
          "migration-lock",
        ),
      ).rejects.toMatchObject({ code: "state_changed" });
    }
    await test.execution.state(
      test.client,
      session,
      test.run,
      "lock",
      undefined,
      "migration-lock",
    );
    await expect(
      test.execution.state(
        test.client,
        session,
        test.run,
        "write",
        { ...test.source, serial: 8 },
        "migration-lock",
      ),
    ).rejects.toMatchObject({ code: "state_write_forbidden" });
    await expect(
      test.execution.state(
        test.client,
        session,
        test.run,
        "unlock",
        undefined,
        "other-lock",
      ),
    ).rejects.toMatchObject({ code: "state_locked" });
    await test.execution.state(
      test.client,
      session,
      test.run,
      "unlock",
      undefined,
      "migration-lock",
    );
    test.state.version = "2";
    await expect(
      test.execution.state(test.client, session, test.run, "read"),
    ).rejects.toMatchObject({ code: "state_changed" });
    test.state.version = "1";
    test.state.migration_sha256 = "0".repeat(64);
    await expect(
      test.execution.state(
        test.client,
        session,
        test.run,
        "lock",
        undefined,
        "migration-lock",
      ),
    ).rejects.toMatchObject({ code: "state_changed" });
    test.state.migration_sha256 = contentHash(test.source);
    test.target(Buffer.from(JSON.stringify(test.source, null, 2)));
    await expect(
      test.execution.migration(test.client, session, test.run, "complete"),
    ).resolves.toEqual({ migrated: true });
  });
  it("keeps deployment identity across owners, repository/source/revision changes, but not tenants or configurations", () => {
    const configurationId = randomUUID();
    const manifest = {
      source: { kind: "database", configurationId, revision: 1 },
    } as PreparationManifest;
    const key = stableStateKey(session, manifest);
    expect(stableStateKey({ ...session, userId: randomUUID() }, manifest)).toBe(
      key,
    );
    expect(
      stableStateKey(session, {
        ...manifest,
        source: {
          repository: { id: 3, owner: "customer", name: "fork" },
          configurationId,
          branch: "work",
          commit: "a".repeat(40),
        },
      }),
    ).toBe(key);
    expect(
      stableStateKey({ ...session, tenantId: randomUUID() }, manifest),
    ).not.toBe(key);
    expect(
      stableStateKey(session, {
        ...manifest,
        source: {
          kind: "database",
          configurationId: randomUUID(),
          revision: 1,
          documentSha256: "0".repeat(64),
        },
      }),
    ).not.toBe(key);
  });
  it("restricts endpoint, exports standard CLI JSON without credentials, and validates state", () => {
    expect(
      registerBackendSchema.safeParse({
        descriptor: { ...descriptor, endpoint: "http://169.254.169.254" },
        credentials,
      }).success,
    ).toBe(false);
    const configuration = s3BackendConfiguration(descriptor);
    expect(JSON.parse(configuration).terraform.backend.s3).toMatchObject({
      key: "terraform.tfstate",
      use_lockfile: true,
    });
    expect(configuration).not.toContain(credentials.secretAccessKey);
    expect(() =>
      stateDocument(
        Buffer.from('{"version":4,"lineage":"x","serial":-1,"resources":[]}'),
      ),
    ).toThrow();
  });
  it("rejects remote content/version changes and native locks before saved-plan use", async () => {
    const test = fixture();
    await test.execution.migration(test.client, session, test.run, "prepare");
    test.target(Buffer.from(JSON.stringify(test.source)));
    await test.execution.migration(test.client, session, test.run, "complete");
    await expect(
      test.execution.current(test.client, session, test.state),
    ).resolves.toMatchObject({ remote: { document: test.source } });
    test.target(Buffer.from(JSON.stringify({ ...test.source, serial: 8 })));
    await expect(
      test.execution.current(test.client, session, test.state),
    ).rejects.toMatchObject({ code: "state_changed" });
    test.lock();
    await expect(
      test.execution.current(test.client, session, test.state),
    ).rejects.toMatchObject({ code: "state_locked" });
  });
  it("encrypts registry credentials with stable backend AAD and refuses conflicting target states", async () => {
    const test = fixture();
    test.target(
      Buffer.from(JSON.stringify({ ...test.source, lineage: randomUUID() })),
    );
    await expect(
      test.execution.migration(test.client, session, test.run, "prepare"),
    ).rejects.toMatchObject({ code: "migration_target_not_empty" });
    expect(test.stored()).toBeUndefined();
    test.target(null);
    const prepared = await test.execution.migration(
      test.client,
      session,
      test.run,
      "prepare",
    );
    expect(prepared).toEqual({ backend });
    const stored = test.stored()!;
    expect(
      stored.credentials_ciphertext.includes(
        Buffer.from(credentials.secretAccessKey),
      ),
    ).toBe(false);
    expect(
      JSON.parse(
        crypto
          .decrypt(
            stored.credentials_ciphertext,
            session.tenantId,
            stored.id,
            `backend:${stored.id}`,
          )
          .toString(),
      ),
    ).toEqual(credentials);
    expect(() =>
      crypto.decrypt(
        stored.credentials_ciphertext,
        randomUUID(),
        stored.id,
        `backend:${stored.id}`,
      ),
    ).toThrow();
  });
  it("allows identical interrupted copy, requires exact state proof and CAS before clearing primary DB ciphertext", async () => {
    const test = fixture();
    test.target(Buffer.from(JSON.stringify(test.source, null, 2)));
    await test.execution.migration(test.client, session, test.run, "prepare");
    await test.execution.migration(test.client, session, test.run, "prepare");
    test.target(Buffer.from(JSON.stringify({ ...test.source, serial: 8 })));
    await expect(
      test.execution.migration(test.client, session, test.run, "complete"),
    ).rejects.toMatchObject({ code: "migration_verification_failed" });
    expect(test.state.ciphertext).not.toBeNull();
    test.target(Buffer.from(JSON.stringify(test.source)));
    test.state.version = "2";
    await expect(
      test.execution.migration(test.client, session, test.run, "complete"),
    ).rejects.toMatchObject({ code: "state_changed" });
    test.state.version = "1";
    await expect(
      test.execution.migration(test.client, session, test.run, "complete"),
    ).resolves.toEqual({ migrated: true });
    expect(test.state.ciphertext).toBeNull();
    expect(test.state.backend_id).toBe(test.stored()!.id);
  });
  it("durably encrypts recovery, verifies canonical base64/hash, and makes exact retries idempotent", async () => {
    const test = fixture();
    const bytes = Buffer.from(JSON.stringify(test.source));
    const hash = sha256(bytes);
    await expect(
      test.execution.recovery(
        test.client,
        session,
        test.run,
        bytes.toString("base64"),
        "0".repeat(64),
      ),
    ).rejects.toMatchObject({ code: "recovery_invalid" });
    await expect(
      test.execution.recovery(test.client, session, test.run, "Zh==", hash),
    ).rejects.toMatchObject({ code: "recovery_invalid" });
    await test.execution.recovery(
      test.client,
      session,
      test.run,
      bytes.toString("base64"),
      hash,
    );
    await test.execution.recovery(
      test.client,
      session,
      test.run,
      bytes.toString("base64"),
      hash,
    );
    expect(test.recovery()!.ciphertext.includes(bytes)).toBe(false);
    expect(
      crypto.decrypt(
        test.recovery()!.ciphertext,
        session.tenantId,
        test.run.state_key,
        `recovery:${test.run.id}`,
      ),
    ).toEqual(bytes);
    expect(contentHash(test.source)).toHaveLength(64);
  });
  it("accepts only actual management key JSON with verified RSA, project, email and organization role bindings", () => {
    const test = fixture();
    const organizationId = randomUUID();
    const key = {
      credentials: {
        kid: randomUUID(),
        iss: "management@sa.stackit.cloud",
        sub: randomUUID(),
        aud: "https://accounts.stackit.cloud",
        privateKey: generateKeyPairSync("rsa", { modulusLength: 2048 })
          .privateKey.export({ format: "pem", type: "pkcs8" })
          .toString(),
      },
    };
    const resources = [
      ...test.source.resources,
      {
        module: "module.management",
        mode: "managed",
        type: "stackit_service_account_key",
        name: "automation",
        instances: [
          {
            attributes: {
              json: JSON.stringify(key),
              service_account_email: key.credentials.iss,
              project_id: "management-project",
            },
          },
        ],
      },
      {
        module: "module.management",
        mode: "managed",
        type: "stackit_service_account",
        name: "automation",
        instances: [
          {
            attributes: {
              email: key.credentials.iss,
              project_id: "management-project",
            },
          },
        ],
      },
      {
        module: "module.management",
        mode: "managed",
        type: "stackit_authorization_organization_role_assignment",
        name: "sa_owner",
        instances: [
          {
            attributes: {
              subject: key.credentials.iss,
              role: "owner",
              resource_id: organizationId,
            },
          },
        ],
      },
    ];
    expect(
      managementRunnerKey({ ...test.source, resources }, organizationId),
    ).toEqual(key);
    expect(() =>
      managementRunnerKey({ ...test.source, resources }, randomUUID()),
    ).toThrow("management_runner_key_not_verified");
    const wrongProject = structuredClone(resources);
    (
      wrongProject[wrongProject.length - 2]!.instances[0]!.attributes as {
        project_id: string;
      }
    ).project_id = "other-project";
    expect(() =>
      managementRunnerKey(
        { ...test.source, resources: wrongProject },
        organizationId,
      ),
    ).toThrow("management_runner_key_not_verified");
    expect(managementRunnerKey(test.source, organizationId)).toBeUndefined();
  });
  it("registers exact backend and runner routes with PE/CSRF checks, strict schemas, no user credential output and body caps", async () => {
    const user = {
      ...session,
      id: randomUUID(),
      githubId: "101",
      login: "engineer",
      csrfToken: "c".repeat(43),
      expiresAt: new Date(Date.now() + 3600000),
      tenantKind: "organisation" as const,
      productRoles: ["platform-engineer" as const],
    };
    const auth: AuthServices = {
      origin: "https://configurator.example",
      clientId: "test",
      store: {
        resolveSession: vi.fn(async () => user),
        beginLogin: vi.fn(),
        consumeLogin: vi.fn(),
        createSession: vi.fn(),
        deleteSession: vi.fn(),
      },
      github: { authorize: vi.fn() },
      tokens: { get: vi.fn(), put: vi.fn(), remove: vi.fn() },
    };
    const id = randomUUID();
    const registry = {
      list: vi.fn(async () => ({ backends: [{ id, descriptor }] })),
      register: vi.fn(async () => ({ id, descriptor })),
      configuration: vi.fn(async () => ({
        descriptor,
        configuration: s3BackendConfiguration(descriptor),
      })),
      configurationForSource: vi.fn(async () => ({
        id,
        descriptor,
        configuration: s3BackendConfiguration(descriptor),
      })),
    };
    const plans = {
      list: vi.fn(),
      start: vi.fn(),
      cancel: vi.fn(),
      input: vi.fn(),
      stage: vi.fn(),
      result: vi.fn(),
      migration: vi.fn(async () => ({ backend })),
      recovery: vi.fn(async () => ({ sha256: "a".repeat(64) })),
    };
    const app = buildApp({ auth, backends: registry, plans });
    const headers = {
      cookie: `__Host-lzc-session=${"b".repeat(43)}`,
      origin: auth.origin,
      "x-lzc-csrf": user.csrfToken,
    };
    const ticket = "t".repeat(43);
    try {
      expect((await app.inject("/api/v1/backends")).statusCode).toBe(401);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/backends",
            headers: { ...headers, "x-lzc-csrf": "wrong" },
            payload: { descriptor, credentials },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/backends",
            headers,
            payload: {
              descriptor: { ...descriptor, endpoint: "http://127.0.0.1" },
              credentials,
            },
          })
        ).statusCode,
      ).toBe(400);
      const registered = await app.inject({
        method: "POST",
        url: "/api/v1/backends",
        headers,
        payload: { descriptor, credentials },
      });
      expect(registered.statusCode).toBe(201);
      expect(registered.json()).toEqual({ id, descriptor });
      plans.start.mockRejectedValueOnce(
        new CredentialError(409, "legacy_state_migration_required"),
      );
      const legacy = await app.inject({
        method: "POST",
        url: "/api/v1/plans",
        headers,
        payload: { preparationId: randomUUID(), confirmNewDeployment: true },
      });
      expect(legacy.statusCode).toBe(409);
      expect(legacy.json().action).toContain("Explicitly map and re-encrypt");
      for (const url of [
        "/api/v1/backends",
        `/api/v1/backends/${id}/configuration`,
        `/api/v1/backends?configurationId=${id}`,
      ]) {
        const response = await app.inject({ url, headers });
        expect(response.statusCode).toBe(200);
        expect(response.body).not.toContain("private-");
      }
      expect(registry.configurationForSource).toHaveBeenCalledWith(user, id);
      expect(registry.list).toHaveBeenCalledTimes(1);
      const lookup = await app.inject({
        url: `/api/v1/backends?configurationId=${id}`,
        headers,
      });
      expect(lookup.json()).toEqual({
        id,
        descriptor,
        configuration: s3BackendConfiguration(descriptor),
      });
      for (const query of [
        "configurationId=invalid",
        "configurationId=",
        `configurationId=${id}&stateKey=untrusted`,
      ])
        expect(
          (await app.inject({ url: `/api/v1/backends?${query}`, headers }))
            .statusCode,
        ).toBe(400);
      registry.configurationForSource.mockRejectedValueOnce(
        new CredentialError(404, "backend_not_found"),
      );
      expect(
        (
          await app.inject({
            url: `/api/v1/backends?configurationId=${randomUUID()}`,
            headers,
          })
        ).statusCode,
      ).toBe(404);
      Object.assign(user, { productRoles: ["application-owner"] });
      expect(
        (await app.inject({ url: "/api/v1/backends", headers })).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/runner/migration",
            payload: { phase: "prepare" },
          })
        ).statusCode,
      ).toBe(401);
      for (const payload of [
        { phase: "other" },
        { phase: "complete", stateKey: "untrusted" },
      ])
        expect(
          (
            await app.inject({
              method: "POST",
              url: "/api/runner/migration",
              headers: { authorization: `Bearer ${ticket}` },
              payload,
            })
          ).statusCode,
        ).toBe(400);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/runner/migration",
            headers: { authorization: `Bearer ${ticket}` },
            payload: { phase: "prepare" },
          })
        ).json(),
      ).toEqual({ backend });
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/runner/migration",
            headers: { authorization: `Bearer ${ticket}` },
            payload: { phase: "x".repeat(2048) },
          })
        ).statusCode,
      ).toBe(413);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/runner/recovery",
            headers: { authorization: `Bearer ${ticket}` },
            payload: { data: "Zg==", sha256: "a".repeat(64) },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/runner/recovery",
            headers: { authorization: `Bearer ${ticket}` },
            payload: { data: "Zg==", sha256: "not-a-hash" },
          })
        ).statusCode,
      ).toBe(400);
    } finally {
      await app.close();
    }
  });
});
