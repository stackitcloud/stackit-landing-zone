<a id="web-interface"></a>

# Web-Oberfläche

[English](README.md) | [Deutsch](README.de.md)

Geplant: React/TypeScript, Fachformulare, Topologie, Chat und Plan-/Run-Ansicht. Keine Cloud- oder GitHub-Tokens im Browser.

<a id="template-editor-initial-domain-implementation"></a>

## Template-Editor (erster fachlicher Stand)

- Acht aus `src/config` generierte Templates mit Suche und Strukturvorschau.
- Standalone-Kopie bearbeiten: Organisation, Region, Verantwortliche, Landing Zones,
  Umgebungen, Secrets-Manager-Auswahl und Sandboxes.
- Originale Portal-Design-Tokens (digits/light), lokal ausgelieferte Markenassets;
  Herkunft und noch offene visuelle Abnahme in `docs/design-reference.md`.
- Zustand nur im aktuellen Tab-Speicher; keine Cloud-/GitHub-Schreiboperationen.
- Download `landing-zone.lzc.json`: versionierter Entwurf mit Template-Quellhash
  und fachlich bearbeiteten Konfigurationswerten. Kein direkt ausführbarer
  `.tfvars.json`-Export und noch kein Import dieses Entwurfformats.
- Netzwerk-Templates bleiben vorerst schreibgeschützt. Der Standalone-Editor setzt
  ausdrücklich `corporate: false`, weil das aktuelle Quelltemplate ohne Hub sonst
  den Accelerator-Default `true` erben würde.

Lokale Abnahme aus `app/` nach `npm run build`:

```sh
npx playwright install chromium
npm run test:e2e
```

Alternativ mit installiertem Chrome: `LZC_TEST_CHROME=true npm run test:e2e`.
Tests verwenden isolierte Browser-Kontexte ohne vorhandene Benutzersitzung.
Screenshots/Fehlertraces liegen ignoriert unter `.local/browser-tests` und werden
in der Validierung als kurzlebige CI-Artefakte bereitgestellt. Desktop- und
Mobilbreite prüfen Suche, Vorschau, Validierung, Download und Quellisolierung.
