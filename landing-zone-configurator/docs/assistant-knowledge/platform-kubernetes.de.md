<a id="platform-kubernetes-kms-and-bastion"></a>

# Plattform-Kubernetes, KMS und Bastion

[English](platform-kubernetes.md) | [Deutsch](platform-kubernetes.de.md)

Deutsche Lesefassung. Der Assistant liest ausschliesslich die englische Quelle.

<a id="purpose"></a>

## Zweck

Gemeinsame STACKIT-Kubernetes-Infrastruktur mit bewusst gewaehlten Netzen,
Node-Pools und unterstuetztem optionalem DNS, Monitoring, verschluesseltem
Speicher und Debug-Zugang erstellen.
Dies sind getrennte Entscheidungen, keine impliziten Teile einer SNA-Anfrage.

<a id="accelerator-contract"></a>

## Accelerator-Vertrag

`platform_kubernetes` ist eine Map mit stabilen Schluesseln.
Jeder Eintrag enthaelt `region` und `cluster` mit `name`,
`kubernetes_version_min`, `node_pools` und `maintenance`.
Pools bestimmen `name`, `machine_type`, `minimum`/`maximum`,
`availability_zones` und optionale Systemkomponenten-, Volume-, OS- und Label-Werte.
`network` enthaelt `sna_enabled`, `network_area_key`, `sna_network_area_id`,
`firewall_next_hop_ip` und `sna_network_prefix_length`; Root loest native
Area-Schluessel oder eine explizit gebundene externe Area fuer eu01/eu02 auf.
`dns`, `observability`, `encrypted_volumes`, `debug_bastion` und
`role_assignments` sind getrennte Optionen.
KMS-gestuetzte Storage-Classes verschluesseln nicht automatisch alle Volumes.
Debug-Bastion ist ein getrenntes VM-/SSH-Feature.
Geschuetztes `platform_kubernetes_kube_config_override` ist keine oeffentliche
Chat-Konfiguration.

<a id="dependencies"></a>

## Abhaengigkeiten

SNA/Region fuer Corporate-Modus, Governance/Plattform-Ownership und
Zugangsdaten-Grundlagen.
DNS und Observability sind unabhaengige verschachtelte Optionen.
KMS benoetigt Rechte und kompatiblen Speicher; Namespaces verwenden den
unterstuetzten Cluster-/Provider-Pfad.
Public-Modus bedeutet nicht automatisch private Erreichbarkeit.

<a id="dialogue"></a>

## Dialog

Workload-Groesse, private/oeffentliche Konnektivitaet,
Node-Pool-/System-Workload-Rollen, Verfuegbarkeit, Wartung,
Speicherverschluesselung und Betriebszugang erfragen.
Aktuelle Versionen/Maschinen/Zonen/Volumes verwenden, keine statischen
Default-SKUs.
Niemals eine Bastion erzeugen, SSH fuer alle Netze oeffnen oder Demos
aktivieren, nur um SNA zu testen.

<a id="examples"></a>

## Beispiele

Synthetische Deaktivierung: `platform_kubernetes = {}`.
Ein aktivierter Eintrag benoetigt bestaetigte Cluster-/Node-Pool-Einstellungen;
ein /24-Netzpraefix oder Schluessel-Default garantiert weder freie Adressen,
Workload-Kapazitaet, Cluster-Quoten noch Isolation je Namespace.

<a id="limits"></a>

## Grenzen

Native Editor-Vorschlaege unterstuetzen gepruefte oeffentliche
Cluster-/KMS-/Bastion-Einstellungen, keine Zugangsdaten oder Deployments.
Region, Praefixgrenzen, Node-Minimum/-Maximum, System-Pools und Area-Referenzen
validieren. Template-Defaults koennen regionsspezifische Zonen enthalten.
Cluster-interne Konnektivitaet, Provider-Zugang, KMS-Nutzung und Node-Gesundheit
benoetigen getrennte echte Ausfuehrungsqualifikation.

<a id="credentials"></a>

## Zugangsdaten

Provider-/KMS-Rechte, Kubernetes-Zugang und Bastion-SSH sind verschiedene
sichere Bindungen.
Niemals kubeconfig-Inhalte, private SSH-Schluessel oder KMS-Secret-Material
erfragen; extern gelieferte Overrides muessen mit dem nativen Vertrag
funktionieren.

<a id="sources"></a>

## Quellen

Root-Aufrufe, Cluster-/Bastion-Variablen, Provider und gemeinsame Validierung
definieren den geprueften Umfang.
DNS-/Regions-/Provider- und Verschluesselungsaenderungen vor Generierung
erneut pruefen; Markdown zertifiziert keine Private-Cluster-Ausfuehrung.
