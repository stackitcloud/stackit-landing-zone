import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { assistantProposalValue } from "@lzc/contracts";
import {
  acceleratorInputs,
  assertBoundedJson,
  type CommonConfiguration,
  compileCommonConfiguration,
  defaultApplicationAccessProfile,
  editCommonInput,
  featureFieldCatalogue,
  type InputType,
  inputDefinition,
  type JsonValue,
  objectValue,
  projectTemplateDraftSchema,
  projectTemplateValues,
  readCommonConfiguration,
  regionalConnectivityType,
  templateParameterPolicySchema,
  validateInputType,
} from "@lzc/domain";
import { z } from "zod";
import { assistantServingResponseSchema } from "./serving-schema.js";

export const assistantEditorOperations = [
  "merge",
  "replace",
  "default",
] as const;
export type AssistantEditorOperation =
  (typeof assistantEditorOperations)[number];
export type AssistantEditorChange = {
  path: string;
  value: JsonValue;
  operation: AssistantEditorOperation;
};
const excludedInputs = new Set([
  "firewall_config",
  "firewall_admin_username",
  "firewall_bootstrap",
  "firewall_api_secret_version",
]);
const secretText =
  /-----BEGIN|Bearer\s+\S+|(?:password|passwd|token|secret|private_key|preshared_key)["']?\s*[:=]\s*["']?\S+/i;

export const assistantEditorInputs = acceleratorInputs
  .filter((input) => !input.sensitive && !excludedInputs.has(input.name))
  .map((input) => input.name);

export const assistantEditorPolicies: Record<
  string,
  {
    creationDecisions?: readonly string[];
    freeTextQuestions?: readonly string[];
  }
> = {
  audit_logs: {
    creationDecisions: [
      "audit_logs.retention_days",
      "audit_logs.acl",
      "audit_logs.s3_object_lock",
    ],
    freeTextQuestions: ["audit_logs.acl"],
  },
  observability: { freeTextQuestions: ["observability.acl"] },
};

export function assistantEditorProposalPath(path: string): string | null {
  const root = path.split(/[.[\]]/)[0];
  return root && assistantEditorInputs.includes(root) ? root : null;
}

function editorPath(path: string): {
  root: string;
  keys: string[];
  type: InputType;
  optional: boolean;
  canonical: string;
} {
  const [root, ...keys] = path.split(".");
  if (
    !root ||
    !assistantEditorInputs.includes(root) ||
    keys.some(
      (key) => !key || ["__proto__", "constructor", "prototype"].includes(key),
    )
  )
    throw new Error("assistant_editor_input_not_supported");
  const definition = inputDefinition(root);
  let type = definition.type;
  let optional = !definition.required;
  let canonical = root;
  for (const key of keys) {
    if (typeof type === "string")
      throw new Error("assistant_editor_path_invalid");
    if (type[0] === "map") {
      type =
        type[1] === "dynamic" && canonical === "connectivity_regions"
          ? regionalConnectivityType()
          : type[1];
      optional = true;
      canonical += "[*]";
    } else if (type[0] === "object" && Object.hasOwn(type[1], key)) {
      optional = type[2]?.includes(key) ?? false;
      type = type[1][key] ?? "dynamic";
      canonical += `.${key}`;
    } else throw new Error("assistant_editor_path_invalid");
  }
  return { root, keys, type, optional, canonical };
}

export function assistantEditorPaths(
  root: string,
  current: unknown,
  fields: readonly string[],
): string[] {
  const paths: string[] = [];
  const visit = (
    type: InputType,
    path: string,
    canonical: string,
    value: unknown,
  ): void => {
    if (!selected(canonical, fields)) return;
    paths.push(path);
    if (typeof type === "string" || value == null) return;
    if (type[0] === "object")
      for (const [key, child] of Object.entries(type[1]))
        visit(
          child,
          `${path}.${key}`,
          `${canonical}.${key}`,
          objectValue(value as JsonValue)[key],
        );
    else if (type[0] === "map")
      for (const [key, child] of Object.entries(
        objectValue(value as JsonValue),
      ))
        if (
          !key.includes(".") &&
          !["__proto__", "constructor", "prototype"].includes(key)
        )
          visit(
            type[1] === "dynamic" && canonical === "connectivity_regions"
              ? regionalConnectivityType()
              : type[1],
            `${path}.${key}`,
            `${canonical}[*]`,
            child,
          );
  };
  visit(inputDefinition(root).type, root, root, current);
  return paths;
}

export function assertAssistantEditorValue(
  value: unknown,
): asserts value is JsonValue {
  assertBoundedJson(value);
  if (secretText.test(JSON.stringify(value)))
    throw new Error("assistant_protected_value");
  const visit = (item: JsonValue): void => {
    if (typeof item === "string" && secretText.test(item))
      throw new Error("assistant_protected_value");
    if (Array.isArray(item)) item.forEach(visit);
    else if (item && typeof item === "object")
      Object.values(item).forEach(visit);
  };
  visit(value);
}

export function mergeAssistantEditorValue(
  before: JsonValue | undefined,
  patch: JsonValue,
): JsonValue {
  if (!patch || Array.isArray(patch) || typeof patch !== "object")
    return structuredClone(patch);
  return Object.fromEntries(
    Object.entries(patch).reduce(
      (entries, [key, value]) => {
        entries.set(
          key,
          mergeAssistantEditorValue(objectValue(before)[key], value),
        );
        return entries;
      },
      new Map(Object.entries(objectValue(before))),
    ),
  );
}

function selected(path: string, fields?: readonly string[]): boolean {
  return (
    !fields ||
    fields.some(
      (field) =>
        field === path ||
        field.startsWith(`${path}.`) ||
        field.startsWith(`${path}[*]`),
    )
  );
}

export function assistantEditorValueSchema(
  type: InputType,
  path: string,
  partial = true,
  fields?: readonly string[],
  options: {
    serving?: boolean;
    requiredFields?: readonly string[];
  } = {},
): z.ZodType {
  if (typeof type === "string") {
    if (
      type === "string" &&
      /^(?:connectivity|connectivity_regions\[\*\])\.dns_zones\[\*\]\.type$/.test(
        path,
      )
    )
      return z.enum(["primary", "secondary"]).nullable();
    if (type === "string") return z.string().max(4096).nullable();
    if (type === "bool") return z.boolean().nullable();
    if (type === "number") return z.number().finite().nullable();
    throw new Error("assistant_unreviewed_input_type");
  }
  if (
    path === "audit_logs.link_scopes" &&
    typeof type !== "string" &&
    (type[0] === "list" || type[0] === "set")
  )
    return z
      .array(
        assistantEditorValueSchema(
          type[1],
          `${path}[*]`,
          false,
          fields,
          options,
        ),
      )
      .max(100)
      .nullable()
      .describe(
        "null keeps the native organization-level default, with no project/folder inheritance. A request for an organization-wide Telemetry Link without explicit custom scope IDs uses null; do not materialize a redundant organization ID from saved context. [] explicitly disables those default links. Use explicit entries only for a requested manual scope selection and preserve user-supplied resource_type/resource_id values. With managed_resources=true, keep this null.",
      );
  if (type[0] === "list" || type[0] === "set")
    return (
      z
        .array(
          assistantEditorValueSchema(
            type[1],
            `${path}[*]`,
            false,
            fields,
            options,
          ),
        )
        // Native audit validation permits automatic ranges (null) or a reviewed
        // nonempty override. An empty list is invalid and is not the default.
        .min(path === "audit_logs.router_egress_cidrs" ? 1 : 0)
        .max(100)
        .nullable()
    );
  if (type[0] === "map")
    return z
      .record(
        z
          .string()
          .min(1)
          .max(128)
          .refine(
            (key) => !["__proto__", "constructor", "prototype"].includes(key),
          ),
        assistantEditorValueSchema(
          type[1] === "dynamic" && path === "connectivity_regions"
            ? regionalConnectivityType()
            : type[1],
          `${path}[*]`,
          options.serving ? false : partial,
          fields,
          options,
        ),
      )
      .nullable();
  const properties = Object.fromEntries(
    Object.entries(type[1])
      .filter(([key]) => selected(`${path}.${key}`, fields))
      .map(([key, child]) => {
        let schema = assistantEditorValueSchema(
          child,
          `${path}.${key}`,
          partial,
          fields,
          options,
        );
        const required =
          options.requiredFields?.includes(`${path}.${key}`) ||
          (!partial && !type[2]?.includes(key));
        if (options.serving && required && schema instanceof z.ZodNullable) {
          const nonNull = schema.unwrap();
          if (!(nonNull instanceof z.ZodType))
            throw new Error("assistant_native_schema_invalid");
          schema = nonNull;
        }
        if (!required) schema = schema.optional();
        return [key, schema];
      }),
  );
  return z.strictObject(properties).nullable();
}

function templateSettingsType(
  root: "landing_zones" | "sandboxes",
): ["object", Record<string, InputType>, string[]] {
  const type = inputDefinition(root).type;
  if (
    typeof type === "string" ||
    typeof type[1] === "string" ||
    type[1][0] !== "object"
  )
    throw new Error("assistant_project_contract_changed");
  const instanceFields = new Set([
    "project_name",
    "project_code",
    "owner_email",
    "project_owner_email",
    "corporate",
    "region",
  ]);
  return [
    "object",
    Object.fromEntries(
      Object.entries(type[1][1]).filter(([key]) => !instanceFields.has(key)),
    ),
    type[1][2]?.filter((key) => !instanceFields.has(key)) ?? [],
  ];
}

export const assistantTemplateFields = [
  ...new Set([
    ...Object.keys(templateSettingsType("landing_zones")[1]),
    ...Object.keys(templateSettingsType("sandboxes")[1]),
    "namespaceServices",
    "parameterPolicy",
    "accessProfile",
  ]),
];

const namespaceType = inputDefinition("landing_zone_namespace_services").type;
if (typeof namespaceType === "string" || namespaceType[0] !== "map")
  throw new Error("assistant_namespace_contract_changed");
const templateValueSchema = projectTemplateDraftSchema
  .omit({ id: true, key: true })
  .partial()
  .extend({
    settings: z
      .union([
        assistantEditorValueSchema(
          templateSettingsType("landing_zones"),
          "landing_zones[*]",
        ),
        assistantEditorValueSchema(
          templateSettingsType("sandboxes"),
          "sandboxes[*]",
        ),
      ])
      .optional(),
    namespaceServices: assistantEditorValueSchema(
      namespaceType[1],
      "landing_zone_namespace_services[*]",
    ).optional(),
    parameterPolicy: templateParameterPolicySchema
      .partial()
      .extend({
        fields: z
          .record(
            z.string(),
            z.union(
              templateParameterPolicySchema.shape.fields.valueType.options.map(
                (option) => option.partial(),
              ),
            ),
          )
          .optional(),
      })
      .optional(),
  });
const templatePatchSchema = z.record(
  z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  templateValueSchema,
);

function templateProposalSchema(fields?: readonly string[]) {
  if (!fields) return templateValueSchema;
  return templateValueSchema
    .omit({
      namespaceServices: true,
      parameterPolicy: true,
      accessProfile: true,
    })
    .extend({
      settings: z
        .union(
          (["landing_zones", "sandboxes"] as const).map((root) =>
            assistantEditorValueSchema(
              templateSettingsType(root),
              `${root}[*]`,
              true,
              [
                ...fields.map((field) => `${root}[*].${field}`),
                ...featureFieldCatalogue().flatMap(({ path }) =>
                  fields.some(
                    (field) =>
                      path.startsWith(`${root}[*].${field}.`) ||
                      path.startsWith(`${root}[*].${field}[*]`),
                  )
                    ? [path]
                    : [],
                ),
              ],
            ),
          ),
        )
        .optional(),
      ...(fields.includes("accessProfile")
        ? { accessProfile: templateValueSchema.shape.accessProfile }
        : {}),
      ...(fields.includes("namespaceServices")
        ? { namespaceServices: templateValueSchema.shape.namespaceServices }
        : {}),
      ...(fields.includes("parameterPolicy")
        ? { parameterPolicy: templateValueSchema.shape.parameterPolicy }
        : {}),
    });
}

export function assistantEditorChangeSchema(
  root: string,
  fields?: readonly string[],
  mode: "runtime" | "serving" = "runtime",
  current?: unknown,
  operation?: "merge" | "replace",
  requiredFieldsByKey?: Readonly<Record<string, readonly string[]>>,
): z.ZodType {
  if (root === "projectTemplates") {
    const template = templateProposalSchema(
      mode === "serving" ? fields : undefined,
    );
    return z.strictObject({
      path: z.literal(root),
      operation: operation
        ? z.literal(operation)
        : z.enum(["merge", "replace"]),
      value:
        mode === "serving"
          ? z
              .object(
                Object.fromEntries(
                  Object.keys(
                    z.record(z.string(), z.unknown()).parse(current ?? {}),
                  ).map((key) => [key, template.optional()]),
                ),
              )
              .catchall(
                z.strictObject({
                  ...template.shape,
                  name: projectTemplateDraftSchema.shape.name,
                  kind: projectTemplateDraftSchema.shape.kind,
                  region: projectTemplateDraftSchema.shape.region,
                  settings: template.shape.settings.unwrap(),
                }),
              )
          : templatePatchSchema,
    });
  }
  const definition = editorPath(root);
  const scoped =
    fields &&
    featureFieldCatalogue()
      .filter(
        (field) =>
          (field.path === definition.canonical ||
            field.path.startsWith(`${definition.canonical}.`) ||
            field.path.startsWith(`${definition.canonical}[*]`)) &&
          field.commonEditor !== "not-effective",
      )
      .some((field) => !fields.includes(field.path));
  let mergeValue = assistantEditorValueSchema(
    definition.type,
    definition.canonical,
    true,
    fields,
    {
      serving: mode === "serving",
      requiredFields:
        mode === "serving" && current == null
          ? (assistantEditorPolicies[definition.root]?.creationDecisions ?? [])
          : [],
    },
  );
  if (
    mode === "serving" &&
    requiredFieldsByKey &&
    Object.keys(requiredFieldsByKey).length &&
    typeof definition.type !== "string" &&
    definition.type[0] === "map"
  ) {
    const entryType = definition.type[1];
    const entryPath = `${definition.canonical}[*]`;
    mergeValue = z
      .object(
        Object.fromEntries(
          Object.entries(requiredFieldsByKey).map(([key, requiredFields]) => {
            const entry = assistantEditorValueSchema(
              entryType,
              entryPath,
              false,
              fields,
              {
                serving: true,
                requiredFields: requiredFields.map(
                  (field) => `${entryPath}.${field}`,
                ),
              },
            );
            return [
              key,
              entry instanceof z.ZodNullable ? entry.unwrap() : entry,
            ];
          }),
        ),
      )
      .catchall(
        assistantEditorValueSchema(entryType, entryPath, false, fields, {
          serving: true,
        }),
      );
  }
  if (
    mode === "serving" &&
    current == null &&
    mergeValue instanceof z.ZodNullable
  ) {
    const creationValue = mergeValue.unwrap();
    if (
      creationValue instanceof z.ZodObject &&
      typeof definition.type !== "string" &&
      definition.type[0] === "object"
    ) {
      const slots = new Set(
        Object.entries(definition.type[1])
          .filter(
            ([, type]) =>
              typeof type === "string" ||
              ((type[0] === "list" || type[0] === "set") &&
                typeof type[1] === "string"),
          )
          .map(([key]) => key),
      );
      mergeValue = z
        .strictObject(
          Object.fromEntries(
            Object.entries(creationValue.shape).map(([key, schema]) => [
              key,
              slots.has(key) ? z.nonoptional(schema) : schema,
            ]),
          ),
        )
        .nullable();
    }
  }
  if (mode === "serving")
    return z.strictObject({
      path: z.literal(root),
      operation: operation
        ? z.literal(operation)
        : z.enum([
            "merge",
            ...(!scoped ? ["replace" as const] : []),
            ...(!scoped && definition.optional ? ["default" as const] : []),
          ]),
      value: mergeValue,
    });
  return z.union([
    z.strictObject({
      path: z.literal(root),
      operation: z.literal("merge"),
      value: mergeValue,
    }),
    ...(!scoped
      ? [
          z.strictObject({
            path: z.literal(root),
            operation: z.literal("replace"),
            value: assistantEditorValueSchema(
              definition.type,
              definition.canonical,
              false,
            ),
          }),
          ...(definition.optional
            ? [
                z.strictObject({
                  path: z.literal(root),
                  operation: z.literal("default"),
                  value: z.null(),
                }),
              ]
            : []),
        ]
      : []),
  ]);
}

export function assistantEditorResponseSchema(schema: z.ZodType) {
  return assistantServingResponseSchema(z.toJSONSchema(schema));
}

export function assistantEditorCreationValue(
  path: string,
  value: JsonValue,
  current: unknown,
  provenance?: { organizationId: unknown; userSources: readonly string[] },
): JsonValue {
  if (current != null || path.includes(".") || path === "projectTemplates")
    return value;
  const type = editorPath(path).type;
  if (typeof type === "string" || type[0] !== "object" || value == null)
    return value;
  const constructorValue = objectValue(value);
  const scopes = constructorValue.link_scopes;
  // A generated copy of the native organization default adds no routing. Keep
  // explicitly pinned native fields/IDs and all nondefault or existing scopes.
  const defaultOrganizationScope =
    path === "audit_logs" &&
    typeof provenance?.organizationId === "string" &&
    Array.isArray(scopes) &&
    scopes.length === 1 &&
    objectValue(scopes[0]).resource_type === "organization" &&
    objectValue(scopes[0]).resource_id === provenance.organizationId &&
    !provenance.userSources.some(
      (source) =>
        source.includes(provenance.organizationId as string) ||
        /\blink_scopes\b/i.test(source),
    );
  // Nullable optional constructor slots represent native defaults, not overrides.
  return Object.fromEntries(
    Object.entries(objectValue(value)).filter(
      ([key, item]) =>
        (item !== null || !type[2]?.includes(key)) &&
        !(key === "link_scopes" && defaultOrganizationScope) &&
        // A fresh audit draft keeps legacy scope through its native false
        // default. Do not add an unrelated coverage override to old requests.
        !(
          path === "audit_logs" &&
          key === "managed_resources" &&
          item === false
        ),
    ),
  );
}

export function validateAssistantEditorChange(
  change: AssistantEditorChange,
): void {
  assertAssistantEditorValue(change.value);
  assistantEditorChangeSchema(change.path).parse(change);
  if (
    change.path !== "projectTemplates" &&
    change.operation === "replace" &&
    validateInputType(change.value, editorPath(change.path).type, change.path)
      .length
  )
    throw new Error("assistant_invalid_editor_value");
  if (
    change.path === "rm_folders" &&
    Object.values(objectValue(change.value)).some((folder) => {
      const description = objectValue(folder).description;
      return (
        description !== undefined && description !== null && description !== ""
      );
    })
  )
    throw new Error("assistant_folder_description_unsupported");
}

export function assistantEditorPublicValues(
  draft: CommonConfiguration,
): Record<string, JsonValue> {
  const values = compileCommonConfiguration(draft);
  const result: Record<string, JsonValue> = {};
  for (const root of assistantEditorInputs) {
    const value =
      (root === "labels" ? draft.features.identity.labels : values[root]) ??
      null;
    assertAssistantEditorValue(value);
    result[root] = structuredClone(value);
  }
  if (draft.projectTemplates !== undefined) {
    const templates = projectTemplateValues(draft);
    assertAssistantEditorValue(templates);
    result.projectTemplates = templates;
  }
  return result;
}

export function validateAssistantEditorSources(
  change: AssistantEditorChange,
  current: Record<string, unknown>,
  userSources: readonly string[],
  productValues: readonly string[],
): void {
  const sourceValues = { ...current };
  if (current["assistant.owner_email_is_template_default"] === true)
    delete sourceValues.owner_email;
  const saved = JSON.stringify(sourceValues) ?? "";
  const existing =
    JSON.stringify(assistantProposalValue(current, change.path)) ?? "";
  const allowed = (value: string) =>
    saved.includes(value) ||
    userSources.some((source) => source.includes(value)) ||
    productValues.includes(value);
  const visit = (value: JsonValue, key: string): void => {
    if (typeof value === "string") {
      const references =
        value.match(
          /\b[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}\b|\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?\b|\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
        ) ?? [];
      const address = value.split("/")[0] ?? "";
      if (
        references.some((reference) => !allowed(reference)) ||
        ((z.ipv6().safeParse(address).success ||
          /^(?:issuer|issuer_uri|issuer_url|jwks_uri|jwks_url|audiences?)$/.test(
            key,
          )) &&
          !allowed(value)) ||
        (/(?:^|_)(?:id|uuid)$/.test(key) && !allowed(value)) ||
        (/(?:^|_)(?:flavor|zone|availability_zones|machine_type|volume_type|plan_name|performance_class)$/.test(
          key,
        ) &&
          !existing.includes(value) &&
          !userSources.some((source) => source.includes(value)) &&
          !productValues.includes(value))
      )
        throw new Error("assistant_editor_value_unconfirmed");
    } else if (Array.isArray(value)) {
      for (const item of value) visit(item, key);
    } else if (value) {
      for (const [child, item] of Object.entries(value)) visit(item, child);
    }
  };
  visit(change.value, change.path);
}

export function applyAssistantEditorChange(
  input: CommonConfiguration,
  change: AssistantEditorChange,
): CommonConfiguration {
  validateAssistantEditorChange(change);
  if (change.path === "projectTemplates") {
    const next = readCommonConfiguration(input);
    if (next.projectTemplates === undefined)
      throw new Error("assistant_platform_draft_required");
    const before = Object.fromEntries(
      next.projectTemplates.map((template) => [template.key, template]),
    );
    const patches = templatePatchSchema.parse(change.value);
    const templates = change.operation === "merge" ? { ...before } : {};
    for (const [key, patch] of Object.entries(patches)) {
      const previous = before[key];
      assertAssistantEditorValue(patch);
      if (previous) assertAssistantEditorValue(previous);
      const merged =
        change.operation === "merge"
          ? mergeAssistantEditorValue(previous, patch)
          : patch;
      templates[key] = projectTemplateDraftSchema.parse({
        ...(!previous && objectValue(merged).kind !== "sandbox"
          ? {
              accessProfile: defaultApplicationAccessProfile(
                String(next.features.identity.owner_email ?? ""),
              ),
            }
          : {}),
        ...objectValue(merged),
        ...(patch.accessProfile ? { accessProfile: patch.accessProfile } : {}),
        id: previous?.id ?? randomUUID(),
        key,
      });
    }

    next.projectTemplates = Object.values(templates);
    return readCommonConfiguration(next);
  }
  const path = editorPath(change.path);
  const values = compileCommonConfiguration(input);
  const previousRoot =
    values[path.root] === undefined
      ? inputDefinition(path.root).default
      : values[path.root];
  const before = path.keys.reduce<JsonValue | undefined>(
    (value, key) => objectValue(value)[key],
    previousRoot,
  );
  const after =
    change.operation === "default"
      ? undefined
      : change.operation === "merge"
        ? mergeAssistantEditorValue(before, change.value)
        : structuredClone(change.value);
  const rootValue = path.keys.length
    ? structuredClone(objectValue(previousRoot))
    : after;
  if (path.keys.length) {
    let target = objectValue(rootValue);
    for (const key of path.keys.slice(0, -1)) {
      if (
        !target[key] ||
        typeof target[key] !== "object" ||
        Array.isArray(target[key])
      )
        throw new Error("assistant_editor_parent_missing");
      target = objectValue(target[key]);
    }
    const key = path.keys.at(-1);
    if (!key) throw new Error("assistant_editor_path_invalid");
    if (after === undefined) delete target[key];
    else target[key] = after;
  }
  if (
    path.root === "audit_logs" &&
    previousRoot == null &&
    rootValue != null &&
    ["retention_days", "acl", "s3_object_lock"].some(
      (key) => !Object.hasOwn(objectValue(rootValue), key),
    )
  )
    throw new Error("assistant_audit_creation_requires_retention_acl_lock");
  if (path.root === "audit_logs" && rootValue != null) {
    const audit = objectValue(rootValue);
    if (
      previousRoot == null &&
      (typeof audit.retention_days !== "number" ||
        !Array.isArray(audit.acl) ||
        typeof audit.s3_object_lock !== "boolean")
    )
      throw new Error("assistant_audit_creation_requires_retention_acl_lock");
    if (
      typeof audit.retention_days === "number" &&
      (!Number.isInteger(audit.retention_days) ||
        audit.retention_days < 1 ||
        (audit.s3_object_lock !== false && audit.retention_days > 365))
    )
      throw new Error("assistant_audit_retention_invalid");
  }
  if (path.root === "landing_zones" || path.root === "sandboxes") {
    const next = readCommonConfiguration(input);
    if (next.projectTemplates !== undefined)
      throw new Error("assistant_project_instances_not_in_platform_draft");
    if (rootValue === undefined) delete next.features.projects[path.root];
    else next.features.projects[path.root] = rootValue;
    if (path.root === "landing_zones")
      next.identities.landingZones = Object.fromEntries(
        Object.keys(objectValue(rootValue)).map((key) => [
          key,
          next.identities.landingZones[key] ?? randomUUID(),
        ]),
      );
    else {
      const old = Array.isArray(previousRoot) ? previousRoot : [];
      const items = Array.isArray(rootValue) ? rootValue : [];
      const reserved = new Set<number>();
      const positions = items.map((item, index) => {
        const position =
          !reserved.has(index) && isDeepStrictEqual(old[index], item)
            ? index
            : old.findIndex(
                (entry, position) =>
                  !reserved.has(position) && isDeepStrictEqual(item, entry),
              );
        if (position >= 0) reserved.add(position);
        return position;
      });
      items.forEach((item, index) => {
        if (positions[index] !== -1) return;
        const name = objectValue(item).project_name;
        const candidates = old.flatMap((entry, position) =>
          !reserved.has(position) &&
          name != null &&
          objectValue(entry).project_name === name
            ? [position]
            : [],
        );
        if (candidates.length === 1) {
          positions[index] = candidates[0] ?? -1;
          reserved.add(candidates[0] ?? -1);
        }
      });
      next.identities.sandboxes = items.map((_item, index) => {
        let previousIndex = positions[index] ?? -1;
        const remaining = old.flatMap((_, position) =>
          !reserved.has(position) ? [position] : [],
        );
        if (previousIndex < 0 && old.length === items.length) {
          previousIndex = remaining.includes(index)
            ? index
            : remaining.length === 1
              ? (remaining[0] ?? -1)
              : -1;
          if (previousIndex >= 0) reserved.add(previousIndex);
        }
        if (previousIndex < 0 && remaining.length)
          throw new Error("assistant_ambiguous_sandbox_identity");
        return input.identities.sandboxes[previousIndex] ?? randomUUID();
      });
    }
    return readCommonConfiguration(next);
  }
  return editCommonInput(input, path.root, rootValue);
}

export type AssistantAuditChoices = {
  retention_days?: number;
  acl?: string[];
  s3_object_lock?: boolean;
};
const auditChoiceQuestions = {
  de: {
    retention_days:
      "Wie viele Tage sollen die Audit-Protokolle aufbewahrt werden?",
    acl: "Aus welchen IP-Netzen soll auf die Audit-Protokolle zugegriffen werden? Bitte gib deine tatsächlichen CIDRs an.",
    s3_object_lock:
      "Soll Object Lock für das Audit-Archiv ausdrücklich aktiviert oder deaktiviert werden?",
  },
  en: {
    retention_days: "For how many days should the audit logs be retained?",
    acl: "Which IP networks should access the audit logs? Please provide your actual CIDRs.",
    s3_object_lock:
      "Should Object Lock for the audit archive explicitly be enabled or disabled?",
  },
} as const;

const auditChoiceExplanations = {
  en: "The new audit draft needs your explicit retention, access-network and Object Lock decisions. Nothing has been saved or executed.",
  de: "Für den neuen Audit-Entwurf brauche ich deine ausdrücklichen Entscheidungen zu Aufbewahrung, Zugriffsnetzen und Object Lock. Noch nichts gespeichert oder ausgeführt.",
} as const;

/** Ground new audit choices in audit-related USER turns, never saved defaults,
 * another component's networks, or values asserted by an assistant. */
export function assistantAuditCreationChoices(
  message: string,
  history: { role: "user" | "assistant"; content: string }[],
): AssistantAuditChoices {
  const choices: AssistantAuditChoices = {};
  const auditContext = (text: string) =>
    /audit|object[-_ ]?lock|s3_object_lock|retention_days/i.test(text);
  const turns = [...history, { role: "user" as const, content: message }];
  for (let index = 0; index < turns.length; index++) {
    const turn = turns[index];
    if (
      turn?.role === "assistant" &&
      turn.content.startsWith(
        "The user explicitly discarded the preceding proposal. This turn is closed:",
      )
    ) {
      delete choices.retention_days;
      delete choices.acl;
      delete choices.s3_object_lock;
      continue;
    }
    if (turn?.role !== "user") continue;
    const previous =
      turns[index - 1]?.role === "assistant" ? turns[index - 1]!.content : "";
    if (
      index !== turns.length - 1 &&
      !auditContext(turn.content) &&
      !auditContext(previous)
    )
      continue;
    let text = turn.content.trim();
    for (const questions of Object.values(auditChoiceQuestions))
      for (const question of Object.values(questions))
        for (const separator of ["\nMeine Antwort: ", "\nMy answer: "])
          if (text.startsWith(question + separator))
            text = text.slice((question + separator).length).trim();
    const pending = (key: keyof AssistantAuditChoices) =>
      Object.values(auditChoiceQuestions).some((q) =>
        previous.includes(q[key]),
      ) ||
      (!Object.values(auditChoiceExplanations).some((explanation) =>
        previous.startsWith(explanation + "\n"),
      ) &&
        auditContext(previous) &&
        (key === "acl"
          ? /\bACL\b|Zugriffsnetze|access networks/i.test(previous)
          : key === "retention_days"
            ? /Aufbewahrung|retention|retained/i.test(previous)
            : /object[-_ ]?lock|s3_object_lock/i.test(previous)));
    const days = [
      ...text.matchAll(
        /\b(\d+)\s*(?:Tage?n?|days?)\b|\bretention_days\s*[:=]\s*(\d+)\b/gi,
      ),
    ].map((m) => Number(m[1] ?? m[2]));
    if (!days.length && pending("retention_days") && /^\d+$/.test(text))
      days.push(Number(text));
    if (days.length) {
      const unique = [...new Set(days)];
      if (
        unique.length === 1 &&
        Number.isSafeInteger(unique[0]) &&
        unique[0]! > 0
      )
        choices.retention_days = unique[0]!;
      else delete choices.retention_days;
    }
    const aclLabel =
      /\bacl\b|Zugriffsnetze|Zugriff\s+(?:aus|nur|ausschließlich)|access\s+(?:networks?|from)/i;
    if (aclLabel.test(text) || pending("acl")) {
      const parts = text.split(
        /object[-_ ]?lock|s3_object_lock|router_egress_cidrs|\bRouter\b|;|\n/i,
      );
      const aclText =
        parts.find((part) => aclLabel.test(part)) ??
        (pending("acl") ? text : "");
      const candidates =
        aclText.match(
          /(?:[0-9a-fA-F:.]+\/\d{1,3})|(?:(?:\d{1,3}\.){3}\d{1,3})/g,
        ) ?? [];
      const networks = candidates.filter(
        (value) =>
          z.cidrv4().safeParse(value).success ||
          z.cidrv6().safeParse(value).success ||
          z.ipv4().safeParse(value).success,
      );
      if (candidates.length && networks.length === candidates.length)
        choices.acl = [...new Set(networks)];
      else if (candidates.length) delete choices.acl;
      else if (
        /\bacl\s*[:=]\s*\[\s*\]/i.test(text) ||
        (pending("acl") && /^\[\s*\]$/.test(text))
      )
        choices.acl = [];
    }
    const label = "(?:object[-_ ]?lock|s3_object_lock)";
    const prefix =
      "(?:bitte\\s+|ausdrücklich\\s+|explicitly\\s+|please\\s+|ist\\s+|is\\s+|auf\\s+|to\\s+|soll\\s+){0,3}";
    const direct = text.match(
      new RegExp(
        label +
          "\\s*(?:[=:?]\\s*)?" +
          prefix +
          "(nicht\\s+|not\\s+)?(deaktivieren|deaktiviert|disabled|disable|aktivieren|aktiviert|enabled|enable|nein|false|off|aus|yes|true|on|ja|an|ein)\\b",
        "i",
      ),
    );
    if (direct) {
      const negative = /^(?:deaktiv|disabl|nein|false|off|aus)/i.test(
        direct[2] ?? "",
      );
      choices.s3_object_lock = direct[1] ? negative : !negative;
    } else if (
      new RegExp(
        "\\b(?:ohne|kein(?:e[nr]?)?|without|no)\\s+" + label + "\\b",
        "i",
      ).test(text)
    )
      choices.s3_object_lock = false;
    else if (new RegExp("\\b(?:mit|with)\\s+" + label + "\\b", "i").test(text))
      choices.s3_object_lock = true;
    else if (pending("s3_object_lock")) {
      if (
        /^(?:ja|yes|true|on|an|ein|enable|enabled|aktivieren|aktiviert)[.!]?$/i.test(
          text,
        )
      )
        choices.s3_object_lock = true;
      if (
        /^(?:nein|no|false|off|aus|disable|disabled|deaktivieren|deaktiviert)[.!]?$/i.test(
          text,
        )
      )
        choices.s3_object_lock = false;
    }
  }
  return choices;
}

export function assistantAuditCreationQuestions(
  choices: AssistantAuditChoices,
  language: "de" | "en" = "de",
) {
  const labels = auditChoiceQuestions[language];
  return {
    explanation: auditChoiceExplanations[language],
    questions: (Object.keys(labels) as (keyof AssistantAuditChoices)[])
      .filter((key) => choices[key] === undefined)
      .map((key) => ({
        path: `audit_logs.${key}`,
        text: labels[key],
        options:
          key === "s3_object_lock"
            ? language === "en"
              ? ["Enable", "Disable"]
              : ["Aktivieren", "Deaktivieren"]
            : [],
      })),
  };
}

/** Resume only a literal answer to an exact, still-open server question set. */
export function assistantAuditPendingReply(
  message: string,
  history: { role: "user" | "assistant"; content: string }[],
) {
  const previous = history.at(-1);
  if (previous?.role !== "assistant") return null;
  const before = assistantAuditCreationChoices("", history);
  for (const language of ["de", "en"] as const) {
    const pending = assistantAuditCreationQuestions(before, language);
    if (
      !pending.questions.length ||
      previous.content !==
        pending.explanation +
          "\n" +
          pending.questions.map((q) => q.text).join("\n")
    )
      continue;
    let answer = message.trim();
    for (const question of pending.questions)
      for (const separator of ["\nMeine Antwort: ", "\nMy answer: "])
        if (answer.startsWith(question.text + separator))
          answer = answer.slice((question.text + separator).length).trim();
    const fields = new Set(pending.questions.map((q) => q.path));
    const literal =
      (fields.has("audit_logs.retention_days") &&
        /^\d+(?:\s*(?:Tage?n?|days?))?[.!]?$/i.test(answer)) ||
      (fields.has("audit_logs.acl") &&
        (z.cidrv4().safeParse(answer).success ||
          z.cidrv6().safeParse(answer).success ||
          /^\[\s*\]$/.test(answer))) ||
      (fields.has("audit_logs.s3_object_lock") &&
        /^(?:ja|nein|yes|no|true|false|on|off|an|aus|enable|enabled|disable|disabled|aktivieren|aktiviert|deaktivieren|deaktiviert)[.!]?$/i.test(
          answer,
        ));
    if (literal)
      return {
        language,
        choices: assistantAuditCreationChoices(message, history),
      };
  }
  return null;
}
