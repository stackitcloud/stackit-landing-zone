import {
  type ApplicationInstance,
  applicationInstanceSchema,
  applicationPlanJobSchema,
  applicationPlanPreviewSchema,
  appliedPlatformSourceSchema,
} from "@lzc/contracts";
import {
  type CommonConfiguration,
  type JsonValue,
  objectValue,
  type PublishedProjectTemplate,
  platformContractSchema,
  projectTemplates,
  publishedProjectTemplateSchema,
  resolveApplicationOrder,
  templateParameterFields,
} from "@lzc/domain";
import { Archive, Eye, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  currentLanguage,
  type FormattedMessage,
  formatMessage,
  t,
} from "../i18n";
import type { Session } from "./Account";
import { applicationGroupsSchema } from "./ApplicationGroups";
import { OrganizationBinding } from "./OrganizationBinding";
import { templateObservabilityConfigurable } from "./TemplateParameters";

const errors: Record<string, string> = {
  application_maintenance_disabled:
    "Destroy und Drift sind auf diesem Server nicht aktiviert.",
  application_drift_read_only:
    "Eine Drift-Prüfung kann nicht angewendet werden.",
  application_destroy_plan_invalid:
    "Der Destroy-Plan enthält andere Aktionen als Löschungen und kann nicht ausgeführt werden.",
  application_destroy_confirmation_required:
    "Bitte das Löschen für diese Application Landing Zone ausdrücklich bestätigen.",
  application_destroy_confirmation_invalid:
    "Die Löschbestätigung passt nicht zu diesem Plan.",
  application_order_archive_unavailable:
    "Nur abgeschlossene fehlgeschlagene Bereitstellungen oder erfolgreich gelöschte Application Landing Zones können archiviert werden.",
  application_output_unavailable:
    "Die Ausführungslogs sind derzeit nicht verfügbar.",
  application_apply_plan_unavailable:
    "Dieser Plan ist nicht mehr ausführbar. Bitte einen neuen Cloud-Plan starten.",
  application_apply_package_changed:
    "Das Runner-Paket passt nicht mehr zum gespeicherten Plan. Bitte einen neuen Cloud-Plan starten.",
  application_plan_artifact_invalid:
    "Die gespeicherte Plan-Datei passt nicht zur geprüften Bestellung.",
  application_apply_disabled:
    "Application-Apply ist auf diesem Server nicht aktiviert.",
  application_preview_unavailable:
    "Die Ressourcen-Vorschau ist auf diesem Server nicht verfügbar.",
  application_execution_unavailable:
    "Die Plattform-Ausführungsberechtigung ist nicht mehr gültig. Bitte den Platform Owner kontaktieren.",
  application_execution_window_too_short:
    "Die vorbereitete Ausführungsfreigabe läuft zu bald ab. Bitte einen neuen Cloud-Plan vorbereiten.",
  application_execution_binding_conflict:
    "Für diesen Plattformvertrag ist bereits ein anderes State Backend hinterlegt. Die bestehende Ausführungsberechtigung muss zuerst widerrufen werden.",
  application_order_deleted:
    "Diese Bestellung wurde gelöscht. Bitte die Bestellungen aktualisieren.",
  application_order_execution_started:
    "Diese Bestellung kann nicht gelöscht werden, weil ihre Ausführung bereits begonnen hat.",
  application_deletions_unavailable:
    "Bestellungen können auf diesem Server noch nicht gelöscht werden.",
  application_runner_revision_required:
    "Diese Bestellung verwendet eine Accelerator-Revision, die der Application-Runner nicht unterstützt. Bitte eine neue Template-Version mit der freigegebenen Runner-Revision veröffentlichen und neu bestellen.",
  application_job_identity_unavailable:
    "Der STACKIT-Nachweis für diesen Plan ist abgelaufen. Bitte erneut mit STACKIT anmelden.",
  application_dispatch_disabled:
    "Der Application-Plan-Runner ist nicht aktiviert.",
  application_dispatch_failed:
    "Der Application-Plan konnte nicht gestartet werden.",
  application_jobs_unavailable:
    "Application-Plan-Jobs sind auf diesem Server nicht verfügbar.",
  application_backend_binding_conflict:
    "Für diesen Plan ist bereits ein anderes State-Backend freigegeben.",
  application_instance_running:
    "Für diese Bestellung läuft bereits ein Plan oder eine Klärung ist erforderlich.",
  application_dispatch_grant_consumed:
    "Diese Plan-Freigabe wurde bereits verwendet. Bitte den Status aktualisieren.",
  application_job_grant_unavailable:
    "Die Plan-Freigabe ist nicht mehr gültig. Bitte einen neuen Plan vorbereiten.",
  application_order_decision_conflict:
    "Die Bestellung wurde bereits anders entschieden. Bitte die Bestellungen aktualisieren.",
  application_approval_not_required:
    "Diese Bestellung benötigt keine Freigabe.",
  application_order_not_approved:
    "Die Bestellung ist noch nicht freigegeben oder wurde abgelehnt.",
  application_decisions_unavailable:
    "Bestellentscheidungen sind auf diesem Server noch nicht verfügbar.",
  authentication_required: "Bitte erneut anmelden.",
  application_access_denied:
    "Deine aktuelle Mitgliedschaft erlaubt diesen Zugriff nicht.",
  invalid_request_origin_or_csrf:
    "Der Arbeitsbereich oder die Sitzung wurde geändert. Bitte neu laden.",
  invalid_application_request:
    "Das Template oder die Bestellung ist ungültig. Prüfe die freigegebenen Bestellwerte.",
  template_version_not_found:
    "Diese Template-Version ist in deinem Arbeitsbereich nicht verfügbar.",
  template_version_retired: "Diese Template-Version wurde stillgelegt.",
  template_retirement_failed:
    "Die Template-Version konnte nicht stillgelegt werden.",
  idempotency_conflict:
    "Dieser Bestellschlüssel gehört zu einer anderen Bestellung. Bitte den Bestellentwurf neu öffnen.",
  verified_platform_organization_required:
    "Bitte mit STACKIT anmelden und die Organisation dieses Tenants prüfen, bevor du einen Plattformvertrag freigibst.",
  application_technical_access_unavailable:
    "Der technische STACKIT-Zugang ist auf diesem Server noch nicht angebunden.",
  application_credential_required:
    "Bitte einen gespeicherten technischen STACKIT-Zugang auswählen.",
  application_technical_access_failed:
    "Der gespeicherte Service Account konnte für diese Organisation nicht bestätigt werden.",
  platform_contract_not_found:
    "Der Plattformvertrag ist in diesem Arbeitsbereich nicht verfügbar.",
  invalid_application_target:
    "Das Plattformziel passt nicht zur Projektart und Region des Templates.",
  application_platform_contract_required:
    "Diese Template-Version benötigt einen freigegebenen Plattformvertrag.",
  application_platform_source_unavailable:
    "Die angewendete Plattform ist nicht mehr aktuell oder der Organisationsnachweis ist abgelaufen.",
  application_platform_source_changed:
    "Die Plattformquelle hat sich geändert. Bitte erneut prüfen.",
  verified_application_identity_required:
    "Bitte mit STACKIT für die Organisation dieses Tenants erneut anmelden.",
  application_owner_identity_changed:
    "Die verifizierte Besteller-E-Mail hat sich geändert. Bitte eine neue Bestellung anlegen.",
  application_policy_mismatch:
    "Die Bereitstellungsrichtlinie dieser Bestellung stimmt nicht mit der veröffentlichten Version überein.",
  application_parameters_not_qualified:
    "Die Bestellparameter sind noch nicht vollständig qualifiziert.",
  application_plan_scope_not_supported:
    "Der MVP-Plan unterstützt Public-Projekte mit lokalem Netz, optionaler Observability und ohne Namespace-Dienste.",
  application_instance_not_found:
    "Diese eigene Bestellung ist in diesem Arbeitsbereich nicht verfügbar.",
};

const applicationResourceNames: Record<string, string> = {
  stackit_resourcemanager_project: "Projekt",
  stackit_network: "Netzwerk",
  stackit_authorization_project_role_assignment: "Projektberechtigung",
  stackit_authorization_project_custom_role: "Projektrolle",
  stackit_service_account: "Service Account",
  stackit_service_account_key: "Service-Account-Schlüssel",
  stackit_secretsmanager_instance: "Secrets Manager",
  stackit_observability_instance: "Observability",
  stackit_objectstorage_bucket: "Object-Storage-Bucket",
  stackit_objectstorage_credentials_group: "Object-Storage-Zugangsgruppe",
  stackit_objectstorage_credential: "Object-Storage-Zugang",
  stackit_dns_zone: "DNS-Zone",
  stackit_routing_table: "Routing-Tabelle",
  stackit_routing_table_route: "Route",
  terraform_data: "Plattformbindung",
  time_rotating: "Schlüsselrotation",
};

const approvedContractSchema = z.object({
  document: platformContractSchema,
  approvedBy: z.uuid(),
  approvedAt: z.iso.datetime(),
});
const appliedPlatformsSchema = z.object({
  platforms: z
    .array(
      z.object({
        id: z.uuid(),
        stateKey: appliedPlatformSourceSchema.shape.stateKey,
        stateVersion: z.string().regex(/^[1-9][0-9]*$/),
        organizationId: z.uuid(),
        finishedAt: z.iso.datetime(),
        configurationName: z.string().min(1).max(256).default("Plattform"),
      }),
    )
    .max(100),
});
const appliedPreviewSchema = z.object({
  document: platformContractSchema,
  source: appliedPlatformSourceSchema,
});
const contractImportSchema = platformContractSchema.omit({
  tenant_id: true,
  revision: true,
});
const planInputSchema = z.object({
  kind: z.literal("application-plan-input"),
  cloudPlanExecuted: z.literal(false),
  requiresExplicitApplyApproval: z.literal(true).optional(),
  blockers: z.array(z.string()),
  plan: z.object({
    entrypoint: z.literal("src/application"),
    acceleratorRevision: z.string().regex(/^[0-9a-f]{40}$/),
    stateKey: applicationInstanceSchema.shape.stateKey,
    requestedBy: z.uuid(),
    executionEnabled: z.literal(false),
    variables: z.record(z.string(), z.json()),
  }),
});

async function request(
  path: string,
  session: Session,
  body?: unknown,
  signal?: AbortSignal,
  method: "POST" | "DELETE" = "POST",
) {
  const response = await fetch(`/api/v1/applications/${path}`, {
    method: body === undefined ? "GET" : method,
    headers: {
      "x-lzc-tenant": session.tenant?.id ?? "",
      ...(body === undefined
        ? {}
        : {
            "content-type": "application/json",
            "x-lzc-csrf": session.csrfToken,
          }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  });
  if (
    response.status === 404 &&
    ["templates", "platform-contracts"].includes(path)
  )
    throw new Error(
      "Der Katalog für Application Landing Zones ist auf diesem Server noch nicht aktiviert.",
    );
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = z.object({ error: z.string() }).safeParse(payload);
    throw new Error(
      code.success
        ? (errors[code.data.error] ??
            "Der Application-Dienst ist derzeit nicht erreichbar.")
        : "Der Application-Dienst ist derzeit nicht erreichbar.",
    );
  }
  if (payload === null)
    throw new Error("Der Application-Dienst ist derzeit nicht erreichbar.");
  return payload;
}

type OrderView =
  | "overview"
  | "plan"
  | "apply"
  | "history"
  | "destroy"
  | "drift";

function ApplicationOrderExecutionStatus({
  instance,
  session,
  active,
  available,
  selected,
  onOpen,
}: {
  instance: ApplicationInstance;
  session: Session;
  active: boolean;
  available: boolean;
  selected: boolean;
  onOpen: (view: "plan" | "apply" | "destroy" | "drift") => void;
}) {
  const [execution, setExecution] = useState<{
    job?: z.infer<typeof applicationPlanJobSchema>;
    failed?: boolean;
  } | null>(null);
  useEffect(() => {
    if (!active || !available) return;
    const controller = new AbortController();
    let timer: number | undefined;
    let polling = selected;
    async function refresh() {
      try {
        const result = z
          .object({ jobs: z.array(applicationPlanJobSchema).max(50) })
          .parse(
            await request(
              `instances/${instance.id}/jobs`,
              session,
              undefined,
              controller.signal,
            ),
          );
        if (controller.signal.aborted) return;
        const job = result.jobs[0];
        setExecution(job ? { job } : {});
        polling =
          selected ||
          !!(
            job &&
            !["succeeded", "failed", "reconciliation_required"].includes(
              job.status,
            )
          );
      } catch {
        if (controller.signal.aborted) return;
        setExecution({ failed: true });
      }
      if (!controller.signal.aborted && polling)
        timer = window.setTimeout(() => void refresh(), 5000);
    }
    void refresh();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [active, available, instance, session, selected]);
  if (!available || execution?.failed)
    return <span className="muted">{t("Status nicht verfügbar")}</span>;
  if (!execution)
    return <span className="muted">{t("Status wird geladen")}</span>;
  if (!execution.job)
    return <span className="muted">{t("Noch keine Ausführung")}</span>;
  const job = execution.job;
  const tone = ["failed", "reconciliation_required"].includes(job.status)
    ? "error"
    : job.status === "succeeded"
      ? "success"
      : "pending";
  return (
    <button
      type="button"
      className="application-order-status"
      data-tone={tone}
      title={t("Details anzeigen")}
      onClick={() => {
        onOpen(job.purpose === "standard" ? job.operation : job.purpose);
        window.requestAnimationFrame(() =>
          document
            .getElementById("application-order-details")
            ?.scrollIntoView({ block: "start" }),
        );
      }}
    >
      {t(
        job.purpose === "destroy"
          ? "Destroy"
          : job.purpose === "drift"
            ? "Drift"
            : job.operation === "apply"
              ? "Apply"
              : "Plan",
      )}
      {" · "}
      {t(
        {
          prepared: "Vorbereitet",
          reserved: "Reserviert",
          starting: "Startet",
          initializing: "Backend wird initialisiert",
          validating: "Terraform wird validiert",
          planning: "Läuft",
          applying: "Läuft",
          succeeded: "Erfolgreich",
          failed: "Fehlgeschlagen",
          reconciliation_required: "Abschluss prüfen",
        }[job.status],
      )}
    </button>
  );
}

function ApplicationPlanControls({
  instance,
  session,
  planEnabled,
  applyEnabled,
  delegationRequired = false,
  view,
  onViewChange,
  onTerminal,
}: {
  instance: ApplicationInstance;
  session: Session;
  planEnabled: boolean;
  applyEnabled: boolean;
  delegationRequired?: boolean;
  view: OrderView;
  onViewChange: (view: OrderView) => void;
  onTerminal: (signal?: AbortSignal) => Promise<void>;
}) {
  const [jobs, setJobs] = useState<z.infer<typeof applicationPlanJobSchema>[]>(
    [],
  );
  const [backends, setBackends] = useState<{ id: string; bucket: string }[]>(
    [],
  );
  const [backendId, setBackendId] = useState("");
  const [confirmedBackendJob, setConfirmedBackendJob] = useState("");
  const [jobKey, setJobKey] = useState(() => crypto.randomUUID());
  const maintenanceKeys = useRef({
    destroy: crypto.randomUUID(),
    drift: crypto.randomUUID(),
  });
  const [destroyConfirmed, setDestroyConfirmed] = useState(false);
  const preparedJob = useRef<string | null>(null);
  const initialViewSelected = useRef(false);
  const terminalRefreshed = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [output, setOutput] = useState<{
    jobId: string;
    text: string;
    truncated: boolean;
  } | null>(null);
  const [outputError, setOutputError] = useState("");
  const [preview, setPreview] = useState<
    | (z.infer<typeof applicationPlanPreviewSchema> & {
        jobId: string;
        artifactSha256: string;
      })
    | null
  >(null);
  const purpose = view === "destroy" || view === "drift" ? view : "standard";
  const planView = view === "plan" || view === "destroy" || view === "drift";
  const currentPlan = jobs.find(
    (job) => job.operation === "plan" && job.purpose === purpose,
  );
  const currentApply = jobs.find(
    (job) => job.operation === "apply" && job.purpose === purpose,
  );
  const previewJobId =
    planView &&
    currentPlan?.status === "succeeded" &&
    currentPlan.requestedBy === session.user.id
      ? currentPlan.id
      : undefined;
  const loadPreview = useCallback(
    async (jobId: string, signal?: AbortSignal) => {
      const result = applicationPlanPreviewSchema
        .extend({
          jobId: z.uuid(),
          artifactSha256: z.string().regex(/^[0-9a-f]{64}$/),
        })
        .parse(
          await request(`jobs/${jobId}/preview`, session, undefined, signal),
        );
      if (!signal?.aborted) setPreview(result);
    },
    [session],
  );
  useEffect(() => {
    setPreview(null);
    setDestroyConfirmed(false);
    if (!previewJobId) return;
    const controller = new AbortController();
    void loadPreview(previewJobId, controller.signal).catch(
      (cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Die Ressourcen-Vorschau konnte nicht geladen werden.",
          );
      },
    );
    return () => controller.abort();
  }, [previewJobId, loadPreview]);
  const isEngineer =
    session.tenant?.kind !== "organisation" ||
    session.tenant.roles?.includes("platform-engineer");
  const approved =
    instance.approval?.status === "approved" ||
    instance.deploymentPolicy === "direct";
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const result = z
        .object({ jobs: z.array(applicationPlanJobSchema).max(50) })
        .parse(
          await request(
            `instances/${instance.id}/jobs`,
            session,
            undefined,
            signal,
          ),
        );
      if (signal?.aborted) return;
      setJobs(result.jobs);
      if (!initialViewSelected.current) {
        initialViewSelected.current = true;
        if (
          result.jobs[0]?.purpose === "destroy" ||
          result.jobs[0]?.purpose === "drift"
        )
          onViewChange(result.jobs[0].purpose);
        else if (result.jobs[0]?.operation === "apply") onViewChange("apply");
      }
      if (
        !terminalRefreshed.current &&
        result.jobs.some(
          (job) =>
            job.operation === "apply" &&
            ["succeeded", "failed", "reconciliation_required"].includes(
              job.status,
            ),
        )
      ) {
        await onTerminal(signal);
        if (signal?.aborted) return;
        terminalRefreshed.current = true;
      }
      if (
        preparedJob.current &&
        result.jobs.some((job) => job.id === preparedJob.current)
      ) {
        const completed = result.jobs.find(
          (job) => job.id === preparedJob.current,
        );
        if (completed?.purpose === "destroy" || completed?.purpose === "drift")
          maintenanceKeys.current[completed.purpose] = crypto.randomUUID();
        preparedJob.current = null;
        setJobKey(crypto.randomUUID());
      }
      if (isEngineer && result.jobs.some((job) => job.canApproveBackend)) {
        const response = await fetch("/api/v1/backends", {
          headers: { "x-lzc-tenant": session.tenant?.id ?? "" },
          ...(signal ? { signal } : {}),
        });
        if (!response.ok)
          throw new Error("State-Backends konnten nicht geladen werden.");
        const stored = z
          .object({
            backends: z
              .array(
                z.object({
                  id: z.uuid(),
                  descriptor: z.object({ bucket: z.string() }),
                }),
              )
              .max(100),
          })
          .parse(await response.json());
        if (signal?.aborted) return;
        setBackends(
          stored.backends.map((item) => ({
            id: item.id,
            bucket: item.descriptor.bucket,
          })),
        );
      }
      setLoaded(true);
    },
    [instance.id, session, isEngineer, onViewChange, onTerminal],
  );
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch((cause: unknown) => {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Der Planstatus konnte nicht geladen werden.",
        );
    });
    return () => controller.abort();
  }, [refresh]);
  const running = jobs.some(
    (job) =>
      !["prepared", "succeeded", "failed", "reconciliation_required"].includes(
        job.status,
      ),
  );
  const outputJobId =
    (view === "apply" || view === "destroy") &&
    currentApply?.requestedBy === session.user.id
      ? currentApply?.id
      : undefined;
  const outputPolling = Boolean(
    currentApply &&
      !["succeeded", "failed", "reconciliation_required"].includes(
        currentApply.status,
      ),
  );
  const loadOutput = useCallback(
    async (jobId: string, signal?: AbortSignal) => {
      const result = z
        .strictObject({
          text: z.string().max(2 * 1024 * 1024),
          truncated: z.boolean(),
          kind: z.enum(["live", "execution"]),
        })
        .parse(
          await request(`jobs/${jobId}/output`, session, undefined, signal),
        );
      if (!signal?.aborted) {
        setOutput({ jobId, text: result.text, truncated: result.truncated });
        setOutputError("");
      }
    },
    [session],
  );
  useEffect(() => {
    setOutput(null);
    setOutputError("");
    if (!outputJobId) return;
    const controller = new AbortController();
    const refreshOutput = () =>
      void loadOutput(outputJobId, controller.signal).catch(
        (cause: unknown) => {
          if (!controller.signal.aborted)
            setOutputError(
              cause instanceof Error
                ? cause.message
                : "Die Ausführungslogs sind derzeit nicht verfügbar.",
            );
        },
      );
    refreshOutput();
    const interval = outputPolling
      ? window.setInterval(refreshOutput, 5000)
      : undefined;
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [outputJobId, outputPolling, loadOutput]);
  useEffect(() => {
    if (!running) return;
    const controller = new AbortController();
    const interval = window.setInterval(() => {
      void refresh(controller.signal).catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Der Planstatus konnte nicht geladen werden.",
          );
      });
    }, 5000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [running, refresh]);
  async function mutate(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      const response = await request(path, session, body);
      if (path === `instances/${instance.id}/plan`)
        preparedJob.current = z
          .object({ jobId: z.uuid() })
          .parse(response).jobId;
      setConfirmedBackendJob("");
      setDestroyConfirmed(false);
      await refresh();
      onViewChange(
        purpose === "standard"
          ? path.endsWith("/apply")
            ? "apply"
            : "plan"
          : purpose,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Der Application-Dienst ist derzeit nicht erreichbar.",
      );
    } finally {
      setBusy(false);
    }
  }
  const pending = jobs.some(
    (job) =>
      (job.status === "prepared" && job.grantActive) ||
      (!["prepared", "succeeded", "failed"].includes(job.status) &&
        !(
          purpose !== "standard" &&
          job.status === "reconciliation_required" &&
          new Date(job.expiresAt).getTime() <= Date.now()
        )),
  );
  return (
    <section aria-label={t("Application-Plan")}>
      <h3>
        {t(
          view === "apply"
            ? "Apply"
            : view === "destroy"
              ? "Destroy"
              : view === "drift"
                ? "Drift"
                : view === "history"
                  ? "Verlauf"
                  : "Application-Plan",
        )}
      </h3>
      {error && <p role="alert">{t(error)}</p>}
      <button
        type="button"
        className="button secondary icon-button"
        aria-label={t("Planstatus aktualisieren")}
        title={t("Planstatus aktualisieren")}
        disabled={busy}
        onClick={() => {
          setError("");
          void refresh().catch((cause: unknown) =>
            setError(
              cause instanceof Error
                ? cause.message
                : "Der Planstatus konnte nicht geladen werden.",
            ),
          );
        }}
      >
        <RefreshCw size={18} aria-hidden="true" />
      </button>
      {!planEnabled && (
        <p>{t("Der Application-Plan-Runner ist nicht aktiviert.")}</p>
      )}
      {planView && instance.requestedBy === session.user.id && approved && (
        <fieldset
          disabled={
            busy ||
            !loaded ||
            !planEnabled ||
            pending ||
            (delegationRequired && instance.executionConfigured !== true)
          }
        >
          <legend>
            {t(
              purpose === "destroy"
                ? "Destroy-Plan"
                : purpose === "drift"
                  ? "Drift-Prüfung"
                  : "Cloud-Plan",
            )}
          </legend>
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              void mutate(`instances/${instance.id}/plan`, {
                idempotencyKey:
                  purpose === "standard"
                    ? jobKey
                    : maintenanceKeys.current[purpose],
                ...(purpose !== "standard" ? { purpose } : {}),
              })
            }
          >
            {purpose === "destroy" ? (
              <Trash2 size={18} aria-hidden="true" />
            ) : purpose === "drift" ? (
              <RefreshCw size={18} aria-hidden="true" />
            ) : null}
            {t(
              purpose === "destroy"
                ? "Destroy-Plan erstellen"
                : purpose === "drift"
                  ? "Drift prüfen"
                  : "Cloud-Plan starten",
            )}
          </button>
        </fieldset>
      )}
      {loaded && !jobs.length && <p>{t("Noch kein Plan vorbereitet")}</p>}
      {view === "apply" && loaded && !currentApply && (
        <>
          <p>{t("Noch kein Apply gestartet")}</p>
          <button
            type="button"
            className="button secondary"
            onClick={() => onViewChange("plan")}
          >
            {t("Zum Plan")}
          </button>
        </>
      )}
      {delegationRequired && instance.executionConfigured !== true && (
        <p>
          {t(
            "Die Plattform-Ausführung ist noch nicht eingerichtet. Bitte den Platform Owner kontaktieren.",
          )}
        </p>
      )}
      {jobs
        .filter(
          (job) =>
            view === "history" ||
            (planView && job.id === currentPlan?.id) ||
            ((view === "apply" || view === "destroy") &&
              job.id === currentApply?.id),
        )
        .map((job) => (
          <article key={job.id} className="application-plan-job">
            <h4>
              {job.purpose === "destroy"
                ? t(
                    job.operation !== "apply"
                      ? "Destroy-Plan"
                      : job.status === "succeeded"
                        ? "Application Landing Zone gelöscht"
                        : job.status === "reconciliation_required"
                          ? "Application-Destroy: Abschluss prüfen"
                          : job.status === "failed"
                            ? "Application-Destroy fehlgeschlagen"
                            : "Application Landing Zone wird gelöscht",
                  )
                : job.purpose === "drift"
                  ? t("Drift-Prüfung")
                  : t(
                      job.operation === "apply" && job.status === "succeeded"
                        ? "Application Landing Zone erstellt"
                        : job.operation === "apply" &&
                            job.status === "reconciliation_required"
                          ? "Application-Apply: Abschluss prüfen"
                          : job.operation === "apply" && job.status === "failed"
                            ? "Application-Apply fehlgeschlagen"
                            : {
                                prepared: "Plan vorbereitet",
                                reserved: "Plan reserviert",
                                starting: "Plan startet",
                                initializing: "Backend wird initialisiert",
                                validating: "Terraform wird validiert",
                                planning: "Cloud-Plan läuft",
                                applying:
                                  "Application Landing Zone wird erstellt",
                                succeeded: "Cloud-Plan erfolgreich",
                                failed: "Cloud-Plan fehlgeschlagen",
                                reconciliation_required:
                                  "Planstatus muss geklärt werden",
                              }[job.status],
                    )}
            </h4>
            {job.operation === "apply" &&
              (view === "apply" || view === "destroy") && (
                <>
                  {!["failed", "reconciliation_required"].includes(
                    job.status,
                  ) && (
                    <ol
                      className="application-execution-steps"
                      aria-label={t("Bereitstellungsfortschritt")}
                    >
                      {["Backend", "Validierung", "Bereitstellung"].map(
                        (label, index) => {
                          const progress = [
                            "initializing",
                            "validating",
                            "applying",
                            "succeeded",
                          ].indexOf(job.status);
                          return (
                            <li
                              key={label}
                              data-status={
                                progress > index
                                  ? "complete"
                                  : progress === index
                                    ? "current"
                                    : "pending"
                              }
                            >
                              {t(label)}
                            </li>
                          );
                        },
                      )}
                    </ol>
                  )}
                  {job.status === "reconciliation_required" && (
                    <p role="alert">
                      {job.errorCode === "runner_report_missing" && (
                        <>
                          {t(
                            "Die Ausführung ist beendet, aber ihre Abschlussmeldung fehlt. Historische Logs konnten nicht wiederhergestellt werden.",
                          )}{" "}
                        </>
                      )}
                      {t(
                        "Es können bereits Cloud-Ressourcen angelegt worden sein. State und Ressourcen müssen vor einem weiteren Apply geklärt werden. Archivieren löscht keine Cloud-Ressourcen.",
                      )}
                    </p>
                  )}
                </>
              )}
            {(view === "apply" || view === "destroy") &&
              job.operation === "apply" &&
              job.requestedBy === session.user.id && (
                <details open className="application-output">
                  <summary>{t("Ausführungslogs")}</summary>
                  <button
                    type="button"
                    className="button secondary icon-button"
                    aria-label={t("Ausführungslogs aktualisieren")}
                    title={t("Ausführungslogs aktualisieren")}
                    onClick={() =>
                      void loadOutput(job.id).catch((cause: unknown) =>
                        setOutputError(
                          cause instanceof Error
                            ? cause.message
                            : "Die Ausführungslogs sind derzeit nicht verfügbar.",
                        ),
                      )
                    }
                  >
                    <RefreshCw size={18} aria-hidden="true" />
                  </button>
                  {outputError && <p role="alert">{t(outputError)}</p>}
                  {output?.jobId === job.id && output.text ? (
                    <section aria-label={t("Ausführungslogs")}>
                      <pre>{output.text}</pre>
                    </section>
                  ) : (
                    <p>{t("Noch keine Ausführungslogs verfügbar.")}</p>
                  )}
                  {output?.jobId === job.id && output.truncated && (
                    <p>{t("Die Ausführungslogs wurden gekürzt.")}</p>
                  )}
                </details>
              )}
            <details>
              <summary>{t("Ausführungsdetails")}</summary>
              <dl className="application-properties">
                <dt>
                  {t(job.operation === "apply" ? "Apply-Job" : "Plan-Job")}
                </dt>
                <dd>{job.id}</dd>
                <dt>{t("Erstellt am")}</dt>
                <dd>
                  {new Date(job.createdAt).toLocaleString(currentLanguage())}
                </dd>
                {job.status === "prepared" && (
                  <>
                    <dt>{t("Freigabe gültig bis")}</dt>
                    <dd>
                      {new Date(job.expiresAt).toLocaleString(
                        currentLanguage(),
                      )}
                    </dd>
                  </>
                )}
                {job.backendId && (
                  <>
                    <dt>{t("State-Backend")}</dt>
                    <dd>{job.backendId}</dd>
                  </>
                )}
              </dl>
            </details>
            {view !== "history" &&
              job.status === "prepared" &&
              !job.grantActive && (
                <p>
                  {t(
                    "Die Plan-Freigabe ist nicht mehr gültig. Bitte einen neuen Plan vorbereiten.",
                  )}
                </p>
              )}
            {job.status === "prepared" &&
              job.grantActive &&
              !job.delegatedExecution &&
              job.approvedBy !== session.user.id && (
                <p>{t("Technische Plan-Freigabe ausstehend")}</p>
              )}
            {planView && planEnabled && isEngineer && job.canApproveBackend && (
              <fieldset disabled={busy}>
                <legend>{t("State-Backend freigeben")}</legend>
                <label htmlFor={`application-backend-${job.id}`}>
                  {t("State-Backend")}
                </label>
                <select
                  id={`application-backend-${job.id}`}
                  value={backendId}
                  onChange={(event) => {
                    setBackendId(event.target.value);
                    setConfirmedBackendJob("");
                  }}
                >
                  <option value="">{t("State-Backend wählen")}</option>
                  {backends.map((backend) => (
                    <option key={backend.id} value={backend.id}>
                      {backend.bucket}
                    </option>
                  ))}
                </select>
                <p>
                  <code>{instance.stateKey}</code>
                </p>
                <label>
                  <input
                    type="checkbox"
                    checked={confirmedBackendJob === job.id}
                    onChange={(event) =>
                      setConfirmedBackendJob(event.target.checked ? job.id : "")
                    }
                  />
                  {t("State-Backend-Freigabe bestätigen")}
                </label>
                <button
                  type="button"
                  className="button secondary"
                  disabled={!backendId || confirmedBackendJob !== job.id}
                  onClick={() =>
                    void mutate(`jobs/${job.id}/backend-approval`, {
                      stateBackendId: backendId,
                      confirmBackendApproval: true,
                    })
                  }
                >
                  {t("State-Backend freigeben")}
                </button>
              </fieldset>
            )}
            {planView && planEnabled && job.canDispatch && (
              <fieldset disabled={busy}>
                <legend>{t("Cloud-Plan")}</legend>
                <button
                  type="button"
                  className="button primary"
                  onClick={() =>
                    void mutate(`jobs/${job.id}/dispatch`, {
                      confirmPlan: true,
                    })
                  }
                >
                  {t("Cloud-Plan starten")}
                </button>
              </fieldset>
            )}
            {job.errorCode && job.errorCode !== "runner_report_missing" && (
              <p role="alert">
                {t(
                  job.operation === "apply"
                    ? "Application-Apply fehlgeschlagen"
                    : "Cloud-Plan fehlgeschlagen",
                )}
                : <code>{job.errorCode}</code>
              </p>
            )}
            {job.summary && (
              <dl className="application-properties">
                <dt>{t("Anlegen")}</dt>
                <dd>{job.summary.resources.create}</dd>
                <dt>{t("Ändern")}</dt>
                <dd>{job.summary.resources.update}</dd>
                <dt>{t("Ersetzen")}</dt>
                <dd>{job.summary.resources.replace}</dd>
                <dt>{t("Löschen")}</dt>
                <dd>{job.summary.resources.delete}</dd>
                <dt>{t("Destruktive Änderungen")}</dt>
                <dd>{t(job.summary.destructive ? "Ja" : "Nein")}</dd>
              </dl>
            )}
            {planView &&
              job.operation === "plan" &&
              job.status === "succeeded" &&
              job.requestedBy === session.user.id && (
                <>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      void loadPreview(job.id).catch((cause: unknown) =>
                        setError(
                          cause instanceof Error
                            ? cause.message
                            : "Die Ressourcen-Vorschau konnte nicht geladen werden.",
                        ),
                      )
                    }
                  >
                    {t("Ressourcen-Vorschau aktualisieren")}
                  </button>
                  {preview?.jobId === job.id && (
                    <div className="application-resource-preview">
                      <h4>
                        {t(
                          purpose === "drift"
                            ? "Cloud → Soll-Konfiguration"
                            : purpose === "destroy"
                              ? "Zu löschende Ressourcen"
                              : "Geplante Ressourcen",
                        )}
                      </h4>
                      {purpose === "drift" && (
                        <p>
                          {t(
                            "Prüfumfang: Ressourcen dieses Application-States. Nicht erfasste Cloud-Ressourcen sind nicht enthalten.",
                          )}
                        </p>
                      )}
                      {purpose === "drift" && (
                        <p>
                          {t(
                            "Abweichungen zwischen gespeichertem State und Cloud",
                          )}
                          : {preview.drift.length}
                        </p>
                      )}
                      {purpose === "drift" &&
                        preview.drift.map((resource) => (
                          <details
                            key={`drift:${resource.type}:${resource.name}:${JSON.stringify(resource.attributes)}`}
                          >
                            <summary>
                              {t("State → Cloud")} ·{" "}
                              {t(
                                resource.action === "delete"
                                  ? "Fehlt in der Cloud"
                                  : "Geändert in der Cloud",
                              )}{" "}
                              ·{" "}
                              <code>
                                {resource.type}.{resource.name}
                              </code>
                            </summary>
                            <dl className="application-properties">
                              {resource.attributes.map((attribute) => (
                                <div
                                  key={attribute.name}
                                  className="application-resource-attribute"
                                >
                                  <dt>{t(attribute.name)}</dt>
                                  <dd>
                                    {attribute.sensitive
                                      ? t("Sensibler Wert")
                                      : `${attribute.before ?? "-"} → ${attribute.unknown ? t("Erst nach Apply bekannt") : (attribute.after ?? "-")}`}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          </details>
                        ))}
                      {preview.resources.map((resource) => (
                        <details
                          key={`${resource.type}:${resource.name}:${JSON.stringify(resource.attributes)}`}
                        >
                          <summary>
                            {t(
                              {
                                create: "Anlegen",
                                update: "Ändern",
                                replace: "Ersetzen",
                                delete: "Löschen",
                                read: "Lesen",
                                unchanged: "Unverändert",
                              }[resource.action],
                            )}{" "}
                            ·{" "}
                            {t(
                              applicationResourceNames[resource.type] ??
                                resource.type,
                            )}{" "}
                            ·{" "}
                            <code>
                              {resource.type}.{resource.name}
                            </code>
                          </summary>
                          <dl className="application-properties">
                            {resource.attributes.map((attribute) => (
                              <div
                                key={attribute.name}
                                className="application-resource-attribute"
                              >
                                <dt>{t(attribute.name)}</dt>
                                <dd>
                                  {attribute.sensitive ? (
                                    t("Sensibler Wert")
                                  ) : (
                                    <>
                                      {attribute.before !== null &&
                                        resource.action !== "create" && (
                                          <span>
                                            {String(attribute.before)} →{" "}
                                          </span>
                                        )}
                                      {attribute.unknown
                                        ? t("Erst nach Apply bekannt")
                                        : attribute.after === null
                                          ? "-"
                                          : String(attribute.after)}
                                    </>
                                  )}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                      ))}
                      {purpose === "destroy" &&
                        applyEnabled &&
                        job.canApply && (
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={destroyConfirmed}
                              onChange={(event) =>
                                setDestroyConfirmed(event.target.checked)
                              }
                            />
                            {t(
                              "Ich bestätige das Löschen der Ressourcen dieser Application Landing Zone.",
                            )}
                          </label>
                        )}
                      {purpose !== "drift" && applyEnabled && job.canApply && (
                        <button
                          type="button"
                          className="button primary"
                          disabled={
                            busy ||
                            pending ||
                            (purpose === "destroy" && !destroyConfirmed)
                          }
                          onClick={() =>
                            void mutate(`jobs/${job.id}/apply`, {
                              artifactSha256: preview.artifactSha256,
                              ...(purpose === "destroy"
                                ? {
                                    confirmDestroy: true,
                                    instanceId: instance.id,
                                  }
                                : {}),
                            })
                          }
                        >
                          {purpose === "destroy" && (
                            <Trash2 size={18} aria-hidden="true" />
                          )}
                          {t(
                            purpose === "destroy"
                              ? "Application Landing Zone löschen"
                              : "Application Landing Zone erstellen",
                          )}
                        </button>
                      )}
                      {jobs.some(
                        (candidate) =>
                          candidate.operation === "apply" &&
                          candidate.planId === job.id,
                      ) && (
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() =>
                            onViewChange(
                              purpose === "destroy" ? "destroy" : "apply",
                            )
                          }
                        >
                          {t(
                            purpose === "destroy"
                              ? "Destroy anzeigen"
                              : "Apply anzeigen",
                          )}
                        </button>
                      )}
                      {purpose !== "drift" &&
                        applyEnabled &&
                        !job.canApply &&
                        !jobs.some(
                          (candidate) =>
                            candidate.operation === "apply" &&
                            candidate.planId === job.id,
                        ) && (
                          <p>
                            {t(
                              "Dieser Plan ist nicht mehr ausführbar. Bitte einen neuen Cloud-Plan starten.",
                            )}
                          </p>
                        )}
                    </div>
                  )}
                </>
              )}
            {view === "plan" &&
              job.status === "prepared" &&
              !job.grantActive &&
              instance.requestedBy === session.user.id && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy || pending}
                  onClick={() => {
                    setJobKey(crypto.randomUUID());
                  }}
                >
                  {t("Neuen Plan vorbereiten")}
                </button>
              )}
          </article>
        ))}
    </section>
  );
}

export function Applications({
  session,
  draft,
  onSelectConfiguration,
}: {
  session: Session | null;
  draft: CommonConfiguration | null;
  onSelectConfiguration: () => void;
}) {
  const [versions, setVersions] = useState<PublishedProjectTemplate[]>([]);
  const [instances, setInstances] = useState<ApplicationInstance[]>([]);
  const [versionId, setVersionId] = useState("");
  const [retirementEnabled, setRetirementEnabled] = useState(false);
  const [deploymentPolicyEnabled, setDeploymentPolicyEnabled] = useState(false);
  const [orderDecisionEnabled, setOrderDecisionEnabled] = useState(false);
  const [orderDeletionEnabled, setOrderDeletionEnabled] = useState(false);
  const [runnerRevision, setRunnerRevision] = useState<string | null>(null);
  const [planJobsEnabled, setPlanJobsEnabled] = useState(false);
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [planEnabled, setPlanEnabled] = useState(false);
  const [applyEnabled, setApplyEnabled] = useState(false);
  const [planRefresh, setPlanRefresh] = useState(0);
  const [delegationRequired, setDelegationRequired] = useState(false);
  const [delegationEnabled, setDelegationEnabled] = useState(false);
  const [executionBindings, setExecutionBindings] = useState<
    {
      id: string;
      platformRevision: string;
      backendId: string;
      configuredBy: string;
    }[]
  >([]);
  const [executionBackends, setExecutionBackends] = useState<
    { id: string; bucket: string }[]
  >([]);
  const [executionRevision, setExecutionRevision] = useState("");
  const [executionBackend, setExecutionBackend] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [confirmOrderDecision, setConfirmOrderDecision] = useState(false);
  const [groupAccessEnabled, setGroupAccessEnabled] = useState(false);
  const [applicationGroups, setApplicationGroups] = useState<
    z.infer<typeof applicationGroupsSchema>
  >({ groups: [], members: [] });
  const [publicationGroupIds, setPublicationGroupIds] = useState<
    string[] | null
  >(null);
  const [versionGroupIds, setVersionGroupIds] = useState<string[]>([]);
  const [confirmGroupAccess, setConfirmGroupAccess] = useState(false);
  const [deploymentPolicy, setDeploymentPolicy] =
    useState<NonNullable<PublishedProjectTemplate["deploymentPolicy"]>>(
      "approval-required",
    );
  const [confirmRetirement, setConfirmRetirement] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [contracts, setContracts] = useState<
    z.infer<typeof approvedContractSchema>[]
  >([]);
  const [platformRevision, setPlatformRevision] = useState("");
  const [activeTab, setActiveTab] = useState<string | null>(() =>
    draft ? "publish" : "catalogue",
  );
  const [appliedPlatformsEnabled, setAppliedPlatformsEnabled] = useState(false);
  const [appliedPlatforms, setAppliedPlatforms] = useState<
    z.infer<typeof appliedPlatformsSchema>["platforms"]
  >([]);
  const [applyRunId, setApplyRunId] = useState("");
  const [appliedPreview, setAppliedPreview] = useState<
    (z.infer<typeof appliedPreviewSchema> & { session: Session }) | null
  >(null);
  const [technicalProfiles, setTechnicalProfiles] = useState<
    { id: string; name: string }[]
  >([]);
  const [credentialProfileId, setCredentialProfileId] = useState("");
  const [targetKey, setTargetKey] = useState("");
  const [contractCandidate, setContractCandidate] = useState<z.infer<
    typeof contractImportSchema
  > | null>(null);
  const [confirmApproval, setConfirmApproval] = useState(false);
  const [planInput, setPlanInput] = useState<z.infer<
    typeof planInputSchema
  > | null>(null);
  const [name, setName] = useState("");
  const [parameters, setParameters] = useState<Record<string, JsonValue>>({});
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<string | FormattedMessage>("");
  const [selectedInstance, setSelectedInstance] =
    useState<ApplicationInstance | null>(null);
  const [orderView, setOrderView] = useState<OrderView>("plan");
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!session) return;
      const [catalogue, orders, platforms] = await Promise.all([
        request("templates", session, undefined, signal),
        request("instances", session, undefined, signal),
        request("platform-contracts", session, undefined, signal),
      ]);
      if (signal?.aborted) return;
      const published = z
        .object({
          versions: z.array(publishedProjectTemplateSchema).max(200),
          retirementEnabled: z.boolean().default(false),
          deploymentPolicyEnabled: z.boolean().default(false),
          groupAccessEnabled: z.boolean().default(false),
          appliedPlatformsEnabled: z.boolean().default(false),
        })
        .parse(catalogue);
      setVersions(published.versions);
      setRetirementEnabled(published.retirementEnabled);
      setDeploymentPolicyEnabled(published.deploymentPolicyEnabled);
      setGroupAccessEnabled(published.groupAccessEnabled);
      setAppliedPlatformsEnabled(published.appliedPlatformsEnabled);
      if (
        published.appliedPlatformsEnabled &&
        (session.tenant?.kind !== "organisation" ||
          session.tenant.roles?.includes("platform-engineer"))
      ) {
        const applied = appliedPlatformsSchema.parse(
          await request("applied-platforms", session, undefined, signal),
        );
        if (signal?.aborted) return;
        setAppliedPlatforms(applied.platforms);
      } else setAppliedPlatforms([]);
      if (published.groupAccessEnabled) {
        const access = applicationGroupsSchema.parse(
          await request("groups", session, undefined, signal),
        );
        if (signal?.aborted) return;
        setApplicationGroups(access);
      } else setApplicationGroups({ groups: [], members: [] });
      const storedOrders = z
        .object({
          instances: z.array(applicationInstanceSchema).max(200),
          orderDecisionEnabled: z.boolean().default(false),
          orderDeletionEnabled: z.boolean().default(false),
          executionDelegationEnabled: z.boolean().default(false),
          planJobsEnabled: z.boolean().default(false),
          execution: z
            .object({
              planEnabled: z.boolean(),
              applyEnabled: z.boolean(),
              maintenanceEnabled: z.boolean().default(false),
              delegatedExecutionEnabled: z.boolean().default(false),
              acceleratorRevision: z
                .string()
                .regex(/^[0-9a-f]{40}$/)
                .nullable()
                .default(null),
            })
            .default({
              planEnabled: false,
              applyEnabled: false,
              maintenanceEnabled: false,
              acceleratorRevision: null,
              delegatedExecutionEnabled: false,
            }),
        })
        .parse(orders);
      setInstances(storedOrders.instances);
      setOrderDecisionEnabled(storedOrders.orderDecisionEnabled);
      setOrderDeletionEnabled(storedOrders.orderDeletionEnabled);
      setRunnerRevision(storedOrders.execution.acceleratorRevision);
      setPlanJobsEnabled(storedOrders.planJobsEnabled);
      setPlanEnabled(storedOrders.execution.planEnabled);
      setApplyEnabled(storedOrders.execution.applyEnabled);
      setMaintenanceEnabled(storedOrders.execution.maintenanceEnabled);
      setDelegationRequired(storedOrders.execution.delegatedExecutionEnabled);
      setDelegationEnabled(storedOrders.executionDelegationEnabled);
      if (storedOrders.executionDelegationEnabled) {
        const bindings = z
          .object({
            bindings: z
              .array(
                z.object({
                  id: z.uuid(),
                  platformRevision: z.uuid(),
                  backendId: z.uuid(),
                  configuredBy: z.uuid(),
                }),
              )
              .max(200),
          })
          .parse(
            await request("execution-bindings", session, undefined, signal),
          );
        if (signal?.aborted) return;
        setExecutionBindings(bindings.bindings);
        if (
          session.tenant?.kind !== "organisation" ||
          session.tenant.roles?.includes("platform-engineer")
        ) {
          const response = await fetch("/api/v1/backends", {
            credentials: "same-origin",
            headers: { "x-lzc-tenant": session.tenant?.id ?? "" },
            ...(signal ? { signal } : {}),
          });
          if (!response.ok)
            throw new Error("State Backends konnten nicht geladen werden.");
          const backends = z
            .object({
              backends: z
                .array(
                  z.object({
                    id: z.uuid(),
                    descriptor: z.object({ bucket: z.string() }),
                  }),
                )
                .max(100),
            })
            .parse(await response.json());
          if (signal?.aborted) return;
          setExecutionBackends(
            backends.backends.map((item) => ({
              id: item.id,
              bucket: item.descriptor.bucket,
            })),
          );
        }
      }
      setSelectedInstance((previous) =>
        previous
          ? (storedOrders.instances.find((item) => item.id === previous.id) ??
            null)
          : null,
      );
      setContracts(
        z
          .object({ contracts: z.array(approvedContractSchema).max(200) })
          .parse(platforms).contracts,
      );
      if (
        session.tenant?.kind !== "organisation" ||
        session.tenant.roles?.includes("platform-engineer")
      ) {
        const response = await fetch("/api/v1/credentials", {
          headers: { "x-lzc-tenant": session.tenant?.id ?? "" },
          ...(signal ? { signal } : {}),
        });
        if (!response.ok)
          throw new Error(
            "Technische STACKIT-Zugänge konnten nicht geladen werden.",
          );
        const stored = z
          .object({
            profiles: z
              .array(
                z.object({ id: z.uuid(), name: z.string(), state: z.string() }),
              )
              .max(20),
          })
          .parse(await response.json())
          .profiles.filter((item) => item.state === "stored");
        if (signal?.aborted) return;
        setTechnicalProfiles(stored);
        setCredentialProfileId((previous) =>
          stored.some((item) => item.id === previous)
            ? previous
            : stored.length === 1
              ? (stored[0]?.id ?? "")
              : "",
        );
      }
      setLoaded(true);
    },
    [session],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((cause: unknown) => {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Der Katalog konnte nicht geladen werden.",
        );
    });
    return () => controller.abort();
  }, [load]);
  if (!session)
    return (
      <section>
        <h2>{t("Anmeldung erforderlich")}</h2>
        <p>{t("Bitte melde dich für Application Landing Zones an.")}</p>
      </section>
    );

  const canPublish =
    session.tenant?.kind !== "organisation" ||
    session.tenant.roles?.includes("platform-engineer");
  const currentPreview =
    appliedPreview?.session === session ? appliedPreview : null;
  const visibleCandidate = appliedPlatformsEnabled
    ? currentPreview?.document
    : contractCandidate;
  const tabs = [
    { id: "catalogue", label: "Katalog" },
    { id: "orders", label: "Bestellungen" },
    ...(canPublish
      ? [
          { id: "publish", label: "Veröffentlichung" },
          { id: "platform", label: "Plattformanbindung" },
        ]
      : []),
  ];
  const selectedTab = tabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : canPublish
      ? "publish"
      : "catalogue";
  const publicationAccess =
    publicationGroupIds ??
    applicationGroups.groups
      .filter((group) => group.isDefault)
      .map((group) => group.id);
  const drafts =
    canPublish && draft
      ? projectTemplates(draft).filter((item) => item.kind !== "sandbox")
      : [];
  const selected = versions.find((item) => item.id === versionId);
  const detailVersion = versions.find(
    (item) => item.id === selectedInstance?.versionId,
  );
  const publicationTemplate = drafts.find((item) => item.id === templateId);
  const publicationContract = contracts.find(
    (item) => item.document.revision === platformRevision,
  );
  const targets = Object.entries(
    publicationContract?.document.targets ?? {},
  ).filter(
    ([, target]) =>
      target.region === publicationTemplate?.region &&
      target.corporate === (publicationTemplate?.kind === "corporate"),
  );
  const inputs = selected
    ? templateParameterFields.filter(
        (field) =>
          selected.template.parameterPolicy?.fields[field.path]?.source ===
            "input" &&
          (!field.path.startsWith("observability.") ||
            field.path === "observability.enabled" ||
            templateObservabilityConfigurable(selected.template)),
      )
    : [];
  function changeParameter(path: string, value: JsonValue) {
    setParameters((previous) => ({ ...previous, [path]: value }));
    setIdempotencyKey(crypto.randomUUID());
    setNotice("");
  }
  function selectVersion(nextVersionId: string) {
    setVersionId(nextVersionId);
    setConfirmRetirement(false);
    const version = versions.find((item) => item.id === nextVersionId);
    setVersionGroupIds(version?.allowedGroupIds ?? []);
    setConfirmGroupAccess(false);
    const defaults: Record<string, JsonValue> = {};
    for (const [path, source] of Object.entries(
      version?.template.parameterPolicy?.fields ?? {},
    ))
      if (source.source === "input" && source.default !== undefined)
        defaults[path] = structuredClone(source.default);
      else if (
        source.source === "input" &&
        templateParameterFields.some(
          (field) => field.path === path && field.type === "boolean",
        )
      )
        defaults[path] = false;
    setParameters(defaults);
    setName("");
    setIdempotencyKey(crypto.randomUUID());
    setNotice("");
  }
  async function publish() {
    if (!session || busy) return;
    const template = drafts.find((item) => item.id === templateId);
    if (!template) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const published = publishedProjectTemplateSchema.parse(
        await request("templates", session, {
          template,
          ...(runnerRevision ? { acceleratorRevision: runnerRevision } : {}),
          ...(deploymentPolicyEnabled ? { deploymentPolicy } : {}),
          ...(groupAccessEnabled ? { allowedGroupIds: publicationAccess } : {}),
          ...(platformRevision && targetKey
            ? { platformRevision, targetKey }
            : {}),
        }),
      );
      await load();
      setActiveTab("catalogue");
      setNotice(
        formatMessage(
          "{{value0}} · Version {{value1}} veröffentlicht. Cloud-Ausführung bleibt gesperrt.",
          { value0: published.template.name, value1: published.version },
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Veröffentlichung fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function retire() {
    if (
      !session ||
      !selected ||
      selected.retiredAt ||
      !canPublish ||
      !retirementEnabled ||
      !confirmRetirement ||
      busy
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      z.object({
        versionId: z.uuid(),
        retiredAt: z.iso.datetime(),
        retiredBy: z.uuid(),
      }).parse(
        await request(`templates/${selected.id}/retire`, session, {
          confirmRetirement: true,
        }),
      );
      await load();
      setConfirmRetirement(false);
      setNotice(
        formatMessage("{{value0}} · Version {{value1}} stillgelegt.", {
          value0: selected.template.name,
          value1: selected.version,
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Die Template-Version konnte nicht stillgelegt werden.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function changeGroupAccess(
    path: string,
    input: Record<string, unknown>,
  ) {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      z.object({ id: z.uuid() }).parse(await request(path, session, input));
      await load();
      setConfirmGroupAccess(false);
      setNotice("Gruppenänderung gespeichert.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Gruppenänderung fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function importContract(file: File | undefined) {
    setContractCandidate(null);
    setConfirmApproval(false);
    setError("");
    if (!file) return;
    try {
      if (file.size > 200000) throw new Error("Plattformvertrag ist zu groß.");
      const parsed: unknown = JSON.parse(await file.text());
      const full = platformContractSchema.safeParse(parsed);
      if (full.success && full.data.tenant_id !== session?.tenant?.id)
        throw new Error(
          "Der Plattformvertrag gehört zu einem anderen Arbeitsbereich.",
        );
      setContractCandidate(
        contractImportSchema.parse(
          full.success
            ? {
                schema_version: full.data.schema_version,
                organization_id: full.data.organization_id,
                targets: full.data.targets,
              }
            : parsed,
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Ungültiger Plattformvertrag.",
      );
    }
  }
  async function previewAppliedContract() {
    if (!session || !applyRunId || busy) return;
    setBusy(true);
    setError("");
    setAppliedPreview(null);
    setConfirmApproval(false);
    try {
      const preview = appliedPreviewSchema.parse(
        await request(`applied-platforms/${applyRunId}/preview`, session),
      );
      setAppliedPreview({ ...preview, session });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Plattform konnte nicht geprüft werden.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function approveContract() {
    if (
      !session ||
      busy ||
      !visibleCandidate ||
      !confirmApproval ||
      !credentialProfileId
    )
      return;
    setBusy(true);
    setError("");
    try {
      const approved = approvedContractSchema.parse(
        await request(
          appliedPlatformsEnabled
            ? "applied-platforms/approve"
            : "platform-contracts",
          session,
          {
            ...(appliedPlatformsEnabled
              ? { source: currentPreview?.source }
              : contractCandidate),
            confirmApproval: true,
            credentialProfileId,
          },
        ),
      );
      await load();
      setPlatformRevision(approved.document.revision);
      setTargetKey("");
      setContractCandidate(null);
      setAppliedPreview(null);
      setConfirmApproval(false);
      setNotice(
        "Plattformvertrag freigegeben. Es wurden keine Cloud-Ressourcen geändert.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Freigabe fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function order() {
    if (!session || !selected || selected.retiredAt || busy) return;
    setError("");
    setNotice("");
    const input = { versionId: selected.id, idempotencyKey, name, parameters };
    try {
      resolveApplicationOrder(selected, input);
      setBusy(true);
      const instance = applicationInstanceSchema.parse(
        await request("instances", session, input),
      );
      setInstances((previous) => [
        instance,
        ...previous.filter((item) => item.id !== instance.id),
      ]);
      setSelectedInstance(instance);
      setActiveTab("orders");
      setPlanInput(null);
      if (
        instance.deploymentPolicy === "direct" &&
        planEnabled &&
        instance.executionConfigured
      ) {
        await request(`instances/${instance.id}/plan`, session, {
          idempotencyKey,
        });
        setPlanRefresh((previous) => previous + 1);
        setNotice("Bestellung gespeichert. Cloud-Plan gestartet.");
      } else {
        setNotice(
          "Bestellung gespeichert. Es wurden keine Cloud-Ressourcen erzeugt.",
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Bestellung fehlgeschlagen. Ein erneuter Versuch verwendet denselben Bestellschlüssel.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function decideOrder(decision: "approved" | "rejected") {
    if (!session || !selectedInstance || !confirmOrderDecision) return;
    setBusy(true);
    setError("");
    try {
      const updated = applicationInstanceSchema.parse(
        await request(`instances/${selectedInstance.id}/decision`, session, {
          decision,
          reason: decisionReason,
          confirmDecision: true,
        }),
      );
      setInstances((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSelectedInstance(updated);
      setConfirmOrderDecision(false);
      setDecisionReason("");
      setPlanInput(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Bestellentscheidung fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteOrder(ordered = selectedInstance) {
    if (
      !session ||
      !(ordered?.canDelete || ordered?.canArchive) ||
      busy ||
      !window.confirm(
        t(
          ordered.canArchive
            ? "Diese Bestellung archivieren? Cloud-Ressourcen, State und Ausführungshistorie bleiben erhalten. Die Bestellung verschwindet aus der aktiven Liste."
            : "Diese Bestellung löschen? Es werden keine Cloud-Ressourcen gelöscht.",
        ),
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await request(
        `instances/${ordered.id}`,
        session,
        ordered.canArchive
          ? { confirmArchive: true }
          : { confirmDeletion: true },
        undefined,
        "DELETE",
      );
      setInstances((previous) =>
        previous.filter((item) => item.id !== ordered.id),
      );
      setSelectedInstance((previous) =>
        previous?.id === ordered.id ? null : previous,
      );
      if (selectedInstance?.id === ordered.id) setPlanInput(null);
      setNotice(
        ordered.canArchive ? "Bestellung archiviert." : "Bestellung gelöscht.",
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Bestellung konnte nicht gelöscht werden.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function configureExecution(enabled: boolean) {
    if (
      !session ||
      !executionRevision ||
      busy ||
      (enabled && !executionBackend)
    )
      return;
    if (
      !enabled &&
      !window.confirm(
        t(
          "Ausführungsberechtigung widerrufen? Weitere Runner-Zugriffe werden gesperrt.",
        ),
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await request(
        `platform-contracts/${executionRevision}/execution`,
        session,
        enabled
          ? {
              enabled: true,
              stateBackendId: executionBackend,
              confirmExecution: true,
            }
          : { enabled: false, confirmRevocation: true },
      );
      await load();
      setNotice(
        enabled
          ? "Plattform-Ausführung eingerichtet."
          : "Ausführungsberechtigung widerrufen.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Plattform-Ausführung konnte nicht geändert werden.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function checkPlanInput() {
    if (!session || !selectedInstance || busy) return;
    setBusy(true);
    setPlanInput(null);
    setError("");
    try {
      const prepared = planInputSchema.parse(
        await request(
          `instances/${selectedInstance.id}/plan-input`,
          session,
          {},
        ),
      );
      if (
        prepared.plan.stateKey !== selectedInstance.stateKey ||
        prepared.plan.requestedBy !== session.user.id
      )
        throw new Error("Plan-Input gehört nicht zu dieser Bestellung.");
      setPlanInput(prepared);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Plan-Input konnte nicht geprüft werden.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="application-self-service">
      <div
        className="application-tabs"
        role="tablist"
        aria-label={t("Application Landing Zones")}
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            id={`application-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={selectedTab === tab.id}
            aria-controls={`application-panel-${tab.id}`}
            tabIndex={selectedTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              const target = tabs[next];
              if (!target) return;
              setActiveTab(target.id);
              document.getElementById(`application-tab-${target.id}`)?.focus();
            }}
          >
            {t(tab.label)}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="validation-box">
          {t(error)}
        </p>
      )}
      {notice && (
        <p role="status" className="info-banner">
          {t(notice)}
        </p>
      )}
      {!loaded && !error && (
        <p role="status">{t("Application Landing Zones werden geladen.")}</p>
      )}
      {canPublish && (
        <section
          id="application-panel-platform"
          role="tabpanel"
          aria-labelledby="application-tab-platform"
          hidden={selectedTab !== "platform"}
        >
          <h2>{t("Plattformanbindung")}</h2>
          <div className="field">
            <label htmlFor="application-technical-profile">
              {t("Technischer STACKIT-Zugang")}
            </label>
            <select
              id="application-technical-profile"
              value={credentialProfileId}
              disabled={busy}
              onChange={(event) => setCredentialProfileId(event.target.value)}
            >
              <option value="">{t("Gespeicherten Zugang wählen")}</option>
              {technicalProfiles.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          {appliedPlatformsEnabled ? (
            <>
              <div className="field">
                <label htmlFor="application-applied-platform">
                  {t("Erfolgreicher Plattform-Apply")}
                </label>
                <select
                  id="application-applied-platform"
                  value={applyRunId}
                  disabled={busy}
                  onChange={(event) => {
                    setApplyRunId(event.target.value);
                    setAppliedPreview(null);
                    setConfirmApproval(false);
                  }}
                >
                  <option value="">{t("Apply-Lauf wählen")}</option>
                  {appliedPlatforms.map((platform) => (
                    <option key={platform.id} value={platform.id}>
                      {platform.configurationName} · {t("Apply")}{" "}
                      {new Date(platform.finishedAt).toLocaleString(
                        currentLanguage(),
                      )}
                    </option>
                  ))}
                </select>
              </div>
              {loaded && !appliedPlatforms.length && (
                <>
                  <p role="status">
                    {t(
                      "Kein aktueller erfolgreicher Plattform-Apply verfügbar.",
                    )}
                  </p>
                  {session.tenant?.kind === "organisation" &&
                    session.tenant.manageMembers && (
                      <OrganizationBinding
                        session={session}
                        tenantId={session.tenant.id}
                        organizationVerified={true}
                        onBound={load}
                        onVerified={load}
                      />
                    )}
                </>
              )}
              <button
                type="button"
                className="button"
                disabled={busy || !applyRunId}
                onClick={() => void previewAppliedContract()}
              >
                {t("Plattform prüfen")}
              </button>
            </>
          ) : (
            <details>
              <summary>{t("Kompatibilitätsimport")}</summary>
              <div className="field">
                <label htmlFor="application-contract-import">
                  {t("Plattform-Outputs · JSON-Vertrag")}
                </label>
                <input
                  id="application-contract-import"
                  type="file"
                  accept=".json,application/json"
                  disabled={busy}
                  onChange={(event) =>
                    void importContract(event.target.files?.[0])
                  }
                />
              </div>
            </details>
          )}
          {visibleCandidate && (
            <>
              <dl className="application-properties">
                <dt>{t("Organisation")}</dt>
                <dd>{visibleCandidate.organization_id}</dd>
                {currentPreview && (
                  <>
                    <dt>{t("State-Version")}</dt>
                    <dd>{currentPreview.source.stateVersion}</dd>
                    <dt>{t("Apply-Lauf")}</dt>
                    <dd>{currentPreview.source.applyRunId}</dd>
                  </>
                )}
                {Object.entries(visibleCandidate.targets).map(
                  ([key, target]) => (
                    <div key={key}>
                      <dt>
                        {key} · {target.region} ·{" "}
                        {target.corporate ? t("Corporate") : t("Public")}
                      </dt>
                      <dd>
                        {t("Ordner")}
                        <code>{target.folder_id}</code>
                      </dd>
                    </div>
                  ),
                )}
              </dl>
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={confirmApproval}
                  disabled={busy}
                  onChange={(event) => setConfirmApproval(event.target.checked)}
                />
                {t("Angewendete Plattform-Outputs und Zielordner geprüft")}
              </label>
              <button
                type="button"
                className="button primary"
                disabled={busy || !confirmApproval || !credentialProfileId}
                onClick={() => void approveContract()}
              >
                {t("Plattformvertrag freigeben")}
              </button>
            </>
          )}
        </section>
      )}
      {canPublish && (
        <section
          id="application-panel-publish"
          role="tabpanel"
          aria-labelledby="application-tab-publish"
          hidden={selectedTab !== "publish"}
        >
          <h2>{t("Application Landing Zone Template veröffentlichen")}</h2>
          {delegationEnabled && (
            <fieldset disabled={busy}>
              <legend>{t("Plattform-Ausführung")}</legend>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="execution-platform-revision">
                    {t("Plattformvertrag für Ausführung")}
                  </label>
                  <select
                    id="execution-platform-revision"
                    value={executionRevision}
                    onChange={(event) => {
                      setExecutionRevision(event.target.value);
                      setExecutionBackend("");
                    }}
                  >
                    <option value="">{t("Plattformvertrag wählen")}</option>
                    {contracts
                      .filter((item) => item.approvedBy === session.user.id)
                      .map((item) => (
                        <option
                          key={item.document.revision}
                          value={item.document.revision}
                        >
                          {item.document.revision}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="execution-state-backend">
                    {t("State-Backend für Applications")}
                  </label>
                  <select
                    id="execution-state-backend"
                    value={
                      executionBindings.find(
                        (item) => item.platformRevision === executionRevision,
                      )?.backendId ?? executionBackend
                    }
                    disabled={
                      !executionRevision ||
                      executionBindings.some(
                        (item) => item.platformRevision === executionRevision,
                      )
                    }
                    onChange={(event) =>
                      setExecutionBackend(event.target.value)
                    }
                  >
                    <option value="">{t("State-Backend wählen")}</option>
                    {executionBackends.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.bucket}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {executionBindings.some(
                (item) => item.platformRevision === executionRevision,
              ) ? (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => void configureExecution(false)}
                >
                  {t("Ausführungsberechtigung widerrufen")}
                </button>
              ) : (
                <button
                  type="button"
                  className="button secondary"
                  disabled={!executionRevision || !executionBackend}
                  onClick={() => void configureExecution(true)}
                >
                  {t("Ausführung einrichten")}
                </button>
              )}
            </fieldset>
          )}
          {drafts.length ? (
            <div className="form-grid">
              <div className="field">
                <label htmlFor="application-publication">
                  {t("Application Landing Zone Template aus meinem Entwurf")}
                </label>
                <select
                  id="application-publication"
                  value={templateId}
                  onChange={(event) => {
                    setTemplateId(event.target.value);
                    setTargetKey("");
                  }}
                  disabled={busy}
                >
                  <option value="">{t("Template wählen")}</option>
                  {drafts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name || item.key}
                    </option>
                  ))}
                </select>
              </div>
              {runnerRevision && (
                <div className="field">
                  <label htmlFor="application-runner-revision">
                    {t("Freigegebene Runner-Revision")}
                  </label>
                  <input
                    id="application-runner-revision"
                    value={runnerRevision}
                    readOnly
                  />
                </div>
              )}
              {deploymentPolicyEnabled && (
                <div className="field">
                  <label htmlFor="application-deployment-policy">
                    {t("Bereitstellungsrichtlinie")}
                  </label>
                  <select
                    id="application-deployment-policy"
                    value={deploymentPolicy}
                    disabled={busy}
                    onChange={(event) =>
                      setDeploymentPolicy(
                        event.target.value === "direct"
                          ? "direct"
                          : "approval-required",
                      )
                    }
                  >
                    <option value="approval-required">
                      {t("Bereitstellung mit Freigabe")}
                    </option>
                    <option value="direct">
                      {t("Direkte Bereitstellung")}
                    </option>
                  </select>
                </div>
              )}
              <div className="field">
                <label htmlFor="application-platform-revision">
                  {t("Freigegebener Plattformvertrag")}
                </label>
                <select
                  id="application-platform-revision"
                  value={platformRevision}
                  disabled={busy}
                  onChange={(event) => {
                    setPlatformRevision(event.target.value);
                    setTargetKey("");
                  }}
                >
                  <option value="">
                    {t("Ohne Vertragsbindung · Plan gesperrt")}
                  </option>
                  {contracts.map((item) => (
                    <option
                      key={item.document.revision}
                      value={item.document.revision}
                    >
                      {item.document.revision} ·{" "}
                      {new Date(item.approvedAt).toLocaleString(
                        currentLanguage() === "de" ? "de-DE" : "en-GB",
                      )}
                    </option>
                  ))}
                </select>
              </div>
              {platformRevision && (
                <div className="field">
                  <label htmlFor="application-platform-target">
                    {t("Plattformziel")}
                  </label>
                  <select
                    id="application-platform-target"
                    value={targetKey}
                    disabled={busy || !publicationTemplate || !targets.length}
                    onChange={(event) => setTargetKey(event.target.value)}
                  >
                    <option value="">
                      {t(
                        publicationTemplate
                          ? "Passendes Ziel wählen"
                          : "Template wählen",
                      )}
                    </option>
                    {targets.map(([key, target]) => (
                      <option key={key} value={key}>
                        {key} · {target.region} · {target.folder_id}
                      </option>
                    ))}
                  </select>
                  {publicationTemplate && !targets.length && (
                    <p role="status">
                      {t("Kein passendes Plattformziel für dieses Template.")}
                    </p>
                  )}
                </div>
              )}
              <div className="field">
                <button
                  type="button"
                  className="button primary"
                  disabled={
                    busy ||
                    !loaded ||
                    !templateId ||
                    Boolean(
                      platformRevision &&
                        !targets.some(([key]) => key === targetKey),
                    )
                  }
                  onClick={() => void publish()}
                >
                  {t("Version veröffentlichen")}
                </button>
              </div>
              {groupAccessEnabled && (
                <fieldset>
                  <legend>{t("Für Gruppen freigeben")}</legend>
                  {applicationGroups.groups.map((group) => (
                    <label className="toggle-label" key={group.id}>
                      <input
                        type="checkbox"
                        checked={publicationAccess.includes(group.id)}
                        disabled={busy}
                        onChange={(event) =>
                          setPublicationGroupIds(
                            event.target.checked
                              ? [...publicationAccess, group.id]
                              : publicationAccess.filter(
                                  (id) => id !== group.id,
                                ),
                          )
                        }
                      />
                      {group.name}
                    </label>
                  ))}
                  {!publicationAccess.length && (
                    <p role="status">
                      {t("Für keine Application Owner freigegeben")}
                    </p>
                  )}
                </fieldset>
              )}
            </div>
          ) : (
            <>
              <p className="muted">
                {t(
                  "Kein Application Landing Zone Template im aktuellen Entwurf.",
                )}
              </p>
              <button
                type="button"
                className="button"
                onClick={onSelectConfiguration}
              >
                {t("Konfiguration auswählen")}
              </button>
            </>
          )}
        </section>
      )}
      <section
        id="application-panel-catalogue"
        role="tabpanel"
        aria-labelledby="application-tab-catalogue"
        hidden={selectedTab !== "catalogue"}
      >
        <h2>{t("Application Landing Zone Templates")}</h2>
        <p>
          {t(
            "Wähle eine veröffentlichte Template-Version. Eine Bestellung speichert einen Auftrag; Cloud-Ressourcen werden dabei nicht erzeugt.",
          )}
        </p>
        {loaded && !versions.length && (
          <p className="muted">
            {t(
              "Noch keine veröffentlichten Application Landing Zone Templates.",
            )}
          </p>
        )}
        {!!versions.length && (
          <fieldset className="application-template-catalog">
            <legend className="sr-only">
              {t("Veröffentlichte Application Landing Zone Templates")}
            </legend>
            {versions.map((item) => (
              <button
                type="button"
                className="application-template-choice"
                aria-label={
                  t("{{value0}}, Version {{value1}}, {{value2}}, {{value3}}", {
                    value0: item.template.name || item.template.key,
                    value1: item.version,
                    value2: item.template.region,
                    value3:
                      item.template.kind === "public" ? "Public" : "Corporate",
                  }) + (item.retiredAt ? t(" · Stillgelegt") : "")
                }
                aria-pressed={versionId === item.id}
                key={item.id}
                disabled={busy}
                onClick={() => selectVersion(item.id)}
              >
                <strong>{item.template.name || item.template.key}</strong>
                <span>
                  {t(
                    item.deploymentPolicy === "direct"
                      ? "Direkte Bereitstellung"
                      : "Bereitstellung mit Freigabe",
                  )}
                </span>
                {item.retiredAt && <span>{t("Stillgelegt")}</span>}
                <span>
                  {t("Version")} {item.version} · {item.template.region} ·{" "}
                  {item.template.kind === "public"
                    ? t("Public")
                    : t("Corporate")}
                </span>
                <span>
                  {item.template.kind === "corporate"
                    ? t("STACKIT Network Area")
                    : item.template.settings.network_enabled === true
                      ? t("Lokales Projektnetz{{value0}}", {
                          value0:
                            typeof item.template.settings
                              .network_prefix_length === "number"
                              ? ` · /${item.template.settings.network_prefix_length}`
                              : "",
                        })
                      : t("Kein Projektnetz")}
                </span>
                <span>
                  {item.platformRevision
                    ? t("Plattformvertrag gebunden · Ziel {{value0}}", {
                        value0: item.targetKey,
                      })
                    : t("Ohne Plattformvertrag · Plan gesperrt")}
                </span>
              </button>
            ))}
          </fieldset>
        )}
        {canPublish && groupAccessEnabled && selected && (
          <fieldset>
            <legend>{t("Freigaben dieser Template-Version")}</legend>
            {applicationGroups.groups.map((group) => (
              <label className="toggle-label" key={group.id}>
                <input
                  type="checkbox"
                  checked={versionGroupIds.includes(group.id)}
                  disabled={busy || Boolean(selected.retiredAt)}
                  onChange={(event) => {
                    setVersionGroupIds((previous) =>
                      event.target.checked
                        ? [...previous, group.id]
                        : previous.filter((id) => id !== group.id),
                    );
                    setConfirmGroupAccess(false);
                  }}
                />
                {group.name}
              </label>
            ))}
            {!versionGroupIds.length && (
              <p>{t("Für keine Application Owner freigegeben")}</p>
            )}
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={confirmGroupAccess}
                disabled={busy || Boolean(selected.retiredAt)}
                onChange={(event) =>
                  setConfirmGroupAccess(event.target.checked)
                }
              />
              {t("Template-Freigaben geprüft")}
            </label>
            <button
              type="button"
              className="button"
              disabled={
                busy || !confirmGroupAccess || Boolean(selected.retiredAt)
              }
              onClick={() =>
                void changeGroupAccess(`templates/${selected.id}/groups`, {
                  groupIds: versionGroupIds,
                  confirmAccessChange: true,
                })
              }
            >
              {t("Freigaben speichern")}
            </button>
          </fieldset>
        )}
        {canPublish && retirementEnabled && selected && (
          <div className="project-form">
            <h3>
              {selected.template.name} · {t("Version")} {selected.version}
            </h3>
            {selected.retiredAt ? (
              <p>
                {t("Stillgelegt")} ·{" "}
                {new Date(selected.retiredAt).toLocaleString(currentLanguage())}
              </p>
            ) : (
              <>
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={confirmRetirement}
                    disabled={busy}
                    onChange={(event) =>
                      setConfirmRetirement(event.target.checked)
                    }
                  />
                  {t("Diese Template-Version für neue Bestellungen sperren")}
                </label>
                <button
                  type="button"
                  className="button"
                  disabled={busy || !confirmRetirement}
                  onClick={() => void retire()}
                >
                  {t("Version stilllegen")}
                </button>
              </>
            )}
          </div>
        )}
        {selected && !selected.retiredAt && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void order();
            }}
          >
            <h3>
              {selected.template.name} {t("· Version")} {selected.version}
            </h3>
            <dl className="application-properties">
              <dt>{t("Bereitstellungsrichtlinie")}</dt>
              <dd>
                {t(
                  selected.deploymentPolicy === "direct"
                    ? "Direkte Bereitstellung"
                    : "Bereitstellung mit Freigabe",
                )}
              </dd>
              <dt>{t("Projektart")}</dt>
              <dd>
                {selected.template.kind === "public"
                  ? t("Public")
                  : t("Corporate")}
              </dd>
              <dt>{t("Region")}</dt>
              <dd>{selected.template.region}</dd>
              <dt>{t("Plattformrevision")}</dt>
              <dd>{selected.platformRevision ?? t("Nicht gebunden")}</dd>
              <dt>{t("Plattformziel")}</dt>
              <dd>{selected.targetKey ?? t("Nicht gebunden")}</dd>
              <dt>{t("Projektnetz")}</dt>
              <dd>
                {selected.template.kind === "corporate"
                  ? t("SNA")
                  : selected.template.settings.network_enabled === true
                    ? t("Lokal, ohne SNA")
                    : t("Kein Netz")}
              </dd>
              <dt>{t("Netzgröße")}</dt>
              <dd>
                {typeof selected.template.settings.network_prefix_length ===
                "number"
                  ? `/${selected.template.settings.network_prefix_length}`
                  : t("STACKIT-Standard")}
              </dd>
            </dl>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="application-name">{t("Projektname")}</label>
                <input
                  id="application-name"
                  required
                  maxLength={40}
                  value={name}
                  disabled={busy}
                  onChange={(event) => {
                    setName(event.target.value);
                    setIdempotencyKey(crypto.randomUUID());
                    setNotice("");
                  }}
                />
              </div>
              {inputs.map((field) => {
                const source =
                  selected.template.parameterPolicy?.fields[field.path];
                if (source?.source !== "input") return null;
                const control = `application-input-${field.path}`;
                const value = parameters[field.path] ?? source.default;
                if (field.type === "string-list") {
                  const values = Array.isArray(value) ? value : [];
                  return (
                    <fieldset key={field.path} className="field">
                      <legend>{t(field.label)}</legend>
                      {source.choices?.map((choice) => (
                        <label key={choice} className="toggle-label">
                          <input
                            type="checkbox"
                            disabled={busy}
                            checked={values.includes(choice)}
                            onChange={(event) =>
                              changeParameter(
                                field.path,
                                event.target.checked
                                  ? [...values, choice]
                                  : values.filter((item) => item !== choice),
                              )
                            }
                          />
                          {choice}
                        </label>
                      ))}
                    </fieldset>
                  );
                }
                if (field.type === "boolean")
                  return (
                    <div key={field.path} className="field">
                      <label className="toggle-label" htmlFor={control}>
                        <input
                          id={control}
                          type="checkbox"
                          disabled={busy}
                          checked={value === true}
                          onChange={(event) =>
                            changeParameter(field.path, event.target.checked)
                          }
                        />
                        {t(field.label)}
                      </label>
                    </div>
                  );
                return (
                  <div className="field" key={field.path}>
                    <label htmlFor={control}>{t(field.label)}</label>
                    <select
                      id={control}
                      disabled={busy}
                      required={source.required}
                      value={typeof value === "string" ? value : ""}
                      onChange={(event) =>
                        changeParameter(field.path, event.target.value)
                      }
                    >
                      <option value="">{t("Wert wählen")}</option>
                      {source.choices?.map((choice) => (
                        <option value={choice} key={choice}>
                          {choice}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
            <button
              className="button primary"
              type="submit"
              disabled={busy || !name.trim()}
            >
              {busy ? t("Wird gespeichert") : t("Bestellen")}
            </button>
          </form>
        )}
      </section>
      <section
        id="application-panel-orders"
        role="tabpanel"
        aria-labelledby="application-tab-orders"
        hidden={selectedTab !== "orders"}
      >
        <h2>{t("Bestellungen")}</h2>
        <button
          className="button secondary"
          type="button"
          disabled={busy}
          onClick={() =>
            void load().catch((cause) =>
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Bestellentscheidung fehlgeschlagen.",
              ),
            )
          }
        >
          {t("Bestellungen aktualisieren")}
        </button>
        {loaded && !instances.length && (
          <p className="muted">{t("Noch keine Bestellungen.")}</p>
        )}
        {instances.length > 0 && (
          <div className="application-orders">
            <table aria-label={t("Bestellungen")}>
              <thead>
                <tr>
                  <th scope="col">{t("Bestellung")}</th>
                  <th scope="col">{t("Bestelldatum")}</th>
                  <th scope="col">{t("Freigabe")}</th>
                  <th scope="col">{t("Ausführung")}</th>
                  <th scope="col">{t("Aktionen")}</th>
                </tr>
              </thead>
              <tbody>
                {instances.map((item) => (
                  <tr
                    key={item.id}
                    data-selected={selectedInstance?.id === item.id}
                  >
                    <th scope="row">
                      <strong>{item.name}</strong>
                      <small className="muted">
                        {t("Bestell-ID")}:{" "}
                        <code title={item.id}>{item.id.slice(0, 8)}</code>
                      </small>
                    </th>
                    <td>
                      <time dateTime={item.createdAt}>
                        {new Date(item.createdAt).toLocaleString(
                          currentLanguage(),
                          {
                            dateStyle: "medium",
                            timeStyle: "short",
                          },
                        )}
                      </time>
                    </td>
                    <td>
                      {t(
                        {
                          pending: "Freigabe ausstehend",
                          approved: "Bestellung freigegeben",
                          rejected: "Bestellung abgelehnt",
                          "not-required": "Keine Bestellfreigabe erforderlich",
                        }[
                          item.approval?.status ??
                            (item.deploymentPolicy === "direct"
                              ? "not-required"
                              : "pending")
                        ],
                      )}
                    </td>
                    <td>
                      <ApplicationOrderExecutionStatus
                        instance={item}
                        session={session}
                        active={selectedTab === "orders"}
                        available={planJobsEnabled}
                        selected={selectedInstance?.id === item.id}
                        onOpen={(view) => {
                          setSelectedInstance(item);
                          setPlanRefresh((previous) => previous + 1);
                          setOrderView(view);
                          setPlanInput(null);
                          setDecisionReason("");
                          setConfirmOrderDecision(false);
                        }}
                      />
                    </td>
                    <td>
                      <div className="application-order-actions">
                        <button
                          className="button secondary"
                          type="button"
                          title={t("Details anzeigen")}
                          aria-label={`${t("Details anzeigen")}: ${item.name} (${item.id.slice(0, 8)})`}
                          disabled={busy}
                          onClick={() => {
                            setSelectedInstance(item);
                            setPlanRefresh((previous) => previous + 1);
                            setOrderView("plan");
                            setPlanInput(null);
                            setDecisionReason("");
                            setConfirmOrderDecision(false);
                          }}
                        >
                          <Eye size={18} aria-hidden="true" />
                        </button>
                        {orderDeletionEnabled &&
                          (item.canDelete || item.canArchive) && (
                            <button
                              className="button secondary"
                              type="button"
                              title={t(
                                item.canArchive
                                  ? "Bestellung archivieren"
                                  : "Bestellung löschen",
                              )}
                              aria-label={t(
                                item.canArchive
                                  ? "Bestellung archivieren"
                                  : "Bestellung löschen",
                              )}
                              disabled={busy}
                              onClick={() => void deleteOrder(item)}
                            >
                              {item.canArchive ? (
                                <Archive size={18} aria-hidden="true" />
                              ) : (
                                <Trash2 size={18} aria-hidden="true" />
                              )}
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {selectedInstance && (
        <section
          id="application-order-details"
          aria-label={t("Bestelldetails")}
          hidden={selectedTab !== "orders"}
        >
          <h2>{selectedInstance.name}</h2>
          {orderDeletionEnabled &&
            (selectedInstance.canDelete || selectedInstance.canArchive) && (
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => void deleteOrder()}
              >
                {selectedInstance.canArchive && (
                  <Archive size={18} aria-hidden="true" />
                )}
                {t(
                  selectedInstance.canArchive
                    ? "Bestellung archivieren"
                    : "Bestellung löschen",
                )}
              </button>
            )}
          <div
            className="application-tabs application-order-tabs"
            role="tablist"
            aria-label={t("Bestellablauf")}
          >
            {(
              [
                { id: "overview", label: "Übersicht" },
                { id: "plan", label: "Plan" },
                { id: "apply", label: "Apply" },
                ...(maintenanceEnabled
                  ? ([
                      { id: "drift", label: "Drift" },
                      { id: "destroy", label: "Destroy" },
                    ] as const)
                  : []),
                { id: "history", label: "Verlauf" },
              ] as const
            ).map((tab, index, tabs) => (
              <button
                key={tab.id}
                id={`application-order-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={orderView === tab.id}
                aria-controls={`application-order-panel-${tab.id === "overview" ? "overview" : "execution"}`}
                tabIndex={orderView === tab.id ? 0 : -1}
                onClick={() => setOrderView(tab.id)}
                onKeyDown={(event) => {
                  const next =
                    event.key === "ArrowRight"
                      ? (index + 1) % tabs.length
                      : event.key === "ArrowLeft"
                        ? (index + tabs.length - 1) % tabs.length
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? tabs.length - 1
                            : null;
                  if (next === null) return;
                  event.preventDefault();
                  const target = tabs[next];
                  if (!target) return;
                  setOrderView(target.id);
                  document
                    .getElementById(`application-order-tab-${target.id}`)
                    ?.focus();
                }}
              >
                {t(tab.label)}
              </button>
            ))}
          </div>
          <div
            id="application-order-panel-overview"
            role="tabpanel"
            aria-labelledby="application-order-tab-overview"
            hidden={orderView !== "overview"}
          >
            {selectedInstance.approval && (
              <p>
                {t(
                  {
                    pending: "Freigabe ausstehend",
                    approved: "Bestellung freigegeben",
                    rejected: "Bestellung abgelehnt",
                    "not-required": "Keine Bestellfreigabe erforderlich",
                  }[selectedInstance.approval.status],
                )}
              </p>
            )}
            {selectedInstance.approval &&
              "decidedAt" in selectedInstance.approval && (
                <dl className="application-properties">
                  <dt>{t("Entschieden am")}</dt>
                  <dd>
                    {new Date(
                      selectedInstance.approval.decidedAt,
                    ).toLocaleString(currentLanguage())}
                  </dd>
                  <dt>{t("Begründung")}</dt>
                  <dd>
                    {selectedInstance.approval.reason ||
                      t("Keine Begründung angegeben")}
                  </dd>
                </dl>
              )}
            {orderDecisionEnabled &&
              selectedInstance.approval?.status === "pending" &&
              selectedInstance.requestedBy !== session.user.id &&
              (session.tenant?.kind !== "organisation" ||
                session.tenant.roles?.includes("platform-engineer")) && (
                <fieldset disabled={busy}>
                  <legend>{t("Bestellentscheidung")}</legend>
                  <div className="field">
                    <label htmlFor="application-decision-reason">
                      {t("Begründung")}
                    </label>
                    <textarea
                      id="application-decision-reason"
                      maxLength={1000}
                      rows={3}
                      value={decisionReason}
                      onChange={(event) =>
                        setDecisionReason(event.target.value)
                      }
                    />
                  </div>
                  <label>
                    <input
                      type="checkbox"
                      checked={confirmOrderDecision}
                      onChange={(event) =>
                        setConfirmOrderDecision(event.target.checked)
                      }
                    />
                    {t("Bestellentscheidung bestätigen")}
                  </label>
                  <div className="application-actions">
                    <button
                      type="button"
                      className="button primary"
                      disabled={!confirmOrderDecision}
                      onClick={() => void decideOrder("approved")}
                    >
                      {t("Bestellung freigeben")}
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={!confirmOrderDecision || !decisionReason.trim()}
                      onClick={() => void decideOrder("rejected")}
                    >
                      {t("Bestellung ablehnen")}
                    </button>
                  </div>
                </fieldset>
              )}
            <dl className="application-properties">
              <dt>{t("Instanz")}</dt>
              <dd>{selectedInstance.id}</dd>
              <dt>{t("Application Landing Zone Template-Version")}</dt>
              <dd>
                {versions.find((item) => item.id === selectedInstance.versionId)
                  ?.version ?? selectedInstance.versionId}
              </dd>
              <dt>{t("State-Key")}</dt>
              <dd>
                <code>{selectedInstance.stateKey}</code>
              </dd>
              {!(planEnabled && planJobsEnabled) && (
                <>
                  <dt>{t("Planstatus")}</dt>
                  <dd>
                    {t(
                      planEnabled
                        ? "Planstatus in den Details"
                        : "Gesperrt · Kein Cloud-Plan ausgeführt",
                    )}
                  </dd>
                  <dt>{t("Ressourcen")}</dt>
                  <dd>
                    {t(
                      planEnabled
                        ? "Plan-Zusammenfassung in den Details"
                        : "Noch nicht ermittelt",
                    )}
                  </dd>
                </>
              )}
              <dt>{t("STACKIT-Identität")}</dt>
              <dd>
                {typeof selectedInstance.settings.owner_email === "string"
                  ? t("Bei Bestellung verifiziert: {{value0}}", {
                      value0: selectedInstance.settings.owner_email,
                    })
                  : t("Bei Bestellung nicht verifiziert")}
              </dd>
              <dt>{t("Plattformvertrag")}</dt>
              <dd>
                {detailVersion
                  ? (detailVersion.platformRevision ?? t("Nicht gebunden"))
                  : t("Version nicht im aktuellen Katalog")}
              </dd>
              <dt>{t("Plattformziel")}</dt>
              <dd>{detailVersion?.targetKey ?? t("Nicht gebunden")}</dd>
            </dl>
            {selectedInstance.requestedBy === session.user.id && (
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => void checkPlanInput()}
              >
                {t("Plan-Input prüfen")}
              </button>
            )}
            {planInput && (
              <div>
                <h3>{t("Plan-Input geprüft · Kein Cloud-Plan ausgeführt")}</h3>
                <dl className="application-properties">
                  <dt>{t("Entrypoint")}</dt>
                  <dd>{planInput.plan.entrypoint}</dd>
                  <dt>{t("Accelerator-Revision")}</dt>
                  <dd>{planInput.plan.acceleratorRevision}</dd>
                </dl>
                <ul>
                  {planInput.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
                <div className="field">
                  <label htmlFor="application-plan-input">
                    {t("Terraform-Variablen · JSON")}
                  </label>
                  <textarea
                    id="application-plan-input"
                    rows={18}
                    readOnly
                    value={JSON.stringify(planInput.plan.variables, null, 2)}
                  />
                </div>
              </div>
            )}
            <ul>
              {selectedInstance.blockers
                .filter(
                  (blocker) =>
                    !planEnabled ||
                    blocker !==
                      "Der isolierte Application-Plan-Runner ist noch nicht freigegeben. Es wurde kein Cloud-Plan ausgeführt.",
                )
                .map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
            </ul>
            <details>
              <summary>{t("Wirksame Template-Vorgaben")}</summary>
              <pre>
                {JSON.stringify(
                  objectValue(selectedInstance.settings),
                  null,
                  2,
                )}
              </pre>
            </details>
          </div>
          <div
            id="application-order-panel-execution"
            role="tabpanel"
            aria-labelledby={`application-order-tab-${orderView}`}
            hidden={orderView === "overview"}
          >
            {planJobsEnabled ? (
              <ApplicationPlanControls
                key={`${session.tenant?.id}:${session.user.id}:${selectedInstance.id}:${planRefresh}`}
                instance={selectedInstance}
                session={session}
                planEnabled={planEnabled}
                applyEnabled={applyEnabled}
                delegationRequired={delegationRequired}
                view={orderView}
                onViewChange={setOrderView}
                onTerminal={load}
              />
            ) : (
              <p>{t("Der Application-Plan-Runner ist nicht aktiviert.")}</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
