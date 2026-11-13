import {
  type Notification,
  type NotificationPreferences,
  notificationCopy,
  notificationPath,
  notificationPreferencesSchema,
  notificationSchema,
  notificationTopics,
} from "@lzc/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { t } from "../i18n";
import type { Session } from "./Account";

const inbox = z.strictObject({
  unread: z.number().int().nonnegative(),
  items: z.array(notificationSchema),
});
const preferenceResponse = notificationPreferencesSchema.extend({
  hasVerifiedEmail: z.boolean(),
  mailEnabled: z.boolean(),
});
const labels: Record<(typeof notificationTopics)[number], string> = {
  approvals: "Bestellungen und Freigaben",
  "execution-success": "Erfolgreiche Ausführungen",
  "execution-failure": "Fehlgeschlagene Ausführungen",
  recovery: "Wiederherstellung und erforderliche Aktionen",
  access: "Mitgliedschaften und Zugriffe",
  reminders: "Erinnerungen an offene Aufgaben",
};
async function call(
  session: Session,
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
) {
  const r = await fetch(`/api/v1/notifications/${path}`, {
    method,
    ...(signal ? { signal } : {}),
    headers: {
      "content-type": "application/json",
      "x-lzc-csrf": session.csrfToken,
      "x-lzc-tenant": session.tenant?.id ?? "",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!r.ok)
    throw Error(
      "Benachrichtigungen konnten nicht geladen oder gespeichert werden. Bitte prüfe die Anmeldung und den aktiven Arbeitsbereich.",
    );
  return r.status === 204 ? null : r.json();
}
export function NotificationIndicator({
  session,
  onOpen,
}: {
  session: Session | null;
  onOpen: () => void;
}) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(0);
    if (!session || session.workspaceRequired) return;
    const controller = new AbortController();
    let loading = false;
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const data = inbox.parse(
          await call(session, "inbox", "GET", undefined, controller.signal),
        );
        if (!controller.signal.aborted) setCount(data.unread);
      } catch {
      } finally {
        loading = false;
      }
    };
    void load();
    const timer = setInterval(() => void load(), 30000);
    window.addEventListener("lzc-notifications-read", load);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("lzc-notifications-read", load);
    };
  }, [session]);
  if (!session || session.workspaceRequired) return null;
  return (
    <button
      type="button"
      className="notification-indicator"
      onClick={onOpen}
      aria-label={`${t("Benachrichtigungen")}: ${count} ${t("ungelesen")}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9 21h6" />
      </svg>{" "}
      <span className="notification-label">{t("Benachrichtigungen")}</span>
      {count > 0 && (
        <span className="notification-count">{count > 99 ? "99+" : count}</span>
      )}
    </button>
  );
}
export function Notifications({ session }: { session: Session | null }) {
  const [data, setData] = useState<z.infer<typeof inbox> | null>(null);
  const [preferences, setPreferences] = useState<z.infer<
    typeof preferenceResponse
  > | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const liveSession = useRef(session);
  liveSession.current = session;
  const load = useCallback(async (signal?: AbortSignal) => {
    const session = liveSession.current;
    if (!session || session.workspaceRequired) return;
    const [items, prefs] = await Promise.all([
      call(session, "inbox", "GET", undefined, signal),
      call(session, "preferences", "GET", undefined, signal),
    ]);
    if (!signal?.aborted) {
      setData(inbox.parse(items));
      setHasOlder(inbox.parse(items).items.length === 50);
      setPreferences(preferenceResponse.parse(prefs));
    }
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset for identity or CSRF changes while preserving edits across ordinary session heartbeats.
  useEffect(() => {
    setData(null);
    setPreferences(null);
    setError("");
    setNotice("");
    const controller = new AbortController();
    void load(controller.signal).catch((e) => {
      if (!controller.signal.aborted) setError(e.message);
    });
    return () => controller.abort();
  }, [load, session?.user.id, session?.tenant?.id, session?.csrfToken]);
  if (!session)
    return (
      <section className="panel">
        <h2>{t("Benachrichtigungen")}</h2>
        <p>{t("Bitte melde dich an, um deine Benachrichtigungen zu sehen.")}</p>
      </section>
    );
  const read = async (id: string | null) => {
    setBusy(true);
    setError("");
    try {
      await call(session, "read", "POST", { id });
      setData(inbox.parse(await call(session, "inbox")));
      window.dispatchEvent(new Event("lzc-notifications-read"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = async (p: NotificationPreferences) => {
    setBusy(true);
    setNotice("");
    setError("");
    try {
      setPreferences(
        preferenceResponse.parse(
          await call(session, "preferences", "PATCH", p),
        ),
      );
      setNotice("Deine Benachrichtigungseinstellungen wurden gespeichert.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="notification-layout">
      <section className="panel">
        <h2>{t("Benachrichtigungen")}</h2>
        <p>
          {t(
            "Öffne eine Benachrichtigung, um Details zu sehen oder eine offene Aufgabe zu bearbeiten.",
          )}
        </p>
        {error && <p role="alert">{t(error)}</p>}
        {notice && <p role="status">{t(notice)}</p>}
        <div className="actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy || !data?.unread}
            onClick={() => void read(null)}
          >
            {t("Alle als gelesen markieren")}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() =>
              void call(session, "inbox")
                .then((v) => setData(inbox.parse(v)))
                .catch((e) => setError(e.message))
            }
          >
            {t("Aktualisieren")}
          </button>
        </div>
        {data && !data.items.length && (
          <p>{t("Du hast noch keine Benachrichtigungen.")}</p>
        )}
        <ul className="notification-list">
          {data?.items.map((item) => (
            <NotificationCard
              key={item.id}
              item={item}
              tenantId={session.tenant?.id ?? ""}
              locale={preferences?.locale ?? "de"}
              busy={busy}
              onRead={() => void read(item.id)}
            />
          ))}
        </ul>
        {data && hasOlder && (
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => {
              const before = data.items.at(-1)?.createdAt;
              if (!before) return;
              setBusy(true);
              void call(session, `inbox?before=${encodeURIComponent(before)}`)
                .then((v) => {
                  const older = inbox.parse(v);
                  setHasOlder(older.items.length === 50);
                  setData({
                    ...older,
                    items: [
                      ...data.items,
                      ...older.items.filter(
                        (i) => !data.items.some((n) => n.id === i.id),
                      ),
                    ],
                  });
                })
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            {t("Ältere Nachrichten laden")}
          </button>
        )}
        <p className="hint">
          {t("Hier findest du deine Benachrichtigungen der letzten 90 Tage.")}
        </p>
      </section>
      <section className="panel">
        <h2>{t("E-Mail-Benachrichtigungen")}</h2>
        {preferences && (
          <>
            <p>
              {t("Wähle die Themen, zu denen du E-Mails erhalten möchtest.")}
            </p>
            {!preferences.mailEnabled && (
              <p role="status">
                {t("E-Mail-Benachrichtigungen sind derzeit nicht verfügbar.")}
              </p>
            )}
            {!preferences.hasVerifiedEmail && (
              <p role="status">
                {t(
                  "Für E-Mails fehlt eine verifizierte STACKIT-E-Mail-Adresse. Melde dich über STACKIT an.",
                )}
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save({
                  locale: preferences.locale,
                  emailTopics: preferences.emailTopics,
                });
              }}
            >
              <label>
                {t("Sprache für Nachrichten")}
                <select
                  value={preferences.locale}
                  disabled={busy}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      locale: e.target.value === "en" ? "en" : "de",
                    })
                  }
                >
                  <option value="de">Deutsch</option>
                  <option value="en">English</option>
                </select>
              </label>
              <fieldset disabled={busy}>
                <legend>{t("E-Mails zu diesen Themen erhalten")}</legend>
                {notificationTopics.map((topic) => (
                  <label key={topic}>
                    <input
                      type="checkbox"
                      checked={preferences.emailTopics.includes(topic)}
                      onChange={(e) =>
                        setPreferences({
                          ...preferences,
                          emailTopics: e.target.checked
                            ? [...preferences.emailTopics, topic]
                            : preferences.emailTopics.filter(
                                (v) => v !== topic,
                              ),
                        })
                      }
                    />
                    {t(labels[topic])}
                  </label>
                ))}
              </fieldset>
              <button type="submit" className="button primary" disabled={busy}>
                {t("Einstellungen speichern")}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
function NotificationCard({
  item,
  tenantId,
  locale,
  busy,
  onRead,
}: {
  item: Notification;
  tenantId: string;
  locale: "de" | "en";
  busy: boolean;
  onRead: () => void;
}) {
  const copy = notificationCopy(item.kind, locale);
  return (
    <li
      className={item.readAt ? "notification-card" : "notification-card unread"}
    >
      <article>
        <h3>
          {copy.title}
          {!item.readAt && (
            <span className="notification-unread">{t("Neu")}</span>
          )}
        </h3>
        <p>{copy.description}</p>
        <p>
          <time dateTime={item.createdAt}>
            {new Date(item.createdAt).toLocaleString(locale)}
          </time>
          {item.operation &&
            ` · ${item.operation === "apply" ? "Apply" : "Plan"}`}
        </p>
        <a href={notificationPath(item, tenantId)} className="button secondary">
          {t("Vorgang öffnen")}
        </a>
        {!item.readAt && (
          <button
            type="button"
            className="button tertiary"
            disabled={busy}
            onClick={onRead}
          >
            {t("Als gelesen markieren")}
          </button>
        )}
        {["failed", "uncertain"].includes(item.emailStatus) && (
          <p className="hint">
            {t(
              "Die E-Mail konnte nicht bestätigt werden. Der Vorgang in der Anwendung ist davon unabhängig.",
            )}
          </p>
        )}
      </article>
    </li>
  );
}

export function NotificationWorkspace({
  session,
}: {
  session: Session | null;
}) {
  const target = new URLSearchParams(window.location.search).get("tenant");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (
    !session ||
    !target ||
    target === session.tenant?.id ||
    !z.uuid().safeParse(target).success
  )
    return null;
  return (
    <section className="panel" role="status">
      <h2>{t("Arbeitsbereich der Nachricht öffnen")}</h2>
      <p>
        {t(
          "Diese Nachricht gehört zu einem anderen Arbeitsbereich. Wechsle nach Prüfung deiner Mitgliedschaft, um den Vorgang zu sehen.",
        )}
      </p>
      {error && <p role="alert">{t(error)}</p>}
      <button
        type="button"
        className="button primary"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError("");
          void fetch("/api/v1/organisation/switch", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-lzc-csrf": session.csrfToken,
            },
            body: JSON.stringify({ tenantId: target }),
          })
            .then((r) => {
              if (!r.ok)
                throw Error(
                  "Der Arbeitsbereich ist für deine aktuelle Mitgliedschaft nicht verfügbar.",
                );
              window.location.reload();
            })
            .catch((e) => {
              setError(e.message);
              setBusy(false);
            });
        }}
      >
        {t("Arbeitsbereich wechseln")}
      </button>
    </section>
  );
}
