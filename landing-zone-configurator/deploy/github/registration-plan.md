# Einmalige GitHub-App-Registrierung

Registrierung am 2026-09-30 durch den Benutzer abgeschlossen. Die App gehört zum Configurator-Projekt;
sie ist kein Benutzer-Token und kein zentrales Repository-Servicekonto.

## Konkrete Registrierung

- Name: `LZ Configurator Dev 7dbff805` (Verfügbarkeit wird von GitHub geprüft).
- Bestätigter Owner für Entwicklung: `lweberru`; später an `stackitcloud` übertragbar.
- Alternative: `stackitcloud`, sofern der angemeldete Benutzer Apps für die Organisation anlegen darf.
  Die geprüfte Organisationsmitgliedschaft von `lweberru` ist `member`, nicht `admin`.
- Sichtbarkeit: öffentlich installierbare App für mehrere unabhängige Benutzer/Kunden.
- Homepage und OAuth-Callback: siehe `app-manifest.json`.
- Repository-Rechte: Metadata read, Contents write, Administration write.
  GitHub verlangt Administration write für die Fork-API. Diese Berechtigung ist
  umfassender als der vom Configurator angebotene Fork-Vorgang; Installationen
  deshalb auf die benötigten Repositories begrenzen. Für automatische Forks gelten
  zusätzliche GitHub-Installationsvoraussetzungen, siehe README.
- Keine Operator-PATs oder Installation-Tokens für Benutzer-Repository-Aktionen.
- Expiring User Tokens aktiviert lassen; initial erneute Anmeldung nach höchstens 8 Stunden.

## Registrierung und Credential-Ablage

Nach ausdrücklicher Freigabe einen nur an `127.0.0.1` gebundenen, kurzlebigen
Registrierungshelfer starten. Die lokale Seite enthält das versionierte Manifest
und führt den Benutzer zur GitHub-Bestätigung. State und Browserbindung absichern;
den Code einmalig gegen Client-ID/Client-Secret tauschen. Kein Auslesen bestehender
Browser-Credentials, kein Secret im Chat oder Log.

Client-ID/Client-Secret ausschließlich unter `.local/github/app-registration.json`
mit Dateimodus 0600 ablegen. Einen erzeugten GitHub-App-Private-Key nicht für
Repository-Zugriffe verwenden. Backend-Bindung und Environment-Secrets folgen als
getrennter, prüfbarer Deployment-Schritt; keine Secrets im Manifest oder Frontend.

## Status

- [x] Owner und Rechte ausdrücklich freigegeben.
- [x] App registriert: https://github.com/apps/lz-configurator-dev-7dbff805
- [x] Client-Zugangsdaten lokal mit Modus 0600 gespeichert; keine Secrets versioniert.
- [x] Manifest korrigiert: `hook_attributes.url` ist auch bei `active: false` erforderlich.
- [ ] Installation auf ausgewählten Benutzer-Repositories bestätigen.
- [ ] Geschützte Backend-Bindung und Login live abnehmen.

Installation: https://github.com/apps/lz-configurator-dev-7dbff805/installations/new

Quelle: https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest
