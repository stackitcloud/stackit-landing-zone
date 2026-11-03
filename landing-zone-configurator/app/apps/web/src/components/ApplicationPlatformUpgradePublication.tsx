import type { platformContractSchema } from "@lzc/domain";
import { useCallback, useEffect, useId, useRef, useState } from "react";
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
  onEditorOpen,
  onEditorClose,
  contracts,
}: {
  session: Session;
  onEditorOpen?: () => void;
  onEditorClose?: () => void;
  contracts: z.infer<typeof platformContractSchema>[];
}) {
  const policyGroup = useId();
  const policyForm = useRef<HTMLFieldSetElement>(null);
  const [editRequest, setEditRequest] = useState(0);
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!editRequest) return;
    if (mode === "list") heading.current?.focus();
    else policyForm.current?.focus();
  }, [editRequest, mode]);
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
  const existing = edges.find(
    (item) =>
      item.fromPlatformRevision === from && item.toPlatformRevision === to,
  );
  const samePolicy =
    existing?.policy.sensitive === (direct ? "direct" : "approval-required");
  useEffect(() => {
    if (existing) setDirect(existing.policy.sensitive === "direct");
    setConfirmed(false);
  }, [existing]);
  async function publish() {
    if (
      busy ||
      samePolicy ||
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
    setMode("list");
    onEditorClose?.();
  }
  return (
    <section
      className="application-update-card"
      aria-label={t("Plattform-Upgrade-Pfade veröffentlichen")}
    >
      <h3 ref={heading} tabIndex={-1}>
        {t(
          mode === "edit"
            ? "Freigaberichtlinie bearbeiten"
            : "Plattform-Upgrade-Pfade veröffentlichen",
        )}
      </h3>
      {mode !== "edit" && (
        <p>
          {t(
            "Wähle tatsächliche freigegebene Plattformverträge derselben Organisation. Die Veröffentlichung erlaubt nur ein späteres ausdrückliches Upgrade bestehender Bestellungen.",
          )}
        </p>
      )}
      {error && <p role="alert">{t(error)}</p>}
      {notice && <p role="status">{t(notice)}</p>}
      {mode !== "list" && (
        <>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => {
              setConfirmed(false);
              setError("");
              setMode("list");
              onEditorClose?.();
              setEditRequest((value) => value + 1);
            }}
          >
            {t("Zurück zu den Upgrade-Pfaden")}
          </button>
          <fieldset
            ref={policyForm}
            className="application-update-form"
            disabled={busy}
            tabIndex={-1}
            aria-label={t(
              mode === "edit"
                ? "Freigaberichtlinie bearbeiten"
                : "Neuen Plattform-Upgrade-Pfad veröffentlichen",
            )}
          >
            {existing && (
              <p>
                {t(
                  "Du bearbeitest einen veröffentlichten Upgrade-Pfad. Wähle die Ausführung und bestätige die Aktualisierung.",
                )}
              </p>
            )}
            <label>
              {t("Ausgangs-Plattformvertrag")}
              <select
                value={from}
                disabled={mode === "edit"}
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
                disabled={mode === "edit" || !previous}
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
            <fieldset>
              <legend>{t("Ausführung des Upgrades")}</legend>
              <label className="checkbox">
                <input
                  type="radio"
                  name={policyGroup}
                  checked={direct}
                  onChange={() => {
                    setDirect(true);
                    setConfirmed(false);
                  }}
                />
                {t("Eigenständig durchführen")}
              </label>
              <label className="checkbox">
                <input
                  type="radio"
                  name={policyGroup}
                  checked={!direct}
                  onChange={() => {
                    setDirect(false);
                    setConfirmed(false);
                  }}
                />
                {t("Separate Plan-Freigabe erforderlich")}
              </label>
              <p>
                {t(
                  "Eigenständig: Der Application Owner prüft einen frischen Plan und bestätigt Apply selbst. Unerlaubte Löschungen und Ersetzungen bleiben gesperrt.",
                )}
              </p>
            </fieldset>
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
              disabled={!from || !to || !confirmed || samePolicy}
              onClick={() => void publish()}
            >
              {t(
                existing
                  ? "Richtlinie aktualisieren"
                  : "Plattform-Upgrade-Pfad veröffentlichen",
              )}
            </button>
          </fieldset>
        </>
      )}
      {mode === "list" && (
        <>
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
                  {" · "}
                  {t(
                    item.policy.sensitive === "direct"
                      ? "Eigenständig durchführen"
                      : "Separate Plan-Freigabe erforderlich",
                  )}
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => {
                      onEditorOpen?.();
                      setMode("edit");
                      setEditRequest((value) => value + 1);
                      setFrom(item.fromPlatformRevision);
                      setTo(item.toPlatformRevision);
                      setDirect(item.policy.sensitive === "direct");
                      setConfirmed(false);
                    }}
                  >
                    {t("Freigaberichtlinie bearbeiten")}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => {
              setFrom("");
              setTo("");
              setDirect(false);
              setConfirmed(false);
              setError("");
              setNotice("");
              onEditorOpen?.();
              setMode("create");
              setEditRequest((value) => value + 1);
            }}
          >
            {t("Neuen Plattform-Upgrade-Pfad veröffentlichen")}
          </button>
        </>
      )}
    </section>
  );
}
