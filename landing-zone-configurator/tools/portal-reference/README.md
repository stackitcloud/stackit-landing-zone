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
