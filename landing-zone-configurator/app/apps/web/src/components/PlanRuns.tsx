import {
  type PlanSummary,
  type PlatformCheckpoint,
  platformCheckpointSchema,
  type S3BackendDescriptor,
} from "@lzc/contracts";
import { platformContractSchema } from "@lzc/domain";
import { useEffect, useRef, useState } from "react";
import { currentLanguage, t } from "../i18n";
import type { DeploymentStep } from "../navigation";
import type { Session } from "./Account";

type Run = {
  id: string;
  preparationId: string;
  status: string;
  summary: PlanSummary | null;
  errorCode: string | null;
  createdAt: string;
  finishedAt?: string | null;
  operation?: "plan" | "apply";
  planId?: string;
  artifactSha256?: string;
  applyAllowed?: boolean;
  expiresAt?: string | null;
  stateBackend?: S3BackendDescriptor | null;
};
const active = new Set([
  "starting",
  "initializing",
  "validating",
  "planning",
  "applying",
]);
const contractExportFailures: Record<string, string> = {
  platform_contract_unavailable:
    "Für die aktuelle State-Version ist kein gültiger Plattformvertrag eines erfolgreichen Apply verfügbar. Es wurden keine State-Daten exportiert.",
  state_failed:
    "Der aktuelle State konnte nicht sicher gelesen werden. Prüfe den Backend-Zugang und ausstehende Wiederherstellungsschritte. Es wurden keine State-Daten exportiert.",
};
const labels: Record<string, string> = {
  starting: "Runner wird vorbereitet",
  initializing: "OpenTofu initialisiert",
  validating: "Konfiguration wird validiert",
  planning: "Plan wird berechnet",
  succeeded: "Plan abgeschlossen",
  failed: "Plan fehlgeschlagen",
  cancelled: "Plan abgebrochen",
  applying: "Änderungen werden angewendet",
  recovery_required: "Wiederherstellung erforderlich",
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
  stale_plan:
    "Der Plan ist nicht mehr aktuell. Erstelle und prüfe einen neuen Plan.",
  plan_stale:
    "Der Plan ist nicht mehr aktuell. Erstelle und prüfe einen neuen Plan.",
  plan_expired: "Der Plan ist abgelaufen. Erstelle und prüfe einen neuen Plan.",
  expired: "Der Plan ist abgelaufen. Erstelle und prüfe einen neuen Plan.",
  state_changed:
    "Der State wurde geändert. Erstelle und prüfe einen neuen Plan.",
  backend_state_missing:
    "Im gewählten S3-Backend fehlt der State. Starte für eine bestehende Landing Zone keinen Bootstrap.",
  backend_read_failed:
    "Der S3-State ist nicht lesbar. Prüfe den Backend-Zugang.",
  backend_binding_changed:
    "Die Backend-Zuordnung stimmt nicht mehr. Erstelle eine neue Vorbereitung.",
  legacy_state_migration_required:
    "Ein bisheriger Konfigurator-State muss zuerst explizit übernommen werden. Es wird kein neuer State angelegt.",
  state_failed:
    "State-Sicherung oder Backend-Migration fehlgeschlagen. Prüfe die Wiederherstellung vor weiteren Aktionen.",
  invalid_request:
    "Die Freigabe wurde abgewiesen. Prüfe Plan-Prüfsumme und Zielorganisation.",
  invalid_plan_request:
    "Die Freigabe wurde abgewiesen. Prüfe Plan-Prüfsumme und Zielorganisation.",
  invalid_request_origin_or_csrf:
    "Die Sitzung ist nicht mehr aktuell. Bitte erneut anmelden und den Plan prüfen.",
  authentication_required: "Bitte erneut anmelden und den Plan prüfen.",
  apply_not_allowed: "Der Server erlaubt Apply für diesen Plan nicht.",
  apply_unavailable: "Apply ist in dieser Umgebung nicht verfügbar.",
  execution_disabled: "Apply ist in dieser Umgebung nicht aktiviert.",
  initial_plan_requires_empty_state:
    "Eine bestehende Bereitstellung oder ein State-Backend benötigt den statefähigen Plan-Runner. Ein backendloser Erstplan ist gesperrt.",
  plan_not_approvable:
    "Der Plan ist nicht mehr freigabefähig: abgelaufen, geändert oder bereits verwendet. Prüfe den Ausführungsstatus und erstelle bei Bedarf einen neuen Plan.",
  organization_mismatch:
    "Die Zielorganisation stimmt nicht mit der gespeicherten Vorbereitung überein. Prüfe die exakte Organisations-ID.",
  artifact_invalid:
    "Das gespeicherte Plan-Artefakt konnte nicht bestätigt werden. Erstelle und prüfe einen neuen Plan.",
  runner_package_changed:
    "Der Runner wurde aktualisiert. Erstelle und prüfe einen neuen Plan, bevor du Apply freigibst.",
  state_locked:
    "Der State ist durch eine andere Ausführung gesperrt. Prüfe den Ausführungsstatus.",
  apply_already_started:
    "Dieser Plan wurde bereits für Apply verwendet. Prüfe den Ausführungsstatus.",
  apply_failed:
    "Apply ist fehlgeschlagen. Ressourcen können bereits verändert worden sein. Prüfe den Ausführungsstatus vor weiteren Aktionen.",
  recovery_required:
    "Die Ausführung benötigt Wiederherstellung. Ressourcen können bereits verändert worden sein. Kein erneutes Apply starten.",
};
type Preparation = {
  id: string;
  name: string;
  credentialId: string | null;
  manifest: {
    organization: { id: string; name: string };
    source?: {
      configurationId?: string;
      revision?: number;
      commit?: string;
    };
  };
};

function PlanOutput({ run }: { run: Run }) {
  const running = active.has(run.status);
  const [expanded, setExpanded] = useState(running);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [now, setNow] = useState(Date.now);
  const [follow, setFollow] = useState(true);
  const consoleRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (text && follow && running && consoleRef.current)
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [text, follow, running]);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + 20 * 60 * 1000;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/v1/plans/${run.id}/output`, {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(
            response.status === 401
              ? "Bitte erneut anmelden."
              : response.status === 403
                ? "Keine Berechtigung für diese Ausgabe."
                : "Die OpenTofu-Ausgabe ist momentan nicht verfügbar.",
          );
        const result = await response.json();
        if (
          typeof result.text !== "string" ||
          result.text.length > 3 * 1024 * 1024 ||
          typeof result.truncated !== "boolean"
        )
          throw new Error(
            "Die OpenTofu-Ausgabe konnte nicht bestätigt werden.",
          );
        if (controller.signal.aborted) return;
        if (
          result.text ||
          result.kind === "saved-plan" ||
          result.kind === "execution"
        )
          setText(result.text);
        setTruncated(result.truncated);
        setError("");
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Ausgabe nicht verfügbar.",
          );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          if (running && Date.now() < deadline)
            timer = setTimeout(() => void load(), 2000);
        }
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [expanded, run.id, running]);
  const seconds = Math.max(
    0,
    Math.floor((now - Date.parse(run.createdAt)) / 1000),
  );
  return (
    <details
      className="plan-output"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>{t("OpenTofu-Ausgabe")}</summary>
      {running && (
        <p className="field-hint" role="status">
          {t(labels[run.status])} ·{" "}
          <span role="timer" aria-live="off">
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </span>
        </p>
      )}
      {running && (
        <label className="field-hint">
          <input
            type="checkbox"
            checked={follow}
            onChange={(event) => setFollow(event.target.checked)}
          />{" "}
          {t("Ausgabe folgen")}
        </label>
      )}
      {loading && !text && (
        <p role="status">{t("OpenTofu-Ausgabe wird geladen…")}</p>
      )}
      {error && (
        <p role="alert" className="validation-box">
          {t(error)}
        </p>
      )}
      {text ? (
        <textarea
          ref={consoleRef}
          className="plan-console"
          readOnly
          rows={22}
          value={text}
          aria-label={t("OpenTofu-Ausgabe")}
          onScroll={(event) => {
            const element = event.currentTarget;
            setFollow(
              element.scrollHeight - element.scrollTop - element.clientHeight <=
                32,
            );
          }}
        />
      ) : (
        !loading &&
        !error && (
          <p className="field-hint">
            {t("Noch keine OpenTofu-Ausgabe vorhanden.")}
          </p>
        )
      )}
      {truncated && (
        <p className="validation-box">
          {t("Die Ausgabe wurde wegen ihrer Größe begrenzt.")}
        </p>
      )}
    </details>
  );
}

const checkpointFailures: Record<string, string> = {
  migration_verification_failed:
    "Der S3-State stimmt nicht mit dem Bootstrap-Checkpoint überein. Die Migration bleibt gesperrt; keinen erneuten Apply starten.",
  migration_not_ready:
    "Die offene Backend-Migration ist diesem Apply nicht eindeutig zugeordnet. Ein gesonderter State-Abgleich ist erforderlich.",
  state_invalid:
    "Der Bootstrap- oder S3-State konnte nicht als gültiger State gelesen werden. Die Migration bleibt gesperrt.",
  checkpoint_invalid:
    "Die Ressourcen im Bootstrap-Checkpoint konnten nicht sicher ausgewertet werden.",
  checkpoint_not_available:
    "Für diesen Apply ist kein prüfbarer Bootstrap-Checkpoint verfügbar. Aktualisiere den Ausführungsstatus.",
  checkpoint_unavailable:
    "Die Checkpoint-Prüfung ist in dieser Umgebung nicht verfügbar.",
  backend_credentials_invalid:
    "Der gespeicherte S3-Zugang konnte nicht gelesen werden. Die Migration bleibt gesperrt.",
  backend_not_found:
    "Das zugeordnete S3-Backend ist nicht verfügbar. Die Migration bleibt gesperrt.",
  state_changed: "Der Checkpoint wurde geändert. Prüfe ihn erneut.",
  stale_tenant_context:
    "Der Arbeitsbereich wurde geändert. Lade die Seite neu und prüfe den Checkpoint erneut.",
  plan_request_failed:
    "Der Server konnte die Checkpoint-Prüfung nicht abschließen. Der bestehende State bleibt gesichert.",
};

function CheckpointReview({
  runId,
  session,
  onReconciled,
}: {
  runId: string;
  session: Session;
  onReconciled: () => Promise<void>;
}) {
  const [checkpoint, setCheckpoint] = useState<PlatformCheckpoint | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function perform(action: "checkpoint" | "reconcile") {
    if (
      pending.current ||
      (action === "reconcile" &&
        (!confirmed || !(checkpoint?.canResume || checkpoint?.migration)))
    )
      return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    setConfirmed(false);
    let failure = "Checkpoint-Prüfung oder Freigabe fehlgeschlagen.";
    try {
      const response = await fetch(
        `/api/v1/plans/${encodeURIComponent(runId)}/${action}`,
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            "x-lzc-csrf": session.csrfToken,
            "x-lzc-tenant": session.tenant?.id ?? "",
          },
          body: JSON.stringify(
            action === "checkpoint"
              ? {}
              : checkpoint?.migration
                ? {
                    confirmCompleteMigration: true,
                    stateVersion: checkpoint.stateVersion,
                    checkpointSha256: checkpoint.checkpointSha256,
                    remoteIdentity: checkpoint.migration.remoteIdentity,
                  }
                : {
                    confirmRetainState: true,
                    stateVersion: checkpoint?.stateVersion,
                    checkpointSha256: checkpoint?.checkpointSha256,
                  },
          ),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        failure =
          result.error === "checkpoint_changed"
            ? "Der Checkpoint wurde geändert. Prüfe ihn erneut."
            : result.error === "reconciliation_not_available"
              ? "Dieser Recovery-Fall benötigt einen gesonderten State-Abgleich."
              : (checkpointFailures[result.error] ??
                failures[result.error] ??
                "Checkpoint-Prüfung oder Freigabe fehlgeschlagen.");
        throw new Error(failure);
      }
      if (controller.signal.aborted) return;
      if (action === "checkpoint") {
        failure =
          "Die Checkpoint-Antwort konnte nicht sicher ausgewertet werden. Lade die Seite neu; keinen erneuten Apply starten.";
        setCheckpoint(platformCheckpointSchema.parse(result));
      } else {
        if (result.id !== runId || result.reconciled !== true)
          throw new Error("Checkpoint-Prüfung oder Freigabe fehlgeschlagen.");
        await onReconciled();
      }
    } catch {
      if (!controller.signal.aborted) {
        setCheckpoint(null);
        setError(failure);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      pending.current = null;
    }
  }
  return (
    <section aria-label={t("Recovery-Abgleich")}>
      <h5>{t("Recovery-Abgleich")}</h5>
      <button
        type="button"
        className="button secondary"
        disabled={busy}
        onClick={() => void perform("checkpoint")}
      >
        {t("Checkpoint prüfen")}
      </button>
      {error && (
        <p role="alert" className="validation-box">
          {t(error)}
        </p>
      )}
      {checkpoint && (
        <>
          <dl className="summary-list">
            <dt>{t("Apply-ID")}</dt>
            <dd>
              <code>{runId}</code>
            </dd>
            <dt>{t("State-Version")}</dt>
            <dd>{checkpoint.stateVersion}</dd>
            <dt>Checkpoint-SHA256</dt>
            <dd>
              <code>{checkpoint.checkpointSha256}</code>
            </dd>
            <dt>{t("State-Serial")}</dt>
            <dd>{checkpoint.serial}</dd>
            <dt>{t("State-Lock")}</dt>
            <dd>{t(checkpoint.lockHeld ? "Gesperrt" : "Frei")}</dd>
            <dt>{t("Offene Backend-Migration")}</dt>
            <dd>{t(checkpoint.pendingMigration ? "Ja" : "Nein")}</dd>
            <dt>{t("Separater Recovery-State")}</dt>
            <dd>
              {t(
                checkpoint.recoveryAvailable ? "Vorhanden" : "Nicht vorhanden",
              )}
            </dd>
          </dl>
          {checkpoint.migration && (
            <dl className="summary-list">
              <dt>{t("S3-Abgleich")}</dt>
              <dd>{t("Übereinstimmend")}</dd>
              <dt>{t("S3-State-Serial")}</dt>
              <dd>{checkpoint.migration.serial}</dd>
              <dt>{t("Lineage erhalten")}</dt>
              <dd>
                {t(checkpoint.migration.lineagePreserved ? "Ja" : "Nein")}
              </dd>
              <dt>{t("S3-Prüfstand")}</dt>
              <dd>
                <code>{checkpoint.migration.remoteIdentity}</code>
              </dd>
            </dl>
          )}
          <ul>
            {checkpoint.resources.map((resource) => (
              <li key={`${resource.mode}:${resource.type}`}>
                <code>{resource.type}</code> ({resource.mode}):{" "}
                {resource.instances} · {t("Ersetzte Instanzen")}:{" "}
                {resource.deposedInstances}
              </li>
            ))}
          </ul>
          {!checkpoint.canResume && !checkpoint.migration ? (
            <p className="validation-box">
              {t(
                "Dieser Recovery-Fall benötigt einen gesonderten State-Abgleich.",
              )}
            </p>
          ) : (
            <>
              <label className="field-hint">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />{" "}
                {t(
                  checkpoint.migration
                    ? "Ich habe den S3-Abgleich geprüft und bestätige die Umstellung auf diesen S3-State ohne erneuten Apply."
                    : "Ich habe den Checkpoint geprüft und bestätige, dass der bestehende State unverändert erhalten bleibt.",
                )}
              </label>
              <button
                type="button"
                className="button primary"
                disabled={busy || !confirmed}
                onClick={() => void perform("reconcile")}
              >
                {t(
                  checkpoint.migration
                    ? "Backend-Migration bestätigen"
                    : "Erneute Planung freigeben",
                )}
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}

function PlanReview({
  run,
  preparation,
  busy,
  blocked,
  sessionExpiresAt,
  onApply,
}: {
  run: Run;
  preparation: Preparation | undefined;
  busy: boolean;
  blocked: boolean;
  sessionExpiresAt: string;
  onApply: (organizationId: string) => void;
}) {
  const [reviewed, setReviewed] = useState(false);
  const [organizationId, setOrganizationId] = useState("");
  const [destructiveReviewed, setDestructiveReviewed] = useState(false);
  const [expired, setExpired] = useState(false);
  const organization = preparation?.manifest.organization;
  const expiry = Date.parse(run.expiresAt ?? "");
  const deadline = Math.min(expiry, Date.parse(sessionExpiresAt));
  useEffect(() => {
    setExpired(!Number.isFinite(deadline) || deadline <= Date.now());
    if (!Number.isFinite(deadline) || deadline <= Date.now()) return;
    const timer = setTimeout(
      () => setExpired(true),
      Math.min(deadline - Date.now(), 2147483647),
    );
    return () => clearTimeout(timer);
  }, [deadline]);
  const destructive = Boolean(
    run.summary?.destructive ||
      (run.summary?.resources.delete ?? 0) > 0 ||
      (run.summary?.resources.replace ?? 0) > 0,
  );
  const allowed =
    run.applyAllowed === true &&
    !expired &&
    deadline > Date.now() &&
    !blocked &&
    Boolean(
      organization &&
        preparation?.credentialId &&
        run.summary &&
        /^[a-fA-F0-9]{64}$/.test(run.artifactSha256 ?? ""),
    );
  return (
    <section aria-label={t("Plan prüfen und freigeben")}>
      <h5>{t("Plan prüfen und freigeben")}</h5>
      <dl className="summary-list">
        <dt>{t("Zielorganisation")}</dt>
        <dd className="credential-account">
          {organization?.id ?? t("Nicht verfügbar")}
        </dd>
        <dt>{t("Plan-Prüfsumme (SHA-256)")}</dt>
        <dd className="credential-account">
          {run.artifactSha256 ?? t("Nicht verfügbar")}
        </dd>
        <dt>{t("State-Backend")}</dt>
        <dd className="credential-account">
          {run.stateBackend
            ? `${run.stateBackend.bucket} / ${run.stateBackend.key}`
            : t("Bootstrap")}
        </dd>
        <dt>{t("Gültig bis")}</dt>
        <dd>
          {Number.isFinite(expiry)
            ? new Date(expiry).toLocaleString(
                currentLanguage() === "de" ? "de-DE" : "en-GB",
              )
            : t("Keine Gültigkeit bestätigt")}
        </dd>
      </dl>
      {destructive && (
        <p role="alert" className="validation-box">
          {t(
            "Achtung: Dieser Plan löscht oder ersetzt Ressourcen. Daten können unwiederbringlich verloren gehen.",
          )}
        </p>
      )}
      {!allowed && (
        <p className="field-hint">
          {blocked
            ? t(
                "Freigabe gesperrt. Prüfe den Ausführungsstatus und erstelle bei Bedarf einen neuen Plan.",
              )
            : Date.parse(sessionExpiresAt) <= Date.now()
              ? t(
                  "Sitzung abgelaufen. Bitte erneut anmelden und den Plan prüfen.",
                )
              : expired
                ? t(
                    "Plan abgelaufen oder keine Gültigkeit bestätigt. Erstelle einen neuen Plan.",
                  )
                : run.summary?.completeness === "not-reported"
                  ? t(
                      "Apply ist gesperrt: Der Plan enthält keinen bestätigten Vollständigkeitsnachweis der Engine.",
                    )
                  : t(
                      "Apply ist für diesen Plan nicht vom Server freigegeben oder die Plan-Nachweise sind unvollständig.",
                    )}
        </p>
      )}
      {allowed && (
        <>
          <label className="field-hint">
            <input
              type="checkbox"
              checked={reviewed}
              disabled={busy}
              onChange={(event) => setReviewed(event.target.checked)}
            />{" "}
            {t("Änderungen und Zielorganisation geprüft")}
          </label>
          <div className="field">
            <label htmlFor={`apply-organization-${run.id}`}>
              {t("Zielorganisation UUID bestätigen")}
            </label>
            <input
              id={`apply-organization-${run.id}`}
              value={organizationId}
              disabled={busy}
              autoComplete="off"
              onChange={(event) => setOrganizationId(event.target.value)}
            />
          </div>
          {destructive && (
            <label className="field-hint">
              <input
                type="checkbox"
                checked={destructiveReviewed}
                disabled={busy}
                onChange={(event) =>
                  setDestructiveReviewed(event.target.checked)
                }
              />{" "}
              {t("Löschungen und Ersetzungen ausdrücklich freigegeben")}
            </label>
          )}
          <p>
            {t(
              "Apply verändert Cloud-Ressourcen in der angegebenen Zielorganisation.",
            )}
          </p>
          <button
            type="button"
            className="button primary"
            disabled={
              busy ||
              !reviewed ||
              organizationId !== organization?.id ||
              (destructive && !destructiveReviewed)
            }
            onClick={() => {
              if (
                !allowed ||
                busy ||
                deadline <= Date.now() ||
                !reviewed ||
                organizationId !== organization?.id ||
                (destructive && !destructiveReviewed)
              )
                return;
              setReviewed(false);
              setOrganizationId("");
              setDestructiveReviewed(false);
              onApply(organizationId);
            }}
          >
            {t("Freigegebenen Plan anwenden")}
          </button>
        </>
      )}
    </section>
  );
}
export function PlanRuns({
  session,
  preparations,
  selectionKey,
  readOnly = false,
  scopeToPreparations = false,
  phase = "plan",
  preparationId = "",
  onPreparationChange,
  onStep,
}: {
  session: Session;
  preparations: Preparation[];
  selectionKey: string;
  readOnly?: boolean;
  scopeToPreparations?: boolean;
  phase?: DeploymentStep;
  preparationId?: string;
  onPreparationChange?: (id: string) => void;
  onStep?: ((step: DeploymentStep) => void) | undefined;
}) {
  const [runs, setRuns] = useState<Run[]>([]),
    [enabled, setEnabled] = useState(false),
    [selected, setSelected] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [blocked, setBlocked] = useState<string[]>([]);
  const pending = useRef(false);
  const [now, setNow] = useState(Date.now);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const scope = `${JSON.stringify(session)}:${selectionKey}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  function reviewKey(run: Run) {
    const preparation = preparations.find(
      (item) => item.id === run.preparationId,
    );
    return `${scope}:${selected}:${run.id}:${run.artifactSha256 ?? ""}:${run.expiresAt ?? ""}:${run.applyAllowed}:${preparation?.credentialId}:${preparation?.manifest.organization.id}:${JSON.stringify(run.stateBackend)}`;
  }
  async function refresh(signal?: AbortSignal) {
    const requestScope = scope;
    const response = await fetch("/api/v1/plans", {
      credentials: "same-origin",
      ...(signal ? { signal } : {}),
    });
    if (currentScope.current !== requestScope || signal?.aborted) return;
    if (response.status === 404) {
      setEnabled(false);
      setRuns([]);
      return;
    }
    if (!response.ok) throw new Error("Pläne konnten nicht geladen werden.");
    const data = await response.json();
    if (currentScope.current !== requestScope || signal?.aborted) return;
    setRuns(data.runs);
    setNow(Date.now());
    setEnabled(true);
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: fixed endpoint; reset when identity or selection changes.
  useEffect(() => {
    const controller = new AbortController();
    setRuns([]);
    setEnabled(false);
    setConfirmed(false);
    setSelected("");
    setError("");
    setBlocked([]);
    setHistoryOpen(false);
    setExpanded([]);
    void refresh(controller.signal).catch(() => {
      if (!controller.signal.aborted)
        setError("Pläne konnten nicht geladen werden.");
    });
    return () => controller.abort();
  }, [scope]);
  useEffect(() => {
    setSelected(preparationId);
    setConfirmed(false);
  }, [preparationId]);
  useEffect(() => {
    const deadlines = runs
      .map((run) => Date.parse(run.expiresAt ?? ""))
      .filter((deadline) => Number.isFinite(deadline) && deadline > now);
    if (!deadlines.length) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(Math.min(...deadlines) - now + 1, 2147483647),
    );
    return () => clearTimeout(timer);
  }, [runs, now]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: poll only while a run is active, with a bounded retry window.
  useEffect(() => {
    if (!runs.some((run) => active.has(run.status))) return;
    const controller = new AbortController();
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (controller.signal.aborted) return;
      if (++attempts >= 120) {
        setError(
          "Automatische Aktualisierung beendet. Prüfe den Status manuell; laufende Ausführungen können weiterhin Ressourcen verändern.",
        );
        return;
      }
      await refresh(controller.signal).catch(() => {
        if (!controller.signal.aborted)
          setError("Ausführungsstatus konnte nicht aktualisiert werden.");
      });
      if (!controller.signal.aborted)
        timer = setTimeout(() => void poll(), 5000);
    }
    timer = setTimeout(() => void poll(), 5000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [runs.some((run) => active.has(run.status)), scope]);
  async function mutate(path: string, body: unknown, applyKey?: string) {
    if (pending.current) return;
    pending.current = true;
    const requestScope = scope;
    setBusy(true);
    setError("");
    if (applyKey) setBlocked((previous) => [...previous, applyKey]);
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
      if (currentScope.current !== requestScope) return;
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(
          (response.status === 404 && applyKey
            ? failures.apply_unavailable
            : failures[result.error]) ??
            "Die Aktion konnte nicht bestätigt werden. Aktualisiere den Status vor einem erneuten Start.",
        );
      }
      await refresh();
      setConfirmed(false);
    } catch (e) {
      if (currentScope.current === requestScope) {
        setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
        if (applyKey) await refresh().catch(() => {});
      }
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }
  async function exportContract(run: Run) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const requestScope = scope;
    try {
      const response = await fetch(`/api/v1/plans/${run.id}/outputs`, {
        credentials: "same-origin",
      });
      if (!response.ok) {
        const failure: unknown = await response.json().catch(() => null);
        const errorCode =
          failure &&
          typeof failure === "object" &&
          "error" in failure &&
          typeof failure.error === "string"
            ? failure.error
            : "";
        throw new Error(
          Object.hasOwn(contractExportFailures, errorCode)
            ? contractExportFailures[errorCode]
            : "Der Plattformvertrag ist nicht verfügbar. Es wurden keine State-Daten exportiert.",
        );
      }
      const payload: unknown = await response.json();
      const candidate =
        payload &&
        typeof payload === "object" &&
        "applicationPlatformContract" in payload
          ? payload.applicationPlatformContract
          : payload;
      const result = platformContractSchema.safeParse(candidate);
      if (!result.success)
        throw new Error(
          "Der Plattformvertrag ist ungültig. Es wurden keine State-Daten exportiert.",
        );
      const contract = {
        schema_version: result.data.schema_version,
        organization_id: result.data.organization_id,
        targets: result.data.targets,
      };
      if (currentScope.current !== requestScope) return;
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(contract, null, 2)], {
          type: "application/json",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `application-platform-contract-${run.id}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      if (currentScope.current === requestScope)
        setError(
          cause instanceof Error ? cause.message : "Export fehlgeschlagen.",
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const blockedByRecovery = runs.some(
    (run) => run.status === "recovery_required",
  );
  const blockedByRun =
    blockedByRecovery || runs.some((run) => active.has(run.status));
  const scopedRuns = runs
    .filter(
      (run) =>
        !scopeToPreparations ||
        preparations.some(
          (preparation) => preparation.id === run.preparationId,
        ),
    )
    .toSorted(
      (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
    );
  const configurationKey = (run: Run) =>
    preparations.find((preparation) => preparation.id === run.preparationId)
      ?.manifest.source?.configurationId ?? run.preparationId;
  const expired = (run: Run) =>
    run.operation !== "apply" &&
    run.status === "succeeded" &&
    Date.parse(run.expiresAt ?? "") <= now;
  const appliedPlans = new Set(
    runs.filter((run) => run.operation === "apply").map((run) => run.planId),
  );
  const latestCandidates = scopedRuns.filter(
    (run) => !appliedPlans.has(run.id),
  );
  const currentRuns = scopedRuns.filter(
    (run) =>
      active.has(run.status) ||
      run.status === "recovery_required" ||
      (!expired(run) &&
        latestCandidates.find(
          (item) => configurationKey(item) === configurationKey(run),
        )?.id === run.id &&
        !appliedPlans.has(run.id)),
  );
  const historicalRuns = scopedRuns.filter(
    (run) =>
      !currentRuns.includes(run) &&
      (phase === "apply"
        ? run.operation === "apply"
        : run.operation !== "apply"),
  );
  if (!enabled)
    return (
      <>
        <p>
          {t(
            "Plan-Ausführung ist in dieser Umgebung noch nicht aktiviert oder nicht verfügbar.",
          )}
        </p>
        {error && (
          <p role="alert" className="validation-box">
            {t(error)}
          </p>
        )}
      </>
    );
  const renderRuns = (visibleRuns: Run[], collapsed = false) =>
    visibleRuns.map((run) => {
      const historical =
        collapsed &&
        !active.has(run.status) &&
        run.status !== "recovery_required";
      const Container = historical ? "details" : "article";
      return (
        <Container
          className="project-form"
          key={run.id}
          onToggle={
            historical
              ? (event) => {
                  const open = event.currentTarget.open;
                  setExpanded((previous) =>
                    open
                      ? [...previous.filter((id) => id !== run.id), run.id]
                      : previous.filter((id) => id !== run.id),
                  );
                }
              : undefined
          }
        >
          {historical && (
            <summary>
              {run.operation === "apply" ? t("Apply") : t("Plan")} ·{" "}
              {new Date(run.createdAt).toLocaleString(
                currentLanguage() === "de" ? "de-DE" : "en-GB",
              )}{" "}
              ·{" "}
              {expired(run)
                ? t("Abgelaufen")
                : (t(labels[run.status]) ?? t("Unbekannter Status"))}
            </summary>
          )}
          {(!historical || expanded.includes(run.id)) && (
            <>
              <h4>
                {preparations.find((p) => p.id === run.preparationId)?.name ??
                  t("Deployment")}
              </h4>
              <p>
                {run.operation === "apply"
                  ? t("Apply: {{value0}}", {
                      value0:
                        run.status === "succeeded"
                          ? "Änderungen angewendet"
                          : run.status === "failed"
                            ? "Ausführung fehlgeschlagen"
                            : (t(labels[run.status]) ?? "Unbekannter Status"),
                    })
                  : (t(labels[run.status]) ?? t("Unbekannter Status"))}{" "}
                ·{" "}
                {new Date(run.createdAt).toLocaleString(
                  currentLanguage() === "de" ? "de-DE" : "en-GB",
                )}
              </p>
              {run.operation === "apply" && (
                <p
                  className={
                    run.status === "failed" ||
                    run.status === "recovery_required"
                      ? "validation-box"
                      : "field-hint"
                  }
                >
                  {run.status === "succeeded"
                    ? t(
                        "Apply abgeschlossen. Cloud-Ressourcen wurden gemäß dem freigegebenen Plan verarbeitet.",
                      )
                    : t(
                        "Diese Ausführung kann Cloud-Ressourcen bereits verändert haben. Prüfe den Status vor weiteren Aktionen.",
                      )}
                </p>
              )}
              {run.status === "recovery_required" && (
                <p role="alert" className="validation-box">
                  {failures.recovery_required}
                </p>
              )}
              <PlanOutput key={`${scope}:${run.id}`} run={run} />
              {run.operation === "apply" && (
                <details>
                  <summary>{t("Apply-Nachweise")}</summary>
                  <dl className="summary-list">
                    <dt>{t("Freigegebener Plan")}</dt>
                    <dd className="credential-account">
                      {run.planId ?? t("Nicht verfügbar")}
                    </dd>
                    <dt>{t("Plan-Prüfsumme (SHA-256)")}</dt>
                    <dd className="credential-account">
                      {run.artifactSha256 ?? t("Nicht verfügbar")}
                    </dd>
                    <dt>{t("Zielorganisation")}</dt>
                    <dd className="credential-account">
                      {preparations.find(
                        (item) => item.id === run.preparationId,
                      )?.manifest.organization.id ?? t("Nicht verfügbar")}
                    </dd>
                    <dt>{t("State-Backend")}</dt>
                    <dd className="credential-account">
                      {run.stateBackend
                        ? `${run.stateBackend.bucket} / ${run.stateBackend.key}`
                        : t("Bootstrap")}
                    </dd>
                    <dt>{t("Abgeschlossen")}</dt>
                    <dd>
                      {run.finishedAt
                        ? new Date(run.finishedAt).toLocaleString(
                            currentLanguage() === "de" ? "de-DE" : "en-GB",
                          )
                        : t("Noch nicht abgeschlossen")}
                    </dd>
                  </dl>
                </details>
              )}
              {!readOnly &&
                !historical &&
                phase === "apply" &&
                run.status === "recovery_required" && (
                  <CheckpointReview
                    key={`${scope}:${run.id}:checkpoint`}
                    runId={run.id}
                    session={session}
                    onReconciled={async () => {
                      setConfirmed(false);
                      await refresh();
                      onStep?.("plan");
                    }}
                  />
                )}
              {!readOnly &&
                !historical &&
                run.operation !== "apply" &&
                active.has(run.status) && (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      void mutate(`/api/v1/plans/${run.id}/cancel`, {})
                    }
                  >
                    {t("Plan abbrechen")}
                  </button>
                )}
              {run.errorCode && run.status !== "cancelled" && (
                <p className="validation-box">
                  {failures[run.errorCode] ??
                    (run.operation === "apply"
                      ? failures.apply_failed
                      : t("Plan fehlgeschlagen."))}
                </p>
              )}
              {run.summary && (
                <>
                  <p>
                    {run.operation === "apply" ||
                    runs.some(
                      (item) =>
                        item.operation === "apply" && item.planId === run.id,
                    )
                      ? t("Aktionszahlen des freigegebenen Plans.")
                      : run.summary.result === "no-changes"
                        ? t("Keine Änderungen geplant.")
                        : t("Änderungen geplant – nichts angewendet.")}
                  </p>
                  <dl className="summary-list plan-counts">
                    <div>
                      <dt>{t("Anlegen")}</dt>
                      <dd>{run.summary.resources.create}</dd>
                    </div>
                    <div>
                      <dt>{t("Ändern")}</dt>
                      <dd>{run.summary.resources.update}</dd>
                    </div>
                    <div>
                      <dt>{t("Ersetzen")}</dt>
                      <dd>{run.summary.resources.replace}</dd>
                    </div>
                    <div>
                      <dt>{t("Löschen")}</dt>
                      <dd>{run.summary.resources.delete}</dd>
                    </div>
                    <div>
                      <dt>{t("Daten lesen")}</dt>
                      <dd>{run.summary.resources.read}</dd>
                    </div>
                    <div>
                      <dt>{t("Geänderte Ausgaben")}</dt>
                      <dd>{run.summary.changedOutputs}</dd>
                    </div>
                  </dl>
                  {run.summary.destructive && (
                    <p className="validation-box">
                      {t("Der Plan enthält Löschungen oder Ersetzungen.")}
                    </p>
                  )}
                  {run.summary.completeness !== "complete" && (
                    <p className="field-hint">
                      {t(
                        "Die Engine bestätigt die Vollständigkeit nicht ausdrücklich. Noch unbekannte Werte können erst bei der Ausführung aufgelöst werden.",
                      )}
                    </p>
                  )}
                </>
              )}
              {historical && expired(run) && (
                <p className="field-hint">
                  {t(
                    "Plan abgelaufen oder keine Gültigkeit bestätigt. Erstelle und prüfe einen neuen Plan.",
                  )}
                </p>
              )}
              {!readOnly &&
                phase === "apply" &&
                !historical &&
                run.operation !== "apply" &&
                run.status === "succeeded" && (
                  <PlanReview
                    key={reviewKey(run)}
                    run={run}
                    preparation={preparations.find(
                      (item) => item.id === run.preparationId,
                    )}
                    busy={busy || blockedByRun}
                    blocked={
                      blocked.includes(`${run.id}:${run.artifactSha256}`) ||
                      runs.some(
                        (item) =>
                          item.operation === "apply" && item.planId === run.id,
                      )
                    }
                    sessionExpiresAt={session.expiresAt}
                    onApply={(organizationId) =>
                      void mutate(
                        `/api/v1/plans/${run.id}/apply`,
                        {
                          artifactSha256: run.artifactSha256,
                          organizationId,
                          confirmApply: true,
                        },
                        `${run.id}:${run.artifactSha256}`,
                      )
                    }
                  />
                )}
              {run.operation === "apply" && run.status === "succeeded" && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void exportContract(run)}
                >
                  {t("Plattformvertrag exportieren")}
                </button>
              )}
            </>
          )}
        </Container>
      );
    });
  return (
    <section className="plan-runs" aria-label={t("Bereitstellungsstatus")}>
      <div className="deployment-progress">
        <span>
          {t("Vorbereitung:")}{" "}
          {preparations.filter((item) => item.credentialId).length}{" "}
          {t("gespeichert")}
        </span>
        <span>
          {t("Plan:")} {(() => {
            const run = scopedRuns.find((item) => item.operation !== "apply");
            return t(
              run
                ? appliedPlans.has(run.id)
                  ? "angewendet"
                  : expired(run)
                    ? "abgelaufen"
                    : (labels[run.status] ?? "Unbekannt")
                : "ausstehend",
            );
          })()}
        </span>
        <span>
          {t("Apply:")} {(() => {
            const run = scopedRuns.find((item) => item.operation === "apply");
            return t(
              run
                ? run.status === "succeeded"
                  ? "abgeschlossen"
                  : (labels[run.status] ?? "Unbekannt")
                : "ausstehend",
            );
          })()}
        </span>
      </div>
      {phase !== "preparation" && (
        <>
          <h3 id="plans-title">
            {readOnly
              ? t("Plan- und Apply-Ausführungen")
              : phase === "apply"
                ? t("Plattform anwenden")
                : t("Plattform planen")}
          </h3>
          {!readOnly &&
            phase === "plan" &&
            currentRuns.some(
              (run) => run.operation !== "apply" && run.status === "succeeded",
            ) && (
              <button
                type="button"
                className="button primary"
                onClick={() => onStep?.("apply")}
              >
                {t("Weiter zu Apply")}
              </button>
            )}
          <details
            hidden={readOnly || phase !== "plan"}
            open={!currentRuns.some((run) => run.operation !== "apply")}
          >
            <summary>{t("Neuen Plan erstellen")}</summary>
            <div className="field">
              <label htmlFor="plan-preparation">
                {t("Gespeicherte Vorbereitung")}
              </label>
              <select
                id="plan-preparation"
                value={selected}
                disabled={busy}
                onChange={(event) => {
                  setSelected(event.target.value);
                  onPreparationChange?.(event.target.value);
                  setConfirmed(false);
                }}
              >
                <option value="">{t("Bitte auswählen")}</option>
                {preparations
                  .filter((preparation) => preparation.credentialId)
                  .map((preparation) => (
                    <option key={preparation.id} value={preparation.id}>
                      {t("Revision")}{" "}
                      {preparation.manifest.source?.revision ??
                        preparation.manifest.source?.commit?.slice(0, 8) ??
                        "?"}{" "}
                      - {preparation.id.slice(0, 8)} - {preparation.name}
                    </option>
                  ))}
              </select>
            </div>
            {!selected && (
              <p className="field-hint">
                {t(
                  "Wähle eine gespeicherte Vorbereitung. Neue Vorbereitungen legst du im Reiter Vorbereitung an.",
                )}
              </p>
            )}
            <label className="field-hint">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(event) => setConfirmed(event.target.checked)}
              />{" "}
              {t(
                "Ich bestätige: Zielorganisation und State-Zuordnung passen zur Landing Zone.",
              )}
            </label>
            {blockedByRun && (
              <p
                id="plan-blocked-reason"
                role="alert"
                className="validation-box"
              >
                {t(
                  blockedByRecovery
                    ? "Neue Plans sind gesperrt, bis der fehlgeschlagene Apply und sein State geprüft und abgeglichen wurden."
                    : failures.plan_already_running,
                )}
              </p>
            )}
            <p>
              <button
                className="button primary"
                type="button"
                aria-describedby={
                  blockedByRun ? "plan-blocked-reason" : undefined
                }
                disabled={
                  busy ||
                  !selected ||
                  !preparations.some(
                    (item) => item.id === selected && item.credentialId,
                  ) ||
                  !confirmed ||
                  blockedByRun
                }
                onClick={() =>
                  void mutate("/api/v1/plans", {
                    preparationId: selected,
                    confirmStateBinding: true,
                  })
                }
              >
                {t("Plattform planen")}
              </button>
            </p>
            <p className="field-hint">
              {t(
                "Apply startet ausschließlich nach Prüfung und ausdrücklicher Freigabe eines vom Server zugelassenen, gespeicherten Plans.",
              )}
            </p>
          </details>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() =>
              void refresh().catch(() =>
                setError("Ausführungsstatus konnte nicht aktualisiert werden."),
              )
            }
          >
            {t("Ausführungsstatus aktualisieren")}
          </button>
          {error && (
            <p role="alert" className="validation-box">
              {t(error)}
            </p>
          )}
          {readOnly ? (
            <>{renderRuns(scopedRuns, true)}</>
          ) : (
            <>
              {renderRuns(
                currentRuns.filter(
                  (run) =>
                    active.has(run.status) ||
                    run.status === "recovery_required" ||
                    (phase === "plan"
                      ? run.operation !== "apply"
                      : run.operation === "apply" ||
                        run.status === "succeeded"),
                ),
              )}
              {phase === "apply" && !currentRuns.length && (
                <p>
                  {t(
                    "Kein aktueller Plan verfügbar. Erstelle und prüfe einen Plan.",
                  )}
                </p>
              )}
              {historicalRuns.length > 0 && (
                <details
                  key={phase}
                  onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
                >
                  <summary>
                    {phase === "apply"
                      ? t("Apply-Historie")
                      : t("Plan-Historie")}{" "}
                    ({historicalRuns.length})
                  </summary>
                  {historyOpen && renderRuns(historicalRuns, true)}
                </details>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
