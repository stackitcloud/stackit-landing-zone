import { currentLanguage, t } from "../i18n";
export type AccessCheck = {
  status: "passed" | "failed";
  code: string;
  organizationId: string;
  organizationName: string | null;
  checkedAt: string;
};
export const checkMessages: Record<string, string> = {
  organization_readable: "Anmeldung erfolgreich · Organisation lesbar",
  authentication_failed:
    "STACKIT hat die Anmeldung abgelehnt. Prüfe, ob der Schlüssel gültig und aktiv ist.",
  organization_access_denied:
    "Kein lesender Zugriff auf diese Organisation. Prüfe Organisations-ID und Service-Account-Berechtigungen.",
  organization_not_active: "Die Organisation ist derzeit nicht aktiv.",
  cloud_unavailable:
    "STACKIT ist momentan nicht erreichbar oder hat unerwartet geantwortet. Bitte später erneut prüfen.",
  invalid_stored_key:
    "Der gespeicherte Schlüssel ist ungültig oder abgelaufen. Lege ein neues Profil an.",
  secret_unavailable:
    "Der gespeicherte Schlüssel konnte nicht gelesen oder zugeordnet werden. Prüfe das Profil oder lege es neu an.",
  credential_not_stored:
    "Dieses Profil wurde noch nicht vollständig gespeichert.",
  credential_role_required:
    "Für diese Aktion benötigst du die Rolle Administrator oder Deployer.",
};
export function CheckSummary({ check }: { check: AccessCheck }) {
  return (
    <div
      className={
        check.status === "passed" ? "success-banner" : "validation-box"
      }
    >
      <p>{t(checkMessages[check.code]) ?? t("Prüfung nicht erfolgreich.")}</p>
      <p className="credential-account">
        {t("Ziel:")} {check.organizationName || check.organizationId}
      </p>
      <p className="field-hint">
        {t("Geprüft am")}{" "}
        {new Date(check.checkedAt).toLocaleString(
          currentLanguage() === "de" ? "de-DE" : "en-GB",
        )}
        {t(
          ". Dies bestätigt keine Schreibrechte für Plan/Apply. Rechte können sich nach der Prüfung ändern.",
        )}
      </p>
    </div>
  );
}
