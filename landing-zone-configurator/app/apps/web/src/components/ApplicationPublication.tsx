import type { appliedPlatformSourceSchema } from "@lzc/contracts";
import {
  type CommonConfiguration,
  type platformContractSchema,
  projectTemplates,
} from "@lzc/domain";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { currentLanguage, t } from "../i18n";

export type PublicationPlatform = {
  id: string;
  configurationId?: string | null | undefined;
  configurationName: string;
  configurationRevision?: string | null | undefined;
  finishedAt: string;
};
export type PublicationPreview = {
  document: z.infer<typeof platformContractSchema>;
  source: z.infer<typeof appliedPlatformSourceSchema>;
};

export function publicationPlatforms(
  platforms: PublicationPlatform[],
  configurationId: string | null,
) {
  // Names and document-local IDs are not persisted configuration identities.
  return configurationId
    ? platforms.filter((p) => p.configurationId === configurationId)
    : [];
}

export function publicationTargets(
  preview: PublicationPreview | null,
  template: ReturnType<typeof projectTemplates>[number] | undefined,
) {
  return Object.entries(preview?.document.targets ?? {}).filter(
    ([, target]) =>
      template &&
      target.region === template.region &&
      target.corporate === (template.kind === "corporate"),
  );
}

export function ApplicationPublication({
  draft,
  configurationId,
  platforms,
  profiles,
  backends,
  delegationEnabled,
  deploymentPolicyEnabled,
  groups,
  defaultGroupIds,
  preview,
  publish,
  onAdvanced,
  credentialEditor,
}: {
  draft: CommonConfiguration;
  configurationId: string | null;
  platforms: PublicationPlatform[];
  profiles: { id: string; name: string }[];
  backends: { id: string; bucket: string }[];
  delegationEnabled: boolean;
  deploymentPolicyEnabled: boolean;
  groups: { id: string; name: string }[] | null;
  defaultGroupIds: string[];
  preview: (
    applyId: string,
    signal: AbortSignal,
  ) => Promise<PublicationPreview>;
  publish: (input: {
    templateId: string;
    preview: PublicationPreview;
    credentialId: string;
    backendId: string;
    targetKey: string;
    allowedGroupIds: string[];
    direct: boolean;
    signal: AbortSignal;
  }) => Promise<void>;
  onAdvanced: () => void;
  credentialEditor?: import("react").ReactNode;
}) {
  const templates = projectTemplates(draft).filter(
    (item) => item.kind !== "sandbox",
  );
  const available = publicationPlatforms(platforms, configurationId);
  const [templateChoice, setTemplateChoice] = useState("");
  const [platformChoice, setPlatformChoice] = useState("");
  const [profileChoice, setProfileChoice] = useState("");
  const [backendChoice, setBackendChoice] = useState("");
  const [targetChoice, setTargetChoice] = useState("");
  const [selectedGroups, setSelectedGroups] = useState(defaultGroupIds);
  const [direct, setDirect] = useState(false);
  const [review, setReview] = useState<PublicationPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const lifetime = useRef(new AbortController());
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    heading.current?.focus();
    return () => controller.abort();
  }, []);
  const templateId =
    templateChoice || (templates.length === 1 ? (templates[0]?.id ?? "") : "");
  const applyId =
    platformChoice || (available.length === 1 ? (available[0]?.id ?? "") : "");
  const credentialId =
    profileChoice || (profiles.length === 1 ? (profiles[0]?.id ?? "") : "");
  const backendId =
    backendChoice || (backends.length === 1 ? (backends[0]?.id ?? "") : "");
  const template = templates.find((item) => item.id === templateId);
  const targets = publicationTargets(review, template);
  const targetKey =
    targetChoice || (targets.length === 1 ? (targets[0]?.[0] ?? "") : "");
  const platform = available.find((item) => item.id === applyId);
  const canReview =
    !!template &&
    !!platform &&
    profiles.some((item) => item.id === credentialId) &&
    (!delegationEnabled || backends.some((item) => item.id === backendId));
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      if (!lifetime.current.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Bereitstellung konnte nicht vorbereitet werden.",
        );
    } finally {
      if (!lifetime.current.signal.aborted) setBusy(false);
    }
  }
  return (
    <section
      id="application-publication-guide"
      aria-label={t("Vorlage bereitstellen")}
    >
      <h3 ref={heading} tabIndex={-1}>
        {t("Vorlage bereitstellen")}
      </h3>
      <p>
        {t(
          "Wähle eine gespeicherte Vorlage und prüfe, wo und für wen sie bestellbar wird.",
        )}
      </p>
      {error && <p role="alert">{t(error)}</p>}
      <fieldset disabled={busy || !!review}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="publication-template">{t("Vorlage")}</label>
            <select
              id="publication-template"
              value={templateId}
              onChange={(e) => setTemplateChoice(e.target.value)}
            >
              <option value="">{t("Template wählen")}</option>
              {templates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name || item.key}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="publication-platform">
              {t("Bereitgestellte Plattform")}
            </label>
            <select
              id="publication-platform"
              value={applyId}
              onChange={(e) => setPlatformChoice(e.target.value)}
            >
              <option value="">{t("Plattform wählen")}</option>
              {available.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.configurationName} · {t("Revision")}{" "}
                  {item.configurationRevision ?? "—"} ·{" "}
                  {new Date(item.finishedAt).toLocaleString(currentLanguage())}
                </option>
              ))}
            </select>
          </div>
          {profiles.length !== 1 && (
            <div className="field">
              <label htmlFor="publication-credential">
                {t("Technischer STACKIT-Zugang")}
              </label>
              <select
                id="publication-credential"
                value={credentialId}
                onChange={(e) => setProfileChoice(e.target.value)}
              >
                <option value="">{t("Zugang wählen")}</option>
                {profiles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {delegationEnabled && backends.length !== 1 && (
            <div className="field">
              <label htmlFor="publication-backend">
                {t("Speicher für den Ausführungsstatus")}
              </label>
              <select
                id="publication-backend"
                value={backendId}
                onChange={(e) => setBackendChoice(e.target.value)}
              >
                <option value="">{t("State-Backend wählen")}</option>
                {backends.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.bucket}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {credentialEditor}
        {!available.length && (
          <p role="status">
            {t(
              "Für diese Konfiguration ist noch keine bereitgestellte Plattform verfügbar. Wende zuerst die Plattformänderungen an oder prüfe die Zuordnung unter Erweitert.",
            )}
          </p>
        )}
        {groups && (
          <fieldset>
            <legend>{t("Für Gruppen freigeben")}</legend>
            {groups.map((group) => (
              <label className="toggle-label" key={group.id}>
                <input
                  type="checkbox"
                  checked={selectedGroups.includes(group.id)}
                  onChange={(e) =>
                    setSelectedGroups((previous) =>
                      e.target.checked
                        ? [...previous, group.id]
                        : previous.filter((id) => id !== group.id),
                    )
                  }
                />
                {group.name}
              </label>
            ))}
          </fieldset>
        )}
        {deploymentPolicyEnabled && (
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={direct}
              onChange={(e) => setDirect(e.target.checked)}
            />
            {t("Bestellungen ohne zusätzliche Freigabe zulassen")}
          </label>
        )}
        <button
          type="button"
          className="button primary"
          disabled={!canReview}
          onClick={() =>
            void run(async () => {
              const result = await preview(applyId, lifetime.current.signal);
              if (!lifetime.current.signal.aborted) {
                setReview(result);
                setConfirmed(false);
                setTargetChoice("");
              }
            })
          }
        >
          {t("Bereitstellung prüfen")}
        </button>
      </fieldset>
      {review && (
        <>
          <dl className="application-properties">
            <dt>{t("Vorlage")}</dt>
            <dd>{template?.name}</dd>
            <dt>{t("Bereitgestellte Plattform")}</dt>
            <dd>
              {platform?.configurationName} · {t("Revision")}{" "}
              {platform?.configurationRevision ?? "—"}
            </dd>
            <dt>{t("Technischer STACKIT-Zugang")}</dt>
            <dd>{profiles.find((item) => item.id === credentialId)?.name}</dd>
            {delegationEnabled && (
              <>
                <dt>{t("Speicher für den Ausführungsstatus")}</dt>
                <dd>
                  {backends.find((item) => item.id === backendId)?.bucket}
                </dd>
              </>
            )}
            {groups && (
              <>
                <dt>{t("Für Gruppen freigeben")}</dt>
                <dd>
                  {selectedGroups.length
                    ? groups
                        .filter((group) => selectedGroups.includes(group.id))
                        .map((group) => group.name)
                        .join(", ")
                    : t("Für keine Application Owner freigegeben")}
                </dd>
              </>
            )}
            <dt>{t("Bereitstellungsrichtlinie")}</dt>
            <dd>
              {t(
                direct
                  ? "Direkte Bereitstellung"
                  : "Bereitstellung mit Freigabe",
              )}
            </dd>
          </dl>
          {targets.length > 1 && (
            <div className="field">
              <label htmlFor="publication-target">{t("Zielbereich")}</label>
              <select
                id="publication-target"
                value={targetKey}
                disabled={busy}
                onChange={(e) => {
                  setTargetChoice(e.target.value);
                  setConfirmed(false);
                }}
              >
                <option value="">{t("Passendes Ziel wählen")}</option>
                {targets.map(([key, target]) => (
                  <option key={key} value={key}>
                    {key} · {target.region} ·{" "}
                    {t(target.corporate ? "Corporate" : "Public")}
                  </option>
                ))}
              </select>
            </div>
          )}
          {targets.length === 1 && (
            <p>
              {t("Zielbereich")}: {targets[0]?.[0]} · {targets[0]?.[1].region}
            </p>
          )}
          {!targets.length && (
            <p role="status">
              {t(
                "Kein passendes Plattformziel für dieses Template. Wende die erforderlichen Plattformänderungen zuerst an.",
              )}
            </p>
          )}
          <p>
            {t(
              "Die Vorlage wird bestellbar. Bestehende Landing Zones bleiben auf ihrer bisherigen Version; neue Ressourcen entstehen erst nach Plan und Apply.",
            )}
          </p>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            {t(
              "Zielbereich, Zugriff und Ausführung für diese Vorlage freigeben",
            )}
          </label>
          <div className="actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setReview(null);
                setConfirmed(false);
              }}
            >
              {t("Auswahl ändern")}
            </button>
            <button
              type="button"
              className="button primary"
              disabled={
                busy ||
                !confirmed ||
                !canReview ||
                !targets.some(([key]) => key === targetKey)
              }
              onClick={() =>
                void run(() =>
                  publish({
                    templateId,
                    preview: review,
                    credentialId,
                    backendId,
                    targetKey,
                    allowedGroupIds: selectedGroups,
                    direct,
                    signal: lifetime.current.signal,
                  }),
                )
              }
            >
              {t("Vorlage bereitstellen")}
            </button>
          </div>
        </>
      )}
      <button
        type="button"
        className="button secondary"
        disabled={busy}
        onClick={onAdvanced}
      >
        {t("Erweiterte Einstellungen öffnen")}
      </button>
    </section>
  );
}
