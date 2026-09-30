# Gemeinsamer Editor

Stand: 2026-09-30. Veröffentlichung auf `lzc-dev` ausschließlich vom Feature-Branch.

## Bedienung

1. Eine beliebige Vorlage öffnen und **Konfiguration erstellen** wählen.
2. **Grundlagen → Ordner → Netzwerk → Plattform → Projekte → Betrieb → Prüfen**.
3. Einstellungen nur bei Bedarf aufklappen. **Standard verwenden** entfernt die
   eigene Einstellung. Der Export enthält weiterhin nur explizite Angaben;
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

Der unveränderte Standalone-Import zeigt den bekannten Public-Defaultfehler #84.
Im Projekt die Art ausdrücklich auf **Public** setzen, sofern kein zentraler
Netzwerkbereich gewünscht ist. Bestehende Standalone-Dokumente exportieren bereits
explizit Public und bleiben unverändert.

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
- [ ] Release auf lzc-dev und Live-Verbindungstests abgenommen.

Manuelle Prüfung nach Veröffentlichung: Hub-&-Spoke und Multi-Region öffnen,
Projektart/Bereich wechseln, Entwurf im eigenen Fork speichern, erneut öffnen und
Browser neu laden. Zusätzliche optionale Dienste unter Plattform/Betrieb prüfen.
