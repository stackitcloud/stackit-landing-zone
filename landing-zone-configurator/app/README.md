# Configurator-Entwicklung

TypeScript-Workspace mit React/Vite, Fastify, Fachmodell und API-Verträgen. Abhängigkeiten sind exakt gepinnt, das npm-Lockfile wird versioniert. Voraussetzungen: Node.js **24.21.0**, npm **11.19.0**. `../mise.toml` und `.node-version` dokumentieren die Runtime unabhängig vom Accelerator.

## Installieren und prüfen

Im Verzeichnis `landing-zone-configurator/app`:

```sh
npm ci
npm run check
```

`check` führt Biome, TypeScript-Prüfung einschließlich Tests, Produktionsbuild und Vitest aus. `npm run format` korrigiert Formatierung und Importreihenfolge.

Falls die passende Runtime lokal noch fehlt, funktioniert ohne globale Installation beispielsweise:

```sh
npm exec --yes --package=node@24.21.0 --package=npm@11.19.0 -- npm ci
npm exec --yes --package=node@24.21.0 --package=npm@11.19.0 -- npm run check
```

## Lokal starten

Zwei Terminals im App-Verzeichnis:

```sh
# Terminal 1: API auf http://127.0.0.1:3000
npm run dev
```

```sh
# Terminal 2: UI auf http://127.0.0.1:5173
npm run dev:web
```

Auch diese Befehle können bei abweichender lokaler Node-Version mit dem oben gezeigten `npm exec`-Präfix ausgeführt werden. Der Vite-Entwicklungsserver leitet `/healthz`, `/auth` und `/api` an die lokale API weiter. Gemeinsame Pakete vor UI-Start bauen (`npm run build:packages`, bereits Teil von `npm run dev`). Nach Änderungen an gemeinsamen Paketen erneut bauen; automatischer Workspace-Watch folgt später.

### Lokaler STACKIT-Login

Nach ausdrücklicher Freigabe der CLI-Client-Nutzung kann der echte Login ohne
Dev-Datenbank und Secrets-Manager-Zugang lokal gestartet werden. Docker muss laufen:

```sh
LZC_STACKIT_CLI_CLIENT_APPROVED=true npm run dev:login
```

Das Backend läuft ausschließlich auf `127.0.0.1:3000`; die zugehörige gebaute
UI-Vorschau muss auf `http://127.0.0.1:4181` laufen. Der Starter legt den eigenen
Docker-Container `lzc-local-stackit-login` mit PostgreSQL 17 an, bindet dessen Port
nur an Loopback und wendet die bestehenden Migrationen an. Zufällige
Datenbankpasswörter werden nicht ausgegeben; die Runtime verwendet weiterhin
`configurator_app`, nicht die Migrationsidentität. Die lokale Datenbank bleibt
bei einem API-Neustart erhalten; der Starter löscht keine Nutzer oder Entwürfe.

STACKIT-Identitätsprüfung, Sessions, Credential-Profile und Produktkataloge sind echt.
Technische STACKIT-Abfragen verwenden den im aktiven Tenant gespeicherten Service
Account. Platform Engineers können Zugänge auch in Organisationstenants verwalten;
Profile bleiben an Tenant und Besitzer gebunden. Im persönlichen Tenant wird ein
zugängliches aktives Referenzprojekt automatisch ermittelt, im Organisationstenant
wird die Suche auf dessen Organisation begrenzt.

Nur im lokalen Starter ersetzt eine AES-256-GCM-Ablage den Secrets Manager.
Schlüsseldateien sind unter `../.local/credential-secrets/` verschlüsselt; das
separate lokale Verschlüsselungsgeheimnis `master.key` und der Ordner sind nur für
den Betriebssystembenutzer zugänglich. Das ist kein Ersatz für einen produktiven
Secrets Manager: Wer auf Ordner und Verschlüsselungsgeheimnis zugreifen kann,
kann die Daten entschlüsseln. Den Ordner nicht teilen oder ins Repository aufnehmen.
Er bleibt wie die Datenbank über Neustarts erhalten.

`dev:login` aktiviert keinen Runner und übernimmt keine Dev-Daten. Mit einem
vorbereiteten nativen Paket aktiviert `dev:execution` lokale Plattform-Plans und
den ausdrücklich freizugebenden Apply-Pfad. Organisations-Platform-Engineers
verwenden weiterhin private, tenantgebundene Vorbereitungen und Zugänge.
HTTP wird ausschließlich für ausdrücklich aktivierte, kanonische Loopback-
Ursprünge erlaubt; Produktionskonfigurationen verlangen unverändert HTTPS.
Ein bloßes `vite preview` ohne dieses Backend kann keine Anmeldung durchführen.

### Lokale Plan-/Apply-Ausführung

Mit Node 24.21.0, npm 11.19.0 und checksum-geprüftem OpenTofu 1.12.6 im `PATH`:

```sh
npm run build
LZC_LOCAL_RUNNER_PACKAGE=true bash ../deploy/runner/package.sh
LZC_STACKIT_CLI_CLIENT_APPROVED=true npm run dev:execution
```

Die Paketierung verlangt ein neues Zielverzeichnis und überschreibt kein
bestehendes Paket. `LZC_RUNNER_PACKAGE_DIR` kann ein anderes geprüftes Paket
angeben. Der native Modus ist ausschließlich für die lokale Entwicklung gedacht,
nicht als Ersatz für die produktive CF-Isolation. Jobs laufen mit minimaler
Umgebung unter `~/.local/share/landing-zone-configurator/runner-jobs`, außerhalb
des Workspace; Paketinhalt und Laufzeit sind an den gespeicherten Plan gebunden.
Nach einem API-Absturz werden unklar laufende Jobs nicht automatisch wiederholt
oder über fremde Prozess-IDs beendet. Recovery-Dateien verhindern Cleanup.

Der native Worker erzeugt seine CLI-Konfiguration mit dem Paket-Mirror-Pfad und
verwendet fuer Provider-Sockets ein kurzes privates Temp-Verzeichnis, das beim
Cleanup entfernt wird. Init erlaubt Provider-Dateien bis 256 MiB; andere Phasen
behalten das Limit von 64 MiB. Der echte Paket-Init/Validate-Test stoppt vor Plan
und verwendet weder Kunden-Credentials noch Kunden-State:

```sh
LZC_NATIVE_RUNNER_TEST=true LZC_RUNNER_PACKAGE_DIR=../.local/runner-local-20261003-mirror-init npm exec -- vitest run tests/platform-worker.test.ts -t 'real native providers'
```

Unter **OpenTofu-Ausgabe** zeigt jeder lokale Auftrag die normale CLI-Ausgabe.
Laufende Jobs werden alle zwei Sekunden aktualisiert; **Ausgabe folgen** laesst
sich zum Pruefen aelterer Zeilen anhalten. Erfolgreiche Plattform-Plans werden
read-only mittels `tofu show -no-color` aus dem unveraenderten gespeicherten
Artefakt dargestellt, einschliesslich Ressourcen und Attributaenderungen.
OpenTofu maskiert sensitive Werte wie in der CLI. Die separate Ausgabe-Route
verlangt Sitzung, Deployment-Rolle und private Eigentuemer-/Tenant-Zuordnung;
rohes Plan-Binary oder `show -json` werden nicht an den Browser geliefert.
Jeder Plan bleibt an sein unveraenderliches Runner-Paket gebunden. Ein Paketwechsel
erfordert einen neuen Plan und dessen ausdrueckliche Freigabe.
Laufende Apply-Ausgaben werden ebenfalls aktualisiert. Vor dem terminalen Ergebnis
sichert der Worker den redigierten CLI-Text einmalig und verschluesselt beim Broker;
er bleibt nach Cleanup und Reload unter derselben privaten Zugriffskontrolle lesbar.
**Apply-Nachweise** zeigen Plan-ID, SHA-256, Zielorganisation, State-Backend des
Auftrags und Abschlusszeit. Die bestehende exakte Organisationsbestaetigung und
gegebenenfalls destruktive Freigabe bleiben erforderlich; kein automatischer Retry.
Ausgaben sind auf 2 MiB begrenzt; eine Kuerzung wird angezeigt. Die Sicherung ist
best-effort: bei hartem Prozessabbruch oder fehlgeschlagenem Upload ist ein
vollstaendiger historischer Mitschnitt nicht garantiert. CF-Live-Ausgabetransport
bleibt offen; bereits gesicherter Text benoetigt keinen laufenden nativen Runner.

Für neue Plattformen ist **Accelerator-Standard · Management-S3** der Default.
Der ausgewählte Service Account führt den freigegebenen Bootstrap-Apply aus;
Terraform verwaltet Management-Projekt, `*-tfstate`-Bucket, S3-Zugang und dessen
Management-Secrets-Manager-Eintrag. Anschließend verifiziert der Broker die
Migration zu `terraform.tfstate` in eu01. Es sind keine manuellen S3-Keys nötig.
**Bestehendes S3-Backend registrieren** bleibt die optionale Bestandsanbindung.
Der Bucket wird nicht außerhalb des Terraform-State vorab angelegt. Plan und
Apply starten nur über ihre jeweiligen ausdrücklichen Aktionen in der UI.

`npm run build` erzeugt API-/Paket-Artefakte und `apps/web/dist`. `npm start` startet die gebaute API. Mit `LZC_WEB_ROOT` liefert sie auch das gebaute UI aus. Das [CF-Manifest](../deploy/cloud-foundry/manifest.yml) setzt den Pfad, `HOST=0.0.0.0` und verwendet den von CF bereitgestellten `PORT`. `vite preview` ist kein Produktionsserver.

## Arbeitsbereich und Konfiguration

Der regulaere Einstieg ist **Anmelden > Arbeitsbereich oeffnen > Konfiguration
oeffnen oder erstellen > Bearbeiten > Plan > Apply**. Beim ersten Einstieg lassen
sich der persoenliche oder ein Organisationsarbeitsbereich oeffnen und neue
Arbeitsbereiche erstellen. Bei spaeterem Einstieg ueber `/` wird der zuletzt
geoeffnete, weiterhin zugaengliche Arbeitsbereich wieder aufgenommen. Explizite
Seiten-URLs bleiben erhalten; der Arbeitsbereichswechsel steht im Header bereit.

**Arbeitsbereiche** steht an erster Stelle der Hauptnavigation. Oeffnen fuehrt zu
den Konfigurationen des gewaehlten Bereichs, fuer Application Owner zur eigenen
Application-Ansicht. **Benutzerverwaltung** verwaltet Mitglieder, Rollen und
Gruppen des aktiven Bereichs. Berechtigte Platform Engineers koennen eigene
Gruppen anlegen und loeschen sowie Mitglieder zuweisen und wieder entfernen.
Gruppenmitglieder werden mit ihrer bestaetigten STACKIT-E-Mail angezeigt;
Benutzer-IDs bleiben intern. Legacy-Konten ohne STACKIT-E-Mail behalten ihren
Benutzernamen, unbekannte Namen werden nicht durch IDs ersetzt.
Die automatische Gruppe **Application Owners** folgt den Rollen und ist nicht
manuell aenderbar. Gruppen mit Template-Freigaben koennen erst nach deren
Entfernung geloescht werden; Arbeitsbereichsmitglieder bleiben erhalten.
Template-Gruppenfreigaben liegen weiterhin unter **Application Landing Zones >
Veroeffentlichung**, nicht in einem zusaetzlichen Gruppen-Reiter. Auswahl und
Erstellung anderer Arbeitsbereiche liegen nicht in der Benutzerverwaltung.
Auch eine neue inline STACKIT-Anmeldung von einer zuvor offenen Verwaltungsseite
fuehrt ohne offenen Entwurf zum Arbeitsbereichseinstieg. Bereits angemeldete
Deep Links und gesicherte Login-Entwuerfe bleiben erhalten.

**Konfigurationen** ist die Plattformuebersicht. **Neue Konfiguration** fuehrt zur
Template-Auswahl. Eine geoeffnete Konfiguration hat den Kontext **Konfiguration >
Bereitstellung > Verlauf** mit sichtbarer gespeicherter Revision.
**Speichern und zur Bereitstellung** uebernimmt die vom Server neu gespeicherte
Revision, nicht den alten Entwurfsstand. Ungespeicherte Aenderungen sperren den
direkten Bereitstellungstab; ein Arbeitsbereichswechsel fragt vor ihrem Verlust.
Der Verlauf ist nur lesbar und auf die betreffende Konfiguration begrenzt.

Die Bereitstellung zeigt pro Konfiguration den neuesten Lauf, sofern er nicht
abgelaufen oder bereits verwendet ist, sowie laufende Ausfuehrungen und
erforderliche Wiederherstellungen. Aeltere,
abgelaufene oder bereits fuer Apply verwendete Plaene liegen standardmaessig
unter **Historie (Anzahl)**. Ihre Details sind einzeln aufklappbar und ohne
Apply-Freigabe; CLI-Ausgaben und Nachweise bleiben lesbar. Ablauf verschiebt einen
Plan auch ohne Reload in die Historie. Die Ansicht loescht oder erneuert keine
Artefakte und hebt keine laufenden Ausfuehrungs-/Recovery-Sperren auf.

Reload liest die gemerkte Konfigurations-ID innerhalb des Benutzer-/Arbeitsbereichs
erneut vom Server. Zugaenge und Apply-Freigaben werden dadurch nicht gespeichert
oder bestaetigt. Vorbereitung, Plan und Apply bleiben ausdrueckliche Aktionen;
vorhandene Plan-Artefakte werden durch Navigation nicht erneuert oder umgebunden.
Application Owner behalten ihren getrennten Application-Landing-Zone-Einstieg.

## Aktueller Funktionsumfang

- Private Konfigurationen in PostgreSQL, pro Benutzer und aktivem Arbeitsbereich.
	Unter **Konfigurationen** lassen sich auch unvollstaendige Entwuerfe speichern,
	wieder oeffnen, als neue Kopie speichern und loeschen. Revisionen verhindern
	das Ueberschreiben durch parallele Tabs; im Konflikt bleibt der Entwurf erhalten.
	GitHub ist dafuer nicht erforderlich und bleibt als optionaler versionierter
	Speicherort verfuegbar. Der Datenbankweg benoetigt Migration
	`015_configuration_storage.sql`; vorhandene Konfigurationen sind nur fuer ihren
	Ersteller sichtbar. In Organisationsarbeitsbereichen ist die Rolle Platform
	Engineer erforderlich. Browser-Zwischenstaende ersetzen diese Speicherung nicht.
- Template-Katalog, Standalone-Editor mit Feldhilfen und grafischer Struktur.
- Nativer `.tfvars`-Download und atomarer GitHub-Export mit JSON, tfvars, CLI-Anleitung und optional verifiziertem S3-Backend.
- GitHub-Login, PostgreSQL-Sessions/RLS und persönliche Tokens im Secrets Manager.
- Persönliche Deployment-Zugänge: Service-Account-Key-Datei speichern/löschen; Anmeldung und Organisations-Lesezugriff prüfen. [Details](../docs/deployment-credentials.md).
- Unveränderliche Deployment-Vorbereitungen aus Fork-Konfiguration, Ziel und persönlichem Zugang. [Details](../docs/deployment-preparation.md).
- Browser-Zurück/Vorwärts und direkte Seiten-URLs.
- Erstbereitstellungspläne und freigabegebundener Plattform-Apply-Pfad: RLS-Aufträge, isolierte CF-Tasks und wertfreie Ergebnisanzeige; siehe [Ablauf und Abnahme](../docs/plan-execution.md). Kein Kunden-Apply in dieser Abnahme; Chat bleibt offen.
- Application-Testkatalog: unveränderliche tenantgebundene Projekt-Template-Versionen, Bestellungen ohne Fork, idempotente Instanzaufträge und ausdrückliche Planblocker. Keine Application-Cloud-Ausführung; siehe [Veröffentlichung und Bestellung](../docs/template-parameters-and-bindings.md#tenantgebundener-testkatalog-und-bestellungen).

Der Application-Dienst ist standardmäßig deaktiviert. Nach Anwendung der Migration
`010_application_catalogue.sql` mit der bestehenden Migrationsidentität aktiviert
`LZC_APPLICATIONS_ENABLED=true` die API im authentifizierten Server. Fehlende Tabellen
verhindern dessen Start. `/applications` ist die eigene SPA-Route; die API liegt unter
`/api/v1/applications/templates` und `/api/v1/applications/instances`. Alle Anfragen
benötigen den aktiven Tenant-Header, Mutationen zusätzlich Origin-/CSRF-Prüfung.
Das Featureflag aktiviert ausschließlich den Testkatalog und Bestellaufträge, niemals
einen Runner oder Apply. Die bestehende Plattform-Plan-Pipeline bleibt unverändert.

Details und Grenzen: [Forks und Navigation](../docs/forks-and-navigation.md),
[GitHub-Login](../docs/github-login.md). HCL-Export-Roundtrip prüfen mit Node 24 im PATH:
`cd ../tools/hcl-adapter && go test ./... && go run . -check`.

## State-Backend und unabhängiger Export

Der Plattform-Bootstrap verwendet temporär einen dauerhaften verschlüsselten
HTTP-State. Nach dem freigegebenen Bootstrap-Apply wird zum LZA-Management-Bucket
migriert; erst nach serverseitigem Hash-/Versionsnachweis wird der HTTP-Primärstate
entfernt. Native S3-States verwenden `use_lockfile = true`; Application-Instanzen
haben jeweils eigene State-Keys. Legacy-State-Zuordnungen bleiben bis zur expliziten
Migration gesperrt. Unbestätigte Migration/Recovery benötigt einen State-Export
und operativen Abgleich; vollständige automatische Recovery bei hartem
Runner-Verlust ist nicht garantiert. Cloud-Locking wurde nicht live getestet.

GitHub speichert unter `src/config/custom/<id>/` JSON, tfvars und eine CLI-Anleitung,
zusätzlich `backend.tf.json`, wenn die API die Quellbindung verifiziert hat.
Die erste Speicherung eines DB-Entwurfs erhält dessen ID; vorhandene Git-Bindungen
behalten ihre eigene ID. Der Browser kann keine Backend-Deskriptoren vorgeben.
Exportiert werden weder AWS-/SA-Schlüssel noch State-Dateien. Backend-Servicefehler,
manuell veränderte Backend-Dateien und verlorene Bindungen brechen den Export ab.
Ein abweichender Quell-ID-Alias wird beim Export nicht neu registriert; für die
Vorbereitung ist die ausdrückliche Auswahl des bestehenden Backend-ID nötig.

CLI-Betrieb benötigt den geprüften Accelerator-Code und den Management-Zugang
aus dem LZA Secrets Manager. Ursprünglichen Backend-Block in `src/backend.tf`
deaktivieren, exportiertes `backend.tf.json` nach `src/` kopieren und genau einen
aktiven Backend-Block behalten. AWS-Schlüssel als `AWS_ACCESS_KEY_ID` und
`AWS_SECRET_ACCESS_KEY` setzen, dann in `src`:

```sh
tofu init
tofu plan -var-file=config/custom/<id>/landing-zone.tfvars
```

Ohne verifizierte Bindung zuerst den LZA-Bootstrap mit gesichertem State und
anschließender geprüfter S3-Migration durchführen. Export führt weder Apply noch
Migration aus. [Lifecycle und Recovery-Grenzen](../docs/plan-execution.md#state-lebenszyklus-gemäß-lza).

## Lesende Plattformprüfung

```sh
npm run platform:check
```

Benötigt die STACKIT-CLI sowie die beiden ignorierten Dateien im Repository-Root. Liest `PROJECT_ID` und optional `REGION`; ohne Region wird ausschließlich für die Bestandsaufnahme `eu01` verwendet. `ORGANISATION_ID` bleibt für die spätere Organisationszuordnung reserviert.

Das Skript führt die `.env` nicht als Shellcode aus. Es bezieht einen kurzlebigen Token ohne CLI-Login-Persistierung und fragt ausschließlich Metadaten per GET ab. Ausgabe enthält Statuscodes/Anzahlen, keine Tokens oder Rohantworten. Unerwartete Fehler führen zu Exitcode 1; der bekannte Object-Storage-Status 404 wird als `enabled: false` und anstehende IaC-Provisionierung gemeldet. Der Check provisioniert oder aktiviert nichts. Betriebssystem-Zertifikate sind für Unternehmensproxys aktiviert; TLS-Prüfung bleibt eingeschaltet.

Der Modellkatalog beweist keine projektbezogene Inferenzaktivierung. Leserechte beweisen keine Erstell-/Änderungsrechte. CF-Plattformangebote ersetzen weder CF-Organisation noch Runtime-Zugang. Ergebnisse: [Plattformprüfung](../docs/platform-check.md).
