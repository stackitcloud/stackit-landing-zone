# GitHub-Login und Mandantentrennung

Stand: 2026-09-30. Migration und App auf STACKIT bereitgestellt; GitHub-Login bleibt bis zur Credential-Freigabe deaktiviert.

## Ablauf

1. `/auth/github/start` speichert einen fünf Minuten gültigen Login-Vorgang in
   PostgreSQL: State-Hash, Browserbindungs-Hash und PKCE-Verifier. Das Browsercookie
   ist `Secure`, `HttpOnly`, `SameSite=Lax` und besitzt den `__Host-`-Präfix.
2. Der Callback verbraucht den Vorgang atomar und tauscht den Code mit PKCE gegen
   ein zeitlich begrenztes GitHub-App-**Benutzertoken**. `/user` bestätigt die Identität.
   Installation-Tokens und nicht ablaufende Tokens werden abgelehnt.
3. Die Datenbank erzeugt einen persönlichen Arbeitsbereich mit Mitgliedschaft.
   Die Anwendung legt das GitHub-Token im Secrets Manager ab. Erst danach erhält
   der Browser ein zufälliges Sessioncookie; die Datenbank enthält nur dessen Hash.
4. Die Session gilt höchstens acht Stunden, mit Abstand zum Tokenablauf. Refresh-
   Tokens werden vorerst verworfen; danach ist eine erneute Anmeldung erforderlich.
5. Abmelden verlangt exakte Origin und einen sitzungsgebundenen CSRF-Wert. Zuerst
   wird die DB-Session ungültig, anschließend ihr Secret gelöscht.

Entwürfe werden für die OAuth-Weiterleitung maximal zehn Minuten in `sessionStorage`
des Tabs gesichert, gegen Struktur und Template-Hash geprüft und nach Rückkehr
entfernt. Dies ersetzt weder Datenbankpersistenz noch Speichern im Fork. Keine
GitHub-Tokens, Client-Secrets oder Sessiontokens in JavaScript-Speicher.

## Vertrauensgrenzen

- `configurator_app` ist weder Datenbankbesitzer noch Superuser oder BYPASSRLS.
- Konfigurationen, Mandanten und Mitgliedschaften besitzen erzwungene RLS.
  Der Server setzt Benutzer- und Mandanten-ID ausschließlich transaktionslokal
  aus einer validierten Session. Fehlender Kontext gewährt keinen Zugriff.
- Kleine SECURITY-DEFINER-Funktionen verwalten Login/Sessions mit festem
  `search_path`; die App darf Sessions oder Mitgliedschaften nicht direkt auslesen
  beziehungsweise Mitgliedschaften ändern. SQL-Injection bleibt eine kritische
  Backend-Grenze: parametrisierte Queries sind zwingend.
- Secrets-Manager-Berechtigungen gelten für die dedizierte Instanz insgesamt.
  Pfade und gespeicherte Metadaten binden Tokens an Session, Benutzer und Mandant.
  Das ist Anwendungsautorisierung, keine pro Mandant durch Vault erzwungene Policy.
  Die instanzweiten Schreibrechte wurden am 2026-09-30 ausdrücklich freigegeben.
- Keine Kunden-Repository-Operation verwendet Operator-PATs, App-Private-Keys oder
  Installation-Tokens. Der Client-Secret dient allein dem OAuth-Codeaustausch.

## Migration und Release

SQL-Migrationen unter `app/apps/api/db/` laufen mit `configurator_migration` in einer
separaten CF-Task-App ohne Route und ohne GitHub-/Secrets-/Model-Serving-Bindings.
Die Release-Pipeline führt `cf push --task`, `cf run-task ... --wait` und danach
`cf delete` sichtbar aus. Die Web-App erhält nie das Passwort des Datenbankbesitzers.
Migrationen sind transaktional, über Advisory Lock serialisiert und mit SHA-256
gegen Änderungen bereits angewendeter Dateien abgesichert. Keine automatischen
Down-Migrationen; alte Releases müssen mit dem neuen Schema kompatibel bleiben.

`LZC_AUTH_ENABLED=true` aktiviert Login erst zusammen mit `LZC_GITHUB_CLIENT_ID`
und `LZC_GITHUB_CLIENT_SECRET` aus dem geschützten Release-Environment. Die API
prüft beim Start die Sessionfunktion. Der Release-Verbindungstest prüft zusätzlich
Secrets schreiben, lesen und dauerhaft löschen an einem zufälligen Probe-Pfad.
Rohe CF-Routerlogs werden nicht in CI ausgegeben, da OAuth-Codes in URLs stehen
können. Applikationslogs enthalten keine Request-URLs oder Cookie-/Tokenwerte.

## Abnahme und offene Arbeiten

- [x] GitHub-App unter `lweberru` registriert; Client-Zugangsdaten lokal 0600.
- [x] Build, 25 Anwendungstests und sechs echte PostgreSQL-Integrationstests bestanden.
- [x] Sechs Browserfälle auf Desktop/Mobilgeräten inklusive Login-Weiterleitung,
  Entwurfserhalt und Logout erfolgreich (GitHub dabei simuliert).
- [x] CI erhält die PostgreSQL-Tests vor Validierung und Release.
- [x] Plattform-Output via [CI-Apply 36693151989](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36693151989) aktiviert (keine Ressourcenänderung).
- [x] Secrets-Schreibrechte via [CI-Apply 36693644577](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36693644577) aktiviert (ein Update, keine Ersetzung).
- [x] [Validierung 36693906434](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36693906434) für `cd9d79f` erfolgreich, einschließlich PostgreSQL und Browsern.
- [ ] OAuth-Zugangsdaten im Release-Environment und CF-Backend bereitstellen.
- [x] [Release 36693906545](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36693906545): Migration erfolgreich; privilegierte Task-App entfernt; Web-App, PostgreSQL- und Secrets-Verbindungstests erfolgreich.
- [ ] Secrets-Schreiben/Lesen/Löschen-Rundtrip nach Login-Aktivierung nachweisen. Der aktuelle Verbindungstest lief bei deaktiviertem Login nur lesend.
- [ ] Echten GitHub-Login und Logout mit Benutzer abnehmen.
- [ ] Installation auf den benötigten Repositories und Fork-Voraussetzungen prüfen.
- [ ] Fork-Auswahl und Speichern implementieren; derzeit keine Repository-Schreibzugriffe.
- [ ] Organisationen, Einladungen und Mandantenwechsel implementieren. Aktuell erhält
  jeder Benutzer einen eigenen isolierten Arbeitsbereich.
- [ ] Abgelaufene Sessiondatensätze und verwaiste Secrets regelmäßig bereinigen.
  Abgelaufene Tokens sind unbrauchbar; fehlgeschlagene Löschungen sind noch kein
  dauerhaft abgearbeiteter Cleanup-Job. Vor breiter Freigabe nachholen.
- [ ] Verteiltes Rate-Limit, Audit-Aufbewahrung und GitHub-Widerruf prüfen; das aktuelle
  Startlimit gilt nur je Instanz, Widerrufe werden spätestens bei API-Nutzung erkannt.

## Credential-Freigabe

Der Benutzer hat am 2026-09-30 den Transfer von `LZC_GITHUB_CLIENT_ID` und
`LZC_GITHUB_CLIENT_SECRET` für `lweberru/lz-configurator-dev-7dbff805` in
`stackitcloud/stackit-landing-zone`, Environment `lzc-dev-release`, sowie die
anschließende CF-Backend-Bindung ausdrücklich freigegeben. Beide Environment-Secrets
sind hinterlegt; `LZC_AUTH_ENABLED=true` ist für den nächsten Release gesetzt.
Live-Aktivierung und Secrets-Rundtrip sind bis zu dessen Abschluss noch offen.
