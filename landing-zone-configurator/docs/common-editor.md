# Gemeinsamer Editor

Stand: 2026-09-30. Veröffentlichung auf `lzc-dev` ausschließlich vom Feature-Branch.

## Bedienung

1. Eine beliebige Vorlage öffnen und **Konfiguration erstellen** wählen.
2. **Grundlagen → Ordner → Netzwerk → Plattform → Projekte → Betrieb → Prüfen**.
3. Einstellungen nur bei Bedarf aufklappen. **Accelerator-Standard verwenden** entfernt die
   eigene Einstellung und nutzt den Engine-Standard, nicht den Vorlagenwert. Der Export enthält weiterhin nur explizite Angaben;
   angezeigte Standardwerte werden nicht beim bloßen Öffnen materialisiert.
4. In **Projekte** Public, Corporate oder Sandbox hinzufügen. Public/Corporate
   können nach Bestätigung gewechselt werden. Der Zielordner wird angezeigt.
   Corporate benötigt eine passende Region und einen vorhandenen Bereich.
   Sandboxes haben einen eigenen Accelerator-Vertrag; ein Wechsel zu einer
   Landing Zone erfolgt durch bewusstes Neuanlegen und Entfernen.
5. **Prüfen** zeigt bekannte Konfigurationsfehler und getrennte Ausführungsgrenzen.
   Anschließend tfvars herunterladen oder JSON und tfvars gemeinsam im Fork speichern.

Einzelbereiche aus alten Hub-&-Spoke-Vorlagen können mit **Mehrere Netzwerkbereiche
verwalten** ohne Änderung der `default`-Referenz in eine Bereichsliste überführt
werden. Bereiche mit Projekt-, DNS-, Firewall-, VPN- oder Clusterreferenzen lassen
sich nicht versehentlich entfernen. Organisationsbaum und Netzwerkzuordnung
verwenden dieselben Daten; ein Hub-Projekt wird je Netzwerkbereich gezeigt.

Neue Standalone-Entwürfe markieren das Beispielprojekt ausdrücklich als Public
(Korrektur für #84). Der verlustfreie Import und bestehende Dokumente bleiben
unverändert; in einem älteren betroffenen Entwurf die Projektart ausdrücklich auf
**Public** setzen. Eigene Organisations-ID und Verantwortlichen-E-Mail-Adressen
ersetzen weiterhin die Platzhalter der Vorlage.

Unter **Plattform** stehen Git-Service, Plattform-Kubernetes, zentrales Observability
und Audit-Protokollierung. Kubernetes wird mit einer leeren Clusterliste deaktiviert,
Git-Service mit `null`. Das Entfernen konfigurierter Dienste verlangt eine Bestätigung;
verbleibende Namespace-Abhängigkeiten werden bei der Konfigurationsprüfung gemeldet.
Observability ist ein eigener Dienst. Die Audit-Protokollierung erstellt einen Telemetry
Router mit Zielen STACKIT Logs und S3-Archiv. Der Management-Archiv-Bucket existiert
auch bei deaktivierter Audit-Protokollierung.

Auswahlfelder gibt es für Regionen, regionale Netzwerkkennungen, vorhandene
Netzwerkbereiche, Namespace-Projektkennungen sowie die durch den Accelerator
festgelegten Audit-Scope-, VPN-Routing-, Secret-Enforcement- und Firewall-Werte.
Nicht mehr passende importierte Werte bleiben sichtbar und werden nicht automatisch
ersetzt. Freie Bezeichnungen bleiben Textfelder. Regionale Produktangebote wie
Maschinentypen, Pläne und Versionen benötigen künftig API-basierte Kataloge; dafür
werden keine vermeintlich vollständigen statischen Listen vorgetäuscht.

## Kompatibilität und Grenzen

- Bestehende v1/v2-Dokumente bleiben im bisherigen Editor nutzbar. **Zum gemeinsamen
  Editor wechseln** ist eine ausdrückliche Migration; beim Wechsel werden die
  bisherigen Engine-Werte erhalten. Bestehende Deployment-Vorbereitungen bleiben unverändert.
- Der bisherige Standalone-Editor kann auf der Standalone-Vorschauseite weiterhin
  ausgewählt werden, einschließlich des bisherigen persönlichen Plan-Ablaufs.
- v3 wird im Fork und Browser-Arbeitsstand unterstützt. Vorlagen-Hashes,
  Mandanten-/Kontotrennung, Schreibbasis, Konfliktprüfung und atomarer Export bleiben erhalten.
- v3-Deployment-Vorbereitungen sind **serverseitig gesperrt**. Runner-Anbindung und
  geschützte zusätzliche Credential-Bindings werden separat abgenommen.
- Keine Secret-Felder in den Konfigurationsformularen. VPN-Schlüssel, Firewall-
  Passwörter/API-Secrets und Kubeconfigs dürfen nicht in Freitextfelder eingefügt werden.
- Die wirkungslose Ordnerbeschreibung wird nicht als bearbeitbares Feature angeboten.
- Formular- und Typabdeckung sind keine Provider-Validierung. Plan/Refresh,
  Dienstverfügbarkeit, Berechtigungen und jede Modul-Kombination benötigen weitere
  Ausführungsabnahme. Grenzen #37/#65/#80 bleiben sichtbar.
- Kein Kunden-Apply ohne ausdrückliche neue Freigabe, kein Destroy.

## Prüfung

- [x] Fachbezeichnungen für sämtliche nicht-sensiblen Schemafelder geprüft.
- [x] Projektarten, Referenzen und Bereichsnormalisierung als Domain-Tests.
- [x] v3-JSON/tfvars atomar gespeichert; Deployment-Guard im Backend getestet.
- [x] Neuer Editor, Typwechsel, Navigation und Bereichsreferenzen im Browser getestet.
- [x] v3-Fork speichern, Export, Wiederaufnahme und gesperrte Vorbereitung getestet.
- [x] Legacy-Editor, GitHub-Anmeldung, Fork-Konflikte, Credentials und Plan-Ablauf regressionsgeprüft.
- [x] Release auf lzc-dev und Live-Verbindungstests abgenommen.

Manuelle Prüfung nach Veröffentlichung: Hub-&-Spoke und Multi-Region öffnen,
Projektart/Bereich wechseln, Entwurf im eigenen Fork speichern, erneut öffnen und
Browser neu laden. Zusätzliche optionale Dienste unter Plattform/Betrieb prüfen.

## Live-Abnahme

Code `527bd9582f95d3cf845cfaf242f9022e1495fad8` veröffentlicht:

- [Validate Configurator 36745965890](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36745965890): erfolgreich.
- [Configurator Release 36745965953](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36745965953): erfolgreich.
- 95 Anwendungstests und 20 Desktop-/Mobil-Browserprüfungen, einschließlich v3-Speicherung und Legacy-Kompatibilität.
- Native HCL-/OpenTofu-Vertragstests und Infrastrukturprüfung erfolgreich.
- CF-Netzwerk, PostgreSQL/Secrets-Manager-Verbindungen, isolierter Runner und öffentliche Routen erfolgreich geprüft.
- Direkter Live-Browsercheck: Multi-Region-Vorlage öffnen, neuen Editor starten, Projektliste/Netzwerkansicht auf Desktop und Mobilgerät prüfen; keine Seitenfehler oder horizontales Überlaufen.
- Öffentliche JavaScript-/CSS-Dateien per SHA-256 mit dem getesteten Build abgeglichen; `/healthz` liefert `ok`, Sitzung ohne Anmeldung `401`.

[Live-Anwendung](https://lzc-dev-configurator-7dbff805.apps.01.cf.eu01.stackit.cloud).
Keine Kunden-Konfiguration angewendet und keine Änderung nach `main` übernommen.


### Live-Nachbesserung: Plattformdienste und Voreinstellungen

Code `10a6ec87f0d0fc9d32d4b9699bd8579fb651683c` veröffentlicht:

- [Validate Configurator 36752620342](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36752620342): erfolgreich.
- [Configurator Release 36752620332](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36752620332): erfolgreich.
- 96 Anwendungstests, 22 Desktop-/Mobil-Browserfälle und 11 native OpenTofu-Variablentests erfolgreich.
- Live-Build entspricht dem lokal geprüften Bundle; Gesundheitsprüfung `ok`, anonyme Sitzung `401`, keine Browserfehler.
- Live geprüft: neue Standalone-Konfiguration ist Public; Region ist eine Auswahl; Plattformdienste und Kubernetes-Deaktivierung vorhanden. Desktop-/Mobilansicht ohne horizontales Überlaufen, mobile Plattformansicht visuell geprüft.
- Verbindungstests zu PostgreSQL/Secrets Manager und Runner-Trennung erfolgreich.

Manuell: App neu laden, einen **neuen** Standalone-Entwurf öffnen, Organisations-ID
und eigene Verantwortlichen-E-Mail-Adressen setzen, unter Projekte Public prüfen
und speichern/exportieren. In einem vorhandenen betroffenen Entwurf Public einmal
ausdrücklich wählen. Unter Plattform Kubernetes konfigurieren/deaktivieren; unter
Netzwerk regionale Kennungen und Bereichsverweise auswählen.


## Nächster Bedienstand: Komponenten statt vollständiger Feldliste

Die [verbindlichen Designprinzipien](editor-design-principles.md) steuern die weitere
Entwicklung. Die erste Umsetzung betrifft Plattform- und Kubernetes-Namespace-Dienste:
Inaktive Komponenten sind über **Komponente hinzufügen** zugänglich, aktive
Komponenten bleiben sichtbar. Das Öffnen und Schließen des Katalogs verändert den
Export nicht. Eine leere Clusterliste ist inaktiv; ein nicht-null gesetzter
Observability-Konfigurationsblock aktiviert dagegen den Dienst auch mit Defaults.

Public-/Corporate-Projektkarten enthalten direkte Schalter für Secrets Manager und
Observability. Sandboxes besitzen diese Root-Optionen nicht. Netzwerkbezeichnungen
benennen Connectivity und SNA ausdrücklich; ein Hinweis erläutert automatisch
erzeugte Routing-Tabellen. Ein vereinheitlichter Regions-/SNA-Editor und der geführte
VPN-Ablauf sind noch offen und im Designplan separat aufgeführt.

Dieser Abschnitt beschreibt den Arbeitsstand; die oben protokollierten Live-Abnahmen
beziehen sich auf ihre ausdrücklich genannten Commits.


## Regions-/SNA-Ansicht und VPN-Assistent (Arbeitsstand 2026-10-01)

Netzwerk zeigt Connectivity als Regionskarten mit SNAs und optionalen DNS-,
Firewall- und VPN-Komponenten. Bestehendes `connectivity` bleibt im bisherigen
Engine-Format; neue leere Konfigurationen können explizite Regionen hinzufügen.
Für bestehende Standardregion-Konfigurationen gibt es keine automatische Migration
auf regionale Module. Beim Öffnen bleibt der Export unverändert.

Der [VPN-Assistent](vpn-configuration-scope.md) bildet den Accelerator-Vertrag ab
und prüft grundlegende Pflichtangaben. Geschützte Schlüssel, Live-Kataloge und
Deployment-Ausführung fehlen weiterhin. Die neue [Self-Service-Architektur](platform-application-architecture.md)
ist geplant; Rollen und Berechtigungen wurden dadurch noch nicht geändert.


## Live-Abnahme 2026-10-01: Regionen, SNAs und VPN

Code `78d8f7c6debeba29330fa2699d617da17c3ba3be` auf lzc-dev veröffentlicht.

- [Release 36830339767](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36830339767): erfolgreich, einschließlich PostgreSQL-/Secrets-Manager-Verbindungstests und Runner-Prüfung.
- [Validate 36830339847](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36830339847): erfolgreich.
- Release umfasst 97 Anwendungstests und 24 Desktop-/Mobil-Browserfälle.
- Live-Bundle `/assets/index-BjLAVHUk.js` entspricht dem geprüften Editor-Release.
- Direkter Gast-Browsercheck: bestehende Vorlagen/Projektansicht, Komponenten hinzufügen, Region eu01 hinzufügen, STACKIT VPN öffnen, Verbindung mit zwei Tunnelfeldern konfigurieren.
- Gesundheit `ok`, anonyme Sitzung `401`, keine Browserfehler und kein horizontales Überlaufen auf Mobilgerät. Keine Kundenressourcen angelegt.

Manuelle Abnahme: vorhandene Konfiguration öffnen und unverändert speichern; neue
Connectivity-Region/SNA konfigurieren; optionales VPN hinzufügen und dessen Umfang,
Pflichtangaben und Tunnel-Einstellungen prüfen. VPN-Ausführung bleibt gesperrt.

Der anschließend entstandene separate Application-Root und sein Compiler sind
ein lokaler bzw. im Feature-Branch prüfbarer Prototyp, kein Bestandteil der
aktivierten Self-Service-Oberfläche.
