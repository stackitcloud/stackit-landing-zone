import {
  type EditorDraft,
  initialPlanIssues,
  readEditorDraft,
  recordOrganization,
  saveEditorDraft,
} from "@lzc/domain";
import { useEffect, useRef, useState } from "react";
import { currentLanguage, t } from "../i18n";
import type { Session } from "./Account";
import type { DeploymentSelection } from "./Deployments";

export type ConfigurationBinding = { id: string; revision: number };
type Summary = ConfigurationBinding & { name: string; updatedAt: string };
type StoredConfiguration = Summary & { draft: EditorDraft };

export function configurationDeploymentSelection(
  configuration: Pick<
    StoredConfiguration,
    "id" | "revision" | "draft" | "name"
  >,
): DeploymentSelection {
  const record = saveEditorDraft(
    configuration.id,
    readEditorDraft(configuration.draft),
  );
  const issues = initialPlanIssues(record);
  if (issues.length)
    throw new Error(issues.map((issue) => issue.message).join(" "));
  return {
    source: "database",
    configurationId: configuration.id,
    revision: configuration.revision,
    name: configuration.name,
    organizationId: recordOrganization(record),
  };
}

const messages: Record<string, string> = {
  authentication_required: "Bitte melde dich erneut an.",
  invalid_request_origin_or_csrf:
    "Deine Sitzung ist nicht mehr aktuell. Bitte lade die Seite neu.",
  configuration_changed:
    "Die gespeicherte Konfiguration wurde inzwischen geändert. Öffne den aktuellen Stand oder speichere deinen Entwurf als neue Kopie.",
  configuration_not_found:
    "Die Konfiguration wurde entfernt oder ist nicht zugänglich.",
  configuration_access_denied:
    "Du hast in diesem Arbeitsbereich keinen Zugriff auf diese Konfiguration.",
  platform_engineer_required:
    "Für Plattformkonfigurationen benötigst du die Rolle Platform Engineer.",
  invalid_configuration_document:
    "Bitte gib einen Namen mit höchstens 64 Zeichen an und prüfe den Entwurf.",
  configuration_document_too_large:
    "Die Konfiguration ist größer als 1 MiB und kann nicht gespeichert werden.",
};

async function checked(response: Response) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      messages[body.error] ??
        "Die Aktion konnte nicht abgeschlossen werden. Dein Entwurf bleibt erhalten.",
    );
  }
  return response;
}

export function Configurations({
  session,
  draft,
  binding,
  onSaved,
  onLoad,
  onPrepare,
  compact = false,
}: {
  session: Session | null;
  draft: EditorDraft | null;
  binding: ConfigurationBinding | null;
  onSaved: (binding: ConfigurationBinding | null) => void;
  onLoad: (draft: EditorDraft, binding: ConfigurationBinding) => void;
  onPrepare: (selection: DeploymentSelection) => void;
  compact?: boolean;
}) {
  const [configurations, setConfigurations] = useState<Summary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [executionStatuses, setExecutionStatuses] = useState<Record<
    string,
    string
  > | null>(null);
  const active = useRef(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!session) return;
    const lifetime = new AbortController();
    controller.current = lifetime;
    void fetch("/api/v1/configurations", { signal: lifetime.signal })
      .then(checked)
      .then((response) => response.json())
      .then((body) => {
        if (!lifetime.signal.aborted) setConfigurations(body.configurations);
      })
      .catch(() => {
        if (!lifetime.signal.aborted)
          setError(
            "Konfigurationen konnten nicht geladen werden. Bitte aktualisieren.",
          );
      });
    return () => lifetime.abort();
  }, [session]);

  useEffect(() => {
    if (!session || compact) return;
    const lifetime = new AbortController();
    void Promise.all([
      fetch("/api/v1/preparations", { signal: lifetime.signal }),
      fetch("/api/v1/plans", { signal: lifetime.signal }),
    ])
      .then(async ([prepared, planned]) => {
        if (!prepared.ok || !planned.ok) return;
        const { preparations } = await prepared.json();
        const { runs } = await planned.json();
        const statuses: Record<string, string> = {};
        for (const run of runs) {
          const preparation = preparations.find(
            (item: { id: string }) => item.id === run.preparationId,
          );
          const id = preparation?.manifest?.source?.configurationId;
          if (!id || statuses[id]) continue;
          const labels: Record<string, string> = {
            starting: "Ausführung startet",
            initializing: "Initialisierung",
            validating: "Validierung",
            planning: "Plan läuft",
            applying: "Apply läuft",
            cancelled: "Abgebrochen",
            succeeded:
              run.operation === "apply"
                ? "Apply abgeschlossen"
                : "Plan abgeschlossen",
            failed:
              run.operation === "apply"
                ? "Apply fehlgeschlagen"
                : "Plan fehlgeschlagen",
            recovery_required: "Wiederherstellung erforderlich",
          };
          statuses[id] = labels[run.status] ?? "Status unbekannt";
        }
        if (!lifetime.signal.aborted) setExecutionStatuses(statuses);
      })
      .catch(() => {});
    return () => lifetime.abort();
  }, [session, compact]);

  async function refresh() {
    const response = await checked(
      await fetch("/api/v1/configurations", {
        signal: controller.current?.signal ?? null,
      }),
    );
    const body = await response.json();
    if (!controller.current?.signal.aborted)
      setConfigurations(body.configurations);
  }

  async function perform(action: () => Promise<void>) {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (failure) {
      if (!controller.current?.signal.aborted)
        setError(
          failure instanceof Error ? failure.message : "Aktion fehlgeschlagen.",
        );
    } finally {
      active.current = false;
      setBusy(false);
    }
  }

  async function save(copy = false, prepare = false) {
    if (!session || !draft) return;
    await perform(async () => {
      const current = copy ? null : binding;
      const response = await checked(
        await fetch(
          current
            ? `/api/v1/configurations/${current.id}`
            : "/api/v1/configurations",
          {
            method: current ? "PUT" : "POST",
            signal: controller.current?.signal ?? null,
            headers: {
              "Content-Type": "application/json",
              "X-LZC-CSRF": session.csrfToken,
            },
            body: JSON.stringify({
              draft,
              ...(current ? { revision: current.revision } : {}),
            }),
          },
        ),
      );
      const { configuration } = (await response.json()) as {
        configuration: StoredConfiguration;
      };
      if (controller.current?.signal.aborted) return;
      onSaved({ id: configuration.id, revision: configuration.revision });
      setNotice("Konfiguration in der Datenbank gespeichert.");
      await refresh();
      if (prepare && !controller.current?.signal.aborted)
        onPrepare(configurationDeploymentSelection(configuration));
    });
  }

  if (compact)
    return (
      <section
        className="configuration-save"
        aria-label={t("Konfiguration speichern")}
      >
        <div className="actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy || !session || !draft}
            onClick={() => void save()}
          >
            {t("Konfiguration speichern")}
          </button>
          <button
            type="button"
            className="button primary"
            disabled={busy || !session || !draft}
            onClick={() => void save(false, true)}
          >
            {t("Speichern und zur Bereitstellung")}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy || !session || !draft}
            onClick={() => void save(true)}
          >
            {t("Als neue Kopie speichern")}
          </button>
        </div>
        {error && <p role="alert">{t(error)}</p>}
        {notice && <p role="status">{t(notice)}</p>}
      </section>
    );

  return (
    <section className="panel" aria-label={t("Gespeicherte Konfigurationen")}>
      <h2>{t("Gespeicherte Konfigurationen")}</h2>
      <p className="muted">
        {t("Deine Konfigurationen in diesem Arbeitsbereich.")}
      </p>
      {!session ? (
        <p>
          {t(
            "Bitte melde dich an, um Konfigurationen zu speichern und zu öffnen. GitHub ist dafür nicht erforderlich.",
          )}
        </p>
      ) : (
        <>
          <div className="actions">
            <button
              type="button"
              className="button primary"
              disabled={busy || !draft}
              onClick={() => void save()}
            >
              {t("Konfiguration speichern")}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy || !draft}
              onClick={() => void save(true)}
            >
              {t("Als neue Kopie speichern")}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => void perform(refresh)}
            >
              {t("Aktualisieren")}
            </button>
          </div>
          {error && <p role="alert">{t(error)}</p>}
          {notice && <p role="status">{t(notice)}</p>}
          {!configurations.length && (
            <p>{t("Keine Konfigurationen gespeichert.")}</p>
          )}
          {configurations.map((item) => (
            <div className="actions" key={item.id}>
              <strong>{item.name}</strong>
              <span>
                {executionStatuses
                  ? (executionStatuses[item.id] ??
                    t("Noch keine eigene Ausführung"))
                  : t("Ausführungsstatus nicht verfügbar")}
              </span>
              <span className="muted">
                {t("Revision")} {item.revision} ·{" "}
                {new Date(item.updatedAt).toLocaleString(currentLanguage())}
              </span>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                aria-label={t("Konfiguration öffnen: {{value0}}", {
                  value0: item.name,
                })}
                onClick={() => {
                  if (
                    draft &&
                    !window.confirm(
                      t(
                        "Aktuellen Entwurf durch die gespeicherte Konfiguration ersetzen?",
                      ),
                    )
                  )
                    return;
                  void perform(async () => {
                    const response = await checked(
                      await fetch(`/api/v1/configurations/${item.id}`, {
                        signal: controller.current?.signal ?? null,
                      }),
                    );
                    const { configuration } = (await response.json()) as {
                      configuration: StoredConfiguration;
                    };
                    const loaded = readEditorDraft(configuration.draft);
                    if (!controller.current?.signal.aborted)
                      onLoad(loaded, {
                        id: configuration.id,
                        revision: configuration.revision,
                      });
                  });
                }}
              >
                {t("Öffnen")}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                aria-label={t("Deployment vorbereiten: {{value0}}", {
                  value0: item.name,
                })}
                onClick={() =>
                  void perform(async () => {
                    const response = await checked(
                      await fetch(`/api/v1/configurations/${item.id}`, {
                        signal: controller.current?.signal ?? null,
                      }),
                    );
                    const { configuration } = (await response.json()) as {
                      configuration: StoredConfiguration;
                    };
                    if (!controller.current?.signal.aborted)
                      onPrepare(
                        configurationDeploymentSelection(configuration),
                      );
                  })
                }
              >
                {t("Deployment vorbereiten")}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                aria-label={t("Konfiguration löschen: {{value0}}", {
                  value0: item.name,
                })}
                onClick={() => {
                  if (
                    !window.confirm(
                      t(
                        "Gespeicherte Konfiguration aus der Datenbank löschen? Der aktuelle Entwurf bleibt erhalten.",
                      ),
                    )
                  )
                    return;
                  void perform(async () => {
                    await checked(
                      await fetch(`/api/v1/configurations/${item.id}`, {
                        method: "DELETE",
                        signal: controller.current?.signal ?? null,
                        headers: {
                          "Content-Type": "application/json",
                          "X-LZC-CSRF": session.csrfToken,
                        },
                        body: JSON.stringify({ revision: item.revision }),
                      }),
                    );
                    if (controller.current?.signal.aborted) return;
                    if (binding?.id === item.id) onSaved(null);
                    setNotice(
                      "Gespeicherte Konfiguration gelöscht. Der aktuelle Entwurf bleibt erhalten.",
                    );
                    await refresh();
                  });
                }}
              >
                {t("Löschen")}
              </button>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
