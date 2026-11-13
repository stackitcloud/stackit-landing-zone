import { useCallback, useEffect, useRef, useState } from "react";
import { currentLanguage, t } from "../i18n";
import type { Session } from "./Account";
import type { MemberRole } from "./MemberIdentity";
import { MembershipRoles } from "./MembershipRoles";
import { PeopleDialog } from "./PeopleDialog";

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
  invitation_recipient_mismatch:
    "Diese Einladung gehört zu einer anderen verifizierten STACKIT-E-Mail-Adresse. Bitte melde dich mit dem eingeladenen Konto an.",
  invitation_email_rate_limit:
    "Du hast das Limit von 20 E-Mail-Einladungen pro Stunde erreicht. Bitte versuche es später erneut.",
  invitation_unavailable:
    "Diese Einladung ist abgelaufen, widerrufen oder bereits verwendet. Bitte fordere eine neue Einladung an.",
  invitation_email_unavailable:
    "E-Mail-Versand ist auf dieser Instanz noch nicht verfügbar. Erstelle einen Link ohne E-Mail-Versand.",
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
            {preview.manageMembers ? t(" · Mitglieder verwalten") : ""}
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
  createdAt?: string;
  recipientEmail?: string | null;
  mailStatus?: string | null;
};
export function Invitations({
  session,
  createOpen,
  onCreateClose,
  onCountChange,
  active,
}: {
  session: Session;
  createOpen: boolean;
  onCreateClose: () => void;
  onCountChange: (count: number) => void;
  active: boolean;
}) {
  const currentSession = useRef(session);
  currentSession.current = session;
  const sequence = useRef(0);
  const [items, setItems] = useState<Item[]>([]);
  const [roles, setRoles] = useState<MemberRole[]>(["application-owner"]);
  const [manage, setManage] = useState(false);
  const [method, setMethod] = useState<"email" | "link" | null>(null);
  const [email, setEmail] = useState("");
  const [locale, setLocale] = useState<"de" | "en">("de");
  const [recipient, setRecipient] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<Item | null>(null);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    const value = await call(currentSession.current, "", "GET");
    if (request === sequence.current) {
      setItems(value.invitations);
      onCountChange(value.invitations.length);
    }
  }, [onCountChange]);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    return () => {
      sequence.current++;
    };
  }, [load]);
  useEffect(() => {
    if (
      !active ||
      !items.some((item) =>
        ["pending", "sending"].includes(item.mailStatus ?? ""),
      )
    )
      return;
    const timer = setInterval(() => {
      void load().catch((e) => setError(e.message));
    }, 15000);
    return () => clearInterval(timer);
  }, [active, items, load]);
  const close = () => {
    if (busy) return;
    setLink("");
    setRecipient(null);
    setEmail("");
    setMethod(null);
    setRoles(["application-owner"]);
    setManage(false);
    setCopied(false);
    setError("");
    onCreateClose();
  };
  const copy = () =>
    void navigator.clipboard
      .writeText(link)
      .then(() => setCopied(true))
      .catch(() =>
        setError("Bitte markiere und kopiere den Link aus dem Feld."),
      );
  const linkField = (
    <div className="field">
      <label htmlFor="invitation-link">
        {t("Einladungslink – jetzt kopieren")}
      </label>
      <input id="invitation-link" readOnly value={link} />
      <button type="button" className="button secondary" onClick={copy}>
        {t("Link kopieren")}
      </button>
      {copied && <p role="status">{t("Link kopiert.")}</p>}
    </div>
  );
  return (
    <div className="invitation-management">
      <div className="people-heading">
        <h3>{t("Offene Einladungen")}</h3>
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => {
            setError("");
            void load().catch((e) => setError(e.message));
          }}
        >
          {t("Aktualisieren")}
        </button>
      </div>
      {error && !createOpen && !revoking && <p role="alert">{t(error)}</p>}
      {items.length === 0 && (
        <div className="people-empty">
          <h4>{t("Keine offenen Einladungen.")}</h4>
          <p>
            {t(
              "Lade eine Person ein, um ihr Zugriff auf diesen Arbeitsbereich zu geben.",
            )}
          </p>
        </div>
      )}
      <ul className="people-list" aria-label={t("Offene Einladungen")}>
        {items.map((item) => (
          <li key={item.id} className="people-row invitation-row">
            <div className="people-identity">
              <span className="people-avatar" aria-hidden="true">
                {item.recipientEmail?.slice(0, 1).toUpperCase() ?? "↗"}
              </span>
              <div>
                <h4>{item.recipientEmail ?? t("Einladungslink")}</h4>
                <p>
                  {t(
                    item.recipientEmail
                      ? "E-Mail-Einladung"
                      : "Noch keiner Person zugeordnet",
                  )}
                </p>
                <span className="people-badge">{t("Ausstehend")}</span>
              </div>
            </div>
            <div className="invitation-details">
              <div className="people-role-badges">
                {item.roles.map((role) => (
                  <span key={role} className="people-badge">
                    {role === "platform-engineer"
                      ? t("Platform Engineer")
                      : t("Application Owner")}
                  </span>
                ))}
                {item.manageMembers && (
                  <span className="people-badge people-badge-manager">
                    {t("Mitgliederverwaltung")}
                  </span>
                )}
              </div>
              {item.mailStatus && (
                <p>
                  {t("E-Mail-Status:")}{" "}
                  {t(
                    (
                      {
                        pending: "Versand vorgemerkt",
                        sending: "Versand läuft",
                        accepted: "An den Mailserver übergeben",
                        suppressed: "Versand unterdrückt",
                        failed: "Versand fehlgeschlagen",
                        uncertain:
                          "Versandergebnis unklar – keine automatische Wiederholung",
                      } as Record<string, string>
                    )[item.mailStatus] ??
                      "Versandergebnis unklar – keine automatische Wiederholung",
                  )}
                </p>
              )}
              <p>
                {t("Gültig bis")}{" "}
                <time dateTime={item.expiresAt}>
                  {new Date(item.expiresAt).toLocaleString(
                    currentLanguage() === "de" ? "de-DE" : "en-GB",
                  )}
                </time>
              </p>
              {item.createdAt && (
                <p className="hint">
                  {t("Erstellt am")}{" "}
                  <time dateTime={item.createdAt}>
                    {new Date(item.createdAt).toLocaleString(
                      currentLanguage() === "de" ? "de-DE" : "en-GB",
                    )}
                  </time>
                </p>
              )}
            </div>
            <div className="people-row-actions">
              <button
                type="button"
                className="button secondary people-danger"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setRevoking(item);
                }}
              >
                {t("Einladung widerrufen")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {createOpen && (
        <PeopleDialog
          title={link ? t("Einladung erstellt") : t("Person einladen")}
          busy={busy}
          onClose={close}
        >
          {error && <p role="alert">{t(error)}</p>}
          {link ? (
            <div className="people-invitation-receipt">
              {recipient ? (
                <>
                  <p role="status">
                    {t(
                      "Die Einladung an {{value0}} ist für den Versand vorgemerkt.",
                      { value0: recipient },
                    )}
                  </p>
                  <p>
                    {t(
                      "Die Person erhält einen Link, über den sie den Beitritt bestätigen kann.",
                    )}
                  </p>
                  <details>
                    <summary>{t("Link alternativ selbst weitergeben")}</summary>
                    {linkField}
                  </details>
                </>
              ) : (
                <>
                  <p>
                    {t(
                      "Kopiere den Link und teile ihn mit der gewünschten Person. Er ist sieben Tage gültig.",
                    )}
                  </p>
                  {linkField}
                </>
              )}
              <div className="people-dialog-actions">
                <button
                  type="button"
                  className="button primary"
                  onClick={close}
                >
                  {t("Fertig")}
                </button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!method || busy) return;
                const address = method === "email" ? email.trim() : null;
                setBusy(true);
                setError("");
                setCopied(false);
                void call(currentSession.current, "", "POST", {
                  roles,
                  manageMembers: manage,
                  ...(address ? { mail: { email: address, locale } } : {}),
                })
                  .then(async (value) => {
                    setLink(value.url);
                    setRecipient(value.emailQueued === true ? address : null);
                    await load();
                  })
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              <fieldset className="people-form-fields" disabled={busy}>
                <fieldset className="people-role-options">
                  <legend>{t("Wie möchtest du einladen?")}</legend>
                  <label className="people-choice">
                    <input
                      type="radio"
                      name="invitation-method"
                      value="email"
                      required
                      checked={method === "email"}
                      onChange={() => setMethod("email")}
                    />
                    <span>
                      <strong>{t("Per E-Mail einladen")}</strong>
                      <span>
                        {t(
                          "Der Einladungslink wird automatisch erstellt und per E-Mail verschickt.",
                        )}
                      </span>
                    </span>
                  </label>
                  <label className="people-choice">
                    <input
                      type="radio"
                      name="invitation-method"
                      value="link"
                      required
                      checked={method === "link"}
                      onChange={() => setMethod("link")}
                    />
                    <span>
                      <strong>{t("Link selbst teilen")}</strong>
                      <span>
                        {t(
                          "Erstelle einen Link und gib ihn selbst an die gewünschte Person weiter.",
                        )}
                      </span>
                    </span>
                  </label>
                </fieldset>
                {method === "email" && (
                  <div className="people-email-fields">
                    <div className="field">
                      <label htmlFor="invitation-email">
                        {t("E-Mail-Adresse der eingeladenen Person")}
                      </label>
                      <input
                        id="invitation-email"
                        type="email"
                        autoComplete="off"
                        maxLength={254}
                        required
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="invitation-language">
                        {t("Sprache für Nachrichten")}
                      </label>
                      <select
                        id="invitation-language"
                        value={locale}
                        onChange={(event) =>
                          setLocale(event.target.value === "en" ? "en" : "de")
                        }
                      >
                        <option value="de">Deutsch</option>
                        <option value="en">English</option>
                      </select>
                    </div>
                    <p className="hint">
                      {t(
                        "Die Person meldet sich mit dieser STACKIT-E-Mail-Adresse an und bestätigt den Beitritt.",
                      )}
                    </p>
                  </div>
                )}
                <MembershipRoles
                  roles={roles}
                  manageMembers={manage}
                  onChange={setRoles}
                  onManageChange={setManage}
                />
              </fieldset>
              <div className="people-dialog-actions">
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={close}
                >
                  {t("Abbrechen")}
                </button>
                <button
                  type="submit"
                  className="button primary"
                  disabled={busy || !method || roles.length === 0}
                >
                  {t(
                    method === "email"
                      ? "Einladung senden"
                      : method === "link"
                        ? "Einladungslink erstellen"
                        : "Einladung erstellen",
                  )}
                </button>
              </div>
            </form>
          )}
        </PeopleDialog>
      )}
      {revoking && (
        <PeopleDialog
          title={t("Einladung widerrufen")}
          busy={busy}
          onClose={() => setRevoking(null)}
        >
          <p>
            {revoking.recipientEmail
              ? t("Einladung für {{value0}} widerrufen?", {
                  value0: revoking.recipientEmail,
                })
              : t("Diesen Einladungslink widerrufen?")}
          </p>
          <p>{t("Mit dieser Einladung kann danach niemand mehr beitreten.")}</p>
          {error && <p role="alert">{t(error)}</p>}
          <div className="people-dialog-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => setRevoking(null)}
            >
              {t("Abbrechen")}
            </button>
            <button
              type="button"
              className="button primary people-destructive"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError("");
                void call(currentSession.current, `/${revoking.id}`, "DELETE")
                  .then(async () => {
                    setRevoking(null);
                    await load();
                  })
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              {t("Einladung widerrufen")}
            </button>
          </div>
        </PeopleDialog>
      )}
    </div>
  );
}
