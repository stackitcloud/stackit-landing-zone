import {
  type Retirement,
  type RetirementExecutionReview,
  retirementCredentialProjectSchema,
  retirementExecutionReviewSchema,
  retirementOutputSchema,
} from "@lzc/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { t } from "../i18n";
import type { Session } from "./Account";

const previewSchema = z.object({
  id: z.uuid(),
  phase: z.string(),
  artifactSha256: z.string().nullable(),
  deletes: z.array(
    z.object({
      address: z.string(),
      type: z.string(),
      id: z.string().nullable(),
    }),
  ),
});
const recoverySchema = z.object({
  jobId: z.uuid(),
  sha256: z.string(),
  lineage: z.guid(),
  serial: z.number(),
  remainingCount: z.number(),
  removed: z.array(
    z.object({
      address: z.string(),
      type: z.string(),
      id: z.string().nullable(),
    }),
  ),
});
const phaseLabels: Record<string, string> = {
  private_workloads: "Dienste über ihre Control Plane bereinigen",
  remove_application: "Application-Ressourcen und Projekt entfernen",
  remove_projects: "Plattformressourcen und Projekte entfernen",
  finalize_folders: "Leere Ordner abschließend entfernen",
  complete: "Stillgelegt",
};
const errors: Record<string, string> = {
  retirement_private_runner_required:
    "Diese Landing Zone benötigt für den Rückbau einen Runner mit Zugang zu ihren privaten Control Planes. Der State wurde nicht übernommen.",
  retirement_engine_migration_required:
    "Vor dem Rückbau ist eine gesondert geprüfte Migration des ursprünglichen Terraform-States zu OpenTofu erforderlich. Der State wurde nicht übernommen.",
  retirement_source_inputs_unavailable:
    "Die ursprünglichen Eingaben können mit diesem Quellpaket nicht sicher rekonstruiert werden. Der State wurde nicht übernommen.",
  retirement_preparation_window:
    "Das angekündigte Vorbereitungsfenster läuft noch.",
  retirement_recovery_upload_pending:
    "Der Runner sichert noch einen unterbrochenen State. Beende ihn nicht und prüfe den Status später erneut.",
  retirement_runner_not_stopped:
    "Der Runner ist noch nicht nachweislich beendet. Prüfe den Status später erneut.",
  retirement_reconciliation_required:
    "Die Ausführung benötigt eine Wiederherstellungsprüfung. Ein erneutes Apply ist gesperrt.",
  retirement_control_inside_target:
    "Das Steuerungsprojekt oder der Service Account gehört zum Rückbauziel. Verwende einen unabhängigen Zugang.",
  retirement_control_handoff_committed:
    "Der State wurde bereits für den Rückbau übernommen. Ein normaler Abbruch ist nicht mehr möglich.",
  retirement_source_unavailable:
    "Der Runner enthält die angewendete Quellversion nicht. Der Rückbau benötigt ein passendes Runner-Paket.",
  retirement_foreign_child:
    "Ein Ordner enthält ein Projekt außerhalb des erfassten Rückbauumfangs. Prüfe die Zuordnung vor dem Fortsetzen.",
  retirement_cleanup_identity_unverified:
    "Der unabhängige Service Account konnte nicht bestätigt werden. Prüfe Profil und Projektzuordnung.",
  retirement_changed:
    "Der Rückbaustand hat sich geändert. Aktualisiere den Status und prüfe die Auswahl erneut.",
  retirement_state_changed:
    "Der State hat sich geändert. Prüfe den Status und erstelle einen neuen Plan.",
  retirement_init_failed:
    "OpenTofu konnte das Rückbau-Backend oder die Provider nicht initialisieren. Prüfe die OpenTofu-Ausgabe.",
  retirement_validate_failed:
    "OpenTofu konnte die Rückbaukonfiguration nicht validieren. Prüfe die OpenTofu-Ausgabe.",
  retirement_plan_failed:
    "OpenTofu konnte den Rückbauplan nicht erstellen. Prüfe die OpenTofu-Ausgabe.",
  retirement_before_failed:
    "Der aktuelle State konnte nicht gelesen werden. Prüfe die OpenTofu-Ausgabe.",
  retirement_backend_read_failed:
    "Der aktuelle State konnte nicht gelesen werden. Prüfe die OpenTofu-Ausgabe.",
  retirement_native_plan_failed:
    "Der Rückbauplan ist fehlgeschlagen. Prüfe die OpenTofu-Ausgabe und die Abschlussprüfung.",
};
export function RetirementExecutionPanel({
  session,
  retirement,
  onChanged,
  readOnly = false,
  paused = false,
}: {
  session: Session;
  retirement: Retirement;
  onChanged: () => Promise<void>;
  readOnly?: boolean;
  paused?: boolean;
}) {
  const [review, setReview] = useState<RetirementExecutionReview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [profiles, setProfiles] = useState<
      Array<{ id: string; name: string; serviceAccount: string }>
    >([]),
    [profile, setProfile] = useState("");
  const [home, setHome] = useState<{
      credentialProfileId: string;
      projectId: string;
      name: string;
    } | null>(null),
    [homeBusy, setHomeBusy] = useState(false),
    [homeError, setHomeError] = useState("");
  const [renewCredentials, setRenewCredentials] = useState(false);
  const homeLookup = useRef<AbortController | null>(null);
  const reviewSequence = useRef(0);
  const outputSequence = useRef(0);
  const outputRequests = useRef<Record<string, number>>({});
  const outputControllers = useRef<Record<string, AbortController>>({});
  const [outputs, setOutputs] = useState<
    Record<string, { text: string; truncated: boolean }>
  >({});
  const [outputErrors, setOutputErrors] = useState<Record<string, boolean>>({});
  const [pollError, setPollError] = useState(false);
  const [completionErrors, setCompletionErrors] = useState<
    Record<string, boolean>
  >({});
  const changed = useRef(onChanged);
  changed.current = onChanged;
  const [handoff, setHandoff] = useState(false),
    [independent, setIndependent] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false),
    [retention, setRetention] = useState(false);
  const [preview, setPreview] = useState<z.infer<typeof previewSchema> | null>(
      null,
    ),
    [recovery, setRecovery] = useState<z.infer<typeof recoverySchema> | null>(
      null,
    ),
    [confirmRecovery, setConfirmRecovery] = useState(false);
  const approvalPanel = useRef<HTMLElement | null>(null);
  const previewId = preview?.id;
  useEffect(() => {
    if (previewId) approvalPanel.current?.focus({ preventScroll: true });
  }, [previewId]);
  const [date, setDate] = useState(retirement.notBefore.slice(0, 16));
  const tenant = session.tenant?.id ?? "",
    identity = `${session.user.id}:${tenant}:${retirement.id}:${retirement.generation}`,
    current = useRef(identity);
  current.current = identity;
  const api = useCallback(
    async (path: string, body?: unknown, signal?: AbortSignal) => {
      const response = await fetch(path, {
        method: body === undefined ? "GET" : "POST",
        credentials: "same-origin",
        headers: {
          "x-lzc-tenant": tenant,
          "x-lzc-csrf": session.csrfToken,
          "content-type": "application/json",
        },
        ...(signal ? { signal } : {}),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        const e = await response.json().catch(() => ({}));
        throw Error(e.error ?? "retirement_unavailable");
      }
      return response.json();
    },
    [tenant, session.csrfToken],
  );
  const base = `/api/v1/retirements/${retirement.id}`;
  const verifyHomeProject = useCallback(() => {
    const controller = new AbortController(),
      owner = identity;
    homeLookup.current?.abort();
    homeLookup.current = controller;
    setHome(null);
    setHomeError("");
    setHomeBusy(false);
    if (
      !readOnly &&
      !paused &&
      profile &&
      review?.canPrepare &&
      (!review.prepared || renewCredentials)
    ) {
      setHomeBusy(true);
      void api(
        `${base}/credential-project`,
        { generation: retirement.generation, credentialProfileId: profile },
        controller.signal,
      )
        .then((result) => {
          if (controller.signal.aborted || current.current !== owner) return;
          const resolved = retirementCredentialProjectSchema.parse(result);
          if (resolved.credentialProfileId !== profile)
            throw Error("retirement_changed");
          setHome(resolved);
        })
        .catch(() => {
          if (!controller.signal.aborted && current.current === owner)
            setHomeError(
              "Das Projekt des Service Accounts konnte nicht ermittelt werden. Prüfe den ausgewählten Zugang und seine Berechtigungen.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted && current.current === owner)
            setHomeBusy(false);
        });
    }
  }, [
    profile,
    identity,
    api,
    base,
    retirement.generation,
    review?.canPrepare,
    review?.prepared,
    renewCredentials,
    readOnly,
    paused,
  ]);
  useEffect(() => {
    verifyHomeProject();
    return () => homeLookup.current?.abort();
  }, [verifyHomeProject]);
  useEffect(() => {
    current.current = identity;
    setReview(null);
    setRenewCredentials(false);
    setPreview(null);
    setRecovery(null);
    setError("");
    setOutputs({});
    outputRequests.current = {};
    for (const request of Object.values(outputControllers.current))
      request.abort();
    outputControllers.current = {};
    setOutputErrors({});
    setPollError(false);
    setCompletionErrors({});
    setBusy(false);
    setConfirmDelete(false);
    setRetention(false);
    setHandoff(false);
    setIndependent(false);
    setConfirmRecovery(false);
    setDate(retirement.notBefore.slice(0, 16));
    const controller = new AbortController();
    const owner = identity;
    const sequence = ++reviewSequence.current;
    void Promise.all([
      api(`${base}/execution`, undefined, controller.signal),
      readOnly
        ? Promise.resolve({ profiles: [] })
        : api("/api/v1/credentials", undefined, controller.signal),
    ])
      .then(([status, credentials]) => {
        if (controller.signal.aborted || current.current !== owner) return;
        if (sequence === reviewSequence.current)
          setReview(retirementExecutionReviewSchema.parse(status));
        setProfiles(
          z
            .object({
              profiles: z.array(
                z.object({
                  id: z.uuid(),
                  name: z.string(),
                  serviceAccount: z.string(),
                  state: z.string(),
                }),
              ),
            })
            .parse(credentials)
            .profiles.filter((p) => p.state === "stored"),
        );
      })
      .catch(() => {
        if (!controller.signal.aborted && current.current === owner)
          setError(
            "Der Rückbaustatus konnte nicht geladen werden. Prüfe Anmeldung und Arbeitsbereich.",
          );
      });
    return () => {
      controller.abort();
      for (const request of Object.values(outputControllers.current))
        request.abort();
      outputControllers.current = {};
      current.current = "";
    };
  }, [identity, api, base, retirement.notBefore, readOnly]);
  const loadOutput = useCallback(
    async (jobId: string, signal?: AbortSignal, refresh = false) => {
      if (signal?.aborted) return false;
      if (outputControllers.current[jobId] && !refresh) return false;
      const owner = identity;
      const sequence = ++outputSequence.current;
      outputRequests.current[jobId] = sequence;
      outputControllers.current[jobId]?.abort();
      const request = new AbortController();
      outputControllers.current[jobId] = request;
      const abort = () => request.abort();
      signal?.addEventListener("abort", abort, { once: true });
      const timeout = setTimeout(abort, 15000);
      try {
        const output = retirementOutputSchema.parse(
          await api(`${base}/jobs/${jobId}/output`, undefined, request.signal),
        );
        if (
          request.signal.aborted ||
          current.current !== owner ||
          outputRequests.current[jobId] !== sequence
        )
          return;
        setOutputs((previous) => ({ ...previous, [jobId]: output }));
        setOutputErrors((previous) => ({ ...previous, [jobId]: false }));
        return true;
      } catch {
        if (
          !signal?.aborted &&
          current.current === owner &&
          outputRequests.current[jobId] === sequence
        )
          setOutputErrors((previous) => ({ ...previous, [jobId]: true }));
        return false;
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        if (outputControllers.current[jobId] === request)
          delete outputControllers.current[jobId];
      }
    },
    [api, base, identity],
  );
  useEffect(() => {
    if (
      readOnly ||
      busy ||
      ["COMPLETE", "CANCELLED"].includes(retirement.phase)
    )
      return;
    const controller = new AbortController(),
      owner = identity;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let lastCompletion = "";
    let lastOutputCompletion = "";
    let interval = 2000;
    const refresh = async () => {
      if (running || controller.signal.aborted) return;
      running = true;
      try {
        if (document.visibilityState === "hidden") return;
        const sequence = ++reviewSequence.current;
        let status = retirementExecutionReviewSchema.parse(
          await api(
            `${base}/execution`,
            undefined,
            AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
          ),
        );
        if (
          controller.signal.aborted ||
          current.current !== owner ||
          sequence !== reviewSequence.current
        )
          return;
        setReview(status);
        setPollError(false);
        // Reconcile only a reported terminal outcome. Never stop an execution
        // without its result or while interrupted State still needs recovery.
        const completed = status.jobs.find(
          (job) =>
            !paused &&
            job.operatorId === session.user.id &&
            job.generation === retirement.generation &&
            job.canInspect &&
            job.nativeStatus !== null &&
            !job.recoveryPending &&
            !job.recoveryAvailable,
        );
        if (completed) {
          try {
            const reconciled = retirementExecutionReviewSchema.parse(
              await api(
                `${base}/jobs/${completed.id}/inspect`,
                { generation: retirement.generation },
                AbortSignal.any([
                  controller.signal,
                  AbortSignal.timeout(15000),
                ]),
              ),
            );
            if (
              controller.signal.aborted ||
              current.current !== owner ||
              sequence !== reviewSequence.current
            )
              return;
            status = reconciled;
            setReview(status);
            setCompletionErrors((previous) => ({
              ...previous,
              [completed.id]: false,
            }));
          } catch {
            if (
              controller.signal.aborted ||
              current.current !== owner ||
              sequence !== reviewSequence.current
            )
              return;
            setCompletionErrors((previous) => ({
              ...previous,
              [completed.id]: true,
            }));
          }
        }
        interval = status.jobs.some(
          (job) =>
            [
              "starting",
              "initializing",
              "validating",
              "planning",
              "applying",
            ].includes(job.status) || job.recoveryPending,
        )
          ? 2000
          : 10000;
        const latest = [...status.jobs].sort(
          (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
        )[0];
        if (latest) {
          const completion = latest.nativeStatus
            ? `${latest.id}:${latest.nativeStatus}`
            : "";
          if (!completion || completion !== lastOutputCompletion)
            void loadOutput(latest.id, controller.signal).then((loaded) => {
              if (
                loaded &&
                !controller.signal.aborted &&
                current.current === owner
              )
                lastOutputCompletion = completion;
            });
          const checkedCompletion = completion
            ? `${completion}:${latest.status}:${latest.canInspect}`
            : "";
          if (checkedCompletion && checkedCompletion !== lastCompletion) {
            lastCompletion = checkedCompletion;
            void changed.current().catch(() => {
              if (!controller.signal.aborted && current.current === owner)
                setPollError(true);
            });
          }
        }
      } catch {
        if (!controller.signal.aborted && current.current === owner)
          setPollError(true);
      } finally {
        running = false;
        if (!controller.signal.aborted) timer = setTimeout(refresh, interval);
      }
    };
    timer = setTimeout(refresh, 2000);
    const visible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [
    busy,
    identity,
    api,
    base,
    loadOutput,
    retirement.phase,
    retirement.generation,
    session.user.id,
    readOnly,
    paused,
  ]);
  async function action(
    path: string,
    body?: unknown,
    kind?: "preview" | "recovery",
  ) {
    if (busy) return;
    const owner = identity;
    const sequence = ++reviewSequence.current;
    setBusy(true);
    setError("");
    try {
      const result = await api(`${base}${path}`, body);
      if (current.current !== owner) return;
      if (kind === "preview") {
        setPreview(previewSchema.parse(result));
        setConfirmDelete(false);
        setRetention(false);
      } else if (kind === "recovery") {
        setRecovery(recoverySchema.parse(result));
        setConfirmRecovery(false);
      } else {
        setPreview(null);
        setRecovery(null);
        setConfirmDelete(false);
        setRetention(false);
        const updated = await api(`${base}/execution`);
        if (current.current !== owner) return;
        if (sequence === reviewSequence.current) {
          const status = retirementExecutionReviewSchema.parse(updated);
          setReview(status);
          const latest = [...status.jobs].sort(
            (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
          )[0];
          if (latest) void loadOutput(latest.id, undefined, true);
        }
        await onChanged();
      }
    } catch (cause) {
      if (current.current === owner)
        setError(
          errors[cause instanceof Error ? cause.message : ""] ??
            "Der Rückbau wurde nicht geändert. Aktualisiere den Status und prüfe deine Berechtigung.",
        );
    } finally {
      if (current.current === owner) setBusy(false);
    }
  }
  const jobs = [...(review?.jobs ?? [])].sort(
    (a, b) =>
      Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
      Number(b.operation === "apply") - Number(a.operation === "apply"),
  );
  const unresolved = (job: RetirementExecutionReview["jobs"][number]) =>
    job.canInspect ||
    job.recoveryPending ||
    job.recoveryAvailable ||
    [
      "starting",
      "initializing",
      "validating",
      "planning",
      "applying",
      "recovery_required",
    ].includes(job.status);
  const currentJobs = new Set<string>();
  if (!readOnly) {
    for (const scope of review?.scopes ?? []) {
      const latest = jobs.find(
        (job) =>
          job.scopeId === scope.id &&
          job.phase === scope.stage &&
          job.generation === retirement.generation,
      );
      if (latest && scope.stage !== "complete") currentJobs.add(latest.id);
    }
    for (const job of jobs) if (unresolved(job)) currentJobs.add(job.id);
  }
  const previousJobs = jobs.filter((job) => !currentJobs.has(job.id));
  const renderJob = (
    job: RetirementExecutionReview["jobs"][number],
    historical = false,
  ) => (
    <div className="retirement-job" key={job.id}>
      {historical && (
        <p className="retirement-eyebrow">
          {review?.scopes.find((scope) => scope.id === job.scopeId)?.name ??
            retirement.name}
        </p>
      )}
      <h4>
        {t(job.operation === "plan" ? "Rückbauplan" : "Rückbauausführung")} ·{" "}
        {t(phaseLabels[job.phase] ?? "Prüfung erforderlich")}
      </h4>
      <p>
        {t(
          (
            {
              starting: "Wird gestartet",
              initializing: "Wird initialisiert",
              validating: "Wird validiert",
              planning: "Plan wird erstellt",
              applying: "Ressourcen werden entfernt",
              succeeded: "Erfolgreich",
              failed: "Fehlgeschlagen",
              recovery_required: "Prüfung erforderlich",
            } as Record<string, string>
          )[job.nativeStatus === "failed" ? "failed" : job.status] ??
            "Prüfung erforderlich",
        )}
      </p>
      {!historical && unresolved(job) && job.operatorId !== session.user.id && (
        <p role="status">
          {t(
            "Die Abschlussprüfung muss vom Benutzer durchgeführt werden, der den Lauf gestartet hat.",
          )}
        </p>
      )}
      {job.errorCode && (
        <p role="status">
          {t(
            errors[job.errorCode] ??
              "Der Rückbau konnte nicht abgeschlossen werden. Prüfe die OpenTofu-Ausgabe und die Abschlussprüfung.",
          )}
        </p>
      )}
      <p>
        {t("Gestartet")}: {new Date(job.createdAt).toLocaleString()}
      </p>
      {job.status === "failed" && job.nativeStatus === null && (
        <p>
          {t(
            "Kein nativer Abschlussnachweis. Der Runner ist beendet; erstelle einen neuen Plan.",
          )}
        </p>
      )}
      {job.errorCode === "retirement_folder_purge_pending" && (
        <p>
          {t(
            "STACKIT hat die Folder-Löschung noch nicht zugelassen. Die fehlgeschlagene Ausführung bleibt dokumentiert. Prüfe den Status später und erstelle einen neuen Folder-Plan.",
          )}
        </p>
      )}
      {!historical &&
        !paused &&
        job.operation === "plan" &&
        job.artifactSha256 &&
        preview?.id !== job.id &&
        (job.canApply || job.canInspect) && (
          <button
            type="button"
            className="button primary"
            disabled={busy}
            onClick={() =>
              void action(`/jobs/${job.id}/preview`, undefined, "preview")
            }
          >
            {t("Löschumfang prüfen")}
          </button>
        )}
      {!historical &&
        !paused &&
        job.canInspect &&
        job.operatorId === session.user.id &&
        job.generation === retirement.generation &&
        job.nativeStatus &&
        !job.recoveryPending &&
        !job.recoveryAvailable && (
          <p role="status">
            {t(
              completionErrors[job.id]
                ? "Die Abschlussprüfung konnte noch nicht beendet werden. Sie wird automatisch wiederholt."
                : "Die Ausführung ist beendet. Das Ergebnis wird automatisch geprüft.",
            )}
          </p>
        )}
      {!historical &&
        !paused &&
        job.operatorId === session.user.id &&
        job.canInspect &&
        (!job.nativeStatus ||
          completionErrors[job.id] ||
          job.recoveryAvailable) && (
          <button
            type="button"
            className="button secondary"
            disabled={busy || job.recoveryPending}
            onClick={() =>
              void action(`/jobs/${job.id}/inspect`, {
                generation: retirement.generation,
              })
            }
          >
            {t(
              job.nativeStatus
                ? "Abschluss erneut prüfen"
                : "Ausführungsstatus prüfen",
            )}
          </button>
        )}
      {!historical && job.recoveryPending && (
        <p>
          {t(
            "Der Runner sichert noch einen unterbrochenen State. Beende ihn nicht und prüfe den Status später erneut.",
          )}
        </p>
      )}
      {!historical &&
        !paused &&
        job.operatorId === session.user.id &&
        job.recoveryAvailable && (
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() =>
              void action(`/jobs/${job.id}/recovery`, undefined, "recovery")
            }
          >
            {t("Unterbrochenen State prüfen")}
          </button>
        )}
      {preview?.id === job.id && !historical && !paused && (
        <section
          aria-label={t("Geplanter Löschumfang")}
          ref={approvalPanel}
          tabIndex={-1}
        >
          <h4>{t("Geplanter Löschumfang")}</h4>
          <p>
            {preview.deletes.length} {t("Ressourcen zur Löschung")}
          </p>
          <ul>
            {preview.deletes.map((r) => (
              <li key={r.address}>
                <code>{r.address}</code>
                {r.id && (
                  <>
                    {" "}
                    · <code>{r.id}</code>
                  </>
                )}
              </li>
            ))}
          </ul>
          <label>
            <input
              type="checkbox"
              checked={retention}
              onChange={(e) => setRetention(e.target.checked)}
            />
            {t(
              "Datenexporte, Backups und Aufbewahrungspflichten sind geprüft.",
            )}
          </label>
          <label>
            <input
              type="checkbox"
              checked={confirmDelete}
              onChange={(e) => setConfirmDelete(e.target.checked)}
            />
            {t(
              "Ich bestätige die unwiderrufliche Löschung genau dieses geprüften Umfangs.",
            )}
          </label>
          {!review?.jobs.some((j) => j.id === preview.id && j.canApply) && (
            <p role="status">
              {t(
                review?.jobs.some((j) => j.id === preview.id && j.canInspect)
                  ? "Die Löschfreigabe ist nach der Abschlussprüfung verfügbar."
                  : "Dieser Plan ist nicht mehr freigabefähig. Prüfe den Status und erstelle gegebenenfalls einen neuen Plan mit deinem Zugang.",
              )}
            </p>
          )}
          <button
            type="button"
            className="button primary"
            disabled={
              busy ||
              !retention ||
              !confirmDelete ||
              !review?.jobs.some((j) => j.id === preview.id && j.canApply)
            }
            onClick={() =>
              void action(`/jobs/${preview.id}/apply`, {
                generation: retirement.generation,
                artifactSha256: preview.artifactSha256,
                confirmDestroyResources: true,
                confirmDataRetentionReviewed: true,
              })
            }
          >
            {t("Geprüften Rückbauplan ausführen")}
          </button>
        </section>
      )}
      {recovery?.jobId === job.id && !historical && !paused && (
        <section aria-label={t("State-Wiederherstellung prüfen")}>
          <h4>{t("State-Wiederherstellung prüfen")}</h4>
          <p>
            {t(
              "Der ursprüngliche Apply wird dadurch nicht erfolgreich. Prüfe die bereits entfernten Ressourcen und bestätige den unterbrochenen State erst nach nachgewiesenem Runner-Stopp. Danach ist ein neuer Plan erforderlich.",
            )}
          </p>
          <p>
            {recovery.serial} · {recovery.remainingCount}{" "}
            {t("Verbleibende Ressourcen")}
          </p>
          <ul>
            {recovery.removed.map((r) => (
              <li key={r.address}>
                <code>{r.address}</code>
              </li>
            ))}
          </ul>
          <label>
            <input
              type="checkbox"
              checked={confirmRecovery}
              onChange={(e) => setConfirmRecovery(e.target.checked)}
            />
            {t(
              "Ich habe den unterbrochenen State und den Löschumfang geprüft und werde einen neuen Plan erstellen.",
            )}
          </label>
          <button
            type="button"
            className="button primary"
            disabled={busy || !confirmRecovery}
            onClick={() =>
              void action(`/jobs/${recovery.jobId}/recovery`, {
                generation: retirement.generation,
                sha256: recovery.sha256,
                confirmStoppedStateRecovery: true,
                confirmFreshPlanRequired: true,
              })
            }
          >
            {t("Geprüften State für einen neuen Plan übernehmen")}
          </button>
        </section>
      )}{" "}
      <details
        open={!historical && job.nativeStatus !== "succeeded"}
        onToggle={(event) => {
          if (event.currentTarget.open)
            void loadOutput(job.id, undefined, true);
        }}
      >
        <summary>{t("OpenTofu-Ausgabe")}</summary>
        {outputs[job.id]?.text ? (
          <section aria-label={t("OpenTofu-Ausgabe")}>
            <pre>{outputs[job.id]?.text}</pre>
          </section>
        ) : (
          <p>
            {t(
              job.nativeStatus
                ? "Für diesen abgeschlossenen Lauf wurde keine OpenTofu-Ausgabe gespeichert."
                : "Noch keine OpenTofu-Ausgabe vorhanden. Status und Ausgabe werden automatisch aktualisiert.",
            )}
          </p>
        )}
        {outputs[job.id]?.truncated && (
          <p>{t("Die Ausgabe wurde wegen ihrer Größe gekürzt.")}</p>
        )}
        {outputErrors[job.id] && (
          <p role="status">
            {t(
              "Die OpenTofu-Ausgabe konnte gerade nicht geladen werden. Versuche es erneut.",
            )}
          </p>
        )}
        {outputErrors[job.id] && (
          <button
            type="button"
            className="button secondary"
            onClick={() => void loadOutput(job.id, undefined, true)}
          >
            {t("Ausgabe erneut laden")}
          </button>
        )}
      </details>
      <details>
        <summary>{t("Technische Nachweise")}</summary>
        <dl>
          <dt>{t("Auftrags-ID")}</dt>
          <dd>
            <code>{job.id}</code>
          </dd>
          <dt>{t("Quellversion")}</dt>
          <dd>
            <code>{job.sourceRevision}</code>
          </dd>
          <dt>{t("Provider-Prüfsumme")}</dt>
          <dd>
            <code>{job.providerLockSha256}</code>
          </dd>
        </dl>
      </details>
    </div>
  );
  const credentialForm = !readOnly && !paused && review?.canPrepare && (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (
          !handoff ||
          !independent ||
          homeBusy ||
          home?.credentialProfileId !== profile
        )
          return;
        void action("/prepare", {
          generation: retirement.generation,
          credentialProfileId: profile,
          confirmStateHandoff: true,
          confirmCleanupPermissionsSurvive: true,
        });
      }}
    >
      <h4>
        {t(
          review.hasHandoff
            ? "Rückbauzugang erneut bestätigen"
            : "Unabhängigen Rückbauzugang vorbereiten",
        )}
      </h4>
      <label>
        {t("Service-Account-Profil")}
        <select
          value={profile}
          onChange={(e) => {
            setProfile(e.target.value);
            setHandoff(false);
            setIndependent(false);
          }}
          required
        >
          <option value="">{t("Bitte auswählen")}</option>
          {profiles.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name} · {p.serviceAccount}
            </option>
          ))}
        </select>
      </label>
      {homeBusy && (
        <p role="status">{t("Projekt des Service Accounts wird geprüft …")}</p>
      )}
      {homeError && <p role="alert">{t(homeError)}</p>}
      {homeError && (
        <button
          type="button"
          className="button secondary"
          disabled={busy || homeBusy}
          onClick={verifyHomeProject}
        >
          {t("Projektzuordnung erneut prüfen")}
        </button>
      )}
      {home?.credentialProfileId === profile && (
        <>
          <p role="status">{t("Projektzuordnung geprüft.")}</p>
          <details>
            <summary>{t("Projektdetails zum Service Account")}</summary>
            <dl>
              <dt>{t("Projekt des Service Accounts")}</dt>
              <dd>
                {home.name} · <code>{home.projectId}</code>
              </dd>
            </dl>
          </details>
        </>
      )}
      <p>
        {t(
          "Der Service Account und die Configurator-Datenbank müssen außerhalb der zu löschenden Landing Zone bestehen bleiben. Prüfe Datenexporte, Aufbewahrungsregeln und den verbleibenden State im bisherigen Backend.",
        )}
      </p>
      <label>
        <input
          type="checkbox"
          checked={independent}
          onChange={(e) => setIndependent(e.target.checked)}
        />
        {t(
          "Ich bestätige, dass der Rückbauzugang und seine Berechtigungen erhalten bleiben.",
        )}
      </label>
      <label>
        <input
          type="checkbox"
          checked={handoff}
          onChange={(e) => setHandoff(e.target.checked)}
        />
        {t(
          "Ich bestätige die Übernahme des States für den Rückbau. Die bisherigen Ausführungswege bleiben gesperrt; ein normaler Abbruch ist danach nicht möglich.",
        )}
      </label>
      <button
        type="submit"
        className="button primary"
        disabled={
          busy ||
          !profile ||
          homeBusy ||
          home?.credentialProfileId !== profile ||
          !handoff ||
          !independent
        }
      >
        {t("Rückbauzugang prüfen und State übernehmen")}
      </button>
    </form>
  );
  return (
    <div className="retirement-execution">
      {error && <p role="alert">{t(error)}</p>}
      {!review && !error && <p>{t("Rückbaustand wird geladen …")}</p>}
      {!readOnly && Date.parse(retirement.notBefore) > Date.now() && (
        <p>
          {t(
            "Das Vorbereitungsfenster läuft. Der nächste Schritt wird ab dem angekündigten Termin verfügbar.",
          )}
        </p>
      )}
      {readOnly && review?.jobs.length === 0 && (
        <p>{t("In diesem Versuch wurden keine Rückbauschritte ausgeführt.")}</p>
      )}
      {pollError && (
        <p role="status">
          {t(
            "Der Status konnte gerade nicht aktualisiert werden. Die Anzeige wird automatisch erneut geprüft.",
          )}
        </p>
      )}
      {!readOnly &&
        review &&
        !review.hasHandoff &&
        !["CANCELLED", "COMPLETE", "PAUSED"].includes(retirement.phase) && (
          <details>
            <summary>{t("Rückbautermin ändern")}</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action("", {
                  generation: retirement.generation,
                  action: "reschedule",
                  notBefore: new Date(`${date}Z`).toISOString(),
                });
              }}
            >
              <label>
                {t("Löschung frühestens ab (UTC)")}
                <input
                  type="datetime-local"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </label>
              <button
                type="submit"
                className="button secondary"
                disabled={busy}
              >
                {t("Termin ändern und Besteller informieren")}
              </button>
            </form>
          </details>
        )}
      {!review?.prepared && credentialForm}
      {!readOnly &&
        review?.scopes
          .filter(
            (scope) =>
              scope.stage !== "complete" ||
              jobs.some((job) => job.scopeId === scope.id && unresolved(job)),
          )
          .sort(
            (a, b) =>
              Number(b.instanceId !== null) - Number(a.instanceId !== null),
          )
          .map((scope) => (
            <div key={scope.id} className="retirement-scope">
              <h4>{scope.name}</h4>
              <p className="retirement-eyebrow">{t("Aktueller Schritt")}</p>
              <h5>{t(phaseLabels[scope.stage] ?? "Prüfung erforderlich")}</h5>
              <ol aria-label={t("Rückbauschritte")}>
                {(scope.instanceId
                  ? ["remove_application"]
                  : ["private_workloads", "remove_projects", "finalize_folders"]
                ).map((phase, index, steps) => (
                  <li
                    key={phase}
                    aria-current={scope.stage === phase ? "step" : undefined}
                    data-completed={
                      steps.indexOf(scope.stage) > index || undefined
                    }
                  >
                    {t(phaseLabels[phase] ?? "Prüfung erforderlich")}
                    {steps.indexOf(scope.stage) > index && (
                      <> · {t("Schritt abgeschlossen")}</>
                    )}
                    {scope.stage === phase && <> · {t("Aktueller Schritt")}</>}
                  </li>
                ))}
              </ol>
              {!scope.instanceId && (
                <p>
                  {t(
                    "Zuerst werden Dienste bereinigt, danach Projekte entfernt. Ordner folgen erst, wenn STACKIT die Projekte endgültig gelöscht hat.",
                  )}
                </p>
              )}
              {!scope.instanceId &&
                review.prepared &&
                review.scopes.some(
                  (child) => child.instanceId && child.stage !== "complete",
                ) && (
                  <p role="status">
                    {t(
                      "Bereinige zuerst die Application Landing Zones. Danach kann der Plattform-Rückbau fortgesetzt werden.",
                    )}
                  </p>
                )}
              {scope.canPlan && !paused && (
                <div className="retirement-next-action">
                  <h5>{t("Nächster Schritt")}</h5>
                  <p>
                    {t(
                      scope.stage === "finalize_folders"
                        ? "STACKIT muss die Projekte endgültig gelöscht haben, bevor die Ordner entfernt werden können. Ein neuer Plan prüft den aktuellen Löschumfang."
                        : "Erstelle den Plan für diesen Schritt. Prüfe danach den Löschumfang und gib die Ausführung frei.",
                    )}
                  </p>
                  <button
                    type="button"
                    className="button primary"
                    disabled={busy || !scope.canPlan}
                    onClick={() =>
                      void action("/plans", {
                        generation: retirement.generation,
                        scopeId: scope.id,
                      })
                    }
                  >
                    {t("Rückbauplan erstellen")}
                  </button>
                </div>
              )}
              {jobs
                .filter(
                  (job) => job.scopeId === scope.id && currentJobs.has(job.id),
                )
                .map((job) => renderJob(job))}
            </div>
          ))}

      {jobs
        .filter(
          (job) =>
            currentJobs.has(job.id) &&
            !review?.scopes.some((scope) => scope.id === job.scopeId),
        )
        .map((job) => renderJob(job))}
      {previousJobs.length > 0 && (
        <details
          className="retirement-run-history"
          open={readOnly || undefined}
        >
          <summary>
            {t("Abgeschlossene Schritte und frühere Läufe")} (
            {previousJobs.length})
          </summary>
          {previousJobs.map((job) => renderJob(job, true))}
        </details>
      )}
      {review?.prepared && credentialForm && (
        <details
          onToggle={(event) => setRenewCredentials(event.currentTarget.open)}
        >
          <summary>{t("Rückbauzugang erneut bestätigen")}</summary>
          {credentialForm}
        </details>
      )}
      {!readOnly && (
        <details className="retirement-tools">
          <summary>{t("Weitere Prüfungen")}</summary>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => void action("/execution")}
          >
            {t("Status aktualisieren")}
          </button>
        </details>
      )}
    </div>
  );
}
