# Designreferenz: offizielles STACKIT Portal

Benutzeranforderung vom 2026-09-30: Look & Feel des Landing Zone Configurators
soll dem offiziellen STACKIT Portal entsprechen. Referenz ist die bereits vom
Benutzer geöffnete Projektstartseite. Kein frei interpretiertes STACKIT-ähnliches
Theme als Ersatz für diesen Abgleich.

## Design-Abnahme

- [ ] Geöffnete Projektstartseite im Benutzerbrowser ansehen und Referenz erfassen.
- [ ] Portal-Shell: Header, Projekt-/Organisationsauswahl, Navigation, Breadcrumbs und Inhaltsbreite bestimmen.
- [ ] Tatsächliche Farben, Typografie, Schriftgewichte, Abstände, Radien, Rahmen und Schatten dokumentieren.
- [ ] Formulare, Buttons, Karten, Tabellen, Dialoge sowie Fokus-/Fehler-/Disabled-Zustände vergleichen.
- [x] Offizielle Design-Tokens, Fonts und Komponentenquellen über Nebula prüfen.
- [ ] Offizielle Icons und vollständige Komponentenparität integrieren.
- [x] Gemeinsame Formular-/Strukturkomponenten und ausgewählte semantische Tokens im Configurator implementieren.
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
berechnet weder Kaskade noch gerenderte Styles. Für die Anwendung wird ausdrücklich
`digits/light` gewählt. Ein begrenzter semantischer Token-Snapshot erhält die
Viewport-Regeln; Schriftdateien und Logo werden lokal ausgeliefert.
[Asset-Herkunft und Prüfsummen](brand-assets.md). Portal-JavaScript wird nicht
in die Anwendung übernommen.

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
Die geschützte API bleibt bis zur vollständigen Integration geschlossen.
Der öffentliche Template-Editor arbeitet ausschließlich mit Repository-Vorlagen
und flüchtigen Entwürfen im aktuellen Browser-Tab.

## Nebula als bestätigte Referenz

Der Benutzer hat am 2026-09-30 [styleguide.stackit.schwarz](https://styleguide.stackit.schwarz/)
als Referenz angegeben. Die Seiten sind ohne Login abrufbar (Unterseiten mit
abschließendem `/`). Relevante Vorgaben:

- [Tokens](https://styleguide.stackit.schwarz/foundations/design-tokens/about-tokens/):
  semantische Namen verwenden, Marken/Modi getrennt halten.
- [Typografie](https://styleguide.stackit.schwarz/foundations/typography/):
  16-px-Basiseinheit, abgestufte Textstile; lokale Originalschriften.
- [Formulare](https://styleguide.stackit.schwarz/patterns/forms/design/):
  ein-/zweispaltiger Wizard, Inline-Fehler und anklickbare Fehlerzusammenfassung.
  Download bleibt klickbar und führt bei ungültigen Angaben zum betroffenen Feld.
- [Buttons](https://styleguide.stackit.schwarz/components/buttons/design/):
  eine hervorgehobene Hauptaktion pro Aktionsgruppe.
- [Header](https://styleguide.stackit.schwarz/components/header/design/) und
  [Navigation](https://styleguide.stackit.schwarz/patterns/side-navigation/design/):
  Logo, Kontext und klar markierter aktiver Navigationspunkt.

Nebula verweist auf eine Angular-Komponentenbibliothek. Diese ist keine direkt
nutzbare React-Abhängigkeit. Der bestätigte React-Stack bleibt für diesen Schritt
bestehen; native semantische Komponenten verwenden den ausgewählten Token-Snapshot.
Vollständige Komponenten- und Verhaltensparität ist damit nicht automatisch erreicht.
Der Configurator zeigt nur seine tatsächlich verfügbaren Funktionen; eine
Projekt-/Regionsauswahl für authentifizierte Benutzer folgt mit dem Login.

Lokale Abnahme: Browserprüfungen auf 1440 und 390 px, inklusive Suche,
Fehlerfokus, Entwurfsdownload und erfolgreichem Laden beider Originalschriften und
des Logos. Screenshots liegen unter `.local/browser-tests`. Die integrierte
Browser-Verbindung ist weiterhin defekt; deshalb wurden isolierte lokale
Browser-Kontexte verwendet. Ein direkter visueller Vergleich mit der angemeldeten
Portal-Projektstartseite und die vollständige Tastatur-/Kontrastprüfung stehen aus.
