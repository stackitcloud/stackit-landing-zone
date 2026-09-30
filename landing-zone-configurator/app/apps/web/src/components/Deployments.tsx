import { useEffect, useRef, useState } from "react";
import type { Session } from "./Account";
import { type AccessCheck, CheckSummary, checkMessages } from "./CheckSummary";
export type DeploymentSelection = {
  target: { id: number; owner: string; name: string };
  configurationId: string;
  head: string;
  name: string;
  organizationId: string;
};
type Preparation = {
  id: string;
  name: string;
  credentialId: string | null;
  createdAt: string;
  manifest: {
    source: {
      repository: { owner: string; name: string };
      commit: string;
      configurationId: string;
    };
    organization: { id: string; name: string };
    accelerator: { commit: string };
    tfvarsSha256: string;
    check: AccessCheck;
  };
};
const errors: Record<string, string> = {
  ...checkMessages,
  authentication_required: "Bitte melde dich mit GitHub an.",
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
  onChoose,
  onCredentials,
}: {
  session: Session | null;
  selection: DeploymentSelection | null;
  onChoose: () => void;
  onCredentials: () => void;
}) {
  const [preparations, setPreparations] = useState<Preparation[]>([]);
  const [profiles, setProfiles] = useState<
    { id: string; name: string; state: string }[]
  >([]);
  const [credentialId, setCredentialId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = useRef(false);
  async function api(url: string, init?: RequestInit) {
    const response = await fetch(url, { credentials: "same-origin", ...init });
    if (response.status === 204) return null;
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        errors[data.error] ??
          "Die Aktion konnte nicht bestätigt werden. Aktualisiere die Liste, bevor du es erneut versuchst.",
      );
    return data;
  }
  async function refresh(signal?: AbortSignal) {
    const options = signal ? { signal } : {};
    const [records, credentials] = await Promise.all([
      api("/api/v1/preparations", options),
      api("/api/v1/credentials", options),
    ]);
    setPreparations(records.preparations);
    setProfiles(credentials.profiles);
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh uses fixed endpoints and state setters.
  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    void refresh(controller.signal).catch(() => {
      if (!controller.signal.aborted)
        setError("Vorbereitungen konnten nicht geladen werden.");
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
  return (
    <section className="panel">
      <h2>Deployment vorbereiten</h2>
      <p>
        Verbinde eine gespeicherte Konfiguration mit deinem persönlichen Zugang.
        Wir prüfen Anmeldung und Zielorganisation und halten die genaue
        Git-Version fest.
      </p>
      <div className="info-banner">
        <p>
          Dieser Schritt erstellt noch keinen OpenTofu-Plan und verändert keine
          Cloud-Ressourcen. Die Ausführung von Plan und Apply folgt in einem
          nächsten Schritt.
        </p>
      </div>
      {!session ? (
        <p>Melde dich oben mit GitHub an, um Deployments vorzubereiten.</p>
      ) : (
        <>
          <button type="button" className="button secondary" onClick={onChoose}>
            Konfiguration im Fork auswählen
          </button>
          <button type="button" className="text-button" onClick={onCredentials}>
            Deployment-Zugänge verwalten
          </button>
          {selection && (
            <div className="project-form">
              <h3>{selection.name}</h3>
              <dl className="summary-list">
                <dt>Repository</dt>
                <dd>
                  {selection.target.owner}/{selection.target.name}
                </dd>
                <dt>Git-Version</dt>
                <dd>
                  <code>{selection.head.slice(0, 12)}</code>
                </dd>
                <dt>Zielorganisation</dt>
                <dd className="credential-account">
                  {selection.organizationId}
                </dd>
              </dl>
              <p className="field-hint">
                Verwendet ausschließlich die gespeicherte Version. Änderungen im
                lokalen Entwurf zuerst im Fork speichern und dann erneut
                auswählen.
              </p>
              <div className="field">
                <label htmlFor="deployment-credential">
                  Persönlicher Zugang
                </label>
                <select
                  id="deployment-credential"
                  value={credentialId}
                  onChange={(event) => setCredentialId(event.target.value)}
                  disabled={busy}
                >
                  <option value="">Bitte auswählen</option>
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
                disabled={busy || !credentialId}
                onClick={() =>
                  void perform(async () => {
                    await api("/api/v1/preparations", {
                      method: "POST",
                      headers,
                      body: JSON.stringify({
                        target: selection.target,
                        configurationId: selection.configurationId,
                        head: selection.head,
                        credentialId,
                      }),
                    });
                    setNotice(
                      "Vorbereitung gespeichert. Die gewählte Git-Version und Zielorganisation sind festgehalten. Es wurde kein Plan oder Apply ausgeführt.",
                    );
                    await refresh();
                  })
                }
              >
                Zugang prüfen und Vorbereitung speichern
              </button>
            </div>
          )}
          <h3>Gespeicherte Vorbereitungen</h3>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => void perform(() => refresh())}
          >
            Vorbereitungen aktualisieren
          </button>
          {!preparations.length && <p>Noch keine Vorbereitungen geladen.</p>}
          {preparations.map((preparation) => (
            <article className="project-form" key={preparation.id}>
              <h3>{preparation.name}</h3>
              <p>{preparation.manifest.organization.name}</p>
              <p className="credential-account">
                {preparation.manifest.source.repository.owner}/
                {preparation.manifest.source.repository.name} ·{" "}
                {preparation.manifest.source.commit.slice(0, 12)}
              </p>
              <p>
                {preparation.credentialId
                  ? "Vorbereitet · Plan/Apply noch nicht verfügbar"
                  : "Zugang gelöscht · Vorbereitung kann nicht verwendet werden"}
              </p>
              <CheckSummary check={preparation.manifest.check} />
              <details className="technical">
                <summary>Versionsnachweise</summary>
                <dl className="summary-list">
                  <dt>Konfigurations-Commit</dt>
                  <dd className="credential-account">
                    {preparation.manifest.source.commit}
                  </dd>
                  <dt>Accelerator-Referenz</dt>
                  <dd className="credential-account">
                    {preparation.manifest.accelerator.commit}
                  </dd>
                  <dt>tfvars-Prüfsumme</dt>
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
                      `Vorbereitung „${preparation.name}“ entfernen? Konfiguration und Cloud-Ressourcen bleiben bestehen.`,
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
                Vorbereitung entfernen
                <span className="sr-only">: {preparation.name}</span>
              </button>
            </article>
          ))}
          {busy && <p role="status">Prüfung läuft …</p>}
          {!busy && notice && (
            <p role="status" className="success-banner">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="validation-box">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
