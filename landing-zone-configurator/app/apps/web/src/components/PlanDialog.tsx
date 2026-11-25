import { platformUpgradeAcceleratorCommit } from "@lzc/contracts";
import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import type { Session } from "./Account";
import { Credentials } from "./Credentials";
import { type DeploymentSelection, deploymentErrors } from "./Deployments";
import { PeopleDialog } from "./PeopleDialog";
import { StateBackends } from "./StateBackends";

type Profile = { id: string; name: string; state: string };
export function PlanDialog({
  session,
  selection,
  name,
  configurationId,
  onSave,
  onClose,
  onStarted,
  preferredCredentialId,
  retry = false,
}: {
  session: Session;
  selection: DeploymentSelection | null;
  name: string;
  configurationId: string | null;
  onSave?: (signal: AbortSignal) => Promise<DeploymentSelection>;
  onClose: () => void;
  onStarted: (selection: DeploymentSelection) => void;
  preferredCredentialId?: string | undefined;
  retry?: boolean;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [credentialId, setCredentialId] = useState("");
  const [backendId, setBackendId] = useState("");
  const [backendReady, setBackendReady] = useState(false);
  const [capabilities, setCapabilities] = useState<{
    platformUpgradeEnabled?: boolean;
    runnerAcceleratorCommit?: string;
  } | null>(null);
  const [adding, setAdding] = useState(false),
    [credentialBusy, setCredentialBusy] = useState(false);
  const [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState("");
  const [stage, setStage] = useState("");
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const active = useRef(false),
    lifetime = useRef<AbortController | null>(null);
  async function api(path: string, init?: RequestInit) {
    const response = await fetch(path, {
      credentials: "same-origin",
      signal: lifetime.current?.signal ?? null,
      ...init,
    });
    const body = await response.json();
    if (!response.ok)
      throw Error(
        deploymentErrors[body.error] ??
          (
            {
              plan_already_running:
                "Es läuft bereits ein Plan in deinem Arbeitsbereich.",
              plan_daily_limit: "Das Tageslimit von 20 Plänen ist erreicht.",
              configuration_changed:
                "Die Konfiguration wurde geändert. Öffne den aktuellen Stand und erstelle einen neuen Plan.",
              state_locked:
                "Der Plattform-State ist durch eine laufende Ausführung gesperrt. Prüfe den Ausführungsstatus und warte auf deren Abschluss.",
            } as Record<string, string>
          )[body.error] ??
          `${t("Die Anfrage ist fehlgeschlagen.")} (HTTP ${response.status}, ${t("Fehlercode:")} ${typeof body.error === "string" && /^[a-z][a-z0-9_]{0,79}$/.test(body.error) ? body.error : "unexpected_response"}).`,
      );
    return body;
  }
  async function loadProfiles(preferred?: string) {
    const body = await api("/api/v1/credentials");
    if (lifetime.current?.signal.aborted) return;
    const stored = body.profiles.filter(
      (p: Profile) => p.state === "stored",
    ) as Profile[];
    setProfiles(stored);
    setProfilesLoaded(true);
    setCredentialId((previous) =>
      stored.some((p) => p.id === (preferred ?? previous))
        ? (preferred ?? previous)
        : retry || preferred
          ? ""
          : stored.length === 1
            ? (stored[0]?.id ?? "")
            : "",
    );
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: the dialog is remounted for each workspace/configuration context.
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    void Promise.all([
      loadProfiles(preferredCredentialId),
      api("/api/v1/preparations").then((body) => {
        if (!controller.signal.aborted)
          setCapabilities(body.capabilities ?? {});
      }),
    ]).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, []);
  async function start() {
    if (
      active.current ||
      !credentialId ||
      !confirmed ||
      !backendReady ||
      !capabilities ||
      !lifetime.current
    )
      return;
    active.current = true;
    setBusy(true);
    setError("");
    const controller = lifetime.current;
    try {
      setStage("Konfiguration wird gespeichert und geprüft …");
      const chosen = onSave ? await onSave(controller.signal) : selection;
      if (controller.signal.aborted) return;
      if (!chosen)
        throw Error("Öffne eine Konfiguration, um einen Plan zu erstellen.");
      const currentEngine =
        capabilities.runnerAcceleratorCommit ===
        platformUpgradeAcceleratorCommit;
      if (currentEngine && !capabilities.platformUpgradeEnabled)
        throw Error(deploymentErrors.platform_upgrade_unavailable);
      setStage("Zugang und Ziel werden geprüft …");
      const prepared = await api("/api/v1/preparations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-LZC-CSRF": session.csrfToken,
        },
        body: JSON.stringify({
          configurationId: chosen.configurationId,
          ...("target" in chosen
            ? { target: chosen.target, head: chosen.head }
            : { source: "database", revision: chosen.revision }),
          credentialId,
          ...(backendId ? { backendId } : {}),
          ...(currentEngine
            ? {
                platformUpgrade: {
                  confirm: true,
                  acceleratorCommit: platformUpgradeAcceleratorCommit,
                },
              }
            : {}),
        }),
      });
      if (controller.signal.aborted) return;
      setStage("Plan wird gestartet …");
      await api("/api/v1/plans", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-LZC-CSRF": session.csrfToken,
        },
        body: JSON.stringify({
          preparationId: prepared.id,
          confirmStateBinding: true,
        }),
      });
      if (!controller.signal.aborted) onStarted(chosen);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "Der Plan konnte nicht gestartet werden. Prüfe den Ausführungsverlauf und versuche es erneut.",
        );
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        setStage("");
        active.current = false;
      }
    }
  }
  return (
    <PeopleDialog
      title={t(retry ? "Apply erneut versuchen" : "Plan erstellen")}
      busy={busy || credentialBusy}
      onClose={onClose}
    >
      {retry && (
        <p className="info-banner">
          {t(
            "Die Wiederholung berechnet einen neuen Plan auf dem aktuellen State. Prüfe ihn und gib Apply anschließend erneut frei. Bereits ausgeführte Änderungen bleiben berücksichtigt.",
          )}
        </p>
      )}
      <dl className="summary-list">
        <dt>{t("Konfiguration")}</dt>
        <dd>{name}</dd>
        <dt>{t("Stand")}</dt>
        <dd>
          {onSave
            ? t("Aktueller Entwurf · wird vor dem Plan gespeichert")
            : t("Aktueller gespeicherter Stand")}
        </dd>
        {selection && (
          <>
            <dt>{t("Zielorganisation")}</dt>
            <dd className="credential-account">{selection.organizationId}</dd>
          </>
        )}
        <dt>{t("State-Backend")}</dt>
        <dd>
          {!backendReady
            ? t("wird geprüft")
            : backendId
              ? t("Zugeordnetes S3-Backend")
              : t("Accelerator-Standard")}
        </dd>
      </dl>
      {adding ? (
        <div>
          <Credentials
            session={session}
            createOnly
            onBusyChange={setCredentialBusy}
            onCreated={(id) => {
              setAdding(false);
              void loadProfiles(id).catch((failure) =>
                setError(failure.message),
              );
            }}
          />
          <button
            type="button"
            className="button secondary"
            disabled={credentialBusy}
            onClick={() => setAdding(false)}
          >
            {t("Zurück zum Plan")}
          </button>
        </div>
      ) : (
        <>
          <div className="field">
            <label htmlFor="plan-credential">{t("Deployment-Zugang")}</label>
            <select
              id="plan-credential"
              required
              value={credentialId}
              disabled={busy}
              onChange={(event) => setCredentialId(event.target.value)}
            >
              <option value="">{t("Bitte auswählen")}</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => setAdding(true)}
          >
            {t("Zugang hinzufügen")}
          </button>
          {retry &&
            profilesLoaded &&
            !profiles.some((p) => p.id === preferredCredentialId) && (
              <p>
                {t(
                  "Der bisherige Zugang ist nicht mehr verfügbar. Wähle einen Zugang oder lege ihn hier an.",
                )}
              </p>
            )}
          {!profiles.length && (
            <p>
              {t(
                "Lege hier einen Deployment-Zugang an. Danach kannst du den Plan direkt starten.",
              )}
            </p>
          )}
          <details>
            <summary>{t("State-Zuordnung und Ausführungsdetails")}</summary>
            <p>
              {t(
                "Verwendet den aktuell freigegebenen Ausführungsstand. Apply übernimmt den geprüften Zugang und die State-Zuordnung aus diesem Plan.",
              )}
            </p>
            <p>
              {t("Konfigurationsstand:")}{" "}
              {onSave
                ? t("Nach dem Speichern")
                : selection &&
                  ("target" in selection
                    ? selection.head.slice(0, 12)
                    : selection.revision)}
            </p>
            <StateBackends
              session={session}
              configurationId={configurationId}
              value={backendId}
              onChange={setBackendId}
              onReady={setBackendReady}
            />
          </details>
          <p className="field-hint">
            {t(
              "Die bestehende State-Zuordnung wird geprüft. Apply benötigt anschließend deine separate Freigabe.",
            )}
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            {t(
              "Ich bestätige Zielorganisation und State-Zuordnung für diesen Plan.",
            )}
          </label>
          <div className="actions">
            <button
              type="button"
              className="button primary"
              disabled={
                busy ||
                !credentialId ||
                !confirmed ||
                !backendReady ||
                !capabilities
              }
              onClick={() => void start()}
            >
              {t(onSave ? "Speichern und Plan erstellen" : "Plan erstellen")}
            </button>
          </div>
        </>
      )}
      {stage && <p role="status">{t(stage)}</p>}
      {error && (
        <p role="alert" className="validation-box">
          {t(error)}
        </p>
      )}
    </PeopleDialog>
  );
}
