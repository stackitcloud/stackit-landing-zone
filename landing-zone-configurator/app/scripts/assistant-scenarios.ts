import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { catalogueField } from "@lzc/contracts";
import {
  applicationProjectPermissionNames,
  applicationServiceAccountKeyPermissions,
  type CommonConfiguration,
  catalogue,
  commonConfigurationFromValues,
  compileCommonConfiguration,
  createCommonConfiguration,
  createPlatformDraftCopy,
  defaultApplicationAccessProfile,
  effectiveInput,
  type JsonValue,
  objectValue,
  setCommonInput,
  textValue,
} from "@lzc/domain";
import {
  applyMultiTemplatePermissionAnswers,
  buildMultiTemplatePermissionDialogue,
  initialMultiTemplatePermissionState,
  type MultiTemplatePermissionContext,
  multiTemplatePermissionHistoryText,
} from "../apps/api/src/assistant/application-permission-dialogue.js";
import { enrichCatalogueQuestions } from "../apps/api/src/assistant/catalogue-guidance.js";
import {
  applyAssistantChanges,
  type Dialogue,
  proposeAssistantAccess,
  validateDialogue,
} from "../apps/api/src/assistant/dialogue.js";
import { assistantAuditCreationQuestions } from "../apps/api/src/assistant/editor.js";
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
    "Welche Konfigurationsfelder und Voraussetzungen gibt es fuer den zentralen DevOps-Git-Dienst? Welchen nativen Standard hat git_flavor, und wird damit eine Git-Instanz erstellt? Ist git-10 ein automatisch aktivierter Standard? Nur beraten, nichts aktivieren.",
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
  "stackit-network-components": [
    "connectivity.network_area",
    "connectivity.network_areas",
    "connectivity_regions",
    "ranges",
    "transfer_network",
    "min_prefix_length",
    "default_prefix_length",
    "max_prefix_length",
    "default_nameservers",
    "region",
    "ipv4",
  ],
  "platform-kubernetes": [
    "platform_kubernetes",
    "region",
    "cluster",
    "kubernetes_version_min",
    "node_pools",
    "minimum",
    "maximum",
    "availability_zones",
    "maintenance",
    "network",
    "sna_enabled",
    "network_area_key",
    "sna_network_prefix_length",
    "platform_kubernetes_kube_config_override",
  ],
  "devops-git": ["devops", "git_flavor", "allowed_network_ranges"],
  vpn: [
    "connectivity.vpn",
    "connectivity_regions",
    "plan_id",
    "routing_type",
    "availability_zones",
    "connections",
    "local_subnets",
    "remote_subnets",
    "static_routes",
    "tunnel1",
    "tunnel2",
    "phase1",
    "phase2",
    "vpn_pre_shared_keys",
  ],
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
    | "git-saved-access"
    | "service-catalogues"
    | "service-firewall-business"
    | "foundations"
    | "folder-naming"
    | "dns-owner"
    | "dns-login"
    | "dns-placeholder"
    | "dns-role"
    | "governance"
    | "governance-missing-email"
    | "governance-verified-email"
    | "firewall-existing"
    | "firewall-new"
    | "firewall-ha"
    | "firewall-metro"
    | "sna"
    | "corporate-ipv4";
  acceptableReferences?: readonly string[];
  requiredOverviewFields?: readonly string[];
  editorExpected?: { path: string; value: JsonValue };
  auditQuestionPaths?: readonly string[];
  setupQuestionPaths?: readonly string[];
  gitCapacityRecommendation?: { users: number; flavor: "git-10" | "git-100" };
  nativeDefaultExpected?: { path: string; value: JsonValue };
  nativeDefaultResetPath?: string;
  catalogueQuestion?: { path: string; field: string };
  answeredCatalogueChoice?: { path: string; value: string };
  requirementsQuestion?: string;
  expectedLanguage?: "de" | "en";
  sourceGuidance?: "git-user-limit" | "project-git" | "state-coordination";
  dnsRole?: "roles" | "secondary" | "draft";
  templateExpected?: ("public" | "corporate")[];
  applicationAccess?:
    | "advice"
    | "owner"
    | "granular"
    | "literal-append"
    | "vm-default"
    | "workload-default"
    | "server-operations"
    | "key-management"
    | "kubernetes-add"
    | "kubernetes-requester"
    | "public-kubernetes-requester"
    | "public-kubernetes-incomplete-owner"
    | "public-kubernetes-clarify"
    | "public-kubernetes-followup"
    | "both-kubernetes"
    | "both-kubernetes-empty-owner"
    | "both-kubernetes-clarify"
    | "both-kubernetes-followup"
    | "both-kubernetes-mixed-legacy"
    | "both-kubernetes-mixed-owner"
    | "both-kubernetes-mixed-confirm";
  corporateIpv4?: "advice" | "automatic" | "explicit";
  executionLifecycle?: boolean;
  platformImpactReview?: boolean;
  applicationUpgrade?: "template" | "platform";
  history?: readonly { role: "user" | "assistant"; content: string }[];
};

function auditQuestionHistory(
  choices: Parameters<typeof assistantAuditCreationQuestions>[0],
) {
  const pending = assistantAuditCreationQuestions(choices);
  return {
    role: "assistant" as const,
    content:
      pending.explanation +
      "\n" +
      pending.questions.map((q) => q.text).join("\n"),
  };
}
const sparseAuditHistory = [
  {
    role: "user" as const,
    content: "Bitte einen zentralen Audit-Entwurf vorbereiten.",
  },
  auditQuestionHistory({}),
];

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
    id: "git-company-wide-user-limit",
    topic: "devops-git",
    fixture: "baseline",
    expectedLanguage: "en",
    sourceGuidance: "git-user-limit",
    message:
      "We expect 250 Git users. Explain whether a single Git100 instance can serve them and propose an architecture using this Accelerator. Advice only; do not change configuration.",
  },
  {
    id: "application-project-git-advice",
    topic: "project-templates",
    fixture: "baseline",
    expectedLanguage: "en",
    sourceGuidance: "project-git",
    message:
      "Explain how an Application Landing Zone template can provide its own managed STACKIT Git instance. Which settings must its Platform Owner control, and does corporate SNA make Git privately reachable? Advice only; do not edit any project or template.",
  },
  {
    id: "state-s3-coordination-advice",
    topic: "management-state",
    fixture: "baseline",
    expectedLanguage: "en",
    sourceGuidance: "state-coordination",
    message:
      "How is concurrent State access protected on STACKIT EU01 if conditional S3 writes are not enforced? Explain direct CLI and Configurator operation and whether native locking has an announced implementation date. Advice only; no execution or changes.",
  },
  {
    id: "dns-zone-role-advice",
    topic: "dns-zones",
    fixture: "baseline",
    dnsRole: "roles",
    message:
      "Erkläre den DNS-Zonentyp fachlich: Was unterscheidet primary und secondary, sind beide autoritativ, und ist das die Auswahl public/private? Welchen Typ empfiehlst du für eine neue bei STACKIT verwaltete Firmenzone? Welche Secondary-Voraussetzung bildet der native Accelerator nicht ab? Nur beraten, nichts ändern.",
  },
  {
    id: "dns-zone-role-correction",
    topic: "dns-zones",
    fixture: "baseline",
    dnsRole: "roles",
    history: [
      {
        role: "user",
        content: "Ich brauche eine öffentliche Firmen-DNS-Zone.",
      },
      {
        role: "assistant",
        content:
          "Dafür solltest du den DNS-Zonentyp public einstellen; secondary ist nicht autoritativ.",
      },
    ],
    message:
      "Das Dropdown bietet nur primary und secondary. Korrigiere deine vorherige Aussage: Erkläre beide Rollen und ihre Autoritativität, die Abgrenzung zu public/private, deine Empfehlung für eine neue bei STACKIT verwaltete Firmenzone und die Secondary-Grenze des nativen Accelerators. Nur beraten, nichts ändern.",
  },
  {
    id: "dns-secondary-boundary",
    topic: "dns-zones",
    fixture: "baseline",
    dnsRole: "secondary",
    message:
      "Ich möchte eine Secondary-DNS-Zone, die von einem externen Primary repliziert. Kann der native Accelerator die benötigten Primary-Server vollständig konfigurieren? Erkläre die Grenze und ob secondary autoritativ ist. Nur beraten, keine alternative Primary-Zone anlegen.",
  },
  {
    id: "dns-zone-role-draft",
    topic: "dns-zones",
    fixture: "dns-role",
    dnsRole: "draft",
    message:
      "Ergänze zusätzlich genau eine bei STACKIT verwaltete öffentliche DNS-Zone new-company.stackit.gg unter dem Schlüssel company. Die vorhandene Zone example und alle Netzwerke bleiben unverändert. Wähle den fachlich passenden Zonentyp und verwende die hinterlegte Owner-E-Mail als Kontakt. Nur einen überprüfbaren Entwurf vorschlagen, nichts deployen.",
  },
  {
    id: "application-access-profile-advice",
    topic: "project-templates",
    fixture: "baseline",
    applicationAccess: "advice",
    message:
      "Welche Projektberechtigungen soll ich für Application-Teams wählen? Erkläre das empfohlene granulare VM-Profil, den separaten zentralen initialen Owner, Automation und die weiterhin mögliche volle Owner-Kundenwahl. Hebt eine eingeschränkte Rolle geerbte Owner-Rechte auf? Welche Produkte/Grenzen sind tatsächlich abgedeckt? Nur beraten, nichts ändern.",
  },
  {
    id: "application-server-operations-permissions-proposal",
    topic: "project-templates",
    fixture: "corporate-ipv4",
    applicationAccess: "server-operations",
    message:
      "Ergänze im Template central für Besteller und Application-Service-Account alle offiziellen Rechte für Server Backup Management (server-backup), Server Update Management (server-update) und Server Agent/Run Command (run-command). Ich will Sicherungen, Wiederherstellung, Zeitpläne und Betriebssystemupdates verwalten. Vorhandene Kubernetes-Rechte, zentralen Owner und andere Rechte erhalten; keine IAM-Rollen oder Mitgliederverwaltung hinzufügen. Nur einen überprüfbaren Entwurf vorschlagen, nichts ausführen.",
  },
  {
    id: "application-service-account-key-management-proposal",
    topic: "project-templates",
    fixture: "corporate-ipv4",
    applicationAccess: "key-management",
    message:
      "Ergänze in der bestehenden Vorlage central ausschließlich für den Besteller die Schlüsselverwaltung des vorhandenen Application-Service-Accounts: Schlüssel anlegen, auflisten, lesen, ändern und löschen sowie den Service Account sehen. Er soll Pipelines nutzen können. Keine Service Accounts anlegen oder löschen, keine Rollen oder Benutzer verwalten. Bestehende Kubernetes-Rechte, Plattform-Owner und Rechte der Automation unverändert lassen. Nur einen überprüfbaren Entwurf vorschlagen, nichts ausführen.",
  },
  {
    id: "application-service-account-key-management-natural-request",
    topic: "project-templates",
    fixture: "corporate-ipv4",
    applicationAccess: "key-management",
    message:
      "Im Template central soll der Besteller die Schlüssel des vorhandenen Application-Service-Accounts für Pipelines verwalten können. Ergänze die nötigen Rechte zum Erstellen, Lesen, Auflisten, Ändern und Löschen der Schlüssel und zum Sehen des Accounts. Vorhandene Kubernetes-Rechte und den zentralen Owner erhalten. Nur als Entwurf vorschlagen, nichts ausführen.",
  },
  {
    id: "application-access-workload-default-proposal",
    topic: "project-templates",
    fixture: "corporate-ipv4",
    applicationAccess: "workload-default",
    message:
      "Stelle ausschließlich das accessProfile der bestehenden Vorlage central auf das empfohlene granulare Workload-Standardprofil application-workloads-v1 um, einschließlich VMs, Object Storage, Observability und Secrets Manager. Zentraler initialer Projekt-Owner ist platform-owner@example.test. Keine weiteren Änderungen und keine Ausführung. Nur einen überprüfbaren Editor-Vorschlag vorbereiten.",
  },
  {
    id: "application-access-vm-default-proposal",
    topic: "project-templates",
    fixture: "corporate-ipv4",
    applicationAccess: "vm-default",
    message:
      "Stelle ausschließlich das accessProfile der bestehenden Vorlage central auf das empfohlene granulare Standardprofil für VM-Betrieb (vm-operations-v1) um. Zentraler initialer Projekt-Owner ist platform-owner@example.test. Team und Automation erhalten den geprüften VM-Standard, keine selbst erfundenen Rechte. Alle anderen Einstellungen erhalten. Nur einen Editor-Vorschlag vorbereiten.",
  },
  {
    id: "application-access-full-owner-proposal",
    topic: "project-templates",
    fixture: "corporate-ipv4",
    applicationAccess: "owner",
    message:
      "Ändere ausschließlich das accessProfile der bestehenden Corporate-Vorlage central auf volle Projekt-Owner-Rechte. Das ist unsere ausdrückliche Kundenentscheidung für Besteller und Automation. Verwende das vollständige atomare Profil schemaVersion 1, mode owner ohne granulare Felder. Alles andere unverändert. Nur überprüfbarer Editor-Vorschlag, nichts veröffentlichen oder ausführen.",
  },
  {
    id: "application-access-granular-proposal",
    topic: "project-templates",
    fixture: "corporate-ipv4",
    applicationAccess: "granular",
    message:
      "Ändere ausschließlich das accessProfile der bestehenden Corporate-Vorlage central auf granular, schemaVersion 1. Zentraler initialOwnerEmail ist platform-owner@example.test. Für das Team exakt permissions [iaas.server.get, resource-manager.project.get], für Automation exakt automationPermissions [iaas.server.get]. Kein Owner für den Besteller. Keine weiteren Änderungen, keine Veröffentlichung/Ausführung. Vollständiger atomarer Editor-Vorschlag.",
  },
  {
    id: "application-access-literal-permissions-append",
    topic: "project-templates",
    fixture: "corporate-ipv4",
    applicationAccess: "literal-append",
    message:
      "Ergänze ausschließlich das accessProfile der bestehenden Corporate-Vorlage central: permissions [iaas.server.delete] und automationPermissions [resource-manager.project.get]. Die bisherigen unterschiedlichen Rechte jeder Empfängerliste und den zentralen initialen Owner unverändert erhalten, nichts ersetzen oder entfernen. Nur überprüfbarer Vorschlag, nichts speichern, veröffentlichen oder ausführen.",
  },
  {
    id: "application-access-kubernetes-add",
    topic: "project-templates",
    fixture: "corporate-ipv4",
    applicationAccess: "kubernetes-add",
    message:
      "Bitte füge der bestehenden Corporate-Vorlage central die Rechte zum Management von Kubernetes Clustern hinzu, für Besteller und Application-Service-Account. Bestehende Rechte, zentralen Projekt-Owner und alle anderen Einstellungen erhalten. Nur Vorschlag, nichts veröffentlichen oder ausführen.",
  },
  {
    id: "application-access-kubernetes-requester",
    topic: "project-templates",
    fixture: "corporate-ipv4",
    applicationAccess: "kubernetes-requester",
    message:
      "Ergänze bei der vorhandenen Vorlage central nur für den Besteller die Rechte zum Management von Kubernetes Clustern. Die Rechte des Application-Service-Accounts und der zentrale Owner bleiben unverändert, ebenso alle anderen Einstellungen. Nur einen überprüfbaren Vorschlag erstellen.",
  },
  ...(["requester", "clarify", "incomplete-owner"] as const).map((mode) => ({
    id: `application-access-public-kubernetes-${mode}`,
    topic: "project-templates",
    fixture: "corporate-ipv4" as const,
    applicationAccess:
      mode === "incomplete-owner"
        ? ("public-kubernetes-incomplete-owner" as const)
        : mode === "requester"
          ? ("public-kubernetes-requester" as const)
          : ("public-kubernetes-clarify" as const),
    message:
      "Ich will das man bei der Bestellung einer Public Landing Zone auch Rechte bekommt einen Kubernetes Cluster bestellen und nutzen zu können",
  })),
  {
    id: "application-access-public-kubernetes-followup",
    topic: "project-templates",
    fixture: "corporate-ipv4",
    applicationAccess: "public-kubernetes-followup",
    history: [
      {
        role: "user",
        content:
          "Ich will das man bei der Bestellung einer Public Landing Zone auch Rechte bekommt einen Kubernetes Cluster bestellen und nutzen zu können",
      },
      {
        role: "assistant",
        content:
          "Wähle die bestehende Application-Vorlage, deren Dienstberechtigungen ergänzt werden sollen. Angefragte Dienste: ske; Rechte für: Besteller. Noch nichts gespeichert.\nWelche public-Vorlage soll geändert werden? (2: central, second-public)",
      },
    ],
    message: "central",
  },
  ...(
    [
      "both-kubernetes",
      "both-kubernetes-empty-owner",
      "both-kubernetes-clarify",
    ] as const
  ).map((mode) => ({
    id: `application-access-${mode}`,
    topic: "project-templates",
    fixture: "corporate-ipv4" as const,
    applicationAccess: mode,
    message:
      "Ich will dass sowohl der Service Account als auch der Besteller auch mit Kubernetes arbeiten können und das im Template Public und Corporate",
  })),
  {
    id: "application-access-both-kubernetes-followup",
    topic: "project-templates",
    fixture: "corporate-ipv4",
    applicationAccess: "both-kubernetes-followup",
    message:
      "Welche corporate-Vorlage soll geändert werden? (2: central, second-corporate)\nMeine Antwort: Corporate central (central)",
    history: [
      {
        role: "user",
        content:
          "Ich will dass sowohl der Service Account als auch der Besteller auch mit Kubernetes arbeiten können und das im Template Public und Corporate",
      },
      {
        role: "assistant",
        content:
          "Überprüfbare Ergänzung der Dienstrechte für Public- und Corporate-Vorlagen.\nAngefragte Dienste: ske; Empfänger: Besteller und Application-Service-Account; gewählte Vorlagen: public=?, corporate=?. Bestehende Rechte und zentrale Owner bleiben erhalten. Noch nichts gespeichert; es wird nichts ausgeführt. Vor Veröffentlichung ist ein gültiger initialer Owner erforderlich.\nWelche corporate-Vorlage soll geändert werden? (2: central, second-corporate)",
      },
    ],
  },
  ...(["mixed-legacy", "mixed-owner", "mixed-confirm"] as const).map(
    (stage) => ({
      id: `application-access-both-kubernetes-${stage}`,
      topic: "project-templates",
      fixture: "corporate-ipv4" as const,
      applicationAccess: `both-kubernetes-${stage}` as const,
      message:
        stage === "mixed-legacy"
          ? "Ich will dass sowohl der Service Account als auch der Besteller auch mit Kubernetes arbeiten können und das im Template Public und Corporate"
          : stage === "mixed-owner"
            ? "Der Platform Service Account"
            : "Workload-Umstellung für central bestätigen",
    }),
  ),
  {
    id: "corporate-ipv4-automatic-advice",
    topic: "project-templates",
    fixture: "baseline",
    corporateIpv4: "advice",
    message:
      "Unser Corporate-Template nutzt Automatisch, die angebundene SNA hat Standardpräfix /28 und DNS-Server. Erkläre, wie Automatisch im korrigierten Accelerator funktioniert und warum zuvor Invalid IPv4 configuration kam. Muss ich zwingend /24 setzen oder DNS ausschalten? Nur beraten, nichts ändern; keine freien Adressen behaupten.",
  },
  {
    id: "corporate-ipv4-explicit-proposal",
    topic: "project-templates",
    fixture: "corporate-ipv4",
    corporateIpv4: "explicit",
    message:
      "Ändere nur die Netzgröße der bestehenden Corporate-Vorlage central auf ausdrücklich /26. Der Adressbedarf und die SNA-Grenzen sind dafür geprüft. Schlüssel, Name, Dienste und DNS unverändert lassen. Nur überprüfbarer Editor-Vorschlag, keine Veröffentlichung oder Ausführung.",
  },
  {
    id: "corporate-ipv4-automatic-proposal",
    topic: "project-templates",
    fixture: "corporate-ipv4",
    corporateIpv4: "automatic",
    message:
      "Setze nur die Netzgröße der bestehenden Corporate-Vorlage central von /26 zurück auf Automatisch, damit der Standard der angebundenen SNA verwendet wird. Keinen festen Ersatzwert setzen, DNS und alle anderen Einstellungen erhalten. Nur überprüfbarer Editor-Vorschlag, keine Veröffentlichung oder Ausführung.",
  },
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
    id: "editor-audit-explicit-project",
    topic: "audit-logs",
    fixture: "baseline",
    message:
      "Bitte einen Audit-Entwurf erstellen: 90 Tage, nur ACL 203.0.113.0/24 und Object Lock aus. Explizit genau diesen manuellen Telemetry-Link-Scope setzen: resource_type=project und resource_id=00000000-0000-4000-8000-000000000099. Keinen Organisations-Link, keine automatische verwaltete Abdeckung, nichts ausführen.",
    editorExpected: {
      path: "audit_logs",
      value: {
        retention_days: 90,
        acl: ["203.0.113.0/24"],
        s3_object_lock: false,
        link_scopes: [
          {
            resource_type: "project",
            resource_id: "00000000-0000-4000-8000-000000000099",
          },
        ],
      },
    },
  },
  {
    id: "editor-audit-managed",
    topic: "audit-logs",
    fixture: "baseline",
    message:
      "Bitte einen Audit-Entwurf erstellen: 90 Tage, nur ACL 203.0.113.0/24 und Object Lock ausdrücklich aus. Alle vom Accelerator verwalteten Projekte und Ordner in der Plattformregion automatisch anbinden, auch neue Application-Bestellungen. Kein Deployment.",
    editorExpected: {
      path: "audit_logs",
      value: {
        retention_days: 90,
        acl: ["203.0.113.0/24"],
        s3_object_lock: false,
        managed_resources: true,
      },
    },
  },
  {
    id: "editor-audit-partial-retention",
    topic: "audit-logs",
    fixture: "baseline",
    history: sparseAuditHistory,
    message: "90 Tage",
    auditQuestionPaths: ["audit_logs.acl", "audit_logs.s3_object_lock"],
  },
  {
    id: "editor-audit-partial-acl",
    topic: "audit-logs",
    fixture: "baseline",
    history: [
      ...sparseAuditHistory,
      { role: "user", content: "90 Tage" },
      auditQuestionHistory({ retention_days: 90 }),
    ],
    message: "203.0.113.0/24",
    auditQuestionPaths: ["audit_logs.s3_object_lock"],
  },
  {
    id: "editor-audit-partial-lock",
    topic: "audit-logs",
    fixture: "baseline",
    history: [
      ...sparseAuditHistory,
      { role: "user", content: "90 Tage" },
      auditQuestionHistory({ retention_days: 90 }),
      { role: "user", content: "203.0.113.0/24" },
      auditQuestionHistory({ retention_days: 90, acl: ["203.0.113.0/24"] }),
    ],
    message: "Deaktivieren",
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
    id: "editor-audit-after-foundations",
    topic: "audit-logs",
    fixture: "baseline",
    history: [
      {
        role: "user",
        content: `Bitte Organisation ${syntheticOrganizationId} für die Plattform verwenden.`,
      },
      {
        role: "assistant",
        content: "Grundlagen vorgeschlagen, noch nichts gespeichert.",
      },
      ...sparseAuditHistory,
    ],
    message:
      "90 Tage Aufbewahrung, Zugriff ausschließlich aus 203.0.113.0/24, Object Lock ausdrücklich nein. Organisationsweiter Telemetry Link. Bitte diese Entscheidungen als Entwurfsvorschlag übernehmen.",
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
    id: "editor-monitoring-retention",
    topic: "observability",
    fixture: "baseline",
    message:
      "Bitte zentrale Observability als lokalen Entwurf einrichten: plan_name Observability-Monitoring-Medium-EU01, ACL 203.0.113.0/24, metrics_retention_days 30. Logs und Traces sind im Monitoring-Tarif nicht unterstützt, dafür keine Retention setzen. Keine Ausführung.",
    editorExpected: { path: "observability.metrics_retention_days", value: 30 },
  },
  {
    id: "editor-project-unique-buckets",
    topic: "management-state",
    fixture: "baseline",
    message:
      "Bitte Bucket-Namensschema im lokalen Entwurf ausdrücklich auf bucket_naming=project-id setzen, damit die vollständige jeweilige Projekt-ID enthalten ist. Keine sonstigen Änderungen, kein Plan oder Apply.",
    editorExpected: { path: "bucket_naming", value: "project-id" },
  },
  ...[
    {
      id: "editor-devops-setup-en",
      message: "Please add a central git instance to the config",
      paths: ["devops.git_flavor", "devops.allowed_network_ranges"],
    },
    {
      id: "editor-devops-setup-de",
      message:
        "Bitte eine zentrale Git-Instanz in die Konfiguration aufnehmen.",
      paths: ["devops.git_flavor", "devops.allowed_network_ranges"],
    },
    {
      id: "editor-devops-size-only",
      message:
        "Please add central Git, using git-10. I have not chosen the access networks yet.",
      paths: ["devops.allowed_network_ranges"],
    },
    {
      id: "editor-devops-networks-only",
      message:
        "Please add central Git, accessible only from 203.0.113.0/24. I have not selected its size yet.",
      paths: ["devops.git_flavor"],
    },
  ].map(({ id, message, paths }) => ({
    id,
    message,
    topic: "devops-git",
    fixture: "baseline" as const,
    setupQuestionPaths: paths,
    expectedLanguage: id.endsWith("-de") ? ("de" as const) : ("en" as const),
  })),
  ...[
    {
      id: "editor-devops-sized-80-en",
      language: "en" as const,
      message:
        "Please add a central git instance for round about 80 developers to the config",
    },
    {
      id: "editor-devops-sized-80-de",
      language: "de" as const,
      message:
        "Bitte eine zentrale Git-Instanz für ca. 80 Entwickler in die Konfiguration aufnehmen.",
    },
  ].map(({ id, language, message }) => ({
    id,
    message,
    topic: "devops-git",
    fixture: "service-catalogues" as const,
    expectedLanguage: language,
    setupQuestionPaths: ["devops.allowed_network_ranges"],
    gitCapacityRecommendation: { users: 80, flavor: "git-100" as const },
  })),
  {
    id: "editor-devops-sized-80-followup",
    topic: "devops-git",
    fixture: "service-catalogues",
    expectedLanguage: "en",
    message: "Allow only 203.0.113.0/24.",
    history: [
      {
        role: "user",
        content:
          "Please add a central git instance for round about 80 developers to the config",
      },
      {
        role: "assistant",
        content:
          "Git100 fits your expected user count. Which source networks should have access?",
      },
    ],
    editorExpected: { path: "devops.git_flavor", value: "git-100" },
    gitCapacityRecommendation: { users: 80, flavor: "git-100" },
  },
  ...[
    {
      id: "consultation-company-git-default-en",
      language: "en" as const,
      message: "My answer: please use the default",
    },
    {
      id: "consultation-company-git-default-de",
      language: "de" as const,
      message: "Meine Antwort: Bitte den Default des Accelerators verwenden.",
    },
  ].map(({ id, language, message }) => ({
    id,
    topic: "devops-git",
    fixture: "service-catalogues" as const,
    expectedLanguage: language,
    message,
    history: [
      {
        role: "user" as const,
        content:
          "We use a Hub-and-Spoke landing zone and need a central company Git for round about 80 developers.",
      },
      {
        role: "assistant" as const,
        content:
          "Git100 fits 80 developers; Git10 supports only 10. Who should be able to reach Git?",
      },
      {
        role: "user" as const,
        content: "Company/VPN public egress networks only (recommended)",
      },
      {
        role: "assistant" as const,
        content:
          "Which actual client source IP addresses or CIDRs should be allowed?",
      },
    ],
    editorExpected: { path: "devops.git_flavor", value: "git-100" },
    gitCapacityRecommendation: { users: 80, flavor: "git-100" as const },
    nativeDefaultExpected: {
      path: "devops.allowed_network_ranges",
      value: ["0.0.0.0/0"],
    },
  })),
  {
    id: "consultation-observability-native-reset",
    topic: "observability",
    fixture: "git-saved-access",
    expectedLanguage: "en",
    message:
      "Please reset only the central Observability metrics retention to the Accelerator default. Keep its plan, access list, logs/traces settings and every other service unchanged. Prepare the draft; do not deploy.",
    nativeDefaultResetPath: "observability.metrics_retention_days",
  },
  {
    id: "catalogue-firewall-business-en",
    topic: "firewall-infrastructure",
    fixture: "service-firewall-business",
    expectedLanguage: "en",
    message:
      "Please help me set up a central HA firewall for internet and inter-project traffic. Start by clarifying the remaining business requirements; do not propose infrastructure changes yet.",
    requirementsQuestion: "connectivity.firewall.flavor",
  },
  {
    id: "catalogue-firewall-capacity-followup-en",
    topic: "firewall-infrastructure",
    fixture: "service-firewall-business",
    expectedLanguage: "en",
    history: [
      {
        role: "user",
        content:
          "Please help me set up a central HA firewall for internet and inter-project traffic.",
      },
      {
        role: "assistant",
        content:
          "What peak throughput and concurrent connection count do you expect?",
      },
    ],
    message:
      "Traffic is not yet quantifiable. Keep the current VM size as a provisional baseline and validate capacity separately. Please continue with the remaining requirements; do not change the infrastructure yet.",
    requirementsQuestion: "connectivity.firewall.ha",
  },
  {
    id: "catalogue-kubernetes-machine-choice",
    topic: "platform-kubernetes",
    fixture: "service-catalogues",
    expectedLanguage: "en",
    message:
      "Please configure a central Kubernetes cluster in eu01 with a default node pool. Before proposing any changes, ask me to choose from the available node machine sizes, using understandable labels. I have not selected a machine type yet.",
    catalogueQuestion: {
      path: "platform_kubernetes[*].cluster.node_pools[*].machine_type",
      field: "machineTypes",
    },
  },
  {
    id: "catalogue-vpn-plan-choice",
    topic: "vpn",
    fixture: "service-catalogues",
    expectedLanguage: "en",
    message:
      "Please configure a central VPN connection for our company. Before proposing any changes, ask me to choose a VPN plan from the available project offerings. I have not selected a plan yet; do not ask me to look up an internal plan ID.",
    catalogueQuestion: { path: "connectivity.vpn.plan_id", field: "vpnPlans" },
  },
  {
    id: "catalogue-observability-plan-choice",
    topic: "observability",
    fixture: "service-catalogues",
    expectedLanguage: "en",
    message:
      "Please configure central Observability for our landing zone. Before proposing any changes, ask me to choose from the available Observability plans with useful choices. I have not selected a plan yet.",
    catalogueQuestion: {
      path: "observability.plan_name",
      field: "observabilityPlans",
    },
  },
  ...[
    {
      id: "catalogue-kubernetes-followup",
      topic: "platform-kubernetes",
      path: "platform_kubernetes[*].cluster.node_pools[*].machine_type",
      value: "g1.4",
      request:
        "Please configure central Kubernetes in eu01 with a default node pool.",
      question: "Which node machine size should we use?",
      message:
        "Use g1.4 for the node machines. Retain this choice and ask me for any other missing setup information. Do not propose configuration changes yet.",
    },
    {
      id: "catalogue-vpn-followup",
      topic: "vpn",
      path: "connectivity.vpn.plan_id",
      value: "vpn-medium",
      request: "Please configure central VPN for our company.",
      question: "Which offered VPN plan should we use?",
      message:
        "Use the offered vpn-medium plan. Retain this choice and ask me for the other missing VPN requirements. Do not propose configuration changes yet.",
    },
    {
      id: "catalogue-observability-followup",
      topic: "observability",
      path: "observability.plan_name",
      value: "Observability-Medium",
      request: "Please configure central Observability for our landing zone.",
      question: "Which offered Observability plan should we use?",
      message:
        "Use Observability-Medium. Retain this choice and ask me for the other missing monitoring requirements. Do not propose configuration changes yet.",
    },
  ].map((entry) => ({
    id: entry.id,
    topic: entry.topic,
    fixture: "service-catalogues" as const,
    expectedLanguage: "en" as const,
    history: [
      { role: "user" as const, content: entry.request },
      { role: "assistant" as const, content: entry.question },
    ],
    message: entry.message,
    answeredCatalogueChoice: { path: entry.path, value: entry.value },
  })),
  ...[
    {
      id: "editor-devops-over-capacity-en",
      language: "en" as const,
      message:
        "Please add central Git for our 150 developers. Use a sensible company-wide starting point and allow only 203.0.113.0/24.",
    },
    {
      id: "editor-devops-over-capacity-de",
      language: "de" as const,
      message:
        "Bitte zentrales Git für unsere 150 Entwickler vorbereiten. Empfiehl einen sinnvollen Standard und erlaube nur 203.0.113.0/24.",
    },
    {
      id: "editor-devops-over-capacity-followup",
      language: "en" as const,
      message:
        "Use git-100 and allow only 203.0.113.0/24. Keep our stated user requirement.",
    },
  ].map((entry) => ({
    id: entry.id,
    topic: "devops-git",
    fixture: "baseline" as const,
    expectedLanguage: entry.language,
    message: entry.message,
    history: entry.id.endsWith("followup")
      ? [
          {
            role: "user" as const,
            content: "Please add central Git for all our 150 developers.",
          },
          {
            role: "assistant" as const,
            content:
              "We need to discuss the scope because Git100 supports at most 100 users per instance.",
          },
        ]
      : [],
    setupQuestionPaths: ["devops.git_flavor"],
  })),
  ...[
    { id: "editor-devops-unselected-requirements-en", history: [] },
    {
      id: "editor-devops-setup-after-service-advice-en",
      history: [
        {
          role: "user" as const,
          content:
            "Bitte die zentrale Observability vorbereiten, noch nichts deployen.",
        },
        {
          role: "assistant" as const,
          content:
            "Observability ist nur vorgeschlagen; noch nichts gespeichert.",
        },
      ],
    },
  ].map((entry) => ({
    id: entry.id,
    topic: "devops-git",
    fixture: "baseline" as const,
    expectedLanguage: "en" as const,
    history: entry.history,
    message:
      "Please add a central git instance to the config. I have not selected its size or access networks yet.",
    setupQuestionPaths: ["devops.git_flavor", "devops.allowed_network_ranges"],
  })),
  {
    id: "editor-devops-capacity-narrowed",
    topic: "devops-git",
    fixture: "baseline",
    expectedLanguage: "en",
    message:
      "Limit this shared Git instance to 80 users. Use git-100 and allow only 203.0.113.0/24.",
    history: [
      {
        role: "user",
        content: "Please add central Git for all our 150 developers.",
      },
      {
        role: "assistant",
        content:
          "Git100 supports at most 100 users per instance. Discuss separate team instances or narrow this instance's scope?",
      },
    ],
    editorExpected: {
      path: "devops",
      value: {
        git_flavor: "git-100",
        allowed_network_ranges: ["203.0.113.0/24"],
      },
    },
  },
  {
    id: "editor-devops-company-standard",
    topic: "devops-git",
    fixture: "baseline",
    expectedLanguage: "en",
    message:
      "Welche Git-Größe soll der Entwurf verwenden? Wähle einen verfügbaren Git-Tarif oder beschreibe deinen Kapazitätsbedarf.\nMy answer: just use a standard git flavor, which is usefull for a company wide git.",
    history: [
      {
        role: "user",
        content: "Please add a central git instance to the config",
      },
      {
        role: "assistant",
        content: "Welche Git-Größe soll der Entwurf verwenden?",
      },
    ],
    setupQuestionPaths: ["devops.allowed_network_ranges"],
  },
  {
    id: "editor-devops-company-complete",
    topic: "devops-git",
    fixture: "baseline",
    expectedLanguage: "en",
    message: "Allow access only from 203.0.113.0/24.",
    history: [
      {
        role: "user",
        content: "Please add a central git instance to the config",
      },
      { role: "assistant", content: "Which starting size would you like?" },
      {
        role: "user",
        content: "just use a standard git flavor useful for company-wide Git",
      },
      {
        role: "assistant",
        content:
          "Starting size selected: Git100. Who should be able to reach it?",
      },
    ],
    editorExpected: {
      path: "devops",
      value: {
        git_flavor: "git-100",
        allowed_network_ranges: ["203.0.113.0/24"],
      },
    },
  },
  {
    id: "editor-devops-reuse-allowlist",
    topic: "devops-git",
    fixture: "git-saved-access",
    expectedLanguage: "en",
    message:
      "Use the recommended company-wide standard and reuse the Observability allowlist for Git.",
    editorExpected: {
      path: "devops",
      value: {
        git_flavor: "git-100",
        allowed_network_ranges: ["203.0.113.0/24"],
      },
    },
  },
  {
    id: "editor-devops-followup",
    topic: "devops-git",
    fixture: "baseline",
    message: "Use git-10 and allow access only from 203.0.113.0/24.",
    history: [
      {
        role: "user",
        content: "Please add a central git instance to the config",
      },
      {
        role: "assistant",
        content:
          "Which Git size and source networks should the draft use? No choice has been made yet.",
      },
    ],
    expectedLanguage: "en",
    editorExpected: {
      path: "devops",
      value: {
        git_flavor: "git-10",
        allowed_network_ranges: ["203.0.113.0/24"],
      },
    },
  },
  {
    id: "editor-devops",
    topic: "devops-git",
    fixture: "baseline",
    message:
      "Bitte den zentralen DevOps-Git-Dienst als Entwurf konfigurieren: git_flavor ausdrücklich git-10, allowed_network_ranges ausschließlich [203.0.113.0/24]. Der Flavor ist meine Auswahl, keine Verfügbarkeitszusage und kein Deployment.",
    editorExpected: {
      path: "devops",
      value: {
        git_flavor: "git-10",
        allowed_network_ranges: ["203.0.113.0/24"],
      },
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
    id: "governance-folder-scope-followup",
    topic: "governance-folders",
    fixture: "governance",
    message: "Platform",
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
  {
    id: "application-template-upgrade-advice",
    topic: "configuration-lifecycle",
    fixture: "baseline",
    applicationUpgrade: "template",
    message:
      "Wie kann ich als Besteller meine bestehende Application auf eine neue Template-Version aktualisieren, ohne neu zu bestellen? Erkläre den veröffentlichten Upgrade-Pfad, erhaltene Antworten und State, Schutz vor Löschungen und Ersetzungen sowie die getrennten Plan- und Apply-Freigaben. Nur beraten, nichts ausführen.",
  },
  {
    id: "application-upgrade-self-service-advice",
    topic: "configuration-lifecycle",
    fixture: "baseline",
    applicationUpgrade: "template",
    message:
      "Der Platform Owner hat für meine bestehende Application einen Upgrade-Pfad mit Eigenständig durchführen veröffentlicht. Beide Template-Versionen verlangen für neue Bestellungen eine Freigabe. Der neue Plan ändert das Projekt vor Ort und ersetzt nur Projekt-Rollenzuweisungen. Brauche ich nochmal den Platform Owner? Erkläre die Pfadrichtlinie, den frischen Plan, erhaltene Antworten und State, den Löschschutz sowie den separaten Apply. Nur beraten, nichts ausführen.",
  },
  {
    id: "application-platform-upgrade-advice",
    topic: "configuration-lifecycle",
    fixture: "baseline",
    applicationUpgrade: "platform",
    message:
      "Wenn der Platform Owner die gemeinsame Firewall und Routen aktualisiert: Kann meine Application durch Ablehnen eines Plattform-Upgrades die alte Firewall behalten? Erkläre Abhängigkeitsprüfung und Plan-Freigabe vor dem Plattform-Apply und den tatsächlichen Plattformvertrag danach. Nur beraten, nichts ausführen.",
  },
  {
    id: "application-execution-lifecycle-advice",
    topic: "configuration-lifecycle",
    fixture: "baseline",
    executionLifecycle: true,
    message:
      "Meine bestehende Application-Bestellung kann nach einem Produktupdate wegen ihrer Accelerator-Revision keinen Drift mehr prüfen. Soll ich neu bestellen? Wie bleiben dieselbe Bestellung und der State nutzbar? Unterscheide ursprüngliche Template-Quelle, gewünschten Stand und zuletzt erfolgreich angewendete Revision. Wie funktioniert ein Upgrade, was passiert bei Apply-Fehler und bei einer zurückgezogenen Quelle? Nur beraten, nichts ändern oder ausführen.",
  },
  {
    id: "execution-upgrade-after-template-history",
    topic: "configuration-lifecycle",
    fixture: "baseline",
    executionLifecycle: true,
    history: [
      {
        role: "user",
        content:
          "Wie übernehme ich eine neue Template-Version mit anderen Projektberechtigungen?",
      },
      {
        role: "assistant",
        content:
          "Über den veröffentlichten Template-Upgrade-Pfad und einen frischen Plan.",
      },
    ],
    message:
      "Jetzt geht es um die technische Ausführung: Nach einem Produktrelease lehnt der Worker die gebundene Accelerator-Quelle meiner bisherigen Bestellung ab. Wie kann ich denselben State weiter verwenden? Erkläre ursprüngliche Template-Quelle, gewünschten Ausführungsstand, letzten erfolgreichen Apply, zurückgezogene Pakete und Recovery bei Teilfehlern. Nur beraten, keine Änderung oder Ausführung.",
  },
  {
    id: "template-upgrade-after-execution-history",
    topic: "configuration-lifecycle",
    fixture: "baseline",
    applicationUpgrade: "template",
    history: [
      {
        role: "user",
        content:
          "Wie aktualisiere ich die technische Runner-Quelle bei einer zurückgezogenen Accelerator-Revision?",
      },
      {
        role: "assistant",
        content:
          "Die technische Ausführung besitzt ihre eigene gewünschte Quellenbindung.",
      },
    ],
    message:
      "Nun möchte ich die neue veröffentlichte Public-Template-Version mit den zusätzlichen Kubernetes-Rechten nutzen. Wie übernimmt der Application Owner diese Template-Version in derselben Bestellung mit seinen bisherigen Antworten und demselben State? Erkläre Plan-/Apply-Freigabe und Löschschutz. Nur beraten, keine Änderung oder Ausführung.",
  },
  {
    id: "platform-impact-without-role-advice",
    topic: "configuration-lifecycle",
    fixture: "baseline",
    platformImpactReview: true,
    message:
      "Mein gespeicherter Plattformplan löscht und ersetzt gemeinsame Ressourcen, die mehrere Applications verwenden. Ich möchte die Auswirkungen beurteilen und den Apply danach freigeben. Woran ist die Bestätigung gebunden, wann muss ich neu planen und was passiert bei möglichen Datenverlusten? Nur beraten, nichts ändern oder ausführen.",
  },
  {
    id: "platform-plan-review-en",
    topic: "configuration-lifecycle",
    fixture: "baseline",
    expectedLanguage: "en",
    platformImpactReview: true,
    requiredOverviewFields: ["plan", "apply"],
    message:
      "My root platform Plan replaces shared resources. How should the Platform Owner review and approve it, what binds the confirmation, and can an old blocked Plan be reused? Explain only; no changes or execution.",
  },
  {
    id: "audit-query-migration-impact-advice",
    topic: "configuration-lifecycle",
    platformImpactReview: true,
    fixture: "baseline",
    requiredOverviewFields: ["observability", "plan", "apply"],
    message:
      "Mein Plattform-Plan stellt die zentrale Audit-Ablage von Logs auf die bereits bestehende Observability um: gleiche Projekte und gleicher Router, unverändertes S3-Archiv und Links, vier alte Logs-Ressourcen werden entfernt. Application-Bestellungen hängen daran. Wann ist diese konkrete Migration freigabefähig, woran ist meine Bestätigung gebunden, Wie entscheidet der Platform Owner bei anderen geplanten Löschungen und Ersetzungen, und lassen sich alte Pläne dadurch nachträglich entsperren? Nur beraten, nichts ändern oder ausführen.",
  },
  {
    id: "audit-grafana-upgrade-advice",
    topic: "audit-logs",
    fixture: "baseline",
    requiredOverviewFields: ["grafana", "observability", "plan", "apply"],
    message:
      "Zentrale Audit-Ereignisse kommen in STACKIT Logs an, aber das vorhandene Grafana Audit Logs Dashboard ist leer. Erkläre die native Observability-Anbindung und den Upgrade-Weg für eine bestehende Plattform. Sind Grafana-Admin-Zugang oder Updates jeder bereits angebundenen Application-Bestellung nötig? Wird weiter eine separate Logs-Instanz benötigt, was passiert bei der direkten Dev-Umstellung mit ihren bisherigen Daten, und gilt für Observability dieselbe Aufbewahrung wie für Logs/S3? Nur erklären, nichts ändern oder ausführen.",
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
    id: "foundations-prefixed-folders",
    topic: "identity-foundations",
    fixture: "folder-naming",
    acceptableReferences: [
      "identity-foundations",
      "governance-folders",
      "configuration-contract",
    ],
    message: `Here are some details about my company. Company name: "Synthetic Corp". Org ID: ${syntheticOrganizationId}. I am the technical contact with my logged in email. Region: south Germany. Please prepare the config including a good prefix and folder names reflecting this prefix.`,
  },
  {
    id: "governance-prefixed-folders-followup",
    topic: "governance-folders",
    fixture: "folder-naming",
    acceptableReferences: [
      "identity-foundations",
      "governance-folders",
      "configuration-contract",
    ],
    message: "Please change the folder names reflecting the selected prefix.",
    history: [
      {
        role: "user",
        content:
          "The company is Synthetic Corp. Please propose a short company prefix.",
      },
      {
        role: "assistant",
        content:
          "I propose company_name: Synthetic Corp and company_code: syn. Nothing has been saved.",
      },
    ],
  },
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
  if (
    scenario.fixture.startsWith("dns-") ||
    scenario.fixture === "sna" ||
    scenario.corporateIpv4
  )
    draft = commonConfigurationFromValues(template, draft.id, draft.name, {
      ...compileCommonConfiguration(draft),
      connectivity: {
        network_areas: {
          default: {
            ranges: ["10.32.0.0/16"],
            transfer_network: "10.254.255.0/24",
            min_prefix_length: 24,
            max_prefix_length: 28,
            default_prefix_length: scenario.corporateIpv4 ? 28 : 24,
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
  if (
    scenario.fixture === "firewall-metro" ||
    scenario.fixture === "service-firewall-business"
  )
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
  if (scenario.fixture === "folder-naming") {
    draft = setCommonInput(draft, "company_name", null);
    draft = setCommonInput(draft, "company_code", null);
    const folders = objectValue(
      effectiveInput(compileCommonConfiguration(draft), "rm_folders"),
    );
    draft = setCommonInput(
      draft,
      "rm_folders",
      Object.fromEntries(
        Object.entries(folders).map(([key, value]) => [
          key,
          {
            ...objectValue(value),
            owner_emails: ["folder-owner@example.test"],
            reader_emails: ["folder-reader@example.test"],
          },
        ]),
      ),
    );
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
  if (scenario.id === "editor-project-unique-buckets")
    draft = setCommonInput(draft, "bucket_naming", "legacy");
  if (scenario.corporateIpv4) {
    draft = createPlatformDraftCopy(draft, crypto.randomUUID());
    draft.projectTemplates = [
      {
        id: "00000000-0000-4000-8000-000000000026",
        key: "central",
        name: "Corporate central",
        kind: "corporate",
        region: "eu01",
        settings: {
          network_enabled: true,
          network_area_key: "default",
          network_prefix_length:
            scenario.corporateIpv4 === "automatic" ? 26 : null,
          secretsmanager_enabled: true,
        },
      },
    ];
  }
  if (scenario.applicationAccess && scenario.applicationAccess !== "advice") {
    draft = createPlatformDraftCopy(draft, crypto.randomUUID());
    draft.projectTemplates = [
      {
        id: "00000000-0000-4000-8000-000000000026",
        key: "central",
        name: "Corporate central",
        kind: "corporate",
        region: "eu01",
        settings: {
          network_enabled: true,
          network_area_key: "default",
          secretsmanager_enabled: true,
        },
        accessProfile:
          scenario.applicationAccess === "owner" ||
          scenario.applicationAccess === "kubernetes-add" ||
          scenario.applicationAccess === "kubernetes-requester"
            ? defaultApplicationAccessProfile("platform-owner@example.test")
            : { schemaVersion: 1, mode: "owner" },
      },
    ];
  }
  if (
    scenario.applicationAccess === "key-management" ||
    scenario.applicationAccess === "server-operations"
  ) {
    draft.projectTemplates![0]!.accessProfile = {
      schemaVersion: 1,
      mode: "granular",
      initialOwnerEmail: "platform-owner@example.test",
      permissions: [
        "iaas.server.get",
        "ske.cluster.create",
        "resource-manager.project.get",
      ],
      automationPermissions: ["iaas.server.get", "ske.cluster.create"],
    };
  }
  if (scenario.applicationAccess === "literal-append") {
    const appendTemplate = draft.projectTemplates?.[0];
    if (!appendTemplate) throw new Error("missing literal append template");
    appendTemplate.accessProfile = {
      schemaVersion: 1,
      mode: "granular",
      initialOwnerEmail: "platform-owner@example.test",
      permissions: ["iaas.server.get", "secrets-manager.secret.get"],
      automationPermissions: ["iaas.server.get"],
    };
  }
  if (scenario.applicationAccess?.startsWith("public-kubernetes-")) {
    const publicTemplate = draft.projectTemplates![0]!;
    publicTemplate.kind = "public";
    publicTemplate.name = "Public workload";
    publicTemplate.settings = {
      env: "dev",
      network_enabled: true,
      network_prefix_length: 25,
      secretsmanager_enabled: true,
    };
    publicTemplate.accessProfile = {
      ...defaultApplicationAccessProfile(
        scenario.applicationAccess === "public-kubernetes-incomplete-owner"
          ? ""
          : "platform-owner@example.test",
      ),
      permissions: ["secrets-manager.secret.get", "iaas.server.get"],
      automationPermissions: ["iaas.server.get"],
    };
    draft.projectTemplates!.push({
      ...structuredClone(publicTemplate),
      id: "00000000-0000-4000-8000-000000000027",
      key: "untouched-corporate",
      name: "Other Corporate",
      kind: "corporate",
    });
    if (
      scenario.applicationAccess === "public-kubernetes-clarify" ||
      scenario.applicationAccess === "public-kubernetes-followup"
    )
      draft.projectTemplates!.push({
        ...structuredClone(publicTemplate),
        id: "00000000-0000-4000-8000-000000000028",
        key: "second-public",
        name: "Second Public",
      });
  }
  if (scenario.applicationAccess?.startsWith("both-kubernetes")) {
    const corporate = draft.projectTemplates![0]!;
    corporate.accessProfile = {
      ...defaultApplicationAccessProfile(
        scenario.applicationAccess === "both-kubernetes-empty-owner" ||
          scenario.applicationAccess?.startsWith("both-kubernetes-mixed-")
          ? ""
          : "platform-owner@example.test",
      ),
      permissions: ["secrets-manager.secret.get", "iaas.server.get"],
      automationPermissions: ["iaas.server.get"],
    };
    draft.projectTemplates!.push({
      ...structuredClone(corporate),
      id: "00000000-0000-4000-8000-000000000027",
      key: "public-workload",
      name: "Public workload",
      kind: "public",
      settings: {
        env: "dev",
        network_enabled: true,
        network_prefix_length: 25,
      },
      accessProfile: {
        ...corporate.accessProfile,
        permissions: ["resource-manager.project.get"],
        automationPermissions: ["secrets-manager.secret.get"],
      },
    });
    if (
      scenario.applicationAccess === "both-kubernetes-clarify" ||
      scenario.applicationAccess === "both-kubernetes-followup"
    )
      draft.projectTemplates!.push({
        ...structuredClone(corporate),
        id: "00000000-0000-4000-8000-000000000028",
        key: "second-corporate",
        name: "Second Corporate",
      });
  }
  if (scenario.applicationAccess?.startsWith("both-kubernetes-mixed-")) {
    const corporate = draft.projectTemplates!.find((t) => t.key === "central")!;
    delete corporate.accessProfile;
    corporate.settings.automation_role = "owner";
  }
  if (scenario.fixture === "git-saved-access")
    draft = setCommonInput(draft, "observability", {
      plan_name: "Observability-Starter-EU01",
      acl: ["203.0.113.0/24"],
      metrics_retention_days: 30,
      logs_retention_days: 30,
      traces_retention_days: 30,
      metrics_retention_days_1h_downsampling: 30,
      metrics_retention_days_5m_downsampling: 30,
    });
  const values = assistantPublicValues(draft);
  if (scenario.expectedLanguage)
    values["assistant.language"] = scenario.expectedLanguage;
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
      scenario.fixture === "firewall-metro" ||
      scenario.fixture === "service-firewall-business"
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
  if (scenario.fixture === "service-firewall-business") {
    catalogues.regions[0]!.products.bastionMachineTypes = {
      status: "available",
      totalOptions: 2,
      truncated: false,
      options: [
        { value: "c1.2", label: "c1.2" },
        { value: "c1.4", label: "c1.4" },
      ],
    };
  }
  if (scenario.fixture === "service-catalogues") {
    catalogues.regions = [
      {
        region: "eu01",
        fetchedAt: "2026-11-18T00:00:00Z",
        products: Object.fromEntries(
          ["machineTypes", "vpnPlans", "observabilityPlans"].map((field) => [
            field,
            {
              status: "available" as const,
              totalOptions: 3,
              truncated: false,
              options: (field === "machineTypes"
                ? ["g1.2", "g1.4", "g1.8"]
                : field === "vpnPlans"
                  ? ["vpn-small", "vpn-medium", "vpn-large"]
                  : [
                      "Observability-Small",
                      "Observability-Medium",
                      "Observability-Large",
                    ]
              ).map((value) => ({ value, label: value })),
            },
          ]),
        ),
      },
    ];
  }
  if (
    scenario.applicationAccess?.startsWith("both-kubernetes-mixed-") ||
    scenario.applicationAccess === "both-kubernetes-followup"
  ) {
    values["assistant.platform_service_account_emails"] = [
      "bootstrap-platform@sa.stackit.cloud",
    ];
    const request =
      "Ich will dass sowohl der Service Account als auch der Besteller auch mit Kubernetes arbeiten können und das im Template Public und Corporate";
    const context: MultiTemplatePermissionContext = {
      templates: objectValue(values.projectTemplates as JsonValue),
      originalRequest: request,
      services: ["ske"],
      permissionTarget: "both",
      permissionNames: [...applicationProjectPermissionNames],
      platformServiceAccountEmails: ["bootstrap-platform@sa.stackit.cloud"],
      english: false,
    };
    let state = initialMultiTemplatePermissionState();
    const initial = buildMultiTemplatePermissionDialogue(context, state);
    if (scenario.applicationAccess !== "both-kubernetes-mixed-legacy") {
      history.length = 0;
      history.push(
        { role: "user", content: request },
        {
          role: "assistant",
          content: multiTemplatePermissionHistoryText(initial),
        },
      );
    }
    if (scenario.applicationAccess === "both-kubernetes-mixed-confirm") {
      const ownerAnswer = "Der Platform Service Account";
      state = applyMultiTemplatePermissionAnswers(context, state, ownerAnswer);
      history.push(
        { role: "user", content: ownerAnswer },
        {
          role: "assistant",
          content: multiTemplatePermissionHistoryText(
            buildMultiTemplatePermissionDialogue(context, state),
          ),
        },
      );
    }
  }
  if (scenario.id === "governance-folder-scope-followup") {
    const question = proposeAssistantAccess(
      values,
      {
        paths: ["rm_folders[*].reader_emails"],
        folderKeys: [],
        allFolders: false,
      },
      ["owner@example.test"],
    );
    history.push(
      {
        role: "user",
        content:
          "Nutze die hinterlegte Email fuer eine Folder-Leseberechtigung.",
      },
      {
        role: "assistant",
        content: `E-Mail-Quelle: den gespeicherten Grundlagen (owner_email) (owner@example.test).\n${question.explanation}\n${question.questions.map((q) => q.text).join("\n")}`,
      },
    );
  }
  if (scenario.fixture === "folder-naming")
    values["assistant.user_email"] = "login@example.test";
  if (scenario.gitCapacityRecommendation) {
    catalogues.regions[0]!.products.gitFlavors = {
      status: "available",
      totalOptions: 2,
      truncated: false,
      options: [
        { value: "git-10", label: "Git10" },
        { value: "git-100", label: "Git100" },
      ],
    };
  }

  return { draft, values, history, catalogues };
}

export function assistantExecutionLifecycleFailures(text: string) {
  const required = [
    ["pinned-source", /Revision|Quelle|Ausführungsstand|execution|version/i],
    [
      "same-order",
      /(?:derselb|dieselb|bestehend|gleich)[^.!?\n]{0,100}(?:Bestellung|Instanz|order)|(?:Bestellung|Instanz|order)[^.!?\n]{0,100}(?:beibehalten|erhalten|weiterverwend|remain|preserv)/i,
    ],
    ["state", /State|Zustandsdatei/i],
    [
      "fresh-plan",
      /(?:neu|frisch|fresh)[^.!?\n]{0,50}Plan|Plan[^.!?\n]{0,50}(?:neu|frisch|fresh)|(?:danach|anschließend)[^.!?\n]{0,35}separate[rn]? Plan[^.!?\n]{0,30}(?:erforderlich|nötig)/i,
    ],
    [
      "apply-approval",
      /Apply/i.test(text) &&
        /Freigabe|Zustimmung|genehmig|approval/i.test(text),
    ],
    ["withdrawal", /zurückgezog|withdrawn|gesperrt|withdrawal/i],
    [
      "source-states",
      /ursprüng|origin|template/i.test(text) &&
        /gewünscht|desired/i.test(text) &&
        /zuletzt|letzt(?:en|er|e)?|last applied/i.test(text) &&
        /erfolgreich|successful/i.test(text),
    ],
    [
      "no-reorder",
      /(?:keine?|nicht|niemals|never)[^.!?\n]{0,80}(?:neu bestell|Neubestellung|neue Bestellung|reorder)|(?:Neubestell(?:ung|en)|neu bestellen|neue Bestellung)[^.!?\n]{0,80}(?:nicht|unnötig)/i,
    ],
  ] as const;
  const failures = required
    .filter(([, rule]) =>
      typeof rule === "boolean" ? !rule : !rule.test(text),
    )
    .map(([name]) => `application_execution_missing_${name}`);
  for (const clause of text.split(/[.!?\n]+/)) {
    if (
      /lastApplied[^.!?\n]{0,90}(?:Basis|Grundlage)[^.!?\n]{0,30}Recovery|Plan[^.!?\n]{0,100}gegenüber lastApplied/i.test(
        clause,
      ) &&
      !/nicht|kein/i.test(clause)
    )
      failures.push("application_execution_confuses_state_with_last_applied");
    if (
      /(?:neu\w*|frisch\w*) Plan[^.!?]{0,50}(?:nicht (?:nötig|erforderlich|notwendig)|entfällt|optional)|(?:kein|ohne) (?:neuen?|frischen?) Plan (?:nötig|erforderlich|notwendig)/i.test(
        clause,
      )
    )
      failures.push("application_execution_denies_fresh_plan");
    if (
      /Apply[^.!?]{0,60}(?:keine?|ohne)[^.!?]{0,30}(?:Freigabe|Zustimmung|Genehmigung|approval)/i.test(
        clause,
      ) &&
      !/(?:nicht zulässig|nicht erlaubt|verboten|niemals|darf nicht)/i.test(
        clause,
      )
    )
      failures.push("application_execution_denies_apply_approval");
    if (
      /(?:zurückgezog|withdrawn|gesperrt)/i.test(clause) &&
      /(?:automatisch weiter|trotzdem ausführen|weiterlaufen|laufen[^.!?]{0,25}weiter)/i.test(
        clause,
      ) &&
      !/(?:nicht|niemals|keine?)[^.!?]{0,40}(?:weiter|automatisch|ausführ)/i.test(
        clause,
      )
    )
      failures.push("application_execution_runs_withdrawn_source");
    if (
      /\bState bleibt unverändert auf (?:dem|den) zuletzt erfolgreichen|(?:fehlgeschlagen|gescheitert)[^.!?\n]{0,45}Apply[^.!?\n]{0,40}(?:ändert|verändert)[^.!?\n]{0,20}(?:State|Zustand)[^.!?\n]{0,15}nicht/i.test(
        clause,
      )
    )
      failures.push("application_execution_promises_unchanged_failed_state");
    if (
      /ohne Datenverlust|verlustfrei/i.test(clause) &&
      !/nicht|keine?|niemals/i.test(clause)
    )
      failures.push("application_execution_promises_no_data_loss");
    if (
      /gewünscht[^.!?\n]{0,100}(?:aktuelle Konfiguration|rm_folders|owner_email|bearbeitbare[rn]? Plattformentwurf)/i.test(
        clause,
      ) &&
      !/nicht|kein/i.test(clause)
    )
      failures.push("application_execution_confuses_desired_source");
    if (
      /weiterhin manuell[^.!?\n]{0,80}(?:anwenden|Apply|ausführ)/i.test(
        clause,
      ) &&
      !/nicht|keine?|niemals/i.test(clause)
    )
      failures.push("application_execution_manual_withdrawal_bypass");
    if (
      /(?:ich|wir) (?:führe|führen|starte|starten|aktualisiere|aktualisieren|habe|haben)[^.!?]{0,100}(?:Upgrade|Ausführungsbindung)|(?:Chat|Assistent)[^.!?]{0,40}(?:führt|startet)[^.!?]{0,40}Upgrade/i.test(
        clause,
      ) &&
      !/(?:nicht|niemals|kein\w*)/i.test(clause)
    )
      failures.push("application_execution_claims_chat_upgrade");
  }
  return failures;
}

function sameApplicationAccessConfiguration(
  left: CommonConfiguration,
  right: CommonConfiguration,
) {
  const canonical = (draft: CommonConfiguration) => {
    const copy = structuredClone(draft);
    for (const template of copy.projectTemplates ?? []) {
      if (template.accessProfile?.mode !== "granular") continue;
      template.accessProfile.permissions.sort();
      template.accessProfile.automationPermissions.sort();
    }
    return copy;
  };
  return isDeepStrictEqual(canonical(left), canonical(right));
}

export function validateAssistantScenario(
  scenario: AssistantScenario,
  input: unknown,
) {
  const knowledge = buildAssistantKnowledge();
  const fixture = assistantScenarioFixture(scenario);
  const ownerEmails =
    fixture.values["assistant.platform_service_account_emails"];
  const userEmail = fixture.values["assistant.user_email"];
  const dialogue = validateDialogue(
    input,
    knowledge.rules.map((rule) => rule.id),
    {
      serviceAccountEmails: Array.isArray(ownerEmails)
        ? ownerEmails.filter(
            (email): email is string => typeof email === "string",
          )
        : [],
      ...(typeof userEmail === "string"
        ? { verifiedUserEmail: userEmail }
        : {}),
    },
  );
  const failures: string[] = [];
  if (scenario.id === "firewall-access-bootstrap-advice") {
    failures.push(...assistantFirewallBootstrapFailures(dialogue.explanation));
    if (dialogue.changes.length || dialogue.questions.length)
      failures.push("bootstrap_overview_unrequested_changes_or_questions");
  }
  if (scenario.dnsRole && scenario.dnsRole !== "draft")
    failures.push(
      ...assistantDnsRoleFailures(dialogue.explanation, scenario.dnsRole),
    );
  if (
    !(scenario.acceptableReferences ?? [scenario.topic]).some((reference) =>
      dialogue.references.includes(reference),
    )
  )
    failures.push("missing_topic_reference");
  if (scenario.executionLifecycle)
    failures.push(...assistantExecutionLifecycleFailures(dialogue.explanation));
  if (scenario.applicationUpgrade)
    failures.push(
      ...assistantApplicationUpgradeFailures(
        dialogue.explanation,
        scenario.applicationUpgrade,
      ),
    );
  if (scenario.id === "application-upgrade-self-service-advice")
    failures.push(...assistantUpgradePathPolicyFailures(dialogue.explanation));
  if (scenario.id === "devops-git-advice")
    failures.push(...assistantDevOpsDefaultFailures(dialogue.explanation));
  if (scenario.applicationAccess === "advice") {
    const text = dialogue.explanation.toLowerCase();
    for (const [name, pattern] of [
      ["granular", /granular/],
      ["owner-choice", /owner/],
      ["inherited", /geerbt|inherited|vererb/],
      ["automation", /automation|service.account/],
      ["vm-boundary", /vm|virtuelle|virtual machine/],
      ["project-key-scope", /projektweit|project.wide/],
      ["key-management", /schlüssel|key.management/],
    ] as const)
      if (!pattern.test(text))
        failures.push(`application_access_missing_${name}`);
    // This case asks for the VM profile. A correct explanation may compare it
    // with the workload profile, but must not pretend both presets have the
    // same rights. Check a real preset pair rather than requiring workload
    // counts in every VM answer.
    const presetCounts = (["workload", "vm"] as const).map((preset) => {
      const profile = defaultApplicationAccessProfile("", preset);
      return [profile.permissions.length, profile.automationPermissions.length];
    });
    if (
      !presetCounts.some((counts) =>
        counts.every((count) => new RegExp(`\\b${count}\\b`).test(text)),
      )
    )
      failures.push("application_access_missing_actual_preset_counts");
    if (/compute\.(?:instances|servers)|central\.initialowneremail/.test(text))
      failures.push("application_access_invented_contract");
    if (dialogue.changes.length)
      failures.push("application_access_advice_mutated");
  } else if (scenario.applicationAccess?.startsWith("both-kubernetes-mixed-")) {
    if (scenario.applicationAccess === "both-kubernetes-mixed-confirm") {
      const expected = structuredClone(fixture.draft);
      const additions = applicationProjectPermissionNames.filter((p) =>
        p.startsWith("ske."),
      );
      for (const template of expected.projectTemplates!) {
        if (template.kind === "corporate") {
          delete template.settings.automation_role;
          template.accessProfile = defaultApplicationAccessProfile(
            "bootstrap-platform@sa.stackit.cloud",
          );
        }
        if (template.accessProfile?.mode !== "granular") throw Error("fixture");
        template.accessProfile.initialOwnerEmail =
          "bootstrap-platform@sa.stackit.cloud";
        template.accessProfile.permissions = [
          ...new Set([...template.accessProfile.permissions, ...additions]),
        ];
        template.accessProfile.automationPermissions = [
          ...new Set([
            ...template.accessProfile.automationPermissions,
            ...additions,
          ]),
        ];
      }
      try {
        if (
          !dialogue.changes.length ||
          dialogue.questions.length ||
          !sameApplicationAccessConfiguration(
            applyAssistantChanges(fixture.draft, dialogue.changes),
            expected,
          )
        )
          failures.push("application_access_mixed_confirm_preservation_failed");
      } catch {
        failures.push("application_access_mixed_confirm_invalid");
      }
    } else {
      if (dialogue.changes.length)
        failures.push("application_access_legacy_unconfirmed_change");
      const owners = dialogue.questions.filter((q) =>
        /gemeinsamen zentralen initialen Owner/.test(q.text),
      );
      const legacy = dialogue.questions.filter((q) =>
        /Workload-Profil ersetzen/.test(q.text),
      );
      if (
        owners.length !==
          (scenario.applicationAccess === "both-kubernetes-mixed-owner"
            ? 0
            : 1) ||
        legacy.length !== 1 ||
        dialogue.questions.length !== owners.length + legacy.length
      )
        failures.push(
          "application_access_mixed_shared_owner_or_confirmation_missing",
        );
      if (
        !/Owner/.test(dialogue.explanation) ||
        !/Workload/.test(dialogue.explanation) ||
        /Welches Projekt-Rechteprofil/.test(
          dialogue.questions.map((q) => q.text).join(" "),
        )
      )
        failures.push("application_access_mixed_recommendation_missing");
    }
  } else if (scenario.applicationAccess?.startsWith("both-kubernetes")) {
    if (scenario.applicationAccess === "both-kubernetes-clarify") {
      if (
        dialogue.changes.length ||
        !dialogue.questions.some((q) =>
          ["central", "second-corporate"].every((key) =>
            q.options?.some((option) => option.includes(key)),
          ),
        )
      )
        failures.push("application_access_multi_target_not_clarified");
    } else {
      const expected = structuredClone(fixture.draft);
      const additions = applicationProjectPermissionNames.filter((p) =>
        p.startsWith("ske."),
      );
      for (const template of expected.projectTemplates ?? []) {
        if (template.key === "second-corporate") continue;
        const before = template.accessProfile;
        if (!before || before.mode !== "granular")
          throw new Error("expected granular multi-template fixture");
        template.accessProfile = {
          ...before,
          permissions: [...new Set([...before.permissions, ...additions])],
          automationPermissions: [
            ...new Set([...before.automationPermissions, ...additions]),
          ],
        };
      }
      try {
        if (
          !dialogue.changes.length ||
          !sameApplicationAccessConfiguration(
            applyAssistantChanges(fixture.draft, dialogue.changes),
            expected,
          )
        )
          failures.push(
            "application_access_multi_target_union_or_preservation_failed",
          );
        if (scenario.applicationAccess === "both-kubernetes-empty-owner") {
          if (
            dialogue.questions.length !== 1 ||
            !dialogue.questions.every((q) => /owner/i.test(q.text))
          )
            failures.push("application_access_missing_owner_not_clarified");
        } else if (dialogue.questions.length)
          failures.push("application_access_unnecessary_multi_target_question");
      } catch {
        failures.push("application_access_multi_target_proposal_invalid");
      }
    }
  } else if (scenario.applicationAccess === "public-kubernetes-clarify") {
    if (
      dialogue.changes.length ||
      dialogue.questions.length !== 1 ||
      !["central", "second-public"].every((key) =>
        dialogue.questions[0]?.options?.some((option) => option.includes(key)),
      )
    )
      failures.push("application_access_ambiguous_public_not_clarified");
  } else if (scenario.applicationAccess) {
    const expected = structuredClone(fixture.draft);
    const central = expected.projectTemplates?.find((x) => x.key === "central");
    if (!central) throw new Error("application_access_fixture_missing");
    central.accessProfile =
      scenario.applicationAccess === "owner"
        ? { schemaVersion: 1, mode: "owner" }
        : scenario.applicationAccess === "vm-default" ||
            scenario.applicationAccess === "workload-default"
          ? defaultApplicationAccessProfile(
              "platform-owner@example.test",
              scenario.applicationAccess === "vm-default" ? "vm" : "workload",
            )
          : {
              schemaVersion: 1,
              mode: "granular",
              initialOwnerEmail: "platform-owner@example.test",
              permissions: ["iaas.server.get", "resource-manager.project.get"],
              automationPermissions: ["iaas.server.get"],
            };
    if (scenario.applicationAccess === "server-operations") {
      const before = fixture.draft.projectTemplates?.find(
        (t) => t.key === "central",
      )?.accessProfile;
      if (!before || before.mode !== "granular")
        throw Error("missing server operations profile");
      const additions = applicationProjectPermissionNames.filter((name) =>
        /^(server-backup|server-update|run-command)\./.test(name),
      );
      central.accessProfile = {
        ...before,
        permissions: [...new Set([...before.permissions, ...additions])],
        automationPermissions: [
          ...new Set([...before.automationPermissions, ...additions]),
        ],
      };
    }
    if (scenario.applicationAccess === "key-management") {
      const before = fixture.draft.projectTemplates?.find(
        (t) => t.key === "central",
      )?.accessProfile;
      if (!before || before.mode !== "granular")
        throw Error("missing historical key-management profile");
      central.accessProfile = {
        ...before,
        permissions: [
          ...new Set([
            ...before.permissions,
            ...applicationProjectPermissionNames.filter((name) =>
              applicationServiceAccountKeyPermissions.includes(name),
            ),
          ]),
        ],
      };
    }
    if (scenario.applicationAccess === "literal-append") {
      const previous = fixture.draft.projectTemplates?.find(
        (t) => t.key === "central",
      )?.accessProfile;
      if (!previous || previous.mode !== "granular")
        throw new Error("expected granular append fixture");
      central.accessProfile = {
        ...previous,
        permissions: [...previous.permissions, "iaas.server.delete"],
        automationPermissions: [
          ...previous.automationPermissions,
          "resource-manager.project.get",
        ],
      };
    }
    if (
      scenario.applicationAccess === "kubernetes-add" ||
      scenario.applicationAccess === "kubernetes-requester" ||
      scenario.applicationAccess === "public-kubernetes-incomplete-owner" ||
      scenario.applicationAccess === "public-kubernetes-requester" ||
      scenario.applicationAccess === "public-kubernetes-followup"
    ) {
      const before = fixture.draft.projectTemplates?.find(
        (t) => t.key === "central",
      )?.accessProfile;
      if (!before || before.mode !== "granular")
        throw new Error("expected granular fixture");
      const additions = applicationProjectPermissionNames.filter((p) =>
        p.startsWith("ske."),
      );
      central.accessProfile = {
        ...before,
        permissions:
          scenario.applicationAccess === "public-kubernetes-incomplete-owner" ||
          scenario.applicationAccess === "public-kubernetes-requester" ||
          scenario.applicationAccess === "public-kubernetes-followup"
            ? [...new Set([...before.permissions, ...additions])]
            : [...new Set([...before.permissions, ...additions])].sort(),
        automationPermissions:
          scenario.applicationAccess === "kubernetes-requester" ||
          scenario.applicationAccess === "public-kubernetes-incomplete-owner" ||
          scenario.applicationAccess === "public-kubernetes-requester" ||
          scenario.applicationAccess === "public-kubernetes-followup"
            ? before.automationPermissions
            : [
                ...new Set([...before.automationPermissions, ...additions]),
              ].sort(),
      };
    }
    try {
      const candidate = applyAssistantChanges(fixture.draft, dialogue.changes);
      if (
        !dialogue.changes.length ||
        dialogue.questions.length ||
        !sameApplicationAccessConfiguration(candidate, expected)
      )
        failures.push(
          "application_access_proposal_incorrect_or_unrelated_change",
        );
    } catch {
      failures.push("application_access_proposal_invalid");
    }
  }
  if (scenario.corporateIpv4 === "advice") {
    failures.push(...assistantCorporateIpv4Failures(dialogue.explanation));
    if (dialogue.changes.length)
      failures.push("corporate_ipv4_advice_mutated_draft");
    if (dialogue.questions.length)
      failures.push("corporate_ipv4_automatic_requested_numeric_size");
  } else if (scenario.corporateIpv4) {
    const expected = structuredClone(fixture.draft);
    const central = expected.projectTemplates?.find(
      (entry) => entry.key === "central",
    );
    if (!central) throw new Error("corporate_ipv4_fixture_missing");
    central.settings.network_prefix_length =
      scenario.corporateIpv4 === "automatic" ? null : 26;
    try {
      const candidate = applyAssistantChanges(fixture.draft, dialogue.changes);
      if (
        !dialogue.changes.length ||
        dialogue.questions.length ||
        !isDeepStrictEqual(candidate, expected)
      )
        failures.push("corporate_ipv4_proposal_incorrect_or_unrelated_change");
    } catch {
      failures.push("corporate_ipv4_proposal_invalid");
    }
  }
  if (scenario.templateExpected) {
    if (
      !dialogue.changes.length ||
      dialogue.changes.some(
        (change) =>
          change.path !== "projectTemplates" ||
          !["merge", "replace"].includes(change.operation ?? ""),
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
  if (scenario.requirementsQuestion) {
    const presented = enrichCatalogueQuestions(
      dialogue,
      fixture.values,
      fixture.catalogues,
      scenario.expectedLanguage ?? "de",
    );
    const question = presented.questions.find(
      (question) => question.path === scenario.requirementsQuestion,
    );
    if (
      dialogue.changes.length ||
      !question ||
      question.answerType !== "requirements" ||
      question.catalogue ||
      !question.options?.length
    )
      failures.push("business_requirements_replaced_by_technical_picker");
  }
  if (scenario.answeredCatalogueChoice) {
    if (
      dialogue.changes.length ||
      dialogue.questions.some(
        (question) => question.path === scenario.answeredCatalogueChoice!.path,
      ) ||
      !dialogue.explanation.includes(scenario.answeredCatalogueChoice.value)
    )
      failures.push("answered_service_choice_lost_or_repeated");
  }
  if (scenario.catalogueQuestion) {
    if (
      /\b\d+(?:[.,]\d+)?\s*(?:v?CPU|GB|GiB|MB|MiB|Mbit|Gbit)\b/i.test(
        dialogue.explanation +
          dialogue.questions
            .map(
              (question) => question.text + (question.options ?? []).join(" "),
            )
            .join(" "),
      )
    )
      failures.push("unprovided_catalogue_performance_claim");
    const presented = enrichCatalogueQuestions(
      dialogue,
      fixture.values,
      fixture.catalogues,
      scenario.expectedLanguage ?? "de",
    );
    const question = presented.questions.find(
      (question) => question.path === scenario.catalogueQuestion!.path,
    );
    if (
      dialogue.changes.length ||
      !question?.catalogue ||
      question.catalogue.status !== "available" ||
      question.catalogue.options.length !== 3
    )
      failures.push("catalogue_choice_not_presented_without_changes");
    if (
      question &&
      question.catalogue?.options.some(
        (option) =>
          !fixture.catalogues.regions[0]?.products[
            scenario.catalogueQuestion!.field
          ]?.options.some((known) => known.value === option.value),
      )
    )
      failures.push("catalogue_choice_not_grounded");
  }
  if (scenario.sourceGuidance) {
    const text =
      dialogue.explanation +
      " " +
      dialogue.questions.map((q) => q.text).join(" ");
    if (dialogue.changes.length) failures.push("advice_changed_configuration");
    const required =
      scenario.sourceGuidance === "git-user-limit"
        ? [
            /100/,
            /(?:separate|multiple|project|team)/i,
            /(?:limit|maximum|up to|exceed|cannot|not support)/i,
          ]
        : scenario.sourceGuidance === "project-git"
          ? [
              /git/i,
              /(?:enabled|activat|opt.in|optional)/i,
              /(?:flavor|plan|size)/i,
              /(?:acl|source|allowlist)/i,
              /(?:public|not private|does not.*private)/i,
            ]
          : [
              /(?:postgres|database)/i,
              /(?:CLI|single.writer|one.writer|organizational)/i,
              /(?:conditional|lockfile)/i,
              /(?:no .{0,45}(?:date|schedule|timeline)|not .{0,45}(?:scheduled|announced)|unscheduled)/i,
            ];
    if (required.some((fact) => !fact.test(text)))
      failures.push("documented_service_boundary_missing");
    if (
      scenario.sourceGuidance === "git-user-limit" &&
      /(?:Git100|single instance).{0,35}(?:supports|handles|allows) 250/i.test(
        text,
      )
    )
      failures.push("git_user_limit_exceeded");
    if (
      scenario.sourceGuidance === "git-user-limit" &&
      /multiple central Git instances[\s\S]{0,160}(?:root devops|devops object)/i.test(
        text,
      )
    )
      failures.push("git_central_instance_cardinality_invented");
  }
  if (scenario.sourceGuidance === "project-git") {
    const text = dialogue.explanation;
    if (
      /(?:flavor.{0,80}(?:must be|choosing|set to|=)[^\n]{0,40}["'`]Git(?:10|100)["'`]|`git\.flavor`[^\n]{0,35}`Git(?:10|100)`)/i.test(
        text,
      )
    )
      failures.push("git_display_label_used_as_flavor");
    if (
      /private (?:reachability|access) requires.{0,100}(?:dedicated|separate).{0,50}(?:Git instance|project)/i.test(
        text,
      )
    )
      failures.push("project_git_private_attachment_invented");
  }
  if (scenario.expectedLanguage) {
    const text =
      dialogue.explanation +
      " " +
      dialogue.questions.map((question) => question.text).join(" ");
    if (
      scenario.expectedLanguage === "en" &&
      /\b(?:Welche|Welchen|Noch nichts|Bitte beantworte|gespeichert|Vorschlag|Entwurf|Gemäß|Benutzer|Instanz|Einstellungen|standardmäßig|Datenbank)\b/.test(
        text,
      )
    )
      failures.push("dialogue_language_mismatch");
    if (
      scenario.expectedLanguage === "de" &&
      /\b(?:Which|Nothing has|Please complete)\b/.test(text)
    )
      failures.push("dialogue_language_mismatch");
  }
  if (scenario.id.startsWith("editor-devops-over-capacity")) {
    if (
      dialogue.changes.length ||
      !/100/.test(dialogue.explanation) ||
      !/(?:separate|separat|getrennt)/i.test(dialogue.explanation) ||
      !/(?:per instance|pro Instanz)/i.test(dialogue.explanation)
    )
      failures.push("git_instance_user_limit_or_architecture_missing");
    if (
      dialogue.questions.some(
        (question) => question.answerType !== "requirements",
      ) ||
      /(?:I recommend Git100 as|empfehle ich Git100)/i.test(
        dialogue.explanation,
      )
    )
      failures.push("git_over_capacity_must_clarify_topology_before_flavor");
  }
  if (scenario.nativeDefaultExpected || scenario.nativeDefaultResetPath) {
    const before = compileCommonConfiguration(fixture.draft);
    const after = compileCommonConfiguration(
      applyAssistantChanges(fixture.draft, dialogue.changes),
    );
    const at = (value: JsonValue | undefined, path: string) =>
      path
        .split(".")
        .reduce<JsonValue | undefined>(
          (value, key) => objectValue(value)[key],
          value,
        );
    if (!dialogue.changes.length || dialogue.questions.length)
      failures.push("native_default_not_completed");
    if (
      scenario.nativeDefaultExpected &&
      !isDeepStrictEqual(
        at(after, scenario.nativeDefaultExpected.path),
        scenario.nativeDefaultExpected.value,
      )
    )
      failures.push("actual_native_default_not_proposed");
    if (scenario.nativeDefaultResetPath) {
      if (at(after, scenario.nativeDefaultResetPath) != null)
        failures.push("native_override_not_reset");
      const omit = (value: Record<string, JsonValue>) => {
        const copy = structuredClone(value);
        const keys = scenario.nativeDefaultResetPath!.split(".");
        const last = keys.pop()!;
        const parent = keys.reduce<JsonValue | undefined>(
          (value, key) => objectValue(value)[key],
          copy,
        );
        delete objectValue(parent)[last];
        return copy;
      };
      if (!isDeepStrictEqual(omit(before), omit(after)))
        failures.push("native_reset_changed_unrelated_values");
    }
    if (scenario.nativeDefaultExpected) {
      const omit = (value: Record<string, JsonValue>) => {
        const copy = structuredClone(value);
        delete copy.devops;
        return copy;
      };
      if (!isDeepStrictEqual(omit(before), omit(after)))
        failures.push("git_default_changed_platform_context");
    }
  }
  if (scenario.gitCapacityRecommendation && !scenario.nativeDefaultExpected) {
    failures.push(
      ...assistantGitCapacityRecommendationFailures(
        dialogue.explanation,
        scenario.gitCapacityRecommendation.users,
        scenario.gitCapacityRecommendation.flavor,
        dialogue.recommendations,
      ),
    );
    if (dialogue.questions.some((q) => q.path === "devops.git_flavor"))
      failures.push("git_confirmed_size_reasked");
  }
  if (scenario.setupQuestionPaths) {
    if (
      dialogue.changes.length ||
      !dialogue.questions.length ||
      dialogue.questions.some(
        (question) => !scenario.setupQuestionPaths!.includes(question.path),
      )
    )
      failures.push("setup_must_ask_missing_choices_without_changes");
    if (
      dialogue.questions.some(
        (question) =>
          (question.options?.length ?? 0) < 2 ||
          /(?:leave|leaving).*empty.*allow|192\.168|10\.0\.0/i.test(
            question.text,
          ),
      )
    )
      failures.push("setup_missing_useful_grounded_choices");
    if (
      scenario.id === "editor-devops-company-standard" &&
      !/Git100/.test(dialogue.explanation)
    )
      failures.push("company_git_recommendation_missing");
    return { dialogue, failures };
  }
  if (scenario.auditQuestionPaths) {
    if (
      dialogue.changes.length ||
      !isDeepStrictEqual(
        dialogue.questions.map((q) => q.path),
        scenario.auditQuestionPaths,
      )
    )
      failures.push("audit_unanswered_decisions_not_preserved");
    if (
      dialogue.questions.some(
        (q) => q.path === "audit_logs.acl" && (q.options?.length ?? 0) > 0,
      )
    )
      failures.push("audit_invented_network_options");
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
      if (scenario.topic === "observability") {
        const settings = objectValue(
          compileCommonConfiguration(candidate).observability,
        );
        if (
          settings.logs_retention_days != null ||
          settings.traces_retention_days != null
        )
          failures.push("unrequested_logs_or_traces_retention");
        if (
          scenario.id === "editor-monitoring-retention" &&
          settings.plan_name !== "Observability-Monitoring-Medium-EU01"
        )
          failures.push("monitoring_plan_changed");
      }
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
      !dialogue.explanation.includes("wird derzeit nicht unterstützt") ||
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
        (change) =>
          change.path !== `connectivity.${firewallKey}` &&
          !change.path.startsWith(`connectivity.${firewallKey}.`),
      )
    )
      failures.push("firewall_wrong_native_form");
    if (
      scenario.id !== "firewall-metro-ha-only" &&
      (!dialogue.explanation.includes("512 /25-Subnetze") ||
        !dialogue.explanation.includes("128 Adressen"))
    )
      failures.push("firewall_incorrect_sna_capacity");
    if (scenario.fixture === "firewall-metro") {
      const appliance = objectValue(network.firewall);
      const ha = objectValue(appliance.ha);
      if (
        scenario.id === "firewall-metro-ha-only" &&
        !isDeepStrictEqual(ha, { backup_zone: "eu01-2", vhid: 1 })
      )
        failures.push("firewall_requested_ha_not_applied");
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
    if (
      ["governance-folder-reader", "governance-folder-scope-followup"].includes(
        scenario.id,
      )
    )
      expected = {
        rm_folders: {
          platform: {
            reader_emails: [
              "folder-reader@example.test",
              scenario.id === "governance-folder-scope-followup"
                ? "owner@example.test"
                : "reader@example.test",
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
  if (scenario.platformImpactReview)
    failures.push(
      ...assistantPlatformImpactReviewFailures(dialogue.explanation),
    );
  if (
    scenario.requiredOverviewFields?.some(
      (field) => !dialogue.explanation.toLowerCase().includes(field),
    )
  )
    failures.push("incomplete_native_field_overview");
  if (scenario.requiredOverviewFields && dialogue.questions.length)
    failures.push("native_field_overview_asked_setup_questions");
  if (
    scenario.id === "platform-kubernetes-advice" &&
    (!/kubeconfig|kube_config/i.test(dialogue.explanation) ||
      !/separat|geschützt|protected|secure binding/i.test(
        dialogue.explanation,
      ) ||
      !/(?:niemals|nicht|keine?|never|do not)[^.!?\n]*chat/i.test(
        dialogue.explanation,
      ) ||
      !/erreichbarkeit|reachability/i.test(dialogue.explanation) ||
      !/prüf|pruef|verif|check/i.test(dialogue.explanation))
  )
    failures.push("incomplete_platform_kubernetes_boundaries");
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
    scenario.id === "vpn-advice" &&
    (!/\bnull\b/.test(dialogue.explanation) ||
      !/\bROUTE_BASED\b/.test(dialogue.explanation) ||
      !/\bp100\b/.test(dialogue.explanation) ||
      !dialogue.explanation.includes("TF_VAR_vpn_pre_shared_keys"))
  )
    failures.push("incomplete_native_vpn_contract");
  if (
    scenario.id === "vpn-advice" &&
    /routing_type[^.!?\n]*(?:static\s*(?:\/|oder|or|und|and)\s*dynamic|dynamic\s*(?:\/|oder|or|und|and)\s*static)/i.test(
      dialogue.explanation,
    )
  )
    failures.push("incorrect_vpn_routing_type");
  if (
    scenario.id === "firewall-policy-advice" &&
    (!["pass", "block", "reject"].every((action) =>
      dialogue.explanation.toLowerCase().includes(action),
    ) ||
      !/synchron|sync/i.test(dialogue.explanation))
  )
    failures.push("incomplete_policy_contract");
  if (scenario.fixture === "folder-naming") {
    const before = compileCommonConfiguration(fixture.draft);
    const folderChange = dialogue.changes.find(
      ({ path }) => path === "rm_folders",
    );
    const names = objectValue(
      folderChange?.value as Parameters<typeof objectValue>[0],
    );
    const prefix =
      scenario.id === "governance-prefixed-folders-followup"
        ? "syn"
        : dialogue.changes.find(({ path }) => path === "company_code")?.value;
    const keys = Object.keys(objectValue(before.rm_folders));
    if (
      typeof prefix !== "string" ||
      !prefix ||
      !isDeepStrictEqual(Object.keys(names).sort(), keys.sort()) ||
      keys.some(
        (key) =>
          typeof objectValue(names[key]).name !== "string" ||
          !String(objectValue(names[key]).name)
            .toLowerCase()
            .startsWith(prefix.toLowerCase()),
      )
    )
      failures.push("prefixed_folder_names_missing");
    if (
      keys.some(
        (key) =>
          !dialogue.explanation.includes(String(objectValue(names[key]).name)),
      )
    )
      failures.push("folder_names_not_visible_in_explanation");
    if (!dialogue.explanation.includes("Folder names:"))
      failures.push("folder_proposal_not_in_english");
    const candidate = compileCommonConfiguration(
      applyAssistantChanges(fixture.draft, dialogue.changes),
    );
    if (
      keys.some(
        (key) =>
          !isDeepStrictEqual(
            objectValue(objectValue(candidate.rm_folders)[key]),
            {
              ...objectValue(objectValue(before.rm_folders)[key]),
              ...objectValue(names[key]),
            },
          ),
      )
    )
      failures.push("folder_metadata_changed");
    if (
      scenario.id === "governance-prefixed-folders-followup" &&
      dialogue.changes.some(({ path }) => path !== "rm_folders")
    )
      failures.push("folder_followup_changed_unrequested_foundations");
    if (
      scenario.id === "foundations-prefixed-folders" &&
      !dialogue.changes.some(
        ({ path, value }) =>
          path === "company_name" && value === "Synthetic Corp",
      )
    )
      failures.push("combined_company_proposal_missing");
  }
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
  if (scenario.dnsRole === "draft") {
    const candidate = applyAssistantChanges(fixture.draft, dialogue.changes);
    const before = compileCommonConfiguration(fixture.draft);
    const after = compileCommonConfiguration(candidate);
    const network = objectValue(after.connectivity);
    const zones = objectValue(network.dns_zones);
    const company = objectValue(zones.company);
    if (
      company.dns_name !== "new-company.stackit.gg" ||
      (company.type ?? "primary") !== "primary" ||
      company.contact_email !== "owner@example.test" ||
      !isDeepStrictEqual(Object.keys(zones).sort(), ["company", "example"]) ||
      dialogue.questions.length
    )
      failures.push("dns_company_primary_zone_missing");
    const previousNetwork = objectValue(before.connectivity);
    if (
      !isDeepStrictEqual(
        zones.example,
        objectValue(previousNetwork.dns_zones).example,
      ) ||
      !isDeepStrictEqual(
        { ...after, connectivity: { ...network, dns_zones: undefined } },
        {
          ...before,
          connectivity: { ...previousNetwork, dns_zones: undefined },
        },
      )
    )
      failures.push("dns_unrelated_configuration_changed");
  }
  if (scenario.fixture.startsWith("dns-") && !scenario.dnsRole) {
    const contact =
      scenario.fixture === "dns-owner"
        ? "owner@example.test"
        : "login@example.test";
    const candidate = compileCommonConfiguration(
      applyAssistantChanges(fixture.draft, dialogue.changes),
    );
    const zone = objectValue(
      objectValue(objectValue(candidate.connectivity).dns_zones).example,
    );
    if (
      typeof zone.name !== "string" ||
      !zone.name ||
      typeof zone.description !== "string" ||
      !zone.description ||
      zone.contact_email !== contact ||
      zone.default_ttl !== 3600
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
    if (
      !/noch (?:nichts|nicht) gespeichert|no(?:thing| changes?) (?:has|have) been saved|then save the configuration/i.test(
        dialogue.explanation,
      )
    )
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

export function assistantDevOpsDefaultFailures(explanation: string) {
  const sentences = explanation.toLowerCase().split(/\n+|(?<=[.!?])\s+/);
  const failures: string[] = [];
  if (
    !/\bnull\b/.test(explanation.toLowerCase()) ||
    !sentences.some(
      (sentence) =>
        /kein|nicht|no |not |deaktiv|disabled/.test(sentence) &&
        /git|instan/.test(sentence),
    )
  )
    failures.push("devops_null_default_no_instance_missing");
  if (
    sentences.some(
      (sentence) =>
        /\bgit-\d+\b/.test(sentence) &&
        /standard|default/.test(sentence) &&
        !/kein|nicht|not |no |beispiel|illustrat/.test(sentence),
    )
  )
    failures.push("devops_enabled_flavor_default_invented");
  return failures;
}

export function assistantDnsRoleFailures(
  explanation: string,
  mode: "roles" | "secondary",
) {
  const sentences = explanation
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/\n+|(?<=[.!?])\s+/);
  const authority = /autoritat|authoritat/;
  const failures: string[] = [];
  if (
    sentences.some(
      (sentence) =>
        /secondary/.test(sentence) &&
        /(?:nicht|kein|not|non)[^.!?]{0,30}(?:autoritat|authoritat)/.test(
          sentence,
        ),
    )
  )
    failures.push("dns_secondary_authority_denied");
  if (
    !sentences.some(
      (sentence) =>
        /secondary/.test(sentence) &&
        /repli[zk]|kopie|copy|replic|ubernehm|ubernimm/.test(sentence),
    )
  )
    failures.push("dns_secondary_role_missing");
  if (
    !sentences.some(
      (sentence) =>
        /accelerator|modul|native/.test(sentence) &&
        /secondary|primary|primar|server/.test(sentence) &&
        /nicht|kein|fehl|unvollstandig|not |unsupported|absent/.test(sentence),
    )
  )
    failures.push("dns_secondary_limit_missing");
  if (mode === "secondary") return failures;
  if (
    !sentences.some(
      (sentence) =>
        /primary/.test(sentence) &&
        /fuhrend|verwal|pfleg|original|bearbeit|manage|edit/.test(sentence),
    )
  )
    failures.push("dns_primary_role_missing");
  if (
    !sentences.some(
      (sentence) => /beide|both/.test(sentence) && authority.test(sentence),
    ) &&
    !["primary", "secondary"].every((role) =>
      sentences.some(
        (sentence) => sentence.includes(role) && authority.test(sentence),
      ),
    )
  )
    failures.push("dns_authority_explanation_missing");
  if (
    !sentences.some(
      (sentence) =>
        /public|private|offentlich|privat|sichtbarkeit|visibility/.test(
          sentence,
        ) && /nicht|kein|unabhangig|not |independent/.test(sentence),
    )
  )
    failures.push("dns_visibility_role_confused");
  if (
    !sentences.some(
      (sentence) =>
        /primary/.test(sentence) &&
        /empfehl|geeignet|wahl|recommend|neue|new /.test(sentence),
    )
  )
    failures.push("dns_primary_recommendation_missing");
  return failures;
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
    [
      "assistant-scenarios.ts",
      "assistant-tests.ts",
      "assistant-test-model.ts",
    ].map((file) => [
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
      fields: knowledge.fields
        .filter((field) =>
          (topic.fieldPaths as readonly string[]).includes(field.path),
        )
        .map((field) => ({ ...field, catalogue: catalogueField(field.path) })),
      cases: assistantScenarios
        .filter((scenario) => scenario.topic === topic.id)
        .map((scenario) => ({
          ...scenario,
          assertions: [
            "valid_dialogue",
            "reviewed_topic_reference",
            ...(scenario.dnsRole
              ? [
                  scenario.dnsRole === "draft"
                    ? "primary_company_zone_preserves_existing_configuration"
                    : "dns_role_meaning_and_native_secondary_limit",
                ]
              : []),
            ...(scenario.executionLifecycle
              ? [
                  "pinned_source_same_order_state_fresh_plan_approval_withdrawal_no_reorder",
                ]
              : []),
            ...(scenario.applicationUpgrade === "template"
              ? [
                  "published_same_family_path_retained_answers_same_state_fresh_plan_separate_apply_destructive_block",
                ]
              : scenario.applicationUpgrade === "platform"
                ? [
                    "shared_effect_dependency_gate_before_apply_actual_contract_after_apply",
                  ]
                : []),
            ...(scenario.nativeDefaultExpected ||
            scenario.nativeDefaultResetPath
              ? [
                  "actual_native_default_completed_without_reasking_preserving_context",
                ]
              : []),
            ...(scenario.gitCapacityRecommendation
              ? [
                  "reviewed_git_plan_fits_confirmed_user_count_without_reasking_size",
                ]
              : []),
            ...(scenario.platformImpactReview
              ? [
                  "root_platform_owner_impact_decision_artifact_state_dependencies_fresh_plan_separate_apply",
                ]
              : []),
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

/** Bounded factual regression, not a proof of universal advice quality. */
export function assistantCorporateIpv4Failures(explanation: string): string[] {
  const failures: string[] = [];
  const text = explanation
    .toLowerCase()
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "<ip>")
    // These common prose abbreviations do not terminate the DNS sentence.
    // Keep real sentence boundaries and dotted identifiers unchanged.
    .replace(
      /(?<![\p{L}\p{N}_.-])z\.\s*b\.(?![\p{L}\p{N}_.-])/gu,
      "zum beispiel",
    )
    .replace(
      /(?<![\p{L}\p{N}_.-])e\.\s*g\.(?![\p{L}\p{N}_.-])/gu,
      "for example",
    );
  const unnegatedClaim = (pattern: RegExp, coordinatedNegation = false) =>
    [...text.matchAll(pattern)].some((match) => {
      let claim = match[0];
      if (coordinatedNegation) {
        // Bind negation to this assertion's final modal, not an earlier correct
        // clause. In particular, "weder" alone never cancels a bad claim.
        const modal = [
          ...claim.matchAll(/\b(?:musst?|must|zwingend erforderlich)\b/g),
        ].at(-1);
        if (modal) {
          const start = match.index + modal.index;
          claim = claim.slice(modal.index);
          const scope =
            text
              .slice(start, start + 240)
              .split(
                /,(?!\s*noch\b)|[.!?;:\n]|\s[-–—]\s|\b(?:aber|jedoch|sondern|dennoch|trotzdem|but|however)\b/,
              )[0] ?? "";
          const pair =
            /^musst?\s+weder\b(?:(?!\bnoch\b)[^,.!?;:–—\n]){1,100},?\s*\bnoch\b(?:(?!\b(?:und|and|sowie)\b)[^,.!?;:–—\n]){0,100}/.exec(
              scope,
            );
          const claimEnd = match.index + match[0].length;
          if (
            pair &&
            claimEnd > start + scope.indexOf("weder") &&
            claimEnd <= start + pair[0].length
          )
            return false;
          // A later contrasting/independent clause cannot inherit any negation.
          claim =
            claim
              .split(
                /[;\n]|\b(?:aber|jedoch|sondern|dennoch|trotzdem|but|however)\b/,
              )
              .at(-1) ?? claim;
        }
      }
      return !/\b(?:nicht|not|never|kein\w*)\b/.test(claim);
    });
  if (
    !/automat/.test(text) ||
    !/sna|network area/.test(text) ||
    !/standard|default/.test(text) ||
    !/28/.test(text) ||
    !/übern|uebern|erbt|inherit|lies|liest|read|abfrag/.test(text)
  )
    failures.push("corporate_ipv4_automatic_inheritance_missing");
  if (
    !/dns|nameserver/.test(text) ||
    !/präfix|praefix|prefix/.test(text) ||
    !/provider/.test(text) ||
    !/explizit|explicit|numerisch|numeric/.test(text)
  )
    failures.push("corporate_ipv4_provider_dependency_missing");
  // German separable "beibehalten" also appears as "behält DNS ... bei".
  // Require the DNS object and particle in the same sentence, without negation.
  const keepsDns = [
    ...text.matchAll(/\b(?:behält|behaelt)\b[^.!?]*\bdns\b[^.!?]*\bbei\b/g),
  ].some((match) => !/\b(?:nicht|kein\w*)\b/.test(match[0]));
  if (
    !keepsDns &&
    !/dns[^.!?]*(?:erhalt|unverändert|unveraendert|beibeh|beibe|retain|preserv|bleibt aktiv)|(?:erhalt|beibeh|beibe|unverändert|unveraendert|retain|preserv)[^.!?]*dns/.test(
      text,
    )
  )
    failures.push("corporate_ipv4_dns_preservation_missing");
  if (
    !/kein[^.!?]*(?:garant|kapaz|verfügbar|verfuegbar|frei)|nicht[^.!?]*(?:garant|frei)|no[^.!?]*(?:guarantee|free)|nicht garantiert/.test(
      text,
    )
  )
    failures.push("corporate_ipv4_capacity_boundary_missing");
  if (
    unnegatedClaim(
      /(?:du musst|you must|zwingend erforderlich)[^.!?]{0,45}\/24|dns[^.!?]{0,35}(?:muss|must)[^.!?]{0,30}(?:ab(?:ge)?schalt|deaktiv|disable)/g,
      true,
    )
  )
    failures.push("corporate_ipv4_invented_fixed_size_or_dns_removal");
  if (
    unnegatedClaim(
      /null[^.!?]{0,90}(?:ohne|fehlend)[^.!?]{0,45}dns[^.!?]{0,70}(?:ablehn|lehnt[^.!?]{0,35}ab|ungueltig|ungültig)|provider[^,.;!?]{0,30}(?:liest|reads)[^.!?]{0,80}sna[^.!?]{0,20}/g,
    )
  )
    failures.push("corporate_ipv4_failure_condition_inverted");
  if (
    /provider[- ]?upgrade[^.!?]{0,70}(?:behob|gelöst|geloest|fix)|(?:provider[^.!?]{0,45}(?:vor|before)\s+0\.114)|(?:älteren versionen des providers|aelteren versionen des providers)[^.!?]{0,60}0\.114|(?:accelerator\s*\(version|accelerator\s*\(ab version)[^.!?]{0,20}0\.114/.test(
      text.replace(
        /nicht\s+durch\s+(?:ein(?:en)?\s+)?provider[- ]?upgrade/g,
        "<denied upgrade>",
      ),
    )
  )
    failures.push("corporate_ipv4_invented_provider_upgrade");
  return failures;
}

/** Factual upgrade boundaries: refusal of execution alone is insufficient. */
export function assistantApplicationUpgradeFailures(
  text: string,
  kind: "template" | "platform",
): string[] {
  const checks: [string, RegExp][] =
    kind === "template"
      ? [
          [
            "published-path",
            /veröffentlich|freigegeben.*Pfad|Platform Owner.*Pfad/is,
          ],
          ["same-state", /State|Zustand/i],
          ["retained-answers", /Antwort|Parameter/i],
          [
            "fresh-plan",
            /(?:neu|frisch|new|fresh)[^.!?\n]{0,40}Plan|Plan[^.!?\n]{0,40}(?:neu|frisch|new|fresh)/i,
          ],
          ["separate-apply", /Apply/i],
          [
            "destructive-block",
            /(?:Lösch|Ersetz|destruktiv)[^.!?\n]{0,100}(?:sperr|block|verhind|unzulässig|nicht erlaubt)|(?:sperr|block|verhind)[^.!?\n]{0,100}(?:Lösch|Ersetz|destruktiv)/i,
          ],
        ]
      : [
          ["shared-effect", /gemeinsam|alle.*Application|abhängig/is],
          ["dependency-check", /Abhängig|Auswirk|impact/i],
          ["plan-approval", /Plan/i],
          [
            "actual-contract",
            /(?:tatsächlich|erfolgreich|entstand)[^.!?\n]{0,100}(?:Vertrag|contract)|(?:Vertrag|contract)[^.!?\n]{0,100}(?:tatsächlich|erfolgreich|entstand)/i,
          ],
          ["published-path", /veröffentlich|freigegeben[^.!?\n]{0,60}Pfad/i],
          [
            "explicit-binding",
            /keine automatische[^.!?\n]{0,40}(?:Bindung|Übernahme)|(?:Vertragsbindung|Bindung|Vertrag)[^.!?\n]{0,100}(?:nicht automatisch|explizit|ausdrücklich)|(?:Besteller|Application.?Owner)[^.!?\n]{0,100}(?:übernimmt|übernehmen|bestätigt|bestätigen)[^.!?\n]{0,80}(?:explizit|ausdrücklich|bewusst)/i,
          ],
        ];
  const failures = checks
    .filter(([, pattern]) => !pattern.test(text))
    .map(([code]) => `application_upgrade_missing_${code}`);
  if (
    /Checkbox[^.!?\n]{0,80}(?:umgeh|trotzdem)|alte Firewall behalten[^.!?\n]{0,30}kannst/i.test(
      text,
    ) &&
    !/nicht|kein|niemals/i.test(text)
  )
    failures.push("application_upgrade_unsafe_bypass");
  return failures;
}

/** Bootstrap workflow metadata must explain boundaries without requesting secrets. */
export function assistantFirewallBootstrapFailures(text: string): string[] {
  const failures: string[] = [];
  for (const field of [
    "firewall_admin_username",
    "firewall_admin_password",
    "firewall_api_credentials",
    "firewall_bootstrap",
    "firewall_api_secret_version",
    "firewall_bootstrap_username",
    "firewall_bootstrap_password",
  ])
    if (!text.includes(field))
      failures.push(`bootstrap_overview_missing_${field}`);
  if (!/geschützt|geschuetzt|sicher|secure|extern/i.test(text))
    failures.push("bootstrap_overview_missing_secure_binding");
  if (
    !/neu[^.!?\n]{0,35}(?:Appliance|Firewall|erstellt)/i.test(text) ||
    !/bestehend[^.!?\n]{0,120}(?:nicht|kein)[^.!?\n]{0,50}(?:zurück|reset|rotier)/i.test(
      text,
    )
  )
    failures.push("bootstrap_overview_missing_creation_only_boundary");
  if (
    !/Infrastruktur|infrastructure/i.test(text) ||
    !/Bootstrap/i.test(text) ||
    !/Policy|Regeln|policy/i.test(text)
  )
    failures.push("bootstrap_overview_missing_phase_boundaries");
  if (!/single|einzel|connectivity\.firewall/i.test(text))
    failures.push("bootstrap_overview_missing_single_scope");
  if (
    !/getrennt|separat|separate/i.test(text) ||
    !/Admin/i.test(text) ||
    !/API/i.test(text)
  )
    failures.push("bootstrap_overview_missing_separate_access");
  const verb =
    /\b(?:poste|kopiere|sende|nenne|paste|send)\b[^.!?\n;]{0,60}?(Passw(?:ort|örter)|passwords?|API[- ]?(?:Schlüssel|secret)|Secret.?Version.?ID)/gi;
  for (const clause of text.split(/[.!?\n;]/)) {
    for (const match of clause.matchAll(verb)) {
      const prefix = clause.slice(0, match.index);
      const beforeSecret = match[0].slice(0, -match[1]!.length);
      const suffix = clause.slice(match.index! + match[0].length);
      const denied =
        /(?:niemals|nie|nicht|never|do not|don't)\s*$/i.test(prefix) ||
        /\b(?:kein\w*|nicht|never|no)\s+(?:(?:dein\w*|ihr\w*|das|the|your|any)\s+){0,3}$/i.test(
          beforeSecret,
        ) ||
        /^\s*(?:nicht|niemals|never)\b/i.test(suffix);
      if (!denied) failures.push("bootstrap_overview_asks_for_secrets");
    }
  }
  if (
    /Bootstrap[^.!?\n]{0,60}(?:unterstützt|aktiviert|initialisiert|konfiguriert)[^.!?\n]{0,50}(?:automatisch|alle|generisch)[^.!?\n]{0,50}(?:regional|Map|Multi-Appliance)/i.test(
      text,
    )
  )
    failures.push("bootstrap_overview_invented_scope");
  if (
    /--insecure[^.!?\n]{0,60}(?:bestätigt|beweist|garantiert)\s+(?!(?:kein\w*|nicht)\b)[^.!?\n]{0,60}(?:vertrauenswürdig|sicher|gültig|Produktions)/i.test(
      text,
    )
  )
    failures.push("bootstrap_overview_unsafe_tls_claim");
  if (
    /erneut\w*\s+Bootstrap[^.!?\n]{0,70}(?:immer sicher|ohne Prüfung|keine Planprüfung)/i.test(
      text,
    )
  )
    failures.push("bootstrap_overview_unsafe_rebootstrap_claim");
  return failures;
}

export function assistantUpgradePathPolicyFailures(text: string): string[] {
  const failures: string[] = [];
  if (!/eigenständig|self.service/i.test(text))
    failures.push("upgrade_path_missing_self_service");
  if (
    !/(?:kein|ohne)[^.!?\n]{0,70}(?:zusätz|erneut|weitere|separat)[^.!?\n]{0,80}(?:Freigabe|Genehmigung)|(?:zusätz|erneut|weitere|separat)[^.!?\n]{0,60}(?:Freigabe|Genehmigung)[^.!?\n]{0,40}(?:nicht|entfällt)/i.test(
      text,
    )
  )
    failures.push("upgrade_path_missing_no_extra_approval");
  if (
    /strengere[^.!?\n]{0,70}(?:alte|neue|beider)|beide[^.!?\n]{0,60}Versionen[^.!?\n]{0,60}(?:müssen|erforderlich)[^.!?\n]{0,40}direkt/i.test(
      text,
    )
  )
    failures.push("upgrade_path_incorrect_template_policy_override");
  return failures;
}

/** Platform owners decide destructive shared changes; approvals stay artifact-bound. */
export function assistantPlatformImpactReviewFailures(text: string): string[] {
  const checks: [string, RegExp][] = [
    [
      "owner-decision",
      /Platform.?Owner[\s\S]{0,180}(?:entscheid|bestätig|freig|prüf|decid|confirm|approv|review)/i,
    ],
    ["destructive-impact", /Lösch|Ersetz|delet|replac/i],
    ["data-loss", /Datenverlust|Daten.{0,30}verlor|data.{0,20}loss/i],
    ["artifact-binding", /Arte?i?f[aä]kt|Hash/i],
    ["state-binding", /State|Zustand/i],
    ["dependencies", /Abhängig|Application/i],
    ["separate-apply", /Apply/i],
    [
      "fresh-plan",
      /(?:neu|frisch|new|fresh)[^.!?\n]{0,40}Plan|Plan[^.!?\n]{0,40}(?:neu|frisch|new|fresh)/i,
    ],
  ];
  return checks
    .filter(([, pattern]) => !pattern.test(text))
    .map(([name]) => `platform_impact_missing_${name}`);
}

/** Check the final visible recommendation independently of classifier/picker success. */
export function assistantGitCapacityRecommendationFailures(
  text: string,
  users: number,
  flavor: "git-10" | "git-100",
  recommendations: Dialogue["recommendations"] = [],
): string[] {
  if (
    recommendations.some(
      (item) =>
        item.path === "devops.git_flavor" &&
        item.value === flavor &&
        item.requirements.some(
          (requirement) =>
            requirement.metric === "users" && requirement.minimum === users,
        ) &&
        item.facts.some(
          (fact) => fact.metric === "users" && fact.value >= users,
        ),
    )
  )
    return [];
  const limit = flavor === "git-100" ? "100" : "10";
  const label = `Git[- ]?${limit}`;
  const checks: [string, RegExp][] = [
    ["count", new RegExp(`\\b${users}\\b`)],
    [
      "recommendation",
      new RegExp(
        `(?:recommend\\w*|empfehl\\w*|selected|gewählt)[^.!?\\n]{0,80}${label}\\b|${label}[^.!?\\n]{0,100}(?:recommend\\w*|empfohl\\w*|appropriate|suitable|passend|geeignet|eignet sich|fits)`,
        "i",
      ),
    ],
  ];
  return checks
    .filter(([, pattern]) => !pattern.test(text))
    .map(([name]) => `git_capacity_missing_${name}`);
}
