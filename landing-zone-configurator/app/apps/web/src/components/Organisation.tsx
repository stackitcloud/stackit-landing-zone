import { useCallback, useEffect, useState } from "react";
import { t } from "../i18n";
import { pendingLoginOwner } from "../login-draft";
import type { Session } from "./Account";
import { ApplicationGroups } from "./ApplicationGroups";
import { OrganizationBinding } from "./OrganizationBinding";
import { UserManagement } from "./UserManagement";

type Role = "platform-engineer" | "application-owner";
type Member = {
  userId: string;
  login: string | null;
  displayName?: string | null;
  email?: string | null;
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
  activeTenantId: string | null;
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
  organisation_operation_failed:
    "Die Änderung konnte nicht gespeichert werden. Bitte versuche es später erneut.",
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
  const [overview, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [creating, setCreating] = useState(false);
  const data =
    overview && (!session?.user.id || overview.userId === session.user.id)
      ? overview
      : null;
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
        let remembered = pendingLoginOwner(session)?.tenantId ?? null;
        if (!remembered) {
          try {
            remembered = localStorage.getItem(workspacePreference(session));
          } catch {
            return;
          }
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
    if (!session || busy) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/v1/organisation${path}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          "x-lzc-csrf": session.csrfToken,
          ...(targetTenantId ? { "x-lzc-tenant": targetTenantId } : {}),
          ...(path.startsWith("/members") && data?.activeTenantId
            ? { "x-lzc-tenant": data.activeTenantId }
            : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(
          messages[payload.error] ??
            "Die Änderung konnte nicht gespeichert werden. Bitte versuche es später erneut.",
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
        return true;
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
        return true;
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
        return true;
      }
      await load();
      setNotice("Änderung gespeichert.");
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Änderung fehlgeschlagen.",
      );
      return false;
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
          {data && data.tenants.length === 0 && (
            <p>
              {t(
                "Erstelle einen Arbeitsbereich oder öffne eine Einladung, um gemeinsam zu arbeiten.",
              )}
            </p>
          )}
          {data?.tenants.map((tenant) => (
            <article key={tenant.id}>
              <h3>
                {tenant.name}
                {tenant.id === data.activeTenantId ? t(" · Aktiv") : ""}
              </h3>
              <p>
                {tenant.organizationId
                  ? t(
                      "STACKIT Organisation: {{value0}} · Zuordnung noch nicht verifiziert",
                      { value0: tenant.organizationId },
                    )
                  : t("Keine STACKIT Organisation zugeordnet")}
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
                  {tenant.manageMembers ? t(" · Mitgliederverwaltung") : ""}
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
        <p role="status">{t("Benutzerverwaltung wird geladen …")}</p>
      )}
      {!selectionOnly && active && (
        <section className="panel">
          <h2>{active.name}</h2>
          <p>
            {active.organizationId
              ? t("STACKIT Organisation: {{value0}} · {{value1}}", {
                  value0: active.organizationId,
                  value1: t(
                    active.organizationVerified
                      ? "Zuordnung verifiziert"
                      : "Zuordnung noch nicht verifiziert",
                  ),
                })
              : t("Keine STACKIT Organisation zugeordnet")}
          </p>
          {!active.organizationId &&
            active.manageMembers &&
            active.roles.includes("platform-engineer") && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void mutate(
                    `/workspaces/${active.id}/organization`,
                    "PATCH",
                    { organizationId: organizationId.trim() },
                    false,
                    active.id,
                  );
                }}
              >
                <div className="field">
                  <label htmlFor="migrated-organization-id">
                    {t("STACKIT Organisations-ID")}
                  </label>
                  <input
                    id="migrated-organization-id"
                    required
                    pattern={uuid}
                    value={organizationId}
                    onChange={(event) => setOrganizationId(event.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  className="button primary"
                  disabled={busy}
                >
                  {t("STACKIT Organisation zuordnen")}
                </button>
              </form>
            )}
          {data?.organizationBindingEnabled &&
            session &&
            active.kind === "organisation" &&
            !!active.organizationId &&
            !active.organizationVerified &&
            active.manageMembers &&
            active.roles.includes("platform-engineer") && (
              <OrganizationBinding
                key={`${session.csrfToken}:${active.id}`}
                session={session}
                tenantId={active.id}
                organizationVerified={active.organizationVerified}
                onBound={() => load()}
              />
            )}
        </section>
      )}
      {!selectionOnly && active?.kind === "organisation" && (
        <UserManagement
          key={`${session.user.id ?? session.user.login}:${active.id}`}
          session={session}
          workspaceName={active.name}
          viewerId={data?.userId ?? session.user.id ?? ""}
          members={data?.members ?? []}
          canManage={active.manageMembers}
          busy={busy}
          error={error}
          clearError={() => setError("")}
          onSave={(userId, roles, manageMembers) =>
            mutate("/members", "PUT", { userId, roles, manageMembers })
          }
          onRemove={(userId) => mutate(`/members/${userId}`, "DELETE")}
        />
      )}
      {!selectionOnly &&
        active &&
        active.manageMembers &&
        active.roles.includes("platform-engineer") && (
          <ApplicationGroups
            key={`${session.csrfToken}:${active.id}`}
            session={session}
            tenantId={active.id}
          />
        )}
    </div>
  );
}
