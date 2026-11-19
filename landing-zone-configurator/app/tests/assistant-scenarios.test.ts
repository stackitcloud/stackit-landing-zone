import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  applicationProjectPermissionNames,
  applicationServiceAccountKeyPermissions,
  defaultApplicationAccessProfile,
  featureFieldCatalogue,
  type JsonValue,
  objectValue,
} from "@lzc/domain";
import { expect, it } from "vitest";
import { buildMultiTemplatePermissionDialogue } from "../apps/api/src/assistant/application-permission-dialogue.js";
import {
  assistantKnowledgeContext,
  buildAssistantKnowledge,
} from "../apps/api/src/assistant/knowledge.js";
import { buildAssistantTopicFieldPaths } from "../apps/api/src/assistant/topic-fields.js";
import {
  assistantCorporateIpv4Failures,
  assistantDevOpsDefaultFailures,
  assistantDnsRoleFailures,
  assistantFirewallBootstrapFailures,
  assistantPlatformImpactReviewFailures,
  assistantPrematurePersistenceClaim,
  assistantScenarioFixture,
  assistantScenarios,
  buildAssistantScenarioInventory,
  syntheticOrganizationId,
  validateAssistantScenario,
} from "../scripts/assistant-scenarios.js";

const sourceGuidanceExamples = {
  "git-user-limit":
    "Git100 supports up to 100 users per instance. For 250 users, use separate project or team instances, or assess another architecture; these are independent services.",
  "project-git":
    "Project Git is optional: enabled, flavor and source ACL are controlled by the template. The managed endpoint remains public; SNA membership does not make it private.",
  "state-coordination":
    "Conditional writes cannot provide lockfile exclusion on the tested endpoint. Standalone CLI requires an organizational single-writer policy. The Configurator database coordinates jobs. Native support has no announced date.",
};

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
    if (scenario.id.startsWith("editor-devops-over-capacity")) {
      const answer = {
        explanation:
          scenario.expectedLanguage === "de"
            ? "Git100: höchstens 100 Nutzer pro Instanz. Getrennte Team-/Projektinstanzen benötigen separate Konfiguration."
            : "Git100: at most 100 users per instance. Separate team/project instances require separate configuration.",
        changes: [],
        references: [scenario.topic],
        questions: [
          {
            path: "devops.git_flavor",
            answerType: "requirements" as const,
            text: "Scope?",
            options: ["Separate teams", "Smaller initial scope"],
          },
        ],
      };
      expect(validateAssistantScenario(scenario, answer).failures).toEqual([]);
      expect(
        validateAssistantScenario(scenario, {
          ...answer,
          explanation:
            "I recommend Git100 as the company standard for 150 users.",
          questions: [
            {
              ...answer.questions[0]!,
              answerType: "catalogue",
              options: ["Git100", "Git10"],
            },
          ],
        }).failures,
      ).toContain("git_over_capacity_must_clarify_topology_before_flavor");
      return;
    }
    if (scenario.nativeDefaultResetPath) {
      const result = {
        explanation:
          "Reset the requested native override in the local draft. Nothing has been saved.",
        questions: [],
        changes: [
          {
            path: scenario.nativeDefaultResetPath,
            operation: "default" as const,
            value: null,
          },
        ],
        references: [scenario.topic],
      };
      expect(validateAssistantScenario(scenario, result).failures).toEqual([]);
      expect(
        validateAssistantScenario(scenario, { ...result, changes: [] })
          .failures,
      ).toContain("native_default_not_completed");
      return;
    }
    if (scenario.setupQuestionPaths) {
      expect(
        validateAssistantScenario(scenario, {
          explanation: scenario.gitCapacityRecommendation
            ? "I recommend Git100 for 80 users. Git10 supports at most 10 users; Git100 supports at most 100 users. Nothing changed."
            : scenario.id === "editor-devops-company-standard"
              ? "Starting size selected: Git100. Nothing changed."
              : "Nothing changed.",
          changes: [],
          references: [scenario.topic],
          questions: [
            {
              path: scenario.setupQuestionPaths[0],
              text: "Please choose.",
              options:
                scenario.setupQuestionPaths[0] === "devops.git_flavor"
                  ? ["Git100 — recommended", "Git10 — pilot"]
                  : ["Company networks", "Specific source IPs"],
            },
          ],
        }).failures,
      ).toEqual([]);
      expect(
        validateAssistantScenario(scenario, {
          explanation: scenario.gitCapacityRecommendation
            ? "I recommend Git100 for 80 users. Git10 supports at most 10 users; Git100 supports at most 100 users. Nothing changed."
            : scenario.id === "editor-devops-company-standard"
              ? "Starting size selected: Git100. Nothing changed."
              : "Nothing changed.",
          changes: [],
          references: [scenario.topic],
          questions: [],
        }).failures,
      ).toContain("setup_must_ask_missing_choices_without_changes");
    } else if (scenario.auditQuestionPaths) {
      expect(
        validateAssistantScenario(scenario, {
          explanation: "Reviewable local draft only.",
          changes: [],
          references: [scenario.topic],
          questions: scenario.auditQuestionPaths.map((path) => ({
            path,
            text: "Please supply your actual decision.",
            options: [],
          })),
        }).failures,
      ).toEqual([]);
    } else if (scenario.editorExpected) {
      const root = scenario.editorExpected.path.split(".")[0] ?? "";
      const values: Record<string, JsonValue> = {
        audit_logs: {
          retention_days: 90,
          acl: ["203.0.113.0/24"],
          s3_object_lock: false,
          ...(scenario.id === "editor-audit-managed"
            ? { managed_resources: true }
            : {}),
          ...(scenario.id === "editor-audit-explicit-project"
            ? {
                link_scopes: [
                  {
                    resource_type: "project",
                    resource_id: "00000000-0000-4000-8000-000000000099",
                  },
                ],
              }
            : {}),
        },
        observability: {
          metrics_retention_days: 30,
          ...(scenario.id === "editor-monitoring-retention"
            ? { plan_name: "Observability-Monitoring-Medium-EU01" }
            : {}),
        },
        bucket_naming: "project-id",
        devops: {
          git_flavor: [
            "editor-devops-company-complete",
            "editor-devops-reuse-allowlist",
            "editor-devops-capacity-narrowed",
            "editor-devops-sized-80-followup",
            "consultation-company-git-default-en",
            "consultation-company-git-default-de",
          ].includes(scenario.id)
            ? "git-100"
            : "git-10",
          allowed_network_ranges: scenario.nativeDefaultExpected
            ? ["0.0.0.0/0"]
            : ["203.0.113.0/24"],
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
          explanation: scenario.gitCapacityRecommendation
            ? "I recommend Git100 for 80 users. Git10 supports at most 10 users; Git100 supports at most 100 users. Reviewable draft only."
            : "Reviewable local draft only.",
          questions: [],
          changes: [{ path: root, value: values[root], operation: "merge" }],
          references: [scenario.topic],
        }).failures,
      ).toEqual([]);
    } else if (scenario.fixture === "baseline") {
      expect(
        validateAssistantScenario(scenario, {
          explanation: scenario.sourceGuidance
            ? sourceGuidanceExamples[scenario.sourceGuidance]
            : scenario.platformImpactReview
              ? "Der Platform Owner entscheidet über Löschungen und Ersetzungen nach Prüfung möglicher Datenverluste und betroffener Applications. Bestätigung bindet Artefakt-Hash, State und Abhängigkeiten. Neuer Plan, Apply separat; Observability bleibt Ziel."
              : scenario.id === "application-upgrade-self-service-advice"
                ? "Der Platform Owner veröffentlicht einen Upgrade-Pfad. Antworten und State bleiben erhalten. Ein neuer Plan und separate Apply-Freigabe sind erforderlich. Löschungen und Ersetzungen bestehender Infrastruktur werden blockiert. Bei eigenständiger Durchführung ist keine zusätzliche Platform-Owner-Freigabe erforderlich."
                : scenario.applicationUpgrade === "template"
                  ? "Der Platform Owner veröffentlicht einen Upgrade-Pfad. Antworten und State bleiben erhalten. Ein neuer Plan und separate Apply-Freigabe sind erforderlich. Löschungen und Ersetzungen werden blockiert."
                  : scenario.applicationUpgrade === "platform"
                    ? "Gemeinsame Änderungen betreffen alle abhängigen Applications. Abhängigkeitsprüfung und Plan-Freigabe stehen vor Apply. Danach den tatsächlich entstandenen Plattformvertrag und den Pfad veröffentlichen. Die Vertragsbindung wechselt nicht automatisch. Der Application Owner übernimmt ihn ausdrücklich. Keine private alte Firewall."
                    : scenario.executionLifecycle
                      ? "Ursprüngliche Template-Revision bleibt erhalten. Die gewünschte Quelle bleibt gebunden; zuletzt angewendet ändert sich erst nach erfolgreichem Apply. Bestehende Bestellung und State bleiben erhalten. Ein neuer Plan und die normale Apply-Freigabe sind erforderlich. Zurückgezogene Quellen brauchen einen geprüften Ersatz, keine Neubestellung; der Chat führt kein Upgrade aus."
                      : scenario.applicationAccess === "advice"
                        ? "Granulare VM-Rechte empfohlen. IDP bestätigt Identität; Projekt-IAM ist separat. Zentraler initialer Owner und Workload-Automation sind getrennt. Voller Owner bleibt Kundenwahl; geerbte Rechte sind additiv. Der Besteller erhält 191 Rechte mit projektweiter Schlüsselverwaltung; Automation erhält 184 Workload-Rechte."
                        : scenario.corporateIpv4 === "advice"
                          ? "Automatisch übernimmt das Standardpräfix /28 der SNA. Der Provider benötigt bei gesetztem DNS ein explizites Präfix; das native Modul liest es im Plan aus der SNA und übergibt es explizit. DNS bleibt erhalten. Freie Kapazität ist nicht garantiert."
                          : [
                                "vpn",
                                "platform-kubernetes",
                                "firewall-access-bootstrap",
                              ].includes(scenario.topic)
                            ? buildAssistantKnowledge().topics.find(
                                (topic) => topic.id === scenario.topic,
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
  "platform-kubernetes-advice",
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
  expect(
    assistantCorporateIpv4Failures(
      "Automatisch = natives null. Bei Corporate-Projekten löst der Accelerator die default_prefix_length der regionalen SNA (hier /28) vor dem Plan auf und behält die DNS-Server bei. Der ältere Provider akzeptierte null mit DNS nicht; numerische Overrides gewinnen Vorrang. Ein /24 ist nicht zwingend und DNS muss nicht deaktiviert werden. Freie Adressen sind nicht garantiert.",
    ),
  ).toEqual([]);
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

it.each(["behält", "behaelt"])(
  "recognizes inflected DNS preservation (%s ... bei) without accepting negation or another object's preservation",
  (verb) => {
    const facts =
      "Automatisch liest das Corporate-Modul den SNA-Standard /28 und übergibt dem Provider den numerischen Präfix. Freie Kapazität ist nicht garantiert.";
    // Exact sentence from the failed live receipt; its factual claims were correct.
    const originalSentence = `Mit 'Automatisch' und SNA-Default /28 erhält der Provider korrekt prefix: 28 und ${verb} die DNS-Server bei.`;
    const correct = `${facts} ${originalSentence}`;
    expect(assistantCorporateIpv4Failures(correct)).toEqual([]);
    for (const claim of [
      `${verb} die DNS-Server nicht bei`,
      `${verb} keine DNS-Server bei`,
      `${verb} die VM-Konfiguration bei; DNS wird deaktiviert`,
      `${verb} die VM-Konfiguration bei. DNS ist konfiguriert`,
    ])
      expect(
        assistantCorporateIpv4Failures(`${facts} Der Provider ${claim}.`),
      ).toContain("corporate_ipv4_dns_preservation_missing");
    expect(
      assistantCorporateIpv4Failures(
        `${correct} DNS muss abgeschaltet werden.`,
      ),
    ).toContain("corporate_ipv4_invented_fixed_size_or_dns_removal");
    expect(
      assistantCorporateIpv4Failures(`${correct} Du musst /24 setzen.`),
    ).toContain("corporate_ipv4_invented_fixed_size_or_dns_removal");
  },
);

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

it("requires Kubernetes network and protected-access substance instead of repetitive meta-advice", () => {
  const scenario = assistantScenarios.find(
    (entry) => entry.id === "platform-kubernetes-advice",
  );
  const explanation = buildAssistantKnowledge().topics.find(
    (topic) => topic.id === "platform-kubernetes",
  )?.fieldOverview;
  if (!scenario || !explanation) throw new Error("missing_kubernetes_overview");
  const input = {
    explanation,
    questions: [],
    changes: [],
    references: ["platform-kubernetes"],
  };
  expect(validateAssistantScenario(scenario, input).failures).toEqual([]);
  const repeated =
    "Keine Erklärung von nicht unterstützten Feldern oder Formen. Keine Erwähnung von Firewall oder VPN. ".repeat(
      15,
    );
  expect(
    validateAssistantScenario(scenario, { ...input, explanation: repeated })
      .failures,
  ).toContain("incomplete_native_field_overview");
  expect(
    validateAssistantScenario(scenario, {
      ...input,
      explanation: `${scenario.requiredOverviewFields?.join(", ")}. ${repeated}`,
    }).failures,
  ).toContain("incomplete_platform_kubernetes_boundaries");
  expect(
    validateAssistantScenario(scenario, {
      ...input,
      explanation: `${scenario.requiredOverviewFields?.join(", ")}. Bitte Kubeconfig-Inhalte im Chat eintragen.`,
    }).failures,
  ).toContain("incomplete_platform_kubernetes_boundaries");
});

it("requires SKE additions for both recipients in both templates without losing existing rights or owner", () => {
  const scenario = assistantScenarios.find(
    (s) => s.id === "application-access-both-kubernetes",
  );
  if (!scenario) throw new Error("scenario_missing");
  const fixture = assistantScenarioFixture(scenario);
  const additions = applicationProjectPermissionNames.filter((p) =>
    p.startsWith("ske."),
  );
  const value = Object.fromEntries(
    (fixture.draft.projectTemplates ?? []).map((t) => {
      const p = t.accessProfile;
      if (p?.mode !== "granular") throw new Error("profile_missing");
      return [
        t.key,
        {
          accessProfile: {
            ...p,
            permissions: [...new Set([...p.permissions, ...additions])],
            automationPermissions: [
              ...new Set([...p.automationPermissions, ...additions]),
            ],
          },
        },
      ];
    }),
  );
  const dialogue = {
    explanation:
      "Prüfbarer Rechtevorschlag für beide Vorlagen und Empfänger. Noch nichts gespeichert.",
    questions: [],
    references: ["project-templates"],
    changes: [{ path: "projectTemplates", operation: "merge", value }],
  };
  expect(validateAssistantScenario(scenario, dialogue).failures).toEqual([]);
  const oneTarget = structuredClone(dialogue);
  delete oneTarget.changes[0]!.value["public-workload"];
  expect(validateAssistantScenario(scenario, oneTarget).failures).toContain(
    "application_access_multi_target_union_or_preservation_failed",
  );
  const missingRecipient = structuredClone(dialogue);
  missingRecipient.changes[0]!.value
    .central!.accessProfile.automationPermissions = ["iaas.server.get"];
  expect(
    validateAssistantScenario(scenario, missingRecipient).failures,
  ).toContain("application_access_multi_target_union_or_preservation_failed");
  const lostOwner = structuredClone(dialogue);
  lostOwner.changes[0]!.value.central!.accessProfile.initialOwnerEmail =
    "other@example.test";
  expect(validateAssistantScenario(scenario, lostOwner).failures).toContain(
    "application_access_multi_target_union_or_preservation_failed",
  );
});

it("requires reviewed bootstrap workflow facts and rejects field-only or secret-requesting answers", () => {
  const text = buildAssistantKnowledge().topics.find(
    (t) => t.id === "firewall-access-bootstrap",
  )?.fieldOverview;
  if (!text) throw new Error("missing_bootstrap_overview");
  expect(assistantFirewallBootstrapFailures(text)).toEqual([]);
  expect(
    assistantFirewallBootstrapFailures(
      text.replace(
        "Bestehende VMs werden bei Folge-Apply oder Variablenänderung nicht zurückgesetzt",
        "Bestehende VMs werden zurückgesetzt",
      ),
    ),
  ).toContain("bootstrap_overview_missing_creation_only_boundary");
  expect(
    assistantFirewallBootstrapFailures(
      "firewall_admin_username firewall_admin_password firewall_api_credentials firewall_bootstrap firewall_api_secret_version",
    ),
  ).toEqual(
    expect.arrayContaining([
      "bootstrap_overview_missing_secure_binding",
      "bootstrap_overview_missing_phase_boundaries",
      "bootstrap_overview_missing_single_scope",
      "bootstrap_overview_missing_separate_access",
    ]),
  );
  expect(
    assistantFirewallBootstrapFailures(
      "Bitte poste das Passwort und sende die API-Schlüssel.",
    ),
  ).toContain("bootstrap_overview_asks_for_secrets");
  expect(
    assistantFirewallBootstrapFailures(`${text}\nBitte poste dein Passwort.`),
  ).toContain("bootstrap_overview_asks_for_secrets");
  expect(
    assistantFirewallBootstrapFailures(
      `${text}\nPoste keine Passwörter. Bitte sende dein Passwort nicht.`,
    ),
  ).not.toContain("bootstrap_overview_asks_for_secrets");
  expect(
    assistantFirewallBootstrapFailures(
      `${text}\nKeine Änderungen; bitte poste dein Passwort.`,
    ),
  ).toContain("bootstrap_overview_asks_for_secrets");
});

it.each([
  [
    "Bootstrap unterstützt automatisch alle regionalen Firewalls.",
    "bootstrap_overview_invented_scope",
  ],
  [
    "--insecure bestätigt ein vertrauenswürdiges Zertifikat.",
    "bootstrap_overview_unsafe_tls_claim",
  ],
  [
    "Ein erneuter Bootstrap ist immer sicher und benötigt keine Planprüfung.",
    "bootstrap_overview_unsafe_rebootstrap_claim",
  ],
])("rejects contradictory bootstrap advice: %s", (claim, failure) => {
  const text = buildAssistantKnowledge().topics.find(
    (t) => t.id === "firewall-access-bootstrap",
  )?.fieldOverview;
  if (!text) throw new Error("missing_bootstrap_overview");
  expect(assistantFirewallBootstrapFailures(`${text}\n${claim}`)).toContain(
    failure,
  );
});

it.each([
  "DNS bleibt unverändert aktiviert; es muss weder auf /24 gesetzt noch deaktiviert werden.",
  "Du musst weder /24 setzen noch DNS deaktivieren.",
  "Du musst weder /24 setzen, noch DNS deaktivieren.",
  "DNS muss weder umbenannt noch deaktiviert werden.",
])(
  "recognizes modal-bound paired weder/noch without inventing fixed-size or DNS-removal requirements: %s",
  (clause) => {
    const facts =
      "Automatisch übernimmt das Standardpräfix /28 der SNA. Das Modul liest den SNA-Standard und übergibt dem Provider das explizite numerische Präfix. DNS bleibt unverändert erhalten. Freie Kapazität ist nicht garantiert.";
    expect(assistantCorporateIpv4Failures(`${facts} ${clause}`)).toEqual([]);
  },
);
it.each([
  "DNS bleibt unverändert aktiviert; es muss weder auf /24 gesetzt noch deaktiviert werden. DNS muss abgeschaltet werden.",
  "DNS muss weder umbenannt noch deaktiviert werden; DNS muss abgeschaltet werden.",
  "DNS muss weder umbenannt noch deaktiviert werden, aber DNS muss abgeschaltet werden.",
  "Du musst weder /25 noch /26 nutzen, /24 ist zwingend erforderlich.",
  "Du musst weder /25 noch /26 wählen, für das Netz ist /24 erforderlich.",
  "Du musst weder /25 noch /26 nutzen: /24 ist zwingend erforderlich.",
  "Du musst weder /25 noch /26 nutzen und /24 ist zwingend erforderlich.",
  "Du musst weder /25 noch /26 nutzen sowie /24 ist zwingend erforderlich.",
  "Du musst weder /25 noch /26 nutzen and /24 is required.",
  "Du musst weder /25 noch /26 nutzen – /24 ist zwingend erforderlich.",
  "Du musst weder /25 noch /26 nutzen — /24 ist zwingend erforderlich.",
  "Du musst weder /25 noch /26 nutzen - /24 ist zwingend erforderlich.",
  "DNS muss weder umbenannt werden. DNS muss abgeschaltet werden.",
  "DNS muss weder umbenannt werden; DNS muss deaktiviert werden.",
  "DNS muss weder umbenannt noch verschoben werden, aber DNS muss deaktiviert werden.",
  "DNS muss weder umbenannt noch verschoben werden, jedoch DNS muss abgeschaltet werden.",
  "DNS muss weder umbenannt noch verschoben werden, sondern DNS muss deaktiviert werden.",
  "DNS muss weder umbenannt noch verschoben werden. Du musst /24 setzen.",
  "Du musst weder /25 nutzen noch /26 wählen; du musst /24 setzen.",
  "Weder Namen noch Labels ändern sich. DNS muss deaktiviert werden.",
  "DNS muss weder umbenannt werden und muss deaktiviert werden.",
  "DNS muss nicht umbenannt werden, aber DNS muss deaktiviert werden.",
  "DNS muss nicht umbenannt werden und DNS muss deaktiviert werden.",
])(
  "retains real wrong requirements outside a paired negative scope: %s",
  (clause) => {
    const facts =
      "Automatisch übernimmt das Standardpräfix /28 der SNA. Das Modul liest den SNA-Standard und übergibt dem Provider das explizite numerische Präfix. DNS bleibt unverändert erhalten. Freie Kapazität ist nicht garantiert.";
    expect(assistantCorporateIpv4Failures(`${facts} ${clause}`)).toContain(
      "corporate_ipv4_invented_fixed_size_or_dns_removal",
    );
  },
);

it("rejects setup questions even when the SNA native overview is factually complete", () => {
  const scenario = assistantScenarios.find(
    (entry) => entry.id === "stackit-network-components-advice",
  );
  const explanation = buildAssistantKnowledge().topics.find(
    (topic) => topic.id === "stackit-network-components",
  )?.fieldOverview;
  if (!scenario || !explanation) throw new Error("missing_sna_overview");
  const input = {
    explanation,
    questions: [],
    changes: [],
    references: ["stackit-network-components"],
  };
  expect(validateAssistantScenario(scenario, input).failures).toEqual([]);
  expect(
    validateAssistantScenario(scenario, {
      ...input,
      questions: [
        {
          path: "connectivity.network_areas",
          text: "Welchen freien Adresspool möchtest du verwenden?",
        },
      ],
    }).failures,
  ).toEqual(["native_field_overview_asked_setup_questions"]);
});

it("uses only the fixture's trusted owner identities when qualifying mixed-template choices", () => {
  const scenario = assistantScenarios.find(
    (s) => s.applicationAccess === "both-kubernetes-mixed-legacy",
  );
  if (!scenario) throw Error("missing_mixed_fixture");
  const fixture = assistantScenarioFixture(scenario);
  const values = fixture.values;
  const dialogue = buildMultiTemplatePermissionDialogue({
    templates: values.projectTemplates as Record<string, unknown>,
    originalRequest: scenario.message,
    services: ["ske"],
    permissionTarget: "both",
    permissionNames: [...applicationProjectPermissionNames],
    platformServiceAccountEmails: ["bootstrap-platform@sa.stackit.cloud"],
    english: false,
  });
  expect(validateAssistantScenario(scenario, dialogue).failures).toEqual([]);
  const foreign = structuredClone(dialogue);
  foreign.questions[0]!.options = [
    "Plattform-Service-Account (bootstrap-foreign@sa.stackit.cloud)",
  ];
  expect(() => validateAssistantScenario(scenario, foreign)).toThrow(
    "assistant_invalid_proposal",
  );
  const protectedText = structuredClone(dialogue);
  protectedText.questions[0]!.text = "Bitte API-Passwort nennen";
  expect(() => validateAssistantScenario(scenario, protectedText)).toThrow(
    "assistant_invalid_proposal",
  );
});

it.each(["z. B.", "z.\u202fB.", "z.B.", "e.g.", "e. g."])(
  "keeps DNS preservation in the same sentence across the abbreviation %s",
  (abbreviation) => {
    const facts =
      "Automatisch übernimmt das Standardpräfix /28 der SNA. Das Modul liest den SNA-Standard und übergibt dem Provider das explizite numerische Präfix. Freie Kapazität ist nicht garantiert. ";
    expect(
      assistantCorporateIpv4Failures(
        facts +
          `DNS-Einstellungen (${abbreviation} default_nameservers) bleiben unverändert erhalten und werden nicht deaktiviert.`,
      ),
    ).toEqual([]);
    expect(
      assistantCorporateIpv4Failures(
        facts + `DNS (${abbreviation}) muss deaktiviert werden.`,
      ),
    ).toContain("corporate_ipv4_invented_fixed_size_or_dns_removal");
    expect(
      assistantCorporateIpv4Failures(
        facts +
          `DNS (${abbreviation} default_nameservers) muss deaktiviert werden.`,
      ),
    ).toContain("corporate_ipv4_dns_preservation_missing");
    expect(
      assistantCorporateIpv4Failures(
        facts +
          `DNS wird gelöscht. ${abbreviation} ein anderer Wert bleibt unverändert erhalten.`,
      ),
    ).toContain("corporate_ipv4_dns_preservation_missing");
  },
);
it("does not normalize dotted DNS identifiers as prose abbreviations", () => {
  const facts =
    "Automatisch übernimmt das Standardpräfix /28 der SNA. Das Modul liest den SNA-Standard und übergibt dem Provider das explizite numerische Präfix. Freie Kapazität ist nicht garantiert. ";
  expect(
    assistantCorporateIpv4Failures(
      facts + "DNS z.b.example. Ein anderer Wert bleibt unverändert erhalten.",
    ),
  ).toContain("corporate_ipv4_dns_preservation_missing");
});

it("binds audit Grafana advice to native routing, retention and upgrade boundaries", () => {
  const topic = buildAssistantKnowledge().topics.find(
    (t) => t.id === "audit-logs",
  );
  expect(topic?.text).toContain("built-in");
  expect(topic?.text).toContain("users log in with SSO; no admin");
  expect(topic?.text).toContain("own retention/cost");
  expect(topic?.text).toContain("No order upgrade");
  expect(topic?.text).toContain("historical replay");
  expect(topic?.text).toContain("removes dedicated Logs");
  expect(topic?.sources.map((s) => s.path)).toContain(
    "src/modules/management/5-observability.tf",
  );
  expect(topic?.sources.map((s) => s.path)).toContain(
    "src/modules/management/6-audit-logs.tf",
  );
});

it("requires owner decision, data-loss information and exact-plan binding in platform impact advice", () => {
  const text =
    "Der Platform Owner entscheidet nach Prüfung über Löschungen und Ersetzungen mit möglichen Datenverlusten. Die Bestätigung bindet Artefakt-Hash, State und abhängige Applications. Einen neuen Plan erstellen; Apply separat freigeben.";
  expect(assistantPlatformImpactReviewFailures(text)).toEqual([]);
  expect(
    assistantPlatformImpactReviewFailures("Löschungen sind immer blockiert."),
  ).toContain("platform_impact_missing_owner-decision");
  expect(
    assistantPlatformImpactReviewFailures(
      text.replace("Artefakt-Hash", "Stand"),
    ),
  ).toContain("platform_impact_missing_artifact-binding");
});

it("rejects omitted or changed manually requested audit scopes", () => {
  const scenario = assistantScenarios.find(
    (entry) => entry.id === "editor-audit-explicit-project",
  )!;
  for (const scopes of [
    undefined,
    [
      {
        resource_type: "project",
        resource_id: "00000000-0000-4000-8000-000000000098",
      },
    ],
  ]) {
    const value = {
      retention_days: 90,
      acl: ["203.0.113.0/24"],
      s3_object_lock: false,
      ...(scopes === undefined ? {} : { link_scopes: scopes }),
    };
    expect(
      validateAssistantScenario(scenario, {
        explanation: "Reviewable local draft only.",
        questions: [],
        changes: [{ path: "audit_logs", operation: "replace", value }],
        references: ["audit-logs"],
      }).failures,
    ).toContain("editor_expected_value_not_applied");
  }
});

it.each(assistantScenarios.filter((s) => s.auditQuestionPaths))(
  "requires the actual remaining audit decisions: $id",
  (scenario) => {
    const answer = {
      explanation: "Noch nichts gespeichert.",
      changes: [],
      references: ["audit-logs"],
      questions: scenario.auditQuestionPaths!.map((path) => ({
        path,
        text: "Bitte die tatsächliche Entscheidung angeben.",
        options: [],
      })),
    };
    expect(validateAssistantScenario(scenario, answer).failures).toEqual([]);
    expect(
      validateAssistantScenario(scenario, { ...answer, questions: [] })
        .failures,
    ).toContain("audit_unanswered_decisions_not_preserved");
    expect(
      validateAssistantScenario(scenario, {
        ...answer,
        changes: [
          {
            path: "audit_logs",
            operation: "replace",
            value: { retention_days: 180, acl: [], s3_object_lock: true },
          },
        ],
      }).failures,
    ).toContain("audit_unanswered_decisions_not_preserved");
  },
);

it.each(Object.entries(sourceGuidanceExamples))(
  "rejects generic and contradictory %s advice",
  (kind, explanation) => {
    const scenario = assistantScenarios.find(
      (entry) => entry.sourceGuidance === kind,
    )!;
    const answer = {
      explanation,
      questions: [],
      changes: [],
      references: [scenario.topic],
    };
    expect(
      validateAssistantScenario(scenario, {
        ...answer,
        explanation: "Configuration is available.",
      }).failures,
    ).toContain("documented_service_boundary_missing");
    expect(
      validateAssistantScenario(scenario, {
        ...answer,
        explanation: `${explanation} Die Einstellungen bleiben unverändert.`,
      }).failures,
    ).toContain("dialogue_language_mismatch");
  },
);

it("rejects managed Git private attachment and display-label flavor inventions", () => {
  const scenario = assistantScenarios.find(
    (entry) => entry.sourceGuidance === "project-git",
  )!;
  const answer = { questions: [], changes: [], references: [scenario.topic] };
  for (const [suffix, error] of [
    [
      "Private reachability requires a dedicated Git instance per project.",
      "project_git_private_attachment_invented",
    ],
    ["The flavor must be 'Git100'.", "git_display_label_used_as_flavor"],
  ])
    expect(
      validateAssistantScenario(scenario, {
        ...answer,
        explanation: `${sourceGuidanceExamples["project-git"]} ${suffix}`,
      }).failures,
    ).toContain(error);
});

it("rejects an unhelpful or undersized final answer even when an access question exists", async () => {
  const { assistantGitCapacityRecommendationFailures: check } = await import(
    "../scripts/assistant-scenarios.js"
  );
  expect(
    check(
      "I recommend Git100 for 80 users: Git10 supports at most 10 users and Git100 supports at most 100 users.",
      80,
      "git-100",
    ),
  ).toEqual([]);
  expect(
    check(
      "Für 80 Nutzer empfehle ich Git100: Git10 unterstützt höchstens 10 Nutzer, Git100 höchstens 100 Nutzer.",
      80,
      "git-100",
    ),
  ).toEqual([]);
  expect(
    check(
      "Choose a starting option below. Nothing has been saved.",
      80,
      "git-100",
    ),
  ).toContain("git_capacity_missing_recommendation");
  expect(
    check(
      "I recommend Git10 for 80 users. Git10 supports at most 10 users; Git100 supports at most 100 users.",
      80,
      "git-100",
    ),
  ).toContain("git_capacity_missing_recommendation");
  expect(
    check(
      "I recommend Git100. Git10 supports 10 users and Git100 supports 100 users.",
      80,
      "git-100",
    ),
  ).toContain("git_capacity_missing_count");
});

it("compares permission sets semantically while still rejecting extra rights for the wrong principal", async () => {
  const { materializeConsultationChanges } = await import(
    "../apps/api/src/assistant/proposal-operations.js"
  );
  const scenario = assistantScenarios.find(
    (entry) =>
      entry.id === "application-service-account-key-management-proposal",
  )!;
  const fixture = assistantScenarioFixture(scenario);
  const changes = materializeConsultationChanges(
    [
      {
        path: "projectTemplates",
        operation: "add_permissions",
        value: {
          templateKeys: ["central"],
          principals: ["requester"],
          source: { kind: "permission_set", id: "service-account-keys" },
        },
      },
    ],
    fixture.values,
  );
  const profile = objectValue(
    objectValue(objectValue(changes[0]!.value).central).accessProfile,
  );
  (profile.permissions as string[]).reverse();
  const response = {
    explanation:
      "Vorschlag zur Prüfung; noch nichts gespeichert oder ausgeführt.",
    questions: [],
    changes,
    references: ["project-templates"],
  };
  expect(validateAssistantScenario(scenario, response).failures).toEqual([]);
  (profile.automationPermissions as string[]).push(
    "iam.service-account-key.create",
  );
  expect(validateAssistantScenario(scenario, response).failures).toContain(
    "application_access_proposal_incorrect_or_unrelated_change",
  );
});

it("keeps an exact permission list exact even when a broader reviewed workflow bundle exists", async () => {
  const { materializeConsultationChanges } = await import(
    "../apps/api/src/assistant/proposal-operations.js"
  );
  const scenario = assistantScenarios.find(
    (entry) =>
      entry.id ===
      "application-service-account-key-management-exact-identifiers",
  )!;
  const fixture = assistantScenarioFixture(scenario);
  const build = (ids: string[]) => ({
    explanation: "Review proposal only. Nothing has been saved or executed.",
    questions: [],
    references: ["project-templates"],
    changes: materializeConsultationChanges(
      [
        {
          path: "projectTemplates",
          operation: "add_permissions",
          value: {
            templateKeys: ["central"],
            principals: ["requester"],
            source: { kind: "permissions", ids },
          },
        },
      ],
      fixture.values,
    ),
  });
  expect(
    validateAssistantScenario(
      scenario,
      build(
        applicationServiceAccountKeyPermissions.filter(
          (name) => name !== "iam.service-account.list",
        ),
      ),
    ).failures,
  ).toEqual([]);
  expect(
    validateAssistantScenario(
      scenario,
      build([...applicationServiceAccountKeyPermissions]),
    ).failures,
  ).toContain("application_access_proposal_incorrect_or_unrelated_change");
});

it("retains an already recommended Git100 on a native-default follow-up without demanding another recommendation sentence", () => {
  const scenario = assistantScenarios.find(
    (entry) => entry.id === "consultation-company-git-default-en",
  )!;
  const response = {
    explanation:
      "Git100 is retained. The chosen Accelerator ACL default 0.0.0.0/0 permits public IPv4 access. Nothing has been saved.",
    questions: [],
    changes: [
      {
        path: "devops",
        operation: "merge",
        value: { git_flavor: "git-100", allowed_network_ranges: ["0.0.0.0/0"] },
      },
    ],
    references: ["devops-git"],
  };
  expect(validateAssistantScenario(scenario, response).failures).toEqual([]);
  response.changes[0]!.value.git_flavor = "git-10";
  expect(validateAssistantScenario(scenario, response).failures).toContain(
    "editor_expected_value_not_applied",
  );
});

it("accepts actual VM-preset counts in VM advice and rejects invented count pairs", () => {
  const scenario = assistantScenarios.find(
    (entry) => entry.id === "application-access-profile-advice",
  )!;
  const profile = defaultApplicationAccessProfile("", "vm");
  const explanation = `Das granulare VM-Profil application-vm-v1 hat ${profile.permissions.length} Besteller-Rechte inklusive Schlüsselverwaltung und ${profile.automationPermissions.length} Automation-Rechte. Schlüsselverwaltung gilt projektweit für alle Service Accounts und deren volle Rechte auch außerhalb des Projekts. Privilegierte Platform Accounts gehören außerhalb. Ein separater initialer Owner bleibt erhalten; volle Owner-Rechte sind Kundenwahl. Granulare Rechte heben geerbte Owner-Rechte nicht auf.`;
  const answer = {
    explanation,
    questions: [],
    changes: [],
    references: ["project-templates"],
  };
  expect(validateAssistantScenario(scenario, answer).failures).toEqual([]);
  expect(
    validateAssistantScenario(scenario, {
      ...answer,
      explanation: explanation.replace(
        String(profile.automationPermissions.length),
        "9999",
      ),
    }).failures,
  ).toContain("application_access_missing_actual_preset_counts");
  expect(
    validateAssistantScenario(scenario, {
      ...answer,
      explanation: explanation.replace("projektweit", "lokal"),
    }).failures,
  ).toContain("application_access_missing_project-key-scope");
});

it("recognizes DNS roles across Markdown paragraphs while rejecting reversed roles", () => {
  const text =
    "Beide Zonentypen primary und secondary sind autoritativ; public/private ist keine Typauswahl.\n\n**Primary-Zone:**\nHier werden die originalen DNS-Einträge verwaltet. Empfohlen für eine neue Firmenzone.\n\n**Secondary-Zone:**\nSie repliziert eine externe Primärzone. Der native Accelerator bildet die Secondary-Transferkonfiguration nicht vollständig ab.";
  expect(assistantDnsRoleFailures(text, "roles")).toEqual([]);
  expect(
    assistantDnsRoleFailures(
      text.replace(
        "Sie repliziert eine externe Primärzone.",
        "Sie erzeugt unabhängige Daten.",
      ),
      "roles",
    ),
  ).toContain("dns_secondary_role_missing");
  expect(
    assistantDnsRoleFailures(
      text + "\nSecondary ist nicht autoritativ.",
      "roles",
    ),
  ).toContain("dns_secondary_authority_denied");
});
it("associates a recommendation heading with its immediate Primary answer, not another role elsewhere", () => {
  const roles =
    "Primary verwaltet die originalen Records bei STACKIT. Secondary repliziert eine externe Primary. Beide sind autoritativ; public/private ist keine Typauswahl. Der native Accelerator bildet die Secondary-Konfiguration nicht vollständig ab.";
  expect(assistantDnsRoleFailures(roles, "roles")).toContain(
    "dns_primary_recommendation_missing",
  );
  expect(
    assistantDnsRoleFailures(
      roles +
        "\n\n**Empfehlung für eine bei STACKIT verwaltete Firmenzone**\nFür die von euch gepflegte Zone ist primary der passende Typ.",
      "roles",
    ),
  ).toEqual([]);
  expect(
    assistantDnsRoleFailures(
      roles +
        "\n\n**Empfehlung für die Firmenzone**\nSecondary ist der passende Typ. Primary bleibt eine andere Möglichkeit.",
      "roles",
    ),
  ).toContain("dns_primary_recommendation_missing");
  expect(
    assistantDnsRoleFailures(
      roles +
        "\n\n**Empfehlung für die Firmenzone**\n→ **primary**. STACKIT verwaltet die Records.",
      "roles",
    ),
  ).toEqual([]);
  expect(
    assistantDnsRoleFailures(
      roles +
        "\n\n**Empfehlung für die Firmenzone**\n→ **secondary**. Primary bleibt eine andere Möglichkeit.",
      "roles",
    ),
  ).toContain("dns_primary_recommendation_missing");
});
it("accepts authority expressed by denying non-authoritative forwarding but rejects actual denial", () => {
  const text =
    "Secondary repliziert eine externe Primary-Zone. Der native Accelerator bildet die Secondary-Konfiguration nicht vollständig ab. Secondary ist kein rein nicht-autoritatives Forwarding, sondern eine autoritative Kopie.";
  expect(assistantDnsRoleFailures(text, "secondary")).toEqual([]);
  expect(
    assistantDnsRoleFailures(
      text + " Secondary ist nicht Primary, aber autoritativ.",
      "secondary",
    ),
  ).toEqual([]);
  expect(
    assistantDnsRoleFailures(
      text.replace("nicht-autoritatives", "nicht‑autoritatives"),
      "secondary",
    ),
  ).toEqual([]);
  expect(
    assistantDnsRoleFailures(
      text.replace(
        "kein rein nicht-autoritatives Forwarding, sondern eine autoritative Kopie",
        "nicht autoritativ",
      ),
      "secondary",
    ),
  ).toContain("dns_secondary_authority_denied");
  expect(
    assistantDnsRoleFailures(
      text + " Secondary ist dennoch nicht autoritativ.",
      "secondary",
    ),
  ).toContain("dns_secondary_authority_denied");
});
it("distinguishes explicit no-save statements from affirmative persistence claims", () => {
  expect(
    assistantPrematurePersistenceClaim(
      "Der Vorschlag ist validiert – nichts wurde gespeichert, veröffentlicht oder ausgeführt.",
    ),
  ).toBe(false);
  expect(
    assistantPrematurePersistenceClaim("Keine Änderungen wurden gespeichert."),
  ).toBe(false);
  expect(
    assistantPrematurePersistenceClaim(
      "Nichts wurde gespeichert, aber die Konfiguration ist jetzt gespeichert.",
    ),
  ).toBe(true);
  expect(
    assistantPrematurePersistenceClaim(
      "Keine Änderungen wurden gespeichert; danach wurde die Konfiguration gespeichert.",
    ),
  ).toBe(true);
  expect(
    assistantPrematurePersistenceClaim(
      "Es wurden keine Änderungen ausgeführt oder gespeichert.",
    ),
  ).toBe(false);
  expect(
    assistantPrematurePersistenceClaim(
      "Es wurde nichts gespeichert, veröffentlicht oder ausgeführt.",
    ),
  ).toBe(false);
  expect(
    assistantPrematurePersistenceClaim("Die Konfiguration ist gespeichert."),
  ).toBe(true);
  expect(
    assistantPrematurePersistenceClaim(
      "Es wurde nichts gespeichert. Die Konfiguration ist jetzt gespeichert.",
    ),
  ).toBe(true);
  expect(
    assistantPrematurePersistenceClaim(
      "Es wurde nicht nur gespeichert, sondern auch bereitgestellt.",
    ),
  ).toBe(true);
});

it("accepts a draft that can be saved later while rejecting a claim it is already saved", () => {
  expect(
    assistantPrematurePersistenceClaim(
      "Der Entwurf ist lokal validiert und kann bei Bedarf akzeptiert, gespeichert oder weiter bearbeitet werden.",
    ),
  ).toBe(false);
  expect(
    assistantPrematurePersistenceClaim(
      "Der Entwurf ist gespeichert und kann weiter bearbeitet werden.",
    ),
  ).toBe(true);
});
