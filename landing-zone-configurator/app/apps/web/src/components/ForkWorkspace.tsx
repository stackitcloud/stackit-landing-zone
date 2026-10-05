import {
  type EditorDraft,
  editorIssues,
  initialPlanIssues,
  readConfigurationRecord,
  recordDraft,
  recordName,
  recordOrganization,
  saveEditorDraft,
} from "@lzc/domain";
import { useEffect, useRef, useState } from "react";
import { type FormattedMessage, formatMessage, t } from "../i18n";
import { preserveLoginDraft } from "../login-draft";
import {
  type Binding,
  type Fork,
  readWorkspace,
  workspaceKey,
  writeWorkspace,
} from "../workspace";
import type { Session } from "./Account";
import type { DeploymentSelection } from "./Deployments";
import { labelFor } from "./feature-labels";

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
  configuration_document_too_large:
    "Die Konfiguration ist für die Speicherung zu groß (maximal 1 MiB). Bitte aufteilen.",
  authentication_required: "Bitte melde dich an.",
  github_connection_required:
    "Bitte verbinde GitHub für diese Repository-Funktion.",
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
  backend_configuration_changed:
    "Die Backend-Datei stimmt nicht mit dem verifizierten State-Backend überein. Bitte den GitHub-Stand und die Backend-Bindung prüfen. Es wurde nichts überschrieben.",
  backend_configuration_missing:
    "Für die vorhandene Backend-Datei fehlt die verifizierte Bindung. Bitte das bisherige State-Backend wieder zuordnen und gegebenenfalls den Recovery-Export sichern.",
  backend_request_failed:
    "Das State-Backend konnte nicht geprüft werden. Bitte später erneut speichern. Dein Entwurf bleibt erhalten.",
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
  sourceConfigurationId,
  onLoad,
  onEdit,
  onPrepare,
  onRestore,
  path,
}: {
  path: string;
  onRestore: (draft: EditorDraft | null, path: string | null) => void;
  session: Session | null;
  draft: EditorDraft | null;
  draftEpoch: number;
  sourceConfigurationId?: string | null;
  onLoad: (draft: EditorDraft) => void;
  onEdit: () => void;
  onPrepare: (selection: DeploymentSelection) => void;
}) {
  const [forks, setForks] = useState<Fork[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(1);
  const [searched, setSearched] = useState(false);
  const [repository, setRepository] = useState<Repository | null>(null);
  const [binding, setBinding] = useState<Binding | null>(null);
  const [busy, setBusy] = useState(false);
  const [githubRequired, setGithubRequired] = useState(false);
  const [githubAvailable, setGithubAvailable] = useState(true);
  const [error, setError] = useState<string | FormattedMessage>("");
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
  const key = workspaceKey(session);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const latest = useRef({ draft, draftEpoch, onRestore });
  latest.current = { draft, draftEpoch, onRestore };
  // This component is keyed by account and tenant. Revalidate access before restoring.
  // biome-ignore lint/correctness/useExhaustiveDependencies: initialize once for this account; latest guards edits made during loading.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const controller = new AbortController();
    const initialDraft = latest.current.draft;
    const initialEpoch = latest.current.draftEpoch;
    const initialPath = window.location.pathname;
    const saved = readWorkspace(key);
    busyRef.current = true;
    setBusy(true);
    void (async () => {
      try {
        const providers = await api<{ primary?: string; github?: boolean }>(
          "/auth/status",
          { signal: controller.signal },
        );
        if (cancelled) return;
        setGithubAvailable(providers.github !== false);
        if (providers.primary === "stackit") {
          const connection = await api<{ connected: boolean }>(
            "/auth/github/status",
            { signal: controller.signal },
          );
          if (cancelled) return;
          if (!connection.connected) {
            setGithubRequired(true);
            return;
          }
        }
        const listing = await api<{ forks: Fork[]; nextPage: number | null }>(
          "/api/v1/github/forks?page=1",
          { signal: controller.signal },
        );
        if (cancelled) return;
        setForks(listing.forks);
        setNextPage(listing.nextPage);
        setSearched(true);
        if (saved?.fork) {
          const repo = await api<Repository>(
            `/api/v1/github/repository?${query(saved.fork)}`,
            { signal: controller.signal },
          );
          if (cancelled) return;
          setRepository(repo);
          setForks((items) => [
            ...new Map([...items, repo.fork].map((f) => [f.id, f])).values(),
          ]);
        }
        if (
          saved &&
          !initialDraft &&
          latest.current.draft === initialDraft &&
          latest.current.draftEpoch === initialEpoch
        ) {
          // Keep the original base revision: a newer remote commit must still cause a conflict on save.
          setBinding(saved.binding);
          latest.current.onRestore(
            saved.draft,
            initialPath === "/" && window.location.pathname === initialPath
              ? saved.path
              : null,
          );
          setNotice(
            "Dein letzter Arbeitsstand wurde in diesem Browser wiederhergestellt. Änderungen bitte weiterhin im Fork speichern.",
          );
        }
        if (!cancelled) setReady(true);
      } catch (failure) {
        if (!cancelled)
          setError(
            failure instanceof Error
              ? failure.message
              : "Der letzte Arbeitsbereich konnte nicht geladen werden.",
          );
      } finally {
        if (!cancelled) {
          busyRef.current = false;
          setBusy(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);
  useEffect(() => {
    if (!ready || !session) return;
    setStorageError(
      !writeWorkspace(key, {
        fork: repository?.fork ?? null,
        binding,
        draft,
        path,
      }),
    );
  }, [ready, session, key, repository, binding, draft, path]);
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
        t(
          "In einen anderen Fork wechseln? Der aktuelle Entwurf wird dort nur als neue Kopie gespeichert.",
        ),
      )
    )
      return;
    await perform(async () => {
      const result = await api<Repository>(
        `/api/v1/github/repository?${query(fork)}`,
      );
      setRepository(result);
      setReady(true);
      setBinding(null);
      setCommitUrl("");
    });
  }
  async function open(id: string) {
    if (!repository) return;
    if (
      draft &&
      !window.confirm(
        t(
          "Den aktuellen lokalen Entwurf durch die gespeicherte Konfiguration ersetzen?",
        ),
      )
    )
      return;
    await perform(async () => {
      const result = await api<{ document: unknown; head: string }>(
        `/api/v1/github/configuration/${id}?${query(repository.fork)}`,
      );
      const document = readConfigurationRecord(result.document);
      setBinding({ id, head: result.head, mode: "update" });
      setRepository({ ...repository, head: result.head });
      setCommitUrl("");
      onLoad(recordDraft(document));
    });
  }
  async function save() {
    if (!repository || !session || !draft || editorIssues(draft).length) return;
    await perform(async () => {
      const current = binding ?? {
        id: sourceConfigurationId ?? crypto.randomUUID(),
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
            document: saveEditorDraft(current.id, draft),
            ...(sourceConfigurationId ? { sourceConfigurationId } : {}),
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
  if (githubRequired)
    return (
      <section className="panel">
        <h2>{t("GitHub-Forks")}</h2>
        {githubAvailable ? (
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                if (!preserveLoginDraft(draft))
                  throw new Error(
                    "Der Entwurf konnte nicht für die Weiterleitung gesichert werden.",
                  );
                const result = await api<{ authorizationUrl: string }>(
                  "/auth/github/connect",
                  {
                    method: "POST",
                    headers: { "x-lzc-csrf": session?.csrfToken ?? "" },
                  },
                );
                const url = new URL(result.authorizationUrl);
                if (
                  url.origin !== "https://github.com" ||
                  url.pathname !== "/login/oauth/authorize"
                )
                  throw new Error("Ungültige GitHub-Weiterleitung.");
                window.location.assign(url.href);
              })
            }
          >
            {t("GitHub verbinden")}
          </button>
        ) : (
          <p>{t("GitHub ist derzeit nicht verfügbar.")}</p>
        )}
        {error && <p role="alert">{t(error)}</p>}
      </section>
    );
  return (
    <section className="panel fork-workspace" aria-label={t("GitHub-Forks")}>
      <h2>{t("Deine Forks")}</h2>
      <p>
        {t(
          "Verbinde einen beschreibbaren Accelerator-Fork. Der Configurator speichert deine Entwürfe im Branch",
        )}
        <code>lzc/configurations</code>. Pro Konfiguration entstehen zwei
        Dateien: <code>landing-zone.json</code>{" "}
        {t("zum erneuten Bearbeiten und")}
        <code>landing-zone.tfvars</code>{" "}
        {t(
          "für OpenTofu/Terraform. Änderungen bitte im Configurator vornehmen; manuelle tfvars-Änderungen werden nicht importiert.",
        )}
      </p>
      <div className="actions">
        <a
          className="button secondary"
          href="https://github.com/stackitcloud/stackit-landing-zone/fork"
          target="_blank"
          rel="noreferrer"
        >
          {t("Fork bei GitHub erstellen ↗")}
        </a>
        <a
          className="button secondary"
          href={installation}
          target="_blank"
          rel="noreferrer"
        >
          {t("App-Zugriff auf Fork einrichten ↗")}
        </a>
      </div>
      <p className="muted">
        {t(
          "Installiere die GitHub-App auf dem gewünschten Fork mit „Only select repositories“. Danach hier die Forks aktualisieren. Die Fork-Erstellung bestätigst du direkt bei GitHub.",
        )}
      </p>
      {!session ? (
        <p>{t("Bitte oben anmelden, um deine Forks zu verbinden.")}</p>
      ) : (
        <>
          <div className="actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => void findForks(true)}
            >
              {t("Forks aktualisieren")}
            </button>
            {searched && nextPage && (
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => void findForks(false)}
              >
                {t("Weitere Repositories prüfen")}
              </button>
            )}
          </div>
          {searched && !forks.length && (
            <p>
              {t(
                "Noch kein passender Fork gefunden. Prüfe die App-Installation",
              )}{" "}
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
                {t("Speicherziel:")}
                <code>{repository.branch}</code>
                {!repository.branchExists &&
                  " · wird beim ersten Speichern angelegt"}
              </p>
              <h3>{t("Gespeicherte Konfigurationen")}</h3>
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
                        {config.name} {t("öffnen")}
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
                            const document = readConfigurationRecord(
                              loaded.document,
                            );
                            const blockers = initialPlanIssues(document);
                            if (blockers.length) {
                              setError(
                                formatMessage(
                                  "Erstbereitstellungsplan noch nicht verfügbar: {{value0}}",
                                  {
                                    get value0() {
                                      return [
                                        ...new Set(
                                          blockers.map(
                                            (issue) =>
                                              `${labelFor(issue.field.split(".")[0] ?? issue.field)}: ${t(issue.message)}`,
                                          ),
                                        ),
                                      ].join(" ");
                                    },
                                  },
                                ),
                              );
                              return;
                            }
                            onPrepare({
                              target: target(repository.fork),
                              configurationId: config.id,
                              head: loaded.head,
                              name: recordName(document),
                              organizationId: recordOrganization(document),
                            });
                          })
                        }
                      >
                        {t("Deployment vorbereiten")}
                        <span className="sr-only">: {config.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{t("Noch keine kompatiblen Konfigurationen vorhanden.")}</p>
              )}
              {(repository.unsupported > 0 || repository.truncated) && (
                <p>
                  {t(
                    "Einige Dateien können nicht angezeigt werden. Aktuell werden maximal 30 Konfigurationen dieser Template-Version unterstützt.",
                  )}
                </p>
              )}
              <h3>{t("Aktuellen Entwurf speichern")}</h3>
              <p>
                {draft
                  ? draft.name
                  : t(
                      "Erstelle zuerst einen Entwurf oder öffne eine gespeicherte Konfiguration.",
                    )}
              </p>
              {draft && editorIssues(draft).length > 0 && (
                <p>
                  {t("Bitte vervollständige zuerst die Angaben im Editor.")}
                </p>
              )}
              <p className="muted">
                {binding?.mode === "update"
                  ? t(
                      "Speichert eine neue Revision der geöffneten Konfiguration.",
                    )
                  : t("Legt eine neue Konfiguration an.")}{" "}
                {t("Der Configurator startet dabei kein Deployment.")}
              </p>
              <div className="actions">
                {draft && (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={onEdit}
                  >
                    {t("Entwurf bearbeiten")}
                  </button>
                )}
                <button
                  type="button"
                  className="button primary"
                  disabled={busy || !draft || editorIssues(draft).length > 0}
                  onClick={() => void save()}
                >
                  {t("Im Fork speichern")}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy || !draft}
                  onClick={() =>
                    void perform(async () => {
                      if (
                        !window.confirm(
                          t(
                            "Den Branch-Stand aktualisieren und deinen Entwurf als neue Kopie vorbereiten? Bestehende Konfigurationen werden nicht überschrieben.",
                          ),
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
                  {t("Neue Kopie vorbereiten")}
                </button>
              </div>
            </>
          )}
        </>
      )}
      {storageError && (
        <p role="alert">
          {t(
            "Der Browser kann deinen Arbeitsstand nicht sichern. Bitte speichere Änderungen im Fork oder lade sie herunter.",
          )}
        </p>
      )}
      {session && (
        <p className="muted">
          {t(
            "Arbeitsstand automatisch in diesem Browser merken · getrennt nach angemeldetem Konto. Dies ersetzt das Speichern im Fork nicht.",
          )}
        </p>
      )}
      {busy && <p role="status">{t("GitHub-Anfrage läuft …")}</p>}
      {error && (
        <p role="alert" className="validation-box">
          {t(error)}
        </p>
      )}
      {notice && (
        <p role="status" className="success-banner">
          {t(notice)}{" "}
          {commitUrl && (
            <a href={commitUrl} target="_blank" rel="noreferrer">
              {t("Commit auf GitHub ansehen ↗")}
            </a>
          )}
        </p>
      )}
    </section>
  );
}
