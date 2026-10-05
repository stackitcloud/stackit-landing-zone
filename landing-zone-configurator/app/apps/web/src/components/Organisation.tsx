import { useCallback, useEffect, useState } from "react";
import { t } from "../i18n";
import type { Session } from "./Account";
import { Invitations } from "./Invitations";
import { OrganizationBinding } from "./OrganizationBinding";

type Role = "platform-engineer" | "application-owner";
type Member = {
  userId: string;
  login: string | null;
  roles: Role[];
  manageMembers: boolean;
};
type Tenant = {
  id: string;
  name: string;
  kind: "personal" | "organisation";
  organizationId: string | null;
  organizationVerified: boolean;
  canArchive?: boolean;
  roles: Role[];
  manageMembers: boolean;
};
type Overview = {
  organizationBindingEnabled?: boolean;
  userId: string;
  activeTenantId: string;
  tenants: Tenant[];
  members: Member[];
};
const uuid =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
function workspacePreference(session: Session) {
  return `lzc-workspace:${session.user.id ?? session.user.login}`;
}
function rememberWorkspace(session: Session, tenantId: string) {
  try {
    localStorage.setItem(workspacePreference(session), tenantId);
  } catch {}
}
function workspaceDestination(tenant: Tenant) {
  return tenant.kind === "organisation" &&
    !tenant.roles.includes("platform-engineer")
    ? "/applications"
    : "/configurations";
}
const messages: Record<string, string> = {
  organisation_already_exists:
    "Ein zugänglicher Arbeitsbereich mit diesem Namen und dieser Organisations-ID existiert bereits. Bitte wähle ihn in der Liste aus.",
  organisation_not_empty_draft:
    "Nur leere, unbestätigte Arbeitsbereiche ohne weitere Mitglieder können gelöscht werden. Entferne zunächst weitere Mitglieder. Konfigurationen, Zugänge oder Deployment-Daten verhindern das Löschen.",
  stale_tenant_context:
    "Der aktive Arbeitsbereich wurde in einem anderen Tab geändert. Bitte lade die Seite neu, bevor du Mitglieder bearbeitest.",
  membership_constraints:
    "Die Änderung verletzt eine Mitgliedschaftsregel. Mindestens ein Platform Engineer muss die Mitgliederverwaltung behalten.",
  registered_user_required:
    "Dieser Benutzer ist noch nicht registriert. Bitte zuerst im Configurator anmelden und die persönliche Benutzerkennung teilen.",
  membership_management_forbidden:
    "Du darfst die Mitglieder dieses Arbeitsbereichs nicht verwalten.",
  invalid_organisation_request:
    "Bitte prüfe Benutzerkennung, Rollen und Organisations-ID.",
  invalid_request_origin_or_csrf:
    "Die Sitzung ist nicht mehr gültig. Bitte lade die Seite neu.",
  authentication_required: "Bitte melde dich erneut an.",
  last_manager:
    "Mindestens ein Mitglied muss die Mitgliederverwaltung behalten.",
  last_member_manager:
    "Mindestens ein Mitglied muss die Mitgliederverwaltung behalten.",
  user_not_found:
    "Dieser Benutzer ist noch nicht registriert. Bitte zuerst im Configurator anmelden und die persönliche Benutzerkennung teilen.",
  forbidden:
    "Du hast für diese Änderung keine Berechtigung. Lade die Seite neu, um aktuelle Rechte zu sehen.",
  invalid_request: "Bitte prüfe Benutzerkennung, Rollen und Organisations-ID.",
};
export function Organisation({
  session,
  beforeSwitch,
  selectionOnly = false,
  restoreLastWorkspace = false,
  onNavigate,
}: {
  session: Session | null;
  beforeSwitch: () => boolean;
  selectionOnly?: boolean;
  restoreLastWorkspace?: boolean;
  onNavigate?: () => void;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [userId, setUserId] = useState("");
  const [engineer, setEngineer] = useState(false);
  const [owner, setOwner] = useState(true);
  const [manager, setManager] = useState(false);
  const [creating, setCreating] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(
      "/api/v1/organisation",
      signal ? { signal } : {},
    );
    if (!response.ok)
      throw new Error(
        "Die Organisationsverwaltung ist derzeit nicht verfügbar. Bitte erneut anmelden oder später versuchen.",
      );
    const overview = (await response.json()) as Overview;
    if (!signal?.aborted) setData(overview);
    return overview;
  }, []);
  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    void load(controller.signal)
      .then(async (overview) => {
        if (
          controller.signal.aborted ||
          !selectionOnly ||
          !restoreLastWorkspace
        )
          return;
        let remembered: string | null;
        try {
          remembered = localStorage.getItem(workspacePreference(session));
        } catch {
          return;
        }
        const tenant = overview.tenants.find((item) => item.id === remembered);
        if (!tenant) return;
        setBusy(true);
        if (tenant.id !== overview.activeTenantId) {
          const response = await fetch("/api/v1/organisation/switch", {
            method: "POST",
            signal: controller.signal,
            headers: {
              "content-type": "application/json",
              "x-lzc-csrf": session.csrfToken,
            },
            body: JSON.stringify({ tenantId: tenant.id }),
          });
          if (!response.ok) {
            setBusy(false);
            setError(
              "Der zuletzt verwendete Arbeitsbereich konnte nicht geöffnet werden. Wähle einen verfügbaren Arbeitsbereich.",
            );
            return;
          }
        }
        if (!controller.signal.aborted) {
          onNavigate?.();
          window.location.assign(workspaceDestination(tenant));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setBusy(false);
          setError("Die Organisationsverwaltung ist derzeit nicht verfügbar.");
        }
      });
    return () => controller.abort();
  }, [session, load, selectionOnly, restoreLastWorkspace, onNavigate]);
  async function mutate(
    path: string,
    method: string,
    body?: unknown,
    switchWorkspace = false,
    targetTenantId?: string,
  ) {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/v1/organisation${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          "x-lzc-csrf": session.csrfToken,
          ...(targetTenantId ? { "x-lzc-tenant": targetTenantId } : {}),
          ...(path.startsWith("/members") && data
            ? { "x-lzc-tenant": data.activeTenantId }
            : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(
          messages[payload.error] ??
            "Die Änderung wurde nicht gespeichert. Prüfe deine Berechtigung und Eingaben; mindestens ein Mitglied muss die Mitgliederverwaltung behalten.",
        );
      }
      if (switchWorkspace) {
        const tenantId =
          typeof body === "object" &&
          body !== null &&
          "tenantId" in body &&
          typeof body.tenantId === "string"
            ? body.tenantId
            : null;
        const tenant = data?.tenants.find((item) => item.id === tenantId);
        if (tenantId) rememberWorkspace(session, tenantId);
        onNavigate?.();
        window.location.assign(
          tenant ? workspaceDestination(tenant) : "/workspaces",
        );
        return;
      }
      if (selectionOnly && path === "" && method === "POST") {
        const created = await response.json();
        const switched = await fetch("/api/v1/organisation/switch", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-lzc-csrf": session.csrfToken,
          },
          body: JSON.stringify({ tenantId: created.id }),
        });
        if (!switched.ok) {
          await load();
          throw new Error(
            "Der Arbeitsbereich wurde erstellt, konnte aber nicht geöffnet werden. Wähle ihn in der Arbeitsbereichsliste.",
          );
        }
        rememberWorkspace(session, created.id);
        onNavigate?.();
        window.location.assign("/configurations");
        return;
      }
      const changesOwnMembership =
        path === `/members/${session.user.id}` ||
        (path === "/members" &&
          typeof body === "object" &&
          body !== null &&
          "userId" in body &&
          body.userId === session.user.id);
      if (changesOwnMembership) {
        window.location.assign("/organisation");
        return;
      }
      await load();
      setNotice("Änderung gespeichert.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Änderung fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!session)
    return (
      <section className="panel">
        <h2>{t("Anmeldung erforderlich")}</h2>
        <p>
          {t(
            "Melde dich an, um einen Arbeitsbereich zu öffnen oder zu erstellen.",
          )}
        </p>
      </section>
    );
  const active = data?.tenants.find(
    (tenant) => tenant.id === data.activeTenantId,
  );
  return (
    <div className="organisation-management">
      {error && (
        <p role="alert" className="info-banner">
          {t(error)}
        </p>
      )}
      {notice && <p role="status">{t(notice)}</p>}

      {selectionOnly && (
        <section className="panel">
          <h2>{t("Arbeitsbereiche")}</h2>
          {selectionOnly && (
            <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={() => setCreating(true)}
            >
              {t("Arbeitsbereich erstellen")}
            </button>
          )}
          {!data && !error && (
            <p role="status">{t("Arbeitsbereiche werden geladen …")}</p>
          )}
          {data?.tenants.map((tenant) => (
            <article key={tenant.id}>
              <h3>
                {tenant.name}
                {tenant.id === data.activeTenantId ? " · Aktiv" : ""}
              </h3>
              <p>
                {tenant.kind === "personal"
                  ? t("Persönlicher Arbeitsbereich")
                  : t(
                      "STACKIT Organisation: {{value0}} · Zuordnung noch nicht verifiziert",
                      { value0: tenant.organizationId },
                    )}
              </p>
              {tenant.kind === "organisation" && (
                <p>
                  {tenant.roles
                    .map((role) =>
                      role === "platform-engineer"
                        ? "Platform Engineer"
                        : "Application Owner",
                    )
                    .join(", ")}
                  {tenant.manageMembers ? " · Mitgliederverwaltung" : ""}
                </p>
              )}
              {(selectionOnly || tenant.id !== data.activeTenantId) && (
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy}
                  aria-label={
                    selectionOnly
                      ? t("Arbeitsbereich öffnen: {{value0}}", {
                          value0: tenant.name,
                        })
                      : undefined
                  }
                  onClick={() => {
                    if (!beforeSwitch()) return;
                    if (selectionOnly && tenant.id === data.activeTenantId) {
                      rememberWorkspace(session, tenant.id);
                      onNavigate?.();
                      window.location.assign(workspaceDestination(tenant));
                    } else
                      void mutate(
                        "/switch",
                        "POST",
                        { tenantId: tenant.id },
                        true,
                      );
                  }}
                >
                  {selectionOnly
                    ? t("Öffnen")
                    : t("Zu {{value0}} wechseln", { value0: tenant.name })}
                </button>
              )}
              {tenant.canArchive && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    if (
                      (tenant.id !== data.activeTenantId || beforeSwitch()) &&
                      window.confirm(
                        t(
                          "Arbeitsbereich „{{value0}}“ löschen? Das ist nur für leere, unbestätigte Entwürfe ohne weitere Mitglieder möglich. STACKIT-Ressourcen werden nicht verändert.",
                          { value0: tenant.name },
                        ),
                      )
                    )
                      void mutate(
                        `/workspaces/${tenant.id}`,
                        "DELETE",
                        undefined,
                        tenant.id === data.activeTenantId,
                        tenant.id,
                      );
                  }}
                >
                  {t("Arbeitsbereich löschen")}
                </button>
              )}
            </article>
          ))}
        </section>
      )}
      {selectionOnly && creating && (
        <section className="panel">
          <h2>{t("Arbeitsbereich erstellen")}</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (selectionOnly && !beforeSwitch()) return;
              void mutate("", "POST", {
                name: name.trim(),
                organizationId: organizationId.trim(),
              });
            }}
          >
            <div className="field">
              <label htmlFor="organisation-name">
                {t("Name des Arbeitsbereichs")}
              </label>
              <input
                id="organisation-name"
                value={name}
                maxLength={120}
                required
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="organisation-id">
                {t("STACKIT Organisations-ID")}
              </label>
              <input
                id="organisation-id"
                value={organizationId}
                pattern={uuid}
                required
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                onChange={(event) => setOrganizationId(event.target.value)}
              />
            </div>
            <button className="button primary" disabled={busy} type="submit">
              {t("Arbeitsbereich anlegen")}
            </button>
          </form>
        </section>
      )}
      {!selectionOnly && !data && !error && (
        <p role="status">{t("Einstellungen werden geladen …")}</p>
      )}
      {!selectionOnly && active && (
        <section className="panel">
          <h2>{active.name}</h2>
          <p>
            {active.kind === "personal"
              ? t("Persönlicher Arbeitsbereich")
              : t("STACKIT Organisation: {{value0}} · {{value1}}", {
                  value0: active.organizationId,
                  value1: t(
                    active.organizationVerified
                      ? "Zuordnung verifiziert"
                      : "Zuordnung noch nicht verifiziert",
                  ),
                })}
          </p>
          {data?.organizationBindingEnabled &&
            session &&
            active.kind === "organisation" &&
            active.manageMembers &&
            active.roles.includes("platform-engineer") &&
            !active.organizationVerified && (
              <OrganizationBinding
                key={`${session.csrfToken}:${active.id}`}
                session={session}
                tenantId={active.id}
                onBound={() => load()}
              />
            )}
        </section>
      )}
      {!selectionOnly && active?.kind === "organisation" && (
        <section className="panel">
          <h2>
            {t("Mitglieder in")} {active.name}
          </h2>
          {!active.manageMembers && (
            <p>
              {t(
                "Änderungen übernimmt ein Platform Engineer mit Berechtigung zur Mitgliederverwaltung.",
              )}
            </p>
          )}
          {data?.members.map((member) => (
            <article key={member.userId}>
              <h3>
                {member.login ? `@${member.login}` : t("Benutzer")}
                {member.userId === data.userId ? " · Du" : ""}
              </h3>

              <p>
                {member.roles
                  .map((role) =>
                    role === "platform-engineer"
                      ? "Platform Engineer"
                      : "Application Owner",
                  )
                  .join(", ")}
                {member.manageMembers ? " · Mitgliederverwaltung" : ""}
              </p>
              {active.manageMembers && (
                <>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => {
                      setUserId(member.userId);
                      setEngineer(member.roles.includes("platform-engineer"));
                      setOwner(member.roles.includes("application-owner"));
                      setManager(member.manageMembers);
                      document.getElementById("member-roles")?.focus();
                    }}
                  >
                    {t("Rollen bearbeiten")}
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          t(
                            "Diese Mitgliedschaft entfernen? Der Zugriff auf den Arbeitsbereich endet damit.",
                          ),
                        )
                      )
                        void mutate(`/members/${member.userId}`, "DELETE");
                    }}
                  >
                    {t("Mitglied entfernen")}
                  </button>
                </>
              )}
            </article>
          ))}
          {active.manageMembers && <Invitations session={session} />}
          {active.manageMembers && userId && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!new RegExp(`^${uuid}$`).test(userId.trim())) {
                  setError(
                    "Bitte wähle ein bestehendes Mitglied über Rollen bearbeiten aus.",
                  );
                  return;
                }
                const roles: Role[] = [];
                if (engineer) roles.push("platform-engineer");
                if (owner) roles.push("application-owner");
                void mutate("/members", "PUT", {
                  userId: userId.trim(),
                  roles,
                  manageMembers: engineer && manager,
                });
              }}
            >
              <h3 id="member-roles" tabIndex={-1}>
                {t("Rollen bearbeiten:")}{" "}
                {data?.members.find((m) => m.userId === userId)?.login ??
                  t("Mitglied")}
              </h3>
              <label>
                <input
                  type="checkbox"
                  checked={engineer}
                  onChange={(event) => {
                    setEngineer(event.target.checked);
                    if (!event.target.checked) setManager(false);
                  }}
                />{" "}
                {t("Platform Engineer")}
              </label>
              <p>
                {t(
                  "Verwaltet Plattform und künftig veröffentlichte Application Templates.",
                )}
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={owner}
                  onChange={(event) => setOwner(event.target.checked)}
                />{" "}
                {t("Application Owner")}
              </label>
              <p>
                {t(
                  "Verwendet künftig freigegebene Application Templates. Der Application-Katalog ist noch nicht verfügbar.",
                )}
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={manager}
                  disabled={!engineer}
                  onChange={(event) => setManager(event.target.checked)}
                />{" "}
                {t("Mitglieder verwalten")}
              </label>
              <p>
                {t(
                  "Zusätzliche Berechtigung für Platform Engineers. Eigene Rollen können nur durch ein anderes berechtigtes Mitglied erweitert werden. Mindestens ein Mitglied muss diese Berechtigung behalten.",
                )}
              </p>
              <button
                className="button primary"
                type="submit"
                disabled={busy || (!engineer && !owner)}
              >
                {t("Mitgliedschaft speichern")}
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
