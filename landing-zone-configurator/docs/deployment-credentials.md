# Persönliche Deployment-Zugänge

Stand: 2026-09-30. Nächster Baustein nach Fork-Speicherung und tfvars-Export.

## Umfang und Benutzerablauf

1. Mit GitHub anmelden und **Deployment-Zugänge** öffnen (`/credentials`).
2. Einen Profilnamen vergeben und eine STACKIT-Service-Account-Schlüsseldatei als
   JSON mit enthaltenem privatem RSA-Schlüssel auswählen.
3. **Zugang sicher speichern**. Die Liste zeigt Name, Service-Account und Status;
   der Schlüssel wird nicht wieder angezeigt oder zum Download angeboten.
4. **Zugang löschen** entfernt alle Secret-Versionen aus dem Configurator. Das
   widerruft den Schlüssel bei STACKIT nicht. Ein Widerruf erfolgt separat in der
   STACKIT-Service-Account-Verwaltung.

Unterstützt wird zunächst der Key Flow mit eingebettetem RSA-Schlüssel ab 2048 Bit.
Dateien mit deaktiviertem oder bereits abgelaufenem Schlüssel, widersprüchlichen IDs,
fehlendem privaten Schlüssel oder unbekannter Audience werden abgewiesen. Diese
Prüfung bestätigt nur das Dateiformat und lokale Schlüssellesbarkeit. Ein gültiges
Format beweist weder aktuelle STACKIT-Rechte noch Übereinstimmung mit dem bei STACKIT
registrierten öffentlichen Schlüssel. Status daher ausdrücklich **Berechtigungen
noch nicht geprüft**. Separate PEM-Dateien, WIF, Rotation im vorhandenen Profil,
Delegation und automatische Cloud-Rechteprüfung folgen später.

[Offizielles STACKIT-Schlüsseldateiformat](https://docs.stackit.cloud/platform/access-and-identity/service-accounts/how-tos/manage-service-account-keys/).

## Daten und Zugriff

- `lzc.credential_profiles` enthält ausschließlich Metadaten: UUID, Mandant,
  Eigentümer, Profilname, Service-Account-Mail, Key-ID, Speicherstatus und Zeitstempel.
- Migration `002_credential_profiles.sql` läuft über den vorhandenen separaten
  CF-Migrations-Task als `configurator_migration`. Die Laufzeitrolle bleibt ohne
  Tabellenbesitz und ohne BYPASSRLS. Keine neue Cloud-Ressource oder manuelle
  Rechteerweiterung erforderlich; bestehende IaC-provisionierte Dienste werden genutzt.
- Forced RLS verlangt aktuellen Mandanten, Mitgliedschaft und Eigentümer. Auch
  andere Administratoren desselben Mandanten sehen oder löschen persönliche Profile
  nicht. Anlegen verlangt `admin` oder `deployer`. Rollen/Identität stammen aus der
  Backend-Session, niemals aus dem Request-Body.
- Secret-Pfad in der dedizierten Configurator-Instanz:
  `configurator/tenants/<tenant>/users/<user>/credentials/<profile>`.
  UUIDs werden serverseitig erzeugt/validiert. Secret-Daten binden Mandant, Benutzer,
  Profil und Typ; keine GitHub-Sessionbindung, damit Profile nach erneutem Login bleiben.
- Die UI sendet die Datei nur mit explizitem Speichern über HTTPS. Kein Git-Commit,
  kein Browser-Storage, kein Query-Parameter, kein Secret-Download-Endpunkt. Der
  Datei-Input wird nach dem Versuch geleert; Navigation/Abmeldung entfernt die
  Komponente. JavaScript garantiert keine physische Speicherlöschung.
- GET listet Metadaten. POST und DELETE benötigen Session, exakte Origin und CSRF.
  `Cache-Control: no-store`; keine Body-/Secret-/Parserfehler in Anwendungslogs.
- Maximal 20 Profile pro Benutzer und Mandant; konkurrierendes Anlegen wird durch
  einen PostgreSQL-Advisory-Lock beim Reservieren serialisiert. UI-Dateilimit 24 KiB,
  API-Bodylimit 32 KiB. Keine automatische Wiederholung von POST.

Der App-Benutzer hat die bereits genehmigten instanzweiten Secrets-Manager-Rechte.
Die Trennung persönlicher Secrets wird durch Backend-Pfade, Session und Datenbank-RLS
implementiert; es bestehen noch keine separaten Vault-Policies pro Mandant. Ein
kompromittiertes Backend liegt damit weiterhin innerhalb der Vertrauensgrenze.

## Fehler und Löschung

Vor dem Secret-Schreiben wird ein `pending`-Metadatensatz dauerhaft reserviert.
Danach sperrt eine Transaktion genau diese Zeile, schreibt mit Vault-CAS `0` und
setzt bei Erfolg `stored`. Create/Delete können dasselbe Profil dadurch nicht
während des Schreibens gegenseitig entfernen. Nach Crash oder unklarer Antwort
bleibt mindestens der Metadatensatz zur Bereinigung erhalten. `pending` bedeutet
nicht verwendbar; UI bietet Löschen und Neuanlegen, keine blinde Wiederholung.

Löschen sperrt die autorisierte Zeile, entfernt zuerst Vault-Metadaten einschließlich
aller Secret-Versionen und danach den DB-Datensatz. 404 beim Secret-Löschen gilt als
bereits entfernt. Bei Abbruch kann ein Metadatensatz verbleiben, dessen Secret schon
fehlt; Löschen ist wiederholbar. Ein späterer Runner darf sich deshalb niemals allein
auf `stored` verlassen, sondern muss Existenz, Secret-Identität und Berechtigung vor
jeder Verwendung erneut prüfen. Es gibt noch keinen Runner-Zugriff auf diese Profile.
Vault-Login-Tokens werden nach jeder Operation widerrufen, auch bei Fehlern.

## Abnahme und weitere Arbeit

- [x] Schlüsseldatei formal und kryptografisch lokal prüfen.
- [x] Persönliche Profile anlegen, auflisten und löschen; kein Schlüssel-Leseendpunkt.
- [x] Session-/CSRF-/Identitätsinjektions- und Secret-Pfad-Negativtests.
- [x] Echtes PostgreSQL: fremde Mandanten, fremde Eigentümer im selben Mandanten,
  fehlende Rolle, kein Secret in Metadaten und wiederholbare Fehlerbereinigung.
- [x] Feature-Branch-Release inklusive Migration auf lzc-dev abnehmen.
- [ ] Persönliches Profil über die live bereitgestellte UI abnehmen.
- [ ] STACKIT-Authentifizierung und lesende Rechte-/Zielprüfung ergänzen.
- [ ] Freigegebenen Accelerator-Commit und unveränderliche Konfiguration binden.
- [ ] Kundenbezogenen Remote State, Runner, Queue, Plan und expliziten Apply ergänzen.
- [ ] Rotation, automatische Bereinigung, Audit-Ereignisse und Delegationen ausbauen.

Die Betreiber-Schlüsseldatei aus dem Repository-Root wird nicht als Benutzerprofil
importiert. Lokale Tests nutzen nur generierte oder künstliche Testschlüssel.

## Technische Release-Abnahme

Code-Commit `629fab6` auf `feature/landing-zone-configurator`.
[Validierung 36706267168](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36706267168)
und [Release 36706267163](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36706267163)
erfolgreich. 38 Anwendungstests, neun echte PostgreSQL-Tests und 14 Browserfälle
bestanden. Migration und CF-Verbindungstests zu PostgreSQL und Secrets Manager grün.
Mobile Profilverwaltung visuell anhand des Test-Screenshots geprüft.
Live bestätigt: `/credentials`, Reload, mobile Breite, keine Browserfehler und
401 für anonymes GET/POST/DELETE. Kein echter Schlüssel für die Live-Abnahme hochgeladen;
der persönliche Upload durch den Benutzer bleibt ein separater Abnahmepunkt.

## Korrektur: aktuelles STACKIT-Accounts-Schlüsselformat

Die ursprüngliche Audience-Allowlist berücksichtigte nur die älteren Service-Account-
Hosts und wies gültige Dateien mit `credentials.aud = https://accounts.stackit.cloud`
zurück. Die Validierung akzeptiert nun auch diese Audience und bewahrt das optionale
`credentials.tokenEndpoint`, insbesondere `https://accounts.stackit.cloud/oauth/v2/token`.
Nur ausdrücklich bekannte HTTPS-Endpunkte sind zulässig; keine beliebigen Upload-URLs.
Regressionstest: aktuelles Format wird akzeptiert und vollständig an den Secret-Store
übergeben; manipulierte Token-Endpunkte werden abgewiesen. Bestehende ältere Dateien
ohne `tokenEndpoint` bleiben unterstützt. Ein abgewiesener Upload hat keinen Profil-
oder Secret-Schreibvorgang ausgelöst.

Quellen: [STACKIT Token-Abruf](https://docs.stackit.cloud/platform/access-and-identity/service-accounts/how-tos/get-access-token/),
[SDK-Unterstützung für tokenEndpoint](https://github.com/stackitcloud/stackit-sdk-go/releases/).

Fix-Abnahme: Commit `6c95098`, [Validierung 36711832436](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36711832436)
und [Release 36711832452](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36711832452)
erfolgreich. 39 Anwendungstests grün. Die vorhandene lokale STACKIT-Schlüsseldatei
besteht die Formatprüfung einschließlich Erhalt des Token-Endpunkts; dabei kein
Upload und keine Ausgabe von Schlüsselinhalten. Live-Seite und anonymer Zugriffsschutz
nach Release geprüft; persönliche erneute Upload-Abnahme bleibt beim Benutzer.
