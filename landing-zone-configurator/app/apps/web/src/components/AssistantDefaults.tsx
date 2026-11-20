import type { AssistantDefaultNotice } from "@lzc/contracts";
import { t } from "../i18n";
import { labelFor } from "./feature-labels";

export function AssistantDefaults({
  items,
}: {
  items: AssistantDefaultNotice[];
}) {
  if (!items.length) return null;
  return (
    <section
      className="assistant-recommendations"
      aria-label={t("Vorgeschlagene Standardwerte")}
    >
      <h4>{t("Vorgeschlagene Standardwerte")}</h4>
      <p>
        {t("Prüfe diese Standardwerte, bevor du den Vorschlag übernimmst.")}
      </p>
      {items.map((item) => (
        <div className="assistant-recommendation" key={item.path}>
          <strong>
            {labelFor(item.path.split(".")[0] ?? item.path)} ·{" "}
            {labelFor(item.path.split(".").at(-1) ?? item.path)}
          </strong>
          <p>
            <code>
              {(Array.isArray(item.value) && item.value.length
                ? item.value
                : [item.value]
              )
                .map((value) =>
                  value === "0.0.0.0/0"
                    ? `${t("Alle IPv4-Adressen")} (0.0.0.0/0)`
                    : value === "::/0"
                      ? `${t("Alle IPv6-Adressen")} (::/0)`
                      : value === null
                        ? t("Nicht gesetzt")
                        : typeof value === "boolean"
                          ? t(value ? "Ja" : "Nein")
                          : typeof value === "object"
                            ? JSON.stringify(value)
                            : String(value),
                )
                .join(" · ")}
            </code>
          </p>
          <small>{t("Standard des Accelerators")}</small>
        </div>
      ))}
    </section>
  );
}
