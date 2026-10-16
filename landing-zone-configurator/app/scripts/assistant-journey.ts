import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import {
  compileCommonConfiguration,
  exportCommonTfvars,
  type JsonValue,
  objectValue,
  readCommonConfiguration,
} from "@lzc/domain";
import {
  applyAssistantChanges,
  validateDialogue,
} from "../apps/api/src/assistant/dialogue.js";
import { buildAssistantKnowledge } from "../apps/api/src/assistant/knowledge.js";
import {
  AssistantInferenceError,
  modelServingConfiguration,
} from "../apps/api/src/assistant/model-serving.js";
import { assistantPublicValues } from "../apps/api/src/assistant/service.js";
import {
  assistantDnsRoleFailures,
  assistantScenarioFixture,
  assistantScenarios,
  syntheticOrganizationId,
} from "./assistant-scenarios.js";
import {
  assistantTestModel,
  assistantTestRequestIntervalMs,
} from "./assistant-test-model.js";
import { loadLocalModelServingToken } from "./local-assistant-credentials.js";

type Step = {
  id: string;
  message: string;
  reference: string;
  roots: string[];
  expected?: Record<string, JsonValue>;
  questionsOnly?: boolean;
  boundary?: boolean;
  dnsRoles?: boolean;
};

const steps: Step[] = [
  {
    id: "foundations",
    message: `Wir erstellen gemeinsam einen Landing-Zone-Entwurf. Firma Journey GmbH, Firmenkürzel jny, Verantwortlicher owner@example.test, Region eu01, Organisations-ID ${syntheticOrganizationId}. Bitte diese Grundlagen als Vorschlag eintragen. Keine Organisationsbindung oder Ausführung.`,
    reference: "identity-foundations",
    roots: [
      "company_name",
      "company_code",
      "owner_email",
      "region",
      "organization_id",
    ],
    expected: {
      company_name: "Journey GmbH",
      company_code: "jny",
      owner_email: "owner@example.test",
      region: "eu01",
      organization_id: syntheticOrganizationId,
    },
  },
  {
    id: "organization-owner",
    message:
      "Bitte die hinterlegte E-Mail auch als Organisationsverantwortlichen vorschlagen. Bestehende Zuweisungen erhalten.",
    reference: "governance-folders",
    roots: ["organization_owners"],
    expected: { organization_owners: ["owner@example.test"] },
  },
  {
    id: "central-network",
    message:
      "Als nächstes das zentrale Netzwerk: SNA-Bereich default unter connectivity.network_areas, Pool 10.0.0.0/16, Transfernetz 10.255.0.0/24, min_prefix_length 24, max_prefix_length 28, default_prefix_length 25, default_nameservers [1.1.1.1]. Nur diesen Netzwerkentwurf vorschlagen, noch keine Firewall.",
    reference: "stackit-network-components",
    roots: ["connectivity"],
    expected: {
      "connectivity.network_areas.default.ranges": ["10.0.0.0/16"],
      "connectivity.network_areas.default.default_prefix_length": 25,
    },
  },
  {
    id: "firewall-ha",
    message:
      "Nun die Firewall-Infrastruktur als Vorschlag: connectivity.firewalls.default, name corporate-fw, zone eu01-1, flavor g1.4, LAN 10.0.252.0/24, WAN 10.0.253.0/24, HA backup_zone eu01-2, vhid 23. Vorhandenen SNA erhalten. Kein Deployment.",
    reference: "firewall-infrastructure",
    roots: ["connectivity"],
    expected: {
      "connectivity.firewalls.default.ha.backup_zone": "eu01-2",
      "connectivity.firewalls.default.ha.vhid": 23,
    },
  },
  {
    id: "firewall-policy-boundary",
    message:
      "Bitte alle Projekte initial ins Internet lassen, ausgehend NAT verwenden und eingehend alles sperren. Kannst du diese Firewall-Regeln in die Konfiguration übernehmen?",
    reference: "firewall-policy",
    roots: [],
    boundary: true,
  },
  {
    id: "audit-topic-switch",
    message:
      "Die Firewall-Regeln pflegt später der Firewall-Admin. Nun brauchen wir als nächstes eine zentrale Audit-Protokollierung mittels Telemetry Router. Bitte führe mich durch die noch fehlenden Entscheidungen.",
    reference: "audit-logs",
    roots: [],
    questionsOnly: true,
  },
  {
    id: "audit-answer",
    message:
      "90 Tage Aufbewahrung, Zugriff ausschließlich aus 203.0.113.0/24, Object Lock ausdrücklich nein. Organisationsweiter Telemetry Link. Bitte diese Entscheidungen als Entwurfsvorschlag übernehmen.",
    reference: "audit-logs",
    roots: ["audit_logs"],
    expected: {
      "audit_logs.retention_days": 90,
      "audit_logs.acl": ["203.0.113.0/24"],
      "audit_logs.s3_object_lock": false,
    },
  },
  {
    id: "audit-update",
    message:
      "Ändere jetzt nur die Aufbewahrung der Audit-Protokolle auf 120 Tage. ACL, deaktiviertes Object Lock und alle übrigen Komponenten bleiben unverändert.",
    reference: "audit-logs",
    roots: ["audit_logs"],
    expected: {
      "audit_logs.retention_days": 120,
      "audit_logs.acl": ["203.0.113.0/24"],
      "audit_logs.s3_object_lock": false,
    },
  },
  {
    id: "observability",
    message:
      "Als nächstes zentrale Observability: plan_name Observability-Starter-EU01, ACL ausschließlich 203.0.113.0/24, metrics_retention_days 30. Keine anderen Retention-Werte erfinden; nur einen Entwurfsvorschlag erstellen.",
    reference: "observability",
    roots: ["observability"],
    expected: {
      "observability.plan_name": "Observability-Starter-EU01",
      "observability.acl": ["203.0.113.0/24"],
      "observability.metrics_retention_days": 30,
    },
  },
  {
    id: "devops",
    message:
      "Bitte nun den zentralen DevOps-Git-Dienst als Entwurf konfigurieren: git_flavor ausdrücklich git-10, allowed_network_ranges ausschließlich [203.0.113.0/24]. Der Flavor ist meine Auswahl, keine Verfügbarkeitszusage. Alle bisherigen Komponenten erhalten, nichts deployen.",
    reference: "devops-git",
    roots: ["devops"],
    expected: {
      "devops.allowed_network_ranges": ["203.0.113.0/24"],
      "devops.git_flavor": "git-10",
    },
  },
  {
    id: "kubernetes",
    message:
      "Nun platform_kubernetes als Entwurf hinzufügen, Schlüssel eu01, Region eu01, Clustername synthetic-k8s. Node-Pool default: machine_type g1.4, minimum 1, maximum 2, availability_zones [eu01-1]. Keine SNA-Anbindung, keine DNS-Integration, kein Deployment.",
    reference: "platform-kubernetes",
    roots: ["platform_kubernetes"],
    expected: { "platform_kubernetes.eu01.cluster.name": "synthetic-k8s" },
  },
  {
    id: "dns-role-advice",
    message:
      "Jetzt eine DNS-Frage, nur beraten: Was bedeuten primary und secondary, sind beide autoritativ und ist das die Auswahl public/private? Welchen Typ empfiehlst du für eine neue bei STACKIT verwaltete Firmenzone, und welche Secondary-Voraussetzung fehlt im nativen Accelerator?",
    reference: "dns-zones",
    roots: [],
    dnsRoles: true,
  },
  {
    id: "labels",
    message:
      "Zum Abschluss nur das Ressourcenlabel cost_center auf synthetic-team setzen. Bestehende Labels, Grundlagen und alle anderen Komponenten erhalten. Nur den Entwurf ändern.",
    reference: "identity-foundations",
    roots: ["labels"],
    expected: { "labels.cost_center": "synthetic-team" },
  },
];

function valueAt(values: JsonValue, path: string): JsonValue | undefined {
  return path
    .split(".")
    .reduce<JsonValue | undefined>(
      (value, key) => objectValue(value)[key],
      values,
    );
}

async function run() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--local-credentials") || args.length > 1)
    throw new Error("assistant_test_arguments_invalid");
  if (
    ["LZC_EXECUTION_ENABLED", "LZC_APPLICATION_EXECUTION_ENABLED"].some(
      (name) => process.env[name] === "true",
    )
  )
    throw new Error("execution_not_allowed");
  const configuration = modelServingConfiguration({
    ...process.env,
    LZC_MODEL_SERVING_TOKEN: args.includes("--local-credentials")
      ? loadLocalModelServingToken()
      : process.env.LZC_MODEL_SERVING_TOKEN,
  });
  const journeySha256 = createHash("sha256")
    .update(readFileSync(new URL(import.meta.url)))
    .digest("hex");
  const model = assistantTestModel(configuration);
  const knowledge = buildAssistantKnowledge();
  const scenario = assistantScenarios.find(
    (entry) => entry.id === "editor-audit-complete",
  );
  if (!scenario) throw new Error("assistant_fixture_missing");
  let draft = assistantScenarioFixture(scenario).draft;
  const history: { role: "user" | "assistant"; content: string }[] = [];
  let failed = 0;
  console.log(
    JSON.stringify({
      status: "started",
      model: configuration.model,
      intentModel: configuration.intentModel ?? configuration.model,
      requestIntervalMs: assistantTestRequestIntervalMs,
      total: steps.length,
      knowledgeSha256: knowledge.sha256,
      journeySha256,
      engineRevision: knowledge.engineRevision,
      authorizesExecution: false,
    }),
  );
  for (const step of steps) {
    const started = Date.now();
    const before = compileCommonConfiguration(draft);
    const failures: string[] = [];
    try {
      const dialogue = validateDialogue(
        await model.converse(
          {
            engineRevision: knowledge.engineRevision,
            knowledgeSha256: knowledge.sha256,
            groups: knowledge.groups,
          },
          assistantPublicValues(draft),
          history,
          step.message,
          { regions: [] },
        ),
        knowledge.rules.map((rule) => rule.id),
      );
      if (!dialogue.references.includes(step.reference))
        failures.push("missing_topic_reference");
      if (step.dnsRoles)
        failures.push(
          ...assistantDnsRoleFailures(dialogue.explanation, "roles"),
        );
      if (
        step.questionsOnly &&
        (dialogue.changes.length ||
          !dialogue.questions.length ||
          dialogue.questions.length > 3)
      )
        failures.push("missing_safe_questions_only");
      if (
        step.boundary &&
        (dialogue.changes.length ||
          !dialogue.explanation.includes("GitHub-Issue #101"))
      )
        failures.push("firewall_policy_boundary_missing");
      if (
        dialogue.changes.some(
          (change) => !step.roots.includes(change.path.split(".")[0] ?? ""),
        )
      )
        failures.push("unrelated_proposal");
      const candidate = applyAssistantChanges(draft, dialogue.changes);
      history.push(
        { role: "user", content: step.message },
        {
          role: "assistant",
          content:
            dialogue.explanation +
            "\n" +
            dialogue.questions.map((question) => question.text).join("\n"),
        },
      );
      const after = compileCommonConfiguration(candidate);
      for (const key of new Set([
        ...Object.keys(before),
        ...Object.keys(after),
      ])) {
        if (
          !step.roots.includes(key) &&
          !isDeepStrictEqual(before[key], after[key])
        )
          failures.push(`unrelated_value_changed:${key}`);
      }
      for (const [path, expected] of Object.entries(step.expected ?? {})) {
        if (!isDeepStrictEqual(valueAt(after, path), expected))
          failures.push(`expected_value_not_applied:${path}`);
      }
      if (failures.length) failed++;
      else {
        draft = readCommonConfiguration(JSON.parse(JSON.stringify(candidate)));
        if (!isDeepStrictEqual(compileCommonConfiguration(draft), after))
          throw new Error("assistant_roundtrip_failed");
      }
      console.log(
        JSON.stringify({
          step: step.id,
          status: failures.length ? "failed" : "passed",
          elapsedMs: Date.now() - started,
          failures,
          accepted: failures.length === 0,
          result: dialogue,
        }),
      );
    } catch (error) {
      failed++;
      console.log(
        JSON.stringify({
          step: step.id,
          status: "failed",
          elapsedMs: Date.now() - started,
          accepted: false,
          reason:
            error instanceof AssistantInferenceError
              ? error.reason
              : error instanceof Error &&
                  /^[a-z][a-z0-9_]{1,100}$/.test(error.message)
                ? error.message
                : "journey_validation_failed",
        }),
      );
    }
  }
  const exported = exportCommonTfvars(draft);
  console.log(
    JSON.stringify({
      status: failed ? "failed" : "passed",
      qualification:
        "synthetic-continuous-dialogue-local-acceptance-roundtrip-export",
      model: configuration.model,
      intentModel: configuration.intentModel ?? configuration.model,
      requestIntervalMs: assistantTestRequestIntervalMs,
      knowledgeSha256: knowledge.sha256,
      journeySha256,
      engineRevision: knowledge.engineRevision,
      total: steps.length,
      passed: steps.length - failed,
      failed,
      historyMessages: history.length,
      exportBytes: Buffer.byteLength(exported),
      finalValues: compileCommonConfiguration(draft),
      authorizesExecution: false,
    }),
  );
  if (failed) process.exitCode = 1;
}

run().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      status: "blocked",
      reason:
        error instanceof Error && error.message === "execution_not_allowed"
          ? error.message
          : "assistant_journey_setup_failed",
    }),
  );
  process.exitCode = 1;
});
