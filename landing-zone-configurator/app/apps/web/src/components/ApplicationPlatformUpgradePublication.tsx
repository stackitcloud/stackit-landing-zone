import type { platformContractSchema } from "@lzc/domain";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { t } from "../i18n";
import type { Session } from "./Account";
import { useApplicationUpgradeRequest } from "./application-upgrade-request";

const edgesSchema = z.object({
  edges: z.array(
    z.object({
      id: z.uuid(),
      fromPlatformRevision: z.uuid(),
      toPlatformRevision: z.uuid(),
      policy: z.object({ sensitive: z.enum(["approval-required", "direct"]) }),
    }),
  ),
});
export function ApplicationPlatformUpgradePublication({
  session,
  contracts,
}: {
  session: Session;
  contracts: z.infer<typeof platformContractSchema>[];
}) {
  const { request, busy, error, setError } = useApplicationUpgradeRequest(
    session,
    "platform-upgrade-publication",
  );
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [direct, setDirect] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [notice, setNotice] = useState(""),
    [edges, setEdges] = useState<z.infer<typeof edgesSchema>["edges"]>([]);
  const load = useCallback(async () => {
    const result = await request("platform-upgrades");
    if (!result) return;
    const parsed = edgesSchema.safeParse(result.data);
    if (parsed.success) setEdges(parsed.data.edges);
    else
      setError(
        "Die Upgrade-Antwort konnte nicht sicher gelesen werden. Lade die Updates erneut.",
      );
  }, [request, setError]);
  useEffect(() => {
    void load();
  }, [load]);
  const previous = contracts.find((item) => item.revision === from),
    targets = contracts.filter(
      (item) =>
        previous &&
        item.revision !== from &&
        item.organization_id === previous.organization_id &&
        item.tenant_id === previous.tenant_id,
    );
  async function publish() {
    if (
      busy ||
      !confirmed ||
      !previous ||
      !targets.some((item) => item.revision === to)
    )
      return;
    const result = await request("platform-upgrades", {
      fromPlatformRevision: from,
      toPlatformRevision: to,
      policy: { sensitive: direct ? "direct" : "approval-required" },
      confirmPublication: true,
    });
    if (!result) return;
    setConfirmed(false);
    setNotice(
      "Plattform-Upgrade-Pfad veröffentlicht. Bestehende Bestellungen bleiben unverändert; es wurde kein Plan oder Apply gestartet.",
    );
    await load();
  }
  return (
    <section
      className="application-update-card"
      aria-label={t("Plattform-Upgrade-Pfade veröffentlichen")}
    >
      <h3>{t("Plattform-Upgrade-Pfade veröffentlichen")}</h3>
      <p>
        {t(
          "Wähle tatsächliche freigegebene Plattformverträge derselben Organisation. Die Veröffentlichung erlaubt nur ein späteres ausdrückliches Upgrade bestehender Bestellungen.",
        )}
      </p>
      {error && <p role="alert">{t(error)}</p>}
      {notice && <p role="status">{t(notice)}</p>}
      <fieldset className="application-update-form" disabled={busy}>
        <label>
          {t("Ausgangs-Plattformvertrag")}
          <select
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setTo("");
              setConfirmed(false);
            }}
          >
            <option value="">{t("Bitte auswählen")}</option>
            {contracts.map((item) => (
              <option key={item.revision} value={item.revision}>
                {item.revision}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Ziel-Plattformvertrag")}
          <select
            aria-label={t("Ziel-Plattformvertrag")}
            value={to}
            disabled={!previous}
            onChange={(event) => {
              setTo(event.target.value);
              setConfirmed(false);
            }}
          >
            <option value="">{t("Bitte auswählen")}</option>
            {targets.map((item) => (
              <option key={item.revision} value={item.revision}>
                {item.revision}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={direct}
            onChange={(event) => {
              setDirect(event.target.checked);
              setConfirmed(false);
            }}
          />
          {t(
            "Sensitive Plattformänderungen dieses Pfades dürfen nach einem neuen Plan die direkte Richtlinie verwenden, soweit die übrigen Freigaberegeln dies erlauben.",
          )}
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          {t(
            "Ich veröffentliche nur den Plattform-Upgrade-Pfad. Bestehende Bestellungen und States bleiben unverändert; es wird keine Infrastruktur geändert.",
          )}
        </label>
        <button
          type="button"
          className="button secondary"
          disabled={!from || !to || !confirmed}
          onClick={() => void publish()}
        >
          {t("Plattform-Upgrade-Pfad veröffentlichen")}
        </button>
      </fieldset>
      {edges.length > 0 && (
        <ul aria-label={t("Veröffentlichte Plattform-Upgrade-Pfade")}>
          {edges.map((item) => (
            <li key={item.id}>
              <abbr title={item.fromPlatformRevision}>
                {item.fromPlatformRevision.slice(0, 12)}
              </abbr>{" "}
              →{" "}
              <abbr title={item.toPlatformRevision}>
                {item.toPlatformRevision.slice(0, 12)}
              </abbr>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
