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
