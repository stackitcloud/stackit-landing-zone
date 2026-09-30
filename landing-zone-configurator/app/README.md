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

Auch diese Befehle können bei abweichender lokaler Node-Version mit dem oben gezeigten `npm exec`-Präfix ausgeführt werden. Der Vite-Entwicklungsserver leitet `/healthz` und `/api` an die lokale API weiter. Gemeinsame Pakete vor UI-Start bauen (`npm run build:packages`, bereits Teil von `npm run dev`). Nach Änderungen an gemeinsamen Paketen erneut bauen; automatischer Workspace-Watch folgt später.

`npm run build` erzeugt API-/Paket-Artefakte und `apps/web/dist`. `npm start` startet die gebaute API. Mit `LZC_WEB_ROOT` liefert sie auch das gebaute UI aus. Das [CF-Manifest](../deploy/cloud-foundry/manifest.yml) setzt den Pfad, `HOST=0.0.0.0` und verwendet den von CF bereitgestellten `PORT`. `vite preview` ist kein Produktionsserver.

## Aktueller Funktionsumfang

- React-Startseite mit überprüftem API-Health-Vertrag.
- Öffentlicher `/healthz`-Endpunkt; er bestätigt nur Prozessgesundheit, keine vollständige Betriebsbereitschaft.
- `/api/v1/session` antwortet bis zur echten Session-Integration immer mit HTTP 401.
- Fachliche Tenant-/Rollen-Policy mit Negativtests. Mitgliedschaften müssen später aus authentisiertem serverseitigem Speicher kommen.
- Worker ist ein kompilierbarer Platzhalter und beendet sich beim Start ausdrücklich mit Fehler, bis dauerhafte Queue und Runner integriert sind.

PostgreSQL und Secrets Manager sind provisioniert; CF-Tasks prüfen deren Anbindung. Noch keine GitHub-Anmeldung, Anwendungsschemata/RLS, Templates, persönliche Credential-Speicherung oder Kunden-Deployments. Die getestete Policy allein ist kein Nachweis vollständiger Mehrmandantenfähigkeit.

## Lesende Plattformprüfung

```sh
npm run platform:check
```

Benötigt die STACKIT-CLI sowie die beiden ignorierten Dateien im Repository-Root. Liest `PROJECT_ID` und optional `REGION`; ohne Region wird ausschließlich für die Bestandsaufnahme `eu01` verwendet. `ORGANISATION_ID` bleibt für die spätere Organisationszuordnung reserviert.

Das Skript führt die `.env` nicht als Shellcode aus. Es bezieht einen kurzlebigen Token ohne CLI-Login-Persistierung und fragt ausschließlich Metadaten per GET ab. Ausgabe enthält Statuscodes/Anzahlen, keine Tokens oder Rohantworten. Unerwartete Fehler führen zu Exitcode 1; der bekannte Object-Storage-Status 404 wird als `enabled: false` und anstehende IaC-Provisionierung gemeldet. Der Check provisioniert oder aktiviert nichts. Betriebssystem-Zertifikate sind für Unternehmensproxys aktiviert; TLS-Prüfung bleibt eingeschaltet.

Der Modellkatalog beweist keine projektbezogene Inferenzaktivierung. Leserechte beweisen keine Erstell-/Änderungsrechte. CF-Plattformangebote ersetzen weder CF-Organisation noch Runtime-Zugang. Ergebnisse: [Plattformprüfung](../docs/platform-check.md).
