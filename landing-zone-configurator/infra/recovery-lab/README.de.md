# Isoliertes Recovery-Lab

[English](README.md) | [Deutsch](README.de.md)

Dieses lokale Lab ist reproduzierbare Infrastruktur aus `compose.yaml`, keine
zweite gehostete Dev-Installation. Es erstellt zwei per Digest gepinnte PostgreSQL-
17.11-Container mit getrennten benannten Volumes in einem internen Docker-Netz.
Es gibt keine veröffentlichten Ports, API, Runner, Cloud-Zugangsdaten, externen
Dienstbindungen oder eingebundenen Docker-Socket. Der Controller verwendet nur den
lokalen Docker-Unix-Socket; fremde Docker-Kontexte/-Hosts und Cloud-Umgebungsvariablen
werden nicht weitergegeben. Reguläre Anwendungsdienste und ihre Daten bleiben getrennt.

## Aufbau und Prüfung

Voraussetzungen: Linux, Python 3, Docker Engine mit Compose v2 und die echte
OpenTofu-Binärdatei **1.12.6** für Abbruchtests. Vom Repository-Verzeichnis aus:

```sh
python3 -m unittest discover -s landing-zone-configurator/infra/recovery-lab -p 'test_*.py'
python3 landing-zone-configurator/infra/recovery-lab/lab.py selftest
python3 landing-zone-configurator/infra/recovery-lab/interrupt.py --tofu /absolute/path/to/tofu
```

Der Controller erzeugt ein nur für den Eigentümer zugängliches Verzeichnis
`.private/` und ein zufälliges Datenbankpasswort. Das Verzeichnis ist von Git
ausgeschlossen; Passwörter und Sicherungsinhalte werden nicht ausgegeben. `selftest`
startet beide Dienste, wendet die eingecheckten Configurator-SQL-Migrationen mit
separater Migrationsrolle und Prüfsummen-Ledger auf die Quelldatenbank an, ergänzt
einen synthetischen Prüfdatensatz, erstellt ein Custom-Format-Backup und stellt es
in der anderen Datenbank wieder her. Wiederholungen erhalten die Quelle und bauen
nur die entbehrliche Zieldatenbank neu auf. Bestehende Migrationsprüfsummen müssen passen.

Verglichen werden die Inhalte aller Tabellen in `lzc`/`lzc_auth`, Migrations-Ledger
und Prüfdatensatz sowie Relationseigentümer, effektive ACLs, RLS-Flags und
Funktionsdefinitionen/-eigentümer. Gleichwertige PostgreSQL-Standard-ACL-Darstellungen
werden zu effektiven Berechtigungen normalisiert. Produktrollen werden vor den
Objekten wiederhergestellt; Eigentümer/ACLs werden nicht durch `--no-owner` oder
`--no-acl` verworfen. Eine Abweichung lässt den Test scheitern. Die Zusammenfassung
enthält nur Erfolg und Anzahlen, keine Zeileninhalte oder einzelnen Tabellen-Hashes.

Diese Migrations-Fixture prüft das tatsächliche SQL-Schema, keinen gehosteten Release
und nicht den API-Migrator selbst. Die vorhandene PostgreSQL-Integrationssuite prüft
separat den echten Anwendungsmigrator, Berechtigungen und Recovery-Abläufe.

## Sicherung, Vergleich und Lebenszyklus

```sh
python3 landing-zone-configurator/infra/recovery-lab/lab.py up
python3 landing-zone-configurator/infra/recovery-lab/lab.py status
python3 landing-zone-configurator/infra/recovery-lab/lab.py backup
python3 landing-zone-configurator/infra/recovery-lab/lab.py restore --backup backup-<reported-number>
python3 landing-zone-configurator/infra/recovery-lab/lab.py compare
python3 landing-zone-configurator/infra/recovery-lab/lab.py stop
python3 landing-zone-configurator/infra/recovery-lab/lab.py destroy --confirm-disposable-lab
```

`restore` akzeptiert nur eine prüfsummenverifizierte Sicherung aus dem eigenen
`.private/`-Verzeichnis. Neu erstellt wird ausschließlich `configurator_test` im
Dienst `restored`. Vor Containerzugriffen prüft der Controller Projekt-, Dienst-
und Verwaltungslabels. Destroy entfernt nur Container/Volumes dieses Compose-
Projekts und erhält private Sicherungsdateien. Stop erhält die Volumes. Der erste
Image-Download benötigt Zugang vom Docker-Host; Datenbankcontainer besitzen keine
externe Route.

Importiere keine Dev-/Kundensicherung in diese Fixture. Eine spätere Übung mit echten
Backups benötigt einen separat kontrollierten Import, Vertraulichkeitsmaßnahmen
und die Prüfung von Secret-/Artefaktreferenzen; kopierte wartende Jobs dürfen weder
starten noch Cloud-Ausführung ermöglichen. Ein Datenbank-Restore belegt nicht die
Wiederherstellung von Secrets Manager, S3-Artefakten oder des gesamten Dienstes.

## Deterministischer Abbruch ohne manuelles Zeitfenster

`interrupt.py` startet echtes gepinntes OpenTofu in einer privaten temporären Fixture
mit ausdrücklich aufgebauter Umgebung, ohne Provider-Downloads oder Cloud-Zugangsdaten.
Verwendet werden nur der eingebaute Terraform-Provider und lokale/Loopback-Daten:

1. **Plan:** Eine lokale HTTP-State-Fixture hält den Lesezugriff einer
   `terraform_remote_state`-Datenquelle an. Der Controller wartet, bis der laufende
   Plan diese Anfrage erreicht, beendet nur dessen neu angelegte Prozessgruppe,
   prüft das Ausbleiben eines ausführbaren gespeicherten Plans und erstellter
   Ressourcen, gibt die Fixture frei und prüft einen erfolgreichen frischen Plan.
2. **Apply:** Zunächst wird eine synthetische Baseline erfolgreich persistiert.
   Ein neuer geprüfter gespeicherter Plan erstellt eine zusätzliche synthetische
   `terraform_data`-Ressource und schließt danach eine lokale 21-Sekunden-Checkpoint-Stufe ab, bevor ein
   abhängiger Provisioner wartet. Erst ein neues State-Update nach dem Persistenzintervall
   löst einen Snapshot aus; bloßes Warten im unveränderten Provisioner genügt nicht. Der Controller wartet sowohl auf dessen Haltepunkt als auch auf den
   gespeicherten Checkpoint der ersten Ressource, beendet diese Prozessgruppe und
   führt einen frischen Plan und Apply aus. Die erhaltene Ressource muss unverändert
   bleiben und ihre ID behalten. Der alte gespeicherte Plan wird nicht erneut angewendet.

Der Apply-Test erlaubt 60 Sekunden für den beobachteten Checkpoint, statt sofortige
State-Persistierung anzunehmen. OpenTofu dokumentiert mindestens beziehungsweise
standardmäßig 20 Sekunden im [Umgebungsvariablen-Handbuch](https://opentofu.org/docs/v1.12/cli/config/environment-variables/#tf_state_persist_interval).
Kann der Phasen-/Checkpoint-Haltepunkt nicht hergestellt werden, scheitert der Test,
statt einen erfolgreichen Abbruch zu behaupten. Rohe synthetische Engine-Logs und
State bleiben im privaten temporären Verzeichnis und werden am Fixture-Ende entfernt.

Dies sind echte lokale Engine-Abbruchtests, **keine** Qualifikation eines gehosteten
Runner-Ausfalls, echter S3-Sperren, verlorener State-Schreibzugriffe, eines Cloud-
Abgleichs oder der abschließenden Job-Verarbeitung im Configurator. Dafür sind eigene
Laufzeittests an einer identifizierten entbehrlichen Application-Instanz nötig.
Aus diesem Fixture-Ergebnis folgt niemals ein Force-Unlock, Löschen von Kunden-State
oder Wiederholen eines unklar abgeschlossenen Cloud-Applies.

## Beobachtung eines gehosteten entbehrlichen Plans

`hosted_plan.py` verwendet eine bestehende private CF-CLI-Anmeldung für den
isolierten Space `lzc-dev-runners/plans`. Es meldet sich nicht als Application
Owner an, erstellt oder startet keine Jobs und liest oder entsperrt keinen State.
Die freigegebene entbehrliche Bestellung bleibt von funktionierenden Application-
Instanzen getrennt. Der Runner muss zuvor mit der zugehörigen Unterstützung für
`application_plan_observation` veröffentlicht worden sein. Ältere Pakete liefern
keine passende Beobachtung; der Controller läuft dann in sein Zeitlimit.

```sh
python3 landing-zone-configurator/infra/recovery-lab/hosted_plan.py \
  --cf /absolute/path/to/cf --cf-home /private/operator-cf-home \
  --runner-space <dev-runner-space-uuid> --runner-template <runner-template-uuid> \
  --instance <disposable-instance-uuid>
```

Standardmäßig wird ausschließlich gelesen. `CF_HOME` muss ein eigenes Verzeichnis
mit Modus `0700` sein, das auf die feste STACKIT-CF-API und den gewählten Runner-
Space zeigt. Der Controller prüft zusätzlich die tatsächliche Organisation, den
Space und das Template über CF. Er verfolgt begrenzte Log-Streams ausschließlich
von einmaligen oder warmen Runner-Apps und ignoriert andere Instanzen, ungültige
IDs, Meldungen vor dem Scharfschalten sowie über drei Sekunden alte Ereignisse.
Seine Umgebung übernimmt keine sonstigen Cloud-Zugangsdaten.

Die Organisations-, Space- und Template-Grenze wird einmal beim Scharfschalten
geprüft. Unmittelbar vor dem Stop prüft eine einzelne Abfrage erneut die genaue
Runner-App-GUID und ihren Space; einmalige Tasks benötigen zusätzlich die
eindeutig aktive Task. Eine ungeprüfte Grenze kann keinen Stop autorisieren.
Wiederholte Organisations-, Template- und vollständige App-Listen-Abfragen im
kurzen Plan-Zeitfenster werden gezielt vermieden. Der Worker beobachtet den
begrenzten ersten nativen Versionsdatensatz beim Schreiben seiner Datei; die
normale Ausgabeübertragung bleibt als Rückfall erhalten. Beide Mechanismen
verzögern den Plan nicht und ändern keine Eingaben. Private Nachweise enthalten
Zeitstempel für Absicht und Antwort zum Vergleich von tatsächlichem Stop und
nativem Abschluss.

Bei einem ausführbaren Template mit direkter Bereitstellung startet die normale
Bestelloberfläche automatisch den ersten Plan. Diesen Lauf beenden lassen und
sein Ergebnis prüfen. Für den Abbruchtest dieselbe entbehrliche Instanz verwenden:
zuerst den Beobachter scharfschalten, danach in ihrem Plan-Reiter erneut
**Cloud-Plan starten** wählen. Für diesen Plan-Test ist weder eine weitere
Bestellung noch ein Apply erforderlich. Ein vor dem Scharfschalten gestarteter
erster Plan gilt nicht nachträglich als Abbruchnachweis.

Den Testplan erst über die normale authentifizierte Oberfläche starten, wenn der
Beobachter `observer-ready` meldet. Es entstehen keine zusätzlichen Rechte oder
Umgehungen der Anmeldung. Für den separat freigegebenen Abbruchtest denselben
Befehl um `--confirm-disposable-stop <same-disposable-instance-uuid>` und
`--receipt /private/drill-evidence/new-stop.json` ergänzen.
Dieser Modus fordert höchstens einen Stop an: Er bricht die eindeutig aktive Task
des passenden einmaligen Jobs ab oder stoppt die passende einmalig verwendete
warme Runner-App. Er stoppt niemals das Template oder einen ganzen Pool. Beide
Modi verändern weder die Pool-Größe noch die SSH-Beschränkungen.

Das Nachweisverzeichnis muss ein eigenes privates Verzeichnis (`0700`) sein. Vor
jeder Stop-Anforderung erstellt der Controller exklusiv eine Datei mit Modus
`0600` und schreibt die genaue Instanz-, Job-, Runner- und gegebenenfalls Task-
Bindung als `stop-intent` dauerhaft auf den Datenträger. Nach der CF-Antwort wird
die Phase zu `stop-requested`. Bei unklarer Antwort bleibt die Absicht gespeichert.
Bestehende Dateien werden auch nach einem Prozessneustart niemals überschrieben.
Vor einem weiteren Versuch die gespeicherte Operation prüfen; den Nachweis nicht
löschen, um eine unklare Anforderung erneut zu versuchen. Die Datei enthält keine
Zugangsdaten, Plan- oder State-Werte.

Der Worker meldet ausschließlich begrenzte Kennungen und Zeitstempel, nachdem er
das native Versionsereignis von OpenTofu 1.12.6 in einem **laufenden, aktiven
Standard-Application-Plan** gesehen hat, sowie eine Abschlussmeldung. Drift-,
Destroy-, Apply- und Plattform-Jobs erzeugen diese Meldungen nicht. Native
Nachrichten, Eingaben, E-Mail-Adressen, Backend-Keys, Geheimnisse und State-Werte
gelangen nicht in diese strukturierten Operator-Ereignisse. Kennungen und Logs
bleiben private Betriebsnachweise und gehören nicht in öffentliche Issues.

Die Uhren des Operator-Systems und von CF müssen synchron sein. Bei schnellen
Plänen können Log-Zustellung und CF-Abbruch zu spät kommen. Eine veraltete
Beobachtung oder eine bereits empfangene Abschlussmeldung verhindert den Stop.
`window-missed`, Zeitlimit oder eine verletzte Grenze sind kein eindeutiger
Nachweis. Auch `stop-requested` meldet **keine Recovery-Qualifikation**: Das
tatsächliche Runner-Ende, das serverseitige Job-Ergebnis, vorhandener State und
Lock sowie das Verhalten eines neuen Plans müssen separat geprüft werden. Die
Meldung beweist nicht, dass die native Engine noch lief, als CF den Abbruch
verarbeitete. Einen abgeschlossenen Plan oder eine bloße Stop-Anforderung niemals
als erfolgreichen Abbruchtest zählen. Apply-/Checkpoint-Tests benötigen einen
separaten Controller und werden mit diesem Tool nicht aktiviert.

## Expliziter nativer Plan-Wartepunkt nur für Dev

Für Plans, die schneller als Log-Zustellung und CF-Abbruch sind, bereitet
`held_plan.py` einen entbehrlichen warmen Runner mit begrenztem Prozess-Wartepunkt
vor. Dies ist ein instrumentierter Abbruchtest, keine Messung normaler
Plan-Laufzeiten. Er umgeht keine UI/API-Ausführungsberechtigung und verändert
weder native Eingaben noch Backend oder gespeichertes Planformat. Normale Jobs
haben keine Wartekonfiguration und laufen unverändert.

Der Worker akzeptiert `LZC_RECOVERY_PLAN_HOLD` ausschließlich in der festen
Dev-Foundation, im Web-Prozess von `lzc-dev-runners/plans`, ohne öffentliche
Routen, für die exakte CF-App, den Space und die Testinstanz sowie mit einem
Ablauf innerhalb von 15 Minuten. Apply, Plattform, Drift, Destroy, lokale
Ausführung und andere Instanzen können den Wartepunkt nicht aktivieren. Beim
ersten nativen Versionsereignis sendet er `SIGSTOP` nur an seine eigene gestartete
Prozessgruppe, prüft den von Linux gemeldeten Halt sowohl des Shell-Gruppenleiters
als auch seines echten nativen `tofu plan` in derselben Gruppe und meldet
`native-plan-held`. Die Foundation liefert verkürzte `CF_INSTANCE_GUID`-Werte
im Hexadezimalformat `8-4-4-4-4`. Diese Laufzeit-Instanzprüfung akzeptiert auch
vollständige GUIDs im Format `8-4-4-4-12`; App-, Space- und Bestell-IDs müssen
weiter UUIDs sein und `VCAP_APPLICATION.process_type` muss `web` bleiben.
Task-Metadaten können den Wartepunkt nicht aktivieren.
Nach 30 Sekunden oder beim Aufräumen des Befehls setzt
er automatisch fort. Frei einstellbare Verzögerungen oder Shell-Befehle werden
nicht angenommen. Siehe die offiziellen
[CF-Laufzeitmetadaten](https://docs.cloudfoundry.org/devguide/deploy-apps/environment-variable.html).

Die Vorbereitung benötigt zwei getrennte private CF-Anmeldungen: den bestehenden
begrenzten Runner-Zugang und den Dev-App-Manager mit Ziel `lzc-dev/configurator`.
Eine eigene private JSON-Datei mit Modus `0600` enthält ausschließlich
`LZC_DATABASE_HOST`, `LZC_DATABASE_PORT`, `LZC_DATABASE_NAME`, `LZC_DATABASE_USER`
und `LZC_DATABASE_PASSWORD` der bestehenden Dev-Migrationsidentität. Das Werkzeug
prüft das Ziel gegen die laufende API. Zugangsdaten gehören nicht in Chat,
Issues oder Shell-Historie. Beide CF_HOME-Verzeichnisse müssen dem Operator
gehören und privat sein (`0700`).

```sh
python3 landing-zone-configurator/infra/recovery-lab/held_plan.py \
  --cf /absolute/path/to/cf --cf-home /private/runner-cf-home \
  --app-cf-home /private/app-manager-cf-home \
  --migration-vars /private/dev-migration.json \
  --runner-space <dev-runner-space-uuid> --runner-template <runner-template-uuid> \
  --instance <disposable-instance-uuid> \
  --confirm-disposable-hold <same-disposable-instance-uuid> \
  --receipt /private/drill-evidence/new-preparation.json
```

Das Werkzeug prüft zuerst die installierte Wartepunkt-Unterstützung. Eine
temporäre Task-App ohne Route nutzt die Migrationsidentität, um atomar einen
frischen, unzugeordneten, bereiten Pool-Slot der exakten Quelle zu reservieren
und seinen Ticket-Hash zu wechseln. Der alte Worker kann ihn nicht erneut
beanspruchen. Erst dann stoppt es diese unzugeordnete App, ergänzt das neue Ticket
und die ablaufende Wartekonfiguration in ihrer Umgebung und startet sie. Bevor es
Erfolg meldet, muss der normale Broker mit dem neuen Ticket Bereitschaft
bestätigen. CF-Umgebungsänderungen gelten nach dem Neustart; die übrige Umgebung
bleibt durch die
[CAPI-Zusammenführung](https://v3-apidocs.cloudfoundry.org/version/3.226.0/index.html#update-environment-variables)
erhalten. Die warme App nutzt ein kopiertes Droplet mit eigener GUID. Die Vorbereitung
prüft seinen Zustand `STAGED`, die genaue App-Zuordnung und den gültigen
SHA-256-Inhalt gegen die unveränderliche Template-Quelle; die Broker-Quellbindung
bleibt die GUID des Template-Droplets. Beide GUIDs und die Prüfsumme bleiben
privat im Vorbereitungsnachweis erhalten.
Die temporäre privilegierte Task-App wird beim Verlassen gelöscht.
Fehlende Bereitschaft bleibt ungeklärt; die zweiminütige Warming-Lease läuft
über die normale Wartung ab. Nach einem unklaren Nachweis keine Mutation
wiederholen: zuerst aufgezeichnete Phase und exakte App/Lease prüfen.
Ein Vorbereitungsnachweis allein autorisiert keinen Plan.

Nach erfolgreicher Vorbereitung den Beobachter vor dem Plan scharfschalten:

```sh
python3 landing-zone-configurator/infra/recovery-lab/hosted_plan.py \
  --cf /absolute/path/to/cf --cf-home /private/runner-cf-home \
  --runner-space <dev-runner-space-uuid> --runner-template <runner-template-uuid> \
  --instance <disposable-instance-uuid> --require-held-plan \
  --confirm-disposable-stop <same-disposable-instance-uuid> \
  --receipt /private/drill-evidence/new-stop.json
```

Auf `observer-ready` warten, dann genau einen neuen Plan über die authentifizierte
UI starten. Andere Jobs sollten den vorbereiteten Standby nicht belegen: Eine
fremde Instanz läuft normal; danach muss dieser Test erneut vorbereitet werden.
Der Held-Modus ignoriert gewöhnliche native Startmeldungen, akzeptiert einen
bestätigten Halt höchstens 15 Sekunden lang und verweigert freigegebene oder
beendete Plans. Ein verpasstes Zeitfenster bleibt ungeklärt. Vor einer
Recovery-Qualifikation tatsächlichen Prozessverlust, dauerhaften Jobstatus,
State-/Lock-Zustand und einen frischen Plan derselben Bestellung getrennt prüfen.
Ein Halt beim Versionsereignis beweist insbesondere weder Backend-Sperre noch
Wiederherstellung einer verwaisten Sperre. Darauf niemals ein Force-Unlock oder
die Wiederholung eines unklaren Apply stützen.

Lokale Tests verwenden das echte festgelegte OpenTofu mit einer synthetischen
Loopback-State-Lesebarriere, um bestätigten Prozesshalt, automatisches/manuelles
Fortsetzen und harten Abbruch ohne Cloud-Zugangsdaten nachzuweisen. Release- und
Validierungs-CI führen sie explizit mit `LZC_TEST_TOFU_BIN` aus; normale Unit-Läufe
überspringen die nativen Fälle ohne diese Variable. PostgreSQL-Integrationstests
prüfen das echte Lease-SQL, den Ticketwechsel sowie die Ablehnung zugeordneter
Slots und fremder Quellen.

## CI

Der Job `Isolated recovery lab` in **Validate Configurator** führt Isolationstests,
Datenbank-Restore und native Abbruch-Fixture ohne Cloud- oder Model-Serving-Zugangsdaten
aus. Die Bereinigung läuft auch bei Fehlern. Sicherungen und rohe Engine-Logs werden
nicht als öffentliche CI-Artefakte hochgeladen. [#90](https://github.com/stackitcloud/stackit-landing-zone/issues/90)
und [#95](https://github.com/stackitcloud/stackit-landing-zone/issues/95) beschreiben
die weitergehenden Grenzen der Betriebsabnahme.

## Grenze bei anfänglich leerem lokalen State

Die First-Apply-Variante erzeugte mit OpenTofu 1.12.6 wiederholt einen unvollständigen
Zwischencheckpoint: Eine zuvor fertiggestellte Ressource fehlte, während die spätere
Checkpoint-Stufe enthalten war. Dieser Fall bleibt unter [#140](https://github.com/stackitcloud/stackit-landing-zone/issues/140)
unqualifiziert. Der reguläre Apply-Test deckt ausdrücklich vorhandenen State ab
und verlangt weiterhin, dass die im unterbrochenen Apply neu erstellte Ressource
unverändert erhalten bleibt. Er qualifiziert nicht den Fall mit anfänglich leerem
State. Eine optionale Diagnose reproduziert den separaten Befund und liefert einen
Fehlerstatus, wenn eine fertiggestellte Ressource fehlt:

```sh
python3 landing-zone-configurator/infra/recovery-lab/interrupt.py --tofu /absolute/path/to/tofu --first-apply-diagnostic
```

Übertrage den Befund des lokalen Backends nicht auf HTTP/S3 oder regulär abgeschlossene
Applies. Dafür sind eigene Tests nötig; Engine und State werden nicht stillschweigend geändert.

## Protokoll-Fixtures für Remote-Backends

`remote_interrupt.py` prüft die echten HTTP- und S3-Backend-Implementierungen von
OpenTofu gegen getrennte Loopback-Dienste im Arbeitsspeicher. Der Test startet ohne
Workload-Ressourcen, beobachtet einen Checkpoint mit beiden fertiggestellten Ressourcen,
beendet seine Apply-Prozessgruppe hart und prüft, dass ein nachfolgender Plan wegen
der verbliebenen Sperre abgelehnt wird. Erst nach bestätigtem Prozessende wird die
Sperre ausschließlich aus der In-Memory-Fixture entfernt. Ein frischer Plan/Apply
muss die erstellte Ressource und ihre ID erhalten.

```sh
python3 landing-zone-configurator/infra/recovery-lab/remote_interrupt.py --tofu /absolute/path/to/tofu
```

Mit `--backend http` oder `--backend s3` wird ein Fall gewählt; standardmäßig laufen
beide. Die S3-Fixture implementiert bedingtes Anlegen der Sperre und verwendet nur
Dummy-Zugangsdaten. Die HTTP-Fixture prüft beim regulären Unlock die Sperridentität.
Diese Tests qualifizieren weder die STACKIT-Authentifizierung noch Eventual Consistency,
echte Cloud-Sperren oder gehostete Worker-Reconciliation. Das Entfernen einer
Fixture-Sperre ist kein Force-Unlock-Werkzeug für den Betrieb.

Beide Protokollfälle erhielten die fertiggestellten Ressourcen bei anfänglich leerem
State; die Grenze des lokalen Dateibackends in #140 bleibt getrennt. S3-Init kann vor
dem ersten Ressourcen-Apply bereits ein leeres State-Objekt anlegen. Ergebnisse eines
Backends werden nicht auf ein anderes übertragen. CI führt beide Fixtures ohne
Cloud-Zugangsdaten oder öffentliche rohe State-/Log-Artefakte aus.

## Gehosteten entbehrlichen Apply am Checkpoint beobachten

Der getrennte Apply-Test verwendet `hosted_apply.py` mit Python 3 und einem
ausdrücklich konfigurierten boto3-/S3-Operator-Profil. Er unterstützt ausschließlich
die feste Dev-CF-Foundation, den Space `lzc-dev-runners/plans` und STACKIT eu01 S3.
Stelle zuerst den Diagnose-Endpunkt für unterbrochene Applies bereit. Verwende
einen neuen, geprüften regulären Plan aus der aktuellen Runner-Quelle für eine
ausdrücklich freigegebene entbehrliche Bestellung ohne bisherigen Apply. Nur
Anlegeaktionen sind zulässig. Im exakten Backend dürfen anfangs weder State noch
Sperre liegen. Jedes vorhandene Objekt, auch leerer State, benötigt einen
getrennten Abgleich.

Der Besteller startet Apply über die normale authentifizierte Oberfläche, sobald
beide Beobachter bereit sind. Der Controller erzeugt keine Bestellung oder
Benutzer-Session, startet keinen Job und erteilt keine Apply-Freigabe. Normale
Runner-Befehle und Eingaben bleiben unverändert; es gibt keinen Apply-Delay oder
Pause-Hook.

`apply_candidate.mjs` läuft in einer kurzlebigen Dev-Diagnose-App ohne Route, die
aus der bereitgestellten API kopiert wird. Übergib ausschließlich die vorhandene
Migrations-Datenbankidentität und eine private `LZC_RECOVERY_DRILL`-JSON-Konfiguration
mit `binding`, `startedAt` und `expiresAt` für höchstens 15 Minuten. Vor dem
Datenbankzugriff prüft das Skript seine tatsächliche CF-Organisation, Space/App-
Bezeichnung und fehlende Routen. Jeder Poll verwendet eine eigene Transaktion
`BEGIN READ ONLY` mit zwei Sekunden Statement-Timeout. Während der Wartezeit bleibt
keine Transaktion offen. Die Vorprüfung verlangt einen unbenutzten, nicht
abgelaufenen gespeicherten Plan derselben Runner-Quelle mit reinen Anlegeaktionen.
Die Abfrage bindet den neuen Apply an Plan, Mandanten, Bestellung, Backend,
gültige Freigabe, verbrauchtes Ticket, Claim und erfassten Runner. Nur Kennungen,
Bindungs-Hashes, Phase und Zeitstempel verlassen den Task. Private Pläne, State
und Zugangsdaten dürfen nicht in öffentliche Logs gelangen.

Eine Operator-Brücke verfolgt ausschließlich den Logstream dieses exakten
Diagnose-Tasks, prüft dessen begrenzte JSON-Datensätze und ersetzt atomar eine
private Kandidatendatei mit Modus `0600`. Auch Idle- und terminale Datensätze
müssen den vorherigen Kandidaten ersetzen; bewahre keinen veralteten `applying`-
Datensatz auf. Die CLI verwirft unabhängig davon Beobachtungen älter als drei
Sekunden und Applies, die vor dem Scharfschalten angelegt wurden. Verwende eigene
private Verzeichnisse und neue Nachweispfade. Beende die Brücke und entferne die
Diagnose-App in einem `finally`-Block; bestätige vor einem weiteren Test die
abgeschlossene Löschung.

```sh
node --test landing-zone-configurator/infra/recovery-lab/apply_candidate.test.mjs
python3 landing-zone-configurator/infra/recovery-lab/hosted_apply.py \
  --cf /absolute/path/to/cf --cf-home /private/runner-cf-home \
  --runner-space <dev-runner-space-uuid> --runner-template <runner-template-uuid> \
  --instance <disposable-instance-uuid> --binding /private/reviewed-binding.json \
  --snapshot /private/current-candidate.json --s3-profile <operator-profile>
```

Die geprüfte Bindung enthält `version:1`, `instanceId`, `tenantId`, `planId`,
`runnerSpace`, `runnerTemplate`, `sourceDropletId`, `backendSha256`, `creates` und
den exakt registrierten S3-Deskriptor `backend`. Erzeuge sie durch lesenden
Abgleich des gespeicherten Plans/Backends, nicht aus Browser-Behauptungen. Sie
enthält keine Zugangsdaten. Standardmäßig beobachtet die CLI nur. Für genau einen
gezielten Stop kommen `--confirm-disposable-stop <same-instance-uuid>` und
`--receipt /private/new-stop.json` hinzu.

Vor dem Stop verlangt die CLI wiederholt identische State-/Sperrlesungen: einen
State-Vertrag dieser Bestellung, ein fertig angelegtes Cloud-Projekt, gespeicherte
Cloud-Ressourcen, weniger verwaltete Ressourcen als geplante Anlegeaktionen sowie
eine neue native OpenTofu-1.12.6-Apply-Sperre am exakten Backend-Key. Tainted/
deposed-State, fremde oder geänderte Checkpoints, fertiger State und fehlende oder
nicht lesbare Beobachtungen können keinen Stop auslösen. CF prüft die exakte
App/Quellkopie ohne Route und den einzelnen laufenden Warm-Prozess beziehungsweise
eindeutigen Einmal-Task. Ein letzter aktueller Job-/Checkpoint-Abgleich geht dem
dauerhaft gespeicherten, exklusiven Stop-Intent voraus. Eine unklare Antwort wird
nicht erneut ausgeführt. Der Controller besitzt keine Schreib-/Löschoperation
für State oder Sperren.

Ein Apply kann vor einem geeigneten Teil-Checkpoint oder während der CF-Stop-
Verarbeitung fertig werden. Eine Stop-Anforderung allein qualifiziert weder
Unterbrechung noch Wiederherstellung. Prüfe unabhängig das Prozessende, dauerhaften
Job-/Ergebnisstatus sowie State/Sperre und gleiche Cloud-Ressourcen ab, bevor eine
Recovery-Freigabe erfolgt. Behalte dieselbe Bestellung. Die neue UI-Aktion
**Unterbrochenen Apply prüfen** erfasst nur einen ungeklärten Abschluss und
schließt alte Broker-Meldungen. Sie gleicht weder Cloud noch State ab, entfernt
keine Sperre und genehmigt keinen neuen Plan oder Apply. Eine verwaiste Sperre
benötigt nach diesem Abgleich eine separate ausdrückliche Operator-Entscheidung
für genau diese Sperre.
