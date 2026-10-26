import {
  type ApplicationAccessProfile,
  defaultApplicationAccessProfile,
} from "./application-access.js";
import type { JsonValue, Values } from "./configuration.js";
import type { ProjectTemplateDraft } from "./project-templates.js";
import type { TemplateParameterPolicy } from "./template-parameters.js";

export type ApplicationAccessTransitionPatch = {
  accessProfile: ApplicationAccessProfile;
  settings?: Values;
  parameterPolicy?: TemplateParameterPolicy;
};

/** Preview only: applying this one patch requires a separate user confirmation. */
export function previewApplicationAccessTransition(
  template: ProjectTemplateDraft,
) {
  if (template.accessProfile || template.kind === "sandbox")
    throw new Error(
      "Nur eine bestehende Projektvorlage ohne Rechteprofil kann umgestellt werden.",
    );
  const settings = structuredClone(template.settings);
  const removed: { path: string; value: JsonValue }[] = [];
  for (const key of [
    "custom_roles",
    "role_assignments",
    "automation_role",
    "initial_owner_email",
  ] as const) {
    if (Object.hasOwn(settings, key)) {
      removed.push({
        path: `settings.${key}`,
        value: settings[key] as JsonValue,
      });
      delete settings[key];
    }
  }
  const parameterPolicy = template.parameterPolicy
    ? structuredClone(template.parameterPolicy)
    : undefined;
  if (
    parameterPolicy &&
    Object.hasOwn(parameterPolicy.fields, "role_assignments")
  ) {
    removed.push({
      path: "parameterPolicy.fields.role_assignments",
      value: parameterPolicy.fields.role_assignments as JsonValue,
    });
    delete parameterPolicy.fields.role_assignments;
  }
  const patch: ApplicationAccessTransitionPatch = {
    settings,
    accessProfile: defaultApplicationAccessProfile(),
    ...(parameterPolicy ? { parameterPolicy } : {}),
  };
  return { removed, patch };
}
