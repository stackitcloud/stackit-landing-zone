<a id="cf-application-release"></a>

# CF-Anwendungsrelease

[English](README.md) | [Deutsch](README.de.md)

`.github/workflows/configurator-release.yml` baut und testet die Anwendung,
paketiert Produktionsabhängigkeiten und die per Prüfsumme gepinnte Node-24.21.0-Linux-Runtime
und deployt dasselbe Archiv mit expliziten `cf`-CLI-Befehlen. Das CF-Node-Buildpack
bietet derzeit eine ältere Node-Version an; deshalb verwenden Anwendung und Runner das
finale Binary-/Image-Buildpack des Repositorys, gepinnt auf den exakt freigegebenen Release-
Commit. Seine CF-Einstiegspunkte liegen im Repository-Verzeichnis `bin`; die Finalisierung
verwendet die bereits paketierte Node-Runtime, keine von der Plattform gewählte Node-Version.
Die reine Migrationsanwendung behält `binary_buildpack`.
Bei einem Node-Upgrade Version und Prüfsumme gemeinsam aktualisieren. Der CF-Stack bleibt
plattformseitig gepflegt (`cflinuxfs4`).

<a id="manual-development-release-in-github"></a>

## Manueller Entwicklungsrelease in GitHub

Kein Push oder Merge deployt den Configurator. Auf der **Actions**-Seite
des Repositorys **Configurator Release** und dann **Run workflow** auswählen:

1. Branch **main** auswählen.
2. **build_only** nicht anhaken (`false`).
3. **release_run_id** für einen neuen Release leer lassen.
4. **runner_pool_size** auf `1` für einen vorbereiteten Einmal-Runner in Dev oder
   auf `0` zum Deaktivieren/Abbauen des Pools setzen. Standard ist `0`; zulässig
   sind `0`–`4`. Jede Reserve benötigt zusätzlich zu aktiven Aufträgen 1 GiB RAM
   und ein Disk-Budget von 4 GiB.
5. Für normale Releases **release_mode=qualified** beibehalten und den Workflow
   starten. Er qualifiziert den echten Assistant, baut und testet beide
   Pakete und erstellt anschließend den geschützten, quellgebundenen Buildpack-Tag.
6. Wenn **deploy** auf Prüfung wartet, über **Review deployments** das
   Environment **lzc-dev-release** mit einem autorisierten Prüferkonto freigeben.
7. Auf den Erfolg des gesamten Laufs warten, einschließlich Runner-Isolation, Engine-Prüfungen,
   Datenbankmigrationen, Dienstverbindungen und Prüfungen der öffentlichen Route.
   Bei warmem Pool prüft der Release außerdem die einmalige Übernahme eines
   absichtlich nicht berechtigten Auftrags, entfernt diesen Runner und wartet auf
   dessen bereiten Ersatz. Es wird kein Kunden-Plan/-Apply ausgeführt. Eine
   fehlgeschlagene Pool-Prüfung lässt das Deployment scheitern; erhalten bleiben
   begrenzte Zeitmesswerte für Zuweisung, Übernahme und Ersatz, keine Rohlogs.

Ziel ist die bestehende Entwicklungsanwendung, keine Produktionsumgebung.
Die ausgewählte `main`-Revision bis zum Abschluss der Tag-Veröffentlichung unverändert lassen:
Ein überholter Branch-HEAD wird abgelehnt, statt stillschweigend eine andere
Revision zu deployen. Bei einem gewöhnlichen neuen Release weder Repository-Token-Rechte
erweitern noch Tags manuell erstellen.

Für „jetzt bauen, später deployen“ **build_only** anhaken. Qualifizierung, Paketierung und Tag-
Veröffentlichung laufen weiterhin, aber es findet kein Cloud-Deployment statt. Später einen **neuen**
manuellen Lauf auf `main` starten, **build_only** nicht anhaken und die ursprüngliche
numerische Build-Run-ID unter **release_run_id** eintragen. Damit wird exakt das qualifizierte
Artefakt promoviert, ohne Qualifizierung/Build zu wiederholen oder einen historischen Commit zu taggen;
es wird nicht der neueste Anwendungsquellstand ausgewählt. Das ursprüngliche Artefakt muss
noch vorhanden und darf nicht abgelaufen sein.

Nach einem reinen Deployment-Fehler kann eine neue Promotion den erfolgreichen
qualifizierten Build ebenso wiederverwenden. Nicht **Re-run jobs** verwenden: Release-Versuche
nach dem ersten werden abgelehnt. Vor einem weiteren Lauf den tatsächlichen Fehler prüfen;
Fehler bleiben erhalten, und der Workflow führt keine automatische Deployment-
Wiederholung durch. Historische Artefakte ohne Buildpack-Tag benötigen den unten beschriebenen
ausdrücklichen Operator-Backfill, keine Umgehung des Schutzes.

<a id="image-staging-and-caching"></a>

### Image-Staging und Caching

Hosted-Archive lassen ausschließlich das gepinnte `firewall-image.qcow2` aus; lokale Runner-
Archive bleiben eigenständig vollständig. CI qualifiziert zunächst das vollständige imagegestützte Paket,
extrahiert dann beide schlanken Archive, stellt das Image über den tatsächlichen Buildpack-
Einstiegspunkt wieder her und prüft bytegenaue Runner-Gleichheit sowie dieselbe Paketidentität.
Jedes komprimierte CF-Archiv muss kleiner als 384 MiB sein.

`prepare-release.mjs` bindet `LZC_IMAGE_BUILDPACK` an
`lzc-image-buildpack-<approved-source-sha>`, auch bei Promotion.
Der Git-Buildpack-Loader von CF verwendet `git clone -b`; eine reine Commit-SHA ist deshalb
keine unterstützte Referenz. Nach Qualifizierung/Build erstellt der isolierte
Job `publish_buildpack` des manuellen Release-Workflows den Lightweight-Tag am freigegebenen
Commit, solange dieser noch HEAD des gewählten Branches ist, auch in
`build_only=true`-Läufen. Er prüft zunächst
den aktiven Schutz und verwendet einen bestehenden Tag nur wieder, wenn dieser
exakt auf diesen Commit auflöst. Er aktualisiert oder löscht niemals einen Tag.
Das aktive Repository-Regelwerk **Protect LZC buildpack
tags** verbietet Updates und Löschung in diesem Namensraum, ohne Bypass-Akteure.
Das nur lesende Deployment-Gate prüft den exakt aufgelösten Commit und den aktiven
Namensraum-/Regelschutz vor dem Lesen von Deployment-Zugangsdaten. Nur der
Veröffentlichungsjob hat `contents: write`; er hat kein Cloud-Environment und keine Cloud-
Zugangsdaten und führt Helfer aus dem manuell ausgewählten Workflow-Quellstand aus,
nicht aus dem Quellstand des promovierten Artefakts. Der Deployment-Job behält `contents: read`
und die geschützte Freigabe für `lzc-dev-release`.
Promotion überspringt den schreibfähigen Veröffentlichungsjob und verlangt den
bestehenden exakten geschützten Tag des Builds. Dem normalen `GITHUB_TOKEN` kann kein
`workflows: write` gewährt werden, das GitHub zum Erstellen von Tags an historischen Commits verlangen kann;
umfangreichere Repository-Standardrechte lösen diese Einschränkung nicht.
Historische qualifizierte Artefakte ohne Tag benötigen einen ausdrücklich autorisierten
Operator-Backfill: zuerst ihren Quellstand mit `release-artifact.mjs source` validieren,
dann `buildpack-source.mjs publish` mit exakt der zurückgegebenen Revision und
Operator-Authentifizierung ausführen. Den Operator-Token niemals in CI hinterlegen oder den Tag-
Schutz deaktivieren. Ein Tag-Backfill führt kein Deployment durch.
Ältere Binary-Buildpack-Artefakte überspringen Tag-Veröffentlichung und -Prüfung.
Die privaten App-/Runner-Variablendateien
stellen diese URI ihren Manifesten bereit. Beim Staging liest das finale Buildpack
den kompilierten Image-Pin und die validierten Runner-Metadaten, lädt das öffentliche Image
direkt aus STACKIT Object Storage und prüft die vollständige SHA-256. Sein privater,
digestbasierter Staging-Download wird bei jeder Verwendung geprüft; fehlerhafte Bytes, Links oder
Capability-Abweichungen lassen das Staging scheitern. Ein Cache-Miss lädt in eine eindeutige temporäre
Datei, prüft diese und veröffentlicht sie atomar. Es sind keine Tenant-Zugangsdaten beteiligt.
Der geprüfte Download wird atomar in die Anwendung verschoben, nicht kopiert oder
als zweites großes Build-Artefakt aufbewahrt. Eine gewöhnliche Kopie erschöpfte das Staging-
Dateisystem bei der Droplet-Komprimierung; ein Hardlink ließ diese durchlaufen, aber das
zusätzliche CF-Build-Cache-Archiv erschöpfte es weiterhin. Das unveränderliche Droplet ist der
dauerhafte Image-Cache. Ein neues Staging lädt das Image einmal; Jobs tun dies nie.
Dateisystemübergreifende Verschiebungen scheitern ausdrücklich, statt das Image stillschweigend zu duplizieren.
CI prüft für beide Hosted-Archive dasselbe Gerät/dieselbe Inode und das Entfernen der temporären Quelle.
Lokale Paketierung behält ihren Digest-Cache und unabhängige Kopien.

Das finalisierte Droplet enthält die gewöhnliche Image-Datei an ihrem ursprünglichen nativen
Pfad. Runtime-Einstiegspunkte und Jobs laden keine Images herunter. CF speichert das Droplet
und verwaltet seine Verteilung/seinen Cache auf Ausführungszellen; eine kalte Zelle kann
dieses Droplet intern abrufen. Im Buildpack-Cache pro App wird kein redundantes großes Image
aufbewahrt, und kein veränderlicher Tenant-Workspace wird geteilt. Die Inspektionskopie der API
wird identisch finalisiert. Die Migration inspiziert den Runner nicht und führt ihn nicht aus
und stellt deshalb ihr ungenutztes Inspektionsimage nicht wieder her.

Dies vermeidet den beobachteten CF-API-Uploadfehler: HTTP 502 nach 900 Sekunden bei
601.91 von 926.12 MiB, ohne die Image-Prüfung abzuschwächen, veränderliche Job-Dateien
zu teilen oder ein konfiguriertes höheres Uploadlimit zu behaupten.
Die Web-/API-App verwendet 6144 MiB Festplatte: Ihre zusätzliche Inspektionskopie erschöpfte
bei der Droplet-Komprimierung die vorherigen 4096 MiB Staging-Festplatte selbst nach Entfernung
des redundanten Image-Caches. Runner-Template und isolierte Job-/Task-Budgets bleiben bei
4096 MiB; das gemessene native Runner-Runtime-Budget bleibt unverändert.
Scheitert Runner-Staging, meldet der Release zusätzlich Status und Fehler des neuesten V3-Builds
sowie aktuelle Runner-Logs, weiterhin auf den isolierten Runner-Space begrenzt.
Runner- und Web-/API-Diagnosen lesen beide das mit dem fehlgeschlagenen Build verknüpfte Droplet,
nicht das aktuelle (möglicherweise noch gesunde) Droplet der Anwendung, und melden dessen
Status, Fehler und Zeitstempel. Ein generischer Build-`StagingError` kann den spezifischeren
Droplet-Fehler `StagingTimeExpired` verdecken, selbst nachdem der Lifecycle mit null endet
und einen abgeschlossenen Droplet-Upload protokolliert. Eine vorhergehende Meldung über fehlendes Buildpack-`config.yml`
ist allein kein Fehlernachweis: Der Lifecycle meldet sie ohne
zu scheitern, und auch erfolgreiche Releases haben sie ausgegeben. Build- und
Droplet-Status vor Buildpack-Codeänderungen oder Wiederholungen prüfen. `CF_STAGING_TIMEOUT`
steuert nur die Wartezeit der CLI; es verlängert keinen plattformseitigen Timeout.
Lässt die Plattform das Staging-Ergebnis ablaufen, Build-/Droplet-Kennungen
und Zeitstempel für die Untersuchung durch Operator/Provider aufbewahren. Image-
Prüfung nicht abschwächen, geschützte Quell-Tags nicht umhängen und keine automatischen Deployment-Wiederholungen ergänzen.
So bleiben Lifecycle-/Cache-Uploadfehler von der Buildpack-Image-Prüfung unterscheidbar.
Fehlgeschlagenes Web-Staging meldet nur Staging-Logeinträge (`STG`),
niemals Router-/Callback-Logs, die OAuth-Codes enthalten könnten, sowie V3-Staging-Limits.

`manifest.yml` verwaltet Anwendung, Route, Prozessgröße, Health Check und Backend-
Umgebungsbindungen. OpenTofu verwaltet CF-Org/-Space/-Rollen und Backend-Dienste;
es verwaltet nicht zusätzlich die Anwendung. Der Plan-Runner wird separat in `lzc-dev-runners/plans` ohne Anwendungs-Service-Bindungen gestaged.

Das geschützte Environment `lzc-dev-release` enthält Workload-S3-Zugangsdaten und
Plattform-/Runtime-State-Schlüssel. Dem Release-Workflow wird kein Projekt-Service-Account-Schlüssel
übergeben. `tofu output -json` schreibt private Dateien; `prepare-release.mjs`
extrahiert nur ausdrücklich erlaubte Backend-Variablen und maskiert sie. `cf push`
verwendet eine private Variablendatei und `--redact-env`; weder Zugangsdaten noch entschlüsselte
States sind im Anwendungsartefakt enthalten. Die App erhält nur ihre eigenen
PostgreSQL-/Secrets-Zugangsdaten, den Operator-Model-Serving-Token und die GitHub-
App-OAuth-Client-Zugangsdaten. Der Benutzer hat deren Übertragung nach
`lzc-dev-release` und in CF-Backend-Variablen am 2026-09-30 ausdrücklich freigegeben. `LZC_AUTH_ENABLED=true`
aktiviert die Anmeldung; das Client-Secret gelangt niemals in den Frontend-Build.

STACKIT wird zur primären Anmeldung, wenn das geschützte Environment sowohl
`LZC_STACKIT_DEVICE_ENABLED=true` als auch `LZC_AUTH_ENABLED=true` setzt. Der ältere
Name `DEVICE_ENABLED` ist ein Provider-Schalter, kein Selektor der Authentifizierungsmethode.
Lokaler und Hosted-Start verwenden dieselbe Implementierung `configuredStackitFlow`.
Das geschützte Environment liefert die explizite PKCE-Konfiguration:

| Variable | Hosted-Konfiguration |
| --- | --- |
| `LZC_STACKIT_AUTH_FLOW` | `authorization-code` |
| `LZC_STACKIT_CLIENT_ID` | Registrierter öffentlicher Web-Client mit PKCE-Unterstützung |
| `LZC_STACKIT_REDIRECT_URI` | Öffentlicher Origin gefolgt von `/auth/stackit/callback` |

`LZC_ASSISTANT_ENABLED=true` im geschützten Environment setzen, um den
authentifizierten Assistant und die Template-Beratung in der Hosted-API zu aktivieren. Workflow,
Release-Vorbereitung und Manifest reichen dieses Opt-in an CF weiter; standardmäßig bleibt es deaktiviert,
und die Release-Vorbereitung lehnt die Aktivierung ohne Authentifizierung ab.
Der bestehende Runtime-Model-Serving-Token bleibt ausschließlich im Backend.

Sowohl den Anmelde- als auch den HTTPS-Callback `/auth/stackit/proof-callback` bei diesem
Client registrieren. Die Callbacks müssen zum konfigurierten `LZC_PUBLIC_ORIGIN` gehören; Query-
Strings, Fragmente und eingebettete Zugangsdaten werden abgelehnt. Es gibt keinen stillen
Fallback auf Device Flow. `LZC_STACKIT_CLI_CLIENT_APPROVED` erlaubt nur ausdrücklich
die lokale Wiederverwendung des CLI-Clients: Dieser Client bleibt auf Loopback-Anwendungen
und seine registrierten localhost-Ports begrenzt. Ein Hosted-Web-Client benötigt keine CLI-Freigabe.
Der lokale Entwicklungshelfer liefert Loopback-Defaults und ein Callback-Relay;
er wählt keine andere PKCE-Implementierung.

Der erfolgreiche Provider-Wechsel am 2026-10-07 verwendete Device Flow und qualifizierte
deshalb Hosted-PKCE nicht. Ein registrierter Web-Client und beide HTTPS-Callbacks sind
vor dem Deployment dieser Version erforderlich. Die Release-Vorbereitung validiert die tatsächliche
Konfiguration des kompilierten Artefakts vor dem ersten CF-Staging, und die Prüfungen öffentlicher Routen
verlangen neben dem primären Provider auch `stackitFlow: "authorization-code"`.
GitHub bleibt eine optionale Repository-Verbindung. GitHub-Zugangsdaten sind im
STACKIT-Modus optional, müssen bei aktiviertem Repository-Zugriff aber als vollständiges Paar
konfiguriert sein. Alle fehlenden versionierten Migrationen laufen vor dem Start der neuen Anwendung.
Bestehende GitHub-Benutzer vor dem Wechsel ihrer Anmeldung über eine gültige Session binden;
es gibt keine automatische Kontenzusammenführung per E-Mail.

Für diesen Entwicklungsmeilenstein ist die CF-Deployment-Identität weiterhin der bestehende
Org-Manager mit expliziter Space-Developer-Mitgliedschaft, und der Release liest Plattform-
State. Ein dedizierter, auf den Space begrenzter Deployer und enger begrenzte State-/Credential-Veröffentlichung
sind vor Produktion erforderlich. CF-Umgebungsvariablen sind für autorisierte
Space-Developer sichtbar; diese Rollen einschränken und auditieren. Nicht authentifizierte
Anfragen an geschützte API-Routen bleiben abgewiesen. Die GitHub-Anmeldung verwendet serverseitige
opake Sessions; siehe [Anmeldearchitektur und Abnahme](../../docs/github-login.de.md).

Nach dem Push führt ein CF-Task PostgreSQL-Authentifizierung, eine Abfrage mit geprüftem TLS
und Secrets-Manager-Authentifizierung sowie ein GET auf den reservierten Operator-Probe-Pfad
`configurator/connectivity-probe` durch. Anonymer Zugriff muss abgewiesen werden; authentifizierter
Zugriff darf für den fehlenden Schlüssel 404 liefern. Es werden keine Tenant-Secrets gelesen oder geschrieben.
Bei aktivierter Anmeldung schreibt und liest der Task zusätzlich einen
zufälligen Probe-Schlüssel, löscht ihn dauerhaft und prüft anschließend seine Abwesenheit. Die Runtime-Identität hat ausdrücklich
genehmigten Schreibzugriff auf die dedizierte Configurator-Secrets-Manager-Instanz. Diagnoselogs zeigen nur
Dienstnamen, Ergebnis und bereinigte Fehlerkategorien. Der Task widerruft seinen Vault-
Token. Ein Health Check allein beweist keine Dienstkonnektivität.

Alle Mutationen teilen `configurator-lzc-dev-mutation` mit Infrastruktur-Workflows.
Feature-Branch-Releases benötigen Environment-Freigabe. Eine überholte Branch-Revision
wird für einen neuen Build abgelehnt; eine explizite Promotion verwendet die exakte Quellrevision
des ausgewählten qualifizierten Builds, selbst wenn der Branch fortgeschritten ist. GitHub-Concurrency ist nicht FIFO: Neuere wartende Läufe
können ältere wartende Läufe ersetzen. Lokale Applies oder Pushes niemals parallel ausführen.

Der initiale Einzelinstanz-`cf push` kann den Dienst kurz unterbrechen. Rolling
Releases bleiben ein nachfolgender Meilenstein. Versionierte SQL-Migrationen laufen vor dem Web-
Release in `landing-zone-configurator-migrate`, einer separaten Task-only-App ohne
Route. Nur diese kurzlebige App erhält die Datenbank-Owner-Zugangsdaten; sie wird
nach der Migration und bei Fehlern gelöscht. Migrationsprüfsummen und ein Advisory Lock
sichern wiederholte Ausführung ab. Die Web-App verwendet ihre eingeschränkte Runtime-Rolle und RLS.
Migrations-App und ihr Task benötigen beide 4096 MB Festplattenquota, weil sie
den vollständigen unveränderlichen Web-Release einschließlich der gepinnten Inspektionsruntime entpacken.
Das frühere Limit von 512 MB scheiterte beim Extrahieren des Containers, bevor Node oder irgendein
Migrationscode startete. Der Task behält sein Speicherlimit von 128 MB.
Der exakte qualifizierte Release enthält allein 505.65 MiB Nutzlast regulärer Dateien;
Dateisystemblöcke, Verzeichnisse und Container verursachen zusätzlichen Overhead.
Die nachfolgenden Tasks für Netzwerk, Dienstverbindung und Runner-Isolation
entpacken dieses Droplet ebenfalls und verwenden dieselbe Festplattenquota von 4096 MB.
Diagnosen des Migrationstasks melden nur Release-Run-ID, Verbindungs-/Migrations-
phase, Migrationsdateiname und eine erlaubte Fehlerkategorie oder SQLSTATE.
Der Release filtert Task-Logs vor der Bereinigung; rohes SQL, Zeilenwerte, Zugangsdaten
und nicht zugehörige CF-/Router-Logzeilen werden niemals nach CI exportiert.
Das Web-Manifest verwendet den registrierten suffixfreien Dev-Origin. Nach erfolgreichen kanonischen
Routenprüfungen entfernt der Release die historische Route mit Suffix von dieser App,
falls sie noch gebunden ist. Er löscht weder die gemeinsame Domain noch Routen anderer Apps.
Kunden-Pläne und ausdrücklich bestätigte Saved-Plan-Applies/Destroy verwenden kurzlebige
Runner-Tasks. Application-Drift ist schreibgeschützt. Hosted-Ausführung benötigt zusätzlich
`LZC_EXECUTION_ENABLED=true`, `LZC_APPLICATION_EXECUTION_ENABLED=true` und das
geschützte Environment-Secret `LZC_DEPLOYMENT_ARTIFACT_KEY` (kanonisches Base64 von
32 Zufallsbytes). Diesen Schlüssel über Releases hinweg beibehalten; niemals zur Reparatur eines Jobs ersetzen.
Der Release bindet die Ausführung an das exakt gestagte Droplet und paketiert dieselben
OpenTofu-/Provider-/Quellbytes in der API zur backendfreien Saved-Plan-Inspektion.
Nur der isolierte Runner erhält Job-Zugangsdaten. Der API-Inspektionsunterprozess
hat eine minimale Umgebung ohne Datenbank-, Vault- oder Cloud-Zugangsdaten. Die API
verwendet für diese Inspektion 1024 MiB Speicher und 4096 MiB Festplatte; der Release validiert
beide nativen Roots und prüft beide Broker-Namensräume mit ungültigen Tickets.
Alte Pläne werden nach einem Droplet-Wechsel nicht neu gebunden. Siehe [Plan-Ausführung](../../docs/plan-execution.de.md).

<a id="dev-activation-prerequisite-updated-2026-10-14"></a>

### Voraussetzung für Dev-Aktivierung (aktualisiert 2026-10-14)

Der einzige Ziel-Origin ist
`https://lzc-dev-configurator.apps.01.cf.eu01.stackit.cloud`, ohne Suffix.
Das Client-Team bestätigte, dass der öffentliche Web-Client jetzt in STACKIT
Production registriert ist; die erste Registrierung erfolgte irrtümlich in QA. Der Client verwendet
JWT-Access-Tokens, Response-Typ `code`, Authorization-Code- und Refresh-Token-
Grants, verpflichtendes PKCE und die Scopes `openid`, `email`, `offline_access`. Bestätigte
Audiences sind `api://StackitApp` und `api.stackit.cloud`. Die Anwendung verwendet bereits
den Production-Issuer `https://accounts.stackit.cloud`, PKCE/S256 und einen
Tokenaustausch ohne Secret. Das automatisch erzeugte Client-Secret ist nicht
erforderlich und darf nicht zur STACKIT-Anmeldekonfiguration hinzugefügt werden.

Die öffentliche `LZC_STACKIT_CLIENT_ID` wurde mit Benutzerfreigabe am
2026-10-14 zu `lzc-dev-release` hinzugefügt und durch Rücklesen der Variable geprüft. Es wurde kein STACKIT-Client-Secret
übertragen und kein Deployment ausgelöst. Die Registrierungsbestätigung
qualifiziert keine Hosted-Anmeldung:
Beide exakten Callbacks und die Organisationszugriffsprüfung benötigen noch einen Ende-zu-Ende-
Test. Keine zweite Client-Anfrage ist erforderlich.
Die bestehende Route mit Suffix wurde nur als schreibgeschützte Baseline geprüft,
nicht als Deployment-Ziel ausgewählt. Release-Route, Public Origin und Callbacks
verwenden alle den suffixfreien Origin.

Vor Promotion in `lzc-dev-release` `LZC_STACKIT_AUTH_FLOW=authorization-code`, die provisionierte
öffentliche `LZC_STACKIT_CLIENT_ID`,
`LZC_STACKIT_REDIRECT_URI=https://lzc-dev-configurator.apps.01.cf.eu01.stackit.cloud/auth/stackit/callback`
und `LZC_STACKIT_CLI_CLIENT_APPROVED=false` setzen. Der angeforderte
PKCE-/S256-Client benötigt beide HTTPS-Callbacks, `/auth/stackit/callback` und
`/auth/stackit/proof-callback`. Der CLI-Client kann nicht für einen öffentlichen
Callback wiederverwendet werden. Es findet kein Device-Flow- oder GitHub-Fallback statt.
Der Benutzer hat Commit/Push/Dev-Deployment freigegeben, aber keine zusätzlichen Datenbank-
Backups gewünscht und verlässt sich auf geplante STACKIT-Backups. Kunden-Plan/Apply/Destroy bleiben
separate ausdrückliche Operationen, kein Bestandteil der Anwendungsrelease-Validierung.

Rohe CF-Logs werden nicht nach CI exportiert, da Router-URLs OAuth-Codes enthalten können.
Task-Status, bereinigte Diagnosen und öffentliche Health Checks liefern Release-Nachweise.

<a id="immutable-release-and-promotion"></a>

### Dev-Release mit deaktiviertem Assistant

Bei Model-Serving-Ausfällen unter **Actions > Configurator Release > Run workflow**
auf Branch **main** ausdrücklich **release_mode=dev-assistant-disabled** wählen.
**build_only** nicht anhaken, **release_run_id** leer lassen und
**runner_pool_size=1** setzen. Den genauen Quellstand/Lauf prüfen und nach allen
anwendbaren Build-/Veröffentlichungsprüfungen die bestehende Umgebung
**lzc-dev-release** freigeben. Dieser Modus überspringt die Live-Qualifikation
des Assistant und erzwingt `LZC_ASSISTANT_ENABLED=false`, auch wenn die
Umgebungsvariable ihn aktiviert. Alle übrigen Prüfungen, Migrationen, geschützten
Tags und Dev-Zielprüfungen bleiben erhalten. Die Assistant-API-Routen sind nicht
registriert; die Oberfläche zeigt einen Deaktivierungshinweis. Vorlagen und Editor
bleiben nutzbar. Gespeicherte Gespräche und Vorschläge bleiben erhalten.
Der Modus autorisiert weder Produktion noch Kunden-Infrastruktur-Apply.

Das Manifest vermerkt die Beschränkung auf Dev, den deaktivierten Assistant und
die fehlende Assistant-Qualifikation; der Build-Job heißt
`build-dev-assistant-disabled`. Diese Artefakte können nicht mit `release_run_id`
übernommen werden, weder als normaler noch als weiterer deaktivierter Release.
Nach einem Deploymentfehler sind Untersuchung und ein neuer manueller Lauf nötig.
`build_only=true` erlaubt einen Build zur Prüfung, dessen Artefakt anschließend
nicht übernommen werden kann. Zum Reaktivieren ist ein neuer Release mit
**release_mode=qualified** und vollständiger quellstandsgebundener
Live-Qualifikation erforderlich; eine Umgebungsvariablenänderung aktiviert den
Assistant in diesem Modus nicht. Der Standardpfad **qualified** und dessen
Übernahmebedingungen bleiben unverändert.


## Unveränderlicher Release und Promotion

Einmal bauen; dieselben Bytes deployen. Der Workflow veröffentlicht ein unveränderliches GitHub-
Artefakt `configurator-release-<build-run-id>` mit einem zentralen
`configurator-release.tar.gz` und dessen SHA-256-Prüfsumme. Darin liegen die kompilierte
API, Web-Assets, Migrationen und gepinnte Node-Runtime in `release.tar.gz` sowie das
isolierte `runner.tar.gz` und `release-manifest.json`. Das Manifest bindet beide
Pakete über ihre SHA-256-Prüfsummen an Build-Run-ID und Quellcommit.
Keine Stage-Konfiguration und keine Zugangsdaten gelangen in diesen Release.

Bauen und qualifizieren, ohne CF zu verändern:

```sh
gh workflow run configurator-release.yml \
	--ref feature/landing-zone-configurator -f build_only=true
```

Diesen erfolgreichen Build ohne Neubau in das geschützte Dev-Environment promovieren:

```sh
gh workflow run configurator-release.yml \
	--ref feature/landing-zone-configurator -f release_run_id=<build-run-id>
```

Promotion prüft Repository, erlaubten Quellbranch und Event, Workflow,
erfolgreichen Build-Job, ursprünglichen Run-Versuch, nicht abgelaufene unveränderliche Artefakt-ID und
passende Quell-SHA. Sie checkt diese Quellrevision aus, prüft das zentrale
Archiv und Manifest vor dem Extrahieren der Anwendung und injiziert dann die aktuellen
Runtime-Variablen und Secrets des geschützten Environments. Environment-Freigabe,
Zielbeschränkungen, Migrationsschutz und Dienstprüfungen gelten weiterhin.
Artefakte werden 30 Tage aufbewahrt; abgelaufene Artefakte werden nicht stillschweigend neu gebaut.

Derzeit ist nur Dev als Deployment-Ziel aktiviert. Weitere Stages benötigen ihre
eigene geprüfte Zielkonfiguration und geschützte Environments, keine separaten
Anwendungsbuilds oder Authentifizierungsimplementierungen. Das Promovieren älterer Bytes ist
kein automatischer Datenbank-Rollback: Migrationen sind nur vorwärtsgerichtet, und das Zurücksetzen
von Anwendungscode erfordert ausdrückliche Qualifizierung der Schemakompatibilität.

<a id="network-verification"></a>

## Netzwerkprüfung

Der Release enthält einen diagnostischen CF-Task für DNS/TCP und eine HTTPS-Anfrage an die
eigene Configurator-Route. Der passende CF-Router-Eintrag identifiziert das beobachtete
Quellnetz ohne Kontakt zu einem externen IP-Diagnosedienst. Dies ist eine
Momentaufnahme, keine Zusage stabiler CF-Egress-Adressen.

Der erste Verbindungstest zeigte ein fehlendes STACKIT-Netz in den Dienst-ACLs.
Der offizielle eu01-Katalog und unsere eigenen Router-Logs stützen die Ergänzung von
`45.135.244.0/22` über Plattform-IaC. Netzwerkpolicy-Änderungen erfordern einen geprüften
Plattform-Plan und danach einen frischen CF-Konnektivitätstest. Die öffentlichen UI-/API-Prüfungen laufen
auch bei fehlgeschlagener Dienstverbindung, damit Route- und Dienstzustand
getrennt sichtbar bleiben. Siehe [Plattformabnahme](../../docs/platform-readiness.de.md).

Der API-Dispatcher erhält zusätzlich die Manager-Zugangsdaten für die dedizierte
Runner-Organisation, nicht die Configurator-Organisation. Dies isoliert die CF-Steuerung
von den Datenbank-/Secret-/Model-Bindungen der Web-App. Diese Zugangsdaten gelangen niemals
in das Runner-Paket oder die Job-App. Der Release prüft Runner-Organisations- und
Space-IDs, staged den Provider-Mirror, testet die Engine und prüft eine kurzlebige
Runner-App mit einem nicht registrierten Ticket.
