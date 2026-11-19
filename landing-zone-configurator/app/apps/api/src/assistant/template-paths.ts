import { type JsonValue, objectValue } from "@lzc/domain";
import { assistantQuestionFields } from "./dialogue.js";
/** Virtual template settings use the same editable/question field registry as
 * native projects; no separate per-service picker/path catalogue. */
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
    return fields
      .filter((field) => field.path.startsWith(prefix))
      .map(
        (field) =>
          `projectTemplates.${key}.settings.${field.path.slice(prefix.length)}`,
      );
  });
}
