import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { assistantProposalFields, summarizePlan } from "@lzc/contracts";
import {
  catalogue,
  compileCommonConfiguration,
  configurationValues,
  createDraft,
  createEditorConfiguration,
  editCommonInput,
  effectiveInput,
  exportCommonTfvars,
  migrateCommonConfiguration,
  objectValue,
  recordValues,
  savedDraft,
  serializeTfvars,
  setCommonInput,
  type Template,
} from "@lzc/domain";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import { Applications } from "../apps/api/src/applications/service.js";
import { ApplicationStateRecoveries } from "../apps/api/src/applications/state-recovery.js";
import type { Dialogue } from "../apps/api/src/assistant/dialogue.js";
import { buildAssistantKnowledge } from "../apps/api/src/assistant/knowledge.js";
import {
  type AssistantCatalogueContext,
  AssistantModelServing,
} from "../apps/api/src/assistant/model-serving.js";
import { AssistantConversations } from "../apps/api/src/assistant/service.js";
import {
  createGitHubLogin,
  newSessionToken,
} from "../apps/api/src/auth/github-flow.js";
import { StackitDeviceFlow } from "../apps/api/src/auth/stackit-device.js";
import { StackitIdentities } from "../apps/api/src/auth/stackit-identities.js";
import {
  PostgresAuthStore,
  type Session,
  tokenHash,
} from "../apps/api/src/auth/store.js";
import { Configurations } from "../apps/api/src/configurations/service.js";
import type { CloudCatalogue } from "../apps/api/src/credentials/catalogues.js";
import { PostgresCredentialProfiles } from "../apps/api/src/credentials/profiles.js";
import type { Backends } from "../apps/api/src/deployments/backends.js";
import { Preparations } from "../apps/api/src/deployments/preparations.js";
import { Invitations } from "../apps/api/src/organisation/invitations.js";
import { PostgresOrganisations } from "../apps/api/src/organisation/service.js";
import type { PlanRunner } from "../apps/api/src/plans/cloud-foundry.js";
import { ArtifactCrypto } from "../apps/api/src/plans/crypto.js";
import { withTenant } from "../apps/api/src/storage/database.js";
import { migrate } from "../apps/api/src/storage/migrations.js";
import {
  assistantScenarioFixture,
  assistantScenarios,
} from "../scripts/assistant-scenarios.js";

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
  it("reports incomplete model templates as proposal failures without losing successful history or saving a draft", async () => {
    const configurations = new Configurations(pool);
    const draft = createEditorConfiguration("standalone", randomUUID());
    const stored = await configurations.create(alice, draft);
    let proposal: Dialogue = {
      explanation: "Vorheriger erfolgreicher Grundlagenvorschlag.",
      references: ["configuration-contract"],
      questions: [],
      changes: [],
    };
    const model = {
      converse: vi.fn<AssistantModelServing["converse"]>(async () => proposal),
    };
    const assistant = new AssistantConversations(pool, model);
    const previous = await assistant.send(
      alice,
      stored.id,
      1,
      "Grundlagen prüfen",
    );
    proposal = {
      explanation: "Application-Vorlagen vorgeschlagen.",
      references: ["project-templates"],
      questions: [],
      changes: [
        {
          path: "projectTemplates",
          operation: "merge",
          value: { "new-corporate": { settings: { network_enabled: true } } },
        },
      ],
    };
    const app = await buildApp({
      auth: {
        origin: "https://configurator.example",
        clientId: "test",
        store,
        github: { authorize: vi.fn() },
        tokens: { put: vi.fn(), get: vi.fn(), remove: vi.fn() },
      },
      assistant,
    });
    try {
      for (const accept of ["application/json", "application/x-ndjson"]) {
        const response = await app.inject({
          method: "POST",
          url: `/api/v1/configurations/${stored.id}/assistant`,
          headers: {
            cookie: `__Host-lzc-session=${aliceToken}`,
            origin: "https://configurator.example",
            "x-lzc-csrf": alice.csrfToken,
            accept,
          },
          payload: {
            revision: 1,
            message:
              "Bitte Corporate- und Public-Vorlagen mit lokalen Netzen vorbereiten.",
          },
        });
        const failure =
          accept === "application/json"
            ? response.json()
            : response.body
                .trim()
                .split("\n")
                .map((line) => JSON.parse(line))
                .find((event) => event.type === "error");
        expect(response.statusCode).toBe(
          accept === "application/json" ? 503 : 200,
        );
        expect(failure).toMatchObject({
          error: "assistant_inference_failed",
          reason: "proposal_invalid",
          requestId: expect.any(String),
        });
        expect(failure).not.toHaveProperty("issues");
        expect(await assistant.get(alice, stored.id)).toEqual(previous);
        expect(await configurations.get(alice, stored.id)).toEqual(stored);
      }
    } finally {
      await app.close();
      await configurations.remove(alice, stored.id, 1);
    }
  });
  it("keeps an eight-hour STACKIT session while expired human authority remains denied", async () => {
    const token = newSessionToken();
    const proof = {
      issuer: "https://accounts.stackit.cloud",
      subject: randomUUID(),
      email: "independent-session@example.test",
      emailVerified: true as const,
      verificationMethod: "signed-id-token-and-userinfo" as const,
      tokenExpiresAt: new Date(Date.now() + 300000).toISOString(),
      organization: null,
    };
    const expiresAt = new Date(Date.now() + 8 * 3600000);
    const login = await store.createStackitSession({
      identity: proof,
      id: randomUUID(),
      hash: token.hash,
      csrfToken: randomBytes(32).toString("base64url"),
      expiresAt,
    });
    const organisations = new PostgresOrganisations(pool);
    const organizationId = randomUUID();
    const tenantId = await organisations.create(
      login,
      "Independent session authority",
      organizationId,
    );
    await organisations.switch(login, tenantId);
    const session = { ...login, tenantId };
    const identities = new StackitIdentities(pool);
    await identities.save(session, {
      ...proof,
      organization: {
        id: organizationId,
        name: "Independent session organization",
        permissions: ["organization.read", "organization.write"],
        ownerPermissions: ["organization.read", "organization.write"],
      },
    });
    expect((await identities.status(session)).organizationAdminVerified).toBe(
      true,
    );
    await migration.query(
      "UPDATE lzc.stackit_identities SET valid_until=now()-interval '1 second' WHERE user_id=$1",
      [session.userId],
    );
    expect(await store.resolveSession(token.token)).toMatchObject({
      id: session.id,
      expiresAt,
    });
    expect(await identities.status(session)).toMatchObject({
      verified: false,
      organizationVerified: false,
      organizationAdminVerified: false,
    });
    const app = buildApp({
      auth: {
        origin: "https://configurator.example",
        clientId: "",
        primaryStackit: true,
        githubEnabled: false,
        store,
        github: { authorize: vi.fn() },
        tokens: { put: vi.fn(), get: vi.fn(), remove: vi.fn() },
      },
      stackit: {
        identities,
        organisations,
        createFlow: () => new StackitDeviceFlow(),
      },
    });
    try {
      const response = await app.inject({
        url: "/api/v1/session",
        headers: { cookie: `__Host-lzc-session=${token.token}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        user: { id: session.userId },
        expiresAt: expiresAt.toISOString(),
        stackitVerified: false,
      });
    } finally {
      await app.close();
    }
    await expect(
      identities.bindOrganization(session, {
        confirmOrganizationBinding: true,
      }),
    ).rejects.toMatchObject({ code: "42501" });
    for (const invalid of [
      { expiresAt: new Date(Date.now() + 9 * 3600000) },
      {
        identity: {
          ...proof,
          tokenExpiresAt: new Date(Date.now() - 1000).toISOString(),
        },
      },
    ])
      await expect(
        store.createStackitSession({
          identity: proof,
          id: randomUUID(),
          hash: newSessionToken().hash,
          csrfToken: randomBytes(32).toString("base64url"),
          expiresAt,
          ...invalid,
        }),
      ).rejects.toMatchObject({ code: "23514" });
    await store.deleteSession(token.token);
    expect(await store.resolveSession(token.token)).toBeNull();
  });
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

  it("persists workspace template advice without creating configs and prevents late resurrection", async () => {
    const configurations = new Configurations(pool);
    const count = (await configurations.list(alice)).length;
    const model = {
      converse: vi.fn(),
      adviseTemplates: vi.fn(async () => ({
        templateId: "standalone",
        explanation: "Public starting point",
        questions: [
          { text: "Which region?", options: ["eu01", "eu02", "Not decided"] },
        ],
        references: ["public-corporate"],
        knowledgeSha256: buildAssistantKnowledge().sha256,
      })),
    };
    const assistant = new AssistantConversations(pool, model);
    const advice = await assistant.sendTemplateAdvice(
      alice,
      "Public team, no corporate connection",
    );
    expect(advice?.recommendation?.templateId).toBe("standalone");
    expect(advice?.recommendation?.questions).toEqual([
      { text: "Which region?", options: ["eu01", "eu02", "Not decided"] },
    ]);
    expect(advice?.messages.at(-1)?.content).toBe(
      "Public starting point\nWhich region?",
    );
    expect(advice?.messages).toHaveLength(2);
    expect((await configurations.list(alice)).length).toBe(count);
    expect(
      (await new AssistantConversations(pool, model).getTemplateAdvice(alice))
        ?.id,
    ).toBe(advice?.id);
    expect(await assistant.getTemplateAdvice(bob)).toBeNull();
    expect(
      (await assistant.getTemplateAdvice(alice))?.recommendation?.questions,
    ).toEqual(advice?.recommendation?.questions);
    await assistant.sendTemplateAdvice(alice, "eu01");
    expect((await assistant.getTemplateAdvice(alice))?.messages).toHaveLength(
      4,
    );
    expect((await assistant.getTemplateAdvice(alice))?.expiresAt).toBe(
      advice?.expiresAt,
    );
    await expect(
      withTenant(pool, alice, (client) =>
        client.query(
          "UPDATE lzc.assistant_template_advice SET expires_at=now()+interval '1 year'",
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    const late = new AssistantConversations(pool, {
      converse: vi.fn(),
      adviseTemplates: async () => {
        await assistant.removeTemplateAdvice(alice);
        return model.adviseTemplates();
      },
    });
    await expect(
      late.sendTemplateAdvice(alice, "Another question"),
    ).rejects.toMatchObject({ status: 409 });
    expect(await assistant.getTemplateAdvice(alice)).toBeNull();
    await assistant.sendTemplateAdvice(alice, "Start again");
    await migration.query(
      "UPDATE lzc.assistant_template_advice SET expires_at=now()-interval '1 second' WHERE created_by=$1",
      [alice.userId],
    );
    await assistant.prune();
    expect(await assistant.getTemplateAdvice(alice)).toBeNull();
  });

  it("hands template requirements to the configuration chat without extending expiry or copying identities to the model", async () => {
    const configurations = new Configurations(pool);
    const model = {
      adviseTemplates: vi.fn(async () => ({
        templateId: "hub-and-spoke",
        explanation: "Hub und Spoke",
        questions: [],
        references: ["configuration-contract"],
        knowledgeSha256: buildAssistantKnowledge().sha256,
      })),
      converse: vi.fn(async (..._arguments: unknown[]) => ({
        explanation: "Bitte Adresspool nennen",
        questions: [],
        changes: [],
        references: ["configuration-contract"],
      })),
    };
    const assistant = new AssistantConversations(pool, model);
    const advice = await assistant.sendTemplateAdvice(
      alice,
      "CLUE GmbH: etwa 100 Projekte, zuerst SNA, Firewall spaeter.",
    );
    if (!advice) throw new Error("missing_advice");
    const reference = { id: advice.id, revision: advice.revision };
    const draft = createEditorConfiguration("hub-and-spoke", randomUUID());
    await expect(
      configurations.create(bob, draft, reference),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      configurations.create(alice, draft, {
        ...reference,
        revision: reference.revision + 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
    const stored = await configurations.create(alice, draft, reference);
    const context = await withTenant(
      pool,
      alice,
      async (client) =>
        (
          await client.query(
            "SELECT * FROM lzc.assistant_configuration_context WHERE configuration_id=$1",
            [stored.id],
          )
        ).rows[0],
    );
    expect(context.expires_at.toISOString()).toBe(advice.expiresAt);
    await assistant.send(alice, stored.id, 1, "Machen wir damit weiter");
    expect(model.converse.mock.calls[0]?.[5]).toEqual(advice.messages);
    expect((await assistant.get(alice, stored.id))?.messages).toHaveLength(2);
    await expect(
      withTenant(pool, alice, (client) =>
        client.query(
          "UPDATE lzc.assistant_configuration_context SET expires_at=now()+interval '1 year'",
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await assistant.removeTemplateAdvice(alice);
    expect(
      await withTenant(
        pool,
        alice,
        async (client) =>
          (
            await client.query(
              "SELECT * FROM lzc.assistant_configuration_context WHERE configuration_id=$1",
              [stored.id],
            )
          ).rowCount,
      ),
    ).toBe(0);
    await assistant.send(alice, stored.id, 1, "Neue Rueckfrage");
    expect(model.converse.mock.calls[1]?.[5]).toEqual([]);
    await configurations.remove(alice, stored.id, 1);
  });

  it("loads fresh owner-scoped product catalogues for chat and advice without leaking access metadata", async () => {
    const configurations = new Configurations(pool);
    const stored = await configurations.create(
      alice,
      createEditorConfiguration("standalone", randomUUID()),
    );
    const projectId = randomUUID();
    const contexts: (AssistantCatalogueContext | undefined)[] = [];
    let generation = 0;
    const catalogues = {
      pim: vi.fn(async (_session: Session, region: "eu01" | "eu02") => ({
        region,
        fetchedAt: new Date().toISOString(),
        products: [],
        skus: [
          {
            id: "billing-article",
            productName: "VPN",
            title: "VPN 100",
            region,
            deprecated: "No",
            maturityModelState: "ga",
            version: "1",
            productSpecificAttributes: {
              discriminator: "Network",
              planId: "p100",
              maxBandWidth: 100,
            },
          },
        ],
      })),
      automatic: vi.fn(async (session: Session, region: "eu01" | "eu02") => {
        await withTenant(pool, session, (client) => client.query("SELECT 1"));
        if (region === "eu02") throw new Error("unavailable");
        generation++;
        const empty = { status: "unavailable" as const, options: [] };
        return {
          region,
          projectId,
          fetchedAt: new Date().toISOString(),
          gitFlavors: empty,
          vpnPlans: {
            status: "available",
            options: Array.from({ length: 55 }, (_, index) => ({
              value: `opaque-${index}`,
              label: `Current plan ${generation}-${index}`,
            })),
          },
          kubernetesVersions: empty,
          machineTypes: empty,
          availabilityZones: empty,
          volumeTypes: empty,
          credential: "never-send-credential",
        } as CloudCatalogue;
      }),
    };
    const model = {
      converse: vi.fn(
        async (
          _selection: unknown,
          _values: unknown,
          _history: unknown,
          _message: string,
          context?: AssistantCatalogueContext,
        ) => {
          contexts.push(context);
          return {
            explanation: "Aktuelle Angebote beruecksichtigt",
            questions: [],
            changes: [],
            references: ["configuration-contract"],
          };
        },
      ),
      adviseTemplates: vi.fn(
        async (
          _history: unknown,
          _message: string,
          context?: AssistantCatalogueContext,
        ) => {
          contexts.push(context);
          return {
            templateId: "standalone",
            explanation: "Aktuelle Angebote beruecksichtigt",
            questions: [],
            references: ["configuration-contract"],
            knowledgeSha256: buildAssistantKnowledge().sha256,
          };
        },
      ),
    };
    const assistant = new AssistantConversations(pool, model, catalogues);
    await expect(
      assistant.send(bob, stored.id, 1, "Welche Angebote gibt es?"),
    ).rejects.toMatchObject({ status: 404 });
    expect(catalogues.automatic).not.toHaveBeenCalled();
    expect(catalogues.pim).not.toHaveBeenCalled();
    await assistant.send(
      alice,
      stored.id,
      1,
      "Welche VPN-Leistungsklassen gibt es?",
    );
    await assistant.send(alice, stored.id, 1, "Bitte erneut aktuell nachsehen");
    expect(catalogues.automatic).toHaveBeenCalledTimes(2);
    expect(catalogues.automatic).toHaveBeenCalledWith(alice, "eu01");
    expect(contexts[0]?.regions[0]?.products.vpnPlans).toMatchObject({
      truncated: true,
      totalOptions: 55,
      options: expect.arrayContaining([
        { value: "opaque-0", label: "Current plan 1-0" },
      ]),
    });
    expect(contexts[0]?.regions[0]?.products.vpnPlans?.options).toHaveLength(
      50,
    );
    expect(contexts[1]?.regions[0]?.products.vpnPlans?.options[0]?.label).toBe(
      "Current plan 2-0",
    );
    await assistant.sendTemplateAdvice(
      alice,
      "Welche Vorlagen und Leistungsangebote passen?",
    );
    expect(catalogues.automatic).toHaveBeenCalledWith(alice, "eu02");
    expect(contexts[2]?.regions[1]).toMatchObject({
      region: "eu02",
      fetchedAt: null,
      products: { vpnPlans: { status: "unavailable", options: [] } },
    });
    expect(contexts[2]?.regions[1]?.pim).toMatchObject({
      status: "available",
      skus: [
        {
          id: "billing-article",
          productSpecificAttributes: { planId: "p100", maxBandWidth: 100 },
        },
      ],
    });
    expect(JSON.stringify(contexts)).not.toContain(projectId);
    expect(JSON.stringify(contexts)).not.toContain("never-send-credential");
    await assistant.removeTemplateAdvice(alice);
    await configurations.remove(alice, stored.id, 1);
  });

  it("rechecks live retention capabilities before presentation, preview and acceptance without nested pool transactions", async () => {
    const configurations = new Configurations(pool);
    const original = createEditorConfiguration("standalone", randomUUID());
    const stored = await configurations.create(alice, original);
    let supported = false;
    const automatic = vi.fn(
      async (
        session: Session,
        region: "eu01" | "eu02",
      ): Promise<CloudCatalogue> => {
        // The pool has a single connection: network/credential reads must be outside
        // the proposal write transaction or this read would deadlock.
        await withTenant(pool, session, (client) => client.query("SELECT 1"));
        const empty = { status: "unavailable" as const, options: [] };
        return {
          region,
          projectId: null,
          fetchedAt: new Date().toISOString(),
          gitFlavors: empty,
          vpnPlans: empty,
          kubernetesVersions: empty,
          machineTypes: empty,
          availabilityZones: empty,
          volumeTypes: empty,
          observabilityPlans: {
            status: "available",
            options: [
              {
                value: "Observability-Starter-EU01",
                label: "Starter",
                capabilities: {
                  metricsRetention: true,
                  logsRetention: supported,
                  tracesRetention: true,
                },
              },
            ],
          },
        };
      },
    );
    const proposal: Dialogue = {
      explanation: "Aufbewahrung für den gewählten Tarif prüfen.",
      questions: [],
      changes: [
        {
          path: "observability",
          operation: "merge",
          value: {
            plan_name: "Observability-Starter-EU01",
            logs_retention_days: 7,
          },
        },
      ],
      references: ["observability"],
    };
    const assistant = new AssistantConversations(
      pool,
      {
        converse: vi.fn<AssistantModelServing["converse"]>(
          async () => proposal,
        ),
      },
      { automatic },
    );
    await expect(
      assistant.send(alice, stored.id, 1, "Logs sieben Tage speichern"),
    ).rejects.toThrow("assistant_observability_plan_incompatible");
    supported = true;
    const conversation = await assistant.send(
      alice,
      stored.id,
      1,
      "Logs sieben Tage speichern",
    );
    supported = false;
    await expect(
      assistant.preview(
        alice,
        stored.id,
        conversation.revision,
        1,
        assistantProposalFields(conversation.proposal?.changes ?? []).map(
          (field) => field.id,
        ),
        original,
        original,
      ),
    ).rejects.toThrow("assistant_observability_plan_incompatible");
    await expect(
      assistant.accept(alice, stored.id, conversation.revision, 1),
    ).rejects.toThrow("assistant_observability_plan_incompatible");
    expect((await configurations.get(alice, stored.id)).revision).toBe(1);
    expect(await assistant.get(alice, stored.id)).toEqual(conversation);
    await configurations.remove(alice, stored.id, 1);
  });

  it("validates SNA proposals before presentation and saves native configuration only after acceptance", async () => {
    const configurations = new Configurations(pool);
    const stored = await configurations.create(
      alice,
      createEditorConfiguration("standalone", randomUUID()),
    );
    const area = {
      ranges: ["10.64.0.0/16"],
      transfer_network: "10.63.0.0/24",
      min_prefix_length: 24,
      max_prefix_length: 24,
      default_prefix_length: 24,
    };
    let proposal: Dialogue = {
      explanation: "SNA vorbereiten",
      questions: [],
      changes: [
        {
          path: "connectivity.network_areas",
          value: { default: { ...area, min_prefix_length: 28 } },
        },
      ],
      references: ["stackit-network-components"],
    };
    const model = {
      converse: vi.fn<AssistantModelServing["converse"]>(async () => proposal),
    };
    const assistant = new AssistantConversations(pool, model);
    await expect(
      assistant.send(bob, stored.id, 1, "SNA erstellen"),
    ).rejects.toMatchObject({ status: 404 });
    expect(model.converse).not.toHaveBeenCalled();
    await expect(
      assistant.send(alice, stored.id, 1, "SNA erstellen"),
    ).rejects.toThrow("assistant_configuration_invalid");
    const before = await configurations.get(alice, stored.id);
    expect(before.revision).toBe(1);
    proposal = {
      ...proposal,
      changes: [
        { path: "connectivity.network_areas", value: { default: area } },
      ],
    };
    const conversation = await assistant.send(
      alice,
      stored.id,
      1,
      "Adresspool und Transfernetz wie angegeben",
    );
    expect(conversation.proposal?.changes[0]?.before).toBeNull();
    expect((await configurations.get(alice, stored.id)).draft).toEqual(
      before.draft,
    );
    const controller = new AbortController();
    const onText = vi.fn();
    model.converse.mockImplementationOnce(
      async (
        _selection,
        _values,
        _history,
        _message,
        _catalogues,
        _context,
        stream,
      ) => {
        stream?.onText("Vorläufiger SNA-Text");
        controller.abort();
        return proposal;
      },
    );
    await expect(
      assistant.send(alice, stored.id, 1, "Abgebrochene Antwort", {
        signal: controller.signal,
        onText,
      }),
    ).rejects.toThrow();
    expect(onText).toHaveBeenCalledWith("Vorläufiger SNA-Text");
    expect(await assistant.get(alice, stored.id)).toEqual(conversation);
    expect((await configurations.get(alice, stored.id)).draft).toEqual(
      before.draft,
    );
    await expect(
      assistant.accept(alice, stored.id, conversation.revision + 1, 1),
    ).rejects.toMatchObject({ status: 409 });
    await migration.query(
      "UPDATE lzc.assistant_conversations SET proposal=$2 WHERE id=$1",
      [
        conversation.id,
        JSON.stringify({
          ...proposal,
          changes: [{ path: "firewall_bootstrap", value: true }],
        }),
      ],
    );
    await expect(
      assistant.accept(alice, stored.id, conversation.revision, 1),
    ).rejects.toThrow("assistant_invalid_proposal");
    expect((await configurations.get(alice, stored.id)).revision).toBe(1);
    await migration.query(
      "UPDATE lzc.assistant_conversations SET proposal=$2 WHERE id=$1",
      [conversation.id, JSON.stringify(proposal)],
    );
    await migration.query(
      "UPDATE lzc.assistant_conversations SET knowledge_hash='previous-knowledge' WHERE id=$1",
      [conversation.id],
    );
    expect((await assistant.get(alice, stored.id))?.stale).toBe(true);
    await expect(
      assistant.accept(alice, stored.id, conversation.revision, 1),
    ).rejects.toThrow("assistant_proposal_changed");
    const continued = await assistant.send(
      alice,
      stored.id,
      1,
      "Bitte mit aktuellem Wissen weiterarbeiten",
    );
    expect(continued.id).toBe(conversation.id);
    expect(continued.messages.slice(0, 2)).toEqual(conversation.messages);
    expect(continued.messages).toHaveLength(4);
    expect(continued.expiresAt).toBe(conversation.expiresAt);
    expect(continued.stale).toBe(false);
    expect(model.converse.mock.calls.at(-1)?.[0]).toMatchObject({
      knowledgeSha256: buildAssistantKnowledge().sha256,
    });
    expect(
      (
        await migration.query(
          "SELECT knowledge_hash FROM lzc.assistant_conversations WHERE id=$1",
          [conversation.id],
        )
      ).rows[0].knowledge_hash,
    ).toBe(buildAssistantKnowledge().sha256);
    const accepted = await new AssistantConversations(pool, model).accept(
      alice,
      stored.id,
      continued.revision,
      1,
    );
    expect(accepted.revision).toBe(2);
    const values = recordValues(
      accepted.draft as Parameters<typeof recordValues>[0],
    );
    expect(objectValue(values.connectivity).network_areas).toEqual({
      default: area,
    });
    expect(objectValue(values.connectivity).firewall).toBeUndefined();
    expect(serializeTfvars(values)).toContain("10.64.0.0/16");
    expect((await assistant.get(alice, stored.id))?.proposal).toBeNull();
    await configurations.remove(alice, stored.id, 2);
  });

  it.each(["preview", "persisted"] as const)(
    "preserves accepted DNS entries in sequential collection replacement through %s",
    async (mode) => {
      const configurations = new Configurations(pool);
      const original = createEditorConfiguration("hub-and-spoke", randomUUID());
      const stored = await configurations.create(alice, original);
      const value = { acme: { dns_name: "acme.runs.onstackit.cloud" } };
      const proposal: Dialogue = {
        explanation:
          "Vollständigen DNS-Satz zur Prüfung vorgeschlagen, noch nichts gespeichert.",
        questions: [],
        changes: [
          { path: "connectivity.dns_zones", operation: "replace", value },
        ],
        references: ["dns-zones"],
      };
      const assistant = new AssistantConversations(pool, {
        converse: vi.fn<AssistantModelServing["converse"]>(
          async () => proposal,
        ),
      });
      const proposed = await assistant.send(
        alice,
        stored.id,
        1,
        "Ich möchte genau eine DNS-Zone: acme.runs.onstackit.cloud.",
      );
      if (mode === "preview") {
        const first = await assistant.preview(
          alice,
          stored.id,
          proposed.revision,
          1,
          ["connectivity.dns_zones/acme"],
          original,
          original,
        );
        const remaining = first.conversation.proposal?.changes[0];
        const firstZones = objectValue(
          objectValue(
            compileCommonConfiguration(first.configuration.draft).connectivity,
          ).dns_zones,
        );
        expect(Object.keys(firstZones)).toHaveLength(2);
        const remainingValue = remaining?.value;
        if (
          !remainingValue ||
          typeof remainingValue !== "object" ||
          Array.isArray(remainingValue)
        )
          throw new Error("Missing remaining DNS collection");
        expect(Object.keys(remainingValue)).toEqual(["acme"]);
        expect(remainingValue).toMatchObject(value);
        expect(
          assistantProposalFields(
            first.conversation.proposal?.changes ?? [],
          ).map((field) => field.id),
        ).toEqual(["connectivity.dns_zones/example-corp"]);
        const second = await assistant.preview(
          alice,
          stored.id,
          proposed.revision,
          1,
          ["connectivity.dns_zones/example-corp"],
          first.configuration.draft,
          original,
        );
        const finalZones = objectValue(
          objectValue(
            compileCommonConfiguration(second.configuration.draft).connectivity,
          ).dns_zones,
        );
        expect(Object.keys(finalZones)).toEqual(["acme"]);
        expect(objectValue(finalZones.acme).dns_name).toBe(value.acme.dns_name);
        expect((await configurations.get(alice, stored.id)).draft).toEqual(
          original,
        );
        await configurations.remove(alice, stored.id, 1);
        return;
      }
      const first = await assistant.accept(
        alice,
        stored.id,
        proposed.revision,
        1,
        ["connectivity.dns_zones/acme"],
      );
      expect(
        Object.keys(
          objectValue(
            objectValue(compileCommonConfiguration(first.draft).connectivity)
              .dns_zones,
          ),
        ),
      ).toHaveLength(2);
      const remaining = await assistant.get(alice, stored.id);
      if (!remaining) throw new Error("Missing remaining DNS removal");
      expect(
        assistantProposalFields(remaining.proposal?.changes ?? []).map(
          (field) => field.id,
        ),
      ).toEqual(["connectivity.dns_zones/example-corp"]);
      const second = await assistant.accept(
        alice,
        stored.id,
        remaining.revision,
        first.revision,
        ["connectivity.dns_zones/example-corp"],
      );
      const zones = objectValue(
        objectValue(compileCommonConfiguration(second.draft).connectivity)
          .dns_zones,
      );
      expect(Object.keys(zones)).toEqual(["acme"]);
      expect(objectValue(zones.acme).dns_name).toBe(value.acme.dns_name);
      expect((await assistant.get(alice, stored.id))?.proposal).toBeNull();
      await configurations.remove(alice, stored.id, second.revision);
    },
  );

  it("persists DNS settings only after whole-proposal acceptance and preserves omitted zone metadata", async () => {
    const configurations = new Configurations(pool);
    const source = createEditorConfiguration(
      "hub-and-spoke-firewall",
      randomUUID(),
    );
    const connectivity = objectValue(
      compileCommonConfiguration(source).connectivity,
    );
    const zones = objectValue(connectivity.dns_zones);
    const draft = editCommonInput(source, "connectivity", {
      ...connectivity,
      dns_zones: {
        ...zones,
        "example-corp": {
          ...objectValue(zones["example-corp"]),
          contact_email: "dns-operator@example.invalid",
          description: "Keep this metadata",
          default_ttl: 7200,
        },
      },
    });
    const stored = await configurations.create(alice, draft);
    let seenValues: unknown;
    const model = {
      async converse(_selection: unknown, values: unknown) {
        seenValues = values;
        return {
          explanation:
            "Bestätigten DNS-Namen zur Übernahme vorgeschlagen, keine Cloud-Ausführung.",
          questions: [],
          changes: [
            {
              path: "connectivity.dns_zones",
              value: {
                "example-corp": {
                  dns_name: "example-gmbh.runs.onstackit.cloud",
                  name: "example-gmbh-dns",
                  description: "Zentrale DNS-Zone der Example GmbH",
                  default_ttl: 3600,
                  type: "primary",
                },
              },
            },
          ],
          references: ["dns-zones"],
        } satisfies Dialogue;
      },
    } as unknown as AssistantModelServing;
    const assistant = new AssistantConversations(pool, model);
    const proposed = await assistant.send(
      alice,
      stored.id,
      1,
      "Für example-gmbh.runs.onstackit.cloud auch die übrigen DNS-Einstellungen vorschlagen.",
    );
    expect(
      (seenValues as Record<string, unknown>)["connectivity.dns_zones"],
    ).toEqual({
      "example-corp": {
        dns_name: "example-corp.stackit.run",
        contact_email: "dns-operator@example.invalid",
        description: "Keep this metadata",
        default_ttl: 7200,
        name: null,
        acl: null,
        network_area_key: "default",
        type: "primary",
      },
    });
    expect(proposed.proposal?.changes[0]?.before).toEqual({
      "example-corp": {
        dns_name: "example-corp.stackit.run",
        contact_email: "dns-operator@example.invalid",
        description: "Keep this metadata",
        default_ttl: 7200,
        name: null,
        acl: null,
        network_area_key: "default",
        type: "primary",
      },
    });
    expect((await configurations.get(alice, stored.id)).draft).toEqual(draft);
    await expect(
      assistant.accept(bob, stored.id, proposed.revision, 1),
    ).rejects.toMatchObject({ status: 404 });
    const accepted = await assistant.accept(
      alice,
      stored.id,
      proposed.revision,
      1,
    );
    const acceptedDraft = accepted.draft as typeof draft;
    expect(
      objectValue(compileCommonConfiguration(acceptedDraft).connectivity),
    ).toEqual({
      ...objectValue(compileCommonConfiguration(draft).connectivity),
      dns_zones: {
        ...objectValue(
          objectValue(compileCommonConfiguration(draft).connectivity).dns_zones,
        ),
        "example-corp": {
          ...objectValue(
            objectValue(
              objectValue(compileCommonConfiguration(draft).connectivity)
                .dns_zones,
            )["example-corp"],
          ),
          dns_name: "example-gmbh.runs.onstackit.cloud",
          name: "example-gmbh-dns",
          description: "Zentrale DNS-Zone der Example GmbH",
          default_ttl: 3600,
          type: "primary",
        },
      },
    });
    expect(acceptedDraft.identities).toEqual(draft.identities);
    expect(accepted.revision).toBe(2);
    expect(exportCommonTfvars(acceptedDraft)).toContain(
      "example-gmbh.runs.onstackit.cloud",
    );
    expect(exportCommonTfvars(acceptedDraft)).toContain("example-gmbh-dns");
    expect(exportCommonTfvars(acceptedDraft)).toContain(
      "dns-operator@example.invalid",
    );
    expect((await assistant.get(alice, stored.id))?.proposal).toBeNull();
    await configurations.remove(alice, stored.id, 2);
  });

  it("exposes only the active user's valid human email to the assistant, never identity credentials", async () => {
    const token = newSessionToken();
    const email = "assistant-owner@example.invalid";
    const session = await store.createStackitSession({
      id: randomUUID(),
      hash: token.hash,
      csrfToken: randomBytes(32).toString("base64url"),
      expiresAt: new Date(Date.now() + 3600000),
      identity: {
        issuer: "https://accounts.stackit.cloud",
        subject: randomUUID(),
        email,
        emailVerified: true,
        verificationMethod: "signed-id-token-and-userinfo",
        tokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        organization: null,
      },
    });
    const configurations = new Configurations(pool);
    const stored = await configurations.create(
      session,
      createEditorConfiguration("standalone", randomUUID()),
    );
    const model = {
      converse: vi.fn<AssistantModelServing["converse"]>(async () => ({
        explanation: "Keine Änderung vorgeschlagen.",
        questions: [],
        changes: [],
        references: ["configuration-contract"],
      })),
    };
    const assistant = new AssistantConversations(pool, model);
    await assistant.send(session, stored.id, 1, "Welche E-Mail ist bekannt?");
    expect(model.converse.mock.calls[0]?.[1]).toMatchObject({
      "assistant.user_email": email,
      "assistant.owner_email_is_template_default": true,
    });
    await new StackitIdentities(pool).revoke(session);
    await assistant.send(session, stored.id, 1, "Erneut prüfen");
    expect(model.converse.mock.calls[1]?.[1]).toMatchObject({
      "assistant.user_email": null,
    });
    expect(JSON.stringify(model.converse.mock.calls)).not.toContain(
      token.token,
    );
    await configurations.remove(session, stored.id, 1);
  });

  it("accepts selected governance role fields transactionally without changing identities or granting live access", async () => {
    const configurations = new Configurations(pool);
    let draft = createEditorConfiguration(
      "hub-and-spoke-firewall",
      randomUUID(),
    );
    draft = setCommonInput(draft, "organization_owners", [
      "org-existing@example.test",
    ]);
    const folders = objectValue(
      effectiveInput(compileCommonConfiguration(draft), "rm_folders"),
    );
    draft = setCommonInput(draft, "rm_folders", {
      ...folders,
      platform: {
        ...objectValue(folders.platform),
        owner_emails: ["folder-existing@example.test"],
        reader_emails: ["reader-existing@example.test"],
      },
    });
    const stored = await configurations.create(alice, draft);
    const proposal: Dialogue = {
      explanation:
        "Berechtigungen vorgeschlagen, noch nichts gespeichert. Keine Cloud-Ausführung.",
      questions: [],
      changes: [
        {
          path: "organization_owners",
          value: ["org-existing@example.test", "org-member@example.test"],
        },
        {
          path: "rm_folders",
          value: {
            platform: {
              owner_emails: [
                "folder-existing@example.test",
                "folder-member@example.test",
              ],
              reader_emails: [
                "reader-existing@example.test",
                "folder-member@example.test",
              ],
            },
          },
        },
      ],
      references: ["governance-folders"],
    };
    const model = {
      converse: vi.fn<AssistantModelServing["converse"]>(async () => proposal),
    };
    const assistant = new AssistantConversations(pool, model);
    const proposed = await assistant.send(
      alice,
      stored.id,
      1,
      "Zusätzliche Organisations- und Folder-Berechtigungen vorschlagen",
    );
    expect(
      assistantProposalFields(proposed.proposal?.changes ?? []).map(
        (field) => field.id,
      ),
    ).toEqual([
      "organization_owners",
      "rm_folders/platform/owner_emails",
      "rm_folders/platform/reader_emails",
    ]);
    await expect(
      assistant.accept(bob, stored.id, proposed.revision, 1, [
        "organization_owners",
      ]),
    ).rejects.toMatchObject({ status: 404 });
    const first = await assistant.accept(
      alice,
      stored.id,
      proposed.revision,
      1,
      ["organization_owners"],
    );
    expect(first.revision).toBe(2);
    expect(compileCommonConfiguration(first.draft).organization_owners).toEqual(
      proposal.changes[0]?.value,
    );
    expect(compileCommonConfiguration(first.draft).rm_folders).toEqual(
      compileCommonConfiguration(draft).rm_folders,
    );
    expect(first.draft.identities).toEqual(draft.identities);
    const remaining = await assistant.get(alice, stored.id);
    if (!remaining) throw new Error("Missing remaining folder proposals");
    expect(remaining.stale).toBe(false);
    expect(
      assistantProposalFields(remaining.proposal?.changes ?? []).map(
        (field) => field.id,
      ),
    ).toEqual([
      "rm_folders/platform/owner_emails",
      "rm_folders/platform/reader_emails",
    ]);
    const second = await assistant.accept(
      alice,
      stored.id,
      remaining.revision,
      2,
      ["rm_folders/platform/reader_emails"],
    );
    const actualFolder = objectValue(
      objectValue(compileCommonConfiguration(second.draft).rm_folders).platform,
    );
    expect(actualFolder.owner_emails).toEqual(["folder-existing@example.test"]);
    expect(actualFolder.reader_emails).toEqual([
      "reader-existing@example.test",
      "folder-member@example.test",
    ]);
    const last = await assistant.get(alice, stored.id);
    if (!last) throw new Error("Missing remaining folder-owner proposal");
    await assistant.accept(alice, stored.id, last.revision, 3);
    expect((await assistant.get(alice, stored.id))?.proposal).toBeNull();
    expect(model.converse).toHaveBeenCalledTimes(1);
    await configurations.remove(alice, stored.id, 4);
  });

  it("previews selected proposals across revisions, preserves drafts, confirms conflicts and never persists acceptance", async () => {
    const scenario = assistantScenarios.find(
      (entry) => entry.id === "firewall-native-ha",
    );
    if (!scenario) throw new Error("Missing synthetic firewall fixture");
    const { draft } = assistantScenarioFixture(scenario);
    const configurations = new Configurations(pool);
    const stored = await configurations.create(alice, draft);
    const model = {
      converse: vi.fn<AssistantModelServing["converse"]>(async () => ({
        explanation: "HA im Entwurf. Keine Ausführung.",
        references: ["firewall-infrastructure"],
        questions: [],
        changes: [
          {
            path: "connectivity.firewalls",
            value: {
              default: { ha: { backup_zone: "eu01-2", vhid: 23 } },
            },
          },
        ],
      })),
    };
    const assistant = new AssistantConversations(pool, model);
    const proposal = await assistant.send(
      alice,
      stored.id,
      1,
      "HA vorschlagen",
    );
    const backup = ["connectivity.firewalls/default/ha/backup_zone"];
    const vhid = ["connectivity.firewalls/default/ha/vhid"];
    const local = { ...draft, name: "Local editor change" };
    await expect(
      assistant.preview(
        bob,
        stored.id,
        proposal.revision,
        1,
        backup,
        local,
        draft,
      ),
    ).rejects.toMatchObject({ status: 404 });
    for (const selection of [
      [],
      [
        "connectivity.firewalls/default/ha/backup_zone",
        "connectivity.firewalls/default/ha/backup_zone",
      ],
      ["credentials"],
      vhid,
    ])
      await expect(
        assistant.preview(
          alice,
          stored.id,
          proposal.revision,
          1,
          selection,
          local,
          draft,
        ),
      ).rejects.toMatchObject({
        status: 422,
        code: "assistant_invalid_selection",
      });
    const remote = setCommonInput(
      draft,
      "owner_email",
      "remote-owner@example.test",
    );
    const saved = await configurations.update(alice, stored.id, 1, remote);
    const first = await assistant.preview(
      alice,
      stored.id,
      proposal.revision,
      1,
      backup,
      local,
      draft,
    );
    expect(first.configuration).toMatchObject({
      revision: 2,
      persisted: false,
    });
    expect(first.configuration.draft.name).toBe(local.name);
    expect(
      compileCommonConfiguration(first.configuration.draft).owner_email,
    ).toBe("remote-owner@example.test");
    expect(first.savedConfiguration).toEqual(saved.draft);
    expect(
      assistantProposalFields(first.conversation.proposal?.changes ?? []).map(
        (field) => field.id,
      ),
    ).toEqual(vhid);
    expect((await configurations.get(alice, stored.id))?.draft).toEqual(remote);
    expect((await assistant.get(alice, stored.id))?.revision).toBe(
      proposal.revision,
    );
    const connectivity = objectValue(
      compileCommonConfiguration(first.configuration.draft).connectivity,
    );
    const firewalls = objectValue(connectivity.firewalls);
    const changed = setCommonInput(first.configuration.draft, "connectivity", {
      ...connectivity,
      firewalls: {
        ...firewalls,
        default: {
          ...objectValue(firewalls.default),
          ha: { backup_zone: "eu01-2", vhid: 55 },
        },
      },
    });
    const conflict = assistant.preview(
      alice,
      stored.id,
      proposal.revision,
      1,
      vhid,
      changed,
      remote,
    );
    await expect(conflict).rejects.toMatchObject({
      status: 409,
      code: "assistant_merge_confirmation_required",
      details: {
        configurationRevision: 2,
        conflicts: [
          {
            kind: "proposal",
            path: "connectivity.firewalls.default.ha.vhid",
            before: null,
            current: 55,
            value: 23,
            baselineAvailable: true,
          },
        ],
      },
    });
    expect((await configurations.get(alice, stored.id))?.revision).toBe(2);
    expect((await assistant.get(alice, stored.id))?.revision).toBe(
      proposal.revision,
    );
    const newer = setCommonInput(
      remote,
      "owner_email",
      "newer-owner@example.test",
    );
    await configurations.update(alice, stored.id, 2, newer);
    await expect(
      assistant.preview(
        alice,
        stored.id,
        proposal.revision,
        1,
        vhid,
        changed,
        remote,
        2,
      ),
    ).rejects.toMatchObject({
      status: 409,
      details: { configurationRevision: 3 },
    });
    const confirmed = await assistant.preview(
      alice,
      stored.id,
      proposal.revision,
      1,
      vhid,
      changed,
      remote,
      3,
    );
    expect(confirmed.configuration.draft.name).toBe(local.name);
    const confirmedValues = compileCommonConfiguration(
      confirmed.configuration.draft,
    );
    expect(confirmedValues.owner_email).toBe("newer-owner@example.test");
    expect(
      objectValue(
        objectValue(objectValue(confirmedValues.connectivity).firewalls)
          .default,
      ).ha,
    ).toEqual({ backup_zone: "eu01-2", vhid: 23 });
    expect((await configurations.get(alice, stored.id))?.draft).toEqual(newer);
    expect((await assistant.get(alice, stored.id))?.revision).toBe(
      proposal.revision,
    );
    await withTenant(pool, alice, (client) =>
      client.query(
        "UPDATE lzc.assistant_conversations SET proposal_baseline=NULL,knowledge_hash='legacy-knowledge' WHERE configuration_id=$1",
        [stored.id],
      ),
    );
    const legacy = await assistant.get(alice, stored.id);
    expect(legacy?.proposal?.changes[0]?.baselineAvailable).toBe(false);
    expect(legacy?.proposal?.changes[0]?.before).toBeNull();
    await expect(
      assistant.preview(
        alice,
        stored.id,
        proposal.revision,
        1,
        backup,
        newer,
        newer,
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: "assistant_merge_confirmation_required",
      details: { conflicts: [{ kind: "proposal", baselineAvailable: false }] },
    });
    const oldConfirmed = await assistant.preview(
      alice,
      stored.id,
      proposal.revision,
      1,
      backup,
      newer,
      newer,
      3,
    );
    expect(oldConfirmed.configuration.persisted).toBe(false);
    const contextDraft = setCommonInput(
      newer,
      "owner_email",
      "local-context@example.test",
    );
    const next = await assistant.send(
      alice,
      stored.id,
      3,
      "HA im lokalen Entwurf",
      undefined,
      contextDraft,
    );
    expect(model.converse.mock.calls.at(-1)?.[1]).toMatchObject({
      owner_email: "local-context@example.test",
    });
    expect((await configurations.get(alice, stored.id))?.draft).toEqual(newer);
    await expect(
      assistant.preview(
        alice,
        stored.id,
        proposal.revision,
        1,
        backup,
        newer,
        newer,
        3,
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: "assistant_proposal_changed",
    });
    expect(next.revision).toBeGreaterThan(proposal.revision);
    await configurations.remove(alice, stored.id, 3);
  });

  it("rebases additive role proposals without removing new grants or restoring manually removed old grants", async () => {
    const scenario = assistantScenarios.find(
      (entry) => entry.id === "firewall-native-ha",
    );
    if (!scenario) throw new Error("Missing synthetic fixture");
    const baseline = setCommonInput(
      assistantScenarioFixture(scenario).draft,
      "organization_owners",
      ["old@example.test"],
    );
    const configurations = new Configurations(pool);
    const stored = await configurations.create(alice, baseline);
    const assistant = new AssistantConversations(pool, {
      converse: vi.fn<AssistantModelServing["converse"]>(async () => ({
        explanation: "Zusätzlicher Owner. Keine IAM-Ausführung.",
        questions: [],
        references: ["governance-folders"],
        changes: [
          {
            path: "organization_owners",
            value: ["old@example.test", "added@example.test"],
          },
        ],
      })),
    });
    const proposal = await assistant.send(
      alice,
      stored.id,
      1,
      "Owner hinzufügen",
    );
    const remote = setCommonInput(baseline, "organization_owners", [
      "old@example.test",
      "remote@example.test",
    ]);
    await configurations.update(alice, stored.id, 1, remote);
    const local = setCommonInput(remote, "organization_owners", [
      "remote@example.test",
    ]);
    const preview = await assistant.preview(
      alice,
      stored.id,
      proposal.revision,
      1,
      ["organization_owners"],
      local,
      remote,
    );
    expect(
      compileCommonConfiguration(preview.configuration.draft)
        .organization_owners,
    ).toEqual(["remote@example.test", "added@example.test"]);
    expect((await configurations.get(alice, stored.id))?.draft).toEqual(remote);
    await configurations.remove(alice, stored.id, 2);
  });

  it("accepts nested firewall HA fields transactionally and rejects incomplete dependencies without saving", async () => {
    const scenario = assistantScenarios.find(
      (entry) => entry.id === "firewall-native-ha",
    );
    if (!scenario) throw new Error("Missing synthetic firewall fixture");
    const { draft } = assistantScenarioFixture(scenario);
    const configurations = new Configurations(pool);
    const stored = await configurations.create(alice, draft);
    const proposal: Dialogue = {
      explanation:
        "HA vorgeschlagen, noch nichts gespeichert. Plan/Apply separat.",
      questions: [],
      changes: [
        {
          path: "connectivity.firewalls",
          value: {
            default: { ha: { backup_zone: "eu01-2", vhid: 23 } },
          },
        },
      ],
      references: ["firewall-infrastructure"],
    };
    const model = {
      converse: vi.fn<AssistantModelServing["converse"]>(async () => proposal),
    };
    const assistant = new AssistantConversations(pool, model);
    const proposed = await assistant.send(
      alice,
      stored.id,
      1,
      "Native HA vorschlagen",
    );
    expect(
      assistantProposalFields(proposed.proposal?.changes ?? [])
        .map((field) => field.id)
        .sort(),
    ).toEqual([
      "connectivity.firewalls/default/ha/backup_zone",
      "connectivity.firewalls/default/ha/vhid",
    ]);
    await expect(
      assistant.accept(bob, stored.id, proposed.revision, 1),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      assistant.accept(alice, stored.id, proposed.revision, 1, [
        "connectivity.firewalls/default/ha/vhid",
      ]),
    ).rejects.toMatchObject({
      status: 422,
      code: "assistant_invalid_selection",
    });
    expect((await configurations.get(alice, stored.id))?.revision).toBe(1);
    expect((await assistant.get(alice, stored.id))?.revision).toBe(
      proposed.revision,
    );
    const first = await assistant.accept(
      alice,
      stored.id,
      proposed.revision,
      1,
      ["connectivity.firewalls/default/ha/backup_zone"],
    );
    const before = compileCommonConfiguration(draft);
    const connectivity = objectValue(before.connectivity);
    const firewalls = objectValue(connectivity.firewalls);
    const firewall = objectValue(firewalls.default);
    expect(compileCommonConfiguration(first.draft)).toEqual({
      ...before,
      connectivity: {
        ...connectivity,
        firewalls: {
          ...firewalls,
          default: { ...firewall, ha: { backup_zone: "eu01-2" } },
        },
      },
    });
    expect(first.draft.identities).toEqual(draft.identities);
    const remaining = await assistant.get(alice, stored.id);
    if (!remaining) throw new Error("Missing pending HA field");
    expect(remaining.stale).toBe(false);
    expect(
      assistantProposalFields(remaining.proposal?.changes ?? []).map(
        (field) => field.id,
      ),
    ).toEqual(["connectivity.firewalls/default/ha/vhid"]);
    const second = await assistant.accept(
      alice,
      stored.id,
      remaining.revision,
      2,
      ["connectivity.firewalls/default/ha/vhid"],
    );
    expect(
      objectValue(
        objectValue(
          objectValue(compileCommonConfiguration(second.draft).connectivity)
            .firewalls,
        ).default,
      ).ha,
    ).toEqual({ backup_zone: "eu01-2", vhid: 23 });
    expect((await assistant.get(alice, stored.id))?.proposal).toBeNull();
    expect(model.converse).toHaveBeenCalledTimes(1);
    await configurations.remove(alice, stored.id, second.revision);
  });

  it("accepts selected DNS fields transactionally and keeps the remaining proposal on the new revision", async () => {
    const configurations = new Configurations(pool);
    const draft = createEditorConfiguration(
      "hub-and-spoke-firewall",
      randomUUID(),
    );
    const stored = await configurations.create(alice, draft);
    const proposal: Dialogue = {
      explanation: "Mehrere DNS-Felder vorgeschlagen, nicht gespeichert.",
      questions: [],
      changes: [
        {
          path: "connectivity.dns_zones",
          value: {
            "example-corp": {
              name: "example-dns",
              description: "Example DNS description",
              default_ttl: 7200,
            },
          },
        },
      ],
      references: ["dns-zones"],
    };
    const model = {
      converse: vi.fn<AssistantModelServing["converse"]>(async () => proposal),
    };
    const assistant = new AssistantConversations(pool, model);
    const proposed = await assistant.send(
      alice,
      stored.id,
      1,
      "DNS-Felder ergänzen",
    );
    for (const selected of [
      [],
      ["connectivity.dns_zones/example-corp/unknown"],
      [
        "connectivity.dns_zones/example-corp/name",
        "connectivity.dns_zones/example-corp/name",
      ],
    ])
      await expect(
        assistant.accept(alice, stored.id, proposed.revision, 1, selected),
      ).rejects.toMatchObject({
        status: 422,
        code: "assistant_invalid_selection",
      });
    expect((await configurations.get(alice, stored.id)).draft).toEqual(draft);
    await expect(
      assistant.accept(bob, stored.id, proposed.revision, 1, [
        "connectivity.dns_zones/example-corp/name",
      ]),
    ).rejects.toMatchObject({ status: 404 });
    const first = await assistant.accept(
      alice,
      stored.id,
      proposed.revision,
      1,
      ["connectivity.dns_zones/example-corp/name"],
    );
    const firstDraft = createEditorConfiguration(
      "hub-and-spoke-firewall",
      draft.id,
    );
    const beforeConnectivity = objectValue(
      compileCommonConfiguration(firstDraft).connectivity,
    );
    const firstZone = objectValue(
      objectValue(
        objectValue(compileCommonConfiguration(first.draft).connectivity)
          .dns_zones,
      )["example-corp"],
    );
    const beforeZone = objectValue(
      objectValue(beforeConnectivity.dns_zones)["example-corp"],
    );
    expect(firstZone).toEqual({ ...beforeZone, name: "example-dns" });
    expect(first.draft.features.identity).toEqual(draft.features.identity);
    expect(first.revision).toBe(2);
    const remaining = await assistant.get(alice, stored.id);
    expect(remaining?.stale).toBe(false);
    expect(remaining?.baseRevision).toBe(2);
    expect(remaining?.proposal?.changes).toEqual([
      {
        ...proposal.changes[0],
        value: {
          "example-corp": {
            description: "Example DNS description",
            default_ttl: 7200,
          },
        },
        before: {
          "example-corp": expect.objectContaining({ name: "example-dns" }),
        },
      },
    ]);
    await expect(
      assistant.accept(alice, stored.id, proposed.revision, 1, [
        "connectivity.dns_zones/example-corp/description",
      ]),
    ).rejects.toMatchObject({ status: 409 });
    if (!remaining) throw new Error("Missing remaining proposal");
    const second = await assistant.accept(
      alice,
      stored.id,
      remaining.revision,
      2,
      ["connectivity.dns_zones/example-corp/description"],
    );
    expect(exportCommonTfvars(second.draft)).toContain(
      "Example DNS description",
    );
    const last = await assistant.get(alice, stored.id);
    if (!last) throw new Error("Missing remaining TTL");
    await assistant.accept(alice, stored.id, last.revision, 3);
    expect((await assistant.get(alice, stored.id))?.proposal).toBeNull();
    expect(model.converse).toHaveBeenCalledTimes(1);
    await configurations.remove(alice, stored.id, 4);
  });

  it("validates dependent network fields before partial acceptance and preserves unselected settings", async () => {
    const configurations = new Configurations(pool);
    const area = {
      ranges: ["10.64.0.0/16"],
      transfer_network: "10.63.0.0/24",
      min_prefix_length: 24,
      max_prefix_length: 24,
      default_prefix_length: 24,
    };
    const draft = editCommonInput(
      createEditorConfiguration("standalone", randomUUID()),
      "connectivity",
      {
        network_areas: { default: area },
      },
    );
    const stored = await configurations.create(alice, draft);
    const model = {
      converse: vi.fn<AssistantModelServing["converse"]>(async () => ({
        explanation: "Präfixgrenzen vorgeschlagen.",
        questions: [],
        changes: [
          {
            path: "connectivity.network_areas",
            value: {
              default: {
                ...area,
                max_prefix_length: 28,
                default_prefix_length: 28,
              },
            },
          },
        ],
        references: ["stackit-network-components"],
      })),
    };
    const assistant = new AssistantConversations(pool, model);
    const proposal = await assistant.send(
      alice,
      stored.id,
      1,
      "Präfixe anpassen",
    );
    await expect(
      assistant.accept(alice, stored.id, proposal.revision, 1, [
        "connectivity.network_areas/default/default_prefix_length",
      ]),
    ).rejects.toMatchObject({
      status: 422,
      code: "assistant_invalid_selection",
    });
    expect((await configurations.get(alice, stored.id)).draft).toEqual(draft);
    const first = await assistant.accept(
      alice,
      stored.id,
      proposal.revision,
      1,
      ["connectivity.network_areas/default/max_prefix_length"],
    );
    expect(
      objectValue(compileCommonConfiguration(first.draft).connectivity)
        .network_areas,
    ).toEqual({
      default: { ...area, max_prefix_length: 28 },
    });
    const remaining = await assistant.get(alice, stored.id);
    if (!remaining) throw new Error("Missing dependent network proposal");
    const final = await assistant.accept(
      alice,
      stored.id,
      remaining.revision,
      2,
    );
    expect(
      objectValue(compileCommonConfiguration(final.draft).connectivity)
        .network_areas,
    ).toEqual({
      default: { ...area, max_prefix_length: 28, default_prefix_length: 28 },
    });
    await configurations.remove(alice, stored.id, 3);
  });

  it("accepts delegated folder names without exposing or modifying folder access and identities", async () => {
    const configurations = new Configurations(pool);
    const source = createEditorConfiguration("standalone", randomUUID());
    const folders = structuredClone(
      objectValue(
        effectiveInput(compileCommonConfiguration(source), "rm_folders"),
      ),
    );
    folders.platform = {
      ...objectValue(folders.platform),
      description: "Preserve folder metadata",
      owner_emails: ["owner@example.invalid"],
      reader_emails: ["reader@example.invalid"],
    };
    const draft = editCommonInput(source, "rm_folders", folders);
    const stored = await configurations.create(alice, draft);
    const names = Object.fromEntries(
      Object.entries(folders).map(([key, folder]) => [
        key,
        { name: objectValue(folder).name },
      ]),
    );
    const requests: string[] = [];
    const request = vi.fn<typeof fetch>(async (_url, options) => {
      const body = String(options?.body);
      requests.push(body);
      const payload = JSON.parse(body);
      const response =
        payload.response_format.json_schema.name === "conversation_intent"
          ? {
              topic: "configuration-contract",
              mode: "draft",
              requirements: [],
              namingDelegation: {
                paths: ["company_code", "rm_folders"],
                source: "current",
              },
            }
          : ({
              explanation:
                "Firmenkürzel und vorhandene Ordnernamen vorgeschlagen, noch nicht übernommen.",
              questions: [],
              changes: [
                { path: "company_name", value: "Example GmbH" },
                { path: "company_code", value: "exg" },
                {
                  path: "rm_folders",
                  value: { platform: { name: "EXG Platform" } },
                },
              ],
              references: ["identity-foundations", "governance-folders"],
            } satisfies Dialogue);
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: JSON.stringify(response),
            },
          },
        ],
      });
    });
    const model = new AssistantModelServing(
      {
        baseUrl:
          "https://api.openai-compat.model-serving.eu01.onstackit.cloud/v1",
        model: "Qwen/Qwen3-VL-235B-A22B-Instruct-FP8",
        token: "test-only-private-token",
        timeoutMs: 1000,
      },
      request,
    );
    const assistant = new AssistantConversations(pool, model);
    const proposed = await assistant.send(
      alice,
      stored.id,
      1,
      'Richte die Grundlagen für "Example GmbH" ein und wähle passende Kürzel und Ordnernamen.',
    );
    expect(request).toHaveBeenCalledTimes(2);
    for (const body of requests) {
      expect(body).not.toContain("owner@example.invalid");
      expect(body).not.toContain("reader@example.invalid");
      expect(body).not.toContain("Preserve folder metadata");
    }
    const answerBody = requests[1];
    if (!answerBody) throw new Error("Missing naming response request");
    const answerContext = JSON.parse(
      JSON.parse(answerBody).messages.find(
        (entry: { role: string }) => entry.role === "user",
      ).content,
    );
    expect(answerContext.currentPublicScalarValues.rm_folders).toEqual(names);
    const unchanged = await configurations.get(alice, stored.id);
    expect(unchanged.draft).toEqual(draft);
    const accepted = await assistant.accept(
      alice,
      stored.id,
      proposed.revision,
      1,
    );
    const acceptedDraft = accepted.draft as typeof draft;
    expect(compileCommonConfiguration(acceptedDraft).rm_folders).toEqual({
      ...folders,
      platform: { ...objectValue(folders.platform), name: "EXG Platform" },
    });
    expect(acceptedDraft.identities).toEqual(draft.identities);
    expect(exportCommonTfvars(acceptedDraft)).toContain("EXG Platform");
    expect(exportCommonTfvars(acceptedDraft)).toContain(
      "owner@example.invalid",
    );
    expect(accepted.revision).toBe(2);
    await configurations.remove(alice, stored.id, 2);
  });

  it("persists assistant conversations, accepts only current proposals and cascades parent deletion", async () => {
    const configurations = new Configurations(pool);
    const stored = await configurations.create(
      alice,
      createEditorConfiguration("standalone", randomUUID()),
    );
    const model = {
      converse: vi.fn(async () => ({
        explanation: "Firmenname vorgeschlagen",
        questions: [],
        changes: [{ path: "company_name", value: "Assistant example" }],
        references: ["configuration-contract"],
      })),
    };
    const assistant = new AssistantConversations(pool, model);
    const conversation = await assistant.send(
      alice,
      stored.id,
      1,
      "Firma Assistant example",
    );
    expect(conversation.messages).toHaveLength(2);
    expect(conversation.proposal?.changes).toHaveLength(1);
    expect(
      (await new AssistantConversations(pool, model).get(alice, stored.id))?.id,
    ).toBe(conversation.id);
    await expect(assistant.get(bob, stored.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      assistant.accept(alice, stored.id, conversation.revision + 1, 1),
    ).rejects.toMatchObject({ status: 409 });
    const accepted = await assistant.accept(
      alice,
      stored.id,
      conversation.revision,
      1,
    );
    expect(accepted.revision).toBe(2);
    expect(
      recordValues(accepted.draft as Parameters<typeof recordValues>[0])
        .company_name,
    ).toBe("Assistant example");
    expect((await assistant.get(alice, stored.id))?.proposal).toBeNull();
    await assistant.send(alice, stored.id, 2, "Noch eine Frage");
    const before = await assistant.get(alice, stored.id);
    await migration.query(
      "UPDATE lzc.assistant_conversations SET expires_at=now()-interval '1 second' WHERE id=$1",
      [before?.id],
    );
    expect(await assistant.get(alice, stored.id)).toBeNull();
    await assistant.send(alice, stored.id, 2, "Neues Gespräch");
    const late = vi.fn(async () => {
      await configurations.remove(alice, stored.id, 2);
      return model.converse();
    });
    await expect(
      new AssistantConversations(pool, { converse: late }).send(
        alice,
        stored.id,
        2,
        "Späte Antwort",
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (
        await migration.query(
          "SELECT id FROM lzc.assistant_conversations WHERE configuration_id=$1",
          [stored.id],
        )
      ).rowCount,
    ).toBe(0);
    const expiring = await configurations.create(
      alice,
      createEditorConfiguration("standalone", randomUUID()),
    );
    await assistant.send(alice, expiring.id, 1, "Frage zur Umgebung");
    await expect(
      withTenant(pool, alice, (client) =>
        client.query(
          "UPDATE lzc.assistant_conversations SET expires_at=now()+interval '1 year' WHERE configuration_id=$1",
          [expiring.id],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await migration.query(
      "UPDATE lzc.assistant_conversations SET expires_at=now()-interval '1 second' WHERE configuration_id=$1",
      [expiring.id],
    );
    await assistant.prune();
    expect(
      (
        await migration.query(
          "SELECT id FROM lzc.assistant_conversations WHERE configuration_id=$1",
          [expiring.id],
        )
      ).rowCount,
    ).toBe(0);
    await configurations.remove(alice, expiring.id, 1);
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
      const retryPool = new pg.Pool({
        ...migrationConfig,
        user: "configurator_app",
        password: "runtime-test-only",
        max: 4,
      });
      try {
        const restarted = new Applications(retryPool);
        const retries = await Promise.all(
          Array.from({ length: 8 }, () => restarted.order(engineer, request)),
        );
        for (const retry of retries) {
          expect(retry).toEqual(first);
        }
        expect(
          (await restarted.listInstances(engineer)).map(
            (instance) => instance.id,
          ),
        ).toEqual([first.id]);
      } finally {
        await retryPool.end();
      }
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
      const deletion = { confirmDeletion: true };
      expect(() =>
        applications.deleteTemplate(engineer, republished.id, {
          confirmDeletion: false,
        }),
      ).toThrow();
      await expect(
        applications.deleteTemplate(owner, republished.id, deletion),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        applications.deleteTemplate(alice, republished.id, deletion),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        applications.deleteTemplate(engineer, republished.id, deletion),
      ).rejects.toMatchObject({
        code: "40001",
        message: "template_version_not_retired",
      });
      await expect(
        applications.deleteTemplate(engineer, published.id, deletion),
      ).rejects.toMatchObject({
        code: "40001",
        message: "template_version_in_use",
      });
      await applications.retire(engineer, republished.id, {
        confirmRetirement: true,
      });
      expect(
        (await applications.listTemplates(engineer)).find(
          (v) => v.id === republished.id,
        )?.canDelete,
      ).toBe(true);
      await expect(
        applications.deleteTemplate(engineer, randomUUID(), deletion),
      ).rejects.toMatchObject({ code: "42501" });
      const [removed, removedAgain, blockedOrder] = await Promise.all([
        applications.deleteTemplate(engineer, republished.id, deletion),
        applications.deleteTemplate(engineer, republished.id, deletion),
        applications
          .order(engineer, {
            ...request,
            versionId: republished.id,
            idempotencyKey: randomUUID(),
          })
          .then(
            () => "unexpected_order",
            (error: unknown) => error,
          ),
      ]);
      expect(blockedOrder).toBeInstanceOf(Error);
      expect([
        "template_version_retired",
        "template_version_not_found",
      ]).toContain((blockedOrder as Error & { code: string }).code);
      expect(removedAgain).toEqual(removed);
      expect(
        (await applications.listTemplates(engineer)).some(
          (v) => v.id === republished.id,
        ),
      ).toBe(false);
      await expect(
        applications.order(engineer, {
          ...request,
          versionId: republished.id,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "template_version_not_found" });
      const deletionProof = await migration.query(
        "SELECT v.version,d.deleted_by FROM lzc.application_template_versions v JOIN lzc.application_template_deletions d ON d.tenant_id=v.tenant_id AND d.version_id=v.id WHERE v.id=$1",
        [republished.id],
      );
      expect(deletionProof.rows).toEqual([
        { version: 3, deleted_by: engineer.userId },
      ]);
      await expect(
        migration.query(
          "DELETE FROM lzc.application_template_deletions WHERE version_id=$1",
          [republished.id],
        ),
      ).rejects.toMatchObject({ code: "55000" });
      await expect(
        withTenant(pool, engineer, (client) =>
          client.query(
            "INSERT INTO lzc.application_template_deletions(tenant_id,version_id,deleted_by) VALUES($1,$2,$3)",
            [tenantId, published.id, engineer.userId],
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      const newVersion = await applications.publish(engineer, {
        template: updated.template,
      });
      expect(newVersion.version).toBe(5);
      const historicalOrder = await applications.order(engineer, {
        ...request,
        versionId: newVersion.id,
        idempotencyKey: randomUUID(),
      });
      await applications.deleteOrder(engineer, historicalOrder.id, deletion);
      await applications.retire(engineer, newVersion.id, {
        confirmRetirement: true,
      });
      expect(
        (await applications.listTemplates(engineer)).find(
          (v) => v.id === newVersion.id,
        )?.canDelete,
      ).toBe(false);
      await expect(
        applications.deleteTemplate(engineer, newVersion.id, deletion),
      ).rejects.toMatchObject({
        code: "40001",
        message: "template_version_in_use",
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
      const identityVersion = await applications.publish(engineer, {
        template: {
          ...template,
          id: randomUUID(),
          key: "identity-completion",
          name: "Complete verified owner",
          settings: {
            ...template.settings,
            role_assignments: [
              { role: "auditor", subject: "fixed@example.test" },
            ],
          },
          parameterPolicy: {
            schema_version: 1,
            fields: {
              role_assignments: {
                source: "context",
                variable: "verified-project-owner",
                roles: ["owner"],
              },
            },
          },
        },
        ...binding,
        acceleratorRevision: "9e7fb46c329aca32e878ce1f0ea3b944ea240354",
        deploymentPolicy: "direct",
      });
      await identities.revoke(owner);
      const unboundOrder = await applications.order(owner, {
        versionId: identityVersion.id,
        idempotencyKey: randomUUID(),
        name: "Before human login",
        parameters: {},
      });
      expect(unboundOrder.settings.owner_email).toBeUndefined();
      await expect(
        applications.preparePlanInput(owner, unboundOrder.id),
      ).rejects.toMatchObject({
        status: 403,
        code: "verified_application_identity_required",
      });
      const originalOrder = (
        await migration.query(
          "SELECT to_jsonb(i)-ARRAY['resolved_settings','qualification_blockers'] AS metadata FROM lzc.application_instances i WHERE id=$1",
          [unboundOrder.id],
        )
      ).rows[0].metadata;
      await identities.save(owner, {
        ...ownerProof,
        tokenExpiresAt: new Date(Date.now() + 300000).toISOString(),
        organization: null,
      });
      await expect(
        applications.preparePlanInput(engineer, unboundOrder.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        withTenant(pool, engineer, (client) =>
          client.query(
            "SELECT lzc_auth.complete_application_order_identity($1,$2,'{}')",
            [engineer.id, unboundOrder.id],
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        withTenant(pool, owner, (client) =>
          client.query(
            "SELECT lzc_auth.complete_application_order_identity($1,$2,$3)",
            [
              owner.id,
              unboundOrder.id,
              JSON.stringify({
                ...unboundOrder.settings,
                owner_email: ownerProof.email,
                network_enabled: false,
              }),
            ],
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        withTenant(pool, bob, (client) =>
          client.query(
            "SELECT lzc_auth.complete_application_order_identity($1,$2,'{}')",
            [bob.id, unboundOrder.id],
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      const identityCompletionPool = new pg.Pool({
        ...migrationConfig,
        user: "configurator_app",
        password: "runtime-test-only",
        max: 2,
      });
      const completionApplications = new Applications(identityCompletionPool);
      const completedPlans = await Promise.all([
        completionApplications.preparePlanInput(owner, unboundOrder.id),
        completionApplications.preparePlanInput(owner, unboundOrder.id),
      ]).finally(() => identityCompletionPool.end());
      const completedPlan = completedPlans[0];
      if (!completedPlan) throw new Error("Missing completed plan input");
      expect(completedPlans[1]?.plan.stateKey).toBe(
        completedPlan.plan.stateKey,
      );
      expect(completedPlan.plan.variables.application.owner_email).toBe(
        ownerProof.email,
      );
      expect(completedPlan.plan.stateKey).toBe(
        `applications/${tenantId}/${unboundOrder.id}/terraform.tfstate`,
      );
      const completedOrder = (await applications.listInstances(owner)).find(
        (item) => item.id === unboundOrder.id,
      );
      expect(completedOrder?.settings.role_assignments).toEqual([
        { role: "auditor", subject: "fixed@example.test" },
        { role: "owner", subject: ownerProof.email },
      ]);
      expect(completedOrder?.blockers).not.toContain(
        "Verifizierte STACKIT-Benutzeridentität für diese Bestellung fehlt.",
      );
      expect(
        (
          await migration.query(
            "SELECT to_jsonb(i)-ARRAY['resolved_settings','qualification_blockers'] AS metadata FROM lzc.application_instances i WHERE id=$1",
            [unboundOrder.id],
          )
        ).rows[0].metadata,
      ).toEqual(originalOrder);
      await applications.preparePlanInput(owner, unboundOrder.id);
      const completionAudit = (
        await migration.query(
          "SELECT initial_settings,completed_settings,subject FROM lzc.application_order_identity_completions WHERE instance_id=$1",
          [unboundOrder.id],
        )
      ).rows;
      expect(completionAudit).toHaveLength(1);
      expect(completionAudit[0].initial_settings.owner_email).toBeUndefined();
      expect(completionAudit[0].completed_settings.owner_email).toBe(
        ownerProof.email,
      );
      expect(completionAudit[0].subject).toBe(ownerProof.subject);
      await expect(
        migration.query(
          "DELETE FROM lzc.application_order_identity_completions WHERE instance_id=$1",
          [unboundOrder.id],
        ),
      ).rejects.toMatchObject({ code: "55000" });
      await expect(
        withTenant(pool, owner, (client) =>
          client.query(
            "UPDATE lzc.application_instances SET resolved_settings='{}' WHERE id=$1",
            [unboundOrder.id],
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await identities.save(owner, {
        ...ownerProof,
        email: "changed-owner@example.test",
        tokenExpiresAt: new Date(Date.now() + 300000).toISOString(),
        organization: null,
      });
      await expect(
        applications.preparePlanInput(owner, unboundOrder.id),
      ).rejects.toMatchObject({
        status: 409,
        code: "application_owner_identity_changed",
      });
      await identities.save(owner, {
        ...ownerProof,
        tokenExpiresAt: new Date(Date.now() + 300000).toISOString(),
        organization: null,
      });
      const jobBoundaryOrder = await applications.order(owner, {
        versionId: identityVersion.id,
        idempotencyKey: randomUUID(),
        name: "Job identity boundary",
        parameters: {},
      });
      await migration.query(
        "UPDATE lzc.tenants SET organization_verified=true WHERE id=$1",
        [tenantId],
      );
      const boundJob = await applications.prepareJob(
        owner,
        jobBoundaryOrder.id,
        {
          idempotencyKey: randomUUID(),
          confirmPlan: true,
        },
      );
      await migration.query(
        "UPDATE lzc.application_instances SET resolved_settings=resolved_settings-'owner_email' WHERE id=$1",
        [jobBoundaryOrder.id],
      );
      await expect(
        applications.preparePlanInput(owner, jobBoundaryOrder.id),
      ).rejects.toMatchObject({
        status: 409,
        code: "application_order_identity_completion_unavailable",
      });
      expect(
        (await applications.listJobs(owner, jobBoundaryOrder.id))[0]?.id,
      ).toBe(boundJob.id);
      await migration.query(
        "UPDATE lzc.tenants SET organization_verified=false WHERE id=$1",
        [tenantId],
      );
      await identities.revoke(owner);
      const approvedUnboundOrder = await applications.order(owner, {
        versionId: first.id,
        idempotencyKey: randomUUID(),
        name: "Approved before login",
        parameters: {},
      });
      await applications.decideOrder(engineer, approvedUnboundOrder.id, {
        decision: "approved",
        reason: "Reviewed before proof",
        confirmDecision: true,
      });
      await identities.save(owner, {
        ...ownerProof,
        tokenExpiresAt: new Date(Date.now() + 300000).toISOString(),
        organization: null,
      });
      await expect(
        applications.preparePlanInput(owner, approvedUnboundOrder.id),
      ).rejects.toMatchObject({
        status: 409,
        code: "application_order_identity_completion_unavailable",
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
      expect(
        (
          await migration.query(
            "SELECT count(*)::int AS total FROM lzc.application_order_identity_completions WHERE instance_id=$1",
            [order.id],
          )
        ).rows[0].total,
      ).toBe(0);
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
      const cliRevision = "9e7fb46c329aca32e878ce1f0ea3b944ea240354";
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
      // The current immutable source supports networkless Public and routed Corporate
      // instances; neither must inherit the platform State or another order's key.
      const corporateTarget = {
        folder_id: randomUUID(),
        region: "eu01",
        corporate: true,
        network_area_id: randomUUID(),
        firewall_next_hop_ip: "10.0.2.6",
        ipv4_nameservers: ["192.0.2.53"],
      };
      const corporateContract = await applications.approvePlatformContract(
        engineer,
        {
          ...input,
          targets: { corporate: corporateTarget },
        },
      );
      for (const kind of ["public", "corporate"] as const) {
        const currentVersion = await applications.publish(engineer, {
          template: {
            ...template,
            id: randomUUID(),
            key: `current-${kind}`,
            kind,
            settings: { ...template.settings, network_enabled: false },
          },
          acceleratorRevision: cliRevision,
          platformRevision:
            kind === "corporate"
              ? corporateContract.document.revision
              : approved.document.revision,
          targetKey: kind,
          deploymentPolicy: "direct",
        });
        const currentOrder = await applications.order(owner, {
          versionId: currentVersion.id,
          idempotencyKey: randomUUID(),
          name: `Current ${kind}`,
          parameters: {},
        });
        const preparedInput = await applications.preparePlanInput(
          owner,
          currentOrder.id,
        );
        expect(preparedInput.plan.variables.application).toMatchObject({
          network_enabled: false,
        });
        expect(preparedInput.plan.stateKey).toBe(
          `applications/${tenantId}/${currentOrder.id}/terraform.tfstate`,
        );
        expect(preparedInput.plan.stateKey).not.toBe(cliOrder.stateKey);
        expect(
          preparedInput.plan.variables.platform_contract.targets[kind],
        ).toEqual(
          kind === "corporate" ? corporateTarget : input.targets.public,
        );
        const currentJob = await applications.prepareJob(
          owner,
          currentOrder.id,
          {
            idempotencyKey: randomUUID(),
            confirmPlan: true,
          },
        );
        expect(
          (
            await migration.query(
              "SELECT accelerator_revision,state_key FROM lzc.application_job_grants WHERE job_id=$1",
              [currentJob.id],
            )
          ).rows[0],
        ).toEqual({
          accelerator_revision: cliRevision,
          state_key: currentOrder.stateKey,
        });
        await expect(
          applications.preparePlanInput(engineer, currentOrder.id),
        ).rejects.toMatchObject({ status: 404 });
      }
      const legacyCorporate = await applications.publish(engineer, {
        template: {
          ...template,
          id: randomUUID(),
          key: "legacy-corporate",
          kind: "corporate",
        },
        acceleratorRevision: "57ad1f6a651c1787694b74ff8aa8b241a3dcd16f",
        platformRevision: corporateContract.document.revision,
        targetKey: "corporate",
        deploymentPolicy: "direct",
      });
      const legacyCorporateOrder = await applications.order(owner, {
        versionId: legacyCorporate.id,
        idempotencyKey: randomUUID(),
        name: "Legacy corporate",
        parameters: {},
      });
      await expect(
        applications.preparePlanInput(owner, legacyCorporateOrder.id),
      ).rejects.toMatchObject({ code: "application_plan_scope_not_supported" });
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
      for (const text of [
        "package verified",
        "providers initialized",
        "application plan output",
        "application plan output",
      ])
        await dispatchApplications.runnerOutput(
          dispatchedTicket,
          ticketPackage,
          { text, truncated: false },
        );
      await expect(
        withTenant(pool, owner, (client) =>
          client.query(
            "UPDATE lzc.application_runner_records SET ciphertext=$2 WHERE job_id=$1 AND kind='output'",
            [dispatchJob.id, Buffer.alloc(40)],
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        migration.query(
          "UPDATE lzc.application_runner_records SET state_key='different' WHERE job_id=$1 AND kind='output'",
          [dispatchJob.id],
        ),
      ).rejects.toMatchObject({ code: "55000" });
      await expect(
        migration.query(
          "UPDATE lzc.application_runner_records SET ciphertext=$2 WHERE job_id=$1 AND kind='artifact'",
          [dispatchJob.id, Buffer.alloc(40)],
        ),
      ).rejects.toMatchObject({ code: "55000" });
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
      const cleanupSlot = randomUUID();
      const cleanupSpace = randomUUID();
      const cleanupOrigin = "https://configurator.example";
      await pool.query(
        "INSERT INTO lzc.runner_pool_slots(id,pool_key,origin,space_id,source_droplet_id,app_id,status,job_id,expires_at) VALUES($1,'cleanup-test',$2,$3,$4,$5,'consumed',$5,now()-interval '1 hour')",
        [
          cleanupSlot,
          cleanupOrigin,
          cleanupSpace,
          ticketPackage.runnerPackageId,
          dispatchJob.id,
        ],
      );
      const retireCompleted = async (
        space = cleanupSpace,
        origin = cleanupOrigin,
      ) =>
        (
          await pool.query(
            "SELECT lzc_auth.retire_completed_application_runners($1,$2) AS retired",
            [space, origin],
          )
        ).rows[0].retired;
      // Even an expired consumed lease must not stop an active native job.
      expect(await retireCompleted()).toBe(0);
      await dispatchApplications.runnerResult(dispatchedTicket, ticketPackage, {
        status: "succeeded",
        summary: applicationSummary,
        artifactSha256: artifactReceipt.sha256,
      });
      expect(await retireCompleted(randomUUID())).toBe(0);
      expect(await retireCompleted(cleanupSpace, "https://other.example")).toBe(
        0,
      );
      await pool.query(
        "UPDATE lzc.runner_pool_slots SET app_id=$2 WHERE id=$1",
        [cleanupSlot, randomUUID()],
      );
      expect(await retireCompleted()).toBe(0);
      await pool.query(
        "UPDATE lzc.runner_pool_slots SET app_id=$2,source_droplet_id=$3 WHERE id=$1",
        [cleanupSlot, dispatchJob.id, randomUUID()],
      );
      expect(await retireCompleted()).toBe(0);
      await pool.query(
        "UPDATE lzc.runner_pool_slots SET source_droplet_id=$2 WHERE id=$1",
        [cleanupSlot, ticketPackage.runnerPackageId],
      );
      expect(await retireCompleted()).toBe(1);
      expect(await retireCompleted()).toBe(0);
      expect(
        (
          await pool.query(
            "SELECT status FROM lzc.runner_pool_slots WHERE id=$1",
            [cleanupSlot],
          )
        ).rows[0].status,
      ).toBe("retiring");
      await pool.query("DELETE FROM lzc.runner_pool_slots WHERE id=$1", [
        cleanupSlot,
      ]);

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
          "UPDATE lzc.application_runner_records SET ciphertext=$2 WHERE job_id=$1 AND kind='output'",
          [dispatchJob.id, Buffer.alloc(40)],
        ),
      ).rejects.toMatchObject({ code: "55000" });
      await expect(
        dispatchApplications.runnerOutput(dispatchedTicket, ticketPackage, {
          text: "late output",
          truncated: false,
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
      await pool.query(
        "INSERT INTO lzc.runner_pool_slots(id,pool_key,origin,space_id,source_droplet_id,app_id,status,job_id,expires_at) VALUES($1,'cleanup-test',$2,$3,$4,$5,'consumed',$5,now()-interval '1 hour')",
        [
          cleanupSlot,
          cleanupOrigin,
          cleanupSpace,
          ticketPackage.runnerPackageId,
          uncertainJob.id,
        ],
      );
      expect(await retireCompleted()).toBe(0);
      expect(
        (
          await pool.query(
            "SELECT status FROM lzc.runner_pool_slots WHERE id=$1",
            [cleanupSlot],
          )
        ).rows[0].status,
      ).toBe("consumed");
      await pool.query("DELETE FROM lzc.runner_pool_slots WHERE id=$1", [
        cleanupSlot,
      ]);
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
            { document: { revision: corporateContract.document.revision } },
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
        undefined,
        { recoveryReviewsEnabled: true },
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
        await delegatedApplications.runnerOutput(
          delegatedTicket,
          ticketPackage,
          { text: "temporarily truncated", truncated: true },
        );
        expect(
          await delegatedApplications.outputJob(owner, delegatedJob.id),
        ).toMatchObject({ truncated: true });
        for (const text of [
          "package verified",
          "delegated planning progress",
          "delegated planning progress",
        ])
          await delegatedApplications.runnerOutput(
            delegatedTicket,
            ticketPackage,
            { text, truncated: false },
          );
        expect(
          await delegatedApplications.outputJob(owner, delegatedJob.id),
        ).toEqual({
          text: "delegated planning progress",
          truncated: false,
          kind: "execution",
        });
        await expect(
          delegatedApplications.outputJob(
            { ...peer, tenantId },
            delegatedJob.id,
          ),
        ).rejects.toMatchObject({ status: 404 });
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
            text: "Apply started",
            truncated: false,
          });
          await delegatedApplications.runnerOutput(applyTicket, ticketPackage, {
            text: "Apply complete",
            truncated: false,
          });
          await delegatedApplications.runnerResult(applyTicket, ticketPackage, {
            status: "succeeded",
          });
          await expect(
            delegatedApplications.runnerOutput(applyTicket, ticketPackage, {
              text: "late output",
              truncated: false,
            }),
          ).rejects.toBeDefined();
          await expect(
            migration.query(
              "UPDATE lzc.application_runner_records SET ciphertext=$2 WHERE job_id=$1 AND kind='output'",
              [apply.jobId, Buffer.alloc(40)],
            ),
          ).rejects.toMatchObject({ code: "55000" });
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
        // Hard-lost Apply completion is unknown, even with a verified stopped
        // Runner. It must not inherit normally reported-failure replan clearance.
        {
          const stopped = vi.fn<NonNullable<PlanRunner["isStopped"]>>(
            async () => false,
          );
          const read = vi.fn<Backends["read"]>(async () => {
            throw new Error("State must not be touched");
          });
          const recoveringApplies = new Applications(
            pool,
            delegatedTechnical,
            applicationSecrets,
            { ...applicationBackends, read },
            {
              runner: { ...delegatedRunner, isStopped: stopped },
              origin: "http://127.0.0.1:3000",
            },
            applicationCrypto,
          );
          const planned = await freshPlan("Interrupted Apply diagnosis");
          const interrupted = await delegatedApplications.startApply(
            owner,
            planned.id,
            { artifactSha256: planned.sha },
          );
          const ticket = delegatedTicket;
          await delegatedApplications.runnerInput(ticket, ticketPackage);
          for (const stage of ["initializing", "validating", "applying"])
            await delegatedApplications.runnerStage(ticket, ticketPackage, {
              stage,
            });
          // Output alone is not evidence of native completion.
          await delegatedApplications.runnerOutput(ticket, ticketPackage, {
            text: "Synthetic Apply in progress",
            truncated: false,
          });
          const confirm = { confirmInterruptedApply: true };
          expect(
            (await recoveringApplies.listJobs(owner, planned.ordered.id)).find(
              (j) => j.id === interrupted.jobId,
            )?.canInspectInterruptedApply,
          ).toBe(true);
          for (const unauthorized of [
            { ...peer, tenantId },
            { ...owner, tenantId: bob.tenantId },
          ])
            await expect(
              recoveringApplies.inspectInterruptedApply(
                unauthorized,
                interrupted.jobId,
                confirm,
              ),
            ).rejects.toMatchObject({ code: "42501" });
          expect(stopped).not.toHaveBeenCalled();
          await expect(
            recoveringApplies.inspectInterruptedApply(
              owner,
              interrupted.jobId,
              confirm,
            ),
          ).rejects.toMatchObject({
            code: "application_apply_recovery_runner_active",
          });
          expect(
            (
              await migration.query(
                "SELECT 1 FROM lzc.application_apply_interruptions WHERE job_id=$1",
                [interrupted.jobId],
              )
            ).rowCount,
          ).toBe(0);
          const before = (
            await migration.query(
              "SELECT to_jsonb(i) AS value FROM lzc.application_instances i WHERE id=$1",
              [planned.ordered.id],
            )
          ).rows[0].value;
          const c = await withTenant(
            pool,
            owner,
            async (client) =>
              (
                await client.query(
                  "SELECT lzc_auth.interrupted_application_apply_context($1,$2) AS value",
                  [owner.id, interrupted.jobId],
                )
              ).rows[0].value,
          );
          await expect(
            withTenant(pool, owner, (client) =>
              client.query(
                "SELECT lzc_auth.record_interrupted_application_apply($1,$2,$3,$4,clock_timestamp()-interval '31 seconds')",
                [owner.id, interrupted.jobId, c.bindingSha256, c.backendSha256],
              ),
            ),
          ).rejects.toMatchObject({ code: "40001" });
          stopped.mockImplementation(async () => {
            await withTenant(pool, owner, (client) => client.query("SELECT 1"));
            return true;
          });
          const [first, second] = await Promise.all([
            recoveringApplies.inspectInterruptedApply(
              owner,
              interrupted.jobId,
              confirm,
            ),
            recoveringApplies.inspectInterruptedApply(
              owner,
              interrupted.jobId,
              confirm,
            ),
          ]);
          expect(first).toEqual(second);
          expect(first).toMatchObject({
            status: "reconciliation_required",
            runnerStop: "verified-stopped",
            stateCheck: "not-performed",
            stateLock: "not-checked",
            requiresOperatorReview: true,
            canReplan: false,
            startsExecution: false,
          });
          expect(read).not.toHaveBeenCalled();
          expect(
            (
              await migration.query(
                "SELECT count(*)::int AS n FROM lzc.application_apply_interruptions WHERE job_id=$1",
                [interrupted.jobId],
              )
            ).rows[0].n,
          ).toBe(1);
          expect(
            (
              await migration.query(
                "SELECT status,error_code,finished_at IS NOT NULL AS terminal FROM lzc.application_dispatches WHERE job_id=$1",
                [interrupted.jobId],
              )
            ).rows[0],
          ).toEqual({
            status: "reconciliation_required",
            error_code: "cancelled",
            terminal: true,
          });
          expect(
            (
              await migration.query(
                "SELECT to_jsonb(i) AS value FROM lzc.application_instances i WHERE id=$1",
                [planned.ordered.id],
              )
            ).rows[0].value,
          ).toEqual(before);
          await expect(
            delegatedApplications.runnerStage(ticket, ticketPackage, {
              stage: "applying",
            }),
          ).rejects.toBeDefined();
          await expect(
            delegatedApplications.runnerResult(ticket, ticketPackage, {
              status: "succeeded",
            }),
          ).rejects.toBeDefined();
          await expect(
            delegatedApplications.startPlan(owner, planned.ordered.id, {
              idempotencyKey: randomUUID(),
            }),
          ).rejects.toBeDefined();
          const startsAfterInterruption =
            delegatedRunner.start.mock.calls.length;
          expect(
            await delegatedApplications.startApply(owner, planned.id, {
              artifactSha256: planned.sha,
            }),
          ).toEqual({ jobId: interrupted.jobId, dispatched: false });
          expect(delegatedRunner.start.mock.calls.length).toBe(
            startsAfterInterruption,
          );
          await expect(
            recoveringApplies.checkRecoveryReplan(owner, interrupted.jobId),
          ).rejects.toBeDefined();
          stopped.mockRejectedValue(new Error("Runner no longer available"));
          expect(
            await recoveringApplies.inspectInterruptedApply(
              owner,
              interrupted.jobId,
              confirm,
            ),
          ).toEqual(first);
          await expect(
            withTenant(pool, owner, (client) =>
              client.query(
                "DELETE FROM lzc.application_apply_interruptions WHERE job_id=$1",
                [interrupted.jobId],
              ),
            ),
          ).rejects.toMatchObject({ code: "42501" });
          await expect(
            migration.query(
              "DELETE FROM lzc.application_apply_interruptions WHERE job_id=$1",
              [interrupted.jobId],
            ),
          ).rejects.toMatchObject({ code: "55000" });
          await expect(
            recoveringApplies.inspectInterruptedApply(
              owner,
              planned.id,
              confirm,
            ),
          ).rejects.toMatchObject({ code: "42501" });
          await expect(
            recoveringApplies.inspectInterruptedApply(
              owner,
              apply.jobId,
              confirm,
            ),
          ).rejects.toBeDefined();

          // Guided State recovery is a new capability, never an extension of
          // the expired Apply ticket. Exercise the real SQL authority/fences.
          const recoverySessionToken = newSessionToken();
          const renewedReviewer = await store.createSession({
            githubId: 101,
            login: alice.login,
            id: randomUUID(),
            hash: recoverySessionToken.hash,
            csrfToken: randomBytes(32).toString("base64url"),
            expiresAt: new Date(Date.now() + 3600000),
          });
          await new PostgresOrganisations(pool).switch(
            renewedReviewer,
            tenantId,
          );
          const reviewer = { ...renewedReviewer, tenantId };
          expect(reviewer.userId).toBe(engineer.userId);
          const stateRecoveries = new ApplicationStateRecoveries({
            pool,
            profiles: delegatedTechnical,
            secrets: applicationSecrets,
            backends: { read },
            runner: delegatedRunner,
            crypto: applicationCrypto,
            origin: "http://127.0.0.1:3000",
          });
          const requestKey = randomUUID();
          const requested = await stateRecoveries.request(
            owner,
            interrupted.jobId,
            {
              idempotencyKey: requestKey,
              confirmReadOnlyAssessment: true,
            },
          );
          expect(requested).toMatchObject({
            phase: "requested",
            canAssess: false,
            canCommit: false,
            startsInfrastructureApply: false,
          });
          expect(
            await stateRecoveries.request(owner, interrupted.jobId, {
              idempotencyKey: requestKey,
              confirmReadOnlyAssessment: true,
            }),
          ).toEqual(requested);
          expect(
            (await stateRecoveries.latest(reviewer, interrupted.jobId))
              .recovery,
          ).toMatchObject({ id: requested.id, canAssess: true });
          expect(
            (
              await stateRecoveries.latest(
                { ...peer, tenantId },
                interrupted.jobId,
              )
            ).recovery,
          ).toBeNull();
          await expect(
            stateRecoveries.get(
              { ...owner, tenantId: bob.tenantId },
              requested.id,
            ),
          ).rejects.toBeDefined();
          const recoveryContext = (who: Session) =>
            withTenant(
              pool,
              who,
              async (client) =>
                (
                  await client.query(
                    "SELECT lzc_auth.application_state_recovery_context($1,$2) AS value",
                    [who.id, requested.id],
                  )
                ).rows[0].value,
            );
          await expect(recoveryContext(owner)).rejects.toMatchObject({
            code: "42501",
          });
          await expect(recoveryContext(reviewer)).rejects.toMatchObject({
            code: "40001",
          });
          // Test fixture only: advance the immutable old grants to their expired
          // condition without changing any production expiry/revocation guard.
          await admin.query(
            "BEGIN; SET LOCAL session_replication_role=replica",
          );
          try {
            await admin.query(
              "UPDATE lzc.application_runner_tickets SET expires_at=clock_timestamp()-interval '1 microsecond' WHERE job_id=$1",
              [interrupted.jobId],
            );
            await admin.query(
              "UPDATE lzc.application_job_grants SET expires_at=clock_timestamp()-interval '1 microsecond' WHERE job_id=$1",
              [interrupted.jobId],
            );
            await admin.query("COMMIT");
          } catch (error) {
            await admin.query("ROLLBACK");
            throw error;
          }
          expect(await recoveryContext(reviewer)).toMatchObject({
            jobId: interrupted.jobId,
            instanceId: planned.ordered.id,
            recoveryId: requested.id,
            runnerPackageId: ticketPackage.runnerPackageId,
          });
          const begin = async (mode: "prepare" | "commit", phase: string) => {
            const taskId = randomUUID(),
              token = randomBytes(32).toString("base64url");
            await withTenant(pool, reviewer, (client) =>
              client.query(
                "SELECT * FROM lzc_auth.begin_application_state_recovery_task($1,$2,$3,$4,$5,$6,$7::jsonb)",
                [
                  reviewer.id,
                  requested.id,
                  taskId,
                  mode,
                  tokenHash(token),
                  Buffer.from("encrypted-test-fixture"),
                  JSON.stringify({ ...requested, phase }),
                ],
              ),
            );
            return { taskId, token };
          };
          const prepare = await begin("prepare", "assessing");
          const bindingApp = randomUUID();
          await withTenant(pool, reviewer, (client) =>
            client.query(
              "SELECT lzc_auth.bind_application_state_recovery_task($1,$2,$3,$4)",
              [
                reviewer.id,
                prepare.taskId,
                bindingApp,
                ticketPackage.runnerPackageId,
              ],
            ),
          );
          const resolve = async (
            token: string,
            packageId = ticketPackage.runnerPackageId,
          ) =>
            (
              await pool.query(
                "SELECT * FROM lzc_auth.resolve_application_state_recovery_task($1,$2)",
                [tokenHash(token), packageId],
              )
            ).rows;
          expect(await resolve(prepare.token)).toHaveLength(1);
          expect(await resolve(prepare.token, randomUUID())).toEqual([]);
          const release = async (taskId: string) =>
            withTenant(
              pool,
              reviewer,
              async (client) =>
                (
                  await client.query(
                    "SELECT lzc_auth.release_application_state_recovery_input($1,$2) AS allowed",
                    [reviewer.id, taskId],
                  )
                ).rows[0].allowed,
            );
          expect(await release(prepare.taskId)).toBe(true);
          expect(await release(prepare.taskId)).toBe(false);
          await expect(
            withTenant(pool, owner, (client) =>
              client.query(
                "UPDATE lzc.application_state_recoveries SET phase='committed' WHERE id=$1",
                [requested.id],
              ),
            ),
          ).rejects.toMatchObject({ code: "42501" });
          const finish = async (taskId: string, phase: string) =>
            withTenant(pool, reviewer, (client) =>
              client.query(
                "SELECT lzc_auth.finish_application_state_recovery_task($1,$2,$3,$4,$5::jsonb)",
                [
                  reviewer.id,
                  taskId,
                  phase,
                  Buffer.from("encrypted-result-fixture"),
                  JSON.stringify({ ...requested, phase }),
                ],
              ),
            );
          await expect(
            migration.query(
              "INSERT INTO lzc.application_jobs SELECT * FROM lzc.application_jobs WHERE id=$1",
              [interrupted.jobId],
            ),
          ).rejects.toMatchObject({
            code: "40001",
            message: "application_state_recovery_active",
          });
          await finish(prepare.taskId, "prepared");
          expect(await resolve(prepare.token)).toEqual([]);
          await expect(
            finish(prepare.taskId, "prepared"),
          ).rejects.toMatchObject({ code: "40001" });
          const commit = await begin("commit", "committing");
          await withTenant(pool, reviewer, (client) =>
            client.query(
              "SELECT lzc_auth.bind_application_state_recovery_task($1,$2,$3,$4)",
              [
                reviewer.id,
                commit.taskId,
                randomUUID(),
                ticketPackage.runnerPackageId,
              ],
            ),
          );
          expect(await release(commit.taskId)).toBe(true);
          const fence = async (step: string) =>
            withTenant(
              pool,
              reviewer,
              async (client) =>
                (
                  await client.query(
                    "SELECT lzc_auth.fence_application_state_recovery($1,$2,$3) AS allowed",
                    [reviewer.id, commit.taskId, step],
                  )
                ).rows[0].allowed,
            );
          expect(await fence("publish")).toBe(false);
          expect(await fence("unlock")).toBe(true);
          expect(await fence("unlock")).toBe(false);
          expect(await fence("publish")).toBe(true);
          expect(await fence("publish")).toBe(false);
          await expect(
            migration.query(
              "DELETE FROM lzc.application_state_recovery_intents WHERE task_id=$1",
              [commit.taskId],
            ),
          ).rejects.toMatchObject({ code: "55000" });
          await finish(commit.taskId, "reconciliation-required");
          const inspectTask = (who: Session, released: boolean) =>
            withTenant(pool, who, (client) =>
              client.query(
                "SELECT lzc_auth.inspect_application_state_recovery_task($1,$2,$3,$4,$5::jsonb,$6)",
                [
                  who.id,
                  commit.taskId,
                  "committed",
                  Buffer.from("inspected-test-fixture"),
                  JSON.stringify({ ...requested, phase: "committed" }),
                  released,
                ],
              ),
            );
          await expect(inspectTask(owner, true)).rejects.toMatchObject({
            code: "42501",
          });
          await expect(inspectTask(reviewer, false)).rejects.toMatchObject({
            code: "40001",
          });
          await inspectTask(reviewer, true);
          await expect(inspectTask(reviewer, true)).rejects.toMatchObject({
            code: "40001",
          });
          expect(await resolve(commit.token)).toEqual([]);
          expect(
            (await stateRecoveries.latest(owner, interrupted.jobId)).recovery,
          ).toMatchObject({
            phase: "committed",
            canAssess: false,
            canCommit: false,
          });
          await expect(
            migration.query(
              "DELETE FROM lzc.application_state_recovery_receipts WHERE task_id=$1",
              [commit.taskId],
            ),
          ).rejects.toMatchObject({ code: "55000" });
          await expect(
            migration.query(
              "UPDATE lzc.application_state_recovery_tasks SET input_ciphertext=$2 WHERE id=$1",
              [commit.taskId, Buffer.from("altered")],
            ),
          ).rejects.toMatchObject({ code: "55000" });
          expect(read).not.toHaveBeenCalled();
          // SQL bookkeeping alone grants no new Plan or Apply: the API must
          // independently verify S3 and record the existing guarded clearance.
          await expect(
            delegatedApplications.startPlan(owner, planned.ordered.id, {
              idempotencyKey: randomUUID(),
            }),
          ).rejects.toBeDefined();
        }
        // A lost Plan is completed only after independent, source-bound CF and
        // State observations. The existing owner can then reuse the same order.
        {
          const stopped = vi.fn<NonNullable<PlanRunner["isStopped"]>>(
            async () => false,
          );
          const read = vi.fn<Backends["read"]>(async () => null);
          const recoveringPlans = new Applications(
            pool,
            delegatedTechnical,
            applicationSecrets,
            { ...applicationBackends, read },
            {
              runner: { ...delegatedRunner, isStopped: stopped },
              origin: "http://127.0.0.1:3000",
            },
            applicationCrypto,
          );
          const ordered = await recoveringPlans.order(owner, {
            versionId: cliVersion.id,
            idempotencyKey: randomUUID(),
            name: "Interrupted Plan recovery",
            parameters: {},
          });
          const interrupted = await recoveringPlans.startPlan(
            owner,
            ordered.id,
            { idempotencyKey: randomUUID() },
          );
          const ticket = delegatedTicket;
          await recoveringPlans.runnerInput(ticket, ticketPackage);
          for (const stage of ["initializing", "validating", "planning"])
            await recoveringPlans.runnerStage(ticket, ticketPackage, { stage });
          const confirm = { confirmPlanCompletion: true };
          expect(
            (await recoveringPlans.listJobs(owner, ordered.id))[0]
              ?.canCompleteInterruptedPlan,
          ).toBe(true);
          await expect(
            recoveringPlans.completeInterruptedPlan(
              { ...peer, tenantId },
              interrupted.jobId,
              confirm,
            ),
          ).rejects.toMatchObject({ code: "42501" });
          await expect(
            recoveringPlans.completeInterruptedPlan(
              { ...owner, tenantId: bob.tenantId },
              interrupted.jobId,
              confirm,
            ),
          ).rejects.toMatchObject({ code: "42501" });
          expect(stopped).not.toHaveBeenCalled();
          expect(read).not.toHaveBeenCalled();
          await expect(
            recoveringPlans.completeInterruptedPlan(
              owner,
              interrupted.jobId,
              confirm,
            ),
          ).rejects.toMatchObject({
            code: "application_plan_recovery_runner_active",
          });
          expect(read).not.toHaveBeenCalled();
          stopped.mockImplementation(async () => {
            // The runtime pool has size one: this succeeds only when external
            // observation runs outside the tenant transaction.
            await withTenant(pool, owner, (client) => client.query("SELECT 1"));
            return true;
          });
          read.mockImplementation(async (_backend, key) =>
            key.endsWith(".tflock")
              ? { bytes: Buffer.from("synthetic-lock"), identity: "lock" }
              : null,
          );
          await expect(
            recoveringPlans.completeInterruptedPlan(
              owner,
              interrupted.jobId,
              confirm,
            ),
          ).rejects.toMatchObject({
            code: "application_plan_recovery_state_locked",
          });
          expect(
            (await recoveringPlans.listJobs(owner, ordered.id))[0]?.status,
          ).toBe("planning");
          expect(
            (
              await migration.query(
                "SELECT 1 FROM lzc.application_plan_interruptions WHERE job_id=$1",
                [interrupted.jobId],
              )
            ).rowCount,
          ).toBe(0);
          read.mockResolvedValue(null);
          const [first, second] = await Promise.all([
            recoveringPlans.completeInterruptedPlan(
              owner,
              interrupted.jobId,
              confirm,
            ),
            recoveringPlans.completeInterruptedPlan(
              owner,
              interrupted.jobId,
              confirm,
            ),
          ]);
          expect(first).toEqual(second);
          expect(first).toMatchObject({
            jobId: interrupted.jobId,
            instanceId: ordered.id,
            statePresent: false,
            status: "failed",
            startsExecution: false,
            requiresFreshPlan: true,
          });
          const jobs = await recoveringPlans.listJobs(owner, ordered.id);
          expect(jobs[0]).toMatchObject({
            status: "failed",
            errorCode: "cancelled",
            canApply: false,
            canCompleteInterruptedPlan: false,
          });
          expect(
            (
              await migration.query(
                "SELECT count(*)::int AS count FROM lzc.application_plan_interruptions WHERE job_id=$1",
                [interrupted.jobId],
              )
            ).rows[0].count,
          ).toBe(1);
          expect(
            read.mock.calls.every(
              ([, key]) =>
                key === ordered.stateKey ||
                key === `${ordered.stateKey}.tflock`,
            ),
          ).toBe(true);
          await expect(
            recoveringPlans.runnerStage(ticket, ticketPackage, {
              stage: "planning",
            }),
          ).rejects.toMatchObject({
            code: "invalid_application_runner_ticket",
          });
          await expect(
            recoveringPlans.startApply(owner, interrupted.jobId, {
              artifactSha256: "a".repeat(64),
            }),
          ).rejects.toBeDefined();
          const calls = stopped.mock.calls.length;
          stopped.mockRejectedValue(new Error("Runner removed"));
          await expect(
            recoveringPlans.completeInterruptedPlan(
              owner,
              interrupted.jobId,
              confirm,
            ),
          ).resolves.toEqual(first);
          expect(stopped.mock.calls.length).toBe(calls);
          await expect(
            withTenant(pool, owner, (client) =>
              client.query(
                "DELETE FROM lzc.application_plan_interruptions WHERE job_id=$1",
                [interrupted.jobId],
              ),
            ),
          ).rejects.toMatchObject({ code: "42501" });
          const starts = delegatedRunner.start.mock.calls.length;
          const fresh = await recoveringPlans.startPlan(owner, ordered.id, {
            idempotencyKey: randomUUID(),
          });
          expect(fresh.dispatched).toBe(true);
          expect(fresh.jobId).not.toBe(interrupted.jobId);
          expect(delegatedRunner.start.mock.calls.length).toBe(starts + 1);
          await expect(
            recoveringPlans.completeInterruptedPlan(
              owner,
              apply.jobId,
              confirm,
            ),
          ).rejects.toMatchObject({ code: "42501" });
        }
        // A reconciled partial Apply keeps its original order and all evidence.
        // An operator clearance opens only a fresh standard Plan, never the old artifact.
        for (const selfService of [false, true]) {
          const reviewer = selfService ? owner : engineer;
          const resumable = await freshPlan("Application checkpoint replan");
          const partialApply = await delegatedApplications.startApply(
            owner,
            resumable.id,
            {
              artifactSha256: resumable.sha,
            },
          );
          const partialTicket = delegatedTicket;
          await delegatedApplications.runnerInput(partialTicket, ticketPackage);
          for (const stage of ["initializing", "validating", "applying"])
            await delegatedApplications.runnerStage(
              partialTicket,
              ticketPackage,
              { stage },
            );
          if (selfService)
            await delegatedApplications.runnerOutput(
              partialTicket,
              ticketPackage,
              { text: "Synthetic partial Apply failed", truncated: false },
            );
          await delegatedApplications.runnerResult(
            partialTicket,
            ticketPackage,
            {
              status: "failed",
              errorCode: "apply_failed",
            },
          );
          const originalOrder = (
            await migration.query(
              "SELECT to_jsonb(i) AS value FROM lzc.application_instances i WHERE id=$1",
              [resumable.ordered.id],
            )
          ).rows[0].value;
          const originalDispatch = (
            await migration.query(
              "SELECT to_jsonb(d) AS value FROM lzc.application_dispatches d WHERE job_id=$1",
              [partialApply.jobId],
            )
          ).rows[0].value;
          await migration.query(
            "UPDATE lzc_auth.sessions SET expires_at=$2 WHERE id=$1",
            [engineer.id, engineerExpiry],
          );
          const context = (session: Session) =>
            withTenant(
              pool,
              session,
              async (client) =>
                (
                  await client.query(
                    "SELECT lzc_auth.application_recovery_replan_context($1,$2) AS value",
                    [session.id, partialApply.jobId],
                  )
                ).rows[0].value,
            );
          const approved = (session: Session) =>
            withTenant(
              pool,
              session,
              async (client) =>
                (
                  await client.query(
                    "SELECT lzc_auth.application_recovery_replan_approved($1) AS approved",
                    [partialApply.jobId],
                  )
                ).rows[0].approved,
            );
          const clear = (
            session: Session,
            input: {
              binding?: string;
              backend?: string;
              sha?: string;
              attested?: boolean;
            } = {},
            database: pg.Pool = pool,
          ) =>
            withTenant(
              database,
              session,
              async (client) =>
                (
                  await client.query(
                    "SELECT receipt.* FROM lzc_auth.record_application_recovery_replan($1,$2,$3,$4,$5,$6,$7,$8) receipt",
                    [
                      session.id,
                      partialApply.jobId,
                      input.binding ?? reviewed.bindingSha256,
                      input.backend ?? reviewed.backendSha256,
                      input.sha ?? "a".repeat(64),
                      3,
                      "synthetic-state-version",
                      input.attested ?? !selfService,
                    ],
                  )
                ).rows[0],
            );
          let reviewed: {
            bindingSha256: string;
            backendSha256: string;
            backendId: string;
            stateKey: string;
            backendDescriptor: unknown;
            existingReceipt: unknown;
          };
          try {
            await expect(context(engineer)).rejects.toMatchObject({
              code: "40001",
              message: "application_recovery_replan_unavailable",
            });
            if (selfService) {
              expect(await context(owner)).toMatchObject({
                mode: "reported-failure",
              });
              await expect(
                delegatedApplications.runnerInput(partialTicket, ticketPackage),
              ).rejects.toBeDefined();
              await expect(
                delegatedApplications.releaseRunnerCredential(
                  partialTicket,
                  ticketPackage,
                ),
              ).rejects.toBeDefined();
              await expect(
                delegatedApplications.runnerStage(
                  partialTicket,
                  ticketPackage,
                  { stage: "applying" },
                ),
              ).rejects.toBeDefined();
              await expect(
                delegatedApplications.runnerResult(
                  partialTicket,
                  ticketPackage,
                  { status: "succeeded" },
                ),
              ).rejects.toBeDefined();
            } else
              await expect(context(owner)).rejects.toMatchObject({
                code: "42501",
              });
            await expect(context(bob)).rejects.toBeDefined();
            if (!selfService) {
              await admin.query(
                "BEGIN; SET LOCAL session_replication_role=replica",
              );
              await admin.query(
                "UPDATE lzc.application_runner_tickets SET expires_at=clock_timestamp()-interval '1 microsecond' WHERE job_id=$1",
                [partialApply.jobId],
              );
              await admin.query(
                "UPDATE lzc.application_job_grants SET expires_at=clock_timestamp()-interval '1 microsecond' WHERE job_id=$1",
                [partialApply.jobId],
              );
              await admin.query("COMMIT");
            }
            reviewed = await context(reviewer);
            expect(await approved(owner)).toBe(false);
            expect(await approved(bob)).toBe(false);
            expect(reviewed).toMatchObject({
              stateKey: resumable.ordered.stateKey,
              backendId: delegatedBackendId,
              existingReceipt: null,
            });
            expect(reviewed.backendDescriptor).toMatchObject({
              key: resumable.ordered.stateKey,
              useLockfile: true,
            });
            await expect(
              clear(reviewer, { binding: "f".repeat(64) }),
            ).rejects.toMatchObject({
              code: "40001",
              message: "application_recovery_replan_changed",
            });
            await expect(
              clear(reviewer, { backend: "f".repeat(64) }),
            ).rejects.toMatchObject({
              code: "40001",
              message: "application_recovery_replan_changed",
            });
            await expect(
              clear(reviewer, { attested: selfService }),
            ).rejects.toMatchObject({ code: "40001" });
            await expect(
              clear(reviewer, { sha: "invalid" }),
            ).rejects.toMatchObject({ code: "40001" });
            await expect(
              withTenant(pool, engineer, (client) =>
                client.query(
                  "INSERT INTO lzc.application_recovery_replans(job_id) VALUES($1)",
                  [partialApply.jobId],
                ),
              ),
            ).rejects.toMatchObject({ code: "42501" });
            const concurrent = new pg.Pool({
              ...migrationConfig,
              user: "configurator_app",
              password: "runtime-test-only",
              max: 2,
            });
            let receipt: Record<string, unknown>;
            try {
              const [first, second] = await Promise.all([
                clear(reviewer, {}, concurrent),
                clear(reviewer, {}, concurrent),
              ]);
              expect(second).toEqual(first);
              receipt = first;
            } finally {
              await concurrent.end();
            }
            expect(receipt).toMatchObject({
              job_id: partialApply.jobId,
              state_key: resumable.ordered.stateKey,
              state_sha256: "a".repeat(64),
              state_serial: "3",
              mode: selfService ? "reported-failure" : "operator-attested",
              attested_runner_stopped: !selfService,
              attested_cloud_state_compared: !selfService,
            });
            expect(await clear(reviewer)).toEqual(receipt);
            expect(await approved(owner)).toBe(true);
            expect(await approved(engineer)).toBe(true);
            expect(await approved(bob)).toBe(false);
            await expect(
              clear(reviewer, { sha: "b".repeat(64) }),
            ).rejects.toMatchObject({
              code: "40001",
              message: "application_recovery_replan_changed",
            });
            await expect(
              migration.query(
                "DELETE FROM lzc.application_recovery_replans WHERE job_id=$1",
                [partialApply.jobId],
              ),
            ).rejects.toMatchObject({ code: "55000" });
            await expect(
              migration.query(
                "UPDATE lzc.application_recovery_replans SET state_serial=4 WHERE job_id=$1",
                [partialApply.jobId],
              ),
            ).rejects.toMatchObject({ code: "55000" });
            await expect(
              migration.query(
                "SELECT lzc_auth.assert_application_replan_fresh($1)",
                [resumable.id],
              ),
            ).rejects.toMatchObject({
              code: "40001",
              message: "application_recovery_fresh_plan_required",
            });
            // A later local recovery record invalidates even a previously recorded clearance.
            await admin.query(
              "BEGIN; SET LOCAL session_replication_role=replica",
            );
            await admin.query(
              "INSERT INTO lzc.application_runner_records(job_id,kind,tenant_id,owner_user_id,ciphertext,sha256,binding_sha256,state_key,runner_package_id) SELECT job_id,'recovery',tenant_id,owner_user_id,$2,$3,binding_sha256,state_key,$4 FROM lzc.application_job_grants WHERE job_id=$1",
              [
                partialApply.jobId,
                Buffer.alloc(40),
                "c".repeat(64),
                ticketPackage.runnerPackageId,
              ],
            );
            await admin.query("COMMIT");
            expect(await approved(owner)).toBe(false);
            await expect(context(reviewer)).rejects.toBeDefined();
            await expect(
              delegatedApplications.startPlan(owner, resumable.ordered.id, {
                idempotencyKey: randomUUID(),
              }),
            ).rejects.toMatchObject({ code: "40001" });
            await admin.query(
              "BEGIN; SET LOCAL session_replication_role=replica",
            );
            await admin.query(
              "DELETE FROM lzc.application_runner_records WHERE job_id=$1 AND kind='recovery'",
              [partialApply.jobId],
            );
            await admin.query(
              "UPDATE lzc.application_dispatches SET error_code='state_failed' WHERE job_id=$1",
              [partialApply.jobId],
            );
            await admin.query("COMMIT");
            expect(await approved(owner)).toBe(false);
            await expect(context(reviewer)).rejects.toBeDefined();
            await expect(
              delegatedApplications.startPlan(owner, resumable.ordered.id, {
                idempotencyKey: randomUUID(),
              }),
            ).rejects.toMatchObject({ code: "40001" });
            await admin.query(
              "BEGIN; SET LOCAL session_replication_role=replica",
            );
            await admin.query(
              "UPDATE lzc.application_dispatches SET error_code='apply_failed' WHERE job_id=$1",
              [partialApply.jobId],
            );
            await admin.query("COMMIT");
            const nextPlan = await delegatedApplications.startPlan(
              owner,
              resumable.ordered.id,
              { idempotencyKey: randomUUID() },
            );
            expect(nextPlan.jobId).not.toBe(resumable.id);
            const nextTicket = delegatedTicket;
            await delegatedApplications.runnerInput(nextTicket, ticketPackage);
            for (const stage of ["initializing", "validating", "planning"])
              await delegatedApplications.runnerStage(
                nextTicket,
                ticketPackage,
                { stage },
              );
            const summary = summarizePlan(
              await delegatedRunner.preview(),
              2,
              "opentofu-1.12.6",
            );
            const artifact = await delegatedApplications.runnerArtifact(
              nextTicket,
              ticketPackage,
              {
                data: Buffer.from("fresh-recovery-plan").toString("base64"),
                summary,
              },
            );
            await delegatedApplications.runnerResult(
              nextTicket,
              ticketPackage,
              { status: "succeeded", summary, artifactSha256: artifact.sha256 },
            );
            await migration.query(
              "SELECT lzc_auth.assert_application_replan_fresh($1)",
              [nextPlan.jobId],
            );
            const nextApply = await delegatedApplications.startApply(
              owner,
              nextPlan.jobId,
              { artifactSha256: artifact.sha256 },
            );
            expect(nextApply.jobId).not.toBe(partialApply.jobId);
            const nextApplyTicket = delegatedTicket;
            await delegatedApplications.runnerInput(
              nextApplyTicket,
              ticketPackage,
            );
            for (const stage of ["initializing", "validating", "applying"])
              await delegatedApplications.runnerStage(
                nextApplyTicket,
                ticketPackage,
                { stage },
              );
            await delegatedApplications.runnerResult(
              nextApplyTicket,
              ticketPackage,
              { status: "failed", errorCode: "apply_failed" },
            );
            await expect(
              delegatedApplications.startPlan(owner, resumable.ordered.id, {
                idempotencyKey: randomUUID(),
              }),
            ).rejects.toMatchObject({ code: "40001" });
            expect(
              (
                await migration.query(
                  "SELECT to_jsonb(i) AS value FROM lzc.application_instances i WHERE id=$1",
                  [resumable.ordered.id],
                )
              ).rows[0].value,
            ).toEqual(originalOrder);
            expect(
              (
                await migration.query(
                  "SELECT to_jsonb(d) AS value FROM lzc.application_dispatches d WHERE job_id=$1",
                  [partialApply.jobId],
                )
              ).rows[0].value,
            ).toEqual(originalDispatch);
          } finally {
            await admin.query("ROLLBACK");
            await migration.query(
              "UPDATE lzc_auth.sessions SET expires_at=now()-interval '1 second' WHERE id=$1",
              [engineer.id],
            );
          }
        }
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
        const expiredEngineer = (
          await migration.query(
            "SELECT expires_at FROM lzc_auth.sessions WHERE id=$1",
            [engineer.id],
          )
        ).rows[0].expires_at;
        await migration.query(
          "UPDATE lzc_auth.sessions SET expires_at=$2 WHERE id=$1",
          [engineer.id, engineerExpiry],
        );
        const initialReconciliation = (
          await delegatedApplications.recoveryReviewContext(
            engineer,
            recoveryApply.jobId,
          )
        ).reconciliation;
        expect(initialReconciliation).toMatchObject({
          stage: "execution-in-progress",
          ticket: { status: "unexpired" },
          grant: { status: "unexpired" },
          delegation: "not-revoked",
          runnerStop: "unknown",
          stateLock: "unknown",
          cloudState: "unknown",
          credentialRevocation: "unknown",
          authorizesExecution: false,
          reports: [],
        });
        const originalDispatch = (
          await migration.query(
            "SELECT * FROM lzc.application_dispatches WHERE job_id=$1",
            [recoveryApply.jobId],
          )
        ).rows[0];
        try {
          for (const missingRunner of [false, true]) {
            await admin.query(
              "BEGIN; SET LOCAL session_replication_role=replica",
            );
            await admin.query(
              "UPDATE lzc.application_dispatches SET status='reconciliation_required',finished_at=now(),error_code='runner_report_missing',runner_app_id=$2,runner_package_id=$3 WHERE job_id=$1",
              [
                recoveryApply.jobId,
                missingRunner ? null : originalDispatch.runner_app_id,
                missingRunner ? null : originalDispatch.runner_package_id,
              ],
            );
            await admin.query("COMMIT");
            const unresolved =
              await delegatedApplications.recoveryReviewContext(
                engineer,
                recoveryApply.jobId,
              );
            expect(unresolved.reconciliation).toMatchObject({
              stage: missingRunner
                ? "start-unresolved"
                : "completion-unresolved",
              reports: [],
              authorizesExecution: false,
              runnerStop: "unknown",
            });
            expect(unresolved.recoverySha256).toBeNull();
          }
        } finally {
          await admin.query("ROLLBACK");
          await admin.query(
            "BEGIN; SET LOCAL session_replication_role=replica",
          );
          await admin.query(
            "UPDATE lzc.application_dispatches SET status=$2,finished_at=$3,error_code=$4,runner_app_id=$5,runner_package_id=$6 WHERE job_id=$1",
            [
              recoveryApply.jobId,
              originalDispatch.status,
              originalDispatch.finished_at,
              originalDispatch.error_code,
              originalDispatch.runner_app_id,
              originalDispatch.runner_package_id,
            ],
          );
          await admin.query("COMMIT");
          await migration.query(
            "UPDATE lzc_auth.sessions SET expires_at=$2 WHERE id=$1",
            [engineer.id, expiredEngineer],
          );
        }
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
        const diagnosis = await delegatedApplications.diagnoseRecovery(
          owner,
          recoveryApply.jobId,
        );
        expect(diagnosis).toMatchObject({
          jobId: recoveryApply.jobId,
          instanceId: recovering.ordered.id,
          operation: "apply",
          status: "reconciliation_required",
          errorCode: "state_failed",
          assessment: "state-recovery-required",
          stateKey: `applications/${owner.tenantId}/${recovering.ordered.id}/terraform.tfstate`,
          planId: recovering.id,
          evidence: [
            expect.objectContaining({ kind: "recovery", sha256: recoveryHash }),
          ],
        });
        expect(JSON.stringify(diagnosis)).not.toContain(
          "private-recovery-only",
        );
        expect(JSON.stringify(diagnosis)).not.toContain("ciphertext");
        await expect(
          delegatedApplications.diagnoseRecovery(engineer, recoveryApply.jobId),
        ).rejects.toMatchObject({ code: "P0002" });
        await expect(
          delegatedApplications.diagnoseRecovery(bob, recoveryApply.jobId),
        ).rejects.toThrow();
        expect(
          await delegatedApplications.listJobs(owner, recovering.ordered.id),
        ).toContainEqual(
          expect.objectContaining({
            id: recoveryApply.jobId,
            status: "reconciliation_required",
          }),
        );
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
        const reviewInput = {
          instanceId: recovering.ordered.id,
          confirmReview: true,
          bindingSha256: diagnosis.bindingSha256,
          recoverySha256: recoveryHash,
        };
        await expect(
          delegatedApplications.recordRecoveryReview(
            owner,
            recoveryApply.jobId,
            reviewInput,
          ),
        ).rejects.toThrow();
        await expect(
          delegatedApplications.recordRecoveryReview(
            bob,
            recoveryApply.jobId,
            reviewInput,
          ),
        ).rejects.toThrow();
        await expect(
          delegatedApplications.recordRecoveryReview(
            engineer,
            recoveryApply.jobId,
            reviewInput,
          ),
        ).rejects.toMatchObject({ code: "P0002" });
        await migration.query(
          "UPDATE lzc_auth.sessions SET expires_at=$2 WHERE id=$1",
          [engineer.id, engineerExpiry],
        );
        const reviewContext = await delegatedApplications.recoveryReviewContext(
          engineer,
          recoveryApply.jobId,
        );
        expect(reviewContext).toMatchObject({
          jobId: recoveryApply.jobId,
          instanceId: recovering.ordered.id,
          recoverySha256: recoveryHash,
          finding: "state-review-required",
        });
        expect(reviewContext.review).toBeNull();
        expect(reviewContext.reconciliation).toMatchObject({
          stage: "state-recovery-required",
          runnerStop: "unknown",
          stateLock: "unknown",
          cloudState: "unknown",
          credentialRevocation: "unknown",
          authorizesExecution: false,
          ticket: { status: "expired" },
          reports: [
            expect.objectContaining({ kind: "recovery", sha256: recoveryHash }),
          ],
        });
        expect(JSON.stringify(reviewContext)).not.toMatch(
          /private-recovery-only|ciphertext|ticket_hash|credential_key_id/,
        );
        expect(
          (
            await delegatedApplications.recoveryReviewContext(
              engineer,
              recovering.id,
            )
          ).reconciliation,
        ).toMatchObject({
          stage: "reported-completion",
          authorizesExecution: false,
          runnerStop: "unknown",
        });
        await expect(
          new Applications(pool).recordRecoveryReview(
            engineer,
            recoveryApply.jobId,
            reviewInput,
          ),
        ).rejects.toMatchObject({
          code: "application_recovery_review_unavailable",
        });
        await expect(
          delegatedApplications.recordRecoveryReview(engineer, recovering.id, {
            ...reviewInput,
            recoverySha256: null,
          }),
        ).rejects.toMatchObject({ code: "40001" });
        await expect(
          delegatedApplications.recordRecoveryReview(
            engineer,
            recoveryApply.jobId,
            { ...reviewInput, confirmReview: false },
          ),
        ).rejects.toThrow();
        await expect(
          delegatedApplications.recordRecoveryReview(
            engineer,
            recoveryApply.jobId,
            { ...reviewInput, instanceId: randomUUID() },
          ),
        ).rejects.toMatchObject({
          code: "application_recovery_review_changed",
        });
        await expect(
          delegatedApplications.recordRecoveryReview(
            engineer,
            recoveryApply.jobId,
            { ...reviewInput, recoverySha256: null },
          ),
        ).rejects.toMatchObject({
          code: "40001",
          message: "application_recovery_review_changed",
        });
        const review = await delegatedApplications.recordRecoveryReview(
          engineer,
          recoveryApply.jobId,
          reviewInput,
        );
        expect(review).toMatchObject({
          jobId: recoveryApply.jobId,
          reviewedBy: engineer.userId,
          recoverySha256: recoveryHash,
          finding: "state-review-required",
        });
        expect(
          await delegatedApplications.recordRecoveryReview(
            engineer,
            recoveryApply.jobId,
            reviewInput,
          ),
        ).toEqual(review);
        expect(
          (
            await delegatedApplications.recoveryReviewContext(
              engineer,
              recoveryApply.jobId,
            )
          ).review,
        ).toEqual(review);
        await expect(
          withTenant(pool, engineer, (client) =>
            client.query(
              "DELETE FROM lzc.application_recovery_reviews WHERE job_id=$1",
              [recoveryApply.jobId],
            ),
          ),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(
          delegatedApplications.recordRecoveryReview(
            engineer,
            recoveryApply.jobId,
            { ...reviewInput, bindingSha256: "0".repeat(64) },
          ),
        ).rejects.toMatchObject({
          code: "40001",
          message: "application_recovery_review_changed",
        });
        const identityBeforeReview = (
          await migration.query(
            "SELECT revoked_at FROM lzc.stackit_identities WHERE user_id=$1 AND issuer='https://accounts.stackit.cloud'",
            [engineer.userId],
          )
        ).rows[0];
        await migration.query(
          "UPDATE lzc.stackit_identities SET revoked_at=now() WHERE user_id=$1 AND issuer='https://accounts.stackit.cloud'",
          [engineer.userId],
        );
        try {
          await expect(
            delegatedApplications.recordRecoveryReview(
              engineer,
              recoveryApply.jobId,
              reviewInput,
            ),
          ).rejects.toMatchObject({ code: "42501" });
        } finally {
          await migration.query(
            "UPDATE lzc.stackit_identities SET revoked_at=$2 WHERE user_id=$1 AND issuer='https://accounts.stackit.cloud'",
            [engineer.userId, identityBeforeReview.revoked_at],
          );
        }
        await expect(
          migration.query(
            "UPDATE lzc.application_recovery_reviews SET finding='completion-review-required' WHERE job_id=$1",
            [recoveryApply.jobId],
          ),
        ).rejects.toMatchObject({ code: "55000" });
        await expect(
          migration.query(
            "DELETE FROM lzc.application_recovery_reviews WHERE job_id=$1",
            [recoveryApply.jobId],
          ),
        ).rejects.toMatchObject({ code: "55000" });
        expect(
          await delegatedApplications.listJobs(owner, recovering.ordered.id),
        ).toContainEqual(
          expect.objectContaining({
            id: recoveryApply.jobId,
            status: "reconciliation_required",
          }),
        );
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
        await expect(
          migration.query(
            "UPDATE lzc.application_job_grants SET revoked_at=now() WHERE job_id=$1",
            [recoveryApply.jobId],
          ),
        ).rejects.toMatchObject({ message: "application_grant_consumed" });
        await migration.query("BEGIN");
        try {
          await migration.query(
            "SELECT set_config('lzc.user_id',$1,true),set_config('lzc.tenant_id',$2,true)",
            [engineer.userId, engineer.tenantId],
          );
          await migration.query(
            "UPDATE lzc.application_execution_delegations SET revoked_at=now() WHERE id IN (SELECT delegation_id FROM lzc.application_job_delegations WHERE job_id=$1)",
            [recoveryApply.jobId],
          );
          const revokedContext = (
            await migration.query(
              "SELECT lzc_auth.application_recovery_reconciliation_context($1,$2) AS context",
              [engineer.id, recoveryApply.jobId],
            )
          ).rows[0].context;
          expect(revokedContext.reconciliation).toMatchObject({
            grant: { status: "unexpired", revokedAt: null },
            delegation: "revoked",
            ticket: { status: "expired" },
            stage: "state-recovery-required",
            runnerStop: "unknown",
            credentialRevocation: "unknown",
            authorizesExecution: false,
          });
        } finally {
          await migration.query("ROLLBACK");
        }
        expect(
          (
            await delegatedApplications.recoveryReviewContext(
              engineer,
              recoveryApply.jobId,
            )
          ).review,
        ).toEqual(review);
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
        await expect(
          delegatedApplications.diagnoseRecovery(owner, recoveryApply.jobId),
        ).rejects.toThrow();
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
  }, 30000);
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
  it("binds optional HA administration to owner-scoped profile metadata without exposing secrets", async () => {
    const administration = {
      username: "fixture-admin",
      password: "fixture-only-private-password",
    };
    const organizationId = randomUUID();
    const check = {
      status: "passed" as const,
      code: "organization_readable" as const,
      organizationId,
      organizationName: "HA fixture",
      checkedAt: new Date().toISOString(),
    };
    let administrationPresent = true;
    const secrets = {
      get: vi.fn(async () => ({
        key,
        version: 1,
        ...(administrationPresent
          ? { firewallAdministration: administration }
          : {}),
      })),
      put: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
    };
    const cloud = { check: vi.fn(async () => check) };
    const profiles = new PostgresCredentialProfiles(pool, secrets, cloud);
    await profiles.create(alice, "HA fixture", key, administration);
    const profile = (await profiles.list(alice))[0];
    if (!profile) throw new Error("Missing HA profile");
    expect(profile.firewallAdministrationConfigured).toBe(true);
    expect(secrets.put).toHaveBeenCalledExactlyOnceWith(
      alice,
      profile.id,
      key,
      administration,
    );
    expect(await profiles.list(bob)).toEqual([]);
    await expect(
      profiles.verifyForPreparation(bob, profile.id, organizationId),
    ).rejects.toMatchObject({ status: 404 });
    expect(secrets.get).not.toHaveBeenCalled();
    const verified = await profiles.verifyForPreparation(
      alice,
      profile.id,
      organizationId,
    );
    expect(verified).toMatchObject({
      version: 1,
      keyId: key.credentials.kid,
      firewallAdministrationConfigured: true,
    });
    const rows = await withTenant(pool, alice, (client) =>
      client.query("SELECT * FROM lzc.credential_profiles WHERE id=$1", [
        profile.id,
      ]),
    );
    expect(JSON.stringify(rows.rows)).not.toContain(administration.password);
    expect(JSON.stringify(rows.rows)).not.toContain(administration.username);
    await expect(
      withTenant(pool, alice, (client) =>
        client.query(
          "UPDATE lzc.credential_profiles SET firewall_administration_configured=false WHERE id=$1",
          [profile.id],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    administrationPresent = false;
    const missingSecret = await profiles.verifyForPreparation(
      alice,
      profile.id,
      organizationId,
    );
    expect(missingSecret.check).toMatchObject({
      status: "failed",
      code: "secret_unavailable",
    });
    expect(cloud.check).toHaveBeenCalledTimes(1);
    await profiles.remove(alice, profile.id);
    expect(await profiles.list(alice)).toEqual([]);
  });
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
          "firewall_bootstrap",
          true,
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
