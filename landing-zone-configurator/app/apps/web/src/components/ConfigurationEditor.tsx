import {
  buildConfiguration,
  type ConfigurationDraft,
  type Template,
  validateDraft,
} from "@lzc/domain";
import { useState } from "react";
import { Field } from "./Field";
import { ProjectsStep } from "./ProjectsStep";
import { Topology } from "./Topology";

type Step = "basics" | "projects" | "review";
const steps: { id: Step; title: string }[] = [
  { id: "basics", title: "Grundlagen" },
  { id: "projects", title: "Projekte" },
  { id: "review", title: "Prüfen" },
];

function issueLabel(field: string, draft: ConfigurationDraft): string {
  const labels: Record<string, string> = {
    name: "Name",
    company: "Unternehmen",
    companyCode: "Unternehmenskürzel",
    organization: "Organisations-ID",
    owner: "Verantwortlich",
    region: "Region",
    projects: "Projekte",
    key: "Kennung",
    code: "Projektkürzel",
    environment: "Umgebung",
  };
  const [kind, id, property] = field.split(".");
  if (property) {
    const item =
      kind === "project"
        ? draft.projects.find((p) => p.id === id)
        : draft.sandboxes.find((s) => s.id === id);
    return `${item?.name || (kind === "project" ? "Landing Zone" : "Sandbox")} · ${labels[property] || property}`;
  }
  return labels[field] || field;
}

export function ConfigurationEditor({
  template,
  draft,
  onChange,
}: {
  template: Template;
  draft: ConfigurationDraft;
  onChange: (draft: ConfigurationDraft) => void;
}) {
  const [step, setStep] = useState<Step>("basics");
  const [showErrors, setShowErrors] = useState(false);
  const [notice, setNotice] = useState("");
  const issues = validateDraft(draft);
  const values = buildConfiguration(template, draft);
  const error = (field: string) =>
    showErrors ? issues.find((i) => i.field === field)?.message : undefined;
  const patch = (update: Partial<ConfigurationDraft>) => {
    onChange({ ...draft, ...update });
    setNotice("");
  };
  const focusIssue = (field: string) => {
    setStep(
      field.startsWith("project") || field.startsWith("sandbox")
        ? "projects"
        : "basics",
    );
    requestAnimationFrame(() => document.getElementById(field)?.focus());
  };
  const review = () => {
    setShowErrors(true);
    setStep("review");
  };
  const download = () => {
    if (issues.length) {
      setShowErrors(true);
      const first = issues[0];
      if (first) focusIssue(first.field);
      return;
    }
    const source = template;
    const file = new Blob(
      [
        JSON.stringify(
          {
            schemaVersion: 1,
            kind: "landing-zone-configurator-draft",
            name: draft.name,
            template: {
              id: source.id,
              source: source.source,
              sha256: source.sha256,
            },
            configuration: buildConfiguration(source, draft),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "landing-zone.lzc.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(
      "Der Entwurf wurde zum Download bereitgestellt. Er ist noch nicht im Fork gespeichert.",
    );
  };

  return (
    <>
      <div className="draft-banner">
        <span>
          Der Entwurf bleibt bis zum Neuladen in diesem Tab. Du kannst ihn nach
          der Prüfung herunterladen.
        </span>
        <span>GitHub-Speicherung folgt</span>
      </div>
      <nav aria-label="Konfigurationsschritte" className="steps">
        {steps.map((item, index) => (
          <button
            type="button"
            key={item.id}
            aria-current={step === item.id ? "step" : undefined}
            className={step === item.id ? "step active" : "step"}
            onClick={() => {
              setStep(item.id);
              if (item.id === "review") setShowErrors(true);
            }}
          >
            <span>{index + 1}</span>
            {item.title}
          </button>
        ))}
      </nav>
      <div className="editor-layout">
        <div>
          {step === "basics" && (
            <section className="panel">
              <div className="section-heading">
                <h2>Grundlagen</h2>
                <span className="muted">* Pflichtfelder</span>
              </div>
              <p className="section-description">
                Wer betreibt diese Landing Zone und wo soll sie entstehen?
              </p>
              <div className="form-grid">
                <Field
                  id="name"
                  label="Name der Konfiguration"
                  value={draft.name}
                  onChange={(name) => patch({ name })}
                  error={error("name")}
                />
                <Field
                  id="company"
                  label="Organisation / Unternehmen"
                  value={draft.company}
                  onChange={(company) => patch({ company })}
                  error={error("company")}
                />
                <Field
                  id="companyCode"
                  label="Unternehmenskürzel"
                  value={draft.companyCode}
                  onChange={(companyCode) => patch({ companyCode })}
                  error={error("companyCode")}
                  hint="Wird als Präfix für Ressourcennamen verwendet."
                />
                <Field
                  id="owner"
                  label="Technisch verantwortlich"
                  type="email"
                  value={draft.owner}
                  onChange={(owner) => patch({ owner })}
                  error={error("owner")}
                  hint="E-Mail-Adresse des in STACKIT registrierten Verantwortlichen."
                />
                <Field
                  id="organization"
                  label="STACKIT Organisations-ID"
                  value={draft.organization}
                  onChange={(organization) => patch({ organization })}
                  error={error("organization")}
                  hint="Die ID findest du in den Organisationsdetails im STACKIT Portal."
                />
                <Field
                  id="region"
                  label="Region"
                  value={draft.region}
                  onChange={(region) => patch({ region })}
                  error={error("region")}
                >
                  <option value="eu01">eu01</option>
                  <option value="eu02">eu02</option>
                </Field>
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="button primary"
                  onClick={() => {
                    setShowErrors(true);
                    setStep("projects");
                  }}
                >
                  Weiter zu Projekten →
                </button>
              </div>
            </section>
          )}
          {step === "projects" && (
            <ProjectsStep
              draft={draft}
              patch={patch}
              error={error}
              onBack={() => setStep("basics")}
              onReview={review}
            />
          )}
          {step === "review" && (
            <section className="panel">
              <h2>Entwurf prüfen</h2>
              {issues.length ? (
                <div className="validation-box" role="alert">
                  <h3>{issues.length} Angaben bitte prüfen</h3>
                  <ul>
                    {issues.map((issue) => (
                      <li key={issue.field}>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => focusIssue(issue.field)}
                        >
                          {issueLabel(issue.field, draft)}: {issue.message}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="success-banner" role="status">
                  Die Eingaben sind vollständig und formal gültig.
                </div>
              )}
              <dl className="summary-list">
                <dt>Organisation</dt>
                <dd>{draft.company}</dd>
                <dt>Region</dt>
                <dd>{draft.region}</dd>
                <dt>Landing Zones</dt>
                <dd>{draft.projects.length}</dd>
                <dt>Sandboxes</dt>
                <dd>{draft.sandboxes.length}</dd>
                <dt>Vorlage</dt>
                <dd>Standalone</dd>
              </dl>
              <p>
                Der Download enthält deinen Konfigurationsentwurf.
                Berechtigungen, Dienstverfügbarkeit und die tatsächliche
                Ressourcenplanung werden erst beim späteren Deployment geprüft.
              </p>
              <div className="actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setStep("projects")}
                >
                  Zurück
                </button>
                <button
                  type="button"
                  className="button primary"
                  onClick={download}
                >
                  Entwurf herunterladen
                </button>
              </div>
              <p className="muted">
                Speichern im GitHub-Fork und Deployment werden mit der Anmeldung
                ergänzt.
              </p>
              <p role="status">{notice}</p>
              <details className="technical">
                <summary>Konfigurationsdaten ansehen</summary>
                <pre>{JSON.stringify(values, null, 2)}</pre>
              </details>
            </section>
          )}
        </div>
        <Topology values={values} />
      </div>
    </>
  );
}
