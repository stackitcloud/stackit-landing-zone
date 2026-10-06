import { spawnSync } from "node:child_process";
import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  catalogue,
  createDraft,
  readSavedDraft,
  recordValues,
  savedDraft,
  serializeTfvars,
  type Template,
} from "@lzc/domain";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import { newSessionToken } from "../apps/api/src/auth/github-flow.js";
import {
  PostgresAuthStore,
  type Session,
  tokenHash,
} from "../apps/api/src/auth/store.js";
import { Backends, contentHash } from "../apps/api/src/deployments/backends.js";
import {
  Preparations,
  preparationManifest,
} from "../apps/api/src/deployments/preparations.js";
import { ArtifactCrypto } from "../apps/api/src/plans/crypto.js";
import {
  PlatformExecution,
  sha256,
  stableStateKey,
} from "../apps/api/src/plans/execution.js";
import { Plans } from "../apps/api/src/plans/service.js";
import { withTenant } from "../apps/api/src/storage/database.js";
import { migrate } from "../apps/api/src/storage/migrations.js";

const enabled = process.env.LZC_PLAN_DATABASE_TEST === "true";
const container = `lzc-platform-plan-test-${randomUUID()}`;
let admin: pg.Client | undefined;
let migration: pg.Client | undefined;
let pool: pg.Pool;
let identity = 5000;
const summary = {
  schemaVersion: 1,
  execution: "plan-only",
  applyAllowed: false,
  result: "changes",
  resources: {
    unchanged: 0,
    create: 1,
    update: 0,
    delete: 0,
    replace: 0,
    read: 0,
  },
  drift: { unchanged: 0, create: 0, update: 0, delete: 0, replace: 0, read: 0 },
  changedOutputs: 1,
  checks: { pass: 0, fail: 0, error: 0, unknown: 0 },
  destructive: false,
  completeness: "complete",
} as const;
function docker(args: string[]) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    timeout: 120000,
  });
  if (result.status !== 0)
    throw new Error("Isolated platform-plan database command failed");
  return result.stdout.trim();
}

describe.skipIf(!enabled)(
  "isolated PostgreSQL Platform Plan -> Apply broker",
  () => {
    beforeAll(async () => {
      const password = randomBytes(32).toString("base64url");
      docker([
        "run",
        "--detach",
        "--name",
        container,
        "--label",
        "io.stackit.lzc.platform-plan-test=true",
        "--publish",
        "127.0.0.1::5432",
        "--env",
        "POSTGRES_DB=configurator_test",
        "--env",
        `POSTGRES_PASSWORD=${password}`,
        "postgres:17",
      ]);
      const inspection = JSON.parse(docker(["inspect", container]))[0];
      const binding = inspection.NetworkSettings.Ports["5432/tcp"][0];
      if (binding.HostIp !== "127.0.0.1")
        throw new Error("Refusing nonlocal test database");
      const config = {
        host: "127.0.0.1",
        port: Number(binding.HostPort),
        database: "configurator_test",
      };
      for (let attempt = 0; attempt < 60; attempt++) {
        const candidate = new pg.Client({
          ...config,
          user: "postgres",
          password,
        });
        try {
          await candidate.connect();
          admin = candidate;
          break;
        } catch {
          await candidate.end();
          await setTimeout(100);
        }
      }
      if (!admin) throw new Error("Isolated database not ready");
      await admin.query(
        "CREATE ROLE configurator_migration LOGIN PASSWORD 'migration-test-only'; CREATE ROLE configurator_app LOGIN PASSWORD 'runtime-test-only'; ALTER DATABASE configurator_test OWNER TO configurator_migration",
      );
      migration = new pg.Client({
        ...config,
        user: "configurator_migration",
        password: "migration-test-only",
      });
      await migration.connect();
      await migrate(
        migration,
        fileURLToPath(new URL("../apps/api/db/", import.meta.url)),
      );
      await migrate(
        migration,
        fileURLToPath(new URL("../apps/api/db/", import.meta.url)),
      );
      pool = new pg.Pool({
        ...config,
        user: "configurator_app",
        password: "runtime-test-only",
        max: 5,
      });
    }, 120000);
    afterAll(async () => {
      await pool?.end();
      await migration?.end();
      await admin?.end();
      if (enabled) docker(["rm", "--force", "--volumes", container]);
    });

    async function session(): Promise<Session> {
      return new PostgresAuthStore(pool).createSession({
        githubId: ++identity,
        login: `plan-user-${identity}`,
        id: randomUUID(),
        hash: newSessionToken().hash,
        csrfToken: randomBytes(32).toString("base64url"),
        expiresAt: new Date(Date.now() + 3600000),
      });
    }
    async function fixture() {
      const owner = await session();
      const organizationId = randomUUID(),
        configurationId = randomUUID(),
        credentialId = randomUUID(),
        preparationId = randomUUID();
      const draft = createDraft(
        catalogue.templates.find(
          (item) => item.id === "standalone",
        ) as Template,
      );
      draft.organization = organizationId;
      draft.owner = "owner@stackit.cloud";
      for (const project of draft.projects) project.owner = draft.owner;
      for (const sandbox of draft.sandboxes) sandbox.owner = draft.owner;
      const document = savedDraft(configurationId, draft);
      const check = {
        status: "passed" as const,
        code: "organization_readable" as const,
        organizationId,
        organizationName: "Test organization",
        checkedAt: new Date().toISOString(),
      };
      const keyId = randomUUID();
      const manifest = preparationManifest(
        { source: "database", configurationId, revision: 1, credentialId },
        {
          document,
          head: "1",
          tfvars: serializeTfvars(recordValues(document)),
        },
        { check, version: 1, keyId },
      );
      await migration!.query(
        "INSERT INTO lzc.configurations(id,tenant_id,created_by,name,document) VALUES($1,$2,$3,'Plan fixture',$4)",
        [configurationId, owner.tenantId, owner.userId, JSON.stringify(draft)],
      );
      await migration!.query(
        "INSERT INTO lzc.credential_profiles(id,tenant_id,owner_user_id,name,service_account,key_id,state) VALUES($1,$2,$3,'Plan fixture','test@sa.stackit.cloud',$4,'stored')",
        [credentialId, owner.tenantId, owner.userId, keyId],
      );
      await migration!.query(
        "INSERT INTO lzc.deployment_preparations(id,tenant_id,owner_user_id,credential_id,name,manifest) VALUES($1,$2,$3,$4,'Plan fixture',$5)",
        [
          preparationId,
          owner.tenantId,
          owner.userId,
          credentialId,
          JSON.stringify(manifest),
        ],
      );
      const profiles = {
        verifyForPreparation: vi.fn(async () => ({ check, version: 1, keyId })),
      };
      const secrets = {
        get: vi.fn(async () => ({
          version: 1,
          key: {
            credentials: {
              kid: keyId,
              iss: "test@sa.stackit.cloud",
              sub: randomUUID(),
              aud: "https://accounts.stackit.cloud" as const,
              privateKey: "test-only-key-never-executed",
            },
          },
        })),
        put: vi.fn(),
        remove: vi.fn(),
      };
      const repositories = {
        prepareSnapshot: vi.fn(async (): Promise<never> => {
          throw new Error("GitHub must never be called for database source");
        }),
      };
      const token = vi.fn(async () => {
        throw new Error("GitHub token must remain lazy");
      });
      const tickets = new Map<string, string>();
      const sourceDroplet = randomUUID();
      const runner = {
        supportsArtifact: vi.fn(() => true),
        output: vi.fn(
          async (
            _id: string,
            _appId: string | null,
            _saved?: { bytes: Buffer; sha256: string; identity: string },
          ) => ({
            text: "Plan details (sensitive value)",
            truncated: false,
            kind: "saved-plan" as const,
          }),
        ),
        start: vi.fn(
          async (
            id: string,
            ticket: string,
            _origin: string,
            record: (appId: string, sourceDroplet: string) => Promise<void>,
          ) => {
            tickets.set(id, ticket);
            await record(randomUUID(), sourceDroplet);
          },
        ),
        remove: vi.fn(async () => {}),
      };
      const crypto = new ArtifactCrypto(randomBytes(32).toString("base64"));
      const remote = new Map<string, Buffer>();
      const backends = new Backends(
        pool,
        crypto,
        vi.fn(async (_backend, key) => {
          const bytes = remote.get(key);
          return bytes ? { bytes, identity: sha256(bytes) } : null;
        }),
      );
      const execution = new PlatformExecution(crypto, backends);
      const managementState = (state: {
        terraform_version?: string;
        outputs?: object;
        resources?: object[];
        lineage: string;
        serial: number;
        version: number;
      }) => ({
        ...state,
        outputs: {
          ...state.outputs,
          management_bucket_name_tfstate: {
            value: `customer-${configurationId}-tfstate`,
          },
        },
        resources: [
          ...(state.resources ?? []),
          {
            module: "module.management",
            mode: "managed",
            type: "stackit_objectstorage_credential",
            name: "this",
            instances: [
              {
                attributes: {
                  access_key: "test-access",
                  secret_access_key: "test-secret",
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
                  name: `customer-${configurationId}-tfstate`,
                  project_id: "management-project",
                },
              },
            ],
          },
        ],
      });
      const plans = new Plans(
        pool,
        profiles,
        secrets,
        repositories,
        runner,
        "https://configurator.example",
        execution,
        token,
      );
      async function plan(overrides: object = {}) {
        const run = await plans.start(owner, token, preparationId);
        const ticket = tickets.get(run.id)!;
        await plans.input(ticket);
        await plans.stage(ticket, "validating");
        await plans.stage(ticket, "planning");
        const artifact = await plans.artifact(ticket, {
          data: Buffer.from("saved-private-plan").toString("base64"),
          summary: { ...summary, ...overrides },
        });
        await plans.result(ticket, {
          status: "succeeded",
          summary: { ...summary, ...overrides },
          artifactSha256: artifact.sha256,
        });
        return { ...run, artifactSha256: artifact.sha256, ticket };
      }
      const approval = (hash: string) => ({
        artifactSha256: hash,
        organizationId,
        confirmApply: true,
      });
      return {
        owner,
        organizationId,
        configurationId,
        credentialId,
        preparationId,
        manifest,
        plans,
        plan,
        approval,
        profiles,
        secrets,
        repositories,
        token,
        runner,
        tickets,
        execution,
        backends,
        remote,
        managementState,
      };
    }

    it.each(["revoked", "expired"])(
      "never releases credentials for a %s job grant",
      async (reason) => {
        const test = await fixture();
        const grantExpiry = new Date(Date.now() + 1000);
        const owner =
          reason === "expired"
            ? { ...test.owner, expiresAt: grantExpiry }
            : test.owner;
        const run = await test.plans.start(
          owner,
          test.token,
          test.preparationId,
        );
        const ticket = test.tickets.get(run.id);
        if (!ticket) throw new Error("Missing fixture runner ticket");
        if (reason === "revoked") {
          for (const input of [
            {},
            { confirmCredentialGrantRevocation: false },
            {
              confirmCredentialGrantRevocation: true,
              credentialId: test.credentialId,
            },
          ])
            await expect(
              test.plans.revokeCredentialGrant(owner, run.id, input),
            ).rejects.toThrow();
          const receipt = await test.plans.revokeCredentialGrant(
            owner,
            run.id,
            { confirmCredentialGrantRevocation: true },
          );
          expect(
            await test.plans.revokeCredentialGrant(owner, run.id, {
              confirmCredentialGrantRevocation: true,
            }),
          ).toEqual(receipt);
        } else {
          await vi.waitFor(
            () =>
              expect(Date.now()).toBeGreaterThanOrEqual(grantExpiry.getTime()),
            { timeout: 3000 },
          );
        }
        test.secrets.get.mockClear();
        test.profiles.verifyForPreparation.mockClear();
        await expect(test.plans.input(ticket)).rejects.toMatchObject({
          code: "credential_grant_unavailable",
        });
        expect(test.secrets.get).not.toHaveBeenCalled();
        expect(test.profiles.verifyForPreparation).not.toHaveBeenCalled();
      },
    );

    it("binds one immutable credential grant to the approved job and isolates it by tenant and owner", async () => {
      const test = await fixture();
      const saved = await test.plan();
      const grant = await withTenant(
        pool,
        test.owner,
        async (client) =>
          (
            await client.query(
              "SELECT * FROM lzc.plan_credential_grants WHERE run_id=$1",
              [saved.id],
            )
          ).rows[0],
      );
      expect(grant).toMatchObject({
        run_id: saved.id,
        tenant_id: test.owner.tenantId,
        owner_user_id: test.owner.userId,
        preparation_id: test.preparationId,
        organization_id: test.organizationId,
        credential_profile_id: test.credentialId,
        credential_version: 1,
        credential_key_id: test.manifest.credential.keyId,
        operation: "plan",
      });
      expect(grant.consumed_at).toBeInstanceOf(Date);
      expect(grant.expires_at.getTime()).toBeLessThanOrEqual(
        test.owner.expiresAt.getTime(),
      );
      expect(JSON.stringify(grant)).not.toContain(
        "test-only-key-never-executed",
      );
      const other = await session();
      expect(
        await withTenant(
          pool,
          other,
          async (client) =>
            (
              await client.query(
                "SELECT run_id FROM lzc.plan_credential_grants WHERE run_id=$1",
                [saved.id],
              )
            ).rowCount,
        ),
      ).toBe(0);
      await expect(
        test.plans.revokeCredentialGrant(other, saved.id, {
          confirmCredentialGrantRevocation: true,
        }),
      ).rejects.toMatchObject({ code: "credential_grant_not_found" });
      await expect(
        test.plans.revokeCredentialGrant(test.owner, saved.id, {
          confirmCredentialGrantRevocation: true,
        }),
      ).rejects.toMatchObject({ code: "credential_grant_already_consumed" });
      await expect(
        migration!.query(
          "UPDATE lzc.plan_credential_grants SET credential_version=2 WHERE run_id=$1",
          [saved.id],
        ),
      ).rejects.toMatchObject({ code: "55000" });
      await expect(
        migration!.query(
          "UPDATE lzc.plan_credential_grants SET consumed_at=NULL WHERE run_id=$1",
          [saved.id],
        ),
      ).rejects.toMatchObject({ code: "55000" });
      await expect(
        migration!.query(
          "DELETE FROM lzc.plan_credential_grants WHERE run_id=$1",
          [saved.id],
        ),
      ).rejects.toMatchObject({ code: "55000" });
    });

    it("requires origin, CSRF, current tenant and separate confirmation for HTTP credential-grant revocation", async () => {
      const test = await fixture();
      const run = await test.plans.start(
        test.owner,
        test.token,
        test.preparationId,
      );
      const auth = {
        origin: "https://configurator.example",
        clientId: "test",
        store: {
          resolveSession: vi.fn(async () => test.owner),
          beginLogin: vi.fn(),
          consumeLogin: vi.fn(),
          createSession: vi.fn(),
          deleteSession: vi.fn(),
        },
        github: { authorize: vi.fn() },
        tokens: { get: test.token, put: vi.fn(), remove: vi.fn() },
      };
      const app = buildApp({ auth, plans: test.plans });
      const headers = {
        cookie: `__Host-lzc-session=${"b".repeat(43)}`,
        origin: auth.origin,
        "x-lzc-csrf": test.owner.csrfToken,
        "x-lzc-tenant": test.owner.tenantId,
      };
      const path = `/api/v1/plans/${run.id}/credential-grant/revoke`;
      const confirmation = { confirmCredentialGrantRevocation: true };
      try {
        expect(
          (
            await app.inject({
              method: "POST",
              url: path,
              payload: confirmation,
            })
          ).statusCode,
        ).toBe(401);
        expect(
          (
            await app.inject({
              method: "POST",
              url: path,
              headers: { ...headers, origin: "https://attacker.example" },
              payload: confirmation,
            })
          ).statusCode,
        ).toBe(403);
        expect(
          (
            await app.inject({
              method: "POST",
              url: path,
              headers: { ...headers, "x-lzc-csrf": "wrong" },
              payload: confirmation,
            })
          ).statusCode,
        ).toBe(403);
        expect(
          (
            await app.inject({
              method: "POST",
              url: path,
              headers: { ...headers, "x-lzc-tenant": randomUUID() },
              payload: confirmation,
            })
          ).statusCode,
        ).toBe(409);
        for (const payload of [
          {},
          { confirmCredentialGrantRevocation: false },
          { ...confirmation, credentialId: test.credentialId },
        ])
          expect(
            (await app.inject({ method: "POST", url: path, headers, payload }))
              .statusCode,
          ).toBe(400);
        const revoked = await app.inject({
          method: "POST",
          url: path,
          headers,
          payload: confirmation,
        });
        expect(revoked.statusCode).toBe(200);
        expect(revoked.json()).toMatchObject({ runId: run.id });
        const ticket = test.tickets.get(run.id);
        if (!ticket) throw new Error("Missing fixture runner ticket");
        test.secrets.get.mockClear();
        await expect(test.plans.input(ticket)).rejects.toMatchObject({
          code: "credential_grant_unavailable",
        });
        expect(test.secrets.get).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    });

    it("revokes unconsumed grants when the owner cancels the plan", async () => {
      const test = await fixture();
      const run = await test.plans.start(
        test.owner,
        test.token,
        test.preparationId,
      );
      await test.plans.cancel(test.owner, run.id);
      const grant = await withTenant(
        pool,
        test.owner,
        async (client) =>
          (
            await client.query(
              "SELECT revoked_at,consumed_at FROM lzc.plan_credential_grants WHERE run_id=$1",
              [run.id],
            )
          ).rows[0],
      );
      expect(grant.revoked_at).toBeInstanceOf(Date);
      expect(grant.consumed_at).toBeNull();
    });

    it("does not return credentials when a claimed grant expires during technical verification", async () => {
      const test = await fixture();
      const expiry = new Date(Date.now() + 1000);
      const proof = await test.profiles.verifyForPreparation();
      const run = await test.plans.start(
        { ...test.owner, expiresAt: expiry },
        test.token,
        test.preparationId,
      );
      test.profiles.verifyForPreparation.mockImplementationOnce(async () => {
        await vi.waitFor(
          () => expect(Date.now()).toBeGreaterThanOrEqual(expiry.getTime()),
          { timeout: 3000 },
        );
        return proof;
      });
      const ticket = test.tickets.get(run.id);
      if (!ticket) throw new Error("Missing fixture runner ticket");
      await expect(test.plans.input(ticket)).rejects.toMatchObject({
        code: "credential_grant_unavailable",
      });
    });

    it("does not grandfather queued jobs without an explicit credential grant", async () => {
      const test = await fixture();
      const ticket = randomBytes(32).toString("base64url");
      await migration!.query(
        "INSERT INTO lzc.plan_runs(id,tenant_id,owner_user_id,preparation_id,ticket_hash,mode) VALUES($1,$2,$3,$4,$5,'platform-plan')",
        [
          randomUUID(),
          test.owner.tenantId,
          test.owner.userId,
          test.preparationId,
          tokenHash(ticket),
        ],
      );
      test.secrets.get.mockClear();
      test.profiles.verifyForPreparation.mockClear();
      await expect(test.plans.input(ticket)).rejects.toMatchObject({
        code: "credential_grant_unavailable",
      });
      expect(test.secrets.get).not.toHaveBeenCalled();
      expect(test.profiles.verifyForPreparation).not.toHaveBeenCalled();
    });

    it("allows only one concurrent credential-input claim for the same job", async () => {
      const test = await fixture();
      const run = await test.plans.start(
        test.owner,
        test.token,
        test.preparationId,
      );
      await vi.waitFor(async () => {
        const record = await withTenant(
          pool,
          test.owner,
          async (client) =>
            (
              await client.query(
                "SELECT runner_droplet_id FROM lzc.plan_runs WHERE id=$1",
                [run.id],
              )
            ).rows[0],
        );
        expect(record.runner_droplet_id).toBeTruthy();
      });
      const ticket = test.tickets.get(run.id);
      if (!ticket) throw new Error("Missing fixture runner ticket");
      test.secrets.get.mockClear();
      const claims = await Promise.allSettled([
        test.plans.input(ticket),
        test.plans.input(ticket),
      ]);
      expect(
        claims.filter((claim) => claim.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        claims.filter((claim) => claim.status === "rejected"),
      ).toHaveLength(1);
      expect(test.secrets.get).toHaveBeenCalledTimes(1);
    });

    it("blocks an incompatible runner package before Apply dispatch or creation of a recovery job", async () => {
      const test = await fixture();
      const saved = await test.plan();
      test.runner.supportsArtifact.mockReturnValue(false);
      expect(
        (await test.plans.list(test.owner)).find((run) => run.id === saved.id)
          ?.applyAllowed,
      ).toBe(false);
      await expect(
        test.plans.apply(
          test.owner,
          test.token,
          saved.id,
          test.approval(saved.artifactSha256),
        ),
      ).rejects.toMatchObject({ code: "runner_package_changed" });
      expect(test.runner.start).toHaveBeenCalledOnce();
      expect(
        await withTenant(
          pool,
          test.owner,
          async (client) =>
            (
              await client.query(
                "SELECT id FROM lzc.plan_runs WHERE operation='apply'",
              )
            ).rowCount,
        ),
      ).toBe(0);
    });

    it("persists encrypted immutable execution output under the runner ticket and reads it after completion without a live runner", async () => {
      const test = await fixture();
      const saved = await test.plan();
      const run = await test.plans.apply(
        test.owner,
        test.token,
        saved.id,
        test.approval(saved.artifactSha256),
      );
      await vi.waitFor(() => expect(test.tickets.has(run.id)).toBe(true));
      const ticket = test.tickets.get(run.id)!;
      await expect(
        test.plans.recordOutput(ticket, {
          text: "premature",
          truncated: false,
        }),
      ).rejects.toMatchObject({ code: "invalid_runner_transition" });
      await test.plans.input(ticket);
      const text =
        "stackit_project.example: Creation complete\nApply complete! Resources: 1 added, 0 changed, 0 destroyed.";
      await test.plans.recordOutput(ticket, { text, truncated: false });
      const row = await withTenant(
        pool,
        test.owner,
        async (client) =>
          (
            await client.query(
              "SELECT output_ciphertext FROM lzc.plan_runs WHERE id=$1",
              [run.id],
            )
          ).rows[0],
      );
      expect(row.output_ciphertext.toString()).not.toContain(text);
      await expect(
        test.plans.recordOutput(ticket, {
          text: "replacement",
          truncated: false,
        }),
      ).rejects.toMatchObject({ code: "invalid_runner_transition" });
      await test.plans.result(ticket, {
        status: "failed",
        errorCode: "apply_failed",
      });
      expect(await test.plans.output(test.owner, run.id)).toEqual({
        text,
        truncated: false,
        kind: "execution",
      });
      expect(test.runner.output).not.toHaveBeenCalled();
      await expect(
        test.plans.output(await session(), run.id),
      ).rejects.toMatchObject({ code: "plan_not_found" });
      await expect(
        test.plans.recordOutput(ticket, { text, truncated: false }),
      ).rejects.toBeDefined();
    });

    it("shows only an owner's exact decrypted saved plan without dispatching apply or changing its approval", async () => {
      const test = await fixture();
      const saved = await test.plan();
      const before = await withTenant(
        pool,
        test.owner,
        async (client) =>
          (
            await client.query(
              "SELECT status,summary,artifact_sha256,state_version FROM lzc.plan_runs WHERE id=$1",
              [saved.id],
            )
          ).rows[0],
      );
      test.runner.output.mockImplementation(async (id, appId, artifact) => {
        expect(id).toBe(saved.id);
        expect(appId).toBeTruthy();
        expect(artifact?.bytes.toString()).toBe("saved-private-plan");
        expect(artifact?.sha256).toBe(saved.artifactSha256);
        expect(artifact?.identity).toMatch(/^[a-f0-9-]{36}$/);
        return {
          text: "Plan details (sensitive value)",
          truncated: false,
          kind: "saved-plan",
        };
      });
      expect(await test.plans.output(test.owner, saved.id)).toMatchObject({
        text: "Plan details (sensitive value)",
      });
      const other = await session();
      await expect(test.plans.output(other, saved.id)).rejects.toMatchObject({
        code: "plan_not_found",
      });
      await expect(
        test.plans.output(
          { ...other, tenantId: test.owner.tenantId },
          saved.id,
        ),
      ).rejects.toBeDefined();
      expect(test.runner.output).toHaveBeenCalledOnce();
      expect(test.runner.start).toHaveBeenCalledOnce();
      expect(
        await withTenant(
          pool,
          test.owner,
          async (client) =>
            (
              await client.query(
                "SELECT status,summary,artifact_sha256,state_version FROM lzc.plan_runs WHERE id=$1",
                [saved.id],
              )
            ).rows[0],
        ),
      ).toEqual(before);
    });

    it("stores only encrypted immutable binary plans, emits bound backend input and keeps database sources GitHub-free", async () => {
      const test = await fixture();
      const run = await test.plans.start(
        test.owner,
        test.token,
        test.preparationId,
      );
      const ticket = test.tickets.get(run.id)!;
      await expect(
        test.plans.artifact(ticket, { data: "Zg==", summary }),
      ).rejects.toMatchObject({ code: "invalid_runner_transition" });
      const input = await test.plans.input(ticket);
      expect(input).toMatchObject({
        mode: "platform-plan",
        backend: {
          address: "https://configurator.example/api/runner/state",
          username: "runner",
          password: ticket,
        },
      });
      await expect(test.plans.input(ticket)).rejects.toMatchObject({
        status: 401,
      });
      await expect(test.plans.stage(ticket, "applying")).rejects.toMatchObject({
        code: "invalid_runner_transition",
      });
      await test.plans.stage(ticket, "validating");
      await test.plans.stage(ticket, "planning");
      await expect(
        test.plans.artifact(ticket, { data: "Zh==", summary }),
      ).rejects.toMatchObject({ code: "artifact_invalid" });
      const data = Buffer.from("saved-plan-secret-values");
      const artifact = await test.plans.artifact(ticket, {
        data: data.toString("base64"),
        summary,
      });
      await expect(
        test.plans.artifact(ticket, { data: data.toString("base64"), summary }),
      ).rejects.toMatchObject({ code: "artifact_already_saved" });
      const stored = (
        await migration!.query(
          "SELECT ciphertext FROM lzc.plan_artifacts WHERE run_id=$1",
          [run.id],
        )
      ).rows[0];
      expect(stored.ciphertext.includes(data)).toBe(false);
      expect(
        test.execution.crypto.decrypt(
          stored.ciphertext,
          test.owner.tenantId,
          test.owner.userId,
          `artifact:${run.id}`,
        ),
      ).toEqual(data);
      await expect(
        test.plans.result(ticket, {
          status: "succeeded",
          summary,
          artifactSha256: "0".repeat(64),
        }),
      ).rejects.toMatchObject({ code: "artifact_invalid" });
      await test.plans.result(ticket, {
        status: "succeeded",
        summary,
        artifactSha256: artifact.sha256,
      });
      const visible = await test.plans.list(test.owner);
      expect(visible).toContainEqual(
        expect.objectContaining({
          id: run.id,
          operation: "plan",
          applyAllowed: true,
          artifactSha256: artifact.sha256,
        }),
      );
      expect(JSON.stringify(visible)).not.toContain(data.toString());
      expect(test.repositories.prepareSnapshot).not.toHaveBeenCalled();
      expect(test.token).not.toHaveBeenCalled();
    });

    it("requires exact hash, organization, current revision, credential and unexpired complete artifact before any apply dispatch", async () => {
      for (const reason of [
        "hash",
        "organization",
        "revision",
        "document",
        "credential",
        "expired",
        "incomplete",
        "failed-check",
        "unknown-check",
        "state",
      ] as const) {
        const test = await fixture();
        const overrides =
          reason === "incomplete"
            ? { completeness: "incomplete" }
            : reason === "failed-check"
              ? { checks: { pass: 0, fail: 1, error: 0, unknown: 0 } }
              : reason === "unknown-check"
                ? { checks: { pass: 0, fail: 0, error: 0, unknown: 1 } }
                : {};
        const saved = await test.plan(overrides);
        const request = test.approval(
          reason === "hash" ? "0".repeat(64) : saved.artifactSha256,
        );
        if (reason === "organization") request.organizationId = randomUUID();
        if (reason === "revision")
          await migration!.query(
            "UPDATE lzc.configurations SET revision=revision+1 WHERE id=$1",
            [test.configurationId],
          );
        if (reason === "document")
          await migration!.query(
            "UPDATE lzc.configurations SET document=jsonb_set(document,'{name}','\"Changed name\"') WHERE id=$1",
            [test.configurationId],
          );
        if (reason === "credential")
          test.profiles.verifyForPreparation.mockResolvedValue({
            ...(await test.profiles.verifyForPreparation()),
            version: 2,
          });
        if (reason === "expired")
          await migration!.query(
            "UPDATE lzc.plan_artifacts SET expires_at=now()-interval '1 second' WHERE run_id=$1",
            [saved.id],
          );
        if (reason === "state")
          await migration!.query(
            "UPDATE lzc.platform_states SET version=1,ciphertext=$2 WHERE state_key=$1",
            [
              stableStateKey(test.owner, test.manifest),
              Buffer.from("invalid-test-state"),
            ],
          );
        await expect(
          test.plans.apply(test.owner, test.token, saved.id, request),
          reason,
        ).rejects.toBeDefined();
        expect(test.runner.start, reason).toHaveBeenCalledTimes(1);
        expect(
          (await test.plans.list(test.owner))[0].applyAllowed,
          reason,
        ).toBe(reason === "hash" || reason === "organization");
      }
    });

    it("serializes duplicate approvals, consumes a plan once and checks credentials again at runner input", async () => {
      const test = await fixture();
      const saved = await test.plan();
      const results = await Promise.allSettled([
        test.plans.apply(
          test.owner,
          test.token,
          saved.id,
          test.approval(saved.artifactSha256),
        ),
        test.plans.apply(
          test.owner,
          test.token,
          saved.id,
          test.approval(saved.artifactSha256),
        ),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(test.runner.start).toHaveBeenCalledTimes(2);
      const run = results.find(
        (result) => result.status === "fulfilled",
      ) as PromiseFulfilledResult<{ id: string }>;
      expect(
        (await test.plans.list(test.owner)).find((item) => item.id === saved.id)
          .applyAllowed,
      ).toBe(false);
      await expect(
        test.plans.cancel(test.owner, run.value.id),
      ).rejects.toMatchObject({ code: "plan_not_active" });
      test.secrets.get.mockResolvedValue({
        version: 2,
        key: (await test.secrets.get()).key,
      });
      await expect(
        test.plans.input(test.tickets.get(run.value.id)!),
      ).rejects.toMatchObject({ code: "credential_changed" });
      await expect(
        test.plans.apply(
          test.owner,
          test.token,
          saved.id,
          test.approval(saved.artifactSha256),
        ),
      ).rejects.toBeDefined();
    });

    async function failedCheckpoint() {
      const test = await fixture();
      const saved = await test.plan();
      const run = await test.plans.apply(
        test.owner,
        test.token,
        saved.id,
        test.approval(saved.artifactSha256),
      );
      const ticket = test.tickets.get(run.id)!;
      await test.plans.input(ticket);
      await test.plans.stage(ticket, "validating");
      await test.plans.stage(ticket, "applying");
      const state = {
        version: 4,
        serial: 1,
        lineage: randomUUID(),
        outputs: {
          secret: { value: "not-in-checkpoint-response", sensitive: true },
        },
        resources: [
          {
            mode: "managed",
            type: "time_rotating",
            name: "private-name",
            instances: [{ attributes: { secret: "private-key" } }],
          },
        ],
      };
      await test.plans.state(ticket, "lock", undefined, "checkpoint-test");
      await test.plans.state(ticket, "write", state, "checkpoint-test");
      await test.plans.state(ticket, "unlock", undefined, "checkpoint-test");
      await test.plans.result(ticket, {
        status: "failed",
        errorCode: "apply_failed",
      });
      const checkpoint = await test.plans.checkpoint(test.owner, run.id);
      return { ...test, saved, run, checkpoint };
    }

    it.each(["bootstrap", "migration"])(
      "requires owner session, origin, CSRF, current tenant and explicit snapshot confirmation for checkpoint HTTP recovery: %s",
      async (kind) => {
        const test =
          kind === "migration"
            ? await failedMigration()
            : await failedCheckpoint();
        const auth = {
          origin: "https://configurator.example",
          clientId: "test",
          store: {
            resolveSession: vi.fn(async () => test.owner),
            beginLogin: vi.fn(),
            consumeLogin: vi.fn(),
            createSession: vi.fn(),
            deleteSession: vi.fn(),
          },
          github: { authorize: vi.fn() },
          tokens: { get: test.token, put: vi.fn(), remove: vi.fn() },
        };
        const app = buildApp({ auth, plans: test.plans });
        const headers = {
          cookie: `__Host-lzc-session=${"b".repeat(43)}`,
          origin: auth.origin,
          "x-lzc-csrf": test.owner.csrfToken,
          "x-lzc-tenant": test.owner.tenantId,
        };
        const confirmation = {
          ...(kind === "migration"
            ? {
                confirmCompleteMigration: true,
                remoteIdentity: test.checkpoint.migration!.remoteIdentity,
              }
            : { confirmRetainState: true }),
          stateVersion: test.checkpoint.stateVersion,
          checkpointSha256: test.checkpoint.checkpointSha256,
        };
        try {
          for (const action of ["checkpoint", "reconcile"] as const) {
            const url = `/api/v1/plans/${test.run.id}/${action}`;
            const payload = action === "checkpoint" ? {} : confirmation;
            expect(
              (await app.inject({ method: "POST", url, payload })).statusCode,
            ).toBe(401);
            for (const attempt of [
              {
                headers: { ...headers, origin: "https://attacker.example" },
                code: 403,
              },
              { headers: { ...headers, "x-lzc-csrf": "wrong" }, code: 403 },
              {
                headers: { ...headers, "x-lzc-tenant": randomUUID() },
                code: 409,
              },
            ])
              expect(
                (
                  await app.inject({
                    method: "POST",
                    url,
                    headers: attempt.headers,
                    payload,
                  })
                ).statusCode,
              ).toBe(attempt.code);
            expect(
              (
                await app.inject({
                  method: "POST",
                  url,
                  headers,
                  payload: { ...payload, forceUnlock: true },
                })
              ).statusCode,
            ).toBe(400);
            expect(
              (await app.inject({ method: "GET", url, headers })).statusCode,
            ).toBe(404);
          }
          const inspected = await app.inject({
            method: "POST",
            url: `/api/v1/plans/${test.run.id}/checkpoint`,
            headers,
            payload: {},
          });
          expect(inspected.statusCode).toBe(200);
          expect(inspected.headers["cache-control"]).toContain("no-store");
          expect(inspected.json()).toEqual(test.checkpoint);
          expect(inspected.body).not.toMatch(
            /not-in-checkpoint-response|"lineage"\s*:|attributes|outputs/,
          );
          expect(
            (
              await app.inject({
                method: "POST",
                url: `/api/v1/plans/${test.run.id}/reconcile`,
                headers,
                payload: {},
              })
            ).statusCode,
          ).toBe(400);
          const reconciled = await app.inject({
            method: "POST",
            url: `/api/v1/plans/${test.run.id}/reconcile`,
            headers,
            payload: confirmation,
          });
          expect(reconciled.statusCode).toBe(200);
          expect(reconciled.json()).toEqual({
            id: test.run.id,
            reconciled: true,
          });
          expect(reconciled.headers["cache-control"]).toContain("no-store");
        } finally {
          await app.close();
        }
      },
    );

    async function failedMigration() {
      const test = await fixture();
      const saved = await test.plan();
      const run = await test.plans.apply(
        test.owner,
        test.token,
        saved.id,
        test.approval(saved.artifactSha256),
      );
      const ticket = test.tickets.get(run.id)!;
      await test.plans.input(ticket);
      await test.plans.stage(ticket, "validating");
      await test.plans.stage(ticket, "applying");
      const state = {
        ...test.managementState({
          version: 4,
          terraform_version: "1.12.6",
          serial: 3,
          lineage: randomUUID(),
          outputs: {},
          resources: [],
        }),
        check_results: [
          {
            object_kind: "var",
            config_addr: "var.first",
            status: "pass",
            objects: [{ object_addr: "var.first", status: "pass" }],
          },
          {
            object_kind: "var",
            config_addr: "var.second",
            status: "pass",
            objects: [{ object_addr: "var.second", status: "pass" }],
          },
        ],
      };
      await test.plans.state(ticket, "lock", undefined, "migration-review");
      await test.plans.state(ticket, "write", state, "migration-review");
      await test.plans.state(ticket, "unlock", undefined, "migration-review");
      await test.plans.migration(ticket, { phase: "prepare" });
      test.remote.set(
        "terraform.tfstate",
        Buffer.from(
          JSON.stringify({
            ...state,
            lineage: randomUUID(),
            serial: 1,
            check_results: [...state.check_results].reverse(),
          }),
        ),
      );
      await test.plans.result(ticket, {
        status: "failed",
        errorCode: "state_failed",
      });
      const checkpoint = await test.plans.checkpoint(test.owner, run.id);
      return { ...test, saved, run, ticket, state, checkpoint };
    }

    it("completes only explicitly reviewed S3 migration recovery without replaying Apply or changing remote data", async () => {
      const test = await failedMigration();
      expect(test.checkpoint.canResume).toBe(false);
      expect(test.checkpoint.migration).toMatchObject({
        serial: 1,
        lineagePreserved: false,
      });
      const input = {
        confirmCompleteMigration: true,
        stateVersion: test.checkpoint.stateVersion,
        checkpointSha256: test.checkpoint.checkpointSha256,
        remoteIdentity: test.checkpoint.migration!.remoteIdentity,
      };
      await expect(
        test.plans.reconcile(await session(), test.run.id, input),
      ).rejects.toMatchObject({ code: "plan_not_found" });
      await expect(
        test.plans.reconcile(test.owner, test.run.id, {
          ...input,
          confirmCompleteMigration: false,
        }),
      ).rejects.toThrow();
      await expect(
        test.plans.reconcile(test.owner, test.run.id, {
          ...input,
          remoteIdentity: "changed",
        }),
      ).rejects.toMatchObject({ code: "checkpoint_changed" });
      const starts = test.runner.start.mock.calls.length;
      const secretReads = test.secrets.get.mock.calls.length;
      const remoteBefore = [...test.remote];
      const results = await Promise.all([
        test.plans.reconcile(test.owner, test.run.id, input),
        test.plans.reconcile(test.owner, test.run.id, input),
      ]);
      expect(results).toEqual([
        { id: test.run.id, reconciled: true },
        { id: test.run.id, reconciled: true },
      ]);
      expect(test.runner.start.mock.calls).toHaveLength(starts);
      expect(test.secrets.get.mock.calls).toHaveLength(secretReads);
      expect([...test.remote]).toEqual(remoteBefore);
      const key = stableStateKey(test.owner, test.manifest);
      const state = (
        await migration!.query(
          "SELECT * FROM lzc.platform_states WHERE state_key=$1",
          [key],
        )
      ).rows[0];
      expect(state.backend_id).not.toBeNull();
      expect(state.ciphertext).toBeNull();
      expect(state.lock_run_id).toBeNull();
      expect(
        (
          await migration!.query(
            "SELECT status,error_code FROM lzc.plan_runs WHERE id=$1",
            [test.run.id],
          )
        ).rows[0],
      ).toEqual({ status: "succeeded", error_code: null });
      expect(
        (
          await migration!.query(
            "SELECT count(*)::integer AS count FROM lzc.platform_reconciliations WHERE run_id=$1",
            [test.run.id],
          )
        ).rows[0].count,
      ).toBe(1);
      await expect(
        test.plans.apply(
          test.owner,
          test.token,
          test.saved.id,
          test.approval(test.saved.artifactSha256),
        ),
      ).rejects.toMatchObject({ code: "plan_not_approvable" });
    });

    it.each([
      "locked",
      "changed-content",
      "remote-changed",
      "snapshot",
      "ambiguous",
      "separate-recovery",
    ])(
      "preserves migration recovery when the reviewed proof is invalid: %s",
      async (reason) => {
        const test = await failedMigration();
        const key = stableStateKey(test.owner, test.manifest);
        const input = {
          confirmCompleteMigration: true,
          stateVersion: test.checkpoint.stateVersion,
          checkpointSha256: test.checkpoint.checkpointSha256,
          remoteIdentity: test.checkpoint.migration!.remoteIdentity,
        };
        if (reason === "locked")
          await migration!.query(
            "UPDATE lzc.platform_states SET lock_run_id=$2,lock_id='held' WHERE state_key=$1",
            [key, test.run.id],
          );
        if (reason === "changed-content")
          test.remote.set(
            "terraform.tfstate",
            Buffer.from(
              JSON.stringify({
                ...test.state,
                serial: 1,
                lineage: randomUUID(),
                outputs: {},
              }),
            ),
          );
        if (reason === "remote-changed")
          test.remote.set(
            "terraform.tfstate",
            Buffer.from(
              JSON.stringify({
                ...test.state,
                serial: 1,
                lineage: randomUUID(),
              }),
            ),
          );
        if (reason === "snapshot") input.checkpointSha256 = "0".repeat(64);
        if (reason === "ambiguous")
          await migration!.query(
            "UPDATE lzc.plan_runs SET error_code='timed_out' WHERE id=$1",
            [test.run.id],
          );
        if (reason === "separate-recovery")
          await migration!.query(
            "INSERT INTO lzc.state_recoveries(run_id,tenant_id,state_key,sha256,ciphertext) SELECT $1,tenant_id,state_key,$2,ciphertext FROM lzc.platform_states WHERE state_key=$3",
            [test.run.id, input.checkpointSha256, key],
          );
        await expect(
          test.plans.reconcile(test.owner, test.run.id, input),
        ).rejects.toBeDefined();
        const state = (
          await migration!.query(
            "SELECT backend_id,ciphertext FROM lzc.platform_states WHERE state_key=$1",
            [key],
          )
        ).rows[0];
        expect(state.backend_id).toBeNull();
        expect(state.ciphertext).not.toBeNull();
        expect(
          (
            await migration!.query(
              "SELECT status FROM lzc.plan_runs WHERE id=$1",
              [test.run.id],
            )
          ).rows[0].status,
        ).toBe("recovery_required");
        expect(
          (
            await migration!.query(
              "SELECT count(*)::integer AS count FROM lzc.platform_reconciliations WHERE run_id=$1",
              [test.run.id],
            )
          ).rows[0].count,
        ).toBe(0);
      },
    );

    it("reconciles only explicitly reviewed checkpoints once and preserves state for a corrected fresh plan", async () => {
      const test = await failedCheckpoint();
      expect(test.checkpoint.canResume).toBe(true);
      const input = {
        confirmRetainState: true,
        stateVersion: test.checkpoint.stateVersion,
        checkpointSha256: test.checkpoint.checkpointSha256,
      };
      await expect(
        test.plans.checkpoint(await session(), test.run.id),
      ).rejects.toBeDefined();
      await expect(
        test.plans.reconcile(test.owner, test.run.id, {
          ...input,
          confirmRetainState: false,
        }),
      ).rejects.toBeDefined();
      await expect(
        test.plans.reconcile(test.owner, test.run.id, {
          ...input,
          checkpointSha256: "0".repeat(64),
        }),
      ).rejects.toMatchObject({ code: "checkpoint_changed" });
      const key = stableStateKey(test.owner, test.manifest);
      const before = (
        await migration!.query(
          "SELECT version,ciphertext,lock_run_id FROM lzc.platform_states WHERE state_key=$1",
          [key],
        )
      ).rows[0];
      const starts = test.runner.start.mock.calls.length;
      const secrets = test.secrets.get.mock.calls.length;
      expect(
        await Promise.all([
          test.plans.reconcile(test.owner, test.run.id, input),
          test.plans.reconcile(test.owner, test.run.id, input),
        ]),
      ).toEqual([
        { id: test.run.id, reconciled: true },
        { id: test.run.id, reconciled: true },
      ]);
      expect(test.runner.start).toHaveBeenCalledTimes(starts);
      expect(test.secrets.get).toHaveBeenCalledTimes(secrets);
      expect(
        (
          await migration!.query(
            "SELECT version,ciphertext,lock_run_id FROM lzc.platform_states WHERE state_key=$1",
            [key],
          )
        ).rows[0],
      ).toEqual(before);
      expect(
        (
          await migration!.query(
            "SELECT count(*)::int AS count FROM lzc.platform_reconciliations WHERE run_id=$1",
            [test.run.id],
          )
        ).rows[0].count,
      ).toBe(1);
      await expect(
        migration!.query(
          "DELETE FROM lzc.platform_reconciliations WHERE run_id=$1",
          [test.run.id],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        test.plans.apply(
          test.owner,
          test.token,
          test.saved.id,
          test.approval(test.saved.artifactSha256),
        ),
      ).rejects.toBeDefined();
      const original = readSavedDraft(test.manifest.configuration);
      const corrected = {
        ...original,
        draft: { ...original.draft, name: "Corrected configuration" },
      };
      const preparationId = randomUUID();
      const manifest = preparationManifest(
        {
          source: "database",
          configurationId: test.configurationId,
          revision: 2,
          credentialId: test.credentialId,
        },
        {
          document: corrected,
          head: "2",
          tfvars: serializeTfvars(recordValues(corrected)),
        },
        {
          check: test.manifest.check,
          version: test.manifest.credential.secretVersion,
          keyId: test.manifest.credential.keyId,
        },
      );
      await migration!.query(
        "UPDATE lzc.configurations SET revision=2,document=$2 WHERE id=$1",
        [test.configurationId, JSON.stringify(corrected.draft)],
      );
      await migration!.query(
        "INSERT INTO lzc.deployment_preparations(id,tenant_id,owner_user_id,credential_id,name,manifest) VALUES($1,$2,$3,$4,'Corrected preparation',$5)",
        [
          preparationId,
          test.owner.tenantId,
          test.owner.userId,
          test.credentialId,
          JSON.stringify(manifest),
        ],
      );
      const fresh = await test.plans.start(
        test.owner,
        test.token,
        preparationId,
      );
      expect(fresh.id).not.toBe(test.saved.id);
      expect(
        (
          await migration!.query(
            "SELECT state_version FROM lzc.plan_runs WHERE id=$1",
            [fresh.id],
          )
        ).rows[0].state_version,
      ).toBe("1");
    });

    it("refuses reconciliation of locked, ambiguous, changed or separately recovered checkpoints", async () => {
      for (const reason of ["lock", "uncertain", "changed", "recovery"]) {
        const test = await failedCheckpoint();
        const key = stableStateKey(test.owner, test.manifest);
        if (reason === "lock")
          await migration!.query(
            "UPDATE lzc.platform_states SET lock_run_id=$2,lock_id='held' WHERE state_key=$1",
            [key, test.run.id],
          );
        if (reason === "uncertain")
          await migration!.query(
            "UPDATE lzc.plan_runs SET error_code='timed_out' WHERE id=$1",
            [test.run.id],
          );
        if (reason === "changed")
          await migration!.query(
            "UPDATE lzc.platform_states SET version=version+1 WHERE state_key=$1",
            [key],
          );
        if (reason === "recovery")
          await migration!.query(
            "INSERT INTO lzc.state_recoveries(run_id,tenant_id,state_key,sha256,ciphertext) SELECT $1,tenant_id,state_key,$2,ciphertext FROM lzc.platform_states WHERE state_key=$3",
            [test.run.id, test.checkpoint.checkpointSha256, key],
          );
        await expect(
          test.plans.reconcile(test.owner, test.run.id, {
            confirmRetainState: true,
            stateVersion: test.checkpoint.stateVersion,
            checkpointSha256: test.checkpoint.checkpointSha256,
          }),
        ).rejects.toBeDefined();
        expect(
          (
            await migration!.query(
              "SELECT status FROM lzc.plan_runs WHERE id=$1",
              [test.run.id],
            )
          ).rows[0].status,
        ).toBe("recovery_required");
      }
    });

    it("enforces plan-readonly, own persistent locks, version checks and preserves encrypted state after failed apply", async () => {
      const test = await fixture();
      const saved = await test.plan();
      const run = await test.plans.apply(
        test.owner,
        test.token,
        saved.id,
        test.approval(saved.artifactSha256),
      );
      const ticket = test.tickets.get(run.id)!;
      const input = await test.plans.input(ticket);
      expect(input).toMatchObject({
        mode: "platform-apply",
        plan: {
          data: Buffer.from("saved-private-plan").toString("base64"),
          sha256: saved.artifactSha256,
        },
      });
      await test.plans.stage(ticket, "validating");
      await expect(test.plans.stage(ticket, "planning")).rejects.toMatchObject({
        code: "invalid_runner_transition",
      });
      await test.plans.stage(ticket, "applying");
      const state = {
        version: 4,
        serial: 1,
        lineage: randomUUID(),
        outputs: { secret: { value: "private-state-secret" } },
        resources: [
          {
            mode: "managed",
            type: "time_rotating",
            name: "private-resource-name",
            instances: [{ attributes: { secret: "private-attribute-secret" } }],
          },
        ],
      };
      await expect(
        test.plans.state(ticket, "write", state, "lock"),
      ).rejects.toMatchObject({ code: "state_write_forbidden" });
      await test.plans.state(ticket, "lock", undefined, "lock");
      await expect(
        test.plans.state(ticket, "unlock", undefined, "other"),
      ).rejects.toMatchObject({ code: "state_locked" });
      await test.plans.state(ticket, "write", state, "lock");
      expect(await test.plans.state(ticket, "read")).toEqual(state);
      const persisted = (
        await migration!.query(
          "SELECT * FROM lzc.platform_states WHERE state_key=$1",
          [stableStateKey(test.owner, test.manifest)],
        )
      ).rows[0];
      expect(
        persisted.ciphertext.includes(Buffer.from("private-state-secret")),
      ).toBe(false);
      await test.plans.result(ticket, {
        status: "failed",
        errorCode: "state_failed",
      });
      expect(
        (await test.plans.list(test.owner)).find((item) => item.id === run.id)
          .status,
      ).toBe("recovery_required");
      const checkpoint = await test.plans.checkpoint(test.owner, run.id);
      expect(checkpoint).toMatchObject({
        stateVersion: "1",
        serial: 1,
        lockHeld: true,
        pendingMigration: false,
        recoveryAvailable: false,
        canResume: false,
        resources: [
          {
            mode: "managed",
            type: "time_rotating",
            instances: 1,
            deposedInstances: 0,
          },
        ],
      });
      expect(JSON.stringify(checkpoint)).not.toMatch(
        /private-state-secret|private-resource-name|private-attribute-secret|lineage|attributes|outputs/,
      );
      expect(
        (
          await migration!.query(
            "SELECT lock_run_id,ciphertext FROM lzc.platform_states WHERE state_key=$1",
            [persisted.state_key],
          )
        ).rows[0],
      ).toEqual({ lock_run_id: run.id, ciphertext: persisted.ciphertext });
      await expect(
        test.plans.outputs(test.owner, run.id),
      ).rejects.toMatchObject({ code: "apply_not_succeeded" });
      await expect(
        test.plans.start(test.owner, test.token, test.preparationId),
      ).rejects.toMatchObject({ code: "plan_already_running" });
      await migration!.query(
        "UPDATE lzc.plan_runs SET finished_at=now()-interval '1 minute',expires_at=now()-interval '1 minute' WHERE id=$1",
        [run.id],
      );
      await test.plans.maintain();
      expect(test.runner.remove).not.toHaveBeenCalledWith(
        run.id,
        expect.anything(),
      );
    });

    it("rejects plan writes and conflicting lock owners or stale server versions", async () => {
      const test = await fixture();
      const first = await test.plans.start(
        test.owner,
        test.token,
        test.preparationId,
      );
      const ticket = test.tickets.get(first.id)!;
      await test.plans.input(ticket);
      await test.plans.state(ticket, "lock", undefined, "plan-lock");
      await expect(
        test.plans.state(
          ticket,
          "write",
          { version: 4, serial: 0, lineage: randomUUID() },
          "plan-lock",
        ),
      ).rejects.toMatchObject({ code: "state_write_forbidden" });
      const run = (
        await migration!.query("SELECT * FROM lzc.plan_runs WHERE id=$1", [
          first.id,
        ])
      ).rows[0];
      await expect(
        withTenant(pool, test.owner, (client) =>
          test.execution.state(
            client,
            test.owner,
            { ...run, id: randomUUID() },
            "lock",
            undefined,
            "other",
          ),
        ),
      ).rejects.toMatchObject({ code: "state_locked" });
      await test.plans.state(ticket, "unlock", undefined, "plan-lock");
      await migration!.query(
        "UPDATE lzc.platform_states SET version=1,ciphertext=$2 WHERE state_key=$1",
        [
          run.state_key,
          test.execution.crypto.encrypt(
            Buffer.from("{}"),
            test.owner.tenantId,
            test.owner.userId,
            `state:${run.state_key}`,
          ),
        ],
      );
      await expect(
        test.plans.state(ticket, "lock", undefined, "stale"),
      ).rejects.toMatchObject({ code: "state_changed" });
    });

    it("uses current database roles, owner and tenant isolation, including organisation PlatformEngineer", async () => {
      const test = await fixture();
      const saved = await test.plan();
      const other = await session();
      for (const stranger of [
        other,
        { ...other, tenantId: test.owner.tenantId },
        { ...test.owner, tenantId: other.tenantId },
      ]) {
        await expect(
          test.plans.apply(
            stranger,
            test.token,
            saved.id,
            test.approval(saved.artifactSha256),
          ),
        ).rejects.toMatchObject({ code: "plan_not_found" });
        expect(await test.plans.list(stranger)).toEqual([]);
      }
      await migration!.query(
        "UPDATE lzc.memberships SET role='viewer' WHERE tenant_id=$1 AND user_id=$2",
        [test.owner.tenantId, test.owner.userId],
      );
      await expect(
        test.plans.apply(
          test.owner,
          test.token,
          saved.id,
          test.approval(saved.artifactSha256),
        ),
      ).rejects.toMatchObject({ code: "plan_not_found" });
      await migration!.query(
        "UPDATE lzc.memberships SET role='deployer' WHERE tenant_id=$1 AND user_id=$2",
        [test.owner.tenantId, test.owner.userId],
      );
      expect((await test.plans.list(test.owner))[0].applyAllowed).toBe(true);
      await migration!.query(
        "UPDATE lzc.tenants SET kind='organisation',owner_user_id=NULL,organization_id=$2 WHERE id=$1",
        [test.owner.tenantId, test.organizationId],
      );
      await migration!.query(
        "UPDATE lzc.memberships SET role='admin',product_roles=ARRAY['application-owner'] WHERE tenant_id=$1 AND user_id=$2",
        [test.owner.tenantId, test.owner.userId],
      );
      await expect(
        test.plans.apply(
          test.owner,
          test.token,
          saved.id,
          test.approval(saved.artifactSha256),
        ),
      ).rejects.toMatchObject({ code: "plan_not_found" });
      await migration!.query(
        "UPDATE lzc.memberships SET role='viewer',product_roles=ARRAY['platform-engineer'] WHERE tenant_id=$1 AND user_id=$2",
        [test.owner.tenantId, test.owner.userId],
      );
      expect((await test.plans.list(test.owner))[0].applyAllowed).toBe(true);
      await test.plans.apply(
        test.owner,
        test.token,
        saved.id,
        test.approval(saved.artifactSha256),
      );
      expect(test.runner.start).toHaveBeenCalledTimes(2);
    });

    it("authenticates HTTP backend tickets, applies strict CSRF approval and exports only a validated platform contract", async () => {
      const test = await fixture();
      const saved = await test.plan();
      const auth = {
        origin: "https://configurator.example",
        clientId: "test",
        store: {
          resolveSession: vi.fn(async () => test.owner),
          beginLogin: vi.fn(),
          consumeLogin: vi.fn(),
          createSession: vi.fn(),
          deleteSession: vi.fn(),
        },
        github: { authorize: vi.fn() },
        tokens: { get: test.token, put: vi.fn(), remove: vi.fn() },
      };
      const app = buildApp({ auth, plans: test.plans });
      const headers = {
        cookie: `__Host-lzc-session=${"b".repeat(43)}`,
        origin: auth.origin,
        "x-lzc-csrf": test.owner.csrfToken,
      };
      const path = `/api/v1/plans/${saved.id}/apply`;
      try {
        expect(
          (
            await app.inject({
              method: "POST",
              url: path,
              payload: test.approval(saved.artifactSha256),
            })
          ).statusCode,
        ).toBe(401);
        expect(
          (
            await app.inject({
              method: "POST",
              url: path,
              headers: { ...headers, "x-lzc-csrf": "wrong" },
              payload: test.approval(saved.artifactSha256),
            })
          ).statusCode,
        ).toBe(403);
        for (const payload of [
          { ...test.approval(saved.artifactSha256), confirmApply: false },
          {
            ...test.approval(saved.artifactSha256),
            organizationId: "not-a-uuid",
          },
          { ...test.approval(saved.artifactSha256), stateKey: "untrusted" },
        ])
          expect(
            (await app.inject({ method: "POST", url: path, headers, payload }))
              .statusCode,
          ).toBe(400);
        expect(test.runner.start).toHaveBeenCalledTimes(1);
        const response = await app.inject({
          method: "POST",
          url: path,
          headers,
          payload: test.approval(saved.artifactSha256),
        });
        expect(response.statusCode).toBe(202);
        const run = response.json();
        const ticket = test.tickets.get(run.id)!;
        const backend = {
          authorization: `Basic ${Buffer.from(`runner:${ticket}`).toString("base64")}`,
        };
        expect(
          (await app.inject({ url: "/api/runner/state", headers: backend }))
            .statusCode,
        ).toBe(409);
        await test.plans.input(ticket);
        await test.plans.stage(ticket, "validating");
        await test.plans.stage(ticket, "applying");
        expect(
          (
            await app.inject({
              url: "/api/runner/state",
              headers: { authorization: `Bearer ${ticket}` },
            })
          ).statusCode,
        ).toBe(401);
        expect(
          (await app.inject({ url: "/api/runner/state", headers: backend }))
            .statusCode,
        ).toBe(404);
        expect(
          (
            await app.inject({
              method: "POST",
              url: "/api/runner/state/lock",
              headers: backend,
              payload: {
                ID: "http-lock",
                Operation: "OperationTypeApply",
                Who: "private",
              },
            })
          ).statusCode,
        ).toBe(200);
        const contract = {
          schema_version: 1,
          tenant_id: test.owner.tenantId,
          revision: randomUUID(),
          organization_id: test.organizationId,
          targets: {
            public: {
              folder_id: randomUUID(),
              region: "eu01",
              corporate: false,
              network_area_id: null,
              firewall_next_hop_ip: null,
              ipv4_nameservers: null,
            },
          },
        };
        const state = test.managementState({
          version: 4,
          serial: 1,
          lineage: randomUUID(),
          outputs: {
            application_platform_contract: { value: contract },
            private: { value: "do-not-publish" },
          },
          resources: [{ private: "do-not-publish" }],
        });
        expect(
          (
            await app.inject({
              method: "POST",
              url: "/api/runner/state?ID=http-lock",
              headers: backend,
              payload: state,
            })
          ).statusCode,
        ).toBe(200);
        expect(
          (
            await app.inject({
              method: "POST",
              url: "/api/runner/state/unlock",
              headers: backend,
              payload: { ID: "http-lock" },
            })
          ).statusCode,
        ).toBe(200);
        await expect(
          test.plans.result(ticket, { status: "succeeded" }),
        ).rejects.toMatchObject({ code: "state_failed" });
        await test.plans.migration(ticket, { phase: "prepare" });
        test.remote.set(
          "terraform.tfstate",
          Buffer.from(JSON.stringify(state)),
        );
        await test.plans.migration(ticket, { phase: "complete" });
        await test.plans.result(ticket, { status: "succeeded" });
        const output = await app.inject({
          url: `/api/v1/plans/${run.id}/outputs`,
          headers,
        });
        expect(output.statusCode).toBe(200);
        expect(output.json()).toEqual({
          applicationPlatformContract: contract,
        });
        expect(output.body).not.toContain("do-not-publish");
        const stateKey = stableStateKey(test.owner, test.manifest);
        for (const unsafe of [
          { ...contract, secret: "do-not-publish" },
          { ...contract, tenant_id: randomUUID() },
          {
            ...contract,
            targets: {
              public: {
                ...contract.targets.public,
                ipv4_nameservers: ["do-not-publish"],
              },
            },
          },
          undefined,
        ]) {
          const malformed = {
            ...state,
            outputs: { application_platform_contract: { value: unsafe } },
          };
          const bytes = Buffer.from(JSON.stringify(malformed));
          test.remote.set("terraform.tfstate", bytes);
          await migration!.query(
            "UPDATE lzc.platform_states SET remote_identity=$2 WHERE state_key=$1",
            [stateKey, sha256(bytes)],
          );
          const rejected = await app.inject({
            url: `/api/v1/plans/${run.id}/outputs`,
            headers,
          });
          expect(rejected.statusCode).toBe(409);
          expect(rejected.body).not.toContain("do-not-publish");
        }
        await migration!.query(
          "UPDATE lzc.platform_states SET version=version+1 WHERE state_key=$1",
          [stateKey],
        );
        await expect(
          test.plans.outputs(test.owner, run.id),
        ).rejects.toMatchObject({ code: "platform_contract_unavailable" });
        expect(
          (await app.inject({ url: "/api/runner/state", headers: backend }))
            .statusCode,
        ).toBe(401);
        expect(test.token).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    });

    it("registers encrypted customer backends, reuses imported state and invalidates approvals after CLI state changes", async () => {
      const test = await fixture();
      const descriptor = {
        bucket: `customer-${test.configurationId}-tfstate`,
        endpoint: "https://object.storage.eu01.onstackit.cloud",
        region: "eu01",
        key: "terraform.tfstate",
        useLockfile: true,
      } as const;
      const credentials = {
        accessKeyId: "private-access",
        secretAccessKey: "private-secret",
      };
      const registered = await test.backends.register(test.owner, {
        descriptor,
        credentials,
      });
      const bytes = Buffer.from(
        JSON.stringify({
          version: 4,
          serial: 99,
          lineage: randomUUID(),
          outputs: {},
          resources: [],
        }),
      );
      test.remote.set("terraform.tfstate", bytes);
      const manifest = {
        ...test.manifest,
        backend: {
          ...registered,
          stateIdentity: stableStateKey(test.owner, test.manifest),
        },
      };
      await migration!.query(
        "UPDATE lzc.deployment_preparations SET manifest=$2 WHERE id=$1",
        [test.preparationId, JSON.stringify(manifest)],
      );
      const saved = await test.plan();
      const stored = (
        await migration!.query("SELECT * FROM lzc.state_backends WHERE id=$1", [
          registered.id,
        ])
      ).rows[0];
      expect(
        stored.credentials_ciphertext.includes(
          Buffer.from(credentials.secretAccessKey),
        ),
      ).toBe(false);
      expect(await test.backends.list(test.owner)).toEqual({
        backends: [registered],
      });
      const cli = await test.backends.configuration(test.owner, registered.id);
      expect(cli.descriptor).toEqual(descriptor);
      expect(cli.configuration).not.toContain("private-");
      const state = (
        await migration!.query(
          "SELECT * FROM lzc.platform_states WHERE state_key=$1",
          [manifest.backend.stateIdentity],
        )
      ).rows[0];
      expect(state.ciphertext).toBeNull();
      expect(state.remote_identity).toBe(sha256(bytes));
      expect(
        JSON.parse(test.remote.get("terraform.tfstate")!.toString()).serial,
      ).toBe(99);
      test.remote.set(
        "terraform.tfstate",
        Buffer.from(
          JSON.stringify({ ...JSON.parse(bytes.toString()), serial: 100 }),
        ),
      );
      await expect(
        test.plans.apply(
          test.owner,
          test.token,
          saved.id,
          test.approval(saved.artifactSha256),
        ),
      ).rejects.toMatchObject({ code: "state_changed" });
      expect((await test.plans.list(test.owner))[0].applyAllowed).toBe(false);
      expect(test.runner.start).toHaveBeenCalledTimes(1);
      const preparations = new Preparations(
        pool,
        test.repositories,
        test.profiles,
      );
      const next = await preparations.create(test.owner, null, {
        source: "database",
        configurationId: test.configurationId,
        revision: 1,
        credentialId: test.credentialId,
      });
      const nextManifest = (await preparations.list(test.owner)).find(
        (item) => item.id === next.id,
      )!.manifest;
      expect(nextManifest.backend).toEqual(manifest.backend);
      expect(JSON.stringify(nextManifest)).not.toContain(
        credentials.secretAccessKey,
      );
      await expect(
        preparations.create(test.owner, null, {
          source: "database",
          configurationId: test.configurationId,
          revision: 1,
          credentialId: test.credentialId,
          backendId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "backend_binding_changed" });
    });

    it("binds a new GitHub configuration ID to the existing physical backend without resetting state", async () => {
      const test = await fixture();
      const descriptor = {
        bucket: `customer-${test.configurationId}-tfstate`,
        endpoint: "https://object.storage.eu01.onstackit.cloud",
        region: "eu01",
        key: "terraform.tfstate",
        useLockfile: true,
      } as const;
      const registered = await test.backends.register(test.owner, {
        descriptor,
        credentials: {
          accessKeyId: "alias-access",
          secretAccessKey: "alias-secret",
        },
      });
      const source = {
        version: 4,
        serial: 41,
        lineage: randomUUID(),
        outputs: {},
        resources: [],
      };
      const bytes = Buffer.from(JSON.stringify(source));
      test.remote.set("terraform.tfstate", bytes);
      const preparations = new Preparations(
        pool,
        test.repositories,
        test.profiles,
      );
      const initial = await preparations.create(test.owner, null, {
        source: "database",
        configurationId: test.configurationId,
        revision: 1,
        credentialId: test.credentialId,
        backendId: registered.id,
      });
      const initialManifest = (await preparations.list(test.owner)).find(
        (item) => item.id === initial.id,
      )!.manifest;
      const first = await withTenant(pool, test.owner, (client) =>
        test.execution.capture(client, test.owner, initialManifest),
      );
      const githubId = randomUUID();
      const document = { ...test.manifest.configuration, id: githubId };
      const snapshot = {
        document,
        head: "b".repeat(40),
        tfvars: serializeTfvars(recordValues(document)),
      };
      const repositories = { prepareSnapshot: vi.fn(async () => snapshot) };
      const exported = new Preparations(pool, repositories, test.profiles);
      const input = {
        target: { id: 77, owner: "customer", name: "fork" },
        configurationId: githubId,
        head: snapshot.head,
        credentialId: test.credentialId,
      };
      const attached = await exported.create(test.owner, "test-token", {
        ...input,
        backendId: registered.id,
      });
      const attachedManifest = (await exported.list(test.owner)).find(
        (item) => item.id === attached.id,
      )!.manifest;
      expect(attachedManifest.backend).toEqual({
        ...registered,
        stateIdentity: first.key,
      });
      expect(first.key).not.toBe(stableStateKey(test.owner, attachedManifest));
      expect(
        await withTenant(pool, test.owner, (client) =>
          test.execution.capture(client, test.owner, attachedManifest),
        ),
      ).toEqual(first);
      const automatic = await exported.create(test.owner, "test-token", input);
      const automaticManifest = (await exported.list(test.owner)).find(
        (item) => item.id === automatic.id,
      )!.manifest;
      expect(automaticManifest.backend).toEqual(attachedManifest.backend);
      expect(
        await withTenant(pool, test.owner, (client) =>
          test.execution.capture(client, test.owner, automaticManifest),
        ),
      ).toEqual(first);
      const lookup = await test.backends.configurationForSource(
        test.owner,
        githubId,
      );
      const plans = new Plans(
        pool,
        test.profiles,
        test.secrets,
        repositories,
        test.runner,
        "https://configurator.example",
        test.execution,
        async () => "test-token",
      );
      const run = await plans.start(test.owner, "test-token", automatic.id);
      const binding = (
        await migration!.query(
          "SELECT state_key,state_version FROM lzc.plan_runs WHERE id=$1",
          [run.id],
        )
      ).rows[0];
      expect(binding).toEqual({
        state_key: first.key,
        state_version: first.version,
      });
      const runnerInput = await plans.input(test.tickets.get(run.id)!);
      expect(runnerInput.backend).toMatchObject({ kind: "s3", descriptor });
      await plans.stage(test.tickets.get(run.id)!, "validating");
      await plans.stage(test.tickets.get(run.id)!, "planning");
      await plans.result(test.tickets.get(run.id)!, {
        status: "failed",
        errorCode: "plan_failed",
      });
      expect(lookup).toEqual({
        ...registered,
        configuration: (
          await test.backends.configuration(test.owner, registered.id)
        ).configuration,
      });
      expect(
        await test.backends.configurationForSource(
          test.owner,
          test.configurationId,
        ),
      ).toEqual(lookup);
      expect(JSON.stringify(lookup)).not.toContain("alias-secret");
      const persisted = (
        await migration!.query(
          "SELECT * FROM lzc.platform_states WHERE tenant_id=$1",
          [test.owner.tenantId],
        )
      ).rows;
      expect(persisted).toHaveLength(1);
      expect(persisted[0]).toMatchObject({
        state_key: first.key,
        version: first.version,
        configuration_id: test.configurationId,
        remote_identity: sha256(bytes),
        ciphertext: null,
      });
      expect(test.remote.get("terraform.tfstate")).toEqual(bytes);
      const unrelated = await session();
      await expect(
        test.backends.configurationForSource(unrelated, githubId),
      ).rejects.toMatchObject({ code: "backend_not_found" });
      await expect(
        withTenant(pool, unrelated, (client) =>
          test.execution.capture(client, unrelated, attachedManifest),
        ),
      ).rejects.toMatchObject({ code: "backend_binding_changed" });
      const other = await test.backends.register(test.owner, {
        descriptor: { ...descriptor, key: "other.tfstate" },
        credentials: {
          accessKeyId: "other-access",
          secretAccessKey: "other-secret",
        },
      });
      await expect(
        exported.create(test.owner, "test-token", {
          ...input,
          backendId: other.id,
        }),
      ).rejects.toMatchObject({ code: "backend_binding_changed" });
      await expect(
        withTenant(pool, test.owner, (client) =>
          test.execution.capture(client, test.owner, {
            ...attachedManifest,
            backend: { ...other, stateIdentity: first.key },
          }),
        ),
      ).rejects.toMatchObject({ code: "backend_binding_changed" });
      await expect(
        withTenant(pool, test.owner, (client) =>
          test.execution.capture(client, test.owner, {
            ...attachedManifest,
            backend: {
              ...attachedManifest.backend,
              descriptor: { ...descriptor, key: "tampered.tfstate" },
            },
          }),
        ),
      ).rejects.toMatchObject({ code: "backend_binding_changed" });
      await expect(
        withTenant(pool, test.owner, (client) =>
          test.execution.capture(client, test.owner, {
            ...attachedManifest,
            backend: {
              ...attachedManifest.backend,
              stateIdentity: stableStateKey(test.owner, attachedManifest),
            },
          }),
        ),
      ).rejects.toMatchObject({ code: "backend_binding_changed" });
      const peer = await session();
      await migration!.query(
        "UPDATE lzc.tenants SET kind='organisation',owner_user_id=NULL,organization_id=$2 WHERE id=$1",
        [test.owner.tenantId, test.organizationId],
      );
      await migration!.query(
        "UPDATE lzc.memberships SET product_roles=ARRAY['platform-engineer'] WHERE tenant_id=$1",
        [test.owner.tenantId],
      );
      await migration!.query(
        "INSERT INTO lzc.memberships(tenant_id,user_id,role,product_roles) VALUES($1,$2,'viewer',ARRAY['platform-engineer'])",
        [test.owner.tenantId, peer.userId],
      );
      const engineer = { ...peer, tenantId: test.owner.tenantId };
      expect(
        await withTenant(pool, engineer, (client) =>
          test.execution.capture(client, engineer, automaticManifest),
        ),
      ).toEqual(first);
      expect(
        await test.backends.configurationForSource(engineer, githubId),
      ).toEqual(lookup);
      await migration!.query(
        "UPDATE lzc.memberships SET product_roles=ARRAY['application-owner'] WHERE tenant_id=$1 AND user_id=$2",
        [engineer.tenantId, engineer.userId],
      );
      await expect(
        test.backends.configurationForSource(engineer, githubId),
      ).rejects.toMatchObject({ code: "backend_not_found" });
    });

    it("shares stable backend metadata across Platform Engineers but keeps jobs owner-bound and blocks unmapped legacy states", async () => {
      const test = await fixture();
      const descriptor = {
        bucket: `customer-${test.configurationId}-tfstate`,
        endpoint: "https://object.storage.eu01.onstackit.cloud",
        region: "eu01",
        key: "terraform.tfstate",
        useLockfile: true,
      } as const;
      const registered = await test.backends.register(test.owner, {
        descriptor,
        credentials: {
          accessKeyId: "test-access",
          secretAccessKey: "test-secret",
        },
      });
      test.remote.set(
        "terraform.tfstate",
        Buffer.from(
          JSON.stringify({
            version: 4,
            serial: 12,
            lineage: randomUUID(),
            resources: [],
            outputs: {},
          }),
        ),
      );
      const bound = {
        ...test.manifest,
        backend: {
          ...registered,
          stateIdentity: stableStateKey(test.owner, test.manifest),
        },
      };
      const first = await withTenant(pool, test.owner, (client) =>
        test.execution.capture(client, test.owner, bound),
      );
      const peer = await session();
      await migration!.query(
        "UPDATE lzc.tenants SET kind='organisation',owner_user_id=NULL,organization_id=$2 WHERE id=$1",
        [test.owner.tenantId, test.organizationId],
      );
      await migration!.query(
        "UPDATE lzc.memberships SET product_roles=ARRAY['platform-engineer'] WHERE tenant_id=$1",
        [test.owner.tenantId],
      );
      await migration!.query(
        "INSERT INTO lzc.memberships(tenant_id,user_id,role,product_roles) VALUES($1,$2,'viewer',ARRAY['platform-engineer'])",
        [test.owner.tenantId, peer.userId],
      );
      const engineer = { ...peer, tenantId: test.owner.tenantId };
      const repository = {
        ...bound,
        source: {
          repository: { id: 77, owner: "customer", name: "fork" },
          configurationId: test.configurationId,
          branch: "work",
          commit: "a".repeat(40),
        },
      };
      expect(
        await withTenant(pool, engineer, (client) =>
          test.execution.capture(client, engineer, repository),
        ),
      ).toEqual(first);
      expect(await test.backends.list(engineer)).toEqual({
        backends: [registered],
      });
      expect(await test.plans.list(engineer)).toEqual([]);
      await migration!.query(
        "UPDATE lzc.memberships SET product_roles=ARRAY['application-owner'] WHERE tenant_id=$1 AND user_id=$2",
        [engineer.tenantId, engineer.userId],
      );
      expect(await test.backends.list(engineer)).toEqual({ backends: [] });
      const legacy = await fixture();
      const saved = await legacy.plan();
      const oldKey = sha256(
        JSON.stringify([
          legacy.owner.tenantId,
          legacy.owner.userId,
          "database",
          legacy.configurationId,
        ]),
      );
      await migration!.query(
        "INSERT INTO lzc.platform_states(state_key,tenant_id,owner_user_id) VALUES($1,$2,$3)",
        [oldKey, legacy.owner.tenantId, legacy.owner.userId],
      );
      await migration!.query(
        "UPDATE lzc.plan_runs SET state_key=$2 WHERE id=$1",
        [saved.id, oldKey],
      );
      await expect(
        withTenant(pool, legacy.owner, (client) =>
          legacy.execution.capture(client, legacy.owner, legacy.manifest),
        ),
      ).rejects.toMatchObject({ code: "legacy_state_migration_required" });
    });

    it("verifies migration phases against tenant tickets, exact copied state and CAS; retains encrypted recovery independently", async () => {
      const test = await fixture();
      const saved = await test.plan();
      const apply = await test.plans.apply(
        test.owner,
        test.token,
        saved.id,
        test.approval(saved.artifactSha256),
      );
      const ticket = test.tickets.get(apply.id)!;
      await test.plans.input(ticket);
      await test.plans.stage(ticket, "validating");
      await test.plans.stage(ticket, "applying");
      const state = test.managementState({
        version: 4,
        terraform_version: "1.12.6",
        serial: 3,
        lineage: randomUUID(),
        outputs: {},
        resources: [],
      });
      const managementKey = {
        credentials: {
          kid: randomUUID(),
          iss: "automation@sa.stackit.cloud",
          sub: randomUUID(),
          aud: "https://accounts.stackit.cloud",
          privateKey: generateKeyPairSync("rsa", { modulusLength: 2048 })
            .privateKey.export({ format: "pem", type: "pkcs8" })
            .toString(),
        },
      };
      state.resources.push(
        {
          module: "module.management",
          mode: "managed",
          type: "stackit_service_account_key",
          name: "automation",
          instances: [
            {
              attributes: {
                json: JSON.stringify(managementKey),
                service_account_email: managementKey.credentials.iss,
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
                email: managementKey.credentials.iss,
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
                subject: managementKey.credentials.iss,
                role: "owner",
                resource_id: test.organizationId,
              },
            },
          ],
        },
      );
      await test.plans.state(ticket, "lock", undefined, "migration-lock");
      await test.plans.state(ticket, "write", state, "migration-lock");
      await expect(
        test.plans.migration(ticket, { phase: "prepare" }),
      ).rejects.toMatchObject({ code: "migration_not_ready" });
      await test.plans.state(ticket, "unlock", undefined, "migration-lock");
      await expect(
        test.plans.migration("x".repeat(43), { phase: "prepare" }),
      ).rejects.toMatchObject({ code: "invalid_runner_ticket" });
      await expect(
        test.plans.migration(ticket, { phase: "complete" }),
      ).rejects.toMatchObject({ code: "state_changed" });
      test.remote.set(
        "terraform.tfstate",
        Buffer.from(JSON.stringify({ ...state, lineage: randomUUID() })),
      );
      await expect(
        test.plans.migration(ticket, { phase: "prepare" }),
      ).rejects.toMatchObject({ code: "migration_target_not_empty" });
      test.remote.delete("terraform.tfstate");
      const prepared = await test.plans.migration(ticket, { phase: "prepare" });
      expect(prepared).toMatchObject({
        backend: {
          kind: "s3",
          descriptor: { key: "terraform.tfstate", useLockfile: true },
          credentials: {
            accessKeyId: "test-access",
            secretAccessKey: "test-secret",
          },
        },
      });
      const applyRow = (
        await migration!.query(
          "SELECT state_version FROM lzc.plan_runs WHERE id=$1",
          [apply.id],
        )
      ).rows[0];
      expect(applyRow.state_version).toBe("0");
      await expect(test.plans.state(ticket, "read")).resolves.toEqual(state);
      await test.plans.state(
        ticket,
        "lock",
        undefined,
        "source-migration-lock",
      );
      await expect(test.plans.state(ticket, "read")).resolves.toEqual(state);
      await expect(
        test.plans.state(
          ticket,
          "write",
          { ...state, serial: 4 },
          "source-migration-lock",
        ),
      ).rejects.toMatchObject({ code: "state_write_forbidden" });
      await expect(
        test.plans.state(ticket, "unlock", undefined, "wrong-lock"),
      ).rejects.toMatchObject({ code: "state_locked" });
      await test.plans.state(
        ticket,
        "unlock",
        undefined,
        "source-migration-lock",
      );
      await expect(
        test.plans.state(saved.ticket, "read"),
      ).rejects.toMatchObject({ code: "invalid_runner_ticket" });
      test.remote.set(
        "terraform.tfstate",
        Buffer.from(JSON.stringify({ ...state, serial: 4 })),
      );
      await expect(
        test.plans.migration(ticket, { phase: "complete" }),
      ).rejects.toMatchObject({ code: "migration_verification_failed" });
      const key = stableStateKey(test.owner, test.manifest);
      await migration!.query(
        "UPDATE lzc.platform_states SET version=version+1 WHERE state_key=$1",
        [key],
      );
      for (const action of ["read", "lock", "unlock"] as const)
        await expect(
          test.plans.state(ticket, action, undefined, "source-migration-lock"),
        ).rejects.toMatchObject({ code: "state_changed" });
      test.remote.set("terraform.tfstate", Buffer.from(JSON.stringify(state)));
      await expect(
        test.plans.migration(ticket, { phase: "complete" }),
      ).rejects.toMatchObject({ code: "state_changed" });
      await migration!.query(
        "UPDATE lzc.platform_states SET version=version-1 WHERE state_key=$1",
        [key],
      );
      const recovered = Buffer.from(JSON.stringify(state));
      await test.plans.recovery(ticket, {
        data: recovered.toString("base64"),
        sha256: sha256(recovered),
      });
      test.remote.set(
        "terraform.tfstate",
        Buffer.from(
          JSON.stringify({ ...state, lineage: randomUUID(), serial: 1 }),
        ),
      );
      await test.plans.migration(ticket, { phase: "complete" });
      const persisted = (
        await migration!.query(
          "SELECT * FROM lzc.platform_states WHERE state_key=$1",
          [key],
        )
      ).rows[0];
      expect(persisted.ciphertext).toBeNull();
      expect(persisted.backend_id).not.toBeNull();
      const exportedBackend = await test.backends.configurationForSource(
        test.owner,
        test.configurationId,
      );
      expect(exportedBackend.id).toBe(persisted.backend_id);
      expect(exportedBackend.descriptor).toEqual(
        (prepared as { backend: { descriptor: unknown } }).backend.descriptor,
      );
      expect(exportedBackend.configuration).not.toContain("test-secret");
      expect(
        persisted.runner_key_ciphertext.includes(
          Buffer.from(managementKey.credentials.privateKey),
        ),
      ).toBe(false);
      const recovery = (
        await migration!.query(
          "SELECT * FROM lzc.state_recoveries WHERE run_id=$1",
          [apply.id],
        )
      ).rows[0];
      expect(recovery.ciphertext.includes(recovered)).toBe(false);
      expect(
        test.execution.crypto.decrypt(
          recovery.ciphertext,
          test.owner.tenantId,
          key,
          `recovery:${apply.id}`,
        ),
      ).toEqual(recovered);
      await expect(test.plans.state(ticket, "read")).rejects.toMatchObject({
        code: "bootstrap_backend_unavailable",
      });
      await test.plans.result(ticket, { status: "succeeded" });
      const next = await test.plans.start(
        test.owner,
        test.token,
        test.preparationId,
      );
      const input = await test.plans.input(test.tickets.get(next.id)!);
      expect(input.backend).toEqual((prepared as { backend: unknown }).backend);
      expect(input.backend).not.toHaveProperty("address");
      expect(input.key).toEqual(managementKey);
    });

    it("keeps state keys stable across preparations, revisions, sources and human owners", async () => {
      const test = await fixture();
      const original = stableStateKey(test.owner, test.manifest);
      const revised = {
        ...test.manifest,
        source: {
          kind: "database" as const,
          configurationId: test.configurationId,
          revision: 99,
          documentSha256: "0".repeat(64),
        },
      };
      expect(stableStateKey(test.owner, revised)).toBe(original);
      expect(
        stableStateKey({ ...test.owner, userId: randomUUID() }, revised),
      ).toBe(original);
      expect(
        stableStateKey({ ...test.owner, tenantId: randomUUID() }, revised),
      ).not.toBe(original);
      const repository = {
        ...test.manifest,
        source: {
          repository: { owner: "customer", name: "fork", id: 1234 },
          branch: "lzc/configurations",
          commit: "a".repeat(40),
          configurationId: test.configurationId,
        },
      };
      const repositoryKey = stableStateKey(test.owner, repository);
      expect(repositoryKey).toBe(original);
      expect(
        stableStateKey(test.owner, {
          ...repository,
          source: {
            ...repository.source,
            commit: "b".repeat(40),
            repository: { ...repository.source.repository, name: "renamed" },
          },
        }),
      ).toBe(repositoryKey);
      expect(
        stableStateKey(test.owner, {
          ...repository,
          source: {
            ...repository.source,
            repository: { ...repository.source.repository, id: 5678 },
          },
        }),
      ).toBe(repositoryKey);
    });

    it("retains legacy initial-plan-only behavior when execution is absent", async () => {
      const test = await fixture();
      const legacy = new Plans(
        pool,
        test.profiles,
        test.secrets,
        test.repositories,
        test.runner,
        "https://configurator.example",
      );
      const run = await legacy.start(
        test.owner,
        test.token,
        test.preparationId,
      );
      const ticket = test.tickets.get(run.id)!;
      const input = await legacy.input(ticket);
      expect(input.mode).toBe("initial-plan-only");
      expect(input).not.toHaveProperty("backend");
      expect(input).not.toHaveProperty("plan");
      await expect(
        legacy.apply(
          test.owner,
          test.token,
          run.id,
          test.approval("0".repeat(64)),
        ),
      ).rejects.toMatchObject({ code: "execution_disabled" });
      await legacy.stage(ticket, "validating");
      await legacy.stage(ticket, "planning");
      await expect(
        legacy.result(ticket, { status: "succeeded" }),
      ).rejects.toMatchObject({ code: "invalid_runner_transition" });
      await legacy.result(ticket, { status: "succeeded", summary });
      expect((await legacy.list(test.owner))[0]).toMatchObject({
        operation: "plan",
        status: "succeeded",
        applyAllowed: false,
      });
      expect(test.runner.start).toHaveBeenCalledTimes(1);
      expect(test.token).not.toHaveBeenCalled();
    });

    it.each(["checkpoint", "partial", "alias"])(
      "rejects backend-free initial plans for an existing %s state",
      async (kind) => {
        const test = await fixture();
        const manifest = test.manifest;
        const state = await withTenant(pool, test.owner, (client) =>
          test.execution.capture(client, test.owner, manifest),
        );
        await withTenant(pool, test.owner, async (client) => {
          if (kind === "partial") {
            const bytes = Buffer.from(
              JSON.stringify({
                version: 4,
                lineage: randomUUID(),
                serial: 1,
                outputs: {},
                resources: [
                  {
                    mode: "managed",
                    type: "terraform_data",
                    name: "partial",
                    provider: 'provider["terraform.io/builtin/terraform"]',
                    instances: [
                      { schema_version: 0, attributes: { id: "partial" } },
                    ],
                  },
                ],
              }),
            );
            const ciphertext = test.execution.crypto.encrypt(
              bytes,
              test.owner.tenantId,
              state.key,
              `state:${state.key}`,
            );
            await client.query(
              "UPDATE lzc.platform_states SET version=version+1,ciphertext=$2 WHERE state_key=$1",
              [state.key, ciphertext],
            );
          }
          if (kind === "alias")
            await client.query(
              "UPDATE lzc.platform_states SET configuration_id=$2 WHERE state_key=$1",
              [state.key, randomUUID()],
            );
        });
        const legacy = new Plans(
          pool,
          test.profiles,
          test.secrets,
          test.repositories,
          test.runner,
          "https://configurator.example",
        );
        await expect(
          legacy.start(test.owner, test.token, test.preparationId),
        ).rejects.toMatchObject({ code: "initial_plan_requires_empty_state" });
        expect(test.runner.start).not.toHaveBeenCalled();
        expect(await legacy.list(test.owner)).toEqual([]);
      },
    );

    it("rejects backend-free initial plans for an unmapped legacy state", async () => {
      const test = await fixture();
      await migration!.query(
        "INSERT INTO lzc.platform_states(state_key,tenant_id,owner_user_id) VALUES($1,$2,$3)",
        [sha256(randomUUID()), test.owner.tenantId, test.owner.userId],
      );
      const legacy = new Plans(
        pool,
        test.profiles,
        test.secrets,
        test.repositories,
        test.runner,
        "https://configurator.example",
      );
      await expect(
        legacy.start(test.owner, test.token, test.preparationId),
      ).rejects.toMatchObject({ code: "legacy_state_migration_required" });
      expect(test.runner.start).not.toHaveBeenCalled();
      expect(await legacy.list(test.owner)).toEqual([]);
    });

    it("rechecks a queued initial plan before releasing inputs when state appears", async () => {
      const test = await fixture();
      const legacy = new Plans(
        pool,
        test.profiles,
        test.secrets,
        test.repositories,
        test.runner,
        "https://configurator.example",
      );
      const run = await legacy.start(
        test.owner,
        test.token,
        test.preparationId,
      );
      const ticket = test.tickets.get(run.id)!;
      const manifest = test.manifest;
      await withTenant(pool, test.owner, (client) =>
        test.execution.capture(client, test.owner, manifest),
      );
      await expect(legacy.input(ticket)).rejects.toMatchObject({
        code: "initial_plan_requires_empty_state",
      });
    });

    it("rejects an artifact that expires between input and lock, and retains state after a known failed apply", async () => {
      const test = await fixture();
      const saved = await test.plan();
      const run = await test.plans.apply(
        test.owner,
        test.token,
        saved.id,
        test.approval(saved.artifactSha256),
      );
      const ticket = test.tickets.get(run.id)!;
      await test.plans.input(ticket);
      await test.plans.stage(ticket, "validating");
      await test.plans.stage(ticket, "applying");
      await migration!.query(
        "UPDATE lzc.plan_artifacts SET expires_at=now()-interval '1 second' WHERE run_id=$1",
        [saved.id],
      );
      await expect(
        test.plans.state(ticket, "lock", undefined, "expired"),
      ).rejects.toMatchObject({ code: "artifact_invalid" });
      await migration!.query(
        "UPDATE lzc.plan_artifacts SET expires_at=now()+interval '1 minute' WHERE run_id=$1",
        [saved.id],
      );
      await test.plans.state(ticket, "lock", undefined, "known-failure");
      const state = {
        version: 4,
        serial: 1,
        lineage: randomUUID(),
        outputs: {},
        resources: [{ partial: "private-partial-state" }],
      };
      await test.plans.state(ticket, "write", state, "known-failure");
      await test.plans.state(ticket, "unlock", undefined, "known-failure");
      await test.plans.result(ticket, {
        status: "failed",
        errorCode: "apply_failed",
      });
      expect(
        (await test.plans.list(test.owner)).find((item) => item.id === run.id)
          .status,
      ).toBe("recovery_required");
      await expect(
        test.plans.start(test.owner, test.token, test.preparationId),
      ).rejects.toMatchObject({ code: "plan_already_running" });
      const persisted = (
        await migration!.query(
          "SELECT version,ciphertext FROM lzc.platform_states WHERE state_key=$1",
          [stableStateKey(test.owner, test.manifest)],
        )
      ).rows[0];
      expect(persisted.version).toBe("1");
      expect(
        persisted.ciphertext.includes(Buffer.from("private-partial-state")),
      ).toBe(false);
    });

    it("does not replay ambiguous dispatch and does not clean recovery runners", async () => {
      const test = await fixture();
      const saved = await test.plan();
      test.runner.start.mockRejectedValueOnce(new Error("ambiguous dispatch"));
      const run = await test.plans.apply(
        test.owner,
        test.token,
        saved.id,
        test.approval(saved.artifactSha256),
      );
      for (let attempt = 0; attempt < 50; attempt++) {
        const row = (
          await migration!.query(
            "SELECT status FROM lzc.plan_runs WHERE id=$1",
            [run.id],
          )
        ).rows[0];
        if (row.status === "recovery_required") break;
        await setTimeout(10);
      }
      expect(
        (await test.plans.list(test.owner)).find((item) => item.id === run.id)
          .status,
      ).toBe("recovery_required");
      await expect(
        test.plans.apply(
          test.owner,
          test.token,
          saved.id,
          test.approval(saved.artifactSha256),
        ),
      ).rejects.toBeDefined();
      expect(test.runner.start).toHaveBeenCalledTimes(2);
      await migration!.query(
        "UPDATE lzc.plan_runs SET finished_at=now()-interval '1 minute',expires_at=now()-interval '1 minute' WHERE id=$1",
        [run.id],
      );
      await test.plans.maintain();
      expect(test.runner.remove).not.toHaveBeenCalledWith(
        run.id,
        expect.anything(),
      );
    });
  },
);
