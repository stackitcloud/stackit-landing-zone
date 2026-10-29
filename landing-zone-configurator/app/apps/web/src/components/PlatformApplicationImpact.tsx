import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { t } from "../i18n";
import type { Session } from "./Account";
import { useApplicationUpgradeRequest } from "./application-upgrade-request";

const schema = z.object({
  planId: z.uuid(),
  artifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
  dependencyHash: z.string().regex(/^[a-f0-9]{64}$/),
  classification: z.enum(["ordinary", "sensitive", "blocked"]),
  affectedApplications: z.array(
    z.object({
      instanceId: z.uuid(),
      name: z.string(),
      targetKey: z.string().nullable(),
    }),
  ),
  blockers: z.array(z.string()),
  acknowledged: z.boolean(),
  canAcknowledge: z.boolean(),
});
const messages: Record<string, string> = {
  "platform-plan-invalid-or-incomplete":
    "Der Plattformplan ist unvollständig. Ein neuer vollständiger Plan ist erforderlich.",
  "platform-plan-incomplete":
    "Der Plattformplan ist unvollständig. Ein neuer vollständiger Plan ist erforderlich.",
  "platform-plan-unknown-resource":
    "Die Auswirkungen einer Ressource sind unbekannt. Apply bleibt bis zur Klärung gesperrt.",
  "platform-plan-unknown-action":
    "Die Auswirkungen einer Aktion sind unbekannt. Apply bleibt bis zur Klärung gesperrt.",
  "platform-shared-replacement":
    "Der Plan ersetzt gemeinsam genutzte Plattformressourcen. Diese Sperre kann nicht durch Bestätigung aufgehoben werden.",
  "platform-shared-deletion":
    "Der Plan löscht gemeinsam genutzte Plattformressourcen. Diese Sperre kann nicht durch Bestätigung aufgehoben werden.",
  "platform-shared-resource-change":
    "Der Plan verändert gemeinsam genutzte Plattformressourcen. Prüfe die betroffenen Application Landing Zones.",
};
export function PlatformApplicationImpact({
  session,
  planId,
  artifactSha256,
  onBlocked,
  onAcknowledged,
}: {
  session: Session;
  planId: string;
  artifactSha256: string;
  onBlocked: (blocked: boolean) => void;
  onAcknowledged: (signal: AbortSignal) => Promise<void>;
}) {
  const { request, busy, error, setError } = useApplicationUpgradeRequest(
    session,
    `impact:${planId}:${artifactSha256}`,
    "plans",
  );
  const [value, setValue] = useState<z.infer<typeof schema> | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const matches =
    value?.planId === planId && value.artifactSha256 === artifactSha256;
  const hardBlocked =
    !matches || value.classification === "blocked" || value.blockers.length > 0;
  const blocked =
    Boolean(error) ||
    hardBlocked ||
    (value?.classification === "sensitive" && !value.acknowledged);
  useEffect(() => {
    onBlocked(blocked);
  }, [blocked, onBlocked]);
  const load = useCallback(async () => {
    setValue(null);
    setConfirmed(false);
    onBlocked(true);
    const result = await request(`${planId}/application-impact`);
    if (!result) return;
    const parsed = schema.safeParse(result.data);
    if (
      parsed.success &&
      parsed.data.planId === planId &&
      parsed.data.artifactSha256 === artifactSha256
    )
      setValue(parsed.data);
    else
      setError(
        "Die Plattformauswirkungen konnten nicht sicher geprüft werden. Apply bleibt gesperrt.",
      );
  }, [request, planId, artifactSha256, setError, onBlocked]);
  useEffect(() => {
    void load();
  }, [load]);
  async function acknowledge() {
    if (
      busy ||
      !confirmed ||
      hardBlocked ||
      !value?.canAcknowledge ||
      value.classification !== "sensitive"
    )
      return;
    const result = await request(`${planId}/application-impact`, {
      artifactSha256,
      dependencyHash: value.dependencyHash,
      confirmImpact: true,
    });
    if (!result) return;
    setConfirmed(false);
    await onAcknowledged(result.signal);
    if (!result.signal.aborted) await load();
  }
  return (
    <section aria-label={t("Auswirkungen auf Application Landing Zones")}>
      <h5>{t("Auswirkungen auf Application Landing Zones")}</h5>
      <p>
        {t(
          "Die Prüfung und Bestätigung gelten nur für diesen gespeicherten Plattformplan und den aktuellen Abhängigkeitsstand. Hier wird kein Apply gestartet.",
        )}
      </p>
      {error && <p role="alert">{t(error)}</p>}
      {!value && !error && (
        <p role="status">
          {t(
            "Plattformauswirkungen werden geprüft. Apply bleibt bis zum Ergebnis gesperrt.",
          )}
        </p>
      )}
      {value && (
        <>
          <p role="status">
            {t(
              value.classification === "blocked"
                ? "Plattformauswirkungen blockiert"
                : value.classification === "sensitive"
                  ? "Plattformänderung mit prüfpflichtigen Auswirkungen"
                  : "Keine prüfpflichtigen Plattformauswirkungen",
            )}
          </p>
          <ul>
            {value.affectedApplications.map((app) => (
              <li key={app.instanceId}>
                {app.name} — {app.targetKey ?? t("Nicht gebunden")}
              </li>
            ))}
          </ul>
          {value.blockers.map((code) => (
            <p role="alert" key={code}>
              {t(
                messages[code] ??
                  "Die Plattformauswirkungen sind nicht abschließend geklärt. Apply bleibt gesperrt.",
              )}
            </p>
          ))}
          {value.acknowledged && !hardBlocked && (
            <p role="status">
              {t("Die Auswirkungen dieses Plattformplans wurden bestätigt.")}
            </p>
          )}
          {value.classification === "sensitive" &&
            !hardBlocked &&
            !value.acknowledged &&
            value.canAcknowledge && (
              <fieldset disabled={busy}>
                <label>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  {t(
                    "Ich habe die Auswirkungen dieses konkreten Plattformplans auf die aufgeführten Application Landing Zones geprüft. Diese Bestätigung startet keinen Apply.",
                  )}
                </label>
                <button
                  type="button"
                  className="button secondary"
                  disabled={!confirmed}
                  onClick={() => void acknowledge()}
                >
                  {t("Plattformauswirkungen bestätigen")}
                </button>
              </fieldset>
            )}
          {hardBlocked && (
            <p role="alert">
              {t(
                "Unbekannte Auswirkungen, Löschungen und Ersetzungen bleiben gesperrt. Eine Checkbox hebt diese Sperre nicht auf.",
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}
