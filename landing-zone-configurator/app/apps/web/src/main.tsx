import { type ConfigurationDraft, createDraft, objectValue } from "@lzc/domain";
import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ConfigurationEditor } from "./components/ConfigurationEditor";
import { Credentials } from "./components/Credentials";
import {
  type DeploymentSelection,
  Deployments,
} from "./components/Deployments";
import { ForkWorkspace } from "./components/ForkWorkspace";
import { Topology } from "./components/Topology";
import { useNavigation } from "./navigation";
import { describe, standaloneTemplate, templates } from "./templates";
import "./style.css";
import { Account, type Session } from "./components/Account";
import {
  clearLoginDraft,
  preserveLoginDraft,
  readLoginDraft,
} from "./login-draft";

function App() {
  const [restoredDraft] = useState(readLoginDraft);
  const {
    view,
    selected,
    step,
    navigate: setView,
  } = useNavigation(!!restoredDraft);
  const [session, setSession] = useState<Session | null>(null);
  const [deploymentSelection, setDeploymentSelection] =
    useState<DeploymentSelection | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: clear selection whenever the signed-in identity changes.
  useEffect(() => {
    setDeploymentSelection(null);
  }, [session?.user.id, session?.user.login]);
  const [draftEpoch, setDraftEpoch] = useState(0);
  const [draft, setDraft] = useState<ConfigurationDraft | null>(restoredDraft);
  const [loginError, setLoginError] = useState(() =>
    new URLSearchParams(window.location.search).get("login") === "failed"
      ? "Die GitHub-Anmeldung ist fehlgeschlagen. Bitte erneut versuchen."
      : "",
  );
  const leavingForLogin = useRef(false);
  useEffect(() => {
    clearLoginDraft();
  }, []);
  const [search, setSearch] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  // Focus the page title after client-side navigation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: view is the navigation trigger.
  useEffect(() => {
    heading.current?.focus();
  }, [view]);
  useEffect(() => {
    if (!draft) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (leavingForLogin.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft]);

  const values = selected.values;
  const matching = templates.filter((t) =>
    `${describe(t).title} ${describe(t).description}`
      .toLocaleLowerCase("de")
      .includes(search.toLocaleLowerCase("de")),
  );
  const start = () => {
    if (
      draft &&
      !window.confirm(
        "Den bisherigen Entwurf verwerfen und mit dieser Vorlage neu beginnen?",
      )
    )
      return;
    setDraft(createDraft(selected));
    setDraftEpoch((value) => value + 1);
    setView("editor");
  };

  return (
    <>
      <a className="skip-link" href="#content">
        Zum Inhalt
      </a>
      <header className="portal-header">
        <button
          type="button"
          className="wordmark"
          onClick={() => setView("templates")}
          aria-label="STACKIT – zur Template-Auswahl"
        >
          <img src="/brand/stackit.svg" alt="STACKIT" width="128" height="28" />
        </button>
        <span className="header-divider" />
        <span className="product-name">Landing Zone Configurator</span>
        <span className="header-badge">Entwicklung</span>
        <Account
          onSessionChange={setSession}
          beforeLogin={() => {
            if (!preserveLoginDraft(draft)) {
              setLoginError(
                "Dein Entwurf konnte nicht zwischengespeichert werden. Bitte lade ihn vor der Anmeldung herunter.",
              );
              return false;
            }
            leavingForLogin.current = true;
            return true;
          }}
        />
      </header>
      <div className="portal-layout">
        <aside className="sidebar" aria-label="Anwendungsnavigation">
          <div className="workspace">
            <small>ARBEITSBEREICH</small>
            <strong>Landing Zones</strong>
            <span>Konfiguration gestalten</span>
          </div>
          <nav aria-label="Hauptnavigation">
            <button
              type="button"
              className={
                view === "templates" || view === "preview"
                  ? "nav-item active"
                  : "nav-item"
              }
              aria-current={
                view === "templates" || view === "preview" ? "page" : undefined
              }
              onClick={() => setView("templates")}
            >
              <span aria-hidden="true">▦</span> Templates{" "}
              <span className="count">{templates.length}</span>
            </button>
            <button
              type="button"
              className={view === "editor" ? "nav-item active" : "nav-item"}
              aria-current={view === "editor" ? "page" : undefined}
              disabled={!draft}
              onClick={() => setView("editor")}
            >
              <span aria-hidden="true">□</span> Mein Entwurf{" "}
              {draft && <span className="draft-dot" />}
            </button>
            <button
              type="button"
              className={
                view === "repositories" ? "nav-item active" : "nav-item"
              }
              aria-current={view === "repositories" ? "page" : undefined}
              onClick={() => setView("repositories")}
            >
              GitHub-Forks
            </button>
            <button
              type="button"
              className={
                view === "credentials" ? "nav-item active" : "nav-item"
              }
              aria-current={view === "credentials" ? "page" : undefined}
              onClick={() => setView("credentials")}
            >
              Deployment-Zugänge
            </button>
            <button
              type="button"
              className={
                view === "deployments" ? "nav-item active" : "nav-item"
              }
              aria-current={view === "deployments" ? "page" : undefined}
              onClick={() => setView("deployments")}
            >
              Deployments
            </button>
          </nav>
          <div className="sidebar-note">
            <strong>Deine nächste Landing Zone</strong>
            <p>Mit einer Vorlage starten und Schritt für Schritt anpassen.</p>
          </div>
          <a
            className="source-link"
            href="https://github.com/stackitcloud/stackit-landing-zone"
            target="_blank"
            rel="noreferrer"
          >
            Accelerator auf GitHub ↗
          </a>
        </aside>
        <main id="content" className="content">
          {loginError && (
            <p role="alert" className="info-banner">
              {loginError}
            </p>
          )}
          <nav aria-label="Brotkrumennavigation" className="breadcrumbs">
            <button type="button" onClick={() => setView("templates")}>
              Landing Zones
            </button>
            <span aria-hidden="true">/</span>
            <span>
              {view === "templates"
                ? "Templates"
                : view === "preview"
                  ? describe(selected).title
                  : view === "deployments"
                    ? "Deployments"
                    : view === "credentials"
                      ? "Deployment-Zugänge"
                      : view === "repositories"
                        ? "GitHub-Forks"
                        : "Entwurf erstellen"}
            </span>
          </nav>
          <div className="page-heading">
            <div>
              <h1 ref={heading} tabIndex={-1}>
                {view === "templates"
                  ? "Landing Zone Templates"
                  : view === "preview"
                    ? describe(selected).title
                    : view === "deployments"
                      ? "Deployments"
                      : view === "credentials"
                        ? "Deployment-Zugänge"
                        : view === "repositories"
                          ? "GitHub-Forks"
                          : draft?.name || "Neue Konfiguration"}
              </h1>
              <p>
                {view === "templates"
                  ? "Wähle die passende Grundlage für deine Cloud-Umgebung."
                  : view === "preview"
                    ? describe(selected).description
                    : view === "deployments"
                      ? "Gespeicherte Konfiguration, Ziel und Zugang nachvollziehbar verbinden."
                      : view === "credentials"
                        ? "Persönliche STACKIT-Service-Accounts für spätere Deployments verwalten."
                        : view === "repositories"
                          ? "Konfigurationen in deinem Repository speichern und wieder öffnen."
                          : "Passe deine Landing Zone an. Die Strukturansicht aktualisiert sich mit deinen Angaben."}
              </p>
            </div>
            <span className="badge">
              {view === "editor" ? "Lokaler Entwurf" : "STACKIT Accelerator"}
            </span>
          </div>
          {view === "deployments" && (
            <Deployments
              key={session?.user.id ?? session?.user.login ?? "guest"}
              session={session}
              selection={deploymentSelection}
              onChoose={() => setView("repositories")}
              onCredentials={() => setView("credentials")}
            />
          )}
          {view === "credentials" && (
            <Credentials
              key={session?.user.id ?? session?.user.login ?? "guest"}
              session={session}
            />
          )}
          {view === "templates" && (
            <>
              <div className="info-banner">
                <span aria-hidden="true">ⓘ</span>
                <p>
                  Starte mit <strong>Standalone</strong> im Editor. Alle
                  weiteren Templates kannst du bereits als Strukturvorschau
                  erkunden.
                </p>
              </div>
              <div className="toolbar">
                <h2>
                  Verfügbare Templates{" "}
                  <span className="muted">({matching.length})</span>
                </h2>
                <div className="search">
                  <label className="sr-only" htmlFor="template-search">
                    Templates durchsuchen
                  </label>
                  <input
                    id="template-search"
                    type="search"
                    placeholder="Templates durchsuchen"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="template-grid">
                {matching.map((template) => {
                  const meta = describe(template);
                  const count = Object.keys(
                    objectValue(template.values.landing_zones),
                  ).length;
                  return (
                    <article className="template-card" key={template.id}>
                      <div className="card-top">
                        <span className="template-icon" aria-hidden="true">
                          {template.id === "standalone" ? "▦" : "◇"}
                        </span>
                        <span className="tag">{meta.category}</span>
                      </div>
                      <h3>{meta.title}</h3>
                      <p>{meta.description}</p>
                      <div className="card-meta">
                        <span>
                          {count}{" "}
                          {count === 1 ? "Landing Zone" : "Landing Zones"}
                        </span>
                        <span>
                          {template.id === "standalone"
                            ? "Editor verfügbar"
                            : "Vorschau"}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="button secondary card-button"
                        onClick={() => {
                          setView("preview", template.id);
                        }}
                      >
                        Template ansehen <span aria-hidden="true">→</span>
                        <span className="sr-only">: {meta.title}</span>
                      </button>
                    </article>
                  );
                })}
              </div>
              {!matching.length && (
                <div className="empty-state">
                  <h2>Kein passendes Template gefunden</h2>
                  <p>Versuche einen anderen Suchbegriff.</p>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setSearch("")}
                  >
                    Suche zurücksetzen
                  </button>
                </div>
              )}
            </>
          )}
          {view === "preview" && (
            <div className="editor-layout">
              <section className="panel">
                <h2>Über diese Vorlage</h2>
                <p>{describe(selected).description}</p>
                <dl className="summary-list">
                  <dt>Landing Zones</dt>
                  <dd>
                    {Object.keys(objectValue(values.landing_zones)).length}
                  </dd>
                  <dt>Sandboxes</dt>
                  <dd>
                    {Array.isArray(values.sandboxes)
                      ? values.sandboxes.length
                      : 0}
                  </dd>
                  <dt>Herkunft</dt>
                  <dd>
                    <code>{selected.source}</code>
                  </dd>
                </dl>
                {selected.id === "standalone" ? (
                  <>
                    <p>
                      Erstelle eine eigene Kopie und passe Organisation,
                      Projekte und Verantwortliche an.
                    </p>
                    <button
                      type="button"
                      className="button primary"
                      onClick={start}
                    >
                      Konfiguration erstellen
                    </button>
                  </>
                ) : (
                  <div className="info-banner">
                    <p>
                      Der Editor für dieses Template folgt. Netzwerkbereiche und
                      Zusatzmodule bleiben in der Vorlage erhalten.
                    </p>
                  </div>
                )}
                <details className="technical">
                  <summary>Quelldaten ansehen</summary>
                  <pre>{JSON.stringify(values, null, 2)}</pre>
                </details>
              </section>
              <Topology values={values} />
            </div>
          )}
          <div hidden={view !== "repositories"}>
            <ForkWorkspace
              key={session?.user.id ?? session?.user.login ?? "guest"}
              session={session}
              draft={draft}
              draftEpoch={draftEpoch}
              onEdit={() => setView("editor")}
              onPrepare={(selection) => {
                setDeploymentSelection(selection);
                setView("deployments");
              }}
              onLoad={(loaded) => {
                setDraft(loaded);
                setView("editor");
              }}
            />
          </div>
          {view === "editor" && !draft && (
            <section className="panel">
              <h2>Kein Entwurf in diesem Tab</h2>
              <p>
                Öffne eine gespeicherte Konfiguration aus deinem Fork oder
                beginne mit einem Template.
              </p>
              <button
                type="button"
                className="button primary"
                onClick={() => setView("repositories")}
              >
                Gespeicherte Konfiguration öffnen
              </button>
            </section>
          )}
          {view === "editor" && draft && (
            <ConfigurationEditor
              step={step}
              onStepChange={(next) => setView("editor", next)}
              onOpenStorage={() => setView("repositories")}
              template={standaloneTemplate}
              draft={draft}
              onChange={setDraft}
            />
          )}
          <footer className="page-footer">
            <span>Landing Zone Configurator</span>
            <span>
              Entwicklungsstand · Keine Cloud-Ressourcen werden erstellt
            </span>
          </footer>
        </main>
      </div>
    </>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing root element");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
