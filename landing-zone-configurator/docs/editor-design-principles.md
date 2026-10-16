# Verbindliche Designprinzipien des Landing Zone Configurators

Status: vom Benutzer bestätigte Richtung; schrittweise Umsetzung auf dem Feature-Branch.
Diese Prinzipien ergänzen [Designreferenz](design-reference.md) und
[gemeinsames Funktionsmodell](common-feature-model.md).

## Begriffe und Orientierung

- Offizielle STACKIT-Produktnamen verwenden: STACKIT Network Area (SNA), STACKIT VPN,
  STACKIT Observability, STACKIT Secrets Manager. Wo kein Produkt gemeint ist,
  den Accelerator-Modulnamen verwenden, beispielsweise Connectivity.
- Kubernetes-Namespace-Dienste ausdrücklich als Kubernetes-Funktion benennen.
- Produkt, Modul, Ressource und Instanz unterscheiden. Observability und der
  Telemetry Router der Audit-Protokollierung sind unterschiedliche Dienste.
- Technische Feldnamen dienen intern der Zuordnung; sichtbare Begriffe, Hilfen und
  Abläufe orientieren sich am Produkt und an seiner offiziellen Dokumentation.
- Portalparität erst nach tatsächlichem Vergleich behaupten. Die öffentliche VPN-
  Anleitung bezeichnet Portal-Integration noch als nicht verfügbar; das ist kein
  Nachweis über den vom Benutzer beobachteten aktuellen Portalablauf.

## Arbeitsbereich und Konfigurationskontext

Bestätigter Hauptablauf: **Login > Arbeitsbereich öffnen > Konfiguration öffnen
oder erstellen > Bearbeiten > Plan > Apply**.

- Beim ersten Einstieg verfügbare Arbeitsbereiche einschließlich des persönlichen
  anbieten; Erstellen und Öffnen sind eigene Aktionen.
- Beim erneuten Einstieg den letzten noch zugänglichen Arbeitsbereich wieder
  öffnen. Explizite Deep Links und gesicherte Login-Entwürfe nicht überschreiben.
- Arbeitsbereichswechsel im Header auch auf Mobilgeräten erreichbar halten.
- **Konfigurationen** ist die Plattformübersicht; **Neue Konfiguration** öffnet
  die Vorlagen. Templates und „Mein Entwurf“ sind keine primären Sidebarziele.
- Geöffnete Konfigurationen haben **Konfiguration · Bereitstellung · Verlauf**
  als gemeinsamen Kontext mit Namen und gespeicherter Revision.
- **Speichern und zur Bereitstellung** verwendet exakt die neue Serverrevision.
  Ungespeicherte Änderungen sperren den direkten Bereitstellungstab; Wechsel
  in andere Arbeitsbereiche dürfen sie nicht still verwerfen.
- Verlauf bleibt ausschließlich lesbar und konfigurationsbezogen. Sichtbare
  Ausführungen und Statusangaben unterliegen weiterhin den bestehenden Rollen,
  Benutzer- und Tenant-Grenzen.
- Navigation und Wiederaufnahme starten keine Vorbereitung, keinen Plan und
  keinen Apply. Bestehende Planbindungen und Ablaufzeiten bleiben unverändert.
- Application Owner behalten den getrennten Application-Landing-Zone-Ablauf.

Lokal am 2026-10-04 umgesetzt: Gesamtcheck mit 305 Unit-Tests und vollständige
Browser-Suite mit 134 Desktop-/Mobilfällen bestanden. Arbeitsbereichsauswahl und
Konfigurations-/Bereitstellungskontext visuell geprüft. Browser-APIs simuliert;
kein Kunden-Apply und keine Live-S3-Abnahme durch diese Umsetzung.

## Weniger sichtbare Komplexität

- Die Übersicht zeigt aktive Komponenten kompakt; Einstellungen erst beim Bearbeiten.
- Optionale, inaktive Komponenten über **Komponente hinzufügen** erreichbar machen.
- Aktivität anhand wirksamer Werte inklusive Engine-Defaults bestimmen, nicht allein
  anhand vorhandener JSON-Felder. Standardmäßig aktive Projektdienste sichtbar halten.
- Katalog öffnen, Karte schließen und Abschnitt einklappen verändern keine Konfiguration.
- Deaktivieren, Entfernen und Zurücksetzen sind unterschiedliche Aktionen. Vorhandene
  Einstellungen und Referenzen nicht durch bloßes Verbergen verlieren; geplante
  Ressourcenlöschung bei späterem Apply ausdrücklich kenntlich machen.
- Details in **Erweiterte Einstellungen**; notwendige Angaben und Fehler sichtbar halten.
- Unvollständige Entwürfe dürfen bearbeitet werden. Konfiguriert, ausführbar,
  bereitgestellt und technisch verbunden als verschiedene Zustände anzeigen.
- Bekannte Auswahlwerte als Dropdowns; dynamische Produktangebote aus regionalen
  Katalogen laden. Keine erfundenen oder vermeintlich vollständigen SKU-Listen.
- Accelerator-Standard und Vorlagenwert klar unterscheiden. Bestehende Dokumente
  nicht still normalisieren oder auf andere Terraform-Moduladressen umstellen.

## Netzwerkmodell

Zielansicht: **Region → SNAs → zugeordnete Projekte** mit DNS, Firewall und VPN im
Connectivity-Kontext. Eine SNA ist eine Organisationsressource mit regionaler
Konfiguration. Der aktuelle Accelerator erstellt getrennte SNAs je regionalem
Moduleintrag; gleiche Kennungen erzeugen keine regionsübergreifende Verbindung.

`connectivity` in der Standardregion und `connectivity_regions` sind alternative
Engine-Eingaben, keine zwei unabhängigen Produkte. Eine einheitliche Oberfläche
muss den bestehenden Export und die Ressourcenzuordnung erhalten. Vor einem
Wechsel Namenspräfixe, Moduladressen und Einschränkungen (#65/#80) prüfen.

Routing-Tabellen nicht als fehlend darstellen: WAN-Tabelle je SNA und
Firewall-Standardrouten der Corporate-Projekte werden vom Accelerator erzeugt.
Frei definierbare zusätzliche Tabellen sind im geprüften Root-Vertrag nicht
vorgesehen. Statische VPN-Routen sind eine gesonderte Einstellung; automatische
Inter-Region-Verbindungen bleiben Thema #64.

## VPN als erste geführte Produktkomponente

1. **Gateway:** Region, SNA, Name, Leistungsplan und Verfügbarkeitszonen.
2. **Routing:** unterstütztes Routingverfahren erklären und auswählen; Folgen einer
   nachträglichen Änderung vor Ausführung sichtbar machen.
3. **Verbindungen:** Gegenstelle und passende Netze bzw. statische Routen je Verbindung.
4. **Tunnel und Zugang:** beide Tunnel, Gegenstellenadressen, geschützte PSK-Referenzen.
5. **Prüfen:** STACKIT-Ressourcen, noch fehlende Daten und Aufgaben an der Gegenstelle.

Dokumentationslinks direkt am betreffenden Schritt:
- [Gateway erstellen](https://docs.stackit.cloud/products/network/connectivity-hybrid-multi-cloud/vpn/getting-started/gateway-create/)
- [Verbindung erstellen](https://docs.stackit.cloud/products/network/connectivity-hybrid-multi-cloud/vpn/getting-started/connection-create/)
- [Gateway- und Verbindungsoptionen](https://docs.stackit.cloud/products/network/connectivity-hybrid-multi-cloud/vpn/basics/gateway-and-connection-options/)

Der Accelerator kann Gateway und konfigurierte STACKIT-seitige Verbindungen
anlegen, nicht das entfernte VPN-Gerät konfigurieren. BGP ist im geprüften Modul
nicht unterstützt. Gemeinsamer Editor, geschützte VPN-Schlüsselanbindung und
vollständige Deployment-Ausführung sind getrennte Ausbauschritte. Ein vollständiger
Dialog allein darf deshalb nicht als betriebsbereites VPN dargestellt werden.

## Umsetzung und Abnahme

- [x] Designprinzipien mit Benutzerentscheidung dokumentiert.
- [x] Kubernetes-/Connectivity-/SNA-Bezeichnungen im begonnenen Editor angepasst.
- [x] Projektschalter für Secrets Manager und Observability direkt zugänglich.
- [x] Erste Komponentenübersicht für Plattform und Kubernetes-Namespace-Dienste implementiert.
- [x] Komponentenübersicht auf optionale Connectivity-Dienste (DNS, Firewall, VPN) ausgeweitet.
- [ ] Weitere verschachtelte optionale Dienste vereinfachen.
- [x] Einheitliche Regions-/SNA-Ansicht mit beibehaltenen Engine-Eingabeformen und Referenzschutz implementiert.
- [ ] VPN-Eingaben gegen Engine-Version, Produktdokumentation und aktuellen Portalablauf abgleichen.
- [x] VPN-Konfigurationsassistent mit Gateway, Routing, Verbindungen/Tunneln, Zusammenfassung und Dokumentationslinks implementiert.
- [ ] Vollständige produktseitige Validierung (u. a. regionale Kataloge/IPsec-Kompatibilität) ergänzen.
- [ ] Regionale Produktkataloge und geschützte VPN-Schlüsselreferenzen anbinden.
- [ ] Getrennte Gateway-/Verbindungsphasen und Ausführungsgrenzen im Backend abnehmen.
- [ ] Fachliche Beschriftungen, Tastaturbedienung und Desktop-/Mobilansichten prüfen.
- [ ] Speicherung/Wiederaufnahme, inaktive Konfigurationen und unveränderte Exporte regressionsprüfen.
- [ ] Veröffentlichung und Live-Abnahme des überarbeiteten Bedienkonzepts.

Kunden-Apply weiterhin nur nach ausdrücklicher Freigabe. Keine Main-Merge-Freigabe.

## Lokaler Prüfstand der ersten Umsetzung

- Lint, TypeScript und Produktionsbuild erfolgreich; 96 Anwendungstests bestanden.
- 22 Desktop-/Mobil-Browserfälle bestanden. Nach Ergänzung der Prüfung auf
  unveränderte Werte beim Katalog-Öffnen/-Schließen die sechs betroffenen
  Editor-Browserfälle erneut erfolgreich ausgeführt.
- Geprüft: Projektschalter, Komponentenauswahl, unveränderte Speicherung,
  Wiederaufnahme, Legacy-Abläufe und bestehende Deployment-Sperren.
- Noch kein Deployment dieser Änderungen; letzte Live-Abnahme siehe
  [gemeinsamer Editor](common-editor.md).

### Weiterer Prüfstand 2026-10-01

Regions-/SNA-Ansicht und VPN-Konfigurationsassistent implementiert; 97
Anwendungstests und 24 Desktop-/Mobil-Browserfälle erfolgreich, mobile VPN-Ansicht
visuell geprüft. Noch keine Veröffentlichung dieses Arbeitsstands. Die
[Platform-/Application-Architektur](platform-application-architecture.md) trennt
künftig die Rollenansichten, Vorlagen und Instanzen. Die aktuelle Oberfläche
stellt diese noch nicht als vorhandene Berechtigungsfunktionen dar.
