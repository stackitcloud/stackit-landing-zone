# Fork-Speicherung und Browser-Navigation

Stand: 2026-09-30. Auf lzc-dev bereitgestellt; Browser-Navigation live geprüft. Persönlicher Fork-Commit noch abzunehmen.

## Benutzerablauf

1. Mit GitHub anmelden und links **GitHub-Forks** öffnen.
2. Bei Bedarf **Fork bei GitHub erstellen** verwenden. Die Erstellung bestätigt
   der Benutzer direkt bei GitHub.
3. **App-Zugriff auf Fork einrichten** öffnen und die App auf ausgewählten eigenen
   Repositories installieren (`Only select repositories`).
4. **Forks aktualisieren**, gegebenenfalls **Weitere Repositories prüfen**, dann
   den gewünschten Fork auswählen.
5. Einen Standalone-Entwurf vollständig ausfüllen und **Im Fork speichern** wählen.
   Beim ersten Speichern entsteht der Arbeitsbranch `lzc/configurations` aus dem
   aktuellen Default-Branch des Forks. Der Default-Branch wird nicht verändert.
6. Gespeicherte Konfigurationen lassen sich über denselben Bereich wieder öffnen,
   bearbeiten und als neue Revision speichern. **Neue Kopie vorbereiten** gibt dem
   aktuellen Entwurf eine neue Identität, sobald er gespeichert wird.

Aktuelles kanonisches Dateiformat:

```text
src/config/custom/<uuid>/landing-zone.json
```

Enthalten sind Schema-Version, Konfigurations-ID, freigegebene Template-Identität
mit Quellhash und der fachliche Editor-Entwurf. `kind` ist
`landing-zone-configurator-configuration`; dies unterscheidet die bearbeitbare
Ablage vom bisherigen Downloadformat. Unbekannte Eingabefelder werden nicht
übernommen. Keine Zugangsdaten, GitHub-Tokens, Terraform-Module oder HCL-Ausdrücke
werden als zusätzliche Nutzdaten angenommen. Es wird noch kein `generated.tfvars.json`
erzeugt: Compiler-/Deployment-Abnahme und mehrteilige Ausgabe sind ein späterer Schritt.
Der Configurator startet beim Speichern keinen Plan/Apply. Repository-eigene
GitHub-Workflows unterliegen weiterhin den dort konfigurierten Commit-Triggern.

## Zugriff und Konflikte

- Jede Anfrage benötigt eine gültige Backend-Session; Schreiben zusätzlich exakte
  Origin und sitzungsgebundenen CSRF-Wert.
- Das Backend liest ausschließlich das zu Session, Benutzer und Mandant gehörende
  GitHub-App-Benutzertoken aus dem Secrets Manager. Keine GitHub-CLI-, Betreiber-
  oder Installation-Tokens für Benutzer-Repositories.
- GitHub bestätigt vor jedem Zugriff Repository-ID, Fork-Status, Schreibrecht und
  `source.id == 1168467997` (Accelerator). Archivierte oder deaktivierte Repositories
  sowie das Upstream selbst werden abgelehnt. Geänderte Rechte gelten sofort beim
  nächsten API-Zugriff; die UI-Auswahl ist kein Berechtigungsnachweis.
- Commit-Ziel ist fest `lzc/configurations`; der Dateipfad wird aus einer UUID
  abgeleitet. Symlinks, Submodule, unvollständige Git-Trees und inkompatible Dateien
  dürfen nicht überschrieben werden.
- Erwarteter Branch-Commit wird vor dem Schreiben geprüft. Neuer Tree basiert auf
  diesem Snapshot und enthält genau einen geänderten Pfad. Neuer Commit hat genau
  diesen Parent. Branch-Updates verwenden `force: false`; parallele Änderungen
  führen zum Konflikt. Keine automatische Wiederholung mit neuer Basis und kein
  stilles Überschreiben. Bei konkurrierender Erstanlage schlägt die Ref-Erstellung
  fehl; es bleiben allenfalls nicht referenzierte Git-Objekte zurück.
- Bei Netzwerkabbruch bleibt das Ergebnis zunächst unklar. Die UI behält die
  Konfigurations-ID und den Entwurf; Benutzer sollen den GitHub-Stand prüfen und
  gegebenenfalls neu öffnen. Ein Wiederholungsversuch überschreibt keinen neuen Head.
- Fremde Template-Versionen werden zurückgewiesen, nicht still konvertiert.
  Backend und Frontend verwenden denselben aus HCL generierten Katalog.

GitHub verlangt für automatische Fork-Erstellung bei GitHub Apps am Zielaccount
Zugriff auf alle Repositories und Zugriff auf das Quellrepo am Quellaccount. Wir
weiten dafür keine Installationsrechte aus. Der GitHub-Fork-Dialog ist der aktuelle
Erstellungsweg; eine automatische API-Erstellung bleibt offen.

## URLs und History

| Ansicht | URL |
| --- | --- |
| Template-Katalog | `/templates` (auch `/`) |
| Template-Vorschau | `/templates/<template-id>` |
| Editor | `/configurations/edit/basics`, `/projects`, `/review` unter demselben Präfix |
| Fork-Auswahl | `/repositories` |

Ansichtswechsel und Editor-Schritte verwenden `history.pushState`. `popstate`
stellt die Ansicht bei Zurück/Vorwärts wieder her; Eingaben bleiben im laufenden
Tab erhalten. Nur die kurzen OAuth-Weiterleitungen sichern Entwürfe zeitlich
begrenzt im Session-Speicher. Ein normaler Reload ersetzt keine Git-Speicherung;
ohne lokalen Entwurf bietet der Editor die Wiederherstellung aus einem Fork an.

Der API-Server liefert das UI nur für ausdrücklich bekannte Seitenpfade. Fehlende
API-/Auth-Endpunkte und Assets behalten ihre Fehlerantwort. Direkte Vorschau-Links
und Reload sind dadurch auch auf CF möglich.

## Abnahme und nächste Schritte

- [x] 34 Anwendungstests: Herkunft/ID/Rechte, Session/CSRF, Pfadschutz, Commit-Inhalt,
  veralteter Head, konkurrierendes Schreiben und Erstanlage.
- [x] Zwölf Browserfälle auf Desktop/Mobilgeräten: Editor, Login, History, Deep Links,
  Fork-Auswahl, Konflikt, neue Kopie und Wiederöffnen nach Reload.
- [x] HCL-Importer geprüft; gemeinsamer Katalog bytegleich zum bisherigen Stand.
- [x] [Validierung 36700860848](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36700860848) und [Release 36700861231](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36700861231) erfolgreich (`c77345a`).
- [x] Live-Browser: Vorschau-URL, Editor-Schritte, Zurück/Vorwärts, Entwurfserhalt,
  Fork-URL und Reload geprüft; anonyme Lese-/Schreibzugriffe 401, fehlende Assets 404.
  Test ohne Benutzer-Session und ohne echte Repository-Schreibzugriffe.
- [ ] Persönlichen Fork verbinden und echten GitHub-Commit über UI abnehmen.
- [ ] PR-Workflow für geschützte Arbeitsbranches ergänzen; derzeit klare Fehlermeldung.
- [ ] Automatische Fork-Erstellung bei passenden Installationsvoraussetzungen.
- [ ] Versionierte Compiler-Ausgabe und Deployment-Unterstützung.
- [ ] Ausbau der Pagination: derzeit 25 Repository-Einträge je Seite (max. 100 Seiten),
  höchstens 30 Konfigurationsdateien im ausgewählten Branch. Nicht unterstützte
  Dateien und abgeschnittene Konfigurationslisten werden angezeigt.

Quellen:
- https://docs.github.com/en/rest/repos/forks#create-a-fork
- https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user
- https://docs.github.com/en/rest/git/refs
- https://docs.github.com/en/rest/git/trees
