import {
  type Notification,
  notificationCopy,
  notificationPath,
} from "@lzc/contracts";
import nodemailer from "nodemailer";
import { z } from "zod";

const settings = z.strictObject({
  host: z.hostname(),
  port: z.coerce
    .number()
    .int()
    .refine((p) => p === 25 || p === 587 || p === 465),
  username: z.string().min(1),
  password: z.string().min(1),
  from: z.email(),
  replyTo: z.email().optional(),
  origin: z.url().refine((v) => {
    const u = new URL(v);
    return u.protocol === "https:" && u.origin === v;
  }),
});
export type MailSettings = z.infer<typeof settings>;
export function mailSettings(env: NodeJS.ProcessEnv): MailSettings | undefined {
  if (env.LZC_MAILOUT_ENABLED !== "true") return undefined;
  return settings.parse({
    host: env.LZC_MAILOUT_HOST,
    port: env.LZC_MAILOUT_PORT ?? "25",
    username: env.LZC_MAILOUT_USERNAME,
    password: env.LZC_MAILOUT_PASSWORD,
    from: env.LZC_MAILOUT_FROM,
    ...(env.LZC_MAILOUT_REPLY_TO ? { replyTo: env.LZC_MAILOUT_REPLY_TO } : {}),
    origin: env.LZC_PUBLIC_ORIGIN,
  });
}
const htmlEscape = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function renderNotificationMail(
  item: Pick<
    Notification,
    "id" | "kind" | "resourceType" | "resourceId" | "operation"
  > & { tenantId?: string },
  locale: "de" | "en",
  origin: string,
  invitationUrl?: string,
) {
  const { title, description } = notificationCopy(item.kind, locale);
  const url =
    invitationUrl ?? `${origin}${notificationPath(item, item.tenantId)}`;
  if (new URL(url).origin !== origin || /[\r\n]/.test(url))
    throw new Error("notification_link_invalid");
  const de = locale === "de";
  const action = de
    ? item.kind === "invitation"
      ? "Einladung prüfen"
      : "In der Anwendung öffnen"
    : item.kind === "invitation"
      ? "Review invitation"
      : "Open application";
  const footer = de
    ? "Verwalte deine E-Mail-Benachrichtigungen in der Anwendung."
    : "Manage your email notifications in the application.";
  const reference = item.operation
    ? `${de ? "Vorgang" : "Operation"}: ${item.operation === "plan" ? "Plan" : "Apply"}`
    : "";
  const preferencesUrl = `${origin}/notifications`;
  return {
    subject: `${title} | STACKIT Landing Zone Accelerator`,
    text: `${title}\n\n${description}\n${reference}\n\n${action}: ${url}\n\n${footer}\n${preferencesUrl}`,
    html: `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${htmlEscape(title)}</title></head><body style="margin:0;background:#f0f5f8;color:#173042;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${htmlEscape(description)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="600" style="width:100%;max-width:600px;border-collapse:collapse;background:#fff" cellpadding="0" cellspacing="0"><tr><td style="padding:28px 32px;background:#062b43;border-bottom:4px solid #00b4e5"><img src="cid:stackit-brand" width="134" height="22" alt="STACKIT" style="display:block;border:0;color:#fff;font-size:24px;font-weight:bold"><p style="margin:16px 0 0;color:#fff;font-size:14px">Landing Zone Accelerator</p></td></tr><tr><td style="padding:32px"><h1 style="margin:0 0 18px;font-size:26px;line-height:1.3">${htmlEscape(title)}</h1><p style="font-size:16px;line-height:1.65;margin:0 0 20px">${htmlEscape(description)}</p>${reference ? `<p style="font-size:14px;color:#526978">${htmlEscape(reference)}</p>` : ""}<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#006b9f" style="border-radius:4px"><a href="${htmlEscape(url)}" style="display:inline-block;padding:15px 24px;color:#fff;font-size:16px;font-weight:bold;text-decoration:none">${action}</a></td></tr></table><p style="font-size:12px;line-height:1.6;color:#526978;margin:28px 0 0">${de ? "Falls der Button nicht funktioniert:" : "If the button does not work:"}<br><a href="${htmlEscape(url)}" style="color:#006b9f;word-break:break-all">${htmlEscape(url)}</a></p></td></tr><tr><td style="padding:24px 32px;background:#e9f2f7;font-size:12px;line-height:1.6;color:#405b6d">${footer}<br><a href="${preferencesUrl}" style="color:#006b9f">${de ? "Benachrichtigungseinstellungen" : "Notification preferences"}</a></td></tr></table></td></tr></table></body></html>`,
  };
}
export type DeliveryOutcome =
  | "accepted"
  | "temporary"
  | "rejected"
  | "ambiguous";
export function mailFailure(error: unknown): DeliveryOutcome {
  const e = error as { command?: string; responseCode?: number; code?: string };
  // A final SMTP rejection is definitive. A lost DATA response is ambiguous.
  if (e.responseCode && e.responseCode >= 400 && e.responseCode < 500)
    return "temporary";
  if (e.responseCode && e.responseCode >= 500) return "rejected";
  if (
    [
      "CONN",
      "EHLO",
      "HELO",
      "STARTTLS",
      "AUTH",
      "MAIL FROM",
      "RCPT TO",
    ].includes(e.command ?? "")
  )
    return "temporary";
  return "ambiguous";
}
export function createMailTransport(config: MailSettings) {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: true,
    authMethod: "PLAIN",
    auth: { user: config.username, pass: config.password },
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
    logger: false,
    debug: false,
    maxRecipients: 1,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return {
    async send(
      email: string,
      message: ReturnType<typeof renderNotificationMail>,
      id: string,
      logo: Buffer,
    ): Promise<DeliveryOutcome> {
      const result = await transport.sendMail({
        from: {
          name: "STACKIT Landing Zone Accelerator",
          address: config.from,
        },
        to: email,
        ...(config.replyTo ? { replyTo: config.replyTo } : {}),
        ...message,
        messageId: `<${id}@${config.from.split("@")[1]}>`,
        attachments: [
          {
            filename: "stackit.png",
            content: logo,
            cid: "stackit-brand",
            contentType: "image/png",
          },
        ],
        headers: { "Auto-Submitted": "auto-generated" },
      });
      return result.accepted.length === 1 ? "accepted" : "rejected";
    },
    verify: () => transport.verify(),
    close: () => transport.close(),
  };
}

export async function checkMailout(): Promise<void> {
  const config = mailSettings(process.env);
  if (!config) return;
  const transport = createMailTransport(config);
  try {
    await transport.verify();
  } finally {
    transport.close();
  }
}
