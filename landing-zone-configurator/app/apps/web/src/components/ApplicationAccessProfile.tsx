import {
  type ApplicationAccessTransitionPatch,
  applicationWorkloadPermissions,
  type ProjectTemplateDraft,
  previewApplicationAccessTransition,
} from "@lzc/domain";
import { useEffect, useId, useState } from "react";
import { t } from "../i18n";
import { ApplicationPermissionGroups } from "./ApplicationPermissionGroups";
import { useCatalogueOptions } from "./CloudCatalogues";
import { InitialProjectOwner } from "./InitialProjectOwner";

export function ApplicationAccessProfile({
  template,
  onChange,
}: {
  template: ProjectTemplateDraft;
  onChange: (patch: ApplicationAccessTransitionPatch) => void;
}) {
  const id = useId();
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  // A changed draft requires a new preview and a new explicit confirmation.
  const snapshot = JSON.stringify(template);
  useEffect(() => {
    setPreview((current) => (current === snapshot ? current : null));
    setConfirmed(false);
  }, [snapshot]);
  const transition =
    preview === snapshot ? previewApplicationAccessTransition(template) : null;
  const live = useCatalogueOptions(
    "landing_zones[*].custom_roles[*].permissions[*]",
    template.region,
  );
  const profile = template.accessProfile;
  if (template.kind === "sandbox") return null;
  if (!profile)
    return (
      <div className="info-banner application-access-profile">
        <p>
          {t(
            "Diese Vorlage verwendet bisherige Rollenregeln. Explizite Rollen und Rollen-Kontextbindungen bleiben wirksam; native Owner-Standards gelten nur, soweit sie nicht überschrieben wurden. Eine neue Template-Version verändert bestehende Bestellungen nicht.",
          )}
        </p>
        <p>
          {t(
            "Der Wechsel zeigt zuerst, welche Rollenregeln im Entwurf ersetzt werden. Erst deine ausdrückliche Bestätigung entfernt diese Regeln und setzt das neue Profil. Andere Einstellungen bleiben erhalten.",
          )}
        </p>
        {transition ? (
          <fieldset>
            <legend>{t("Wechsel zum Rechteprofil prüfen")}</legend>
            <p>
              {t(
                "Diese bestehenden Werte werden ausschließlich in diesem Template-Entwurf entfernt und durch das granulare Workload-Rechteprofil ersetzt:",
              )}
            </p>
            {transition.removed.length ? (
              <dl>
                {transition.removed.map(({ path, value }) => (
                  <div key={path}>
                    <dt>
                      {t(
                        (
                          {
                            "settings.custom_roles": "Eigene Rollen",
                            "settings.role_assignments": "Rollenzuweisungen",
                            "settings.automation_role":
                              "Rolle des Application-Service-Accounts",
                            "settings.initial_owner_email":
                              "Bisheriger initialer Projekt-Owner",
                            "parameterPolicy.fields.role_assignments":
                              "Rollen-Kontextbindung und Rollen-Parameterregel",
                          } as Record<string, string>
                        )[path] ?? path,
                      )}
                    </dt>
                    <dd>
                      <pre>{JSON.stringify(value, null, 2)}</pre>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p>
                {t("Es sind keine zusätzlichen Rollenregeln zu entfernen.")}
              </p>
            )}
            <p>
              {t(
                "Der zentrale initiale Projekt-Owner bleibt zunächst leer und muss vor Veröffentlichung bewusst gewählt werden. Speichern und eine neue Template-Version veröffentlichen sind separate Schritte. Bestehende Versionen, Bestellungen, Cloud-Rechte und States bleiben unverändert.",
              )}
            </p>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              {t("Die angezeigten Rollenregeln in diesem Entwurf ersetzen")}
            </label>
            <button
              type="button"
              disabled={!confirmed}
              onClick={() => {
                if (confirmed) onChange(transition.patch);
              }}
            >
              {t("Entwurf auf neues Rechteprofil umstellen")}
            </button>
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                setConfirmed(false);
              }}
            >
              {t("Abbrechen")}
            </button>
          </fieldset>
        ) : (
          <button
            type="button"
            onClick={() => {
              setPreview(snapshot);
              setConfirmed(false);
            }}
          >
            {t("Neues Rechteprofil konfigurieren")}
          </button>
        )}
      </div>
    );
  return (
    <fieldset className="application-access-profile">
      <legend>{t("Application-Rechteprofil")}</legend>
      <label htmlFor={`${id}-mode`}>{t("Projektberechtigungen")}</label>
      <select
        id={`${id}-mode`}
        value={profile.mode}
        onChange={(e) =>
          onChange({
            accessProfile:
              e.target.value === "owner"
                ? { schemaVersion: 1, mode: "owner" }
                : {
                    schemaVersion: 1,
                    mode: "granular",
                    initialOwnerEmail: "",
                    permissions: [...applicationWorkloadPermissions],
                    automationPermissions: [...applicationWorkloadPermissions],
                  },
          })
        }
      >
        <option value="granular">
          {t("Granular: Workload-Betrieb (empfohlen)")}
        </option>
        <option value="owner">{t("Volle Projekt-Owner-Rechte")}</option>
      </select>
      <dl className="application-access-identities">
        <div>
          <dt>{t("Plattform-Service-Account")}</dt>
          <dd>
            {t(
              "Führt das Deployment aus und kann als Owner des neuen Projekts hinterlegt werden.",
            )}
          </dd>
        </div>
        <div>
          <dt>{t("Angemeldeter Nutzer")}</dt>
          <dd>
            {t(
              "Konfiguriert diese Vorlage. Seine Auswahl als Projekt-Owner ist optional.",
            )}
          </dd>
        </div>
        <div>
          <dt>{t("Zukünftiger Besteller")}</dt>
          <dd>
            {t(
              "Erhält beim Deployment die unten festgelegten Projektberechtigungen als einzelne Person.",
            )}
          </dd>
        </div>
        <div>
          <dt>{t("Application-Service-Account")}</dt>
          <dd>
            {t(
              "Wird beim Deployment im neuen Application-Projekt angelegt und erhält die unten festgelegten Berechtigungen.",
            )}
          </dd>
        </div>
      </dl>
      <p className="field-hint">
        {t(
          "Das Profil wird mit der Template-Version festgeschrieben. Besteller können es nicht überschreiben. Geerbte oder anderweitig vergebene Rechte bleiben zusätzlich wirksam.",
        )}
      </p>
      {profile.mode === "owner" ? (
        <p className="info-banner">
          {t(
            "Bewusste Kundenwahl: Besteller und Application-Service-Account erhalten volle Owner-Rechte, einschließlich IAM und Projektverwaltung. Zentrale Vorgaben lassen sich gegenüber diesen Identitäten damit nicht unveränderlich erzwingen.",
          )}
        </p>
      ) : (
        <>
          <InitialProjectOwner
            value={profile.initialOwnerEmail}
            onChange={(email) =>
              onChange({
                accessProfile: { ...profile, initialOwnerEmail: email },
              })
            }
          />
          <p className="field-hint">
            {t(
              "Muss vor Veröffentlichung feststehen und sich vom Besteller unterscheiden. Dieser zentrale Owner bleibt privilegiert; Bestellverantwortung und Cloud-Projektrechte sind getrennt.",
            )}
          </p>
          <p>
            {t(
              "Die geprüfte Workload-Auswahl umfasst VMs, Object Storage, Observability und Secrets Manager. IAM, Projektlöschung, zentrale Routing-Änderungen und privilegierte STACKIT-Service-Account-Verwaltung sind ausgeschlossen. Besteller und Application-Service-Account lassen sich getrennt einschränken; volle Owner-Rechte bleiben eine Kundenwahl.",
            )}
          </p>
          <p className="field-hint">
            {live
              ? t(
                  "Live-Katalog verfügbar; nicht mehr gelistete Berechtigungen sind markiert und müssen geprüft werden.",
                )
              : t(
                  "Statischer geprüfter Permission-Katalog vom 26.10.2026; kein Nachweis der effektiven Rechte eines Benutzers.",
                )}
          </p>
          <label htmlFor={`${id}-search`}>
            {t("Berechtigungen durchsuchen")}
          </label>
          <input
            id={`${id}-search`}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <p className="field-hint">
            {t(
              "Neue Profile starten für Besteller und Application-Service-Account mit denselben Berechtigungen. Du kannst beide getrennt anpassen. Die Gruppen dienen nur der Übersicht; es werden keine Benutzergruppen angelegt. Gruppenaktionen ändern ausschließlich die angezeigten Berechtigungen.",
            )}
          </p>
          {(["permissions", "automationPermissions"] as const).map((field) => (
            <details key={field}>
              <summary>
                {field === "permissions"
                  ? t("Berechtigungen des Bestellers")
                  : t("Berechtigungen des Application-Service-Accounts")}{" "}
                · {profile[field].length}
              </summary>
              <ApplicationPermissionGroups
                selected={profile[field]}
                search={search}
                available={live?.map((permission) => permission.value)}
                onChange={(permissions) =>
                  onChange({
                    accessProfile: { ...profile, [field]: permissions },
                  })
                }
              />
            </details>
          ))}
        </>
      )}
    </fieldset>
  );
}
