import { useEffect, useState } from "react";
import { currentLanguage, t } from "../i18n";
import type { Session } from "./Account";

const key = "lzc.pending-invitation";
function readPending(): { token: string | null; persisted: boolean } {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const candidate = hash.get("invite");
  const token =
    candidate && /^[A-Za-z0-9_-]{43}$/.test(candidate) ? candidate : null;
  let stored: string | null = null;
  let persisted = true;
  try {
    if (token) sessionStorage.setItem(key, token);
    stored = sessionStorage.getItem(key);
  } catch {
    persisted = false;
  }
  if (token) {
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );
  }
  return { token: token ?? stored, persisted };
}
function clearPending() {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Acceptance and dismissal must also work when browser storage is blocked.
  }
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
  const [pending, setPending] = useState(readPending);
  const { token, persisted } = pending;
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const changed = () => {
      setPreview(null);
      setError("");
      setPending(readPending());
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
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
    <section className="panel" aria-label={t("Einladung annehmen")}>
      <h2>{t("Einladung zu einem Arbeitsbereich")}</h2>
      {!session && (
        <p>
          {t(
            "Melde dich über die Schaltfläche oben an. Auch bei deiner ersten Anmeldung wird dein Benutzer automatisch angelegt. Danach kannst du die Einladung prüfen und bestätigen.",
          )}
        </p>
      )}
      {!session && !persisted && (
        <p role="status">
          {t(
            "Dein Browser erlaubt kein Zwischenspeichern dieser Einladung. Öffne den Einladungslink nach der Anmeldung bitte erneut.",
          )}
        </p>
      )}
      {error && <p role="alert">{t(error)}</p>}
      {session && preview && (
        <>
          <h3>{preview.name}</h3>
          <p>
            {t("STACKIT-Organisations-ID:")} {preview.organizationId}
          </p>
          <p>
            {t("Rollen:")} {names(preview.roles)}
            {preview.manageMembers ? " · Mitglieder verwalten" : ""}
          </p>
          <p>
            {t("Du trittst als @")}
            {session.user.login}{" "}
            {t(
              "bei. Dies vergibt Configurator-Rollen; STACKIT-IAM-Berechtigungen werden nicht verändert.",
            )}
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
                  clearPending();
                  window.location.assign("/organisation");
                })
                .catch((e) => {
                  setError(e.message);
                  setBusy(false);
                });
            }}
          >
            {t("Beitreten und Arbeitsbereich öffnen")}
          </button>
        </>
      )}
      <button
        type="button"
        className="button secondary"
        disabled={busy}
        onClick={() => {
          clearPending();
          setPending({ token: null, persisted });
        }}
      >
        {t("Einladung schließen")}
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
      <h3>{t("Mitglied einladen")}</h3>
      <p>
        {t(
          "Erstelle einen einmaligen Link, gültig für sieben Tage. Die Person meldet sich an und bestätigt den Beitritt. Teile den Link nur mit der gewünschten Person: Wer ihn besitzt, kann die gewählten Rollen erhalten.",
        )}
      </p>
      {error && <p role="alert">{t(error)}</p>}
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
          {t("Application Owner")}
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
          {t("Platform Engineer")}
        </label>
        <label>
          <input
            type="checkbox"
            checked={manage}
            disabled={!engineer}
            onChange={(e) => setManage(e.target.checked)}
          />{" "}
          {t("Mitglieder verwalten")}
        </label>
        <button
          type="submit"
          className="button primary"
          disabled={busy || (!owner && !engineer)}
        >
          {t("Einladungslink erstellen")}
        </button>
      </form>
      {link && (
        <div className="field">
          <label htmlFor="invitation-link">
            {t("Einladungslink – jetzt kopieren")}
          </label>
          <input id="invitation-link" readOnly value={link} />
          <p>
            {t(
              "Der vollständige Link wird nur jetzt angezeigt. Es wird keine E-Mail verschickt.",
            )}
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
            {t("Link kopieren")}
          </button>
          {copied && <p role="status">{t("Link kopiert.")}</p>}
        </div>
      )}
      <h3>{t("Offene Einladungen")}</h3>
      {items.length === 0 && <p>{t("Keine offenen Einladungen.")}</p>}
      {items.map((i) => (
        <article key={i.id} className="panel">
          <p>
            {names(i.roles)}
            {i.manageMembers ? " · Mitglieder verwalten" : ""}
          </p>
          <p>
            {t("Gültig bis")}{" "}
            {new Date(i.expiresAt).toLocaleString(
              currentLanguage() === "de" ? "de-DE" : "en-GB",
            )}
          </p>
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
            {t("Einladung widerrufen")}
          </button>
        </article>
      ))}
    </section>
  );
}
