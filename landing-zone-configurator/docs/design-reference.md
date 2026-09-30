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

Die tatsächlichen Portalwerte wurden noch nicht erfasst. Der Browser-Zugriff
scheitert vor der Seitenauswahl: Die Verbindung referenziert eine fehlende ältere
Plugin-Version (`26.917.71314`), obwohl das verfügbare Plugin `26.924.22138` ist.
Neuverbindung und Rücksetzen der Browser-Ausführungsumgebung halfen nicht.
Das ist kein Login-Problem des STACKIT Portals. Keine Browser-Sitzungen, Cookies
oder Anmeldedaten wurden aus anderen Quellen ausgelesen.

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
