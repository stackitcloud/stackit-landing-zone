import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { t } from "../i18n";
import type { Session } from "./Account";

const revisionSchema = z.string().regex(/^[a-f0-9]{40}$/);
const profileSchema = z.object({
  revision: revisionSchema,
  providerLockSha256: z.string().regex(/^[a-f0-9]{64}$/),
  openTofuVersion: z.string().min(1),
  contractVersion: z.literal(1),
  status: z.enum(["supported", "withdrawn"]),
  replacementRevision: revisionSchema.nullable(),
  maintenanceEnabled: z.boolean(),
});
const contextSchema = z.object({
  revision: revisionSchema,
  bindingId: z.uuid().nullable(),
  lastAppliedRevision: revisionSchema.nullable(),
  originRevision: revisionSchema,
  sourceStatus: z.enum(["supported", "withdrawn", "unavailable"]),
  replacementRevision: revisionSchema.nullable(),
  canUpgrade: z.boolean(),
  blockers: z.array(z.string()),
  profiles: z.array(profileSchema),
});
type Context = z.infer<typeof contextSchema>;
const errors: Record<string, string> = {
  application_execution_source_withdrawn:
    "Dieser Ausführungsstand wurde zurückgezogen. Prüfe den angebotenen Upgrade-Pfad für dieselbe Bestellung und denselben State.",
  application_execution_package_unavailable:
    "Das gebundene Runner-Paket ist derzeit nicht verfügbar. Die Bestellung und ihr State bleiben erhalten. Prüfe die verfügbaren Ausführungsstände oder aktualisiere den Status.",
  application_execution_upgrade_changed:
    "Der Ausführungsstand hat sich zwischenzeitlich geändert. Lade den Status erneut und prüfe die Auswahl.",
  application_execution_upgrade_unavailable:
    "Ein Upgrade ist derzeit gesperrt. Prüfe die angezeigten Hindernisse; die bestehende Bestellung bleibt erhalten.",
  application_execution_upgrade_confirmation_required:
    "Bestätige die Prüfung des neuen Plans und die Beibehaltung von Bestellung und State.",
  application_execution_binding_conflict:
    "Die Ausführungsbindung passt nicht mehr zum Prüfstand. Lade den Status erneut; Bestellung und State bleiben erhalten.",
  application_instance_running:
    "Eine Ausführung ist noch aktiv. Warte auf ihren Abschluss, bevor du den Ausführungsstand änderst.",
  application_execution_lifecycle_unavailable:
    "Der Ausführungsstatus ist derzeit nicht verfügbar. Die bestehende Bestellung und ihr State bleiben erhalten. Aktualisiere den Status später erneut.",
  application_access_denied:
    "Du hast derzeit keine Berechtigung, diese Ausführungsbindung zu ändern.",
  "execution-or-recovery-active":
    "Eine Ausführung oder die Klärung eines fehlgeschlagenen Apply ist noch offen. Schließe sie vor einem Upgrade ab.",
  "runner-ticket-active":
    "Eine Runner-Berechtigung ist noch aktiv. Warte auf ihren Ablauf, bevor du den Ausführungsstand änderst.",
  "guided-recovery-active":
    "Eine geführte State-Wiederherstellung ist noch aktiv. Schließe sie vor einem Upgrade ab.",
  "apply-grant-active":
    "Eine Apply-Freigabe ist noch aktiv. Kläre die bestehende Ausführung vor einem Upgrade.",
  "execution-claim-active":
    "Ein Runner hält noch eine Ausführungsberechtigung. Kläre die bestehende Ausführung vor einem Upgrade.",
  application_execution_changed:
    "Der Ausführungsstand hat sich zwischenzeitlich geändert. Lade den Status erneut und prüfe die Auswahl.",
  application_execution_binding_changed:
    "Die Ausführungsbindung passt nicht mehr zum Prüfstand. Lade den Status erneut; Bestellung und State bleiben erhalten.",
  application_upgrade_execution_active:
    "Ein Upgrade ist derzeit gesperrt. Prüfe die angezeigten Hindernisse; die bestehende Bestellung bleibt erhalten.",
  application_upgrade_source_unavailable:
    "Das gewünschte Runner-Paket ist nicht als Upgrade freigegeben oder derzeit nicht verfügbar. Prüfe den angebotenen Upgrade-Pfad für dieselbe Bestellung.",
  application_upgrade_access_denied:
    "Du hast derzeit keine Berechtigung, diese Ausführungsbindung zu ändern.",
  application_upgrade_confirmation_required:
    "Bestätige die Prüfung des neuen Plans und die Beibehaltung von Bestellung und State.",
};
function message(code: unknown): string {
  return (
    (typeof code === "string" ? errors[code] : undefined) ??
    "Der Ausführungsstatus ist derzeit nicht verfügbar. Die bestehende Bestellung und ihr State bleiben erhalten. Aktualisiere den Status später erneut."
  );
}
function Source({ value }: { value: string | null }) {
  return value ? (
    <abbr title={value}>{value.slice(0, 12)}</abbr>
  ) : (
    <span>{t("Noch kein erfolgreicher Apply")}</span>
  );
}

export function ApplicationExecutionLifecycle({
  session,
  instanceId,
  requestedBy,
  onUpgraded,
}: {
  session: Session;
  instanceId: string;
  requestedBy: string;
  onUpgraded: (signal: AbortSignal) => Promise<void>;
}) {
  const [context, setContext] = useState<Context | null>(null);
  const [target, setTarget] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const identity = `${session.tenant?.id}:${session.user.id}:${instanceId}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const endpoint = `/api/v1/applications/instances/${instanceId}/execution-lifecycle`;

  const install = useCallback((value: Context) => {
    setContext(value);
    const candidates = value.profiles.filter(
      (p) =>
        p.status === "supported" &&
        p.revision !== value.revision &&
        p.revision === value.replacementRevision,
    );
    setTarget(
      candidates.find((p) => p.revision === value.replacementRevision)
        ?.revision ??
        candidates[0]?.revision ??
        "",
    );
    setConfirmed(false);
  }, []);
  const read = useCallback(
    async function read(signal: AbortSignal, body?: unknown) {
      const response = await fetch(endpoint, {
        method: body === undefined ? "GET" : "POST",
        signal,
        redirect: "error",
        headers: {
          "x-lzc-tenant": session.tenant?.id ?? "",
          ...(body === undefined
            ? {}
            : {
                "content-type": "application/json",
                "x-lzc-csrf": session.csrfToken,
              }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          message(
            value && typeof value === "object" && "error" in value
              ? value.error
              : null,
          ),
        );
      return contextSchema.parse(value);
    },
    [endpoint, session.tenant?.id, session.csrfToken],
  );
  const load = useCallback(
    async function load() {
      controller.current?.abort();
      const active = new AbortController();
      controller.current = active;
      const token = ++generation.current;
      setBusy(true);
      setError("");
      setNotice("");
      try {
        const value = await read(active.signal);
        if (
          !active.signal.aborted &&
          generation.current === token &&
          currentIdentity.current === identity
        )
          install(value);
      } catch (cause) {
        if (
          !active.signal.aborted &&
          generation.current === token &&
          currentIdentity.current === identity
        ) {
          setContext(null);
          setError(
            cause instanceof Error && !(cause instanceof z.ZodError)
              ? cause.message
              : message(null),
          );
        }
      } finally {
        if (
          !active.signal.aborted &&
          generation.current === token &&
          currentIdentity.current === identity
        )
          setBusy(false);
      }
    },
    [read, identity, install],
  );
  useEffect(() => {
    setContext(null);
    setConfirmed(false);
    setTarget("");
    void load();
    return () => {
      ++generation.current;
      controller.current?.abort();
    };
    // The operation lifetime follows the authenticated order, not parent rerenders.
  }, [load]);

  async function upgrade() {
    if (
      !context ||
      !confirmed ||
      !target ||
      !context.canUpgrade ||
      requestedBy !== session.user.id ||
      busy
    )
      return;
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    const token = ++generation.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const value = await read(active.signal, {
        targetRevision: target,
        expectedRevision: context.revision,
        confirmUpgrade: true,
      });
      if (
        active.signal.aborted ||
        generation.current !== token ||
        currentIdentity.current !== identity
      )
        return;
      if (
        value.revision !== target ||
        value.originRevision !== context.originRevision
      ) {
        throw new Error(message("application_execution_upgrade_changed"));
      }
      install(value);
      setNotice(
        "Ausführungsstand aktualisiert. Bestellung und State bleiben erhalten. Starte und prüfe als Nächstes einen neuen Plan; es wurde kein Plan oder Apply ausgeführt.",
      );
      await onUpgraded(active.signal);
    } catch (cause) {
      if (
        !active.signal.aborted &&
        generation.current === token &&
        currentIdentity.current === identity
      ) {
        setConfirmed(false);
        setError(
          cause instanceof Error && !(cause instanceof z.ZodError)
            ? cause.message
            : message(null),
        );
      }
    } finally {
      if (
        !active.signal.aborted &&
        generation.current === token &&
        currentIdentity.current === identity
      )
        setBusy(false);
    }
  }
  const candidates =
    context?.profiles.filter(
      (p) =>
        p.status === "supported" &&
        p.revision !== context.revision &&
        p.revision === context.replacementRevision,
    ) ?? [];
  const selected = candidates.find((p) => p.revision === target);
  return (
    <section aria-label={t("Ausführungsstand der Bestellung")}>
      <h3>{t("Ausführungsstand der Bestellung")}</h3>
      <button
        type="button"
        className="button secondary"
        disabled={busy}
        onClick={() => void load()}
      >
        {t("Ausführungsstatus aktualisieren")}
      </button>
      {error && <p role="status">{t(error)}</p>}
      {notice && <p role="status">{t(notice)}</p>}
      {context && (
        <>
          <dl className="application-properties">
            <dt>{t("Ursprüngliche Templatequelle")}</dt>
            <dd>
              <Source value={context.originRevision} />
            </dd>
            <dt>{t("Gewünschter Ausführungsstand")}</dt>
            <dd>
              <Source value={context.revision} />
            </dd>
            <dt>{t("Zuletzt angewendete Quelle")}</dt>
            <dd>
              <Source value={context.lastAppliedRevision} />
            </dd>
            <dt>{t("Verfügbarkeit des Ausführungsstands")}</dt>
            <dd>
              {t(
                {
                  supported: "Unterstützt",
                  withdrawn: "Zurückgezogen",
                  unavailable: "Runner-Paket nicht verfügbar",
                }[context.sourceStatus],
              )}
            </dd>
            {context.replacementRevision && (
              <>
                <dt>{t("Vorgesehener Upgrade-Pfad")}</dt>
                <dd>
                  <Source value={context.replacementRevision} />
                </dd>
              </>
            )}
          </dl>
          {context.sourceStatus !== "supported" && (
            <p>
              {t(
                errors[
                  context.sourceStatus === "withdrawn"
                    ? "application_execution_source_withdrawn"
                    : "application_execution_package_unavailable"
                ] ?? "",
              )}
            </p>
          )}
          {context.blockers.length > 0 && (
            <ul aria-label={t("Hindernisse für ein Upgrade")}>
              {[...new Set(context.blockers)].map((blocker) => (
                <li key={blocker}>{t(errors[blocker] ?? blocker)}</li>
              ))}
            </ul>
          )}
          {requestedBy === session.user.id && candidates.length > 0 && (
            <fieldset disabled={busy || !context.canUpgrade}>
              <legend>{t("Ausführungsstand explizit aktualisieren")}</legend>
              <label>
                {t("Ziel-Ausführungsstand")}
                <select
                  value={target}
                  onChange={(event) => {
                    setTarget(event.target.value);
                    setConfirmed(false);
                  }}
                >
                  {candidates.map((profile) => (
                    <option key={profile.revision} value={profile.revision}>
                      {profile.revision.slice(0, 12)} · OpenTofu{" "}
                      {profile.openTofuVersion}
                    </option>
                  ))}
                </select>
              </label>
              {selected && (
                <dl className="application-properties">
                  <dt>{t("Provider-Lock SHA256")}</dt>
                  <dd>
                    <abbr title={selected.providerLockSha256}>
                      {selected.providerLockSha256.slice(0, 12)}
                    </abbr>
                  </dd>
                  <dt>{t("Vertragsversion")}</dt>
                  <dd>{selected.contractVersion}</dd>
                </dl>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                {t(
                  "Ich aktualisiere dieselbe Bestellung mit demselben State. Den neuen Plan prüfe ich einschließlich Ersetzungen und Löschungen. Jetzt wird keine Infrastruktur geändert und kein Plan oder Apply gestartet.",
                )}
              </label>
              <button
                type="button"
                className="button secondary"
                disabled={!confirmed || !selected}
                onClick={() => void upgrade()}
              >
                {t("Ausführungsbindung aktualisieren")}
              </button>
            </fieldset>
          )}
        </>
      )}
    </section>
  );
}
