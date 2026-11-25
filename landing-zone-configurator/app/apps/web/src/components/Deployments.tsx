import { useEffect, useState } from "react";
import { t } from "../i18n";
import type { DeploymentStep } from "../navigation";
import type { Session } from "./Account";
import { type AccessCheck, checkMessages } from "./CheckSummary";
import { configurationDeploymentSelection } from "./Configurations";
import { PlanRuns } from "./PlanRuns";
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
          repository: { id: number; owner: string; name: string };
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
export const deploymentErrors: Record<string, string> = {
  observability_plan_incompatible:
    "Der gewählte Observability-Tarif und seine Einstellungen passen nicht zusammen oder konnten nicht verifiziert werden. Prüfe Tarif und Aufbewahrung im Editor. Gespeicherte Werte bleiben erhalten.",
  firewall_administration_required:
    "Für Firewall-HA fehlt ein OPNsense-Administrationszugang. Ergänze im Plan-Dialog ein passendes Zugangsprofil und erstelle einen neuen Plan.",
  configuration_execution_not_supported:
    "Diese Konfiguration enthält Komponenten, die der Erstbereitstellungsplan noch nicht unterstützt. Prüfe die Ausführungshinweise bei der Konfigurationsauswahl.",
  preparation_has_plans:
    "Diese Vorbereitung besitzt Plan-Nachweise und bleibt für deren Nachvollziehbarkeit erhalten.",
  ...checkMessages,
  authentication_required: "Bitte melde dich an.",
  configuration_changed:
    "Die gespeicherte Konfiguration wurde geändert. Öffne den aktuellen Stand und erstelle einen neuen Plan.",
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
    "Zu viele offene Plan-Anfragen. Lass nicht verwendete Ausführungsnachweise durch den Betreiber prüfen.",
  platform_upgrade_unavailable:
    "Der aktuelle Ausführungsstand ist für neue Pläne nicht freigegeben. Bitte die Runner-Konfiguration prüfen lassen.",
  platform_upgrade_state_unavailable:
    "Für den Accelerator-Wechsel ist der vorhandene S3-State oder ein ausdrücklich geprüfter, unterstützter Bootstrap-Checkpoint erforderlich. Prüfe den Checkpoint und offene Ausführungen; deine Konfiguration bleibt erhalten.",
  state_backend_already_managed:
    "Dieser S3-State-Pfad ist bereits einer anderen verwalteten Landing Zone zugeordnet. Wähle einen eigenen State-Pfad.",
  state_backend_binding_invalid:
    "Die State-Zuordnung ist ungültig. Prüfe das ausgewählte Backend.",
  state_locked:
    "Der Plattform-State ist durch eine laufende Ausführung gesperrt. Prüfe den Ausführungsstatus und warte auf deren Abschluss.",
  backend_not_found:
    "Das ausgewählte State-Backend ist nicht mehr verfügbar. Wähle das zur Landing Zone gehörende Backend erneut aus.",
  backend_binding_changed:
    "Das ausgewählte State-Backend passt nicht zur bestehenden Landing Zone. Verwende deren gebundenes Backend; es wird kein neuer State angelegt.",
  invalid_request_origin_or_csrf:
    "Die Sicherheitsbestätigung deiner Sitzung ist nicht mehr aktuell. Lade die Seite neu und melde dich gegebenenfalls erneut an.",
  invalid_preparation_request:
    "Der Plan-Auftrag enthält ungültige oder zur aktuellen API-Version unpassende Angaben. Lade die Seite neu und öffne die gespeicherte Konfiguration erneut.",
  github_connection_required:
    "Für eine im GitHub-Fork gespeicherte Konfiguration ist eine GitHub-Verbindung erforderlich. Verbinde GitHub oder wähle eine in der Datenbank gespeicherte Konfiguration.",
};
export function Deployments({
  session,
  selection,
  onChoose,
  onSelect,
  historyOnly = false,
  configurationId,
  step = "plan",
  onStep,
  onNewPlan,
  onRetryApply,
  refreshKey = 0,
}: {
  session: Session | null;
  selection: DeploymentSelection | null;
  onChoose: () => void;
  onSelect: (selection: DeploymentSelection) => void;
  historyOnly?: boolean;
  configurationId?: string | undefined;
  step?: DeploymentStep;
  onStep?: (step: DeploymentStep) => void;
  onNewPlan: () => void;
  onRetryApply: (
    id: string,
    credentialId: string | null,
    repository?: { id: number; owner: string; name: string },
  ) => void;
  refreshKey?: number;
}) {
  const [preparations, setPreparations] = useState<Preparation[]>([]);
  const [error, setError] = useState("");
  const [selectionChecked, setSelectionChecked] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh the internal evidence after a new plan is started.
  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    void fetch("/api/v1/preparations", {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw Error("Ausführungsnachweise konnten nicht geladen werden.");
        const data = await response.json();
        if (!controller.signal.aborted) {
          setPreparations(data.preparations);
          setError("");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Ausführungsnachweise konnten nicht geladen werden.");
      });
    return () => controller.abort();
  }, [session, refreshKey]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: choose the sole saved configuration only when no draft or explicit selection is active.
  useEffect(() => {
    if (!session || selection || configurationId || historyOnly) return;
    setSelectionChecked(false);
    const controller = new AbortController();
    void fetch("/api/v1/configurations", {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const body = await response.json();
        if (body.configurations?.length !== 1) return;
        const saved = await fetch(
          `/api/v1/configurations/${body.configurations[0].id}`,
          { credentials: "same-origin", signal: controller.signal },
        );
        if (!saved.ok) return;
        const data = await saved.json();
        if (!controller.signal.aborted)
          onSelect(configurationDeploymentSelection(data.configuration));
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setSelectionChecked(true);
      });
    return () => controller.abort();
  }, [session, selection, configurationId, historyOnly]);
  const scoped = configurationId
    ? preparations.filter(
        (p) => p.manifest.source.configurationId === configurationId,
      )
    : preparations;
  return (
    <section className="panel">
      {!selection && !historyOnly && (
        <div className="info-banner">
          <p>{t("Öffne eine Konfiguration, um einen Plan zu erstellen.")}</p>
          <button type="button" className="button secondary" onClick={onChoose}>
            {t("Konfiguration auswählen")}
          </button>
        </div>
      )}
      {error && <p role="alert">{t(error)}</p>}
      {session &&
        (selection || configurationId || historyOnly || selectionChecked) && (
          <PlanRuns
            session={session}
            preparations={scoped}
            selectionKey={JSON.stringify(selection)}
            readOnly={historyOnly}
            scopeToPreparations={Boolean(configurationId)}
            phase={
              historyOnly ? "history" : step === "preparation" ? "plan" : step
            }
            onStep={onStep}
            onNewPlan={onNewPlan}
            onRetryApply={onRetryApply}
            canCreatePlan={Boolean(selection)}
            refreshKey={refreshKey}
          />
        )}
    </section>
  );
}
