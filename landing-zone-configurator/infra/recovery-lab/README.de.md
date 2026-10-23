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

Einen Plan erst über die normale authentifizierte Oberfläche starten, wenn der
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
