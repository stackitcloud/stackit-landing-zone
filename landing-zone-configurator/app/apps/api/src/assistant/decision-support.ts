import {
  type AssistantCataloguePicker,
  type CloudCatalogueField,
  catalogueField,
} from "@lzc/contracts";
import { defaultApplicationAccessProfile } from "@lzc/domain";
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
