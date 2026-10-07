import inventory from "./accelerator-inputs.json" with { type: "json" };
import type { JsonValue, Values } from "./configuration.js";

export const supportedAcceleratorRevision =
  "a256f6896d11134fdc351786f1be5eba4e56b2e2";

// Curated functional groups; templates never determine feature availability.
export const featureGroups = {
  identity: {
    title: "Grundlagen",
    inputs: [
      "organization_id",
      "owner_email",
      "company_name",
      "company_code",
      "region",
      "platform_contract_namespace",
      "labels",
    ],
  },
  governance: {
    title: "Ordner und Organisationsrechte",
    inputs: [
      "rm_folder_parent_id",
      "rm_folders",
      "organization_owners",
      "organization_auditors",
    ],
  },
  management: {
    title: "Zentrale Betriebsdienste",
    inputs: ["observability", "audit_logs", "federated_identity_providers"],
  },
  network: {
    title: "Netzwerkbereiche, DNS und VPN",
    inputs: ["connectivity", "connectivity_regions"],
  },
  platform: {
    title: "Plattformdienste",
    inputs: ["devops", "platform_kubernetes"],
  },
  projects: {
    title: "Projekte und Namespace-Dienste",
    inputs: ["landing_zones", "sandboxes", "landing_zone_namespace_services"],
  },
  firewall: {
    title: "Firewall-Regeln und Initialisierung",
    inputs: [
      "firewall_config",
      "firewall_admin_username",
      "firewall_bootstrap",
      "firewall_api_secret_version",
    ],
  },
  credentials: {
    title: "Geschützte Deployment-Zugänge",
    inputs: [
      "platform_kubernetes_kube_config_override",
      "vpn_pre_shared_keys",
      "firewall_admin_password",
      "firewall_api_credentials",
    ],
  },
} as const;
export type FeatureGroup = keyof typeof featureGroups;
export type PublicFeatureGroup = Exclude<FeatureGroup, "credentials">;
export const publicFeatureGroups = Object.keys(featureGroups).filter(
  (key): key is PublicFeatureGroup => key !== "credentials",
);
export type InputType =
  | "string"
  | "number"
  | "bool"
  | "dynamic"
  | ["list" | "set" | "map", InputType]
  | ["object", Record<string, InputType>, string[]?];
type Defaults = { values?: Values; children?: Record<string, Defaults> };
export type AcceleratorInput = {
  name: string;
  type: InputType;
  required: boolean;
  sensitive: boolean;
  default?: JsonValue;
  nestedDefaults?: Defaults;
};
export const acceleratorInputs =
  inventory.variables as unknown as AcceleratorInput[];
export function inputDefinition(name: string): AcceleratorInput {
  const input = acceleratorInputs.find((entry) => entry.name === name);
  if (!input) throw new Error("Unknown Accelerator input");
  return input;
}
export function inputGroup(name: string): FeatureGroup {
  const group = Object.entries(featureGroups).find(([, definition]) =>
    (definition.inputs as readonly string[]).includes(name),
  );
  if (!group) throw new Error("Input has no feature assignment");
  return group[0] as FeatureGroup;
}

// map(any) is not a permission to store arbitrary data. Only fields actually
// forwarded by the regional root module calls are part of this contract.
export function regionalConnectivityType(): InputType {
  const single = inputDefinition("connectivity").type;
  if (typeof single === "string" || single[0] !== "object")
    throw new Error("Connectivity contract changed");
  const names = [
    "naming_pattern",
    "dns_zones",
    "network_areas",
    "firewalls",
    "vpn",
  ];
  return [
    "object",
    Object.fromEntries(
      names.map((name) => [name, single[1][name] as InputType]),
    ),
    names,
  ];
}

export type InputProblem = { path: string; code: string };
const dangerousKeys = new Set(["__proto__", "prototype", "constructor"]);
// Bound untrusted documents before recursion/Zod. Values and secret text are
// never included in diagnostics. Reject rather than strip unknown fields.
export function assertBoundedJson(input: unknown): asserts input is JsonValue {
  let nodes = 0;
  let characters = 0;
  const visit = (value: unknown, depth: number): void => {
    if (++nodes > 100_000 || depth > 32)
      throw new Error("Configuration too complex");
    if (typeof value === "string") {
      characters += value.length;
      if (characters > 2_000_000) throw new Error("Configuration too large");
      return;
    }
    if (value === null || typeof value === "boolean") return;
    if (typeof value === "number" && Number.isFinite(value)) return;
    if (typeof value !== "object")
      throw new Error("Expected JSON configuration");
    if (Array.isArray(value)) {
      for (const child of value) visit(child, depth + 1);
      return;
    }
    if (
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
      throw new Error("Expected plain configuration object");
    for (const [key, child] of Object.entries(value)) {
      if (dangerousKeys.has(key)) throw new Error("Reserved configuration key");
      characters += key.length;
      visit(child, depth + 1);
    }
  };
  visit(input, 0);
}
export function validateInputType(
  value: JsonValue,
  type: InputType,
  path: string,
): InputProblem[] {
  // OpenTofu's nullable values are retained. Required/non-null business rules
  // belong to validation, not a coercing/default-inserting parser.
  if (value === null) return [];
  if (typeof type === "string") {
    if (type === "dynamic") return [{ path, code: "unreviewed-dynamic-type" }];
    return typeof value === (type === "bool" ? "boolean" : type)
      ? []
      : [{ path, code: "wrong-type" }];
  }
  if (type[0] === "list" || type[0] === "set") {
    if (!Array.isArray(value)) return [{ path, code: "expected-list" }];
    return value.flatMap((item, index) =>
      validateInputType(item, type[1], `${path}[${index}]`),
    );
  }
  if (typeof value !== "object" || Array.isArray(value))
    return [{ path, code: "expected-object" }];
  if (type[0] === "map")
    return Object.entries(value).flatMap(([key, item]) =>
      validateInputType(
        item,
        type[1] === "dynamic" && path === "connectivity_regions"
          ? regionalConnectivityType()
          : type[1],
        `${path}.${key}`,
      ),
    );
  if (type[0] !== "object") throw new Error("Unsupported input type");
  const attributes = type[1];
  const optional = type[2] ?? [];
  const issues: InputProblem[] = [];
  for (const key of Object.keys(attributes)) {
    if (!Object.hasOwn(value, key) && !optional.includes(key))
      issues.push({ path: `${path}.${key}`, code: "missing-attribute" });
  }
  for (const [key, child] of Object.entries(value)) {
    const childType = Object.hasOwn(attributes, key)
      ? attributes[key]
      : undefined;
    if (!childType)
      issues.push({ path: `${path}.${key}`, code: "unknown-attribute" });
    else issues.push(...validateInputType(child, childType, `${path}.${key}`));
  }
  return issues;
}
export function validatePublicInputs(values: Values): InputProblem[] {
  assertBoundedJson(values);
  const issues: InputProblem[] = [];
  for (const [name, value] of Object.entries(values)) {
    const definition = acceleratorInputs.find((input) => input.name === name);
    if (!definition) issues.push({ path: name, code: "unknown-input" });
    else if (definition.sensitive)
      issues.push({ path: name, code: "secret-requires-server-binding" });
    else issues.push(...validateInputType(value, definition.type, name));
  }
  return issues;
}

function applyDefaults(
  value: JsonValue,
  type: InputType,
  defaults?: Defaults,
): JsonValue {
  if (value === null || typeof type === "string") return structuredClone(value);
  if (type[0] === "list" || type[0] === "set")
    return (value as JsonValue[]).map((item, index) =>
      applyDefaults(
        item,
        type[1],
        defaults?.children?.[String(index)] ?? defaults?.children?.[""],
      ),
    );
  if (type[0] === "map")
    return Object.fromEntries(
      Object.entries(value as Values).map(([key, item]) => [
        key,
        applyDefaults(item, type[1], defaults?.children?.[""]),
      ]),
    );
  if (type[0] !== "object") throw new Error("Unsupported input type");
  const result = structuredClone(value) as Values;
  for (const [key, fallback] of Object.entries(defaults?.values ?? {}))
    if (result[key] == null) result[key] = structuredClone(fallback);
  for (const [key, item] of Object.entries(result)) {
    const childType = type[1][key];
    if (childType)
      result[key] = applyDefaults(item, childType, defaults?.children?.[key]);
  }
  return result;
}
// Read-only projection for the UI; never serialize this instead of explicit inputs.
export function effectiveInput(
  values: Values,
  name: string,
): JsonValue | undefined {
  const definition = inputDefinition(name);
  if (definition.sensitive) return undefined;
  const explicit = Object.hasOwn(values, name)
    ? values[name]
    : definition.default;
  if (explicit === undefined) return undefined;
  return applyDefaults(explicit, definition.type, definition.nestedDefaults);
}

export type FeatureField = {
  path: string;
  group: FeatureGroup;
  sensitive: boolean;
  type: string;
  optional: boolean;
  // Coverage is explicit: importing a value does not imply an editor exists.
  commonEditor: "form" | "protected-binding-pending" | "not-effective";
};
export function featureFieldCatalogue(): FeatureField[] {
  const fields: FeatureField[] = [];
  for (const input of acceleratorInputs) {
    const visit = (type: InputType, path: string, optional: boolean) => {
      fields.push({
        path,
        group: inputGroup(input.name),
        sensitive: input.sensitive,
        type: typeof type === "string" ? type : type[0],
        optional,
        commonEditor: input.sensitive
          ? "protected-binding-pending"
          : path === "rm_folders[*].description"
            ? "not-effective"
            : "form",
      });
      if (typeof type === "string") return;
      if (type[0] === "object") {
        for (const [key, child] of Object.entries(type[1]))
          visit(child, `${path}.${key}`, (type[2] ?? []).includes(key));
      } else {
        const child =
          type[1] === "dynamic" && path === "connectivity_regions"
            ? regionalConnectivityType()
            : type[1];
        visit(child, `${path}[*]`, false);
      }
    };
    visit(input.type, input.name, !input.required);
  }
  return fields;
}
