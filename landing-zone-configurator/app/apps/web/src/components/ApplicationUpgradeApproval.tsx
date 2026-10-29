import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { t } from "../i18n";
import type { Session } from "./Account";
import { upgradeReasonMessages } from "./application-upgrade-messages";
import { useApplicationUpgradeRequest } from "./application-upgrade-request";

const schema = z.object({
  upgradeId: z.uuid().nullable(),
  candidateHash: z.string().nullable(),
  artifactSha256: z.string().nullable(),
  requiresApproval: z.boolean(),
  approved: z.boolean(),
  canApprove: z.boolean(),
  blocked: z.boolean(),
  blockers: z.array(z.string()),
});
export function ApplicationUpgradeApproval({
  session,
  planId,
  artifactSha256,
  onApproved,
}: {
  session: Session;
  planId: string;
  artifactSha256: string;
  onApproved: (signal: AbortSignal) => Promise<void>;
}) {
  const { request, busy, error, setError } = useApplicationUpgradeRequest(
    session,
    `upgrade-plan:${planId}:${artifactSha256}`,
  );
  const [value, setValue] = useState<z.infer<typeof schema> | null>(null),
    [confirmed, setConfirmed] = useState(false);
  const load = useCallback(async () => {
    const result = await request(`jobs/${planId}/upgrade-approval`);
    if (!result) return;
    const parsed = schema.safeParse(result.data);
    if (parsed.success) {
      setValue(parsed.data);
      setConfirmed(false);
    } else
      setError(
        "Die Upgrade-Antwort konnte nicht sicher gelesen werden. Lade die Updates erneut.",
      );
  }, [request, planId, setError]);
  useEffect(() => {
    void load();
  }, [load]);
  async function approve() {
    if (
      !value?.canApprove ||
      value.blocked ||
      !confirmed ||
      value.artifactSha256 !== artifactSha256
    )
      return;
    const result = await request(`jobs/${planId}/upgrade-approval`, {
      artifactSha256,
      confirmApproval: true,
    });
    if (!result) return;
    setConfirmed(false);
    await onApproved(result.signal);
    if (!result.signal.aborted) await load();
  }
  if (!value?.requiresApproval && !error) return null;
  return (
    <section aria-label={t("Upgrade-Plan separat freigeben")}>
      <h4>{t("Upgrade-Plan separat freigeben")}</h4>
      {error && <p role="alert">{t(error)}</p>}
      <p>
        {t(
          "Diese Freigabe gilt nur für den angezeigten gespeicherten Plan und seine Upgrade-Bindung. Ein späterer oder geänderter Plan benötigt eine neue Prüfung; hier wird kein Apply gestartet.",
        )}
      </p>
      {value?.approved ? (
        <p role="status">
          {t("Dieser Upgrade-Plan wurde bereits separat freigegeben.")}
        </p>
      ) : (
        <>
          {value?.blockers.map((blocker) => (
            <p role="status" key={blocker}>
              {t(
                upgradeReasonMessages[blocker] ??
                  "Dieses Upgrade ist blockiert. Eine Bestätigung kann die Sicherheitsgrenzen nicht aufheben.",
              )}
            </p>
          ))}
          {value?.canApprove && (
            <fieldset
              disabled={
                busy || value.blocked || value.artifactSha256 !== artifactSha256
              }
            >
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                {t(
                  "Ich habe die tatsächlichen Änderungen dieses gespeicherten Plans geprüft und gebe nur diesen Upgrade-Plan frei. Der normale Apply-Schritt bleibt separat.",
                )}
              </label>
              <button
                type="button"
                className="button secondary"
                disabled={!confirmed}
                onClick={() => void approve()}
              >
                {t("Diesen Upgrade-Plan freigeben")}
              </button>
            </fieldset>
          )}
        </>
      )}
    </section>
  );
}
