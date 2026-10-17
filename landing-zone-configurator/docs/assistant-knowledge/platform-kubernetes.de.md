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

Natives `platform_kubernetes` ist eine Map mit Schluesseln.
Eintraege definieren Region, Cluster (`name/version/node_pools/maintenance`),
`network`, `dns`, `observability`, `encrypted_volumes`, `debug_bastion` und
`role_assignments`.
Netzwerkeinstellungen umfassen `sna_enabled`, `network_area_key` und `prefix`;
Root loest native Area-Referenzen oder eine explizit gebundene externe Area auf.
Regionale Modulaufrufe waehlen eu01/eu02.
KMS-gestuetzte Storage-Class-Konfiguration unterscheidet sich von der
Aktivierung von Verschluesselung fuer alle Volumes.
Debug-Bastion ist ein getrenntes VM-/SSH-Zugangsfeature.
Geschuetztes `platform_kubernetes_kube_config_override` ist keine normale
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
ein /24-Netzpraefix oder Schluessel-Default reicht nicht fuer Zusagen
ueber 100 Workloads, Cluster-Quoten oder Isolation je Namespace.

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
