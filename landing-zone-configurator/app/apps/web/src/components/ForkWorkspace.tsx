import {
  type ConfigurationDraft,
  readSavedDraft,
  savedDraft,
  validateDraft,
} from "@lzc/domain";
import { useEffect, useRef, useState } from "react";
import type { Session } from "./Account";
import type { DeploymentSelection } from "./Deployments";

type Fork = {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
};
type Repository = {
  fork: Fork;
  head: string;
  branch: string;
  branchExists: boolean;
  configurations: { id: string; name: string }[];
  unsupported: number;
  truncated: boolean;
};
const installation =
  "https://github.com/apps/lz-configurator-dev-7dbff805/installations/new";
const errors: Record<string, string> = {
  authentication_required: "Bitte melde dich mit GitHub an.",
  github_reauthentication_required:
    "Deine GitHub-Freigabe ist abgelaufen oder widerrufen. Bitte erneut anmelden.",
  repository_access_denied:
    "Die App hat auf dieses Repository keinen Zugriff. Bitte Installation und Schreibrechte prüfen.",
  not_writable_accelerator_fork:
    "Dieses Repository ist kein beschreibbarer Fork des Accelerators.",
  repository_changed:
    "Der Branch wurde inzwischen verändert. Lade den gespeicherten Stand neu oder speichere deinen Entwurf nach dem Aktualisieren als neue Kopie.",
  repository_conflict_or_branch_protection:
    "GitHub hat den Commit abgelehnt: mögliche parallele Änderung oder Branch-Regel. Dein Entwurf bleibt erhalten. Bitte den GitHub-Stand prüfen.",
  github_rate_limited:
    "GitHubs Zugriffslimit ist erreicht. Bitte später erneut versuchen.",
  generated_configuration_changed:
    "Die tfvars-Datei wurde außerhalb des Configurators geändert oder passt nicht mehr zum gespeicherten Entwurf. Prüfe den Stand in GitHub oder speichere deinen Entwurf als neue Kopie. Es wurde nichts überschrieben.",
  unsupported_configuration_document:
    "Diese Konfiguration oder Template-Version wird vom Editor noch nicht unterstützt.",
  unsafe_configuration_path:
    "Der Speicherpfad wurde außerhalb des Configurators verändert und kann nicht sicher verwendet werden.",
  configuration_already_exists:
    "Diese Konfiguration existiert bereits. Bitte den Stand neu laden.",
};
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      errors[body.error as string] ??
        "Die Aktion konnte nicht abgeschlossen werden. Dein Entwurf bleibt erhalten. Bitte erneut versuchen.",
    );
  return body as T;
}
const query = (fork: Fork) =>
  new URLSearchParams({
    owner: fork.owner,
    name: fork.name,
    id: String(fork.id),
  }).toString();
const target = (fork: Fork) => ({
  owner: fork.owner,
  name: fork.name,
  id: fork.id,
});
export function ForkWorkspace({
  session,
  draft,
  draftEpoch,
  onLoad,
  onEdit,
  onPrepare,
}: {
  session: Session | null;
  draft: ConfigurationDraft | null;
  draftEpoch: number;
  onLoad: (draft: ConfigurationDraft) => void;
  onEdit: () => void;
  onPrepare: (selection: DeploymentSelection) => void;
}) {
  const [forks, setForks] = useState<Fork[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(1);
  const [searched, setSearched] = useState(false);
  const [repository, setRepository] = useState<Repository | null>(null);
  const [binding, setBinding] = useState<{
    id: string;
    head: string;
    mode: "create" | "update";
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [commitUrl, setCommitUrl] = useState("");
  const busyRef = useRef(false);
  // A new template copy must never overwrite the previously opened configuration.
  // biome-ignore lint/correctness/useExhaustiveDependencies: draftEpoch marks a new copy, not an edit.
  useEffect(() => {
    setBinding(null);
    setNotice("");
    setCommitUrl("");
  }, [draftEpoch]);
  async function perform(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Aktion fehlgeschlagen.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function findForks(reset: boolean) {
    await perform(async () => {
      const page = reset ? 1 : nextPage;
      if (!page) return;
      const result = await api<{ forks: Fork[]; nextPage: number | null }>(
        `/api/v1/github/forks?page=${page}`,
      );
      setForks((previous) => [
        ...new Map(
          [...(reset ? [] : previous), ...result.forks].map((fork) => [
            fork.id,
            fork,
          ]),
        ).values(),
      ]);
      setNextPage(result.nextPage);
      setSearched(true);
    });
  }
  async function select(fork: Fork) {
    if (
      binding?.mode === "update" &&
      !window.confirm(
        "In einen anderen Fork wechseln? Der aktuelle Entwurf wird dort nur als neue Kopie gespeichert.",
      )
    )
      return;
    await perform(async () => {
      const result = await api<Repository>(
        `/api/v1/github/repository?${query(fork)}`,
      );
      setRepository(result);
      setBinding(null);
      setCommitUrl("");
    });
  }
  async function open(id: string) {
    if (!repository) return;
    if (
      draft &&
      !window.confirm(
        "Den aktuellen lokalen Entwurf durch die gespeicherte Konfiguration ersetzen?",
      )
    )
      return;
    await perform(async () => {
      const result = await api<{ document: unknown; head: string }>(
        `/api/v1/github/configuration/${id}?${query(repository.fork)}`,
      );
      const document = readSavedDraft(result.document);
      setBinding({ id, head: result.head, mode: "update" });
      setRepository({ ...repository, head: result.head });
      setCommitUrl("");
      onLoad(document.draft);
    });
  }
  async function save() {
    if (!repository || !session || !draft || validateDraft(draft).length)
      return;
    await perform(async () => {
      const current = binding ?? {
        id: crypto.randomUUID(),
        head: repository.head,
        mode: "create" as const,
      };
      // Preserve the ID even when a network timeout makes the result ambiguous.
      setBinding(current);
      const result = await api<{ id: string; head: string; commitUrl: string }>(
        "/api/v1/github/configuration",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-lzc-csrf": session.csrfToken,
          },
          body: JSON.stringify({
            target: target(repository.fork),
            head: current.head,
            mode: current.mode,
            document: savedDraft(current.id, draft),
          }),
        },
      );
      setBinding({ id: result.id, head: result.head, mode: "update" });
      setRepository({
        ...repository,
        head: result.head,
        branchExists: true,
        configurations: [
          ...repository.configurations.filter((c) => c.id !== result.id),
          { id: result.id, name: draft.name },
        ],
      });
      setCommitUrl(result.commitUrl);
      setNotice(
        "Deine Konfiguration wurde als JSON und tfvars gemeinsam im Fork gespeichert.",
      );
    });
  }
  return (
    <section className="panel fork-workspace" aria-label="GitHub-Forks">
      <h2>Deine Forks</h2>
      <p>
        Verbinde einen beschreibbaren Accelerator-Fork. Der Configurator
        speichert deine Entwürfe im Branch <code>lzc/configurations</code>. Pro
        Konfiguration entstehen zwei Dateien: <code>landing-zone.json</code> zum
        erneuten Bearbeiten und <code>landing-zone.tfvars</code> für
        OpenTofu/Terraform. Änderungen bitte im Configurator vornehmen; manuelle
        tfvars-Änderungen werden nicht importiert.
      </p>
      <div className="actions">
        <a
          className="button secondary"
          href="https://github.com/stackitcloud/stackit-landing-zone/fork"
          target="_blank"
          rel="noreferrer"
        >
          Fork bei GitHub erstellen ↗
        </a>
        <a
          className="button secondary"
          href={installation}
          target="_blank"
          rel="noreferrer"
        >
          App-Zugriff auf Fork einrichten ↗
        </a>
      </div>
      <p className="muted">
        Installiere die GitHub-App auf dem gewünschten Fork mit „Only select
        repositories“. Danach hier die Forks aktualisieren. Die Fork-Erstellung
        bestätigst du direkt bei GitHub.
      </p>
      {!session ? (
        <p>Bitte oben mit GitHub anmelden, um deine Forks zu verbinden.</p>
      ) : (
        <>
          <div className="actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => void findForks(true)}
            >
              Forks aktualisieren
            </button>
            {searched && nextPage && (
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => void findForks(false)}
              >
                Weitere Repositories prüfen
              </button>
            )}
          </div>
          {searched && !forks.length && (
            <p>
              Noch kein passender Fork gefunden. Prüfe die App-Installation
              {nextPage ? " oder lade weitere Repositories" : ""}.
            </p>
          )}
          <ul className="fork-list">
            {forks.map((fork) => (
              <li key={fork.id}>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void select(fork)}
                  aria-pressed={repository?.fork.id === fork.id}
                >
                  {fork.fullName}
                </button>
              </li>
            ))}
          </ul>
          {repository && (
            <>
              <h3>{repository.fork.fullName}</h3>
              <p>
                Speicherziel: <code>{repository.branch}</code>
                {!repository.branchExists &&
                  " · wird beim ersten Speichern angelegt"}
              </p>
              <h3>Gespeicherte Konfigurationen</h3>
              {repository.configurations.length ? (
                <ul className="fork-list">
                  {repository.configurations.map((config) => (
                    <li key={config.id}>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={busy}
                        onClick={() => void open(config.id)}
                      >
                        {config.name} öffnen
                      </button>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          void perform(async () => {
                            const loaded = await api<{
                              document: unknown;
                              head: string;
                            }>(
                              `/api/v1/github/configuration/${config.id}?${query(repository.fork)}`,
                            );
                            if (loaded.head !== repository.head)
                              throw new Error(errors.repository_changed);
                            const document = readSavedDraft(loaded.document);
                            onPrepare({
                              target: target(repository.fork),
                              configurationId: config.id,
                              head: loaded.head,
                              name: document.draft.name,
                              organizationId: document.draft.organization,
                            });
                          })
                        }
                      >
                        Deployment vorbereiten
                        <span className="sr-only">: {config.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Noch keine kompatiblen Konfigurationen vorhanden.</p>
              )}
              {(repository.unsupported > 0 || repository.truncated) && (
                <p>
                  Einige Dateien können nicht angezeigt werden. Aktuell werden
                  maximal 30 Konfigurationen dieser Template-Version
                  unterstützt.
                </p>
              )}
              <h3>Aktuellen Entwurf speichern</h3>
              <p>
                {draft
                  ? draft.name
                  : "Erstelle zuerst einen Entwurf oder öffne eine gespeicherte Konfiguration."}
              </p>
              {draft && validateDraft(draft).length > 0 && (
                <p>Bitte vervollständige zuerst die Angaben im Editor.</p>
              )}
              <p className="muted">
                {binding?.mode === "update"
                  ? "Speichert eine neue Revision der geöffneten Konfiguration."
                  : "Legt eine neue Konfiguration an."}{" "}
                Der Configurator startet dabei kein Deployment.
              </p>
              <div className="actions">
                {draft && (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={onEdit}
                  >
                    Entwurf bearbeiten
                  </button>
                )}
                <button
                  type="button"
                  className="button primary"
                  disabled={busy || !draft || validateDraft(draft).length > 0}
                  onClick={() => void save()}
                >
                  Im Fork speichern
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy || !draft}
                  onClick={() =>
                    void perform(async () => {
                      if (
                        !window.confirm(
                          "Den Branch-Stand aktualisieren und deinen Entwurf als neue Kopie vorbereiten? Bestehende Konfigurationen werden nicht überschrieben.",
                        )
                      )
                        return;
                      const current = await api<Repository>(
                        `/api/v1/github/repository?${query(repository.fork)}`,
                      );
                      setRepository(current);
                      setBinding(null);
                      setCommitUrl("");
                    })
                  }
                >
                  Neue Kopie vorbereiten
                </button>
              </div>
            </>
          )}
        </>
      )}
      {busy && <p role="status">GitHub-Anfrage läuft …</p>}
      {error && (
        <p role="alert" className="validation-box">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="success-banner">
          {notice}{" "}
          {commitUrl && (
            <a href={commitUrl} target="_blank" rel="noreferrer">
              Commit auf GitHub ansehen ↗
            </a>
          )}
        </p>
      )}
    </section>
  );
}
