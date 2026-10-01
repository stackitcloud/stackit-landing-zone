# Accelerator-Grenzen im Configurator

Stand: 2026-09-30. Die unten genannten Quellbefunde wurden zusätzlich gegen
Accelerator `main` unter Commit `2bb7c755692674ad619ffc46a0a17a781f019106`
geprüft. Die neuen Issues enthalten Quell-Permalinks und Abnahmekriterien.
Es handelt sich um Quellprüfung, nicht um einen Nachweis durch Kunden-Apply.
Der Configurator verwendet weiterhin seine separat freigegebene Engine-Version.

## Erfasste Grenzen

| Issue | Grenze | Konsequenz für den Configurator |
| --- | --- | --- |
| [#37](https://github.com/stackitcloud/stackit-landing-zone/issues/37) | Private/SNA-SKE-API vom öffentlichen Runner nicht erreichbar; zweistufiges Runner-Modell offen. | Kubernetes-/Helm-Provider-Operationen benötigen nachgewiesene private Erreichbarkeit. Zugangsdaten allein reichen nicht. Umsetzung separat. |
| [#65](https://github.com/stackitcloud/stackit-landing-zone/issues/65) | Policy-Automatisierung für mehrere Firewall-Appliances fehlt. | Mehrere Appliances im Infrastrukturmodell bedeuten nicht automatisch unterstützte Policies je Appliance. |
| [#64](https://github.com/stackitcloud/stackit-landing-zone/issues/64) | Automatische Inter-Region-VPN-Verbindungen und Routing fehlen. | Mehrere Regionen dürfen keine implizite Verbindung suggerieren. |
| [#22](https://github.com/stackitcloud/stackit-landing-zone/issues/22) | Ordnerlöschung bei zur Löschung vorgemerkten Projekten schlägt fehl. | Kein Destroy-Angebot; Kunden-Apply weiterhin nur nach gesonderter Freigabe. |
| [#69](https://github.com/stackitcloud/stackit-landing-zone/issues/69) | Projekte ohne standardmäßige Owner-Zuweisung noch offen. | Keine nicht unterstützte ownerlose Projektanlage anbieten. |
| [#80](https://github.com/stackitcloud/stackit-landing-zone/issues/80) | Namespace-Dienste referenzieren nichtregionale Cluster-/Projektmodule. | Regionale Cluster erfordern explizite passende Provider-/Projektzuordnung. Unabhängig von #37 auch bei öffentlicher API relevant. |
| [#81](https://github.com/stackitcloud/stackit-landing-zone/issues/81) | Audit-Object-Lock: tatsächlicher optionaler Default ist `true`, Beschreibung sagt aus. | Wirksamen Wert sichtbar machen; keine stille Änderung des Defaults beim Import/Export. |
| [#82](https://github.com/stackitcloud/stackit-landing-zone/issues/82) | `rm_folders.description` wird akzeptiert, aber nicht zur Ressource durchgereicht. | Kein wirksames Beschreibungsfeld versprechen, solange die Anbindung fehlt. |
| [#83](https://github.com/stackitcloud/stackit-landing-zone/issues/83) | Governance-Custom-Roles und Landing-Zone-Secrets-Manager-ACLs sind nur auf Modulebene vorhanden. | Erst nach geklärtem Root-Vertrag als konfigurierbare Features anbieten. Bestehende projektbezogene Custom Roles sind davon zu unterscheiden. |
| [#84](https://github.com/stackitcloud/stackit-landing-zone/issues/84) | Standalone lässt beim Public-Beispiel `corporate = false` aus; tatsächlich greift `true` ohne Connectivity. | Verlustfreier Import zeigt die fehlende Bereichsreferenz. Legacy-Editor exportiert bereits explizit Public und bleibt unverändert. |

#80–#83 wurden im Rahmen dieser Prüfung neu angelegt. #37 und #65 werden
weiterverwendet; dafür gibt es keine zusätzlichen Duplikate.
Gültige Bereichsreferenzen, konsistente Firewall-Schlüssel und die aktuell
unterstützten Regionen sind Validierungsregeln, nicht automatisch neue Defekte.

## Private Kubernetes-API: Ausführungsgrenze

Der aktuelle CF-Runner hat keinen nachgewiesenen Netzwerkpfad in die Kunden-SNA.
Authentifizierung beim STACKIT-API und erfolgreicher Organisations-Zugriff beweisen
weder Routing noch DNS, TLS oder Kubernetes-Berechtigungen für die Cluster-API.
Auch ein Plan kann beim Provider-Refresh diesen Zugriff benötigen.

Der aktuelle veröffentlichte Editor unterstützt nur den Standalone-Vertrag.
Die folgenden Regeln sind Anforderungen an die Erweiterung des gemeinsamen Modells;
sie sind **noch keine implementierte SNA-Erreichbarkeitsprüfung**:

- Konfigurationen dürfen bearbeitet und gespeichert werden, auch wenn eine
  Ausführungsphase auf dem verfügbaren Runner noch nicht unterstützt wird.
- Vor dem Dispatch muss das Backend die benötigten Provider und Ausführungsphasen
  prüfen. Eine private Kubernetes-/Helm-Phase bleibt ohne geeigneten Runner gesperrt;
  die UI erklärt den Grund und verweist auf #37.
- Der heutige vollständige Root-Lauf ist kein bereits implementierter
  Infrastruktur-only-Workaround. Die Trennung der Phasen gehört zu #37.
- Kein automatisches Umschalten auf öffentliche Cluster-APIs, kein TLS-Bypass und
  keine implizite Tunnel-Lösung als Ersatz für den fehlenden Netzwerkpfad.
- Regionale Clusterzuordnung (#80) und Netzwerk-Erreichbarkeit (#37) werden getrennt
  geprüft. Das Beheben einer Grenze beseitigt die andere nicht.

## Abnahme und Pflege

- [x] Bestehende offene und geschlossene Issues auf Überschneidungen prüfen.
- [x] Zusätzliche bestätigte Grenzen mit Quellbelegen als #80–#83 erfassen.
- [x] Privaten Kubernetes-Zugriff als separat zu lösendes Thema dokumentieren.
- [ ] Capability-Katalog mit Engine-Version, Issue-Bezug und Ausführungsphase implementieren.
- [ ] Serverseitige Ausführungssperren und verständliche UI-Hinweise testen.
- [ ] Nach Lösung von #37 privaten Runner-Pfad inklusive DNS, Routing, TLS und
  Authentifizierung vor Plan/Apply abnehmen; Timeouts nicht als Drift behandeln.
- [ ] Behobene Accelerator-Issues erst nach Engine-Upgrade und eigenen Vertragstests
  als im Configurator unterstützt markieren.

Neue Grenzen zunächst gegen bestehende Issues und die aktuelle Accelerator-Version
prüfen. Neue Issues enthalten betroffene Eingaben, Quellbelege, erwartetes und
tatsächliches Verhalten sowie überprüfbare Abnahmekriterien. Zugangsdaten und
kundenbezogene Konfigurationen gehören nicht in Issues.

Ergänzung: #84 wurde beim gemeinsamen Import-/Export-Vertragstest entdeckt und
auch auf `main` bestätigt. Ein nativer Variablen-Vertragstest erwartet diesen
Validierungsfehler ausdrücklich, bis die Vorlage korrigiert und freigegeben ist.


## VPN-Zuordnung bei mehreren SNAs

[#85](https://github.com/stackitcloud/stackit-landing-zone/issues/85): VPN-Gateways
und alle konfigurierten Verbindungen werden auf sämtliche SNAs eines Connectivity-
Moduls repliziert. Eine selektive oder unterschiedliche Konfiguration je SNA fehlt.
Gegen `main` unter `2bb7c755692674ad619ffc46a0a17a781f019106` geprüft; #64 betrifft
einen anderen Sachverhalt (Inter-Region-Verbindungen). Der VPN-Assistent erklärt
die tatsächliche Reichweite und bietet keinen unwirksamen SNA-Selektor an.


## BGP für STACKIT VPN

[#86](https://github.com/stackitcloud/stackit-landing-zone/issues/86) erfasst die
fehlende Unterstützung von `BGP_ROUTE_BASED` im Accelerator. #23 ist geschlossen
und behandelt die allgemeine VPN-Implementierung; #64/#85 sind andere Grenzen.
Der Code nennt ein historisches Provider-Problem bis 0.104.0. Ob es unter dem
inzwischen gepinnten Provider 0.114.0 noch besteht, muss reproduziert werden.
Das Issue umfasst Gateway-/Tunnel-BGP-Einstellungen, Routingvalidierung,
SNA-Routenpropagation und die spätere Configurator-Anbindung. Eine allgemeine
Verwaltung zusätzlicher SNA-Routing-Tabellen ist davon zu unterscheiden.

## Bastion und Observability: Komponentenbeziehungen

- [#87](https://github.com/stackitcloud/stackit-landing-zone/issues/87): `debug-bastion` ist zwar ein eigenes Modul, wird vom Root aber ausschließlich über Plattform-Kubernetes mit dessen Projekt und SNA-Netz aufgerufen. Eine unabhängige Bastion-Komponente benötigt einen eigenen Root-Vertrag und eine explizite Bestandsmigration.
- [#88](https://github.com/stackitcloud/stackit-landing-zone/issues/88): Das Kubernetes-Modul erzeugt derzeit bei aktiviertem Monitoring eine eigene Observability-Instanz. Die zentrale Instanz im Management-Projekt wird nicht referenziert. Die gewünschte Auswahl einer bestehenden/zentral definierten Instanz benötigt Referenzfelder, Outputs und die Prüfung der zulässigen Projekt-/Regionsbeziehungen. Keine stille Umstellung bestehender Ressourcen.

Die [SKE-Dokumentation](https://docs.stackit.cloud/products/runtime/kubernetes-engine/how-tos/monitor-your-clusters/) beschreibt die Auswahl einer vorhandenen Observability-Instanz. Das beweist noch nicht, dass jede Instanz eines anderen Projekts verwendbar ist. SKE-Systemmonitoring, Anwendungsmetriken und Telemetry Router bleiben separate Aufgaben. Das UI kennzeichnet die tatsächlichen Deployment-Orte und die aktuellen Grenzen.
