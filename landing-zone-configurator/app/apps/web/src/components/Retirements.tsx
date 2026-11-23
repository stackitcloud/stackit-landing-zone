import {
  type Retirement,
  retirementCandidateSchema,
  retirementSchema,
} from "@lzc/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { currentLanguage, t } from "../i18n";
import type { Session } from "./Account";
import { RetirementExecutionPanel } from "./RetirementExecution";

const phases: Record<Retirement["phase"], string> = {
  RETIRING: "Rückbau angekündigt",
  DRAINING: "Laufende Ausführungen klären",
  PREPARED: "Rückbau vorbereitet",
  TEARING_DOWN: "Ressourcen werden entfernt",
  WAITING_FOR_PURGE: "STACKIT-Projektlöschung abwarten",
  FINALIZING: "Leere Ordner entfernen",
  COMPLETE: "Stillgelegt",
  PAUSED: "Rückbau pausiert",
  NEEDS_ATTENTION: "Prüfung erforderlich",
  CANCELLED: "Rückbau abgebrochen",
};
const messages: Record<string, string> = {
  retirement_changed:
    "Der Rückbaustand hat sich geändert. Aktualisiere den Status und prüfe die Auswahl erneut.",
  retirement_access_denied:
    "Für diese Aktion fehlen die aktuelle Plattformberechtigung oder der Organisationsnachweis.",
  retirement_transition_unavailable:
    "Diese Aktion ist im aktuellen Rückbaustand nicht verfügbar. Prüfe laufende Ausführungen und Wiederherstellungsschritte.",
  "retirement-platform-writer-unresolved":
    "Eine Plattformausführung oder Wiederherstellung ist noch ungeklärt.",
  "retirement-application-writer-unresolved":
    "Eine Application-Ausführung oder Wiederherstellung ist noch ungeklärt.",
  "retirement-preparation-window":
    "Das angekündigte Vorbereitungsfenster läuft noch.",
};
export function RetirementPanel({
  session,
  manage = false,
  standalone = false,
}: {
  session: Session;
  manage?: boolean;
  standalone?: boolean;
}) {
  const [rows, setRows] = useState<Retirement[]>([]);
  const [candidates, setCandidates] = useState<
    z.infer<typeof retirementCandidateSchema>[]
  >([]);
  const [available, setAvailable] = useState(false),
    [disabled, setDisabled] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [selected, setSelected] = useState(""),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const [date, setDate] = useState(() =>
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
  );
  const tenantId = session.tenant?.id ?? "";
  const identity = `${session.user.id ?? session.user.login}:${session.tenant?.id ?? ""}`;
  const current = useRef(identity);
  current.current = identity;
  const call = useCallback(
    async (path: string, body?: unknown, signal?: AbortSignal) => {
      const response = await fetch(`/api/v1/retirements${path}`, {
        method: body === undefined ? "GET" : "POST",
        ...(signal ? { signal } : {}),
        credentials: "same-origin",
        headers:
          body === undefined
            ? { "x-lzc-tenant": tenantId }
            : {
                "content-type": "application/json",
                "x-lzc-csrf": session.csrfToken,
                "x-lzc-tenant": tenantId,
              },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.error ?? "retirement_unavailable");
      }
      return response.json();
    },
    [session.csrfToken, tenantId],
  );
  useEffect(() => {
    const abort = new AbortController();
    const requestedIdentity = identity;
    setRows([]);
    setCandidates([]);
    setAvailable(false);
    setDisabled(false);
    setPending(false);
    setError("");
    setSelected("");
    setReason("");
    setConfirmed(false);
    void (async () => {
      try {
        const response = await fetch("/api/v1/retirements", {
          signal: abort.signal,
          credentials: "same-origin",
          headers: { "x-lzc-tenant": tenantId },
        });
        if (response.status === 404) {
          if (!abort.signal.aborted) setDisabled(true);
          return;
        }
        if (!response.ok) throw Error("retirement_unavailable");
        const result = z.array(retirementSchema).parse(await response.json());
        if (abort.signal.aborted || current.current !== requestedIdentity)
          return;
        setRows(result);
        setAvailable(true);
        if (manage) {
          const choices = z
            .array(retirementCandidateSchema)
            .parse(await call("/candidates", undefined, abort.signal));
          if (!abort.signal.aborted) setCandidates(choices);
        }
      } catch {
        if (!abort.signal.aborted)
          setError(
            "Der Rückbaustatus konnte nicht geladen werden. Prüfe Anmeldung und Arbeitsbereich.",
          );
      }
    })();
    return () => abort.abort();
  }, [identity, manage, call, tenantId]);
  async function mutate(path: string, body: unknown) {
    if (pending) return;
    const owner = identity;
    setPending(true);
    setError("");
    try {
      await call(path, body);
      const result = z.array(retirementSchema).parse(await call(""));
      const choices = manage
        ? z.array(retirementCandidateSchema).parse(await call("/candidates"))
        : [];
      if (current.current !== owner) return;
      setRows(result);
      setCandidates(choices);
      setConfirmed(false);
    } catch (cause) {
      if (current.current === owner)
        setError(
          messages[cause instanceof Error ? cause.message : ""] ??
            "Der Rückbau wurde nicht geändert. Aktualisiere den Status und prüfe deine Berechtigung.",
        );
    } finally {
      if (current.current === owner) setPending(false);
    }
  }
  if (standalone && disabled)
    return (
      <p role="status">
        {t("Der Rückbau ist auf dieser Instanz nicht aktiviert.")}
      </p>
    );
  if ((!available && !error) || (!manage && rows.length === 0 && !error))
    return null;
  return (
    <section
      aria-label={t(
        manage ? "Landing Zones stilllegen" : "Angekündigter Rückbau",
      )}
      className="retirement-panel"
    >
      <h2>
        {t(manage ? "Landing Zones stilllegen" : "Angekündigter Rückbau")}
      </h2>
      {error && <p role="alert">{t(error)}</p>}
      {available && manage && candidates.length === 0 && rows.length === 0 && (
        <p role="status">
          {t("Noch keine angewendete Plattform für den Rückbau verfügbar.")}
        </p>
      )}
      {manage && candidates.length > 0 && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!confirmed || !selected || !reason.trim()) return;
            void mutate("", {
              stateKey: selected,
              reason: reason.trim(),
              notBefore: new Date(`${date}Z`).toISOString(),
              confirmRetirement: true,
            });
          }}
        >
          <p>
            {t(
              "Mit dem Rückbaustart werden neue Bestellungen und Erweiterungen gesperrt. Betroffene Besteller werden vorab informiert und können ihre Daten sichern oder selbst bereinigen.",
            )}
          </p>
          <label>
            {t("Plattform auswählen")}
            <select
              value={selected}
              onChange={(event) => {
                setSelected(event.target.value);
                setConfirmed(false);
              }}
              required
            >
              <option value="">{t("Bitte auswählen")}</option>
              {candidates.map((item) => (
                <option key={item.stateKey} value={item.stateKey}>
                  {item.name} · {item.applicationCount} {t("Applications")}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Grund für den Rückbau")}
            <textarea
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setConfirmed(false);
              }}
              maxLength={1000}
              required
            />
          </label>
          <label>
            {t("Löschung frühestens ab (UTC)")}
            <input
              type="datetime-local"
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setConfirmed(false);
              }}
              required
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            {t(
              "Ich bestätige die Stilllegung der ausgewählten Plattform und die Information der betroffenen Besteller.",
            )}
          </label>
          <button
            type="submit"
            className="button"
            disabled={pending || !confirmed || !selected || !reason.trim()}
          >
            {t("Rückbau ankündigen und Neuanlagen sperren")}
          </button>
        </form>
      )}
      {rows.map((row) => (
        <article key={row.id}>
          <h3>{row.name}</h3>
          <p role="status">{t(phases[row.phase])}</p>
          <p>{row.reason}</p>
          <p>
            {t("Löschung frühestens ab:")}{" "}
            {new Date(row.notBefore).toLocaleString(currentLanguage())}
          </p>
          <ul>
            {row.applications.map((item) => (
              <li key={item.id}>{item.name}</li>
            ))}
          </ul>
          {row.blockers.length > 0 && (
            <ul>
              {row.blockers.map((code) => (
                <li key={code}>
                  {t(
                    messages[code] ??
                      "Eine Rückbauvoraussetzung ist noch offen.",
                  )}
                </li>
              ))}
            </ul>
          )}
          {manage && (
            <RetirementExecutionPanel
              key={`${identity}:${row.id}`}
              session={session}
              retirement={row}
              onChanged={async () => {
                const owner = identity;
                const result = z.array(retirementSchema).parse(await call(""));
                if (current.current === owner) setRows(result);
              }}
            />
          )}
          {manage && !["COMPLETE", "CANCELLED"].includes(row.phase) && (
            <div className="actions">
              <button
                type="button"
                className="button secondary"
                disabled={pending}
                onClick={() =>
                  void mutate(`/${row.id}`, {
                    generation: row.generation,
                    action: "inspect",
                  })
                }
              >
                {t("Status prüfen")}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={pending}
                onClick={() =>
                  void mutate(`/${row.id}`, {
                    generation: row.generation,
                    action: row.phase === "PAUSED" ? "resume" : "pause",
                  })
                }
              >
                {t(
                  row.phase === "PAUSED"
                    ? "Rückbau fortsetzen"
                    : "Rückbau pausieren",
                )}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={pending || row.canCancel !== true}
                onClick={() => {
                  if (
                    window.confirm(
                      `${row.name}\n` +
                        t(
                          "Rückbau abbrechen und Neuanlagen nach Prüfung wieder zulassen? Bereits gelöschte Ressourcen werden nicht wiederhergestellt.",
                        ),
                    )
                  )
                    void mutate(`/${row.id}`, {
                      generation: row.generation,
                      action: "cancel",
                    });
                }}
              >
                {t("Rückbau abbrechen")}
              </button>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
