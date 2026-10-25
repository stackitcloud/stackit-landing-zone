import {
  type ApplicationStateRecoveryView,
  applicationStateRecoveryViewSchema,
} from "@lzc/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { t } from "../i18n";

const phases = {
  requested: "Recovery angefordert",
  assessing: "Cloud-Abgleich läuft",
  blocked: "Recovery benötigt Klärung",
  prepared: "Reparaturvorschlag bereit",
  committing: "State-Reparatur läuft",
  committed: "State-Reparatur abgeschlossen",
  "reconciliation-required": "Ergebnis der State-Reparatur prüfen",
};
const blockers = {
  "runner-not-stopped": "Das Ende des alten Runners ist nicht nachgewiesen.",
  "execution-capability-active":
    "Die alte Ausführungsberechtigung ist noch aktiv.",
  "checkpoint-unavailable":
    "Der Checkpoint konnte nicht sicher gelesen werden.",
  "checkpoint-changed":
    "Der Checkpoint hat sich geändert. Ein neuer Abgleich ist erforderlich.",
  "checkpoint-invalid":
    "Der Checkpoint passt nicht eindeutig zu dieser Bestellung.",
  "cloud-inventory-incomplete":
    "Der Cloud-Abgleich ist unvollständig. Fehlende Antworten gelten nicht als leere Ressourcenlisten.",
  "cloud-project-mismatch":
    "Das Cloud-Projekt passt nicht eindeutig zur gebundenen Bestellung.",
  "cloud-resource-ambiguous":
    "Mindestens eine Cloud-Ressource ist nicht eindeutig zuordenbar.",
  "unsupported-resource":
    "Diese Recovery enthält Ressourcen, für die noch keine geprüfte Übernahme verfügbar ist.",
  "lost-private-material":
    "Ein Schlüssel existiert ohne wiederherstellbares privates Material. Eine getrennte Entscheidung ist erforderlich.",
  "unexpected-plan-change":
    "Die Vorschau würde vorhandene Ressourcen ändern, löschen oder ersetzen. Keine State-Reparatur freigegeben.",
  "source-changed":
    "Die gebundene Quellrevision passt nicht zum verfügbaren Recovery-Runner.",
  "proposal-expired":
    "Der Reparaturvorschlag ist abgelaufen. Bitte einen neuen Abgleich anfordern.",
  "commit-outcome-unknown":
    "Der Abschluss ist unklar. Die State-Änderung wird nicht erneut ausgeführt.",
  "native-recovery-failed":
    "Die native Recovery-Prüfung ist fehlgeschlagen. Es wurde keine Infrastrukturänderung freigegeben.",
};
export function ApplicationStateRecovery({
  jobId,
  send,
  onCommitted,
}: {
  jobId: string;
  send: (
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ) => Promise<unknown>;
  onCommitted: () => Promise<void>;
}) {
  const [recovery, setRecovery] = useState<ApplicationStateRecoveryView | null>(
    null,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [credentialsConfirmed, setCredentialsConfirmed] = useState<
    string | null
  >(null);
  const approvalKey = recovery
    ? `${recovery.id}:${recovery.candidateStateSha256}:${JSON.stringify(recovery.credentialRevocations)}`
    : null;
  const lifetime = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const working = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const notified = useRef<string | null>(null);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (working.current) return;
      const requestGeneration = ++generation.current;
      try {
        const result = z
          .strictObject({
            recovery: applicationStateRecoveryViewSchema.nullable(),
          })
          .parse(await send(`jobs/${jobId}/state-recovery`, undefined, signal));
        if (signal?.aborted || requestGeneration !== generation.current) return;
        setLoaded(true);
        setRecovery(result.recovery);
        setError("");
        if (
          result.recovery?.phase === "committed" &&
          notified.current !== result.recovery.id
        ) {
          notified.current = result.recovery.id;
          await onCommitted();
        }
      } catch (cause) {
        if (!signal?.aborted && requestGeneration === generation.current)
          setError(
            cause instanceof Error
              ? cause.message
              : "Die Recovery-Prüfung ist derzeit nicht verfügbar.",
          );
      }
    },
    [jobId, send, onCommitted],
  );
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    working.current = false;
    setBusy(false);
    setLoaded(false);
    setRecovery(null);
    notified.current = null;
    void load(controller.signal);
    const timer = setInterval(() => {
      void load(controller.signal);
    }, 5000);
    return () => {
      ++generation.current;
      controller.abort();
      clearInterval(timer);
    };
  }, [load]);
  async function act(action: "request" | "assess" | "commit" | "inspect") {
    if (working.current) return;
    working.current = true;
    ++generation.current;
    setBusy(true);
    setError("");
    setConfirmed(null);
    setCredentialsConfirmed(null);
    const signal = lifetime.current?.signal;
    try {
      const path =
        action === "request"
          ? `jobs/${jobId}/state-recovery`
          : `state-recoveries/${recovery?.id}/${action}`;
      const body =
        action === "request"
          ? {
              idempotencyKey: crypto.randomUUID(),
              confirmReadOnlyAssessment: true,
            }
          : action === "assess"
            ? { confirmReadOnlyAssessment: true }
            : action === "inspect"
              ? {}
              : {
                  originalStateSha256: recovery?.originalStateSha256,
                  candidateStateSha256: recovery?.candidateStateSha256,
                  confirmCredentialRevocations:
                    recovery?.credentialRevocations ?? [],
                  confirmStateRepair: true,
                  confirmExactOrphanLockRelease: true,
                  confirmFreshPlanRequired: true,
                };
      const result = applicationStateRecoveryViewSchema.parse(
        await send(path, body, signal),
      );
      if (!signal?.aborted) {
        setRecovery(result);
        if (result.phase === "committed" && notified.current !== result.id) {
          notified.current = result.id;
          await onCommitted();
        }
      }
    } catch (cause) {
      if (!signal?.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Die Recovery-Prüfung ist derzeit nicht verfügbar.",
        );
    } finally {
      if (!signal?.aborted) {
        working.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <section
      className="application-state-recovery"
      aria-label={t("Geführte Application-Recovery")}
    >
      <h4>{t("Geführte Application-Recovery")}</h4>
      <p>
        {t(
          "Cloud-Ressourcen und Checkpoint werden abgeglichen. Ein Reparaturvorschlag wird zunächst in einer geschützten State-Kopie vorbereitet; ein Infrastruktur-Apply wird nicht gestartet.",
        )}
      </p>
      {error && <p role="alert">{t(error)}</p>}
      {!recovery && (
        <button
          type="button"
          className="button secondary"
          disabled={busy || !loaded}
          onClick={() => void act("request")}
        >
          {t("Recovery anfordern")}
        </button>
      )}
      {recovery && (
        <>
          <p role="status">{t(phases[recovery.phase])}</p>
          {recovery.phase === "requested" && !recovery.canAssess && (
            <p>
              {t(
                "Der zuständige Platform Owner kann den Cloud-Abgleich hier starten. Zugangsdaten oder State-Dateien müssen nicht weitergegeben werden.",
              )}
            </p>
          )}
          {recovery.canAssess && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => void act("assess")}
            >
              {t("Cloud-Abgleich starten")}
            </button>
          )}
          {recovery.blockers.map((b) => (
            <p role="alert" key={b}>
              {t(blockers[b])}
            </p>
          ))}
          {recovery.preview && (
            <>
              <dl className="application-properties">
                <dt>{t("Vorhandene Ressourcen erhalten")}</dt>
                <dd>{recovery.preview.unchanged}</dd>
                <dt>{t("Im nächsten Plan noch anzulegen")}</dt>
                <dd>{recovery.preview.create}</dd>
                <dt>{t("State-Serial")}</dt>
                <dd>
                  {recovery.originalSerial} → {recovery.candidateSerial}
                </dd>
                <dt>{t("Ursprünglicher State-SHA256")}</dt>
                <dd>{recovery.originalStateSha256}</dd>
                <dt>{t("Geprüfte verwaiste Sperre")}</dt>
                <dd>{recovery.orphanLockId ?? t("Keine Sperre")}</dd>
                <dt>{t("Geprüfter State-SHA256")}</dt>
                <dd>{recovery.candidateStateSha256}</dd>
              </dl>
              <p>
                {t(
                  "Diese Vorschau ist kein freigegebener Apply-Plan. Der alte Plan wird nicht erneut verwendet.",
                )}
              </p>
              <ul>
                {recovery.imports.map((i) => (
                  <li key={i.address}>
                    <code>{i.address}</code>
                    <br />
                    <code>{i.resourceId}</code>
                  </li>
                ))}
              </ul>
            </>
          )}
          {recovery.credentialRevocations.length > 0 && (
            <div role="note">
              <p>
                {t(
                  "Diese Zugänge existieren ohne gespeichertes Geheimnis. Mit der Freigabe werden ausschließlich die folgenden Zugänge widerrufen. Ersatz wird erst durch einen neuen geprüften Plan und Apply erstellt.",
                )}
              </p>
              <ul>
                {recovery.credentialRevocations.map((r) => (
                  <li key={`${r.kind}-${r.keyId}`}>
                    <code>{r.address}</code>
                    <br />
                    <code>
                      {r.accountEmail ?? r.groupId} / {r.keyId}
                    </code>
                    {r.discardIncompleteState && (
                      <p>
                        {t(
                          "Der unvollständige State-Eintrag dieses Zugangs wird ebenfalls entfernt. Andere State-Einträge bleiben erhalten.",
                        )}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {recovery.canCommit && (
            <fieldset disabled={busy}>
              <legend>{t("State-Reparatur freigeben")}</legend>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed !== null && confirmed === approvalKey}
                  onChange={(e) =>
                    setConfirmed(e.target.checked ? approvalKey : null)
                  }
                />
                {t(
                  "Ich habe den Vorschlag geprüft. Die aufgeführten bestehenden Ressourcen dürfen in den State übernommen und ausschließlich die geprüfte verwaiste Sperre gelöst werden. Danach ist ein neuer Plan derselben Bestellung erforderlich; ein Apply wird nicht freigegeben.",
                )}
              </label>
              {recovery.credentialRevocations.length > 0 && (
                <label>
                  <input
                    type="checkbox"
                    checked={
                      credentialsConfirmed !== null &&
                      credentialsConfirmed === approvalKey
                    }
                    onChange={(e) =>
                      setCredentialsConfirmed(
                        e.target.checked ? approvalKey : null,
                      )
                    }
                  />
                  {t(
                    "Ich bestätige den gezielten Widerruf und das angezeigte Entfernen unvollständiger State-Einträge. Vollständig gespeicherte Zugänge bleiben erhalten.",
                  )}
                </label>
              )}
              <button
                type="button"
                className="button secondary"
                disabled={
                  (recovery.credentialRevocations.length > 0 &&
                    credentialsConfirmed !== approvalKey) ||
                  !confirmed ||
                  confirmed !== approvalKey ||
                  busy
                }
                onClick={() => void act("commit")}
              >
                {t("Geprüfte State-Reparatur ausführen")}
              </button>
            </fieldset>
          )}
          {recovery.phase === "committed" && (
            <p>
              {t(
                "Die vorhandenen Ressourcen sind im State erfasst und die Sperre ist frei. Du kannst dieselbe Bestellung jetzt neu planen. Prüfe den neuen Plan vor einem Apply.",
              )}
            </p>
          )}
          {recovery.canInspect && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => void act("inspect")}
            >
              {t("Unterbrochene Recovery prüfen")}
            </button>
          )}
          {(recovery.phase === "blocked" ||
            (["requested", "prepared"].includes(recovery.phase) &&
              Date.parse(recovery.expiresAt) <= Date.now())) && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => void act("request")}
            >
              {t("Neuen Recovery-Abgleich anfordern")}
            </button>
          )}
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => void load(lifetime.current?.signal)}
          >
            {t("Recovery-Status aktualisieren")}
          </button>
        </>
      )}
    </section>
  );
}
