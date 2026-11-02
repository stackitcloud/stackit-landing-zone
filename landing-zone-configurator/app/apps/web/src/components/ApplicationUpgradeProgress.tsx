import { t } from "../i18n";

export function ApplicationUpgradeProgress({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <ol className="application-upgrade-flow" aria-label={t("Upgrade-Schritte")}>
      {[
        "Zielversion auswählen",
        "Änderungen prüfen und Ziel speichern",
        "Neuen Plan prüfen",
        "Upgrade anwenden",
      ].map((label, index) => (
        <li key={label} aria-current={index + 1 === step ? "step" : undefined}>
          <strong>{t(label)}</strong>
        </li>
      ))}
    </ol>
  );
}
