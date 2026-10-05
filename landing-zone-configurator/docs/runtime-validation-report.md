# Runtime Validation Report

Generated: 2026-10-02T10:14:20Z
Target: `landing-zone-configurator/app`, lokale STACKIT-Login-Umstellung.

## Ergebnis

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