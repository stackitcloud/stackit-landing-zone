# Runtime Validation Report

Generated: 2026-10-02T10:14:20Z
Target: `landing-zone-configurator/app`, lokale STACKIT-Login-Umstellung.

## Hosted Application Maintenance: Vorbereitet (2026-10-09)

Der Benutzer hat Commit, Push und Dev-Deployment freigegeben; zusaetzliche
DB-Backups sind ausdruecklich nicht gewuenscht, da STACKIT regelmaessig sichert.
Einziges Ziel ist `https://lzc-dev-configurator.apps.01.cf.eu01.stackit.cloud`
ohne Suffix. Der Web-Client fuer genau dieses Ziel ist bereits angefordert;
Bereitstellung und oeffentliche Client-ID sind noch ausstehend. Die bestehende
Suffix-Adresse wurde nur als lesender Iststand geprueft, nicht als Ziel gewaehlt.

Die CF-API bindet getrennte Platform-/Application-Broker an die qualifizierte
Droplet-ID. Vorschau und CLI-Anzeige verwenden die vorhandene backendfreie
Inspektion mit minimaler credentialfreier Prozessumgebung. Das Release liefert
identische Runner-/Inspektionsbytes und prueft beide nativen Roots sowie beide
Broker-Isolationspfade. Alte Plans werden nicht umgebunden. Die schreibgeschuetzte
Drift-Ansicht und die exakte Destroy-Bestaetigung behalten alle bestehenden Gates.

```text
local canonical check: PASS - exit_code 0; 433 unit passed, 53 gated skips
types/build/lint: PASS - existing warnings only; same final Web assets
CF regression: PASS - 6 cases, separate brokers/exact droplet/package-change denial
release preparation: PASS - 3 cases including durable key and droplet requirements
Linux CI build: PASS - run 37929894997, source 4a09889, deploy deliberately skipped
Linux DB/browser: PASS - full database gate and 270 desktop/mobile browser cases
native contracts: PASS - 16 Application, 7 network, 3 governance tests; packaged roots validated
artifact: configurator-release-37929894997, immutable ID 11616895038, not expired
online target: NOT_LIVE - requested suffix-free origin currently HTTP 404
hosted activation: PENDING - requested STACKIT PKCE Web client not yet provisioned
customer operations: NOT_RUN - no Cloud Plan/Apply/Destroy or state mutation
overall: BUILD_QUALIFIED / HOSTED_PENDING_CLIENT - no additional database backups
```

Es wird weder ein erneuter Client-Antrag noch die Wiederverwendung des lokalen
Loopback-CLI-Clients verlangt. Vor Promotion muss `lzc-dev-release` den
bereitgestellten Web-Client, Authorization Code/S256 und beide HTTPS-Callbacks
am suffixfreien Origin erhalten. PKCE-Modus, suffixfreier Redirect, deaktivierte
CLI-Freigabe und beide Ausfuehrungsflags sind im geschuetzten Environment gesetzt.
Der dauerhafte Artefaktschluessel wurde einmalig als Environment-Secret erzeugt,
ohne ihn auszugeben oder in das Artefakt aufzunehmen. Die oeffentliche Client-ID
bleibt ausstehend; kein Ersatzwert wurde gesetzt. Kein Auth-Fallback, kein
zusaetzliches DB-Backup und keine Aenderung der laufenden Online-App oder lokalen
API in dieser Vorbereitung. Der eigene markierte PostgreSQL-Testcontainer wurde
nach erfolgreichen 31 Tests entfernt; Customer-DB und andere Container bleiben.

Der erste CI-Run lief in das Standardlimit von fuenf Sekunden des erweiterten
DB-Lifecycle-Tests; das CI-Gate verwendet nun begrenzte 30 Sekunden. Eine bestehende
Login-Fixture berechnete Session- und Proof-Ablauf getrennt und verletzte sporadisch
den echten SQL-Guard `session_expiry <= proof_expiry`; die Fixture bindet jetzt
beide exakt, ohne Auth- oder Laufzeit-Gates abzuschwaechen. Im zweiten Run fehlten
die nativen Source-Pins im flachen Checkout. Hosted-Paketierung laedt nun nur die
beiden festen freigegebenen Commits nach; ein echter shallow-clone-Test und der
abschliessende vollstaendige Linux-Build sind gruen. Die Pins bleiben unveraendert.

## Aktiviert: Application-Destroy und Drift (2026-10-09)

Migration `050_application_maintenance.sql` ist lokal angewandt und ab jetzt
unveraenderlich. Die neuen Reiter erstellen explizit native Plans auf demselben
Application-S3-Key: Destroy mit `-destroy`, Drift mit `-refresh=true` und ohne
Apply-Moeglichkeit. Der Drift-Preview trennt `resource_drift` (State -> Cloud)
von `resource_changes` (Cloud -> bestellte Soll-Konfiguration). Nur erlaubte,
maskierte Attribute werden ausgegeben; untracked Cloud-Ressourcen sind nicht
Teil dieser Pruefung. Das ist keine organisationsweite Inventarisierung.

Destroy verlangt den geprueften, gespeicherten Binary-Plan, dessen exakten Hash
und eine separate instanzgebundene Bestaetigung. Worker, API und SQL verwerfen
Create/Update/Replace in einem Destroy-Plan; der globale Folder-Schutz bleibt
erhalten. Aktive Jobs, frische Tickets und persistierter Recovery-State sperren
Maintenance. Ein regelmaessig beendeter Reconciliation-Job darf nur bei
abgelaufenem Ticket und ohne Recovery gezielt durch Destroy/Drift untersucht
werden. Sein historischer Abschluss wird nicht umgeschrieben. Erfolgreicher
Destroy erlaubt eine separate Archivierung ohne Verlust der Audit-Historie.
Provider-Purge, IAM und passende unveraenderlich gebundene Source bleiben Grenzen.

Aktive lokale API: PID `69665`, Terminal
`6c2bc4bd-8769-48e1-8169-0bea22eae983`, Port 3000. Web bleibt auf Port 4181.
PKCE und beide Ausfuehrungsflags sind unveraendert. Das bestehende Platform-Paket
`runner-local-20261006-platform-contract-upgrade` wurde nicht veraendert.
Neues unveraenderliches Application-Paket:
`runner-local-20261009-application-maintenance`, ID
`8293d556-7f04-5fb5-aee3-e4f66b3af7ad`, Source
`57ad1f6a651c1787694b74ff8aa8b241a3dcd16f`, Archiv-SHA256
`8a385ff55d9b0390b6903c9cb7bcbc12965782063cdbfc828540c7144b19bfac`.
Alte Pakete und Plans wurden nicht umgebunden; fuer weitere Ausfuehrungen wird
ein neuer passender Plan erstellt.

```text
environment: Docker PostgreSQL 17.11, Node 24.21.0/npm 11.19.0, Playwright available
startup: PASS - local API/Web healthz 200; PKCE authorization-code retained
unit: PASS - exit_code 0; npm test -- --maxWorkers=2; 430 passed, 53 gated skips
integration: PASS - exit_code 0; 31 real isolated PostgreSQL tests
	guards: purpose replay, drift Apply denial, exact Destroy confirmation,
	active/expired ticket, recovery even after ticket expiry, archive after Destroy,
	sensitive drift masking and unchanged historical reconciliation evidence
browser: PASS - exit_code 0; 52 desktop/mobile lifecycle cases, including DE/EN drift
native: PASS - exit_code 0; new package backend-free init/validate and native fixture
types/lint: PASS - scoped check; one existing non-null warning, existing CSS warnings
build: PASS - existing bundle-size warning only
restore: PASS - actual 049 dump restored; 050 migrated twice as normal migration role
retention: PASS - all 41 customer tables and 3 private files unchanged after restart
live: PASS - guest requests 401, invalid runner input 401, exact served build verified
cloud: NOT_RUN - no customer Plan/Apply/Destroy, state rewrite, or auth impersonation
overall: LOCAL_PASS / CLOUD_NEEDS_SIGNOFF - Cloud/Vault/runner mocked in DB/browser cases
delivery: LOCAL_ONLY - no commit, push, merge, Cloud Foundry release or customer archive
```

Private konsistente Dumps und Retention-Nachweise liegen unter
`/Users/weberruss/lzc-application-maintenance-20261009-6bdRlO`
(Verzeichnis 0700, Dumps/Nachweise 0600). Die Restore-Pruefung und der frische
Rollout-Snapshot verwendeten einen gemeinsamen PostgreSQL-Snapshot mit pg_dump.
Customer-DB, vorhandene State-Keys und alle historischen Packages bleiben erhalten.
Die folgenden datierten Abschnitte dokumentieren vorherige Runtime-Staende.

## Aktiviert: Application-Abschlussmeldung und Logpfad (2026-10-09)

Der nachfolgende lesende Befund wurde korrigiert und lokal aktiviert. Neue
delegierte Application-Jobs erhalten eine eigene, auf 25 Minuten begrenzte
Ausfuehrungsfreigabe statt der kurzen Restlaufzeit der Browser-Session. Start
und einmalige Credential-Uebernahme verlangen weiterhin die echte gueltige
Session. Nur bereits konsumierte, exakt gebundene Tickets duerfen innerhalb
der Job-Laufzeit nach Browser-/Human-Proof-Ablauf weitere Meldungen abgeben;
aktueller Benutzer, Tenant, Rollen, Gruppen, Delegation, Credential-Version
und Widerrufe werden weiterhin geprueft. Alte Tickets oder Sessions wurden
nicht verlaengert. Legacy-Jobs behalten ihre bisherigen Laufzeitgrenzen.

Application-Live-Logs werden nun im tatsaechlichen Unterverzeichnis
`lzc-runner-*/application` gelesen. Der Worker reserviert fuer die terminale
Meldung bis zu 60 Sekunden auch nach Ablauf des Ausfuehrungsbudgets. Wird
Output oder Ergebnis nicht angenommen, bleibt lokal eine streng validierte,
bereits redigierte Abschlussdiagnose mit Dateirechten `0600` erhalten. Sie ist
auch nach API-Neustart lesbar, ersetzt aber keinen akzeptierten Ergebnisbeleg
und loest weder Wiederholung noch automatische Erfolgskorrektur aus. Raw-Logs,
Credentials, Plan-/State-Scratch werden weiterhin aufgeraeumt.

Migration `049_application_execution_window.sql` ist lokal angewandt.
Neuer API-Prozess: PID 6748, Terminal
`1741293c-0848-4ed9-b435-79d0dc90ad42`, API `http://127.0.0.1:3000`,
Web `http://127.0.0.1:4181`. Beide Ausfuehrungsflags und der bestehende
Authorization-Code-/PKCE-Login bleiben aktiv. Das Platform-Paket
`runner-local-20261006-platform-contract-upgrade` ist unveraendert.
Das neue Application-Paket `runner-local-20261009-report-completion-v2`
hat ID `1c5950bf-a9fe-50c3-a166-29af5669ec0e` und denselben Accelerator-Pin
`57ad1f6a651c1787694b74ff8aa8b241a3dcd16f` wie zuvor. OpenTofu 1.12.6,
Provider-Locks, native Initialisierung/Validierung und Paketidentitaet wurden
geprueft. Historische Pakete und gespeicherte Plan-Bindungen bleiben erhalten;
alte Artefakte wurden nicht an das neue Paket gebunden.

Der konkrete Apply `dc92b569-b759-4d2c-a197-1f51f9fb2f1e` wurde erst nach dem
bereits dokumentierten lesenden State-/Ressourcenabgleich, erneutem Nachweis
des fehlenden Workers, leerem Jobverzeichnis, abgelaufenem konsumiertem Ticket
und fehlenden Runner-Records operativ geschlossen. Genau eine transaktional
bewachte Zeile wechselte von `applying` zu `reconciliation_required`, mit
`runner_report_missing` und `finished_at=2026-10-09T09:26:10.362779Z`.
Dieser Zeitpunkt bezeichnet die Statuskorrektur, nicht einen nachgewiesenen
Terraform-Exit. Die UI zeigt neutral "Abschluss pruefen" und erklaert die
fehlende Abschlussmeldung sowie die nicht wiederherstellbaren historischen
Logs. Sie behauptet weder Apply-Erfolg noch Terraform-Fehlschlag und bietet
keinen erneuten Apply fuer diesen Auftrag an. State und Ressourcen muessen
vor weiterer Ausfuehrung geprueft werden; Archivieren ist kein Destroy.

Private Sicherung und Vorher-/Nachher-Nachweise liegen unter
`/Users/weberruss/lzc-report-completion-20261009-i9SVAM` (Verzeichnis `0700`,
Dateien `0600`). Der echte Schema-048-Dump wurde isoliert wiederhergestellt
und Migration 049 zweimal mit dem normalen Migration-Account geprueft.
Alle 41 bestehenden Tabellen blieben im Clone und beim echten API-Neustart
inhaltlich identisch; alle drei privaten Key-/Credential-Dateien ebenfalls.
Nach der einzelnen operativen Statuskorrektur sind die anderen 40 Tabellen,
alle anderen Dispatch-Zeilen und saemtliche anderen Felder des Ziel-Dispatchs
unveraendert. Vorher-/Nachher-Status und Begruendung sind privat protokolliert.
Keine Cloud-Schreiboperation, kein Plan/Apply/Destroy, keine State-/Lock-
Aenderung, keine Owner-Session-Impersonation, kein Commit/Push/Hosted Release.

Bestanden: finaler Build/Typecheck, 425 Unit-Tests (53 bestehende gated Skips),
31 echte isolierte PostgreSQL-Identity-/Brokertests und 44 Application-Ablauf-
Browserfaelle auf Desktop/Mobile. Der neue Regressionstest belegt exakt
39 Sekunden Browser-Restlaufzeit, die unabhaengige 25-Minuten-Jobfreigabe,
abgelehnte Browser-/Input-Replays nach Ablauf sowie akzeptierte Output-/
Ergebnismeldungen des bereits konsumierten Jobs. Die Browserpruefungen verwenden
API-Fixtures, nicht die ungeteilte echte Owner-Session. Native Paketpruefungen
fuehren keinen Cloud-Apply aus. Bestehende Bundle-Groessen-/Lint-Warnungen
wurden nicht im Rahmen dieser Korrektur bereinigt.

Abschliessend bestaetigt: API und Web-Proxy `/healthz` HTTP 200, echte UI-Assets
`index-CBjsEPeR.js` und `index-0B7QWbX-.css` byte-identisch zum geprueften Build,
Authorization-Code-Flow weiterhin aktiv, unauthentifizierter privater
Application-Output an beiden Origins HTTP 401 und ungueltiges Runner-Input-
Ticket HTTP 401. Desktop-/Mobile-Screenshots zeigen den Hinweis ohne
Textueberlagerung oder widerspruechliche Fehleranzeige. Enger Biome-Check:
keine Fehler, zwei bestehende Warnungen. Editor-Diagnostik: keine Fehler.
Gezielter Gitleaks-Scan von Quellcode-Diff, neuer Migration und Report:
keine Funde. Nur der eigene Testcontainer `lzc-report-flow-20261009` wurde
nach Namens-/Image-/Port-/Datenbankpruefung entfernt; Kunden-DB, aktive
API/Web-Prozesse, historische Pakete und private Sicherungen bleiben erhalten.

## Lesender Abgleich des nicht abgeschlossenen Applies (2026-10-09)

Der Benutzer hat den lesenden State-/Cloud-Abgleich ausdrücklich freigegeben.
Betroffen: Apply `dc92b569-b759-4d2c-a197-1f51f9fb2f1e`, Bestellung
`0821d9ac-0d80-4dd7-92bc-5a8c8a86fc17`. Erstellung 08:19:55.100 UTC,
Ticket konsumiert 08:19:55.824 UTC. Session und Ticket liefen bereits
08:20:34.102 UTC ab, rund 39 Sekunden nach Übernahme. `applying` ist bei
diesem Pfad eine vom Worker nach Initialisierung/Validierung gemeldete Phase,
nicht bloß eine Reservierung. Der Apply wurde tatsächlich gestartet.

Der exakt gebundene S3-State wurde über den vorhandenen Read-Adapter gelesen:
State vorhanden, Serial 4, kein Lock, 14 Ressourceninstanzen entsprechend den
14 geplanten Creates, keine deposed Instanzen und drei bestandene State-Checks.
Enthalten sind unter anderem Projekt, Netzwerk, zwei Buckets, Object-Storage-
Credentials-Group und Credential, Secrets Manager sowie Observability.
Projekt `5ce020c0-08df-4fc0-92c2-bcc952d7009d` wurde per Resource-Manager-GET
mit HTTP 200 und `ACTIVE` bestätigt; Netzwerk
`6eb7429d-16be-42c8-ad89-5f102bd43f1e` per IaAS-v2-GET mit HTTP 200 und
`CREATED`. Die Resource-Manager-/IaAS-Abfragen nutzten ausschließlich den
projektspezifischen Service Account aus dem State. Keys, Tokens und sensitive
State-Werte wurden weder ausgegeben noch in Dateien gespeichert.

Der fehlende Abschlussbericht bleibt ein separater Fehler: Die Broker-Guards
verlangen für Output-/Ergebnismeldungen ein noch gültiges Ticket und eine noch
gültige Session. Deren kurze Restlaufzeit erklärt die fehlende Rückmeldung
plausibel; Worker-Exitcode und frühere HTTP-Fehler sind nicht erhalten und
werden deshalb nicht behauptet. Zusätzlich liest der lokale Application-
Live-Output derzeit im Container-Wurzelverzeichnis, während der Worker seine
Phasenlogs im Unterverzeichnis `application` schreibt. Das erklärt fehlende
Live-Logs auch vor dem Aufräumen. Beide Codepfade wurden gelesen, nicht geändert.

Keine DB-Statuskorrektur, kein neuer Apply/Plan/Destroy, keine Credential-,
State-, Lock-, Ressourcen- oder Runner-Änderung. Die vorhandenen Ressourcen
belegen die Bereitstellung, ersetzen aber nicht die fehlende authentifizierte
Abschlussmeldung. Erneuter Apply ist nicht angezeigt; zuerst müssen Reporting-
Laufzeit, Logpfad und kontrollierter Abschlussabgleich behoben werden.

## Korrektur: Laufenden Apply erneut öffnen (2026-10-09)

Erneutes Öffnen derselben Bestellung setzte den Reiter auf Plan zurück, ohne
den keyed Detailbereich neu zu initialisieren. Der bestehende Einmal-Guard
für die automatische Apply-Auswahl blieb gesetzt. Die Details-Aktion erhöht
jetzt den vorhandenen Refresh-Key; dadurch werden der aktuelle Apply und seine
Logabfrage erneut gewählt. Zusätzlich öffnet ein Klick auf den Ausführungsstatus
direkt den zugehörigen Plan-/Apply-Reiter und scrollt zum Detailbereich.

Bestanden: 42 betroffene Ablauf-/Tabellen-Browserfälle auf Desktop/Mobile,
einschließlich Statusklick und Übersicht -> erneutes Öffnen -> Apply mit Logs,
Typecheck, Web-Build und enger Biome-Check. UI-only, kein API-/Runner-Neustart.

Separater tatsächlicher Betriebsbefund: Der neueste Kunden-Apply ist in der DB
weiterhin `applying`, ohne `finished_at` und ohne gespeicherten Output-Record.
Das lokale Jobverzeichnis ist leer; PID 91083 hat nur den esbuild-Hilfsprozess
als direktes Kind, keinen Apply-Worker. Die temporären Logs konnten deshalb
nicht über den bestehenden Live-Reader gefunden werden. Dieser Befund belegt
keinen erfolgreichen oder fehlgeschlagenen Cloud-Abschluss. Status, State,
Kundenauftrag und Ressourcen wurden nicht verändert; vor einem erneuten Apply
ist ein autorisierter State-/Ressourcenabgleich erforderlich. Keine tatsächliche
Owner-Loganzeige oder erfolgreicher Cloud-Abschluss behauptet.

## Aktiviert: Tabellarische Bestellübersicht (2026-10-09)

Die Bestellliste ist jetzt eine semantische Tabelle mit Name und kurzer
Bestell-ID, lokalisiertem Bestelldatum einschließlich Uhrzeit, separater
Freigabe, tatsächlichem letztem Plan-/Apply-Status und kompakten Icon-Aktionen
mit benannten Tooltips. Die ausgewählte Bestellung ist hervorgehoben.
Gleichnamige Aufträge bleiben dadurch eindeutig ihren Details zuordenbar.

Statusdaten kommen ausschließlich aus der vorhandenen authentifizierten
Job-Read-API. Laufende und ausgewählte Bestellungen werden ohne überlappende
Anfragen aktualisiert; beim Verlassen des Bestellreiters werden Timer und
Requests abgebrochen. Fehlende oder fehlgeschlagene Statusabfragen werden
explizit als nicht verfügbar dargestellt, nicht als erfolgreiche Ausführung.
Freigabe und Ausführungsstatus werden nicht miteinander vermischt.

Auf Mobilgeräten scrollt nur die Tabelle horizontal. Mindestbreiten für
Freigabe und Ausführung verhindern unlesbare Buchstaben-Umbrüche. Zwei
gleichnamige Bestellungen mit unterschiedlichen Daten sowie laufendem und
fehlgeschlagenem Apply wurden auf Desktop und Mobile geprüft, einschließlich
Statusfarben, Aktionen, Detailzuordnung und begrenzter Seitenbreite.

Bestanden: 90 Organisations-Browserfälle, sechs Übersetzungstests, Typecheck,
Web-Build und enger Biome-Check. Nach der visuellen Spaltenkorrektur bestanden
die beiden Tabellenfälle erneut mit expliziten Mindestbreiten-Assertions.
Keine API-, Datenbank-, Runner- oder OIDC-Konfigurationsänderung; keine echte
Bestellung oder Cloud-Ausführung durch den Agenten verändert.

## Aktiviert: Apply-Flow, Archivierung und Object-Storage-Namenslimit (2026-10-08)

Die beiden realen Application-Applies sind terminal mit `reconciliation_required`
und `apply_failed`. Ihre gespeicherten, redigierten Ausführungslogs belegen
STACKIT HTTP 422: Der Credentials-Group-Name `app-<instance UUID>-dev` hat
44 Zeichen, die API erlaubt höchstens 32. Native Commit
`57ad1f6a651c1787694b74ff8aa8b241a3dcd16f` erhält kurze Namen unverändert und
begrenzt lange Namen auf 23 Zeichen, Bindestrich und acht SHA-256-Zeichen.
Bucket-Namen und State-Identitäten bleiben unverändert. Der Commit ist lokal;
es wurde nichts gepusht.

Bestelldetails verwenden jetzt die Reiter Übersicht, Plan, Apply und Verlauf.
Nur der aktuelle Plan beziehungsweise Apply steht im jeweiligen Arbeitsreiter;
historische Jobs erscheinen ohne Ausführungsaktionen im Verlauf. Apply-Status,
Fortschritt und Owner-exklusive Ausführungslogs ersetzen den irreführenden
Hinweis auf einen bereits verwendeten Plan. Logs werden authentifiziert,
mandantengebunden und mit `no-store` geliefert, nicht als State oder Planartefakt.

Migration 047 ergänzt die explizite Archivierung terminal fehlgeschlagener
Applies über `confirmArchive`. Sie nutzt das bestehende append-only Ledger und
entfernt Aufträge aus der aktiven Liste, nicht die zugrunde liegenden Jobs,
Auditdaten, verschlüsselten Artefakte oder Recovery-Daten. Laufende, reservierte,
vorbereitete und erfolgreiche Applies bleiben geschützt. Normales Löschen mit
`confirmDeletion` behält seine bestehende Apply-Sperre. Archivieren ist kein
Destroy: Bereits angelegte Cloud-Ressourcen und State müssen vor einem weiteren
Apply geklärt werden.

Migration 048 lässt zusätzlich den neuen Native-Commit zu, ohne historische
Source-Pins zu entfernen. Vorhandene veröffentlichte Versionen werden nicht
umgebunden; für künftige Bereitstellungen mit dem Namensfix ist eine neue
Template-Version erforderlich. Das neue unveränderliche Application-Paket
`runner-local-20261008-application-order-flow` ist mit OpenTofu 1.12.6 qualifiziert,
Package-ID `16501f6e-881f-5365-ace3-277b788b83d9`. Der Builder prüft diese Engine
vor dem Erzeugen eines Pakets. Historisches Application-Paket
`b314975d-30d4-5728-af32-75f6deb8d924` und das weiterhin aktive Platform-Paket
`40ee48fa-dbb7-5f26-a7bf-b1a6c1c1be73` sind unverändert erhalten.

Bestanden: 23 Native-Mock-Tests, OpenTofu- und Terraform-Validierung, 31
PostgreSQL-Integrationstests, 421 Unit-Tests (53 bestehende Skips), 88
Organisations-Browserprüfungen auf Desktop/Mobile, Typecheck und Web-Build.
Der erste unbeschränkte Unit-Gesamtlauf zeigte einen Prozessgruppen-Cleanup-Flake
(`kill EPERM`); der isolierte Runner-Test und der Gesamtlauf mit zwei Workern
bestanden. Enger Biome-Check ist fehlerfrei, mit einer bestehenden
Non-null-Assertion-Warnung. Die exakt gepinnte neue Icon-Abhängigkeit
`lucide-react@1.53.0` hat in npm audit und dem CVE-Scan keine bekannten Befunde.

Aktivierung erfolgte erst nach frischen Inaktivitätschecks für Application und
Platform, privatem Backup und erfolgreicher Restore-Probe. Das gleiche Backup
wurde als 046-Baseline und als zweimal über die normale Migrationsrolle
migrierte 048-Kopie geprüft: Alle 41 Originaltabellen-Hashes sind gleich.
Ein zwischen Dump und Live-Snapshot erfolgter OAuth-Refresh wurde nicht
zurückgesetzt. Unmittelbar vor und nach dem Live-Neustart stimmen sämtliche
Originaltabellen- und privaten Schlüsseldatei-Hashes überein. Backup:
`/Users/weberruss/lzc-local-application-order-flow-20261008` (0700/0600).

Lokale API: PID 91083, Schema `048_application_objectstorage_source.sql`,
Application-Ausführung mit dem neuen Paket und unverändertem Platform-Paket.
Damit sind auch die zuvor vorbereiteten frischen `canDelete`-Metadaten aktiv.
Keine Kundenbestellung archiviert oder gelöscht, keine Veröffentlichung,
Delegation, Cloud-Plan/Apply/Destroy oder Rebind durch den Agenten. Ein realer
Cloud-Apply mit dem neuen Namensfix wurde nicht durchgeführt.

## Korrektur: Bestellungen direkt in der Liste löschen (2026-10-08)

Die tatsächliche Owner-Prüfung ergab zwei löschbare ältere Bestellungen und
eine geschützte Bestellung mit laufendem Apply. Die UI bot die Löschaktion nur
in geöffneten Details an. Jetzt besitzt jede vom Server als löschbar gemeldete
Listenzeile eine eigene Aktion. Das Ziel ist die angeklickte Bestellung, nicht
die zufällig geöffneten Details; andere ausgewählte Bestellungen bleiben
erhalten. Bestehende Bestätigung und serverseitige Apply-Sperre bleiben bestehen.

Der bestehende Owner-Browserfall löscht nun direkt aus der Liste ohne
Detailöffnung, während eine zweite Bestellung mit Apply weiterhin keine
Löschaktion anbietet. Alle acht Löschfälle auf Desktop/Mobile bestanden mit
Exit-Code 0, einschließlich Abbruch, Bestätigung, PE-Zugriff und Fehlerfall.
Typecheck und Web-Build bestanden; das neue Web-Bundle ist lokal aktiv.

Zusätzlich fehlte `canDelete` in frischen Bestell-/Entscheidungsantworten.
Die Metadaten-Anreicherung verwendet jetzt auch dort denselben unveränderten
DB-Guard. Alle 31 PostgreSQL-Integrationstests bestanden, einschließlich des
neuen Belegs für die frische Owner-Antwort. Diese API-Korrektur ist im Code
vorbereitet, aber noch nicht im laufenden Prozess aktiviert: Ein tatsächlicher
Kunden-Apply läuft, weshalb kein API-Neustart durchgeführt wurde. Bestehende
Bestellungen erhalten ihre korrekten Löschmetadaten bereits beim Laden der
Liste; deren Aufräumen benötigt den ausstehenden API-Neustart nicht.

Keine Migration, kein Runner-Paketwechsel, keine Kundenlöschung und keine
Unterbrechung des laufenden Applies durch den Agenten. Vorhandene unabhängige
Preview-Lintfehler bleiben unverändert.

## Korrektur: API-Plan mit aktivierter Observability (2026-10-08)

Nach der ACL-Entfernung blieb im privaten API-Plan-Compiler ein zusätzlicher
Scope-Guard bestehen, der aktivierte Observability ausdrücklich ablehnte.
Außerdem setzte derselbe Pfad `observability.enabled` fest auf `false`.
Beides ist korrigiert: Public-Projekte mit lokalem Netz können Observability
verwenden. Die bestehende Einschränkung für Namespace-Dienste bleibt bestehen;
Fehlertext und englische Übersetzung entsprechen diesem Umfang.

Der vorhandene vollständige PostgreSQL-Bestell-/Plan-/Apply-Test aktiviert nun
Observability. Eine zusätzliche Assertion liest die tatsächlich gespeicherten
Plan-Variablen und beweist `enabled: true`, die gewählte Leistungsklasse und
keine ACL-Netz-Bindung. Alle 31 DB-Tests sowie 18 Compiler-/Übersetzungstests
bestanden mit Exit-Code 0; Typecheck und Web-Build ebenfalls. Der gesonderte
Biome-Lauf meldete drei bestehende Fehler in unveränderten Preview-Hooks und
Preview-Schlüsseln; diese wurden nicht in den Scope-Fix aufgenommen.

Keine neue Migration oder Runner-Quelle ist erforderlich. Für diesen API-Fix
kann der Benutzer eine vorhandene Bestellung auf der aktuellen Runner-Revision
nach Neuladen erneut planen; eine weitere Veröffentlichung ist nicht nötig.
Kein echter Cloud-Plan oder Apply wurde durch den Agenten gestartet.

## Nachtrag: ACL-Einrichtung außerhalb des MVP (2026-10-08)

ACL-Editor, Bestelleingaben, Projektnetz-Bindung und zugehörige
Qualifikationsblocker sind aus dem aktiven Parametervertrag entfernt.
Kompatibilitätstests beweisen den Erhalt gespeicherter Werte und Policies;
obsolete Eingaben ändern die aufgelöste ACL nicht. Native Revision
`88149782bf8e91dcdbb43a203b54337886023f7f` ergänzt ausschließlich
`ignore_changes = [acl]` und einen Mock-Apply/Plan-Regressionstest. Der Provider
setzt weiterhin initiale Werte und kann bei anderen Updates eingelesene Werte
erneut übertragen; konkurrierende manuelle Änderungen sind nicht garantiert
geschützt. Es wurde kein Cloud-Apply ausgeführt.

| Prüfung | Ergebnis | Exit-Code |
| --- | --- | --- |
| Kanonische Unit-Suite | 421 bestanden, 53 bestehende Skips | 0 |
| PostgreSQL 17.11 | 31 bestanden, neue Source-Grants, Tickets, delegierter Plan/Apply und Löschrennen | 0 |
| Playwright Desktop/Mobile | 90 bestanden: 80 Organisation-/Bestellfälle und 10 Parameterfälle | 0 |
| OpenTofu 1.12.6 Mock-Provider | 16 Application- und 5 Landing-Zone-Tests bestanden | 0 |
| Typecheck und Web-Build | bestanden | 0 |
| Neues Runner-Paket | gepinnte Quellen, Lock-Hashes, Init, Validate, Provider-Mirror und Archiv-SHA geprüft | 0 |
| Kundendatenbank-Klon | 045 nach 046 zweimal migriert; zweiter Lauf idempotent | 0 |
| Lokaler Neustart | direkte und Proxy-Healthchecks erfolgreich | 0 |

Docker 29.6.2, Node 24.21.0 und Playwright mit lokalem Chrome waren verfügbar;
keine Ersatz-Testumgebung wurde verwendet. Die vorhandenen Browserfälle wurden
gezielt auf ACL-Abwesenheit angepasst, Stage-/Netzwerk-/Leistungsklassen-
Bedienung bleibt geprüft. Initiale Source-Dispatch-Fixture-Abweichungen wurden
korrigiert; der finale vollständige DB-Lauf ist ohne Skips grün. Die bekannte
sporadische Identitäts-Fixture-Abweichung wurde nicht verändert.

Lokal aktiv sind Schema 046, das unveränderte Plattform-Paket und das neue
Application-Paket `runner-local-20261008-observability-mvp`, Identität
`b314975d-30d4-5728-af32-75f6deb8d924`. Frisches privates Backup und
Klonqualifikation gingen voraus. Alle ursprünglichen Werte aus 41 Tabellen und
alle drei privaten Dateien sind auch nach dem tatsächlichen Neustart
unverändert. Alte Pakete, veröffentlichte Versionen, Bestellungen und Saved
Plans bleiben erhalten und werden nicht neu gebunden. Für die neue Quelle
benötigt der Benutzer eine neue Veröffentlichung und Bestellung.

Kein Push, keine Cloud-Ausführung und keine Kundenveröffentlichung, Bestellung,
Delegation oder Löschung durch den Agenten. Die tatsächliche Owner-Session
wurde nicht impersoniert; die Annahme eines echten Cloud-Plans bleibt ungeprüft.

## Nachtrag: Bestellung nach abgeschlossenem Plan löschen (2026-10-08)

Migration 045 ersetzt ausschließlich den Lösch-Guard: Ein abgeschlossener Plan
ohne Apply-Anforderung blockiert das Löschen nicht mehr. Laufende/ungeklärte
Ausführungen und alle Apply-Jobs bleiben gesperrt. Migrationen 040 bis 044 wurden
nicht verändert. Lokal ist Schema 045 aktiv; die bestehenden Runner-Pakete und
das Web-Bundle wurden nicht verändert.

Alle 31 PostgreSQL-Integrationstests bestanden im finalen Lauf. Ergänzt wurden
die Löschbarkeit nach einem erfolgreichen Saved Plan, die tatsächliche Löschung
mit unverändertem verschlüsseltem Artefakt, die Abweisung von Vorschau und Apply
nach Löschung sowie die Löschsperre ab Apply-Anforderung. Vier parallele
Lösch-/Apply-Rennen mit mehreren DB-Verbindungen erlaubten jeweils genau einen
Erfolg und niemals gleichzeitig eine Löschung und einen Apply-Job.

Typecheck, scoped Biome, Editor-Diagnostik, Whitespace-Prüfung und Secret-Scan
bestanden. Ein erster Lauf zeigte die bereits bekannte sporadische
`invalid_stackit_identity`-Fixture-Abweichung; die betroffene Löschregression
bestand, die folgenden beiden vollständigen Datenbankläufe waren grün. Die
Identitäts-Fixture wurde nicht geändert oder übersprungen. Da nur SQL und Tests
geändert wurden, war für diesen Fix kein neuer Browserlauf erforderlich.

Vor Aktivierung waren keine Jobs aktiv. Ein frisches privates Backup wurde in
einem eigenen Testcontainer restauriert und mit der normalen Migrationsrolle
044 nach 045 migriert; der zweite Lauf war idempotent. Alle bisherigen Werte in
41 Tabellen waren sowohl im Klon als auch nach dem tatsächlichen lokalen
Neustart unverändert; alle drei privaten Schlüsseldateien ebenfalls. Der
API-Healthcheck war erfolgreich. Keine Kundenbestellung wurde gelöscht und
kein Kunden-Plan, Apply oder Cloud-Destroy durch den Agenten gestartet.

## Nachtrag: Bestellung, Ressourcen-Vorschau und Saved-Plan-Apply (2026-10-08)

Aktueller Stand: Eine direkte, ausführbare Bestellung startet den Plan ohne
zusätzliche Bestätigung. Die Detailansicht zeigt eine sichere Projektion des
gespeicherten Plans; ein expliziter Apply-Klick verwendet exakt dieses Artefakt.
Die älteren Abschnitte dokumentieren historische Prüfstände, nicht die aktuelle
Application-Apply-Verfügbarkeit.

| Pruefung | Status | Umfang |
| --- | --- | --- |
| Build und Typecheck | PASS | API, Web, gemeinsame Verträge und Tests |
| Kanonische Unit-Tests | PASS | 417 bestanden, 53 bestehende Skips |
| PostgreSQL-Integration | PASS | 31 Tests gegen isoliertes PostgreSQL 17.11 |
| Organisations-Browserlauf | PASS | 80 Desktop-/Mobile-Fälle, einschließlich automatischem Plan und einmaligem Apply |
| Visuelle Kontrolle | PASS | Ressourcen-Vorschau auf Desktop und Mobil; keine Überlappung oder horizontaler Overflow |
| Kundenklon-Migration | PASS | Reguläre Migrationsrolle, 043 nach 044, zweiter Lauf idempotent |
| Lokaler Bestandsschutz | PASS | Sämtliche bisherigen Spaltenwerte in 41 Tabellen und alle drei privaten Dateien unverändert |
| Lokale Laufzeit | PASS | Schema 044, API-Healthcheck und aktuelles Web-Bundle auf Port 4181 |

Die Datenbanktests prüfen unter anderem Fremdnutzer-/Tenant-Abweisung,
Artifact-Hash und Paketbindung, aktuelle Plan-Version, One-Use-Runner-Input,
idempotenten Apply-Start sowie verschlüsselte Recovery und Ausführungssperre
nach einem möglicherweise teilweise ausgeführten Apply. HTTP-Tests prüfen
zusätzlich Origin, CSRF, Tenant und strikt begrenzte Request-Bodies.

Vor dem lokalen Neustart wurden keine aktiven Plan-/Apply-Jobs festgestellt und
ein privates Backup mit Verzeichnisrechten 0700 und Dateirechten 0600 erstellt.
Bestehende Runner-Pakete wurden nicht verändert. Kein Kunden-Plan oder
Kunden-Apply wurde für diese Verifikation gestartet; Browser- und
Ausführungstests verwendeten isolierte Fixtures. Keine Veröffentlichung,
Delegationsänderung oder Cloud-Foundry-Auslieferung wurde durchgeführt.

## Nachtrag: Application-Plan-UI (2026-10-07)

Scope: vorhandene Plan-/Backend-/Dispatch-Endpunkte im Bestell-UI verbinden,
tenantgebundene Job-Sichtbarkeit mit Migration 041 und isolierten lokalen
Application-Plan-Runner aktivieren. Kein Kunden-Job, Cloud-Plan oder Apply gestartet.

| Pruefung | Status | Exit Code | Umfang |
| --- | --- | --- | --- |
| Build/Typecheck | PASS | 0 | Gemeinsame Job-Vertraege, API und Web |
| Kanonische Unit-Tests | PASS | 0 | 412 bestanden, 53 erwartete Skips |
| HTTP/i18n | PASS | 0 | 31 Faelle einschliesslich Capability und tenantgebundener Job-Liste |
| PostgreSQL | PASS | 0 | 31 echte Session-/Rollen-/Tenant-/Application-Tests |
| Browser | PASS | 0 | 60 Organisations-/Application-Faelle; nach finalem Retry-Fix alle 16 neuen Plan-Faelle erneut bestanden |
| Native Runner | PASS | 0 | 94 Runner-Faelle, 2 erwartete Skips; Paket-Init/Validate ohne Backend oder Cloud |
| Restore/Upgrade | PASS | 0 | 040 -> 041 zweimal mit normaler Migrationsrolle; alle 38 Tabellen unveraendert |
| Lokaler API-/Web-Start | PASS | 0 | Ports 3000/4181, STACKIT Authorization Code/PKCE, Gast-Jobzugriff 401 |
| Echter Application-Cloud-Plan | UNVERIFIED | n/a | Benutzer fuehrt den ersten Plan selbst im UI aus |
| Application-Apply | UNAVAILABLE | n/a | Noch nicht implementiert; `applyEnabled=false` |

Docker 29.6.2 funktional, Node 24.21.0/npm 11.19.0 gepinnt. Bestehendes Playwright
Chromium genutzt, Desktop 1440x1000 und Mobil 390x844 visuell geprueft, kein
Browser-Fallback. UI-Tests simulieren API-Antworten; PostgreSQL-Pruefungen verwenden
eine getrennte lokale Testinstanz und keine Kundendaten. Native Runner-Pruefungen
qualifizieren Paket/Isolation, nicht S3-Lock oder echte STACKIT-Plan-Ausfuehrung.

Abgedeckte Wege: bestaetigte Vorbereitung durch den Besteller, Backend-Freigabe und
bestaetigter Dispatch durch den gebundenen Platform Engineer, Status/Ergebnis nach
Reload, ausstehende/abgelehnte Bestellungen, deaktivierter Runner, Dispatch-Fehler,
verlorener POST-Response und erfolgreicher POST mit ausgefallenem Statusabruf.
Andere Platform Engineers sehen keine ungebundenen Jobs. Eine zweite Sitzung des
richtigen Freigebers darf lesen, aber keinen an die erste Sitzung gebundenen Job
dispatchen. Schluessel, roher State und Runner-Ausgabe werden nicht angezeigt.

Overall: PASS fuer den lokalen Plan-UI-Anschluss; echter Cloud-Plan UNVERIFIED,
Ressourcenerstellung per Application-Apply weiterhin nicht verfuegbar.

## Ergebnis (2026-10-02)

| Pruefung | Status | Exit Code | Umfang |
| --- | --- | --- | --- |
| Projekt-Check | PASS | 0 | Biome, Typecheck, Vite-Build, 202 Tests in 25 Dateien |
| PostgreSQL | PASS | 0 | 25 Identitaets-, Session-, Migrations- und RLS-Tests |
| Browser | PARTIAL | 0 | Vollstaendige Suite: 64 Faelle, Desktop 1440x1000 und Mobil 390x844; externe APIs simuliert |
| Release-/Infra-Tests | PASS | 0 | 19 bestanden, 1 Linux-spezifischer Timeout-Test auf macOS uebersprungen |
| Integrierter Provider-/Dev-Login | UNVERIFIED | n/a | Auf Dev nicht aktiviert; lokale persoenliche Bestaetigung ausstehend |

Overall: NEEDS_SIGNOFF fuer die Live-Aktivierung. Die lokalen Gates sind erfolgreich.
Kein Commit, Push, Merge, Dev-Release oder Kunden-Apply wurde ausgefuehrt.

## Umgebung und Befehle

- Node 24.21.0 und npm 11.19.0 ueber `npm exec` gepinnt.
- Docker funktional; echte PostgreSQL-17-Testinstanz nur auf localhost.
- Installiertes Playwright Chromium 1243; kein Browser-Fallback.
- Vite-Preview auf Port 4173 fuer die Browserlaeufe; erfolgreicher Start und Seitenabruf.
- API-Tests verwenden Fastify-Injection, Browsertests kontrollierte HTTP-Antworten.

Ausgefuehrte Abschlussbefehle im App-Verzeichnis, jeweils Exit Code 0:

```sh
npm exec --yes --package=node@24.21.0 --package=npm@11.19.0 -- npm run check
LZC_TEST_DATABASE_URL=<lokale-Testdatenbank> npm exec --yes --package=node@24.21.0 --package=npm@11.19.0 -- npm exec -- vitest run integration/identity.test.ts
npm exec --yes --package=node@24.21.0 --package=npm@11.19.0 -- npm exec -- playwright test e2e/configurator.spec.ts e2e/cloud-catalogues.spec.ts e2e/organisation.spec.ts
```

## Abgedeckte Wege

- STACKIT-Anmeldung, browsergebundene Bestaetigung, Session und Logout ohne GitHub.
- Optionale GitHub-Verbindung erst im Repository-Arbeitsbereich; gleiche Benutzer-/Tenant-ID.
- Stabile OIDC-Identitaet trotz E-Mail-Aenderung; gleiche E-Mail fuehrt nicht zum Account-Merge.
- Explizite Bindung mit gueltiger Bestands-Session und Ablehnung fremder Identitaetszuordnung.
- Requeststabile Sitzung zwischen Plattform-Guard und Handler bei Tenant-Wechsel.
- Automatische regionale Produktoptionen mit vorhandenem technischem Zugang, ohne Editor-Setup.
- Application-Owner-Bestellung ohne Fork-, Credential- oder Katalog-Setup.
- Bestehende manuelle Kataloge, Fork-Speicherung, Navigation und Organisation-Mitgliedschaft.

## Wiederverwendete Tests

Bestehende Vitest-/Playwright-Dateien wurden erweitert, nicht neu geschrieben.

| Datei | Aenderung |
| --- | --- |
| `e2e/configurator.spec.ts` | Zusaetzliche STACKIT-Login- und optionale GitHub-Journeys |
| `e2e/cloud-catalogues.spec.ts` | Zusaetzliche automatische Katalog-Journey; manueller Fall beibehalten |
| `e2e/organisation.spec.ts` | STACKIT-Fixtures fuer Publikation/Bestellung und Assertion fuer den Account-Anzeigenamen |
| `integration/identity.test.ts` | Neue Identitaetsfaelle; historischer Backfill transaktional auf GitHub-only-Ausgangslage gesetzt |

## Evidenz und Grenzen

Screenshots liegen unter `landing-zone-configurator/.local/browser-tests/`, darunter
`stackit-login.png`, `automatic-catalogues.png` und `optional-github.png` in den
jeweiligen Desktop-/Mobil-Verzeichnissen. Login und automatischer Editor wurden
auch visuell geprueft; keine Textueberlappung oder horizontale Ueberbreite sichtbar.

Der erste volle Datenbanklauf meldete 24 bestanden / 1 fehlgeschlagen: der alte
Backfill-Test loeschte STACKIT-only-Nutzer mit Tenant-Abhaengigkeiten. Nach lokaler
Fixture-Korrektur bestand derselbe Lauf mit 25 bestanden / 0 fehlgeschlagen.
Historische angewendete Migrationen wurden dafuer nicht veraendert.

Biome meldet zehn nicht blockierende Warnungen; Vite die vorhandene Chunkgroessenwarnung.
Einzelne nicht simulierte Hintergrundabfragen im Browserlauf erzeugen Proxyfehler
zum nicht gestarteten API-Server. Die Browserfaelle belegen daher keine vollstaendige
Frontend-/Backend-/Provider-Laufzeitintegration.

Die zuvor vom Benutzer bestaetigte echte localhost-Device-Anmeldung belegt den
Device Grant, nicht den neuen persistenten Configurator-Login oder Org-Zugriff.
Die Client-Nutzung ist inzwischen fuer Configurator-Dev ausdruecklich freigegeben.
Offen bleiben kontrollierte Bestandskonto-Bindung, Dev-Migrationen
011/012 und echte Produkt-API-Abnahme. Device-Flows sind instanzlokal, Sessions
tokenbegrenzt ohne Refresh. Der freigegebene Plattformvertrag und der echte isolierte
Application-Plan gehoeren weiterhin zu den offenen MVP-Gates; Apply bleibt gesperrt.

## Nachpruefung: unsichtbarer Login-Fehler

Die lokale UI-Vorschau lieferte fuer `/auth/status` HTML statt JSON: der Vite-Proxy
enthielt `/api`, aber nicht `/auth`, und ein konfiguriertes Login-Backend lief nicht.
Der weisse Headertext wurde zudem vom weissen Fehlerhinweis geerbt.
Der Hinweis hat jetzt eine explizite dunkle Textfarbe; HTML-Antworten werden als
nicht eingerichtete Anmeldung erkannt, HTTP-Fehler nicht mehr still ignoriert.
Der Vite-Proxy leitet auch `/auth` an den API-Server weiter. Dies aktiviert keinen
Login ohne Backend-Konfiguration und Client-Freigabe.

Build und sechs fokussierte Browserfaelle bestanden (Exit Code 0): beide Fehlerarten
auf Desktop/Mobil mit Kontrast >= 4.5 und vollstaendig sichtbarem Hinweis, sowie
der simulierte STACKIT-Login. Der oeffentliche Dev-Status lieferte am 2026-10-02
HTTP 200 mit `github=true`; dort ist noch der bisherige Login veroeffentlicht.

## Release-Vorbereitung

Die STACKIT-Schalter sind jetzt durch Release-Workflow, private CF-Variablen und
Manifest verbunden. Release-Vorbereitung verlangt die ausdrueckliche CLI-Client-
Freigabe, erlaubt STACKIT ohne GitHub und lehnt ein unvollstaendiges GitHub-Paar
ab. Diese Faelle und Credential-Isolation sind im bestehenden Release-Test geprueft.
Workflow und Manifest wurden mit dem gepinnten YAML-1.2-Parser `yaml@2.8.1`
strukturiert validiert; beide Tests bestanden mit Exit Code 0. Projekt-Check mit
202 Tests und die vollstaendige Browser-Suite mit 64 Faellen wurden erneut
erfolgreich ausgefuehrt. PostgreSQL wurde dabei nicht erneut gestartet; der
vorherige erfolgreiche Lauf mit 25 Faellen bleibt die Datenbank-Evidenz.

Im geschuetzten GitHub-Environment `lzc-dev-release` wurden die zuvor fehlenden
nicht geheimen Variablen `LZC_STACKIT_DEVICE_ENABLED=false` und
`LZC_STACKIT_CLI_CLIENT_APPROVED=false` angelegt und zurueckgelesen.
`LZC_AUTH_ENABLED=true` blieb unveraendert. Kein Login-Provider wurde live
umgeschaltet, keine Credentials uebertragen und kein Release gestartet.

## Lokales Login-Backend

Die weiter bestehende Fehlermeldung auf Port 4181 wurde auf den nicht laufenden
API-Prozess auf Port 3000 zurueckgefuehrt (Auth-Proxy HTTP 502). Ein separater
lokaler Starter stellt jetzt die echte STACKIT-Integration mit einer eigenen
PostgreSQL-17-Datenbank bereit; Dev-Daten und Cloud-Credentials werden nicht verwendet.
Die Produktionsinitialisierung bleibt unveraendert. Auth-Routen erlauben HTTP nur
bei ausdruecklich gesetzter Loopback-Ausnahme; entfernte, manipulierte und nicht
kanonische Urspruenge bleiben abgelehnt. 44 Auth-/Device-Tests und die gezielte
TypeScript-Pruefung des Starters bestanden mit Exit Code 0.

Der neue lokale API-Prozess startete erfolgreich. Ueber die echte UI-Vorschau
antwortet `/auth/status` mit HTTP 200 und `github=false`, `stackit=true`,
`primary=stackit`; die anonyme Session liefert HTTP 401. Der Container
`lzc-local-stackit-login` bleibt fuer lokale Datenpersistenz bestehen. Zunaechst
waren GitHub, Secrets Manager, technische Credential-Profile und Cloud-Ausfuehrung
in diesem lokalen Betrieb deaktiviert. Eine persoenliche Provider-Bestaetigung
bleibt eine Aktion des Benutzers, kein automatisch bestaetigter Test.

In einer neuen Browserseite wurde der echte Device Flow erfolgreich gestartet:
STACKIT-Bestaetigungsdialog sichtbar, anschliessende cookiegebundene Poll-Abfrage
HTTP 200 mit `status=waiting`, kein sichtbarer Fehler. Damit sind API-Erreichbarkeit,
Provider-Start und sichere Cookie-Bindung auf HTTP-Loopback praktisch verifiziert.
Die persoenliche Freigabe und danach die persistierte Session sind noch nicht
automatisch abgenommen. Ein zweiter Starter wird vor jedem Datenbankzugriff
abgewiesen, wenn Port 3000 belegt ist; die laufende API bleibt dabei erreichbar.

## Organisationszugang und lokale Kataloge

Die pauschale Organisationssperre fuer Credentials und Kataloge ist durch die
Produktrolle Platform Engineer ersetzt. Migration 013 und der Credential-Service
pruefen dieselben Rollen; Tenant- und Besitzerbindung bleiben erhalten. Die
Sperre fuer Cloud-Ausfuehrung bleibt unveraendert.

Der lokale Starter registriert jetzt Credential-Profile und echte STACKIT-
Katalogadapter. Nur lokal ersetzt eine persistente, owner-only AES-256-GCM-Ablage
den Vault-Zugriff. Tests decken Neustart, Create-only, Manipulation, kryptografische
Tenant-/Besitzerbindung und Loeschung ab.

- 25 fokussierte Unit-Tests bestanden; TypeScript und Biome bestanden.
- 26 echte PostgreSQL-Tests bestanden in separater `configurator_test`-Datenbank,
	einschliesslich Besitzerisolation und Entzug der Platform-Engineer-Rolle.
- 14 Browsertests bestanden auf Desktop und Mobilgeraet; automatische Dropdowns,
	Organisations-Credential-Navigation und Application-Owner-Abgrenzung geprueft.
	Produktantworten dieser Browsertests sind kontrollierte Testantworten.
- Lokales Backend erfolgreich mit neuen Diensten und Migration neu gestartet;
	Benutzer-Datenbank nicht geloescht oder fuer Integrationstests verwendet.
- Der Live-Produktabruf war zu diesem Zeitpunkt noch ungeprueft, da kein Profil
	gespeichert war; die folgende Nachpruefung verwendet den vom Benutzer inzwischen
	gespeicherten Zugang, ohne erneuten Upload.

## Live-Katalogabruf nach Speicherung

Die lokale Datenbank enthaelt ein gespeichertes Profil. Der echte Adapterabruf
mit diesem Zugang bestaetigt die technische Anmeldung und Produktantworten.
Direkte Projekte unter der Organisation waren leer; neun sichtbare Unterordner
wurden zunaechst nicht durchsucht. Die neue begrenzte, organisationsgebundene
Ordnersuche findet ein aktives Referenzprojekt.

Fuer eu01 nachgewiesen: 2 Git-Flavors, 3 VPN-Tarife, 2 Kubernetes-Versionen,
133 SKE-Maschinentypen, 18 Volume-Typen, 12 Observability-Tarife,
176 Bastion-Maschinentypen, 197 Projektrollen und 899 Projektberechtigungen.
Bastion-Images bleiben nicht verfuegbar. Es wurden ausschliesslich HTTP-Status,
Antwortfeldnamen und Optionsanzahlen protokolliert, keine Schluessel oder Tokens.

Der UI-Lader bleibt ueber Navigation hinweg aktiv und wird nach erfolgreichen
Credential-Aktionen neu gestartet; Teilfehler werden sichtbar gemeldet.
27 fokussierte Unit-Tests, TypeScript, Biome, Build und 14 Desktop-/Mobile-
Browsertests bestanden. Die Browserpruefung deckt Initialabruf vor Editorstart,
Refresh, erhaltene Dropdowns und sichtbare Katalogmeldungen ab. Ihre Produkt-
Antworten sind weiterhin kontrolliert; eine persoenliche Browserabnahme der
gesamten Auth-/Produktkette ist damit nicht automatisch nachgewiesen.

## State-Kompatibilitaet und GitHub-unabhaengiges Deployment

Nachpruefung am 2026-10-02: Die dauerhafte State-Ablage verwendet jetzt das
kundenbetriebene native STACKIT-S3-Backend mit Lockfile. PostgreSQL verwaltet
Zuordnungen, geschuetzte Artefakte und voruebergehenden Bootstrap-/Recovery-State.
Der Runner migriert Bootstrap-State erst nach erfolgreichem Apply; die API
loescht die primaere Datenbankkopie erst nach Inhalts-, Versions- und CAS-Pruefung
des S3-Ziels. Konfigurations-Aliasse erhalten dieselbe State-Identitaet auch bei
einem Export oder Quellenwechsel. Legacy-State wird nicht automatisch umgebunden.

Recovery-State wird verschluesselt dauerhaft bestaetigt, bevor der Runner seine
lokale Fehlerdatei entfernt. Der Export enthaelt eine serverseitig verifizierte,
normale Backend-Konfiguration und CLI-Hinweise, aber keine Zugangsdaten oder
State-Inhalte. Die bestehende Planpruefung und ausdrueckliche Apply-Freigabe
bleiben erhalten; fuer gespeicherte Datenbank-Konfigurationen ist GitHub optional.

| Pruefung | Status | Exit Code | Umfang |
| --- | --- | --- | --- |
| Lint, Typecheck, Build | PASS | 0 | Biome ohne Fehler; 120 Warnungen und eine Info, vorhandene Vite-Chunkwarnung |
| Unit-Tests | PASS | 0 | 289 bestanden; 15 Datenbankfaelle im Standardlauf bewusst uebersprungen und separat ausgefuehrt |
| State-/Backend-PostgreSQL | PASS | 0 | Alle 15 Faelle in isolierter Testdatenbank; Migration, Rollen, Aliasse, Recovery und externe State-Aenderungen mit injiziertem S3-Transport |
| Identity-/RLS-PostgreSQL | PASS | 0 | Alle 28 vorhandenen Integrationsfaelle mit Migrationen bis 019 in eigener PostgreSQL-17-Instanz |
| Runner-Skriptvertraege | PASS | 0 | Alle sechs Faelle; natives S3, exakter gespeicherter Plan, kontrollierte Migration |
| Browser-Regression | PASS | 0 | 100 Faelle: Configurator, Organisation, Template-Parameter; Desktop und Mobil, API-Antworten simuliert |
| Neue SDK-Abhaengigkeiten | PASS | 0 | 26 Koordinaten geprueft, keine bekannten CVEs gefunden |
| Lokaler API-Neustart | PASS | 0 | Persistente Benutzerdatenbank erhalten; neue Migrationen, Login ueber UI erreichbar, anonyme Backend-Anfrage HTTP 401 |
| Reales S3/CF/Apply | UNVERIFIED | n/a | Keine echte State-Migration, Lockfile-Abnahme oder Cloud-Ausfuehrung |

Die beiden alten Rollen-/Browser-Erwartungen wurden lokal an den freigegebenen
Platform-Engineer-Pfad und `confirmStateBinding` angepasst. Die jeweiligen
fokussierten Wiederholungen und danach die vollstaendigen betroffenen Suites
bestanden. Worker-Tests verwenden eine Fake-Engine; diese Evidenz ist keine
Live-OpenTofu-/STACKIT-Abnahme. Die separate Integrationstest-Instanz wurde
anschliessend entfernt, nicht die lokale Benutzerdatenbank.

Backend-Registrierung, Bindung, geheimnisfreier Download und explizite Plan-/Apply-
Freigabe wurden im Browser getestet. Desktop-/Mobil-Screenshots fuer S3-Backends
wurden visuell geprueft; kein Textueberlauf oder horizontales Abschneiden sichtbar.
Die lokale UI bleibt unter `http://127.0.0.1:4181/` erreichbar, die API unter
`http://127.0.0.1:3000`. Cloud-Ausfuehrung wurde lokal nicht aktiviert.

Overall fuer die lokale Implementierung: PASS. Fuer Live-Aktivierung:
NEEDS_SIGNOFF. Offen bleiben die reale Runner-/S3-Abnahme, kontrollierte
Legacy-State-Uebernahme, operativer Recovery-Abgleich und Management-Key-Erneuerung.
Ein Prozessverlust vor bestaetigter Recovery-Uebertragung ist nicht durch die
simulierten Tests abgesichert. Kein Kunden-Apply, Release, Commit oder Push
wurde fuer diese Nachpruefung ausgefuehrt.

## Deployment-Direkteinstieg und Wiederaufnahme

Die Deployment-Seite zeigte weiterhin den veralteten Organisations-Sperrhinweis.
Zudem wurde die Konfigurationsauswahl nur im Arbeitsspeicher gehalten; beim
Direkteinstieg oder Reload fehlte deshalb das Vorbereitungsformular, obwohl eine
Konfiguration gespeichert war. Die lokale Datenbank enthaelt eine gespeicherte
Konfiguration; fuer die Diagnose wurden keine Inhalte oder Zugangsdaten ausgelesen.

Der falsche Hinweis wurde entfernt. Gespeicherte Konfigurationen sind direkt
auf der Deployment-Seite auswaehlbar. Bei genau einer gespeicherten Konfiguration
wird deren aktueller Stand erneut serverseitig geladen und mit derselben
Vollstaendigkeits-/Ausfuehrbarkeitspruefung wie in der Konfigurationsansicht
uebernommen. Genau ein gespeicherter Zugang wird vorausgewaehlt; mehrere
Konfigurationen oder Zugaenge erfordern ausdrueckliche Auswahl. Abbruchsignale
verhindern die Uebernahme laufender Auswahlabfragen nach einem Arbeitsbereichwechsel.
Die Vorauswahl startet weder eine Vorbereitung noch einen Plan oder ein Apply.

| Pruefung | Status | Exit Code | Umfang |
| --- | --- | --- | --- |
| Typecheck und Build | PASS | 0 | Vollstaendige Projekt-Typpruefung und neuer Vite-Build |
| Fokussierter Browsercheck | PASS | 0 | Vier Desktop-/Mobilfaelle fuer Direkteinstieg, Reload, eindeutige Vorauswahl, Mehrfachauswahl und Organisations-Platform-Engineer |
| Betroffene Browser-Suites | PASS | 0 | Alle 90 Configurator-/Organisationsfaelle; HTTP-Antworten simuliert |
| Scoped Biome und Editor-Diagnosen | PASS | 0 | Keine Fehler; eine bestehende Non-null-Warnung im Download-Test |
| Lokale Auslieferung | PASS | 0 | Port 4181 liefert den aktualisierten Build |

Die Cloud-/Runner-Ausfuehrung bleibt lokal deaktiviert. Die bereits dokumentierte
reale S3-/Runner-Abnahme bleibt UNVERIFIED. Die geteilte integrierte Browserseite
hatte keine gueltige Session (HTTP 401); die persoenliche angemeldete Chrome-
Sitzung wurde nicht automatisiert abgenommen. Zum Laden des neuen Builds ist
ein Reload dieser Sitzung erforderlich. Kein Cloud-Apply oder Datenbank-Reset.

## Lokale Plan-/Apply-Aktivierung und Accelerator-Default

Die vorstehende lokale Ausfuehrungssperre ist nach ausdruecklicher Freigabe
aufgehoben: Die API wurde mit `dev:execution` und dem nativen, gepinnten
Runner-Paket neu gestartet. Plan und ausdruecklich bestaetigtes Saved-Plan-Apply
sind registriert. Die normale `dev:login`-Variante bleibt ohne Runner.

Fuer neue Plattformen zeigt die UI jetzt den Accelerator-Standard als Default:
Bootstrap mit dem ausgewaehlten Service Account; Terraform legt das Management-
Projekt, dessen `*-tfstate`-Bucket und S3-Zugang samt Secrets-Manager-Eintrag an.
Die vorhandene gepruefte Migration schaltet danach auf `terraform.tfstate` in
eu01 um. Manuelle S3-Keys sind keine Voraussetzung. Eine bestehende S3-Anbindung
bleibt optional. Es wurde kein Bucket vorab ausserhalb des Terraform-State
erstellt und kein Kunden-Apply ausgefuehrt.

| Pruefung | Status | Exit Code | Umfang |
| --- | --- | --- | --- |
| Gesamtcheck | PASS | 0 | Biome, vollstaendiger Typecheck/Build, 295 Unit-Tests; 15 separat gated Datenbankfaelle im Standardlauf uebersprungen |
| Native Paketierung | PASS | 0 | Offizieller Release-Checksum fuer OpenTofu 1.12.6 darwin_arm64; gepinnter Accelerator, readonly Lockfile, echtes backendfreies Init/Validate und nativer Provider-Mirror |
| Lokale Origin-/Startpruefung | PASS | 0 | Drei fokussierte neue Tests; production verweigert Loopback, local verweigert fremde Origins, minimale Umgebung und private Job-Ablage |
| Default-/Bestands-S3-Browser | PASS | 0 | Sechs Desktop-/Mobilfaelle; keine manuelle S3-Eingabe fuer Default, Bestandsbindung/Registration/Download erhalten; HTTP simuliert |
| Echte native Runner-Probe | PASS | 0 | Echter gepackter Worker mit zufaelligem ungueltigem Ticket; Kundenauftrag nicht vorhanden, Ablehnung und Cleanup erfolgreich, 502 ms |
| API-Bereitschaft | PASS | 0 | Neu gestartete Ausfuehrungs-API; UI-Proxy `/healthz` liefert HTTP 200 |
| Kunden-Plan/Apply/S3-Migration | UNVERIFIED | n/a | Keine Ausfuehrung gegen den Kunden-State; ausdrueckliche Plan-/Apply-Aktionen weiterhin erforderlich |

Native Jobs erben keine API-/CF-/AWS-Geheimnisse, verwenden die gepackte Node-
Laufzeit und liegen ausserhalb des Cloud-Sync-Workspace. Der lokale Dispatcher
bindet Paketinhalt und Laufzeit an die Planidentitaet und sperrt unbestaetigte
Recovery-Loeschung sowie unklar laufende Prozesse nach einem API-Verlust.
Produktive CF-Isolation wurde nicht ersetzt oder umgeschaltet. Die lokale
Runner-Anbindung ist PASS; Kunden-Plan und Live-Apply bleiben NEEDS_SIGNOFF.

## Native Provider-Initialisierung: Fehlerkorrektur 2026-10-03

Der reale Kundenauftrag `0ec1279d-dc22-4e0c-85e2-a52268b754c1` endete am
2026-10-03 um 09:05:10 UTC mit `failed / init_failed`; kein Apply wurde gestartet.
Die bisherigen Fake-Worker-Tests und der direkte Paketierungs-Init hatten die
tatsaechliche CLI-Konfiguration und die Limits der Worker-Shell nicht zusammen
geprueft. Drei native Probleme wurden lokal reproduziert und korrigiert:

- Die kopierte CF-Konfiguration verwies auf `/home/vcap/app/providers`. Lokal
	wird nun der echte Paket-Mirror-Pfad verwendet, ohne Direct-/Netz-Fallback.
- Das 64-MiB-Dateilimit verhinderte die Extraktion des 94.738.386 Byte grossen
	Grafana-Providers. Nur Init erlaubt jetzt 256 MiB; alle anderen Phasen behalten
	ihre 64-MiB-Grenze.
- Der lange Jobpfad als `TMPDIR` verhinderte native Plugin-Starts. Derselbe echte
	Test bestand mit kurzem Temp-Pfad; lokale Jobs verwenden jetzt einen eigenen
	kurzen `/tmp/lzc-sock-*`-Pfad mit 0700 und garantiertem Cleanup. Credentials
	und State verbleiben im privaten Jobverzeichnis.

| Pruefung | Status | Umfang |
| --- | --- | --- |
| Gesamtcheck | PASS | Lint, Build/Typecheck, 295 Unit-Tests; 15 DB-Faelle und ein nativer Pakettest separat gated; bestehende 120 Lint-Warnungen und Chunk-Warnung |
| Runner-Shell-Vertraege | PASS | Sechs Tests; exakter freigegebener Apply und Backend-/Recovery-Grenzen erhalten |
| Echter Paket-Worker Init/Validate | PASS | OpenTofu 1.12.6 darwin_arm64, immutable Accelerator/readonly Lockfile, filesystem-only Mirror; absichtlicher Stopp vor Plan; keine Kunden-Credentials, kein Kunden-State, kein Apply |
| Lokaler Mirror/Socket-Schutz | PASS | Echte CLI-Konfiguration im Fake-Worker geprueft, 0600; Socket-Verzeichnis 0700 und entfernt; Origin-Grenzen erhalten |
| Aktive API und native Ticket-Probe | PASS | Neues Paket `runner-local-20261003-mirror-init`, API PID 11528, UI-Proxy-Health 200; echtes ungueltiges Ticket abgelehnt und Job entfernt, 1659 ms |
| Neuer Kunden-Plan / Apply / S3-Migration | UNVERIFIED | Kunden-Plan muss in der authentifizierten Sitzung erneut gestartet werden; kein Apply oder Cloud-State-Schreibzugriff durch diese Diagnose |

Die API laeuft mit explizitem `LZC_RUNNER_PACKAGE_DIR` auf dem neuen Paket.
Das alte Paket bleibt unveraendert und darf fuer neue native Tests nicht als
korrigiertes Paket angesehen werden. Die Kundendatenbank wurde nicht ersetzt
oder zurueckgesetzt. Gespeicherte Plans bleiben an ihren jeweiligen Paketinhalt
gebunden; kein automatischer Retry oder Apply wurde eingefuehrt.

## Berechtigte OpenTofu-Ausgabe 2026-10-03

Der Nutzer hat den erfolgreichen Kunden-Plan bestaetigt; ausschliesslich dessen
Status-/Artefaktmetadaten wurden geprueft: ein erfolgreicher und ein fehlgeschlagener
Plan, kein laufender Auftrag, gespeichertes Artefakt weiterhin vorhanden.
Fuer die neue Ansicht wurde weder ein weiterer Kunden-Plan noch Apply gestartet.

Die sichere Counts-Summary bleibt unveraendert. Eine separate geschuetzte
`GET /api/v1/plans/:id/output`-Route zeigt der berechtigten Person die normale
CLI-Ausgabe. Sitzung, Deployment-Rolle, Eigentümer und Tenant werden mit echter
RLS geprueft. Laufende native Jobs liefern begrenzte private Logs; verschachtelte
Credential-Felder und Private-Key-Bloecke werden entfernt. Gespeicherte Plans
werden nach AEAD-/SHA-256-Pruefung und identischem Runner-Paket per backendfreiem
Init und `tofu show -no-color` dargestellt, ohne geerbte Cloud-Credentials oder
State-Zugriff. Maximal zwei Inspektionen laufen parallel; private Scratch-Dateien
werden entfernt. Der Browser erhaelt Text, niemals Binary oder rohes Plan-JSON.

| Pruefung | Status | Umfang |
| --- | --- | --- |
| Gesamtcheck | PASS | Lint, vollstaendiger Build/Typecheck, 297 Unit-Tests; 18 gesondert gated Faelle uebersprungen; 122 nicht blockierende Lint-Warnungen und bestehende Chunk-Warnung |
| Native Ausgabe-Suite | PASS | Sieben Faelle inklusive realer OpenTofu-Engine; Hash-/Paketbindung, private Logs, Credential-Redigierung, Cleanup, keine geerbten Secrets |
| Echte native Textdarstellung | PASS | Rein lokale `terraform_data`-Testressourcen; normale Werte sichtbar, sensitive Werte maskiert, kein Cloud-Plan oder Apply |
| Eigentümer-/Tenant-RLS | PASS | Neuer Fall mit isoliertem PostgreSQL: fremde Benutzer/Tenants abgelehnt, unveraenderte Plan-Summary, Pruefsumme, Status und State-Version; keine Apply-Dispatches |
| Desktop/Mobil | PASS | Sechs Browserfaelle: gespeicherte Details, Live-Polling mit Abschluss, unveraenderte ausdrueckliche Apply-Sperren; nur simuliertes HTTP |
| Screenshot-/Layoutpruefung | PASS | Desktop und 390-px-Mobilansicht, lange Zeilen passend umbrochen, keine Seitenueberlaeufe; HTML-artige Ausgabe als Text, nicht ausgefuehrt |
| Aktivierte lokale API | PASS | PID 41997 mit unveraendertem Runner-Paket; UI-Proxy-Health HTTP 200, Ausgabe-Route ohne Sitzung HTTP 401; vor Neustart null aktive Kundenauftraege |
| Live-Kunden-Ansicht / Apply | UNVERIFIED | Keine Nachbildung der Benutzer-Session; der Nutzer oeffnet die Ausgabe in seiner authentifizierten Sitzung; kein Apply oder S3-Migrationsnachweis durch diese Arbeit |

Das bestehende Paket `runner-local-20261003-mirror-init` wird nicht neu gebaut
oder veraendert. Die API-Aktivierung verwendet dasselbe Paket; gespeicherte
Planbindungen und die Datenbank bleiben erhalten. Die Anzeige ist derzeit auf
den nativen lokalen Runner begrenzt. CF-Logs und dauerhafte historische Live-Logs
sind kein Bestandteil dieser Abnahme; abgelaufene Apply-Freigaben werden durch
eine Anzeige nicht erneuert.

## Apply-Ausgabe und lokale Aktivierung 2026-10-03

Der Nutzer hat die Plan-Ausgabe bestaetigt. Apply behaelt die ausdrueckliche
Freigabe des exakten Saved-Plans, Organisation, Ablauf und destruktive Bestaetigung.
Die neue Ansicht folgt der laufenden Apply-Ausgabe und zeigt Plan-/Backend-Nachweise.
Der Worker uebertraegt redigierte CLI-Ausgaben vor dem terminalen Ergebnis;
Migration 020 speichert sie einmalig AEAD-verschluesselt unter bestehender privater
RLS. Nach Cleanup und Reload ist der Text ohne lebenden Runner lesbar.

| Pruefung | Status | Umfang |
| --- | --- | --- |
| Gesamtcheck | PASS | Lint, Build/Typecheck, 300 Unit-Tests; 20 gated Faelle uebersprungen; nicht blockierende Lint-/Chunk-Warnungen |
| Worker | PASS | 65 Faelle; redigierte Ausgabe vor Erfolg/Fehler/Cleanup, exaktes Saved-Plan-Apply, Recovery-Receipts und kein automatischer Retry |
| Isolierter PostgreSQL-Broker | PASS | Alle 18 Faelle; Ausgabe am simulierten Apply-Auftrag verschluesselt und unveraenderlich, fremder Eigentuemer abgelehnt, Lesen ohne Live-Runner; inkompatibles Paket ohne Apply-Dispatch oder Recovery-Auftrag gesperrt |
| Runner-Shell | PASS | Sechs bestehende Init-/Apply-/S3-/Migrationsvertraege |
| Desktop/Mobil | PASS | Sechs simulierte Browserfaelle: ausdrueckliche Freigabe, laufender Apply bis Abschluss/Reload, Fehlerdiagnosen/Recovery ohne Retry; Screenshots ohne Seitenueberlauf |
| Neues natives Bundle | PASS | Frisches `runner-local-20261003-apply-output`, echter gebuendelter Worker mit OpenTofu 1.12.6/darwin_arm64 und echten Providern bis Init/Validate; absichtlicher Stopp vor Cloud-Plan |
| Lokale Aktivierung | PASS | API PID 68213, UI :4181; Health und UI HTTP 200, Ausgabe ohne Sitzung und Runner-Output ohne Ticket HTTP 401; Output-Spalten vorhanden; vor Neustart keine aktiven Kundenauftraege |
| Kunden-Apply / S3-Migration | UNVERIFIED | Kein Kunden-Apply durchgefuehrt; authentifizierte Benutzeraktion und Live-State-Abnahme stehen aus |

Das alte Paket bleibt unveraendert. Die API verwendet jetzt das neue Paket;
ein neuer Plan und dessen erneute Pruefung/Freigabe sind notwendig. Kundendaten
und Login bleiben erhalten. Ausgaben sind auf 2 MiB begrenzt und Kuerzungen sichtbar;
best-effort Upload garantiert keine Logs nach hartem Prozessabbruch oder Netzverlust.
CF-Live-Ausgabetransport ist weiterhin offen. Kein Commit, Push oder Release.

## OpenTofu-Vollstaendigkeitskorrektur 2026-10-04

Der erfolgreiche Kunden-Plan wurde wegen `completeness: not-reported` gesperrt:
alle 36 Checks bestanden, Artefakt-/State-/Engine-Bindungen passten, keine Sperre
oder vorherige Apply-Nutzung. Die Summary erwartete das Terraform-Feld `complete`,
das OpenTofu 1.12.6 im JSON-Format 1.2 nicht exportiert. Das offizielle gepinnte
JSON-Schema und ein echter rein lokaler Saved-Plan bestaetigen diese Abweichung.

Die Korrektur bestaetigt Vollstaendigkeit nur fuer den expliziten verifizierten
OpenTofu-1.12.6-Full-Plan-Kontext mit exakter JSON-Version und ohne Deferred-
Metadaten. Ohne Kontext bleibt derselbe Plan gesperrt; Teilplaene, unbekannte
Versionen und offene/fehlgeschlagene Checks werden nicht freigegeben. Die Fake-
Engine-Fixture verwendet jetzt das echte fehlende `complete` statt `complete: true`.
Die UI nennt fehlenden Vollstaendigkeitsnachweis nun als konkreten Sperrgrund.

| Pruefung | Status | Umfang |
| --- | --- | --- |
| Gesamtcheck | PASS | Lint, Build/Typecheck, 305 Unit-Tests; 20 gated Faelle uebersprungen; bestehende nicht blockierende Warnungen |
| Format-/native Runner-Suite | PASS | 26 Faelle inklusive echter lokaler OpenTofu-Engine: ohne belegten Full-Plan-Kontext nicht approvable, mit ihm approvable; unbekannte Formate/Versionen und Deferred-Metadaten gesperrt |
| Isolierter PostgreSQL-Broker | PASS | Alle 18 Freigabe-/State-/Recovery-/Output-Faelle; keine entfernten Sicherheitspruefungen |
| Desktop/Mobil | PASS | Sechs simulierte Freigabe-, Apply-Ausgabe- und Recovery-Faelle; kein Kunden-Apply |
| Neues natives Bundle | PASS | `runner-local-20261004-opentofu-completeness`; echter gebuendelter Init/Validate sowie lokaler Saved-Plan-/Format-Test bestehen |
| Aktivierung | PASS | API PID 57851, UI :4181; Proxy-Health ok, beide privaten Output-Endpunkte ohne Berechtigung HTTP 401; vor Neustart keine aktiven Kundenauftraege |
| Neuer Kunden-Plan / Apply | UNVERIFIED | Neuer Plan und explizite Freigabe erforderlich; keine Kunden-Apply- oder Live-S3-Ausfuehrung durch diese Arbeit |

Alte Plans, Summaries und Pakete bleiben unveraendert. Kein nachtraegliches
Umdeuten oder Umbinden des bestehenden Kunden-Artefakts, kein automatischer Retry.

## Arbeitsbereichs- und Konfigurationsfluss 2026-10-04

Der bestaetigte Einstieg ist jetzt Arbeitsbereichsauswahl bzw. Wiederaufnahme des
letzten weiterhin zugaenglichen Arbeitsbereichs. Plattformbenutzer gelangen zur
Konfigurationsliste; neue Konfigurationen entstehen ueber die Template-Auswahl.
Konfiguration, Bereitstellung und lesbarer Verlauf teilen Namen und gespeicherte
Revision. Speichern und Wechseln uebernimmt die neue Serverrevision. Reload liest
die nur als ID gemerkte Konfiguration unter der aktuellen Benutzer-/Tenant-Grenze
erneut. Alte `/repositories`-Links bleiben als Eingang unterstuetzt.

| Pruefung | Status | Umfang |
| --- | --- | --- |
| Gesamtcheck | PASS | `npm run check`: Biome, Typecheck, Produktionsbuild und 305 Unit-Tests; 20 gated Faelle uebersprungen; bestehende nicht blockierende Warnungen |
| Vollstaendige Browser-Suite | PASS | 134 Desktop-/Mobilfaelle; kontrollierte HTTP-Fixtures, keine echte Kundensitzung |
| Neuer Hauptablauf | PASS | Arbeitsbereich erstellen/oeffnen/wiederaufnehmen; unzugaengliche gemerkte Auswahl ignorieren; Konfiguration oeffnen, Reload, Revision 7 speichern zu Revision 8 und explizit zur Bereitstellung wechseln |
| Schutz und Bestand | PASS | Schmutziger Entwurf und abgebrochener Wechsel; readonly konfigurationsbezogener Verlauf; Rollen, Kontentrennung, Login-Entwurf, GitHub-Export, Browser-History sowie bestehende Plan-/Apply-/Recovery-Sperren |
| Cloud-Aktionen | PASS | Neue Hauptablauf-Fixture prueft null Mutationen an Plan-, Vorbereitungs-, Backend- und Zugangs-Endpunkten; Speichern ist die einzige beabsichtigte Konfigurationsmutation |
| Visuell | PASS | `configuration-flow.png` und `workspace-selection.png` auf Desktop/Mobil geprueft; keine horizontale Ueberbreite, Kontext und Arbeitsbereichswechsel lesbar |
| Lokal | PASS | UI :4181, API :3000 und UI-Proxy-Health HTTP 200; ausgeliefertes UI-Bundle stimmt mit dem neuen Build ueberein |
| Kunden-Apply / Live-S3 | UNVERIFIED | Vom Nutzer fuer nach dem Umbau vorgesehene Live-Abnahme nicht durch den Agenten ausgefuehrt |

Die laufende API wurde nicht neu gestartet. Das aktive native Paket
`runner-local-20261004-opentofu-completeness` und die bestehenden Kunden-Planbindungen
bleiben unveraendert. Navigation bestaetigt keinen Zugang, startet keine
Cloud-Ausfuehrung und erneuert keine Plan-Ablaufzeit. Kein Commit, Push oder Release.

### Korrektur der Arbeitsbereichshierarchie und inline Anmeldung

Der erste Umbau liess die Arbeitsbereichsliste und Erstellung auch unter
Mitglieder & Einstellungen stehen; Wechsel von dort fuehrte erneut zur Verwaltung.
Ausserdem meldet STACKIT im selben Dokument an, sodass die zuvor offene Seite
ohne expliziten Login-Uebergang erhalten blieb.

Arbeitsbereiche ist jetzt der erste Hauptnavigationspunkt. Bereichsauswahl und
Erstellung sind ausschliesslich dort; Oeffnen fuehrt zu seinen Konfigurationen
bzw. der rollenbezogenen Application-Ansicht. Einstellungen zeigen nur die aktive
Bereichsidentitaet, Organisationszuordnung und Mitglieder. Der erfolgreiche
inline Login ohne Entwurf fuehrt zur Bereichsauswahl bzw. autorisierten Wiederaufnahme;
bestehende angemeldete Deep Links und Login-Entwuerfe bleiben unveraendert.

Final: `npm run check` mit 305 bestandenen Unit-Tests und 20 uebersprungenen gated
Faellen; vollstaendige Playwright-Suite mit 134 bestandenen Desktop-/Mobilfaellen.
Neue Nachweise: gespeicherte Konfiguration eines anderen zugaenglichen Bereichs
ohne Verwaltungsumweg; Login von `/organisation`; getrennte Erstellung/Verwaltung;
weiterhin bestaetigungspflichtiges Loeschen samt Abbruch, serverseitiger Ablehnung
und korrekter Browser-Zurueck-Navigation. HTTP-Fixtures, keine Kundensitzung.
Desktop-/Mobilbilder visuell geprueft; UI :4181 liefert den neuen Bundle, UI/API
HTTP 200. API und natives Paket nicht neu gestartet oder geaendert, kein Kunden-Apply.

## Kompakte Plan-Historie 2026-10-04

Alte, abgelaufene und bereits verwendete Plans sind in der Bereitstellung unter
Historie mit Anzahl eingeklappt. Eintraege haben einzeln aufklappbare Details;
deren Ausgabe-/Nachweis-Komponenten werden erst beim Oeffnen gemountet. Der
aktuelle Lauf wird pro Konfiguration bestimmt, auch ueber verschiedene
Vorbereitungen hinweg. Aktive Laeufe und Recovery bleiben sichtbar, Sperren
betrachten weiterhin alle privaten Laeufe. Historische Plaene bieten keine
Apply-Freigabe. Der vorhandene Verlauf bleibt readonly und konfigurationsbezogen.

Ein lokaler Ablauf-Timer verschiebt auch auf einer offenen Seite den abgelaufenen
Plan ohne neue Serverabfrage und entfernt eine zuvor bestaetigte Freigabe.
Verwendete Plans konkurrieren nicht mit ihrem Apply-Ergebnis um die aktuelle
Anzeige, auch bei identischen Zeitstempeln. Keine Datenloeschung, keine erneute
Freigabe und keine Aenderung an API, Paket oder Kunden-Planbindungen.

Nachweise: Gesamtcheck mit 305 Unit-Tests, 20 gated Faelle uebersprungen, volle
Desktop-/Mobil-Browser-Suite mit 136 bestandenen Faellen. Neue Historien-Fixture
prueft ungeordnete alte/aktuelle/abgelaufene Laeufe, mehrere Vorbereitungen
derselben Konfiguration, Timerwechsel, Recovery-Sichtbarkeit und gesperrte
Planaktion. Bestehende explizite Apply-/Ablauf-/Scope-/Export-Sicherheitsfaelle
weiterhin bestanden; Browser-HTTP simuliert, kein Kunden-Apply.
`collapsed-plan-history.png` auf Desktop/Mobil visuell geprueft, kein horizontaler
Ueberlauf; UI :4181 liefert den neuesten Bundle, UI und API-Health HTTP 200.

## Phasen, Sprachen und MVP-Abgleich 2026-10-04

Konfiguration, Vorbereitung, Plan, Apply und Gesamtverlauf sind getrennt.
Jede Phase zeigt ihre eigenen Nachweise; der Gesamtverlauf ist readonly.
Archivierte oder abgelaufene Plans erhalten keine erneute Freigabe. Navigation
und Sprachwechsel starten keine Vorbereitung und keinen Plan oder Apply.

Deutsch/Englisch wird aus der Browserpraeferenz gewaehlt; eine ausdrueckliche
Header-Auswahl bleibt gespeichert. Entwurfsdaten, Benutzernamen und CLI-Ausgabe
bleiben unveraendert. Sprachwechsel erhaelt Route/Entwurf und aktiviert keine
Apply-Zustimmungen. i18next 26.4.2 und react-i18next 17.0.15 sowie die drei
aufgeloesten direkten Transitiven wurden auf bekannte CVEs geprueft: keine gefunden.

Nachweise vor dem State-Fix: voller Gesamtcheck mit 310 Unit-Tests und voller
Browserlauf mit 148 Desktop-/Mobilfaellen. Englische Editor-/Historienbilder
visuell geprueft; Browser-HTTP simuliert, keine Live-Kundenabnahme.

Der MVP-Abgleich identifizierte eine Sicherheitsluecke im backendlosen Erstplan,
wenn die Plattformausfuehrung deaktiviert ist. Start und Runner-Input pruefen
jetzt unter demselben Source-Lock vorhandenen State und Aliase sowie den
bestehenden Legacy-Nachweis. Ein echter leerer Erstplan bleibt erlaubt;
Checkpoint, Teilstate, Alias, unzugeordneter Altstate und zwischenzeitlich
registrierter State werden gesperrt. Der Sperrgrund ist zweisprachig.

Nach diesem Fix bestanden 23 echte isolierte PostgreSQL-Plan-/Apply-/State-Tests
und erneut der volle Gesamtcheck mit 310 Unit-Tests, 25 gated Faelle im Default-
Lauf uebersprungen. Die Testdatenbank wurde separat erzeugt und entfernt;
die Kundendatenbank blieb unberuehrt. Die neue Browser-Fehlertextzuordnung ist
typgeprueft, der volle Browserlauf erfolgte vor diesem Backend-Fix.

GitHub-Issues #89 bis #95 wurden anhand der aktuellen Umsetzung aktualisiert,
mit Audit-Kommentaren dokumentiert und zurueckgelesen. Alle bleiben offen,
weil mindestens ein urspruengliches Abnahmekriterium fehlt. Keine stillschweigende
Streichung von required Chat, Live-Recovery oder Organisationsbindung.

Kein Commit, Release, Merge, API-Neustart oder Paket-Rebinding; kein Kunden-Apply
und kein Live-S3-/Recovery-Nachweis. Der Erstplan-Fix ist noch nicht in der
laufenden API aktiviert. Git meldete einen beschaedigten Index; dieser wurde
nicht zurueckgesetzt oder repariert. Markdown-Whitespace wurde unabhaengig
mit `git diff --no-index --check` geprueft.

## 2026-10-05: Dynamische Zweisprachigkeit und Katalog-Lebenszyklus (#92)

Gespeicherte Publikations-/Sperrmeldungen sowie dynamische Editor- und
Katalogtexte werden bei Sprachwechsel neu lokalisiert. Benutzerwerte bleiben
unveraendert, auch mit `<test>` oder literalem `{{value1}}`. Ein Regressionstest
belegt die einmalige Platzhalterersetzung; i18next wird weiterhin fuer
Sprachwahl und Ressourcen verwendet. Keine neuen Abhaengigkeiten.

Migration 021 speichert tenantgebundene, unveraenderliche Stilllegungsnachweise.
AO sehen keine stillgelegten Angebote; neue Bestellungen werden unter derselben
Sperre wie Stilllegungen abgewiesen. Bestehende Instanzen und idempotente
Bestellwiederholungen bleiben erhalten. Erneute Publikation erzeugt eine neue
Version. PE-Rolle, bestaetigte Anfrage, RLS und direkte SQL-Umgehungsversuche
sind geprueft.

Migration 022 speichert `approval-required`/`direct` in Template-Version und
Instanz. Policy-Aenderungen erzeugen eine neue Version; Client-Overrides und
abweichende oder nachtraeglich geaenderte Bestell-Snapshots sind gesperrt.
Auch direkter Plan-Input bleibt `executionEnabled: false`,
`cloudPlanExecuted: false`, `requiresExplicitApplyApproval: true`.

Abschliessend bestanden `npm run check` mit 312 Unit-Tests (25 umgebungsabhaengige
Faelle im Default-Lauf uebersprungen), alle 148 Desktop-/Mobil-Browserfaelle und
28 isolierte echte PostgreSQL-Identitaets-/Katalogtests. Die bestehende
Plan-/Apply-/State-Suite wurde zuvor mit 23 echten PostgreSQL-Faellen geprueft.
Browser pruefen explizite Policy-Auswahl, DE/EN-Meldungswechsel, unveraenderliche
Publikation und bestaetigte Stilllegung mit kontrollierten HTTP-Antworten.
Sie ersetzen keine produktive Zwei-Organisations- oder Cloud-Abnahme.

Kundendatenbank, laufende API und gebundenes natives Paket bleiben unveraendert;
021/022 sind dort nicht aktiviert. Alte APIs blenden die neuen Publisher-
Steuerungen per fehlender Capability aus. Kein Commit, Release, Merge,
Kunden-Apply oder Live-S3-/Recovery-Nachweis. Alle sieben MVP-Issues bleiben offen.

## 2026-10-05: Menschliche IAM-Owner-Bindung (#91)

Der Organisationsnachweis verwendet den verifizierten menschlichen Device-Grant-
Token fuer die offizielle IAM-Rechteabfrage der exakten Organisation und deren
Rollenvertrag. Grundlage: STACKIT-Go-SDK-Revision
`7746310c7fe0a5e3f5c5e6e9b1be69d48c6184d9`, `services/authorization/v2api`.
Minimum ist der vollstaendige nicht leere Rechtesatz genau einer `owner`-Rolle.
Effektive Rechte und Owner-Minimum werden getrennt gespeichert. Technische
Service-Account-Rechte ersetzen keinen menschlichen Nachweis. HTTP-Fixtures
verwenden synthetische Berechtigungsnamen, keine behaupteten echten IAM-Rechte.

Migration 023 erzeugt unveraenderliche tenant-/benutzergebundene Auditbelege
SQL-seitig aus gueltigen Identitaetsnachweisen; die App hat keine direkten
Schreibrechte auf diese Belege. Migration 024 bindet atomar nach separater
Bestaetigung, aktueller DB-Session, PE-/Mitgliederverwaltungspruefung, aktueller
voller Owner-Autoritaet und passendem Auditbeleg. Wiederholungen liefern denselben
Bindungsbeleg. Erneute Pruefung entfernt den aktuellen alten Org-Nachweis,
nicht die menschliche Identitaet oder historische Audits.

Die bestehende Device-/API-Suite umfasst jetzt 55 bestandene Faelle, einschliesslich
gesperrter/fremder/malformed Rollenantworten, fehlender/leerer/doppelter Owner-Rollen
und Origin-/CSRF-/Tenant-/Bestaetigungsgrenzen. Die echte isolierte PostgreSQL-Suite
umfasst 29 bestandene Faelle, einschliesslich RLS, unveraenderlicher Audits,
AO-Ablehnung, Widerruf, Ablauf, fehlender aktueller Org-Autoritaet, idempotenter
Bindung und stale Session.

Die DE/EN-Steuerung verlangt expliziten Device-Start und separate Bestaetigung.
Browser pruefen Owner-/Leserechtsvarianten, keine automatische Bindung und
Sprachwechsel auf Desktop/Mobil. Der Testselektor fuer das bereits uebersetzte
Sprachmenue wurde korrigiert. Screenshots zeigen keine Ueberlaeufe/Ueberlagerungen.

```text
environment: Docker 29.6.2 / PostgreSQL 17; Node 24.21.0; Playwright 1.63
startup: PASS - gebautes Vite-Preview auf 4283 fuer Browserpruefung
canonical: PASS - exit_code: 0; 331 passed, 25 gated skipped; lint/types/build
integration: PASS - exit_code: 0; 29 passed, 0 failed; eigene kurzlebige PG-DB
e2e: PASS - exit_code: 0; 152 passed, 0 failed; HTTP-Fixtures auf Desktop/Mobil
overall: NEEDS_SIGNOFF - lokale Gates gruen, echte IAM-/Zwei-Org-Abnahme offen
```

Logs: `/tmp/lzc-mvp-binding-check.txt`, `/tmp/lzc-mvp-binding-browser.txt`;
Screenshots unter `.local/browser-tests/organisation-explicit-human-organization-binding-owner-{desktop,mobile}/`.
Bestehende Lint-Warnungen und grosse Bundle-Warnung bleiben; keine neuen
Abhaengigkeiten. Kundendatenbank nicht als Testdatenbank verwendet. Neue
Migrationen 021 bis 024 dort nicht aktiviert; laufende API und gebundenes
natives Paket unveraendert. Der vom Benutzer beendete verwaiste Apply-Prozess
32333 wurde als beendet bestaetigt. Keine fremden Prozesse beendet, kein
Commit/Release/Merge, Kunden-Apply oder Live-S3-/Recovery-Nachweis.
Alle sieben MVP-Issues bleiben offen; Job-Grants, Least-Privilege-Qualifizierung
und Produktions-Client-Freigabe werden durch lokale Tests nicht als erledigt gewertet.

## 2026-10-05: Einmalige widerrufbare Plattform-Job-Grants (#91)

Migration 025 speichert unveraenderliche job-/tenant-/benutzer-/operationsgebundene
Credential-Grants mit exaktem Vorbereitungs-, Organisations-, Profil-, Secret-
Versions-, Key-ID- und Manifest-Hash-Bezug. Anlage erfolgt atomar mit dem
ausdruecklich angeforderten Plan oder freigegebenen Apply. Ablauf ist das
Minimum von Job-Ticket und ausstellender Sitzung. SQL prueft Vorbereitungsdaten;
RLS und eingeschraenkte Schreibrechte schuetzen den Beleg. Nur einmaliger
Claim und irreversibler Widerruf sind erlaubt.

Der Input-Claim muss vor jeder technischen Credential-Pruefung und jedem
Secret-Abruf gueltig sein. Die Rueckgabe prueft Ablauf und Jobstatus erneut.
Ein separat bestaetigter Origin-/CSRF-/Tenant-geschuetzter Widerruf ist
idempotent; Plan-Abbrechen widerruft ungenutzte Grants. Bereits beanspruchte
Grants koennen keine glaubhafte Rueckholung von uebertragenen Schluesseln
zusichern und werden daher mit 409 statt falscher Erfolgsmeldung abgewiesen.
Kein neuer Application-Dispatch oder AO-Credential-Zugriff.

Die bestehende isolierte Plan-/Apply-/State-Suite wurde um acht Faelle erweitert:
Ablauf, Widerruf vor technischer Nutzung, unveraenderliche Belege und Tenant-
Isolation, HTTP-Freigabegrenzen, Cancellation, Ablauf waehrend technischer
Pruefung, Altjob ohne Grant und konkurrierende Claims. Alle 31 Faelle bestehen.
Die isolierte Identitaets-/Katalog-/Policy-/Bindungssuite besteht mit 29 Faellen
einschliesslich erneuter Migrationen. Testdatenbanken wurden separat erzeugt
und entfernt; keine Kundendatenbank als Testdatenbank verwendet.

```text
canonical: PASS - exit_code: 0; 331 passed, 33 gated skipped; lint/types/build
broker-integration: PASS - exit_code: 0; 31 passed, 0 failed; echtes isoliertes PG
identity-integration: PASS - exit_code: 0; 29 passed, 0 failed; echtes isoliertes PG
browser: NOT_RERUN - rein backendseitiger Schritt; vorher alle 152 Faelle gruen
overall: NEEDS_SIGNOFF - Application-Anbindung und echte IAM-/Live-Abnahme fehlen
```

Log: `/tmp/lzc-mvp-grants-check.txt`; Editor-Diagnostik fuer die drei geaenderten
TypeScript-Dateien ohne Fehler. Bestehende Lint-/Bundle-Warnungen bleiben.
Migrationen 021 bis 025 nicht in der laufenden Kunden-API aktiviert; API und
gebundenes natives Paket unveraendert. Kein Kunden-Plan/Apply, Commit, Release
oder Merge. Grants begrenzen Credential-Nutzung, nicht IAM-Rechte oder
Schluesselgueltigkeit im Cloud-Provider. Bereits laufende Worker, Schluessel-
rotation und Recovery werden nicht durch einen Grant-Widerruf erledigt.

## Application-Root und Feature-Checkpoint (2026-10-05)

Der Git-Index wurde nach ausdruecklicher Freigabe repariert, ohne Arbeitsdateien
oder vorhandene Referenzen zu veraendern. Vollstaendige private externe Sicherung,
Originalindex und Git-Objekte bleiben erhalten. Der Feature-Zwischenstand
`4ad9367` und der Application-Quell-Pin
`4d15d7870afa323badd93559d8b37c5a8d138dcf` wurden lokal committed und jeweils
als vollstaendige, gepruefte Git-Bundles ausserhalb des Sync-Verzeichnisses
gesichert. Gitleaks fand keine Secrets im gestagten Commit-Inhalt.

Das Application-Root hat eine ersetzbare Backend-Datei, feste Provider und einen
eigenen Provider-Lock. Der Worker nutzt fuer Application-Jobs ausschliesslich
dieses Root und den exakt gebundenen S3-Instanz-Key. 15 neue kontrollierte
Worker-Faelle pruefen Root/relative Module, gespeicherten Apply ohne Replan,
minimale private Recovery, Artifact-Grenzen sowie falsche Pins, Locks,
Instanz-/Tenant-Keys, Bootstrap, ungueltige Bindungen/Pfade und fehlende Pakete.

```text
canonical: PASS - exit_code: 0; 346 passed, 33 gated skipped; lint/types/build
worker: PASS - exit_code: 0; 80 passed, 1 gated skipped; kontrollierte Engine
native: PASS - echtes OpenTofu 1.12.6; 14 Application + 3 Netzwerk-Mockfaelle
package: PASS - backendfreies Init/Validate, readonly Lock, signierter Provider-Mirror
browser/database: NOT_RERUN - keine UI-/SQL-Aenderung; vorher 152 Browser, 31/29 PG
overall: NEEDS_SIGNOFF - kein Application-Dispatch/Job-Grant oder Live-Cloud-Nachweis
```

Neues, nicht aktiviertes Paket:
`runner-local-20261005-application-root.tar.gz`, SHA-256
`848c402a75ba8906abd958158044ba07cda2dfbb6f7fe14353048a157c9cb0d1`.
Der Application-Lock wurde fuer Darwin ARM64 und Linux AMD64 qualifiziert;
das tatsaechliche lokale Paket verwendet Darwin ARM64. Linux-Runtime-Abnahme
ist dadurch nicht nachgewiesen. Logs liegen unter
`/tmp/lzc-mvp-application-{root,pin,worker,check,package}.txt`.

Die API gibt weiterhin keine Application-Ausfuehrung frei. Migrationen 021 bis
025 wurden nicht in der Kunden-API aktiviert; aktive API und bestehende
Runner-Bindungen bleiben unveraendert. Keine Kunden-Credentials verwendet,
kein Kunden-Plan/Apply, Push, Release oder Merge. Native Provider-Warnungen
wegen veralteter Observability-Ausgabeattribute sind nicht Teil dieser Aenderung.

## Application-Job-/Grant-Vorbereitung (2026-10-05, #93)

Migration 026, Service und HTTP-Endpunkte fuer explizite idempotente Plan-
Vorbereitung und Grant-Widerruf sind lokal implementiert. Expliziter Wechsel
zum qualifizierten Application-Quellstand erzeugt eine neue Template-Version;
Altversionen werden weder umgeschrieben noch zur Job-Ausfuehrung freigegeben.
SQL leitet immutable Grant-Bindungen aus echten Sessions, Instanzen und
PE-freigegebenen Vertraegen ab. Die App-Rolle erhaelt keinen Session-Tabellen-
Leserechtsausbau und darf keine Grant-Bindungen direkt schreiben.

Die vorhandene echte PostgreSQL-Vertrags-Fixture prueft jetzt zusaetzlich:
neue/alte Quellversion und Publish-Replay, ungueltige Commits, ungepruefte
Organisation, fehlende Bestaetigung oder Credential-Overrides, atomare Job-/Grant-
Erzeugung, Ablaufgrenze, Retry, Fremdbesteller/Tenant-RLS, immutable Belege,
Widerruf durch Besteller und Freigeber, nicht ruecksetzbaren Widerruf sowie
echte Fastify-Session-/Origin-/CSRF-/Tenant- und Body-Grenzen. Die HTTP-Antwort
enthaelt explizit keine Credentials und keine Ausfuehrungsfreigabe.

```text
canonical: PASS - exit_code: 0; 346 passed, 33 gated skipped; lint/types/build
identity/application: PASS - exit_code: 0; 29 bestehende, erweiterte echte PG-Faelle
platform-broker: PASS - exit_code: 0; 31 echte isolierte PG-Faelle unter Migration 026
browser: NOT_RERUN - kein UI-Schritt; vorher 152 Desktop-/Mobilfaelle
diagnostics: PASS - 0 Fehler in den vier geaenderten TypeScript-Dateien
overall: NEEDS_SIGNOFF - prepared ist kein Dispatch/Cloud-Plan/Credential-Release
```

Logs: `/tmp/lzc-mvp-application-jobs-{check,pg,broker,types}.txt`.
Testdatenbanken wurden separat erzeugt und wieder entfernt. Migrationen 021
bis 026 sind nicht in der laufenden Kunden-API aktiviert; kein Neustart oder
Runner-Paketwechsel, kein Kunden-Plan/Apply. Die native Ausfuehrung bleibt
OpenTofu; `terraform fmt` wurde vorher nur fuer die Repository-Formatregel
verwendet, nicht als separater Runtime-Kompatibilitaetsnachweis.

## Application-Backend-Freigabe (2026-10-05, #93)

Migration 027 und der explizite HTTP-/Service-Pfad binden ein registriertes
Tenant-S3-Backend unveraenderlich an den Instanz-State-Key eines vorbereiteten
Jobs. Freigeben darf nur der aktuelle vertragsfreigebende PE. Grant, Besteller-
Session, aktuelle Rollen, Organisation und menschliche Identitaeten werden erneut
geprueft. Die Freigabe ist zusaetzlich an ihre reale PE-Session gebunden; Ablauf
wird nicht durch Retry oder neue Session verlaengert. Backend-Credentials werden
weder gelesen noch entschluesselt; bestehende AO-Credential-RLS bleibt bestehen.

Die erweiterte bestehende PostgreSQL-Vertrags-Fixture prueft AO-/Fremdtenant-
Ablehnung, stale Session, strikte Overrides, genaue Descriptor-/State-Bindung,
immutable Belege, fehlende direkte Schreibrechte, kurze Job-/PE-Session-Laufzeit,
neue Session ohne Refresh, Widerruf sowie echte HTTP-Session-/Origin-/CSRF-/Tenant-
Grenzen. Zwei parallele HTTP-Freigaben liefern denselben nicht geheimen Beleg;
Backend-Wechsel ist 409, widerrufene Freigabe 403. Ausschliesslich synthetische
Ciphertexts und Descriptoren, kein echter S3-/Cloud-Zugriff.

```text
canonical: PASS - exit_code: 0; 346 passed, 33 gated skipped; lint/types/build
identity/application: PASS - exit_code: 0; 29 bestehende, erweiterte echte PG-Faelle
platform-broker: PASS - exit_code: 0; 31 echte isolierte PG-Faelle unter Migration 027
browser: NOT_RERUN - keine UI-Aenderung; vorher 152 Desktop-/Mobilfaelle
overall: NEEDS_SIGNOFF - Freigabebeleg ist kein Credential-Release/Dispatch/S3-Test
```

Logs: `/tmp/lzc-mvp-application-backends-{check,pg,broker,format}.txt`.
Ein optionaler Test-Response brauchte eine TypeScript-Null-Absicherung; danach
derselbe kanonische Gate erfolgreich. Testdatenbanken separat erzeugt und entfernt.
Migrationen 021 bis 027 nicht in der Kunden-API aktiviert; kein API-Neustart,
Paketwechsel, Kunden-Plan/Apply, Push, Release oder Merge. #93 bleibt offen.

## Einmaliger interner Application-Claim (2026-10-05, #93)

Migration 028 und die interne Service-Methode verbrauchen einen gueltigen Grant
einmalig unter der echten PE-Backend-Freigabesession. Es gibt keinen oeffentlichen
Claim-Endpunkt und keine Secret-Ausgabe. AO oder eine andere reale PE-Session
duerfen den Claim nicht ausfuehren. Immutable Claim-Belege behalten dieselbe
begrenzte Freigabe-Laufzeit. Bereits verbrauchte Jobs werden nicht per Replay als
`prepared` erneut angeboten; Widerruf nach Verbrauch ist explizit 409.

Die vorhandene echte SQL-Fixture prueft zusaetzlich fehlende Backend-Freigabe,
andere echte PE-Session, abgelaufene oder widerrufene Freigabe, zwei konkurrierende
Claims mit genau einem Erfolg, Verbrauchs-Replay, denied INSERT/DELETE sowie
konkurrierenden Claim/Widerruf mit genau einem Erfolg. Der gespeicherte Zustand
ist niemals gleichzeitig widerrufen und verbraucht. Der nicht vorhandene
Browser-Claim-Pfad wird auch ueber echtes Fastify mit 404 geprueft.

```text
canonical: PASS - exit_code: 0; 346 passed, 33 gated skipped; lint/types/build
identity/application: PASS - exit_code: 0; 29 bestehende, erweiterte echte PG-Faelle
platform-broker: PASS - exit_code: 0; 31 echte isolierte PG-Faelle unter Migration 028
diagnostics: PASS - keine Fehler in den beiden geaenderten TypeScript-Dateien
browser: NOT_RERUN - keine UI-Aenderung; vorher 152 Desktop-/Mobilfaelle
overall: NEEDS_SIGNOFF - interner Claim ist keine Credential-Uebergabe/Dispatch
```

Logs: `/tmp/lzc-mvp-application-claims-{check,pg,broker,format}.txt`.
Kein Testzugriff auf Kundendatenbank, Credentials oder echten S3-State.
Migrationen 021 bis 028 nicht in der Kunden-API aktiviert; aktive API und Paket
unveraendert. Kein Kunden-Plan/Apply, Push, Release oder Merge. #93 bleibt offen.

## Eigenstaendiger Accelerator-CLI-Pfad und Herkunft (2026-10-05, #93)

Verbindliche Grenze: Configurator bleibt optional. Der Application-Root benoetigt
keine Configurator-API, Datenbank, Session oder Template Engine. Neue Plattform-
Installationen koennen ohne Application-Instanzen beginnen und `platform_contract`
als nicht geheimes JSON exportieren. Referenzen enthalten Folder, Regionen, SNA,
Next-Hop und Nameserver; kein voller State oder Secret. Der CLI-Namensraum ist
standardmaessig die Organisation, optional eine stabile UUID. Die UUID-Revision
wird deterministisch aus Namespace und Referenzen abgeleitet, nicht von einem
Configurator ausgestellt. Der bisherige Root bleibt fuer kombinierte Bestands-
Installationen erhalten; deren Umstellung ist kein automatischer State-Move.

Application-JSON und S3-Backend-Beispiel, manuelle Identitaets-/Template-Werte,
stabiler Instanz-Key, separate Credentials/Locks und expliziter Saved-Plan-Apply
sind dokumentiert. Der native Mocktest liest das eingecheckte manuelle JSON
direkt. `landing_zone_accelerator=true` ist im Root verpflichtend; die Compiler
ergaenzen fuer Configurator-Inputs `landing_zone_configurator=true`. Kundenlabels
bleiben erhalten. Die Application verwendet standardmaessig CLI-Herkunft;
Configurator-Herkunft ist eine zusaetzliche explizite Eingabe. Labels sind keine
IAM-Grenze oder manipulationssicheren Belege. Accelerator-CI testet beide Roots.

```text
canonical: PASS - exit_code: 0; 348 unit passed, 33 gated skipped; lint/types/build
platform-native: PASS - 8 mock cases, including public/corporate/eu01+eu02 handoff
application-native: PASS - 16 mock cases, including manual JSON and both origins
network-native: PASS - 3 existing shared-module mock cases
identity/application: PASS - 29 existing expanded isolated PostgreSQL cases
platform-broker: PASS - 31 isolated PostgreSQL cases
format: PASS - terraform fmt -check -recursive src
browser: NOT_RERUN - no UI changes; previous 152 desktop/mobile cases
overall: NEEDS_SIGNOFF - no real CLI Apply/S3/IAM or new source/package promotion
```

Die Mehrregionen-Fixture benoetigte UUID-Defaults fuer vorhandene regionale Mock-
Provider; generierte Zufallsstrings sind keine gueltigen SNA-/Routing-Table-IDs.
Logs: `/tmp/lza-cli-platform-native.txt`, `/tmp/lzc-cli-provenance-{native,unit,check,pg,broker}.txt`.
Alle Tests isoliert ohne Kunden-Credentials, Kundendatenbank oder Kundenbackend.
Neue Compiler-Inputs aendern Hashes: keine Umbindung/Neusignierung alter Plans.
API, aktive Runner-Pakete und bereits publizierte Quellversionen bleiben unveraendert.
Spaetere Aktivierung verlangt frische Plans und bewusste neue Source-Qualifizierung.
Kein Cloud-Plan/Apply, State-Migration, Push, Release oder Merge; #93 bleibt offen.

## Application-Quellqualifizierung und interne Credential-Freigabe (2026-10-05, #93)

Migration 029 erlaubt neben dem unveraenderten alten Application-Pin explizit
`c4b43c36af198985980b17626c48d357795e3fbd`. Publikation erzeugt eine eigene Version;
alte Versionen, Jobs und Grant-Snapshots werden nicht umgeschrieben. Der neue
Worker und das lokale Opt-in-Paket akzeptieren nur ihren exakt festen Pin.
Altjobs werden nicht auf das neue Paket umgebunden. Das neue inaktive Paket
`runner-local-20261005-application-cli.tar.gz` hat SHA-256
`bd87f44d1bafa0a3c9d974c735aa1edfd70add08d8ad9f1e503500bbe8af8aa7`.
Native Init/Validate und signierter Provider-Mirror mit readonly Application-Lock
bestanden auf darwin_arm64/OpenTofu 1.12.6; kein Cloud-Plan oder Linux-Nachweis.

Migration 030 liefert nur einen nicht geheimen Credential-Kontext nach Claim
durch die originale echte PE-Freigabesession. Sie revalidiert die konkrete
Organisation, Owner-/PE-Session, aktuelle Rollen/Identitaeten und Ablaufzeit.
Die interne Methode `releaseJobCredential` verbraucht den Grant vor
`verifyForPreparation` und Vault-Zugriff, bindet Source, Profil, Secret-Version,
Key-ID und Service Account und wiederholt die Live-Autorisierung unmittelbar vor
der Rueckgabe. Es gibt keinen Browser-/HTTP-Credential-Endpunkt, kein Runner-
Ticket und keinen Dispatch. Fehler verbrauchen den Claim; kein automatischer
Retry oder Zuruecksetzen. Die echte PostgreSQL-Fixture mit Vault-/Cloud-Mocks
prueft Erfolg, AO-Ablehnung vor technischen Zugriffen, Claim-vor-Secret, Replay,
Rotation, Source-Abweichung, parallele Freigabe mit genau einem Erfolg sowie
PE-/Management-Rechteentzug waehrend des Secret-Zugriffs und anschliessenden Replay.
Management-Rechte duerfen laut Schema nur zusammen mit PE bestehen; die Fixture
entzieht deshalb beides und stellt ihre eigenen Ausgangswerte wieder her.

```text
canonical: PASS - 349 unit passed, 33 gated skipped; lint/types/build
application-worker: PASS - 81 fake-engine cases, 1 native-gated skipped
identity/application: PASS - 29 expanded isolated real PostgreSQL cases
platform-broker: PASS - 31 isolated real PostgreSQL cases under migrations 029/030
package: PASS - native init/validate/readonly lock/signed mirror, inactive package
diagnostics: PASS - no errors in touched API/worker/test TypeScript files
browser: NOT_RERUN - no UI change; prior 152 mocked desktop/mobile cases
overall: NEEDS_SIGNOFF - no ticket/dispatch/cloud/state/quota/upgrade acceptance
```

Logs: `/tmp/lzc-application-source-{pg,worker,package,format}.txt` und
`/tmp/lzc-application-credential-{pg,broker,check,format}.txt`.
Alle Datenbanktests isoliert; keine Kunden-Credentials/-Daten/-Backends gelesen.
Migrationen 021 bis 030 nicht in der laufenden Kunden-API aktiviert. Aktive API,
aktives Paket und gespeicherte Kundenplans unveraendert; kein Cloud-Plan/Apply,
State-Migration, Push, Release oder Merge. #93 bleibt offen.

## Application-Tickets, vollstaendiger Input und Dispatch-Kern (2026-10-05, #93)

Migration 031 persistiert nur den Hash eines kryptografischen Einmal-Tickets,
exakte echte PE-Freigabesession, Paket-UUID, festen c4b43c3-Pin und readonly
Application-Provider-Lock. Pro Job gibt es nur ein Ticket. Andere Session,
Paket-Abweichung, Ablauf und Replay geben keine Credentials frei. Der interne
Resolver verwendet die echte gespeicherte Session-ID, nicht eine Job-ID als
synthetischen PE. Direkte Tabellenlese-/Schreibrechte fuer App-User fehlen.

Der neue interne `runnerInput` verbraucht zuerst Ticket und Grant, prueft
STACKIT-Credentials, liest die immutable Job-Variablen und den explizit genehmigten
Backend-Descriptor, verwendet den vorhandenen HCL-Serializer und S3-Broker und
revalidiert nach S3-Credential-Freigabe nochmals Autoritaet, Ablauf und Dispatch.
Bucket/Endpoint/Region bleiben fest; nur der genehmigte Instanz-Key mit Lockfile
wird verwendet. Der Input ist ausschliesslich `application-plan`; kein Apply,
Bootstrap oder Plattform-State. Backend-Abweichung/Rechteentzug liefern keinen
Input zurueck und setzen verbrauchte Tickets/Grants nicht zurueck.

Migration 032 reserviert den internen Dispatch atomar pro Instanz und bindet
Ticket/Paket im vorhandenen `PlanRunner.start`-Callback vor Startfreigabe. Ein
zweiter Start desselben Jobs startet keinen Prozess; ein anderer Job derselben
aktiven Instanz ist gesperrt. Fehler vor Paketbindung werden `failed`; Fehler
nach Bindung werden konservativ `reconciliation_required`, weil ein Prozessstart
nicht sicher ausgeschlossen ist. Diese Instanzen und Tickets bleiben gesperrt;
kein automatischer Ablauf-Cleanup/Retry oder Neuversuch mit anderem Job.

Die bestehenden echten PostgreSQL-Faelle wurden um Hash-only-Persistenz,
Ticket-/Session-/Paket-Bindung, Replay, konkurrierenden Verbrauch, Ablauf,
vollstaendigen Input, falsches Backend, Rechteentzug nach S3-Zugriff und
Fake-Runner-Dispatch/Races/Startfehler erweitert. Ein Testblock musste am
eindeutigen Testnamen verankert werden statt an mehrfach vorhandenem Owner-
Widerruf. Die S3-Fixture braucht Literaltypen fuer Endpoint/Region/Lock-Flag;
Editor-Diagnosen allein hatten den Fehler nicht gezeigt, der kanonische Gate schon.

```text
canonical: PASS - 349 unit passed, 33 gated skipped; lint/types/build
identity/application: PASS - 29 expanded isolated real PostgreSQL cases
platform-broker: PASS - 31 isolated real PostgreSQL cases under migrations 031/032
dispatch: PASS - fake runner only; exactly one start, prestart binding, reconciliation
diagnostics: PASS - no errors in touched API/test files; canonical test types passed
browser/native/cloud: NOT_RERUN - no UI/worker/package changes; no real Application start
overall: NEEDS_SIGNOFF - report/artifact/operator integration and active dispatch absent
```

Logs: `/tmp/lzc-application-ticket-{pg,input-pg,types,format}.txt` und
`/tmp/lzc-application-dispatch-{pg,broker,check,format}.txt`.
Produktionsverdrahtung hat keinen Application-Runner; `dispatchJob` ist dort
`application_dispatch_disabled`. Kein HTTP-Start-/Ticket-/Credential-Endpunkt.
Vor Aktivierung fehlen Application-Report-/Artefakt-/Result-Anbindung sowie
Operator-Reconciliation und die separat freizugebende native/Cloud-Abnahme.
Migrationen 021 bis 032 nicht in Kunden-API aktiviert. Aktive API, Runner-Paket,
Kundenplans und CLI-Unabhaengigkeit unveraendert; keine Kunden-Credentials/-Daten
gelesen, kein Cloud-Plan/Apply, Push, Release, Merge oder State-Migration.
#93 bleibt offen; Quoten, Upgrade-Plans und reale State-/Lock-/Recovery-Abnahme fehlen.

## STACKIT-Login und Nachweisdiagnose, 2026-10-06

Bestehende `e2e/organisation.spec.ts`-Nachweisfaelle minimal erweitert: sichtbare
Configurator-/STACKIT-Identitaet, Device-Fehlercodes, HTTP-409-Identitaetskonflikt,
unbekannte Codes einschliesslich `constructor`, keine Providerdetail-Ausgabe und
keine Organisationsbindung bei Fehlern. Bestehende Owner-/Readonly-Pfade bleiben
erhalten. Keine neue Testinfrastruktur; synthetische Identitaeten und API-Mocks.

```text
environment:
	docker: AVAILABLE - Docker daemon 29.6.2; no database needed for UI-only change
	node: AVAILABLE - Node 24.21.0/npm 11.19.0 via npm exec
	playwright: AVAILABLE - installed browser exercised successfully
	infra-tier: UNCHANGED - API mocks for existing UI suite; no customer DB access
	browser-tier: PRIMARY(Playwright) - desktop 1440x1000/mobile 390x844
startup: PASS - fresh Vite build and isolated preview on 4284
integration: PASS - exit_code: 0; 61 device/i18n tests, 0 failed, 0 skipped
types: PASS - exit_code: 0; app and test TypeScript projects
e2e: PARTIAL - exit_code: 0; 14 passed, 0 failed; mock proof flows, not live IAM
overall: NEEDS_SIGNOFF - real cold login fails at provider; real org failure unknown
```

Anonyme isolierte Provider-Browser ohne Sitzung reproduzieren `/ui/login/user`
mit nur Weiter und drei versteckten Inputs. Complete-Link, Basis-Link mit
manueller Code-Eingabe und zusaetzlicher Profile-Scope liefern keinen Login.
Kein menschlicher Login abgeschlossen, keine Credentials/Tokeninhalte ausgegeben.
Der bereits freigegebene CLI-Client bleibt unveraendert; die Provider-/Client-Policy
und eigene Produktionsregistrierung brauchen Klaerung. Bestehende Kundensitzungen,
API-Prozess, Runner-Paket, State und Migrationen bleiben unveraendert. #91 offen.

## CLI-PKCE-Folgekorrektur, 2026-10-06

Die lokale Quelle `stackit-cli/internal/pkg/auth/user_login.go` zeigt Authorization
Code mit S256-PKCE, `openid offline_access email`, `max_age` und einen Callback auf
localhost:8000-8020. Der Configurator nutzte dagegen Device Flow. Ein anonymer
isolierter Browser mit frischem CLI-artigem Authorization-Code-Start zeigt ein
Benutzernamenfeld auf `/ui/login/user`. Die vorherige allgemeine Provider-Blocker-
Einordnung ist damit zu weitgehend; noch keine vollstaendige menschliche Abnahme.

Lokale Implementierung mit zufaelligem State/Nonce und PKCE, einmaligem Callback,
urspruenglicher Browser-/Sitzungs-/Tenantbindung und signierter Nonce-Pruefung.
Bestehende Identitaets-, Owner-, Origin-/CSRF- und explizite Bindungsgates bleiben.
Loopback-Bridge leitet nur zum festen Configurator-Origin weiter und verwirft
Providerdetails. Callback erzeugt keine Session und speichert keinen Nachweis;
die bestehenden geschuetzten Poll-Routen erledigen dies nach Tokenverifikation.
Keine Refresh-Token-Ablage. CLI-Callback ausschliesslich fuer lokale Nutzung,
Produktions-Webclient und dessen registrierter Callback weiterhin erforderlich.

```text
auth: PASS - exit_code: 0; 62 tests incl real loopback HTTP bridge and callback gates
unit: PASS - exit_code: 0; 395 passed, 45 gated skipped
types: PASS - exit_code: 0; app and test projects
lint-scope: PASS - exit_code: 0; no errors in changed login files
canonical: BLOCKED - exit_code: 1; five paused Applied-Platform format/import errors
browser: PARTIAL - exit_code: 0; 4 login + 16 proof desktop/mobile cases; API mocks
provider-start: PASS - fresh anonymous CLI-style start renders username input
overall: NEEDS_SIGNOFF - local API not restarted; human login/real IAM not exercised
```

Bestehende Browsertests wiederverwendet, jeweils eine codefreie PKCE-Variante
ergänzt. Negativtests: falsche/fehlende Browserbindung, fremde Sitzung/Tenant,
falscher State/Issuer, Replay, Ablauf, Cancel, fehlendes ID-Token, falsche Nonce,
fremde/unregistrierte Callback-Ziele, doppelte Query-Parameter. Screenshots zeigen
korrekte Desktop-/Mobilansichten und gesperrte Bindung vor separater Bestaetigung.
Keine Kundenmigration, API-Neustart, Runner-Aenderung oder Cloud-Operation.

## Lokale PKCE-Aktivierung (2026-10-06)

Nach ausdruecklicher Freigabe wurde ausschliesslich der isolierte Login-only-Stand
aktiviert. Private Sicherung vollstaendig in eigenem PostgreSQL 17 wiederhergestellt;
Migrationscheck mit der vorgeschriebenen Migrationsrolle bleibt exakt 034.
Nach regularem API-Neustart stimmen alle 33 Kundentabellen mit der Sicherung
ueberein. Plattform-State, Runs, Backend und festes Runner-Paket bleiben unveraendert;
Application-Ausfuehrung bleibt deaktiviert. Der eigene Restore-Container ist entfernt.

```text
restore: PASS - full database restore, 33 tables unchanged
migrations: PASS - isolated runtime remains exactly 001-034
health: PASS - API and Web proxy; disabled application runner returns 404
provider-start: PASS - actual anonymous UI start, visible username, no device code
human-login-and-organisation: NEEDS_SIGNOFF - not performed by the assistant
cloud: NOT_RUN - no Plan, Apply, source rebinding or migration 035/036 activation
```

Der browsergebundene eigene Pruefflow wurde abgebrochen und sein Browserkontext
geschlossen. Anonymer Providerstart ist keine Abnahme menschlicher Identitaet,
effektiver IAM-Rechte oder der Organisationsbindung.

## PKCE-Rueckkehr und Session-Uebernahme (2026-10-06)

Der Benutzer konnte sich bei STACKIT anmelden, sah im Rueckkehr-Tab aber weiter
den Gaststatus. Die einmalige initiale Session-Abfrage konnte vor dem Abschluss
des Pollings im anderen Tab erfolgen. Der feste geheimnisfreie Rueckkehrmarker
startet nun das bestehende geschuetzte Polling im Rueckkehr-Tab. Bei konkretem
`stackit_flow_missing` nach Parallelabschluss muss eine echte serverbestaetigte
Session vorliegen; der Marker ist kein Authentifizierungsnachweis.

```text
auth: PASS - 62 tests; fixed callback marker, unchanged state/nonce/cookie gates
browser: PARTIAL - 10 desktop/mobile cases; API mocks, return/race/missing-flow
types-and-lint: PASS - application/test projects, no new errors
canonical: PASS - 395 unit passed, 45 expected skips
runner-gate: RETRIED - first full run kill EPERM in unrelated cleanup; narrow/full retry passed
activation: PASS - fresh private backup; isolated runtime auth/types qualified
preservation: PASS - schema 034, all 33 customer tables unchanged after restart
live-guards: PASS - unbound callback 400, disabled application runner 404
human-browser: NEEDS_SIGNOFF - user's displayed session after fix not yet confirmed
cloud: NOT_RUN - same pinned runner; no migrations 035/036 or Plan/Apply
```

Der Fehler im ersten erweiterten Browserlauf betraf die Test-Fixture:
globale Page-Mocks uebersteuerten Context-Mocks. Die bestehende Login-Fixture
wird jetzt pro Tab registriert. Der Runner wurde fuer den Aufraeumfehler nicht
veraendert. Aktive Login-Ausfuehrung bleibt isoliert vom neueren Application-Code.

## Serverbasierte Applied-Platform-Bindung (2026-10-06)

Lokaler PE-Weg: angewendete Plattform auswaehlen, serverseitige Vorschau,
ausdrueckliche Freigabe mit geprueftem technischem Zugang. Keine kopierten Ziele,
kein voller Plattform-State und keine Credentials im Browser. Source-Belege
sind unveraenderlich und behalten Apply-/State-/Dokument-Provenienz.
Aktuelle Nachweise und State werden auch nach technischer Verifikation erneut
geprueft; parallele Wiederholungen erzeugen keine doppelten Verträge.

```text
canonical: PASS - npm run check; lint, application/test types, 395 unit passed
gated-unit: SKIPPED - 45 expected database/native gates outside default unit run
postgres: PASS - full platform-plan suite; actual HTTP and source approvals
negative: PASS - cookie/tenant/CSRF, target/hash tampering, expired/revoked proof
race: PASS - proof expires during technical verification; no source persisted
idempotency: PASS - concurrent approvals and successful HTTP retry
browser: PARTIAL - 6 existing catalogue/publication cases, desktop/mobile, API mocks
visual: PASS - reviewed desktop/mobile screenshots, no content overlap
live-source-and-cloud: NOT_RUN - active schema remains 034, application disabled
```

Die API-Capability bleibt fuer aeltere Server optional; ihr Antwortformat bleibt
unveraendert. Migrationen 035/036 und der vollstaendige neue Runtime-Stand sind
nicht aktiviert. Menschliche IAM-/Publikationsabnahme und echte Application-
Ausfuehrung bleiben offen. Kein Push, Merge, Release oder Cloud-Apply.

## Reale Veroeffentlichung und Benutzerverwaltung (2026-10-06)

Dieser Stand ersetzt die vorstehenden Aussagen zu nicht aktivierten Migrationen
035/036 und noch fehlender menschlicher Publikationsabnahme. Die aktuelle
Repository-API verwendet Schema 039; der bisherige isolierte Login-only-Runtime
ist nicht mehr aktiv. Der qualifizierte Plattform-Runner bleibt unveraendert,
Application-Ausfuehrung ist weiterhin ausdruecklich deaktiviert.

Der reale menschliche Owner-Nachweis verwendet den vom Resource Manager fuer die
exakte Organisation gelieferten IAM-Containerbezug. Alle 965 offiziellen
Owner-Rechte werden geprueft, nicht abgeschnitten. Migration 037 erhoeht beide
bestehenden Rechtegrenzen auf 4096, ohne Nullwerte oder unvollstaendige Rechte
zuzulassen. Nach normalem PKCE-SSO, geschuetztem Polling und separater Bestaetigung
ist die Organisationsbindung tatsaechlich verifiziert.

Das bestehende Public-Template ist als unveraenderliche Version 1 mit freigegebenem
aktuellen Plattformvertrag, Ziel public-eu01, automatischer Application-Owners-
Gruppe und Freigaberichtlinie veroeffentlicht. Der echte Katalog behaelt die
Version nach Reload. Es wurden dafuer keine Cloud-Ressourcen erstellt.

Gruppenverwaltung liegt jetzt unter Benutzerverwaltung. Eigene Gruppen lassen
sich anlegen und loeschen; Mitglieder lassen sich hinzufuegen und entfernen.
Die Standardgruppe bleibt rollenbasiert. Gruppen mit Template-Freigaben bleiben
gegen Loeschung geschuetzt. Eine Rollenaktualisierung entfernt keine manuell
vergebenen Mitgliedschaften in eigenen Gruppen. Die reale Pruefgruppe wurde
ueber die normale Oberflaeche angelegt, besetzt, nach Reload geprueft, geleert
und wieder geloescht; beide Arbeitsbereichsmitglieder und die Standardgruppe
blieben erhalten. Bestehende Template-Freigaben wurden nicht veraendert.

Gruppenmitglieder zeigen ihre gespeicherte bestaetigte STACKIT-E-Mail, keine UUID.
Migration 039 bietet dafuer eine begrenzte Lesefunktion auf der bereits
berechtigten Mitgliedersicht: echte aktuelle Sitzung, identischer Benutzer und
Tenant, bestehende Mitgliederverwaltung und keine widerrufene Identitaet.
Fremde Sitzungen, fremde Tenants und nicht verwaltende Mitglieder liefern keine
E-Mail-Liste. IDs bleiben ausschliesslich interne Mitgliedschaftsschluessel.
Legacy-Konten ohne E-Mail behalten den Benutzernamen, bei fehlendem Namen gibt
es eine neutrale Benutzerbezeichnung statt einer erfundenen Adresse oder UUID.
Die echte Oberflaeche zeigt beide vorhandenen Mitglieder mit E-Mail-Adresse.

Ein abgelaufener menschlicher Owner-Nachweis kann auch nach erfolgter Bindung
erneuert werden; dabei wird keine weitere Bindung angeboten oder erzeugt.
Die echte passwortfreie PKCE-Erneuerung war erfolgreich. Anschliessend zeigt die
Apply-Auswahl den Konfigurationsnamen und das Abschlussdatum, keinen State-Key.

```text
canonical: PASS - npm run check, 403 unit tests; 52 expected gated skips
auth: PASS - 68 tests, 965 rights, exact container binding, bounded provider bodies
identity-postgres: PASS - 30 real isolated tests including 4096 limit and group lifecycle
platform-postgres: PASS - 49 real isolated broker/source tests, unchanged authority gates
browser: PASS - all 32 desktop/mobile management, publication, email and proof cases
visual: PASS - desktop/mobile group screenshots reviewed
backup-restore: PASS - fresh full restores for 034->036, 036->037, 037->038 and 038->039
idempotency: PASS - migrations repeated on restored databases
preservation: PASS - all 37 existing tables unchanged after restored 038 migration
live-preservation: PASS - operational tables unchanged after actual 038 activation
auth-differences: EXPECTED - concurrent sessions and credential-profile rows only
email-preservation: PASS - all operational tables unchanged after 039; no auth differences
email-boundaries: PASS - null GitHub login, foreign session/tenant, non-manager denied
live-ui: PASS - group CRUD, email labels, owner renewal, readable Apply, published version after reload
application-cloud: NOT_RUN - execution disabled, no Application Plan/Apply
delivery: LOCAL_ONLY - no push, merge or release
```

Die frische Sicherung vor 038 enthaelt bereits den genehmigten Plattformvertrag
und die veroeffentlichte Version. Private Dumps und Hashbelege bleiben ausserhalb
des Repositorys mit restriktiven Dateirechten; keine Credentials oder Roh-States
wurden ausgegeben oder committed. #92 ist nach Erfuellung aller urspruenglichen
Publikationskriterien geschlossen. #91 und #93 bleiben fuer ihre weiteren
Sicherheits-, Produktiv- und Ausfuehrungsabnahmen offen.

## Direkter Application-Einstieg nach Login und Reload (2026-10-06)

Der gespeicherte Konfigurationskontext wird jetzt auch beim direkten Einstieg
in Application Landing Zones aus der berechtigten serverseitigen Konfiguration
geladen. Ein vorheriger Besuch von Deployments ist nicht mehr erforderlich.
Ohne geoeffneten Entwurf erscheint zuerst der vorhandene Katalog; die
Veroeffentlichung bietet eine ausdrueckliche Konfigurationsauswahl. Es wird kein
beliebiger Entwurf automatisch ausgewaehlt oder aus einer publizierten Version
erfunden.

Die Plattformziel-Auswahl setzt Template und freigegebenen Vertrag voraus;
Region und Public-/Corporate-Typ bleiben verbindlich. Ein Template-Wechsel
verwirft die alte Zielauswahl. Fehlende passende Ziele erhalten einen eigenen
Status statt einer scheinbar funktionslosen Auswahl.

Ein erneuter Login kann den bisherigen menschlichen Owner-Nachweis ueberholen.
Die Apply-Auswahl bleibt dann sicher gesperrt und bietet die Nachweiserneuerung
direkt an. Nach erfolgreicher Verifikation werden die Daten erneut geladen.
Bei einem bereits in einem anderen Tab abgeschlossenen PKCE-Flow wird nur eine
aktuelle serverseitig verifizierte Identitaet MIT vollstaendigem Owner-Nachweis
als Erfolg akzeptiert. Ein fehlender Flow ohne diese Rechte bleibt abgelehnt.

```text
canonical: PASS - lint, types, build, 403 unit tests; 52 expected gated skips
browser: PASS - 36 focused desktop/mobile catalogue, proof and reload cases
diagnostics: PASS - changed source and test files have no editor errors
live-login: PASS - ordinary password-free SSO and immediate existing Version 1 catalogue
live-reload: PASS - saved Public template restored directly at /applications, no Deployments visit
live-proof: PASS - protected renewal and readable successful Apply selection
live-target: PASS - disabled before template selection, compatible public-eu01 afterwards
database-tests: NOT_RERUN - frontend-only change, no migration or API restart
cloud: NOT_RUN - no new publication, contract approval, Plan or Apply
delivery: LOCAL_ONLY - no push, merge or release
```

Die vorhandene Version 1 und der bereits freigegebene Plattformvertrag bleiben
unveraendert. Application-Ausfuehrung bleibt deaktiviert; #91 und #93 sind damit
nicht vollstaendig abgenommen.

## Runner-Revision und Loeschung vor Ausfuehrung (2026-10-07)

Die betroffene bestehende Bestellung bindet die Revision
`a256f6896d11134fdc351786f1be5eba4e56b2e2`; der lokale Application-Runner
qualifiziert `c4b43c36af198985980b17626c48d357795e3fbd`. Der Plan wurde vor
Jobanlage korrekt abgewiesen. Die UI erklaert diese Ursache nun konkret und
bindet neue, explizit bestaetigte Publikationen an die angebotene Runner-Revision.
Keine bestehende Version oder Bestellung wurde umgeschrieben.

Bestellloeschung ist ausschliesslich vor Dispatch, Runner-Ticket oder
Credential-Claim verfuegbar. Migration 042 fuegt einen unveraenderlichen
Loeschvermerk hinzu, ohne Ressourcen, State oder Bestell-/Freigabehistorie zu
entfernen. Vorbereitete Jobs werden dadurch fuer jede weitere Freigabe gesperrt.

```text
database: PASS - 31 real PostgreSQL tests, migration twice, deletion/claim races
http/i18n: PASS - 32 tests including strict DELETE confirmation, tenant/origin/CSRF
browser: PASS - 72 desktop/mobile organisation, approval, Plan and deletion cases
canonical: PASS - lint, types, build, 413 unit tests; 53 expected gated skips
local-rollout: PASS - private backup, restored upgrade twice, schema 042
data-retention: PASS - all 38 existing tables and 3 key/credential files unchanged
cloud: NOT_RUN - no customer order deleted, publication, job, Plan or Apply
delivery: LOCAL_ONLY - no push, merge or hosted release
```

Der unveraenderte grosse Identity-Proof-Test war bei Zwischenlaeufen sporadisch
rot; der abschliessende vollstaendige DB-Lauf inklusive der neuen Sicherheits-
und Parallelitaetsfaelle ist gruen. Application-Apply bleibt unimplementiert.

## Delegierte Application-Plan-Ausfuehrung (2026-10-08)

Migration 043 ergaenzt widerrufbare, unveraenderlich gebundene technische
Ausfuehrungsberechtigungen pro Plattformvertrag. Neue Jobs erhalten die passende
Service-Account-/Backend-Bindung bei ihrer Vorbereitung. Der Besteller startet
explizit; eine aktive Sitzung des Platform Owners und eine weitere technische
Backend-Freigabe pro Bestellung sind nicht erforderlich. Fachliche Freigaben
bei `approval-required` bleiben erhalten. Bestehende Jobs und Vertraege werden
nicht automatisch umgebunden oder freigeschaltet.

```text
database: PASS - 31 real PostgreSQL tests; delegated direct/approval-required paths
delegation: PASS - owner start without active PE session; one-use ticket/credential
revocation: PASS - before start, during secret read, safe dispatch cleanup
bindings: PASS - changed credential version denied; old jobs not rebound/resurrected
results: PASS - successful Plan requires a persisted, matching artifact
http/i18n: PASS - 33 tests; strict setup/revocation, tenant/origin/CSRF
browser: PASS - 76 desktop/mobile organisation, publication and order cases
canonical: PASS - lint, types, build, 414 unit tests; 53 expected gated skips
editor: PASS - no errors in the 11 touched code files
secret-scan: PASS - changed code/docs and new SQL; no leaks
local-rollout: PASS - fresh private backups; restored clone migrated twice; schema 043
data-retention: PASS - all 39 existing tables and 3 key/credential files unchanged
live: PASS - healthz, STACKIT PKCE, guest denial, current Web build on port 4181
cloud: NOT_RUN - no customer Plan/Apply or automatic platform execution delegation
delivery: LOCAL_ONLY - no commit, push, merge or hosted release
```

Die bestehende Identity-Proof-Fixture war in Zwischenlaeufen sporadisch rot;
der abschliessende vollstaendige DB-Lauf ist gruen. Bestehende Lint-/Bundle-Warnungen
bleiben unveraendert. Migrationen 040 bis 042 wurden nicht geaendert. Das lokale
Backup liegt privat unter `/Users/weberruss/lzc-local-application-delegation-20261008.zFGc0p`
mit Verzeichnisrechten 0700 und Dump-/Nachweisrechten 0600. Der eigene markierte
Test-/Clone-Container wurde entfernt; Benutzer-DB und laufende Server bleiben
erhalten. Application-Apply bleibt unimplementiert.