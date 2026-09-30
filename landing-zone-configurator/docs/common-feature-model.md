# Gemeinsames Funktionsmodell des Landing Zone Configurators

Stand: 2026-09-30. Architekturentscheidung nach Benutzerfeedback zur Projekt-/Ordnerauswahl.
**Die Templates sind Voreinstellungen desselben Accelerators. Sie definieren nicht den Funktionsumfang des Editors.**

Diese Entscheidung ersetzt den Ausbau des Standalone-Editors um einen isolierten
Corporate-/Einzelbereich-Sonderfall. Die laufende Version bleibt bis zur Umsetzung
unverändert. Die beanstandete feste Projektzuordnung ist damit noch nicht behoben;
das erste neue UI-Inkrement muss sie auf dem gemeinsamen Modell lösen.

## Verbindliche Quelle und Vollständigkeit

1. Freigegebener Accelerator-Commit: `a256f6896d11134fdc351786f1be5eba4e56b2e2`.
   Der aktuelle lokale `src`-Stand stimmt damit überein.
2. `src/variables.tf`: 28 Root-Eingaben einschließlich verschachtelter Typen,
   optionaler Werte, tatsächlicher Defaults, sensibler Eingaben und Validierungen.
3. Alle Root-Dateien: insbesondere `main.tf`, `providers.tf`,
   `_landing-zone-kubernetes.tf` und `_firewall-bootstrap.tf`. Diese bestimmen,
   welche Funktionen kombiniert werden können und wann sie ausführbar sind.
4. Modulimplementierungen: tatsächliche Ressourcen, Benennung, Elternbeziehungen,
   Rollen, Voraussetzungen und Nebenwirkungen. Ein Parameter eines Untermoduls,
   den der Root-Aufruf nicht durchreicht, ist noch keine verfügbare UI-Option.
5. Alle acht Configs sind Referenzfälle; kommentierte Beispiele zählen nicht als
   aktivierte oder getestete Funktionen.

Das generierte [Eingabeinventar](accelerator-inputs.json) enthält alle 28 Eingaben
mit Typbaum, optionalen Defaults, Quellzeile und Validierungsblöcken. Sensible
Defaultwerte werden ausgelassen. Es ist eine technische Vollständigkeitsgrundlage,
kein automatisch gerendertes Terraform-Variablenformular. Fachliche Bezeichnungen,
Abhängigkeiten, Verfügbarkeit und UI-Komponenten kommen aus dem gemeinsamen Modell.

Aktualisieren und prüfen:

```sh
cd landing-zone-configurator/tools/hcl-adapter
go run . -variables-source ../../../src/variables.tf -output ../../docs/accelerator-inputs.json
go run . -variables-source ../../../src/variables.tf -output ../../docs/accelerator-inputs.json -check
```

Die Validierungspipeline prüft die Aktualität. Bei einer Accelerator-Aktualisierung
müssen zusätzlich die Modulverdrahtung, erlaubte Kombinationen und Compilerregeln
fachlich geprüft werden; ein aktuelles JSON-Inventar allein genügt nicht.

## Referenzkonfigurationen

| Referenz | Abdeckung |
| --- | --- |
| Standalone | Minimaler Einstieg, Public-Projekte und Sandboxes |
| Hub & Spoke | Ein Netzwerkbereich, Corporate und Public, Sandboxes |
| Hub & Spoke Firewall | Appliance im Einzelbereich |
| Multi-Area | Mehrere Bereiche und ausdrückliche Projektzuordnung |
| Multi-Region | eu01/eu02, regionale Bereiche und Plattform-Kubernetes |
| Prod/Nonprod Firewall | Mehrere Bereiche mit zugeordneten Firewalls |
| Finance & Research | Unterschiedliche DNS-/Netzwerkanforderungen je Bereich |
| Tenant Isolation | Drei getrennte Bereiche und zugeordnete Projekte |

**Multi-Region und Prod/Nonprod Firewall bilden gemeinsam die strukturelle Referenz.**
Zusätzliche Testfälle decken Funktionen ab, die keine Vorlage aktiv nutzt, etwa VPN,
Audit-Logs, föderierte Identitäten, Firewall-HA und Namespace-Dienste. Ein künstliches
„alles eingeschaltet“-Template wäre keine ausreichende Referenz: einige Kombinationen
sind im Accelerator derzeit nicht implementiert.

## Vollständige fachliche Funktionsbereiche

| Bereich | Unterfunktionen | Root-Eingaben |
| --- | --- | --- |
| Grundlagen | Organisation, Verantwortliche, Anzeigename, Kürzel, Standardregion, Labels | `organization_id`, `owner_email`, `company_name`, `company_code`, `region`, `labels` |
| Organisation und Ordner | Gemeinsamer vorhandener Parent, Ordnerrollen und Anzeigenamen, zusätzliche Ordner, Owner/Auditor-Zuordnungen | `rm_folder_parent_id`, `rm_folders`, `organization_owners`, `organization_auditors` |
| Management | Verpflichtendes Management-Projekt, State-Bucket, optionale zentrale Observability, Audit-Routing/Archivierung, Aufbewahrung/Object Lock, föderierte Identitäten | `observability`, `audit_logs`, `federated_identity_providers`; Grundressourcen automatisch |
| Konnektivität | Regionen, 0..n Netzwerkbereiche je Region, Adresspools, Transfernetze, Präfixgrößen, Resolver, DNS-Zonen und Zuordnung | `connectivity`, `connectivity_regions` |
| Firewall-Infrastruktur | Appliance je unterstütztem Bereich, Größe/Zone/Netze/IPs, optional HA/CARP | Unterfelder von `connectivity`/`connectivity_regions` entsprechend Root-Verdrahtung |
| VPN | Gateway, Plan/Routingart, Verbindungen, zwei Tunnel, Gegenstellen, Routen/Subnetze, IKE/IPsec-Einstellungen | `connectivity.vpn`, `vpn_pre_shared_keys`; regionale Unterstützung separat prüfen |
| Firewall-Policy | Aliase, Routen, Regeln, ausgehendes NAT, Portweiterleitungen, Endpoint/TLS | `firewall_config` |
| Firewall-Zugänge und Ausführungsphase | Benutzer, Passwort/API-Zugang, Erstinitialisierung, Secret-Version | `firewall_admin_username`, `firewall_admin_password`, `firewall_api_credentials`, `firewall_bootstrap`, `firewall_api_secret_version` |
| DevOps | Git-Service, zugelassene Netze und automatisch abgeleitetes Plattformprojekt | `devops` |
| Plattform-Kubernetes | Regionale Cluster, Node-Pools, Netzwerk-/Bereichsbezug, DNS/Gateway, Observability, verschlüsselte Volumes/KMS, Bastion/SSH, Rollen | `platform_kubernetes` |
| Kubernetes-Zugang | Geschützter Clusterzugang für unterstützte Folgeschritte | `platform_kubernetes_kube_config_override` |
| Landing-Zone-Projekte | Public/Corporate, Region und Netzwerkbereich, stabile Kennung, Kürzel, Umgebung, Verantwortliche, Netzgröße, Rollen/Custom Roles, Secrets Manager und Observability | `landing_zones` |
| Sandbox-Projekte | Name, Verantwortliche und zusätzliche Owner | `sandboxes` |
| Namespace-Dienste | Namespace/DNS, Kubernetes-Zugriff, Secrets-Integration und Policy-Modi, Break-glass, Labels/Annotations, optionale Demo/Last/Metriken | `landing_zone_namespace_services` |

Diese Tabelle ordnet jede Root-Eingabe zu. Unterfelder sind im Inventar enthalten;
die UI-Abdeckung wird zukünftig **pro Unterfunktion/Feld** geführt, nicht nur pro
Top-Level-Schalter. Demo- und Diagnosefunktionen erscheinen getrennt von den
üblichen Produktionsfunktionen.

## Gemeinsames Dokument und Compiler

Ein versioniertes, templateunabhängiges Dokument beschreibt die fachlichen Objekte:

- Herkunft: ursprüngliche Vorlage und Quellhash, freigegebene Accelerator-Revision.
- Organisation, Ordnerrollen und Rechte.
- Regionen und Netzwerkbereiche mit stabilen IDs; Referenzen statt Positionsbezug.
- Plattformdienste und deren Bereichs-/Regionszuordnung.
- Eine gemeinsame Liste von Projekten mit expliziter Art, stabiler Identität,
  Region, optionalem Netzwerkbereich und projektspezifischen Diensten.
- Sicherheits-/Betriebsfunktionen und Namespace-Angebote mit expliziten Bezügen.

Passwörter, VPN-Schlüssel, API-Secrets und Kubeconfigs gehören **nicht** in das
Git-Dokument, den Browser-Arbeitsstand oder die Chat-Historie. Der Dokumentinhalt
benennt erforderliche Zugänge; persönliche Zuordnung und Secret-Referenzen liegen
serverseitig in Deployment-Profilen und Secrets Manager.

Die gemeinsame Verarbeitung lautet:

```text
Template / gespeicherte Config / Chat-Änderung
                  ↓
        Import + Versionsmigration
                  ↓
    gemeinsames fachliches Dokument
          ↙             ↘
    Formular-UI       Struktur-/Netzansicht
                  ↓
      gemeinsame fachliche Validierung
                  ↓
    versionierter deterministischer Compiler
                  ↓
       natives tfvars + Deployment-Anforderungen
```

Formular, Chatbot, Grafik und Export verwenden dasselbe Modell. Es gibt keine
separaten Featurelisten je Template. Template-Wechsel ist eine ausdrücklich
bestätigte neue Voreinstellung; er darf vorhandene Benutzeränderungen nicht
stillschweigend ersetzen. Für bestehende Konfigurationen ist die Herkunft kein
Feature-Limit.

Import/Export unterscheiden **nicht gesetzt**, **explizit null/deaktiviert** und
**explizit konfiguriert**. Anzeige wirksamer Defaults darf nicht beim bloßen Öffnen
jede Option in den Export schreiben. Unbearbeitete Werte bleiben erhalten.
Zusätzlich ist eine bewusste Normalisierung der beiden unterstützten Connectivity-
Eingabeformen nötig; beide dürfen nicht parallel als aktive Quellen exportiert werden.

Version 1/2 der bereits gespeicherten Standalone-Dokumente bekommt einen geprüften
Migrationsadapter. Keine stillen Änderungen an Schlüsseln, Ressourcenadressen,
Ordnerzuordnung oder alten tfvars-Hashes. Alte Deployment-Vorbereitungen bleiben
unveränderlich; Änderungen erzeugen neue Revisionen und Vorbereitungen. Die
unveröffentlichte Einzelbereich-Prototypversion 3 wird nicht als Format festgeschrieben.

## Projektarten und grafische Darstellung

Eine gemeinsame Projektliste ersetzt die implizite Trennung in obere Landing-Zone-
und untere Sandbox-Formulare. Beim Anlegen und Bearbeiten werden angezeigt:

| Projektart | Zielordnerrolle | Weitere Auswahl |
| --- | --- | --- |
| Public | `landing_zones_public` | Region, Projektdienste; keine automatische öffentliche Freigabe |
| Corporate | `landing_zones_corporate` | Region **und vorhandener Netzwerkbereich dieser Region** |
| Sandbox | `sandboxes` | Sandbox-spezifische Angaben |
| Plattformprojekt | `platform` | Wird durch Management/Connectivity/DevOps/Kubernetes erzeugt; keine beliebige vierte Projektart |

Die UI zeigt jeweils den tatsächlich konfigurierten Ordnernamen. Netzwerkbereiche
werden im Netzwerkbereich des Editors verwaltet und ausdrücklich referenziert;
ein Corporate-Projekt erzeugt keinen versteckten zweiten Netzwerk-Konfigurationspfad.
Das Entfernen eines Bereichs mit Referenzen wird blockiert. Projektartwechsel zeigen
Auswirkungen auf Daten, Zuordnung und Ressourcenidentitäten und benötigen eine
bewusste Bestätigung; bestehende Ressourcen werden dadurch noch nicht angewendet.

Die Grafik verwendet zwei zusammenhängende Ansichten:

1. **Organisation:** Organisation → optionaler Parent → Ordner → Projekte und
   relevante Angebote, einschließlich automatisch erzeugter Plattformprojekte.
2. **Netzwerk:** Region → Netzwerkbereiche → zugeordnete Corporate-Projekte,
   Firewall/VPN/DNS. Public und Sandbox bleiben entsprechend ungebunden.

Ein Netzwerkbereich ist kein Resource-Manager-Ordner. Mehrere Bereiche in einer
Region können mehrere Hub-Projekte erzeugen; die bisherige pauschale Darstellung
„ein Hub je Region“ muss dafür ersetzt werden.

## Editor-Struktur und Abhängigkeiten

Fachbereiche: **Grundlagen → Organisation/Ordner → Netzwerk → Plattform → Projekte
→ Sicherheit/Betrieb → Prüfen**. Eine Funktionsübersicht zeigt aktivierte Angebote
und Ergänzungsmöglichkeiten. Optionale Details erscheinen bei Bedarf, bleiben aber
für jede Vorlage erreichbar. Es werden keine Terraform-Variablennamen als primäre
Bedienoberfläche verwendet.

Jede Featuredefinition erhält stabile ID, fachliche Erklärung, Konfigurationsschema,
Default-/Aktivierungsregeln, Referenzen/Abhängigkeiten, zuständigen Editor,
Grafikprojektion, Compilerabbildung und Testfälle. Getrennte Zustände:

- im Accelerator-Stand vorhanden;
- in der aktuellen Kombination zulässig;
- im Editor umgesetzt;
- für Plan/Apply in der aktuellen Ausführungsphase unterstützt.

So wird eine vorhandene Engine-Funktion nicht fälschlich als bereits ausführbare
Configurator-Funktion angeboten. Das Ziel bleibt vollständige UI-Abdeckung; die
Migration wird nicht als „alle Features fertig“ ausgegeben.

## Bereits festgestellte Kombinationsgrenzen

Das [Grenzen- und Issue-Register](accelerator-limitations.md) ordnet die Befunde
den Accelerator-Issues zu und trennt Modellierbarkeit von Ausführbarkeit.

- Private/SNA-Kubernetes-APIs sind vom aktuellen CF-Runner nicht nachweislich
  erreichbar ([#37](https://github.com/stackitcloud/stackit-landing-zone/issues/37)).
  Kubernetes-/Helm-Phasen dürfen erst mit geeignetem Netzwerkpfad ausgeführt werden.
  Serverseitige Capability-Prüfung ist Voraussetzung der Modellerweiterung;
  die private Runner-Anbindung wird separat umgesetzt.

- Corporate referenziert einen existierenden Bereich; mit regionaler Connectivity
  muss die Projektregion im regionalen Modell vorhanden sein (`variables.tf`).
- Regionale Root-Instanzen unterstützen derzeit eu01/eu02. Beliebige weitere Regionen
  brauchen zuerst Unterstützung im Accelerator.
- Bei `connectivity.firewalls` müssen die Schlüssel zu `network_areas` passen.
- `firewall_config` ist aktuell an die einzelne `connectivity.firewall` gebunden.
  Die Policy-UI darf daraus keine beliebige Multi-Area-/Multi-Region-Unterstützung ableiten.
- Namespace-Dienste benötigen genau eine passende Instanz des nichtregionalen
  `module.platform_kubernetes`; die Root-Dateien verwenden zudem `module.landing_zone`.
  Die Multi-Region-Kubernetes-Vorlage beweist daher keine regionale Namespace-Unterstützung.
- Firewall-Bootstrap und spätere Kubernetes-/VPN-Schritte können mehrere
  Ausführungsphasen und geschützte Laufzeitinformationen benötigen. Diese Phasen
  werden vom Deployment-Modell gesteuert, nicht durch einen normalen Feature-Schalter.
- Kommentare sind keine verlässlichen Defaults: Bei Audit-Logs beschreibt der Text
  Object Lock als aus, während der tatsächliche optionale Default `true` ist.
  Die UI muss die wirksame Einstellung ausdrücklich zeigen. Ebenso wird eine
  Ordnerbeschreibung zwar im Root-Typ akzeptiert, aber nicht bis zur Ressource durchgereicht.
- Einige Moduloptionen, etwa Governance-Custom-Roles oder bestimmte ACLs, werden vom
  Root-Aufruf nicht durchgereicht. Änderungen am Accelerator wären ein eigener Umfang.

## Umsetzung und Abnahme

### A – Vollständige Grundlage

- [x] Alle acht Templates und 28 Root-Eingaben aufnehmen.
- [x] Verschachtelte Typen, Defaults und Validierungen automatisch extrahieren.
- [x] Sensible Defaults aus dem Inventar ausschließen und testen.
- [x] Inventar-Aktualität in CI prüfen.
- [x] Funktionsbereiche, Projektmodell und wesentliche Kombinationsgrenzen festlegen.
- [ ] Feld-/Unterfunktionsabdeckung als maschinenprüfbaren Feature-Katalog abbilden.

### B – Gemeinsames Modell und kompatibler Compiler

- [ ] Versioniertes Dokument unabhängig von Standalone implementieren.
- [ ] Alle acht Templates verlustfrei importieren, Herkunft und stabile IDs erhalten.
- [ ] Legacy-Adapter für Dokumentversion 1/2 und lokale Arbeitsstände.
- [ ] Referenz-/Default-/Deaktivierungsregeln zentral validieren.
- [ ] Export mit echtem HCL-Parser semantisch rückvergleichen; unveränderte
  Legacy-Konfigurationen zusätzlich bytegleich prüfen.
- [ ] Pro Referenzkonfiguration native OpenTofu-Tests mit Mock-Providern, kein Apply.

### C – Erster vollständiger Bedienablauf auf dem gemeinsamen Modell

- [ ] Ordner, Regionen und mehrere Netzwerkbereiche bearbeiten.
- [ ] Gemeinsame Projektliste mit Public/Corporate/Sandbox und sichtbaren Zielordnern.
- [ ] Region-/Bereichsauswahl für Corporate; Plattformprojekte aus Modulen ableiten.
- [ ] Organisations- und Netzwerkansicht aus denselben Daten erzeugen.
- [ ] Fork-Speicherung, Wiederaufnahme, Navigation und bestehende Vorbereitungen prüfen.

### D – Vollständige Feature-Abdeckung

- [ ] Management/Governance, DevOps und Observability/Audit/Federation.
- [ ] DNS, Firewall je unterstütztem Bereich, HA, VPN und unterstützte Policy-Funktionen.
- [ ] Kubernetes/Node-Pools, KMS/Volumes, Bastion, Namespace-Dienste und Zugriff.
- [ ] Secret-Bindings und Ausführungsphasen je Funktion abnehmen.
- [ ] Chat-Werkzeuge auf denselben Katalog und dieselbe Validierung aufsetzen.
- [ ] Abdeckungsmatrix: kein unterstütztes Unterfeld ohne UI, Import/Export und Tests.

### Release-Grenzen

Nur Feature-Branch. Der bisherige Stand bleibt live, bis das jeweilige Inkrement
vollständig getestet ist. Kein Kunden-Apply ohne neue ausdrückliche Freigabe; kein
Destroy. Ein komplexes Template darf nicht automatisch einen Kunden-Plan oder
Ressourcenaufbau starten. Configurator-Infrastrukturfreigabe bleibt davon getrennt.
