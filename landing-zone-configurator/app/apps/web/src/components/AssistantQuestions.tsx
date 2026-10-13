import { Send } from "lucide-react";
import { useId, useState } from "react";
import { t } from "../i18n";

export type AssistantQuestion = {
  text: string;
  options?: string[];
  multiple?: boolean;
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
    Record<number, { choices: string[]; free: string }>
  >({});
  if (!questions.length) return null;
  const reply = questions
    .flatMap((question, index) => {
      const answer = [
        ...(answers[index]?.choices ?? []),
        answers[index]?.free.trim() ?? "",
      ]
        .filter(Boolean)
        .join("; ");
      const text = typeof question === "string" ? question : question.text;
      return answer ? [`${text}\nMeine Antwort: ${answer}`] : [];
    })
    .join("\n\n");
  return (
    <section className="assistant-questions" aria-label="Rückfragen">
      <h3>Offene Fragen</h3>
      {questions.map((question, index) => {
        const text = typeof question === "string" ? question : question.text;
        const options =
          typeof question === "string" ? [] : (question.options ?? []);
        const multiple =
          typeof question !== "string" && question.multiple === true;
        return (
          <fieldset key={text} disabled={disabled}>
            <legend>{text}</legend>
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
                        },
                      })
                    }
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
            <label className="assistant-free-answer">
              <span>Eigene Antwort</span>
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
