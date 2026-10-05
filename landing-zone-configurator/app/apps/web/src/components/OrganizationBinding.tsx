import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { t } from "../i18n";
import type { Session } from "./Account";

const statusSchema = z.object({
  bindingEnabled: z.boolean().default(false),
  organizationAdminVerified: z.boolean().default(false),
});
const authorizationSchema = z.object({
  verificationUri: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.origin === "https://accounts.stackit.cloud" &&
      !url.username &&
      !url.password
    );
  }),
  userCode: z.string().min(1).max(128),
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
  }),
]);

export function OrganizationBinding({
  session,
  tenantId,
  onBound,
}: {
  session: Session;
  tenantId: string;
  onBound: () => Promise<unknown>;
}) {
  const [status, setStatus] = useState<z.infer<typeof statusSchema> | null>(
    null,
  );
  const [authorization, setAuthorization] = useState<z.infer<
    typeof authorizationSchema
  > | null>(null);
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
      if (!response.ok) throw new Error("binding_request_failed");
      return response.json() as Promise<unknown>;
    },
    [session.csrfToken, tenantId],
  );

  useEffect(() => {
    const scope = new AbortController();
    controller.current = scope;
    void request("")
      .then((data) => {
        if (!scope.signal.aborted) setStatus(statusSchema.parse(data));
      })
      .catch(() => {
        if (!scope.signal.aborted)
          setError("Der Organisationsnachweis konnte nicht geprüft werden.");
      });
    return () => scope.abort();
  }, [request]);

  useEffect(() => {
    if (!authorization) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        if (Date.now() >= Date.parse(authorization.expiresAt))
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
        if (flow.status !== "verified") throw new Error("proof_failed");
        const next = statusSchema.parse(await request(""));
        if (!active) return;
        setStatus(next);
        setAuthorization(null);
        if (!next.organizationAdminVerified)
          setError(
            "Vollständige Organisations-Owner-Rechte sind nicht nachgewiesen.",
          );
      } catch {
        if (active && !controller.current?.signal.aborted) {
          setAuthorization(null);
          setError("Der Organisationsnachweis konnte nicht geprüft werden.");
        }
      }
    };
    timer = setTimeout(() => void poll(), authorization.retryAfterMs);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [authorization, request]);

  async function start() {
    setBusy(true);
    setError("");
    setConfirmed(false);
    if (status) setStatus({ ...status, organizationAdminVerified: false });
    try {
      const next = authorizationSchema.parse(await request("/start", {}));
      if (!controller.current?.signal.aborted) setAuthorization(next);
    } catch {
      if (!controller.current?.signal.aborted)
        setError("Der Organisationsnachweis konnte nicht geprüft werden.");
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
    } catch {
      if (!controller.current?.signal.aborted)
        setError("Der Organisationsnachweis konnte nicht geprüft werden.");
    } finally {
      if (!controller.current?.signal.aborted) setBusy(false);
    }
  }

  async function bind() {
    if (
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
        boundAt: z.iso.datetime(),
      }).parse(
        await request("/bind-organization", {
          confirmOrganizationBinding: true,
        }),
      );
      if (!controller.current?.signal.aborted) await onBound();
    } catch {
      if (!controller.current?.signal.aborted) {
        setConfirmed(false);
        setStatus({ bindingEnabled: true, organizationAdminVerified: false });
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
          <button
            className="button"
            type="button"
            disabled={busy || authorization !== null}
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
              {" · "}
              <code>{authorization.userCode}</code>{" "}
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
