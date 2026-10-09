import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { summarizePlan } from "@lzc/contracts";
import {
  catalogue,
  configurationValues,
  createDraft,
  editCommonInput,
  migrateCommonConfiguration,
  recordValues,
  savedDraft,
  serializeTfvars,
  type Template,
} from "@lzc/domain";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import { Applications } from "../apps/api/src/applications/service.js";
import {
  createGitHubLogin,
  newSessionToken,
} from "../apps/api/src/auth/github-flow.js";
import { StackitIdentities } from "../apps/api/src/auth/stackit-identities.js";
import { PostgresAuthStore, type Session } from "../apps/api/src/auth/store.js";
import { Configurations } from "../apps/api/src/configurations/service.js";
import { PostgresCredentialProfiles } from "../apps/api/src/credentials/profiles.js";
import type { Backends } from "../apps/api/src/deployments/backends.js";
import { Preparations } from "../apps/api/src/deployments/preparations.js";
import { Invitations } from "../apps/api/src/organisation/invitations.js";
import { PostgresOrganisations } from "../apps/api/src/organisation/service.js";
import type { PlanRunner } from "../apps/api/src/plans/cloud-foundry.js";
import { ArtifactCrypto } from "../apps/api/src/plans/crypto.js";
import { withTenant } from "../apps/api/src/storage/database.js";
import { migrate } from "../apps/api/src/storage/migrations.js";

const address = process.env.LZC_TEST_DATABASE_URL;
if (!address)
  throw new Error("LZC_TEST_DATABASE_URL required for real database tests");
const url = new URL(address);
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.pathname !== "/configurator_test"
)
  throw new Error("Refusing a non-local/non-test database");
const admin = new pg.Client({ connectionString: address });
const migrationConfig = {
  host: url.hostname,
  port: Number(url.port),
  database: "configurator_test",
  user: "configurator_migration",
  password: "migration-test-only",
};
const migration = new pg.Client(migrationConfig);
const pool = new pg.Pool({
  ...migrationConfig,
  user: "configurator_app",
  password: "runtime-test-only",
  max: 1,
});
const store = new PostgresAuthStore(pool);
const invitations = new Invitations(pool);
async function inviteMember(
  s: Session,
  target: Session,
  roles: string[],
  manage: boolean,
) {
  const invite = await invitations.create(s, roles, manage);
  await invitations.use(target, invite.token, true);
  await new PostgresOrganisations(pool).switch(target, target.tenantId);
}
const directory = fileURLToPath(new URL("../apps/api/db/", import.meta.url));
let alice: Session, bob: Session, aliceToken: string, aliceDocument: string;

beforeAll(async () => {
  await admin.connect();
  await admin.query(
    "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='configurator_migration') THEN CREATE ROLE configurator_migration LOGIN PASSWORD 'migration-test-only'; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='configurator_app') THEN CREATE ROLE configurator_app LOGIN PASSWORD 'runtime-test-only'; END IF; END $$",
  );
  await admin.query(
    "ALTER DATABASE configurator_test OWNER TO configurator_migration",
  );
  await migration.connect();
  await migrate(migration, directory);
  await migrate(migration, directory);
  await migration.query(
    "TRUNCATE lzc_auth.sessions, lzc_auth.login_requests, lzc.configurations, lzc.memberships, lzc.tenants, lzc_auth.users CASCADE",
  );
  async function session(id: number, login: string) {
    const token = newSessionToken();
    const identity = await store.createSession({
      githubId: id,
      login,
      id: randomUUID(),
      hash: token.hash,
      csrfToken: randomBytes(32).toString("base64url"),
      expiresAt: new Date(Date.now() + 3600000),
    });
    return { token: token.token, identity };
  }
  const a = await session(101, "alice");
  alice = a.identity;
  aliceToken = a.token;
  bob = (await session(102, "bob")).identity;
  aliceDocument = await withTenant(pool, alice, async (client) => {
    const result = await client.query<{ id: string }>(
      "INSERT INTO lzc.configurations(tenant_id, created_by, name, document) VALUES($1,$2,'Alice draft','{}') RETURNING id",
      [alice.tenantId, alice.userId],
    );
    return result.rows[0]?.id ?? "";
  });
}, 30000);
afterAll(async () => {
  await pool.end();
  await migration.end();
  await admin.end();
});

describe("real PostgreSQL session and tenant boundaries", () => {
  it("persists bounded large organization proofs without changing the complete owner comparison", async () => {
    const proof = {
      issuer: "https://accounts.stackit.cloud",
      subject: randomUUID(),
      email: "large-proof@example.test",
      emailVerified: true as const,
      verificationMethod: "signed-id-token-and-userinfo" as const,
      tokenExpiresAt: new Date(Date.now() + 300000).toISOString(),
      organization: null,
    };
    const loginSession = await store.createStackitSession({
      identity: proof,
      id: randomUUID(),
      hash: newSessionToken().hash,
      csrfToken: randomBytes(32).toString("base64url"),
      expiresAt: new Date(proof.tokenExpiresAt),
    });
    const permissions = Array.from(
      { length: 965 },
      (_, index) =>
        `organization.permission.${String.fromCharCode(97 + Math.floor(index / 676), 97 + (Math.floor(index / 26) % 26), 97 + (index % 26))}`,
    );
    const identities = new StackitIdentities(pool);
    const organization = {
      id: randomUUID(),
      name: "Large official proof",
      permissions,
      ownerPermissions: permissions,
    };
    const organisations = new PostgresOrganisations(pool);
    const tenantId = await organisations.create(
      loginSession,
      organization.name,
      organization.id,
    );
    await organisations.switch(loginSession, tenantId);
    const session = { ...loginSession, tenantId };
    await identities.save(session, { ...proof, organization });
    const verified = await identities.status(session);
    expect(verified.organizationAdminVerified).toBe(true);
    expect(verified.identity?.organization?.permissions).toHaveLength(965);
    await identities.save(session, {
      ...proof,
      organization: { ...organization, permissions: permissions.slice(1) },
    });
    expect((await identities.status(session)).organizationAdminVerified).toBe(
      false,
    );
    await expect(
      identities.save(session, {
        ...proof,
        organization: {
          ...organization,
          permissions: Array(4097).fill("organization.read"),
        },
      }),
    ).rejects.toThrow();
    await expect(
      withTenant(pool, session, (client) =>
        client.query(
          "UPDATE lzc.stackit_organization_access SET permissions=$1 WHERE tenant_id=$2 AND user_id=$3",
          [
            Array(4097).fill("organization.read"),
            session.tenantId,
            session.userId,
          ],
        ),
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      withTenant(pool, session, (client) =>
        client.query(
          "UPDATE lzc.stackit_organization_access SET owner_permissions=$1 WHERE tenant_id=$2 AND user_id=$3",
          [[null], session.tenantId, session.userId],
        ),
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("persists configurations across service restarts with owner isolation and revision conflicts", async () => {
    const template = catalogue.templates.find(
      (item) => item.id === "standalone",
    ) as Template;
    const draft = createDraft(template);
    draft.name = "Database configuration";
    const configurations = new Configurations(pool);
    const stored = await configurations.create(alice, draft);
    try {
      expect(
        await new Configurations(pool).get(alice, stored.id),
      ).toMatchObject({ draft, revision: 1 });
      await expect(configurations.get(bob, stored.id)).rejects.toMatchObject({
        status: 404,
      });
      const shared = { ...bob, tenantId: alice.tenantId };
      expect(
        (
          await withTenant(pool, shared, (client) =>
            client.query("SELECT id FROM lzc.configurations WHERE id=$1", [
              stored.id,
            ]),
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await withTenant(pool, alice, (client) =>
            client.query(
              "SELECT id FROM lzc.configurations WHERE id=$1 AND created_by=$2",
              [stored.id, alice.userId],
            ),
          )
        ).rows,
      ).toHaveLength(1);
      const updated = await configurations.update(alice, stored.id, 1, {
        ...draft,
        name: "Updated configuration",
      });
      expect(updated.revision).toBe(2);
      await expect(
        configurations.update(alice, stored.id, 1, draft),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        configurations.remove(alice, stored.id, 1),
      ).rejects.toMatchObject({ status: 409 });
      expect((await configurations.get(alice, stored.id)).name).toBe(
        "Updated configuration",
      );
    } finally {
      const current = await configurations.get(alice, stored.id);
      await configurations.remove(alice, stored.id, current.revision);
    }
    await expect(configurations.get(alice, stored.id)).rejects.toMatchObject({
      status: 404,
    });
  });
  it("logs in with STACKIT without GitHub, preserves subject ownership and links GitHub without merging users", async () => {
    const identity = {
      issuer: "https://accounts.stackit.cloud",
      subject: randomUUID(),
      email: "login@example.test",
      emailVerified: true as const,
      verificationMethod: "device-grant-userinfo" as const,
      tokenExpiresAt: new Date(Date.now() + 300000).toISOString(),
      organization: null,
    };
    const token = newSessionToken();
    const session = await store.createStackitSession({
      identity,
      id: randomUUID(),
      hash: token.hash,
      csrfToken: randomBytes(32).toString("base64url"),
      expiresAt: new Date(Date.now() + 240000),
    });
    expect(session.githubId).toBe("");
    expect(await store.resolveSession(token.token)).toMatchObject({
      userId: session.userId,
      tenantId: session.tenantId,
      login: identity.email,
      githubId: "",
    });
    expect(await new StackitIdentities(pool).status(session)).toMatchObject({
      verified: true,
      organizationVerified: false,
    });
    const again = await store.createStackitSession({
      identity: { ...identity, email: "changed@example.test" },
      id: randomUUID(),
      hash: newSessionToken().hash,
      csrfToken: randomBytes(32).toString("base64url"),
      expiresAt: new Date(Date.now() + 240000),
    });
    expect(again.userId).toBe(session.userId);
    const other = await store.createStackitSession({
      identity: { ...identity, subject: randomUUID() },
      id: randomUUID(),
      hash: newSessionToken().hash,
      csrfToken: randomBytes(32).toString("base64url"),
      expiresAt: new Date(Date.now() + 240000),
    });
    expect(other.userId).not.toBe(session.userId);
    const legacyToken = newSessionToken();
    const legacy = await store.createSession({
      githubId: 302,
      login: "legacy",
      id: randomUUID(),
      hash: legacyToken.hash,
      csrfToken: randomBytes(32).toString("base64url"),
      expiresAt: new Date(Date.now() + 300000),
    });
    const migrated = await store.createStackitSession({
      identity: { ...identity, subject: randomUUID() },
      existingSessionId: legacy.id,
      id: randomUUID(),
      hash: newSessionToken().hash,
      csrfToken: randomBytes(32).toString("base64url"),
      expiresAt: new Date(Date.now() + 240000),
    });
    expect(migrated).toMatchObject({
      userId: legacy.userId,
      tenantId: legacy.tenantId,
      githubId: "302",
    });
    await expect(
      store.createStackitSession({
        identity,
        existingSessionId: legacy.id,
        id: randomUUID(),
        hash: newSessionToken().hash,
        csrfToken: randomBytes(32).toString("base64url"),
        expiresAt: new Date(Date.now() + 240000),
      }),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(store.linkGitHub(session, 101, "alice")).rejects.toMatchObject(
      { code: "23505" },
    );
    const linked = await store.linkGitHub(session, 301, "optional-github");
    expect(linked).toMatchObject({
      id: session.id,
      tenantId: session.tenantId,
      userId: session.userId,
      githubId: "301",
    });
    await expect(
      store.linkGitHub(other, 301, "optional-github"),
    ).rejects.toMatchObject({ code: "23505" });
    await store.deleteSession(token.token);
    await expect(
      store.linkGitHub(session, 301, "optional-github"),
    ).rejects.toMatchObject({ code: "P0002" });
  });

  it("binds STACKIT issuer and subject to one user without email merging and isolates organization proofs", async () => {
    const identities = new StackitIdentities(pool);
    const organizationId = randomUUID();
    const tenantId = await new PostgresOrganisations(pool).create(
      alice,
      "STACKIT identity test",
      organizationId,
    );
    const session = { ...alice, tenantId };
    const proof = {
      issuer: "https://accounts.stackit.cloud",
      subject: randomUUID(),
      email: "same-email@example.test",
      emailVerified: true as const,
      verificationMethod: "device-grant-userinfo" as const,
      tokenExpiresAt: new Date(Date.now() + 300000).toISOString(),
      organization: {
        id: organizationId,
        name: "Verified organization",
        permissions: ["organization.read", "organization.write"],
      },
    };
    await identities.save(session, proof);
    expect(await identities.status(session)).toMatchObject({
      verified: true,
      organizationVerified: true,
      identity: proof,
    });
    const audits = () =>
      withTenant(pool, session, (client) =>
        client.query(
          "SELECT * FROM lzc.stackit_organization_authorizations ORDER BY verified_at,id",
        ),
      );
    const originalAudit = (await audits()).rows[0];
    expect(originalAudit).toMatchObject({
      tenant_id: tenantId,
      user_id: session.userId,
      organization_id: organizationId,
      issuer: proof.issuer,
      subject: proof.subject,
      email: proof.email,
      permissions: proof.organization.permissions,
    });
    expect(
      (await new PostgresOrganisations(pool).overview(session)).tenants.find(
        (tenant) => tenant.id === tenantId,
      )?.organizationVerified,
    ).toBe(false);
    expect(
      (
        await withTenant(pool, bob, (client) =>
          client.query("SELECT * FROM lzc.stackit_organization_authorizations"),
        )
      ).rows,
    ).toEqual([]);
    await expect(
      withTenant(pool, session, (client) =>
        client.query(
          "INSERT INTO lzc.stackit_organization_authorizations SELECT * FROM lzc.stackit_organization_authorizations",
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      migration.query(
        "UPDATE lzc.stackit_organization_authorizations SET permissions='{}' WHERE id=$1",
        [originalAudit.id],
      ),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      migration.query(
        "DELETE FROM lzc.stackit_organization_authorizations WHERE id=$1",
        [originalAudit.id],
      ),
    ).rejects.toMatchObject({ code: "55000" });
    await identities.save(session, {
      ...proof,
      organization: {
        ...proof.organization,
        permissions: ["organization.read"],
      },
    });
    expect(
      (await identities.status(session)).identity?.organization?.permissions,
    ).toEqual(["organization.read"]);
    expect((await audits()).rows).toHaveLength(2);
    expect(
      (await audits()).rows.find((audit) => audit.id === originalAudit.id),
    ).toEqual(originalAudit);
    expect(await identities.status(bob)).toEqual({
      identity: null,
      verified: false,
      organizationVerified: false,
    });
    await expect(
      identities.save(bob, { ...proof, organization: null }),
    ).rejects.toMatchObject({ code: "identity_already_bound" });
    await identities.save(bob, {
      ...proof,
      subject: randomUUID(),
      organization: null,
    });
    expect((await identities.status(bob)).identity?.subject).not.toBe(
      proof.subject,
    );
    await expect(
      identities.save(session, { ...proof, subject: randomUUID() }),
    ).rejects.toMatchObject({ code: "identity_binding_conflict" });
    await expect(
      identities.save(session, {
        ...proof,
        organization: { id: randomUUID(), name: "Wrong organization" },
      }),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      withTenant(pool, bob, (client) =>
        client.query(
          "UPDATE lzc.stackit_identities SET subject=$1 WHERE user_id=$2",
          [randomUUID(), alice.userId],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await identities.revoke(session);
    expect(await identities.status(session)).toMatchObject({
      verified: false,
      organizationVerified: false,
    });
    expect(
      (await identities.status(session)).identity?.organization,
    ).toBeNull();
    expect((await audits()).rows).toHaveLength(2);
    await identities.save(session, { ...proof, organization: null });
    expect(await identities.status(session)).toMatchObject({
      verified: true,
      organizationVerified: false,
    });
    const restored = await store.createStackitSession({
      identity: { ...proof, organization: null },
      id: randomUUID(),
      hash: newSessionToken().hash,
      csrfToken: randomBytes(32).toString("base64url"),
      expiresAt: new Date(Date.now() + 240000),
    });
    expect(restored.userId).toBe(alice.userId);
    await identities.revoke(session);
    await identities.revoke(bob);
  });

  it("requires current human owner permissions and explicit confirmation for auditable organization binding", async () => {
    const organisations = new PostgresOrganisations(pool);
    const identities = new StackitIdentities(pool);
    const original = (await identities.status(alice)).identity;
    const other = (await identities.status(bob)).identity;
    if (!original || !other)
      throw new Error("Expected existing identity fixtures");
    const organizationId = randomUUID();
    const tenantId = await organisations.create(
      alice,
      "Human owner binding",
      organizationId,
    );
    await organisations.switch(alice, tenantId);
    const session = { ...alice, tenantId };
    const proof = {
      ...original,
      tokenExpiresAt: new Date(Date.now() + 300000).toISOString(),
      organization: {
        id: organizationId,
        name: "Human owner organization",
        permissions: ["organization.read"],
        ownerPermissions: ["organization.read", "organization.write"],
      },
    };
    try {
      await identities.save(session, proof);
      await expect(identities.bindOrganization(session, {})).rejects.toThrow();
      await expect(
        identities.bindOrganization(session, {
          confirmOrganizationBinding: false,
        }),
      ).rejects.toThrow();
      await expect(
        identities.bindOrganization(session, {
          confirmOrganizationBinding: true,
          organizationId,
        }),
      ).rejects.toThrow();
      await expect(
        identities.bindOrganization(session, {
          confirmOrganizationBinding: true,
        }),
      ).rejects.toMatchObject({ code: "42501" });
      expect((await identities.status(session)).organizationAdminVerified).toBe(
        false,
      );
      const ownerProof = {
        ...proof,
        organization: {
          ...proof.organization,
          permissions: proof.organization.ownerPermissions,
        },
      };
      await identities.save(session, {
        ...ownerProof,
        organization: {
          id: organizationId,
          name: proof.organization.name,
          permissions: ownerProof.organization.permissions,
        },
      });
      await expect(
        identities.bindOrganization(session, {
          confirmOrganizationBinding: true,
        }),
      ).rejects.toMatchObject({ code: "42501" });
      await identities.save(session, ownerProof);
      expect((await identities.status(session)).organizationAdminVerified).toBe(
        true,
      );
      await identities.clearOrganizationProof(session);
      expect((await identities.status(session)).verified).toBe(true);
      expect((await identities.status(session)).organizationVerified).toBe(
        false,
      );
      await expect(
        identities.bindOrganization(session, {
          confirmOrganizationBinding: true,
        }),
      ).rejects.toMatchObject({ code: "42501" });
      await identities.save(session, ownerProof);
      expect(
        (await organisations.overview(session)).tenants.find(
          (tenant) => tenant.id === tenantId,
        )?.organizationVerified,
      ).toBe(false);
      await migration.query(
        "INSERT INTO lzc.memberships(tenant_id,user_id,role,product_roles) VALUES($1,$2,'viewer',ARRAY['application-owner'])",
        [tenantId, bob.userId],
      );
      await organisations.switch(bob, tenantId);
      const ownerSession = { ...bob, tenantId };
      await identities.save(ownerSession, {
        ...ownerProof,
        subject: other.subject,
        email: other.email,
      });
      await expect(
        identities.bindOrganization(ownerSession, {
          confirmOrganizationBinding: true,
        }),
      ).rejects.toMatchObject({ code: "42501" });
      await identities.revoke(session);
      await expect(
        identities.bindOrganization(session, {
          confirmOrganizationBinding: true,
        }),
      ).rejects.toMatchObject({ code: "42501" });
      await identities.save(session, ownerProof);
      await migration.query(
        "UPDATE lzc.stackit_identities SET valid_until=now()-interval '1 second' WHERE user_id=$1",
        [session.userId],
      );
      await expect(
        identities.bindOrganization(session, {
          confirmOrganizationBinding: true,
        }),
      ).rejects.toMatchObject({ code: "42501" });
      await identities.save(session, ownerProof);
      const binding = await identities.bindOrganization(session, {
        confirmOrganizationBinding: true,
      });
      expect(binding).toMatchObject({
        tenantId,
        organizationId,
        authorizationId: expect.any(String),
        boundBy: session.userId,
        boundAt: expect.any(String),
      });
      expect(
        await identities.bindOrganization(session, {
          confirmOrganizationBinding: true,
        }),
      ).toEqual(binding);
      expect(
        (await organisations.overview(session)).tenants.find(
          (tenant) => tenant.id === tenantId,
        )?.organizationVerified,
      ).toBe(true);
      expect(
        (
          await migration.query(
            "SELECT count(*)::int AS count FROM lzc_auth.membership_audit WHERE tenant_id=$1 AND action='organization_bound'",
            [tenantId],
          )
        ).rows[0].count,
      ).toBe(1);
      await organisations.switch(alice, alice.tenantId);
      await expect(
        identities.bindOrganization(session, {
          confirmOrganizationBinding: true,
        }),
      ).rejects.toMatchObject({ code: "40001" });
    } finally {
      await organisations.switch(alice, alice.tenantId);
      await organisations.switch(bob, bob.tenantId);
      await identities.revoke(session);
      await identities.revoke({ ...bob, tenantId });
    }
  });

  it("persists immutable order decisions with role, tenant, self-approval and job isolation", async () => {
    const organisations = new PostgresOrganisations(pool);
    const tenantId = await organisations.create(
      alice,
      "Order decisions",
      randomUUID(),
    );
    const engineer = { ...alice, tenantId };
    const owner = { ...bob, tenantId };
    const applications = new Applications(pool);
    await organisations.switch(alice, tenantId);
    try {
      const invite = await invitations.create(
        engineer,
        ["application-owner"],
        false,
      );
      await invitations.use(bob, invite.token, true);
      await organisations.switch(bob, tenantId);
      const template = {
        id: randomUUID(),
        key: "decisions",
        name: "Decision template",
        kind: "public",
        region: "eu01",
        settings: { env: "dev", network_enabled: true },
      };
      const published = await applications.publish(engineer, { template });
      const request = {
        versionId: published.id,
        idempotencyKey: randomUUID(),
        name: "Order to approve",
        parameters: {},
      };
      const ordered = await applications.order(owner, request);
      expect(ordered.approval).toEqual({ status: "pending" });
      const approve = { decision: "approved", confirmDecision: true };
      await expect(
        applications.decideOrder(owner, ordered.id, approve),
      ).rejects.toMatchObject({ code: "42501" });
      const ownOrder = await applications.order(engineer, {
        ...request,
        idempotencyKey: randomUUID(),
        name: "Self order",
      });
      await expect(
        applications.decideOrder(engineer, ownOrder.id, approve),
      ).rejects.toMatchObject({ code: "42501" });
      const attemptJob = (instanceId: string) =>
        withTenant(pool, owner, (client) =>
          client.query(
            "INSERT INTO lzc.application_jobs(id,tenant_id,instance_id,owner_user_id,issuer_session_id,idempotency_key,operation,inputs,binding_sha256,expires_at) VALUES($1,$2,$3,$4,$5,$6,'plan','{}',$7,now()+interval '1 hour')",
            [
              randomUUID(),
              tenantId,
              instanceId,
              owner.userId,
              owner.id,
              randomUUID(),
              "a".repeat(64),
            ],
          ),
        );
      await expect(attemptJob(ordered.id)).rejects.toMatchObject({
        code: "40001",
        message: "application_order_not_approved",
      });
      await organisations.switch(alice, alice.tenantId);
      await expect(
        applications.decideOrder(alice, ordered.id, approve),
      ).rejects.toMatchObject({ code: "42501" });
      expect(await applications.listInstances(alice)).toEqual([]);
      await organisations.switch(alice, tenantId);
      const [decided, replay] = await Promise.all([
        applications.decideOrder(engineer, ordered.id, approve),
        applications.decideOrder(engineer, ordered.id, approve),
      ]);
      expect(decided.approval).toMatchObject({
        status: "approved",
        decidedBy: engineer.userId,
      });
      expect(replay).toEqual(decided);
      expect(decided.executionEnabled).toBe(false);
      expect(decided.settings).toEqual(ordered.settings);
      expect((await applications.order(owner, request)).approval).toEqual(
        decided.approval,
      );
      await expect(
        applications.decideOrder(engineer, ordered.id, {
          decision: "rejected",
          reason: "Changed",
          confirmDecision: true,
        }),
      ).rejects.toMatchObject({ code: "40001" });
      const rejectedOrder = await applications.order(owner, {
        ...request,
        idempotencyKey: randomUUID(),
        name: "Order to reject",
      });
      const rejected = await applications.decideOrder(
        engineer,
        rejectedOrder.id,
        {
          decision: "rejected",
          reason: "Outside approved scope",
          confirmDecision: true,
        },
      );
      expect(rejected.approval).toMatchObject({
        status: "rejected",
        reason: "Outside approved scope",
      });
      await expect(attemptJob(rejectedOrder.id)).rejects.toMatchObject({
        code: "40001",
        message: "application_order_not_approved",
      });
      const directVersion = await applications.publish(engineer, {
        template,
        deploymentPolicy: "direct",
      });
      const directOrder = await applications.order(owner, {
        ...request,
        versionId: directVersion.id,
        idempotencyKey: randomUUID(),
        name: "Direct order",
      });
      expect(directOrder.approval).toEqual({ status: "not-required" });
      await expect(
        applications.decideOrder(engineer, directOrder.id, approve),
      ).rejects.toMatchObject({
        code: "40001",
        message: "application_approval_not_required",
      });
      for (const sql of [
        "UPDATE lzc.application_order_decisions SET reason='changed' WHERE instance_id=$1",
        "DELETE FROM lzc.application_order_decisions WHERE instance_id=$1",
      ])
        await expect(migration.query(sql, [ordered.id])).rejects.toMatchObject({
          code: "55000",
        });
      await expect(
        withTenant(pool, owner, (client) =>
          client.query(
            "INSERT INTO lzc.application_order_decisions(instance_id,tenant_id,decision,decided_by,reason) VALUES($1,$2,'approved',$3,'')",
            [ownOrder.id, tenantId, owner.userId],
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      expect(
        (await applications.listInstances(owner)).find(
          (item) => item.id === ordered.id,
        )?.approval,
      ).toEqual(decided.approval);
      const confirmation = { confirmDeletion: true };
      await expect(
        applications.deleteOrder(owner, ownOrder.id, confirmation),
      ).rejects.toMatchObject({ code: "42501" });
      expect(() =>
        applications.deleteOrder(owner, ordered.id, { confirmDeletion: false }),
      ).toThrow();
      await organisations.switch(alice, alice.tenantId);
      await expect(
        applications.deleteOrder(alice, ordered.id, confirmation),
      ).rejects.toMatchObject({ code: "42501" });
      await organisations.switch(alice, tenantId);
      const deleted = await applications.deleteOrder(
        owner,
        ordered.id,
        confirmation,
      );
      expect(deleted).toMatchObject({
        instanceId: ordered.id,
        deletedBy: owner.userId,
      });
      expect(
        await applications.deleteOrder(engineer, ordered.id, confirmation),
      ).toEqual(deleted);
      await expect(
        applications.decideOrder(engineer, ordered.id, approve),
      ).rejects.toMatchObject({
        code: "40001",
        message: "application_order_deleted",
      });
      expect(
        (await applications.listInstances(owner)).some(
          (item) => item.id === ordered.id,
        ),
      ).toBe(false);
      await expect(applications.order(owner, request)).rejects.toMatchObject({
        code: "application_order_deleted",
        status: 409,
      });
      await expect(attemptJob(ordered.id)).rejects.toMatchObject({
        code: "40001",
        message: "application_order_deleted",
      });
      await expect(
        applications.preparePlanInput(owner, ordered.id),
      ).rejects.toMatchObject({ status: 404 });
      expect(
        (
          await migration.query(
            "SELECT decision FROM lzc.application_order_decisions WHERE instance_id=$1",
            [ordered.id],
          )
        ).rows,
      ).toEqual([{ decision: "approved" }]);
      for (const sql of [
        "UPDATE lzc.application_order_deletions SET deleted_at=now() WHERE instance_id=$1",
        "DELETE FROM lzc.application_order_deletions WHERE instance_id=$1",
      ])
        await expect(migration.query(sql, [ordered.id])).rejects.toMatchObject({
          code: "55000",
        });
      await expect(
        withTenant(pool, owner, (client) =>
          client.query(
            "INSERT INTO lzc.application_order_deletions(instance_id,tenant_id,deleted_by) VALUES($1,$2,$3)",
            [ownOrder.id, tenantId, owner.userId],
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await applications.deleteOrder(engineer, ownOrder.id, confirmation);
      await expect(
        applications.decideOrder(engineer, ownOrder.id, approve),
      ).rejects.toMatchObject({
        code: "40001",
        message: "application_order_deleted",
      });
      const pendingDeletion = await applications.order(owner, {
        ...request,
        idempotencyKey: randomUUID(),
        name: "Pending deletion",
      });
      await applications.deleteOrder(
        engineer,
        pendingDeletion.id,
        confirmation,
      );
      await expect(
        applications.decideOrder(engineer, pendingDeletion.id, approve),
      ).rejects.toMatchObject({
        code: "40001",
        message: "application_order_deleted",
      });
      await organisations.switch(bob, bob.tenantId);
      expect(
        (
          await withTenant(pool, bob, (client) =>
            client.query("SELECT * FROM lzc.application_order_decisions"),
          )
        ).rows,
      ).toEqual([]);
    } finally {
      await organisations.switch(alice, alice.tenantId);
      await organisations.switch(bob, bob.tenantId);
    }
  });

  it("isolates immutable application publications and idempotent orders with current product roles", async () => {
    const organisations = new PostgresOrganisations(pool);
    const tenantId = await organisations.create(
      alice,
      "Application catalogue",
      randomUUID(),
    );
    const engineer = { ...alice, tenantId };
    const owner = { ...bob, tenantId };
    const concurrentPool = new pg.Pool({
      ...migrationConfig,
      user: "configurator_app",
      password: "runtime-test-only",
      max: 4,
    });
    const applications = new Applications(concurrentPool);
    try {
      await organisations.switch(alice, tenantId);
      await expect(applications.listTemplates(alice)).rejects.toMatchObject({
        code: "42501",
      });
      const template = {
        id: randomUUID(),
        key: "local-network",
        name: "Public local network",
        kind: "public",
        region: "eu01",
        settings: {
          env: "dev",
          network_enabled: true,
          network_prefix_length: 24,
        },
      };
      const published = await applications.publish(engineer, { template });
      expect(published.version).toBe(1);
      expect((await applications.publish(engineer, { template })).id).toBe(
        published.id,
      );
      const updated = await applications.publish(engineer, {
        template: {
          ...template,
          settings: { ...template.settings, network_prefix_length: 26 },
        },
      });
      expect(updated.version).toBe(2);
      expect(updated.id).not.toBe(published.id);
      expect(
        (await applications.listTemplates(engineer)).find(
          (row) => row.id === published.id,
        )?.template.settings.network_prefix_length,
      ).toBe(24);
      expect(await applications.listTemplates(bob)).toEqual([]);
      const request = {
        versionId: published.id,
        idempotencyKey: randomUUID(),
        name: "First application",
        parameters: {},
      };
      await expect(applications.order(bob, request)).rejects.toMatchObject({
        status: 404,
      });
      const [first, replay] = await Promise.all([
        applications.order(engineer, request),
        applications.order(engineer, request),
      ]);
      expect(first.id).toBe(replay.id);
      expect(first.stateKey).toBe(
        `applications/${tenantId}/${first.id}/terraform.tfstate`,
      );
      expect(first.settings.network_prefix_length).toBe(24);
      expect(first.planStatus).toBe("blocked");
      expect(first.executionEnabled).toBe(false);
      expect(first.blockers.length).toBeGreaterThanOrEqual(3);
      const api = buildApp({
        applications,
        auth: {
          origin: "https://configurator.example",
          clientId: "test",
          store,
          github: { authorize: vi.fn() },
          tokens: { put: vi.fn(), get: vi.fn(), remove: vi.fn() },
        },
      });
      const headers = {
        cookie: `__Host-lzc-session=${aliceToken}`,
        origin: "https://configurator.example",
        "x-lzc-csrf": alice.csrfToken,
        "x-lzc-tenant": tenantId,
      };
      try {
        const response = await api.inject({
          method: "POST",
          url: "/api/v1/applications/instances",
          headers,
          payload: request,
        });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
          id: first.id,
          stateKey: first.stateKey,
          executionEnabled: false,
          planStatus: "blocked",
        });
        expect(
          (
            await api.inject({ url: "/api/v1/applications/instances", headers })
          ).json(),
        ).toMatchObject({ instances: [{ id: first.id }] });
        expect(
          (
            await api.inject({
              url: "/api/v1/applications/templates",
              headers: { ...headers, "x-lzc-tenant": bob.tenantId },
            })
          ).statusCode,
        ).toBe(403);
        const rejected = await api.inject({
          method: "POST",
          url: "/api/v1/applications/instances",
          headers,
          payload: { ...request, owner_email: "injected@example.com" },
        });
        expect(rejected.statusCode).toBe(400);
        expect(rejected.json()).toEqual({
          error: "invalid_application_request",
        });
      } finally {
        await api.close();
      }
      await expect(
        applications.order(engineer, { ...request, name: "Changed order" }),
      ).rejects.toMatchObject({ status: 409, code: "idempotency_conflict" });
      await expect(
        applications.order(engineer, {
          ...request,
          idempotencyKey: randomUUID(),
          parameters: { network_enabled: false },
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(() =>
        applications.order(engineer, {
          ...request,
          owner_email: "injected@example.com",
        }),
      ).toThrow();
      await expect(
        withTenant(pool, engineer, (client) =>
          client.query(
            "UPDATE lzc.application_template_versions SET version=5 WHERE id=$1",
            [published.id],
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        migration.query(
          "UPDATE lzc.application_template_versions SET version=5 WHERE id=$1",
          [published.id],
        ),
      ).rejects.toMatchObject({ code: "55000" });
      await inviteMember(engineer, bob, ["application-owner"], false);
      await organisations.switch(bob, tenantId);
      expect((await applications.listTemplates(owner)).length).toBe(2);
      const groups = await applications.listGroups(engineer);
      const defaultGroup = groups.groups.find((group) => group.isDefault);
      expect(defaultGroup?.memberIds).toContain(owner.userId);
      const groupMemberIdentity = (
        await new StackitIdentities(pool).status(owner)
      ).identity;
      if (!groupMemberIdentity) throw new Error("Expected member identity");
      await new StackitIdentities(pool).save(owner, {
        ...groupMemberIdentity,
        tokenExpiresAt: new Date(Date.now() + 300000).toISOString(),
        organization: null,
      });
      await migration.query(
        "UPDATE lzc_auth.users SET github_login=NULL WHERE id=$1",
        [owner.userId],
      );
      try {
        const stackitGroups = await applications.listGroups(engineer);
        expect(
          stackitGroups.members.find(
            (member) => member.userId === owner.userId,
          ),
        ).toMatchObject({ login: null, email: groupMemberIdentity.email });
        for (const [lookupSession, lookupTenant] of [
          [owner.id, tenantId],
          [engineer.id, randomUUID()],
        ]) {
          expect(
            (
              await withTenant(pool, engineer, (client) =>
                client.query(
                  "SELECT * FROM lzc_auth.application_group_member_emails($1,$2)",
                  [lookupSession, lookupTenant],
                ),
              )
            ).rows,
          ).toEqual([]);
        }
        expect(
          (
            await withTenant(pool, owner, (client) =>
              client.query(
                "SELECT * FROM lzc_auth.application_group_member_emails($1,$2)",
                [owner.id, tenantId],
              ),
            )
          ).rows,
        ).toEqual([]);
      } finally {
        await migration.query(
          "UPDATE lzc_auth.users SET github_login=$2 WHERE id=$1",
          [owner.userId, owner.login],
        );
      }
      const restrictedGroup = await applications.createGroup(engineer, {
        name: "Research applications",
      });
      await applications.setTemplateGroups(engineer, published.id, {
        groupIds: [restrictedGroup.id],
        confirmAccessChange: true,
      });
      expect(
        (await applications.listTemplates(owner)).some(
          (item) => item.id === published.id,
        ),
      ).toBe(false);
      await expect(
        applications.order(owner, { ...request, idempotencyKey: randomUUID() }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        applications.createGroup(owner, { name: "Escalation" }),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        applications.setGroupMembers(engineer, restrictedGroup.id, {
          memberIds: [randomUUID()],
          confirmMembershipChange: true,
        }),
      ).rejects.toMatchObject({ code: "42501" });
      if (!defaultGroup) throw new Error("Default group missing");
      await expect(
        applications.deleteGroup(engineer, defaultGroup.id, {
          confirmDeletion: true,
        }),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        applications.deleteGroup(owner, restrictedGroup.id, {
          confirmDeletion: true,
        }),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        applications.deleteGroup(engineer, restrictedGroup.id, {
          confirmDeletion: true,
        }),
      ).rejects.toMatchObject({
        status: 409,
        code: "application_group_in_use",
      });
      const removableGroup = await applications.createGroup(engineer, {
        name: "Temporary team",
      });
      expect(() =>
        applications.deleteGroup(engineer, removableGroup.id, {
          confirmDeletion: false,
        }),
      ).toThrow();
      await expect(
        applications.deleteGroup(bob, removableGroup.id, {
          confirmDeletion: true,
        }),
      ).rejects.toMatchObject({ code: "42501" });
      await applications.setGroupMembers(engineer, removableGroup.id, {
        memberIds: [owner.userId, engineer.userId],
        confirmMembershipChange: true,
      });
      await migration.query(
        "UPDATE lzc.memberships SET product_roles=product_roles WHERE tenant_id=$1 AND user_id=$2",
        [tenantId, engineer.userId],
      );
      expect(
        (await applications.listGroups(engineer)).groups.find(
          (group) => group.id === removableGroup.id,
        )?.memberIds,
      ).toEqual([owner.userId, engineer.userId].sort());
      await applications.deleteGroup(engineer, removableGroup.id, {
        confirmDeletion: true,
      });
      expect(
        (await applications.listGroups(engineer)).groups.some(
          (group) => group.id === removableGroup.id,
        ),
      ).toBe(false);
      expect(
        (await new PostgresOrganisations(pool).overview(engineer)).members.some(
          (member) => member.userId === owner.userId,
        ),
      ).toBe(true);
      await expect(
        applications.setGroupMembers(engineer, defaultGroup.id, {
          memberIds: [],
          confirmMembershipChange: true,
        }),
      ).rejects.toMatchObject({ code: "42501" });
      await applications.setGroupMembers(engineer, restrictedGroup.id, {
        memberIds: [owner.userId],
        confirmMembershipChange: true,
      });
      expect(
        (await applications.listTemplates(owner)).find(
          (item) => item.id === published.id,
        )?.allowedGroupIds,
      ).toEqual([restrictedGroup.id]);
      await applications.setGroupMembers(engineer, restrictedGroup.id, {
        memberIds: [],
        confirmMembershipChange: true,
      });
      expect(
        (await applications.listTemplates(owner)).some(
          (item) => item.id === published.id,
        ),
      ).toBe(false);
      await applications.setGroupMembers(engineer, restrictedGroup.id, {
        memberIds: [owner.userId],
        confirmMembershipChange: true,
      });
      await expect(
        applications.publish(owner, { template }),
      ).rejects.toMatchObject({ code: "42501" });
      expect(await applications.listInstances(owner)).toEqual([]);
      const identities = new StackitIdentities(pool);
      const proof = (await identities.status(owner)).identity;
      if (!proof) throw new Error("Expected existing test STACKIT identity");
      await identities.save(owner, {
        ...proof,
        tokenExpiresAt: new Date(Date.now() + 300000).toISOString(),
        organization: null,
      });
      const own = await applications.order(owner, {
        ...request,
        idempotencyKey: randomUUID(),
        name: "Owner application",
      });
      expect(own.id).not.toBe(first.id);
      expect(own.settings.owner_email).toBe(proof.email);
      expect(own.blockers).not.toContain(
        "Verifizierte STACKIT-Benutzeridentität für diese Bestellung fehlt.",
      );
      expect(own.executionEnabled).toBe(false);
      expect(
        (await applications.listInstances(owner)).map((row) => row.id),
      ).toEqual([own.id]);
      await identities.revoke(owner);
      const revoked = await applications.order(owner, {
        ...request,
        idempotencyKey: randomUUID(),
        name: "Revoked identity",
      });
      expect(revoked.settings.owner_email).toBeUndefined();
      expect(revoked.blockers).toContain(
        "Verifizierte STACKIT-Benutzeridentität für diese Bestellung fehlt.",
      );
      await migration.query(
        "UPDATE lzc.stackit_identities SET revoked_at=NULL,valid_until=now()-interval '1 second' WHERE user_id=$1",
        [owner.userId],
      );
      const expired = await applications.order(owner, {
        ...request,
        idempotencyKey: randomUUID(),
        name: "Expired identity",
      });
      expect(expired.settings.owner_email).toBeUndefined();
      expect(expired.blockers).toContain(
        "Verifizierte STACKIT-Benutzeridentität für diese Bestellung fehlt.",
      );
      await expect(
        withTenant(pool, owner, (client) =>
          client.query(
            "INSERT INTO lzc.application_instances(tenant_id,version_id,requested_by,idempotency_key,name,parameters,resolved_settings,qualification_blockers) VALUES($1,$2,$3,$4,'injected','{}','{}','[\"blocked\"]')",
            [tenantId, published.id, alice.userId, randomUUID()],
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      const beforeRetirement = await applications.listInstances(engineer);
      expect(() =>
        applications.retire(engineer, published.id, {
          confirmRetirement: false,
        }),
      ).toThrow();
      await expect(
        applications.retire(owner, published.id, { confirmRetirement: true }),
      ).rejects.toMatchObject({ code: "42501" });
      const [retired, retiredAgain] = await Promise.all([
        applications.retire(engineer, published.id, {
          confirmRetirement: true,
        }),
        applications.retire(engineer, published.id, {
          confirmRetirement: true,
        }),
      ]);
      expect(retiredAgain).toEqual(retired);
      expect(retired.retiredBy).toBe(engineer.userId);
      expect(
        (await applications.listTemplates(owner)).map((row) => row.id),
      ).toEqual([updated.id]);
      expect(
        (await applications.listTemplates(engineer)).find(
          (row) => row.id === published.id,
        ),
      ).toMatchObject({
        retiredAt: retired.retiredAt,
        template: published.template,
      });
      await expect(
        applications.order(owner, { ...request, idempotencyKey: randomUUID() }),
      ).rejects.toMatchObject({
        status: 409,
        code: "template_version_retired",
      });
      expect((await applications.order(engineer, request)).id).toBe(first.id);
      expect(await applications.listInstances(engineer)).toEqual(
        beforeRetirement,
      );
      await expect(
        withTenant(pool, owner, (client) =>
          client.query(
            "INSERT INTO lzc.application_instances(tenant_id,version_id,requested_by,idempotency_key,name,parameters,resolved_settings,qualification_blockers) VALUES($1,$2,$3,$4,'retired','{}','{}','[\"blocked\"]')",
            [tenantId, published.id, owner.userId, randomUUID()],
          ),
        ),
      ).rejects.toMatchObject({
        code: "55000",
        message: "template_version_retired",
      });
      await expect(
        withTenant(pool, owner, (client) =>
          client.query(
            "INSERT INTO lzc.application_template_retirements(tenant_id,version_id,retired_by) VALUES($1,$2,$3)",
            [tenantId, updated.id, owner.userId],
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        migration.query(
          "UPDATE lzc.application_template_retirements SET retired_at=now() WHERE tenant_id=$1 AND version_id=$2",
          [tenantId, published.id],
        ),
      ).rejects.toMatchObject({ code: "55000" });
      const [racingOrder, racingRetirement] = await Promise.allSettled([
        applications.order(engineer, {
          ...request,
          versionId: updated.id,
          idempotencyKey: randomUUID(),
        }),
        applications.retire(engineer, updated.id, { confirmRetirement: true }),
      ]);
      expect(racingRetirement.status).toBe("fulfilled");
      if (racingOrder.status === "rejected")
        expect(racingOrder.reason).toMatchObject({
          code: "template_version_retired",
        });
      else expect(racingOrder.value.versionId).toBe(updated.id);
      expect(await applications.listTemplates(owner)).toEqual([]);
      const republished = await applications.publish(engineer, {
        template: updated.template,
      });
      expect(republished.version).toBe(3);
      expect(republished.retiredAt).toBeUndefined();
      expect(republished.id).not.toBe(updated.id);
      const changedPolicy = await applications.publish(engineer, {
        template: updated.template,
        deploymentPolicy: "direct",
      });
      expect(changedPolicy.version).toBe(4);
      expect(changedPolicy.deploymentPolicy).toBe("direct");
      expect(changedPolicy.template).toEqual(republished.template);
      expect(
        (
          await applications.publish(engineer, {
            template: updated.template,
            deploymentPolicy: "direct",
          })
        ).id,
      ).toBe(changedPolicy.id);
      const policyOrder = await applications.order(engineer, {
        ...request,
        versionId: changedPolicy.id,
        idempotencyKey: randomUUID(),
      });
      expect(policyOrder.deploymentPolicy).toBe("direct");
      expect(policyOrder.executionEnabled).toBe(false);
      expect(
        (await applications.order(engineer, request)).deploymentPolicy,
      ).toBe("approval-required");
      expect(() =>
        applications.order(engineer, {
          ...request,
          deploymentPolicy: "direct",
        }),
      ).toThrow("invalid_application_request");
      await expect(
        withTenant(pool, engineer, (client) =>
          client.query(
            "INSERT INTO lzc.application_instances(tenant_id,version_id,requested_by,idempotency_key,name,parameters,resolved_settings,qualification_blockers) VALUES($1,$2,$3,$4,'policy override','{}','{}','[\"blocked\"]')",
            [tenantId, changedPolicy.id, engineer.userId, randomUUID()],
          ),
        ),
      ).rejects.toMatchObject({
        code: "55000",
        message: "application_policy_mismatch",
      });
      await expect(
        migration.query(
          "UPDATE lzc.application_instances SET deployment_policy='approval-required' WHERE id=$1",
          [policyOrder.id],
        ),
      ).rejects.toMatchObject({ code: "55000" });
      expect(
        (await applications.listTemplates(owner)).map((row) => row.id),
      ).toEqual([changedPolicy.id, republished.id]);
      await expect(applications.listTemplates(bob)).rejects.toMatchObject({
        code: "42501",
      });
      await organisations.editMember(
        engineer,
        bob.userId,
        ["platform-engineer"],
        false,
      );
      await organisations.editMember(
        engineer,
        bob.userId,
        ["application-owner"],
        false,
      );
      await migration.query(
        "UPDATE lzc.memberships SET product_roles='{}' WHERE tenant_id=$1 AND user_id=$2",
        [tenantId, bob.userId],
      );
      await expect(applications.listTemplates(owner)).rejects.toMatchObject({
        code: "42501",
      });
      await organisations.switch(bob, bob.tenantId);
      await organisations.editMember(engineer, bob.userId, [], false, true);
      await expect(
        organisations.archive(alice, tenantId),
      ).rejects.toMatchObject({ code: "55000" });
    } finally {
      await organisations.switch(alice, alice.tenantId);
      await organisations.switch(bob, bob.tenantId);
      await concurrentPool.end();
    }
  }, 30000);
  it("binds immutable platform contracts to template versions with current verified PE approval", async () => {
    const organisations = new PostgresOrganisations(pool);
    const identities = new StackitIdentities(pool);
    const organizationId = randomUUID();
    const profileId = randomUUID();
    const technical = {
      list: vi.fn(async () => [
        {
          id: profileId,
          name: "Tenant automation",
          serviceAccount: "automation@sa.stackit.cloud",
          keyId: "test-key",
          state: "stored" as const,
          createdAt: new Date(),
        },
      ]),
      verifyForPreparation: vi.fn(async () => ({
        check: {
          status: "passed" as const,
          code: "organization_readable" as const,
          organizationId,
          organizationName: "Approved platform",
          checkedAt: new Date().toISOString(),
        },
        version: 1,
        keyId: "test-key",
      })),
    };
    const applicationSecret = {
      version: 1,
      key: {
        credentials: {
          kid: "test-key",
          iss: "automation@sa.stackit.cloud",
          sub: randomUUID(),
          aud: "https://service-account.api.stackit.cloud" as const,
          privateKey: "APPLICATION-VAULT-MOCK-ONLY",
        },
      },
    };
    const applicationSecrets = { get: vi.fn(async () => applicationSecret) };
    const applicationBackends = { runner: vi.fn<Backends["runner"]>() };
    const applications = new Applications(
      pool,
      technical,
      applicationSecrets,
      applicationBackends,
    );
    const tenantId = await organisations.create(
      alice,
      "Approved platform",
      organizationId,
    );
    const engineer = { ...alice, tenantId };
    const owner = { ...bob, tenantId };
    const template = {
      id: randomUUID(),
      key: "approved-public",
      name: "Public local network",
      kind: "public",
      region: "eu01",
      settings: {
        env: "dev",
        network_enabled: true,
        network_prefix_length: 24,
        observability: {
          enabled: true,
          plan_name: "Observability-Starter-EU01",
          acl: [],
        },
      },
    };
    const input = {
      schema_version: 1,
      organization_id: organizationId,
      confirmApproval: true,
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
    try {
      await organisations.switch(alice, tenantId);
      await expect(
        applications.approvePlatformContract(engineer, input),
      ).rejects.toMatchObject({
        status: 403,
        code: "verified_platform_organization_required",
      });
      const proof = (await identities.status(engineer)).identity;
      if (!proof) throw new Error("Expected existing PE STACKIT identity");
      await identities.save(engineer, {
        ...proof,
        tokenExpiresAt: new Date(Date.now() + 300000).toISOString(),
        organization: null,
      });
      const approved = await applications.approvePlatformContract(
        engineer,
        input,
      );
      await expect(
        applications.approvePlatformContract(engineer, {
          ...input,
          credentialProfileId: randomUUID(),
        }),
      ).rejects.toMatchObject({
        status: 409,
        code: "application_credential_required",
      });
      technical.list.mockResolvedValueOnce([]);
      await expect(
        applications.approvePlatformContract(engineer, input),
      ).rejects.toMatchObject({
        status: 409,
        code: "application_credential_required",
      });
      const failedTechnical = new Applications(pool, {
        ...technical,
        verifyForPreparation: async () => {
          const checked = await technical.verifyForPreparation();
          return {
            ...checked,
            check: { ...checked.check, status: "failed" as const },
          };
        },
      });
      await expect(
        failedTechnical.approvePlatformContract(engineer, input),
      ).rejects.toMatchObject({
        status: 422,
        code: "application_technical_access_failed",
      });
      expect(approved.document).toMatchObject({
        schema_version: 1,
        tenant_id: tenantId,
        organization_id: organizationId,
        targets: input.targets,
      });
      expect(approved.approvedBy).toBe(alice.userId);
      await expect(
        migration.query(
          "INSERT INTO lzc.application_platform_contracts(revision,tenant_id,organization_id,approved_by,credential_profile_id,credential_version,credential_key_id,credential_checked_at,document) SELECT $1,tenant_id,organization_id,approved_by,credential_profile_id,credential_version,credential_key_id,credential_checked_at,jsonb_build_object('tenant_id',tenant_id,'revision',$1::uuid) FROM lzc.application_platform_contracts WHERE revision=$2",
          [randomUUID(), approved.document.revision],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      expect(technical.verifyForPreparation).toHaveBeenCalledWith(
        engineer,
        profileId,
        organizationId,
      );
      expect(await applications.listPlatformContracts(bob)).toEqual([]);
      const binding = {
        platformRevision: approved.document.revision,
        targetKey: "public",
      };
      await expect(
        applications.publish(bob, { template, ...binding }),
      ).rejects.toMatchObject({
        status: 404,
        code: "platform_contract_not_found",
      });
      await expect(
        applications.publish(engineer, {
          template,
          ...binding,
          targetKey: "missing",
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: "invalid_application_target",
      });
      await expect(
        applications.publish(engineer, {
          template: { ...template, region: "eu02" },
          ...binding,
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: "invalid_application_target",
      });
      const first = await applications.publish(engineer, {
        template,
        ...binding,
      });
      expect(first).toMatchObject({ version: 1, ...binding });
      expect(
        (await applications.publish(engineer, { template, ...binding })).id,
      ).toBe(first.id);
      const next = await applications.approvePlatformContract(engineer, input);
      const second = await applications.publish(engineer, {
        template,
        platformRevision: next.document.revision,
        targetKey: "public",
      });
      expect(second.version).toBe(2);
      expect(
        (await applications.listTemplates(engineer)).find(
          (item) => item.id === first.id,
        )?.platformRevision,
      ).toBe(approved.document.revision);
      await expect(
        withTenant(pool, engineer, (client) =>
          client.query(
            "UPDATE lzc.application_platform_contracts SET approved_by=$1 WHERE revision=$2",
            [bob.userId, approved.document.revision],
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        migration.query(
          "UPDATE lzc.application_platform_contracts SET document=document WHERE revision=$1",
          [approved.document.revision],
        ),
      ).rejects.toMatchObject({ code: "55000" });
      await inviteMember(engineer, bob, ["application-owner"], false);
      await organisations.switch(bob, tenantId);
      expect(await applications.listPlatformContracts(owner)).toHaveLength(2);
      await expect(
        applications.approvePlatformContract(owner, input),
      ).rejects.toMatchObject({ code: "42501" });
      const ownerProof = (await identities.status(owner)).identity;
      if (!ownerProof) throw new Error("Expected existing AO STACKIT identity");
      await identities.save(owner, {
        ...ownerProof,
        tokenExpiresAt: new Date(Date.now() + 300000).toISOString(),
        organization: null,
      });
      const order = await applications.order(owner, {
        versionId: first.id,
        idempotencyKey: randomUUID(),
        name: "Bound owner application",
        parameters: {},
      });
      expect(order.settings.owner_email).toBe(ownerProof.email);
      expect(order.executionEnabled).toBe(false);
      expect(order.blockers).toEqual([
        "Der isolierte Application-Plan-Runner ist noch nicht freigegeben. Es wurde kein Cloud-Plan ausgeführt.",
      ]);
      const prepared = await applications.preparePlanInput(owner, order.id);
      expect(prepared).toMatchObject({
        kind: "application-plan-input",
        cloudPlanExecuted: false,
        plan: {
          entrypoint: "src/application",
          executionEnabled: false,
          requestedBy: bob.userId,
          stateKey: order.stateKey,
          variables: {
            application: {
              owner_email: ownerProof.email,
              network_enabled: true,
              network_prefix_length: 24,
              platform_revision: approved.document.revision,
            },
            platform_contract: {
              revision: approved.document.revision,
              targets: input.targets,
            },
          },
        },
      });
      await expect(
        applications.preparePlanInput(engineer, order.id),
      ).rejects.toMatchObject({ status: 404 });
      const directVersion = await applications.publish(engineer, {
        template,
        ...binding,
        deploymentPolicy: "direct",
      });
      const directOrder = await applications.order(owner, {
        versionId: directVersion.id,
        idempotencyKey: randomUUID(),
        name: "Direct policy",
        parameters: order.parameters,
      });
      expect(
        await applications.preparePlanInput(owner, directOrder.id),
      ).toMatchObject({
        cloudPlanExecuted: false,
        requiresExplicitApplyApproval: true,
        plan: { applyPolicy: "direct", executionEnabled: false },
      });
      const jobRequest = { idempotencyKey: randomUUID(), confirmPlan: true };
      await expect(
        applications.prepareJob(owner, order.id, jobRequest),
      ).rejects.toMatchObject({ code: "application_runner_revision_required" });
      const applicationRevision = "4d15d7870afa323badd93559d8b37c5a8d138dcf";
      const runnerVersion = await applications.publish(engineer, {
        template,
        ...binding,
        acceleratorRevision: applicationRevision,
        deploymentPolicy: "direct",
      });
      expect(runnerVersion.version).toBe(directVersion.version + 1);
      expect(
        (
          await applications.publish(engineer, {
            template,
            ...binding,
            acceleratorRevision: applicationRevision,
            deploymentPolicy: "direct",
          })
        ).id,
      ).toBe(runnerVersion.id);
      expect(
        (await applications.listTemplates(engineer)).find(
          (item) => item.id === first.id,
        )?.acceleratorRevision,
      ).toBe("a256f6896d11134fdc351786f1be5eba4e56b2e2");
      expect(() =>
        applications.publish(engineer, {
          template,
          ...binding,
          acceleratorRevision: "0".repeat(40),
        }),
      ).toThrow();
      const jobOrder = await applications.order(owner, {
        versionId: runnerVersion.id,
        idempotencyKey: randomUUID(),
        name: "Application job",
        parameters: {},
      });
      await expect(
        applications.prepareJob(owner, jobOrder.id, jobRequest),
      ).rejects.toMatchObject({ code: "42501" });
      await identities.save(engineer, {
        ...proof,
        tokenExpiresAt: new Date(Date.now() + 300000).toISOString(),
        organization: {
          id: organizationId,
          name: "Approved platform",
          permissions: ["organization.read", "organization.write"],
          ownerPermissions: ["organization.read", "organization.write"],
        },
      });
      await identities.bindOrganization(engineer, {
        confirmOrganizationBinding: true,
      });
      expect(() =>
        applications.prepareJob(owner, jobOrder.id, {
          ...jobRequest,
          confirmPlan: false,
        }),
      ).toThrow();
      expect(() =>
        applications.prepareJob(owner, jobOrder.id, {
          ...jobRequest,
          credentialProfileId: profileId,
        }),
      ).toThrow();
      const job = await applications.prepareJob(owner, jobOrder.id, jobRequest);
      expect(job).toMatchObject({
        instanceId: jobOrder.id,
        status: "prepared",
        executionEnabled: false,
        cloudPlanExecuted: false,
      });
      expect(await applications.listJobs(owner, jobOrder.id)).toEqual([
        expect.objectContaining({
          id: job.id,
          requestedBy: owner.userId,
          approvedBy: engineer.userId,
          status: "prepared",
          grantActive: true,
          canApproveBackend: false,
          canDispatch: false,
          summary: null,
          errorCode: null,
        }),
      ]);
      expect(await applications.listJobs(engineer, jobOrder.id)).toEqual([
        expect.objectContaining({
          id: job.id,
          canApproveBackend: true,
          canDispatch: false,
        }),
      ]);
      expect(
        await applications.prepareJob(owner, jobOrder.id, jobRequest),
      ).toEqual(job);
      const cliRevision = "57ad1f6a651c1787694b74ff8aa8b241a3dcd16f";
      const cliVersion = await applications.publish(engineer, {
        template,
        ...binding,
        acceleratorRevision: cliRevision,
        deploymentPolicy: "direct",
      });
      expect(cliVersion.version).toBe(runnerVersion.version + 1);
      expect(
        (
          await applications.publish(engineer, {
            template,
            ...binding,
            acceleratorRevision: cliRevision,
            deploymentPolicy: "direct",
          })
        ).id,
      ).toBe(cliVersion.id);
      const cliOrder = await applications.order(owner, {
        versionId: cliVersion.id,
        idempotencyKey: randomUUID(),
        name: "CLI compatible source",
        parameters: {},
      });
      expect(cliOrder.canDelete).toBe(true);
      const cliJobRequest = { idempotencyKey: randomUUID(), confirmPlan: true };
      const cliJob = await applications.prepareJob(
        owner,
        cliOrder.id,
        cliJobRequest,
      );
      const plannedObservability = (
        await withTenant(pool, owner, (client) =>
          client.query(
            "SELECT inputs->'variables'->'application'->'observability' AS observability FROM lzc.application_jobs WHERE id=$1",
            [cliJob.id],
          ),
        )
      ).rows[0].observability;
      expect(plannedObservability).toMatchObject({
        enabled: true,
        plan_name: "Observability-Starter-EU01",
        acl: [],
      });
      expect(plannedObservability).not.toHaveProperty("access_source");
      expect(
        await applications.prepareJob(owner, cliOrder.id, cliJobRequest),
      ).toEqual(cliJob);
      const sourceGrants = (
        await withTenant(pool, owner, (client) =>
          client.query(
            "SELECT job_id,accelerator_revision FROM lzc.application_job_grants WHERE job_id=ANY($1::uuid[])",
            [[job.id, cliJob.id]],
          ),
        )
      ).rows;
      expect(sourceGrants).toEqual(
        expect.arrayContaining([
          { job_id: job.id, accelerator_revision: applicationRevision },
          { job_id: cliJob.id, accelerator_revision: cliRevision },
        ]),
      );
      expect(
        (await applications.listTemplates(engineer)).find(
          (item) => item.id === runnerVersion.id,
        )?.acceleratorRevision,
      ).toBe(applicationRevision);
      await expect(
        applications.prepareJob(engineer, jobOrder.id, jobRequest),
      ).rejects.toMatchObject({ status: 404 });
      const grant = (
        await withTenant(pool, owner, (client) =>
          client.query(
            "SELECT * FROM lzc.application_job_grants WHERE job_id=$1",
            [job.id],
          ),
        )
      ).rows[0];
      expect(grant).toMatchObject({
        owner_user_id: owner.userId,
        instance_id: jobOrder.id,
        version_id: runnerVersion.id,
        platform_revision: approved.document.revision,
        credential_profile_id: profileId,
        credential_version: 1,
        credential_key_id: "test-key",
        accelerator_revision: applicationRevision,
        state_key: jobOrder.stateKey,
        operation: "plan",
        revoked_at: null,
      });
      expect(new Date(job.expiresAt).getTime()).toBeLessThanOrEqual(
        Date.now() + 300000,
      );
      expect(
        (
          await withTenant(pool, bob, (client) =>
            client.query("SELECT * FROM lzc.application_job_grants"),
          )
        ).rows,
      ).toEqual([]);
      await expect(
        withTenant(pool, owner, (client) =>
          client.query(
            "INSERT INTO lzc.application_job_grants SELECT * FROM lzc.application_job_grants WHERE job_id=$1",
            [job.id],
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        migration.query(
          "UPDATE lzc.application_job_grants SET credential_version=2 WHERE job_id=$1",
          [job.id],
        ),
      ).rejects.toMatchObject({ code: "55000" });
      await expect(
        migration.query("DELETE FROM lzc.application_jobs WHERE id=$1", [
          job.id,
        ]),
      ).rejects.toMatchObject({ code: "55000" });
      const backendDescriptor = {
        bucket: "management-tfstate",
        endpoint: "https://object.storage.eu01.onstackit.cloud",
        region: "eu01",
        key: "landing-zone/terraform.tfstate",
        useLockfile: true,
      } as const;
      const backendId = randomUUID();
      const alternativeBackendId = randomUUID();
      const foreignBackendId = randomUUID();
      for (const [id, tenant] of [
        [backendId, tenantId],
        [alternativeBackendId, tenantId],
        [foreignBackendId, bob.tenantId],
      ]) {
        await migration.query(
          "INSERT INTO lzc.state_backends(id,tenant_id,descriptor,identity_sha256,credentials_ciphertext) VALUES($1,$2,$3,$4,$5)",
          [
            id,
            tenant,
            JSON.stringify(backendDescriptor),
            randomBytes(32).toString("hex"),
            Buffer.from("synthetic-ciphertext-not-used"),
          ],
        );
      }
      const backendRequest = {
        stateBackendId: backendId,
        confirmBackendApproval: true,
      };
      const deletedOrder = await applications.order(owner, {
        versionId: cliVersion.id,
        idempotencyKey: randomUUID(),
        name: "Prepared deletion",
        parameters: {},
      });
      const deletedJob = await applications.prepareJob(owner, deletedOrder.id, {
        idempotencyKey: randomUUID(),
        confirmPlan: true,
      });
      expect(
        (await applications.listInstances(owner)).find(
          (item) => item.id === deletedOrder.id,
        )?.canDelete,
      ).toBe(true);
      await applications.deleteOrder(owner, deletedOrder.id, {
        confirmDeletion: true,
      });
      expect(await applications.listJobs(engineer, deletedOrder.id)).toEqual(
        [],
      );
      await expect(
        applications.approveJobBackend(engineer, deletedJob.id, backendRequest),
      ).rejects.toMatchObject({
        code: "40001",
        message: "application_order_deleted",
      });
      await expect(
        applications.claimJobGrant(engineer, deletedJob.id),
      ).rejects.toBeDefined();
      const racePool = new pg.Pool({
        ...migrationConfig,
        user: "configurator_app",
        password: "runtime-test-only",
        max: 4,
      });
      try {
        const racing = new Applications(racePool);
        const preapprovedOrder = await applications.order(owner, {
          versionId: cliVersion.id,
          idempotencyKey: randomUUID(),
          name: "Backend approved deletion",
          parameters: {},
        });
        const preapprovedJob = await applications.prepareJob(
          owner,
          preapprovedOrder.id,
          { idempotencyKey: randomUUID(), confirmPlan: true },
        );
        await applications.approveJobBackend(
          engineer,
          preapprovedJob.id,
          backendRequest,
        );
        await applications.deleteOrder(owner, preapprovedOrder.id, {
          confirmDeletion: true,
        });
        await expect(
          applications.approveJobBackend(
            engineer,
            preapprovedJob.id,
            backendRequest,
          ),
        ).rejects.toMatchObject({
          code: "40001",
          message: "application_order_deleted",
        });
        await expect(
          applications.claimJobGrant(engineer, preapprovedJob.id),
        ).rejects.toMatchObject({
          code: "40001",
          message: "application_order_deleted",
        });
        await expect(
          applications.issueRunnerTicket(engineer, preapprovedJob.id, {
            runnerPackageId: randomUUID(),
            acceleratorRevision: cliRevision,
            providerLockSha256:
              "d40debbff204aee590c2a76d09f6ad3234643329b438fd5c6497de60687f6fa5",
          }),
        ).rejects.toMatchObject({
          code: "40001",
          message: "application_order_deleted",
        });
        for (let iteration = 0; iteration < 4; iteration++) {
          const raceOrder = await applications.order(owner, {
            versionId: cliVersion.id,
            idempotencyKey: randomUUID(),
            name: `Deletion race ${iteration}`,
            parameters: {},
          });
          const racedJob = await applications.prepareJob(owner, raceOrder.id, {
            idempotencyKey: randomUUID(),
            confirmPlan: true,
          });
          await applications.approveJobBackend(
            engineer,
            racedJob.id,
            backendRequest,
          );
          const results = await Promise.allSettled([
            racing.deleteOrder(owner, raceOrder.id, { confirmDeletion: true }),
            racing.claimJobGrant(engineer, racedJob.id),
          ]);
          expect(
            results.filter((result) => result.status === "fulfilled"),
          ).toHaveLength(1);
          const state = (
            await migration.query(
              "SELECT EXISTS(SELECT 1 FROM lzc.application_order_deletions WHERE instance_id=$1) AS deleted, EXISTS(SELECT 1 FROM lzc.application_job_claims WHERE job_id=$2) AS claimed",
              [raceOrder.id, racedJob.id],
            )
          ).rows[0];
          expect(state.deleted).not.toBe(state.claimed);
        }
      } finally {
        await racePool.end();
      }
      await expect(
        applications.approveJobBackend(owner, job.id, backendRequest),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        applications.approveJobBackend(engineer, job.id, {
          ...backendRequest,
          stateBackendId: foreignBackendId,
        }),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        applications.approveJobBackend(
          { ...engineer, id: randomUUID() },
          job.id,
          backendRequest,
        ),
      ).rejects.toMatchObject({ code: "P0002" });
      expect(() =>
        applications.approveJobBackend(engineer, job.id, {
          ...backendRequest,
          descriptor: backendDescriptor,
        }),
      ).toThrow();
      const backendApproval = await applications.approveJobBackend(
        engineer,
        job.id,
        backendRequest,
      );
      expect(backendApproval).toEqual({
        jobId: job.id,
        backendId,
        stateKey: jobOrder.stateKey,
        expiresAt: job.expiresAt,
        executionEnabled: false,
      });
      expect(
        await applications.approveJobBackend(engineer, job.id, backendRequest),
      ).toEqual(backendApproval);
      await expect(
        applications.approveJobBackend(engineer, job.id, {
          ...backendRequest,
          stateBackendId: alternativeBackendId,
        }),
      ).rejects.toMatchObject({ code: "40001" });
      expect(
        (
          await withTenant(pool, owner, (client) =>
            client.query("SELECT * FROM lzc.state_backends"),
          )
        ).rows,
      ).toEqual([]);
      const bindingRow = (
        await withTenant(pool, owner, (client) =>
          client.query(
            "SELECT * FROM lzc.application_job_backends WHERE job_id=$1",
            [job.id],
          ),
        )
      ).rows[0];
      expect(bindingRow.descriptor).toEqual({
        ...backendDescriptor,
        key: jobOrder.stateKey,
      });
      expect(bindingRow).not.toHaveProperty("credentials_ciphertext");
      await expect(
        withTenant(pool, owner, (client) =>
          client.query(
            "INSERT INTO lzc.application_job_backends SELECT * FROM lzc.application_job_backends WHERE job_id=$1",
            [job.id],
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        migration.query(
          "UPDATE lzc.application_job_backends SET backend_id=$2 WHERE job_id=$1",
          [job.id, alternativeBackendId],
        ),
      ).rejects.toMatchObject({ code: "55000" });
      const shortJob = await applications.prepareJob(
        { ...owner, expiresAt: new Date(Date.now() + 200) },
        jobOrder.id,
        { idempotencyKey: randomUUID(), confirmPlan: true },
      );
      await vi.waitFor(() =>
        expect(Date.now()).toBeGreaterThan(
          new Date(shortJob.expiresAt).getTime(),
        ),
      );
      await expect(
        applications.approveJobBackend(engineer, shortJob.id, backendRequest),
      ).rejects.toMatchObject({ code: "42501" });
      const approvalScopedJob = await applications.prepareJob(
        owner,
        jobOrder.id,
        { idempotencyKey: randomUUID(), confirmPlan: true },
      );
      const actualPeExpiry = (
        await migration.query(
          "SELECT expires_at FROM lzc_auth.sessions WHERE id=$1",
          [engineer.id],
        )
      ).rows[0]?.expires_at;
      try {
        await migration.query(
          "UPDATE lzc_auth.sessions SET expires_at=$2 WHERE id=$1",
          [engineer.id, new Date(Date.now() + 250)],
        );
        const scopedApproval = await applications.approveJobBackend(
          engineer,
          approvalScopedJob.id,
          backendRequest,
        );
        expect(new Date(scopedApproval.expiresAt).getTime()).toBeLessThan(
          new Date(approvalScopedJob.expiresAt).getTime(),
        );
        await vi.waitFor(() =>
          expect(Date.now()).toBeGreaterThan(
            new Date(scopedApproval.expiresAt).getTime(),
          ),
        );
        const freshToken = newSessionToken();
        const freshPeSession = await store.createSession({
          githubId: 101,
          login: "alice",
          id: randomUUID(),
          hash: freshToken.hash,
          csrfToken: randomBytes(32).toString("base64url"),
          expiresAt: new Date(Date.now() + 3600000),
        });
        await organisations.switch(freshPeSession, tenantId);
        await expect(
          applications.approveJobBackend(
            { ...freshPeSession, tenantId },
            approvalScopedJob.id,
            backendRequest,
          ),
        ).rejects.toMatchObject({ code: "42501" });
      } finally {
        await migration.query(
          "UPDATE lzc_auth.sessions SET expires_at=$2 WHERE id=$1",
          [engineer.id, actualPeExpiry],
        );
      }
      const revoked = await applications.revokeJobGrant(owner, job.id, {
        confirmCredentialGrantRevocation: true,
      });
      expect(
        await applications.revokeJobGrant(engineer, job.id, {
          confirmCredentialGrantRevocation: true,
        }),
      ).toEqual(revoked);
      await expect(
        applications.approveJobBackend(engineer, job.id, backendRequest),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        applications.claimJobGrant(engineer, job.id),
      ).rejects.toMatchObject({ code: "42501" });
      const claimRequest = { idempotencyKey: randomUUID(), confirmPlan: true };
      const claimOrderJob = await applications.prepareJob(
        owner,
        jobOrder.id,
        claimRequest,
      );
      await expect(
        applications.claimJobGrant(owner, claimOrderJob.id),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        applications.claimJobGrant(engineer, claimOrderJob.id),
      ).rejects.toMatchObject({ code: "42501" });
      await applications.approveJobBackend(
        engineer,
        claimOrderJob.id,
        backendRequest,
      );
      const claims = await Promise.allSettled([
        applications.claimJobGrant(engineer, claimOrderJob.id),
        applications.claimJobGrant(engineer, claimOrderJob.id),
      ]);
      expect(
        claims.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        claims.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      expect(
        claims.find((result) => result.status === "rejected"),
      ).toMatchObject({ reason: { code: "40001" } });
      expect(
        (
          await withTenant(pool, owner, (client) =>
            client.query(
              "SELECT * FROM lzc.application_job_claims WHERE job_id=$1",
              [claimOrderJob.id],
            ),
          )
        ).rows,
      ).toHaveLength(1);
      await expect(
        applications.claimJobGrant(engineer, claimOrderJob.id),
      ).rejects.toMatchObject({ code: "40001" });
      await expect(
        applications.revokeJobGrant(owner, claimOrderJob.id, {
          confirmCredentialGrantRevocation: true,
        }),
      ).rejects.toMatchObject({
        status: 409,
        code: "application_credential_grant_consumed",
      });
      await expect(
        applications.prepareJob(owner, jobOrder.id, claimRequest),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        applications.claimJobGrant(engineer, approvalScopedJob.id),
      ).rejects.toMatchObject({ code: "42501" });
      const raceJob = await applications.prepareJob(owner, jobOrder.id, {
        idempotencyKey: randomUUID(),
        confirmPlan: true,
      });
      await applications.approveJobBackend(
        engineer,
        raceJob.id,
        backendRequest,
      );
      const substituteToken = newSessionToken();
      const substitutePe = await store.createSession({
        githubId: 101,
        login: "alice",
        id: randomUUID(),
        hash: substituteToken.hash,
        csrfToken: randomBytes(32).toString("base64url"),
        expiresAt: new Date(Date.now() + 3600000),
      });
      await organisations.switch(substitutePe, tenantId);
      await expect(
        applications.claimJobGrant({ ...substitutePe, tenantId }, raceJob.id),
      ).rejects.toMatchObject({ code: "42501" });
      const claimRevokeRace = await Promise.allSettled([
        applications.claimJobGrant(engineer, raceJob.id),
        applications.revokeJobGrant(owner, raceJob.id, {
          confirmCredentialGrantRevocation: true,
        }),
      ]);
      expect(
        claimRevokeRace.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        claimRevokeRace.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      const racedGrant = (
        await migration.query(
          "SELECT g.revoked_at,c.claimed_at FROM lzc.application_job_grants g LEFT JOIN lzc.application_job_claims c ON c.job_id=g.job_id WHERE g.job_id=$1",
          [raceJob.id],
        )
      ).rows[0];
      expect(Boolean(racedGrant.revoked_at)).not.toBe(
        Boolean(racedGrant.claimed_at),
      );
      const releaseJob = async () => {
        const prepared = await applications.prepareJob(owner, cliOrder.id, {
          idempotencyKey: randomUUID(),
          confirmPlan: true,
        });
        await applications.approveJobBackend(
          engineer,
          prepared.id,
          backendRequest,
        );
        return prepared;
      };
      const originalCliGroups =
        (await applications.listTemplates(engineer)).find(
          (version) => version.id === cliOrder.versionId,
        )?.allowedGroupIds ?? [];
      const jobGroup = await applications.createGroup(engineer, {
        name: "Restricted runner access",
      });
      await applications.setGroupMembers(engineer, jobGroup.id, {
        memberIds: [owner.userId],
        confirmMembershipChange: true,
      });
      await applications.setTemplateGroups(engineer, cliOrder.versionId, {
        groupIds: [jobGroup.id],
        confirmAccessChange: true,
      });
      try {
        const deniedGroupJob = await releaseJob();
        await applications.setGroupMembers(engineer, jobGroup.id, {
          memberIds: [],
          confirmMembershipChange: true,
        });
        technical.verifyForPreparation.mockClear();
        applicationSecrets.get.mockClear();
        await expect(
          withTenant(pool, engineer, (client) =>
            client.query(
              "SELECT * FROM lzc_auth.claim_application_job_grant($1,$2)",
              [engineer.id, deniedGroupJob.id],
            ),
          ),
        ).rejects.toMatchObject({ code: "42501" });
        expect(
          (
            await migration.query(
              "SELECT job_id FROM lzc.application_job_claims WHERE job_id=$1",
              [deniedGroupJob.id],
            )
          ).rows,
        ).toHaveLength(0);
        expect(technical.verifyForPreparation).not.toHaveBeenCalled();
        expect(applicationSecrets.get).not.toHaveBeenCalled();
        await applications.setGroupMembers(engineer, jobGroup.id, {
          memberIds: [owner.userId],
          confirmMembershipChange: true,
        });
        const groupInterruptedJob = await releaseJob();
        applicationSecrets.get.mockImplementationOnce(async () => {
          await applications.setGroupMembers(engineer, jobGroup.id, {
            memberIds: [],
            confirmMembershipChange: true,
          });
          return applicationSecret;
        });
        await expect(
          applications.releaseJobCredential(
            engineer,
            groupInterruptedJob.id,
            cliRevision,
          ),
        ).rejects.toMatchObject({ code: "42501" });
        expect(applicationSecrets.get).toHaveBeenCalledTimes(1);
        expect(
          (
            await migration.query(
              "SELECT job_id FROM lzc.application_job_claims WHERE job_id=$1",
              [groupInterruptedJob.id],
            )
          ).rows,
        ).toHaveLength(1);
      } finally {
        await applications.setTemplateGroups(engineer, cliOrder.versionId, {
          groupIds: originalCliGroups,
          confirmAccessChange: true,
        });
      }
      const releasedJob = await releaseJob();
      technical.verifyForPreparation.mockClear();
      applicationSecrets.get.mockClear();
      applicationSecrets.get.mockImplementationOnce(async () => {
        expect(
          (
            await migration.query(
              "SELECT job_id FROM lzc.application_job_claims WHERE job_id=$1",
              [releasedJob.id],
            )
          ).rows,
        ).toHaveLength(1);
        return applicationSecret;
      });
      await expect(
        applications.releaseJobCredential(owner, releasedJob.id, cliRevision),
      ).rejects.toMatchObject({ code: "42501" });
      expect(technical.verifyForPreparation).not.toHaveBeenCalled();
      expect(applicationSecrets.get).not.toHaveBeenCalled();
      expect(
        await applications.releaseJobCredential(
          engineer,
          releasedJob.id,
          cliRevision,
        ),
      ).toMatchObject({
        jobId: releasedJob.id,
        acceleratorRevision: cliRevision,
        credentialProfileId: profileId,
        key: applicationSecret.key,
      });
      expect(technical.verifyForPreparation).toHaveBeenCalledWith(
        engineer,
        profileId,
        organizationId,
      );
      expect(applicationSecrets.get).toHaveBeenCalledWith(engineer, profileId);
      expect(applicationSecrets.get).toHaveBeenCalledTimes(1);
      await expect(
        applications.releaseJobCredential(
          engineer,
          releasedJob.id,
          cliRevision,
        ),
      ).rejects.toMatchObject({ code: "40001" });
      expect(applicationSecrets.get).toHaveBeenCalledTimes(1);
      const rotatedJob = await releaseJob();
      applicationSecrets.get.mockResolvedValueOnce({
        ...applicationSecret,
        version: 2,
      });
      await expect(
        applications.releaseJobCredential(engineer, rotatedJob.id, cliRevision),
      ).rejects.toMatchObject({ code: "application_credential_changed" });
      const interruptedJob = await releaseJob();
      applicationSecrets.get.mockImplementationOnce(async () => {
        await migration.query(
          "UPDATE lzc.memberships SET product_roles=ARRAY['application-owner'],manage_members=false WHERE tenant_id=$1 AND user_id=$2",
          [tenantId, engineer.userId],
        );
        return applicationSecret;
      });
      try {
        await expect(
          applications.releaseJobCredential(
            engineer,
            interruptedJob.id,
            cliRevision,
          ),
        ).rejects.toMatchObject({ code: "42501" });
      } finally {
        await migration.query(
          "UPDATE lzc.memberships SET product_roles=ARRAY['platform-engineer'],manage_members=true WHERE tenant_id=$1 AND user_id=$2",
          [tenantId, engineer.userId],
        );
      }
      await expect(
        applications.releaseJobCredential(
          engineer,
          interruptedJob.id,
          cliRevision,
        ),
      ).rejects.toMatchObject({ code: "40001" });
      const mismatchJob = await releaseJob();
      technical.verifyForPreparation.mockClear();
      applicationSecrets.get.mockClear();
      await expect(
        applications.releaseJobCredential(
          engineer,
          mismatchJob.id,
          applicationRevision,
        ),
      ).rejects.toMatchObject({ name: "ZodError" });
      expect(technical.verifyForPreparation).not.toHaveBeenCalled();
      expect(applicationSecrets.get).not.toHaveBeenCalled();
      const concurrentReleaseJob = await releaseJob();
      const releases = await Promise.allSettled([
        applications.releaseJobCredential(
          engineer,
          concurrentReleaseJob.id,
          cliRevision,
        ),
        applications.releaseJobCredential(
          engineer,
          concurrentReleaseJob.id,
          cliRevision,
        ),
      ]);
      expect(
        releases.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        releases.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      expect(technical.verifyForPreparation).toHaveBeenCalledTimes(1);
      expect(applicationSecrets.get).toHaveBeenCalledTimes(1);
      const ticketPackage = {
        runnerPackageId: randomUUID(),
        acceleratorRevision: cliRevision,
        providerLockSha256:
          "d40debbff204aee590c2a76d09f6ad3234643329b438fd5c6497de60687f6fa5",
      };
      const ticketJob = await releaseJob();
      const otherSessionJobs = await applications.listJobs(
        { ...substitutePe, tenantId },
        cliOrder.id,
      );
      expect(otherSessionJobs).toContainEqual(
        expect.objectContaining({ id: ticketJob.id, canDispatch: false }),
      );
      expect(otherSessionJobs.every((listed) => !listed.canDispatch)).toBe(
        true,
      );
      const peerToken = newSessionToken();
      const peer = await store.createSession({
        githubId: 999999,
        login: "other-platform-engineer",
        id: randomUUID(),
        hash: peerToken.hash,
        csrfToken: randomBytes(32).toString("base64url"),
        expiresAt: new Date(Date.now() + 3600000),
      });
      await migration.query(
        "INSERT INTO lzc.memberships(tenant_id,user_id,role,product_roles) VALUES($1,$2,'viewer',ARRAY['platform-engineer'])",
        [tenantId, peer.userId],
      );
      await organisations.switch(peer, tenantId);
      expect(
        await applications.listJobs({ ...peer, tenantId }, cliOrder.id),
      ).toEqual([]);
      expect(await applications.listJobs(owner, randomUUID())).toEqual([]);
      await expect(
        applications.issueRunnerTicket(owner, ticketJob.id, ticketPackage),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        applications.issueRunnerTicket(
          { ...substitutePe, tenantId },
          ticketJob.id,
          ticketPackage,
        ),
      ).rejects.toMatchObject({ code: "42501" });
      const issued = await applications.issueRunnerTicket(
        engineer,
        ticketJob.id,
        ticketPackage,
      );
      expect(issued.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const persistedTicket = (
        await migration.query(
          "SELECT * FROM lzc.application_runner_tickets WHERE job_id=$1",
          [ticketJob.id],
        )
      ).rows[0];
      expect(persistedTicket.approval_session_id).toBe(engineer.id);
      expect(persistedTicket.runner_package_id).toBe(
        ticketPackage.runnerPackageId,
      );
      expect(persistedTicket.consumed_at).toBeNull();
      expect(JSON.stringify(persistedTicket)).not.toContain(issued.ticket);
      await expect(
        applications.issueRunnerTicket(engineer, ticketJob.id, ticketPackage),
      ).rejects.toMatchObject({ code: "40001" });
      technical.verifyForPreparation.mockClear();
      applicationSecrets.get.mockClear();
      await expect(
        applications.releaseRunnerCredential(issued.ticket, {
          ...ticketPackage,
          runnerPackageId: randomUUID(),
        }),
      ).rejects.toMatchObject({ status: 401 });
      await expect(
        applications.releaseRunnerCredential(
          randomBytes(32).toString("base64url"),
          ticketPackage,
        ),
      ).rejects.toMatchObject({ status: 401 });
      expect(technical.verifyForPreparation).not.toHaveBeenCalled();
      expect(applicationSecrets.get).not.toHaveBeenCalled();
      const ticketReleases = await Promise.allSettled([
        applications.releaseRunnerCredential(issued.ticket, ticketPackage),
        applications.releaseRunnerCredential(issued.ticket, ticketPackage),
      ]);
      expect(
        ticketReleases.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        ticketReleases.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      expect(applicationSecrets.get).toHaveBeenCalledTimes(1);
      expect(applicationSecrets.get).toHaveBeenCalledWith(
        expect.objectContaining({
          id: engineer.id,
          userId: engineer.userId,
          tenantId,
        }),
        profileId,
      );
      await expect(
        applications.releaseRunnerCredential(issued.ticket, ticketPackage),
      ).rejects.toMatchObject({ status: 401 });
      await expect(
        withTenant(pool, engineer, (client) =>
          client.query("SELECT * FROM lzc.application_runner_tickets"),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        migration.query(
          "UPDATE lzc.application_runner_tickets SET consumed_at=NULL WHERE job_id=$1",
          [ticketJob.id],
        ),
      ).rejects.toMatchObject({ code: "55000" });
      const expiredTicketJob = await releaseJob();
      const expiredIssued = await applications.issueRunnerTicket(
        engineer,
        expiredTicketJob.id,
        ticketPackage,
      );
      applicationSecrets.get.mockClear();
      await migration.query(
        "UPDATE lzc_auth.sessions SET expires_at=now()-interval '1 second' WHERE id=$1",
        [engineer.id],
      );
      try {
        await expect(
          applications.releaseRunnerCredential(
            expiredIssued.ticket,
            ticketPackage,
          ),
        ).rejects.toMatchObject({ status: 401 });
        expect(applicationSecrets.get).not.toHaveBeenCalled();
      } finally {
        await migration.query(
          "UPDATE lzc_auth.sessions SET expires_at=$2 WHERE id=$1",
          [engineer.id, actualPeExpiry],
        );
      }
      const groupTicketJob = await releaseJob();
      const groupTicket = await applications.issueRunnerTicket(
        engineer,
        groupTicketJob.id,
        ticketPackage,
      );
      const groupTicketHash = (
        await migration.query<{ ticket_hash: string }>(
          "SELECT ticket_hash FROM lzc.application_runner_tickets WHERE job_id=$1",
          [groupTicketJob.id],
        )
      ).rows[0]?.ticket_hash;
      await applications.setTemplateGroups(engineer, cliOrder.versionId, {
        groupIds: [],
        confirmAccessChange: true,
      });
      applicationBackends.runner.mockClear();
      applicationSecrets.get.mockClear();
      try {
        await expect(
          applications.runnerInput(groupTicket.ticket, ticketPackage),
        ).rejects.toMatchObject({ status: 401 });
        await expect(
          withTenant(pool, engineer, (client) =>
            client.query(
              "SELECT lzc_auth.consume_application_runner_ticket($1,$2,$3,$4,$5,$6)",
              [
                engineer.id,
                groupTicketJob.id,
                groupTicketHash,
                ticketPackage.runnerPackageId,
                ticketPackage.acceleratorRevision,
                ticketPackage.providerLockSha256,
              ],
            ),
          ),
        ).rejects.toMatchObject({ code: "42501" });
        expect(
          (
            await migration.query(
              "SELECT consumed_at FROM lzc.application_runner_tickets WHERE job_id=$1",
              [groupTicketJob.id],
            )
          ).rows[0]?.consumed_at,
        ).toBeNull();
        expect(applicationBackends.runner).not.toHaveBeenCalled();
        expect(applicationSecrets.get).not.toHaveBeenCalled();
      } finally {
        await applications.setTemplateGroups(engineer, cliOrder.versionId, {
          groupIds: originalCliGroups,
          confirmAccessChange: true,
        });
      }
      const inputJob = await releaseJob();
      const inputTicket = await applications.issueRunnerTicket(
        engineer,
        inputJob.id,
        ticketPackage,
      );
      applicationBackends.runner.mockResolvedValue({
        kind: "s3",
        descriptor: backendDescriptor,
        credentials: {
          accessKeyId: "application-test-only",
          secretAccessKey: "application-test-only",
        },
      });
      const runnerInput = await applications.runnerInput(
        inputTicket.ticket,
        ticketPackage,
      );
      expect(runnerInput).toMatchObject({
        id: inputJob.id,
        mode: "application-plan",
        acceleratorCommit: cliRevision,
        application: { tenantId, instanceId: cliOrder.id },
        backend: {
          kind: "s3",
          descriptor: { key: cliOrder.stateKey, useLockfile: true },
        },
      });
      expect(runnerInput.tfvars).toContain('"configurator_execution" = true');
      expect(applicationBackends.runner).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: engineer.id,
          userId: engineer.userId,
          tenantId,
        }),
        backendId,
      );
      await expect(
        applications.runnerInput(inputTicket.ticket, ticketPackage),
      ).rejects.toMatchObject({ status: 401 });
      const backendChangedJob = await releaseJob();
      const backendChangedTicket = await applications.issueRunnerTicket(
        engineer,
        backendChangedJob.id,
        ticketPackage,
      );
      applicationBackends.runner.mockResolvedValueOnce({
        kind: "s3",
        descriptor: { ...backendDescriptor, bucket: "unexpected-bucket" },
        credentials: {
          accessKeyId: "application-test-only",
          secretAccessKey: "application-test-only",
        },
      });
      await expect(
        applications.runnerInput(backendChangedTicket.ticket, ticketPackage),
      ).rejects.toMatchObject({ code: "application_backend_changed" });
      const backendRevokedJob = await releaseJob();
      const backendRevokedTicket = await applications.issueRunnerTicket(
        engineer,
        backendRevokedJob.id,
        ticketPackage,
      );
      applicationBackends.runner.mockImplementationOnce(async () => {
        await migration.query(
          "UPDATE lzc.memberships SET product_roles=ARRAY['application-owner'],manage_members=false WHERE tenant_id=$1 AND user_id=$2",
          [tenantId, engineer.userId],
        );
        return {
          kind: "s3",
          descriptor: backendDescriptor,
          credentials: {
            accessKeyId: "application-test-only",
            secretAccessKey: "application-test-only",
          },
        };
      });
      try {
        await expect(
          applications.runnerInput(backendRevokedTicket.ticket, ticketPackage),
        ).rejects.toMatchObject({ code: "42501" });
      } finally {
        await migration.query(
          "UPDATE lzc.memberships SET product_roles=ARRAY['platform-engineer'],manage_members=true WHERE tenant_id=$1 AND user_id=$2",
          [tenantId, engineer.userId],
        );
      }
      await expect(
        withTenant(pool, owner, (client) =>
          client.query(
            "INSERT INTO lzc.application_job_claims SELECT * FROM lzc.application_job_claims WHERE job_id=$1",
            [claimOrderJob.id],
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        migration.query(
          "DELETE FROM lzc.application_job_claims WHERE job_id=$1",
          [claimOrderJob.id],
        ),
      ).rejects.toMatchObject({ code: "55000" });
      await expect(
        applications.prepareJob(owner, jobOrder.id, jobRequest),
      ).rejects.toMatchObject({ code: "application_job_grant_unavailable" });
      await expect(
        withTenant(pool, owner, (client) =>
          client.query(
            "UPDATE lzc.application_job_grants SET revoked_at=NULL WHERE job_id=$1",
            [job.id],
          ),
        ),
      ).rejects.toMatchObject({ code: "55000" });
      const dispatchRunner = {
        acceleratorCommit: cliRevision,
        start: vi.fn<PlanRunner["start"]>(),
        remove: vi.fn<PlanRunner["remove"]>(),
      };
      const applicationCrypto = new ArtifactCrypto(
        randomBytes(32).toString("base64"),
      );
      const dispatchApplications = new Applications(
        pool,
        technical,
        applicationSecrets,
        applicationBackends,
        { runner: dispatchRunner, origin: "http://127.0.0.1:3000" },
        applicationCrypto,
      );
      const startFailureJob = await releaseJob();
      await expect(
        applications.dispatchJob(engineer, startFailureJob.id, {
          confirmPlan: true,
        }),
      ).rejects.toMatchObject({ code: "application_dispatch_disabled" });
      dispatchRunner.start.mockRejectedValueOnce(
        new Error("before-start-test-only"),
      );
      await expect(
        dispatchApplications.dispatchJob(engineer, startFailureJob.id, {
          confirmPlan: true,
        }),
      ).rejects.toMatchObject({ code: "application_dispatch_failed" });
      expect(
        (
          await migration.query(
            "SELECT status FROM lzc.application_dispatches WHERE job_id=$1",
            [startFailureJob.id],
          )
        ).rows[0].status,
      ).toBe("failed");
      expect(
        await dispatchApplications.dispatchJob(engineer, startFailureJob.id, {
          confirmPlan: true,
        }),
      ).toEqual({ jobId: startFailureJob.id, dispatched: false });
      expect(dispatchRunner.start).toHaveBeenCalledTimes(1);
      const dispatchJob = await releaseJob();
      let dispatchedTicket = "";
      dispatchRunner.start.mockImplementation(
        async (id, ticket, origin, record) => {
          expect(origin).toBe("http://127.0.0.1:3000");
          await record(id, ticketPackage.runnerPackageId);
          const boundRun = (
            await migration.query(
              "SELECT status,runner_app_id,runner_package_id FROM lzc.application_dispatches WHERE job_id=$1",
              [id],
            )
          ).rows[0];
          expect(boundRun).toEqual({
            status: "starting",
            runner_app_id: id,
            runner_package_id: ticketPackage.runnerPackageId,
          });
          dispatchedTicket = ticket;
        },
      );
      const starts = await Promise.all([
        dispatchApplications.dispatchJob(engineer, dispatchJob.id, {
          confirmPlan: true,
        }),
        dispatchApplications.dispatchJob(engineer, dispatchJob.id, {
          confirmPlan: true,
        }),
      ]);
      expect(starts.filter((receipt) => receipt.dispatched)).toHaveLength(1);
      expect(starts.filter((receipt) => !receipt.dispatched)).toHaveLength(1);
      expect(dispatchRunner.start).toHaveBeenCalledTimes(2);
      expect(
        (await applications.listInstances(owner)).find(
          (item) => item.id === cliOrder.id,
        )?.canDelete,
      ).toBe(false);
      for (const caller of [owner, engineer])
        await expect(
          applications.deleteOrder(caller, cliOrder.id, {
            confirmDeletion: true,
          }),
        ).rejects.toMatchObject({
          code: "40001",
          message: "application_order_execution_started",
        });
      expect(
        await dispatchApplications.runnerInput(dispatchedTicket, ticketPackage),
      ).toMatchObject({
        id: dispatchJob.id,
        mode: "application-plan",
        application: { tenantId, instanceId: cliOrder.id },
      });
      const duplicateInstanceJob = await releaseJob();
      await expect(
        dispatchApplications.dispatchJob(engineer, duplicateInstanceJob.id, {
          confirmPlan: true,
        }),
      ).rejects.toMatchObject({ code: "40001" });
      expect(dispatchRunner.start).toHaveBeenCalledTimes(2);
      await expect(
        withTenant(pool, engineer, (client) =>
          client.query(
            "UPDATE lzc.application_dispatches SET status='failed' WHERE job_id=$1",
            [dispatchJob.id],
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        migration.query(
          "DELETE FROM lzc.application_dispatches WHERE job_id=$1",
          [dispatchJob.id],
        ),
      ).rejects.toMatchObject({ code: "55000" });
      const noChanges = {
        unchanged: 0,
        create: 0,
        update: 0,
        delete: 0,
        replace: 0,
        read: 0,
      };
      const applicationSummary = {
        schemaVersion: 1,
        execution: "plan-only",
        applyAllowed: false,
        result: "no-changes",
        resources: noChanges,
        drift: noChanges,
        changedOutputs: 0,
        checks: { pass: 0, fail: 0, error: 0, unknown: 0 },
        destructive: false,
        completeness: "complete",
      };
      await expect(
        dispatchApplications.runnerStage(dispatchedTicket, ticketPackage, {
          stage: "planning",
        }),
      ).rejects.toMatchObject({ code: "55000" });
      await dispatchApplications.runnerStage(dispatchedTicket, ticketPackage, {
        stage: "initializing",
      });
      await dispatchApplications.runnerStage(dispatchedTicket, ticketPackage, {
        stage: "validating",
      });
      await dispatchApplications.runnerStage(dispatchedTicket, ticketPackage, {
        stage: "planning",
      });
      await expect(
        dispatchApplications.dispatchJob(engineer, duplicateInstanceJob.id, {
          confirmPlan: true,
        }),
      ).rejects.toMatchObject({
        code: "40001",
        message: "application_instance_running",
      });
      expect(dispatchRunner.start).toHaveBeenCalledTimes(2);
      await expect(
        dispatchApplications.runnerResult(dispatchedTicket, ticketPackage, {
          status: "succeeded",
          summary: applicationSummary,
          artifactSha256: "0".repeat(64),
        }),
      ).rejects.toMatchObject({ code: "42501" });
      const planBytes = Buffer.from("APPLICATION-PLAN-MOCK-PRIVATE-BYTES");
      const planUpload = {
        data: planBytes.toString("base64"),
        summary: applicationSummary,
      };
      const artifactReceipt = await dispatchApplications.runnerArtifact(
        dispatchedTicket,
        ticketPackage,
        planUpload,
      );
      expect(
        await dispatchApplications.runnerArtifact(
          dispatchedTicket,
          ticketPackage,
          planUpload,
        ),
      ).toEqual(artifactReceipt);
      await expect(
        dispatchApplications.runnerArtifact(dispatchedTicket, ticketPackage, {
          ...planUpload,
          data: Buffer.from("different-plan").toString("base64"),
        }),
      ).rejects.toMatchObject({ code: "40001" });
      const sealedArtifact = (
        await migration.query(
          "SELECT * FROM lzc.application_runner_records WHERE job_id=$1 AND kind='artifact'",
          [dispatchJob.id],
        )
      ).rows[0];
      expect(sealedArtifact.ciphertext.includes(planBytes)).toBe(false);
      expect(
        applicationCrypto.decrypt(
          sealedArtifact.ciphertext,
          tenantId,
          owner.userId,
          `application-artifact:${dispatchJob.id}`,
        ),
      ).toEqual(planBytes);
      expect(() =>
        applicationCrypto.decrypt(
          sealedArtifact.ciphertext,
          tenantId,
          engineer.userId,
          `application-artifact:${dispatchJob.id}`,
        ),
      ).toThrow();
      expect(sealedArtifact).toMatchObject({
        owner_user_id: owner.userId,
        state_key: cliOrder.stateKey,
        runner_package_id: ticketPackage.runnerPackageId,
        sha256: artifactReceipt.sha256,
      });
      await dispatchApplications.runnerOutput(dispatchedTicket, ticketPackage, {
        text: "application plan output",
        truncated: false,
      });
      const sealedOutput = (
        await migration.query(
          "SELECT ciphertext FROM lzc.application_runner_records WHERE job_id=$1 AND kind='output'",
          [dispatchJob.id],
        )
      ).rows[0];
      expect(
        applicationCrypto
          .decrypt(
            sealedOutput.ciphertext,
            tenantId,
            owner.userId,
            `application-output:${dispatchJob.id}`,
          )
          .toString(),
      ).toBe("application plan output");
      await expect(
        dispatchApplications.runnerResult(dispatchedTicket, ticketPackage, {
          status: "succeeded",
          summary: { ...applicationSummary, changedOutputs: 1 },
          artifactSha256: artifactReceipt.sha256,
        }),
      ).rejects.toMatchObject({ code: "42501" });
      await dispatchApplications.runnerResult(dispatchedTicket, ticketPackage, {
        status: "succeeded",
        summary: applicationSummary,
        artifactSha256: artifactReceipt.sha256,
      });
      expect(
        (
          await migration.query(
            "SELECT status,summary FROM lzc.application_dispatches WHERE job_id=$1",
            [dispatchJob.id],
          )
        ).rows[0],
      ).toEqual({ status: "succeeded", summary: applicationSummary });
      await expect(
        dispatchApplications.runnerResult(dispatchedTicket, ticketPackage, {
          status: "succeeded",
          summary: applicationSummary,
          artifactSha256: artifactReceipt.sha256,
        }),
      ).rejects.toMatchObject({ status: 401 });
      await expect(
        migration.query(
          "DELETE FROM lzc.application_runner_records WHERE job_id=$1",
          [dispatchJob.id],
        ),
      ).rejects.toMatchObject({ code: "55000" });
      const uncertainOrder = await applications.order(owner, {
        versionId: cliVersion.id,
        idempotencyKey: randomUUID(),
        name: "Uncertain dispatch",
        parameters: {},
      });
      const uncertainJob = await applications.prepareJob(
        owner,
        uncertainOrder.id,
        { idempotencyKey: randomUUID(), confirmPlan: true },
      );
      await applications.approveJobBackend(
        engineer,
        uncertainJob.id,
        backendRequest,
      );
      let uncertainTicket = "";
      dispatchRunner.start.mockImplementationOnce(
        async (id, ticket, _origin, record) => {
          await record(id, ticketPackage.runnerPackageId);
          uncertainTicket = ticket;
          await dispatchApplications.runnerInput(ticket, ticketPackage);
          await dispatchApplications.runnerStage(ticket, ticketPackage, {
            stage: "initializing",
          });
          await dispatchApplications.runnerStage(ticket, ticketPackage, {
            stage: "validating",
          });
          await dispatchApplications.runnerStage(ticket, ticketPackage, {
            stage: "planning",
          });
          throw new Error("after-binding-test-only");
        },
      );
      await expect(
        dispatchApplications.dispatchJob(engineer, uncertainJob.id, {
          confirmPlan: true,
        }),
      ).rejects.toMatchObject({ code: "application_dispatch_failed" });
      expect(
        (
          await migration.query(
            "SELECT status FROM lzc.application_dispatches WHERE job_id=$1",
            [uncertainJob.id],
          )
        ).rows[0].status,
      ).toBe("reconciliation_required");
      applicationSecrets.get.mockClear();
      await expect(
        dispatchApplications.runnerInput(uncertainTicket, ticketPackage),
      ).rejects.toMatchObject({ status: 401 });
      expect(applicationSecrets.get).not.toHaveBeenCalled();
      await expect(
        dispatchApplications.runnerStage(uncertainTicket, ticketPackage, {
          stage: "planning",
        }),
      ).rejects.toMatchObject({ status: 401 });
      const uncertainRetry = await applications.prepareJob(
        owner,
        uncertainOrder.id,
        { idempotencyKey: randomUUID(), confirmPlan: true },
      );
      await applications.approveJobBackend(
        engineer,
        uncertainRetry.id,
        backendRequest,
      );
      await expect(
        dispatchApplications.dispatchJob(engineer, uncertainRetry.id, {
          confirmPlan: true,
        }),
      ).rejects.toMatchObject({ code: "40001" });
      expect(dispatchRunner.start).toHaveBeenCalledTimes(3);
      await identities.revoke(owner);
      await expect(
        applications.preparePlanInput(owner, order.id),
      ).rejects.toMatchObject({
        status: 403,
        code: "verified_application_identity_required",
      });
      await identities.save(owner, {
        ...ownerProof,
        tokenExpiresAt: new Date(Date.now() + 300000).toISOString(),
        organization: { id: organizationId, name: "Approved platform" },
      });
      await migration.query(
        "UPDATE lzc.stackit_identities SET email='changed@example.test' WHERE user_id=$1",
        [bob.userId],
      );
      await expect(
        applications.preparePlanInput(owner, order.id),
      ).rejects.toMatchObject({
        status: 409,
        code: "application_owner_identity_changed",
      });
      await identities.save(owner, {
        ...ownerProof,
        tokenExpiresAt: new Date(Date.now() + 300000).toISOString(),
        organization: { id: organizationId, name: "Approved platform" },
      });
      const api = buildApp({
        applications,
        auth: {
          origin: "https://configurator.example",
          clientId: "test",
          store,
          github: { authorize: vi.fn() },
          tokens: { put: vi.fn(), get: vi.fn(), remove: vi.fn() },
        },
      });
      const headers = {
        cookie: `__Host-lzc-session=${aliceToken}`,
        origin: "https://configurator.example",
        "x-lzc-csrf": alice.csrfToken,
        "x-lzc-tenant": tenantId,
      };
      try {
        const engineerOrder = await applications.order(engineer, {
          versionId: first.id,
          idempotencyKey: randomUUID(),
          name: "Engineer own application",
          parameters: {},
        });
        expect(
          (
            await api.inject({
              method: "POST",
              url: `/api/v1/applications/instances/${engineerOrder.id}/plan-input`,
              headers,
              payload: {},
            })
          ).json(),
        ).toMatchObject({
          kind: "application-plan-input",
          cloudPlanExecuted: false,
          plan: {
            executionEnabled: false,
            requestedBy: alice.userId,
            stateKey: engineerOrder.stateKey,
          },
        });
        const httpOrder = await applications.order(engineer, {
          versionId: runnerVersion.id,
          idempotencyKey: randomUUID(),
          name: "HTTP prepared job",
          parameters: {},
        });
        const jobUrl = `/api/v1/applications/instances/${httpOrder.id}/jobs`;
        const httpJobRequest = {
          idempotencyKey: randomUUID(),
          confirmPlan: true,
        };
        for (const boundary of [
          { headers: {}, status: 401 },
          { headers: { ...headers, "x-lzc-csrf": "wrong" }, status: 403 },
          {
            headers: { ...headers, origin: "https://foreign.example" },
            status: 403,
          },
          {
            headers: { ...headers, "x-lzc-tenant": randomUUID() },
            status: 403,
          },
        ]) {
          expect(
            (
              await api.inject({
                method: "POST",
                url: jobUrl,
                headers: boundary.headers,
                payload: httpJobRequest,
              })
            ).statusCode,
          ).toBe(boundary.status);
        }
        for (const payload of [
          {},
          { ...httpJobRequest, confirmPlan: false },
          { ...httpJobRequest, operation: "apply" },
          { ...httpJobRequest, credentialProfileId: profileId },
        ]) {
          expect(
            (
              await api.inject({
                method: "POST",
                url: jobUrl,
                headers,
                payload,
              })
            ).statusCode,
          ).toBe(400);
        }
        const createdJob = await api.inject({
          method: "POST",
          url: jobUrl,
          headers,
          payload: httpJobRequest,
        });
        expect(createdJob.statusCode).toBe(200);
        expect(createdJob.json()).toMatchObject({
          instanceId: httpOrder.id,
          status: "prepared",
          executionEnabled: false,
          cloudPlanExecuted: false,
        });
        expect(Object.keys(createdJob.json()).sort()).toEqual([
          "cloudPlanExecuted",
          "executionEnabled",
          "expiresAt",
          "id",
          "instanceId",
          "status",
        ]);
        expect(
          (
            await api.inject({
              method: "POST",
              url: jobUrl,
              headers,
              payload: httpJobRequest,
            })
          ).json(),
        ).toEqual(createdJob.json());
        const revokeUrl = `/api/v1/applications/jobs/${createdJob.json().id}/credential-grant/revoke`;
        const approvalUrl = `/api/v1/applications/jobs/${createdJob.json().id}/backend-approval`;
        expect(
          (
            await api.inject({
              method: "POST",
              url: `/api/v1/applications/jobs/${createdJob.json().id}/credential-grant/claim`,
              headers,
              payload: {},
            })
          ).statusCode,
        ).toBe(404);
        for (const [requestHeaders, expectedStatus] of [
          [{ ...headers, cookie: "" }, 401],
          [{ ...headers, "x-lzc-csrf": "wrong" }, 403],
          [{ ...headers, origin: "https://foreign.example" }, 403],
          [{ ...headers, "x-lzc-tenant": bob.tenantId }, 403],
        ] as const) {
          expect(
            (
              await api.inject({
                method: "POST",
                url: approvalUrl,
                headers: requestHeaders,
                payload: backendRequest,
              })
            ).statusCode,
          ).toBe(expectedStatus);
        }
        for (const payload of [
          { ...backendRequest, confirmBackendApproval: false },
          { ...backendRequest, descriptor: backendDescriptor },
          { ...backendRequest, stateBackendId: "invalid" },
        ]) {
          expect(
            (
              await api.inject({
                method: "POST",
                url: approvalUrl,
                headers,
                payload,
              })
            ).statusCode,
          ).toBe(400);
        }
        expect(
          (
            await api.inject({
              method: "POST",
              url: approvalUrl,
              headers,
              payload: { ...backendRequest, stateBackendId: foreignBackendId },
            })
          ).statusCode,
        ).toBe(403);
        const backendReplies = await Promise.all(
          [0, 1].map(() =>
            api.inject({
              method: "POST",
              url: approvalUrl,
              headers,
              payload: backendRequest,
            }),
          ),
        );
        expect(backendReplies.map((reply) => reply.statusCode)).toEqual([
          200, 200,
        ]);
        expect(backendReplies[0]?.json()).toEqual(backendReplies[1]?.json());
        expect(backendReplies[0]?.json()).toMatchObject({
          jobId: createdJob.json().id,
          backendId,
          stateKey: httpOrder.stateKey,
          executionEnabled: false,
        });
        expect(Object.keys(backendReplies[0]?.json() ?? {}).sort()).toEqual([
          "backendId",
          "executionEnabled",
          "expiresAt",
          "jobId",
          "stateKey",
        ]);
        expect(
          (
            await api.inject({
              method: "POST",
              url: approvalUrl,
              headers,
              payload: {
                ...backendRequest,
                stateBackendId: alternativeBackendId,
              },
            })
          ).statusCode,
        ).toBe(409);
        const revokeRequest = { confirmCredentialGrantRevocation: true };
        expect(
          (
            await api.inject({
              method: "POST",
              url: revokeUrl,
              headers: { ...headers, "x-lzc-csrf": "wrong" },
              payload: revokeRequest,
            })
          ).statusCode,
        ).toBe(403);
        expect(
          (
            await api.inject({
              method: "POST",
              url: revokeUrl,
              headers,
              payload: {},
            })
          ).statusCode,
        ).toBe(400);
        const revokedJob = await api.inject({
          method: "POST",
          url: revokeUrl,
          headers,
          payload: revokeRequest,
        });
        expect(revokedJob.statusCode).toBe(200);
        expect(
          (
            await api.inject({
              method: "POST",
              url: approvalUrl,
              headers,
              payload: backendRequest,
            })
          ).statusCode,
        ).toBe(403);
        expect(
          (
            await api.inject({
              method: "POST",
              url: revokeUrl,
              headers,
              payload: revokeRequest,
            })
          ).json(),
        ).toEqual(revokedJob.json());
        expect(
          (
            await api.inject({
              method: "POST",
              url: jobUrl,
              headers,
              payload: httpJobRequest,
            })
          ).statusCode,
        ).toBe(409);
        expect(
          (
            await api.inject({
              method: "POST",
              url: `/api/v1/applications/instances/${engineerOrder.id}/plan-input`,
              headers,
              payload: { owner_email: "injected@example.test" },
            })
          ).statusCode,
        ).toBe(400);
        expect(
          (
            await api.inject({
              method: "POST",
              url: `/api/v1/applications/instances/${order.id}/plan-input`,
              headers,
              payload: {},
            })
          ).statusCode,
        ).toBe(404);
        expect(
          (
            await api.inject({
              url: "/api/v1/applications/platform-contracts",
              headers,
            })
          ).json(),
        ).toMatchObject({
          contracts: [
            { document: { revision: next.document.revision } },
            { document: { revision: approved.document.revision } },
          ],
        });
        expect(
          (
            await api.inject({
              method: "POST",
              url: "/api/v1/applications/platform-contracts",
              headers,
              payload: { ...input, tenant_id: randomUUID() },
            })
          ).statusCode,
        ).toBe(400);
        expect(
          (
            await api.inject({
              method: "POST",
              url: "/api/v1/applications/platform-contracts",
              headers: { ...headers, "x-lzc-csrf": "wrong" },
              payload: input,
            })
          ).statusCode,
        ).toBe(403);
        expect(
          (
            await api.inject({
              method: "POST",
              url: "/api/v1/applications/platform-contracts",
              headers,
              payload: input,
            })
          ).statusCode,
        ).toBe(200);
      } finally {
        await api.close();
      }
      const delegatedBackendId = randomUUID();
      await migration.query(
        "INSERT INTO lzc.credential_profiles(id,tenant_id,owner_user_id,name,service_account,key_id,state) VALUES($1,$2,$3,'Delegated test','automation@sa.stackit.cloud','test-key','stored')",
        [profileId, tenantId, engineer.userId],
      );
      const delegatedBackendCredentials = {
        accessKeyId: "delegated-test-only",
        secretAccessKey: "delegated-test-only",
      };
      await migration.query(
        "INSERT INTO lzc.state_backends(id,tenant_id,descriptor,identity_sha256,credentials_ciphertext) VALUES($1,$2,$3,$4,$5)",
        [
          delegatedBackendId,
          tenantId,
          JSON.stringify(backendDescriptor),
          randomBytes(32).toString("hex"),
          applicationCrypto.encrypt(
            Buffer.from(JSON.stringify(delegatedBackendCredentials)),
            tenantId,
            delegatedBackendId,
            `backend:${delegatedBackendId}`,
          ),
        ],
      );
      const delegatedTechnical = {
        ...technical,
        verifyDelegated: vi.fn(
          async () => (await technical.verifyForPreparation()).check,
        ),
      };
      const delegatedRunner = {
        acceleratorCommit: cliRevision,
        applicationMaintenanceEnabled: true,
        start: vi.fn<PlanRunner["start"]>(),
        remove: vi.fn<PlanRunner["remove"]>(),
        supportsArtifact: vi.fn(() => true),
        preview: vi.fn<
          (
            saved?: Parameters<NonNullable<PlanRunner["preview"]>>[0],
          ) => Promise<unknown>
        >(async () => ({
          format_version: "1.2",
          terraform_version: "1.12.6",
          errored: false,
          complete: true,
          configuration: {},
          planned_values: {},
          resource_changes: [
            {
              mode: "managed",
              type: "stackit_resourcemanager_project",
              name: "application",
              change: {
                actions: ["create"],
                before: null,
                after: { name: "Delegated direct order", region: "eu01" },
                after_sensitive: {},
                after_unknown: { project_id: true },
              },
            },
          ],
        })),
      };
      const delegatedApplications = new Applications(
        pool,
        delegatedTechnical,
        applicationSecrets,
        applicationBackends,
        { runner: delegatedRunner, origin: "http://127.0.0.1:3000" },
        applicationCrypto,
      );
      const executionRequest = {
        enabled: true,
        stateBackendId: delegatedBackendId,
        confirmExecution: true,
      };
      await expect(
        delegatedApplications.configureExecution(
          owner,
          approved.document.revision,
          executionRequest,
        ),
      ).rejects.toMatchObject({ code: "42501" });
      const executionBinding = await delegatedApplications.configureExecution(
        engineer,
        approved.document.revision,
        executionRequest,
      );
      expect(
        await delegatedApplications.configureExecution(
          engineer,
          approved.document.revision,
          executionRequest,
        ),
      ).toEqual(executionBinding);
      expect(
        await delegatedApplications.listExecutionBindings(owner),
      ).toContainEqual({
        id: executionBinding.id,
        platformRevision: approved.document.revision,
        backendId: delegatedBackendId,
        configuredBy: engineer.userId,
      });
      await applications.prepareJob(owner, cliOrder.id, cliJobRequest);
      expect(
        (
          await migration.query(
            "SELECT 1 FROM lzc.application_job_delegations WHERE job_id=$1",
            [cliJob.id],
          )
        ).rowCount,
      ).toBe(0);
      const delegatedOrderRequest = {
        versionId: cliVersion.id,
        idempotencyKey: randomUUID(),
        name: "Delegated direct order",
        parameters: {},
      };
      const delegatedOrder = await delegatedApplications.order(
        owner,
        delegatedOrderRequest,
      );
      expect(delegatedOrder.executionConfigured).toBe(true);
      expect(
        (await delegatedApplications.order(owner, delegatedOrderRequest))
          .executionConfigured,
      ).toBe(true);
      const delegatedJob = await delegatedApplications.prepareJob(
        owner,
        delegatedOrder.id,
        { idempotencyKey: randomUUID(), confirmPlan: true },
      );
      expect(
        await delegatedApplications.listJobs(owner, delegatedOrder.id),
      ).toMatchObject([
        {
          id: delegatedJob.id,
          backendId: delegatedBackendId,
          delegatedExecution: true,
          canApproveBackend: false,
          canDispatch: true,
        },
      ]);
      const engineerExpiry = (
        await migration.query(
          "SELECT expires_at FROM lzc_auth.sessions WHERE id=$1",
          [engineer.id],
        )
      ).rows[0].expires_at;
      let delegatedTicket = "";
      delegatedRunner.start.mockImplementation(
        async (id, ticket, _origin, record) => {
          delegatedTicket = ticket;
          await record(id, ticketPackage.runnerPackageId);
        },
      );
      await migration.query(
        "UPDATE lzc_auth.sessions SET expires_at=now()-interval '1 second' WHERE id=$1",
        [engineer.id],
      );
      try {
        expect(
          await delegatedApplications.dispatchJob(owner, delegatedJob.id, {
            confirmPlan: true,
          }),
        ).toEqual({ jobId: delegatedJob.id, dispatched: true });
        const secretReads = applicationSecrets.get.mock.calls.length;
        expect(
          await delegatedApplications.runnerInput(
            delegatedTicket,
            ticketPackage,
          ),
        ).toMatchObject({
          id: delegatedJob.id,
          key: applicationSecret.key,
          mode: "application-plan",
          backend: {
            kind: "s3",
            descriptor: { ...backendDescriptor, key: delegatedOrder.stateKey },
            credentials: delegatedBackendCredentials,
          },
        });
        expect(applicationSecrets.get).toHaveBeenLastCalledWith(
          { tenantId, userId: engineer.userId },
          profileId,
        );
        expect(delegatedTechnical.verifyDelegated).toHaveBeenCalledWith(
          applicationSecret.key,
          organizationId,
        );
        await expect(
          delegatedApplications.releaseRunnerCredential(
            delegatedTicket,
            ticketPackage,
          ),
        ).rejects.toBeDefined();
        expect(applicationSecrets.get.mock.calls.length).toBe(secretReads + 1);
        await expect(
          delegatedApplications.runnerInput(delegatedTicket, ticketPackage),
        ).rejects.toBeDefined();
        for (const stage of ["initializing", "validating", "planning"] as const)
          await delegatedApplications.runnerStage(
            delegatedTicket,
            ticketPackage,
            { stage },
          );
        await expect(
          withTenant(pool, owner, (client) =>
            client.query(
              "SELECT lzc_auth.delegated_application_operation($1,$2,'result',$3::jsonb)",
              [
                owner.id,
                delegatedJob.id,
                JSON.stringify({ status: "succeeded" }),
              ],
            ),
          ),
        ).rejects.toMatchObject({ code: "42501" });
        const artifact = await delegatedApplications.runnerArtifact(
          delegatedTicket,
          ticketPackage,
          {
            data: Buffer.from("delegated-test-plan").toString("base64"),
            summary: summarizePlan(
              await delegatedRunner.preview(),
              2,
              "opentofu-1.12.6",
            ),
          },
        );
        await delegatedApplications.runnerResult(
          delegatedTicket,
          ticketPackage,
          {
            status: "succeeded",
            summary: summarizePlan(
              await delegatedRunner.preview(),
              2,
              "opentofu-1.12.6",
            ),
            artifactSha256: artifact.sha256,
          },
        );
        const preview = await delegatedApplications.previewPlan(
          owner,
          delegatedJob.id,
        );
        expect(preview).toMatchObject({
          jobId: delegatedJob.id,
          artifactSha256: artifact.sha256,
          resources: [
            { type: "stackit_resourcemanager_project", action: "create" },
          ],
        });
        expect(
          (await delegatedApplications.listJobs(owner, delegatedOrder.id))[0]
            ?.canApply,
        ).toBe(true);
        expect(
          (await delegatedApplications.listInstances(owner)).find(
            (item) => item.id === delegatedOrder.id,
          )?.canDelete,
        ).toBe(true);
        await expect(
          delegatedApplications.startApply(owner, delegatedJob.id, {
            artifactSha256: "f".repeat(64),
          }),
        ).rejects.toMatchObject({ code: "40001" });
        await expect(
          delegatedApplications.startApply(engineer, delegatedJob.id, {
            artifactSha256: artifact.sha256,
          }),
        ).rejects.toBeDefined();
        const beforeApply = delegatedRunner.start.mock.calls.length;
        const shortExpiry = new Date(Date.now() + 39000);
        const originalExpiry = (
          await migration.query(
            "SELECT expires_at FROM lzc_auth.sessions WHERE id=$1",
            [owner.id],
          )
        ).rows[0].expires_at;
        let apply: Awaited<ReturnType<Applications["startApply"]>>;
        try {
          await migration.query(
            "UPDATE lzc_auth.sessions SET expires_at=$2 WHERE id=$1",
            [owner.id, shortExpiry],
          );
          apply = await delegatedApplications.startApply(
            { ...owner, expiresAt: shortExpiry },
            delegatedJob.id,
            { artifactSha256: artifact.sha256 },
          );
          const lease = (
            await migration.query(
              "SELECT j.created_at,j.expires_at,t.expires_at AS ticket_expiry FROM lzc.application_jobs j JOIN lzc.application_runner_tickets t ON t.job_id=j.id WHERE j.id=$1",
              [apply.jobId],
            )
          ).rows[0];
          expect(lease.expires_at.getTime()).toBeGreaterThan(
            shortExpiry.getTime(),
          );
          expect(lease.expires_at.getTime() - lease.created_at.getTime()).toBe(
            25 * 60000,
          );
          expect(lease.ticket_expiry).toEqual(lease.expires_at);
        } finally {
          await migration.query(
            "UPDATE lzc_auth.sessions SET expires_at=$2 WHERE id=$1",
            [owner.id, originalExpiry],
          );
        }
        expect(apply.dispatched).toBe(true);
        expect(delegatedRunner.start.mock.calls.length).toBe(beforeApply + 1);
        await expect(
          delegatedApplications.deleteOrder(owner, delegatedOrder.id, {
            confirmArchive: true,
          }),
        ).rejects.toMatchObject({
          message: "application_order_archive_unavailable",
        });
        expect(
          (await delegatedApplications.listInstances(owner)).find(
            (item) => item.id === delegatedOrder.id,
          )?.canDelete,
        ).toBe(false);
        await expect(
          delegatedApplications.deleteOrder(owner, delegatedOrder.id, {
            confirmDeletion: true,
          }),
        ).rejects.toMatchObject({
          code: "40001",
          message: "application_order_execution_started",
        });
        expect(
          await delegatedApplications.startApply(owner, delegatedJob.id, {
            artifactSha256: artifact.sha256,
          }),
        ).toEqual({ jobId: apply.jobId, dispatched: false });
        expect(delegatedRunner.start.mock.calls.length).toBe(beforeApply + 1);
        const applyTicket = delegatedTicket;
        expect(
          await delegatedApplications.runnerInput(applyTicket, ticketPackage),
        ).toMatchObject({
          id: apply.jobId,
          mode: "application-apply",
          plan: {
            data: Buffer.from("delegated-test-plan").toString("base64"),
            sha256: artifact.sha256,
          },
          backend: {
            descriptor: { ...backendDescriptor, key: delegatedOrder.stateKey },
          },
        });
        await expect(
          delegatedApplications.runnerInput(applyTicket, ticketPackage),
        ).rejects.toBeDefined();
        const identityExpiry = (
          await migration.query(
            "SELECT valid_until FROM lzc.stackit_identities WHERE user_id=$1 AND issuer='https://accounts.stackit.cloud'",
            [owner.userId],
          )
        ).rows[0].valid_until;
        try {
          await migration.query(
            "UPDATE lzc_auth.sessions SET expires_at=now()-interval '1 second' WHERE id=$1",
            [owner.id],
          );
          await migration.query(
            "UPDATE lzc.stackit_identities SET valid_until=now()-interval '1 second' WHERE user_id=$1 AND issuer='https://accounts.stackit.cloud'",
            [owner.userId],
          );
          await expect(
            delegatedApplications.listJobs(owner, delegatedOrder.id),
          ).rejects.toBeDefined();
          await expect(
            delegatedApplications.runnerInput(applyTicket, ticketPackage),
          ).rejects.toMatchObject({
            code: "invalid_application_runner_ticket",
          });
          for (const stage of ["initializing", "validating", "applying"])
            await delegatedApplications.runnerStage(
              applyTicket,
              ticketPackage,
              { stage },
            );
          await delegatedApplications.runnerOutput(applyTicket, ticketPackage, {
            text: "Apply complete",
            truncated: false,
          });
          await delegatedApplications.runnerResult(applyTicket, ticketPackage, {
            status: "succeeded",
          });
          await expect(
            delegatedApplications.runnerResult(applyTicket, ticketPackage, {
              status: "succeeded",
            }),
          ).rejects.toBeDefined();
        } finally {
          await migration.query(
            "UPDATE lzc_auth.sessions SET expires_at=$2 WHERE id=$1",
            [owner.id, originalExpiry],
          );
          await migration.query(
            "UPDATE lzc.stackit_identities SET valid_until=$2 WHERE user_id=$1 AND issuer='https://accounts.stackit.cloud'",
            [owner.userId, identityExpiry],
          );
        }
        expect(
          await delegatedApplications.outputJob(owner, apply.jobId),
        ).toEqual({
          text: "Apply complete",
          truncated: false,
          kind: "execution",
        });
        await expect(
          delegatedApplications.outputJob(engineer, apply.jobId),
        ).rejects.toBeDefined();
        await expect(
          delegatedApplications.deleteOrder(owner, delegatedOrder.id, {
            confirmArchive: true,
          }),
        ).rejects.toMatchObject({
          message: "application_order_archive_unavailable",
        });
        const appliedJobs = await delegatedApplications.listJobs(
          owner,
          delegatedOrder.id,
        );
        expect(appliedJobs).toContainEqual(
          expect.objectContaining({
            id: apply.jobId,
            operation: "apply",
            planId: delegatedJob.id,
            status: "succeeded",
          }),
        );
        expect(
          appliedJobs.find((item) => item.id === delegatedJob.id)?.canApply,
        ).toBe(false);
        const freshPlan = async (name: string) => {
          const ordered = await delegatedApplications.order(owner, {
            versionId: cliVersion.id,
            idempotencyKey: randomUUID(),
            name,
            parameters: {},
          });
          const key = randomUUID();
          const started = await delegatedApplications.startPlan(
            owner,
            ordered.id,
            { idempotencyKey: key },
          );
          const starts = delegatedRunner.start.mock.calls.length;
          expect(
            await delegatedApplications.startPlan(owner, ordered.id, {
              idempotencyKey: key,
            }),
          ).toEqual({ jobId: started.jobId, dispatched: false });
          expect(delegatedRunner.start.mock.calls.length).toBe(starts);
          const ticket = delegatedTicket;
          await delegatedApplications.runnerInput(ticket, ticketPackage);
          for (const stage of ["initializing", "validating", "planning"])
            await delegatedApplications.runnerStage(ticket, ticketPackage, {
              stage,
            });
          const summary = summarizePlan(
            await delegatedRunner.preview(),
            2,
            "opentofu-1.12.6",
          );
          const receipt = await delegatedApplications.runnerArtifact(
            ticket,
            ticketPackage,
            {
              data: Buffer.from("delegated-test-plan").toString("base64"),
              summary,
            },
          );
          await delegatedApplications.runnerResult(ticket, ticketPackage, {
            status: "succeeded",
            summary,
            artifactSha256: receipt.sha256,
          });
          return { ordered, id: started.jobId, sha: receipt.sha256 };
        };
        const maintenance = await freshPlan("Application maintenance");
        const failedApply = await delegatedApplications.startApply(
          owner,
          maintenance.id,
          { artifactSha256: maintenance.sha },
        );
        const failedTicket = delegatedTicket;
        await delegatedApplications.runnerInput(failedTicket, ticketPackage);
        for (const stage of ["initializing", "validating", "applying"])
          await delegatedApplications.runnerStage(failedTicket, ticketPackage, {
            stage,
          });
        await expect(
          delegatedApplications.startPlan(owner, maintenance.ordered.id, {
            idempotencyKey: randomUUID(),
            purpose: "destroy",
          }),
        ).rejects.toMatchObject({ code: "40001" });
        await delegatedApplications.runnerResult(failedTicket, ticketPackage, {
          status: "failed",
          errorCode: "apply_failed",
        });
        await expect(
          delegatedApplications.startPlan(owner, maintenance.ordered.id, {
            idempotencyKey: randomUUID(),
            purpose: "drift",
          }),
        ).rejects.toMatchObject({ code: "40001" });
        await admin.query("BEGIN; SET LOCAL session_replication_role=replica");
        try {
          await admin.query(
            "UPDATE lzc.application_runner_tickets SET expires_at=clock_timestamp()-interval '1 microsecond' WHERE job_id=$1",
            [failedApply.jobId],
          );
          await admin.query("COMMIT");
        } catch (error) {
          await admin.query("ROLLBACK");
          throw error;
        }
        const historical = (
          await migration.query(
            "SELECT * FROM lzc.application_dispatches WHERE job_id=$1",
            [failedApply.jobId],
          )
        ).rows;
        await expect(
          delegatedApplications.startPlan(owner, maintenance.ordered.id, {
            idempotencyKey: randomUUID(),
          }),
        ).rejects.toMatchObject({ code: "40001" });
        const originalPreview = await delegatedRunner.preview({
          bytes: Buffer.alloc(0),
          sha256: "a".repeat(64),
          identity: ticketPackage.runnerPackageId,
        });
        const maintenancePlan = async (purpose: "destroy" | "drift") => {
          const change =
            purpose === "destroy"
              ? {
                  actions: ["delete"],
                  before: { name: "Application maintenance", region: "eu01" },
                  after: null,
                }
              : {
                  actions: ["update"],
                  before: { name: "Cloud name", region: "eu01" },
                  after: { name: "Application maintenance", region: "eu01" },
                };
          delegatedRunner.preview.mockResolvedValue({
            format_version: "1.2",
            terraform_version: "1.12.6",
            errored: false,
            configuration: {},
            planned_values: {},
            resource_changes: [
              {
                mode: "managed",
                type: "stackit_resourcemanager_project",
                name: "application",
                change,
              },
            ],
            resource_drift:
              purpose === "drift"
                ? [
                    {
                      mode: "managed",
                      type: "stackit_resourcemanager_project",
                      name: "application",
                      change: {
                        actions: ["update"],
                        before: {
                          name: "Application maintenance",
                          description: "private-drift",
                        },
                        after: {
                          name: "Cloud name",
                          description: "private-drift",
                        },
                        before_sensitive: { description: true },
                        after_sensitive: { description: true },
                      },
                    },
                  ]
                : [],
          });
          const key = randomUUID();
          const job = await delegatedApplications.startPlan(
            owner,
            maintenance.ordered.id,
            { idempotencyKey: key, purpose },
          );
          await expect(
            delegatedApplications.startPlan(owner, maintenance.ordered.id, {
              idempotencyKey: key,
              purpose: purpose === "destroy" ? "drift" : "destroy",
            }),
          ).rejects.toMatchObject({ code: "idempotency_conflict" });
          const ticket = delegatedTicket;
          expect(
            (await delegatedApplications.runnerInput(ticket, ticketPackage))
              .application.purpose,
          ).toBe(purpose);
          for (const stage of ["initializing", "validating", "planning"])
            await delegatedApplications.runnerStage(ticket, ticketPackage, {
              stage,
            });
          const summary = summarizePlan(
            await delegatedRunner.preview({
              bytes: Buffer.alloc(0),
              sha256: "a".repeat(64),
              identity: ticketPackage.runnerPackageId,
            }),
            2,
            "opentofu-1.12.6",
          );
          const artifact = await delegatedApplications.runnerArtifact(
            ticket,
            ticketPackage,
            {
              data: Buffer.from("delegated-test-plan").toString("base64"),
              summary,
            },
          );
          await delegatedApplications.runnerResult(ticket, ticketPackage, {
            status: "succeeded",
            summary,
            artifactSha256: artifact.sha256,
          });
          return { id: job.jobId, sha: artifact.sha256 };
        };
        const drift = await maintenancePlan("drift");
        expect(
          (
            await delegatedApplications.listJobs(owner, maintenance.ordered.id)
          ).find((job) => job.id === drift.id),
        ).toMatchObject({ purpose: "drift", canApply: false });
        const observed = await delegatedApplications.previewPlan(
          owner,
          drift.id,
        );
        expect(observed.drift).toHaveLength(1);
        expect(JSON.stringify(observed)).not.toContain("private-drift");
        await expect(
          delegatedApplications.startApply(owner, drift.id, {
            artifactSha256: drift.sha,
          }),
        ).rejects.toMatchObject({ code: "application_drift_read_only" });
        const destroyed = await maintenancePlan("destroy");
        for (const input of [
          { artifactSha256: destroyed.sha },
          {
            artifactSha256: destroyed.sha,
            confirmDestroy: true,
            instanceId: randomUUID(),
          },
        ])
          await expect(
            delegatedApplications.startApply(owner, destroyed.id, input),
          ).rejects.toMatchObject({
            code: "application_destroy_confirmation_required",
          });
        const destroyApply = await delegatedApplications.startApply(
          owner,
          destroyed.id,
          {
            artifactSha256: destroyed.sha,
            confirmDestroy: true,
            instanceId: maintenance.ordered.id,
          },
        );
        const destroyTicket = delegatedTicket;
        expect(
          (
            await delegatedApplications.runnerInput(
              destroyTicket,
              ticketPackage,
            )
          ).application.purpose,
        ).toBe("destroy");
        await expect(
          delegatedApplications.startPlan(owner, maintenance.ordered.id, {
            idempotencyKey: randomUUID(),
            purpose: "drift",
          }),
        ).rejects.toMatchObject({ code: "40001" });
        for (const stage of ["initializing", "validating", "applying"])
          await delegatedApplications.runnerStage(
            destroyTicket,
            ticketPackage,
            { stage },
          );
        await delegatedApplications.runnerResult(destroyTicket, ticketPackage, {
          status: "succeeded",
        });
        expect(
          (
            await delegatedApplications.listJobs(owner, maintenance.ordered.id)
          ).find((job) => job.id === destroyApply.jobId),
        ).toMatchObject({
          purpose: "destroy",
          operation: "apply",
          status: "succeeded",
        });
        expect(
          (
            await migration.query(
              "SELECT * FROM lzc.application_dispatches WHERE job_id=$1",
              [failedApply.jobId],
            )
          ).rows,
        ).toEqual(historical);
        expect(
          (await delegatedApplications.listInstances(owner)).find(
            (item) => item.id === maintenance.ordered.id,
          ),
        ).toMatchObject({ canDelete: false, canArchive: true });
        delegatedRunner.preview.mockResolvedValue(originalPreview);
        const deletablePlan = await freshPlan("Completed plan deletion");
        const storedArtifact = await migration.query(
          "SELECT sha256,ciphertext FROM lzc.application_runner_records WHERE job_id=$1 AND kind='artifact'",
          [deletablePlan.id],
        );
        expect(
          (await delegatedApplications.listInstances(owner)).find(
            (item) => item.id === deletablePlan.ordered.id,
          )?.canDelete,
        ).toBe(true);
        await delegatedApplications.deleteOrder(
          owner,
          deletablePlan.ordered.id,
          {
            confirmDeletion: true,
          },
        );
        expect(
          (await delegatedApplications.listInstances(owner)).some(
            (item) => item.id === deletablePlan.ordered.id,
          ),
        ).toBe(false);
        expect(
          await delegatedApplications.listJobs(owner, deletablePlan.ordered.id),
        ).toEqual([]);
        const startsAfterDeletion = delegatedRunner.start.mock.calls.length;
        for (const attempt of [
          () => delegatedApplications.previewPlan(owner, deletablePlan.id),
          () =>
            delegatedApplications.startApply(owner, deletablePlan.id, {
              artifactSha256: deletablePlan.sha,
            }),
        ])
          await expect(attempt()).rejects.toMatchObject({
            code: "40001",
            message: "application_order_deleted",
          });
        expect(delegatedRunner.start.mock.calls.length).toBe(
          startsAfterDeletion,
        );
        expect(
          (
            await migration.query(
              "SELECT sha256,ciphertext FROM lzc.application_runner_records WHERE job_id=$1 AND kind='artifact'",
              [deletablePlan.id],
            )
          ).rows,
        ).toEqual(storedArtifact.rows);
        const deletionRacePool = new pg.Pool({
          ...migrationConfig,
          user: "configurator_app",
          password: "runtime-test-only",
          max: 4,
        });
        try {
          const racingApplications = new Applications(
            deletionRacePool,
            delegatedTechnical,
            applicationSecrets,
            applicationBackends,
            { runner: delegatedRunner, origin: "http://127.0.0.1:3000" },
            applicationCrypto,
          );
          for (let iteration = 0; iteration < 4; iteration++) {
            const racedPlan = await freshPlan(
              `Plan deletion race ${iteration}`,
            );
            const results = await Promise.allSettled([
              racingApplications.deleteOrder(owner, racedPlan.ordered.id, {
                confirmDeletion: true,
              }),
              racingApplications.startApply(owner, racedPlan.id, {
                artifactSha256: racedPlan.sha,
              }),
            ]);
            expect(
              results.filter((result) => result.status === "fulfilled"),
            ).toHaveLength(1);
            const state = (
              await migration.query(
                "SELECT EXISTS(SELECT 1 FROM lzc.application_order_deletions WHERE instance_id=$1) AS deleted, EXISTS(SELECT 1 FROM lzc.application_jobs WHERE instance_id=$1 AND operation='apply') AS applied",
                [racedPlan.ordered.id],
              )
            ).rows[0];
            expect(state.deleted).not.toBe(state.applied);
          }
        } finally {
          await deletionRacePool.end();
        }
        const superseded = await freshPlan("Superseded application plan");
        delegatedRunner.supportsArtifact.mockReturnValueOnce(false);
        await expect(
          delegatedApplications.startApply(owner, superseded.id, {
            artifactSha256: superseded.sha,
          }),
        ).rejects.toMatchObject({ code: "application_apply_package_changed" });
        await delegatedApplications.prepareJob(owner, superseded.ordered.id, {
          idempotencyKey: randomUUID(),
          confirmPlan: true,
        });
        await expect(
          delegatedApplications.startApply(owner, superseded.id, {
            artifactSha256: superseded.sha,
          }),
        ).rejects.toMatchObject({ code: "40001" });
        const recovering = await freshPlan("Application recovery");
        const recoveryApply = await delegatedApplications.startApply(
          owner,
          recovering.id,
          { artifactSha256: recovering.sha },
        );
        const recoveryTicket = delegatedTicket;
        await delegatedApplications.runnerInput(recoveryTicket, ticketPackage);
        for (const stage of ["initializing", "validating", "applying"])
          await delegatedApplications.runnerStage(
            recoveryTicket,
            ticketPackage,
            { stage },
          );
        const recoveryBytes = Buffer.from(
          JSON.stringify({
            version: 4,
            lineage: randomUUID(),
            serial: 1,
            resources: [],
            outputs: { secret: "private-recovery-only" },
          }),
        );
        const recoveryHash = (await import("node:crypto"))
          .createHash("sha256")
          .update(recoveryBytes)
          .digest("hex");
        await expect(
          delegatedApplications.runnerRecovery(recoveryTicket, ticketPackage, {
            data: recoveryBytes.toString("base64"),
            sha256: "f".repeat(64),
          }),
        ).rejects.toMatchObject({ code: "application_recovery_invalid" });
        expect(
          await delegatedApplications.runnerRecovery(
            recoveryTicket,
            ticketPackage,
            { data: recoveryBytes.toString("base64"), sha256: recoveryHash },
          ),
        ).toEqual({ sha256: recoveryHash });
        await delegatedApplications.runnerResult(
          recoveryTicket,
          ticketPackage,
          { status: "failed", errorCode: "state_failed" },
        );
        expect(
          await delegatedApplications.listJobs(owner, recovering.ordered.id),
        ).toContainEqual(
          expect.objectContaining({
            id: recoveryApply.jobId,
            status: "reconciliation_required",
          }),
        );
        const storedRecovery = (
          await migration.query(
            "SELECT ciphertext FROM lzc.application_runner_records WHERE job_id=$1 AND kind='recovery'",
            [recoveryApply.jobId],
          )
        ).rows[0];
        expect(
          storedRecovery.ciphertext.includes(
            Buffer.from("private-recovery-only"),
          ),
        ).toBe(false);
        await admin.query("BEGIN; SET LOCAL session_replication_role=replica");
        try {
          await admin.query(
            "UPDATE lzc.application_runner_tickets SET expires_at=clock_timestamp()-interval '1 microsecond' WHERE job_id=$1",
            [recoveryApply.jobId],
          );
          await admin.query("COMMIT");
        } catch (error) {
          await admin.query("ROLLBACK");
          throw error;
        }
        for (const purpose of ["destroy", "drift"])
          await expect(
            delegatedApplications.startPlan(owner, recovering.ordered.id, {
              idempotencyKey: randomUUID(),
              purpose,
            }),
          ).rejects.toMatchObject({
            code: "40001",
            message: "application_instance_running",
          });
        await expect(
          delegatedApplications.startPlan(owner, recovering.ordered.id, {
            idempotencyKey: randomUUID(),
          }),
        ).rejects.toMatchObject({
          code: "40001",
          message: "application_instance_running",
        });
        expect(await delegatedApplications.listInstances(owner)).toContainEqual(
          expect.objectContaining({
            id: recovering.ordered.id,
            canDelete: false,
            canArchive: true,
          }),
        );
        await expect(
          delegatedApplications.deleteOrder(owner, recovering.ordered.id, {
            confirmDeletion: true,
          }),
        ).rejects.toMatchObject({
          message: "application_order_execution_started",
        });
        await delegatedApplications.deleteOrder(owner, recovering.ordered.id, {
          confirmArchive: true,
        });
        expect(
          await delegatedApplications.listInstances(owner),
        ).not.toContainEqual(
          expect.objectContaining({ id: recovering.ordered.id }),
        );
        expect(
          await delegatedApplications.listJobs(owner, recovering.ordered.id),
        ).toEqual([]);
        expect(
          (
            await migration.query(
              "SELECT ciphertext FROM lzc.application_runner_records WHERE job_id=$1 AND kind='recovery'",
              [recoveryApply.jobId],
            )
          ).rows[0].ciphertext,
        ).toEqual(storedRecovery.ciphertext);
        await expect(
          delegatedApplications.startPlan(owner, recovering.ordered.id, {
            idempotencyKey: randomUUID(),
          }),
        ).rejects.toMatchObject({ message: "application_order_deleted" });
      } finally {
        await migration.query(
          "UPDATE lzc_auth.sessions SET expires_at=$2 WHERE id=$1",
          [engineer.id, engineerExpiry],
        );
      }
      const revokedOrder = await delegatedApplications.order(owner, {
        versionId: cliVersion.id,
        idempotencyKey: randomUUID(),
        name: "Revoked delegation order",
        parameters: {},
      });
      const revokedJob = await delegatedApplications.prepareJob(
        owner,
        revokedOrder.id,
        { idempotencyKey: randomUUID(), confirmPlan: true },
      );
      await withTenant(pool, owner, (client) =>
        client.query(
          "SELECT lzc_auth.delegated_application_operation($1,$2,'reserve','{}')",
          [owner.id, revokedJob.id],
        ),
      );
      await delegatedApplications.configureExecution(
        engineer,
        approved.document.revision,
        { enabled: false, confirmRevocation: true },
      );
      expect(
        await delegatedApplications.listJobs(owner, revokedOrder.id),
      ).toMatchObject([{ canDispatch: false }]);
      await expect(
        delegatedApplications.dispatchJob(owner, revokedJob.id, {
          confirmPlan: true,
        }),
      ).rejects.toMatchObject({ code: "42501" });
      await withTenant(pool, owner, (client) =>
        client.query(
          "SELECT lzc_auth.delegated_application_operation($1,$2,'fail','{}')",
          [owner.id, revokedJob.id],
        ),
      );
      expect(
        (
          await migration.query(
            "SELECT status FROM lzc.application_dispatches WHERE job_id=$1",
            [revokedJob.id],
          )
        ).rows[0].status,
      ).toBe("failed");
      const renewedBinding = await delegatedApplications.configureExecution(
        engineer,
        approved.document.revision,
        executionRequest,
      );
      expect(renewedBinding.id).not.toBe(executionBinding.id);
      expect(
        await delegatedApplications.listJobs(owner, revokedOrder.id),
      ).toMatchObject([{ canDispatch: false }]);
      const renewedJob = await delegatedApplications.prepareJob(
        owner,
        revokedOrder.id,
        { idempotencyKey: randomUUID(), confirmPlan: true },
      );
      expect(
        (await delegatedApplications.listJobs(owner, revokedOrder.id)).find(
          (item) => item.id === renewedJob.id,
        ),
      ).toMatchObject({ canDispatch: true, delegatedExecution: true });
      await expect(
        delegatedApplications.dispatchJob(engineer, renewedJob.id, {
          confirmPlan: true,
        }),
      ).rejects.toMatchObject({ code: "42501" });
      const changedCredentialOrder = await delegatedApplications.order(owner, {
        versionId: cliVersion.id,
        idempotencyKey: randomUUID(),
        name: "Changed delegated credential",
        parameters: {},
      });
      const changedCredentialJob = await delegatedApplications.prepareJob(
        owner,
        changedCredentialOrder.id,
        { idempotencyKey: randomUUID(), confirmPlan: true },
      );
      await delegatedApplications.dispatchJob(owner, changedCredentialJob.id, {
        confirmPlan: true,
      });
      applicationSecrets.get.mockResolvedValueOnce({
        ...applicationSecret,
        version: 2,
      });
      await expect(
        delegatedApplications.runnerInput(delegatedTicket, ticketPackage),
      ).rejects.toMatchObject({ code: "application_credential_changed" });
      await withTenant(pool, owner, (client) =>
        client.query(
          "SELECT lzc_auth.delegated_application_operation($1,$2,'fail','{}')",
          [owner.id, changedCredentialJob.id],
        ),
      );
      const secretRevokedOrder = await delegatedApplications.order(owner, {
        versionId: cliVersion.id,
        idempotencyKey: randomUUID(),
        name: "Revoke during delegated secret read",
        parameters: {},
      });
      const secretRevokedJob = await delegatedApplications.prepareJob(
        owner,
        secretRevokedOrder.id,
        { idempotencyKey: randomUUID(), confirmPlan: true },
      );
      await delegatedApplications.dispatchJob(owner, secretRevokedJob.id, {
        confirmPlan: true,
      });
      applicationSecrets.get.mockImplementationOnce(async () => {
        await delegatedApplications.configureExecution(
          engineer,
          approved.document.revision,
          { enabled: false, confirmRevocation: true },
        );
        return applicationSecret;
      });
      await expect(
        delegatedApplications.runnerInput(delegatedTicket, ticketPackage),
      ).rejects.toMatchObject({ code: "42501" });
      await withTenant(pool, owner, (client) =>
        client.query(
          "SELECT lzc_auth.delegated_application_operation($1,$2,'fail','{}')",
          [owner.id, secretRevokedJob.id],
        ),
      );
      await delegatedApplications.configureExecution(
        engineer,
        approved.document.revision,
        executionRequest,
      );
      const approvalVersion = await delegatedApplications.publish(engineer, {
        template,
        ...binding,
        acceleratorRevision: cliRevision,
        deploymentPolicy: "approval-required",
      });
      const approvalOrder = await delegatedApplications.order(owner, {
        versionId: approvalVersion.id,
        idempotencyKey: randomUUID(),
        name: "Delegated approval order",
        parameters: {},
      });
      await expect(
        delegatedApplications.prepareJob(owner, approvalOrder.id, {
          idempotencyKey: randomUUID(),
          confirmPlan: true,
        }),
      ).rejects.toMatchObject({
        code: "40001",
        message: "application_order_not_approved",
      });
      const approvedOrder = await delegatedApplications.decideOrder(
        engineer,
        approvalOrder.id,
        {
          decision: "approved",
          reason: "Business approval test",
          confirmDecision: true,
        },
      );
      expect(approvedOrder.executionConfigured).toBe(true);
      const approvalJob = await delegatedApplications.prepareJob(
        owner,
        approvalOrder.id,
        { idempotencyKey: randomUUID(), confirmPlan: true },
      );
      expect(
        await delegatedApplications.listJobs(owner, approvalOrder.id),
      ).toMatchObject([
        { id: approvalJob.id, canDispatch: true, delegatedExecution: true },
      ]);
      await identities.revoke(engineer);
      await expect(
        applications.approvePlatformContract(engineer, input),
      ).rejects.toMatchObject({ status: 403 });
      await migration.query(
        "UPDATE lzc.memberships SET product_roles='{}' WHERE tenant_id=$1 AND user_id=$2",
        [tenantId, bob.userId],
      );
      await expect(
        applications.listPlatformContracts(owner),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        applications.preparePlanInput(owner, order.id),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        organisations.archive(alice, tenantId),
      ).rejects.toMatchObject({ code: "55000" });
    } finally {
      await identities.revoke(engineer);
      await identities.revoke(owner);
      await organisations.switch(alice, alice.tenantId);
      await organisations.switch(bob, bob.tenantId);
    }
  });
  it("uses a runtime role without ownership, superuser or bypass privileges", async () => {
    const result = await pool.query(
      "SELECT rolsuper, rolbypassrls, rolcreaterole FROM pg_roles WHERE rolname=current_user",
    );
    expect(result.rows[0]).toEqual({
      rolsuper: false,
      rolbypassrls: false,
      rolcreaterole: false,
    });
    const tables = await pool.query(
      "SELECT relrowsecurity, relforcerowsecurity, pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='lzc.configurations'::regclass",
    );
    expect(tables.rows[0]).toEqual({
      relrowsecurity: true,
      relforcerowsecurity: true,
      owner: "configurator_migration",
    });
    await expect(
      pool.query("SELECT * FROM lzc_auth.sessions"),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      pool.query("UPDATE lzc.memberships SET role='admin'"),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("returns no rows without transaction context and never leaks pooled identity", async () => {
    expect((await pool.query("SELECT * FROM lzc.configurations")).rows).toEqual(
      [],
    );
    expect(
      (
        await withTenant(pool, alice, (c) =>
          c.query("SELECT id FROM lzc.configurations"),
        )
      ).rows,
    ).toEqual([{ id: aliceDocument }]);
    expect((await pool.query("SELECT * FROM lzc.configurations")).rows).toEqual(
      [],
    );
    await expect(
      withTenant(pool, alice, async () => {
        throw new Error("rollback-test");
      }),
    ).rejects.toThrow("rollback-test");
    expect((await pool.query("SELECT * FROM lzc.configurations")).rows).toEqual(
      [],
    );
  });
  it("denies another tenant even when the attacker knows every object ID", async () => {
    expect(
      (
        await withTenant(pool, bob, (c) =>
          c.query("SELECT * FROM lzc.configurations WHERE id=$1", [
            aliceDocument,
          ]),
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await withTenant(
          pool,
          { userId: bob.userId, tenantId: alice.tenantId },
          (c) => c.query("SELECT * FROM lzc.configurations"),
        )
      ).rows,
    ).toEqual([]);
    await expect(
      withTenant(pool, bob, (c) =>
        c.query(
          "INSERT INTO lzc.configurations(tenant_id,created_by,name,document) VALUES($1,$2,'Attack','{}')",
          [alice.tenantId, bob.userId],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    expect(
      (
        await withTenant(pool, bob, (c) =>
          c.query("UPDATE lzc.configurations SET name='Attack' WHERE id=$1", [
            aliceDocument,
          ]),
        )
      ).rowCount,
    ).toBe(0);
    await expect(
      withTenant(pool, alice, (c) =>
        c.query("UPDATE lzc.configurations SET tenant_id=$1 WHERE id=$2", [
          bob.tenantId,
          aliceDocument,
        ]),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("keeps memberships server-managed and readonly users unable to write", async () => {
    await migration.query(
      "INSERT INTO lzc.memberships(tenant_id,user_id,role) VALUES($1,$2,'viewer')",
      [alice.tenantId, bob.userId],
    );
    const viewer = { userId: bob.userId, tenantId: alice.tenantId };
    expect(
      (
        await withTenant(pool, viewer, (c) =>
          c.query("SELECT id FROM lzc.configurations"),
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await withTenant(pool, viewer, (c) =>
          c.query("UPDATE lzc.configurations SET name='Attack' WHERE id=$1", [
            aliceDocument,
          ]),
        )
      ).rowCount,
    ).toBe(0);
    await migration.query(
      "UPDATE lzc.memberships SET role='editor',product_roles=ARRAY['platform-engineer'] WHERE tenant_id=$1 AND user_id=$2",
      [alice.tenantId, bob.userId],
    );
    expect(
      (
        await withTenant(pool, viewer, (client) =>
          client.query("SELECT id FROM lzc.configurations"),
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await withTenant(pool, viewer, (client) =>
          client.query("DELETE FROM lzc.configurations WHERE id=$1", [
            aliceDocument,
          ]),
        )
      ).rowCount,
    ).toBe(0);
    await migration.query(
      "DELETE FROM lzc.memberships WHERE tenant_id=$1 AND user_id=$2",
      [alice.tenantId, bob.userId],
    );
  });
  it("consumes login state once, requires its browser binding and rejects expiry", async () => {
    const login = createGitHubLogin(
      "client",
      "https://configurator.example/auth/github/callback",
    );
    const state =
      new URL(login.authorizationUrl).searchParams.get("state") ?? "";
    await store.beginLogin(login.pending);
    expect(await store.consumeLogin(state, "x".repeat(43))).toBeNull();
    const [one, two] = await Promise.all([
      store.consumeLogin(state, login.cookieBinding),
      store.consumeLogin(state, login.cookieBinding),
    ]);
    expect([one, two].filter(Boolean)).toHaveLength(1);
    expect(await store.consumeLogin(state, login.cookieBinding)).toBeNull();
    await store.beginLogin({ ...login.pending, expiresAt: Date.now() - 1000 });
    expect(await store.consumeLogin(state, login.cookieBinding)).toBeNull();
  });
  it("resolves only opaque valid sessions, rejects revocation and expired sessions", async () => {
    expect((await store.resolveSession(aliceToken))?.userId).toBe(alice.userId);
    expect(
      await store.resolveSession(randomBytes(32).toString("base64url")),
    ).toBeNull();
    await migration.query(
      "UPDATE lzc_auth.sessions SET expires_at=now()-interval '1 second' WHERE id=$1",
      [alice.id],
    );
    expect(await store.resolveSession(aliceToken)).toBeNull();
    await store.deleteSession(aliceToken);
    expect(await store.resolveSession(aliceToken)).toBeNull();
  });
});

describe("personal credential metadata with real PostgreSQL RLS", () => {
  const key = {
    credentials: {
      kid: "test-key-id",
      iss: "test@sa.stackit.cloud",
      sub: "11111111-2222-4333-8444-555555555555",
      aud: "https://service-account.api.stackit.cloud" as const,
      privateKey: "INTEGRATION-SECRET-ONLY-IN-VAULT-MOCK",
    },
  };
  it("isolates owners even within the same tenant and never stores key material in PostgreSQL", async () => {
    const secrets = {
      get: vi.fn(),
      put: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
    };
    const profiles = new PostgresCredentialProfiles(pool, secrets);
    await profiles.create(alice, "Alice deployment", key);
    const [profile] = await profiles.list(alice);
    expect(profile?.state).toBe("stored");
    if (!profile) throw new Error("Missing profile");
    expect(await profiles.list(bob)).toEqual([]);
    await migration.query(
      "INSERT INTO lzc.memberships(tenant_id,user_id,role) VALUES($1,$2,'admin')",
      [alice.tenantId, bob.userId],
    );
    const otherAdmin = { ...bob, tenantId: alice.tenantId };
    expect(await profiles.list(otherAdmin)).toEqual([]);
    await expect(profiles.remove(otherAdmin, profile.id)).rejects.toMatchObject(
      { status: 404 },
    );
    expect(secrets.remove).not.toHaveBeenCalled();
    expect(
      (await pool.query("SELECT * FROM lzc.credential_profiles")).rows,
    ).toEqual([]);
    const rows = await withTenant(pool, alice, (c) =>
      c.query("SELECT * FROM lzc.credential_profiles"),
    );
    expect(JSON.stringify(rows.rows)).not.toContain(key.credentials.privateKey);
    await expect(
      withTenant(pool, alice, (c) =>
        c.query(
          "UPDATE lzc.credential_profiles SET owner_user_id=$1 WHERE id=$2",
          [bob.userId, profile.id],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await profiles.remove(alice, profile.id);
    expect(secrets.remove).toHaveBeenCalledExactlyOnceWith(alice, profile.id);
    expect(await profiles.list(alice)).toEqual([]);
    await migration.query(
      "DELETE FROM lzc.memberships WHERE tenant_id=$1 AND user_id=$2",
      [alice.tenantId, bob.userId],
    );
  });
  it("retains recovery metadata after ambiguous writes/deletes and supports cleanup retries", async () => {
    const secrets = {
      get: vi.fn(),
      put: vi.fn(async () => {
        throw new Error("ambiguous write");
      }),
      remove: vi.fn(async () => {}),
    };
    const profiles = new PostgresCredentialProfiles(pool, secrets);
    await expect(profiles.create(alice, "Incomplete", key)).rejects.toThrow(
      "ambiguous write",
    );
    const [pending] = await profiles.list(alice);
    expect(pending?.state).toBe("pending");
    if (!pending) throw new Error("Missing pending profile");
    secrets.remove.mockRejectedValueOnce(new Error("ambiguous delete"));
    await expect(profiles.remove(alice, pending.id)).rejects.toThrow(
      "ambiguous delete",
    );
    expect(await profiles.list(alice)).toHaveLength(1);
    await profiles.remove(alice, pending.id);
    expect(await profiles.list(alice)).toEqual([]);
  });
  it("denies create to viewers before touching the secret store", async () => {
    const secrets = { get: vi.fn(), put: vi.fn(), remove: vi.fn() };
    const profiles = new PostgresCredentialProfiles(pool, secrets);
    await migration.query(
      "INSERT INTO lzc.memberships(tenant_id,user_id,role) VALUES($1,$2,'viewer')",
      [alice.tenantId, bob.userId],
    );
    const viewer = { ...bob, tenantId: alice.tenantId };
    await expect(
      profiles.create(viewer, "Forbidden", key),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      withTenant(pool, viewer, (c) =>
        c.query(
          "INSERT INTO lzc.credential_profiles(id,tenant_id,owner_user_id,name,service_account,key_id) VALUES($1,$2,$3,'Forbidden','mail','key')",
          [randomUUID(), alice.tenantId, bob.userId],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    expect(secrets.put).not.toHaveBeenCalled();
    await migration.query(
      "DELETE FROM lzc.memberships WHERE tenant_id=$1 AND user_id=$2",
      [alice.tenantId, bob.userId],
    );
  });
});

describe("credential checks and immutable deployment preparations", () => {
  it("persists check failures, denies foreign access before reading keys and invalidates preparations when credentials are deleted", async () => {
    const key = {
      credentials: {
        kid: "deployment-key",
        iss: "test@sa.stackit.cloud",
        sub: randomUUID(),
        aud: "https://accounts.stackit.cloud" as const,
        privateKey: "MOCK-SECRET-NEVER-IN-POSTGRES",
      },
    };
    const organizationId = randomUUID();
    const check = {
      status: "passed" as const,
      code: "organization_readable" as const,
      organizationId,
      organizationName: "Test organization",
      checkedAt: new Date().toISOString(),
    };
    const secrets = {
      get: vi.fn(async () => ({ key, version: 1 })),
      put: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
    };
    const cloud = { check: vi.fn(async () => check) };
    // The real client is independently tested for signing, endpoints and response handling.
    const profiles = new PostgresCredentialProfiles(pool, secrets, cloud);
    await profiles.create(alice, "Checked profile", key);
    const [profile] = await profiles.list(alice);
    if (!profile) throw new Error("Missing profile");
    await expect(
      profiles.check(bob, profile.id, organizationId),
    ).rejects.toMatchObject({ status: 404 });
    expect(secrets.get).not.toHaveBeenCalled();
    expect(await profiles.check(alice, profile.id, organizationId)).toEqual(
      check,
    );
    expect((await profiles.list(alice))[0]?.lastCheck).toEqual(check);
    secrets.get.mockRejectedValueOnce(new Error("Secret unavailable"));
    expect(
      await profiles.check(alice, profile.id, organizationId),
    ).toMatchObject({ status: "failed", code: "secret_unavailable" });
    expect((await profiles.list(alice))[0]?.lastCheck?.status).toBe("failed");
    const template = catalogue.templates.find(
      (item) => item.id === "standalone",
    ) as Template;
    const draft = createDraft(template);
    draft.organization = organizationId;
    draft.owner = "owner@stackit.cloud";
    for (const project of draft.projects) project.owner = draft.owner;
    for (const sandbox of draft.sandboxes) sandbox.owner = draft.owner;
    const document = savedDraft(randomUUID(), draft);
    const head = "a".repeat(40);
    const repositories = {
      prepareSnapshot: vi.fn(async () => ({
        document,
        head,
        tfvars: serializeTfvars(configurationValues(document)),
      })),
    };
    const preparations = new Preparations(pool, repositories, profiles);
    const input = {
      target: { id: 123, owner: "alice", name: "accelerator" },
      head,
      configurationId: document.id,
      credentialId: profile.id,
    };
    await expect(
      preparations.create(bob, "ghu_bob", input),
    ).rejects.toMatchObject({ status: 404 });
    expect(repositories.prepareSnapshot).not.toHaveBeenCalled();
    const result = await preparations.create(alice, "ghu_alice", input);
    const [record] = await preparations.list(alice);
    expect(record.id).toBe(result.id);
    expect(record.manifest.source.commit).toBe(head);
    expect(record.manifest.credential.secretVersion).toBe(1);
    expect(JSON.stringify(record)).not.toContain(key.credentials.privateKey);
    expect(JSON.stringify(record)).not.toContain("ghu_alice");
    expect(await preparations.list(bob)).toEqual([]);
    await expect(preparations.remove(bob, result.id)).rejects.toMatchObject({
      status: 404,
    });
    await migration.query(
      "INSERT INTO lzc.memberships(tenant_id,user_id,role) VALUES($1,$2,'admin')",
      [alice.tenantId, bob.userId],
    );
    const otherAdmin = { ...bob, tenantId: alice.tenantId };
    expect(await preparations.list(otherAdmin)).toEqual([]);
    await expect(
      withTenant(pool, otherAdmin, (c) =>
        c.query(
          "INSERT INTO lzc.deployment_preparations(id,tenant_id,owner_user_id,credential_id,name,manifest) VALUES($1,$2,$3,$4,'Attack','{}')",
          [randomUUID(), alice.tenantId, bob.userId, profile.id],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      withTenant(pool, alice, (c) =>
        c.query(
          "UPDATE lzc.deployment_preparations SET manifest='{}' WHERE id=$1",
          [result.id],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await profiles.remove(alice, profile.id);
    expect((await preparations.list(alice))[0]?.credentialId).toBeNull();
    await preparations.remove(alice, result.id);
    expect(await preparations.list(alice)).toEqual([]);
    await migration.query(
      "DELETE FROM lzc.memberships WHERE tenant_id=$1 AND user_id=$2",
      [alice.tenantId, bob.userId],
    );
  });
});

it.each([false, true])(
  "isolates queued plans, consumes input once, rejects replay and expires abandoned runners (common=%s)",
  async (common) => {
    const { Plans } = await import("../apps/api/src/plans/service.js");
    const { tokenHash } = await import("../apps/api/src/auth/store.js");
    const template = catalogue.templates.find(
      (t) => t.id === "standalone",
    ) as Template;
    const draft = createDraft(template);
    draft.organization = randomUUID();
    draft.owner = "owner@stackit.cloud";
    for (const p of draft.projects) p.owner = draft.owner;
    for (const s of draft.sandboxes) s.owner = draft.owner;
    const legacy = savedDraft(randomUUID(), draft);
    const document = common ? migrateCommonConfiguration(legacy) : legacy,
      profileId = randomUUID(),
      preparationId = randomUUID();
    const tfvars = serializeTfvars(recordValues(document));
    const check = {
      status: "passed" as const,
      code: "organization_readable" as const,
      organizationId: draft.organization,
      organizationName: "Test org",
      checkedAt: new Date().toISOString(),
    };
    const profiles = {
      verifyForPreparation: vi.fn(async () => ({
        check,
        version: 1,
        keyId: "test-kid",
      })),
    };
    const key = {
      credentials: {
        kid: "test-kid",
        iss: "test@sa.stackit.cloud",
        privateKey: "secret-not-in-db",
      },
    };
    const secrets = {
      get: vi.fn(async () => ({ key, version: 1 })),
      put: vi.fn(),
      remove: vi.fn(),
    };
    const { preparationManifest } = await import(
      "../apps/api/src/deployments/preparations.js"
    );
    const manifest = preparationManifest(
      {
        target: { id: 123, owner: "alice", name: "lza" },
        head: "a".repeat(40),
        configurationId: document.id,
        credentialId: profileId,
      },
      { document, head: "a".repeat(40), tfvars },
      { check, version: 1, keyId: "test-kid" },
    );
    await migration.query(
      "INSERT INTO lzc.credential_profiles(id,tenant_id,owner_user_id,name,service_account,key_id,state) VALUES($1,$2,$3,'Runner test','test@sa.stackit.cloud','test-kid','stored')",
      [profileId, alice.tenantId, alice.userId],
    );
    await migration.query(
      "INSERT INTO lzc.deployment_preparations(id,tenant_id,owner_user_id,credential_id,name,manifest) VALUES($1,$2,$3,$4,'Runner test',$5)",
      [
        preparationId,
        alice.tenantId,
        alice.userId,
        profileId,
        JSON.stringify(manifest),
      ],
    );
    let ticket = "";
    const runner = {
      start: vi.fn(
        async (
          _id: string,
          t: string,
          _origin: string,
          record: (id: string, source: string) => Promise<void>,
        ) => {
          ticket = t;
          await record(randomUUID(), randomUUID());
        },
      ),
      remove: vi.fn(async () => {}),
    };
    const repositories = {
      prepareSnapshot: vi.fn(async () => ({
        document,
        head: "a".repeat(40),
        tfvars,
      })),
    };
    // Secret mock tests ownership/version; production key parsing is tested separately.
    const plans = new Plans(
      pool,
      profiles,
      secrets as unknown as ConstructorParameters<typeof Plans>[2],
      repositories,
      runner,
      "https://configurator.example",
    );
    await expect(
      plans.start(bob, "ghu_bob", preparationId),
    ).rejects.toMatchObject({ status: 404 });
    expect(repositories.prepareSnapshot).not.toHaveBeenCalled();
    const run = await plans.start(alice, "ghu_alice", preparationId);
    expect(await plans.list(bob)).toEqual([]);
    await expect(plans.cancel(bob, run.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      plans.start(alice, "ghu_alice", preparationId),
    ).rejects.toMatchObject({ code: "plan_already_running" });
    const records = await plans.list(alice);
    expect(JSON.stringify(records)).not.toContain(ticket);
    expect(JSON.stringify(records)).not.toContain("secret-not-in-db");
    await expect(plans.input("x".repeat(43))).rejects.toMatchObject({
      status: 401,
    });
    const input = await plans.input(ticket);
    expect(input.id).toBe(run.id);
    expect(input.key).toEqual(key);
    expect(input.tfvars).toBe(tfvars);
    await expect(plans.input(ticket)).rejects.toMatchObject({ status: 401 });
    await expect(plans.stage(ticket, "planning")).rejects.toMatchObject({
      code: "invalid_runner_transition",
    });
    await plans.stage(ticket, "validating");
    await plans.stage(ticket, "planning");
    await expect(
      plans.result(ticket, { status: "applying" }),
    ).rejects.toThrow();
    await plans.result(ticket, { status: "failed", errorCode: "plan_failed" });
    await expect(
      plans.result(ticket, { status: "failed", errorCode: "plan_failed" }),
    ).rejects.toMatchObject({ status: 401 });
    await migration.query(
      "UPDATE lzc.plan_runs SET finished_at=now()-interval '1 minute' WHERE id=$1",
      [run.id],
    );
    await plans.maintain();
    expect(runner.remove).toHaveBeenCalledWith(run.id, expect.any(String));
    // Expiry prevents another input delivery and releases the user's single active slot.
    const second = await plans.start(alice, "ghu_alice", preparationId);
    await migration.query(
      "UPDATE lzc.plan_runs SET expires_at=now()-interval '1 second' WHERE id=$1",
      [second.id],
    );
    await plans.maintain();
    expect((await plans.list(alice))[0]?.errorCode).toBe("timed_out");
    if (common) {
      const third = await plans.start(alice, "ghu_alice", preparationId);
      const poisoned = {
        ...manifest,
        configuration: editCommonInput(
          migrateCommonConfiguration(legacy),
          "devops",
          { git_flavor: "git-10" },
        ),
      };
      await migration.query(
        "UPDATE lzc.deployment_preparations SET manifest=$2 WHERE id=$1",
        [preparationId, JSON.stringify(poisoned)],
      );
      const reads = secrets.get.mock.calls.length;
      await expect(plans.input(ticket)).rejects.toMatchObject({
        code: "configuration_execution_not_supported",
      });
      expect(secrets.get.mock.calls.length).toBe(reads);
      await expect(
        plans.start(alice, "ghu_alice", preparationId),
      ).rejects.toMatchObject({
        code: "configuration_execution_not_supported",
      });
      await plans.cancel(alice, third.id);
    }

    expect(
      (
        await pool.query("SELECT * FROM lzc_auth.resolve_plan_ticket($1)", [
          tokenHash(ticket),
        ])
      ).rows,
    ).toEqual([]);
  },
  30000,
);

describe("independent external identities", () => {
  it("backfills existing identities without replacing user IDs", async () => {
    // Replay the additive migration transactionally against the pre-migration shape.
    await migration.query("BEGIN");
    try {
      await migration.query("DROP TABLE lzc_auth.external_identities");
      await migration.query(
        `WITH legacy_users AS (
          SELECT id, (SELECT coalesce(max(github_id), 0) FROM lzc_auth.users)
            + row_number() OVER (ORDER BY id) AS github_id
          FROM lzc_auth.users WHERE github_id IS NULL
        )
        UPDATE lzc_auth.users SET github_id = legacy_users.github_id,
          github_login = 'migration-fixture'
        FROM legacy_users WHERE users.id = legacy_users.id`,
      );
      const sql = await readFile(
        `${directory}/006_external_identities.sql`,
        "utf8",
      );
      await migration.query(sql);
      const rows = await migration.query(
        "SELECT user_id FROM lzc_auth.external_identities WHERE provider='github' AND subject='101'",
      );
      expect(rows.rows).toEqual([{ user_id: alice.userId }]);
    } finally {
      await migration.query("ROLLBACK");
    }
  });

  it("keeps user and tenant stable across a GitHub rename", async () => {
    const session = await store.createSession({
      githubId: 101,
      login: "alice-renamed",
      id: randomUUID(),
      hash: newSessionToken().hash,
      csrfToken: randomBytes(32).toString("base64url"),
      expiresAt: new Date(Date.now() + 3600000),
    });
    expect(session.userId).toBe(alice.userId);
    expect(session.tenantId).toBe(alice.tenantId);
    const result = await migration.query(
      "SELECT user_id FROM lzc_auth.external_identities WHERE provider='github' AND subject='101'",
    );
    expect(result.rows).toEqual([{ user_id: alice.userId }]);
  });
  it("denies runtime identity reads and reassignment", async () => {
    await expect(
      pool.query("SELECT * FROM lzc_auth.external_identities"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      pool.query("UPDATE lzc_auth.external_identities SET user_id=$1", [
        bob.userId,
      ]),
    ).rejects.toThrow(/permission denied/);
  });
  it("allows GitHub-independent users and scopes subjects to their issuer", async () => {
    const user = await migration.query(
      "INSERT INTO lzc_auth.users DEFAULT VALUES RETURNING id",
    );
    for (const issuer of [
      "https://issuer-a.example",
      "https://issuer-b.example",
    ]) {
      await migration.query(
        "INSERT INTO lzc_auth.external_identities(provider,issuer,subject,user_id) VALUES('oidc',$1,'same-subject',$2)",
        [issuer, user.rows[0].id],
      );
    }
    await expect(
      migration.query(
        "INSERT INTO lzc_auth.external_identities(provider,issuer,subject,user_id) VALUES('oidc','https://issuer-a.example','same-subject',$1)",
        [bob.userId],
      ),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe("organisation draft workspaces", () => {
  let alice: Session, bob: Session, aliceToken: string;
  beforeAll(async () => {
    async function create(githubId: number) {
      const token = newSessionToken();
      const session = await store.createSession({
        githubId,
        login: `org-user-${githubId}`,
        id: randomUUID(),
        hash: token.hash,
        csrfToken: randomBytes(32).toString("base64url"),
        expiresAt: new Date(Date.now() + 3600000),
      });
      return { session, token: token.token };
    }
    const first = await create(901);
    alice = first.session;
    aliceToken = first.token;
    bob = (await create(902)).session;
  });
  const organisations = new PostgresOrganisations(pool);
  it("authorizes owner-scoped organisation credentials by product role, including role revocation", async () => {
    const id = await organisations.create(
      alice,
      "Credential team",
      randomUUID(),
    );
    await organisations.switch(alice, id);
    const engineer = { ...alice, tenantId: id };
    const secrets = { put: vi.fn(), get: vi.fn(), remove: vi.fn() };
    const profiles = new PostgresCredentialProfiles(pool, secrets);
    const key = {
      active: true as const,
      credentials: {
        kid: randomUUID(),
        iss: "test@sa.stackit.cloud",
        sub: randomUUID(),
        aud: "https://service-account.api.stackit.cloud" as const,
        privateKey: generateKeyPairSync("rsa", { modulusLength: 2048 })
          .privateKey.export({ format: "pem", type: "pkcs8" })
          .toString(),
      },
    };
    await profiles.create(engineer, "Platform", key);
    const [profile] = await profiles.list(engineer);
    if (!profile) throw new Error("Credential metadata missing");
    expect(profile?.state).toBe("stored");
    expect(await profiles.list(alice)).toEqual([]);
    await inviteMember(engineer, bob, ["application-owner"], false);
    await organisations.switch(bob, id);
    const owner = { ...bob, tenantId: id };
    await expect(
      profiles.create(owner, "Forbidden", key),
    ).rejects.toMatchObject({ code: "credential_role_required" });
    expect(await profiles.list(owner)).toEqual([]);
    await organisations.editMember(
      engineer,
      bob.userId,
      ["platform-engineer"],
      true,
    );
    expect(await profiles.list(owner)).toEqual([]);
    await expect(profiles.remove(owner, profile.id)).rejects.toMatchObject({
      code: "credential_not_found",
    });
    await organisations.editMember(
      owner,
      alice.userId,
      ["application-owner"],
      false,
    );
    expect(await profiles.list(engineer)).toEqual([]);
    await expect(
      profiles.create(engineer, "Revoked", key),
    ).rejects.toMatchObject({ code: "credential_role_required" });
    expect(secrets.get).not.toHaveBeenCalled();
    expect(secrets.remove).not.toHaveBeenCalled();
    await organisations.switch(alice, alice.tenantId);
    await organisations.switch(bob, bob.tenantId);
  });
  it("creates draft membership, preserves personal token binding and revokes membership", async () => {
    expect(
      (await organisations.overview(alice)).tenants.find(
        (t) => t.id === alice.tenantId,
      )?.roles,
    ).toEqual([]);
    const id = await organisations.create(alice, "Platform team", randomUUID());
    const overview = await organisations.overview(alice);
    expect(overview.activeTenantId).toBe(alice.tenantId);
    expect(overview.tenants.find((t) => t.id === id)).toMatchObject({
      kind: "organisation",
      organizationVerified: false,
      roles: ["platform-engineer"],
      manageMembers: true,
    });
    await expect(organisations.switch(bob, id)).rejects.toMatchObject({
      code: "42501",
    });
    await organisations.switch(alice, id);
    await expect(
      organisations.editMember(alice, bob.userId, ["application-owner"], false),
    ).rejects.toMatchObject({ code: "40001" });
    await expect(
      organisations.editMember(
        { ...alice, tenantId: id },
        alice.userId,
        ["platform-engineer", "application-owner"],
        true,
      ),
    ).rejects.toMatchObject({ code: "42501" });
    expect(await store.resolveSession(aliceToken)).toMatchObject({
      tenantId: id,
      tokenTenantId: alice.tenantId,
      tenantKind: "organisation",
      productRoles: ["platform-engineer"],
    });
    await expect(
      organisations.editMember(
        { ...alice, tenantId: id },
        alice.userId,
        ["application-owner"],
        false,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await inviteMember(
      { ...alice, tenantId: id },
      bob,
      ["application-owner"],
      false,
    );
    await organisations.switch(bob, id);
    expect((await organisations.overview(bob)).members).toEqual([]);
    await expect(
      organisations.editMember(
        { ...bob, tenantId: id },
        bob.userId,
        ["platform-engineer"],
        true,
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      withTenant(pool, { userId: bob.userId, tenantId: id }, (client) =>
        client.query(
          "INSERT INTO lzc.configurations(tenant_id,created_by,name,document) VALUES($1,$2,'forbidden','{}')",
          [id, bob.userId],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await organisations.editMember(
      { ...alice, tenantId: id },
      bob.userId,
      [],
      false,
      true,
    );
    expect((await organisations.overview(bob)).activeTenantId).toBe(
      bob.tenantId,
    );
    await expect(organisations.switch(bob, id)).rejects.toMatchObject({
      code: "42501",
    });
    await expect(
      pool.query("SELECT * FROM lzc_auth.membership_audit"),
    ).rejects.toMatchObject({ code: "42501" });
    const audit = await migration.query(
      "SELECT action FROM lzc_auth.membership_audit WHERE tenant_id=$1 ORDER BY created_at",
      [id],
    );
    expect(audit.rows.map((r) => r.action)).toEqual([
      "organisation_created",
      "invitation_created",
      "invitation_accepted",
      "member_removed",
    ]);
    await organisations.switch(alice, alice.tenantId);
  });
  it("serializes competing last-manager changes", async () => {
    const id = await organisations.create(
      alice,
      "Concurrent managers",
      randomUUID(),
    );
    await organisations.switch(alice, id);
    await inviteMember(
      { ...alice, tenantId: id },
      bob,
      ["platform-engineer"],
      true,
    );
    await organisations.switch(bob, id);
    const concurrent = new pg.Pool({
      ...migrationConfig,
      user: "configurator_app",
      password: "runtime-test-only",
      max: 2,
    });
    try {
      const service = new PostgresOrganisations(concurrent);
      const results = await Promise.allSettled([
        service.editMember(
          { ...alice, tenantId: id },
          alice.userId,
          ["platform-engineer"],
          false,
        ),
        service.editMember(
          { ...bob, tenantId: id },
          bob.userId,
          ["platform-engineer"],
          false,
        ),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
      const remaining = await migration.query(
        "SELECT user_id FROM lzc.memberships WHERE tenant_id=$1 AND manage_members",
        [id],
      );
      expect(remaining.rowCount).toBe(1);
    } finally {
      await concurrent.end();
      await organisations.switch(alice, alice.tenantId);
      await organisations.switch(bob, bob.tenantId);
    }
  });
  it("archives only the creator's empty unverified draft and preserves its audit", async () => {
    const organizationId = randomUUID();
    const id = await organisations.create(
      alice,
      "Accidental duplicate",
      organizationId,
    );
    await expect(
      organisations.create(alice, " accidental duplicate ", organizationId),
    ).rejects.toMatchObject({ code: "23505" });
    const unrelated = await organisations.create(
      bob,
      "Accidental duplicate",
      organizationId,
    );
    await organisations.archive(bob, unrelated);
    await expect(organisations.archive(bob, id)).rejects.toMatchObject({
      code: "42501",
    });
    await expect(
      organisations.archive(alice, alice.tenantId),
    ).rejects.toMatchObject({ code: "42501" });
    await organisations.switch(alice, id);
    await inviteMember(
      { ...alice, tenantId: id },
      bob,
      ["application-owner"],
      false,
    );
    await expect(organisations.archive(alice, id)).rejects.toMatchObject({
      code: "55000",
    });
    await organisations.editMember(
      { ...alice, tenantId: id },
      bob.userId,
      [],
      false,
      true,
    );
    await migration.query(
      "UPDATE lzc.tenants SET organization_verified=true WHERE id=$1",
      [id],
    );
    await expect(organisations.archive(alice, id)).rejects.toMatchObject({
      code: "55000",
    });
    await migration.query(
      "UPDATE lzc.tenants SET organization_verified=false WHERE id=$1",
      [id],
    );
    await migration.query(
      "INSERT INTO lzc.configurations(tenant_id,created_by,name,document) VALUES($1,$2,'keep','{}')",
      [id, alice.userId],
    );
    await expect(organisations.archive(alice, id)).rejects.toMatchObject({
      code: "55000",
    });
    await migration.query("DELETE FROM lzc.configurations WHERE tenant_id=$1", [
      id,
    ]);
    await organisations.archive(alice, id);
    const overview = await organisations.overview(alice);
    expect(overview.activeTenantId).toBe(alice.tenantId);
    expect(overview.tenants.some((t) => t.id === id)).toBe(false);
    await expect(organisations.switch(alice, id)).rejects.toMatchObject({
      code: "42501",
    });
    await expect(organisations.archive(alice, id)).rejects.toMatchObject({
      code: "42501",
    });
    expect(
      (
        await migration.query(
          "SELECT 1 FROM lzc_auth.membership_audit WHERE tenant_id=$1 AND action='organisation_archived'",
          [id],
        )
      ).rowCount,
    ).toBe(1);
  });
});

describe("single-use membership invitations", () => {
  const organisations = new PostgresOrganisations(pool);
  let alice: Session, bob: Session;
  beforeAll(async () => {
    const create = (githubId: number) =>
      store.createSession({
        githubId,
        login: `invite-${githubId}`,
        id: randomUUID(),
        hash: newSessionToken().hash,
        csrfToken: randomBytes(32).toString("base64url"),
        expiresAt: new Date(Date.now() + 3600000),
      });
    alice = await create(1001);
    bob = await create(1002);
  });

  it("requires consent, hashes the token and accepts it exactly once", async () => {
    const tenantId = await organisations.create(
      alice,
      "Invited team",
      randomUUID(),
    );
    await organisations.switch(alice, tenantId);
    const manager = { ...alice, tenantId };
    await expect(
      organisations.editMember(
        manager,
        bob.userId,
        ["application-owner"],
        false,
      ),
    ).rejects.toMatchObject({ code: "23503" });
    const invite = await invitations.create(
      manager,
      ["application-owner"],
      false,
    );
    const row = (
      await migration.query(
        "SELECT token_hash FROM lzc_auth.invitations WHERE id=$1",
        [invite.id],
      )
    ).rows[0];
    expect(row.token_hash).not.toBe(invite.token);
    expect(JSON.stringify(await invitations.list(manager))).not.toContain(
      invite.token,
    );
    expect(await invitations.use(bob, invite.token, false)).toMatchObject({
      tenantId,
      roles: ["application-owner"],
    });
    const otherPool = new pg.Pool({
      ...migrationConfig,
      user: "configurator_app",
      password: "runtime-test-only",
      max: 2,
    });
    try {
      const service = new Invitations(otherPool);
      const outcomes = await Promise.allSettled([
        service.use(bob, invite.token, true),
        service.use(bob, invite.token, true),
      ]);
      expect(outcomes.filter((v) => v.status === "fulfilled")).toHaveLength(1);
      expect(outcomes.filter((v) => v.status === "rejected")).toHaveLength(1);
    } finally {
      await otherPool.end();
    }
    const escalation = await invitations.create(
      manager,
      ["platform-engineer"],
      true,
    );
    await expect(
      invitations.use(bob, escalation.token, true),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      pool.query("SELECT * FROM lzc_auth.invitations"),
    ).rejects.toMatchObject({ code: "42501" });
    await organisations.switch(alice, alice.tenantId);
    await organisations.switch(bob, bob.tenantId);
  });
  it("rejects expired, revoked, archived and unauthorized invitations", async () => {
    const tenantId = await organisations.create(
      alice,
      "Revoked invitations",
      randomUUID(),
    );
    await organisations.switch(alice, tenantId);
    const manager = { ...alice, tenantId };
    const revoked = await invitations.create(
      manager,
      ["application-owner"],
      false,
    );
    await expect(
      invitations.revoke({ ...bob, tenantId }, revoked.id),
    ).rejects.toBeDefined();
    await invitations.revoke(manager, revoked.id);
    await expect(
      invitations.use(bob, revoked.token, true),
    ).rejects.toMatchObject({ code: "22023" });
    const expired = await invitations.create(
      manager,
      ["application-owner"],
      false,
    );
    await migration.query(
      "UPDATE lzc_auth.invitations SET expires_at=now()-interval '1 second' WHERE id=$1",
      [expired.id],
    );
    await expect(
      invitations.use(bob, expired.token, true),
    ).rejects.toMatchObject({ code: "22023" });
    const archived = await invitations.create(
      manager,
      ["application-owner"],
      false,
    );
    await organisations.archive(manager, tenantId);
    await expect(
      invitations.use(bob, archived.token, true),
    ).rejects.toMatchObject({ code: "22023" });
    await expect(
      invitations.use(bob, "x".repeat(43), false),
    ).rejects.toMatchObject({ code: "22023" });
  });
  it("invalidates invitations when the issuer loses membership management", async () => {
    const tenantId = await organisations.create(
      alice,
      "Issuer revocation",
      randomUUID(),
    );
    await organisations.switch(alice, tenantId);
    const manager = { ...alice, tenantId };
    const invite = await invitations.create(
      manager,
      ["application-owner"],
      false,
    );
    await migration.query(
      "UPDATE lzc.memberships SET manage_members=false WHERE tenant_id=$1 AND user_id=$2",
      [tenantId, alice.userId],
    );
    await expect(
      invitations.use(bob, invite.token, true),
    ).rejects.toMatchObject({ code: "22023" });
    await organisations.switch(alice, alice.tenantId);
  });
});
