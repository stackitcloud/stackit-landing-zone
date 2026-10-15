# Gemeinsamer Editor

Stand: 2026-10-15. Veröffentlichung auf `lzc-dev` ausschließlich vom Feature-Branch.

## Bedienung

Eine gültige App-Sitzung und ein aktueller STACKIT-Identitätsnachweis sind
getrennt: Die App-Sitzung bleibt acht Stunden bestehen, während der
STACKIT-Nachweis früher ablaufen kann. Name und **Abmelden** bedeuten weiterhin,
dass du im Configurator angemeldet bist. Falls ein aktueller Nachweis fehlt,
bietet die Kopfzeile **STACKIT bestätigen** an, nicht noch einmal **Mit STACKIT
anmelden**. Der Dialog erklärt, dass diese Bestätigung für geschützte
STACKIT-Aktionen nötig ist. Das Auslaufen des Nachweises meldet dich nicht aus
der App ab; es verlängert aber auch keine Cloud-Berechtigung. Ohne App-Sitzung
bleibt **Mit STACKIT anmelden** die eigentliche Anmeldung.

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

Im Konfigurations-Chat zeigt der Änderungsvorschlag strukturierte Werte mit
Fachbezeichnungen und ihren Werten, beispielsweise **Aufbewahrung (Tage): 90**
für Audit-Protokollierung. Das gilt auch für Ausgangswerte, verschachtelte Objekte,
Listen und den Konfliktdialog. Leere Listen (`[]`) und Objekte (`{}`) bleiben von
**Nicht gesetzt** unterscheidbar. Der Hinweis **Vollständiger Ersatz** bedeutet,
dass die gesamte vorgeschlagene Einstellung übernommen wird, nicht nur einzelne
Unterfelder. Auswahl, ausdrückliche Übernahme und separates Speichern bleiben
unverändert; eine Vorschau ändert weder die Konfiguration noch Cloud-Ressourcen.

### Assistant und Application-Templates (Dev-Release vom 2026-10-15)

Neue Template-Vorschläge müssen Name, Art, Region und Einstellungen zusammen
enthalten. Bestehende Templates bleiben partiell änderbar. Der Assistant erhält
für Plattform-Entwürfe vorhandene Netzwerkbereichsschlüssel und Regionen, keine
Cloud-Ressourcenkennungen. Template-Entscheidungen referenzieren eine vorhandene
Benutzernachricht; deren Originaltext stellt der Server bereit.
Der daraus abgeleitete Einstellungsumfang begrenzt das geschlossene
Modell-Ausgabeschema: Eine reine Netzwerkanfrage bietet keine Observability-,
Secrets-Manager-, Namespace-Service- oder Parameter-Policy-Einstellungen an.
Explizit angeforderte zusätzliche Einstellungen bleiben unterstützt; der volle
Import-, Speicher- und Runtime-Vertrag wird nicht eingeschränkt.
Der Vorschlagsvergleich im Web-UI liest Templates aus derselben
ID-freien, nach stabilen Schlüsseln indizierten Projektion wie das Backend,
nicht als vermeintliche Terraform-Eingabe. Übernahme aktualisiert den lokalen
Entwurf; erst ausdrückliches Speichern persistiert die Templates.
Ungültige erzeugte Template-Strukturen werden als fehlgeschlagener
Assistant-Vorschlag gemeldet, nicht als Zugangsdaten im Benutzertext.
Gespeicherter Chat und Konfiguration bleiben bei einer Ablehnung unverändert.

Die echte Modell-Abnahme der Originalanfrage nach Corporate-/Public-Templates
mit lokalen Netzen ist in drei unabhängigen synthetischen Läufen bestanden:
zwei benannte Templates, gespeicherte Region, lokale Netze, keine Sandbox,
keine zusätzlichen Dienste und keine Rückfragen. Corporate verwendet den
vorhandenen `default`-Netzwerkbereich, auch ohne explizites Key-Override.
Die Quellenprüfung für Produktpläne, Adressen und IDs bleibt unverändert.
Die Modellabnahme ist synthetisch und verändert keine Kundenkonfiguration.
Die Korrekturen sind mit Nutzerfreigabe als `a031273` committed, gepusht und
über den erfolgreichen [Dev-Release 38710301311](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/38710301311)
veröffentlicht. Öffentliche Hosted-Prüfungen und der Abgleich des ausgelieferten
UI-Bundles mit diesem Release sind bestanden; die Abnahme führt keine
Kunden-Cloud-Ressourcen aus.

Auswahlfelder gibt es für Regionen, regionale Netzwerkkennungen, vorhandene
Netzwerkbereiche, Namespace-Projektkennungen sowie die durch den Accelerator
festgelegten Audit-Scope-, VPN-Routing-, Secret-Enforcement- und Firewall-Werte.
Nicht mehr passende importierte Werte bleiben sichtbar und werden nicht automatisch
ersetzt. Freie Bezeichnungen bleiben Textfelder. Regionale Produktangebote wie
Maschinentypen, Pläne und Versionen benötigen künftig API-basierte Kataloge; dafür
werden keine vermeintlich vollständigen statischen Listen vorgetäuscht.

### Template-Übersicht

Application-Templates erscheinen als auswählbare Übersichtskarten mit Namen,
stabiler Kennung, Art, Region, Zielordner und Netzzuordnung. Nur das ausgewählte
Template zeigt sein vollständiges Bearbeitungsformular. Neue Templates werden
direkt ausgewählt; nach Entfernen eines Templates bleibt ein vorhandenes Template
bearbeitbar. Die Strukturansicht gruppiert dieselben Templates nach Art und
Zielordner und öffnet beim Auswählen denselben Detailbereich.

Die Netzwerkansicht zeigt Corporate-Templates nur unter dem referenzierten
Netzwerkbereich ihrer Region; ein fehlendes Key-Override bedeutet weiterhin
`default`. Public-Templates werden nicht als zentrale Netzwerk-Spokes dargestellt.
Fehlende SNA- oder Ordnerreferenzen bleiben ausdrücklich sichtbar. Templates
bleiben Entwürfe für spätere Bestellungen, keine bereits angelegten Projekte.
Auswählen und Bearbeiten speichern oder deployen nichts automatisch.

Die Übersicht ist mit Nutzerfreigabe als Quelle `9c19327` über den erfolgreichen
[Dev-Release 38720037784](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/38720037784)
veröffentlicht. Alle 296 Desktop-/Mobil-Browsertests bestanden, einschließlich
Auswahl, gemeinsamer Strukturvorschau, Hinzufügen, Entfernen und leerem Zustand.
Die ausgelieferten JavaScript- und CSS-Bundles wurden mit der exakt gebauten
Quelle abgeglichen. Bestehende Kundenkonfigurationen wurden nicht verändert.

### Komponenten in der Strukturvorschau

Die Strukturvorschau zeigt unter den Plattformprojekten auch deren konfigurierte
Komponenten, jeweils nur mit Name und Typ: Automatisierungs-Service-Account,
Secrets Manager, Object-Storage-Buckets,
Observability, Audit Logs und Telemetry Router, zugeordnete SNA, Netze,
DNS-Zonen, Firewalls einschließlich eines konfigurierten HA-Partners, VPN-Gateways,
Git-Service sowie Kubernetes-Cluster und ihre optionalen Dienste.
Netzwerkkomponenten werden nach Region und Netzwerkbereich dem richtigen Hub
zugeordnet. SNA erscheinen als logisch zugeordnete Netzwerkbereiche, nicht als
Aussage über deren tatsächlichen Resource-Manager-Container.
Deaktivierte Dienste und lediglich referenzierte bestehende DNS-Zonen erscheinen
nicht als neu bereitzustellende Komponenten. Das Audit-Archiv bleibt entsprechend
dem Accelerator auch ohne aktivierte Audit-Protokollierung sichtbar.
Die Vorschau verwendet native Standardwerte ausschließlich zum Anzeigen; sie
materialisiert diese nicht im Entwurf und liest keine bestehenden Cloud-Ressourcen.

### Erstbereitstellungspläne (lokal qualifizierter Ausbau)

Die generelle Sperre für `audit_logs`, `observability`, `connectivity` und `devops`
ist durch geprüfte Unterstützung ersetzt. Für Connectivity umfasst diese
Netzwerkbereiche, DNS, Firewall-/HA-Infrastruktur und VPN-Gateways.
Das Firewall-Image ist die bereits im Accelerator verwendete, versions- und
SHA-256-gebundene OPNsense-Datei; der Runner prüft die tatsächlichen Image-Dateien
und ihre Paketierung. Ein alter Runner ohne passendes Image bleibt ausdrücklich
gesperrt, statt einen vermeintlich ausführbaren Plan mit `/dev/null` zu erstellen.

Das ist eine Plan-Freigabe, keine automatische Bereitstellung: Firewall-Policies,
Bootstrap, Appliance-Apply und VPN-Verbindungen mit vorab geteilten Schlüsseln
benötigen weiterhin ihre gesonderte Ausführungs- bzw. Secret-Binding-Unterstützung.
Audit-Ziele außerhalb des nachgewiesenen Organisationskontexts bleiben gesperrt.
Identitäts-/Owner-Nachweise, Mandantentrennung, Snapshot-Prüfung und explizite
Freigaben bleiben unverändert erforderlich. Die konkreten Grenzen sind im
[Runner-Vertrag](../runner/README.md) beschrieben.

Die gemeinsame lokale Abnahme bestand 710 Unit-Tests, 298 Desktop-/Mobil-
Browsertests sowie Typprüfung, Build und die zwölf Release-/Runner-Evidence-Tests.
Weitere 51 PostgreSQL-Broker-Tests und 36 native Vertrags-/Offline-Provider-Fälle
qualifizierten die Runner-Unterstützung für beide Accelerator-Quellstände.
Es gab keine Kunden-Cloud-Plans, Applies oder Destroys.
Diese Änderungen sind noch nicht auf Dev veröffentlicht. Der erste große
CF-Upload scheiterte nach 15 Minuten mit HTTP 502, vor Migration und Web-Update.
Der freigegebene Staging-Ausbau lässt das große Image deshalb nur im Hosted-Archiv
aus und baut es beim Staging SHA-geprüft ins unveränderliche Droplet ein.
Es gibt keinen Download pro Nutzer oder Plan; Cache, Paketidentität und
unverändertes 4-GiB-Task-Diskbudget werden gesondert geprüft. Details stehen unter
[CF-Staging und Cache](../deploy/cloud-foundry/README.md#image-staging-and-caching).
Eine Live-IAM-/Erreichbarkeitsabnahme wird durch die
Offline-Qualifikation nicht vorgetäuscht.

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

[Live-Anwendung](https://lzc-dev-configurator.apps.01.cf.eu01.stackit.cloud).
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
