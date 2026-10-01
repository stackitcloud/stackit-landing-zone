# Erstbereitstellungspläne

Stand: 2026-10-01. Umsetzung auf `feature/landing-zone-configurator`.

## Was der Benutzer testen kann (nach erfolgreichem Release)

1. **Deployments** öffnen und im Abschnitt **Erstbereitstellung planen** eine
   gespeicherte Vorbereitung auswählen.
2. Nur für eine neue Landing Zone bestätigen, dass noch keine Ressourcen und kein
   bestehender State zu dieser Konfiguration existieren. Bestehende/teilweise
   erzeugte Landing Zones sind in diesem Ablauf nicht unterstützt.
3. **Erstbereitstellung planen** starten. Erwartete Stationen: Runner vorbereiten,
   initialisieren, validieren, planen und abgeschlossen/fehlgeschlagen.
4. Seite neu laden: Auftrag und Ergebnis bleiben erhalten. Anlegen, Ändern,
   Ersetzen, Löschen, Datenlesen und geänderte Ausgaben werden getrennt gezählt.
5. Optional einen weiteren Plan abbrechen. Abbruch entzieht sofort den Broker-
   Zugriff; das Stoppen des CF-Tasks durch Cleanup erfolgt zeitversetzt.

**Kein Kunden-Apply oder Destroy.** Der Benutzer verlangt ausdrücklich eine neue
Freigabe vor jedem Kunden-Apply. Die Freigabe für Configurator-Infrastruktur gilt
nicht dafür. Die jetzigen Pläne sind Prüfungen und können nicht angewendet werden;
ihre Binärartefakte werden entfernt. Vor einem zukünftigen Apply ist ein neuer
Plan samt unveränderlichem Artefakt, Freigabe und State-Sicherung notwendig.

## Plattformentwürfe mit Projekt-Templates

Neue Editor-Konfigurationen enthalten Projekt-Template-Entwürfe statt konkreter
Anwendungsprojekte. Ihr tfvars-Export und damit ihr Erstbereitstellungsplan enthalten
**nur die Plattform**, keine Instanzen dieser Vorlagen. Alte Gesamtkonfigurationen
behalten ihre bisherigen Projekte. [Details und Bestandsschutz](project-template-drafts.md).

## Gemeinsamer Editor und Ausführungsumfang

Schema v3 wird für eine konservative Standalone-Teilmenge unterstützt: eu01,
explizit Public-Projekte, Sandbox-Projekte, Grundeinstellungen und die bisherige
Secrets-Manager-Option. Netzwerk, Kubernetes, Firewall und zusätzliche Plattform-
oder Projektdienste bleiben für diesen Runner gesperrt. Die Prüfung erfolgt anhand
der effektiven Konfiguration, nicht anhand des Template-Namens. UI, Vorbereitung
und Broker verwenden `initialPlanIssues`; vor Übergabe der Zugangsdaten an den
Runner wird erneut geprüft. JSON und tfvars bleiben an dieselbe Git-Revision und
den unveränderten Export-Hash gebunden. Legacy-Dokumente bleiben unterstützt.

Die Organisationstenant-Sperren gelten weiter. Es bleibt ein Erstbereitstellungsplan
mit leerem State, kein Plan für bereits bestehende Ressourcen und kein Apply.
Erweiterte Ausführung: [#89](https://github.com/stackitcloud/stackit-landing-zone/issues/89).

## Ablauf und Grenzen

**Private Kubernetes-APIs:** Der aktuelle CF-Runner hat keinen nachgewiesenen
Zugriff auf Kunden-SNAs. Ein erfolgreicher STACKIT-Zugangstest belegt diesen
Netzwerkpfad nicht. Auch Plan/Refresh mit Kubernetes-/Helm-Providern kann ihn
benötigen. Die zweistufige Ausführung aus
[#37](https://github.com/stackitcloud/stackit-landing-zone/issues/37) ist noch offen
und wird separat umgesetzt. Anforderungen an Ausführungssperren bei Erweiterung
des bisherigen Standalone-Vertrags stehen im
[Grenzenregister](accelerator-limitations.md#private-kubernetes-api-ausführungsgrenze).


- POST `/api/v1/plans` verlangt Session, exakten Origin, CSRF-Token und
  `confirmNewDeployment: true`. Nur eine eigene Vorbereitung mit eigenem
  gespeichertem Credential und Rolle admin/deployer wird akzeptiert.
- GitHub-Fork-Zugriff, festgehaltener Head und generierter tfvars-Export werden
  mit dem GitHub-Benutzertoken erneut geprüft. Geänderter Fork-Head erfordert eine
  neue Vorbereitung; es wird keine andere Version still übernommen.
- SQL 004/005 persistiert Aufträge mit Forced RLS, Vorbereitung, Status, Engine-
  und Provider-Lock-Version sowie CF-Droplet-Referenz. Ein aktiver Auftrag pro
  Benutzer/Mandant, höchstens 20 Starts in 24 Stunden; Liste zeigt letzte 100.
- Der Dispatcher verwaltet ausschließlich die separate Organisation
  `lzc-dev-runners`, Space `plans`, SSH deaktiviert. Für jeden Auftrag erstellt er
  eine App ohne Route/Service-Bindings und kopiert das geprüfte Runner-Droplet.
  CF-Manager-Credentials verbleiben im vertrauenswürdigen API-Backend/Release.
- Der Runner erhält drei App-Variablen: Auftrags-ID, feste Broker-URL, zufälliges
  256-Bit-Ticket. In PostgreSQL liegt nur dessen Hash. Gültigkeit maximal 25 Minuten.
  Eine eng begrenzte SECURITY-DEFINER-Funktion löst das Ticket auf genau einen
  aktiven Auftrag auf; danach gelten Eigentümer-/Tenant-RLS und Rollenprüfung.
- Eingaben werden einmal ausgegeben, nach erneuter Rollen-, Profil-, Versions-
  und Organisationsprüfung. Andere Profile oder Mandanten sind nicht auswählbar.
  Die Terraform-Unterprozesse erhalten eine explizite Umgebung ohne Broker-Ticket.
- Fester Accelerator-Commit `a256f6896d11134fdc351786f1be5eba4e56b2e2`, OpenTofu
  1.12.6, Provider-Lock SHA-256
  `a52433c424472d6e618caa3a94579bbcd19b60b759d053cf0d5caf9ac6872888`.
  CI baut nur Upstream-Code dieses Commits und einen Linux-Provider-Mirror.
- Direkte Befehle in `deploy/runner/run-plan.sh`: init mit readonly Lock, validate,
  plan mit detailed exit code und show. Kein frei wählbarer Befehl, kein Apply-Pfad.
- Ergebnisprojektion enthält nur Zahlen, Status und feste Fehlercodes; keine
  Adressen, Attributwerte, Output-Namen, Rohdiagnosen oder Geheimnisse. Auch nicht
  als sensitive markierte Werte werden nicht exportiert. Detailansicht einzelner
  Ressourcen und sichere Provider-Fehlerdiagnosen sind noch offen.
- Task: 1 GiB RAM, 4 GiB Disk, 18 Minuten Engine-Frist, private Dateien begrenzt.
  SQL-Frist: 25 Minuten. Maintenance alle 30 Sekunden, Cleanup nach mindestens
  30 Sekunden terminalem Status. Auch nach API-Neustart werden Aufträge abgeräumt.
  Bei CF-/Netzfehlern kann Cleanup länger dauern; Ticket-Ablauf bleibt unabhängig.
- Kein automatischer Dispatch-Wiederholungsversuch. Ein Prozessverlust vor Start
  führt zu Abbruch/Ablauf statt stiller Neuausführung. Es gibt noch keinen allgemeinen
  Queue-Scheduler, keine dauerhafte Runner-Heartbeat-Überwachung und keine Plan-
  Artefaktaufbewahrung. CF-Quoten begrenzen die Gesamtkapazität zusätzlich.
- Vorbereitungen mit Plan-Nachweisen werden nicht gelöscht. Archivierung und
  Aufbewahrungsfristen der Metadaten sind ein nachfolgender Schritt.

## State-Lebenszyklus gemäß LZA

Entscheidung des Benutzers: bestehenden
[LZA-Bootstrap](https://github.com/stackitcloud/stackit-landing-zone/blob/main/docs/getting-started.md)
übernehmen. Der gespeicherte Zugang ist der Bootstrap-Service-Account; Projekt und
Account werden nicht erneut angelegt. Der erste Plan benutzt ausdrücklich leeren
lokalen State. Ein Plan legt weder Management-Projekt noch Bucket an.

Beim später separat freigegebenen ersten Apply erzeugt das Management-Modul den
Kunden-State-Bucket samt Credentials. Anschließend `tofu init -migrate-state`,
Migration prüfen, auf Management-Service-Account wechseln und erneut planen.
Der anfänglich lokale State muss bereits während des Apply dauerhaft und verschlüsselt
abgesichert sein, auch bei partiellem Fehler und hartem Runner-Verlust. Flüchtiger
CF-Speicher reicht dafür nicht. Diese Recovery ist noch nicht implementiert und
bleibt eine zwingende Apply-Voraussetzung. Kein zusätzlicher dauerhafter zentraler
Kunden-State-Bucket; Infrastruktur- und Kunden-States werden nicht vermischt.

## Abnahme

- [x] API: Session/CSRF, striktes Eingabeschema, Erstbereitstellungsbestätigung,
  persönliches GitHub-Token und kein Apply-Endpunkt getestet.
- [x] PostgreSQL: fremde Aufträge, konkurrierender Start, Ticket-Replay, Status-
  Reihenfolge, Ablauf und gezieltes Cleanup getestet.
- [x] CF-Client: eigene App, feste Befehle, nur drei Job-Variablen und keine Route.
- [x] Desktop/Mobil: Plan-Start, laufender Status, Ergebnis nach Reload, kein Apply.
- [x] Lokaler echter OpenTofu-Vertragstest ohne Cloud-Zugang und ohne Apply.
- [x] Separate CF-Organisation samt Manager per Plattform-IaC erstellt.
- [x] Runner-Space/Rollen per Runtime-IaC erfolgreich angewendet.
- [x] Linux-Paket, Provider-Mirror und CF-Engine-Test erfolgreich.
- [x] Live-App: separaten Runner ohne Service-Bindings prüfen, ungültiges Ticket
  darf keinen Kundenauftrag ausführen; Probe-App entfernen.
- [ ] Erster persönlicher Kunden-Plan durch den Benutzer.

## Live-Abnahme vom 2026-09-30

[Release 36727211809](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36727211809)
für `b5686ef` erfolgreich: CF-Engine init/validate, Datenbankmigrationen,
PostgreSQL-/Secrets-Manager-Verbindungen, separate Probe-App und öffentliche
Route. Runner-Verwaltungsidentität hat keinen Zugriff auf die Configurator-App;
Probe-App ohne Routen oder Service-Bindings. Zufälliges, nicht registriertes Ticket
führte zu einem fehlgeschlagenen Task. Dies ist eine Infrastruktur-/Isolationsprobe,
noch kein erfolgreicher persönlicher Kunden-Plan.

Gemessen vom Dispatch bis zur Task-Erstellung: **3.907 ms**; bis zum beobachteten
Task-Ende: **12.244 ms**. Ein Einzelwert, keine Latenzgarantie. Die Probe nutzt die
vorab gestagte Vorlage, keinen `cf push` pro Auftrag. Reguläre Jobausführung hat
zusätzlich Eingabe-/Zugriffsprüfung und OpenTofu-Laufzeit. Kein Kunden-Apply.

## Quellen

[OpenTofu JSON-Format](https://opentofu.org/docs/internals/json-format/),
[Plan-Exitcodes](https://opentofu.org/docs/cli/commands/plan/),
[CF V3 Droplet-Kopie](https://v3-apidocs.cloudfoundry.org/version/3.199.0/index.html#copy-a-droplet),
[CF V3 Tasks](https://v3-apidocs.cloudfoundry.org/version/3.199.0/index.html#create-a-task).

## Release des v3-Standalone-Planpfads (2026-10-01)

Commit `9aa3322`, [Release 36849188406](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36849188406)
und [Validierung 36849188417](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36849188417)
erfolgreich. Lokal 123 Unit-, 22 PostgreSQL- und 38 Browserprüfungen; echter
OpenTofu-Plan-Summary-Test und vier native Application-Root-Verträge mit 1.12.6.
Die Datenbankprüfung umfasst Legacy/v3 und die erneute Sperrprüfung im Broker.
Die Live-App liefert das neue Bundle, Health 200 und anonym geschützte APIs 401.
Dies ist keine persönliche Kunden-Plan-Abnahme und kein Kunden-Apply.
