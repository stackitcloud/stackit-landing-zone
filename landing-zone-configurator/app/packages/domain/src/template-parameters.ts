import { z } from "zod";
import { type JsonValue, objectValue, type Values } from "./configuration.js";
import { assertBoundedJson } from "./features.js";

export const templateParameterFields = [
  {
    path: "env",
    label: "Umgebung / Stage",
    type: "string",
    sources: ["fixed", "input"],
  },
  {
    path: "secretsmanager_enabled",
    label: "STACKIT Secrets Manager",
    type: "boolean",
    sources: ["fixed", "input"],
  },
  {
    path: "observability.enabled",
    label: "STACKIT Observability",
    type: "boolean",
    sources: ["fixed", "input"],
  },
  {
    path: "observability.plan_name",
    label: "Observability-Leistungsklasse",
    type: "string",
    sources: ["fixed", "input"],
  },
  {
    path: "observability.acl",
    label: "Observability-Zugriffsquellen",
    type: "string-list",
    sources: ["fixed", "input", "binding"],
  },
  {
    path: "role_assignments",
    label: "Projektrollen der verantwortlichen Person",
    type: "role-assignments",
    sources: ["fixed", "context"],
  },
] as const;
export type TemplateParameterPath =
  (typeof templateParameterFields)[number]["path"];
const valueSchema = z.union([
  z.string(),
  z.boolean(),
  z.array(z.string()).max(100),
]);
const sourceSchema = z.discriminatedUnion("source", [
  z.strictObject({ source: z.literal("fixed") }),
  z.strictObject({
    source: z.literal("input"),
    required: z.boolean(),
    default: valueSchema.optional(),
    choices: z.array(z.string().min(1).max(512)).max(100).optional(),
    description: z.string().max(512).optional(),
  }),
  z.strictObject({
    source: z.literal("binding"),
    binding: z.literal("own-project-network"),
  }),
  z.strictObject({
    source: z.literal("context"),
    variable: z.literal("verified-project-owner"),
    roles: z.array(z.string().trim().min(1).max(256)).max(100),
  }),
]);
export const templateParameterPolicySchema = z.strictObject({
  schema_version: z.literal(1),
  fields: z.record(z.string(), sourceSchema),
});
export type TemplateParameterPolicy = z.infer<
  typeof templateParameterPolicySchema
>;
export type TemplateParameterSource = z.infer<typeof sourceSchema>;
export type ParameterizedTemplate = {
  kind: "public" | "corporate" | "sandbox";
  settings: Values;
  parameterPolicy?: TemplateParameterPolicy | undefined;
};
const defaults: Record<TemplateParameterPath, JsonValue> = {
  env: "dev",
  secretsmanager_enabled: true,
  "observability.enabled": false,
  "observability.plan_name": "Observability-Starter-EU01",
  "observability.acl": [],
  role_assignments: [],
};
export const projectRoleAssignmentSchema = z.strictObject({
  role: z.string().min(1).max(256),
  subject: z.string().min(1).max(512),
});
export const projectCustomRoleSchema = z.strictObject({
  name: z.string().min(1).max(256),
  description: z.string().max(2000),
  permissions: z.array(z.string().min(1).max(256)).max(2000),
});
function get(settings: Values, path: TemplateParameterPath): JsonValue {
  const [root, child] = path.split(".");
  const value = child
    ? objectValue(settings[root as string])[child]
    : settings[root as string];
  return value ?? structuredClone(defaults[path]);
}
function put(settings: Values, path: TemplateParameterPath, value: JsonValue) {
  const [root, child] = path.split(".");
  if (child)
    settings[root as string] = {
      ...objectValue(settings[root as string]),
      [child]: structuredClone(value),
    };
  else settings[root as string] = structuredClone(value);
}
function fieldFor(path: string) {
  const field = templateParameterFields.find((item) => item.path === path);
  if (!field)
    throw new Error(
      `Dieses Feld ist keine freigegebene Bestelleingabe: ${path}`,
    );
  return field;
}
function validValue(
  path: TemplateParameterPath,
  value: unknown,
  source?: TemplateParameterSource,
) {
  const field = fieldFor(path);
  if (field.type === "role-assignments") {
    z.array(projectRoleAssignmentSchema).max(100).parse(value);
    return;
  }
  if (field.type === "boolean" && typeof value !== "boolean")
    throw new Error(`${field.label}: Ein boolescher Wert ist erforderlich.`);
  if (
    field.type === "string" &&
    (typeof value !== "string" || !value.trim() || value.length > 512)
  )
    throw new Error(
      `${field.label}: Ein ausgefüllter Textwert ist erforderlich.`,
    );
  if (
    path === "env" &&
    (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,15}$/.test(value))
  )
    throw new Error(
      "Stage: 1–16 Kleinbuchstaben, Ziffern oder Bindestriche, beginnend mit einem Buchstaben.",
    );
  if (
    field.type === "string-list" &&
    (!Array.isArray(value) ||
      value.length > 100 ||
      value.some(
        (item) => typeof item !== "string" || !item.trim() || item.length > 512,
      ))
  )
    throw new Error(
      `${field.label}: Eine Liste ausgefüllter Textwerte ist erforderlich.`,
    );
  if (path === "observability.acl" && source?.source === "input") {
    if (
      !Array.isArray(value) ||
      !value.length ||
      value.some(
        (cidr) => !z.union([z.cidrv4(), z.cidrv6()]).safeParse(cidr).success,
      )
    )
      throw new Error(
        "Observability-Zugriffsquellen: Mindestens ein freigegebenes gültiges CIDR-Netz ist erforderlich; eine leere ACL wird nicht als Bestelleingabe zugelassen.",
      );
  }
  if (source?.source === "input" && source.choices) {
    const supplied = Array.isArray(value) ? value : [value];
    if (supplied.some((item) => !source.choices?.includes(item as string)))
      throw new Error(
        `${field.label}: Der Wert ist nicht in der freigegebenen Auswahl enthalten.`,
      );
  }
}
export function validateTemplateParameterPolicy(
  template: ParameterizedTemplate,
): void {
  assertBoundedJson(template);
  if (!template.parameterPolicy) return;
  const policy = templateParameterPolicySchema.parse(template.parameterPolicy);
  if (template.kind === "sandbox" && Object.keys(policy.fields).length)
    throw new Error(
      "Sandbox-Vorlagen unterstützen diese Bestellparameter noch nicht.",
    );
  for (const [path, source] of Object.entries(policy.fields)) {
    const field = fieldFor(path);
    if (!(field.sources as readonly string[]).includes(source.source))
      throw new Error(
        `${field.label}: Diese Wertquelle ist nicht freigegeben.`,
      );
    if (source.source === "context") {
      if (new Set(source.roles).size !== source.roles.length)
        throw new Error("Projektrollen: Doppelte Rollen sind nicht zulässig.");
      validValue(field.path, get(template.settings, field.path));
      continue;
    }
    if (source.source === "binding") {
      if (path !== "observability.acl" || template.kind !== "corporate")
        throw new Error(
          "Die Projektnetz-Bindung benötigt ein Corporate-Projekt und gilt nur für die Observability-ACL.",
        );
      const acl = get(template.settings, "observability.acl");
      if (!Array.isArray(acl) || acl.length)
        throw new Error(
          "Vor einer Projektnetz-Bindung müssen explizite Observability-ACL-Einträge entfernt werden.",
        );
      continue;
    }
    if (source.source === "fixed") {
      validValue(field.path, get(template.settings, field.path));
      continue;
    }
    if (field.type === "boolean" && source.choices)
      throw new Error(
        `${field.label}: Boolesche Parameter verwenden keine Text-Auswahlliste.`,
      );
    if (source.choices) {
      if (new Set(source.choices).size !== source.choices.length)
        throw new Error(
          `${field.label}: Doppelte Auswahlwerte sind nicht zulässig.`,
        );
      for (const choice of source.choices)
        validValue(
          field.path,
          field.type === "string-list" ? [choice] : choice,
          source,
        );
    }
    if (
      (path === "env" ||
        path === "observability.plan_name" ||
        path === "observability.acl") &&
      (!source.choices ||
        (!source.choices.length &&
          !(
            path === "observability.acl" &&
            source.required &&
            source.default === undefined
          )))
    )
      throw new Error(
        `${field.label}: Bestelleingaben benötigen eine freigegebene Auswahl.`,
      );
    if (source.default !== undefined)
      validValue(field.path, source.default, source);
    else if (!source.required)
      validValue(field.path, get(template.settings, field.path), source);
  }
}
export function resolveTemplateParameters(
  template: ParameterizedTemplate,
  inputs: Record<string, JsonValue> = {},
  context?: { verifiedStackitEmail: string },
) {
  assertBoundedJson({ template, inputs });
  validateTemplateParameterPolicy(template);
  const fields = template.parameterPolicy?.fields ?? {};
  for (const path of Object.keys(inputs)) {
    fieldFor(path);
    if (fields[path]?.source !== "input")
      throw new Error(
        `Dieses Feld darf bei der Bestellung nicht überschrieben werden: ${path}`,
      );
  }
  const settings = structuredClone(template.settings);
  const provenance: Record<
    string,
    {
      source: "fixed" | "input" | "default" | "binding" | "context";
      description: string;
    }
  > = {};
  const bindings: {
    path: TemplateParameterPath;
    binding: "own-project-network";
    status: "unresolved";
    description: string;
  }[] = [];
  const qualificationBlockers: string[] = [];
  const contextBindings: {
    path: TemplateParameterPath;
    variable: "verified-project-owner";
    roles: string[];
    status: "resolved" | "unresolved";
  }[] = [];
  for (const field of templateParameterFields) {
    if (template.kind === "sandbox") break;
    const source = fields[field.path];
    let value = get(settings, field.path);
    if (source?.source === "context") {
      const email = context
        ? z.email().parse(context.verifiedStackitEmail)
        : undefined;
      contextBindings.push({
        path: field.path,
        variable: source.variable,
        roles: source.roles,
        status: email ? "resolved" : "unresolved",
      });
      provenance[field.path] = {
        source: "context",
        description:
          "Projektverantwortliche Person aus der verifizierten STACKIT-Identität; keine frei überschreibbare Benutzereingabe.",
      };
      if (!source.roles.length)
        qualificationBlockers.push(
          "Projektrollen: Mindestens eine Rolle für die Kontextbindung auswählen.",
        );
      if (!email) {
        qualificationBlockers.push(
          "Die STACKIT-Identität der projektverantwortlichen Person wird erst bei der Instanziierung verifiziert.",
        );
        continue;
      }
      const existing = z.array(projectRoleAssignmentSchema).parse(value);
      value = [
        ...existing,
        ...source.roles
          .filter(
            (role) =>
              !existing.some(
                (assignment) =>
                  assignment.role === role && assignment.subject === email,
              ),
          )
          .map((role) => ({ role, subject: email })),
      ];
      put(settings, field.path, value);
      continue;
    }
    if (source?.source === "binding") continue;
    if (source?.source === "input") {
      if (Object.hasOwn(inputs, field.path)) {
        value = inputs[field.path] as JsonValue;
        provenance[field.path] = {
          source: "input",
          description:
            "Explizite Bestelleingabe innerhalb der Template-Policy.",
        };
      } else if (source.default !== undefined) {
        value = source.default;
        provenance[field.path] = {
          source: "default",
          description: "Vorauswahl der freigegebenen Bestelleingabe.",
        };
      } else if (source.required)
        throw new Error(`Pflichtangabe fehlt: ${field.label}`);
      else
        provenance[field.path] = {
          source: "default",
          description:
            "Optionale Eingabe verwendet den Vorgabewert der Vorlage.",
        };
      validValue(field.path, value, source);
    } else {
      validValue(field.path, value);
      provenance[field.path] = {
        source: "fixed",
        description:
          "Fest durch die Vorlage oder den Accelerator-Standard vorgegeben.",
      };
    }
    put(settings, field.path, value);
  }
  if (fields["observability.acl"]?.source === "binding") {
    if (
      template.kind !== "corporate" ||
      get(settings, "observability.enabled") !== true
    )
      throw new Error(
        "Die Projektnetz-Bindung benötigt ein Corporate-Netzwerk und eingeschaltetes STACKIT Observability.",
      );
    settings.observability = {
      ...objectValue(settings.observability),
      access_source: "project-network",
      acl: [],
    };
    bindings.push({
      path: "observability.acl",
      binding: "own-project-network",
      status: "unresolved",
      description:
        "Eigenes Projektnetz dieser Instanz; keine Adresse aufgelöst. Die am Observability-Dienst sichtbare öffentliche Quelladresse ist noch nicht nachgewiesen.",
    });
    provenance["observability.acl"] = {
      source: "binding",
      description:
        "Symbolische Ressourcenbindung; kein CIDR-Wert und keine ausführbare ACL.",
    };
    qualificationBlockers.push(
      "Observability filtert Internet-Quelladressen. Eine private Projekt-CIDR hinter NAT ist kein nachgewiesener Zugangsweg. Veröffentlichung und Ausführung dieser Bindung bleiben gesperrt.",
    );
  }
  return {
    settings,
    provenance,
    bindings,
    contextBindings,
    qualificationBlockers,
    executionEnabled: false as const,
    cloudAccess: false as const,
  };
}
export function templateParameterPreview(
  template: ParameterizedTemplate,
  inputs: Record<string, JsonValue> = {},
) {
  try {
    return {
      valid: true as const,
      result: resolveTemplateParameters(template, inputs),
    };
  } catch (error) {
    return {
      valid: false as const,
      error:
        error instanceof Error ? error.message : "Ungültige Bestelleingaben.",
    };
  }
}
