import { useEffect, useState } from "react";

type Session = {
  user: { login: string };
  csrfToken: string;
  expiresAt: string;
};
export function Account({ beforeLogin }: { beforeLogin: () => boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const status = await fetch("/auth/status", {
          signal: controller.signal,
        });
        if (!status.ok || !(await status.json()).github) return;
        setEnabled(true);
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
      <span>{session ? `@${session.user.login}` : "Gast"}</span>
      {enabled &&
        (session ? (
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => void logout()}
          >
            Abmelden
          </button>
        ) : (
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              if (beforeLogin()) window.location.assign("/auth/github/start");
            }}
          >
            Mit GitHub anmelden
          </button>
        ))}
      {error && (
        <span role="alert" className="account-error">
          {error}
        </span>
      )}
    </div>
  );
}
