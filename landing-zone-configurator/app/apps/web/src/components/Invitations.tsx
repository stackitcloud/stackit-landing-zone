import { useEffect, useState } from "react";
import type { Session } from "./Account";

const key = "lzc.pending-invitation";
function readPending() {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const token = hash.get("invite");
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
    sessionStorage.setItem(key, token);
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }
  return sessionStorage.getItem(key);
}
const names = (roles: string[]) =>
  roles
    .map((r) =>
      r === "platform-engineer" ? "Platform Engineer" : "Application Owner",
    )
    .join(", ");
const messages: Record<string, string> = {
  invitation_unavailable:
    "Diese Einladung ist abgelaufen, widerrufen oder bereits verwendet. Bitte fordere eine neue Einladung an.",
  already_member:
    "Du bist bereits Mitglied. Bestehende Rollen werden durch eine Einladung nicht geändert.",
  membership_management_forbidden:
    "Du darfst Einladungen in diesem Arbeitsbereich nicht verwalten.",
  stale_tenant_context:
    "Der Arbeitsbereich wurde gewechselt. Bitte lade die Seite neu.",
};
async function call(
  session: Session,
  path: string,
  method: string,
  body?: unknown,
) {
  const response = await fetch(`/api/v1/invitations${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-lzc-csrf": session.csrfToken,
      "x-lzc-tenant": session.tenant?.id ?? "",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      messages[data.error] ??
        "Die Einladung konnte nicht verarbeitet werden. Bitte prüfe die Anmeldung und versuche es erneut.",
    );
  }
  return response.status === 204 ? null : response.json();
}
type Preview = {
  name: string;
  organizationId: string;
  roles: string[];
  manageMembers: boolean;
};
export function InvitationAcceptance({ session }: { session: Session | null }) {
  const [token, setToken] = useState(readPending);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!token || !session) return;
    let active = true;
    setPreview(null);
    setError("");
    void call(session, "/preview", "POST", { token })
      .then((v) => {
        if (active) setPreview(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [token, session]);
  if (!token) return null;
  return (
    <section className="panel" aria-label="Einladung annehmen">
      <h2>Einladung zu einem Arbeitsbereich</h2>
      {!session && (
        <p>
          Melde dich über die Schaltfläche oben an. Auch bei deiner ersten
          Anmeldung wird dein Benutzer automatisch angelegt. Danach kannst du
          die Einladung prüfen und bestätigen.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {session && preview && (
        <>
          <h3>{preview.name}</h3>
          <p>STACKIT-Organisations-ID: {preview.organizationId}</p>
          <p>
            Rollen: {names(preview.roles)}
            {preview.manageMembers ? " · Mitglieder verwalten" : ""}
          </p>
          <p>
            Du trittst als @{session.user.login} bei. Dies vergibt
            Configurator-Rollen; STACKIT-IAM-Berechtigungen werden nicht
            verändert.
          </p>
          <button
            type="button"
            className="button primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError("");
              void call(session, "/accept", "POST", { token })
                .then(() => {
                  sessionStorage.removeItem(key);
                  window.location.assign("/organisation");
                })
                .catch((e) => {
                  setError(e.message);
                  setBusy(false);
                });
            }}
          >
            Beitreten und Arbeitsbereich öffnen
          </button>
        </>
      )}
      <button
        type="button"
        className="button secondary"
        disabled={busy}
        onClick={() => {
          sessionStorage.removeItem(key);
          setToken(null);
        }}
      >
        Einladung schließen
      </button>
    </section>
  );
}
type Item = {
  id: string;
  roles: string[];
  manageMembers: boolean;
  expiresAt: string;
};
export function Invitations({ session }: { session: Session }) {
  const [items, setItems] = useState<Item[]>([]);
  const [owner, setOwner] = useState(true);
  const [engineer, setEngineer] = useState(false);
  const [manage, setManage] = useState(false);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const load = () =>
    call(session, "", "GET").then((v) => setItems(v.invitations));
  useEffect(() => {
    let active = true;
    void call(session, "", "GET")
      .then((v) => {
        if (active) setItems(v.invitations);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [session]);
  return (
    <section className="panel">
      <h3>Mitglied einladen</h3>
      <p>
        Erstelle einen einmaligen Link, gültig für sieben Tage. Die Person
        meldet sich an und bestätigt den Beitritt. Teile den Link nur mit der
        gewünschten Person: Wer ihn besitzt, kann die gewählten Rollen erhalten.
      </p>
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setLink("");
          setCopied(false);
          void call(session, "", "POST", {
            roles: [
              ...(engineer ? ["platform-engineer"] : []),
              ...(owner ? ["application-owner"] : []),
            ],
            manageMembers: engineer && manage,
          })
            .then(async (v) => {
              setLink(v.url);
              await load();
            })
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        <label>
          <input
            type="checkbox"
            checked={owner}
            onChange={(e) => setOwner(e.target.checked)}
          />{" "}
          Application Owner
        </label>
        <label>
          <input
            type="checkbox"
            checked={engineer}
            onChange={(e) => {
              setEngineer(e.target.checked);
              if (!e.target.checked) setManage(false);
            }}
          />{" "}
          Platform Engineer
        </label>
        <label>
          <input
            type="checkbox"
            checked={manage}
            disabled={!engineer}
            onChange={(e) => setManage(e.target.checked)}
          />{" "}
          Mitglieder verwalten
        </label>
        <button
          type="submit"
          className="button primary"
          disabled={busy || (!owner && !engineer)}
        >
          Einladungslink erstellen
        </button>
      </form>
      {link && (
        <div className="field">
          <label htmlFor="invitation-link">
            Einladungslink – jetzt kopieren
          </label>
          <input id="invitation-link" readOnly value={link} />
          <p>
            Der vollständige Link wird nur jetzt angezeigt. Es wird keine E-Mail
            verschickt.
          </p>
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              void navigator.clipboard
                .writeText(link)
                .then(() => setCopied(true))
                .catch(() =>
                  setError("Bitte markiere und kopiere den Link aus dem Feld."),
                )
            }
          >
            Link kopieren
          </button>
          {copied && <p role="status">Link kopiert.</p>}
        </div>
      )}
      <h3>Offene Einladungen</h3>
      {items.length === 0 && <p>Keine offenen Einladungen.</p>}
      {items.map((i) => (
        <article key={i.id} className="panel">
          <p>
            {names(i.roles)}
            {i.manageMembers ? " · Mitglieder verwalten" : ""}
          </p>
          <p>Gültig bis {new Date(i.expiresAt).toLocaleString("de-DE")}</p>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError("");
              void call(session, `/${i.id}`, "DELETE")
                .then(async () => {
                  setLink("");
                  await load();
                })
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            Einladung widerrufen
          </button>
        </article>
      ))}
    </section>
  );
}
