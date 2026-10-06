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

## Aktueller Katalogstand (2026-10-06)

Tenantgebundene Veroeffentlichung, unveraenderliche Versionen, freigegebene
Anwendereingaben und forklose Application-Owner-Bestellungen sind implementiert.
Platform Engineer waehlen beim Publizieren `approval-required` (Standard) oder
`direct`. Die Policy gehoert zur unveraenderlichen Version und wird serverseitig
in die Bestellung uebernommen; eine Policy-Aenderung erzeugt eine neue Version.
Clients koennen sie bei Bestellung oder Plan-Input nicht ueberschreiben.

Eine ausdruecklich bestaetigte Stilllegung erzeugt einen unveraenderlichen,
idempotenten Nachweis. Stillgelegte Versionen verschwinden aus der AO-Auswahl;
neue Bestellungen werden auch serverseitig gesperrt. Bestehende Instanzen und
idempotente Bestellwiederholungen bleiben erhalten. Parallel laufende Bestellung
und Stilllegung verwenden dieselbe transaktionale Sperre. Erneutes Publizieren
stillgelegter Inhalte erzeugt eine neue Version statt die alte wiederzubeleben.

Die zweisprachige Publisher-Oberflaeche nutzt explizite API-Capabilities. Die
laufende Kunden-API verwendet Migrationen bis 034. Gruppenfreigaben aus
Migration 035 sind auf einer isolierten Testdatenbank qualifiziert, aber noch
nicht in der Kunden-API aktiviert. `direct` aktiviert weder Cloud-Ausfuehrung noch einen
automatischen Apply; eine ausdrueckliche Kunden-Apply-Freigabe bleibt erforderlich.

### Gruppenfreigaben

Jeder Arbeitsbereich erhaelt automatisch die Default-Gruppe `Application Owners`.
Application Owner werden beim Beitritt oder Rollenwechsel automatisch aufgenommen;
bei Rollenentzug werden ihre Gruppenmitgliedschaften entfernt. Die Default-Gruppe
kann nicht manuell bearbeitet werden. Bestehende Veroeffentlichungen werden bei
Migration 035 dieser Gruppe zugeordnet; Versionsinhalte, Quellen und Instanzen
bleiben unveraendert.

Gruppenanlage und Mitgliedschaftsaenderungen erfordern die aktuelle
Mitgliederverwaltungsberechtigung des Arbeitsbereichs. Custom-Gruppen nehmen nur
Application Owner desselben Arbeitsbereichs auf. Platform Engineers waehlen die
Freigabegruppen beim Veroeffentlichen oder bestaetigen eine separate Aenderung der
Freigaben einer vorhandenen Version. Eine leere Freigabeliste sperrt die Version
fuer Application Owner, ohne deren Instanzen oder State zu loeschen.

Gruppenfreigaben sind auditierte Nutzungsrechte, kein Bestandteil der
unveraenderlichen Versionsinhalte. AO-Katalog und neue Bestellungen werden
serverseitig gefiltert. Aktuelle Rechte werden auch vor Jobvorbereitung,
Backend-Freigabe, Grant-Claim und Runner-Ticket-Verbrauch sowie vor und nach dem
Secret-/Backend-Zugriff geprueft. Gruppenentzug waehrend eines Credential-Zugriffs
verhindert die Rueckgabe des Secrets. AO erhalten weder Gruppenverwaltung noch
technische Credentials. API-Mutationen erfordern Tenantbindung, Origin und CSRF.

Die UI aktiviert diese Controls nur mit `groupAccessEnabled`. Tests pruefen
Default-Mitgliedschaft, eingeschraenkte Gruppen, fremde Nutzer, direkte
SQL-Claims/Tickets, Entzug waehrend Secret-Zugriff und Desktop-/Mobil-Bedienung.
Dies ist noch keine Abnahme von Application-Plan/Apply, Drift oder Upgrades.

## Noch offen

[#92](https://github.com/stackitcloud/stackit-landing-zone/issues/92) bleibt fuer
die produktive Veroeffentlichungsabnahme unter autoritativ verifizierter
Tenantbindung offen. Private Entwuerfe werden nicht im AO-Katalog angezeigt.

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
