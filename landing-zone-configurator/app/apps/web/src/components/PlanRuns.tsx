import type { PlanSummary } from "@lzc/contracts";
import { useEffect, useState } from "react";
import type { Session } from "./Account";

type Run = {
  id: string;
  preparationId: string;
  status: string;
  summary: PlanSummary | null;
  errorCode: string | null;
  createdAt: string;
};
const active = new Set(["starting", "initializing", "validating", "planning"]);
const labels: Record<string, string> = {
  starting: "Runner wird vorbereitet",
  initializing: "OpenTofu initialisiert",
  validating: "Konfiguration wird validiert",
  planning: "Plan wird berechnet",
  succeeded: "Plan abgeschlossen",
  failed: "Plan fehlgeschlagen",
  cancelled: "Plan abgebrochen",
};
const failures: Record<string, string> = {
  configuration_execution_not_supported:
    "Diese Konfiguration enthält Komponenten, die der Erstbereitstellungsplan noch nicht unterstützt. Wähle eine unterstützte Standalone-Konfiguration.",
  runner_unavailable: "Der Runner konnte nicht gestartet werden.",
  credential_changed:
    "Der Zugang wurde geändert. Erstelle eine neue Vorbereitung.",
  access_check_failed:
    "Der Zugang zur Zielorganisation konnte nicht bestätigt werden.",
  input_invalid:
    "Die festgehaltene Konfiguration konnte nicht bestätigt werden.",
  init_failed: "OpenTofu konnte die Provider nicht initialisieren.",
  validate_failed: "OpenTofu hat die Konfiguration abgewiesen.",
  plan_failed:
    "OpenTofu konnte keinen vollständigen Plan erstellen. Prüfe die Rechte des Zugangs und die Konfiguration.",
  summary_failed: "Das Plan-Ergebnis konnte nicht sicher ausgewertet werden.",
  timed_out: "Die maximale Laufzeit wurde überschritten.",
  plan_already_running: "Es läuft bereits ein Plan in deinem Arbeitsbereich.",
  plan_daily_limit: "Das Tageslimit von 20 Plänen ist erreicht.",
  repository_changed:
    "Der Fork wurde geändert. Erstelle eine neue Vorbereitung.",
  credential_not_found: "Der persönliche Zugang ist nicht mehr verfügbar.",
};
export function PlanRuns({
  session,
  preparations,
}: {
  session: Session;
  preparations: { id: string; name: string; credentialId: string | null }[];
}) {
  const [runs, setRuns] = useState<Run[]>([]),
    [enabled, setEnabled] = useState(false),
    [selected, setSelected] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function refresh(signal?: AbortSignal) {
    const response = await fetch("/api/v1/plans", {
      credentials: "same-origin",
      ...(signal ? { signal } : {}),
    });
    if (response.status === 404) {
      setEnabled(false);
      return;
    }
    if (!response.ok) throw new Error("Pläne konnten nicht geladen werden.");
    const data = await response.json();
    setRuns(data.runs);
    setEnabled(true);
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: fixed endpoint; reset when identity changes.
  useEffect(() => {
    const controller = new AbortController();
    const poll = () =>
      void refresh(controller.signal).catch(() => {
        if (!controller.signal.aborted)
          setError("Pläne konnten nicht geladen werden.");
      });
    poll();
    const timer = setInterval(poll, 5000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [session]);
  async function mutate(path: string, body: unknown) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(path, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-LZC-CSRF": session.csrfToken,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(
          failures[result.error] ??
            "Die Aktion konnte nicht bestätigt werden. Aktualisiere den Status vor einem erneuten Start.",
        );
      }
      await refresh();
      setConfirmed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }
  if (!enabled)
    return <p>Plan-Ausführung ist in dieser Umgebung noch nicht aktiviert.</p>;
  return (
    <section aria-labelledby="plans-title">
      <h3 id="plans-title">Erstbereitstellung planen</h3>
      <p>
        Berechnet die Änderungen für eine neue Landing Zone mit leerem State. Es
        werden keine Cloud-Ressourcen angelegt. Für bestehende oder teilweise
        angelegte Landing Zones ist dieser Ablauf nicht geeignet.
      </p>
      <div className="field">
        <label htmlFor="plan-preparation">Gespeicherte Vorbereitung</label>
        <select
          id="plan-preparation"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setConfirmed(false);
          }}
          disabled={busy}
        >
          <option value="">Bitte auswählen</option>
          {preparations
            .filter((p) => p.credentialId)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </div>
      <label className="field-hint">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          disabled={busy}
        />{" "}
        Ich bestätige: Dies ist eine neue Landing Zone. Für diese Konfiguration
        gibt es noch keine angelegten Ressourcen oder bestehenden State.
      </label>
      <p>
        <button
          className="button primary"
          type="button"
          disabled={
            busy ||
            !selected ||
            !confirmed ||
            runs.some((r) => active.has(r.status))
          }
          onClick={() =>
            void mutate("/api/v1/plans", {
              preparationId: selected,
              confirmNewDeployment: true,
            })
          }
        >
          Erstbereitstellung planen
        </button>
      </p>
      <p className="field-hint">
        Apply ist gesperrt. Dieser Plan dient der Prüfung und kann nicht
        angewendet werden. Vor einem später freigegebenen Apply wird erneut
        geplant.
      </p>
      {error && (
        <p role="alert" className="validation-box">
          {error}
        </p>
      )}
      {runs.map((run) => (
        <article className="project-form" key={run.id}>
          <h4>
            {preparations.find((p) => p.id === run.preparationId)?.name ??
              "Deployment"}
          </h4>
          <p>
            {labels[run.status] ?? "Unbekannter Status"} ·{" "}
            {new Date(run.createdAt).toLocaleString("de-DE")}
          </p>
          {active.has(run.status) && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => void mutate(`/api/v1/plans/${run.id}/cancel`, {})}
            >
              Plan abbrechen
            </button>
          )}
          {run.errorCode && run.status !== "cancelled" && (
            <p className="validation-box">
              {failures[run.errorCode] ?? "Plan fehlgeschlagen."}
            </p>
          )}
          {run.summary && (
            <>
              <p>
                {run.summary.result === "no-changes"
                  ? "Keine Änderungen geplant."
                  : "Änderungen geplant – nichts angewendet."}
              </p>
              <dl className="summary-list">
                <dt>Anlegen</dt>
                <dd>{run.summary.resources.create}</dd>
                <dt>Ändern</dt>
                <dd>{run.summary.resources.update}</dd>
                <dt>Ersetzen</dt>
                <dd>{run.summary.resources.replace}</dd>
                <dt>Löschen</dt>
                <dd>{run.summary.resources.delete}</dd>
                <dt>Daten lesen</dt>
                <dd>{run.summary.resources.read}</dd>
                <dt>Geänderte Ausgaben</dt>
                <dd>{run.summary.changedOutputs}</dd>
              </dl>
              {run.summary.destructive && (
                <p className="validation-box">
                  Der Plan enthält Löschungen oder Ersetzungen.
                </p>
              )}
              {run.summary.completeness !== "complete" && (
                <p className="field-hint">
                  Die Engine bestätigt die Vollständigkeit nicht ausdrücklich.
                  Noch unbekannte Werte können erst bei der Ausführung aufgelöst
                  werden.
                </p>
              )}
              <p className="field-hint">
                Angezeigt werden ausschließlich Aktionszahlen; Ressourcenwerte
                und Secrets bleiben verborgen.
              </p>
            </>
          )}
        </article>
      ))}
    </section>
  );
}
