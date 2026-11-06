import { platformContractSchema } from "@lzc/domain";
import { z } from "zod";
import { currentLanguage, t } from "../i18n";

export const approvedContractSchema = z.object({
  document: platformContractSchema,
  approvedBy: z.uuid(),
  approvedAt: z.iso.datetime(),
  source: z.object({ applyRunId: z.uuid() }).optional(),
  presentation: z
    .object({
      configurationName: z.string().min(1).max(256),
      configurationRevision: z.string().max(128).nullable(),
      appliedAt: z.iso.datetime(),
    })
    .optional(),
});
export type ApprovedPlatformContract = z.infer<typeof approvedContractSchema>;
export function platformContractLabel(item: ApprovedPlatformContract) {
  const p = item.presentation;
  const date = new Date(p?.appliedAt ?? item.approvedAt).toLocaleString(
    currentLanguage(),
  );
  return p
    ? `${p.configurationName}${p.configurationRevision ? ` · ${t("Revision")} ${p.configurationRevision}` : ""} · ${t("Apply")} ${date}`
    : `${item.source ? t("Bereitgestellte Plattform") : t("Importierte Plattform")} · ${t("Freigabe")} ${date}`;
}
export function PlatformContractDetails({
  item,
}: {
  item: ApprovedPlatformContract;
}) {
  const targets = Object.entries(item.document.targets);
  return (
    <div className="field-hint">
      <p>{platformContractLabel(item)}</p>
      <ul>
        {targets.map(([key, target]) => (
          <li key={key}>
            {key} · {target.corporate ? t("Corporate") : t("Public")} ·{" "}
            {target.region} ·{" "}
            {target.audit_router
              ? t("Zentrale Audit-Anbindung verfügbar")
              : t("Keine zentrale Audit-Anbindung")}
          </li>
        ))}
      </ul>
      <details>
        <summary>{t("Technische Vertragsdetails")}</summary>
        <dl className="application-properties">
          <dt>{t("Plattformvertrag")}</dt>
          <dd>
            <code>{item.document.revision}</code>
          </dd>
        </dl>
      </details>
    </div>
  );
}
