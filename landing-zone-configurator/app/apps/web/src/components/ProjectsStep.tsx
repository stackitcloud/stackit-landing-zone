import type { ConfigurationDraft } from "@lzc/domain";
import { Field } from "./Field";

export function ProjectsStep({
  draft,
  patch,
  error,
  onBack,
  onReview,
}: {
  draft: ConfigurationDraft;
  patch: (update: Partial<ConfigurationDraft>) => void;
  error: (field: string) => string | undefined;
  onBack: () => void;
  onReview: () => void;
}) {
  return (
    <section className="panel">
      <h2>Projekte & Sandboxes</h2>
      <p className="section-description">
        Landing Zones bilden deine Workloads ab. Sandboxes bieten Platz zum
        Experimentieren.
      </p>
      <div className="info-banner">
        <p>
          Standalone-Projekte werden ohne Anbindung an einen zentralen
          Netzwerk-Hub erstellt. Dafür setzen wir die Netzwerkzuordnung der
          Vorlage ausdrücklich auf eigenständig.
        </p>
      </div>
      {draft.projects.map((p) => (
        <fieldset className="project-form" key={p.id}>
          <legend>{p.name || "Neue Landing Zone"}</legend>
          <div className="form-grid">
            <Field
              id={`project.${p.id}.name`}
              label="Projektname"
              hint="Lesbarer Name im Konfigurator, z. B. Kundenportal. Die Ressourcennamen entstehen aus den Kürzeln und der Umgebung."
              value={p.name}
              onChange={(name) =>
                patch({
                  projects: draft.projects.map((x) =>
                    x.id === p.id ? { ...x, name } : x,
                  ),
                })
              }
              error={error(`project.${p.id}.name`)}
            />
            <Field
              id={`project.${p.id}.key`}
              label="Eindeutige Kennung"
              hint="Stabile ID innerhalb dieser Konfiguration, z. B. kundenportal-prod. Sie ordnet die Landing Zone ihrem Deployment zu. Nach dem ersten Deployment nur mit geplanter Migration ändern."
              value={p.key}
              onChange={(key) =>
                patch({
                  projects: draft.projects.map((x) =>
                    x.id === p.id ? { ...x, key } : x,
                  ),
                })
              }
              error={error(`project.${p.id}.key`)}
            />
            <Field
              id={`project.${p.id}.code`}
              label="Projektkürzel"
              hint="Kurzer Baustein für Ressourcen- und gegebenenfalls DNS-Namen, z. B. portal. 1–16 Zeichen: Kleinbuchstaben, Ziffern und Bindestriche; beginnt mit einem Buchstaben."
              value={p.code}
              onChange={(code) =>
                patch({
                  projects: draft.projects.map((x) =>
                    x.id === p.id ? { ...x, code } : x,
                  ),
                })
              }
              error={error(`project.${p.id}.code`)}
            />
            <Field
              id={`project.${p.id}.owner`}
              label="Projektverantwortlich"
              hint="E-Mail-Adresse des in STACKIT registrierten Verantwortlichen für dieses Projekt."
              type="email"
              value={p.owner}
              onChange={(owner) =>
                patch({
                  projects: draft.projects.map((x) =>
                    x.id === p.id ? { ...x, owner } : x,
                  ),
                })
              }
              error={error(`project.${p.id}.owner`)}
            />
            <Field
              id={`project.${p.id}.environment`}
              label="Umgebung"
              hint="Kennzeichnet den Einsatzzweck und ergänzt den Ressourcennamen: dev, test, staging oder prod."
              value={p.environment}
              onChange={(environment) =>
                patch({
                  projects: draft.projects.map((x) =>
                    x.id === p.id ? { ...x, environment } : x,
                  ),
                })
              }
              error={error(`project.${p.id}.environment`)}
            >
              <option value="dev">Entwicklung</option>
              <option value="test">Test</option>
              <option value="staging">Staging</option>
              <option value="prod">Produktion</option>
            </Field>
          </div>
          <p className="field-hint">
            Namenspräfix für Ressourcen:{" "}
            <code>
              {draft.companyCode || "firma"}-lz-{p.code || "projekt"}-
              {p.environment || "dev"}
            </code>
            . Änderungen an Kürzel oder Umgebung können bestehende Ressourcen
            umbenennen oder ersetzen.
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={p.secretsManager}
              onChange={(e) =>
                patch({
                  projects: draft.projects.map((x) =>
                    x.id === p.id
                      ? {
                          ...x,
                          secretsManager: e.target.checked,
                        }
                      : x,
                  ),
                })
              }
            />
            Secrets Manager vorsehen
          </label>
          <p className="field-hint">
            Plant eine eigene Secrets-Manager-Instanz für dieses Projekt ein.
          </p>
          <button
            type="button"
            className="text-button danger"
            onClick={() =>
              patch({
                projects: draft.projects.filter((x) => x.id !== p.id),
              })
            }
          >
            Landing Zone entfernen
            <span className="sr-only">: {p.name}</span>
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="button secondary"
        onClick={() =>
          patch({
            projects: [
              ...draft.projects,
              {
                id: crypto.randomUUID(),
                sourceKey: null,
                key: "",
                name: "",
                code: "",
                owner: draft.owner,
                environment: "dev",
                secretsManager: true,
              },
            ],
          })
        }
      >
        + Landing Zone hinzufügen
      </button>
      <h3 className="subheading">Sandboxes</h3>
      {draft.sandboxes.map((s) => (
        <fieldset className="project-form" key={s.id}>
          <legend>{s.name || "Neue Sandbox"}</legend>
          <div className="form-grid">
            <Field
              id={`sandbox.${s.id}.name`}
              label="Sandbox-Name"
              hint="Name für das separate Projekt zum Experimentieren."
              value={s.name}
              onChange={(name) =>
                patch({
                  sandboxes: draft.sandboxes.map((x) =>
                    x.id === s.id ? { ...x, name } : x,
                  ),
                })
              }
              error={error(`sandbox.${s.id}.name`)}
            />
            <Field
              id={`sandbox.${s.id}.owner`}
              label="Sandbox-Verantwortlich"
              hint="E-Mail-Adresse des in STACKIT registrierten Verantwortlichen für diese Sandbox."
              type="email"
              value={s.owner}
              onChange={(owner) =>
                patch({
                  sandboxes: draft.sandboxes.map((x) =>
                    x.id === s.id ? { ...x, owner } : x,
                  ),
                })
              }
              error={error(`sandbox.${s.id}.owner`)}
            />
          </div>
          <button
            type="button"
            className="text-button danger"
            onClick={() =>
              patch({
                sandboxes: draft.sandboxes.filter((x) => x.id !== s.id),
              })
            }
          >
            Sandbox entfernen
            <span className="sr-only">: {s.name}</span>
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="button secondary"
        onClick={() =>
          patch({
            sandboxes: [
              ...draft.sandboxes,
              {
                id: crypto.randomUUID(),
                sourceIndex: null,
                name: "",
                owner: draft.owner,
              },
            ],
          })
        }
      >
        + Sandbox hinzufügen
      </button>
      {error("projects") && <p className="field-error">{error("projects")}</p>}
      <div className="actions">
        <button type="button" className="button secondary" onClick={onBack}>
          Zurück
        </button>
        <button type="button" className="button primary" onClick={onReview}>
          Entwurf prüfen →
        </button>
      </div>
    </section>
  );
}
