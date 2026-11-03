import { templateParameterFields } from "@lzc/domain";
import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { t } from "../i18n";
import type { Session } from "./Account";
import { ApplicationPlatformUpdates } from "./ApplicationPlatformUpdates";
import { ApplicationUpgradeProgress } from "./ApplicationUpgradeProgress";
import {
  upgradeReasonMessages as reasons,
  upgradeChangeLabel,
  visibleUpgradeReasons,
} from "./application-upgrade-messages";
import { useApplicationUpgradeRequest } from "./application-upgrade-request";
import {
  type Context,
  contextSchema,
  type Preview,
  type parametersSchema,
  previewSchema,
} from "./application-upgrade-schemas";

function Id({
  value,
  emptyLabel = "Noch kein erfolgreicher Apply",
}: {
  value: string | null;
  emptyLabel?: string;
}) {
  return value ? (
    <abbr title={value}>{value.slice(0, 12)}</abbr>
  ) : (
    <span>{t(emptyLabel)}</span>
  );
}
export function ApplicationOrderUpdates({
  session,
  instanceId,
  requestedBy,
  onChanged,
  onPlan,
  onWithdrawn,
}: {
  session: Session;
  instanceId: string;
  requestedBy: string;
  onChanged: (signal: AbortSignal) => Promise<void>;
  onPlan: () => void;
  onWithdrawn?: () => void;
}) {
  const { request, cancel, busy, error, setError } =
    useApplicationUpgradeRequest(session, instanceId);
  const [context, setContext] = useState<Context | null>(null),
    [edgeId, setEdgeId] = useState(""),
    [parameters, setParameters] = useState<z.infer<typeof parametersSchema>>(
      {},
    ),
    [preview, setPreview] = useState<Preview | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [notice, setNotice] = useState(""),
    [withdrawAction, setWithdrawAction] = useState<"change" | "discard" | null>(
      null,
    ),
    [confirmWithdrawal, setConfirmWithdrawal] = useState(false);
  const comparisonHeading = useRef<HTMLHeadingElement>(null);
  const savedNotice = useRef<HTMLParagraphElement>(null);
  const errorNotice = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!error) return;
    errorNotice.current?.focus();
    errorNotice.current?.scrollIntoView({ block: "center" });
  }, [error]);
  useEffect(() => {
    if (preview) comparisonHeading.current?.focus();
  }, [preview]);
  useEffect(() => {
    if (notice) savedNotice.current?.focus();
  }, [notice]);
  const read = useCallback(async () => {
    setWithdrawAction(null);
    setConfirmWithdrawal(false);
    setPreview(null);
    setConfirmed(false);
    const result = await request(`instances/${instanceId}/upgrades`);
    if (!result) return;
    const parsed = contextSchema.safeParse(result.data);
    if (!parsed.success) {
      setError(
        "Die Upgrade-Antwort konnte nicht sicher gelesen werden. Lade die Updates erneut.",
      );
      return;
    }
    setContext(parsed.data);
    setEdgeId("");
    setPreview(null);
    setConfirmed(false);
  }, [request, instanceId, setError]);
  useEffect(() => {
    void read();
  }, [read]);
  const edge = context?.candidates.find((e) => e.id === edgeId);
  const pendingUpgrade = Boolean(
    context?.candidate &&
      context.candidate.kind !== "withdrawal" &&
      (context.candidate.versionId !== context.lastAppliedVersionId ||
        context.candidate.platformRevision !==
          context.lastAppliedPlatformRevision),
  );
  const reviewed = Boolean(
    preview && preview.assessment.classification !== "blocked",
  );
  function revise() {
    cancel();
    setPreview(null);
    setConfirmed(false);
    setNotice("");
    setError("");
  }
  function change(path: string, value: z.infer<ReturnType<typeof z.json>>) {
    cancel();
    setParameters((previous) => ({ ...previous, [path]: value }));
    setPreview(null);
    setConfirmed(false);
    setNotice("");
  }
  async function inspect() {
    if (!edge || !context || busy) return;
    setPreview(null);
    setConfirmed(false);
    const result = await request(`instances/${instanceId}/upgrades/preview`, {
      edgeId,
      expectedBindingId: context.bindingId,
      expectedVersionId: context.effectiveVersionId,
      parameters,
    });
    if (!result) return;
    const parsed = previewSchema.safeParse(result.data);
    if (!parsed.success || parsed.data.target.id !== edge.toVersionId) {
      setError(
        "Die Upgrade-Antwort konnte nicht sicher gelesen werden. Lade die Updates erneut.",
      );
      return;
    }
    setPreview(parsed.data);
    setParameters(parsed.data.parameters);
  }
  async function confirm() {
    if (
      !context ||
      !edge ||
      !preview ||
      !confirmed ||
      busy ||
      context.blockers.length ||
      preview.assessment.classification === "blocked" ||
      requestedBy !== session.user.id
    )
      return;
    const result = await request(`instances/${instanceId}/upgrades`, {
      edgeId,
      expectedBindingId: context.bindingId,
      expectedVersionId: context.effectiveVersionId,
      parameters: preview.parameters,
      confirmUpgrade: true,
    });
    setConfirmed(false);
    if (!result) return;
    const parsed = contextSchema.safeParse(result.data);
    if (!parsed.success) {
      setError(
        "Die Upgrade-Antwort konnte nicht sicher gelesen werden. Lade die Updates erneut.",
      );
      return;
    }
    setContext(parsed.data);
    setEdgeId("");
    setPreview(null);
    setNotice(
      "Der gewünschte Upgrade-Stand ist gespeichert. Erstelle und prüfe jetzt separat einen neuen Plan. Es wurde kein Plan oder Apply gestartet.",
    );
    await onChanged(result.signal);
  }
  async function withdraw() {
    const withdrawal = context?.withdrawal;
    if (
      !withdrawal?.canWithdraw ||
      !withdrawal.expectedBindingId ||
      !confirmWithdrawal ||
      !withdrawAction ||
      busy
    )
      return;
    const result = await request(`instances/${instanceId}/upgrades/withdraw`, {
      expectedBindingId: withdrawal.expectedBindingId,
      expectedVersionId: withdrawal.expectedVersionId,
      lastAppliedJobId: withdrawal.lastAppliedJobId,
      confirmWithdrawal: true,
    });
    setConfirmWithdrawal(false);
    if (!result) return;
    const parsed = contextSchema.safeParse(result.data);
    if (!parsed.success) {
      setError(
        "Die Upgrade-Antwort konnte nicht sicher gelesen werden. Lade die Updates erneut.",
      );
      return;
    }
    setContext(parsed.data);
    setEdgeId("");
    setPreview(null);
    setConfirmed(false);
    setNotice(
      withdrawAction === "change"
        ? "Das bisherige Upgrade-Ziel wurde zurückgenommen. Die alten Pläne bleiben im Verlauf und sind für Apply gesperrt. Wähle jetzt eine neue freigegebene Zielversion."
        : "Das Upgrade wurde verworfen. Der vorherige Template-Stand ist wieder der gewünschte Stand. Infrastruktur und State wurden nicht verändert; alte Pläne bleiben für Apply gesperrt.",
    );
    setWithdrawAction(null);
    onWithdrawn?.();
    await onChanged(result.signal);
  }
  function versionLabel(id: string | null) {
    if (!id) return t("Noch kein erfolgreicher Apply");
    const version =
      context?.versionLabels.find((item) => item.id === id) ??
      (context?.current.id === id
        ? {
            name: context.current.template.name,
            version: context.current.version,
          }
        : undefined);
    return version
      ? `${version.name} · ${t("Version")} ${version.version}`
      : t("Vorheriger Stand (siehe technische Details)");
  }
  return (
    <section
      className="application-update-card"
      aria-label={t("Template- und Plattform-Updates")}
    >
      <h3>{t("Template-Version aktualisieren")}</h3>
      <p>
        {t(
          "Updates behalten dieselbe Bestellung und denselben State. Ein gewünschter Stand ist noch kein erfolgreich angewendeter Stand.",
        )}
      </p>
      <button
        type="button"
        className="button secondary"
        disabled={busy}
        onClick={() => void read()}
      >
        {t("Updates aktualisieren")}
      </button>
      {error && !edge && (
        <p role="alert" ref={errorNotice} tabIndex={-1}>
          {t(error)}
        </p>
      )}
      {notice && (
        <p
          role="status"
          ref={savedNotice}
          tabIndex={-1}
          className="application-update-empty"
        >
          {t(notice)}
        </p>
      )}
      {context && (
        <>
          {(context.candidates.length > 0 || pendingUpgrade) && (
            <ApplicationUpgradeProgress
              step={pendingUpgrade ? 3 : reviewed ? 2 : 1}
            />
          )}
          <div hidden={Boolean(preview) || pendingUpgrade}>
            <div className="application-update-summary">
              <div>
                <span>{t("Gewünschte Template-Version")}</span>
                <strong>
                  {context.current.template.name} · {t("Version")}{" "}
                  {context.current.version}
                </strong>
              </div>
              <div>
                <span>{t("Zuletzt erfolgreich angewendet")}</span>
                <strong>{versionLabel(context.lastAppliedVersionId)}</strong>
              </div>
              <div>
                <span>{t("Verfügbare Template-Updates")}</span>
                <strong>
                  {context.candidates.length
                    ? t("{{count}} freigegebene Zielversionen", {
                        count: context.candidates.length,
                      })
                    : t("Keine passende Freigabe vorhanden")}
                </strong>
              </div>
            </div>
            <details className="application-update-technical">
              <summary>
                {t("Technische Details zu Versionen und Plattform")}
              </summary>
              <dl className="application-properties">
                <dt>{t("Ursprüngliche Template-Version")}</dt>
                <dd>
                  <Id value={context.originVersionId} />
                </dd>
                <dt>{t("Aktuell gewünschte Template-Version")}</dt>
                <dd>
                  <Id
                    value={
                      context.candidate?.versionId ?? context.effectiveVersionId
                    }
                  />
                </dd>
                <dt>{t("Zuletzt erfolgreich angewendete Template-Version")}</dt>
                <dd>
                  <Id value={context.lastAppliedVersionId} />
                </dd>
                <dt>
                  {t("Zuletzt erfolgreich angewendeter Plattformvertrag")}
                </dt>
                <dd>
                  <Id value={context.lastAppliedPlatformRevision} />
                </dd>
                <dt>{t("Gewünschter Plattformvertrag")}</dt>
                <dd>
                  <Id
                    value={
                      context.candidate?.platformRevision ??
                      context.effectivePlatformRevision
                    }
                    emptyLabel="Nicht gebunden"
                  />
                </dd>
              </dl>
            </details>
            <p className="field-hint">
              {t(
                "Der zuletzt erfolgreiche Apply ist ein Ausführungsnachweis, kein aktueller Cloud-Abgleich. Prüfe den neuen Plan vor jedem Apply.",
              )}
            </p>
          </div>
          {context.blockers.length > 0 && (
            <ul aria-label={t("Upgrade-Hindernisse")}>
              {[...new Set(context.blockers)].map((value) => (
                <li key={value}>
                  {t(
                    reasons[value] ??
                      "Dieses Upgrade ist blockiert. Eine Bestätigung kann die Sicherheitsgrenzen nicht aufheben.",
                  )}
                </li>
              ))}
            </ul>
          )}
          {!context.candidates.length && !pendingUpgrade && (
            <div className="application-update-empty" role="status">
              <strong>{t("Keine passende Freigabe vorhanden")}</strong>
              <p>
                {t(
                  "Für diese Bestellung ist noch kein neuer Upgrade-Pfad freigegeben.",
                )}
              </p>
              <p>
                {t(
                  "Der Platform Owner muss unter Application Landing Zones → Veröffentlichung einen Template-Upgrade-Pfad von dieser gewünschten Version zur neuen Version veröffentlichen und dir den Zugriff auf die Zielversion erlauben. Ein Plattform-Upgrade-Pfad oder ein Pfad ab einer anderen Version reicht dafür nicht aus.",
                )}
              </p>
            </div>
          )}
          {requestedBy === session.user.id &&
            context.effectivePlatformRevision !== null &&
            context.candidates.length > 0 &&
            !pendingUpgrade && (
              <>
                <div hidden={reviewed}>
                  <h4>{t("1. Zielversion auswählen und Änderungen prüfen")}</h4>
                  <label>
                    {t("Freigegebene Zielversion")}
                    <select
                      id={`upgrade-target-${instanceId}`}
                      disabled={busy || reviewed}
                      value={edgeId}
                      onChange={(event) => {
                        cancel();
                        const selected = context.candidates.find(
                          (e) => e.id === event.target.value,
                        );
                        setEdgeId(event.target.value);
                        setParameters(
                          selected?.assessment.retainedParameters ??
                            context.effectiveParameters,
                        );
                        setPreview(null);
                        setConfirmed(false);
                        setNotice("");
                      }}
                    >
                      <option value="">{t("Upgrade wählen")}</option>
                      {context.candidates.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.target.template.name} · {t("Version")}{" "}
                          {item.target.version}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {edge && (
                  <>
                    <div hidden={reviewed}>
                      <dl className="application-properties">
                        <dt>{t("Bisherige Version")}</dt>
                        <dd>{context.current.version}</dd>
                        <dt>{t("Zielversion")}</dt>
                        <dd>{edge.target.version}</dd>
                        <dt>{t("Ziel-Plattformvertrag")}</dt>
                        <dd>
                          <Id value={edge.target.platformRevision ?? null} />
                        </dd>
                      </dl>
                      <fieldset disabled={busy || reviewed}>
                        <legend>{t("Antworten für die Zielversion")}</legend>
                        {templateParameterFields.map((field) => {
                          const source =
                            edge.target.template.parameterPolicy?.fields[
                              field.path
                            ];
                          if (source?.source !== "input") return null;
                          const value = parameters[field.path];
                          return (
                            <label
                              key={field.path}
                              htmlFor={`upgrade-${instanceId}-${field.path}`}
                            >
                              {t(field.label)}
                              {source.required ? " *" : ""}
                              {field.type === "boolean" ? (
                                <select
                                  id={`upgrade-${instanceId}-${field.path}`}
                                  value={
                                    typeof value === "boolean"
                                      ? String(value)
                                      : ""
                                  }
                                  onChange={(e) => {
                                    if (e.target.value)
                                      change(
                                        field.path,
                                        e.target.value === "true",
                                      );
                                  }}
                                >
                                  <option value="">
                                    {t("Bitte beantworten")}
                                  </option>
                                  <option value="true">
                                    {t("Eingeschaltet")}
                                  </option>
                                  <option value="false">
                                    {t("Ausgeschaltet")}
                                  </option>
                                </select>
                              ) : source.choices ? (
                                <select
                                  id={`upgrade-${instanceId}-${field.path}`}
                                  value={typeof value === "string" ? value : ""}
                                  onChange={(e) =>
                                    change(field.path, e.target.value)
                                  }
                                >
                                  <option value="">
                                    {t("Bitte beantworten")}
                                  </option>
                                  {source.choices.map((choice) => (
                                    <option key={choice} value={choice}>
                                      {choice}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  id={`upgrade-${instanceId}-${field.path}`}
                                  value={typeof value === "string" ? value : ""}
                                  onChange={(e) =>
                                    change(field.path, e.target.value)
                                  }
                                />
                              )}
                            </label>
                          );
                        })}
                      </fieldset>
                      {(
                        preview?.assessment ?? edge.assessment
                      ).requiredParameters.map((item) => (
                        <p role="status" key={item.path}>
                          {t("Neue Antwort erforderlich:")}{" "}
                          {templateParameterFields.find(
                            (field) => field.path === item.path,
                          )?.label ?? item.path}
                        </p>
                      ))}
                      {!reviewed && (
                        <button
                          type="button"
                          className="button secondary"
                          disabled={busy || context.blockers.length > 0}
                          onClick={() => void inspect()}
                        >
                          {t(
                            busy
                              ? "Änderungen werden geprüft …"
                              : "Weiter: Änderungen prüfen",
                          )}
                        </button>
                      )}
                    </div>
                    {reviewed && (
                      <button
                        type="button"
                        className="button secondary"
                        disabled={busy}
                        onClick={revise}
                      >
                        {t("Zurück: Zielversion und Antworten")}
                      </button>
                    )}
                    {busy && (
                      <p role="status">
                        {t(
                          reviewed
                            ? "Das Upgrade-Ziel wird gespeichert …"
                            : "Die Änderungen werden geprüft. Es wird kein Cloud-Plan gestartet.",
                        )}
                      </p>
                    )}
                    {preview && (
                      <section aria-label={t("Upgrade-Vergleich")}>
                        <h4 ref={comparisonHeading} tabIndex={-1}>
                          {t(
                            reviewed
                              ? "2. Vergleich prüfen und Upgrade-Ziel speichern"
                              : "Prüfergebnis: Hindernisse zuerst klären",
                          )}
                        </h4>
                        <p>
                          <strong>
                            {context.current.template.name} · {t("Version")}{" "}
                            {context.current.version} →{" "}
                            {edge.target.template.name} · {t("Version")}{" "}
                            {edge.target.version}
                          </strong>
                        </p>
                        {reviewed && (
                          <p>
                            {t(
                              "Schritt 1 ist abgeschlossen. Prüfe die Änderungen und bestätige anschließend die Zielversion. Damit wird noch keine Infrastruktur geändert.",
                            )}
                          </p>
                        )}
                        <p>
                          {t(
                            {
                              ordinary: "Reguläres Upgrade",
                              sensitive: "Sensitives Upgrade",
                              blocked: "Upgrade blockiert",
                            }[preview.assessment.classification],
                          )}
                        </p>
                        <p>
                          {t(
                            preview.assessment.classification === "blocked"
                              ? "Kläre zuerst die aufgeführten Hindernisse. Dieses Upgrade kann noch nicht übernommen oder per Plan-Freigabe entsperrt werden."
                              : preview.assessment.approvalPolicy ===
                                  "approval-required"
                                ? "Übernimm zuerst den gewünschten Upgrade-Stand und erstelle einen neuen Plan. Nach erfolgreichem Plan findet der Platform Owner in dieser Bestellung unter Plan die Aktion „Diesen Upgrade-Plan freigeben“. Apply bleibt ein separater Schritt."
                                : "Nach der Planprüfung gilt die direkte Apply-Richtlinie.",
                          )}
                        </p>
                        <ul>
                          {visibleUpgradeReasons(
                            preview.assessment.reasons,
                          ).map((reason) => (
                            <li
                              key={`${reason.code}:${reason.path}:${reason.classification}`}
                            >
                              <strong>
                                {t(upgradeChangeLabel(reason.path))}
                              </strong>
                              :{" "}
                              {t(
                                reasons[reason.code] ??
                                  "Diese Änderung muss geprüft werden.",
                              )}
                            </li>
                          ))}
                        </ul>
                        <details>
                          <summary>
                            {t("Beibehaltene und neue Antworten")}
                          </summary>
                          <pre>
                            {JSON.stringify(preview.parameters, null, 2)}
                          </pre>
                        </details>
                        <p>
                          {t(
                            "Der neue Plan prüft die tatsächlichen Rechteänderungen. Löschungen oder Ersetzungen bestehender Infrastruktur und unzulässige Zielwechsel bleiben gesperrt.",
                          )}
                        </p>
                        {reviewed && (
                          <>
                            <label className="checkbox">
                              <input
                                id={`upgrade-confirm-${instanceId}`}
                                type="checkbox"
                                checked={confirmed}
                                disabled={
                                  busy ||
                                  preview.assessment.classification ===
                                    "blocked" ||
                                  context.blockers.length > 0
                                }
                                onChange={(e) => setConfirmed(e.target.checked)}
                              />
                              {t(
                                "Ich übernehme nur den gewünschten Stand derselben Bestellung. Ich erstelle und prüfe danach einen neuen Plan; diese Aktion startet und genehmigt keinen Apply.",
                              )}
                            </label>
                            <button
                              type="button"
                              className="button"
                              disabled={
                                busy ||
                                !confirmed ||
                                preview.assessment.classification ===
                                  "blocked" ||
                                context.blockers.length > 0
                              }
                              onClick={() => void confirm()}
                            >
                              {t(
                                busy
                                  ? "Upgrade-Ziel wird gespeichert …"
                                  : "Upgrade-Ziel speichern und weiter",
                              )}
                            </button>
                          </>
                        )}
                      </section>
                    )}
                    {error && (
                      <p role="alert" ref={errorNotice} tabIndex={-1}>
                        {t(error)}
                      </p>
                    )}
                  </>
                )}
              </>
            )}
          {pendingUpgrade && requestedBy === session.user.id && (
            <section
              aria-label={t("Nächster Schritt: Plan")}
              className="application-update-empty"
            >
              <h4>{t("Upgrade-Ziel ist gespeichert")}</h4>
              <p>
                <strong>
                  {context.current.template.name} · {t("Version")}{" "}
                  {context.current.version}
                </strong>
              </p>
              <p>
                {t(
                  "Erstelle jetzt einen neuen Plan für diesen gespeicherten Stand. Prüfe dort die tatsächlichen Änderungen und eine gegebenenfalls erforderliche Platform-Owner-Freigabe. Erst danach kannst du Apply ausdrücklich starten.",
                )}
              </p>
              {context.withdrawal && (
                <section aria-label={t("Upgrade-Ziel ändern oder verwerfen")}>
                  <p>
                    {t(
                      "Solange für diesen Upgrade-Versuch noch kein Apply vorbereitet wurde, kannst du das Ziel ändern oder verwerfen. Alte Pläne bleiben im Verlauf, dürfen danach aber nicht mehr angewendet werden.",
                    )}
                  </p>
                  {!context.withdrawal.canWithdraw && (
                    <p role="status">
                      {t(
                        "Die Rücknahme ist derzeit gesperrt. Prüfe laufende Ausführungen, Recovery und bereits vorbereitete Applies. Es wird nichts automatisch beendet oder entsperrt.",
                      )}
                    </p>
                  )}
                  {context.withdrawal.blockers.includes(
                    "restore-platform-unavailable",
                  ) && (
                    <p role="status">
                      {t(
                        "Der frühere Plattformstand ist nicht mehr aktuell freigegeben. Eine Rücknahme auf diesen Stand ist gesperrt. Der aktuelle Plattformnachweis muss zuerst geklärt werden.",
                      )}
                    </p>
                  )}
                  <div className="actions">
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy || !context.withdrawal.canWithdraw}
                      onClick={() => {
                        setWithdrawAction("change");
                        setConfirmWithdrawal(false);
                        setError("");
                      }}
                    >
                      {t("Upgrade-Ziel ändern")}
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy || !context.withdrawal.canWithdraw}
                      onClick={() => {
                        setWithdrawAction("discard");
                        setConfirmWithdrawal(false);
                        setError("");
                      }}
                    >
                      {t("Upgrade verwerfen")}
                    </button>
                  </div>
                  {withdrawAction && (
                    <fieldset disabled={busy}>
                      <legend>{t("Rücknahme bestätigen")}</legend>
                      <p>
                        {t("Wieder gewünschter Stand")}:{" "}
                        <strong>
                          {versionLabel(context.withdrawal.restoreVersionId)}
                        </strong>
                      </p>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={confirmWithdrawal}
                          onChange={(event) =>
                            setConfirmWithdrawal(event.target.checked)
                          }
                        />
                        {t(
                          "Ich nehme das gespeicherte Upgrade-Ziel zurück und sperre seine bisherigen Pläne für Apply. Es wird keine Infrastruktur geändert und kein State zurückgesetzt.",
                        )}
                      </label>
                      <button
                        type="button"
                        className="button"
                        disabled={
                          !confirmWithdrawal || !context.withdrawal.canWithdraw
                        }
                        onClick={() => void withdraw()}
                      >
                        {t(
                          withdrawAction === "change"
                            ? "Ziel zurücknehmen und neu auswählen"
                            : "Upgrade verbindlich verwerfen",
                        )}
                      </button>
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => {
                          setWithdrawAction(null);
                          setConfirmWithdrawal(false);
                        }}
                      >
                        {t("Rücknahme abbrechen")}
                      </button>
                    </fieldset>
                  )}
                </section>
              )}
              <button type="button" className="button" onClick={onPlan}>
                {t("Weiter: Neuen Plan prüfen")}
              </button>
            </section>
          )}
          <div hidden={Boolean(preview)}>
            <ApplicationPlatformUpdates
              key={`${session.tenant?.id}:${session.user.id}:${context.bindingId}:${context.effectiveVersionId}:${context.effectivePlatformRevision}`}
              session={session}
              instanceId={instanceId}
              requestedBy={requestedBy}
              context={context}
              onChanged={async (signal) => {
                await onChanged(signal);
                if (!signal.aborted) {
                  setNotice(
                    "Der gewünschte Plattformstand ist gespeichert. Erstelle und prüfe separat einen neuen Plan. Es wurde kein Plan oder Apply gestartet.",
                  );
                  await read();
                }
              }}
            />
          </div>
        </>
      )}
    </section>
  );
}
