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

/** Reviewed workflow information only: it never reads or changes an order. */
export const assistantApplicationUpgradeAdvice = {
  "template-upgrade":
    "1. Der Platform Owner veröffentlicht eine neue Version derselben Template-Familie und einen Upgrade-Pfad von der bisherigen Version. Veröffentlichungen allein ändern keine Bestellung. In derselben Bestellung unter Updates Ziel und Vergleich prüfen; keine Neubestellung.\n\n2. Parameter-Antworten bleiben erhalten; neue Pflichtangaben ergänzen. Andere Antworten oder Ziele erfordern eine neue Vorschau. Gewünschte Bindung ausdrücklich bestätigen: Ursprüngliche Veröffentlichung, Bestellung, Projekt, State-Key und Backend bleiben erhalten. Kein Plan oder Apply startet; State und Infrastruktur werden nicht geändert.\n\n3. Einen frischen Plan gegen den tatsächlichen State erstellen und vollständig prüfen. Löschungen und Ersetzungen bestehender Infrastruktur bleiben blockiert, auch bei Services, Accounts und Zugangsdaten. Unbekannte/unvollständige Nachweise blockieren ebenfalls; keine Checkbox umgeht das. Nur Projektrollen und ihre Zuweisungen können im exakten Plan als sensitive IAM-Änderung entfernt oder ersetzt werden. Org-, Platzierungs-, Netzwerkbereichs- oder Backend-Migrationen brauchen ein separates geprüftes Verfahren.\n\n4. Die veröffentlichte Pfadrichtlinie entscheidet unabhängig von den Bestellrichtlinien beider Template-Versionen. Bei „Eigenständig durchführen“ prüft der Application Owner den frischen Plan und bestätigt Apply selbst, ohne zusätzliche Platform-Owner-Freigabe. „Separate Plan-Freigabe erforderlich“ bindet die Freigabe an den exakten Plan, Artifact-Hash und Upgrade-Snapshot, auch bei gewöhnlichen Änderungen. Apply bleibt separat ausdrücklich. Policy-Änderungen sind neue unveränderliche Veröffentlichungen: alte Ziele/Pläne behalten ihre Richtlinie. Ein noch nicht angewendetes Ziel zurücknehmen, den neuen Pfad auswählen und frisch planen.\n\nLaufende/ungeklärte Jobs, aktive Runner-Freigaben und offene Recovery sperren Bindungswechsel. Ein fehlgeschlagener Apply kann State/Ressourcen verändern; die gewünschte Bindung bleibt. Recovery nutzt den eingefrorenen unterbrochenen Job, nicht den letzten erfolgreichen Apply. Danach neu planen. Bestellung nicht ausgelesen; nur Beratung, noch nichts gespeichert oder ausgeführt. Chat veröffentlicht, bindet, genehmigt und entsperrt nichts.",
  "platform-upgrade":
    "Plattform-Apply wirkt sofort auf gemeinsame Firewall/Routen aller abhängigen Applications. Ablehnen einer Vertragsbindung erhält keine alte Firewall.\n\n1. Vor Plattform-Apply die Abhängigkeits-/Auswirkungsprüfung und den nativen Plan prüfen. Der Platform Owner entscheidet über Löschungen/Ersetzungen anhand Planänderungen, Anzahlen, betroffener Applications und Datenverlusten. Unbekannte/unvollständige Nachweise bleiben Sperren. Aktive Ausführung/Recovery sperren.\n\n2. Auch Löschungen/Ersetzungen brauchen ausdrückliche Platform-Owner-Bestätigung für genau den Plan, Artifact-Hash, State-Version und Abhängigkeitsmenge. Andere Abhängigkeiten oder State entwerten diese Bestätigung. Plattform-Apply danach separat ausdrücklich freigeben.\n\n3. Nach erfolgreichem Plattform-Apply den tatsächlich entstandenen entsperrten Vertrag freigeben. Platform Owner veröffentlicht einen expliziten Plattform-Upgrade-Pfad zwischen echten geprüften Verträgen; keine automatische Vertragsbindung.\n\n4. Der Application Owner prüft unter Updates das Ziel und übernimmt die Bindung ausdrücklich. Template-Version, Bestellung, Projektidentität, Parameter, State-Key und Backend bleiben erhalten. Die ursprüngliche Veröffentlichung bleibt unverändert. Bindungswechsel startet weder Plan noch Apply; ungeklärte Jobs, Recovery und aktive Freigaben sperren ihn. Danach frischen Application-Plan gegen den tatsächlichen State prüfen. Seine veröffentlichte Pfadrichtlinie gilt unabhängig von der Bestellrichtlinie: Bei „Eigenständig durchführen“ ist keine zusätzliche Platform-Owner-Freigabe nötig; sonst braucht der exakte Plan eine Freigabe, auch bei gewöhnlichen Änderungen. Apply separat bestätigen. Löschungen/Ersetzungen bestehender Infrastruktur und unbekannte Nachweise bleiben blockiert; nur Projektrollen/-zuweisungen können als sensitive IAM-Änderung entfernt oder ersetzt werden. Neue Pfadrichtlinien benötigen neue Auswahl und frischen Plan; alte Ziele/Pläne bleiben gebunden.\n\nOrg-/Projektstandort-, Netzwerkbereichs- oder Backend-Migrationen sind separat. Fehlgeschlagener Teil-Apply kann State verändern; die gewünschte Bindung bleibt. Recovery nutzt den eingefrorenen unterbrochenen Job. Bestellung nicht ausgelesen; nur Beratung, noch nichts gespeichert oder ausgeführt. Chat veröffentlicht, bindet, genehmigt und entsperrt nichts.",
  "platform-impact-review":
    "1. Als Platform Owner einen frischen, vollständigen Plattform-Plan prüfen: Ressourcenänderungen und die Anzahl für Anlegen, Ändern, Ersetzen und Löschen sowie die betroffenen Application Landing Zones. Bekannte Löschungen und Ersetzungen sind eine bewusste Entscheidung des Platform Owners; Datenverluste und Ausfälle sind dabei möglich. Die verbindlichen Rechte prüft der Server.\n\n2. Unter Apply die Auswirkungen dieses gespeicherten Plans bestätigen. Die Bestätigung bindet genau den Plan, Artefakt-Hash, State-Version und die aktuellen Abhängigkeiten. Ein anderer Plan, geänderter State oder neue Abhängigkeiten entwerten sie. Alte blockierte Pläne werden nicht nachträglich entsperrt: einen neuen Plan erstellen. Unbekannte/unvollständige Nachweise, aktive Application-Ausführungen und offene Recovery zuerst klären.\n\n3. Diese Auswirkungsbestätigung startet keinen Apply. Anschließend Apply separat ausdrücklich freigeben, einschließlich Organisationsbestätigung und Freigabe destruktiver Änderungen. Beim Audit-Wechsel von Logs auf Observability auch den Verlust der alten Logs-Historie und den Erhalt von Router, Links und S3-Archiv im Plan prüfen.\n\nDiese Prüfung ist kein Template-Upgrade und ändert keine Bestellung. Ich habe deinen Plan nicht ausgelesen. Nur Beratung: noch nichts gespeichert oder ausgeführt; Chat genehmigt oder entsperrt keinen Apply.",
  "execution-source-upgrade":
    "Bestehende Application-Bestellungen und ihre State-Zuordnung bleiben erhalten; keine Neubestellung. Produkt-Updates ändern ihre gebundene Accelerator-Quelle nicht automatisch. Nur geprüfte gebündelte Quellen laufen mit dem gepatchten Worker; keine beliebigen Git-Revisionen. Die konkrete Verfügbarkeit und offene Jobs prüfst du in den Bestelldetails unter Updates → Ausführungsstand der Bestellung; ich habe diese Bestellung nicht ausgelesen.\n\n" +
    "Ursprüngliche Template-Quelle (origin) ist die unveränderliche Git-Revision der Veröffentlichung. Gewünschter Ausführungsstand (desired) ist die ausgewählte Accelerator-Revision. Zuletzt erfolgreich angewendete Revision (lastApplied) bezeichnet die Quelle des letzten erfolgreichen Apply, weder den vollständigen aktuellen State noch die Recovery-Quelle.\n\n" +
    "Für ein Upgrade derselben Bestellung wählst du dort den angebotenen geprüften Ersatz und bestätigst die Aktualisierung. Das ändert nur die gewünschte Ausführungsbindung; Projekt, State, Backend und Template-Regeln bleiben erhalten. Es startet keinen Plan oder Apply. Danach brauchst du einen neuen Plan gegen den tatsächlichen State: Änderungen, Ersetzungen und Löschungen prüfen, anschließend die normale separate ausdrückliche Apply-Freigabe erteilen. Ein alter Plan wird nicht wiederverwendet.\n\n" +
    "Ein fehlgeschlagener Apply kann State und Ressourcen bereits verändert haben; Verlustfreiheit oder unveränderter State sind nicht garantiert. Der gewünschte Stand bleibt erhalten. Recovery verwendet die Quelle des unterbrochenen Jobs. Laufende oder ungeklärte Jobs, aktive Freigaben und offene Recovery sperren das Upgrade bis zum Abgleich.\n\n" +
    "Zurückgezogene Quellen dürfen nicht mehr ausführen: Nutze den geprüften Upgrade-Pfad derselben Bestellung. Fehlt ein Paket, muss ein Operator es geprüft bereitstellen oder den angebotenen Ersatzpfad ermöglichen. Ist zugleich Recovery ungeklärt und deren Quelle zurückgezogen, bleiben State und Sperre erhalten; dafür braucht ein Operator ein geprüftes kompatibles Recovery-Paket, bevor ein Upgrade möglich ist. Keine Umgehung der Prüfungen. Nur Beratung: noch nichts gespeichert. Der Chat führt kein Upgrade, Entsperren, Plan oder Apply aus.",
} as const;

const fieldOverviewNotes: Record<string, string> = {
  "stackit-network-components":
    "STACKIT Network Area (SNA) verbindet Projekte zentral; kein AWS VPC, Shared VPC oder Direct Connect. Native Formen sind connectivity.network_area für eine einzelne Area, connectivity.network_areas als Map mit stabilen Schlüsseln und connectivity_regions für regionale Konfigurationen. Formen nicht mischen; bestehende referenzierte Area-Schlüssel erhalten. Corporate-Projekte wählen über network_area_key eine Area derselben Region. Eine SNA aktiviert weder Firewall noch VPN automatisch; OPNsense-Firewall, Routing/Policy und VPN bleiben getrennt. Für reine SNA-interne Kommunikation ist kein VPN nötig.\n\nFelder: ranges ist eine Liste von IPv4-CIDRs; transfer_network ein IPv4-CIDR für das Transfernetz. Die Map kann zusätzlich name enthalten. min_prefix_length, default_prefix_length und max_prefix_length sind ganzzahlige Präfixlängen von 0 bis 32 mit min_prefix_length <= default_prefix_length <= max_prefix_length. Native Defaults: min_prefix_length=24, default_prefix_length=28, max_prefix_length=28; kleinere Präfixzahl bedeutet größeres Netz. default_nameservers überschreibt die Resolver explizit; bei null/fehlendem Wert gelten die regional bekannten STACKIT-Resolver. Für eine unbekannte Region müssen Resolver explizit angegeben werden. Resolver sind keine autoritative DNS-Zone.\n\nCorporate network_prefix_length=null (Automatisch) liest beim Plan den tatsächlichen default_prefix_length der angebundenen regionalen SNA und gibt einen numerischen Präfix an den Provider weiter; vorhandene DNS-Einstellungen bleiben erhalten. Ein expliziter Projektpräfix geht vor. Schema-Default /28 beweist keinen aktuellen Cloud-Wert und erzwingt keine Projektgröße.\n\nKapazität ist zunächst Rechenmodell: Ein /16 enthält 2^(24-16)=256 /24-Netze beziehungsweise 512 /25-Netze, vor Reservierungen. Ein /25 enthält 128 IPv4-Adressen, nicht 128 Projekt-Subnetze. Transfer-, Plattform- und Firewall-Netze sowie bestehende Belegung reduzieren nutzbare Kapazität. Automatisch garantiert weder freie Adressen noch Quoten, Überlappungsfreiheit oder Erreichbarkeit. Freie Pools, Reservierungen, tatsächliche Nutzung und Berechtigungen separat prüfen. Nur Übersicht: keine Änderungen, noch nichts gespeichert oder ausgeführt. Keine Zugangsdaten oder IDs erforderlich; Plan und ausdrücklich freigegebener Apply bleiben separat.",
  "firewall-access-bootstrap":
    "Native Referenzfelder sind firewall_admin_username, firewall_admin_password, firewall_api_credentials mit api_key/api_secret, firewall_bootstrap und firewall_api_secret_version. Infrastruktur, API-Bootstrap und Policy bleiben getrennte Phasen. Adminlogin leitet nativ einen API-Key ab; API-Key/API-Secret sind eigene API-Zugänge. Im Chat nur den Betriebsbedarf klären; keine Passwörter, API-Schlüssel, Secret-Version-IDs oder Credential-Dateien anfordern, lesen oder ausgeben. Das geschützte Configurator-Zugangsprofil bindet vorhandene OPNsense-Administrationsdaten für autorisierte HA-Jobs. Es aktiviert weder API-Bootstrap noch Firewall-Policy; Zugänge werden separat gebunden, nicht durch Entwurfsübernahme freigegeben. HA benötigt passenden Zugang zu Primary und Backup; Erreichbarkeit und Failover bleiben separat zu prüfen. Nativer API-Bootstrap ist eine eigene Operator-Phase für die einzelne connectivity.firewall, keine generische Map-/Regional-/Multi-Appliance-Unterstützung. firewall_bootstrap ist ein boolescher Phasenschalter. Native API-Zugänge haben die Reihenfolge externe firewall_api_credentials, lokaler Bootstrap-Cache, Management-Secrets-Manager/Vault. Ein lokaler Credential-Cache ist ein sensibler Ausführungseffekt, kein Chat- oder Vorlagenvorgang. Auf einer bestehenden Installation kann erneuter Bootstrap ohne Cache die Löschung von Policy und gespeichertem Schlüssel planen; nicht blind erneut aktivieren. firewall_api_secret_version steuert die native Write-Version, kein vom Assistant zu erratender Secret-Verweis. firewall_config und seine tatsächlichen Bootstrap-/Secret-Prädikate bestimmen die separate Policy-Aktivierung; firewall_bootstrap=false allein beweist keine vollständigen Voraussetzungen. Nativer Bootstrap verwendet --insecure, der Provider kann TLS-Prüfung überspringen. Das bestätigt kein vertrauenswürdiges TLS-Zertifikat und keine sichere Produktionsvorgabe; TLS-Vertrauen, Provider-/Appliance-Zugang und Management-Secrets gesondert prüfen. Chat und Entwurfsübernahme rotieren keine Credentials und gewähren keine Ausführungszusage. Nur Übersicht: nichts geändert; noch nichts gespeichert oder ausgeführt. Plan und ausdrücklich freigegebener Apply bleiben separat.",
  "platform-kubernetes":
    "platform_kubernetes ist eine Map mit stabilen Schlüsseln. Jeder Eintrag enthält region und cluster mit name, optionalem kubernetes_version_min, node_pools und maintenance. Node-Pools haben name, machine_type, minimum, maximum und availability_zones; optional sind allow_system_components, volume_size, volume_type, os_name und labels. minimum und maximum begrenzen die Pool-Größe; System-Komponenten benötigen geeignete Pools. Versionen, Maschinen und Zonen anhand aktueller Produktdaten prüfen, keine statische Verfügbarkeitszusage. network enthält sna_enabled, network_area_key, sna_network_area_id, firewall_next_hop_ip und sna_network_prefix_length. SNA-Zuordnung und regionale Area-Referenzen müssen passen; ein Präfix allein garantiert weder freie Adressen noch Workload-Kapazität. dns, observability, encrypted_volumes, debug_bastion und role_assignments sind getrennte Optionen. KMS-gestützte Storage-Classes bedeuten nicht automatisch Verschlüsselung aller Volumes. Die Debug-Bastion ist eine separate VM mit SSH-Zugang, kein impliziter Bestandteil eines SNA-Auftrags. platform_kubernetes={} deaktiviert diese Cluster. platform_kubernetes_kube_config_override ist ein separater geschützter Eingang, keine öffentliche Chat-Einstellung: niemals Kubeconfig-Inhalte, private SSH-Schlüssel oder KMS-Geheimnisse im Chat anfordern oder eintragen. Cluster-/Provider-Erreichbarkeit, Kubernetes-Zugang, KMS-Rechte und Node-Gesundheit brauchen getrennte Ausführungsprüfung. Feldübersicht ist kein Einrichtungsvorschlag: nichts geändert oder gespeichert; Plan und ausdrücklich freigegebener Apply bleiben separat.",
  "dns-zones":
    "connectivity.dns_zones und regionale connectivity_regions-Einträge enthalten die Zonen mit stabilen Schlüsseln und den Feldern dns_name, name, description, default_ttl, type, contact_email, acl und network_area_key. SNA default_nameservers legt Resolver fest, keine autoritative Zone. type hat den nativen Default primary. Primary verwaltet die führenden DNS-Einträge bei STACKIT und wird für eine neue dort verwaltete Firmenzone empfohlen. Secondary repliziert eine Kopie vom externen Primary. Beide sind autoritativ; primary/secondary bezeichnet nicht public/private oder die Sichtbarkeit. Der native Accelerator bildet die benötigte Konfiguration externer Primary-Server für Secondary nicht ab; daher kein vollständiges Secondary-Setup und keine stille Umwandlung bestehender Secondary-Zonen. default_ttl hat den nativen Default 3600 Sekunden; 60 bis 99999999 sind im Editor zulässig. Kürzere TTL erleichtert Änderungen, verlängerte TTL hält Cache-Einträge länger. Kontakt und SNA-Zuordnung aus bestätigten Angaben erhalten; kein erfundener Kontakt. ACL wird im gepinnten Provider nicht durchgesetzt und ist kein Zugriffsschutz. Leere Zonen-Map bedeutet keine Zone. Eine freie Subdomain ist keine kostenlose DNS-Service-Zusage. Verfügbarkeit, Delegation, Propagation und Erreichbarkeit bleiben separat zu prüfen. Nur Feld- und Rollenübersicht: nichts geändert, gespeichert oder ausgeführt.",
  "devops-git":
    'devops=null überspringt das DevOps-Modul. Das native Objekt enthält git_flavor (Standard null) und allowed_network_ranges (Schema-Default ["0.0.0.0/0"]). git_flavor=null erstellt keine Git-Instanz; auch ein reines ACL-Objekt aktiviert Git nicht. Der offene ACL-Default ist keine Zustimmung zu öffentlichem Zugriff: Zugriffsnetze bewusst wählen. Ein Flavor muss bei gewünschtem Git explizit gewählt und für Projekt/Region separat geprüft werden; kein automatisch aktivierter Git-Flavor. Das Root-Modul leitet Projekt, Ownership und Namen ab. Managed Git ist getrennt von GitHub-Anmeldung, Forks und Configurator-CI. Keine Verfügbarkeits-, Leistungs-, Backup- oder Migrationsgarantie; keine Zugangsdaten oder privaten Schlüssel im Chat. Diese Feldübersicht schlägt keine Konfiguration vor und speichert oder provisioniert nichts. Entwurfsübernahme, Speichern, autorisierter Plan und ausdrücklicher Apply bleiben getrennte Schritte.',
  vpn: "connectivity.vpn beziehungsweise connectivity_regions[*].vpn enthält display_name, plan_id, routing_type, availability_zones und connections. null deaktiviert die optionale VPN-Konfiguration. Native Schema-Defaults sind plan_id=p100 und routing_type=ROUTE_BASED; das ist kein Verfügbarkeits-, Berechtigungs- oder Leistungsnachweis. availability_zones benötigt tunnel1 und tunnel2. connections ist eine Map mit stabilen Verbindungsschlüsseln: display_name, enabled (Standard true), local_subnets, remote_subnets und static_routes sowie tunnel1 und tunnel2. Jeder Tunnel enthält remote_address, optionales peering mit local_address/remote_address sowie phase1 und phase2. Die Phasen konfigurieren encryption_algorithms, integrity_algorithms, dh_groups und rekey_time; phase2 zusätzlich dpd_action und start_action. Netze, Gegenstellen, Routing und Kompatibilität müssen getrennt geprüft werden; für reine SNA-interne Kommunikation ist kein VPN erforderlich. vpn_pre_shared_keys ist ein separater geschützter Eingang pro Verbindung mit tunnel1/tunnel2, nicht Teil des öffentlichen connectivity-Objekts. Werte ausschließlich außerhalb des Chats über TF_VAR_vpn_pre_shared_keys oder eine gitignorierte tfvars-Datei bereitstellen; keine PSK-Werte anfordern, anzeigen oder durch den Assistant exportieren. Feldübersicht ist kein Einrichtungsvorschlag: nichts gespeichert oder ausgeführt. Plan, geschützte Zugänge und Apply benötigen separate autorisierte Prüfung.",
  "audit-logs":
    "Zentrale Audit-Protokollierung nutzt Telemetry Link → Telemetry Router → S3-Archiv und genau ein Abfrageziel. Mit observability != null ist das Ziel deren OTLP-Endpunkt; Ereignisse stehen dem eingebauten Grafana Audit Logs Dashboard zur Verfügung. Technische Observability-Credentials dienen der Ingestion/Abfrage, nicht dem SSO-Login ins Grafana. Grafana-Admin-Zugang ist für die Anbindung nicht nötig. Ohne Observability bleibt eine eigene Logs-Instanz das Abfrageziel.\n\nFür die direkte Dev-Umstellung auf die vorhandene Observability einen frischen Plattform-Plan prüfen und Apply separat freigeben. Alte Logs-Instanz, Tokens und Destination werden entfernt; damit geht deren bisherige Historie verloren. Keine historische Nachlieferung. Router, Links, Projekte und S3-Archiv bleiben erhalten, sofern der konkrete Plan dies bestätigt. Bereits korrekt angebundene Application-Bestellungen brauchen für diesen zentralen Zielwechsel kein eigenes Update. Bestehende unverbundene Bestellungen benötigen dagegen erst den freigegebenen Plattform-Upgrade-Pfad und ihren frischen Plan/Apply. Das ist nicht derselbe Vorgang.\n\nObservability braucht einen logs-fähigen Plan und hat eigene Aufbewahrung und Kosten. audit_logs.retention_days steuert das S3-Archiv und nur im Fallback die Logs-Instanz; es setzt keine Observability-Aufbewahrung. Router-Egress-Bereiche ergänzen die ACL des gewählten Ziels. router_egress_cidrs=null nutzt den öffentlichen STACKIT-Feed; eine explizite Liste muss nicht leer sein. acl betrifft Logs-Clients, observability.acl Observability.\n\naudit_logs enthält retention_days, acl, s3_object_lock, router_egress_cidrs und link_scopes. Der native Object-Lock-Default ist true, auch bei verschachteltem null; explizites false entscheidet vor Erstellung dagegen. Bei aktivem GOVERNANCE-Lock gilt 1–365 Tage, kein reversibler Schalter und keine Compliance-Zusage. Neue Audit-Entwürfe brauchen Retention, ACL und eine ausdrückliche Lock-Auswahl zusammen. Organisations-Links erben keine Projekte/Ordner. managed_resources=true ergänzt verwaltete Projekte/Ordner derselben Region und neue Bestellungen; keine gleichzeitigen manuellen link_scopes.\n\nZustellung in Dashboard und S3 mit frischen Ereignissen separat prüfen. Keine Zustellgarantie aus einem erfolgreichen Apply ableiten. Nur Beratung; noch nichts gespeichert oder ausgeführt.",
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
