import {
  compileCommonConfiguration,
  createEditorConfiguration,
  createPlatformDraftCopy,
  type EditorDraft,
  isCommonDraft,
  objectValue,
  readEditorDraft,
  upgradeEditorDraft,
} from "@lzc/domain";
import {
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import { Applications } from "./components/Applications";
import {
  CloudCataloguePanel,
  CloudCatalogueProvider,
} from "./components/CloudCatalogues";
import { CommonEditor } from "./components/CommonEditor";
import { ConfigurationEditor } from "./components/ConfigurationEditor";
import {
  type ConfigurationBinding,
  Configurations,
  configurationDeploymentSelection,
} from "./components/Configurations";
import { Credentials } from "./components/Credentials";
import {
  type DeploymentSelection,
  Deployments,
} from "./components/Deployments";
import { ForkWorkspace } from "./components/ForkWorkspace";
import { InvitationAcceptance } from "./components/Invitations";
import { Organisation } from "./components/Organisation";
import { Topology } from "./components/Topology";
import { currentLanguage, setLanguage, t } from "./i18n";
import { type DeploymentStep, useNavigation } from "./navigation";
import { describe, standaloneTemplate, templates } from "./templates";
import { workspaceKey } from "./workspace";
import "./style.css";
import { Account, type Session } from "./components/Account";
import {
  clearLoginDraft,
  preserveLoginDraft,
  readLoginDraft,
} from "./login-draft";

function App() {
  useTranslation();
  const [restoredDraft] = useState(readLoginDraft);
  const {
    view,
    selected,
    step,
    deploymentStep,
    navigate: setView,
  } = useNavigation(!!restoredDraft);
  const [session, setSession] = useState<Session | null>(null);
  const [returningFromLogin, setReturningFromLogin] = useState(false);
  const [credentialRevision, setCredentialRevision] = useState(0);
  const organisationWorkspace = session?.tenant?.kind === "organisation";
  const platformAccess =
    !organisationWorkspace ||
    !!session?.tenant?.roles?.includes("platform-engineer");
  useEffect(() => {
    if (
      session &&
      !platformAccess &&
      view !== "workspaces" &&
      view !== "organisation" &&
      view !== "applications"
    )
      setView("applications");
  }, [session, platformAccess, view, setView]);
  const [deploymentSelection, setDeploymentSelection] =
    useState<DeploymentSelection | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: clear selection whenever the signed-in identity changes.
  useEffect(() => {
    setDeploymentSelection(null);
  }, [session?.user.id, session?.user.login, session?.tenant?.id]);
  const [draftEpoch, setDraftEpoch] = useState(0);
  const [configurationBinding, setConfigurationBinding] =
    useState<ConfigurationBinding | null>(null);
  const [draft, setDraft] = useState<EditorDraft | null>(restoredDraft);
  const [savedDraft, setSavedDraft] = useState<string | null>(null);
  const draftDirty = Boolean(draft && JSON.stringify(draft) !== savedDraft);
  const finishLogin = useCallback(() => {
    if (draft) return;
    setReturningFromLogin(true);
    setView("workspaces");
  }, [draft, setView]);
  const [loginError, setLoginError] = useState(() =>
    new URLSearchParams(window.location.search).get("login") === "failed"
      ? "Die GitHub-Anmeldung ist fehlgeschlagen. Bitte erneut versuchen."
      : "",
  );
  const activeAccount = useRef<string | null>(null);
  const currentWorkspace = useRef(workspaceKey(session));
  currentWorkspace.current = workspaceKey(session);
  const changeSession = useCallback((next: Session | null) => {
    const key = workspaceKey(next);
    if (activeAccount.current && activeAccount.current !== key) {
      setDraft(null);
      setConfigurationBinding(null);
      setSavedDraft(null);
    }
    activeAccount.current = key;
    setSession(next);
  }, []);
  useEffect(() => {
    const scope = workspaceKey(session);
    if (!scope) return;
    try {
      if (configurationBinding)
        sessionStorage.setItem(
          `lzc-configuration:${scope}`,
          configurationBinding.id,
        );
      else if (draft) sessionStorage.removeItem(`lzc-configuration:${scope}`);
    } catch {}
  }, [session, configurationBinding, draft]);
  useEffect(() => {
    const scope = workspaceKey(session);
    if (
      !scope ||
      !platformAccess ||
      draft ||
      configurationBinding ||
      !["editor", "deployments", "history"].includes(view)
    )
      return;
    let id: string | null;
    try {
      id = sessionStorage.getItem(`lzc-configuration:${scope}`);
    } catch {
      return;
    }
    if (!id || !/^[a-fA-F0-9-]{36}$/.test(id)) return;
    const controller = new AbortController();
    void fetch(`/api/v1/configurations/${id}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "Die zuletzt geöffnete Konfiguration ist nicht verfügbar. Wähle eine Konfiguration im Arbeitsbereich.",
          );
        const { configuration } = await response.json();
        const loaded = readEditorDraft(configuration.draft);
        if (controller.signal.aborted || currentWorkspace.current !== scope)
          return;
        setDraft(loaded);
        setSavedDraft(JSON.stringify(loaded));
        setConfigurationBinding({
          id: configuration.id,
          revision: configuration.revision,
        });
        if (view !== "editor")
          setDeploymentSelection(
            configurationDeploymentSelection(configuration),
          );
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setLoginError(
            cause instanceof Error
              ? cause.message
              : "Konfiguration konnte nicht geladen werden.",
          );
      });
    return () => controller.abort();
  }, [session, platformAccess, view, draft, configurationBinding]);
  const leavingForLogin = useRef(false);
  const beforeWorkspaceNavigation = useCallback(() => {
    leavingForLogin.current = true;
  }, []);
  useEffect(() => {
    clearLoginDraft();
  }, []);
  const [search, setSearch] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  // Focus the page title after client-side navigation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: view is the navigation trigger.
  useEffect(() => {
    heading.current?.focus();
  }, [view, deploymentStep]);
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
  const preview = useMemo(
    () =>
      createEditorConfiguration(
        selected.id,
        "11111111-2222-4333-8444-555555555555",
      ),
    [selected.id],
  );
  const matching = templates.filter((t) =>
    `${describe(t).title} ${describe(t).description}`
      .toLocaleLowerCase("de")
      .includes(search.toLocaleLowerCase("de")),
  );
  const start = () => {
    if (
      draft &&
      !window.confirm(
        t(
          "Den bisherigen Entwurf verwerfen und mit dieser Vorlage neu beginnen?",
        ),
      )
    )
      return;
    setDraft(createEditorConfiguration(selected.id, crypto.randomUUID()));
    setConfigurationBinding(null);
    setSavedDraft(null);
    setDraftEpoch((value) => value + 1);
    setView("editor");
  };

  const openDeployment = (
    selection: DeploymentSelection | null,
    navigate = true,
  ) => {
    if (!selection) {
      setDeploymentSelection(null);
      return;
    }
    if (
      selection.configurationId !== configurationBinding?.id &&
      draftDirty &&
      !window.confirm(
        t(
          "Konfiguration wechseln? Nicht gespeicherte Änderungen am Entwurf gehen verloren.",
        ),
      )
    )
      return;
    setDeploymentSelection(selection);
    if (selection.configurationId !== configurationBinding?.id) {
      setConfigurationBinding(null);
      setSavedDraft(null);
      setDraft(null);
      const scope = workspaceKey(session);
      if (scope)
        try {
          if ("source" in selection)
            sessionStorage.setItem(
              `lzc-configuration:${scope}`,
              selection.configurationId,
            );
          else sessionStorage.removeItem(`lzc-configuration:${scope}`);
        } catch {}
    }
    if (navigate) setView("deployments");
  };
  const openDeploymentStep = (next: DeploymentStep) => {
    if (configurationBinding && savedDraft) {
      try {
        setDeploymentSelection(
          configurationDeploymentSelection({
            ...configurationBinding,
            name: draft?.name ?? "Konfiguration",
            draft: readEditorDraft(JSON.parse(savedDraft)),
          }),
        );
      } catch {
        setDeploymentSelection(null);
      }
    } else if (draft) setDeploymentSelection(null);
    if (next === "history") setView("history");
    else setView("deployments", next);
  };

  const copyPlatform = () => {
    if (
      !draft ||
      !window.confirm(
        t(
          "Eine neue Plattformkonfiguration mit Application Landing Zone Templates anlegen? Der gespeicherte Altbestand bleibt unverändert. Dies migriert keine Cloud-Ressourcen und keinen State.",
        ),
      )
    )
      return;
    try {
      setDraft(
        createPlatformDraftCopy(
          isCommonDraft(draft) ? draft : upgradeEditorDraft(draft),
          crypto.randomUUID(),
        ),
      );
      setDraftEpoch((value) => value + 1);
      setConfigurationBinding(null);
      setView("editor", "projects");
      setLoginError("");
    } catch {
      setLoginError(
        "Diese Gesamtkonfiguration kann noch nicht verlustfrei als Plattformkopie übernommen werden. Der bisherige Entwurf bleibt erhalten; prüfe insbesondere die Zuordnung der Namespace-Dienste.",
      );
    }
  };

  return (
    <>
      <a className="skip-link" href="#content">
        {t("Zum Inhalt")}
      </a>
      <header className="portal-header">
        <button
          type="button"
          className="wordmark"
          onClick={() =>
            setView(session && platformAccess ? "repositories" : "workspaces")
          }
          aria-label={t("STACKIT – zum Arbeitsbereich")}
        >
          <img
            src="/brand/stackit.svg"
            alt={t("STACKIT")}
            width="128"
            height="28"
          />
        </button>
        <span className="header-divider" />
        <span className="product-name">{t("Landing Zone Configurator")}</span>
        <span className="header-badge">{t("Entwicklung")}</span>
        <select
          className="language-switch"
          aria-label={t("Sprache")}
          value={currentLanguage()}
          onChange={(event) =>
            void setLanguage(event.target.value === "de" ? "de" : "en")
          }
        >
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </select>
        {session && (
          <button
            type="button"
            className="workspace-switch"
            aria-label={t("Arbeitsbereich wechseln")}
            title={session.tenant?.name ?? t("Arbeitsbereiche")}
            onClick={() => setView("workspaces")}
          >
            {session.tenant?.name ?? t("Arbeitsbereiche")}{" "}
            <span aria-hidden="true">▾</span>
          </button>
        )}
        <Account
          onSessionChange={changeSession}
          onLogin={finishLogin}
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
      <div
        className={`portal-layout${view === "deployments" || view === "history" ? " deployment-workflow" : ""}`}
      >
        <aside className="sidebar" aria-label={t("Anwendungsnavigation")}>
          <div className="workspace">
            <small>{t("ARBEITSBEREICH")}</small>
            <strong>{session?.tenant?.name ?? t("Landing Zones")}</strong>
          </div>
          <nav aria-label={t("Hauptnavigation")}>
            <button
              type="button"
              className={view === "workspaces" ? "nav-item active" : "nav-item"}
              aria-current={view === "workspaces" ? "page" : undefined}
              onClick={() => setView("workspaces")}
            >
              {t("Arbeitsbereiche")}
            </button>
            {platformAccess && (
              <>
                <button
                  type="button"
                  className={
                    view === "repositories" ? "nav-item active" : "nav-item"
                  }
                  aria-current={view === "repositories" ? "page" : undefined}
                  onClick={() => setView("repositories")}
                >
                  {t("Konfigurationen")}
                </button>
                {platformAccess && (
                  <button
                    type="button"
                    className={
                      view === "deployments" || view === "history"
                        ? "nav-item active"
                        : "nav-item"
                    }
                    aria-current={
                      view === "deployments" || view === "history"
                        ? "page"
                        : undefined
                    }
                    onClick={() => setView("deployments")}
                  >
                    {t("Deployments")}
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              className={
                view === "applications" ? "nav-item active" : "nav-item"
              }
              aria-current={view === "applications" ? "page" : undefined}
              onClick={() => setView("applications")}
            >
              {t("Application Landing Zones")}
            </button>
            <div className="nav-section">{t("Verwaltung")}</div>
            {platformAccess && (
              <button
                type="button"
                className={
                  view === "credentials" ? "nav-item active" : "nav-item"
                }
                aria-current={view === "credentials" ? "page" : undefined}
                onClick={() => setView("credentials")}
              >
                {t("Zugänge")}
              </button>
            )}
            <button
              type="button"
              className={
                view === "organisation" ? "nav-item active" : "nav-item"
              }
              aria-current={view === "organisation" ? "page" : undefined}
              onClick={() => setView("organisation")}
            >
              {t("Benutzerverwaltung")}
            </button>
          </nav>
          <a
            className="source-link"
            href="https://github.com/stackitcloud/stackit-landing-zone"
            target="_blank"
            rel="noreferrer"
          >
            {t("Accelerator auf GitHub ↗")}
          </a>
        </aside>
        <main id="content" className="content">
          <InvitationAcceptance session={session} />
          {loginError && (
            <p role="alert" className="info-banner">
              {t(loginError)}
            </p>
          )}
          <nav aria-label={t("Brotkrumennavigation")} className="breadcrumbs">
            <button type="button" onClick={() => setView("workspaces")}>
              {t("Arbeitsbereiche")}
            </button>
            <span aria-hidden="true">/</span>
            <span>
              {view === "workspaces"
                ? t("Auswahl")
                : view === "applications"
                  ? t("Application Landing Zones")
                  : view === "organisation"
                    ? t("Benutzerverwaltung")
                    : view === "templates"
                      ? t("Templates")
                      : view === "preview"
                        ? t(describe(selected).title)
                        : view === "history"
                          ? t("Verlauf")
                          : view === "deployments"
                            ? deploymentStep === "plan"
                              ? t("Plan")
                              : deploymentStep === "apply"
                                ? t("Apply")
                                : t("Vorbereitung")
                            : view === "credentials"
                              ? t("Deployment-Zugänge")
                              : view === "repositories"
                                ? t("Konfigurationen")
                                : (draft?.name ?? t("Neue Konfiguration"))}
            </span>
          </nav>
          <div className="page-heading">
            <div>
              <h1 ref={heading} tabIndex={-1}>
                {view === "workspaces"
                  ? t("Arbeitsbereiche")
                  : view === "applications"
                    ? t("Application Landing Zones")
                    : view === "organisation"
                      ? t("Benutzerverwaltung")
                      : view === "templates"
                        ? t("Neue Konfiguration")
                        : view === "preview"
                          ? t(describe(selected).title)
                          : view === "history"
                            ? t("Verlauf")
                            : view === "deployments"
                              ? deploymentStep === "plan"
                                ? t("Plan")
                                : deploymentStep === "apply"
                                  ? t("Apply")
                                  : t("Vorbereitung")
                              : view === "credentials"
                                ? t("Deployment-Zugänge")
                                : view === "repositories"
                                  ? t("Konfigurationen")
                                  : draft?.name || t("Neue Konfiguration")}
              </h1>
              <p hidden={view === "deployments" || view === "history"}>
                {view === "workspaces"
                  ? (session?.user.login ?? "")
                  : view === "applications"
                    ? (session?.tenant?.name ?? "")
                    : view === "organisation"
                      ? t(
                          "Arbeitsbereiche, Organisationszuordnung und persönliche Rollen verwalten.",
                        )
                      : view === "templates"
                        ? t(
                            "Wähle die passende Grundlage für deine Cloud-Umgebung.",
                          )
                        : view === "preview"
                          ? describe(selected).description
                          : view === "history"
                            ? (draft?.name ?? deploymentSelection?.name ?? "")
                            : view === "deployments"
                              ? t(
                                  "Gespeicherte Konfiguration, Ziel und Zugang nachvollziehbar verbinden.",
                                )
                              : view === "credentials"
                                ? t(
                                    "Persönliche STACKIT-Service-Accounts für spätere Deployments verwalten.",
                                  )
                                : view === "repositories"
                                  ? t(
                                      "Konfigurationen in deinem Arbeitsbereich speichern und wieder öffnen.",
                                    )
                                  : t(
                                      "Passe deine Landing Zone an. Die Strukturansicht aktualisiert sich mit deinen Angaben.",
                                    )}
              </p>
            </div>
            <span
              className="badge"
              hidden={view === "deployments" || view === "history"}
            >
              {view === "editor"
                ? t("Lokaler Entwurf")
                : t("STACKIT Accelerator")}
            </span>
          </div>
          {platformAccess &&
            ((view === "editor" && draft) ||
              view === "deployments" ||
              view === "history") && (
              <nav
                className="configuration-tabs"
                aria-label={t("Konfiguration")}
              >
                <span className="configuration-context">
                  {draft?.name ??
                    deploymentSelection?.name ??
                    t("Konfiguration auswählen")}
                  {(draft || deploymentSelection) && " · "}
                  {configurationBinding
                    ? t("Revision {{value0}}{{value1}}", {
                        value0: configurationBinding.revision,
                        value1: draftDirty ? " · Nicht gespeichert" : "",
                      })
                    : deploymentSelection && "revision" in deploymentSelection
                      ? t("Revision {{value0}}", {
                          value0: deploymentSelection.revision,
                        })
                      : draft
                        ? t("Nicht gespeichert")
                        : ""}
                </span>
                <button
                  type="button"
                  aria-current={view === "editor" ? "page" : undefined}
                  onClick={() => setView(draft ? "editor" : "repositories")}
                >
                  {t("Konfiguration")}
                </button>
                {(
                  [
                    ["preparation", "Vorbereitung"],
                    ["plan", "Plan"],
                    ["apply", "Apply"],
                    ["history", "Verlauf"],
                  ] as const
                ).map(([next, label]) => (
                  <button
                    key={next}
                    type="button"
                    aria-current={
                      (
                        next === "history"
                          ? view === "history"
                          : view === "deployments" && deploymentStep === next
                      )
                        ? "page"
                        : undefined
                    }
                    onClick={() => openDeploymentStep(next)}
                  >
                    {t(label)}
                  </button>
                ))}
              </nav>
            )}
          {(view === "organisation" || view === "workspaces") && (
            <Organisation
              key={`${view}:${workspaceKey(session) ?? "guest"}`}
              session={session}
              selectionOnly={view === "workspaces"}
              restoreLastWorkspace={
                (returningFromLogin || window.location.pathname === "/") &&
                !draft
              }
              onNavigate={beforeWorkspaceNavigation}
              beforeSwitch={() => {
                if (
                  draftDirty &&
                  !window.confirm(
                    t(
                      "Arbeitsbereich wechseln? Nicht gespeicherte Änderungen am Entwurf gehen verloren.",
                    ),
                  )
                )
                  return false;
                return true;
              }}
            />
          )}
          {view === "applications" && (
            <Applications
              key={`applications:${workspaceKey(session) ?? "guest"}`}
              session={session}
              draft={draft && isCommonDraft(draft) ? draft : null}
            />
          )}
          {platformAccess && (
            <CloudCatalogueProvider
              key={`catalogues:${workspaceKey(session) ?? "guest"}`}
            >
              <div hidden={view !== "editor"}>
                <CloudCataloguePanel
                  session={session}
                  key={credentialRevision}
                />
              </div>
              {platformAccess &&
                (view === "deployments" || view === "history") && (
                  <Deployments
                    key={`${workspaceKey(session) ?? "guest"}:${view}`}
                    session={session}
                    selection={deploymentSelection}
                    historyOnly={view === "history"}
                    step={deploymentStep}
                    onStep={openDeploymentStep}
                    configurationId={
                      deploymentSelection?.configurationId ??
                      configurationBinding?.id ??
                      (draft ? "unsaved" : undefined)
                    }
                    onSelect={(selection) => openDeployment(selection, false)}
                    onChoose={() => setView("repositories")}
                    onCredentials={() => setView("credentials")}
                  />
                )}
              {view === "credentials" && (
                <Credentials
                  key={workspaceKey(session) ?? session?.user.login ?? "guest"}
                  session={session}
                  onChanged={() =>
                    setCredentialRevision((revision) => revision + 1)
                  }
                />
              )}
              {view === "templates" && (
                <>
                  <div className="info-banner">
                    <span aria-hidden="true">ⓘ</span>
                    <p>
                      {t(
                        "Als Platform Engineer konfigurierst du zentrale Dienste und Application Landing Zone Templates. Konkrete Anwendungsprojekte entstehen später durch Bestellungen eines Application Owners.",
                      )}
                    </p>
                  </div>
                  <div className="toolbar">
                    <h2>
                      {t("Verfügbare Templates")}{" "}
                      <span className="muted">({matching.length})</span>
                    </h2>
                    <div className="search">
                      <label className="sr-only" htmlFor="template-search">
                        {t("Templates durchsuchen")}
                      </label>
                      <input
                        id="template-search"
                        type="search"
                        placeholder={t("Templates durchsuchen")}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="template-grid">
                    {matching.map((template) => {
                      const meta = describe(template);
                      const count =
                        Object.keys(objectValue(template.values.landing_zones))
                          .length +
                        (Array.isArray(template.values.sandboxes)
                          ? template.values.sandboxes.length
                          : 0);
                      return (
                        <article className="template-card" key={template.id}>
                          <div className="card-top">
                            <span className="template-icon" aria-hidden="true">
                              {template.id === "standalone" ? "▦" : "◇"}
                            </span>
                            <span className="tag">{t(meta.category)}</span>
                          </div>
                          <h3>{t(meta.title)}</h3>
                          <p>{meta.description}</p>
                          <div className="card-meta">
                            <span>
                              {count}{" "}
                              {count === 1
                                ? t("Application Landing Zone Template")
                                : t("Application Landing Zone Templates")}
                            </span>
                            <span>{t("Editor verfügbar")}</span>
                          </div>
                          <button
                            type="button"
                            className="button secondary card-button"
                            onClick={() => {
                              setView("preview", template.id);
                            }}
                          >
                            {t("Template ansehen")}
                            <span aria-hidden="true">→</span>
                            <span className="sr-only">: {t(meta.title)}</span>
                          </button>
                        </article>
                      );
                    })}
                  </div>
                  {!matching.length && (
                    <div className="empty-state">
                      <h2>{t("Kein passendes Template gefunden")}</h2>
                      <p>{t("Versuche einen anderen Suchbegriff.")}</p>
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => setSearch("")}
                      >
                        {t("Suche zurücksetzen")}
                      </button>
                    </div>
                  )}
                </>
              )}
              {view === "preview" && (
                <div className="editor-layout">
                  <section className="panel">
                    <h2>{t("Über diese Vorlage")}</h2>
                    <p>{describe(selected).description}</p>
                    <dl className="summary-list">
                      <dt>{t("Application Landing Zone Template-Entwürfe")}</dt>
                      <dd>{preview.projectTemplates?.length ?? 0}</dd>

                      <dt>{t("Herkunft")}</dt>
                      <dd>
                        <code>{selected.source}</code>
                      </dd>
                    </dl>
                    {
                      <>
                        <p>
                          {t(
                            "Erstelle eine Plattformkonfiguration mit zentralen Diensten und Application Landing Zone Template-Entwürfen. Die Beispielprojekte der Accelerator-Vorlage werden zu Vorlagen, nicht direkt zu Anwendungsprojekten. Veröffentlichung und Bestellung folgen im Ansicht Application Landing Zones.",
                          )}
                        </p>
                        <button
                          type="button"
                          className="button primary"
                          onClick={() => start()}
                        >
                          {t("Konfiguration erstellen")}
                        </button>
                      </>
                    }
                    <details className="technical">
                      <summary>
                        {t("Originale Accelerator-Quelldaten ansehen")}
                      </summary>
                      <pre>{JSON.stringify(values, null, 2)}</pre>
                    </details>
                  </section>
                  <Topology
                    values={compileCommonConfiguration(preview)}
                    projectTemplates={preview.projectTemplates}
                  />
                </div>
              )}
              <div hidden={view !== "repositories" && view !== "editor"}>
                <div className="actions" hidden={view !== "repositories"}>
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => setView("templates")}
                  >
                    {t("Neue Konfiguration")}
                  </button>
                  {draft && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => setView("editor")}
                    >
                      {draft.name || t("Entwurf")} weiterbearbeiten
                    </button>
                  )}
                </div>
                <Configurations
                  key={`configurations:${workspaceKey(session) ?? "guest"}`}
                  session={session}
                  draft={draft}
                  binding={configurationBinding}
                  compact={view === "editor"}
                  onSaved={(binding) => {
                    setConfigurationBinding(binding);
                    setSavedDraft(
                      binding && draft ? JSON.stringify(draft) : null,
                    );
                  }}
                  onPrepare={openDeployment}
                  onLoad={(loaded, binding) => {
                    setDraft(loaded);
                    setDraftEpoch((value) => value + 1);
                    setConfigurationBinding(binding);
                    setSavedDraft(JSON.stringify(loaded));
                    setDeploymentSelection(null);
                    setView("editor");
                  }}
                />
                <div hidden={view !== "repositories"}>
                  {view !== "workspaces" && (
                    <ForkWorkspace
                      sourceConfigurationId={configurationBinding?.id ?? null}
                      key={
                        workspaceKey(session) ?? session?.user.login ?? "guest"
                      }
                      session={session}
                      path={
                        view === "preview"
                          ? `/templates/${selected.id}`
                          : view === "editor"
                            ? `/configurations/edit/${step}`
                            : `/${view}`
                      }
                      onRestore={(loaded, path) => {
                        setDraft(loaded);
                        setConfigurationBinding(null);
                        if (path) {
                          window.history.replaceState(null, "", path);
                          window.dispatchEvent(new PopStateEvent("popstate"));
                        }
                      }}
                      draft={draft}
                      draftEpoch={draftEpoch}
                      onEdit={() => setView("editor")}
                      onPrepare={openDeployment}
                      onLoad={(loaded) => {
                        setDraft(loaded);
                        setConfigurationBinding(null);
                        setView("editor");
                      }}
                    />
                  )}
                </div>
              </div>
              {view === "editor" && !draft && (
                <section className="panel">
                  <h2>{t("Kein Entwurf in diesem Tab")}</h2>
                  <p>
                    {t(
                      "Öffne eine gespeicherte Konfiguration oder beginne mit einem Template.",
                    )}
                  </p>
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => setView("repositories")}
                  >
                    {t("Gespeicherte Konfiguration öffnen")}
                  </button>
                </section>
              )}
              {view === "editor" &&
                draft &&
                (isCommonDraft(draft) ? (
                  <CommonEditor
                    draft={draft}
                    onChange={setDraft}
                    onCreatePlatformCopy={copyPlatform}
                    step={step}
                    onStepChange={(next) => setView("editor", next)}
                    onOpenStorage={() => setView("repositories")}
                  />
                ) : (
                  <>
                    <div className="info-banner legacy-copy-banner">
                      <p>
                        {t(
                          "Du bearbeitest eine bestehende Gesamtkonfiguration mit konkreten Projekten. Sie bleibt zur Bestandsverwaltung erhalten. Neue Plattformkonfigurationen enthalten stattdessen Application Landing Zone Templates.",
                        )}
                      </p>
                      <button
                        type="button"
                        className="button secondary"
                        onClick={copyPlatform}
                      >
                        {t("Als neue Plattformkonfiguration übernehmen")}
                      </button>
                    </div>
                    <ConfigurationEditor
                      step={step}
                      onStepChange={(next) => setView("editor", next)}
                      onOpenStorage={() => setView("repositories")}
                      template={standaloneTemplate}
                      draft={draft}
                      onChange={setDraft}
                    />
                  </>
                ))}
            </CloudCatalogueProvider>
          )}
          <footer className="page-footer">
            <span>{t("Landing Zone Configurator")}</span>
            <span>
              {t(
                "Entwicklungsstand · Cloud-Änderungen nur nach Apply-Freigabe",
              )}
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
