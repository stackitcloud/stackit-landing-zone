import {
  type AssistantCataloguePicker,
  catalogueChoiceMatches,
} from "@lzc/contracts";
import { Send } from "lucide-react";
import { useId, useState } from "react";
import { t } from "../i18n";

export type AssistantQuestion = {
  text: string;
  options?: string[];
  multiple?: boolean;
  catalogue?: AssistantCataloguePicker;
};

export function AssistantQuestions({
  questions,
  disabled,
  onReply,
}: {
  questions: (AssistantQuestion | string)[];
  disabled: boolean;
  onReply: (reply: string) => void;
}) {
  const group = useId();
  const [answers, setAnswers] = useState<
    Record<number, { choices: string[]; free: string; catalogue?: string[] }>
  >({});
  const [filters, setFilters] = useState<Record<number, string>>({});
  const [showAll, setShowAll] = useState<Record<number, boolean>>({});
  if (!questions.length) return null;
  const reply = questions
    .flatMap((question, index) => {
      const answer = [
        ...(answers[index]?.choices ?? []),
        ...(answers[index]?.catalogue ?? []).map((value) => {
          const option =
            typeof question === "string"
              ? undefined
              : question.catalogue?.options.find(
                  (option) => option.value === value,
                );
          return option
            ? option.label === option.value
              ? option.value
              : `${option.label} (${option.value})`
            : "";
        }),
        answers[index]?.free.trim() ?? "",
      ]
        .filter(Boolean)
        .join("; ");
      const text = typeof question === "string" ? question : question.text;
      return answer
        ? [`${text}\n${t("Meine Antwort: {{value0}}", { value0: answer })}`]
        : [];
    })
    .join("\n\n");
  return (
    <section className="assistant-questions" aria-label={t("Rückfragen")}>
      <h3>{t("Offene Fragen")}</h3>
      {questions.map((question, index) => {
        const text = typeof question === "string" ? question : question.text;
        const catalogue =
          typeof question === "string" ? undefined : question.catalogue;
        const options = (
          typeof question === "string" ? [] : (question.options ?? [])
        ).filter(
          (option) =>
            !catalogue?.options.some((item) =>
              catalogueChoiceMatches(option, item),
            ),
        );
        const search = (filters[index] ?? "").toLowerCase().trim();
        const filtered =
          catalogue?.options.filter(
            (option) =>
              (search ||
                showAll[index] ||
                !catalogue.suggestedValues.length ||
                catalogue.suggestedValues.includes(option.value)) &&
              `${option.label} ${option.value} ${option.description} ${option.facts.map((fact) => `${fact.value} ${fact.key}`).join(" ")}`
                .toLowerCase()
                .includes(search),
          ) ?? [];
        const picked =
          catalogue?.options.filter((option) =>
            answers[index]?.catalogue?.includes(option.value),
          ) ?? [];
        const shown = [
          ...filtered,
          ...picked.filter((option) => !filtered.includes(option)),
        ];
        const multiple =
          typeof question !== "string" && question.multiple === true;
        return (
          <fieldset key={text} disabled={disabled}>
            <legend>{text}</legend>
            {catalogue && (
              <div className="assistant-catalogue">
                <p>
                  {t("Projektkatalog · Region {{region}}", {
                    region: catalogue.region,
                  })}
                </p>
                {catalogue.truncated && (
                  <p role="status">
                    {t(
                      "Begrenzter Katalogausschnitt: {{shown}} von {{total}} Optionen. Eine fehlende Option ist kein Nachweis fehlender Verfügbarkeit.",
                      {
                        shown: catalogue.options.length,
                        total: catalogue.totalOptions,
                      },
                    )}
                  </p>
                )}
                {catalogue.status === "unavailable" && (
                  <p role="status">
                    {t(
                      "Der Projektkatalog ist derzeit nicht verfügbar. Dokumentierte Vorschläge sind keine Bestätigung der Bestellbarkeit.",
                    )}
                  </p>
                )}
                {catalogue.suggestedValues.length > 0 && (
                  <label className="assistant-catalogue-expand">
                    <input
                      type="checkbox"
                      checked={showAll[index] ?? false}
                      onChange={(event) =>
                        setShowAll({
                          ...showAll,
                          [index]: event.target.checked,
                        })
                      }
                    />
                    <span>
                      {t(
                        "Alle Katalogoptionen anzeigen (sonst Vorauswahl aus dem Gespräch)",
                      )}
                    </span>
                  </label>
                )}
                <label>
                  <span>{t("Optionen eingrenzen")}</span>
                  <input
                    type="search"
                    value={filters[index] ?? ""}
                    onChange={(event) =>
                      setFilters({ ...filters, [index]: event.target.value })
                    }
                    placeholder={t("Name, Flavor oder technisches Merkmal")}
                  />
                </label>
                <label>
                  <span>{t("Passende Katalogoption auswählen")}</span>
                  <select
                    multiple={multiple}
                    value={
                      multiple
                        ? (answers[index]?.catalogue ?? [])
                        : (answers[index]?.catalogue?.[0] ?? "")
                    }
                    onChange={(event) =>
                      setAnswers({
                        ...answers,
                        [index]: {
                          choices: multiple
                            ? (answers[index]?.choices ?? [])
                            : [],
                          free: multiple ? (answers[index]?.free ?? "") : "",
                          catalogue: [...event.target.selectedOptions]
                            .map((option) => option.value)
                            .filter(Boolean),
                        },
                      })
                    }
                  >
                    {!multiple && (
                      <option value="">{t("Bitte auswählen")}</option>
                    )}
                    {shown.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                        {option.label !== option.value
                          ? ` (${option.value})`
                          : ""}
                        {option.facts.length
                          ? ` · ${option.facts.map((fact) => `${fact.value} ${fact.key === "bandwidthMbps" ? t("Mbit/s") : fact.key === "maxConnections" ? t("Verbindungen") : t("vCPU")}`).join(" · ")}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {!filtered.length && (
                  <p role="status">
                    {t(
                      "Keine passende Option im angezeigten Katalogausschnitt.",
                    )}
                  </p>
                )}
                {picked.map((option) => (
                  <div
                    key={option.value}
                    className="assistant-catalogue-detail"
                  >
                    <strong>{option.label}</strong>
                    <p>
                      {option.description ||
                        t(
                          "Keine zusätzliche Beschreibung im Katalog vorhanden.",
                        )}
                    </p>
                    {option.facts.length > 0 && (
                      <ul>
                        {option.facts.map((fact) => (
                          <li key={fact.key}>
                            {fact.value}{" "}
                            {fact.key === "bandwidthMbps"
                              ? t("Mbit/s")
                              : fact.key === "maxConnections"
                                ? t("Verbindungen")
                                : t("vCPU")}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
                <small>
                  {t(
                    "Die Auswahl wird als Antwort gesendet. Sie ändert noch keine Konfiguration und bestätigt keine Bereitstellung.",
                  )}
                </small>
              </div>
            )}
            <div className="assistant-options">
              {options.map((option) => (
                <label key={option}>
                  <input
                    type={multiple ? "checkbox" : "radio"}
                    name={`${group}-${index}`}
                    checked={answers[index]?.choices.includes(option) ?? false}
                    onChange={(event) =>
                      setAnswers({
                        ...answers,
                        [index]: {
                          choices: multiple
                            ? event.target.checked
                              ? [...(answers[index]?.choices ?? []), option]
                              : (answers[index]?.choices ?? []).filter(
                                  (choice) => choice !== option,
                                )
                            : [option],
                          free: multiple ? (answers[index]?.free ?? "") : "",
                          catalogue: multiple
                            ? (answers[index]?.catalogue ?? [])
                            : [],
                        },
                      })
                    }
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
            <label className="assistant-free-answer">
              <span>{t("Eigene Antwort")}</span>
              <input
                type="text"
                maxLength={600}
                value={answers[index]?.free ?? ""}
                onChange={(event) =>
                  setAnswers({
                    ...answers,
                    [index]: {
                      choices: multiple ? (answers[index]?.choices ?? []) : [],
                      free: event.target.value,
                      catalogue: multiple
                        ? (answers[index]?.catalogue ?? [])
                        : [],
                    },
                  })
                }
              />
            </label>
          </fieldset>
        );
      })}
      <button
        type="button"
        className="button secondary"
        disabled={disabled || !reply}
        onClick={() => onReply(reply)}
      >
        <Send size={18} aria-hidden="true" /> {t("Antwort senden")}
      </button>
    </section>
  );
}
