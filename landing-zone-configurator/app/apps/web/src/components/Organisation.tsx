import { useCallback, useEffect, useState } from "react";
import type { Session } from "./Account";

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
  userId: string;
  activeTenantId: string;
  tenants: Tenant[];
  members: Member[];
};
const uuid =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
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
}: {
  session: Session | null;
  beforeSwitch: () => boolean;
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
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(
      "/api/v1/organisation",
      signal ? { signal } : {},
    );
    if (!response.ok)
      throw new Error(
        "Die Organisationsverwaltung ist derzeit nicht verfügbar. Bitte erneut anmelden oder später versuchen.",
      );
    setData(await response.json());
  }, []);
  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    void load(controller.signal).catch(() => {
      if (!controller.signal.aborted)
        setError("Die Organisationsverwaltung ist derzeit nicht verfügbar.");
    });
    return () => controller.abort();
  }, [session, load]);
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
        window.location.assign("/organisation");
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
        <h2>Anmeldung erforderlich</h2>
        <p>
          Melde dich an, um deine Arbeitsbereiche und Mitgliedschaften zu
          verwalten.
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
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <section className="panel">
        <h2>Deine Benutzerkennung</h2>
        <p>
          Teile diese Kennung mit der Mitgliederverwaltung, um zu einem
          Arbeitsbereich eingeladen zu werden. Der Benutzer muss bereits im
          Configurator registriert sein.
        </p>
        <code style={{ overflowWrap: "anywhere" }}>
          {data?.userId ?? session.user.id}
        </code>
        <button
          type="button"
          className="button secondary"
          disabled={!(data?.userId ?? session.user.id)}
          onClick={() => {
            void navigator.clipboard
              .writeText(data?.userId ?? session.user.id ?? "")
              .then(() => setNotice("Benutzerkennung kopiert."))
              .catch(() =>
                setError(
                  "Kopieren ist nicht möglich. Bitte markiere und kopiere die Benutzerkennung.",
                ),
              );
          }}
        >
          Benutzerkennung kopieren
        </button>
        <p>
          Die Anmeldung erfolgt derzeit über GitHub. STACKIT-Anmeldung und
          Verifizierung der Organisationszugehörigkeit folgen separat.
        </p>
      </section>
      <section className="panel">
        <h2>Arbeitsbereiche</h2>
        {!data && !error && (
          <p role="status">Arbeitsbereiche werden geladen …</p>
        )}
        {data?.tenants.map((tenant) => (
          <article key={tenant.id}>
            <h3>
              {tenant.name}
              {tenant.id === data.activeTenantId ? " · Aktiv" : ""}
            </h3>
            <p>
              {tenant.kind === "personal"
                ? "Persönlicher Arbeitsbereich"
                : `STACKIT Organisation: ${tenant.organizationId} · Zuordnung noch nicht verifiziert`}
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
            {tenant.id !== data.activeTenantId && (
              <button
                className="button secondary"
                type="button"
                disabled={busy}
                onClick={() => {
                  if (beforeSwitch())
                    void mutate(
                      "/switch",
                      "POST",
                      { tenantId: tenant.id },
                      true,
                    );
                }}
              >
                Zu {tenant.name} wechseln
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
                      `Arbeitsbereich „${tenant.name}“ löschen? Das ist nur für leere, unbestätigte Entwürfe ohne weitere Mitglieder möglich. STACKIT-Ressourcen werden nicht verändert.`,
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
                Arbeitsbereich löschen
              </button>
            )}
          </article>
        ))}
      </section>
      <section className="panel">
        <h2>Organisationsarbeitsbereich anlegen</h2>
        <p>
          Der Arbeitsbereich verbindet künftig Plattform und Application
          Templates. Die angegebene STACKIT-Organisation ist zunächst eine
          unbestätigte Zuordnung. Es werden keine STACKIT-Rechte vergeben und
          keine Deployments freigeschaltet.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void mutate("", "POST", {
              name: name.trim(),
              organizationId: organizationId.trim(),
            });
          }}
        >
          <div className="field">
            <label htmlFor="organisation-name">Name des Arbeitsbereichs</label>
            <input
              id="organisation-name"
              value={name}
              maxLength={120}
              required
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="organisation-id">STACKIT Organisations-ID</label>
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
            Arbeitsbereich anlegen
          </button>
        </form>
      </section>
      {active?.kind === "organisation" && (
        <section className="panel">
          <h2>Mitglieder in {active.name}</h2>
          {!active.manageMembers && (
            <p>
              Änderungen übernimmt ein Platform Engineer mit Berechtigung zur
              Mitgliederverwaltung.
            </p>
          )}
          {data?.members.map((member) => (
            <article key={member.userId}>
              <h3>
                {member.login ? `@${member.login}` : "Benutzer"}
                {member.userId === data.userId ? " · Du" : ""}
              </h3>
              <p style={{ overflowWrap: "anywhere" }}>{member.userId}</p>
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
                      document.getElementById("member-id")?.focus();
                    }}
                  >
                    Rollen bearbeiten
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Diese Mitgliedschaft entfernen? Der Zugriff auf den Arbeitsbereich endet damit.",
                        )
                      )
                        void mutate(`/members/${member.userId}`, "DELETE");
                    }}
                  >
                    Mitglied entfernen
                  </button>
                </>
              )}
            </article>
          ))}
          {active.manageMembers && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!new RegExp(`^${uuid}$`).test(userId.trim())) {
                  setError(
                    "Bitte gib die interne Benutzerkennung als UUID ein. Du findest sie im Configurator der anderen Person unter Organisation & Mitglieder → Deine Benutzerkennung. GitHub-Name und E-Mail-Adresse funktionieren hier nicht.",
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
              <h3>Mitglied hinzufügen oder Rollen ändern</h3>
              <div className="field">
                <label htmlFor="member-id">Persönliche Benutzerkennung</label>
                <input
                  id="member-id"
                  required
                  aria-describedby="member-id-help"
                  placeholder="123e4567-e89b-42d3-a456-426614174000"
                  value={userId}
                  onChange={(event) => setUserId(event.target.value)}
                />
                <p id="member-id-help">
                  Interne Configurator-Benutzerkennung (UUID), kein GitHub-Name
                  und keine E-Mail-Adresse. Die andere Person meldet sich zuerst
                  an und kopiert unter „Organisation & Mitglieder“ ihre
                  „Benutzerkennung“.
                </p>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={engineer}
                  onChange={(event) => {
                    setEngineer(event.target.checked);
                    if (!event.target.checked) setManager(false);
                  }}
                />{" "}
                Platform Engineer
              </label>
              <p>
                Verwaltet Plattform und künftig veröffentlichte Application
                Templates.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={owner}
                  onChange={(event) => setOwner(event.target.checked)}
                />{" "}
                Application Owner
              </label>
              <p>
                Verwendet künftig freigegebene Application Templates. Der
                Application-Katalog ist noch nicht verfügbar.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={manager}
                  disabled={!engineer}
                  onChange={(event) => setManager(event.target.checked)}
                />{" "}
                Mitglieder verwalten
              </label>
              <p>
                Zusätzliche Berechtigung für Platform Engineers. Eigene Rollen
                können nur durch ein anderes berechtigtes Mitglied erweitert
                werden. Mindestens ein Mitglied muss diese Berechtigung
                behalten.
              </p>
              <button
                className="button primary"
                type="submit"
                disabled={busy || (!engineer && !owner)}
              >
                Mitgliedschaft speichern
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
