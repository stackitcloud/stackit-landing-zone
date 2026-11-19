import type { AssistantAccessDefaultNotice } from "@lzc/contracts";
import { t } from "../i18n";
import { labelFor } from "./feature-labels";

export function AssistantAccessDefaults({
  items,
}: {
  items: AssistantAccessDefaultNotice[];
}) {
  if (!items.length) return null;
  return (
    <section
      className="assistant-recommendations"
      aria-label={t("Vorgeschlagene Zugriffsstandards")}
    >
      <h4>{t("Vorgeschlagene Zugriffsstandards")}</h4>
      <p>
        {t(
          "Prüfe diese Zugriffseinstellungen, bevor du den Vorschlag übernimmst.",
        )}
      </p>
      {items.map((item) => (
        <div className="assistant-recommendation" key={item.path}>
          <strong>
            {labelFor(item.path.split(".")[0] ?? item.path)} ·{" "}
            {labelFor(item.path.split(".").at(-1) ?? item.path)}
          </strong>
          <p>
            {item.sources.map((source) => (
              <span key={source}>
                {source === "0.0.0.0/0"
                  ? t("Alle IPv4-Adressen")
                  : source === "::/0"
                    ? t("Alle IPv6-Adressen")
                    : t("Erlaubte Quelle")}{" "}
                <code>{source}</code>{" "}
              </span>
            ))}
          </p>
          <small>{t("Standard des Accelerators")}</small>
        </div>
      ))}
    </section>
  );
}
