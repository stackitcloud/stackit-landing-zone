import { type JsonValue, objectValue } from "@lzc/domain";
import { assistantQuestionFields } from "./dialogue.js";
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
