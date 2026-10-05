import { t } from "../i18n";
export const labels: Record<string, string> = {
  projectTemplates: "Projekt-Templates",
  owner_email: "Technisch verantwortlich",
  company_name: "Organisation / Unternehmen",
  company_code: "Unternehmenskürzel",
  organization_id: "STACKIT Organisations-ID",
  region: "Region",
  labels: "Kennzeichnungen",
  rm_folder_parent_id: "Vorhandener übergeordneter Ordner",
  rm_folders: "Ordner",
  organization_owners: "Organisationsverantwortliche",
  organization_auditors: "Organisationsauditoren",
  devops: "Git-Service",
  platform_kubernetes: "Plattform-Kubernetes",
  observability: "STACKIT Observability",
  audit_logs: "Audit-Protokollierung",
  federated_identity_providers: "Service-Account-Föderation für CI/CD",
  connectivity: "Connectivity in der Standardregion",
  connectivity_regions: "Connectivity je Region",
  firewall_config: "Firewall-Regeln",
  firewall_admin_username: "Firewall-Administrator",
  firewall_bootstrap: "Firewall-Zugang initialisieren",
  firewall_api_secret_version: "Version des Firewall-Zugangs",
  landing_zones: "Landing-Zone-Projekte",
  sandboxes: "Sandboxes",
  landing_zone_namespace_services: "Kubernetes-Namespace-Dienste",
  acl: "Zugelassene Netze",
  action: "Aktion",
  aliases: "Adress- und Dienstgruppen",
  allow_opaque_secret_types: "Allgemeine Secret-Typen zulassen",
  allow_system_components: "Systemkomponenten zulassen",
  allowed_network_ranges: "Zugelassene Netzwerkbereiche",
  annotations: "Zusatzinformationen",
  assertions: "Identitätsbedingungen",
  assign_public_ip: "Öffentliche IP zuweisen",
  availability_zone: "Verfügbarkeitszone",
  availability_zones: "Verfügbarkeitszonen",
  backup_lan_ip: "Interne IP der Ersatz-Appliance",
  backup_name: "Name der Ersatz-Appliance",
  backup_wan_ip: "Externe IP der Ersatz-Appliance",
  backup_zone: "Verfügbarkeitszone der Ersatz-Appliance",
  boot_volume_size: "Systemlaufwerk (GB)",
  break_glass: "Zeitlich begrenzter Notfallzugriff",
  cluster: "Cluster",
  connections: "Verbindungen",
  contact_email: "Kontaktadresse",
  content: "Einträge",
  corporate: "Zentrale Netzwerkanbindung",
  create_zones: "DNS-Zonen erstellen",
  custom_roles: "Eigene Projektrollen",
  debug_bastion: "Diagnose-Bastion",
  default_nameservers: "Standard-DNS-Resolver",
  default_prefix_length: "Standard-Präfixlänge",
  default_ttl: "Standard-Gültigkeit (Sekunden)",
  demo_enabled: "Demo-Angebot bereitstellen",
  demo_metrics_ingestion: "Demo-Metriken einlesen",
  description: "Beschreibung",
  destination_invert: "Zielauswahl umkehren",
  destination_net: "Zielnetz",
  destination_port: "Zielport",
  dh_groups: "Schlüsselaustausch-Gruppen",
  direction: "Richtung",
  disable_nat: "Adressübersetzung deaktivieren",
  display_name: "Anzeigename",
  dns: "Namensauflösung",
  dns_name: "DNS-Name",
  dns_subdomain: "Subdomain",
  dns_zones: "DNS-Zonen",
  dpd_action: "Aktion bei nicht erreichbarem Partner",
  enable_kubernetes_version_updates: "Kubernetes automatisch aktualisieren",
  enable_machine_image_version_updates:
    "Systemabbild automatisch aktualisieren",
  enabled: "Aktiviert",
  encrypted_volumes: "Verschlüsselte Laufwerke",
  encryption_algorithms: "Verschlüsselungsverfahren",
  end: "Ende",
  endpoint: "Dienstadresse",
  env: "Umgebung",
  firewall: "Einzelne Firewall-Konfiguration",
  firewall_next_hop_ip: "Nächster Router über die Firewall",
  firewalls: "Firewalls je Netzwerkbereich",
  flavor: "Leistungsklasse",
  gateway: "Gateway",
  gateway_api: "Gateway-Unterstützung",
  git_flavor: "Git-Leistungsklasse",
  ha: "Hochverfügbarkeit",
  image: "Container-Abbild",
  image_id: "Systemabbild-ID",
  insecure: "Zertifikatsprüfung deaktivieren",
  install_kubectl: "Kubernetes-Werkzeug installieren",
  integrity_algorithms: "Integritätsverfahren",
  interface: "Netzwerkschnittstelle",
  interfaces: "Netzwerkschnittstellen",
  ip_protocol: "IP-Version",
  issuer: "Identitätsaussteller",
  item: "Geprüftes Identitätsmerkmal",
  kms_key_name: "Schlüsselname",
  kms_key_version: "Schlüsselversion",
  kms_keyring_name: "Schlüsselbund",
  kubernetes_access: "Kubernetes-Zugriff",
  kubernetes_version_min: "Mindestversion von Kubernetes",
  lan_ip: "Interne IP",
  lan_network_range: "Internes Netz (CIDR)",
  lan_vip: "Gemeinsame interne IP",
  link_scopes: "Überwachte Ressourcen",
  local_address: "Lokale Adresse",
  local_subnets: "Lokale Subnetze",
  log: "Verbindungen protokollieren",
  logs_retention_days: "Protokollaufbewahrung (Tage)",
  machine_type: "Maschinentyp",
  maintenance: "Wartungsfenster",
  max_prefix_length: "Größte Präfixlänge",
  maximum: "Maximale Anzahl",
  metrics_path: "Metrikpfad",
  metrics_retention_days: "Metrikaufbewahrung (Tage)",
  metrics_retention_days_1h_downsampling:
    "Stündliche Metriken aufbewahren (Tage)",
  metrics_retention_days_5m_downsampling:
    "5-Minuten-Metriken aufbewahren (Tage)",
  min_prefix_length: "Kleinste Präfixlänge",
  minimum: "Minimale Anzahl",
  mode: "Modus",
  name: "Name",
  namespace: "Kubernetes-Namespace-Name",
  naming_pattern: "Namenspräfix",
  nat_reflection: "Interne Weiterleitung über externe Adresse",
  network: "Cluster-Netzwerkanbindung",
  network_area: "STACKIT Network Area (SNA, Einzelkonfiguration)",
  network_area_key: "Netzwerkbereich",
  network_areas: "STACKIT Network Areas (SNAs)",
  network_enabled: "Lokales Projektnetz anlegen",
  network_prefix_length: "Präfixlänge des Projektnetzes",
  node_pools: "Knotengruppen",
  operator: "Vergleichsoperation",
  os_name: "Betriebssystem",
  outbound_nat: "Ausgehende Adressübersetzung",
  owner_emails: "Zusätzliche Verantwortliche",
  peering: "Tunnel-Endpunkte",
  permissions: "Berechtigungen",
  phase1: "Schlüsselaustausch",
  phase2: "Datenverschlüsselung",
  plan_id: "VPN-Leistungsklasse",
  plan_name: "Dienst-Leistungsklasse",
  port_forwards: "Portweiterleitungen",
  principals: "Berechtigte Identitäten",
  project_code: "Projektkürzel",
  project_name: "Projektname",
  project_owner_email: "Verantwortlich für die Sandbox",
  protocol: "Protokoll",
  quick: "Nach Treffer nicht weiter prüfen",
  ranges: "Adressbereiche (CIDR)",
  reader_emails: "Leseberechtigte",
  rekey_time: "Schlüsselwechselintervall",
  remote_address: "Gegenstellenadresse",
  remote_subnets: "Entfernte Subnetze",
  resource_id: "Ressourcen-ID",
  resource_type: "Ressourcenart",
  retention_days: "Aufbewahrung (Tage)",
  role: "Rolle",
  role_assignments: "Rollenzuweisungen",
  routes: "Routen",
  routing_type: "Routingverfahren",
  rules: "Zugriffsregeln",
  s3_object_lock: "Archiv gegen Änderungen und Löschung sperren",
  sample_load: "Demo-Arbeitslast",
  scheme: "Übertragungsverfahren",
  scrape_interval: "Abfrageintervall",
  scrape_timeout: "Abfrage-Zeitlimit",
  secrets_enforcement: "Regeln für Kubernetes-Secrets",
  secretsmanager: "Secrets Manager integrieren",
  secretsmanager_enabled: "Secrets Manager bereitstellen",
  sequence: "Reihenfolge",
  service_account_name: "Kubernetes-Dienstkonto",
  sna_enabled: "Private Kubernetes-API über SNA",
  sna_network_area_id: "Vorhandene Netzwerkbereichs-ID",
  sna_network_prefix_length: "Präfixlänge des Cluster-Netzes",
  source_invert: "Quellauswahl umkehren",
  source_net: "Quellnetz",
  source_port: "Quellport",
  ssh_allowed_cidrs: "Zugelassene SSH-Netze",
  ssh_public_key: "Öffentlicher SSH-Schlüssel",
  ssh_public_key_path: "SSH-Schlüsseldatei auf dem Runner",
  start: "Beginn",
  start_action: "Aktion beim Tunnelstart",
  static_routes: "Statische Routen",
  stats: "Statistik aktivieren",
  storage_class_name: "Kubernetes-Speicherklasse",
  subject: "Benutzer oder Dienstkonto",
  target_ip: "Weiterleitungsziel-IP",
  target_port: "Weiterleitungsziel-Port",
  target_urls: "Metrikquellen",
  traces_retention_days: "Trace-Aufbewahrung (Tage)",
  transfer_network: "Transfernetz (CIDR)",
  ttl_hours: "Gültigkeit (Stunden)",
  tunnel1: "Tunnel 1",
  tunnel2: "Tunnel 2",
  type: "Art",
  update_freq: "Aktualisierungsintervall",
  value: "Vergleichswert",
  vhid: "Virtuelle Router-ID",
  volume_performance_class: "Speicher-Leistungsklasse",
  volume_size: "Laufwerksgröße (GB)",
  volume_type: "Speichertyp",
  vpn: "STACKIT VPN",
  wan_ip: "Externe IP",
  wan_network_range: "Externes Netz (CIDR)",
  zone: "Verfügbarkeitszone",
  zones: "Zonen",
};
export const hints: Record<string, string> = {
  organization_id:
    "Die ID findest du in den Organisationsdetails im STACKIT Portal.",
  company_code:
    "Präfix für Ressourcennamen. Bereits verwendete Kürzel nur bewusst ändern.",
  project_code:
    "Wird im Ressourcennamen verwendet. Die stabile Kennung ordnet dagegen die Konfiguration zu.",
  connectivity:
    "Connectivity bündelt SNAs, DNS, Firewalls und VPN in der unter Grundlagen gewählten Region. Alternativ Connectivity je Region verwenden; nicht beide Varianten gleichzeitig.",
  network_area:
    "Eine STACKIT Network Area (SNA) mit regionalen Adressbereichen. Ältere Einzelkonfiguration mit der Kennung default; über die Umstellung können mehrere SNAs verwaltet werden.",
  network_areas:
    "SNAs trennen beispielsweise Produktion, Entwicklung oder Mandanten. Corporate-Projekte referenzieren ihre Kennung.",
  connectivity_regions:
    "Pro Region (eu01/eu02) können null bis mehrere SNAs konfiguriert werden. Landing-Zone-Projekte benötigen in dieser Variante eine ausdrückliche Region. Der Accelerator erstellt getrennte SNAs je Region; gleiche Kennungen verbinden Regionen nicht automatisch.",
  firewalls:
    "Die Kennungen müssen zu den Netzwerkbereichen passen. Richtlinien für mehrere Appliances sind noch eingeschränkt.",
  sna_enabled:
    "Die private Kubernetes-API ist vom aktuellen CF-Runner nicht nachweislich erreichbar. Siehe Issue #37.",
  s3_object_lock:
    "Ohne eigene Einstellung ist diese Sperre im Accelerator eingeschaltet. Aufbewahrungsregeln vor dem Deployment prüfen.",
  firewall_config:
    "Die aktuelle Policy-Anbindung unterstützt nur die einzelne nichtregionale Firewall. Issue #65 verfolgt mehrere Appliances.",
  landing_zone_namespace_services:
    "Erstellt Kubernetes-Namespaces und zugehörige Dienste auf dem Plattform-Cluster für ausgewählte Landing-Zone-Projekte. Die Kennung wählt das Projekt. Regionale Clusterzuordnung ist noch eingeschränkt (#80).",
  rm_folders:
    "Die Rollen platform, landing_zones_public, landing_zones_corporate und sandboxes bestimmen die Projektzuordnung. Anzeigenamen sind frei wählbar.",
  ssh_public_key_path:
    "Bezieht sich auf das Dateisystem des späteren Runners, nicht auf deinen Computer. Alternativ den öffentlichen Schlüssel hinterlegen.",
};
export const labelFor = (name: string) => t(labels[name] ?? name);

export function fieldLabel(path: string, name: string): string {
  if (name === "observability" && path.startsWith("platform_kubernetes"))
    return t("Cluster-Monitoring · STACKIT Observability");
  if (path === "observability") return t("Zentrale STACKIT Observability");
  if (name === "debug_bastion")
    return t("Diagnose-Bastion für das private Cluster-Netz");
  return t(labelFor(name));
}
export function fieldDescription(
  path: string,
  name: string,
): string | undefined {
  if (name === "organization_owners")
    return t(
      "Vergibt die STACKIT-IAM-Rolle owner auf Organisationsebene an diese Personen. Das sind weitreichende Cloud-Berechtigungen, keine Platform-Engineer-Rollen im Configurator.",
    );
  if (name === "organization_auditors")
    return t(
      "Vergibt die STACKIT-IAM-Rolle organization.auditor auf Organisationsebene. Dies ist keine Configurator-Mitgliedschaft.",
    );
  if (name === "owner_emails" && path.startsWith("rm_folders"))
    return t(
      "Vergibt die STACKIT-IAM-Rolle owner auf diesem Ordner. Diese Cloud-Berechtigungen sind unabhängig von Rollen im Configurator.",
    );
  if (name === "reader_emails" && path.startsWith("rm_folders"))
    return t(
      "Vergibt die STACKIT-IAM-Rolle auditor auf diesem Ordner. Es werden keine Configurator-Mitgliedschaften angelegt.",
    );
  if (name === "observability" && path.startsWith("platform_kubernetes"))
    return t(
      "Der Accelerator erstellt derzeit eine zusätzliche STACKIT Observability-Instanz im Cluster-Projekt und verbindet sie mit dem SKE-Monitoring. Dies ist kein Dienst im Kubernetes-Cluster. Die Wiederverwendung einer bestehenden oder zentral definierten Instanz wird in Issue #88 ergänzt. Anwendungsmetriken benötigen eine eigene Anbindung.",
    );
  if (path === "observability")
    return t(
      "Erstellt STACKIT Observability im zentralen Management-Projekt. Diese Instanz wird derzeit nicht automatisch für das Cluster-Monitoring wiederverwendet (Issue #88). Der STACKIT Telemetry Router gehört separat zur Audit-Protokollierung.",
    );
  if (name === "debug_bastion")
    return t(
      "Eine eigenständige virtuelle Maschine im SNA-Netz des Plattform-Clusters, kein Kubernetes-Pod. Im aktuellen Accelerator wird sie nur mit diesem Cluster-Projekt erstellt und benötigt dessen SNA-Anbindung. Ein unabhängig konfigurierbarer Bastion-Host wird in Issue #87 verfolgt. Sie stellt noch keinen Netzwerkzugang für den Configurator-Runner her.",
    );
  return t(hints[name]);
}
