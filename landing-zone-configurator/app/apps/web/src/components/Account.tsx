import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";

export type Session = {
  user: { id?: string; login: string };
  tenant?: {
    id: string;
    name?: string;
    kind?: "personal" | "organisation";
    roles?: ("platform-engineer" | "application-owner")[];
    manageMembers?: boolean;
  };
  csrfToken: string;
  expiresAt: string;
  stackitVerified?: boolean;
  development?: boolean;
};
export function Account({
  beforeLogin,
  onSessionChange,
  onLogin,
}: {
  beforeLogin: () => boolean;
  onSessionChange: (session: Session | null) => void;
  onLogin?: () => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [primary, setPrimary] = useState<"github" | "stackit" | "development">(
    "github",
  );
  const [developmentOpen, setDevelopmentOpen] = useState(false);
  const [username, setUsername] = useState("developer");
  const [password, setPassword] = useState("");
  const developmentDialog = useRef<HTMLDialogElement>(null);
  const [returning, setReturning] = useState(
    () => window.location.hash === "#stackit-login",
  );
  const [authorization, setAuthorization] = useState<{
    verificationUri: string;
    userCode?: string;
    expiresAt: string;
    retryAfterMs: number;
  } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    onSessionChange(session);
  }, [session, onSessionChange]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const returningFromStackit = window.location.hash === "#stackit-login";
    if (returningFromStackit)
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search,
      );
    void (async () => {
      try {
        const status = await fetch("/auth/status", {
          signal: controller.signal,
        });
        if (!status.ok) throw new Error("Authentication status unavailable");
        if (!status.headers.get("content-type")?.includes("application/json")) {
          setError("Anmeldung ist hier nicht eingerichtet.");
          return;
        }
        const providers = await status.json();
        if (!providers.github && !providers.stackit && !providers.development)
          return;
        setPrimary(
          providers.primary === "development"
            ? "development"
            : providers.primary === "stackit"
              ? "stackit"
              : "github",
        );
        setEnabled(true);
        if (returningFromStackit) return;
        const response = await fetch("/api/v1/session", {
          signal: controller.signal,
        });
        if (response.ok) setSession(await response.json());
        else if (response.status !== 401)
          setError("Anmeldung derzeit nicht erreichbar.");
      } catch {
        if (!controller.signal.aborted)
          setError("Anmeldung derzeit nicht erreichbar.");
      }
    })();
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (developmentOpen) developmentDialog.current?.showModal();
  }, [developmentOpen]);
  useEffect(() => {
    if (!authorization && !returning) return;
    if (authorization) dialog.current?.showModal();
    const controller = new AbortController();
    const expiresAt =
      authorization?.expiresAt ?? new Date(Date.now() + 900000).toISOString();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (controller.signal.aborted) return;
      if (Date.parse(expiresAt) <= Date.now()) {
        setAuthorization(null);
        setReturning(false);
        setError("Die Anmeldung ist abgelaufen. Bitte erneut anmelden.");
        return;
      }
      try {
        const response = await fetch("/auth/stackit/poll", {
          method: "POST",
          signal: controller.signal,
        });
        const result = await response.json();
        const completedElsewhere =
          response.status === 409 && result.error === "stackit_flow_missing";
        if (!response.ok && !completedElsewhere) throw new Error();
        if (result.status === "waiting") {
          timer = setTimeout(
            () => void poll(),
            Math.max(1000, result.retryAfterMs ?? 5000),
          );
        } else if (result.status === "verified" || completedElsewhere) {
          const current = await fetch("/api/v1/session", {
            signal: controller.signal,
          });
          if (!current.ok) throw new Error();
          setSession(await current.json());
          setAuthorization(null);
          setReturning(false);
          onLogin?.();
        } else {
          setAuthorization(null);
          setReturning(false);
          setError(
            "STACKIT-Anmeldung nicht abgeschlossen. Bitte erneut versuchen.",
          );
        }
      } catch {
        if (!controller.signal.aborted) {
          setAuthorization(null);
          setReturning(false);
          setError("STACKIT-Anmeldung fehlgeschlagen. Bitte erneut versuchen.");
        }
      }
    }
    timer = setTimeout(() => void poll(), authorization?.retryAfterMs ?? 0);
    return () => {
      controller.abort();
      clearTimeout(timer);
      dialog.current?.close();
    };
  }, [authorization, returning, onLogin]);
  async function start() {
    if (!beforeLogin()) return;
    if (primary === "development") {
      setError("");
      setDevelopmentOpen(true);
      return;
    }
    if (primary === "github") {
      window.location.assign("/auth/github/start");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const startRequest = () =>
        fetch("/auth/stackit/start", {
          method: "POST",
          ...(session ? { headers: { "x-lzc-csrf": session.csrfToken } } : {}),
        });
      let response = await startRequest();
      if (
        response.status === 409 &&
        (await response.json()).error === "flow_already_started"
      ) {
        const cancelled = await fetch("/auth/stackit/cancel", {
          method: "POST",
        });
        if (!cancelled.ok) throw new Error();
        response = await startRequest();
      }
      if (!response.ok) throw new Error();
      const result = await response.json();
      const url = new URL(result.verificationUri);
      if (url.origin !== "https://accounts.stackit.cloud") throw new Error();
      setAuthorization(result);
    } catch {
      setError("STACKIT-Anmeldung derzeit nicht erreichbar.");
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    setBusy(true);
    try {
      const response = await fetch("/auth/stackit/cancel", { method: "POST" });
      if (!response.ok) throw new Error();
      setAuthorization(null);
    } catch {
      setError("Anmeldung konnte noch nicht abgebrochen werden.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(
      () => setSession(null),
      Math.max(0, Date.parse(session.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [session]);
  async function logout() {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/auth/logout", {
        method: "POST",
        headers: { "x-lzc-csrf": session.csrfToken },
      });
      if (!response.ok && response.status !== 401) throw new Error();
      setSession(null);
    } catch {
      setError("Abmelden fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setBusy(false);
    }
  }
  async function developmentSignIn() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/auth/development/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (response.status === 429) {
        setError(
          "Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.",
        );
        return;
      }
      if (response.status === 401) {
        setError("Benutzername oder Passwort ist falsch.");
        return;
      }
      if (!response.ok) throw new Error("Development login unavailable");
      const current = await fetch("/api/v1/session");
      if (!current.ok) throw new Error("Development session unavailable");
      setSession(await current.json());
      setDevelopmentOpen(false);
      onLogin?.();
    } catch {
      setError("Anmeldung derzeit nicht erreichbar.");
    } finally {
      setPassword("");
      setBusy(false);
    }
  }
  return (
    <div className="header-user account">
      <span>
        {session
          ? primary === "github"
            ? `@${session.user.login}`
            : session.user.login
          : t("Gast")}
      </span>
      {enabled &&
        (session ? (
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => void logout()}
          >
            {t("Abmelden")}
          </button>
        ) : (
          <button
            type="button"
            className="button secondary"
            disabled={busy || !!authorization || returning}
            onClick={() => void start()}
          >
            {primary === "stackit"
              ? t("Mit STACKIT anmelden")
              : primary === "development"
                ? t("Entwicklerlogin")
                : t("Mit GitHub anmelden")}
          </button>
        ))}
      {session &&
        primary === "stackit" &&
        session.stackitVerified === false && (
          <button
            type="button"
            className="button secondary"
            title={t(
              "Du bist im Configurator angemeldet. Für geschützte STACKIT-Aktionen ist eine aktuelle Bestätigung erforderlich.",
            )}
            disabled={busy || !!authorization}
            onClick={() => void start()}
          >
            {t("STACKIT bestätigen")}
          </button>
        )}
      {authorization && (
        <dialog
          ref={dialog}
          className="stackit-login"
          onCancel={(event) => {
            event.preventDefault();
            void cancel();
          }}
        >
          <h2>{session ? t("STACKIT bestätigen") : t("STACKIT-Anmeldung")}</h2>
          {session && (
            <p>
              {t(
                "Du bist im Configurator angemeldet. Für geschützte STACKIT-Aktionen ist eine aktuelle Bestätigung erforderlich.",
              )}
            </p>
          )}
          {authorization.userCode && (
            <output aria-label={t("Anmeldecode")}>
              {authorization.userCode}
            </output>
          )}
          <a
            className="button"
            href={authorization.verificationUri}
            target={authorization.userCode ? "_blank" : "_self"}
            rel="noopener noreferrer"
          >
            {t("Bei STACKIT bestätigen")}
          </a>
          <p role="status">{t("Bestätigung ausstehend")}</p>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => void cancel()}
          >
            {t("Abbrechen")}
          </button>
          {error && <p role="alert">{t(error)}</p>}
        </dialog>
      )}
      {developmentOpen && (
        <dialog
          ref={developmentDialog}
          className="stackit-login"
          onCancel={() => {
            setDevelopmentOpen(false);
            setPassword("");
          }}
        >
          <h2>{t("Entwicklerlogin")}</h2>
          <p>
            {t(
              "Nur Ubuntu-Entwicklung: kein verifizierter STACKIT-Benutzer. Service Account separat hinterlegen; Cloud-Ausführungen benötigen weiterhin eine ausdrückliche Freigabe.",
            )}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void developmentSignIn();
            }}
          >
            <label>
              {t("Benutzername")}
              <input
                autoComplete="username"
                value={username}
                disabled={busy}
                required
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            <label>
              {t("Passwort")}
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                disabled={busy}
                required
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button type="submit" className="button" disabled={busy}>
              {t("Anmelden")}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setDevelopmentOpen(false);
                setPassword("");
              }}
            >
              {t("Abbrechen")}
            </button>
          </form>
          {error && <p role="alert">{t(error)}</p>}
        </dialog>
      )}
      {session?.development && <span>{t("Entwicklungsmodus")}</span>}
      {error && (
        <span role="alert" className="account-error">
          {t(error)}
        </span>
      )}
    </div>
  );
}
