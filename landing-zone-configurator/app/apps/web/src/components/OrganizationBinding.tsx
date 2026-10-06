import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { t } from "../i18n";
import type { Session } from "./Account";

const statusSchema = z.object({
  bindingEnabled: z.boolean().default(false),
  organizationAdminVerified: z.boolean().default(false),
  verified: z.boolean().default(false),
  identity: z.object({ email: z.email() }).nullable().default(null),
});
const proofErrors: Record<string, string> = {
  organization_access_denied:
    "Der angemeldete STACKIT-Benutzer hat keinen Zugriff auf diese Organisation.",
  organization_permissions_denied:
    "Die STACKIT-Berechtigungen dieses Benutzers konnten nicht gelesen werden.",
  organization_permissions_response_invalid_response:
    "STACKIT hat eine unerwartete Berechtigungsantwort geliefert. Die Organisationsbindung bleibt gesperrt.",
  organization_roles_response_invalid_response:
    "STACKIT hat eine unerwartete Rollenantwort geliefert. Die Organisationsbindung bleibt gesperrt.",
  identity_binding_conflict:
    "Der bestätigte STACKIT-Account gehört nicht zum angemeldeten Configurator-Benutzer. Bitte mit demselben Account bestätigen.",
  identity_already_bound:
    "Dieser STACKIT-Account gehört bereits zu einem anderen Configurator-Benutzer.",
  authentication_required: "Bitte erneut anmelden.",
  stale_tenant_context:
    "Der Arbeitsbereich wurde geändert. Lade die Seite neu und prüfe den Nachweis erneut.",
  invalid_request_origin_or_csrf:
    "Die Sitzung wurde geändert. Lade die Seite neu und prüfe den Nachweis erneut.",
  stackit_flow_missing:
    "Der STACKIT-Nachweis ist abgelaufen. Bitte erneut prüfen.",
  proof_expired: "Der STACKIT-Nachweis ist abgelaufen. Bitte erneut prüfen.",
  expired: "Der STACKIT-Nachweis ist abgelaufen. Bitte erneut prüfen.",
  access_denied:
    "Die STACKIT-Bestätigung wurde abgelehnt. Bitte erneut prüfen.",
  organization_admin_proof_required:
    "Vollständige Organisations-Owner-Rechte sind nicht nachgewiesen.",
};
function proofError(code: string) {
  return Object.hasOwn(proofErrors, code)
    ? (proofErrors[code] ??
        "Der Organisationsnachweis konnte nicht geprüft werden.")
    : "Der Organisationsnachweis konnte nicht geprüft werden.";
}
const authorizationSchema = z.object({
  verificationUri: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.origin === "https://accounts.stackit.cloud" &&
      !url.username &&
      !url.password
    );
  }),
  userCode: z.string().min(1).max(128).optional(),
  expiresAt: z.iso.datetime(),
  retryAfterMs: z.number().int().min(1000).max(60000),
});
const flowSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("waiting"),
    retryAfterMs: z.number().int().min(0).max(60000),
  }),
  z.object({
    status: z.enum(["verified", "failed", "expired", "cancelled", "idle"]),
    code: z.string().max(160).optional(),
  }),
]);

export function OrganizationBinding({
  session,
  tenantId,
  organizationVerified,
  onBound,
}: {
  session: Session;
  tenantId: string;
  organizationVerified: boolean;
  onBound: () => Promise<unknown>;
}) {
  const [status, setStatus] = useState<z.infer<typeof statusSchema> | null>(
    null,
  );
  const [authorization, setAuthorization] = useState<z.infer<
    typeof authorizationSchema
  > | null>(null);
  const [returning, setReturning] = useState(
    () => window.location.hash === "#stackit-proof",
  );
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);

  const request = useCallback(
    async (path: string, body?: unknown) => {
      const signal = controller.current?.signal;
      if (!signal || signal.aborted) throw new Error("inactive_binding_scope");
      const response = await fetch(`/api/v1/stackit/identity${path}`, {
        method: body === undefined ? "GET" : "POST",
        signal,
        headers: {
          "content-type": "application/json",
          "x-lzc-csrf": session.csrfToken,
          "x-lzc-tenant": tenantId,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        const result = z
          .object({ error: z.string().max(160) })
          .safeParse(await response.json().catch(() => null));
        throw new Error(
          result.success ? result.data.error : "binding_request_failed",
        );
      }
      return response.json() as Promise<unknown>;
    },
    [session.csrfToken, tenantId],
  );

  useEffect(() => {
    const scope = new AbortController();
    controller.current = scope;
    if (window.location.hash === "#stackit-proof")
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search,
      );
    setStatus(null);
    setAuthorization(null);
    setConfirmed(false);
    setError("");
    void request("")
      .then((data) => {
        if (!scope.signal.aborted) setStatus(statusSchema.parse(data));
      })
      .catch((cause: unknown) => {
        if (!scope.signal.aborted)
          setError(proofError(cause instanceof Error ? cause.message : ""));
      });
    return () => scope.abort();
  }, [request]);

  useEffect(() => {
    if (!authorization && !returning) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        if (authorization && Date.now() >= Date.parse(authorization.expiresAt))
          throw new Error("proof_expired");
        const flow = flowSchema.parse(await request("/poll", {}));
        if (!active) return;
        if (flow.status === "waiting") {
          timer = setTimeout(
            () => void poll(),
            Math.max(1000, flow.retryAfterMs),
          );
          return;
        }
        if (flow.status !== "verified")
          throw new Error(flow.code ?? flow.status);
        const next = statusSchema.parse(await request(""));
        if (!active) return;
        setStatus(next);
        setAuthorization(null);
        setReturning(false);
        if (!next.organizationAdminVerified)
          setError(
            "Vollständige Organisations-Owner-Rechte sind nicht nachgewiesen.",
          );
      } catch (cause) {
        if (active && !controller.current?.signal.aborted) {
          setAuthorization(null);
          setReturning(false);
          setError(proofError(cause instanceof Error ? cause.message : ""));
        }
      }
    };
    timer = setTimeout(() => void poll(), authorization?.retryAfterMs ?? 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [authorization, returning, request]);

  async function start() {
    setBusy(true);
    setError("");
    setConfirmed(false);
    if (status) setStatus({ ...status, organizationAdminVerified: false });
    try {
      const next = authorizationSchema.parse(await request("/start", {}));
      if (!controller.current?.signal.aborted) setAuthorization(next);
    } catch (cause) {
      if (!controller.current?.signal.aborted)
        setError(proofError(cause instanceof Error ? cause.message : ""));
    } finally {
      if (!controller.current?.signal.aborted) setBusy(false);
    }
  }

  async function cancel() {
    setAuthorization(null);
    setConfirmed(false);
    setBusy(true);
    try {
      await request("/cancel", {});
    } catch (cause) {
      if (!controller.current?.signal.aborted)
        setError(proofError(cause instanceof Error ? cause.message : ""));
    } finally {
      if (!controller.current?.signal.aborted) setBusy(false);
    }
  }

  async function bind() {
    if (
      organizationVerified ||
      !confirmed ||
      !status?.organizationAdminVerified ||
      busy ||
      authorization
    )
      return;
    setBusy(true);
    setError("");
    try {
      z.object({
        tenantId: z.literal(tenantId),
        organizationId: z.uuid(),
        authorizationId: z.uuid(),
        boundBy: z.uuid(),
        boundAt: z.iso.datetime({ offset: true }),
      }).parse(
        await request("/bind-organization", {
          confirmOrganizationBinding: true,
        }),
      );
      if (!controller.current?.signal.aborted) await onBound();
    } catch {
      if (!controller.current?.signal.aborted) {
        setConfirmed(false);
        setStatus((previous) =>
          previous ? { ...previous, organizationAdminVerified: false } : null,
        );
        setError(
          "Die Organisationsbindung wurde nicht bestätigt. Bitte den Nachweis erneut prüfen.",
        );
      }
    } finally {
      if (!controller.current?.signal.aborted) setBusy(false);
    }
  }

  if (!status?.bindingEnabled && !error) return null;
  return (
    <>
      {error && <p role="alert">{t(error)}</p>}
      {status?.bindingEnabled && (
        <>
          <h3>{t("STACKIT-Organisationsnachweis")}</h3>
          <dl className="application-properties">
            <dt>{t("Configurator-Benutzer")}</dt>
            <dd style={{ overflowWrap: "anywhere" }}>{session.user.login}</dd>
            <dt>{t("STACKIT-E-Mail")}</dt>
            <dd style={{ overflowWrap: "anywhere" }}>
              {status.identity?.email ?? t("Noch kein STACKIT-Nachweis")}
            </dd>
            {status.identity && !status.verified && (
              <dd>{t("STACKIT-Nachweis abgelaufen")}</dd>
            )}
          </dl>
          <button
            className="button"
            type="button"
            disabled={busy || authorization !== null || returning}
            onClick={() => void start()}
          >
            {t("Nachweis prüfen")}
          </button>
          {authorization && (
            <p role="status">
              <a
                href={authorization.verificationUri}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("STACKIT öffnen")}
              </a>
              {authorization.userCode && (
                <>
                  {" "}
                  {" · "}
                  <code>{authorization.userCode}</code>
                </>
              )}{" "}
              <button
                className="button"
                type="button"
                disabled={busy}
                onClick={() => void cancel()}
              >
                {t("Abbrechen")}
              </button>
            </p>
          )}
          {status.organizationAdminVerified && !authorization && (
            <>
              <p>{t("Organisations-Owner-Rechte geprüft")}</p>
            </>
          )}
          {!organizationVerified &&
            status.organizationAdminVerified &&
            !authorization && (
              <>
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={busy}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  {t("Organisationsbindung bestätigen")}
                </label>
                <button
                  className="button primary"
                  type="button"
                  disabled={busy || !confirmed}
                  onClick={() => void bind()}
                >
                  {t("Organisation verbinden")}
                </button>
              </>
            )}
        </>
      )}
    </>
  );
}
