# Gestufter Rückbau von Landing Zones

[English](retirement.md) | [Deutsch](retirement.de.md)

Das [Lifecycle-Konzept](../../docs/destroy-lifecycle-concept.de.md) beschreibt
Verantwortung und gestuften Rückbau. Die Configurator-Implementierung wird über
`LZC_RETIREMENTS_ENABLED` ausdrücklich aktiviert; Standard ist `false`. Voraussetzung
sind ein qualifiziertes Runner-Paket und unabhängig weiterbestehende
Steuerungsinfrastruktur. Die freigegebene Qualifikation verwendet eine neue
Wegwerf-Landing-Zone in Dev. Lokale Tests ersetzen keine Produktionsabnahme;
eine Aktivierung in Produktion ist eine gesonderte Entscheidung.

## Ablauf für den Platform Owner

Der Rückbau ist direkt nach einem erfolgreichen Plattform-Apply verfügbar. Weder
eine Application-Plattformanbindung noch veröffentlichte Application-Templates
sind dafür erforderlich. Die Auswahl verwendet den aktuellen, entsperrten State
und dessen erfolgreichen Apply im aktiven Workspace. Vor der Ankündigung werden
die nativen Ordner aus diesem State gelesen und zusammen mit den bestehenden
Application-Bereichen gesperrt. Ein nachweislich abgeschlossener S3-Backend-Wechsel
bleibt gültig, auch wenn seine Migrationsmarker als Nachweis erhalten bleiben.
Offene, widersprüchliche oder unbelegte Wechsel bleiben blockiert. Das Lesen
dieser Nachweise startet keinen weiteren Plan/Apply und ändert keine Cloud-Ressourcen.

1. Unter **Deployments → Stilllegen** (`/deployments/retire`) die genaue angewendete
   Plattform auswählen und den Rückbau mit Grund und Löschtermin ankündigen.
   Der eigene Reiter enthält Ankündigungen, Ausführungsfreigaben und den Wartezustand
   bis zur endgültigen Projektlöschung; der Verlauf bleibt separat.
   Sieben Tage sind vorbelegt; der
   Platform Owner kann den Termin bis zur State-Übernahme ändern. Besteller erhalten
   Ankündigung und Terminänderungen im Benachrichtigungszentrum. Sie können Daten
   exportieren oder ihre Applications selbst bereinigen. Zustimmung oder vorherige
   Selbstlöschung sind keine Voraussetzung. E-Mails folgen der persönlichen
   Einstellung für das Thema `retirement`.
2. Neue Bestellungen, Veröffentlichungen, Erweiterungen, Quell-Upgrades und alte
   Ausführungsfreigaben werden sofort gesperrt. Bereits laufende Schreibprozesse
   prüfen und abgleichen. Pausieren öffnet keine Neuanlagen; Fortsetzen entwertet
   frühere Generationen.
3. Nach dem Vorbereitungsfenster im automatisch geöffneten aktuellen Rückbau das gespeicherte
   Zugangsdatenprofil des tatsächlich handelnden Owners auswählen. Das Projekt, in dem der Account angelegt wurde,
   wird automatisch ermittelt und nach Abgleich der Service-Account-Identität mit
   STACKIT unter den optionalen Projektdetails mit Name und ID angezeigt. Bei bestehenden Profilen ohne Projektmetadaten
   wird der authentifizierte Account-Kontext mit den API-Antworten abgeglichen. Weder ein
   erneuter Upload noch eine manuelle Projekt-ID sind erforderlich. Scheitert die
   Prüfung, bleibt die State-Übernahme gesperrt; die Prüfung lässt sich direkt erneut
   starten.
   Erhalt des Zugangs, Datenexport/Aufbewahrung und State-Übernahme bestätigen.
   Geprüft werden Organisation, Ressourcenzuordnung, bekannte Unterprojekte,
   Quellverfügbarkeit, Runner-Stopp und die Lage von Steuerungsprojekten und
   Bereinigungsidentität außerhalb sämtlicher erfasster Rückbauziele. Operator-Projekt-IDs
   stammen aus der vertrauenswürdigen Deployment-Bindung; Kundenzugangsdaten benötigen
   keine Rechte auf die SaaS-Betreiberorganisation. Der kundeneigene Bereinigungsaccount,
   sein Projekt und dessen Zuordnung werden separat mit dem Kundenzugang geprüft.
4. Jeden ursprünglichen Plattform-/Application-State ausdrücklich in die
   verschlüsselte Verwahrung der bestehenden Configurator-Datenbank übernehmen.
   Das ist ein Wechsel der State-Autorität, kein zweiter aktiver State. Ursprüngliche
   Quell-/Backend-Identitäten und unveränderliche Snapshots bleiben dokumentiert.
   Alte Factory- und Backend-Zugriffe bleiben gesperrt. Ein normaler Abbruch ist
   nach dieser Übernahme nicht mehr möglich.
5. Zuerst abhängige Applications entfernen. Der Platform Owner prüft je Scope einen
   nativen Plan mit sichtbaren Ressourcenadressen und IDs. Nur genau dessen
   gespeichertes Artefakt darf mit demselben Runner-Paket, Quellstand, Provider-Lock,
   State-Stand, Owner und derselben Generation ausgeführt werden. Die Freigabefrist
   beträgt 30 Minuten. Datenexport/Aufbewahrung und Löschung sind pro Apply separat
   zu bestätigen.
6. Auf der Plattform zunächst Ressourcen privater Provider mit ursprünglicher
   Quelle und erreichbaren Control Planes entfernen, anschließend
   Plattformressourcen und Projekte über das reduzierte native Rückbau-Root.
   Folder und gemeinsame Organisationsberechtigungen bleiben verwaltet.
   Nie ausgeführte Bestellungen werden beim geprüften Plattform-Apply archiviert.
   Application-Rückbau wird dem tatsächlichen Owner zugeschrieben; Besteller werden
   nicht impersoniert.
7. Die tatsächliche endgültige STACKIT-Projektlöschung abwarten. Folder benötigen
   einen neuen Plan und ein ausdrückliches Apply. HTTP 409 bei der Folder-Löschung
   bleibt eine fehlgeschlagene native Ausführung. Nach Stopp- und State-Prüfung geht
   der Rückbau zurück nach `WAITING_FOR_PURGE`. Weder Zeitablauf noch eine leere
   Projektliste beweisen die endgültige Löschung. Der abschließende Lauf muss mit
   passenden nativen Löschbelegen erfolgreich sein. Gemeinsame Organisations-IAM
   bleibt erhalten.
8. Nachweise und Abschlussmeldungen bleiben außerhalb der gelöschten Landing Zone
   verfügbar. Gelöschte Ressourcen werden nicht automatisch wiederhergestellt.

## State, Zugangsdaten und unterbrochene Ausführungen

Migrationen 103–106 speichern Absicht, genaue State-/Folder-/Revisionsbindung,
Besteller, Generationen, unveränderliche Ereignisse, verschlüsselte Snapshots,
Kontrollfreigaben, HTTP-State-Verwahrung und eigene Rückbaujobs. Die Runtime darf
diese Tabellen nicht direkt verändern. Eine kurze Transaktionssperre ordnet neue
Zugriffe und die späte Freigabe von Zugangsdaten; sie besteht nicht während einer
mehrtägigen Wartezeit.

Die Ausführung verwendet einen eigenen kalten Cloud-Foundry-Job-Broker. Die bisherige
Bestellerbindung der Application-Ausführung wird weder erweitert noch ausgeliehen.
Jede Zugangsdatenfreigabe prüft den real freigebenden Owner und seine Sitzung,
Profil-/Schlüsselversion, Organisationszugriff, Generation sowie Quelle/Paket erneut.
Native State-Zugriffe verwenden ein anwendungskontrolliertes HTTP-Backend mit
Datenbanksperre pro Job. Plan-Jobs können keinen State schreiben. Ein nachgewiesen
beendeter Runner gibt ausschließlich seinen eigenen HTTP-Lock frei.

Ein Callback beweist weder Runner-Stopp noch erfolgreichen Rückbau. Vor dem nächsten
Schritt die tatsächliche CF-App und Paketidentität prüfen. Ein gestoppter Plan oder
ein vor der Apply-Phase beendeter Apply kann bei unverändertem State-Stand für einen
neuen Plan geklärt werden; das fehlende native Ergebnis bleibt unbekannt. Ein Apply,
der die Apply-Phase erreicht hat, bleibt ohne vertrauenswürdigen State-/Ergebnisabgleich
gesperrt. Ein fehlgeschlagener Apply bleibt fehlgeschlagen, auch wenn nach
Abgleich ein neuer Plan möglich wird. Bei `errored.tfstate` bleibt der Worker aktiv,
bis die verschlüsselte Sicherung bestätigt wurde. Während einer ausstehenden
Sicherung den CF-Task nicht beenden. Wiederholte Sicherungsuploads werden ohne
wiederholte Cloud-Aktion bestätigt. Nach tatsächlichem Stopp darf der Owner
Identität und entfernte Ressourcen prüfen und diesen State ausdrücklich übernehmen.
Danach ist ein neuer Plan erforderlich; das alte Artefakt wird nicht erneut benutzt.
Fehlt ein vertrauenswürdiger State oder Nachweis, Sperre erhalten und Wiederherstellung
klären. Keine Datenbankphase umschreiben und keine State-Einträge verwerfen.

Die bisherigen S3-Objekte sind nach Übernahme eingefrorene Nachweise und keine
aktiven Backends. Sie können die Löschung des Management-Buckets verhindern.
Benötigte Nachweise exportieren und das Entfernen dieser Objekte, Versionen und
sonstiger Bucket-Daten über den zuständigen Dienst ausdrücklich prüfen. Es gibt kein
automatisches `force_destroy`, Umgehen von Aufbewahrung oder stilles Leeren von
Buckets. Unabhängige Zugangsdaten und Datenbanksicherungen bis zum vollständigen
Abgleich erhalten.

### Fortschritt und Fehlerdiagnose

Der aktuelle Rückbau steht getrennt von abgebrochenen und abgeschlossenen Versuchen.
Jede Landing Zone hat ihren eigenen aktuellen Ablauf; ein älterer Versuch ersetzt
keinen ungeklärten aktiven Rückbau. Der **Rückbauverlauf** ist zunächst eingeklappt
und lädt Ausführungsdetails erst beim Öffnen eines Versuchs. Historische Versuche
sind nur lesbar: Sie bieten Ausgabe und Nachweise, aber keine Plan-, Apply-,
Zugangsdaten- oder Wiederherstellungsaktionen.

Jeder aktuelle Bereich führt Phase, nächste Aktion, neuesten Lauf, native Ausgabe
und die genaue Löschfreigabe zusammen. Erledigte Schritte und überholte Läufe
wandern in den eingeklappten Ausführungsverlauf. Ungeklärte Ausführungen und
State-Wiederherstellungen bleiben auch dann sichtbar, wenn ein neuerer Lauf
existiert. Application-Bereiche stehen vor der von ihnen blockierten Plattform.
Eine vorbereitete Zugangsfreigabe wird während ihrer Gültigkeit nicht erneut
angefordert. Pausieren, Abbrechen und ausdrückliche Statusprüfungen stehen unter
**Rückbau verwalten**; bei einem pausierten Rückbau ist **Rückbau wiederaufnehmen**
die primäre Aktion. Status, Ausgabe und ungeklärte Arbeit bleiben sichtbar;
Ausführung und automatische Abschlussprüfungen pausieren bis zur Wiederaufnahme.
Die erneute Bestätigung des Rückbauzugangs bleibt in optionalen eingeklappten
Details erreichbar.

Lasse die Rückbauschritte geöffnet, um den aktiven Auftrag zu verfolgen. Status und
OpenTofu-Ausgabe aktualisieren sich automatisch. Jeder Auftrag behält seine eigene
begrenzte, bereinigte Ausgabe; rohe States und maschinenlesbares Saved-Plan-JSON
werden nie angezeigt. Für ältere Aufträge aus der Zeit vor der Ausgabeerfassung
kann keine gespeicherte Ausgabe vorliegen.

Die Schrittliste zeigt die Bereinigung von Diensten und Control Planes, das Entfernen
der Projekte und die zeitversetzte Ordnerlöschung. Prüfe vor der Apply-Freigabe die
konkrete Löschliste aus dem erfolgreichen nativen Plan. Technische Quell- und
Provider-Nachweise stehen unter optionalen Details. Solange die Schritte geöffnet
sind, prüft die App nach gemeldetem Abschluss deines Auftrags automatisch den
zugehörigen Runner und das Ergebnis. Eine vorübergehend nicht verfügbare
Abschlussprüfung wird wiederholt und als ausstehend angezeigt; die Löschfreigabe
bleibt gesperrt, bis die bestehenden serverseitigen Prüfungen erfolgreich sind.
Eine zusätzliche Runner-Stopp-Aktion ist nicht erforderlich. Die Prüfung startet
niemals einen Plan oder Apply. Läufe ohne natives Ergebnis und unterbrochene
State-Wiederherstellungen erfordern weiterhin eine ausdrückliche Status- oder
Wiederherstellungsprüfung; ausstehende Sicherungsuploads werden nie automatisch
beendet.

Snapshot-Prüfungen verwenden das unveränderte State-Dokument des HTTP-Backends.
`tofu state pull` kann `check_results` normalisieren oder umsortieren; diese
Darstellung wird zur Inventarprüfung verwendet, nicht als bytegleicher Nachweis.
Derselbe Abgleich mit dem maßgeblichen Dokument bindet die Nachweise nach einem
Apply. State-Version, Sperren und Löschfreigaben werden weiterhin geprüft.

## API und Deployment

Browser-APIs benötigen eine aufgelöste Sitzung, den expliziten Arbeitsbereich und
bei Änderungen CSRF-/Origin-Prüfung. Application Owner sehen nur betroffene Hinweise;
Ausführung benötigt Plattformrolle und aktuellen Organisationsnachweis.

| Endpoint | Zweck |
| --- | --- |
| `GET /api/v1/retirements`, `/candidates` | Status und Auswahl der genau angewendeten Plattform |
| `POST /api/v1/retirements` | Absicht, Termin, Benachrichtigung und dauerhafte Neuanlagensperre |
| `POST /api/v1/retirements/:id` | Generationsgebunden prüfen, pausieren, fortsetzen, vor Übernahme abbrechen oder Termin ändern |
| `GET /api/v1/retirements/:id/execution` | Sichere Scope-/Job-Übersicht ohne Zugangsdaten, Roh-State oder Roh-Plan |
| `GET /api/v1/retirements/:id/jobs/:jobId/output` | Für den Workspace autorisierte, bereinigte native Ausgabe eines Auftrags lesen |
| `POST /api/retirement-runner/output` | Begrenzten Fortschritt mit dem Runner-Zugang genau dieses Auftrags melden |
| `POST /api/v1/retirements/:id/credential-project` | Projekt des Accounts im gewählten Profil ermitteln und prüfen; keine State-Übernahme oder Ausführung |
| `POST /api/v1/retirements/:id/prepare` | Unabhängigen Zugang prüfen und State ausdrücklich übernehmen |
| `POST /api/v1/retirements/:id/plans` | Nativer Plan mit gebundener Quelle für einen freigegebenen Scope |
| `GET .../:id/jobs/:jobId/preview` | Genaue Ressourcenliste zur Löschung |
| `POST .../:id/jobs/:jobId/apply` | Explizite Freigabe des gespeicherten Artefakts |
| `POST .../:id/jobs/:jobId/inspect` | Runner-Stopp, gespeicherten State und Ergebnis vor Fortschritt prüfen |
| `GET` / `POST .../:id/jobs/:jobId/recovery` | Unterbrochenen State prüfen / nach Stopp ausdrücklich übernehmen |

`/api/retirement-runner/*` verwendet eine separate Berechtigung für genau einen Job;
Browser-Cookies berechtigen nicht. HTTP-State-Zugänge gelten nur für diesen Job/State.
Änderungen an Quelle, Artefakt oder State, zusätzliche Ressourcen und Verschwinden
beim Refresh werden zurückgewiesen. Öffentliche Antworten und Logs enthalten keine
rohen nativen Pläne oder privaten States.

Der Release-Workflow übernimmt `LZC_RETIREMENTS_ENABLED` aus der ausdrücklichen
Environment-Variable und bindet `LZC_RETIREMENT_CONTROL_PROJECT_IDS` an das
Operatorprojekt `LZC_PROJECT_ID`. Staging deaktiviert Rückbau grundsätzlich.
Der Runtime-Start verweigert ein fehlendes/unqualifiziertes Paket oder unvollständige
Ausführungsabhängigkeiten. Produktion bleibt ohne gesonderte Aktivierung/Freigabe aus;
ein automatischer Produktionsrollout ist damit nicht verbunden.

## Grenzen und Qualifikation

Die initiale automatische Erfassung ist auf 100 abhängige Applications und zusammen
64 MiB unverschlüsselte Nachweisdaten begrenzt. Größere, gemeinsame oder uneindeutige
Scopes benötigen eine gesonderte Stapelprüfung. Unbekannte Provider, fehlende historische
Quellen, Projekte außerhalb erfasster Folder, fremde Unterprojekte oder unerreichbare
Control Planes blockieren die Ausführung statt den Umfang auszuweiten. Vor State-Übernahme verweigert das gehostete CF-Profil Kubernetes-/Helm-/OPNsense-Workloads;
diese zuerst mit der ursprünglich erreichbaren Umgebung bereinigen. Gehostete
Bereinigung privater Provider ist auf die enthaltenen Vault-/Grafana-Profile begrenzt.
Terraform-Registry-Identitäten benötigen vor Übernahme eine separat geprüfte
OpenTofu-Migration. Auch die eingefrorenen Eingaben müssen vorher sicher rekonstruierbar
sein. Für private SNA-Control-Planes bleibt eine ursprünglich erreichbare Ausführungsumgebung nötig;
Cloud Foundry wird durch diese Funktion nicht zum SNA-Runner.

Das unabhängige [OpenTofu-Runbook](../../src/retirement/README.de.md) gilt für ohne
Configurator erstellte Landing Zones. Es benötigt weder Import noch Configurator-DB
oder zusätzlichen Backend-Dienst; ursprünglichen State und weiterbestehendes Backend
verwenden. Organisatorischer Einzelzugriff ersetzt die Configurator-Neuanlagensperre.

Lokale Prüfungen umfassen Offline-Guards, Loopback-Tests mit echtem gepinntem Provider,
PostgreSQL-Autoritäts-/State-/Freigabe-/Recovery-Abläufe und Browserprüfung auf Desktop
und Mobilgerät. Sie verändern keine realen STACKIT-Ressourcen.
Die CI initialisiert außerdem das erzeugte HTTP-Backend des Workers mit gepinntem
OpenTofu und führt einen gespeicherten synthetischen Plan mit neuem Job-Zugang aus.
Das prüft State-Sperren, Zugangsdatenwechsel und Löschung ohne Cloud-Zugriff.
Reale Dev-Ergebnisse separat dokumentieren, einschließlich einer noch offenen Projektlöschwartezeit.
Wartenden Rückbau niemals als abgeschlossen ausweisen. Bestehende Demo-Umgebungen
bleiben bei der Qualifikation erhalten.
