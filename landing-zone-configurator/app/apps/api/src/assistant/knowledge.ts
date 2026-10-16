import { createHash } from "node:crypto";
import {
  catalogue,
  type FeatureGroup,
  featureFieldCatalogue,
  featureGroups,
  objectValue,
  supportedAcceleratorRevision,
} from "@lzc/domain";
import { z } from "zod";
import {
  assistantDnsZoneSchema,
  assistantFieldContracts,
  assistantNetworkAreaSchema,
  assistantScalarFields,
} from "./dialogue.js";
import { assistantEditorProposalPath } from "./editor.js";
import {
  assistantFirewallHaSchema,
  assistantFirewallSchema,
} from "./firewall.js";
import { assistantKnowledgeTopics } from "./knowledge-topics.generated.js";

const rules = [
  {
    id: "configuration-contract",
    source: "landing-zone-configurator/docs/user-guide.md#assistant-proposals",
    text: "Propose changes to a configuration draft only. Ask for missing information. Template defaults are not user consent to configure, provision or enable optional components. Separate existing enabled settings from confirmed requirements; mention inconsistent inherited settings without silently changing them. 'Later' does not mean 'enable now'. A full native apply includes mandatory foundation resources and all enabled components, not just the current conversational step. Validate with the deterministic compiler; disclose validation gaps. Preserve omitted/null/configured values and unknown imported fields. Acceptance requires current authorization and an unchanged base revision. Never execute, publish, grant access or read secrets.",
  },
  {
    id: "public-corporate",
    source: "src/variables.tf",
    text: "Public projects explicitly set corporate=false. Omitted corporate retains the Corporate default. Corporate projects require an existing network area in the same region. Do not invent connectivity or overwrite legacy project identities.",
  },
  {
    id: "protected-inputs",
    source: "landing-zone-configurator/docs/common-feature-model.md",
    text: "Protected inputs are requirements only. Never ask for passwords, API tokens, VPN preshared keys or kubeconfig values. Direct users to the separate authorized credential-binding workflow. No customer state, raw plans or credential values belong in chat.",
  },
  {
    id: "execution-capability",
    source:
      "landing-zone-configurator/docs/architecture.md#execution-and-state",
    text: "A complete configuration is not proof of executable infrastructure. Private reachability, regional mappings, runner grants, locks and recovery need separate qualification. Unknown live facts stay unknown. A review receipt is not permission to execute or unlock.",
  },
  {
    id: "folder-description",
    source: "src/modules/governance/variables.tf",
    text: "The reviewed STACKIT provider 0.114.0 has no folder description attribute. Do not propose meaningful rm_folders description values. Explain their explicit rejection in the current local contract; null and empty values remain compatible. This local finding does not upgrade a published engine.",
  },
] as const;

export const assistantFirewallPolicyLimit =
  "Der Assistant kann aktuell keine Firewall-Regeln, NAT, Aliase oder Routen definieren oder als Vorschlag übernehmen. Die geführte Policy-Bearbeitung in Editor und Chat ist nicht Teil des MVP (GitHub-Issue #101). Im MVP pflegt der Firewall-Admin die Policy nach Bereitstellung manuell in OPNsense.";

const fieldOverviewNotes: Record<string, string> = {
  "devops-git":
    'devops=null überspringt das DevOps-Modul. Das native Objekt enthält git_flavor (Standard null) und allowed_network_ranges (Schema-Default ["0.0.0.0/0"]). git_flavor=null erstellt keine Git-Instanz; auch ein reines ACL-Objekt aktiviert Git nicht. Der offene ACL-Default ist keine Zustimmung zu öffentlichem Zugriff: Zugriffsnetze bewusst wählen. Ein Flavor muss bei gewünschtem Git explizit gewählt und für Projekt/Region separat geprüft werden; kein automatisch aktivierter Git-Flavor. Das Root-Modul leitet Projekt, Ownership und Namen ab. Managed Git ist getrennt von GitHub-Anmeldung, Forks und Configurator-CI. Keine Verfügbarkeits-, Leistungs-, Backup- oder Migrationsgarantie; keine Zugangsdaten oder privaten Schlüssel im Chat. Diese Feldübersicht schlägt keine Konfiguration vor und speichert oder provisioniert nichts. Entwurfsübernahme, Speichern, autorisierter Plan und ausdrücklicher Apply bleiben getrennte Schritte.',
  vpn: "connectivity.vpn beziehungsweise connectivity_regions[*].vpn enthält display_name, plan_id, routing_type, availability_zones und connections. null deaktiviert die optionale VPN-Konfiguration. Native Schema-Defaults sind plan_id=p100 und routing_type=ROUTE_BASED; das ist kein Verfügbarkeits-, Berechtigungs- oder Leistungsnachweis. availability_zones benötigt tunnel1 und tunnel2. connections ist eine Map mit stabilen Verbindungsschlüsseln: display_name, enabled (Standard true), local_subnets, remote_subnets und static_routes sowie tunnel1 und tunnel2. Jeder Tunnel enthält remote_address, optionales peering mit local_address/remote_address sowie phase1 und phase2. Die Phasen konfigurieren encryption_algorithms, integrity_algorithms, dh_groups und rekey_time; phase2 zusätzlich dpd_action und start_action. Netze, Gegenstellen, Routing und Kompatibilität müssen getrennt geprüft werden; für reine SNA-interne Kommunikation ist kein VPN erforderlich. vpn_pre_shared_keys ist ein separater geschützter Eingang pro Verbindung mit tunnel1/tunnel2, nicht Teil des öffentlichen connectivity-Objekts. Werte ausschließlich außerhalb des Chats über TF_VAR_vpn_pre_shared_keys oder eine gitignorierte tfvars-Datei bereitstellen; keine PSK-Werte anfordern, anzeigen oder durch den Assistant exportieren. Feldübersicht ist kein Einrichtungsvorschlag: nichts gespeichert oder ausgeführt. Plan, geschützte Zugänge und Apply benötigen separate autorisierte Prüfung.",
  "audit-logs":
    "Zentrale Audit-Protokollierung ist ein eigenes Thema, nicht die Fortsetzung der Firewall-Planung. Der Accelerator nutzt Telemetry Link → Telemetry Router → Logs-Instanz und Object-Storage-Archiv. audit_logs enthält retention_days, acl, s3_object_lock und link_scopes; ohne eigene Link-Scopes gilt der native Organisationsumfang. Logs-Aufbewahrung und Archivschutz sind getrennt zu prüfen. Object Lock setzt GOVERNANCE-WORM-Schutz und ist nicht sauber rückgängig zu machen; bei aktivem Lock gilt der native Bereich 1-365 Tage. Der native Schema-Default aktiviert Object Lock, die Beschreibung ist dazu widersprüchlich: vor Aktivierung ausdrücklich entscheiden, nicht blind Defaults übernehmen. ACL-Zugriffsnetze und Aufbewahrung müssen bewusst gewählt werden. Der Assistant kann diese Editor-Einstellungen als validierten Entwurf vorschlagen. Neue Audit-Konfigurationen benötigen Retention, ACL und eine ausdrückliche Object-Lock-Auswahl zusammen. Berechtigte Link-Scopes, geschützte Ingestion-/Archivzugänge, Plan/Apply sowie Ereigniszustellung und Archivabruf brauchen separate Prüfung. Keine Compliance- oder Zustellgarantie.",
  "identity-foundations":
    "organization_id bezeichnet die bestehende Organisation, ist aber kein Zugriffs- oder Tenant-Bindungsnachweis. owner_email ist der technische Kontakt; company_name der Firmenname, company_code das Namenspräfix und region die Zielregion. labels sind Ressourcenlabels; platform_contract_namespace ist die stabile Übergabekennung. Der Chat kann diese öffentlichen Editor-Einstellungen als validierte Entwurfsfelder vorschlagen, die Organisations-ID ausschließlich aus einer bestätigten Benutzerquelle. Labels und Namespace verwenden den nativen Editor-Vertrag. Keine automatische Speicherung, Organisationsbindung oder Cloud-Ausführung.",
  "governance-folders":
    "rm_folder_parent_id wählt den vorhandenen Elternordner; rm_folders definiert die Ordner mit Namen und Owner-/Reader-E-Mails. organization_owners und organization_auditors enthalten die zusätzlichen Organisationszuweisungen. Organisations-Owner-Rechte decken auch Ordner ab; der Accelerator vermeidet doppelte Folder-Zuweisungen für diese E-Mails. Folder-Reader werden als auditor zugewiesen. Ordnernamen haben 1-40 Zeichen. Der gepinnte Provider unterstützt keine Ordnerbeschreibungen: eine nichtleere description wird abgelehnt, nicht still ignoriert. Der spezialisierte Rollenpfad ergänzt ausdrücklich angefragte Subjects in bestehenden Zuweisungen; neue Ordner, Elternordneränderungen, Entfernen und Ersetzen verwenden den nativen Editor-Vertrag mit expliziter atomarer Prüfung. Namensdelegation allein erlaubt keine Rollenvorschläge. Gespeicherte bestätigte Owner-E-Mail, verifizierte Benutzer-E-Mail oder exakte Benutzerangaben können auf ausdrückliche Anfrage wiederverwendet werden; keine erfundenen Adressen oder automatisch gewährten Rechte. Feldübernahme ändert nur den lokalen Entwurf, Speichern bleibt separat; IAM-Auswirkungen sind im autorisierten Plan und Apply zu prüfen, ohne menschlichen Identitätsnachweis oder Configurator-Rollen zu erzeugen.",
  "firewall-policy": `${assistantFirewallPolicyLimit}\n\nfirewall_config konfiguriert endpoint/insecure für API-Endpunkt und TLS-Prüfung sowie aliases, routes, rules, outbound_nat und port_forwards. Regeln unterstützen action=pass/block/reject und direction=in/out; Interfaces, Quellen, Ziele, Ports, Protokoll und sequence bestimmen die Auswertung. Aliase und Gateway-Verweise müssen auf gültige Objekte zeigen; urltable-Aliase benötigen update_freq. Regeln, Routing und NAT sind getrennte Funktionen. Die explizite HA-Policy-Synchronisierung ist nicht mit CARP/pfsync gleichzusetzen; öffentliche IPs wechseln nicht automatisch mit. API-Zugänge, Bootstrap und private Erreichbarkeit sind separate geschützte Voraussetzungen. Keine Isolations- oder Erreichbarkeitsgarantie.`,
  "sandbox-projects":
    "sandboxes ist eine Liste mit project_name, project_owner_email und optionalen zusätzlichen owner_emails. Projekte werden im Governance-Sandbox-Ordner mit abgeleitetem Namenspräfix angelegt; dessen Name und Elternstruktur gehören zur separaten Governance-Konfiguration. Die native Sandbox-Liste bietet keine automatische Laufzeitbegrenzung, Ablauf-/Löschsteuerung oder Budgetobergrenze. Sie aktiviert keine Corporate-Netzanbindung, DNS- oder Plattformdienste. Der Chat verwendet den nativen Editor-Vertrag für überprüfbare Sandbox-Vorschläge; in Plattform-Entwürfen werden Vorlagen unter projectTemplates statt konkreter Projektinstanzen geändert. Listenänderungen werden atomar geprüft und bestehende Identitäten bleiben erhalten. Kein Projekt wird dadurch angelegt; Speichern, Plan und ausdrückliche Ausführungsfreigabe bleiben separat.",
};

export function selectAssistantKnowledgeTopics(groups: readonly string[]) {
  const topics = assistantKnowledgeTopics.topics;
  const selected = new Set<string>();
  const include = (id: string) => {
    if (selected.has(id)) return;
    const topic = topics.find((entry) => entry.id === id);
    if (!topic) throw new Error("assistant_unknown_knowledge_dependency");
    selected.add(id);
    for (const dependency of topic.dependencies) include(dependency);
  };
  for (const topic of topics) {
    if (
      topic.mandatory ||
      (topic.groups as readonly string[]).some((group) =>
        groups.includes(group),
      )
    )
      include(topic.id);
  }
  return topics.filter((topic) => selected.has(topic.id));
}

export function buildAssistantKnowledge() {
  if (assistantKnowledgeTopics.engineRevision !== supportedAcceleratorRevision)
    throw new Error("assistant_topic_engine_mismatch");
  const editableScalarPaths = new Set(
    assistantScalarFields().map((field) => field.path),
  );
  const proposalPath = (path: string): string | null => {
    if (
      editableScalarPaths.has(path) ||
      path === "organization_owners" ||
      path === "organization_owners[*]" ||
      path === "organization_auditors" ||
      path === "organization_auditors[*]" ||
      path === "rm_folders" ||
      /^rm_folders\[\*\]\.(?:name|owner_emails(?:\[\*\])?|reader_emails(?:\[\*\])?)$/.test(
        path,
      )
    )
      return path.startsWith("rm_folders")
        ? "rm_folders"
        : path.replace(/\[\*\]$/, "");
    for (const [parent, shape] of [
      ["connectivity.dns_zones", assistantDnsZoneSchema.shape],
      ["connectivity.network_areas", assistantNetworkAreaSchema.shape],
      ["connectivity.network_area", assistantNetworkAreaSchema.shape],
      ["connectivity.firewall", assistantFirewallSchema.shape],
      ["connectivity.firewalls", assistantFirewallSchema.shape],
    ] as const) {
      const prefix =
        parent === "connectivity.network_area" ||
        parent === "connectivity.firewall"
          ? parent
          : `${parent}[*]`;
      if (
        path === parent ||
        path === prefix ||
        Object.keys(shape).some(
          (name) =>
            path === `${prefix}.${name}` || path === `${prefix}.${name}[*]`,
        )
      )
        return parent;
      if (
        parent.includes("firewall") &&
        Object.keys(assistantFirewallHaSchema.shape).some(
          (name) => path === `${prefix}.ha.${name}`,
        )
      )
        return parent;
    }
    return assistantEditorProposalPath(path);
  };
  const payload = {
    schemaVersion: 1,
    fieldContracts: assistantFieldContracts,
    engineRevision: supportedAcceleratorRevision,
    qualification: "local-draft-not-reviewed-release",
    rules: [
      ...rules,
      ...assistantKnowledgeTopics.topics.map((topic) => ({
        id: topic.id,
        source: topic.source,
        text: topic.text,
      })),
    ],
    topics: assistantKnowledgeTopics.topics.map((topic) => {
      const notes = fieldOverviewNotes[topic.id];
      const paths = topic.fieldPaths.filter((path) =>
        /^[a-z_]+$|^rm_folders\[\*\]\.(?:name|description|owner_emails|reader_emails)$|^firewall_config\.[a-z_]+$|^sandboxes\[\*\]\.[a-z_]+$/.test(
          path,
        ),
      );
      return {
        ...topic,
        fieldOverview: notes
          ? `Native Felder im Accelerator/Editor:\n${paths.length ? `${paths.join(", ")}.\n\n` : ""}${notes}`
          : null,
      };
    }),
    groups: Object.keys(featureGroups) as FeatureGroup[],
    fields: featureFieldCatalogue().map((field) => ({
      path: field.path,
      group: field.group,
      type: field.type,
      optional: field.optional,
      proposalPath:
        field.sensitive || field.commonEditor === "not-effective"
          ? null
          : proposalPath(field.path),
      responsibility:
        field.sensitive ||
        Object.entries(assistantFieldContracts).some(
          ([path, contract]) =>
            contract.responsibility === "operator" && field.path === path,
        )
          ? "operator"
          : "user",
      mode: field.sensitive
        ? "requirements-only"
        : field.commonEditor === "not-effective"
          ? "explain-rejection"
          : proposalPath(field.path) !== null
            ? "propose-validated-draft"
            : "requirements-only",
    })),
    templates: catalogue.templates.map((template) => ({
      id: template.id,
      source: template.source,
      sha256: template.sha256,
      topology: {
        networkAreaCount: Object.keys(
          objectValue(objectValue(template.values.connectivity).network_areas),
        ).length,
        firewall:
          Object.keys(
            objectValue(objectValue(template.values.connectivity).firewall),
          ).length > 0,
      },
    })),
  };
  return {
    ...payload,
    sha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
  };
}

const selectionSchema = z.strictObject({
  engineRevision: z.string().regex(/^[a-f0-9]{40}$/),
  knowledgeSha256: z.string().regex(/^[a-f0-9]{64}$/),
  groups: z
    .array(
      z.enum(Object.keys(featureGroups) as [FeatureGroup, ...FeatureGroup[]]),
    )
    .min(1)
    .max(8),
});

export function assistantKnowledgeContext(input: unknown) {
  const selection = selectionSchema.parse(input);
  const bundle = buildAssistantKnowledge();
  if (
    selection.engineRevision !== bundle.engineRevision ||
    selection.knowledgeSha256 !== bundle.sha256
  )
    throw new Error("assistant_knowledge_version_mismatch");
  const selected = new Set(selection.groups);
  const topics = selectAssistantKnowledgeTopics(selection.groups);
  const topicIds = new Set<string>(bundle.topics.map((topic) => topic.id));
  const selectedIds = new Set<string>(topics.map((topic) => topic.id));
  const componentPaths = new Set<string>(
    topics.flatMap((topic) => [...topic.fieldPaths]),
  );
  return {
    engineRevision: bundle.engineRevision,
    knowledgeSha256: bundle.sha256,
    fieldContracts: bundle.fieldContracts,
    qualification: bundle.qualification,
    rules: bundle.rules.filter(
      (rule) => !topicIds.has(rule.id) || selectedIds.has(rule.id),
    ),
    topics: bundle.topics
      .filter((topic) => selectedIds.has(topic.id))
      .map(({ text: _text, ...topic }) => topic),
    fields: bundle.fields.filter(
      (field) => selected.has(field.group) || componentPaths.has(field.path),
    ),
    templates: bundle.templates,
  };
}

export function assistantKnowledgeForTopics(
  context: Pick<
    ReturnType<typeof assistantKnowledgeContext>,
    "topics" | "rules"
  >,
  topicIds: readonly string[],
) {
  const selected = new Set<string>();
  const include = (id: string) => {
    if (selected.has(id)) return;
    const topic = context.topics.find((entry) => entry.id === id);
    if (!topic) {
      if (rules.some((rule) => rule.id === id)) return;
      throw new Error("assistant_unknown_knowledge_dependency");
    }
    selected.add(id);
    for (const dependency of topic.dependencies) include(dependency);
  };
  for (const id of topicIds) include(id);
  for (const topic of context.topics) if (topic.mandatory) include(topic.id);
  const allTopicIds = new Set<string>(context.topics.map((topic) => topic.id));
  return {
    topics: context.topics.filter((topic) => selected.has(topic.id)),
    rules: context.rules.filter(
      (rule) => !allTopicIds.has(rule.id) || selected.has(rule.id),
    ),
  };
}
