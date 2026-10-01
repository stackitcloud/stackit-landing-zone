import {
  addProjectTemplate,
  type CommonConfiguration,
  commonNetworkAreas,
  compileCommonConfiguration,
  folderNames,
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
import { StructuredField } from "./StructuredField";
import { TemplateParameters } from "./TemplateParameters";

export function ProjectTemplates({
  draft,
  onChange,
}: {
  draft: CommonConfiguration;
  onChange: (draft: CommonConfiguration) => void;
}) {
  const [kind, setKind] = useState<"public" | "corporate" | "sandbox">(
    "public",
  );
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const areas = commonNetworkAreas(draft);
  const folders = folderNames(compileCommonConfiguration(draft));
  const perform = (action: () => CommonConfiguration) => {
    try {
      onChange(action());
      setError("");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Das Projekt-Template konnte nicht geändert werden.",
      );
    }
  };
  return (
    <>
      <p>
        Als Platform Engineer definierst du hier Vorlagen für spätere
        Anwendungsprojekte. Application Owner geben bei der Bestellung
        Projektname und Projektkürzel an; die verantwortliche Person muss aus
        ihrer verifizierten STACKIT-Identität kommen.
      </p>
      <p className="info-banner">
        <strong>Template-Entwürfe</strong> werden mit der Plattformkonfiguration
        im Fork gespeichert. Sie erzeugen beim Plattform-Export keine
        Anwendungsprojekte. Veröffentlichung, Freigaben und Bestellung durch
        Application Owner folgen separat.
      </p>
      {error && (
        <p role="alert" className="validation-box">
          {error}
        </p>
      )}
      {projectTemplates(draft).map((template) => {
        const prefix = `project-template-${template.id}`;
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
        const folder =
          template.kind === "corporate"
            ? "landing_zones_corporate"
            : template.kind === "public"
              ? "landing_zones_public"
              : "sandboxes";
        return (
          <section
            className="project-card"
            key={template.id}
            aria-label={template.name || "Projekt-Template"}
          >
            <h3>{template.name || "Projekt-Template"}</h3>
            <p className="muted">
              Entwurf ·{" "}
              {template.kind === "corporate"
                ? "Corporate"
                : template.kind === "public"
                  ? "Public"
                  : "Sandbox"}{" "}
              · Zielordner: {folders[folder]}
            </p>
            <p className="field-hint">
              Template-Kennung: {template.key}. Dies ist keine Projektkennung;
              jedes spätere Projekt erhält eine eigene Identität.
            </p>
            <div className="form-grid">
              <div className="field">
                <label htmlFor={`${prefix}-name`}>Name des Templates</label>
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
                <label htmlFor={`${prefix}-region`}>Region</label>
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
                  Für spätere Instanzen fest vorgegeben.
                </p>
              </div>
              {template.kind === "corporate" && (
                <div className="field">
                  <label htmlFor={`${prefix}-sna`}>
                    STACKIT Network Area (SNA)
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
                        Bitte eine vorhandene SNA auswählen
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
                    Die SNA wird im Bereich Netzwerk definiert und hier
                    referenziert.
                  </p>
                </div>
              )}
            </div>
            <TemplateParameters
              template={template}
              onChange={(patch) =>
                perform(() => updateProjectTemplate(draft, template.id, patch))
              }
            />
            <details>
              <summary>Weitere Template-Einstellungen</summary>
              <StructuredField
                name="project-template-settings"
                title="Projektdienste und Rechte"
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
                    ? ["env", "observability"]
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
              {template.kind !== "sandbox" && (
                <StructuredField
                  name="observability-name"
                  title="Fester Name der Observability-Instanz (optional)"
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
                    Diese Vorlage enthält Kubernetes-Namespace-Dienste aus der
                    Accelerator-Vorlage. Sie bleiben als Entwurf erhalten; ihre
                    spätere Zuordnung zu einem Plattform-Cluster und die
                    Ausführung sind noch nicht freigegeben.
                  </p>
                  <StructuredField
                    name="namespaceServices"
                    title="Kubernetes-Namespace-Dienste"
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
                    "Diesen Template-Entwurf entfernen? Es werden keine Cloud-Projekte gelöscht.",
                  )
                )
                  perform(() => removeProjectTemplate(draft, template.id));
              }}
            >
              Template entfernen
            </button>
          </section>
        );
      })}
      <section className="project-card">
        <h3>Projekt-Template hinzufügen</h3>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="new-template-kind">Art des Projekt-Templates</label>
            <select
              id="new-template-kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as typeof kind)}
            >
              <option value="public">Public</option>
              <option value="corporate">Corporate</option>
              <option value="sandbox">Sandbox</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="new-template-key">Template-Kennung</label>
            <input
              id="new-template-key"
              value={key}
              onChange={(event) => setKey(event.target.value)}
            />
            <p className="field-hint">
              Kleinbuchstaben, Ziffern und Bindestriche; innerhalb dieser
              Konfiguration eindeutig.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={() => perform(() => addProjectTemplate(draft, kind, key))}
        >
          Template hinzufügen
        </button>
      </section>
    </>
  );
}
