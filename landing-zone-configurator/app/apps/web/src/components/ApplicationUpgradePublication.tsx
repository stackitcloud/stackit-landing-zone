import type { PublishedProjectTemplate } from "@lzc/domain";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { t } from "../i18n";
import type { Session } from "./Account";
import { useApplicationUpgradeRequest } from "./application-upgrade-request";

const edgesSchema = z.object({
  edges: z.array(
    z.object({
      id: z.uuid(),
      fromVersionId: z.uuid(),
      toVersionId: z.uuid(),
      policy: z.object({ sensitive: z.enum(["approval-required", "direct"]) }),
    }),
  ),
});
export function ApplicationUpgradePublication({
  session,
  versions,
}: {
  session: Session;
  versions: PublishedProjectTemplate[];
}) {
  const { request, busy, error, setError } = useApplicationUpgradeRequest(
    session,
    "upgrade-publication",
  );
  const [edges, setEdges] = useState<z.infer<typeof edgesSchema>["edges"]>([]),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [direct, setDirect] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const result = await request("template-upgrades");
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
  const previous = versions.find((version) => version.id === from);
  const targets = versions.filter(
    (version) =>
      previous &&
      version.templateId === previous.templateId &&
      version.template.id === previous.template.id &&
      version.version > previous.version &&
      !version.retiredAt,
  );
  async function publish() {
    if (
      !previous ||
      !targets.some((version) => version.id === to) ||
      !confirmed ||
      busy
    )
      return;
    const result = await request("template-upgrades", {
      fromVersionId: from,
      toVersionId: to,
      policy: { sensitive: direct ? "direct" : "approval-required" },
      confirmPublication: true,
    });
    if (!result) return;
    setConfirmed(false);
    setNotice(
      "Upgrade-Pfad veröffentlicht. Bestehende Bestellungen bleiben unverändert, bis ihr Auftraggeber ausdrücklich ein Upgrade prüft und auswählt. Es wurde kein Plan oder Apply gestartet.",
    );
    await load();
  }
  function versionLabel(id: string) {
    const value = versions.find((item) => item.id === id);
    return value
      ? `${value.template.name} · ${t("Version")} ${value.version}`
      : t("Nicht mehr im sichtbaren Katalog");
  }
  return (
    <section
      className="application-update-card"
      aria-label={t("Upgrade-Pfade veröffentlichen")}
    >
      <h3>{t("Upgrade-Pfade veröffentlichen")}</h3>
      <p>
        {t(
          "Neue Template-Versionen ändern bestehende Bestellungen nicht. Veröffentliche einen geprüften Pfad innerhalb derselben Template-Familie, damit Auftraggeber ihn unter Updates auswählen können.",
        )}
      </p>
      {error && <p role="alert">{t(error)}</p>}
      {notice && <p role="status">{t(notice)}</p>}
      <p className="field-hint">
        {t(
          "Wähle als Ausgangsversion den gewünschten Template-Stand der bestehenden Bestellung. Ein Pfad von Version 3 auf 4 gilt nicht für eine Bestellung auf Version 1. Template- und Plattform-Upgrade-Pfade sind getrennte Freigaben.",
        )}
      </p>
      <fieldset className="application-update-form" disabled={busy}>
        <label>
          {t("Ausgangsversion für das Upgrade")}
          <select
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setTo("");
              setConfirmed(false);
            }}
          >
            <option value="">{t("Version wählen")}</option>
            {versions.map((version) => (
              <option value={version.id} key={version.id}>
                {version.template.name} · {t("Version")} {version.version}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Neue Version derselben Template-Familie")}
          <select
            value={to}
            disabled={!previous}
            onChange={(event) => {
              setTo(event.target.value);
              setConfirmed(false);
            }}
          >
            <option value="">{t("Version wählen")}</option>
            {targets.map((version) => (
              <option value={version.id} key={version.id}>
                {version.template.name} · {t("Version")} {version.version}
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
            "Sensitive Änderungen dieses Pfades dürfen nach einem neuen Plan direkt angewendet werden, sofern beide Versionen direkte Bereitstellung erlauben. Andernfalls bleibt eine separate Plan-Freigabe erforderlich.",
          )}
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          {t(
            "Ich veröffentliche nur den Upgrade-Pfad und seine Richtlinie. Keine bestehende Bestellung, kein State und keine Cloud-Ressource wird dadurch verändert.",
          )}
        </label>
        <button
          type="button"
          className="button secondary"
          disabled={!from || !to || !confirmed}
          onClick={() => void publish()}
        >
          {t("Upgrade-Pfad veröffentlichen")}
        </button>
      </fieldset>
      {edges.length > 0 && (
        <ul aria-label={t("Veröffentlichte Upgrade-Pfade")}>
          {edges.map((edge) => (
            <li key={edge.id}>
              <span>{versionLabel(edge.fromVersionId)}</span> →{" "}
              <span>{versionLabel(edge.toVersionId)}</span> ·{" "}
              {t(
                edge.policy.sensitive === "direct"
                  ? "Sensitive Änderungen: direkte Richtlinie"
                  : "Sensitive Änderungen: separate Plan-Freigabe",
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
