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
import {
  assistantFirewallHaSchema,
  assistantFirewallSchema,
} from "./firewall.js";
import { assistantKnowledgeTopics } from "./knowledge-topics.generated.js";

const rules = [
  {
    id: "configuration-contract",
    source:
      "landing-zone-configurator/docs/planning.md#11-chatbot-mit-stackit-model-serving",
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
    source: "landing-zone-configurator/docs/mvp-acceptance.md",
    text: "A complete configuration is not proof of executable infrastructure. Private reachability, regional mappings, runner grants, locks and recovery need separate qualification. Unknown live facts stay unknown. A review receipt is not permission to execute or unlock.",
  },
  {
    id: "folder-description",
    source: "src/modules/governance/variables.tf",
    text: "The reviewed STACKIT provider 0.114.0 has no folder description attribute. Do not propose meaningful rm_folders description values. Explain their explicit rejection in the current local contract; null and empty values remain compatible. This local finding does not upgrade a published engine.",
  },
] as const;

const fieldOverviewNotes: Record<string, string> = {
  "identity-foundations":
    "organization_id bezeichnet die bestehende Organisation, ist aber kein Zugriffs- oder Tenant-Bindungsnachweis. owner_email ist der technische Kontakt; company_name der Firmenname, company_code das Namenspräfix und region die Zielregion. labels sind Ressourcenlabels; platform_contract_namespace ist die stabile Übergabekennung. Der Chat schlägt nur freigegebene Grundlagenwerte vor, die Organisations-ID ausschließlich aus der exakten Benutzerangabe. Labels und Namespace bleiben im Editor konfigurierbar. Keine automatische Speicherung oder Cloud-Ausführung.",
  "governance-folders":
    "rm_folder_parent_id wählt den vorhandenen Elternordner; rm_folders definiert die Ordner mit Namen und Owner-/Reader-E-Mails. organization_owners und organization_auditors enthalten die zusätzlichen Organisationszuweisungen. Organisations-Owner-Rechte decken auch Ordner ab; der Accelerator vermeidet doppelte Folder-Zuweisungen für diese E-Mails. Folder-Reader werden als auditor zugewiesen. Ordnernamen haben 1-40 Zeichen. Der gepinnte Provider unterstützt keine Ordnerbeschreibungen: eine nichtleere description wird abgelehnt, nicht still ignoriert. Im Chat sind Namen vorhandener Ordner sowie ausdrücklich angefragte zusätzliche Owner-/Reader-E-Mails und Organisationsrollen als überprüfbare Entwurfsfelder vorschlagbar. Namensdelegation allein erlaubt keine Rollenvorschläge. Gespeicherte bestätigte Owner-E-Mail, verifizierte Benutzer-E-Mail oder exakte Benutzerangaben können auf ausdrückliche Anfrage wiederverwendet werden; keine erfundenen Adressen, neuen Ordner, entfernten Zuweisungen, Elternordneränderungen oder automatisch gewährten Rechte. Feldübernahme speichert nur den Entwurf; IAM-Auswirkungen sind separat im autorisierten Plan und Apply zu prüfen, ohne menschlichen Identitätsnachweis oder Configurator-Rollen zu erzeugen.",
  "firewall-policy":
    "firewall_config konfiguriert endpoint/insecure für API-Endpunkt und TLS-Prüfung sowie aliases, routes, rules, outbound_nat und port_forwards. Regeln unterstützen action=pass/block/reject und direction=in/out; Interfaces, Quellen, Ziele, Ports, Protokoll und sequence bestimmen die Auswertung. Aliase und Gateway-Verweise müssen auf gültige Objekte zeigen; urltable-Aliase benötigen update_freq. Regeln, Routing und NAT sind getrennte Funktionen. Die explizite HA-Policy-Synchronisierung ist nicht mit CARP/pfsync gleichzusetzen; öffentliche IPs wechseln nicht automatisch mit. API-Zugänge, Bootstrap und private Erreichbarkeit sind separate geschützte Voraussetzungen. Der Chat kann das komplexe Policy-Objekt erklären, aber nicht ändern oder anwenden. Keine Isolations- oder Erreichbarkeitsgarantie.",
  "sandbox-projects":
    "sandboxes ist eine Liste mit project_name, project_owner_email und optionalen zusätzlichen owner_emails. Projekte werden im Governance-Sandbox-Ordner mit abgeleitetem Namenspräfix angelegt; dessen Name und Elternstruktur gehören zur separaten Governance-Konfiguration. Die native Sandbox-Liste bietet keine automatische Laufzeitbegrenzung, Ablauf-/Löschsteuerung oder Budgetobergrenze. Sie aktiviert keine Corporate-Netzanbindung, DNS- oder Plattformdienste. Der Chat kann diese Felder erklären, aber komplexe Sandbox-Einträge nicht hinzufügen oder entfernen. Änderungen im Editor brauchen einen getrennten geprüften Plan und eine ausdrückliche Ausführungsfreigabe.",
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
    return null;
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
          ? `Native Felder im Accelerator/Editor:\n${paths.join(", ")}.\n\n${notes}`
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
