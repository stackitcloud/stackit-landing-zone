import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { featureFieldCatalogue } from "@lzc/domain";
import { expect, it } from "vitest";
import {
  assistantKnowledgeContext,
  buildAssistantKnowledge,
} from "../apps/api/src/assistant/knowledge.js";
import { buildAssistantTopicFieldPaths } from "../apps/api/src/assistant/topic-fields.js";
import {
  assistantScenarioFixture,
  assistantScenarios,
  buildAssistantScenarioInventory,
  syntheticOrganizationId,
  validateAssistantScenario,
} from "../scripts/assistant-scenarios.js";

it.each([
  {
    args: ["--case", "dns-owner"],
    execution: "false",
    reason: "assistant_test_token_required",
  },
  {
    args: ["--case", "unknown"],
    execution: "false",
    reason: "assistant_test_arguments_invalid",
  },
  {
    args: ["--local-credentials", "--case", "dns-owner"],
    execution: "true",
    reason: "execution_not_allowed",
  },
])(
  "blocks $reason before any model, SSO or local credential access",
  ({ args, execution, reason }) => {
    const environment = { ...process.env };
    delete environment.LZC_MODEL_SERVING_TOKEN;
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/assistant-tests.ts", ...args],
      {
        cwd: fileURLToPath(new URL("../", import.meta.url)),
        env: {
          ...environment,
          LZC_EXECUTION_ENABLED: execution,
          LZC_APPLICATION_EXECUTION_ENABLED: "false",
        },
        encoding: "utf8",
        timeout: 15000,
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr.trim())).toEqual({
      status: "blocked",
      reason,
    });
    expect(result.stdout).toBe("");
  },
);

it("assigns every editor field exactly once and keeps the reviewed catalogue fresh", () => {
  const inventory = buildAssistantScenarioInventory();
  const paths = inventory.topics.flatMap((topic) =>
    topic.fields.map((field) => field.path),
  );
  expect(paths.sort()).toEqual(
    featureFieldCatalogue()
      .map((field) => field.path)
      .sort(),
  );
  expect(new Set(paths).size).toBe(paths.length);
  expect(
    JSON.parse(
      readFileSync(
        new URL("../../docs/assistant-test-catalogue.json", import.meta.url),
        "utf8",
      ),
    ),
  ).toEqual(inventory);
  expect(inventory.topics.every((topic) => topic.cases.length > 0)).toBe(true);
  expect(() => buildAssistantTopicFieldPaths(["unknown"])).toThrow(
    "assistant_topic_field_assignment_mismatch",
  );
});

it("includes dependency and protected field contracts without exposing their values or granting proposals", () => {
  const knowledge = buildAssistantKnowledge();
  const context = assistantKnowledgeContext({
    engineRevision: knowledge.engineRevision,
    knowledgeSha256: knowledge.sha256,
    groups: ["identity"],
  });
  expect(
    context.fields.some(
      (field) =>
        field.path === "vpn_pre_shared_keys" &&
        field.mode === "requirements-only" &&
        field.proposalPath === null,
    ),
  ).toBe(true);
  for (const field of knowledge.fields.filter(
    (field) => field.responsibility === "operator",
  ))
    expect(field.proposalPath).toBeNull();
  const fields = new Map(knowledge.fields.map((field) => [field.path, field]));
  expect(
    fields.get("connectivity.network_areas[*].ranges[*]")?.proposalPath,
  ).toBe("connectivity.network_areas");
  expect(
    fields.get("connectivity.dns_zones[*].region")?.proposalPath,
  ).toBeNull();
  expect(
    fields.get("connectivity_regions[*].dns_zones[*].name")?.proposalPath,
  ).toBeNull();
  expect(fields.get("rm_folders[*].description")?.mode).toBe(
    "explain-rejection",
  );
});

it.each(assistantScenarios)(
  "builds isolated synthetic fixtures and validates the $id advice contract",
  (scenario) => {
    const fixture = assistantScenarioFixture(scenario);
    expect(JSON.stringify(fixture)).not.toMatch(
      /af026540|lukas|preshared_key/i,
    );
    if (scenario.fixture === "baseline") {
      expect(
        validateAssistantScenario(scenario, {
          explanation: `Nur Beratung, keine Speicherung oder Ausfuehrung. ${scenario.requiredOverviewFields?.join(", ") ?? ""}. Namen 1-40 Zeichen; Beschreibungen nicht unterstützt und abgelehnt. pass, block, reject; explizite Synchronisierung.`,
          questions: [],
          changes: [],
          references: [scenario.topic],
        }).failures,
      ).toEqual([]);
      expect(
        validateAssistantScenario(scenario, {
          explanation: "Beratung.",
          questions: [],
          changes: [],
          references: ["configuration-contract"],
        }).failures,
      ).toContain("missing_topic_reference");
    }
  },
);

it.each([
  "identity-foundations-advice",
  "governance-folders-advice",
  "firewall-policy-advice",
  "sandbox-projects-advice",
])(
  "rejects a correct reference but empty or misleading native field overview for %s",
  (id) => {
    const scenario = assistantScenarios.find((entry) => entry.id === id);
    if (!scenario) throw new Error("missing_fixture");
    const input = {
      explanation: "Hier die relevanten Einstellungen:",
      questions: [],
      changes: [],
      references: [scenario.topic],
    };
    expect(validateAssistantScenario(scenario, input).failures).toContain(
      "incomplete_native_field_overview",
    );
    if (id === "governance-folders-advice")
      expect(
        validateAssistantScenario(scenario, {
          ...input,
          explanation: `${scenario.requiredOverviewFields?.join(", ")}. Namen 40 Zeichen; Beschreibungen typischerweise 255-500 Zeichen, ansonsten abgelehnt.`,
        }).failures,
      ).toContain("incorrect_folder_limits");
    if (id === "firewall-policy-advice")
      expect(
        validateAssistantScenario(scenario, {
          ...input,
          explanation: scenario.requiredOverviewFields?.join(", "),
        }).failures,
      ).toContain("incomplete_policy_contract");
  },
);

it("rejects superficially successful foundation answers and validates exact restoration", () => {
  const scenario = assistantScenarios.find(
    (entry) => entry.id === "foundations-restoration",
  );
  if (!scenario) throw new Error("missing_fixture");
  const input = {
    explanation: "Noch nichts gespeichert.",
    questions: [],
    references: [scenario.topic],
    changes: Object.entries({
      company_name: "Example GmbH",
      company_code: "exg",
      owner_email: "owner@example.test",
      region: "eu01",
      organization_id: syntheticOrganizationId,
    }).map(([path, value]) => ({ path, value })),
  };
  expect(validateAssistantScenario(scenario, input).failures).toEqual([]);
  expect(
    validateAssistantScenario(scenario, {
      ...input,
      explanation:
        "Der SNA-Bereich wurde konfiguriert. Noch nichts gespeichert.",
    }).failures,
  ).toContain("premature_saved_claim");
  expect(
    validateAssistantScenario(scenario, { ...input, changes: [] }).failures,
  ).toContain("foundation_values_not_restored_exactly");
  expect(
    validateAssistantScenario(scenario, {
      ...input,
      explanation: "Gespeichert.",
    }).failures,
  ).toContain("missing_unsaved_notice");
});

it.each(["dns-owner", "dns-login", "dns-placeholder"])(
  "checks exact DNS settings, contact defaults and preservation for %s",
  (id) => {
    const scenario = assistantScenarios.find((entry) => entry.id === id);
    if (!scenario) throw new Error("missing_fixture");
    const zone = {
      name: "example-dns",
      description: "Example DNS",
      default_ttl: 3600,
      contact_email:
        id === "dns-owner" ? "owner@example.test" : "login@example.test",
    };
    const input = {
      explanation: "Noch nicht gespeichert.",
      questions: [],
      references: [scenario.topic],
      changes: [{ path: "connectivity.dns_zones", value: { example: zone } }],
    };
    expect(validateAssistantScenario(scenario, input).failures).toEqual([]);
    expect(
      validateAssistantScenario(scenario, {
        ...input,
        changes: [
          {
            path: "connectivity.dns_zones",
            value: {
              example: { ...zone, contact_email: "invented@example.test" },
            },
          },
        ],
      }).failures,
    ).toContain("dns_settings_or_contact_missing");
    expect(
      validateAssistantScenario(scenario, {
        ...input,
        changes: [
          {
            path: "connectivity.dns_zones",
            value: { example: { ...zone, dns_name: "other.stackit.run" } },
          },
        ],
      }).failures,
    ).toContain("dns_domain_changed");
  },
);

it("checks exact SNA values and rejects missing or unrelated settings", () => {
  const scenario = assistantScenarios.find(
    (entry) => entry.id === "sna-complete-draft",
  );
  if (!scenario) throw new Error("missing_fixture");
  const input = {
    explanation: "Noch nichts gespeichert.",
    questions: [],
    references: [scenario.topic],
    changes: [
      {
        path: "connectivity.network_areas",
        value: {
          default: {
            ranges: ["10.64.0.0/16"],
            transfer_network: "10.255.255.0/24",
            min_prefix_length: 24,
            max_prefix_length: 28,
            default_prefix_length: 26,
            default_nameservers: ["1.1.1.1"],
          },
        },
      },
    ],
  };
  expect(validateAssistantScenario(scenario, input).failures).toEqual([]);
  expect(
    validateAssistantScenario(scenario, { ...input, changes: [] }).failures,
  ).toContain("sna_values_not_proposed_exactly");
});
