import { type JsonValue, objectValue } from "@lzc/domain";
import {
  type AssistantOwnerIdentityContext,
  assistantOwnerChoices,
  assistantQuestionFields,
  type Dialogue,
} from "./dialogue.js";

/** Like catalogue selectors, identity choices belong to the scoped application
 * metadata. Model-supplied option labels do not select or authorize an identity. */
export function enrichTemplateOwnerQuestions(
  questions: Dialogue["questions"],
  registeredPaths: readonly string[],
  identities: AssistantOwnerIdentityContext,
  language: "de" | "en",
): Dialogue["questions"] {
  const options = [
    ...assistantOwnerChoices(identities, language).slice(0, 5),
    language === "de"
      ? "Andere E-Mail-Adresse angeben"
      : "Provide another email address",
  ];
  return questions.map((question) =>
    registeredPaths.includes(question.path) &&
    /^projectTemplates\.[^.]+\.accessProfile\.initialOwnerEmail$/.test(
      question.path,
    )
      ? { ...question, answerType: "requirements", multiple: false, options }
      : question,
  );
}
/** Existing template metadata and native settings share the question registry;
 * this declares UI associations, never permission to mutate a field. */
export function assistantTemplateQuestionPaths(
  current: Record<string, unknown>,
) {
  const fields = assistantQuestionFields();
  return Object.entries(
    objectValue(current.projectTemplates as JsonValue),
  ).flatMap(([key, value]) => {
    const kind = objectValue(value).kind;
    if (!["corporate", "public", "sandbox"].includes(String(kind))) return [];
    const prefix = `${kind === "sandbox" ? "sandboxes" : "landing_zones"}[*].`;
    return [
      `projectTemplates.${key}.accessProfile`,
      `projectTemplates.${key}.accessProfile.initialOwnerEmail`,
      ...fields
        .filter((field) => field.path.startsWith(prefix))
        .map(
          (field) =>
            `projectTemplates.${key}.settings.${field.path.slice(prefix.length)}`,
        ),
    ];
  });
}
