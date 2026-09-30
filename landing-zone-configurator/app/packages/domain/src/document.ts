import { z } from "zod";
import catalogue from "./catalogue.json" with { type: "json" };
import {
  buildConfiguration,
  type ConfigurationDraft,
  draftShape,
  type Template,
  validateDraft,
} from "./configuration.js";

const template = catalogue.templates.find(
  (t) => t.id === "standalone",
) as Template;
export const configurationId = z.uuid();
export const savedDraftSchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
    kind: z.literal("landing-zone-configurator-configuration"),
    id: configurationId,
    template: z
      .object({
        id: z.literal("standalone"),
        source: z.string(),
        sha256: z.string(),
      })
      .strict(),
    draft: draftShape,
  })
  .strict();
export type SavedDraft = z.infer<typeof savedDraftSchema>;
export function savedDraft(id: string, draft: ConfigurationDraft): SavedDraft {
  return readSavedDraft({
    schemaVersion: draft.folders ? 2 : 1,
    kind: "landing-zone-configurator-configuration",
    id,
    template: {
      id: template.id,
      source: template.source,
      sha256: template.sha256,
    },
    draft,
  });
}
export function readSavedDraft(input: unknown): SavedDraft {
  const parsed = savedDraftSchema.parse(input);
  if ((parsed.schemaVersion === 2) !== (parsed.draft.folders !== undefined))
    throw new Error("Folder configuration requires document version 2");
  if (
    parsed.template.sha256 !== template.sha256 ||
    parsed.template.source !== template.source
  )
    throw new Error("Unsupported template revision");
  if (validateDraft(parsed.draft).length)
    throw new Error("Invalid configuration");
  const projectKeys = new Set(
    Object.keys(template.values.landing_zones as object),
  );
  const projectIds = new Set<string>();
  const sandboxIds = new Set<string>();
  for (const project of parsed.draft.projects) {
    if (
      (project.sourceKey !== null && !projectKeys.has(project.sourceKey)) ||
      projectIds.has(project.id)
    )
      throw new Error("Invalid project identity");
    projectIds.add(project.id);
  }
  const sandboxes = template.values.sandboxes;
  for (const sandbox of parsed.draft.sandboxes) {
    if (
      sandboxIds.has(sandbox.id) ||
      (sandbox.sourceIndex !== null &&
        (!Array.isArray(sandboxes) || sandbox.sourceIndex >= sandboxes.length))
    )
      throw new Error("Invalid sandbox identity");
    sandboxIds.add(sandbox.id);
  }
  // Exercise the same deterministic mapping used by the editor. No arbitrary HCL/code accepted.
  buildConfiguration(template, parsed.draft);
  return parsed;
}

export function configurationValues(document: SavedDraft) {
  return buildConfiguration(template, readSavedDraft(document).draft);
}
