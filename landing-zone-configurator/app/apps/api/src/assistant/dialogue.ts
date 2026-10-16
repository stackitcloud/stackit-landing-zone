import {
  assessCommonConfiguration,
  type CommonConfiguration,
  compileCommonConfiguration,
  editorIssues,
  featureFieldCatalogue,
  inputDefinition,
  objectValue,
  readCommonConfiguration,
  setCommonInput,
} from "@lzc/domain";
import { z } from "zod";
import {
  applyAssistantEditorChange,
  assertAssistantEditorValue,
  assistantEditorOperations,
  validateAssistantEditorChange,
} from "./editor.js";
import {
  assistantFirewallPatchSchema,
  assistantFirewallsPatchSchema,
  mergeAssistantFirewall,
  validateAssistantFirewall,
} from "./firewall.js";

export const chatMessageSchema = z
  .string()
  .trim()
  .min(1)
  .max(4000)
  .refine(
    (text) =>
      !/(-----BEGIN|Bearer\s+\S+|(?:password|passwd|token|secret|private_key|preshared_key)\s*[:=]\s*\S+)/i.test(
        text,
      ),
    "protected_value_not_allowed",
  );

export const assistantNetworkAreaSchema = z.strictObject({
  name: z.string().min(1).max(128).optional(),
  ranges: z.array(z.cidrv4()).min(1).max(16),
  transfer_network: z.cidrv4(),
  min_prefix_length: z.number().int().min(0).max(32),
  max_prefix_length: z.number().int().min(0).max(32),
  default_prefix_length: z.number().int().min(0).max(32),
  default_nameservers: z.array(z.ipv4()).max(8).optional(),
});

export const assistantNetworkAreasSchema = z
  .record(
    z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    assistantNetworkAreaSchema,
  )
  .refine(
    (areas) => Object.keys(areas).length > 0 && Object.keys(areas).length <= 32,
  );

export const assistantFolderNamesSchema = z
  .record(
    z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    z.strictObject({ name: z.string().trim().min(1).max(40) }),
  )
  .refine(
    (folders) =>
      Object.keys(folders).length > 0 && Object.keys(folders).length <= 32,
  );

export const assistantEmailListSchema = z
  .array(z.email().max(254))
  .max(64)
  .refine((emails) => new Set(emails).size === emails.length);

export const assistantAccessPaths = [
  "organization_owners",
  "organization_auditors",
  "rm_folders[*].owner_emails",
  "rm_folders[*].reader_emails",
] as const;

export const assistantFolderPatchSchema = z
  .record(
    z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    z
      .strictObject({
        name: z.string().trim().min(1).max(40).optional(),
        owner_emails: assistantEmailListSchema.optional(),
        reader_emails: assistantEmailListSchema.optional(),
      })
      .refine((folder) => Object.keys(folder).length > 0),
  )
  .refine(
    (folders) =>
      Object.keys(folders).length > 0 && Object.keys(folders).length <= 32,
  );

export const assistantNamingPaths = [
  "company_name",
  "company_code",
  "rm_folders",
] as const;

export const assistantDnsZoneSchema = z.strictObject({
  dns_name: z
    .string()
    .max(253)
    .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/)
    .optional(),
  name: z
    .string()
    .trim()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .nullable()
    .optional(),
  description: chatMessageSchema
    .pipe(z.string().max(1024))
    .nullable()
    .optional(),
  default_ttl: z.number().int().min(60).max(99999999).optional(),
  type: z.literal("primary").optional(),
  contact_email: z.email().max(254).nullable().optional(),
  acl: z
    .string()
    .max(1000)
    .refine((value) =>
      value
        .split(",")
        .every(
          (entry) =>
            z.union([z.cidrv4(), z.cidrv6()]).safeParse(entry.trim()).success,
        ),
    )
    .nullable()
    .optional(),
  network_area_key: z
    .string()
    .regex(/^[a-z][a-z0-9_-]{0,63}$/)
    .optional(),
});

export const assistantDnsZoneNamesSchema = z
  .record(
    z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    assistantDnsZoneSchema.refine((zone) => Object.keys(zone).length > 0),
  )
  .refine(
    (zones) => Object.keys(zones).length > 0 && Object.keys(zones).length <= 32,
  );

export const assistantQuestionOptionsSchema = z
  .array(chatMessageSchema.pipe(z.string().max(160)))
  .max(6)
  .refine((options) => new Set(options).size === options.length)
  .optional();

export const dialogueSchema = z.strictObject({
  explanation: z.string().min(1).max(3000),
  questions: z
    .array(
      z.strictObject({
        path: z.string().max(300),
        text: z.string().min(1).max(600),
        options: assistantQuestionOptionsSchema,
        multiple: z.boolean().optional(),
      }),
    )
    .max(8),
  changes: z
    .array(
      z.strictObject({
        path: z.string().max(300),
        operation: z.enum(assistantEditorOperations).optional(),
        value: z.union([
          z.string().max(1000),
          z.boolean(),
          z.number().finite(),
          z.null(),
          assistantNetworkAreasSchema,
          assistantNetworkAreaSchema,
          assistantFolderNamesSchema,
          assistantFolderPatchSchema,
          assistantEmailListSchema,
          assistantDnsZoneNamesSchema,
          assistantFirewallPatchSchema,
          assistantFirewallsPatchSchema,
          z.json(),
        ]),
      }),
    )
    .max(8),
  references: z.array(z.string().max(300)).min(1).max(8),
});

export type Dialogue = z.infer<typeof dialogueSchema>;
export function assistantPublicDnsZone(input: unknown) {
  const zone = objectValue(input as Parameters<typeof objectValue>[0]);
  return {
    name: null,
    description: null,
    contact_email: null,
    acl: null,
    network_area_key: "default",
    default_ttl: 3600,
    type: "primary",
    ...Object.fromEntries(
      Object.entries(assistantDnsZoneSchema.shape).flatMap(([key, schema]) => {
        const parsed = schema.safeParse(zone[key]);
        return parsed.success && parsed.data !== undefined
          ? [[key, parsed.data]]
          : [];
      }),
    ),
    ...(zone.type === "secondary" ? { type: "secondary" } : {}),
  };
}

export function assistantPublicNetworkArea(input: unknown) {
  const area = objectValue(input as Parameters<typeof objectValue>[0]);
  return Object.fromEntries(
    Object.entries(assistantNetworkAreaSchema.shape).flatMap(
      ([key, schema]) => {
        const parsed = schema.safeParse(area[key]);
        return parsed.success && parsed.data !== undefined
          ? [[key, parsed.data]]
          : [];
      },
    ),
  );
}

export const assistantFieldContracts = {
  organization_id: {
    responsibility: "user",
    meaning:
      "Existing STACKIT organization UUID explicitly supplied by the user; draft configuration only, never identity verification, organization binding or proof of access.",
  },
  owner_email: {
    responsibility: "user",
    meaning:
      "Technical owner email from explicit user requirements, saved foundations or the currently verified human identity. Propose it for review, never infer an address or grant access.",
  },
  company_name: {
    responsibility: "user",
    meaning: "Organization display name, use an explicitly supplied value.",
  },
  company_code: {
    responsibility: "user",
    meaning:
      "Organization naming abbreviation; use a supplied value or choose one only under explicit naming delegation, for a reviewable draft.",
  },
  rm_folders: {
    responsibility: "user",
    meaning:
      "Existing Resource Manager folder names (1-40 characters) and explicitly requested additive owner/reader email lists. Preserve existing keys, assignments, parent and other metadata. Naming delegation alone never permits role proposals. Review and accept draft fields before a separately authorized Plan/Apply; never grant live access in chat.",
  },
  organization_owners: {
    responsibility: "user",
    meaning:
      "Explicit additive organization-owner draft assignments only. Reuse a requested saved owner address, verified human address or explicit user email; preserve existing subjects. Broad organization owner rights cover folders; this is not a verified identity, tenant binding or live grant.",
  },
  organization_auditors: {
    responsibility: "user",
    meaning:
      "Explicit additive organization-auditor draft assignments only, preserving existing subjects. No promotion to owner, no live grant or configurator membership change.",
  },
  region: {
    responsibility: "user",
    meaning:
      "Deployment location; changing it is a draft proposal, not moving deployed resources.",
  },
  firewall_admin_username: {
    responsibility: "operator",
    meaning:
      "Firewall management account, selected in the separate protected access workflow.",
  },
  firewall_api_secret_version: {
    responsibility: "operator",
    meaning:
      "Internal change marker for stored management credentials, never a business question or an inferred version.",
  },
  firewall_bootstrap: {
    responsibility: "operator",
    meaning:
      "Initial setup of automated firewall management access, not enabling HA or approving a deployment.",
  },
} as const;

export function assistantQuestionFields() {
  return featureFieldCatalogue().filter(
    (field) =>
      !field.sensitive &&
      field.commonEditor !== "not-effective" &&
      !/^firewall_(?:admin_|api_|bootstrap$)/.test(field.path) &&
      !/(?:^|[._])id$|_id$/.test(field.path),
  );
}

export function assistantScalarFields() {
  const proposalPaths = new Set(
    Object.entries(assistantFieldContracts)
      .filter(([, contract]) => contract.responsibility === "user")
      .map(([path]) => path),
  );
  return featureFieldCatalogue().filter(
    (field) =>
      proposalPaths.has(field.path) &&
      !field.sensitive &&
      field.commonEditor !== "not-effective" &&
      /^[a-z_]+$/.test(field.path) &&
      ["string", "bool", "number"].includes(field.type),
  );
}

export function validateDialogue(
  input: unknown,
  ruleIds: readonly string[],
): Dialogue {
  assertAssistantEditorValue(input);
  const result = dialogueSchema.parse(input);
  const editable = assistantQuestionFields();
  const scalar = assistantScalarFields();
  for (const change of result.changes)
    if (change.operation) {
      assertAssistantEditorValue(change.value);
      validateAssistantEditorChange({
        path: change.path,
        value: change.value,
        operation: change.operation,
      });
    }
  if (
    result.changes.some((change, index) =>
      result.changes.some(
        (other, otherIndex) =>
          index !== otherIndex && change.path.startsWith(`${other.path}.`),
      ),
    )
  )
    throw new Error("assistant_invalid_proposal");
  if (
    result.questions.some(
      (question) =>
        (question.path !== "projectTemplates" &&
          !editable.some((field) => field.path === question.path)) ||
        /\b(?:plan|project|projekt|organization|organisation|gateway|tenant)[\s_-]*id\b|\buuid\b|interne[\s]+kennung/i.test(
          [question.text, ...(question.options ?? [])].join("\n"),
        ) ||
        /bootstrap|secret[\s_-]*version|version.*(?:secret|geheim|zugang)|(?:api|admin).*(?:secret|password|passwort|benutzername|username)/i.test(
          [question.text, ...(question.options ?? [])].join("\n"),
        ),
    ) ||
    result.changes.some((change) =>
      change.operation
        ? false
        : change.path === "connectivity.firewall"
          ? !assistantFirewallPatchSchema.safeParse(change.value).success
          : change.path === "connectivity.firewalls"
            ? !assistantFirewallsPatchSchema.safeParse(change.value).success
            : change.path === "connectivity.dns_zones"
              ? !assistantDnsZoneNamesSchema.safeParse(change.value).success
              : change.path === "rm_folders"
                ? !assistantFolderPatchSchema.safeParse(change.value).success
                : change.path === "organization_owners" ||
                    change.path === "organization_auditors"
                  ? !assistantEmailListSchema.safeParse(change.value).success
                  : change.path === "connectivity.network_areas"
                    ? !assistantNetworkAreasSchema.safeParse(change.value)
                        .success
                    : change.path === "connectivity.network_area"
                      ? !assistantNetworkAreaSchema.safeParse(change.value)
                          .success
                      : (change.path === "organization_id" &&
                          !z.uuid().safeParse(change.value).success) ||
                        (change.path === "owner_email" &&
                          !z.email().safeParse(change.value).success) ||
                        !scalar.some(
                          (field) =>
                            field.path === change.path &&
                            (change.value === null
                              ? field.optional
                              : typeof change.value ===
                                (field.type === "bool"
                                  ? "boolean"
                                  : field.type)),
                        ),
    ) ||
    new Set(result.changes.map((change) => change.path)).size !==
      result.changes.length ||
    result.references.some((reference) => !ruleIds.includes(reference))
  )
    throw new Error("assistant_invalid_proposal");
  return result;
}

function effectiveAccessInput(
  values: ReturnType<typeof compileCommonConfiguration>,
  path: string,
) {
  return values[path] ?? inputDefinition(path).default ?? [];
}

export function proposeAssistantAccess(
  values: Record<string, unknown>,
  request: {
    paths: (typeof assistantAccessPaths)[number][];
    folderKeys: string[];
    allFolders: boolean;
  },
  emails: string[],
): Dialogue {
  const folders = objectValue(
    values.rm_folders as Parameters<typeof objectValue>[0],
  );
  const folderPaths = request.paths.filter((path) =>
    path.startsWith("rm_folders"),
  );
  const keys = request.allFolders ? Object.keys(folders) : request.folderKeys;
  if (keys.some((key) => !Object.hasOwn(folders, key)))
    throw new Error("assistant_folder_creation_not_supported");
  const questions: Dialogue["questions"] = [];
  if (!emails.length)
    questions.push({
      path: "owner_email",
      text: "Welche bestätigte E-Mail-Adresse soll für diesen Berechtigungsvorschlag verwendet werden?",
    });
  if (folderPaths.length && !keys.length)
    questions.push({
      path: folderPaths[0] ?? "rm_folders[*].owner_emails",
      text: "Für welche vorhandenen Ordner soll ich die Berechtigung vorschlagen?",
      options: Object.values(folders)
        .map((folder) => String(objectValue(folder).name))
        .slice(0, 6),
      multiple: true,
    });
  if (questions.length)
    return {
      explanation:
        "Für den Berechtigungsvorschlag fehlt noch die Zielangabe. Ich erfinde keine E-Mail und wähle keine zusätzlichen Ordner oder Rollen. Noch nichts gespeichert oder in STACKIT berechtigt.",
      questions,
      changes: [],
      references: ["governance-folders"],
    };
  const changes: Dialogue["changes"] = [];
  const append = (existing: unknown) =>
    assistantEmailListSchema.parse([
      ...new Set([
        ...assistantEmailListSchema.parse(existing ?? []),
        ...emails,
      ]),
    ]);
  for (const path of [
    "organization_owners",
    "organization_auditors",
  ] as const) {
    if (!request.paths.includes(path)) continue;
    const before = assistantEmailListSchema.parse(values[path] ?? []);
    const after = append(before);
    if (after.length !== before.length) changes.push({ path, value: after });
  }
  const organizationOwners = request.paths.includes("organization_owners")
    ? append(values.organization_owners)
    : assistantEmailListSchema.parse(values.organization_owners ?? []);
  const patch: Record<
    string,
    { owner_emails?: string[]; reader_emails?: string[] }
  > = {};
  for (const key of keys) {
    for (const field of ["owner_emails", "reader_emails"] as const) {
      if (!request.paths.includes(`rm_folders[*].${field}`)) continue;
      const before = assistantEmailListSchema.parse(
        objectValue(folders[key])[field] ?? [],
      );
      const after = assistantEmailListSchema.parse([
        ...new Set([
          ...before,
          ...emails.filter((email) => !organizationOwners.includes(email)),
        ]),
      ]);
      if (after.length !== before.length)
        patch[key] = { ...patch[key], [field]: after };
    }
  }
  if (Object.keys(patch).length)
    changes.push({
      path: "rm_folders",
      value: assistantFolderPatchSchema.parse(patch),
    });
  const details = changes.flatMap((change) =>
    change.path === "rm_folders"
      ? Object.entries(assistantFolderPatchSchema.parse(change.value)).flatMap(
          ([key, folder]) =>
            Object.entries(folder).map(
              ([field, value]) =>
                `rm_folders.${key}.${field}: ${JSON.stringify(value)}`,
            ),
        )
      : [`${change.path}: ${JSON.stringify(change.value)}`],
  );
  const covered = emails.some((email) => organizationOwners.includes(email));
  return {
    explanation: `${details.length ? `Ich schlage folgende Berechtigungswerte zur Prüfung vor:\n${details.join("\n").slice(0, 1800)}\nDie vollständigen Werte stehen in den auswählbaren Vorschlagsfeldern.` : "Die angefragte E-Mail ist in der Konfiguration bereits für die gewünschte Rolle enthalten oder durch eine Organisations-Owner-Zuweisung abgedeckt; kein neuer Feldvorschlag."}${covered ? "\nOrganisations-Owner-Rechte umfassen auch die Ordner. Der native Accelerator vermeidet dafür zusätzliche doppelte Folder-Zuweisungen." : ""}\nBestehende Zuweisungen und Ordnernamen bleiben erhalten. Folder-Reader werden nativ als auditor zugewiesen. Noch nichts gespeichert und keine Cloud-Berechtigung geändert: Feldübernahme speichert nur den Entwurf; tatsächliche IAM-Änderungen benötigen einen geprüften Plan und eine separate Apply-Freigabe. Kein neuer verifizierter Benutzeridentitätsnachweis, keine Configurator-Mitgliedschaft oder Tenant-Bindung.`,
    questions: [],
    changes,
    references: ["governance-folders"],
  };
}

export function applyAssistantChanges(
  draft: CommonConfiguration,
  changes: Dialogue["changes"],
) {
  let candidate = draft;
  for (const change of changes) {
    if (change.operation) {
      assertAssistantEditorValue(change.value);
      candidate = applyAssistantEditorChange(candidate, {
        path: change.path,
        value: change.value,
        operation: change.operation,
      });
      continue;
    }
    if (
      change.path === "organization_owners" ||
      change.path === "organization_auditors"
    ) {
      const proposed = assistantEmailListSchema.parse(change.value);
      const existing = assistantEmailListSchema.parse(
        effectiveAccessInput(
          compileCommonConfiguration(candidate),
          change.path,
        ),
      );
      if (existing.some((email) => !proposed.includes(email)))
        throw new Error("assistant_access_removal_not_supported");
      candidate = setCommonInput(candidate, change.path, proposed);
      continue;
    }
    if (
      change.path === "connectivity.firewall" ||
      change.path === "connectivity.firewalls"
    ) {
      const values = compileCommonConfiguration(candidate);
      const connectivity = objectValue(values.connectivity);
      if (values.connectivity_regions != null)
        throw new Error("assistant_firewall_form_unsupported");
      if (change.path === "connectivity.firewall") {
        if (connectivity.firewalls != null)
          throw new Error("assistant_firewall_form_unsupported");
        const firewall = mergeAssistantFirewall(
          connectivity.firewall,
          change.value,
        );
        const areas =
          connectivity.network_area != null
            ? [connectivity.network_area]
            : Object.values(objectValue(connectivity.network_areas));
        if (!areas.length) throw new Error("assistant_firewall_area_unknown");
        for (const area of areas) validateAssistantFirewall(firewall, area);
        candidate = setCommonInput(candidate, "connectivity", {
          ...connectivity,
          firewall: objectValue(JSON.parse(JSON.stringify(firewall))),
        });
      } else {
        if (connectivity.firewall != null || connectivity.network_areas == null)
          throw new Error("assistant_firewall_form_unsupported");
        const areas = objectValue(connectivity.network_areas);
        const previous = objectValue(connectivity.firewalls);
        const patches = assistantFirewallsPatchSchema.parse(change.value);
        if (Object.keys(patches).some((key) => !Object.hasOwn(areas, key)))
          throw new Error("assistant_firewall_area_unknown");
        const firewalls = { ...previous };
        for (const [key, patch] of Object.entries(patches)) {
          const firewall = mergeAssistantFirewall(previous[key], patch);
          validateAssistantFirewall(firewall, areas[key]);
          firewalls[key] = objectValue(JSON.parse(JSON.stringify(firewall)));
        }
        if (
          Object.keys(firewalls).length !== Object.keys(areas).length ||
          Object.keys(areas).some((key) => !Object.hasOwn(firewalls, key))
        )
          throw new Error("assistant_firewall_areas_incomplete");
        candidate = setCommonInput(candidate, "connectivity", {
          ...connectivity,
          firewalls,
        });
      }
      continue;
    }
    if (change.path === "connectivity.dns_zones") {
      const names = assistantDnsZoneNamesSchema.parse(change.value);
      const values = compileCommonConfiguration(candidate);
      const connectivity = objectValue(values.connectivity);
      if (values.connectivity_regions != null)
        throw new Error("assistant_dns_form_unsupported");
      const previous = objectValue(connectivity.dns_zones);
      if (Object.keys(names).some((key) => !Object.hasOwn(previous, key)))
        throw new Error("assistant_dns_creation_not_supported");
      const updated = structuredClone(previous);
      const areas = objectValue(connectivity.network_areas);
      for (const [key, zone] of Object.entries(names)) {
        if (
          zone.type === "primary" &&
          objectValue(previous[key]).type === "secondary"
        )
          throw new Error("assistant_dns_type_conversion_unsupported");
        if (
          zone.network_area_key !== undefined &&
          !(
            connectivity.network_area != null &&
            zone.network_area_key === "default"
          ) &&
          !Object.hasOwn(areas, zone.network_area_key)
        )
          throw new Error("assistant_dns_area_unknown");
        updated[key] = {
          ...objectValue(previous[key]),
          ...objectValue(JSON.parse(JSON.stringify(zone))),
        };
      }
      candidate = setCommonInput(candidate, "connectivity", {
        ...connectivity,
        dns_zones: updated,
      });
      continue;
    }
    if (change.path === "rm_folders") {
      const names = assistantFolderPatchSchema.parse(change.value);
      const values = compileCommonConfiguration(candidate);
      const previous = objectValue(
        values.rm_folders === undefined
          ? inputDefinition("rm_folders").default
          : values.rm_folders,
      );
      if (Object.keys(names).some((key) => !Object.hasOwn(previous, key)))
        throw new Error("assistant_folder_creation_not_supported");
      const updated = structuredClone(previous);
      for (const [key, folder] of Object.entries(names)) {
        for (const field of ["owner_emails", "reader_emails"] as const) {
          const proposed = folder[field];
          if (
            proposed &&
            assistantEmailListSchema
              .parse(objectValue(previous[key])[field] ?? [])
              .some((email) => !proposed.includes(email))
          )
            throw new Error("assistant_access_removal_not_supported");
        }
        updated[key] = {
          ...objectValue(previous[key]),
          ...objectValue(JSON.parse(JSON.stringify(folder))),
        };
      }
      candidate = setCommonInput(candidate, "rm_folders", updated);
      continue;
    }

    if (change.path === "connectivity.network_area") {
      const area = assistantNetworkAreaSchema.parse(change.value);
      const values = compileCommonConfiguration(candidate);
      const connectivity = objectValue(values.connectivity);
      if (
        values.connectivity_regions != null ||
        connectivity.network_areas != null
      )
        throw new Error("assistant_network_form_unsupported");
      const next = structuredClone(candidate);
      next.features.network.connectivity = {
        ...connectivity,
        network_area: {
          ...objectValue(connectivity.network_area),
          ...objectValue(JSON.parse(JSON.stringify(area))),
        },
      };
      next.identities.networkAreas["connectivity.network_area"] ??=
        `area:${values.region ?? "eu01"}:default`;
      candidate = readCommonConfiguration(next);
      continue;
    }
    if (change.path !== "connectivity.network_areas") {
      if (change.value !== null && typeof change.value === "object")
        throw new Error("assistant_invalid_proposal");
      candidate = setCommonInput(candidate, change.path, change.value);
      continue;
    }
    const areas = assistantNetworkAreasSchema.parse(change.value);
    const values = compileCommonConfiguration(candidate);
    const connectivity = objectValue(values.connectivity);
    if (
      values.connectivity_regions != null ||
      connectivity.network_area != null
    )
      throw new Error("assistant_network_form_unsupported");
    const previous = objectValue(connectivity.network_areas);
    if (Object.keys(previous).some((key) => !Object.hasOwn(areas, key)))
      throw new Error("assistant_network_removal_not_supported");
    const next = structuredClone(candidate);
    const group = Object.values(next.features).find((entries) =>
      Object.hasOwn(entries, "connectivity"),
    );
    const target = group ?? next.features.network;
    const updatedAreas = Object.fromEntries(
      Object.entries(objectValue(JSON.parse(JSON.stringify(areas)))).map(
        ([key, area]) => [
          key,
          { ...objectValue(previous[key]), ...objectValue(area) },
        ],
      ),
    );
    target.connectivity = {
      ...connectivity,
      network_areas: { ...previous, ...updatedAreas },
    };
    for (const key of Object.keys(areas)) {
      const path = `connectivity.network_areas.${key}`;
      next.identities.networkAreas[path] ??=
        `area:${values.region ?? "eu01"}:${key}`;
    }
    candidate = readCommonConfiguration(next);
  }
  compileCommonConfiguration(candidate);
  if (changes.some((change) => change.operation)) {
    const previous = new Set(
      editorIssues(draft).map((issue) => `${issue.field}:${issue.message}`),
    );
    if (
      editorIssues(candidate).some(
        (issue) => !previous.has(`${issue.field}:${issue.message}`),
      )
    )
      throw new Error("assistant_configuration_invalid");
  }
  const baseline = new Set(
    assessCommonConfiguration(draft)
      .findings.filter(
        (finding) =>
          finding.scope === "configuration" && finding.severity === "error",
      )
      .map((finding) => `${finding.path}:${finding.code}`),
  );
  const errors = assessCommonConfiguration(candidate).findings.filter(
    (finding) =>
      finding.scope === "configuration" &&
      finding.severity === "error" &&
      (!baseline.has(`${finding.path}:${finding.code}`) ||
        (changes.some((change) =>
          change.path.startsWith("connectivity.network_area"),
        ) &&
          finding.path.startsWith("connectivity.network_area"))),
  );
  if (errors.length) throw new Error("assistant_configuration_invalid");
  return candidate;
}
