# Plattformkonfiguration und Projekt-Template-Entwürfe

Stand: 2026-10-01. Korrektur des Erstellungsablaufs gemäß Rollenmodell.

## Fachlicher Ablauf

Der Platform Engineer definiert zentrale Plattformdienste und die dafür nötigen
Infrastrukturprojekte. Im Schritt **Projekt-Templates** erstellt er Vorlagen für
spätere Anwendungsprojekte. Die Plattformkonfiguration erzeugt diese Projekte
nicht selbst. Der Application Owner bestellt später eine Instanz einer
veröffentlichten Template-Version im separaten Application-Self-Service.

Neue Entwürfe aus allen acht Accelerator-Vorlagen nutzen diesen Ablauf.
`landing_zones`, `sandboxes` und `landing_zone_namespace_services` aus den
Beispielen werden zu Template-Entwürfen. Plattform, Connectivity, Governance,
zentrale Dienste und deren Projekte bleiben Teil der Plattformkonfiguration.
Die Vorschau zeigt Plattformressourcen und Template-Entwürfe getrennt.

Ein Template enthält eine eigene ID und Kennung, Anzeigenamen, Projektart
(Public/Corporate/Sandbox), Region sowie die festen Modul-/Service-Einstellungen.
Corporate-Templates referenzieren eine SNA ihrer Region. Die Projektart bestimmt
die Ordnerrolle. Secrets Manager und Observability können als automatisch
bereitzustellende Dienste vorgegeben werden; weitere unterstützte Modulwerte
bleiben erhalten. Dies beschreibt ein Anwendungsprojekt mit Basisdiensten, noch
kein eigenständiges VM- oder Kubernetes-Workload-Angebot.

Konkreter Projektname und Projektkürzel gehören zur späteren Bestellung. Der
Projektverantwortliche muss serverseitig aus einer verifizierten STACKIT-Identität
kommen. Feste zusätzliche Administratorzuweisungen (z. B. Sandbox `owner_emails`)
sind davon getrennte Plattformpolicy; Beispieladressen müssen vor Speicherung
bereinigt werden. Namespace-Service-Einstellungen werden als Template-Metadaten
erhalten. Das ist keine Freigabe ihrer späteren Clusteranbindung/Ausführung.

## Template-Eingaben und Verknüpfungen

Die bisherigen festen Einstellungen sind noch kein vollständiger Template-Vertrag.
Stage soll normalerweise eine begrenzte Bestelleingabe sein; Dienstbeziehungen
wie „Observability nur aus eigenem Projektnetz“ brauchen typisierte Bindungen.
[Wertquellen, Instanziierung und Umsetzungsplan](template-parameters-and-bindings.md).
Parameter-Policy, fünf freigegebene Felder und lokale Bestellvorschau sind implementiert. Veröffentlichung, weitere Feldbindungen und echte Bestellungen bleiben offen.

## Speicherung und Export

Das bisherige Dokumentformat v3 besitzt nun optional `projectTemplates`.

- Ohne das Feld bleibt es eine bisherige Gesamtkonfiguration mit konkreten Projekten.
- Mit dem Feld ist es ein Plattformentwurf; auch eine leere Liste kennzeichnet diesen Modus.
- Plattformentwürfe dürfen keine konkreten `landing_zones`, `sandboxes` oder
  `landing_zone_namespace_services` enthalten. Mischformen werden beim Einlesen,
  Speichern und Exportieren abgewiesen.
- Template-Einstellungen werden gegen den bestehenden Accelerator-Eingabevertrag
  geprüft; konkrete Instanz-/Owner-Felder sind in den Template-Einstellungen verboten.
- Das JSON im persönlichen Fork erhält die Template-Entwürfe. Der deterministische
  tfvars-Export enthält nur die Plattform und explizit leere Anwendungssammlungen.
- Erstbereitstellungspläne für erlaubte Plattform-Teilkonfigurationen planen daher
  **nur die Plattform**, keine Template-Instanzen. Die übrigen Runner-Sperren bleiben wirksam.

Das optionale Feld erhält die Lesbarkeit alter Dokumente ohne automatische
Umdeutung. Die Veröffentlichung bekommt später einen eigenen tenantgebundenen,
unveränderlichen Versionsvertrag; ein editierbarer Fork-Entwurf ist keine
veröffentlichte Version und keine Bereitstellungsberechtigung.

## Bestehende Konfigurationen

Der bisherige Projekteditor ist für vorhandene Dokumente unter **Projekte (Bestand)**
weiter verfügbar. Neue Konfigurationen werden nicht mehr über den alten
Standalone-Erstellungsbutton angelegt.

**Als neue Plattformkonfiguration übernehmen** erstellt nach ausdrücklicher
Bestätigung eine Kopie mit neuer Konfigurations-ID. Die Fork-Verknüpfung wird auf
Neuanlage zurückgesetzt; der bestehende Datensatz wird nicht überschrieben.
Namespace-Einstellungen ohne zugehöriges Quellprojekt blockieren die Kopie,
statt verloren zu gehen. SNA-Referenzen aus Templates verhindern das versehentliche
Entfernen des referenzierten Bereichs.

Das ist ausschließlich eine Konfigurationskopie. Es ist keine State-Migration,
kein Import bestehender Ressourcen und keine Anweisung, die Plattform parallel
neu auszurollen. Bereits bestehende Ressourcen benötigen den separat geplanten
Migrations-/State-Lebenszyklus.

## Noch offen

[#92](https://github.com/stackitcloud/stackit-landing-zone/issues/92) bleibt offen:
tenantgebundene Veröffentlichung, unveränderliche Versionen, freigegebene
Anwendereingaben und direkte/genehmigungspflichtige Policy. Die
Application-Owner-Sicht bekommt erst veröffentlichte, berechtigte Angebote;
lokale oder private Fork-Entwürfe werden dort nicht angezeigt.

[#91](https://github.com/stackitcloud/stackit-landing-zone/issues/91) und
[#93](https://github.com/stackitcloud/stackit-landing-zone/issues/93) liefern die
verifizierte Organisations-/Benutzerbindung und Instanziierung mit eigenem State.
Die bisherige Sperre für Kunden-Apply bleibt bestehen.

## Prüfungen

- [x] Alle acht Quellvorlagen werden ohne Verlust von Plattform-/Projektpolicy konvertiert.
- [x] Persönliche Instanzfelder gelangen nicht in Projektvorlagen.
- [x] Legacy-Dokumente bleiben beim Einlesen unverändert; Kopien benötigen eine neue ID.
- [x] Git-Speicherung erhält Metadaten; tfvars und Deployment-Vorbereitung enthalten keine daraus erzeugten Projekte.
- [x] Gemischte Template-/Instanzdokumente werden abgewiesen.
- [x] Native OpenTofu-Variablenprüfung bestätigt leere Anwendungs-, Sandbox- und Namespace-Sammlungen im Plattformexport.
- [x] Browserprüfung einschließlich Bestandskopie/Speicherung erfolgreich; CI-Validierung und [Release 36855011827](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36855011827) für `0e62c5e` erfolgreich. Live-SPA liefert HTTP 200 mit dem erwarteten Bundle `index-bjLShEoG.js`.
