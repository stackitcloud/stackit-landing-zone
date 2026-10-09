# Plattformkonfiguration und Projekt-Template-Entwürfe

Stand: 2026-10-09. Bestell-, Plan-, Apply-, Destroy- und Drift-Ablauf.

## Application-Destroy und Drift

Die Bestelldetails bieten **Destroy** und **Drift**, wenn das aktive, qualifizierte
Application-Runner-Paket diese Operationen explizit unterstuetzt. Bestehende
Template-Versionen, Bestellungen, Sources, Artefakte und State-Keys bleiben
unveraendert. Beide Aktionen verwenden den S3-State derselben Application-Instanz.

**Destroy-Plan erstellen** erzeugt mit `tofu plan -destroy` einen gespeicherten
Loeschplan. Nach Pruefung der Ressourcen und separater Loeschbestaetigung wird
genau dieses Binary angewendet, nicht ein neu berechneter Plan. Die API bindet
die Bestaetigung an Instanz und Artefakt-Hash; ein Plan-/Reiterwechsel setzt die
UI-Bestaetigung zurueck. Anlegen, Aendern, Ersetzen und Ordnerloeschung bleiben
gesperrt. Abschlussstatus und redigierte Ausfuehrungslogs stehen im Destroy-Reiter.
Nach erfolgreichem Destroy kann die Bestellung separat archiviert werden;
State, Artefakte und Audit-Historie bleiben dabei erhalten. Provider-seitige
Projektloeschung kann weiterhin eine nachgelagerte Purge-Phase haben.

**Drift pruefen** erstellt einen lesenden Plan mit explizitem Refresh und zeigt
zwei getrennte Vergleiche: gespeicherter State gegen Cloud sowie Cloud gegen die
unveraenderlich bestellte Soll-Konfiguration. Sensible Attribute werden maskiert.
Die Pruefung kann weder im UI noch ueber API/Worker angewendet werden. Erfasst
werden nur Ressourcen dieses Application-States, nicht beliebige zusaetzliche
Ressourcen im Projekt. Drift ist daher keine vollstaendige Cloud-Inventarisierung.

Aktuelle Besteller-/IAM-/Gruppenrechte, technische Delegation, passendes
Runner-Paket und State-Locking bleiben erforderlich. Aktive Ausfuehrungen und
ungeklaerter Recovery-State sperren Maintenance. Ein abgeschlossenes
`reconciliation_required` mit abgelaufenem Ticket und ohne Recovery-Beleg erlaubt
gezielt Destroy/Drift, aber keinen normalen Apply-Neustart. Der alte Abschluss
wird dabei weder veraendert noch als Erfolg interpretiert. Fuer archivierte
Bestellungen besteht weiterhin keine Ausfuehrungsmoeglichkeit.

## Observability ohne ACL-Parameter

Die ACL-Einrichtung ist im MVP vollständig benutzerverwaltet und nicht Teil
von Editor, Bestellung oder automatischer Ressourcenverknüpfung. Observability
kann ohne ACL-Pflichteingaben und ohne ungeklärte Egress-Bindung aktiviert
werden. Gespeicherte feste ACL-Werte werden nicht gelöscht. Die neue native
Application-Revision schützt spätere ACL-Änderungen durch `ignore_changes`.
Details und Provider-Grenzen stehen im
[aktuellen Parametervertrag](template-parameters-and-bindings.md).

Bereits veröffentlichte Versionen bleiben unverändert an ihre alte Quelle
gebunden. Für den neuen Runner ist eine neue Veröffentlichung und Bestellung
nötig; bestehende Aufträge und Plan-Artefakte werden nicht umgeschrieben.

## Application-Bestellung, Vorschau und Apply

Eine Bestellung ohne angeforderten Apply kann auch nach einem erfolgreichen
oder fehlgeschlagenen, abgeschlossenen Plan gelöscht werden. Laufende oder
ungeklärte Ausführungen und jede Apply-Anforderung sperren das Löschen weiterhin.
Die Löschung entfernt die Bestellung aus dem Self-Service; Job-Historie und
verschlüsselte Plan-Artefakte bleiben unverändert erhalten. Danach kann kein
Apply mehr aus diesen Plans gestartet werden. Löschen ist kein Cloud-Destroy.

Bei einer direkt freigegebenen Template-Version mit aktiver Execution-Delegation
startet **Bestellen** unmittelbar den Cloud-Plan. Separate Bestätigungen für
Plan-Vorbereitung und Plan-Start entfallen. Eine fachliche Bestellfreigabe bleibt
nur bei `approval-required` notwendig; danach startet der Application Owner den
Plan mit einem Klick. Die Bestellung bleibt auch bei einem fehlgeschlagenen
Plan-Start erhalten und kann ohne erneute Bestellung weiterbearbeitet werden.

Ein erfolgreicher Plan liefert eine Ressourcen-Vorschau aus dem verschlüsselten,
gespeicherten Plan-Artefakt: Ressourcentyp, konkrete Änderung und zugelassene
Eigenschaften wie Projektname, Region oder Netzwerk-CIDR. Sensible Werte werden
maskiert; unbekannte Werte werden als erst nach Apply bekannt angezeigt. Rohes
Plan-JSON, Secrets und dynamische Ressourcenadressen werden nicht ausgegeben.

**Application Landing Zone erstellen** startet mit einem Klick den Apply genau
dieses gespeicherten Plans, ohne weitere Checkbox oder Freigabeschleife. Hash,
Runner-Paket, Bestellung, aktueller Plan und Execution-Delegation werden erneut
geprüft. Der Plan muss innerhalb einer Stunde erstellt worden sein; derselbe
Plan kann nur einmal angewendet werden. Für Apply wird eine neue, kurzlebige
Runner-Berechtigung erzeugt, nicht die Plan-Berechtigung wiederverwendet.

Apply läuft niemals automatisch. Ein möglicherweise teilweise ausgeführter
Apply wird als `reconciliation_required` gesperrt und nicht automatisch erneut
gestartet. Die Vorschau und damit Apply sind aktuell für den qualifizierten
lokalen Runner verfügbar; ein Runner ohne sichere Saved-Plan-Inspektion meldet
Apply als deaktiviert. Frühere Hinweise auf einen reinen Plan-Pfad oder einen
noch fehlenden Application-Apply sind durch diesen Stand überholt.

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

## Bestellfreigabe (2026-10-07)

Unter **Application Landing Zones > Bestellungen > Details anzeigen** kann ein
Platform Engineer eine fremde Bestellung mit `approval-required` freigeben oder
ablehnen. Die Entscheidung muss ausdruecklich bestaetigt werden; fuer eine
Ablehnung ist eine Begruendung erforderlich. Selbstfreigaben sind gesperrt.

Migration 040 speichert Entscheidung, Entscheider, Zeitpunkt und Begruendung als
unveraenderlichen, tenantgebundenen Nachweis. Wiederholungen derselben Entscheidung
liefern denselben Nachweis; eine widerspruechliche Entscheidung wird abgewiesen.
Der Besteller sieht den Status und die Begruendung seiner eigenen Bestellung.
Bestehende Bestellungen ohne Nachweis bleiben ausstehend; bei `direct` ist keine
Bestellfreigabe erforderlich. Die veroeffentlichte Template-Version bleibt erhalten.

Die fachliche Freigabe startet weder einen Runner noch einen Cloud-Plan oder Apply.
Die Runner-Aktivierung erfolgt separat. Neue Jobs, Credential-Grants,
Claims, Dispatches und Runner-Tickets fuer freigabepflichtige Bestellungen werden
ohne positiven Entscheidungsnachweis auch in der Datenbank gesperrt. Bestehende
Credential-, Backend-, Identitaets- und Ausfuehrungspruefungen bleiben erhalten.

Qualifiziert mit echten PostgreSQL-Rollen-/Tenant-Tests und Desktop-/Mobil-
Browserfaellen. Ein privater Restore des lokalen Schemas 039 wurde zweimal nach 040
migriert; alle 37 bisherigen Fach-/Auth-Tabellen blieben unveraendert.

## Application-Plan im UI (2026-10-07)

Nach einer Bestellfreigabe kann der Besteller in den Bestelldetails die
**Plan-Vorbereitung bestaetigen** und **Plan vorbereiten**. Das erzeugt einen
kurzlebigen, idempotenten Plan-Job fuer die eigene Bestellung; es startet keinen
Runner und fuehrt keinen Cloud-Plan aus.

Der im Plattformvertrag gebundene technische Platform Engineer sieht diesen Job
in denselben Bestelldetails. Er waehlt ein bereits registriertes **State-Backend**
und bestaetigt dessen Freigabe. Der State-Key bleibt der unveraenderliche
Application-Instanz-Key, nicht der Plattform-State-Key. Ein separater Klick nach
**Cloud-Plan bestaetigen** startet den isolierten Application-Plan-Runner.
Die technische Freigabe und der Start bleiben an dieselbe Sitzung gebunden.

Die UI liest die wirkliche Server-Capability statt die bei Bestellung gespeicherten
Sperrhinweise als aktuellen Runner-Status zu behandeln. Laufende Jobs werden
aktualisiert. Reloads loesen keine Mutationen aus. Ein verlorener Prepare-Response
oder ein Fehler beim anschliessenden Statusabruf verwendet beim Retry denselben
Idempotenzschluessel. Abgelaufene Jobs koennen neu vorbereitet werden.

Migration 041 ergaenzt ausschliesslich SELECT-Sichtbarkeit fuer den bereits
gebundenen technischen Freigeber. Fremde Tenants und ungebundene Platform Engineers
erhalten keine Jobs; die INSERT-, Credential-, Backend- und Dispatch-Gates bleiben
erhalten. Die Job-Liste enthaelt keine Schluessel, rohen States, Planartefakte oder
Runner-Ausgaben, sondern Status und die validierte Plan-Zusammenfassung.

Lokal ist das separat qualifizierte Application-Paket ueber
`LZC_APPLICATION_EXECUTION_ENABLED=true` und
`LZC_APPLICATION_RUNNER_PACKAGE_DIR` angebunden. Das vorhandene Plattform-Paket
bleibt unveraendert. **Application-Apply ist noch nicht implementiert**:
`applyEnabled=false`, keine automatische Erstellung nach Bestellfreigabe oder
erfolgreichem Plan. Ein echter Cloud-Plan wurde durch diesen Rollout nicht gestartet.

Qualifikation: 31 echte PostgreSQL-Tests, 16 neue Desktop-/Mobile-Plan-Faelle,
vollstaendiger Organisations-Browserlauf mit 60 Faellen vor dem zusaetzlichen
GET-Ausfall-Test und 412 kanonische Unit-Tests bestanden. Ein privater Restore von
040 wurde zweimal nach 041 migriert; alle 38 bestehenden Tabellen blieben dabei
inhaltlich unveraendert. Im laufenden lokalen Rollout blieb die Bestellentscheidung
erhalten; eine normale erneute Anmeldung ergaenzte eine Sitzung und erneuerte nur
Verifikationszeit und Gueltigkeit der bestehenden STACKIT-Identitaet.

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

### Neue Runner-Bindung und Loeschung vor Ausfuehrung (2026-10-07)

Neue Template-Versionen koennen die vom Application-Dienst angebotene
qualifizierte Accelerator-Revision verwenden. Die Veroeffentlichung zeigt die
Revision und erfordert eine ausdrueckliche Bestaetigung fuer jede neue Version.
Bestehende Versionen und Bestellungen werden niemals automatisch umgebunden.
Nicht unterstuetzte Bestandsrevisionen erhalten beim Planversuch eine konkrete
Fehlermeldung statt eines scheinbaren Dienstausfalls.

Besteller koennen eigene, Platform Engineers die sichtbaren Bestellungen ihres
Arbeitsbereichs mit ausdruecklicher Bestaetigung loeschen. Voraussetzung ist,
dass noch kein Dispatch, Runner-Ticket oder Credential-Claim existiert.
Vorbereitete Jobs und Backend-Freigaben allein verhindern die Loeschung nicht;
nach der Loeschung duerfen sie jedoch nicht mehr ausgefuehrt werden.

Migration 042 ergaenzt einen unveraenderlichen, tenantgeschuetzten Loeschvermerk.
Die Bestellung verschwindet aus der Liste; Versionsinhalte, Freigaben und
Idempotenzhistorie bleiben erhalten. Replays erzeugen keine neue Bestellung.
Gemeinsame Zeilensperren serialisieren Loeschung und Ausfuehrungsfreigaben.
Es werden weder Cloud-Ressourcen noch Terraform-State geloescht. Der Umgang
mit bereits ausgefuehrten Bestellungen und Application-Apply bleibt offen.

[#92](https://github.com/stackitcloud/stackit-landing-zone/issues/92) bleibt fuer
die produktive Veroeffentlichungsabnahme unter autoritativ verifizierter
Tenantbindung offen. Private Entwuerfe werden nicht im AO-Katalog angezeigt.

[#91](https://github.com/stackitcloud/stackit-landing-zone/issues/91) und
[#93](https://github.com/stackitcloud/stackit-landing-zone/issues/93) liefern die
verifizierte Organisations-/Benutzerbindung und Instanziierung mit eigenem State.
Die bisherige Sperre für Kunden-Apply bleibt bestehen.

### Delegierte Application-Plan-Ausfuehrung (2026-10-08)

Der Platform Owner richtet im Publikationsbereich einmal pro freigegebenem
Plattformvertrag die Ausfuehrung mit einem registrierten State Backend ein.
Die Berechtigung bindet unveraenderlich den Service Account des Vertrags,
Credential-Version und Key-ID sowie Backend-Identitaet und verschluesselte
Backend-Credentials. Bestehende Vertraege erhalten keine automatische Delegation.

Neue Plan-Jobs einer dazu gebundenen Template-Version uebernehmen diese
Berechtigung und den instanzspezifischen State-Key. Der Application Owner startet
den Plan explizit selbst, ohne zweite technische Backend-Freigabe und ohne aktive
Platform-Owner-Sitzung. Bei `approval-required` bleibt zuvor die fachliche
Bestellfreigabe erforderlich; `direct` benoetigt sie nicht. Alte Jobs und
Template-Versionen werden nicht nachtraeglich umgebunden.

Der Platform Owner kann die Berechtigung widerrufen. Vor weiteren Runner-Zugriffen
werden aktuelle Rollen, Bestelleridentitaet, Gruppenfreigabe, Credential- und
Backend-Bindung erneut geprueft. Eine neue Delegation reaktiviert keine alten Jobs.
Secret und Backend-Credentials bleiben serverseitig und werden nur einmal an den
gebundenen Runner ausgegeben. Neue Publikationen uebernehmen die angebotene,
qualifizierte Runner-Revision ohne zusaetzliche Pflicht-Checkbox.

Application-Apply bleibt unimplementiert. Ein erfolgreicher Plan erzeugt keine
Cloud-Ressourcen und ist keine Apply-Freigabe.

## Prüfungen

- [x] Alle acht Quellvorlagen werden ohne Verlust von Plattform-/Projektpolicy konvertiert.
- [x] Persönliche Instanzfelder gelangen nicht in Projektvorlagen.
- [x] Legacy-Dokumente bleiben beim Einlesen unverändert; Kopien benötigen eine neue ID.
- [x] Git-Speicherung erhält Metadaten; tfvars und Deployment-Vorbereitung enthalten keine daraus erzeugten Projekte.
- [x] Gemischte Template-/Instanzdokumente werden abgewiesen.
- [x] Native OpenTofu-Variablenprüfung bestätigt leere Anwendungs-, Sandbox- und Namespace-Sammlungen im Plattformexport.
- [x] Browserprüfung einschließlich Bestandskopie/Speicherung erfolgreich; CI-Validierung und [Release 36855011827](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36855011827) für `0e62c5e` erfolgreich. Live-SPA liefert HTTP 200 mit dem erwarteten Bundle `index-bjLShEoG.js`.
