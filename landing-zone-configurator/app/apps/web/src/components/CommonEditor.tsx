import {
  addCommonProject,
  assessCommonConfiguration,
  type CommonConfiguration,
  commonNetworkAreas,
  commonProjects,
  compileCommonConfiguration,
  editCommonInput,
  editorIssues,
  effectiveInput,
  exportCommonTfvars,
  folderNames,
  type InputType,
  inputDefinition,
  type JsonValue,
  objectValue,
  removeCommonProject,
  renameCommonProject,
  textValue,
  type Values,
} from "@lzc/domain";
import { useState } from "react";
import type { EditorStep } from "../navigation";
import { labelFor } from "./feature-labels";
import { StructuredField } from "./StructuredField";
import { Topology } from "./Topology";

const steps: { id: EditorStep; title: string; inputs: string[] }[] = [
  {
    id: "basics",
    title: "Grundlagen",
    inputs: [
      "company_name",
      "company_code",
      "organization_id",
      "owner_email",
      "region",
      "labels",
    ],
  },
  {
    id: "folders",
    title: "Ordner",
    inputs: [
      "rm_folder_parent_id",
      "rm_folders",
      "organization_owners",
      "organization_auditors",
    ],
  },
  {
    id: "network",
    title: "Netzwerk",
    inputs: ["connectivity", "connectivity_regions"],
  },
  {
    id: "platform",
    title: "Plattform",
    inputs: ["devops", "platform_kubernetes"],
  },
  {
    id: "projects",
    title: "Projekte",
    inputs: ["landing_zone_namespace_services"],
  },
  {
    id: "operations",
    title: "Betrieb",
    inputs: [
      "observability",
      "audit_logs",
      "federated_identity_providers",
      "firewall_config",
      "firewall_admin_username",
      "firewall_bootstrap",
      "firewall_api_secret_version",
    ],
  },
  { id: "review", title: "Prüfen", inputs: [] },
];
export function CommonEditor({
  draft,
  onChange,
  step,
  onStepChange,
  onOpenStorage,
}: {
  draft: CommonConfiguration;
  onChange: (draft: CommonConfiguration) => void;
  step: EditorStep;
  onStepChange: (step: EditorStep) => void;
  onOpenStorage: () => void;
}) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newKind, setNewKind] = useState<"public" | "corporate" | "sandbox">(
    "public",
  );
  const [newKey, setNewKey] = useState("");
  const values = compileCommonConfiguration(draft);
  const projects = commonProjects(draft);
  const areas = commonNetworkAreas(draft);
  const folders = folderNames(values);
  const issues = editorIssues(draft);
  const assessment = assessCommonConfiguration(draft);
  const active = steps.find((item) => item.id === step) ?? steps[0];
  const perform = (action: () => CommonConfiguration) => {
    try {
      onChange(action());
      setError("");
      setNotice("");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Die Änderung konnte nicht übernommen werden.",
      );
    }
  };
  const update = (name: string, value: JsonValue | undefined) =>
    perform(() => editCommonInput(draft, name, value));
  const updateProject = (id: string, patch: Values) => {
    const project = projects.find((item) => item.id === id);
    if (!project) return;
    if (project.key)
      update("landing_zones", {
        ...objectValue(values.landing_zones),
        [project.key]: { ...project.settings, ...patch },
      });
    else {
      const items = structuredClone(values.sandboxes) as JsonValue[];
      const index = draft.identities.sandboxes.indexOf(id);
      items[index] = { ...project.settings, ...patch };
      update("sandboxes", items);
    }
  };
  const simple = (
    id: string,
    label: string,
    value: string,
    change: (value: string) => void,
    hint?: string,
  ) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        onChange={(event) => change(event.target.value)}
      />
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
  const root = (name: string) => {
    const definition = inputDefinition(name);
    return (
      <StructuredField
        key={name}
        name={name}
        type={definition.type}
        value={values[name]}
        effective={effectiveInput(values, name)}
        optional={!definition.required}
        allowDisable={definition.default === null}
        onChange={(value) => update(name, value)}
      />
    );
  };
  return (
    <>
      <div className="draft-banner">
        <span>
          Gemeinsamer Editor · alle Vorlagen verwenden dasselbe Funktionsmodell.
          Dieser Stand unterstützt Speichern und Exportieren; die
          Deployment-Anbindung folgt separat.
        </span>
        <button type="button" className="text-button" onClick={onOpenStorage}>
          Zu deinen Forks →
        </button>
      </div>
      <nav aria-label="Konfigurationsschritte" className="steps shared-steps">
        {steps.map((item, index) => (
          <button
            type="button"
            key={item.id}
            className={step === item.id ? "step active" : "step"}
            aria-current={step === item.id ? "step" : undefined}
            onClick={() => onStepChange(item.id)}
          >
            <span>{index + 1}</span>
            {item.title}
          </button>
        ))}
      </nav>
      <div className="editor-layout">
        <section className="panel common-editor">
          <h2>{active?.title}</h2>
          {error && (
            <p role="alert" className="validation-box">
              {error}
            </p>
          )}
          {step === "basics" &&
            simple(
              "common-name",
              "Name der Konfiguration",
              draft.name,
              (name) => onChange({ ...draft, name }),
              "Dient zum Wiederfinden. Der Name ändert keine Cloud-Ressource.",
            )}
          {step === "folders" && (
            <p>
              Die vier Ordnerrollen bestimmen die Projektzuordnung. Anzeigenamen
              und Zugriffsrechte können hier geändert werden.
              Ordnerbeschreibungen werden vom Accelerator derzeit nicht wirksam
              übernommen.
            </p>
          )}
          {step === "network" && (
            <p>
              Verwende entweder ein gemeinsames Netzwerkmodell oder regionale
              Netzwerke. Innerhalb einer Region kannst du mehrere Bereiche für
              Corporate-Projekte anlegen. Referenzierte Bereiche lassen sich
              erst nach Umzuordnung ihrer Projekte und Dienste entfernen.
            </p>
          )}
          {step === "network" &&
            objectValue(values.connectivity).network_area != null && (
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  const network = { ...objectValue(values.connectivity) };
                  network.network_areas = {
                    default: network.network_area as JsonValue,
                  };
                  delete network.network_area;
                  update("connectivity", network);
                }}
              >
                Mehrere Netzwerkbereiche verwalten
              </button>
            )}
          {step === "projects" && (
            <>
              <p>
                Public-Projekte sind unabhängig vom zentralen Netzwerk.
                Corporate-Projekte gehören zu einem vorhandenen Bereich ihrer
                Region. Sandboxes sind eigenständige Experimentierprojekte.
              </p>
              {draft.origin.templateId === "standalone" &&
                projects.some(
                  (project) => project.kind === "corporate" && !project.areaId,
                ) && (
                  <p className="info-banner">
                    Die Accelerator-Vorlage Standalone enthält eine
                    unvollständige Public-Markierung (#84). Wähle für das
                    Beispielprojekt ausdrücklich „Public“, wenn du kein
                    zentrales Netzwerk benötigst.
                  </p>
                )}
              {projects.map((project) => {
                const prefix = `common-project-${project.id}`;
                const settings = project.settings;
                const collectionType = inputDefinition(
                  project.kind === "sandbox" ? "sandboxes" : "landing_zones",
                ).type;
                if (typeof collectionType === "string") return null;
                return (
                  <section
                    className="project-card"
                    key={project.id}
                    aria-label={
                      textValue(settings.project_name) || "Neues Projekt"
                    }
                  >
                    <h3>
                      {textValue(settings.project_name) || "Neues Projekt"}
                    </h3>
                    <p className="muted">
                      Zielordner: {folders[project.folder]}
                    </p>
                    <div className="form-grid">
                      <div className="field">
                        <label htmlFor={`${prefix}-kind`}>Projektart</label>
                        <select
                          id={`${prefix}-kind`}
                          value={project.kind}
                          disabled={project.kind === "sandbox"}
                          onChange={(event) => {
                            if (
                              window.confirm(
                                "Projektart und Zielordner ändern? Bei bestehenden Ressourcen kann dies einen Umzug oder Ersatz auslösen. Ein Apply wird nicht gestartet.",
                              )
                            )
                              updateProject(project.id, {
                                corporate: event.target.value === "corporate",
                              });
                          }}
                        >
                          {project.kind === "sandbox" ? (
                            <option value="sandbox">Sandbox</option>
                          ) : (
                            <>
                              <option value="public">Public</option>
                              <option value="corporate">Corporate</option>
                            </>
                          )}
                        </select>
                        {project.kind === "sandbox" && (
                          <p className="field-hint">
                            Sandboxes haben ein eigenes Ressourcenmodell. Für
                            eine andere Art ein neues Projekt anlegen.
                          </p>
                        )}
                      </div>
                      {simple(
                        `${prefix}-name`,
                        "Projektname",
                        textValue(settings.project_name),
                        (project_name) =>
                          updateProject(project.id, { project_name }),
                      )}
                      {simple(
                        `${prefix}-owner`,
                        "Verantwortlich",
                        textValue(
                          project.kind === "sandbox"
                            ? settings.project_owner_email
                            : settings.owner_email,
                        ),
                        (owner) =>
                          updateProject(
                            project.id,
                            project.kind === "sandbox"
                              ? { project_owner_email: owner }
                              : { owner_email: owner },
                          ),
                      )}
                      {project.key && (
                        <>
                          <div className="field">
                            <strong>Eindeutige Kennung: {project.key}</strong>
                            <p className="field-hint">
                              Stabile Zuordnung im Accelerator; Umbenennen
                              ändert Ressourcenadressen.
                            </p>
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => {
                                const key = window.prompt(
                                  "Neue eindeutige Kennung. Dies kann Ressourcenadressen ändern.",
                                  project.key ?? "",
                                );
                                if (
                                  key !== null &&
                                  key !== project.key &&
                                  window.confirm(
                                    "Kennung und zugehörige Namespace-Referenzen umbenennen?",
                                  )
                                )
                                  perform(() =>
                                    renameCommonProject(draft, project.id, key),
                                  );
                              }}
                            >
                              Kennung ändern
                            </button>
                          </div>
                          {simple(
                            `${prefix}-code`,
                            "Projektkürzel",
                            textValue(settings.project_code),
                            (project_code) =>
                              updateProject(project.id, { project_code }),
                            "Wird im Ressourcennamen verwendet, unabhängig von der stabilen Kennung.",
                          )}
                          <div className="field">
                            <label htmlFor={`${prefix}-region`}>Region</label>
                            <select
                              id={`${prefix}-region`}
                              value={textValue(settings.region) || ""}
                              onChange={(event) =>
                                updateProject(project.id, {
                                  region: event.target.value || null,
                                })
                              }
                            >
                              <option value="">Standardregion</option>
                              <option value="eu01">eu01</option>
                              <option value="eu02">eu02</option>
                            </select>
                          </div>
                          {project.kind === "corporate" && (
                            <div className="field">
                              <label htmlFor={`${prefix}-area`}>
                                Netzwerkbereich
                              </label>
                              <select
                                id={`${prefix}-area`}
                                value={project.areaId ?? ""}
                                onChange={(event) => {
                                  const area = areas.find(
                                    (item) => item.id === event.target.value,
                                  );
                                  if (area)
                                    updateProject(project.id, {
                                      network_area_key: area.key,
                                      region: area.region,
                                    });
                                }}
                              >
                                <option value="">
                                  Bitte einen Bereich wählen
                                </option>
                                {areas
                                  .filter(
                                    (area) => area.region === project.region,
                                  )
                                  .map((area) => (
                                    <option key={area.id} value={area.id}>
                                      {textValue(area.settings.name) ||
                                        area.key}{" "}
                                      · {area.region}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <StructuredField
                      name="project-details"
                      title="Weitere Projektdienste und Rechte"
                      type={collectionType[1] as InputType}
                      value={settings}
                      effective={
                        project.key
                          ? objectValue(
                              effectiveInput(values, "landing_zones"),
                            )[project.key]
                          : undefined
                      }
                      omit={[
                        "project_name",
                        "project_code",
                        "owner_email",
                        "project_owner_email",
                        "corporate",
                        "region",
                        "network_area_key",
                      ]}
                      onChange={(next) => {
                        if (project.key)
                          update("landing_zones", {
                            ...objectValue(values.landing_zones),
                            [project.key]: next as JsonValue,
                          });
                        else {
                          const items = structuredClone(
                            values.sandboxes,
                          ) as JsonValue[];
                          items[
                            draft.identities.sandboxes.indexOf(project.id)
                          ] = next as JsonValue;
                          update("sandboxes", items);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        if (
                          window.confirm(
                            "Projekt aus der Konfiguration entfernen? Bestehende Ressourcen würden erst durch ein gesondertes Apply geändert.",
                          )
                        )
                          perform(() => removeCommonProject(draft, project.id));
                      }}
                    >
                      Projekt entfernen
                    </button>
                  </section>
                );
              })}
              <div className="project-card">
                <h3>Projekt hinzufügen</h3>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="new-project-kind">
                      Art des neuen Projekts
                    </label>
                    <select
                      id="new-project-kind"
                      value={newKind}
                      onChange={(event) =>
                        setNewKind(event.target.value as typeof newKind)
                      }
                    >
                      <option value="public">Public</option>
                      <option value="corporate">Corporate</option>
                      <option value="sandbox">Sandbox</option>
                    </select>
                  </div>
                  {newKind !== "sandbox" &&
                    simple(
                      "new-project-key",
                      "Eindeutige Kennung",
                      newKey,
                      setNewKey,
                      "Kleinbuchstaben, Ziffern und Bindestriche. Jede Kennung darf nur einmal vorkommen.",
                    )}
                </div>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() =>
                    perform(() => addCommonProject(draft, newKind, newKey))
                  }
                >
                  Projekt hinzufügen
                </button>
              </div>
            </>
          )}
          {active?.inputs.map(root)}
          {step === "operations" && (
            <div className="info-banner">
              <strong>Geschützte Deployment-Zugänge</strong>
              <p>
                VPN-Schlüssel, Firewall-Passwörter, API-Secrets und Kubeconfigs
                gehören nicht in diese Konfiguration. Ihre zusätzlichen
                geschützten Bindings und die Ausführung des neuen Formats folgen
                separat.
              </p>
            </div>
          )}
          {step === "review" && (
            <>
              <h3>Konfiguration prüfen</h3>
              {issues.length ? (
                <div className="validation-box" role="alert">
                  <strong>{issues.length} Angaben bitte prüfen</strong>
                  <ul>
                    {issues.map((issue) => (
                      <li key={`${issue.field}-${issue.message}`}>
                        {labelFor(issue.field.split(".")[0] ?? issue.field)}:{" "}
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="success-banner">
                  Die Eingaben sind für Speichern und Exportieren vollständig.
                  Dies ist noch kein Deployment-Plan.
                </p>
              )}
              {assessment.findings
                .filter(
                  (item) =>
                    item.scope === "execution" || item.severity === "warning",
                )
                .map((item) => (
                  <p className="info-banner" key={`${item.path}-${item.code}`}>
                    {item.message}{" "}
                    {item.issue && (
                      <a
                        href={`https://github.com/stackitcloud/stackit-landing-zone/issues/${item.issue}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Issue #{item.issue}
                      </a>
                    )}
                  </p>
                ))}
              <div className="actions">
                <button
                  type="button"
                  className="button primary"
                  disabled={issues.length > 0}
                  onClick={() => {
                    const url = URL.createObjectURL(
                      new Blob([exportCommonTfvars(draft)], {
                        type: "text/plain;charset=utf-8",
                      }),
                    );
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = "landing-zone.tfvars";
                    link.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                    setNotice(
                      "tfvars zum Download bereitgestellt. Bitte zusätzlich im Fork speichern.",
                    );
                  }}
                >
                  tfvars herunterladen
                </button>
                <button
                  type="button"
                  className="button primary"
                  onClick={onOpenStorage}
                >
                  Im Fork speichern →
                </button>
              </div>
              {notice && <p role="status">{notice}</p>}
            </>
          )}
          <div className="actions">
            {step !== "basics" && (
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  onStepChange(
                    steps[
                      Math.max(
                        0,
                        steps.findIndex((item) => item.id === step) - 1,
                      )
                    ]?.id ?? "basics",
                  )
                }
              >
                Zurück
              </button>
            )}
            {step !== "review" && (
              <button
                type="button"
                className="button primary"
                onClick={() =>
                  onStepChange(
                    steps[steps.findIndex((item) => item.id === step) + 1]
                      ?.id ?? "review",
                  )
                }
              >
                Weiter →
              </button>
            )}
          </div>
        </section>
        <div>
          <Topology values={values} />
          {areas.length > 0 && (
            <figure className="topology network-topology">
              <figcaption>Netzwerkzuordnung</figcaption>
              {[...new Set(areas.map((area) => area.region))].map((region) => (
                <section key={region}>
                  <h3>{region}</h3>
                  {areas
                    .filter((area) => area.region === region)
                    .map((area) => (
                      <div className="tree-folder" key={area.id}>
                        <strong>
                          {textValue(area.settings.name) || area.key}
                        </strong>
                        <p className="muted">
                          {Array.isArray(area.settings.ranges)
                            ? area.settings.ranges.join(", ")
                            : "Adressbereich offen"}
                        </p>
                        <ul>
                          {projects
                            .filter((project) => project.areaId === area.id)
                            .map((project) => (
                              <li key={project.id}>
                                {textValue(project.settings.project_name)}
                              </li>
                            ))}
                        </ul>
                      </div>
                    ))}
                </section>
              ))}
            </figure>
          )}
        </div>
      </div>
    </>
  );
}
