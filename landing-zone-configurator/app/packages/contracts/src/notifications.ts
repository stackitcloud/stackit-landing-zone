import { z } from "zod";

export const notificationTopics = [
  "approvals",
  "execution-success",
  "execution-failure",
  "recovery",
  "access",
  "reminders",
] as const;
export const notificationPreferencesSchema = z.strictObject({
  locale: z.enum(["de", "en"]),
  emailTopics: z
    .array(z.enum(notificationTopics))
    .max(notificationTopics.length)
    .refine((values) => new Set(values).size === values.length),
});
export const notificationKinds = [
  "invitation",
  "invitation-expiring",
  "order-pending",
  "order-approved",
  "order-rejected",
  "execution-succeeded",
  "execution-failed",
  "execution-cancelled",
  "recovery-required",
  "access-changed",
  "action-overdue",
  "upgrade-approved",
] as const;
export type NotificationKind = (typeof notificationKinds)[number];
export const notificationSchema = z.strictObject({
  id: z.uuid(),
  topic: z.enum(["invitations", ...notificationTopics]),
  kind: z.enum(notificationKinds),
  resourceType: z.enum(["invitation", "application", "platform", "workspace"]),
  resourceId: z.uuid(),
  operation: z.enum(["plan", "apply"]).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  readAt: z.iso.datetime({ offset: true }).nullable(),
  emailStatus: z.enum([
    "pending",
    "sending",
    "accepted",
    "suppressed",
    "failed",
    "uncertain",
  ]),
});
export type Notification = z.infer<typeof notificationSchema>;
export type NotificationPreferences = z.infer<
  typeof notificationPreferencesSchema
>;
const copy: Record<
  NotificationKind,
  readonly [string, string, string, string]
> = {
  invitation: [
    "Einladung zum Arbeitsbereich",
    "Du wurdest eingeladen. Melde dich mit der eingeladenen STACKIT-Identität an und prüfe den Beitritt. Der Link ist einmalig und höchstens sieben Tage gültig.",
    "Workspace invitation",
    "You have been invited. Sign in with the invited STACKIT identity and review membership. This single-use link expires within seven days.",
  ],
  "invitation-expiring": [
    "Einladung läuft bald ab",
    "Eine offene Einladung läuft innerhalb von 24 Stunden ab. Prüfe, ob sie noch benötigt wird.",
    "Invitation expiring",
    "An outstanding invitation expires within 24 hours. Review whether it is still needed.",
  ],
  "order-pending": [
    "Freigabe erforderlich",
    "Eine Application-Landing-Zone-Bestellung wartet auf die Prüfung durch einen Platform Owner.",
    "Approval required",
    "An Application Landing Zone order awaits Platform Owner review.",
  ],
  "order-approved": [
    "Bestellung freigegeben",
    "Die Bestellung wurde freigegeben. Prüfe die nächsten Schritte in der Anwendung; die Freigabe startet keinen Apply.",
    "Order approved",
    "The order has been approved. Review the next steps in the application; approval does not start an Apply.",
  ],
  "order-rejected": [
    "Bestellung abgelehnt",
    "Die Bestellung wurde abgelehnt. Die Begründung ist in der geschützten Bestellansicht verfügbar.",
    "Order rejected",
    "The order was rejected. The reason is available in the authenticated order view.",
  ],
  "execution-succeeded": [
    "Ausführung abgeschlossen",
    "Die Ausführung ist erfolgreich abgeschlossen. Ergebnis und nächste Schritte stehen in der Anwendung bereit.",
    "Execution completed",
    "Execution finished successfully. Results and next steps are available in the application.",
  ],
  "execution-failed": [
    "Ausführung fehlgeschlagen",
    "Die Ausführung konnte nicht erfolgreich abgeschlossen werden. Prüfe den Status und die nächsten Schritte in der Anwendung.",
    "Execution failed",
    "Execution could not complete successfully. Review its status and next steps in the application.",
  ],
  "execution-cancelled": [
    "Ausführung abgebrochen",
    "Die Ausführung wurde abgebrochen. Prüfe den gespeicherten Status, bevor du einen neuen Vorgang startest.",
    "Execution cancelled",
    "Execution was cancelled. Review the saved status before starting another operation.",
  ],
  "recovery-required": [
    "Wiederherstellung prüfen",
    "Die Ausführung benötigt eine Prüfung durch die zuständige Person. Prüfe den gespeicherten Status, bevor du weitere Schritte freigibst.",
    "Recovery review required",
    "Execution requires attention from the responsible owner. Review the saved status before authorizing further steps.",
  ],
  "access-changed": [
    "Mitgliedschaft geändert",
    "Mitgliedschaften oder Rollenzuweisungen im Arbeitsbereich wurden geändert. Prüfe die aktuellen Berechtigungen in der Anwendung.",
    "Membership changed",
    "Workspace memberships or role assignments have changed. Review current permissions in the application.",
  ],
  "action-overdue": [
    "Erinnerung an offene Freigabe",
    "Eine Bestellung wartet weiterhin auf Prüfung. Diese Erinnerung wird höchstens dreimal im Abstand von mindestens 24 Stunden erzeugt.",
    "Outstanding approval reminder",
    "An order still awaits review. This reminder is generated at most three times, at least 24 hours apart.",
  ],
  "upgrade-approved": [
    "Upgrade freigegeben",
    "Das Upgrade wurde für den geprüften Plan freigegeben. Prüfe vor der Ausführung den aktuellen Status in der Anwendung.",
    "Upgrade approved",
    "The upgrade was approved for the reviewed plan. Check current status in the application before execution.",
  ],
};
export function notificationCopy(kind: NotificationKind, locale: "de" | "en") {
  const words = copy[kind];
  return {
    title: words[locale === "de" ? 0 : 2],
    description: words[locale === "de" ? 1 : 3],
  };
}
export function notificationPath(
  item: Pick<Notification, "id" | "resourceType" | "resourceId">,
  tenantId?: string,
) {
  const base =
    item.resourceType === "application"
      ? "/applications"
      : item.resourceType === "platform"
        ? "/deployments/history"
        : "/organisation";
  return `${base}?notification=${item.id}&resource=${item.resourceId}${tenantId ? `&tenant=${tenantId}` : ""}`;
}
