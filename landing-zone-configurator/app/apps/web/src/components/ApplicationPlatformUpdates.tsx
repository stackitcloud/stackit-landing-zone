import { platformContractSchema } from "@lzc/domain";
import { useState } from "react";
import { z } from "zod";
import { t } from "../i18n";
import type { Session } from "./Account";
import { upgradeReasonMessages } from "./application-upgrade-messages";
import { useApplicationUpgradeRequest } from "./application-upgrade-request";
import {
  assessmentSchema,
  type contextSchema,
} from "./application-upgrade-schemas";

const previewSchema = z.object({
  assessment: assessmentSchema,
  target: platformContractSchema,
  parameters: z.record(z.string(), z.json()),
});
export function ApplicationPlatformUpdates({
  session,
  instanceId,
  requestedBy,
  context,
  onChanged,
}: {
  session: Session;
  instanceId: string;
  requestedBy: string;
  context: z.infer<typeof contextSchema>;
  onChanged: (signal: AbortSignal) => Promise<void>;
}) {
  const { request, cancel, busy, error, setError } =
    useApplicationUpgradeRequest(session, `platform-upgrade:${instanceId}`);
  const [edgeId, setEdgeId] = useState(""),
    [preview, setPreview] = useState<z.infer<typeof previewSchema> | null>(
      null,
    ),
    [confirmed, setConfirmed] = useState(false),
    [notice, setNotice] = useState("");
  const edge = context.platformCandidates.find((item) => item.id === edgeId);
  async function inspect() {
    if (!edge || busy || context.effectivePlatformRevision === null) return;
    setPreview(null);
    setConfirmed(false);
    const result = await request(
      `instances/${instanceId}/platform-upgrades/preview`,
      {
        edgeId,
        expectedBindingId: context.bindingId,
        expectedVersionId: context.effectiveVersionId,
      },
    );
    if (!result) return;
    const parsed = previewSchema.safeParse(result.data);
    if (
      !parsed.success ||
      parsed.data.target.revision !== edge.toPlatformRevision
    ) {
      setError(
        "Die Upgrade-Antwort konnte nicht sicher gelesen werden. Lade die Updates erneut.",
      );
      return;
    }
    setPreview(parsed.data);
  }
  async function confirm() {
    if (
      !edge ||
      !preview ||
      !confirmed ||
      busy ||
      context.blockers.length ||
      preview.assessment.classification === "blocked" ||
      requestedBy !== session.user.id
    )
      return;
    const result = await request(`instances/${instanceId}/platform-upgrades`, {
      edgeId,
      expectedBindingId: context.bindingId,
      expectedVersionId: context.effectiveVersionId,
      confirmUpgrade: true,
    });
    if (!result) return;
    setPreview(null);
    setConfirmed(false);
    setEdgeId("");
    setNotice(
      "Der gewünschte Plattformstand ist gespeichert. Erstelle und prüfe separat einen neuen Plan. Es wurde kein Plan oder Apply gestartet.",
    );
    await onChanged(result.signal);
  }
  if (context.effectivePlatformRevision === null)
    return (
      <section
        aria-label={t("Plattformvertrag derselben Bestellung aktualisieren")}
      >
        <h4>{t("Plattformvertrag derselben Bestellung aktualisieren")}</h4>
        <p role="status">
          {t(
            "Diese ältere Bestellung ist an keinen Plattformvertrag gebunden. Upgrade-Aktionen bleiben gesperrt. Bestellung, State und bisherige Ausführungsnachweise bleiben erhalten; prüfe die Plattformanbindung mit dem Platform Owner.",
          )}
        </p>
      </section>
    );
  return (
    <section
      aria-label={t("Plattformvertrag derselben Bestellung aktualisieren")}
    >
      <h4>{t("Plattformvertrag derselben Bestellung aktualisieren")}</h4>
      <p>
        {t(
          "Ein Plattform-Upgrade behält die Template-Version, Bestellung und den State. Nur ein ausdrücklich veröffentlichter Plattformpfad kann ausgewählt werden.",
        )}
      </p>
      {error && <p role="alert">{t(error)}</p>}
      {notice && <p role="status">{t(notice)}</p>}
      {!context.platformCandidates.length && (
        <p>
          {t(
            "Für diese Bestellung ist noch kein Plattform-Upgrade freigegeben.",
          )}
        </p>
      )}
      {requestedBy === session.user.id &&
        context.platformCandidates.length > 0 && (
          <>
            <label>
              {t("Freigegebener Ziel-Plattformvertrag")}
              <select
                value={edgeId}
                disabled={busy}
                onChange={(event) => {
                  cancel();
                  setEdgeId(event.target.value);
                  setPreview(null);
                  setConfirmed(false);
                  setNotice("");
                }}
              >
                <option value="">{t("Upgrade wählen")}</option>
                {context.platformCandidates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.toPlatformRevision}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="button secondary"
              disabled={busy || !edge || context.blockers.length > 0}
              onClick={() => void inspect()}
            >
              {t("Plattform-Upgrade prüfen")}
            </button>
            {preview && (
              <section aria-label={t("Plattform-Upgrade-Vergleich")}>
                <p>
                  {t(
                    preview.assessment.classification === "blocked"
                      ? "Upgrade blockiert"
                      : preview.assessment.classification === "sensitive"
                        ? "Sensitives Upgrade"
                        : "Reguläres Upgrade",
                  )}
                </p>
                <dl>
                  <dt>{t("Bisheriger Plattformvertrag")}</dt>
                  <dd>
                    <abbr title={context.effectivePlatformRevision}>
                      {context.effectivePlatformRevision.slice(0, 12)}
                    </abbr>
                  </dd>
                  <dt>{t("Ziel-Plattformvertrag")}</dt>
                  <dd>
                    <abbr title={preview.target.revision}>
                      {preview.target.revision.slice(0, 12)}
                    </abbr>
                  </dd>
                </dl>
                <p>
                  {t(
                    preview.assessment.approvalPolicy === "approval-required"
                      ? "Der neue gespeicherte Plan benötigt eine separate Platform-Owner-Freigabe."
                      : "Nach der Planprüfung gilt die direkte Apply-Richtlinie.",
                  )}
                </p>
                <ul>
                  {preview.assessment.reasons.map((item) => (
                    <li key={`${item.code}:${item.path}`}>
                      {item.path}:{" "}
                      {t(
                        upgradeReasonMessages[item.code] ??
                          "Diese Änderung muss geprüft werden.",
                      )}
                    </li>
                  ))}
                </ul>
                <p>
                  {t(
                    "Löschungen, Ersetzungen und unzulässige Zielwechsel bleiben gesperrt. Eine Bestätigung hebt diese Sperren nicht auf.",
                  )}
                </p>
                <label>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={
                      busy ||
                      preview.assessment.classification === "blocked" ||
                      context.blockers.length > 0
                    }
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  {t(
                    "Ich übernehme nur den gewünschten Plattformvertrag derselben Bestellung. Ein neuer Plan und die normale Apply-Freigabe bleiben separat.",
                  )}
                </label>
                <button
                  type="button"
                  className="button secondary"
                  disabled={
                    busy ||
                    !confirmed ||
                    preview.assessment.classification === "blocked" ||
                    context.blockers.length > 0
                  }
                  onClick={() => void confirm()}
                >
                  {t("Gewünschten Plattformstand übernehmen")}
                </button>
              </section>
            )}
          </>
        )}
    </section>
  );
}
