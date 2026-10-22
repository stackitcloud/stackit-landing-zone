import {
  addProjectTemplate,
  type CommonConfiguration,
  commonNetworkAreas,
  compileCommonConfiguration,
  type InputType,
  inputDefinition,
  objectValue,
  projectTemplates,
  removeProjectTemplate,
  textValue,
  updateProjectTemplate,
  type Values,
} from "@lzc/domain";
import { useState } from "react";
import { t } from "../i18n";
import { projectTemplateSummary } from "./project-template-summary";
import { StructuredField } from "./StructuredField";
import {
  TemplateParameters,
  templateObservabilityConfigurable,
} from "./TemplateParameters";

export function ProjectTemplates({
  draft,
  onChange,
  selectedTemplateId,
  onSelectTemplate,
}: {
  draft: CommonConfiguration;
  onChange: (draft: CommonConfiguration) => void;
  selectedTemplateId: string | null;
  onSelectTemplate: (id: string) => void;
}) {
  const [kind, setKind] = useState<"public" | "corporate" | "sandbox">(
    "public",
  );
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const areas = commonNetworkAreas(draft);
  const values = compileCommonConfiguration(draft);
  const templates = projectTemplates(draft);
  const perform = (action: () => CommonConfiguration) => {
    try {
      const next = action();
      onChange(next);
      setError("");
      return next;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Das Application Landing Zone Template konnte nicht geändert werden.",
      );
    }
  };
  return (
    <>
      <p>
        {t(
          "Als Platform Engineer definierst du hier Vorlagen für spätere Anwendungsprojekte. Application Owner wählen ein veröffentlichtes Application Landing Zone Template und geben bei der Bestellung den Projektnamen an; die verantwortliche Person muss aus ihrer verifizierten STACKIT-Identität kommen.",
        )}
      </p>
      <p className="info-banner template-info">
        <strong>{t("Application Landing Zone Template-Entwürfe")}</strong>{" "}
        {t(
          "werden mit der Plattformkonfiguration im Fork gespeichert. Sie erzeugen beim Plattform-Export keine Anwendungsprojekte. Veröffentlichte Versionen und Bestellungen werden getrennt gespeichert. Die Cloud-Ausführung bleibt bis zur Verifizierung von Identität und Plattformvertrag gesperrt.",
        )}
      </p>
      {error && (
        <p role="alert" className="validation-box">
          {t(error)}
        </p>
      )}
      <section
        className="template-overview"
        aria-label={t("Template-Übersicht")}
      >
        <h3>
          {t("Template-Übersicht")}{" "}
          <span className="muted">({templates.length})</span>
        </h3>
        <p className="field-hint">
          {t("Wähle ein Template aus, um seine Einstellungen zu bearbeiten.")}
        </p>
        {templates.length ? (
          <div className="template-overview-grid">
            {templates.map((template) => {
              const summary = projectTemplateSummary(template, values);
              return (
                <button
                  type="button"
                  key={template.id}
                  className={`template-choice${selectedTemplateId === template.id ? " selected" : ""}`}
                  aria-pressed={selectedTemplateId === template.id}
                  aria-controls="project-template-details"
                  aria-label={`${t("Template auswählen:")} ${summary.name} (${template.key})`}
                  onClick={() => onSelectTemplate(template.id)}
                >
                  <span className="template-choice-meta">
                    {summary.kind} · {template.region}
                  </span>
                  <strong>{summary.name}</strong>
                  <code>{template.key}</code>
                  <span>
                    {t("Zielordner:")} {summary.folder}
                  </span>
                  <span>{summary.network}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="muted">
            {t("Noch keine Application Landing Zone Templates definiert.")}
          </p>
        )}
      </section>
      {templates
        .filter((template) => template.id === selectedTemplateId)
        .map((template) => {
          const prefix = `project-template-${template.id}`;
          const summary = projectTemplateSummary(template, values);
          const settings = template.settings;
          const collection = inputDefinition(
            template.kind === "sandbox" ? "sandboxes" : "landing_zones",
          ).type;
          if (typeof collection === "string") return null;
          const patchSettings = (patch: Values) =>
            perform(() =>
              updateProjectTemplate(draft, template.id, {
                settings: { ...settings, ...patch },
              }),
            );
          return (
            <section
              className="project-card template-details"
              id="project-template-details"
              key={template.id}
              aria-label={`${t("Template bearbeiten:")} ${summary.name}`}
            >
              <p className="template-choice-meta">
                {t("Ausgewähltes Template")}
              </p>
              <h3>{summary.name}</h3>
              <p className="muted">
                {t("Entwurf ·")} {summary.kind} · {template.region}{" "}
                {t("· Zielordner:")} {summary.folder}
              </p>
              <p className="field-hint">{summary.network}</p>
              <p className="field-hint">
                {t("Template-Kennung:")} {template.key}
                {t(
                  ". Dies ist keine Projektkennung; jedes spätere Projekt erhält eine eigene Identität.",
                )}
              </p>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor={`${prefix}-name`}>
                    {t("Name des Templates")}
                  </label>
                  <input
                    id={`${prefix}-name`}
                    value={template.name}
                    onChange={(event) =>
                      perform(() =>
                        updateProjectTemplate(draft, template.id, {
                          name: event.target.value,
                        }),
                      )
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor={`${prefix}-region`}>{t("Region")}</label>
                  <select
                    id={`${prefix}-region`}
                    value={template.region}
                    onChange={(event) =>
                      perform(() =>
                        updateProjectTemplate(draft, template.id, {
                          region: event.target.value as "eu01" | "eu02",
                        }),
                      )
                    }
                  >
                    <option value="eu01">eu01</option>
                    <option value="eu02">eu02</option>
                  </select>
                  <p className="field-hint">
                    {t("Für spätere Instanzen fest vorgegeben.")}
                  </p>
                </div>
                {template.kind === "corporate" && (
                  <div className="field">
                    <label htmlFor={`${prefix}-sna`}>
                      {t("STACKIT Network Area (SNA)")}
                    </label>
                    <select
                      id={`${prefix}-sna`}
                      value={textValue(settings.network_area_key) || "default"}
                      onChange={(event) =>
                        patchSettings({ network_area_key: event.target.value })
                      }
                    >
                      {!areas.some(
                        (area) =>
                          area.region === template.region &&
                          area.key ===
                            (textValue(settings.network_area_key) || "default"),
                      ) && (
                        <option
                          value={
                            textValue(settings.network_area_key) || "default"
                          }
                        >
                          {t("Bitte eine vorhandene SNA auswählen")}
                        </option>
                      )}
                      {areas
                        .filter((area) => area.region === template.region)
                        .map((area) => (
                          <option key={area.id} value={area.key}>
                            {textValue(area.settings.name) || area.key} ·{" "}
                            {area.region}
                          </option>
                        ))}
                    </select>
                    <p className="field-hint">
                      {t(
                        "Die SNA wird im Bereich Netzwerk definiert und hier referenziert.",
                      )}
                    </p>
                  </div>
                )}
                {template.kind === "public" && (
                  <div className="field">
                    <label className="check" htmlFor={`${prefix}-network`}>
                      <input
                        id={`${prefix}-network`}
                        type="checkbox"
                        checked={settings.network_enabled === true}
                        onChange={(event) =>
                          patchSettings({
                            network_enabled: event.target.checked,
                          })
                        }
                      />
                      {t("Lokales Projektnetz anlegen")}
                    </label>
                  </div>
                )}
                {(template.kind === "corporate" ||
                  (template.kind === "public" &&
                    settings.network_enabled === true)) && (
                  <div className="field">
                    <label htmlFor={`${prefix}-network-prefix`}>
                      {t("Netzgröße (IPv4-Präfixlänge)")}
                    </label>
                    <input
                      id={`${prefix}-network-prefix`}
                      aria-describedby={`${prefix}-network-prefix-hint`}
                      type="number"
                      step="1"
                      placeholder={t("Automatisch")}
                      value={
                        typeof settings.network_prefix_length === "number"
                          ? settings.network_prefix_length
                          : ""
                      }
                      onChange={(event) =>
                        patchSettings({
                          network_prefix_length:
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                        })
                      }
                    />
                    <p
                      id={`${prefix}-network-prefix-hint`}
                      className="field-hint"
                    >
                      {t(
                        "Bestimmt die Größe des IPv4-Adressbereichs: /24 umfasst 256 Adressen, /25 umfasst 128, /26 umfasst 64. Je höher die Zahl, desto kleiner das Netz. Nicht alle Adressen stehen für VMs zur Verfügung. Leer lassen für Automatisch: Corporate übernimmt die Standardgröße der angebundenen SNA, Public die Vorgabe von STACKIT.",
                      )}
                    </p>
                  </div>
                )}
              </div>
              <TemplateParameters
                template={template}
                onChange={(patch) =>
                  perform(() =>
                    updateProjectTemplate(draft, template.id, patch),
                  )
                }
              />
              <details>
                <summary>{t("Weitere Template-Einstellungen")}</summary>
                <StructuredField
                  name="project-template-settings"
                  hideInactiveDetails
                  title={t("Projektdienste und Rechte")}
                  type={collection[1] as InputType}
                  value={settings}
                  omit={[
                    "project_name",
                    "project_code",
                    "owner_email",
                    "project_owner_email",
                    "corporate",
                    "region",
                    "network_area_key",
                    "secretsmanager_enabled",
                    ...(template.kind !== "sandbox"
                      ? [
                          "env",
                          "observability",
                          "network_enabled",
                          "network_prefix_length",
                        ]
                      : []),
                  ]}
                  regionContext={template.region}
                  onChange={(value) =>
                    perform(() =>
                      updateProjectTemplate(draft, template.id, {
                        settings: objectValue(value),
                      }),
                    )
                  }
                />
                {template.kind !== "sandbox" &&
                  templateObservabilityConfigurable(template) && (
                    <StructuredField
                      name="observability-name"
                      title={t(
                        "Fester Name der Observability-Instanz (optional)",
                      )}
                      type="string"
                      optional
                      value={objectValue(settings.observability).name}
                      onChange={(value) =>
                        patchSettings({
                          observability: {
                            ...objectValue(settings.observability),
                            name: value ?? null,
                          },
                        })
                      }
                    />
                  )}
                {template.namespaceServices !== undefined && (
                  <>
                    <p className="info-banner">
                      {t(
                        "Diese Vorlage enthält Kubernetes-Namespace-Dienste aus der Accelerator-Vorlage. Sie bleiben als Entwurf erhalten; ihre spätere Zuordnung zu einem Plattform-Cluster und die Ausführung sind noch nicht freigegeben.",
                      )}
                    </p>
                    <StructuredField
                      name="namespaceServices"
                      hideInactiveDetails
                      title={t("Kubernetes-Namespace-Dienste")}
                      type={
                        (
                          inputDefinition("landing_zone_namespace_services")
                            .type as [string, InputType]
                        )[1]
                      }
                      value={template.namespaceServices}
                      regionContext={template.region}
                      onChange={(value) =>
                        perform(() =>
                          updateProjectTemplate(draft, template.id, {
                            namespaceServices: objectValue(value),
                          }),
                        )
                      }
                    />
                  </>
                )}
              </details>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  if (
                    window.confirm(
                      t(
                        "Diesen Template-Entwurf entfernen? Es werden keine Cloud-Projekte gelöscht.",
                      ),
                    )
                  )
                    perform(() => removeProjectTemplate(draft, template.id));
                }}
              >
                {t("Template entfernen")}
              </button>
            </section>
          );
        })}
      <section className="project-card">
        <h3>{t("Application Landing Zone Template hinzufügen")}</h3>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="new-template-kind">
              {t("Art des Application Landing Zone Templates")}
            </label>
            <select
              id="new-template-kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as typeof kind)}
            >
              <option value="public">{t("Public")}</option>
              <option value="corporate">{t("Corporate")}</option>
              <option value="sandbox">{t("Sandbox")}</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="new-template-key">{t("Template-Kennung")}</label>
            <input
              id="new-template-key"
              value={key}
              onChange={(event) => setKey(event.target.value)}
            />
            <p className="field-hint">
              {t(
                "Kleinbuchstaben, Ziffern und Bindestriche; innerhalb dieser Konfiguration eindeutig.",
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            const next = perform(() => addProjectTemplate(draft, kind, key));
            if (next) {
              const created = projectTemplates(next).find(
                (template) =>
                  !templates.some((entry) => entry.id === template.id),
              );
              if (!created) {
                setError(
                  "Das Application Landing Zone Template konnte nicht geändert werden.",
                );
                return;
              }
              onSelectTemplate(created.id);
              setKey("");
            }
          }}
        >
          {t("Template hinzufügen")}
        </button>
      </section>
    </>
  );
}
