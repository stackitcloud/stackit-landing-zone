import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { featureFieldCatalogue, type JsonValue } from "@lzc/domain";
import { expect, it } from "vitest";
import {
  assistantKnowledgeContext,
  buildAssistantKnowledge,
} from "../apps/api/src/assistant/knowledge.js";
import { buildAssistantTopicFieldPaths } from "../apps/api/src/assistant/topic-fields.js";
import {
  assistantCorporateIpv4Failures,
  assistantDevOpsDefaultFailures,
  assistantDnsRoleFailures,
  assistantScenarioFixture,
  assistantScenarios,
  buildAssistantScenarioInventory,
  syntheticOrganizationId,
  validateAssistantScenario,
} from "../scripts/assistant-scenarios.js";

const dnsRoleExplanation =
  "Primary verwaltet die führenden DNS-Einträge bei STACKIT und wird für neue Firmenzonen empfohlen. Secondary repliziert eine Kopie vom externen Primary. Beide sind autoritativ. Der Zonentyp bezeichnet nicht public/private oder die Sichtbarkeit. Der native Accelerator kann die benötigten Primary-Server für Secondary nicht konfigurieren.";

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
  ...["0", "4", "1.5", "invalid"].map((repeat) => ({
    args: ["--repeat", repeat],
    execution: "false",
    reason: "assistant_test_arguments_invalid",
  })),
  {
    args: ["--case", "dns-owner", "--repeat", "2"],
    execution: "false",
    reason: "assistant_test_token_required",
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

it.each(
  ["merge", "replace"].flatMap((operation) =>
    [false, true].map((extra) => ({ operation, extra })),
  ),
)(
  "qualifies network-only templates using $operation without unrequested services (extra=$extra)",
  ({ operation, extra }) => {
    const scenario = assistantScenarios.find(
      (entry) => entry.id === "platform-public-corporate-networks",
    );
    if (!scenario) throw new Error("missing_fixture");
    const settings = {
      network_enabled: true,
      ...(extra
        ? { observability: { enabled: true, plan_name: "standard" } }
        : {}),
    };
    const result = validateAssistantScenario(scenario, {
      explanation: "Vorschlag, noch nichts gespeichert.",
      questions: [],
      references: [scenario.topic],
      changes: [
        {
          path: "projectTemplates",
          operation,
          value: {
            corporate: {
              name: "Zentrales Netzwerk",
              kind: "corporate",
              region: "eu01",
              settings,
            },
            public: {
              name: "Internet ohne zentrales Netzwerk",
              kind: "public",
              region: "eu01",
              settings,
            },
          },
        },
      ],
    });
    expect(result.failures).toEqual(
      extra ? ["unrequested_template_settings"] : [],
    );
  },
);

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
  expect(fields.get("connectivity.dns_zones[*].region")?.proposalPath).toBe(
    "connectivity",
  );
  expect(
    fields.get("connectivity_regions[*].dns_zones[*].name")?.proposalPath,
  ).toBe("connectivity_regions");
  expect(fields.get("rm_folders[*].description")?.mode).toBe(
    "explain-rejection",
  );
});

it.each([
  "audit-logs",
  "devops-git",
  "observability",
  "federated-identities",
  "namespace-services",
  "platform-kubernetes",
  "sandbox-projects",
  "stackit-network-components",
  "vpn",
])(
  "keeps %s knowledge consistent with reviewed native Editor support",
  (id) => {
    const knowledge = buildAssistantKnowledge();
    const topic = knowledge.topics.find((entry) => entry.id === id);
    const rule = knowledge.rules.find((entry) => entry.id === id);
    expect(topic).toBeDefined();
    expect(rule).toBeDefined();
    expect(
      knowledge.fields.some(
        (field) =>
          field.mode === "propose-validated-draft" &&
          topic?.fieldPaths.some((path) => path === field.path),
      ),
    ).toBe(true);
    expect(rule?.text).toContain("Editor");
    expect(rule?.text).not.toMatch(
      /current chat cannot patch|not current chat patches|current chat cannot add\/remove/i,
    );
  },
);

it.each(assistantScenarios)(
  "builds isolated synthetic fixtures and validates the $id advice contract",
  (scenario) => {
    const fixture = assistantScenarioFixture(scenario);
    expect(JSON.stringify(fixture)).not.toMatch(
      /af026540|lukas|preshared_key/i,
    );
    if (scenario.editorExpected) {
      const root = scenario.editorExpected.path.split(".")[0] ?? "";
      const values: Record<string, JsonValue> = {
        audit_logs: {
          retention_days: 90,
          acl: ["203.0.113.0/24"],
          s3_object_lock: false,
        },
        observability: {
          metrics_retention_days: 30,
          ...(scenario.id === "editor-monitoring-retention"
            ? { plan_name: "Observability-Monitoring-Medium-EU01" }
            : {}),
        },
        bucket_naming: "project-id",
        devops: {
          git_flavor: "git-10",
          allowed_network_ranges: ["203.0.113.0/24"],
        },
        federated_identity_providers: [
          {
            name: "synthetic-federation",
            issuer: "https://issuer.example.test",
            assertions: [
              { item: "aud", operator: "equals", value: "synthetic-workload" },
            ],
          },
        ],
        platform_kubernetes: {
          eu01: { region: "eu01", cluster: { name: "synthetic-k8s" } },
        },
        labels: { cost_center: "synthetic-team" },
      };
      expect(
        validateAssistantScenario(scenario, {
          explanation: "Reviewable local draft only.",
          questions: [],
          changes: [{ path: root, value: values[root], operation: "merge" }],
          references: [scenario.topic],
        }).failures,
      ).toEqual([]);
    } else if (scenario.fixture === "baseline") {
      expect(
        validateAssistantScenario(scenario, {
          explanation:
            scenario.applicationAccess === "advice"
              ? "Granulare VM-Rechte empfohlen. IDP bestätigt Identität; Projekt-IAM ist separat. Zentraler initialer Owner und Workload-Automation sind getrennt. Voller Owner bleibt Kundenwahl; geerbte Rechte sind additiv."
              : scenario.corporateIpv4 === "advice"
                ? "Automatisch übernimmt das Standardpräfix /28 der SNA. Der Provider benötigt bei gesetztem DNS ein explizites Präfix; das native Modul liest es im Plan aus der SNA und übergibt es explizit. DNS bleibt erhalten. Freie Kapazität ist nicht garantiert."
                : scenario.topic === "vpn"
                  ? buildAssistantKnowledge().topics.find(
                      (topic) => topic.id === "vpn",
                    )?.fieldOverview
                  : `Nur Beratung, keine Speicherung oder Ausfuehrung. ${scenario.requiredOverviewFields?.join(", ") ?? ""}. Namen 1-40 Zeichen; Beschreibungen nicht unterstützt und abgelehnt. pass, block, reject; explizite Synchronisierung. ${scenario.dnsRole ? dnsRoleExplanation : ""} git_flavor=null erstellt keine Git-Instanz; git-10 ist kein automatisch aktivierter Standard.`,
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

it("rejects an invented enabled Git flavor default and requires the null boundary", () => {
  expect(
    assistantDevOpsDefaultFailures(
      "git_flavor=null erstellt keine Git-Instanz. git-10 ist kein Standard, sondern nur ein Syntaxbeispiel.",
    ),
  ).toEqual([]);
  expect(
    assistantDevOpsDefaultFailures("Der native Standard ist git-10."),
  ).toEqual([
    "devops_null_default_no_instance_missing",
    "devops_enabled_flavor_default_invented",
  ]);
});

it("checks DNS meaning rather than merely accepting correct keywords or references", () => {
  expect(assistantDnsRoleFailures(dnsRoleExplanation, "roles")).toEqual([]);
  expect(
    assistantDnsRoleFailures(
      "primary, secondary, public, private, autoritativ.",
      "roles",
    ),
  ).toEqual(
    expect.arrayContaining([
      "dns_primary_role_missing",
      "dns_secondary_role_missing",
      "dns_visibility_role_confused",
      "dns_secondary_limit_missing",
    ]),
  );
  expect(
    assistantDnsRoleFailures(
      `${dnsRoleExplanation} Secondary ist nicht autoritativ.`,
      "roles",
    ),
  ).toContain("dns_secondary_authority_denied");
  expect(
    assistantDnsRoleFailures(
      "Primary repliziert von externen Servern. Secondary verwaltet die führenden Einträge.",
      "roles",
    ),
  ).toEqual(
    expect.arrayContaining([
      "dns_primary_role_missing",
      "dns_secondary_role_missing",
    ]),
  );
  expect(
    assistantDnsRoleFailures(
      "Secondary repliziert externe Daten. Der Accelerator unterstützt die Primary-Server vollständig.",
      "secondary",
    ),
  ).toContain("dns_secondary_limit_missing");
});

it.each(["repliziert", "replizieren", "replizierte"])(
  "recognizes the real-model German replication wording %s without requiring the synonym Kopie",
  (word) => {
    const explanation = dnsRoleExplanation.replace(
      "repliziert eine Kopie",
      word,
    );
    expect(assistantDnsRoleFailures(explanation, "roles")).toEqual([]);
  },
);

it("checks a new primary DNS zone through native proposal application without rewriting existing zones", () => {
  const scenario = assistantScenarios.find(
    (entry) => entry.id === "dns-zone-role-draft",
  );
  if (!scenario) throw new Error("missing_fixture");
  const input = {
    explanation: "Noch nichts gespeichert.",
    references: ["dns-zones"],
    questions: [],
    changes: [
      {
        path: "connectivity.dns_zones",
        operation: "merge",
        value: {
          company: {
            dns_name: "new-company.stackit.gg",
            type: "primary",
            contact_email: "owner@example.test",
          },
        },
      },
    ],
  };
  expect(validateAssistantScenario(scenario, input).failures).toEqual([]);
  expect(
    validateAssistantScenario(scenario, {
      ...input,
      changes: [
        {
          ...input.changes[0],
          operation: "replace",
        },
      ],
    }).failures,
  ).toContain("dns_unrelated_configuration_changed");
  expect(() =>
    validateAssistantScenario(scenario, {
      ...input,
      changes: [
        {
          ...input.changes[0],
          value: {
            company: { ...input.changes[0]?.value.company, type: "public" },
          },
        },
      ],
    }),
  ).toThrow();
});

it.each([
  "identity-foundations-advice",
  "governance-folders-advice",
  "firewall-policy-advice",
  "sandbox-projects-advice",
  "vpn-advice",
  "devops-git-advice",
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

it("requires native VPN defaults and separate PSK binding, rejecting invented routing enums", () => {
  const scenario = assistantScenarios.find(
    (entry) => entry.id === "vpn-advice",
  );
  if (!scenario) throw new Error("missing_fixture");
  const explanation = buildAssistantKnowledge().topics.find(
    (topic) => topic.id === "vpn",
  )?.fieldOverview;
  if (!explanation) throw new Error("missing_vpn_overview");
  const input = {
    explanation,
    questions: [],
    changes: [],
    references: ["vpn"],
  };
  expect(validateAssistantScenario(scenario, input).failures).toEqual([]);
  expect(
    validateAssistantScenario(scenario, {
      ...input,
      explanation: scenario.requiredOverviewFields?.join(", "),
    }).failures,
  ).toContain("incomplete_native_vpn_contract");
  expect(
    validateAssistantScenario(scenario, {
      ...input,
      explanation: `${explanation}\nrouting_type unterstützt static oder dynamic.`,
    }).failures,
  ).toContain("incorrect_vpn_routing_type");
});

it("qualifies reviewed DNS field semantics against the unchanged role and secondary-limit oracles", () => {
  const explanation = buildAssistantKnowledge().topics.find(
    (topic) => topic.id === "dns-zones",
  )?.fieldOverview;
  if (!explanation) throw new Error("missing_dns_overview");
  expect(explanation.length).toBeLessThanOrEqual(2400);
  expect(assistantDnsRoleFailures(explanation, "roles")).toEqual([]);
  for (const scenario of assistantScenarios.filter(
    (entry) => entry.dnsRole === "roles" || entry.dnsRole === "secondary",
  ))
    expect(
      validateAssistantScenario(scenario, {
        explanation,
        questions: [],
        changes: [],
        references: ["dns-zones"],
      }).failures,
    ).toEqual([]);
});

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
              example: {
                name: zone.name,
                description: zone.description,
                contact_email: zone.contact_email,
              },
            },
          },
        ],
      }).failures,
    ).toEqual([]);
    for (const overrides of [{ default_ttl: 7200 }, { contact_email: null }]) {
      expect(
        validateAssistantScenario(scenario, {
          ...input,
          changes: [
            {
              path: "connectivity.dns_zones",
              value: { example: { ...zone, ...overrides } },
            },
          ],
        }).failures,
      ).toContain("dns_settings_or_contact_missing");
    }
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

it.each(["connectivity.firewall", "connectivity.firewall.ha"])(
  "qualifies a narrow HA proposal at %s by its exact effective state",
  (path) => {
    const scenario = assistantScenarios.find(
      (entry) => entry.id === "firewall-metro-ha-only",
    );
    if (!scenario) throw new Error("missing_fixture");
    const ha = { backup_zone: "eu01-2", vhid: 1 };
    const value: JsonValue = path.endsWith(".ha") ? ha : { ha };
    const input = {
      explanation:
        "Noch nichts gespeichert. Kein Deployment; Plan und Apply brauchen separate Freigaben.",
      questions: [],
      references: ["firewall-infrastructure"],
      changes: [{ path, operation: "merge", value }],
    };
    expect(validateAssistantScenario(scenario, input).failures).toEqual([]);
    expect(
      validateAssistantScenario(scenario, {
        ...input,
        changes: [
          {
            path: "connectivity.firewall.ha",
            operation: "merge",
            value: { ...ha, vhid: 2 },
          },
        ],
      }).failures,
    ).toContain("firewall_requested_ha_not_applied");
    expect(
      validateAssistantScenario(scenario, {
        ...input,
        changes: [
          {
            path: "connectivity.firewall",
            operation: "merge",
            value: { ha, flavor: "g1.4" },
          },
        ],
      }).failures,
    ).toContain(
      "firewall_metro_ha_changed_native_ip_defaults_or_saved_appliance",
    );
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

it("requires factual Automatic/DNS advice and rejects fixed-size or DNS-removal claims", () => {
  const correct =
    "Automatisch übernimmt das Standardpräfix /28 der SNA. Der Provider benötigt bei gesetztem DNS ein explizites Präfix; das native Modul liest es im Plan aus der SNA und übergibt es explizit. DNS bleibt erhalten. Freie Kapazität ist nicht garantiert.";
  expect(assistantCorporateIpv4Failures(correct)).toEqual([]);
  expect(
    assistantCorporateIpv4Failures(
      `${correct} Du musst nicht /24 setzen. DNS muss nicht abgeschaltet werden. Der Provider liest den SNA-Default nicht.`,
    ),
  ).toEqual([]);
  expect(
    assistantCorporateIpv4Failures(
      "Automatisch /28 SNA Standard DNS Provider explizites Präfix",
    ),
  ).not.toEqual([]);
  expect(
    assistantCorporateIpv4Failures(`${correct} Du musst /24 setzen.`),
  ).toContain("corporate_ipv4_invented_fixed_size_or_dns_removal");
  expect(
    assistantCorporateIpv4Failures(`${correct} DNS muss abgeschaltet werden.`),
  ).toContain("corporate_ipv4_invented_fixed_size_or_dns_removal");
});

it("accepts numeric-prefix wording and DNS with an IP while rejecting inverted cause/reader claims", () => {
  const correct =
    "Automatisch liest das Corporate-Modul den SNA-Standard /28 und übergibt einen numerischen Präfix an den Provider. Der DNS-Eintrag (hier: 1.1.1.1) bleibt unverändert erhalten. Freie Kapazität ist nicht garantiert.";
  expect(assistantCorporateIpv4Failures(correct)).toEqual([]);
  expect(
    assistantCorporateIpv4Failures(
      `${correct} Der Provider liest den SNA-Default.`,
    ),
  ).toContain("corporate_ipv4_failure_condition_inverted");
  expect(
    assistantCorporateIpv4Failures(
      `${correct} Null ohne DNS lehnt der Provider ab.`,
    ),
  ).toContain("corporate_ipv4_failure_condition_inverted");
});

it("rejects attributing the native sizing fix to a provider upgrade", () => {
  const base =
    "Automatisch übernimmt das Standardpräfix /28 der SNA. Das Modul übergibt dem Provider den numerischen Präfix mit unveränderten DNS-Servern. Freie Kapazität ist nicht garantiert.";
  expect(assistantCorporateIpv4Failures(base)).toEqual([]);
  expect(
    assistantCorporateIpv4Failures(
      `${base} Dieser Fehler wurde nicht durch einen Provider-Upgrade, sondern durch eine Korrektur im Accelerator-Modul behoben.`,
    ),
  ).toEqual([]);
  expect(
    assistantCorporateIpv4Failures(
      `${base} Vor und nach dem Modul-Fix bleibt der Provider bei 0.114.0. Im korrigierten Accelerator bleibt Provider 0.114.0 unverändert.`,
    ),
  ).toEqual([]);
  expect(
    assistantCorporateIpv4Failures(
      `${base} Der Provider vor 0.114.0 scheiterte; ein Provider-Upgrade hat den Fehler behoben.`,
    ),
  ).toContain("corporate_ipv4_invented_provider_upgrade");
});

it.each(["automatic", "explicit"] as const)(
  "checks Corporate %s proposals preserve the full draft and exact prefix",
  (mode) => {
    const scenario = assistantScenarios.find(
      (entry) => entry.id === `corporate-ipv4-${mode}-proposal`,
    );
    if (!scenario) throw new Error("scenario_missing");
    const prefix = mode === "automatic" ? null : 26;
    const dialogue = {
      explanation:
        "Überprüfbarer Vorschlag für die angeforderte Netzgröße. Noch nichts gespeichert.",
      questions: [],
      references: ["project-templates"],
      changes: [
        {
          path: "projectTemplates",
          operation: "merge",
          value: { central: { settings: { network_prefix_length: prefix } } },
        },
      ],
    };
    expect(validateAssistantScenario(scenario, dialogue).failures).toEqual([]);
    expect(
      validateAssistantScenario(scenario, {
        ...dialogue,
        changes: [
          {
            ...dialogue.changes[0],
            value: { central: { settings: { network_prefix_length: 24 } } },
          },
        ],
      }).failures,
    ).toContain("corporate_ipv4_proposal_incorrect_or_unrelated_change");
    expect(
      validateAssistantScenario(scenario, {
        ...dialogue,
        changes: [
          {
            ...dialogue.changes[0],
            value: {
              central: {
                settings: {
                  network_prefix_length: prefix,
                  secretsmanager_enabled: false,
                },
              },
            },
          },
        ],
      }).failures,
    ).toContain("corporate_ipv4_proposal_incorrect_or_unrelated_change");
  },
);
