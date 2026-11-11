import { randomUUID } from "node:crypto";
import {
  type NotificationPreferences,
  notificationPreferencesSchema,
  notificationSchema,
} from "@lzc/contracts";
import type pg from "pg";
import { z } from "zod";
import type { Session } from "../auth/store.js";
import type { ArtifactCrypto } from "../plans/crypto.js";
import {
  type DeliveryOutcome,
  mailFailure,
  renderNotificationMail,
} from "./mail.js";

const envelope = notificationSchema
  .omit({ createdAt: true, readAt: true, emailStatus: true })
  .extend({
    tenantId: z.uuid(),
    userId: z.uuid(),
    email: z.email(),
    locale: z.enum(["de", "en"]),
    cipher: z.string().nullable(),
  });
export class Notifications {
  constructor(
    private readonly pool: pg.Pool,
    readonly mailEnabled = false,
  ) {}
  async list(session: Session, before?: string) {
    const r = await this.pool.query(
      "SELECT lzc_auth.notification_list($1,$2,$3) AS value",
      [session.id, session.tenantId, before ?? null],
    );
    return z
      .strictObject({
        unread: z.number().int().nonnegative(),
        items: z.array(notificationSchema).max(50),
      })
      .parse(r.rows[0].value);
  }
  async read(session: Session, id: string | null) {
    await this.pool.query("SELECT lzc_auth.notification_read($1,$2,$3)", [
      session.id,
      session.tenantId,
      id,
    ]);
  }
  async preferences(session: Session, preferences?: NotificationPreferences) {
    const p = preferences
      ? notificationPreferencesSchema.parse(preferences)
      : undefined;
    const r = await this.pool.query(
      "SELECT lzc_auth.notification_preferences($1,$2,$3,$4) AS value",
      [session.id, session.tenantId, p?.locale ?? null, p?.emailTopics ?? null],
    );
    return {
      ...notificationPreferencesSchema
        .extend({ hasVerifiedEmail: z.boolean() })
        .parse(r.rows[0].value),
      mailEnabled: this.mailEnabled,
    };
  }
}
export class NotificationDelivery {
  private busy = false;
  constructor(
    private readonly pool: pg.Pool,
    private readonly origin: string,
    private readonly sender: {
      send: (
        email: string,
        message: ReturnType<typeof renderNotificationMail>,
        id: string,
        logo: Buffer,
      ) => Promise<DeliveryOutcome>;
    },
    private readonly crypto: ArtifactCrypto,
    private readonly logo: Buffer,
  ) {}
  async maintain() {
    if (this.busy) return;
    this.busy = true;
    try {
      // One bounded batch per replica; SKIP LOCKED and claim IDs fence concurrency.
      for (let i = 0; i < 10; i++) {
        const claim = randomUUID();
        const claimed = await this.pool.query(
          "SELECT lzc_auth.notification_delivery_claim($1) AS value",
          [claim],
        );
        const value = claimed.rows[0].value as {
          id?: string;
          suppressed?: boolean;
        } | null;
        if (!value) break;
        if (!value.id) continue;
        const prepared = await this.pool.query(
          "SELECT lzc_auth.notification_delivery_prepare($1,$2) AS value",
          [value.id, claim],
        );
        if (!prepared.rows[0].value) continue;
        const n = envelope.parse(prepared.rows[0].value);
        let outcome: DeliveryOutcome;
        try {
          let invitationUrl: string | undefined;
          if (n.kind === "invitation") {
            if (!n.cipher) throw new Error("invitation_payload_missing");
            const token = this.crypto
              .decrypt(
                Buffer.from(n.cipher, "base64"),
                n.tenantId,
                n.userId,
                `notification-invitation:${n.resourceId}`,
              )
              .toString("utf8");
            if (!/^[A-Za-z0-9_-]{43}$/.test(token))
              throw new Error("invitation_payload_invalid");
            invitationUrl = `${this.origin}/organisation#invite=${token}`;
          }
          const message = renderNotificationMail(
            n,
            n.locale,
            this.origin,
            invitationUrl,
          );
          outcome = await this.sender.send(n.email, message, n.id, this.logo);
        } catch (error) {
          outcome = mailFailure(error);
        }
        // A DB failure after SMTP acceptance deliberately leaves a quarantined lease.
        await this.pool.query(
          "SELECT lzc_auth.notification_delivery_finish($1,$2,$3)",
          [n.id, claim, outcome],
        );
      }
    } finally {
      this.busy = false;
    }
  }
}
