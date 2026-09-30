import { z } from "zod";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
export type Values = { [key: string]: JsonValue };
export type Template = {
  id: string;
  source: string;
  sha256: string;
  values: Values;
};
export type ProjectDraft = {
  id: string;
  sourceKey: string | null;
  key: string;
  name: string;
  code: string;
  owner: string;
  environment: string;
  secretsManager: boolean;
};
export type SandboxDraft = {
  id: string;
  sourceIndex: number | null;
  name: string;
  owner: string;
};
export type ConfigurationDraft = {
  name: string;
  company: string;
  companyCode: string;
  organization: string;
  owner: string;
  region: string;
  projects: ProjectDraft[];
  sandboxes: SandboxDraft[];
};
// Shape validation also accepts incomplete edits during an OAuth round trip.
export const draftShape = z.object({
  name: z.string().max(4096),
  company: z.string().max(4096),
  companyCode: z.string().max(4096),
  organization: z.string().max(4096),
  owner: z.string().max(4096),
  region: z.string().max(4096),
  projects: z
    .array(
      z.object({
        id: z.string().max(4096),
        sourceKey: z.string().max(4096).nullable(),
        key: z.string().max(4096),
        name: z.string().max(4096),
        code: z.string().max(4096),
        owner: z.string().max(4096),
        environment: z.string().max(4096),
        secretsManager: z.boolean(),
      }),
    )
    .max(1000),
  sandboxes: z
    .array(
      z.object({
        id: z.string().max(4096),
        sourceIndex: z.number().int().nonnegative().nullable(),
        name: z.string().max(4096),
        owner: z.string().max(4096),
      }),
    )
    .max(1000),
});
export type DraftIssue = { field: string; message: string };
export function objectValue(value: JsonValue | undefined): Values {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}
export function textValue(value: JsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}
export function createDraft(template: Template): ConfigurationDraft {
  if (template.id !== "standalone")
    throw new Error("Template editor not supported yet");
  const v = template.values;
  return {
    name: "Meine Landing Zone",
    company: textValue(v.company_name),
    companyCode: textValue(v.company_code),
    organization: textValue(v.organization_id),
    owner: textValue(v.owner_email),
    region: textValue(v.region),
    projects: Object.entries(objectValue(v.landing_zones)).map(
      ([key, value]) => {
        const p = objectValue(value);
        return {
          id: key,
          sourceKey: key,
          key,
          name: textValue(p.project_name),
          code: textValue(p.project_code),
          owner: textValue(p.owner_email),
          environment: textValue(p.env) || "dev",
          secretsManager: p.secretsmanager_enabled !== false,
        };
      },
    ),
    sandboxes: (Array.isArray(v.sandboxes) ? v.sandboxes : []).map(
      (value, index) => {
        const p = objectValue(value);
        return {
          id: `sandbox-${index}`,
          sourceIndex: index,
          name: textValue(p.project_name),
          owner: textValue(p.project_owner_email),
        };
      },
    ),
  };
}
export function validateDraft(draft: ConfigurationDraft): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const add = (field: string, message: string) =>
    issues.push({ field, message });
  const required = (field: string, value: string) => {
    if (!value.trim()) add(field, "Bitte ausfüllen.");
    else if (value.length > 64)
      add(field, "Bitte auf höchstens 64 Zeichen kürzen.");
  };
  const email = (field: string, value: string) => {
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ||
      /@example\.(com|org|net)$/i.test(value)
    )
      add(field, "Bitte eine eigene gültige E-Mail-Adresse eintragen.");
  };
  const code = (field: string, value: string) => {
    if (!/^[a-z][a-z0-9-]{0,15}$/.test(value))
      add(
        field,
        "1–16 Kleinbuchstaben, Ziffern oder Bindestriche; mit einem Buchstaben beginnen.",
      );
  };
  required("name", draft.name);
  required("company", draft.company);
  code("companyCode", draft.companyCode);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      draft.organization,
    ) ||
    /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(draft.organization)
  )
    add(
      "organization",
      "Bitte die Organisations-ID aus deinem STACKIT Portal eintragen.",
    );
  email("owner", draft.owner);
  if (!["eu01", "eu02"].includes(draft.region))
    add("region", "Bitte eine unterstützte Region auswählen.");
  const keys = new Set<string>();
  for (const p of draft.projects) {
    const prefix = `project.${p.id}`;
    required(`${prefix}.name`, p.name);
    code(`${prefix}.code`, p.code);
    code(`${prefix}.key`, p.key);
    email(`${prefix}.owner`, p.owner);
    if (keys.has(p.key))
      add(`${prefix}.key`, "Diese Kennung wird bereits verwendet.");
    keys.add(p.key);
    if (!["dev", "test", "staging", "prod"].includes(p.environment))
      add(`${prefix}.environment`, "Bitte eine Umgebung auswählen.");
  }
  for (const s of draft.sandboxes) {
    required(`sandbox.${s.id}.name`, s.name);
    email(`sandbox.${s.id}.owner`, s.owner);
  }
  if (!draft.projects.length && !draft.sandboxes.length)
    add("projects", "Mindestens ein Projekt oder eine Sandbox hinzufügen.");
  return issues;
}

// Copy all untouched attributes. The editor only supports standalone; a network
// template must never be silently flattened into this subset.
export function buildConfiguration(
  template: Template,
  draft: ConfigurationDraft,
): Values {
  if (template.id !== "standalone")
    throw new Error("Template editor not supported yet");
  const source = structuredClone(template.values);
  const originalProjects = objectValue(source.landing_zones);
  const originalSandboxes = Array.isArray(source.sandboxes)
    ? source.sandboxes
    : [];
  return {
    ...source,
    company_name: draft.company,
    company_code: draft.companyCode,
    organization_id: draft.organization,
    owner_email: draft.owner,
    region: draft.region,
    landing_zones: Object.fromEntries(
      draft.projects.map((p) => [
        p.key,
        {
          ...objectValue(
            p.sourceKey === null ? undefined : originalProjects[p.sourceKey],
          ),
          project_name: p.name,
          project_code: p.code,
          owner_email: p.owner,
          env: p.environment,
          corporate: false,
          secretsmanager_enabled: p.secretsManager,
        },
      ]),
    ),
    sandboxes: draft.sandboxes.map((s) => ({
      ...objectValue(
        s.sourceIndex === null ? undefined : originalSandboxes[s.sourceIndex],
      ),
      project_name: s.name,
      project_owner_email: s.owner,
    })),
  };
}
