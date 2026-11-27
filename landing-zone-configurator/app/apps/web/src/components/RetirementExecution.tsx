import {
  type Retirement,
  type RetirementExecutionReview,
  retirementCredentialProjectSchema,
  retirementExecutionReviewSchema,
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
};
export function RetirementExecutionPanel({
  session,
  retirement,
  onChanged,
}: {
  session: Session;
  retirement: Retirement;
  onChanged: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false),
    [review, setReview] = useState<RetirementExecutionReview | null>(null),
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
  const homeLookup = useRef<AbortController | null>(null);
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
    if (expanded && profile && review?.canPrepare) {
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
    expanded,
    profile,
    identity,
    api,
    base,
    retirement.generation,
    review?.canPrepare,
  ]);
  useEffect(() => {
    verifyHomeProject();
    return () => homeLookup.current?.abort();
  }, [verifyHomeProject]);
  useEffect(() => {
    current.current = identity;
    setReview(null);
    setPreview(null);
    setRecovery(null);
    setError("");
    setBusy(false);
    setConfirmDelete(false);
    setRetention(false);
    setHandoff(false);
    setIndependent(false);
    setConfirmRecovery(false);
    setDate(retirement.notBefore.slice(0, 16));
    if (!expanded)
      return () => {
        current.current = "";
      };
    const controller = new AbortController();
    const owner = identity;
    void Promise.all([
      api(`${base}/execution`, undefined, controller.signal),
      api("/api/v1/credentials", undefined, controller.signal),
    ])
      .then(([status, credentials]) => {
        if (controller.signal.aborted || current.current !== owner) return;
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
      current.current = "";
    };
  }, [identity, expanded, api, base, retirement.notBefore]);
  async function action(
    path: string,
    body?: unknown,
    kind?: "preview" | "recovery",
  ) {
    if (busy) return;
    const owner = identity;
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
        setReview(retirementExecutionReviewSchema.parse(updated));
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
  return (
    <div className="retirement-execution">
      <button
        type="button"
        className={
          expanded ||
          ["COMPLETE", "CANCELLED", "PAUSED"].includes(retirement.phase)
            ? "button secondary"
            : "button primary"
        }
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {t(
          expanded
            ? "Rückbauschritte ausblenden"
            : ["COMPLETE", "CANCELLED", "PAUSED"].includes(retirement.phase)
              ? "Rückbaudetails anzeigen"
              : "Rückbau fortsetzen",
        )}
      </button>
      {expanded && (
        <>
          {error && <p role="alert">{t(error)}</p>}
          <p>
            {t(
              "Jede Phase benötigt einen eigenen geprüften Plan und eine ausdrückliche Freigabe. Ein Rückbaustart löscht noch keine Ressourcen.",
            )}
          </p>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => void action("/execution")}
          >
            {t("Status aktualisieren")}
          </button>
          {review &&
            !review.hasHandoff &&
            !["CANCELLED", "COMPLETE", "PAUSED"].includes(retirement.phase) && (
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
            )}
          {review?.canPrepare && (
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
                <p role="status">
                  {t("Projekt des Service Accounts wird geprüft …")}
                </p>
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
                className="button"
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
          )}
          {review?.scopes.map((scope) => (
            <div key={scope.id} className="retirement-scope">
              <h4>{scope.name}</h4>
              <p>{t(phaseLabels[scope.stage] ?? "Prüfung erforderlich")}</p>
              <button
                type="button"
                className="button secondary"
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
          ))}
          {review?.jobs.map((job) => (
            <div className="retirement-job" key={job.id}>
              <h4>
                {t(
                  job.operation === "plan"
                    ? "Rückbauplan"
                    : "Rückbauausführung",
                )}{" "}
                · {t(phaseLabels[job.phase] ?? "Prüfung erforderlich")}
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
                  )[job.status] ?? "Prüfung erforderlich",
                )}
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
              {job.operation === "plan" && job.artifactSha256 && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void action(`/jobs/${job.id}/preview`, undefined, "preview")
                  }
                >
                  {t("Löschumfang prüfen")}
                </button>
              )}
              {job.canInspect && (
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
                  {t("Runner-Stopp und Ergebnis prüfen")}
                </button>
              )}
              {job.recoveryPending && (
                <p>
                  {t(
                    "Der Runner sichert noch einen unterbrochenen State. Beende ihn nicht und prüfe den Status später erneut.",
                  )}
                </p>
              )}
              {job.recoveryAvailable && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void action(
                      `/jobs/${job.id}/recovery`,
                      undefined,
                      "recovery",
                    )
                  }
                >
                  {t("Unterbrochenen State prüfen")}
                </button>
              )}
            </div>
          ))}
          {preview && (
            <section aria-label={t("Geplanter Löschumfang")}>
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
              <button
                type="button"
                className="button"
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
          {recovery && (
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
                className="button"
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
          )}
        </>
      )}
    </div>
  );
}
