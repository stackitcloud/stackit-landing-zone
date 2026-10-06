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
  const [primary, setPrimary] = useState<"github" | "stackit">("github");
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
        if (!providers.github && !providers.stackit) return;
        setPrimary(providers.primary === "stackit" ? "stackit" : "github");
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
    if (primary === "github") {
      window.location.assign("/auth/github/start");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/auth/stackit/start", {
        method: "POST",
        ...(session ? { headers: { "x-lzc-csrf": session.csrfToken } } : {}),
      });
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
              : t("Mit GitHub anmelden")}
          </button>
        ))}
      {session &&
        primary === "stackit" &&
        session.stackitVerified === false && (
          <button
            type="button"
            className="button secondary"
            disabled={busy || !!authorization}
            onClick={() => void start()}
          >
            {t("Mit STACKIT anmelden")}
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
          <h2>{t("STACKIT-Anmeldung")}</h2>
          {authorization.userCode && (
            <output aria-label={t("Anmeldecode")}>
              {authorization.userCode}
            </output>
          )}
          <a
            className="button"
            href={authorization.verificationUri}
            target="_blank"
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
      {error && (
        <span role="alert" className="account-error">
          {t(error)}
        </span>
      )}
    </div>
  );
}
