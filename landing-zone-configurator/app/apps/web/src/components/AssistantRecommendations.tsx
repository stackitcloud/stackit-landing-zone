import type { AssistantRecommendation } from "@lzc/contracts";
import { t } from "../i18n";
import { labelFor } from "./feature-labels";

const metrics: Record<string, string> = {
  users: "Nutzer",
  vCPU: "vCPU",
  bandwidthMbps: "Bandbreite (Mbit/s)",
  maxConnections: "Verbindungen",
};

export function AssistantRecommendations({
  items,
}: {
  items: AssistantRecommendation[];
}) {
  if (!items.length) return null;
  return (
    <section
      className="assistant-recommendations"
      aria-label={t("Passende Empfehlungen")}
    >
      <h4>{t("Passende Empfehlungen")}</h4>
      {items.map((item) => (
        <div className="assistant-recommendation" key={item.path}>
          <strong>
            {labelFor(item.path.split(".").at(-1) ?? item.path)}: {item.label}
          </strong>
          {item.description && <p>{item.description}</p>}
          <dl>
            <div>
              <dt>{t("Geplanter Bedarf")}</dt>
              <dd>
                {item.requirements
                  .map(
                    (requirement) =>
                      `${t(metrics[requirement.metric] ?? requirement.metric)}: ${requirement.minimum}`,
                  )
                  .join(" · ")}
              </dd>
            </div>
            <div>
              <dt>{t("Tarifmerkmale")}</dt>
              <dd>
                {item.facts
                  .map(
                    (fact) =>
                      `${t(metrics[fact.metric] ?? fact.metric)}: ${fact.value}`,
                  )
                  .join(" · ")}
              </dd>
            </div>
          </dl>
          <small>
            {t("Projektkatalog · Region {{region}}", {
              region: item.source.region,
            })}
          </small>
        </div>
      ))}
    </section>
  );
}
