import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { PostgresAuthStore, type Session } from "../apps/api/src/auth/store.js";
import {
  NotificationDelivery,
  Notifications,
} from "../apps/api/src/notifications/service.js";
import { Invitations } from "../apps/api/src/organisation/invitations.js";
import { PostgresOrganisations } from "../apps/api/src/organisation/service.js";
import { ArtifactCrypto } from "../apps/api/src/plans/crypto.js";
import { migrate } from "../apps/api/src/storage/migrations.js";

const url = new URL(process.env.LZC_TEST_DATABASE_URL ?? "");
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.pathname !== "/configurator_test"
)
  throw Error("Refusing a non-local/non-test database");
const admin = new pg.Client({ connectionString: url.href });
const connection = {
  host: url.hostname,
  port: Number(url.port),
  database: "configurator_test",
};
const migration = new pg.Client({
  ...connection,
  user: "configurator_migration",
  password: "migration-test-only",
});
const pool = new pg.Pool({
  ...connection,
  user: "configurator_app",
  password: "runtime-test-only",
  max: 3,
});
const store = new PostgresAuthStore(pool);
const organisations = new PostgresOrganisations(pool);
const crypto = new ArtifactCrypto(randomBytes(32).toString("base64"));
const invitations = new Invitations(pool, crypto);
const notifications = new Notifications(pool, true);
const origin = "https://notifications.example.test";
beforeAll(async () => {
  await admin.connect();
  await admin.query(
    "DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='configurator_migration') THEN CREATE ROLE configurator_migration LOGIN PASSWORD 'migration-test-only'; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='configurator_app') THEN CREATE ROLE configurator_app LOGIN PASSWORD 'runtime-test-only'; END IF; END $$; ALTER DATABASE configurator_test OWNER TO configurator_migration",
  );
  await migration.connect();
  await migrate(
    migration,
    fileURLToPath(new URL("../apps/api/db/", import.meta.url)),
  );
}, 30000);
afterAll(async () => {
  await Promise.all([pool.end(), migration.end(), admin.end()]);
});
async function user(): Promise<Session> {
  return store.createSession({
    githubId: Math.floor(Math.random() * Number.MAX_SAFE_INTEGER),
    login: `mail-${randomUUID()}`,
    id: randomUUID(),
    hash: randomBytes(32).toString("base64url"),
    csrfToken: randomBytes(32).toString("base64url"),
    expiresAt: new Date(Date.now() + 3600000),
  });
}
async function workspace() {
  const s = await user();
  const tenant = await organisations.create(
    s,
    `Mail ${randomUUID()}`,
    randomUUID(),
  );
  await organisations.switch(s, tenant);
  return { ...s, tenantId: tenant };
}
async function event(s: Session, key = randomUUID()) {
  await migration.query(
    "SELECT lzc_auth.enqueue_notification($1,$2,$3,'access','access-changed','workspace',$1)",
    [s.tenantId, s.userId, key],
  );
  return (
    await migration.query(
      "SELECT id FROM lzc_auth.notifications WHERE user_id=$1 AND event_key=$2",
      [s.userId, key],
    )
  ).rows[0].id as string;
}
async function verified(s: Session, email = `${s.userId}@example.test`) {
  await migration.query(
    "INSERT INTO lzc.stackit_identities(user_id,issuer,subject,email,verification_method,valid_until) VALUES($1,'https://accounts.stackit.cloud',$2,$3,'signed-id-token-and-userinfo',now()+interval '1 hour')",
    [s.userId, randomUUID(), email],
  );
}
async function clearQueue() {
  await migration.query(
    "UPDATE lzc_auth.notifications SET email_status='suppressed',invitation_cipher=NULL,invitation_email=NULL WHERE email_status IN ('pending','sending')",
  );
}
it("scopes inbox and preferences to the authenticated user and current tenant", async () => {
  const a = await workspace(),
    b = await workspace();
  const id = await event(a);
  expect((await notifications.list(a)).items.map((n) => n.id)).toContain(id);
  expect((await notifications.list(b)).items).toEqual([]);
  await expect(
    notifications.list({ ...a, tenantId: b.tenantId }),
  ).rejects.toMatchObject({ code: "42501" });
  await expect(
    pool.query("SELECT * FROM lzc_auth.notifications"),
  ).rejects.toMatchObject({ code: "42501" });
  await expect(
    pool.query(
      "SELECT lzc_auth.enqueue_notification($1,$2,'forged','access','access-changed','workspace',$1)",
      [a.tenantId, a.userId],
    ),
  ).rejects.toMatchObject({ code: "42501" });
  const p = await notifications.preferences(a);
  expect(p.locale).toBe("de");
  expect(p.emailTopics).not.toContain("execution-success");
  await notifications.preferences(a, { locale: "en", emailTopics: [] });
  expect((await notifications.preferences(a)).emailTopics).toEqual([]);
  expect((await notifications.preferences(b)).locale).toBe("de");
  await notifications.read(b, id);
  expect((await notifications.list(a)).unread).toBe(1);
  await notifications.read(a, id);
  expect((await notifications.list(a)).unread).toBe(0);
});
it("keeps workflow events transactional and idempotent and captures membership changes", async () => {
  const s = await workspace();
  const key = randomUUID();
  await event(s, key);
  await event(s, key);
  expect((await notifications.list(s)).items).toHaveLength(1);
  await migration.query("BEGIN");
  await event(s);
  await migration.query("ROLLBACK");
  expect((await notifications.list(s)).items).toHaveLength(1);
  await organisations.editMember(s, s.userId, ["platform-engineer"], true);
  expect((await notifications.list(s)).items).toHaveLength(2);
});
it("rechecks opt-out and access between claiming and sending", async () => {
  await clearQueue();
  const s = await workspace();
  await verified(s);
  const id = await event(s);
  const claim = randomUUID();
  await pool.query("SELECT lzc_auth.notification_delivery_claim($1)", [claim]);
  await notifications.preferences(s, { locale: "de", emailTopics: [] });
  expect(
    (
      await pool.query(
        "SELECT lzc_auth.notification_delivery_prepare($1,$2) AS value",
        [id, claim],
      )
    ).rows[0].value,
  ).toBeNull();
  await notifications.preferences(s, { locale: "de", emailTopics: ["access"] });
  const next = await event(s);
  const second = randomUUID();
  await pool.query("SELECT lzc_auth.notification_delivery_claim($1)", [second]);
  await migration.query(
    "UPDATE lzc.memberships SET manage_members=false WHERE tenant_id=$1 AND user_id=$2",
    [s.tenantId, s.userId],
  );
  expect(
    (
      await pool.query(
        "SELECT lzc_auth.notification_delivery_prepare($1,$2) AS value",
        [next, second],
      )
    ).rows[0].value,
  ).toBeNull();
  expect((await notifications.list(s)).items).toEqual([]);
});
it("fences concurrent senders and quarantines ambiguous outcomes without resending", async () => {
  await clearQueue();
  const s = await workspace();
  await verified(s);
  const id = await event(s);
  const send = vi.fn(async () => {
    throw Error("lost response containing private diagnostics");
  });
  const make = () =>
    new NotificationDelivery(
      pool,
      origin,
      { send },
      crypto,
      Buffer.from("fixture-logo"),
    );
  await Promise.all([make().maintain(), make().maintain()]);
  expect(send).toHaveBeenCalledTimes(1);
  expect(
    (
      await migration.query(
        "SELECT email_status,last_error FROM lzc_auth.notifications WHERE id=$1",
        [id],
      )
    ).rows[0],
  ).toEqual({ email_status: "uncertain", last_error: "ambiguous" });
  await make().maintain();
  expect(send).toHaveBeenCalledTimes(1);
});
it("bounds transient retries and distinguishes SMTP acceptance from delivery", async () => {
  await clearQueue();
  const s = await workspace();
  await verified(s);
  const id = await event(s);
  const send = vi.fn(async () => "temporary" as const);
  const delivery = new NotificationDelivery(
    pool,
    origin,
    { send },
    crypto,
    Buffer.from("logo"),
  );
  for (let n = 0; n < 5; n++) {
    await migration.query(
      "UPDATE lzc_auth.notifications SET next_attempt_at=now() WHERE id=$1",
      [id],
    );
    await delivery.maintain();
  }
  expect(send).toHaveBeenCalledTimes(5);
  expect(
    (
      await migration.query(
        "SELECT email_status,attempts FROM lzc_auth.notifications WHERE id=$1",
        [id],
      )
    ).rows[0],
  ).toEqual({ email_status: "failed", attempts: 5 });
  const accepted = await event(s);
  await new NotificationDelivery(
    pool,
    origin,
    { send: async () => "accepted" },
    crypto,
    Buffer.from("logo"),
  ).maintain();
  expect(
    (await notifications.list(s)).items.find((n) => n.id === accepted)
      ?.emailStatus,
  ).toBe("accepted");
});
it("queues invitations atomically, encrypts their links and binds acceptance to the verified recipient", async () => {
  await clearQueue();
  const inviter = await workspace();
  const recipient = await user();
  const email = `${recipient.userId}@example.test`;
  await verified(recipient, email);
  const invitation = await invitations.create(
    inviter,
    ["application-owner"],
    false,
    { email, locale: "en" },
  );
  const stored = (
    await migration.query(
      "SELECT invitation_cipher,invitation_email FROM lzc_auth.notifications WHERE resource_id=$1",
      [invitation.id],
    )
  ).rows[0];
  expect(stored.invitation_cipher.toString()).not.toContain(invitation.token);
  const wrong = await user();
  await expect(
    invitations.use(wrong, invitation.token, true),
  ).rejects.toMatchObject({ code: "42501" });
  const send = vi.fn(
    async (_email: string, _message: { text: string }) => "accepted" as const,
  );
  await new NotificationDelivery(
    pool,
    origin,
    { send },
    crypto,
    Buffer.from("logo"),
  ).maintain();
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]?.[0]).toBe(email);
  expect(send.mock.calls[0]?.[1].text).toContain(`#invite=${invitation.token}`);
  expect(await invitations.list(inviter)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: invitation.id,
        recipientEmail: email,
        mailStatus: "accepted",
      }),
    ]),
  );
  await invitations.use(recipient, invitation.token, true);
  await expect(
    invitations.use(recipient, invitation.token, true),
  ).rejects.toMatchObject({ code: "22023" });
  expect(
    (
      await migration.query(
        "SELECT invitation_cipher FROM lzc_auth.notifications WHERE resource_id=$1",
        [invitation.id],
      )
    ).rows[0].invitation_cipher,
  ).toBeNull();
});
it("shows recipient identities only to current workspace managers and identifies STACKIT-only members", async () => {
  await clearQueue();
  const manager = await workspace();
  const person = await user();
  const address = `${person.userId}@example.test`;
  await verified(person, address);
  await migration.query(
    "UPDATE lzc_auth.users SET github_id=NULL,github_login=NULL,display_name='Alex Example' WHERE id=$1",
    [person.userId],
  );
  const membership = await invitations.create(
    manager,
    ["application-owner"],
    false,
  );
  await invitations.use(person, membership.token, true);
  const email = await invitations.create(
    manager,
    ["application-owner"],
    false,
    { email: address, locale: "de" },
  );
  const link = await invitations.create(manager, ["application-owner"], false);
  const listed = await invitations.list(manager);
  expect(listed).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: email.id, recipientEmail: address }),
      expect.objectContaining({ id: link.id, recipientEmail: null }),
    ]),
  );
  expect(JSON.stringify(listed)).not.toContain(email.token);
  expect(JSON.stringify(listed)).not.toContain(link.token);
  expect((await organisations.overview(manager)).members).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        userId: person.userId,
        login: null,
        displayName: "Alex Example",
        email: address,
      }),
    ]),
  );
  const other = await workspace();
  expect(JSON.stringify(await organisations.overview(other))).not.toContain(
    address,
  );
  await expect(
    invitations.list({ ...manager, tenantId: other.tenantId }),
  ).rejects.toMatchObject({ code: "40001" });
  await organisations.switch(person, manager.tenantId);
  const member = { ...person, tenantId: manager.tenantId };
  expect((await organisations.overview(member)).members).toEqual([]);
  await expect(invitations.list(member)).rejects.toMatchObject({
    code: "42501",
  });
  await invitations.revoke(manager, email.id);
  expect(
    (await invitations.list(manager)).some(
      (item: { id: string }) => item.id === email.id,
    ),
  ).toBe(false);
  await clearQueue();
});
it("suppresses revoked or expired invitations before sending", async () => {
  await clearQueue();
  const s = await workspace();
  const invitation = await invitations.create(s, ["application-owner"], false, {
    email: "invitee@example.test",
    locale: "de",
  });
  await invitations.revoke(s, invitation.id);
  const send = vi.fn(async () => "accepted" as const);
  await new NotificationDelivery(
    pool,
    origin,
    { send },
    crypto,
    Buffer.from("logo"),
  ).maintain();
  expect(send).not.toHaveBeenCalled();
});
it("quarantines an accepted SMTP message when persisting its outcome fails", async () => {
  await clearQueue();
  const s = await workspace();
  await verified(s);
  const id = await event(s);
  const send = vi.fn(async () => "accepted" as const);
  const failing = {
    query: (sql: string, values: unknown[]) =>
      sql.includes("notification_delivery_finish")
        ? Promise.reject(Error("synthetic lost DB response"))
        : pool.query(sql, values),
  } as unknown as pg.Pool;
  await expect(
    new NotificationDelivery(
      failing,
      origin,
      { send },
      crypto,
      Buffer.from("logo"),
    ).maintain(),
  ).rejects.toThrow("synthetic lost DB response");
  expect(send).toHaveBeenCalledTimes(1);
  await migration.query(
    "UPDATE lzc_auth.notifications SET claimed_at=now()-interval '3 minutes' WHERE id=$1",
    [id],
  );
  await pool.query("SELECT lzc_auth.notification_maintenance()");
  await new NotificationDelivery(
    pool,
    origin,
    { send },
    crypto,
    Buffer.from("logo"),
  ).maintain();
  expect(send).toHaveBeenCalledTimes(1);
  expect(
    (
      await migration.query(
        "SELECT email_status FROM lzc_auth.notifications WHERE id=$1",
        [id],
      )
    ).rows[0].email_status,
  ).toBe("uncertain");
});
it("generates one expiring-invitation reminder while retaining personal email opt-outs", async () => {
  await clearQueue();
  const s = await workspace();
  const invitation = await invitations.create(s, ["application-owner"], false);
  await migration.query(
    "UPDATE lzc_auth.invitations SET expires_at=now()+interval '23 hours' WHERE id=$1",
    [invitation.id],
  );
  await notifications.preferences(s, { locale: "de", emailTopics: [] });
  await pool.query("SELECT lzc_auth.notification_maintenance()");
  await pool.query("SELECT lzc_auth.notification_maintenance()");
  const items = (await notifications.list(s)).items.filter(
    (n) => n.kind === "invitation-expiring",
  );
  expect(items).toHaveLength(1);
  const send = vi.fn(async () => "accepted" as const);
  await new NotificationDelivery(
    pool,
    origin,
    { send },
    crypto,
    Buffer.from("logo"),
  ).maintain();
  expect(send).not.toHaveBeenCalled();
  expect(
    (await notifications.list(s)).items.find((n) => n.id === items[0]?.id)
      ?.emailStatus,
  ).toBe("suppressed");
});
it("limits mailed invitations per inviter and atomically rolls back an over-limit attempt", async () => {
  await clearQueue();
  const s = await workspace();
  for (let index = 0; index < 20; index++)
    await invitations.create(s, ["application-owner"], false, {
      email: `rate-${index}@example.test`,
      locale: "de",
    });
  await expect(
    invitations.create(s, ["application-owner"], false, {
      email: "over-limit@example.test",
      locale: "de",
    }),
  ).rejects.toMatchObject({ code: "54000" });
  expect(
    Number(
      (
        await migration.query(
          "SELECT count(*) FROM lzc_auth.invitations WHERE tenant_id=$1",
          [s.tenantId],
        )
      ).rows[0].count,
    ),
  ).toBe(20);
});
