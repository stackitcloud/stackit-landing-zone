# Designreferenz: offizielles STACKIT Portal

Benutzeranforderung vom 2026-09-30: Look & Feel des Landing Zone Configurators
soll dem offiziellen STACKIT Portal entsprechen. Referenz ist die bereits vom
Benutzer geöffnete Projektstartseite. Kein frei interpretiertes STACKIT-ähnliches
Theme als Ersatz für diesen Abgleich.

## Abnahme vor der UI-Implementierung

- [ ] Geöffnete Projektstartseite im Benutzerbrowser ansehen und Referenz erfassen.
- [ ] Portal-Shell: Header, Projekt-/Organisationsauswahl, Navigation, Breadcrumbs und Inhaltsbreite bestimmen.
- [ ] Tatsächliche Farben, Typografie, Schriftgewichte, Abstände, Radien, Rahmen und Schatten dokumentieren.
- [ ] Formulare, Buttons, Karten, Tabellen, Dialoge sowie Fokus-/Fehler-/Disabled-Zustände vergleichen.
- [ ] Verfügbare offizielle Design-Tokens, Fonts, Icons und Komponenten prüfen; kompatible Originalbausteine bevorzugen.
- [ ] Gemeinsame UI-Komponenten und Tokens im Configurator implementieren.
- [ ] Login, Template-Auswahl, fachlichen Editor und Fork-Auswahl gegen die Referenz visuell abnehmen.
- [ ] Tastaturbedienung, Fokus, Kontrast und schmale Ansichten prüfen.

## Öffentliche Designquellen erfasst (2026-09-30)

- [x] Portal-HTML, referenzierte Stylesheets und Haupt-JavaScript ohne Login per `curl` abgerufen.
- [x] Originale `--nds-*`-Deklarationen mit Marken-/Theme-Selektoren und Font-Face-Definitionen extrahiert.
- [x] Wiederholbaren Abruf mit Quellen-URLs, UTC-Zeitpunkt und SHA-256 dokumentiert.
- [ ] Aktive Marke, Theme und berechnete Styles der Projektansicht visuell bestätigen.

Abruf: [Anleitung und Werkzeug](../tools/portal-reference/README.md).
Die lokalen Quelldateien liegen unter `.local/portal-reference/` und werden nicht
versioniert. Persönliche Tokens, Cookies oder Projektzugriffe sind dafür unnötig.

Der erfasste öffentliche [Portal-Stylesheet](https://portal.stackit.cloud/styles-HOVMV7T5.css)
enthält folgende Referenzwerte (Dateiname gilt für diesen Snapshot):

| Geltungsbereich | Beobachtete Deklaration |
| --- | --- |
| `html.brand--digits` | Fließtext: DIN 2014; Überschriften: Univia Pro |
| `html.brand--digits` | Heller Branding-Header: `#0a1e2dff` |
| `html.brand--digits` | CTA: `#00c2ccff`, Hover `#00b2bcff`, aktiv `#00a2acff` |
| `html.brand--neutral` | Fließtext und Überschriften: Inter |
| `html.brand--schwarz` | Fließtext und Überschriften: Helvetica Now Var |
| Theme-Selektoren | `theme--light`, `theme--dark`, `theme--a11y` |
| Body-Regel | 16 px, Gewicht 400, Zeilenhöhe 1.56; Farben über Theme-Tokens |

Die HTML-Antwort enthält zunächst nur `html lang="en"`, keine ausgewählte Marke
oder Theme-Klasse. Die Tokens dürfen daher nicht über alle Selektoren hinweg
zusammengeführt werden. Die Extraktion ist kein vollständiger CSS-Parser und
berechnet weder Kaskade noch responsive Styles. Schriftdateien und Portal-Code
wurden nicht als App-Abhängigkeit übernommen. Vor Übernahme der Schriften ist der
vorgesehene interne Bezug bzw. ihre Wiederverwendung zu klären.

`curl` liefert die SPA-Quelldateien, aber keine gerenderte, angemeldete
Projektstartseite. Shell-Geometrie, konkrete Komponenten und Interaktionszustände
bleiben deshalb offene Abnahmepunkte. Der frühere Browser-Verbindungsfehler
(fehlende Plugin-Version `26.917.71314`) verhindert den öffentlichen Abruf nicht.

## Unabhängig vorbereitete Arbeit

- [x] GitHub-App-Registrierungsentwurf mit fester Callback-URL unter `deploy/github/`.
- [x] Reine Auth-Bausteine für S256-PKCE, State-/Browserbindung und sichere Cookie-Ausgabe mit Negativtests.
- [ ] GitHub App registrieren/zuordnen und Benutzerautorisierung konfigurieren.
- [ ] Persistente, atomar konsumierte Login-Vorgänge und serverseitige Sessions implementieren.
- [ ] Mandanten-/Mitgliedschaftsmodell, Migrationen und echte PostgreSQL-RLS-Negativtests.
- [ ] Benutzergebundene GitHub-Tokens geschützt ablegen; ausschließlich damit Repository-Aktionen ausführen.
- [ ] Erster vertikaler Template-bis-Fork-Ablauf mit tatsächlichem Benutzerlogin.

Die Auth-Helfer sind noch nicht an HTTP-Routen angebunden. Insbesondere ersetzt
ein erfolgreicher State-Vergleich keine atomare Einmalverwendung in PostgreSQL.
Die bestehende Anwendung bleibt bis zur vollständigen Integration geschlossen.
