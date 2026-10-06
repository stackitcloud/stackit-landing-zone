import {
  type ApplicationInstance,
  applicationInstanceSchema,
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
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import {
  currentLanguage,
  type FormattedMessage,
  formatMessage,
  t,
} from "../i18n";
import type { Session } from "./Account";
import { applicationGroupsSchema } from "./ApplicationGroups";
import { templateObservabilityConfigurable } from "./TemplateParameters";

const errors: Record<string, string> = {
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
    "Der MVP-Plan unterstützt Public-Projekte mit lokalem Netz ohne Observability oder Namespace-Dienste.",
  application_instance_not_found:
    "Diese eigene Bestellung ist in diesem Arbeitsbereich nicht verfügbar.",
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
) {
  const response = await fetch(`/api/v1/applications/${path}`, {
    method: body === undefined ? "GET" : "POST",
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
  const payload: unknown = await response.json();
  if (!response.ok) {
    const code = z.object({ error: z.string() }).safeParse(payload);
    throw new Error(
      code.success
        ? (errors[code.data.error] ??
            "Der Application-Dienst ist derzeit nicht erreichbar.")
        : "Der Application-Dienst ist derzeit nicht erreichbar.",
    );
  }
  return payload;
}

export function Applications({
  session,
  draft,
}: {
  session: Session | null;
  draft: CommonConfiguration | null;
}) {
  const [versions, setVersions] = useState<PublishedProjectTemplate[]>([]);
  const [instances, setInstances] = useState<ApplicationInstance[]>([]);
  const [versionId, setVersionId] = useState("");
  const [retirementEnabled, setRetirementEnabled] = useState(false);
  const [deploymentPolicyEnabled, setDeploymentPolicyEnabled] = useState(false);
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
  const [activeTab, setActiveTab] = useState<string | null>(null);
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
      setInstances(
        z
          .object({ instances: z.array(applicationInstanceSchema).max(200) })
          .parse(orders).instances,
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
      setNotice(
        "Bestellung gespeichert. Es wurden keine Cloud-Ressourcen erzeugt.",
      );
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
          {drafts.length ? (
            <div className="form-grid">
              <div className="field">
                <label htmlFor="application-publication">
                  {t("Application Landing Zone Template aus meinem Entwurf")}
                </label>
                <select
                  id="application-publication"
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
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
                    disabled={busy}
                    onChange={(event) => setTargetKey(event.target.value)}
                  >
                    <option value="">{t("Passendes Ziel wählen")}</option>
                    {targets.map(([key, target]) => (
                      <option key={key} value={key}>
                        {key} · {target.region} · {target.folder_id}
                      </option>
                    ))}
                  </select>
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
            <p className="muted">
              {t(
                "Kein Application Landing Zone Template im aktuellen Entwurf.",
              )}
            </p>
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
        {loaded && !instances.length && (
          <p className="muted">{t("Noch keine Bestellungen.")}</p>
        )}
        <div className="application-orders">
          {instances.map((item) => (
            <article key={item.id}>
              <strong>{item.name}</strong>
              <span>{t("Plan gesperrt")}</span>
              <button
                className="button secondary"
                type="button"
                disabled={busy}
                onClick={() => {
                  setSelectedInstance(item);
                  setPlanInput(null);
                }}
              >
                {t("Details anzeigen")}
                <span className="sr-only">: {item.name}</span>
              </button>
            </article>
          ))}
        </div>
      </section>
      {selectedInstance && (
        <section
          aria-label={t("Bestelldetails")}
          hidden={selectedTab !== "orders"}
        >
          <h2>{selectedInstance.name}</h2>
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
            <dt>{t("Planstatus")}</dt>
            <dd>{t("Gesperrt · Kein Cloud-Plan ausgeführt")}</dd>
            <dt>{t("Ressourcen")}</dt>
            <dd>{t("Noch nicht ermittelt")}</dd>
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
            {selectedInstance.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
          <details>
            <summary>{t("Wirksame Template-Vorgaben")}</summary>
            <pre>
              {JSON.stringify(objectValue(selectedInstance.settings), null, 2)}
            </pre>
          </details>
        </section>
      )}
    </div>
  );
}
