# Öffentliche STACKIT-Portal-Designreferenz abrufen

Vom Repository-Verzeichnis aus (Python 3 und curl erforderlich):

```sh
python3 landing-zone-configurator/tools/portal-reference/fetch.py
```

Das Werkzeug lädt `https://portal.stackit.cloud/`, entdeckt die aktuellen
Stylesheet- und Haupt-JavaScript-Dateinamen im HTML und lädt diese direkt per
`curl`. Dadurch bleiben wechselnde Asset-Hashes ohne manuelles Nachführen nutzbar.
Keine Anmeldung, Bearer-Tokens, Cookies oder Projekt-API-Aufrufe erforderlich.

Der grundlegende Abruf lässt sich auch direkt ausführen:

```sh
curl -q --fail --silent --show-error --max-time 30 \
  https://portal.stackit.cloud/ --output /tmp/stackit-portal.html
```

`-q` unterbindet persönliche curlrc-Vorgaben. Zertifikate werden normal geprüft;
Redirects werden nicht verfolgt. Bei Zscaler-/Zertifikatsfehlern die Verbindung
prüfen und erneut ausführen; TLS-Prüfung nicht deaktivieren.

Ausgabe im ignorierten Verzeichnis `landing-zone-configurator/.local/portal-reference/`:

- `portal.html`, `stylesheet-*.css`, `main-*.js`: unveränderte öffentliche Quellen.
- `sources.json`: Quellen-URLs, Abrufzeitpunkt, Dateigrößen und SHA-256.
- `design-tokens.json`: NDS-Deklarationen nach Selektor und Font-Face-Definitionen.

Das Verzeichnis enthält jeweils den letzten Abruf. Die Token-Extraktion ist eine
Quellenanalyse, kein vollständiger CSS-Parser oder Browser. Marken, Themes und
Media-Queries müssen getrennt ausgewertet werden. Ein HTTP-Erfolg bestätigt
keine gerenderte Projektansicht. Fonts werden nicht heruntergeladen; vollständige
Portal-Bundles werden nicht in die App übernommen oder eingecheckt.

Erfasste Werte und offene visuelle Abnahme: [Designreferenz](../../docs/design-reference.md).

## Semantische Tokens für die App

Nach dem Abruf erzeugt `python3 landing-zone-configurator/tools/portal-reference/export-tokens.py`
den bewusst begrenzten Token-Snapshot `app/apps/web/src/nebula-tokens.css`.
Er verwendet ausschließlich `brand--digits` / `theme--light` und erhält die
Viewport-Regeln der ausgewählten Größen. Änderungen vor Übernahme prüfen;
anschließend `npm run format` im App-Verzeichnis ausführen.

Die Token-Datei ist keine vollständige Nebula-Bibliothek. Die offizielle Referenz
ist [Nebula](https://styleguide.stackit.schwarz/), insbesondere die
[Token-Architektur](https://styleguide.stackit.schwarz/foundations/design-tokens/about-tokens/)
und die [Formularregeln](https://styleguide.stackit.schwarz/patterns/forms/design/).
