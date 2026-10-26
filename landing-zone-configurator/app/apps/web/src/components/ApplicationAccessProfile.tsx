import {
  applicationWorkloadPermissions,
  type ApplicationAccessProfile as Profile,
  type ProjectTemplateDraft,
} from "@lzc/domain";
import { useId, useState } from "react";
import { t } from "../i18n";
import { useCatalogueOptions } from "./CloudCatalogues";

export function ApplicationAccessProfile({
  template,
  onChange,
}: {
  template: ProjectTemplateDraft;
  onChange: (patch: { accessProfile: Profile }) => void;
}) {
  const id = useId();
  const [search, setSearch] = useState("");
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
            "Bestehendes Rechteverhalten: Die bestellende Person und die Automation erhalten Owner-Rechte. Eine neue Template-Version verändert bestehende Bestellungen nicht.",
          )}
        </p>
        <p>
          {t(
            "Vor dem Wechsel eigene Rollen, Rollenzuweisungen und die Rollen-Kontextbindung ausdrücklich entfernen. Bestehende veröffentlichte Versionen bleiben unverändert.",
          )}
        </p>
        <button
          type="button"
          onClick={() =>
            onChange({
              accessProfile: {
                schemaVersion: 1,
                mode: "granular",
                initialOwnerEmail: "",
                permissions: [...applicationWorkloadPermissions],
                automationPermissions: [...applicationWorkloadPermissions],
              },
            })
          }
        >
          {t("Neues Rechteprofil konfigurieren")}
        </button>
      </div>
    );
  const options = applicationWorkloadPermissions.filter((p) =>
    p.includes(search.trim().toLowerCase()),
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
      <p className="field-hint">
        {t(
          "Das Profil wird mit der Template-Version festgeschrieben. Besteller können es nicht überschreiben. Geerbte oder anderweitig vergebene Rechte bleiben zusätzlich wirksam.",
        )}
      </p>
      {profile.mode === "owner" ? (
        <p className="info-banner">
          {t(
            "Bewusste Kundenwahl: Besteller und Workload-Automation erhalten volle Owner-Rechte, einschließlich IAM und Projektverwaltung. Zentrale Vorgaben lassen sich gegenüber diesen Identitäten damit nicht unveränderlich erzwingen.",
          )}
        </p>
      ) : (
        <>
          <label htmlFor={`${id}-initial-owner`}>
            {t(
              "Initialer Projekt-Owner (zentraler Benutzer oder Service Account)",
            )}
          </label>
          <input
            id={`${id}-initial-owner`}
            type="email"
            value={profile.initialOwnerEmail}
            onChange={(e) =>
              onChange({
                accessProfile: {
                  ...profile,
                  initialOwnerEmail: e.target.value,
                },
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
              "Die geprüfte Workload-Auswahl umfasst VMs, Object Storage, Observability und Secrets Manager. IAM, Projektlöschung, zentrale Routing-Änderungen und privilegierte STACKIT-Service-Account-Verwaltung sind ausgeschlossen. Team und Automation lassen sich getrennt einschränken; volle Owner-Rechte bleiben eine Kundenwahl.",
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
          {(["permissions", "automationPermissions"] as const).map((field) => (
            <details key={field}>
              <summary>
                {field === "permissions"
                  ? t("Application-Team")
                  : t("Workload-Automation")}{" "}
                · {profile[field].length}
              </summary>
              {options.map((permission) => (
                <label className="parameter-choice" key={permission}>
                  <input
                    type="checkbox"
                    checked={profile[field].includes(permission)}
                    onChange={(e) =>
                      onChange({
                        accessProfile: {
                          ...profile,
                          [field]: e.target.checked
                            ? [...profile[field], permission].sort()
                            : profile[field].filter((p) => p !== permission),
                        },
                      })
                    }
                  />
                  {permission}
                  {live && !live.some((p) => p.value === permission)
                    ? ` · ${t("Im Live-Katalog nicht vorhanden")}`
                    : ""}
                </label>
              ))}
            </details>
          ))}
        </>
      )}
    </fieldset>
  );
}
