import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import {
  catalogue,
  commonConfigurationFromValues,
  compileCommonConfiguration,
  createCommonConfiguration,
  createPlatformDraftCopy,
  effectiveInput,
  type JsonValue,
  objectValue,
  setCommonInput,
  textValue,
} from "@lzc/domain";
import {
  applyAssistantChanges,
  validateDialogue,
} from "../apps/api/src/assistant/dialogue.js";
import { buildAssistantKnowledge } from "../apps/api/src/assistant/knowledge.js";
import type { AssistantCatalogueContext } from "../apps/api/src/assistant/model-serving.js";
import { assistantPublicValues } from "../apps/api/src/assistant/service.js";

export const syntheticOrganizationId = "00000000-0000-4000-8000-000000000001";
const questions: Record<string, string> = {
  "credential-foundations":
    "Wie hinterlege ich Deployment-Zugaenge sicher, ohne Passwoerter, Tokens, VPN-Schluessel oder Kubeconfig in den Chat zu schreiben?",
  "stackit-network-components":
    "Welche Angaben benoetigst du fuer einen zentralen STACKIT Network Area mit Adresspool, Transfernetz, Projekt-Praefixen und Nameservern? Nur beraten, nichts aendern.",
  "identity-foundations":
    "Welche Grundlagenfelder fuer Organisation, Verantwortlichen, Firmenname, Firmenkuerzel, Region und Labels bietet die Konfiguration? Nur beraten, nichts aendern.",
  "governance-folders":
    "Welche Ordnernamen, Elternordner und Organisationsrollen kann ich konfigurieren, und welche Grenzen gelten fuer Ordnerbeschreibungen? Nur beraten.",
  "management-state":
    "Wie funktionieren Management-Projekt, State-Bucket, Secrets Manager und Management-Service-Account? Welche Voraussetzungen gelten? Nur beraten.",
  observability:
    "Welche Einstellungen und Voraussetzungen gelten fuer die zentrale Observability und ihre Nutzung durch Projekte? Nur beraten, keinen Vorschlag erstellen.",
  "audit-logs":
    "Welche Felder und Voraussetzungen gelten fuer zentrale Audit Logs? Wie werden Aufbewahrung und Zugriffe behandelt? Nur beraten.",
  "federated-identities":
    "Welche Einstellungen unter federated_identity_providers gibt es fuer foederierte Identitaeten? Wie unterscheiden sich diese von meinem Benutzer-SSO? Nur beraten.",
  "dns-zones":
    "Welche DNS-Zonenfelder gibt es neben dns_name: Name, Beschreibung, TTL, Zonentyp, Kontakt, ACL und Netzbereich? Welche Grenzen gelten? Nur beraten, nichts aendern.",
  "firewall-infrastructure":
    "Welche Entscheidungen brauchst du fuer die OPNsense-Firewall-Infrastruktur, HA und Kapazitaet? Welche Ausfallgrenzen gelten? Nur beraten, noch keinen Vorschlag erstellen.",
  vpn: "Welche nativen VPN-Felder, Standort-Netze und Verbindungsparameter kann ich konfigurieren? Wie wird der PSK separat hinterlegt? Nur beraten.",
  "firewall-policy":
    "Welche Einstellungen bietet firewall_config fuer Firewall-Regeln, Aliase und Synchronisierung? Nur beraten, keine Infrastruktur konfigurieren.",
  "firewall-access-bootstrap":
    "Wie funktionieren Firewall-Zugangsbootstrap, Admin-Konto und API-Zugang im geschuetzten Operator-Workflow? Nur erklaeren, keine Zugangsdaten abfragen.",
  "devops-git":
    "Welche Konfigurationsfelder und Voraussetzungen gibt es fuer den zentralen DevOps-Git-Dienst? Nur beraten, nichts aktivieren.",
  "platform-kubernetes":
    "Welche Einstellungen bietet platform_kubernetes fuer SKE, Node-Pools und Netzanbindung? Wie wird Kubeconfig separat behandelt? Nur beraten.",
  "project-templates":
    "Welche Felder kann ich fuer Landing-Zone-Projektvorlagen konfigurieren? Wie unterscheiden sich Public und Corporate sowie Vorlage und Bestellung? Nur beraten.",
  "sandbox-projects":
    "Welche Felder, Laufzeiten und Ordner kann ich fuer Sandbox-Projekte konfigurieren? Nur beraten, kein Projekt anlegen.",
  "namespace-services":
    "Welche Felder und Voraussetzungen gelten fuer landing_zone_namespace_services und ihre Kubernetes-Anbindung? Nur beraten.",
  "configuration-lifecycle":
    "Wie unterscheiden sich Vorschlag, Feldauswahl, gespeicherter Entwurf, Plan und ausdrueckliches Apply? Was passiert bei veralteten Revisionen? Nur erklaeren.",
};

const overviewFields: Record<string, readonly string[]> = {
  "identity-foundations": [
    "organization_id",
    "owner_email",
    "company_name",
    "company_code",
    "region",
    "labels",
  ],
  "governance-folders": [
    "rm_folders",
    "rm_folder_parent_id",
    "organization_owners",
    "organization_auditors",
  ],
  "firewall-policy": [
    "firewall_config",
    "aliases",
    "routes",
    "rules",
    "outbound_nat",
    "port_forwards",
  ],
  "sandbox-projects": ["project_name", "project_owner_email", "owner_emails"],
};

export type AssistantScenario = {
  id: string;
  topic: string;
  message: string;
  fixture:
    | "baseline"
    | "foundations"
    | "dns-owner"
    | "dns-login"
    | "dns-placeholder"
    | "governance"
    | "governance-missing-email"
    | "governance-verified-email"
    | "firewall-existing"
    | "firewall-new"
    | "firewall-ha"
    | "firewall-metro"
    | "sna";
  acceptableReferences?: readonly string[];
  requiredOverviewFields?: readonly string[];
  editorExpected?: { path: string; value: JsonValue };
  templateExpected?: ("public" | "corporate")[];
  history?: readonly { role: "user" | "assistant"; content: string }[];
};

const firewallDialogueHistory = [
  {
    role: "user",
    content:
      "Bitte das zentrale Netzwerk für 100 Projekte mit einer hochverfügbaren Firewall konfigurieren.",
  },
  {
    role: "assistant",
    content: "Welche Verkehrswege sollen über die zentrale Firewall laufen?",
  },
  {
    role: "user",
    content:
      "Welche Verkehrswege sollen über die zentrale Firewall laufen?\nMeine Antwort: Internet-Verkehr; Zwischen Projekten; Zu externen Netzen",
  },
  {
    role: "assistant",
    content: "Welche Firewall-Regeln sollen für diese Verkehrswege gelten?",
  },
  {
    role: "user",
    content:
      "Alle Projekte sollen initial auf das Internet zugreifen dürfen (egress allow). Eingehend ist initial alles gesperrt. Alle Projekte dürfen initial nicht miteinander reden, außer eine explizite Allow-Regel erlaubt es. Alle Projekte dürfen auf zentrale Plattform-Elemente zugreifen. Der ausgehende Verkehr ins Internet wird genattet. Alle weiteren Regeln werden später durch den Firewall-Admin gepflegt.",
  },
  {
    role: "assistant",
    content:
      "Welchen Spitzen-Durchsatz und wie viele parallele Verbindungen erwartest du?",
  },
] satisfies NonNullable<AssistantScenario["history"]>;
const firewallDeferredCapacity =
  "Das kann ich heute noch nicht sagen, wir sollten mit genügend Puffer arbeiten, so dass wir nicht zu schnell an Limits laufen. Ich kann heute den Traffic aber noch nicht beziffern. Die meisten Projekte müssen ins Internet zugreifen, um Downloads und Updates zu tätigen.";

export const assistantScenarios: readonly AssistantScenario[] = [
  {
    id: "platform-public-corporate-networks",
    topic: "project-templates",
    fixture: "firewall-metro",
    history: [
      {
        role: "user",
        content: "Zentrale Audit-Protokollierung ist bereits konfiguriert.",
      },
      { role: "assistant", content: "Editor-Vorschlag für audit_logs." },
      {
        role: "user",
        content:
          "Wir wollen des weiteren eine zentrale git Instanz haben. Somit braucht nicht jedes Projekte eine eigene.",
      },
      { role: "assistant", content: "Editor-Vorschlag für devops." },
    ],
    message:
      "Nun kommen wir zu den Application Landing Zone Templates. Ich brauche natürlich passend zu unserem Vorhaben welche, die über das zentrale Netzwerk kommunizieren. Benenne das Template auch entsprechend. Es darf auch projekte geben, die direkt in das Internet gehen, dafür aber nicht mit dem zentralen Netz kommunizieren dürfen. Richte dort jeweils ein lokales Netz ein, so dass man danach leicht VMs etc darin erstellen kann. Sandboxes brauchen wir vorerst nicht.",
    templateExpected: ["public", "corporate"],
  },
  {
    id: "editor-audit-complete",
    topic: "audit-logs",
    fixture: "baseline",
    message:
      "Bitte zentrale Audit-Protokollierung als Entwurf konfigurieren: 90 Tage Aufbewahrung, ACL ausschließlich 203.0.113.0/24, Object Lock ausdrücklich deaktiviert. Organisationsweiter Telemetry Link; kein Deployment.",
    editorExpected: {
      path: "audit_logs",
      value: {
        retention_days: 90,
        acl: ["203.0.113.0/24"],
        s3_object_lock: false,
      },
    },
  },
  {
    id: "editor-audit-followup",
    topic: "audit-logs",
    fixture: "baseline",
    history: [
      {
        role: "user",
        content:
          "Bitte zentrale Audit-Protokollierung mittels Telemetry Router als Konfigurationsvorschlag einrichten.",
      },
      {
        role: "assistant",
        content:
          "Welche Aufbewahrungsdauer, welche ACL-Zugriffsnetze und soll Object Lock aktiviert werden?",
      },
    ],
    message: "90 Tage, nur 203.0.113.0/24, Object Lock nein.",
    editorExpected: {
      path: "audit_logs",
      value: {
        retention_days: 90,
        acl: ["203.0.113.0/24"],
        s3_object_lock: false,
      },
    },
  },
  {
    id: "editor-observability",
    topic: "observability",
    fixture: "baseline",
    message:
      "Bitte zentrale Observability als Entwurf einrichten: plan_name Observability-Starter-EU01, ACL 203.0.113.0/24, metrics_retention_days 30.",
    editorExpected: { path: "observability.metrics_retention_days", value: 30 },
  },
  {
    id: "editor-devops",
    topic: "devops-git",
    fixture: "baseline",
    message:
      "Bitte den zentralen DevOps-Git-Dienst als Entwurf konfigurieren, allowed_network_ranges ausschließlich [203.0.113.0/24]. Nutze den nativen Git-Flavor-Standard, keine Verfügbarkeitszusage und kein Deployment.",
    editorExpected: {
      path: "devops.allowed_network_ranges",
      value: ["203.0.113.0/24"],
    },
  },
  {
    id: "editor-federation",
    topic: "federated-identities",
    fixture: "baseline",
    message:
      "Bitte eine CI/CD-Vertrauensregel als Entwurf hinzufügen: name synthetic-federation, issuer https://issuer.example.test, assertion item aud, operator equals, value synthetic-workload. Keine Benutzer-SSO-Konfiguration und keine Ausführung.",
    editorExpected: {
      path: "federated_identity_providers",
      value: [
        {
          name: "synthetic-federation",
          issuer: "https://issuer.example.test",
          assertions: [
            { item: "aud", operator: "equals", value: "synthetic-workload" },
          ],
        },
      ],
    },
  },
  {
    id: "editor-platform-kubernetes",
    topic: "platform-kubernetes",
    fixture: "baseline",
    message:
      "Bitte platform_kubernetes als Entwurf hinzufügen, Schlüssel eu01, Region eu01, Clustername synthetic-k8s. Node-Pool default: machine_type g1.4, minimum 1, maximum 2, availability_zones [eu01-1]. Keine SNA-Anbindung, keine DNS-Integration, kein Deployment.",
    editorExpected: {
      path: "platform_kubernetes.eu01.cluster.name",
      value: "synthetic-k8s",
    },
  },
  {
    id: "editor-labels",
    topic: "identity-foundations",
    fixture: "baseline",
    message:
      "Bitte nur das Ressourcenlabel cost_center auf synthetic-team setzen. Alle Grundlagenwerte und vorhandenen Labels unverändert erhalten. Als Entwurfsvorschlag, nichts deployen.",
    editorExpected: { path: "labels.cost_center", value: "synthetic-team" },
  },
  {
    id: "firewall-to-audit-draft",
    topic: "audit-logs",
    fixture: "firewall-metro",
    history: [
      ...firewallDialogueHistory,
      { role: "user", content: firewallDeferredCapacity },
      {
        role: "assistant",
        content:
          "Welche maximale Unterbrechung bei Ausfall oder Wartung ist tolerierbar?",
      },
    ],
    message:
      "Nun brauchen wir als nächstes eine zentrale Audit Protokollierung, richte mir das bitte ein.",
  },
  {
    id: "firewall-policy-definition",
    topic: "firewall-policy",
    fixture: "firewall-existing",
    message:
      "Erstelle jetzt eine ausgehende NAT-Regel für den Internetzugriff und eine Firewall-Filterregel, die eingehenden Verkehr sperrt.",
  },
  {
    id: "firewall-metro-dialogue-policy-definition",
    topic: "firewall-infrastructure",
    fixture: "firewall-metro",
    history: [
      ...firewallDialogueHistory,
      { role: "user", content: firewallDeferredCapacity },
    ],
    message:
      "Definiere nun aus den besprochenen Anforderungen die Firewall-Regeln und das ausgehende NAT. Ich möchte dafür einen übernehmbaren Vorschlag, keine weitere Infrastrukturfrage.",
  },
  {
    id: "firewall-metro-dialogue-policy-capability",
    topic: "firewall-infrastructure",
    fixture: "firewall-metro",
    history: [
      ...firewallDialogueHistory,
      { role: "user", content: firewallDeferredCapacity },
      {
        role: "assistant",
        content:
          "Welche maximale Unterbrechung bei Ausfall oder Wartung ist tolerierbar?",
      },
    ],
    message:
      "Das ist kein Thema, welches wir in irgendeiner Form behandeln können. Es gibt ein fertiges Firewall-Setup. Ich sehe aber noch keine Firewall-Regeln. Können diese nicht gesetzt werden?",
  },
  {
    id: "firewall-metro-dialogue-unknown-capacity",
    topic: "firewall-infrastructure",
    fixture: "firewall-metro",
    history: firewallDialogueHistory,
    message: `Welchen Spitzen-Durchsatz und wie viele parallele Verbindungen erwartest du?\nMeine Antwort: ${firewallDeferredCapacity}`,
  },
  {
    id: "firewall-metro-dialogue-complete",
    topic: "firewall-infrastructure",
    fixture: "firewall-metro",
    history: [
      ...firewallDialogueHistory,
      { role: "user", content: firewallDeferredCapacity },
      {
        role: "assistant",
        content:
          "Welche maximale Unterbrechung bei Ausfall oder Wartung ist tolerierbar?",
      },
    ],
    message:
      "Welche maximale Unterbrechung bei Ausfall oder Wartung ist tolerierbar?\nMeine Antwort: Maximal zwei Minuten Unterbrechung sind tolerierbar.",
  },
  {
    id: "firewall-metro-setup-capacity",
    topic: "firewall-infrastructure",
    fixture: "firewall-metro",
    history: [
      {
        role: "user",
        content:
          "Über die zentrale Firewall sollen Internet-Verkehr und Verkehr zwischen Projekten laufen.",
      },
    ],
    message:
      "Bitte die restliche zentrale Firewall-Einrichtung mit HA fortsetzen. Vorhandene Netz- und VM-Werte behalten, keine Ausführung.",
  },
  {
    id: "firewall-metro-setup-operations",
    topic: "firewall-infrastructure",
    fixture: "firewall-metro",
    history: [
      {
        role: "user",
        content:
          "Über die zentrale Firewall sollen Internet-Verkehr und Verkehr zwischen Projekten laufen.",
      },
      {
        role: "user",
        content:
          "Wir erwarten 500 Mbit/s Spitzendurchsatz und 10000 parallele Verbindungen. Die VM-Größe muss noch durch Benchmark geprüft werden.",
      },
    ],
    message:
      "Bitte die restliche zentrale Firewall-Einrichtung mit HA fortsetzen. Vorhandene Netz- und VM-Werte behalten, keine Ausführung.",
  },
  {
    id: "firewall-metro-ha-only",
    topic: "firewall-infrastructure",
    fixture: "firewall-metro",
    message:
      "Nur native HA mit Backup-Zone eu01-2 und vhid 1 ergänzen. Alle anderen gespeicherten Werte unverändert lassen; keine weitere Setup-Beratung oder Ausführung.",
  },
  {
    id: "firewall-metro-ha-native-ip-defaults",
    topic: "firewall-infrastructure",
    fixture: "firewall-metro",
    message:
      "So nun konfigurieren wir das zentrale Netzwerk, dass sie alle Projekte im corporate Umfeld teilen sollen. Ich erwarte ca. 100 Projekte in diesem Umfeld. Zusätzlich soll die Kommunikation über eine zentrale Firewall, welche wir hochverfügbar zur Verfügung stellen wollen geregelt werden.",
  },
  {
    id: "firewall-combined-configured-sna",
    topic: "firewall-infrastructure",
    fixture: "firewall-existing",
    message:
      "So nun konfigurieren wir das zentrale Netzwerk, dass sie alle Projekte im corporate Umfeld teilen sollen. Ich erwarte ca. 100 Projekte in diesem Umfeld. Zusätzlich soll die Kommunikation über eine zentrale Firewall, welche wir hochverfügbar zur Verfügung stellen wollen geregelt werden.",
  },
  {
    id: "firewall-native-ha",
    topic: "firewall-infrastructure",
    fixture: "firewall-existing",
    message:
      "Bitte die vorhandene zentrale Firewall mit nativer Active/Passive-HA vorschlagen. Backup-Zone eu01-2, vhid 23. Alle bisherigen SNA-, DNS- und Firewall-Werte beibehalten; keine Policies oder Ausfuehrung.",
  },
  {
    id: "firewall-new-native-ha",
    topic: "firewall-infrastructure",
    fixture: "firewall-new",
    message:
      "Erstelle einen nativen Firewall-HA-Vorschlag fuer den vorhandenen Bereich default: Name corporate-fw, Zone eu01-1, Flavor g1.4, LAN 10.0.252.0/24, WAN 10.0.253.0/24. Diese Subnetze sind frei und bestaetigt. HA-Backup-Zone eu01-2, vhid 23. Keine anderen Einstellungen aendern, keine Ausfuehrung. Produktverfuegbarkeit und Durchsatz sind noch nicht geprueft.",
  },
  {
    id: "firewall-ha-missing-prerequisites",
    topic: "firewall-infrastructure",
    fixture: "firewall-new",
    message:
      "Bitte eine zentrale hochverfuegbare Firewall fuer Internet- und Inter-Projekt-Verkehr vorschlagen. Etwa 100 Corporate-Projekte; Adressen, Zonen und Sizing haben wir noch nicht festgelegt. Keine Ausfuehrung.",
  },
  {
    id: "firewall-ha-already-saved",
    topic: "firewall-infrastructure",
    fixture: "firewall-ha",
    message:
      "Bitte die vorhandene Firewall mit HA-Backup-Zone eu01-2 und vhid 23 vorschlagen, falls diese Werte nicht schon gespeichert sind. Keine weiteren Aenderungen.",
  },
  {
    id: "governance-organization-owner",
    topic: "governance-folders",
    fixture: "governance",
    message:
      "Bitte die hinterlegte Email auch gleich nutzen um mich als Organisationsverantwortlichen zu hinterlegen.",
  },
  {
    id: "governance-folder-owners",
    topic: "governance-folders",
    fixture: "governance",
    message:
      "Bitte die hinterlegte Email als Owner fuer alle vorhandenen Folder vorschlagen. Keine Organisationsrolle hinzufuegen.",
  },
  {
    id: "governance-folder-reader",
    topic: "governance-folders",
    fixture: "governance",
    message:
      "Bitte reader@example.test nur als Leser im Platform-Ordner hinterlegen. Keine anderen Folder oder Organisationsrollen aendern.",
  },
  {
    id: "governance-folder-scope",
    topic: "governance-folders",
    fixture: "governance",
    message: "Nutze die hinterlegte Email fuer eine Folder-Leseberechtigung.",
  },
  {
    id: "governance-missing-email",
    topic: "governance-folders",
    fixture: "governance-missing-email",
    message:
      "Bitte die hinterlegte Email als Organisationsverantwortlichen hinterlegen.",
  },
  {
    id: "governance-verified-email",
    topic: "governance-folders",
    fixture: "governance-verified-email",
    message:
      "Nutze die Email meines aktuell verifiziert angemeldeten STACKIT-Benutzers als Organisations-Owner.",
  },
  ...Object.entries(questions).map(
    ([topic, message]): AssistantScenario => ({
      id: `${topic}-advice`,
      topic,
      message,
      fixture: "baseline",
      ...(overviewFields[topic]
        ? { requiredOverviewFields: overviewFields[topic] }
        : {}),
    }),
  ),
  {
    id: "foundations-restoration",
    topic: "identity-foundations",
    fixture: "foundations",
    acceptableReferences: ["identity-foundations", "configuration-contract"],
    message: `Bitte trage die Grundlagen aus unserem bisherigen Gespraech wieder als Vorschlag ein. Die STACKIT Org ID ist: ${syntheticOrganizationId}`,
  },
  ...(["dns-owner", "dns-login", "dns-placeholder"] as const).map(
    (fixture): AssistantScenario => ({
      id: fixture,
      topic: "dns-zones",
      fixture,
      message:
        "Bitte das DNS Thema vervollstaendigen, da fehlen noch einige weitere Details. Schlage die restlichen Einstellungen sinnvoll vor und behalte den Domainnamen.",
    }),
  ),
  {
    id: "sna-complete-draft",
    topic: "stackit-network-components",
    fixture: "sna",
    message:
      "Erstelle nur den SNA-Vorschlag fuer den Bereich default: Pool 10.64.0.0/16, Transfernetz 10.255.255.0/24, min_prefix_length 24, max_prefix_length 28, default_prefix_length 26, default_nameservers [1.1.1.1]. Keine Firewall oder VPN.",
  },
];

export function assistantScenarioFixture(scenario: AssistantScenario) {
  const template = catalogue.templates.find(
    (entry) => entry.id === "standalone",
  );
  if (!template) throw new Error("assistant_fixture_template_missing");
  let draft = createCommonConfiguration("standalone", syntheticOrganizationId);
  for (const [path, value] of Object.entries({
    company_name: "Example GmbH",
    company_code: "exg",
    owner_email: "owner@example.test",
    region: "eu01",
    organization_id: syntheticOrganizationId,
  }))
    draft = setCommonInput(draft, path, value);
  if (scenario.fixture.startsWith("dns-") || scenario.fixture === "sna")
    draft = commonConfigurationFromValues(template, draft.id, draft.name, {
      ...compileCommonConfiguration(draft),
      connectivity: {
        network_areas: {
          default: {
            ranges: ["10.32.0.0/16"],
            transfer_network: "10.254.255.0/24",
            min_prefix_length: 24,
            max_prefix_length: 28,
            default_prefix_length: 24,
            default_nameservers: ["1.1.1.1"],
          },
        },
        dns_zones: {
          example: {
            dns_name: "example-gmbh.stackit.run",
            name: null,
            description: null,
            contact_email: null,
            default_ttl: 3600,
            type: "primary",
            network_area_key: "default",
          },
        },
      },
    });
  const history: { role: "user" | "assistant"; content: string }[] = [];
  if (scenario.fixture.startsWith("firewall")) {
    draft = commonConfigurationFromValues(template, draft.id, draft.name, {
      ...compileCommonConfiguration(draft),
      connectivity: {
        network_areas: {
          default: {
            ranges: ["10.0.0.0/16"],
            transfer_network: "10.255.0.0/24",
            min_prefix_length: 24,
            max_prefix_length: 28,
            default_prefix_length: 25,
          },
        },
        dns_zones: {},
        ...(scenario.fixture !== "firewall-new"
          ? {
              firewalls: {
                default: {
                  name: "corporate-fw",
                  zone: "eu01-1",
                  flavor: "g1.4",
                  lan_network_range: "10.0.252.0/24",
                  wan_network_range: "10.0.253.0/24",
                  ...(scenario.fixture === "firewall-ha"
                    ? { ha: { backup_zone: "eu01-2", vhid: 23 } }
                    : {}),
                },
              },
            }
          : {}),
      },
    });
    history.push({
      role: "assistant",
      content:
        "SNA wurde bereits besprochen. Fruehere Chatversionen konnten Firewall-Infrastruktur noch nicht vorschlagen.",
    });
  }
  history.push(...(scenario.history ?? []));
  if (scenario.fixture === "firewall-metro")
    draft = commonConfigurationFromValues(template, draft.id, draft.name, {
      ...compileCommonConfiguration(draft),
      connectivity: {
        network_area: {
          ranges: ["10.0.0.0/16"],
          transfer_network: "10.255.0.0/24",
          min_prefix_length: 24,
          max_prefix_length: 28,
          default_prefix_length: 25,
        },
        firewall: {
          name: "opnsense-26.1",
          zone: "eu01-m",
          flavor: "c1.2",
          lan_network_range: "10.0.2.0/28",
          wan_network_range: "10.0.2.16/28",
          ...(scenario.id.startsWith("firewall-metro-dialogue-")
            ? { ha: { backup_zone: "eu01-2", vhid: 1 } }
            : {}),
        },
        dns_zones: {},
      },
    });
  if (scenario.fixture.startsWith("governance")) {
    draft = setCommonInput(draft, "organization_owners", [
      "existing-owner@example.test",
    ]);
    draft = setCommonInput(draft, "organization_auditors", [
      "existing-auditor@example.test",
    ]);
    const folders = objectValue(
      effectiveInput(compileCommonConfiguration(draft), "rm_folders"),
    );
    draft = setCommonInput(draft, "rm_folders", {
      ...folders,
      platform: {
        ...objectValue(folders.platform),
        owner_emails: ["folder-owner@example.test"],
        reader_emails: ["folder-reader@example.test"],
      },
    });
    if (scenario.fixture !== "governance")
      draft = setCommonInput(draft, "owner_email", null);
    history.push({
      role: "assistant",
      content:
        "Die Grundlagen sind schon gespeichert. Zuletzt wurden Folder-Namen besprochen.",
    });
  }
  if (scenario.fixture === "foundations") {
    for (const path of [
      "company_name",
      "company_code",
      "owner_email",
      "region",
      "organization_id",
    ])
      draft = setCommonInput(draft, path, null);
    history.push(
      {
        role: "user",
        content:
          "Die Firma heisst Example GmbH, das Kuerzel ist exg. Verantwortlich ist owner@example.test, die Region eu01.",
      },
      {
        role: "assistant",
        content:
          "Zuletzt haben wir ueber DNS gesprochen. Die Grundlagen sind noch nicht gespeichert.",
      },
    );
  }
  if (scenario.templateExpected) {
    draft = createPlatformDraftCopy(draft, crypto.randomUUID());
    draft.projectTemplates = [];
  }
  const values = assistantPublicValues(draft);
  if (scenario.fixture === "governance-verified-email")
    values["assistant.user_email"] = "login@example.test";
  if (scenario.fixture === "dns-login") values.owner_email = null;
  if (scenario.fixture === "dns-placeholder") {
    values.owner_email = "placeholder@example.test";
    values["assistant.owner_email_is_template_default"] = true;
  }
  if (
    scenario.fixture === "dns-login" ||
    scenario.fixture === "dns-placeholder"
  )
    values["assistant.user_email"] = "login@example.test";
  const catalogues: AssistantCatalogueContext = {
    regions:
      scenario.fixture === "firewall-metro"
        ? [
            {
              region: "eu01",
              fetchedAt: null,
              products: {
                availabilityZones: {
                  status: "available",
                  totalOptions: 4,
                  truncated: false,
                  options: ["eu01-m", "eu01-1", "eu01-2", "eu01-3"].map(
                    (value) => ({
                      value,
                      label: value,
                    }),
                  ),
                },
                machineTypes: {
                  status: "available",
                  totalOptions: 1,
                  truncated: false,
                  options: [{ value: "c1.2", label: "c1.2" }],
                },
              },
            },
          ]
        : [],
  };
  return { draft, values, history, catalogues };
}

export function validateAssistantScenario(
  scenario: AssistantScenario,
  input: unknown,
) {
  const knowledge = buildAssistantKnowledge();
  const dialogue = validateDialogue(
    input,
    knowledge.rules.map((rule) => rule.id),
  );
  const failures: string[] = [];
  if (
    !(scenario.acceptableReferences ?? [scenario.topic]).some((reference) =>
      dialogue.references.includes(reference),
    )
  )
    failures.push("missing_topic_reference");
  const fixture = assistantScenarioFixture(scenario);
  if (scenario.templateExpected) {
    if (
      !dialogue.changes.length ||
      dialogue.changes.some(
        (change) =>
          change.path !== "projectTemplates" || change.operation !== "merge",
      ) ||
      dialogue.questions.length
    )
      failures.push("missing_platform_template_proposal");
    try {
      const candidate = applyAssistantChanges(fixture.draft, dialogue.changes);
      const templates = candidate.projectTemplates ?? [];
      if (
        !isDeepStrictEqual(
          templates.map((template) => template.kind).sort(),
          [...scenario.templateExpected].sort(),
        ) ||
        templates.some(
          (template) =>
            !template.name.trim() ||
            template.region !== fixture.values.region ||
            template.settings.network_enabled !== true ||
            (template.kind === "corporate" &&
              (textValue(template.settings.network_area_key) || "default") !==
                "default"),
        )
      )
        failures.push("platform_template_networks_incomplete");
      if (
        templates.some((template) =>
          Object.keys(template.settings).some(
            (key) => !["network_enabled", "network_area_key"].includes(key),
          ),
        )
      )
        failures.push("unrequested_template_settings");
      if (
        !isDeepStrictEqual(
          compileCommonConfiguration(candidate),
          compileCommonConfiguration(fixture.draft),
        )
      )
        failures.push("unrelated_platform_features_changed");
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      failures.push("platform_template_proposal_not_applicable");
    }
    return { dialogue, failures };
  }
  if (scenario.editorExpected) {
    if (
      !dialogue.changes.length ||
      dialogue.changes.some((change) => !change.operation)
    )
      failures.push("missing_editor_proposal");
    try {
      const candidate = applyAssistantChanges(fixture.draft, dialogue.changes);
      const value = scenario.editorExpected.path
        .split(".")
        .reduce<JsonValue | undefined>(
          (current, key) => objectValue(current)[key],
          compileCommonConfiguration(candidate),
        );
      if (!isDeepStrictEqual(value, scenario.editorExpected.value))
        failures.push("editor_expected_value_not_applied");
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      failures.push("editor_proposal_not_applicable");
    }
    return { dialogue, failures };
  }
  if (scenario.id === "firewall-to-audit-draft") {
    if (
      dialogue.changes.length ||
      dialogue.questions.length < 1 ||
      dialogue.questions.length > 3 ||
      !dialogue.references.includes("audit-logs") ||
      /noch keinen übernehmbaren|nicht unterstützt/.test(
        dialogue.explanation,
      ) ||
      /SNA default:|maximale Unterbrechung|Bestätigte Anforderungen/.test(
        dialogue.explanation,
      )
    )
      failures.push("explicit_audit_topic_switch_failed");
    return { dialogue, failures };
  }
  if (
    [
      "firewall-metro-dialogue-policy-capability",
      "firewall-metro-dialogue-policy-definition",
      "firewall-policy-definition",
    ].includes(scenario.id)
  ) {
    if (
      dialogue.changes.length ||
      dialogue.questions.length ||
      !dialogue.references.includes("firewall-policy") ||
      !dialogue.explanation.includes("nativ über firewall_config") ||
      !dialogue.explanation.includes("nicht das komplexe Regel-/NAT-Objekt") ||
      !dialogue.explanation.includes("noch keine Regeln konfiguriert") ||
      !dialogue.explanation.includes("kann aktuell keine Firewall-Regeln") ||
      !dialogue.explanation.includes("nicht Teil des MVP") ||
      !dialogue.explanation.includes("GitHub-Issue #101") ||
      !dialogue.explanation.includes("Firewall-Admin")
    )
      failures.push("firewall_policy_capability_boundary_unclear");
    return { dialogue, failures };
  }
  if (scenario.fixture.startsWith("firewall")) {
    const before = compileCommonConfiguration(fixture.draft);
    const candidate = applyAssistantChanges(fixture.draft, dialogue.changes);
    const after = compileCommonConfiguration(candidate);
    const network = objectValue(after.connectivity);
    const previous = objectValue(before.connectivity);
    const firewallKey =
      scenario.fixture === "firewall-metro" ? "firewall" : "firewalls";
    if (
      !isDeepStrictEqual(
        { ...after, connectivity: undefined },
        { ...before, connectivity: undefined },
      ) ||
      !isDeepStrictEqual(
        { ...network, [firewallKey]: undefined },
        { ...previous, [firewallKey]: undefined },
      ) ||
      !isDeepStrictEqual(candidate.identities, fixture.draft.identities)
    )
      failures.push("firewall_changed_unrelated_values_or_identity");
    if (
      dialogue.changes.some(
        (change) => change.path !== `connectivity.${firewallKey}`,
      )
    )
      failures.push("firewall_wrong_native_form");
    if (
      !dialogue.explanation.includes("512 /25-Subnetze") ||
      !dialogue.explanation.includes("128 Adressen")
    )
      failures.push("firewall_incorrect_sna_capacity");
    if (scenario.fixture === "firewall-metro") {
      const appliance = objectValue(network.firewall);
      const ha = objectValue(appliance.ha);
      if (scenario.id.startsWith("firewall-metro-dialogue-")) {
        if (
          !isDeepStrictEqual(appliance, objectValue(previous.firewall)) ||
          dialogue.changes.length
        )
          failures.push("firewall_reconfigured_confirmed_infrastructure");
        if (
          !dialogue.explanation.includes("Sizing/Benchmark ausstehend") ||
          !dialogue.explanation.includes(
            "Eingehend ist initial alles gesperrt.",
          ) ||
          !dialogue.explanation.includes(
            "Konfiguration speichern bleibt separat",
          ) ||
          dialogue.questions.some((question) =>
            /Business decision|Reuse prior|wer übernimmt/i.test(question.text),
          )
        )
          failures.push("firewall_lost_confirmed_or_deferred_requirements");
      } else if (
        !["eu01-1", "eu01-2", "eu01-3"].includes(String(ha.backup_zone)) ||
        typeof ha.vhid !== "number" ||
        !Number.isInteger(ha.vhid) ||
        ha.vhid < 1 ||
        ha.vhid > 255 ||
        !isDeepStrictEqual(Object.keys(ha).sort(), ["backup_zone", "vhid"]) ||
        !isDeepStrictEqual(
          { ...appliance, ha: undefined },
          { ...objectValue(previous.firewall), ha: undefined },
        ) ||
        dialogue.changes.length !== 1
      )
        failures.push(
          "firewall_metro_ha_changed_native_ip_defaults_or_saved_appliance",
        );
      const expectedQuestionPath = [
        "firewall-metro-ha-only",
        "firewall-metro-dialogue-complete",
      ].includes(scenario.id)
        ? null
        : scenario.id === "firewall-metro-setup-capacity"
          ? "connectivity.firewall.flavor"
          : [
                "firewall-metro-setup-operations",
                "firewall-metro-dialogue-unknown-capacity",
              ].includes(scenario.id)
            ? "connectivity.firewall.ha"
            : "connectivity.firewall.lan_network_range";
      if (
        !isDeepStrictEqual(
          dialogue.questions.map((question) => question.path),
          expectedQuestionPath ? [expectedQuestionPath] : [],
        )
      )
        failures.push("firewall_missing_or_repeated_setup_decision");
    } else if (
      scenario.id === "firewall-native-ha" ||
      scenario.id === "firewall-new-native-ha"
    ) {
      const firewall = objectValue(objectValue(network.firewalls).default);
      if (
        !isDeepStrictEqual(firewall.ha, { backup_zone: "eu01-2", vhid: 23 }) ||
        dialogue.questions.length ||
        !dialogue.changes.length
      )
        failures.push("firewall_native_ha_not_proposed");
      if (
        scenario.id === "firewall-native-ha" &&
        !isDeepStrictEqual(
          { ...firewall, ha: undefined },
          {
            ...objectValue(objectValue(previous.firewalls).default),
            ha: undefined,
          },
        )
      )
        failures.push("firewall_ha_changed_saved_appliance");
    } else if (scenario.id === "firewall-ha-already-saved") {
      if (dialogue.changes.length || dialogue.questions.length)
        failures.push("firewall_saved_ha_reproposed");
    } else {
      if (
        dialogue.changes.length ||
        !dialogue.questions.length ||
        dialogue.questions.length > 3
      )
        failures.push("firewall_missing_prerequisites_not_questioned");
      if (
        dialogue.questions.some((question) =>
          /ob.*(?:ha|hochverf)|(?:ha|hochverf).*gew[uü]nscht|m[oö]chtest.*(?:ha|hochverf)/i.test(
            question.text,
          ),
        )
      )
        failures.push("firewall_requested_ha_asked_again");
      if (
        /nicht konfigurierbar|erst.*sp[aä]ter|nur.*sna|firewall.*nicht.*(?:unterst|vorschlagen)/i.test(
          dialogue.explanation,
        )
      )
        failures.push("firewall_artificially_deferred");
    }
    if (!/Plan.*Apply/s.test(dialogue.explanation))
      failures.push("firewall_missing_execution_boundary");
  }
  if (scenario.fixture.startsWith("governance")) {
    const actual = Object.fromEntries(
      dialogue.changes.map(({ path, value }) => [path, value]),
    );
    let expected: Record<string, unknown> = {};
    if (
      ["governance-organization-owner", "governance-verified-email"].includes(
        scenario.id,
      )
    )
      expected = {
        organization_owners: [
          "existing-owner@example.test",
          scenario.id === "governance-verified-email"
            ? "login@example.test"
            : "owner@example.test",
        ],
      };
    if (scenario.id === "governance-folder-owners")
      expected = {
        rm_folders: Object.fromEntries(
          Object.entries(
            objectValue(
              fixture.values.rm_folders as Parameters<typeof objectValue>[0],
            ),
          ).map(([key]) => [
            key,
            {
              owner_emails: [
                ...(key === "platform" ? ["folder-owner@example.test"] : []),
                "owner@example.test",
              ],
            },
          ]),
        ),
      };
    if (scenario.id === "governance-folder-reader")
      expected = {
        rm_folders: {
          platform: {
            reader_emails: [
              "folder-reader@example.test",
              "reader@example.test",
            ],
          },
        },
      };
    if (!isDeepStrictEqual(actual, expected))
      failures.push("governance_assignment_scope_or_preservation");
    const missingPath =
      scenario.id === "governance-folder-scope"
        ? "rm_folders[*].reader_emails"
        : scenario.id === "governance-missing-email"
          ? "owner_email"
          : null;
    if (
      missingPath
        ? dialogue.questions.length !== 1 ||
          dialogue.questions[0]?.path !== missingPath
        : dialogue.questions.length !== 0
    )
      failures.push("governance_missing_target_or_email_question");
    if (dialogue.explanation.includes("neuen Grundlagenvorschlag"))
      failures.push("governance_wrong_foundation_response");
    if (
      dialogue.changes.length &&
      !/Plan.*Apply|Apply.*Plan/s.test(dialogue.explanation)
    )
      failures.push("governance_missing_execution_boundary");
  }
  if (scenario.fixture === "baseline" && dialogue.changes.length)
    failures.push("advice_proposed_changes");
  if (
    scenario.requiredOverviewFields?.some(
      (field) => !dialogue.explanation.toLowerCase().includes(field),
    )
  )
    failures.push("incomplete_native_field_overview");
  if (
    scenario.id === "governance-folders-advice" &&
    (!/\b40\b/.test(dialogue.explanation) ||
      !/nicht unterst[uü]tzt|abgelehnt|reject|unsupported/i.test(
        dialogue.explanation,
      ) ||
      /\b255\b|\b256\b|\b500\b/.test(dialogue.explanation))
  )
    failures.push("incorrect_folder_limits");
  if (
    scenario.id === "firewall-policy-advice" &&
    (!["pass", "block", "reject"].every((action) =>
      dialogue.explanation.toLowerCase().includes(action),
    ) ||
      !/synchron|sync/i.test(dialogue.explanation))
  )
    failures.push("incomplete_policy_contract");
  if (scenario.fixture === "foundations") {
    const expected = {
      company_name: "Example GmbH",
      company_code: "exg",
      owner_email: "owner@example.test",
      region: "eu01",
      organization_id: syntheticOrganizationId,
    };
    if (
      !isDeepStrictEqual(
        Object.fromEntries(
          dialogue.changes.map(({ path, value }) => [path, value]),
        ),
        expected,
      )
    )
      failures.push("foundation_values_not_restored_exactly");
    if (dialogue.questions.length)
      failures.push("answered_foundations_asked_again");
  }
  if (scenario.fixture.startsWith("dns-")) {
    const contact =
      scenario.fixture === "dns-owner"
        ? "owner@example.test"
        : "login@example.test";
    const zone = dialogue.changes.find(
      (change) => change.path === "connectivity.dns_zones",
    );
    const expected = { contact_email: contact, default_ttl: 3600 };
    const parsed =
      zone?.value &&
      typeof zone.value === "object" &&
      !Array.isArray(zone.value)
        ? zone.value
        : {};
    const proposal = "example" in parsed ? parsed.example : null;
    if (
      !proposal ||
      typeof proposal !== "object" ||
      Array.isArray(proposal) ||
      !("name" in proposal) ||
      typeof proposal.name !== "string" ||
      !proposal.name ||
      !("description" in proposal) ||
      typeof proposal.description !== "string" ||
      !proposal.description ||
      !Object.entries(expected).every(
        ([key, value]) =>
          key in proposal && proposal[key as keyof typeof proposal] === value,
      )
    )
      failures.push("dns_settings_or_contact_missing");
    if (
      dialogue.changes.some(
        (change) => change.path !== "connectivity.dns_zones",
      )
    )
      failures.push("unrelated_dns_changes");
    if (dialogue.questions.length)
      failures.push("known_dns_values_asked_again");
  }
  if (scenario.fixture === "sna") {
    const expected = {
      ranges: ["10.64.0.0/16"],
      transfer_network: "10.255.255.0/24",
      min_prefix_length: 24,
      max_prefix_length: 28,
      default_prefix_length: 26,
      default_nameservers: ["1.1.1.1"],
    };
    const change = dialogue.changes.find(
      (entry) => entry.path === "connectivity.network_areas",
    );
    const area =
      change?.value &&
      typeof change.value === "object" &&
      !Array.isArray(change.value) &&
      "default" in change.value
        ? change.value.default
        : null;
    if (
      !area ||
      typeof area !== "object" ||
      !Object.entries(expected).every(([key, value]) =>
        isDeepStrictEqual(area[key as keyof typeof area], value),
      )
    )
      failures.push("sna_values_not_proposed_exactly");
    if (dialogue.changes.length !== 1 || dialogue.questions.length)
      failures.push("sna_scope_or_repeated_question");
  }
  if (scenario.fixture !== "baseline") {
    if (!/noch (?:nichts|nicht) gespeichert/i.test(dialogue.explanation))
      failures.push("missing_unsaved_notice");
    if (
      scenario.id !== "firewall-ha-already-saved" &&
      /\b(?:wurde|wurden|ist|sind)\b[^.!?\n]{0,100}\b(?:konfiguriert|gespeichert|eingetragen|bereitgestellt)\b/i.test(
        dialogue.explanation,
      )
    )
      failures.push("premature_saved_claim");
    const candidate = applyAssistantChanges(fixture.draft, dialogue.changes);
    const saved = compileCommonConfiguration(candidate);
    if (scenario.fixture.startsWith("dns-")) {
      const before = compileCommonConfiguration(fixture.draft);
      const connectivity = saved.connectivity;
      const previous = before.connectivity;
      if (
        !connectivity ||
        typeof connectivity !== "object" ||
        Array.isArray(connectivity) ||
        !previous ||
        typeof previous !== "object" ||
        Array.isArray(previous) ||
        !isDeepStrictEqual(connectivity.network_areas, previous.network_areas)
      )
        failures.push("dns_changed_network_areas");
      const zones =
        connectivity &&
        typeof connectivity === "object" &&
        !Array.isArray(connectivity)
          ? connectivity.dns_zones
          : null;
      const zone =
        zones && typeof zones === "object" && !Array.isArray(zones)
          ? zones.example
          : null;
      if (
        !zone ||
        typeof zone !== "object" ||
        Array.isArray(zone) ||
        zone.dns_name !== "example-gmbh.stackit.run"
      )
        failures.push("dns_domain_changed");
    }
  }
  return { dialogue, failures };
}

export function buildAssistantScenarioInventory() {
  const knowledge = buildAssistantKnowledge();
  const topicIds = knowledge.topics.map((topic) => topic.id);
  if (
    new Set(assistantScenarios.map((scenario) => scenario.id)).size !==
      assistantScenarios.length ||
    assistantScenarios.some(
      (scenario) =>
        !topicIds.includes(scenario.topic as (typeof topicIds)[number]),
    ) ||
    topicIds.some(
      (id) => !assistantScenarios.some((scenario) => scenario.topic === id),
    )
  )
    throw new Error("assistant_scenario_topic_coverage_invalid");
  const sourceDigests = Object.fromEntries(
    ["assistant-scenarios.ts", "assistant-tests.ts"].map((file) => [
      `scripts/${file}`,
      createHash("sha256")
        .update(readFileSync(new URL(file, import.meta.url)))
        .digest("hex"),
    ]),
  );
  return {
    schemaVersion: 1,
    status: "field-inventory-and-smoke-corpus-not-ai-qualification",
    engineRevision: knowledge.engineRevision,
    knowledgeSha256: knowledge.sha256,
    sourceDigests,
    suiteSha256: createHash("sha256")
      .update(JSON.stringify(sourceDigests))
      .digest("hex"),
    topics: knowledge.topics.map((topic) => ({
      id: topic.id,
      fields: knowledge.fields.filter((field) =>
        (topic.fieldPaths as readonly string[]).includes(field.path),
      ),
      cases: assistantScenarios
        .filter((scenario) => scenario.topic === topic.id)
        .map((scenario) => ({
          ...scenario,
          assertions: [
            "valid_dialogue",
            "reviewed_topic_reference",
            ...(scenario.requiredOverviewFields
              ? ["complete_native_field_overview"]
              : []),
            ...(scenario.id === "governance-folders-advice"
              ? ["folder_name_limit_40", "unsupported_description_rejected"]
              : []),
            ...(scenario.id === "firewall-policy-advice"
              ? ["pass_block_reject_actions", "explicit_policy_synchronization"]
              : []),
            ...(scenario.fixture === "baseline"
              ? ["no_changes"]
              : [
                  "compiler_accepts_proposal",
                  "explicit_unsaved_notice",
                  "no_premature_saved_claim",
                ]),
            ...(scenario.fixture === "foundations"
              ? ["five_exact_foundation_values", "no_repeated_or_dns_questions"]
              : scenario.fixture.startsWith("dns-")
                ? [
                    "name_description_ttl_contact",
                    "known_contact_priority",
                    "preserve_domain_and_network",
                    "no_unrelated_changes_or_questions",
                  ]
                : scenario.fixture === "sna"
                  ? [
                      "six_exact_sna_values",
                      "one_native_network_patch",
                      "no_unrelated_changes_or_questions",
                    ]
                  : []),
          ],
        })),
    })),
  };
}
