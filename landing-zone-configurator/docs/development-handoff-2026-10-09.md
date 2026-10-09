# Entwicklungsuebergabe vom 2026-10-09

## Einstieg auf einem anderen Rechner

Repository: https://github.com/stackitcloud/stackit-landing-zone

Branch: `feature/landing-zone-configurator`. Der genaue Uebergabe-Commit wird im
abschliessenden Chat genannt; ein Branch kann spaeter weiterlaufen.

```sh
git clone --branch feature/landing-zone-configurator --single-branch https://github.com/stackitcloud/stackit-landing-zone.git
cd stackit-landing-zone
git status --short
cd landing-zone-configurator/app
npm exec --yes --package=node@24.21.0 --package=npm@11.19.0 -- npm ci
npm exec --yes --package=node@24.21.0 --package=npm@11.19.0 -- npm run check
```

Die npm-Befehle setzen eine vorhandene Node/npm-Basisinstallation voraus. Alternativ
Node 24.21.0 und npm 11.19.0 installieren und `npm ci` / `npm run check` nutzen.
OpenTofu 1.12.6 ist fuer native Runner-Paketierung und Terraform-Vertragstests
erforderlich, Docker fuer lokale PostgreSQL-Tests und den echten lokalen Login.
Die `mise.toml` im Configurator pinnt Node und OpenTofu separat vom Accelerator.

Fuer einen exakt eingefrorenen Stand nach dem Klonen `git switch --detach` mit dem
Uebergabe-Commit verwenden. Fuer weitere Arbeit anschliessend wieder auf den
Feature-Branch wechseln. Bei einem schon vorhandenen Checkout erst lokale
Aenderungen sichern und nur mit `git pull --ff-only` aktualisieren; nicht resetten.

## Lokal entwickeln

Zwei Terminals im Verzeichnis `landing-zone-configurator/app`:

```sh
# Terminal 1: API, Port 3000
npm exec --yes --package=node@24.21.0 --package=npm@11.19.0 -- npm run dev
```

```sh
# Terminal 2: Vite, Port 5173
npm exec --yes --package=node@24.21.0 --package=npm@11.19.0 -- npm run dev:web
```

Dies ist der einfache Entwicklungsstart, nicht die bisherige authentifizierte
Ausfuehrungsumgebung. Echter STACKIT-Login, persistente Daten und native Ausfuehrung
haben zusaetzliche Voraussetzungen: siehe [Entwicklungsanleitung](../app/README.md).
Der lokale CLI-Client ist ausschliesslich fuer Loopback zugelassen, nicht fuer
das gehostete Dev. Auf einem neuen Rechner entstehen neue lokale Daten; ein
Checkout uebertraegt keine bestehenden Nutzer, Konfigurationen oder Auftraege.

## Implementierter Stand

- Application Plan/Apply, Destroy und Drift Detection sind implementiert.
- Destroy verlangt einen unveraenderten gespeicherten Plan, dessen Hash,
  ausdrueckliche Bestaetigung und die exakte Instanz-ID. Danach ist Archivierung
  eine separate Aktion; Historie bleibt erhalten.
- Drift bleibt read-only. Der normale aktualisierte Plan unterscheidet
  State-zu-Cloud-Abweichungen und Cloud-zu-Soll-Aenderungen. Kein Drift-Apply.
- Tenant, Eigentuemer, IAM, Gruppen, Delegation, State-Locks und unveraenderliche
  Source-/Runner-Bindungen bleiben wirksam. Kein automatischer Retry.
- Gehosteter Application-Runner und backendfreie native Artefaktinspektion sind
  angebunden. Ein geaendertes CF-Droplet wird vor Job-Erstellung abgewiesen.
- Lokale Datenbankmigrationen 001 bis 050 sind angewandt und unveraenderlich.
  Neue Migrationen beginnen bei 051; historische SQL-Dateien nicht editieren.
- Aeltere README-/MVP-Abschnitte enthalten historische Zwischenstaende. Fuer die
  aktuelle Qualifikation gilt der neueste Abschnitt im
  [Runtime-Bericht](runtime-validation-report.md).

## Qualifiziertes Release, noch nicht deployt

Build: https://github.com/stackitcloud/stackit-landing-zone/actions/runs/37929894997

- Source: `4a09889a721db143b3841905db2f02e424ee1582`.
- Artefakt: `configurator-release-37929894997`, ID `11616895038`.
- GitHub-Artefaktdigest:
  `sha256:784fb93f0ffd80cce6ae1378cdae23cb6414dffa576746f28d2af782a8297850`.
- 433 Unit-Tests, 31 echte PostgreSQL-Tests und 270 Browsertests bestanden.
- Native Vertraege: 16 Application-, 7 Netzwerk- und 3 Governance-Tests bestanden;
  Linux-Runner-Paketierung, Init und Validate erfolgreich.
- Build erfolgreich; Deployment bewusst uebersprungen. Artefaktaufbewahrung 30 Tage.

Einziges Ziel: https://lzc-dev-configurator.apps.01.cf.eu01.stackit.cloud

Der oeffentliche PKCE-Web-Client ist bereits beantragt. Seine provisionierte
oeffentliche `LZC_STACKIT_CLIENT_ID` fehlt noch im geschuetzten GitHub-Environment
`lzc-dev-release`. Kein neuer Antrag, kein Suffix, kein Device-Flow-/GitHub-Ersatz
und kein gehosteter CLI-Client. Beide registrierten Callbacks muessen passen:

```text
https://lzc-dev-configurator.apps.01.cf.eu01.stackit.cloud/auth/stackit/callback
https://lzc-dev-configurator.apps.01.cf.eu01.stackit.cloud/auth/stackit/proof-callback
```

Erst nach Client-Bereitstellung das unveraenderte qualifizierte Artefakt ueber den
geschuetzten Release-Workflow promoten, nicht neu bauen:

```sh
gh workflow run configurator-release.yml \
  --repo stackitcloud/stackit-landing-zone \
  --ref feature/landing-zone-configurator \
  -f release_run_id=37929894997
```

Der CF-CLI-Kontext des bisherigen Rechners zeigte auf `migration-framework/dev`,
nicht auf Configurator Dev. Kein direkter `cf push` in diesen Kontext. Geschuetzte
Pipeline und Zielpruefungen verwenden. Der bestehende Artifact-Key darf nicht
rotiert werden, um Jobs vermeintlich zu reparieren.

## Nicht in Git uebertragen

- Zugangsdaten, Tokens, Service-Account-JSON und lokale Environment-Dateien.
- Lokale PostgreSQL-Daten, Browser-Sessions und Credential-Verschluesselungskeys.
- `.local`-Runner-Pakete, private Job-Verzeichnisse, Saved Plans, Recovery-Dateien
  und Terraform-State.

Diese Daten verbleiben unveraendert auf dem bisherigen Rechner. Falls bestehende
lokale Instanzen auf dem neuen Rechner weiter betrieben werden sollen, ist eine
separate sichere Daten-/Schluesseluebertragung erforderlich, nicht ein Git-Push.
Gespeicherte Plaene niemals an ein neu gebautes Runner-Paket umbinden.
Keine zusaetzlichen DB-Backups: regelmaessige STACKIT-Backups sind vorhanden.
Kunden-Cloud-Plan/Apply/Destroy benoetigen weiterhin separate ausdrueckliche Freigabe.

## Offener Arbeitsstand und naechster Vorschlag

Ein historischer Application-Apply steht korrekt auf
`reconciliation_required / runner_report_missing`: Ressourcen wurden nachgewiesen,
aber die Abschlussmeldung fehlt. Kein erfundener Erfolg und kein automatischer
Apply-Retry. Abgelaufene Tickets ohne Recovery-Nachweis erlauben unter den neuen
Guards bestimmte Maintenance-Plans, loesen den historischen Fall aber nicht auf.

Empfohlener naechster MVP-Schritt: geregelter Recovery-/Abgleichspfad fuer
Application-Laeufe aus Issues #90 und #93, einschliesslich Runner-Abbruch,
verlorener Abschlussmeldung, Teilfehlern, nachvollziehbaren Nachweisen und einer
separaten bestaetigten Operator-Aktion. Diese Empfehlung ist noch keine
Implementierungsfreigabe. Danach explizite Application-Upgrades, Quoten und der
begrenzte Model-Serving-Assistent.

## Chat wieder aufnehmen

Der [bereinigte Gespraechsexport](development-chat-2026-10-09.md) enthaelt verfuegbare Nutzer- und
Assistententexte, nicht Tool-Ausgaben oder interne Analysen; eingebetteter
Editor-/Systemkontext und erkennbare Secrets werden entfernt. Er ist kein
importierbarer VS-Code-Sessionzustand und enthaelt nicht diese erst spaeter
versendete Abschlussantwort.

Fuer einen neuen Copilot-Chat beide Dokumente als Kontext anhaengen und angeben:
"Lies die Entwicklungsuebergabe und den Gespraechsexport vom 2026-10-09.
Pruefe den aktuellen Git-Stand. Keine historischen Migrationen oder Runner-
Bindungen aendern. Gehostetes Dev bleibt bis zur bereitgestellten Web-Client-ID
gesperrt. Setze nur das nun ausdruecklich beauftragte Arbeitspaket fort."