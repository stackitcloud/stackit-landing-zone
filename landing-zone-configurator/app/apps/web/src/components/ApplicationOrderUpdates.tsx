import { templateParameterFields } from "@lzc/domain";
import { useCallback, useEffect, useState } from "react";
import type { z } from "zod";
import { t } from "../i18n";
import type { Session } from "./Account";
import { ApplicationPlatformUpdates } from "./ApplicationPlatformUpdates";
import { upgradeReasonMessages as reasons } from "./application-upgrade-messages";
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
}: {
  session: Session;
  instanceId: string;
  requestedBy: string;
  onChanged: (signal: AbortSignal) => Promise<void>;
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
    [notice, setNotice] = useState("");
  const read = useCallback(async () => {
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
  return (
    <section aria-label={t("Template- und Plattform-Updates")}>
      <h3>{t("Template- und Plattform-Updates")}</h3>
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
      {error && <p role="alert">{t(error)}</p>}
      {notice && <p role="status">{t(notice)}</p>}
      {context && (
        <>
          <ApplicationPlatformUpdates
            key={`${session.tenant?.id}:${session.user.id}:${context.bindingId}:${context.effectiveVersionId}:${context.effectivePlatformRevision}`}
            session={session}
            instanceId={instanceId}
            requestedBy={requestedBy}
            context={context}
            onChanged={async (signal) => {
              await onChanged(signal);
              if (!signal.aborted) await read();
            }}
          />
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
            <dt>{t("Zuletzt erfolgreich angewendeter Plattformvertrag")}</dt>
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
          <p className="field-hint">
            {t(
              "Der zuletzt erfolgreiche Apply ist ein Ausführungsnachweis, kein aktueller Cloud-Abgleich. Prüfe den neuen Plan vor jedem Apply.",
            )}
          </p>
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
          {!context.candidates.length && (
            <p>
              {t(
                "Für diese Bestellung ist noch kein neuer Upgrade-Pfad freigegeben.",
              )}
            </p>
          )}
          {requestedBy === session.user.id &&
            context.effectivePlatformRevision !== null &&
            context.candidates.length > 0 && (
              <>
                <label>
                  {t("Freigegebene Zielversion")}
                  <select
                    id={`upgrade-target-${instanceId}`}
                    disabled={busy}
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
                {edge && (
                  <>
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
                    <fieldset disabled={busy}>
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
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy || context.blockers.length > 0}
                      onClick={() => void inspect()}
                    >
                      {t("Upgrade prüfen")}
                    </button>
                    {preview && (
                      <section aria-label={t("Upgrade-Vergleich")}>
                        <h4>{t("Upgrade-Vergleich")}</h4>
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
                            preview.assessment.approvalPolicy ===
                              "approval-required"
                              ? "Der neue gespeicherte Plan benötigt eine separate Platform-Owner-Freigabe."
                              : "Nach der Planprüfung gilt die direkte Apply-Richtlinie.",
                          )}
                        </p>
                        <ul>
                          {preview.assessment.reasons.map((reason) => (
                            <li
                              key={`${reason.code}:${reason.path}:${reason.classification}`}
                            >
                              <strong>{reason.path}</strong>:{" "}
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
                            "Löschungen, Ersetzungen und unzulässige Zielwechsel bleiben gesperrt. Eine Bestätigung hebt diese Sperren nicht auf.",
                          )}
                        </p>
                        <label>
                          <input
                            id={`upgrade-confirm-${instanceId}`}
                            type="checkbox"
                            checked={confirmed}
                            disabled={
                              busy ||
                              preview.assessment.classification === "blocked" ||
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
                          className="button secondary"
                          disabled={
                            busy ||
                            !confirmed ||
                            preview.assessment.classification === "blocked" ||
                            context.blockers.length > 0
                          }
                          onClick={() => void confirm()}
                        >
                          {t("Gewünschten Upgrade-Stand übernehmen")}
                        </button>
                      </section>
                    )}
                  </>
                )}
              </>
            )}
        </>
      )}
    </section>
  );
}
