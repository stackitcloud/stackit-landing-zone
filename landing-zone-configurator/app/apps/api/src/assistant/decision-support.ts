import {
  type AssistantCataloguePicker,
  type CloudCatalogueField,
  catalogueField,
} from "@lzc/contracts";
import {
  applicationServiceAccountKeyPermissions,
  defaultApplicationAccessProfile,
} from "@lzc/domain";
import { z } from "zod";
import { catalogueQuestionRegion } from "./catalogue-guidance.js";
import type { AssistantCatalogueContext } from "./model-serving.js";
import { reviewedUserLimits } from "./service-requirements.js";

export const catalogueRequirementSchema = z.strictObject({
  metric: z.enum(["users", "vCPU", "bandwidthMbps", "maxConnections"]),
  minimum: z.number().finite().positive(),
  evidence: z.strictObject({
    turn: z.number().int().min(0).max(40),
    quote: z.string().min(1).max(1000),
  }),
});
export type CatalogueRequirement = z.infer<typeof catalogueRequirementSchema>;
const limits: Partial<Record<CloudCatalogueField, Record<string, number>>> =
  reviewedUserLimits;

/** Arithmetic over reviewed facts, never a dialogue script or an invented
 * sizing model. Unknown characteristics cannot satisfy a hard requirement.
 */
export function evaluateCatalogueRequirements(
  field: CloudCatalogueField,
  options: AssistantCataloguePicker["options"],
  requirements: readonly CatalogueRequirement[],
) {
  const eligible: string[] = [];
  const excluded: {
    value: string;
    reasons: { metric: string; required: number; maximum: number }[];
  }[] = [];
  const unknown: string[] = [];
  for (const option of options) {
    const reasons: { metric: string; required: number; maximum: number }[] = [];
    let missing = false;
    for (const requirement of requirements) {
      const known =
        requirement.metric === "users"
          ? limits[field]?.[option.value]
          : option.facts.find((fact) => fact.key === requirement.metric)?.value;
      if (typeof known !== "number") missing = true;
      else if (known < requirement.minimum)
        reasons.push({
          metric: requirement.metric,
          required: requirement.minimum,
          maximum: known,
        });
    }
    if (reasons.length) excluded.push({ value: option.value, reasons });
    else if (missing) unknown.push(option.value);
    else eligible.push(option.value);
  }
  return {
    eligible,
    excluded,
    unknown,
    recommendation:
      requirements.length && eligible.length === 1 && !unknown.length
        ? eligible[0]
        : null,
  };
}

/** Product facts, not per-product conversation states. Other adapters supply
 * numeric VM/VPN facts through the same scoped catalogue interface.
 */
export const reviewedServiceFacts: Record<string, unknown> = {
  "project-templates": {
    targetSelection: {
      rule: "A singular template kind identifies one template only when there is a unique candidate. With multiple matches, offer the actual stable keys and names in one structured question; do not assume all matches or a preferred key. Explicit all/both or a later selected key resolves scope. Keep other requested kinds in the same pending task.",
      legacyTransition:
        "Templates without accessProfile may use legacy automation_role/custom_roles/role_assignments and a role parameter policy. Read their actual settings. Adding granular service rights requires an explicitly confirmed transition to a complete profile, not an implicit destructive migration. The registered native transition removes only incompatible legacy access fields and preserves other settings; the initial central owner is a separate confirmed choice.",
    },
    projectIamScope: {
      alreadyDeclared:
        "The explicit full Owner accessProfile already includes all official project permissions for requester and automation. Adding a service permission is not a reason to migrate/narrow that profile. Explain when the observed template policy already meets the request; live IAM, service entitlement and control-plane access remain separate.",
      legacyDefaults:
        "Native src/application/main.tf uses coalesce(application.initial_owner_email, application.owner_email) for the initial project owner; absent a separate initial owner, the verified requester is that Owner. automation_role defaults to owner in the native application contract. Inspect actual legacy overrides and parameter policies before inferring coverage. A missing granular accessProfile alone does not prove missing service rights or require migration; migration is a separate deliberate policy change.",
      supportedTemplateKinds: ["public", "corporate", "sandbox"],
      effect:
        "accessProfile sets project IAM rights, not the service instance or its networking. Public templates support SKE and other service IAM just like Corporate/Sandbox templates; corporate SNA is not a prerequisite for these permission edits.",
      notRequiredForPermissionEdits:
        "Cluster names, node pools, namespaces, DNS, source CIDRs, private Runner reachability and SNA setup. These belong to separate service/deployment requests, not a proof of permission availability.",
      boundary:
        "Project IAM does not configure in-cluster Kubernetes RBAC or prove service orderability, control-plane reachability or successful execution. No cluster or other service is created by this proposal.",
    },
    principalRoles: {
      requester:
        "The verified human who orders the Application Landing Zone. A request for people to receive service rights when ordering already identifies requester; do not ask that recipient again.",
      automation:
        "The separate Application service account used by execution/automation. Include it when requested or part of an explicitly selected complete preset; do not confuse it with the person ordering.",
      initialOwner:
        "The separate central initial project Owner for granular profiles; it is not the requester or the automation recipient list. A contact/root email alone is not a confirmed selection for this role. Preserve existing selected owners; when relevant granular templates lack an owner, ask one common owner question while still preparing the independent rights proposal. This is required before publication, not a reason to block valid local permission additions.",
    },
    workflowBundles: {
      "legacy-access-transition": {
        purpose:
          "Replace incompatible legacy template roles with a complete registered profile after the user has confirmed that replacement.",
        localOperation: {
          tool: "propose_template_access_profile",
          arguments: {
            selection: {
              kind: "preset",
              id: "application-workloads-v1",
              replaceLegacyAccess: true,
            },
          },
          requiredArguments: [
            "templateKeys (only confirmed legacy targets)",
            "selection.initialOwnerEmail (the selected central owner email)",
          ],
        },
        combination:
          "Then call propose_template_permissions for the requested services/principals/targets; it extends the validated transition. Existing granular templates must retain their own rights: update only their accessProfile.initialOwnerEmail with a scalar replace operation if the confirmed common owner is missing, rather than applying a complete preset to them. Native operations are small declarative operations, never one operation per permission string.",
        scope:
          "Only the confirmed legacy template changes its whole profile. Keep unrelated existing profiles and all other settings; no cloud rights or publication.",
      },
      "service-account-keys": {
        purpose:
          "Operational key management for existing service accounts: find/open the account and create/list/read/edit/delete its keys.",
        permissions: [...applicationServiceAccountKeyPermissions],
        discoveryDependencies: [
          "iam.service-account.get",
          "iam.service-account.list",
        ],
        reason:
          "The reviewed seven-right workflow includes account discovery as well as key actions. A natural-language key-management request uses this bundle; it is not a literal six-permission list. An explicit exact list of permission identifiers takes precedence.",
        defaultPrincipal: "requester",
        localOperation: {
          tool: "propose_template_permissions",
          arguments: {
            source: { kind: "permission_set", id: "service-account-keys" },
          },
          scope:
            "Supply existing templateKeys and the requested principals; these are source arguments, not a complete call.",
        },
        preserves:
          "Existing owner, unrelated rights and unselected principals; no service-account creation/deletion, role/member administration or cloud execution.",
      },
    },
    presets: Object.fromEntries(
      (["workload", "vm"] as const).map((preset) => {
        const profile = defaultApplicationAccessProfile("", preset);
        const services = (permissions: string[]) =>
          [
            ...new Set(
              permissions.map((permission) => permission.split(".")[0]),
            ),
          ].sort();
        return [
          preset === "vm" ? "application-vm-v1" : "application-workloads-v1",
          {
            requesterPermissionCount: profile.permissions.length,
            automationPermissionCount: profile.automationPermissions.length,
            requesterServiceGroups: services(profile.permissions),
            automationServiceGroups: services(profile.automationPermissions),
            source:
              "registered native preset; available catalogue permissions are NOT all included by default",
          },
        ];
      }),
    ),
    criticalBoundaries: [
      {
        id: "project-wide-service-account-key-management",
        triggerIdentifiers: ["application-workloads-v1", "application-vm-v1"],
        appliesWhen:
          "Describing or recommending application-workloads-v1, application-vm-v1, or service-account key management. Both presets include requester key-management rights.",
        mustExplain: true,
        scope:
          "PROJECT-WIDE: these permissions cover ALL service accounts in the project, not just the Application service account.",
        consequence:
          "Creating a key allows using ALL rights of that service account, including its rights outside this project.",
        operatorGuidance:
          "Keep privileged Platform service accounts outside Application projects.",
        permissions:
          "No service-account creation/deletion or IAM role/member administration is added by the key-management set.",
        boundaryIsInformationNotAnotherApproval: true,
      },
    ],
  },
  "devops-git": {
    endpoint: "public",
    snaAttachment: false,
    aclMeaning: "client public egress addresses, not private SNA subnets",
    defaultAccessChoice:
      "Read the actual native ACL default; an explicit use-default instruction adopts it without a second confirmation.",
    instanceUserCeilings: reviewedUserLimits.gitFlavors,
    replacements: ["devops.git_flavor", "devops.allowed_network_ranges"],
  },
};

/** A complete, available catalogue is authoritative for new selections. Existing
 * values remain preservable; missing/truncated data is not proof of absence. */
export function unavailableCatalogueChoices(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  catalogues: AssistantCatalogueContext,
) {
  const failures: { path: string; value: string; available: string[] }[] = [];
  const plain = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const visit = (
    prior: unknown,
    next: unknown,
    path: string,
    regionHint?: "eu01" | "eu02",
  ): void => {
    if (prior === next || path.startsWith("assistant.")) return;
    if (typeof next === "string") {
      const field = catalogueField(path);
      if (!field) return;
      const region = regionHint ?? catalogueQuestionRegion(path, after);
      if (!region) return;
      const product = catalogues.regions.find(
        (entry) => entry.region === region,
      )?.products[field];
      if (
        product?.status === "available" &&
        !product.truncated &&
        product.totalOptions === product.options.length &&
        !product.options.some((option) => option.value === next)
      )
        failures.push({
          path,
          value: next,
          available: product.options.map((option) => option.value),
        });
      return;
    }
    if (Array.isArray(next)) {
      for (const [index, value] of next.entries()) {
        visit(
          Array.isArray(prior) ? prior[index] : undefined,
          value,
          `${path}[*]`,
          regionHint,
        );
      }
      return;
    }
    const explicitRegion = plain(next).region;
    const region =
      explicitRegion === "eu01" || explicitRegion === "eu02"
        ? explicitRegion
        : regionHint;
    for (const [key, value] of Object.entries(plain(next)))
      visit(plain(prior)[key], value, path ? `${path}.${key}` : key, region);
  };
  for (const [key, value] of Object.entries(after)) {
    if (key.includes(".") && Object.hasOwn(after, key.split(".")[0]!)) continue;
    visit(before[key], value, key);
  }
  return failures;
}
