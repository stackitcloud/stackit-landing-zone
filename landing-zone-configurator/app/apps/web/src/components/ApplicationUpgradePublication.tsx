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
    [notice, setNotice] = useState(""),
    [loaded, setLoaded] = useState(false),
    [listFailed, setListFailed] = useState(false);
  const load = useCallback(async () => {
    const result = await request("template-upgrades");
    if (!result) {
      setListFailed(true);
      return;
    }
    setListFailed(false);
    const parsed = edgesSchema.safeParse(result.data);
    if (parsed.success) {
      setEdges(parsed.data.edges);
      setLoaded(true);
    } else {
      setListFailed(true);
      setError(
        "Die Upgrade-Antwort konnte nicht sicher gelesen werden. Lade die Updates erneut.",
      );
    }
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
  const selectedTarget = targets.find((version) => version.id === to);
  const directAllowed =
    previous?.deploymentPolicy === "direct" &&
    selectedTarget?.deploymentPolicy === "direct";
  const existing = edges.find(
    (edge) => edge.fromVersionId === from && edge.toVersionId === to,
  );
  async function publish() {
    if (
      !previous ||
      !targets.some((version) => version.id === to) ||
      !confirmed ||
      existing ||
      (direct && !directAllowed) ||
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
      <section aria-label={t("Veröffentlichte Upgrade-Pfade")}>
        <h4>
          {t("Gespeicherte Upgrade-Pfade")}
          {loaded ? ` (${edges.length})` : ""}
        </h4>
        <p>
          {t(
            "Diese Liste zeigt die gespeicherten Freigaben aller Template-Familien im Arbeitsbereich. Die Auswahl im Formular veröffentlicht noch keinen Pfad.",
          )}
        </p>
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => void load()}
        >
          {t("Upgrade-Pfade aktualisieren")}
        </button>
        {loaded && edges.length === 0 && (
          <p>{t("Noch keine Upgrade-Pfade veröffentlicht.")}</p>
        )}
        {!loaded && (
          <p>
            {t("Die gespeicherten Upgrade-Pfade wurden noch nicht geladen.")}
          </p>
        )}
        {listFailed && loaded && (
          <p>
            {t(
              "Die Liste konnte nicht aktualisiert werden. Angezeigt wird der zuletzt geladene Stand.",
            )}
          </p>
        )}
        <ul className="application-upgrade-paths">
          {edges.map((edge) => (
            <li className="application-upgrade-path" key={edge.id}>
              <h4>
                {versions.find((version) => version.id === edge.fromVersionId)
                  ?.template.name ?? t("Nicht mehr im sichtbaren Katalog")}
              </h4>
              <dl className="application-upgrade-path-summary">
                <div>
                  <dt>{t("Ausgangsversion")}</dt>
                  <dd>{versionLabel(edge.fromVersionId)}</dd>
                </div>
                <div>
                  <dt>{t("Zielversion")}</dt>
                  <dd>{versionLabel(edge.toVersionId)}</dd>
                </div>
                <div>
                  <dt>{t("Sensitive Änderungen")}</dt>
                  <dd>
                    {t(
                      edge.policy.sensitive === "direct"
                        ? "Direkt, sofern beide Versionen es erlauben"
                        : "Separate Plan-Freigabe erforderlich",
                    )}
                  </dd>
                </div>
              </dl>
              <p>
                {t(
                  "Veröffentlicht · Für Bestellungen auf genau dieser Ausgangsversion",
                )}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <h4>{t("Neuen Upgrade-Pfad veröffentlichen")}</h4>
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
              setDirect(false);
              setConfirmed(false);
              setNotice("");
              setError("");
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
              setDirect(false);
              setConfirmed(false);
              setNotice("");
              setError("");
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
        {previous && selectedTarget && (
          <p className="field-hint">
            {t(
              directAllowed
                ? "Beide Versionen erlauben direkte Bereitstellung. Für sensitive Änderungen kannst du dennoch eine separate Plan-Freigabe verlangen."
                : "Mindestens eine Version verlangt eine separate Plan-Freigabe. Dieser Pfad kann diese Richtlinie nicht aufheben.",
            )}
          </p>
        )}
        {existing && (
          <p role="status">
            {t(
              "Dieser Upgrade-Pfad ist bereits veröffentlicht. Du findest ihn oben in den gespeicherten Pfaden.",
            )}
          </p>
        )}
        <label className="checkbox">
          <input
            type="checkbox"
            checked={direct}
            disabled={!directAllowed || Boolean(existing)}
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
          disabled={
            !from ||
            !to ||
            !confirmed ||
            Boolean(existing) ||
            (direct && !directAllowed)
          }
          onClick={() => void publish()}
        >
          {t("Upgrade-Pfad veröffentlichen")}
        </button>
      </fieldset>
    </section>
  );
}
