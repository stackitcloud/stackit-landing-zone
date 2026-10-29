import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { Session } from "./Account";

const failures: Record<string, string> = {
  application_upgrade_changed:
    "Der Upgrade-Prüfstand hat sich geändert. Lade die Updates erneut und prüfe den Vergleich.",
  application_upgrade_binding_changed:
    "Die gewünschte Version hat sich geändert. Lade die Updates erneut; Bestellung und State bleiben erhalten.",
  application_upgrade_unavailable:
    "Dieses Upgrade ist derzeit gesperrt. Prüfe die angezeigten Hindernisse; Bestellung und State bleiben erhalten.",
  application_upgrade_blocked:
    "Dieses Upgrade ist blockiert. Eine Bestätigung kann die Sicherheitsgrenzen nicht aufheben.",
  application_instance_running:
    "Eine Ausführung oder Recovery ist noch offen. Schließe sie ab, bevor du ein Upgrade auswählst.",
  application_access_denied:
    "Du hast derzeit keine Berechtigung für diese Upgrade-Aktion.",
};
for (const code of ["application_upgrade_target_blocked"])
  failures[code] = failures.application_upgrade_blocked ?? "";
for (const code of ["application_upgrade_execution_active"])
  failures[code] = failures.application_instance_running ?? "";
for (const code of ["application_upgrade_access_denied"])
  failures[code] = failures.application_access_denied ?? "";
for (const code of [
  "application_upgrade_edge_unavailable",
  "application_upgrade_target_unavailable",
  "application_upgrade_approval_invalid",
])
  failures[code] = failures.application_upgrade_unavailable ?? "";
const unavailable =
  "Die Upgrade-Prüfung ist derzeit nicht verfügbar. Bestellung, gewünschter Stand und State bleiben erhalten.";
export function useApplicationUpgradeRequest(
  session: Session,
  key: string,
  namespace: "applications" | "plans" = "applications",
) {
  const scope = `${session.tenant?.id}:${session.user.id}:${namespace}:${key}`;
  const identity = useRef(scope);
  identity.current = scope;
  const sequence = useRef(0),
    controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const cancel = useCallback(() => {
    ++sequence.current;
    controller.current?.abort();
    setBusy(false);
  }, []);
  useEffect(() => {
    identity.current = scope;
    return () => {
      ++sequence.current;
      controller.current?.abort();
    };
  }, [scope]);
  const request = useCallback(
    async (path: string, body?: unknown) => {
      if (identity.current !== scope) return null;
      controller.current?.abort();
      const active = new AbortController();
      controller.current = active;
      const token = ++sequence.current;
      setBusy(true);
      setError("");
      try {
        const response = await fetch(`/api/v1/${namespace}/${path}`, {
          method: body === undefined ? "GET" : "POST",
          redirect: "error",
          signal: active.signal,
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
        const data: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const code = z.object({ error: z.string() }).safeParse(data);
          throw new Error(
            code.success
              ? (failures[code.data.error] ?? unavailable)
              : unavailable,
          );
        }
        if (
          active.signal.aborted ||
          token !== sequence.current ||
          identity.current !== scope
        )
          return null;
        return { data, signal: active.signal };
      } catch (cause) {
        if (
          !active.signal.aborted &&
          token === sequence.current &&
          identity.current === scope
        )
          setError(cause instanceof Error ? cause.message : unavailable);
        return null;
      } finally {
        if (
          !active.signal.aborted &&
          token === sequence.current &&
          identity.current === scope
        )
          setBusy(false);
      }
    },
    [scope, session.csrfToken, session.tenant?.id, namespace],
  );
  return { request, cancel, busy, error, setError };
}
