import { useEffect, useRef, useState } from "react";
import { currentLanguage, t } from "../i18n";
import type { DeploymentStep } from "../navigation";
import type { Session } from "./Account";
import { type AccessCheck, CheckSummary, checkMessages } from "./CheckSummary";
import { configurationDeploymentSelection } from "./Configurations";
import { PlanRuns } from "./PlanRuns";
import { StateBackends } from "./StateBackends";
export type DeploymentSelection =
  | {
      target: { id: number; owner: string; name: string };
      configurationId: string;
      head: string;
      name: string;
      organizationId: string;
    }
  | {
      source: "database";
      configurationId: string;
      revision: number;
      name: string;
      organizationId: string;
    };
type Preparation = {
  id: string;
  name: string;
  credentialId: string | null;
  createdAt: string;
  manifest: {
    source:
      | {
          repository: { owner: string; name: string };
          commit: string;
          configurationId: string;
        }
      | {
          kind: "database";
          configurationId: string;
          revision: number;
          documentSha256: string;
        };
    organization: { id: string; name: string };
    accelerator: { commit: string };
    tfvarsSha256: string;
    check: AccessCheck;
  };
};
const errors: Record<string, string> = {
  configuration_execution_not_supported:
    "Diese Konfiguration enthält Komponenten, die der Erstbereitstellungsplan noch nicht unterstützt. Prüfe die Ausführungshinweise bei der Konfigurationsauswahl.",
  preparation_has_plans:
    "Diese Vorbereitung besitzt Plan-Nachweise und bleibt für deren Nachvollziehbarkeit erhalten.",
  ...checkMessages,
  authentication_required: "Bitte melde dich an.",
  configuration_changed:
    "Die gespeicherte Konfiguration wurde geändert. Wähle sie erneut aus und erstelle eine neue Vorbereitung.",
  configuration_not_found:
    "Die Konfiguration wurde entfernt oder ist nicht zugänglich.",
  configuration_incomplete:
    "Bitte vervollständige die Konfiguration und speichere sie erneut.",
  github_reauthentication_required: "Bitte melde dich erneut mit GitHub an.",
  repository_changed:
    "Der Fork wurde seit deiner Auswahl verändert. Wähle die gespeicherte Konfiguration erneut aus.",
  generated_configuration_changed:
    "JSON und tfvars fehlen oder passen nicht zusammen. Speichere die Konfiguration erneut im Configurator; prüfe zuvor mögliche manuelle Änderungen.",
  credential_not_found:
    "Der Zugang fehlt oder gehört nicht zu deinem Arbeitsbereich.",
  credential_changed:
    "Der Zugang wurde zwischenzeitlich geändert oder gelöscht. Wähle ihn erneut aus.",
  repository_access_denied:
    "Der Zugriff auf den Fork wurde abgelehnt. Prüfe die GitHub-App-Installation.",
  preparation_limit_reached:
    "Maximal 100 Vorbereitungen. Entferne zuerst nicht mehr benötigte Einträge.",
};
export function Deployments({
  session,
  selection,
  onSelect,
  onChoose,
  onCredentials,
  historyOnly = false,
  configurationId,
  step = "preparation",
  onStep,
}: {
  session: Session | null;
  selection: DeploymentSelection | null;
  onSelect: (selection: DeploymentSelection | null) => void;
  onChoose: () => void;
  onCredentials: () => void;
  historyOnly?: boolean;
  configurationId?: string | undefined;
  step?: DeploymentStep;
  onStep?: (step: DeploymentStep) => void;
}) {
  const [preparations, setPreparations] = useState<Preparation[]>([]);
  const [configurations, setConfigurations] = useState<
    { id: string; name: string; revision: number }[]
  >([]);
  const [profiles, setProfiles] = useState<
    { id: string; name: string; state: string }[]
  >([]);
  const [credentialId, setCredentialId] = useState("");
  const [backendId, setBackendId] = useState("");
  const [backendReady, setBackendReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [chosenPreparation, setChosenPreparation] = useState("");
  const preparationScope = useRef(configurationId);
  useEffect(() => {
    if (preparationScope.current !== configurationId) {
      preparationScope.current = configurationId;
      setChosenPreparation("");
    }
  }, [configurationId]);
  const active = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  async function api(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      credentials: "same-origin",
      signal: lifetime.current?.signal ?? null,
      ...init,
    });
    if (response.status === 204) return null;
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        errors[data.error] ??
          "Die Aktion konnte nicht bestätigt werden. Aktualisiere die Liste, bevor du es erneut versuchst.",
      );
    return data;
  }
  async function refresh(signal = lifetime.current?.signal) {
    const options = signal ? { signal } : {};
    const [records, credentials, saved] = await Promise.all([
      api("/api/v1/preparations", options),
      api("/api/v1/credentials", options),
      api("/api/v1/configurations", options),
    ]);
    if (signal?.aborted) return;
    setPreparations(records.preparations);
    setProfiles(credentials.profiles);
    setConfigurations(saved.configurations);
    const stored = credentials.profiles.filter(
      (profile: { state: string }) => profile.state === "stored",
    );
    setCredentialId((current) =>
      stored.some((profile: { id: string }) => profile.id === current)
        ? current
        : stored.length === 1
          ? stored[0].id
          : "",
    );
    if (!historyOnly && !selection && saved.configurations.length === 1) {
      const { configuration } = await api(
        `/api/v1/configurations/${saved.configurations[0].id}`,
        options,
      );
      if (!signal?.aborted)
        onSelect(configurationDeploymentSelection(configuration));
    }
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload lists on session changes, not configuration selection.
  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    lifetime.current = controller;
    void refresh(controller.signal).catch((failure) => {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "Vorbereitungen konnten nicht geladen werden.",
        );
    });
    return () => controller.abort();
  }, [session]);
  async function perform(action: () => Promise<void>) {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Aktion fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
      active.current = false;
    }
  }
  const headers = {
    "Content-Type": "application/json",
    "X-LZC-CSRF": session?.csrfToken ?? "",
  };
  const scopedPreparations = configurationId
    ? preparations.filter(
        (preparation) =>
          preparation.manifest.source.configurationId === configurationId,
      )
    : preparations;
  return (
    <section className="panel">
      <h2 className="sr-only">
        {historyOnly
          ? t("Ausführungsverlauf")
          : step === "plan"
            ? t("Plan")
            : step === "apply"
              ? t("Apply")
              : t("Deployment vorbereiten")}
      </h2>
      <div hidden={historyOnly || step !== "preparation"}>
        <p>
          {t(
            "Verbinde eine gespeicherte Konfiguration mit deinem persönlichen Zugang. Wir prüfen Anmeldung und Zielorganisation und halten die genaue gespeicherte Revision fest. GitHub ist optional.",
          )}
        </p>
      </div>
      {!session ? (
        <p>
          {t(
            "Melde dich oben an, um Deployments vorzubereiten. GitHub ist dafür nicht erforderlich.",
          )}
        </p>
      ) : (
        <>
          <PlanRuns
            session={session}
            preparations={scopedPreparations}
            selectionKey={JSON.stringify(selection)}
            readOnly={historyOnly}
            scopeToPreparations={Boolean(configurationId)}
            phase={historyOnly ? "history" : step}
            preparationId={chosenPreparation}
            onPreparationChange={setChosenPreparation}
            onStep={onStep}
          />
          <div hidden={historyOnly || step !== "preparation"}>
            <div className="field">
              <label htmlFor="saved-preparation-detail">
                {t("Vorbereitung auswählen")}
              </label>
              <select
                id="saved-preparation-detail"
                value={chosenPreparation}
                onChange={(event) => setChosenPreparation(event.target.value)}
              >
                <option value="">{t("Bitte auswählen")}</option>
                {scopedPreparations.map((preparation) => (
                  <option key={preparation.id} value={preparation.id}>
                    {preparation.name} ·{" "}
                    {new Date(preparation.createdAt).toLocaleString(
                      currentLanguage() === "de" ? "de-DE" : "en-GB",
                    )}
                  </option>
                ))}
              </select>
            </div>
            <details
              open={
                !scopedPreparations.some(
                  (preparation) => preparation.id === chosenPreparation,
                )
              }
            >
              <summary>{t("Neue Vorbereitung")}</summary>
              <button
                type="button"
                className="button secondary"
                onClick={onChoose}
              >
                {t("Gespeicherte Konfiguration auswählen")}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={onCredentials}
              >
                {t("Deployment-Zugänge verwalten")}
              </button>
              <div className="field">
                <label htmlFor="deployment-configuration">
                  {t("Gespeicherte Konfiguration")}
                </label>
                <select
                  id="deployment-configuration"
                  value={
                    selection && !("target" in selection)
                      ? selection.configurationId
                      : ""
                  }
                  disabled={busy}
                  onChange={(event) => {
                    const id = event.target.value;
                    if (!id) {
                      onSelect(null);
                      return;
                    }
                    void perform(async () => {
                      const { configuration } = await api(
                        `/api/v1/configurations/${id}`,
                      );
                      if (!lifetime.current?.signal.aborted)
                        onSelect(
                          configurationDeploymentSelection(configuration),
                        );
                    });
                  }}
                >
                  <option value="">{t("Bitte auswählen")}</option>
                  {configurations.map((configuration) => (
                    <option key={configuration.id} value={configuration.id}>
                      {configuration.name} {t("· Revision")}{" "}
                      {configuration.revision}
                    </option>
                  ))}
                </select>
              </div>
              <details>
                <summary>
                  {t("State-Backend ·")}{" "}
                  {backendReady
                    ? backendId
                      ? t("S3")
                      : t("Accelerator-Standard")
                    : t("wird geprüft")}
                </summary>
                <StateBackends
                  session={session}
                  configurationId={selection?.configurationId ?? null}
                  value={backendId}
                  onChange={setBackendId}
                  onReady={setBackendReady}
                />
              </details>
              {selection && (
                <div className="project-form">
                  <h3>{selection.name}</h3>
                  <dl className="summary-list">
                    <dt>{t("Speicherort")}</dt>
                    <dd>
                      {"target" in selection
                        ? `${selection.target.owner}/${selection.target.name}`
                        : t("Datenbank")}
                    </dd>
                    <dt>
                      {"target" in selection ? t("Git-Version") : t("Revision")}
                    </dt>
                    <dd>
                      <code>
                        {"target" in selection
                          ? selection.head.slice(0, 12)
                          : selection.revision}
                      </code>
                    </dd>
                    <dt>{t("Zielorganisation")}</dt>
                    <dd className="credential-account">
                      {selection.organizationId}
                    </dd>
                  </dl>
                  <p className="field-hint">
                    {t(
                      "Verwendet ausschließlich die gespeicherte Version. Änderungen im lokalen Entwurf zuerst speichern und dann erneut auswählen.",
                    )}
                  </p>
                  <div className="field">
                    <label htmlFor="deployment-credential">
                      {t("Persönlicher Zugang")}
                    </label>
                    <select
                      id="deployment-credential"
                      value={credentialId}
                      onChange={(event) => setCredentialId(event.target.value)}
                      disabled={busy}
                    >
                      <option value="">{t("Bitte auswählen")}</option>
                      {profiles
                        .filter((profile) => profile.state === "stored")
                        .map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    className="button primary"
                    disabled={busy || !credentialId || !backendReady}
                    onClick={() =>
                      void perform(async () => {
                        const prepared = await api("/api/v1/preparations", {
                          method: "POST",
                          headers,
                          body: JSON.stringify({
                            configurationId: selection.configurationId,
                            ...("target" in selection
                              ? {
                                  target: selection.target,
                                  head: selection.head,
                                }
                              : {
                                  source: "database",
                                  revision: selection.revision,
                                }),
                            credentialId,
                            ...(backendId ? { backendId } : {}),
                          }),
                        });
                        setChosenPreparation(prepared.id);
                        setNotice(
                          "Vorbereitung gespeichert. Die gespeicherte Konfiguration und Zielorganisation sind festgehalten. Es wurde kein Plan oder Apply ausgeführt.",
                        );
                        await refresh();
                      })
                    }
                  >
                    {t("Zugang prüfen und Vorbereitung speichern")}
                  </button>
                </div>
              )}
            </details>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => void perform(() => refresh())}
            >
              {t("Vorbereitungen aktualisieren")}
            </button>
            {!preparations.length && (
              <p>{t("Noch keine Vorbereitungen geladen.")}</p>
            )}
            {scopedPreparations
              .filter((preparation) => preparation.id === chosenPreparation)
              .map((preparation) => (
                <article className="project-form" key={preparation.id}>
                  <h3>{preparation.name}</h3>
                  <p>{preparation.manifest.organization.name}</p>
                  <p className="credential-account">
                    {"repository" in preparation.manifest.source
                      ? `${preparation.manifest.source.repository.owner}/${preparation.manifest.source.repository.name} · ${preparation.manifest.source.commit.slice(0, 12)}`
                      : t("Datenbank · Revision {{value0}}", {
                          value0: preparation.manifest.source.revision,
                        })}
                  </p>
                  <p>
                    {preparation.credentialId
                      ? t(
                          "Vorbereitet · Apply erst nach Planprüfung und Freigabe",
                        )
                      : t(
                          "Zugang gelöscht · Vorbereitung kann nicht verwendet werden",
                        )}
                  </p>
                  <CheckSummary check={preparation.manifest.check} />
                  <details className="technical">
                    <summary>{t("Versionsnachweise")}</summary>
                    <dl className="summary-list">
                      <dt>
                        {"repository" in preparation.manifest.source
                          ? t("Konfigurations-Commit")
                          : t("Datenbankrevision")}
                      </dt>
                      <dd className="credential-account">
                        {"repository" in preparation.manifest.source
                          ? preparation.manifest.source.commit
                          : preparation.manifest.source.revision}
                      </dd>
                      <dt>{t("Accelerator-Referenz")}</dt>
                      <dd className="credential-account">
                        {preparation.manifest.accelerator.commit}
                      </dd>
                      <dt>{t("tfvars-Prüfsumme")}</dt>
                      <dd className="credential-account">
                        {preparation.manifest.tfvarsSha256}
                      </dd>
                    </dl>
                  </details>
                  <button
                    type="button"
                    className="text-button danger"
                    disabled={busy}
                    onClick={() => {
                      if (
                        !window.confirm(
                          t(
                            "Vorbereitung „{{value0}}“ entfernen? Konfiguration und Cloud-Ressourcen bleiben bestehen.",
                            { value0: preparation.name },
                          ),
                        )
                      )
                        return;
                      void perform(async () => {
                        await api(`/api/v1/preparations/${preparation.id}`, {
                          method: "DELETE",
                          headers,
                        });
                        await refresh();
                        setNotice("Vorbereitung entfernt.");
                      });
                    }}
                  >
                    {t("Vorbereitung entfernen")}
                    <span className="sr-only">: {preparation.name}</span>
                  </button>
                </article>
              ))}
            <button
              type="button"
              className="button primary"
              disabled={
                !scopedPreparations.some(
                  (preparation) =>
                    preparation.id === chosenPreparation &&
                    preparation.credentialId,
                )
              }
              onClick={() => onStep?.("plan")}
            >
              {t("Weiter zu Plan")}
            </button>
          </div>
          {busy && <p role="status">{t("Prüfung läuft …")}</p>}
          {!busy && notice && (
            <p role="status" className="success-banner">
              {t(notice)}
            </p>
          )}
          {error && (
            <p role="alert" className="validation-box">
              {t(error)}
            </p>
          )}
        </>
      )}
    </section>
  );
}
