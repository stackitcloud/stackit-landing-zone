# STACKIT-Login, optionale GitHub-Verbindung und Mandantentrennung

Stand: 2026-10-06. STACKIT als primärer Login lokal implementiert und getestet.
Die ausdrueckliche Dev-Client-Freigabe ersetzt keine Produktionsregistrierung.
Die Organisationsbindung ist mit Migrationen bis 034 lokal aktiviert, ihre
erfolgreiche Kundenabnahme steht noch aus. GitHub bleibt als Legacy-Modus erhalten.

## Aktueller Login-Blocker und Nachweisdiagnose

Ein anonymer Browser ohne bestehende STACKIT-Sitzung erreicht mit dem freigegebenen
CLI-Device-Client die Provider-Seite `/ui/login/user`, aber nur mit einem
Weiter-Button und versteckten Formularfeldern, ohne Login-Eingabe. Weiter fuehrt
wieder auf dieselbe Seite. Dies wurde auch mit `openid email profile` und mit
manueller Code-Eingabe am Basis-Bestaetigungslink reproduziert. Scope- oder
Linkwechsel sind daher kein belegter Fix. Der Befund liegt auf der Provider-Seite;
die konkrete Login-Policy-/Client-Ursache muss mit STACKIT geklaert werden.
Eine bereits bestehende STACKIT-Sitzung ist nur ein beobachteter Workaround,
keine Cold-Login-Abnahme. Ein eigener registrierter Web-OIDC-Client bleibt offen.

Die Nachweisoberflaeche zeigt den angemeldeten Configurator-Benutzer und die
zuletzt bestaetigte STACKIT-E-Mail. Abgelaufene Nachweise bleiben als solche
gekennzeichnet; Benutzer-/Tenantwechsel entfernen die bisherige Anzeige.
Bekannte Zugriffs-, Berechtigungs-, Identitaets- und Provider-Antwortfehler haben
kontrollierte DE/EN-Meldungen. Unbekannte Codes und Providerdetails werden nicht
angezeigt. Fehler erlauben weder Organisationsbindung noch Wiederverwendung
alter Owner-Rechte. Der echte gemeldete Organisationsfehler ist noch nicht
identifiziert: im eigenen authentifizierten Browser neu laden, Nachweis pruefen
und die konkrete Meldung samt angezeigter Identitaet pruefen. Keine Tokens teilen.

Nachweise: 61 Device-/Uebersetzungstests, TypeScript und 14 vorhandene erweiterte
Desktop-/Mobil-Browserfaelle bestanden. Die Browserfaelle verwenden synthetische
Identitaeten und gemockte APIs; sie sind keine reale Organisationsabnahme.
Keine API-Neustarts, Kundenmigrationen, Cloud-Plans oder Applies fuer diese
Diagnoseaenderung. #91 bleibt offen.

## Primärer STACKIT-Login

Platform Engineer und Application Owner melden sich mit ihrer persönlichen
STACKIT-Identität an und wählen bei mehreren Mitgliedschaften ihren aktiven Tenant.
Der Application Owner benötigt weder GitHub noch einen Service Account.
Der Platform Engineer hinterlegt den technischen STACKIT-Service-Account-Zugang;
Produktkataloge verwenden danach denselben Zugang automatisch, ohne weitere
Profil- oder Projektwahl im Editor. Persönliche Login-Tokens werden nicht für
technische STACKIT-Automatisierungen gespeichert oder wiederverwendet.

`POST /auth/stackit/start` beginnt einen browsergebundenen Device Flow.
Der Browser erhält nur den öffentlichen Bestätigungscode und den festen
STACKIT-Bestätigungslink. `/auth/stackit/poll` verifiziert die Identität serverseitig
und erzeugt die normale opaque Session. Ein vorhandenes ID-Token wird vollständig
geprüft; fehlt es, wird ausschließlich Userinfo mit dem im selben Device Grant
erhaltenen Access Token verwendet. Ein bestätigtes persönliches Konto ist Pflicht.
Issuer und Subject bestimmen den stabilen Benutzer, niemals allein die E-Mail-Adresse.

Device-Cookies sind `Secure`, `HttpOnly`, `SameSite=Strict`; Sessions verwenden
`SameSite=Lax`. Pre-Auth-POSTs verlangen die exakte Origin, authentifizierte
Änderungen zusätzlich CSRF. Sessions gelten höchstens acht Stunden und enden
spätestens 30 Sekunden vor dem Provider-Token. Kein Refresh-Token wird behalten.
Offene Device-Flows liegen nur im Speicher einer Instanz: Neustart verwirft sie;
mehrere Instanzen benötigen vor Aktivierung eine gemeinsame Ablage oder Sticky Routing.

## Autoritativer Organisationsnachweis

Login oder Resource-Manager-Lesezugriff sind kein Adminnachweis. Im aktiven
Organisationsarbeitsbereich startet ein Platform Engineer mit Mitgliederverwaltung
die Pruefung ausdruecklich. Dabei wird sein bisheriger aktueller
Organisationsnachweis entfernt; menschliche Identitaet und historische Audits
bleiben erhalten. Ein fehlgeschlagener neuer Nachweis darf keine alte
Owner-Freigabe wiederverwenden.

Der neue Device Grant verifiziert dieselbe menschliche Identitaet und die exakte
Organisation. Derselbe kurzlebige menschliche Bearer Token fragt am festen
IAM-Origin `https://authorization.api.stackit.cloud` folgende APIs ab:

- `GET /v2/users/{verifiedEmail}/permissions?resourceType=organization&resource={organizationId}`
- `GET /v2/organization/{organizationId}/roles`

Antworten werden auf Organisation, Ressourcentyp, Umfang und Struktur geprueft.
Das konservative Minimum umfasst alle Rechte genau einer nicht leeren
offiziellen `owner`-Rolle. Die effektiven Benutzerrechte muessen diesen Satz
vollstaendig enthalten. Leserechte, fehlende/mehrdeutige Owner-Rollen und
gesperrte Rollenabfragen erteilen keine Bindungsautoritaet. Grundlage ist der
offizielle STACKIT-Go-SDK-Vertrag, Revision
`7746310c7fe0a5e3f5c5e6e9b1be69d48c6184d9`, `services/authorization/v2api`.

Erst eine separate Bestaetigung sendet
`POST /api/v1/stackit/identity/bind-organization` mit ausschliesslich
`{"confirmOrganizationBinding":true}`. Origin, CSRF, Tenant, echte aktuelle
DB-Session, PE-Rolle, Mitgliederverwaltung und nicht abgelaufene/widerrufene
Identitaets-/Owner-Nachweise werden erneut geprueft. SQL-seitig erzeugte
unveraenderliche Autorisierungsbelege binden Organisation, Benutzer,
Issuer/Subject, Rechte und Gueltigkeit. Die atomare Bindung referenziert diesen
Beleg im Audit; Wiederholungen liefern denselben Bindungsbeleg.

Migrationen `023_organization_authorizations.sql` und
`024_organization_binding.sql` sind erforderlich. Alte APIs ohne Capability
zeigen die Steuerung nicht an. `organization_verified` bezeichnet die
historisch bestaetigte Zuordnung, nicht unbegrenzte aktuelle Owner-Rechte.
Die Bindung startet weder Cloud-Plan noch Apply und ersetzt keinen technischen
Job-Grant. Echte Zwei-Organisations-Abnahme, Produktions-Client-Registrierung
und Least-Privilege-Providerqualifizierung bleiben fuer #91 erforderlich.

## GitHub nur für Repository-Funktionen

Im STACKIT-Modus ist GitHub erst unter GitHub-Forks über **GitHub verbinden** nötig.
Der Start erfolgt authentifiziert per `POST /auth/github/connect` mit Origin/CSRF.
Der OAuth-Callback ist an dieselbe bestehende Session gebunden und verbindet die
geprüfte GitHub-ID mit diesem Benutzer, ohne Benutzer oder Tenant zu wechseln.
Bereits anderweitig zugeordnete Identitäten werden abgelehnt; Konten werden nicht
anhand gleicher E-Mail-Adressen zusammengeführt. Die Verbindung ist für Login und
Application-Owner-Bestellungen nicht erforderlich.

Der bestehende forkbasierte Plattform-Plan bleibt eine Repository-Funktion und
benötigt deshalb weiterhin diese optionale Verbindung. Ein echter isolierter
Application-Plan ist durch diese Login-Änderung noch nicht angeschlossen.

## Aktivierung und Bestandskonten

Vor Aktivierung müssen Migrationen `011_stackit_identity.sql` und
`012_stackit_login.sql` angewendet sein. Mit `LZC_AUTH_ENABLED=true` und
`LZC_STACKIT_DEVICE_ENABLED=true` wird STACKIT primär; GitHub-Client-ID und
Client-Secret sind dann optional, müssen aber gemeinsam gesetzt werden.
`LZC_STACKIT_CLI_CLIENT_APPROVED=true` ist eine ausdrückliche Freigabe für die
Wiederverwendung des CLI-Clients, kein technischer Schalter zum Umgehen der
Registrierungsfrage. Der Benutzer hat die Nutzung für Configurator-Dev am
2026-10-02 ausdrücklich freigegeben; das Ticket für einen eigenen OIDC-Client
bleibt offen. Diese Dev-Freigabe ist keine Produktionsfreigabe.

Bestandsnutzer können ihre STACKIT-Identität mit einer noch gültigen alten Session
explizit binden; Benutzer-ID, Tenant und gespeicherte GitHub-Zuordnung bleiben
erhalten. Eine ungebundene, bereits abgemeldete GitHub-Identität wird bei einem
STACKIT-Login nicht automatisch zusammengeführt. Der Rollout benötigt deshalb
eine kontrollierte Bindung der Bestandskonten vor dem Wechsel.

Lokale Prüfergebnisse und noch offene Live-Grenzen stehen im
[Prüfbericht](runtime-validation-report.md).

## Legacy-Ablauf: GitHub als Login

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

Im Legacy-Modus aktiviert `LZC_AUTH_ENABLED=true` Login erst zusammen mit `LZC_GITHUB_CLIENT_ID`
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
- [x] OAuth-Zugangsdaten nach ausdrücklicher Freigabe im Release-Environment und CF-Backend bereitgestellt.
- [x] [Release 36693906545](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36693906545): Migration erfolgreich; privilegierte Task-App entfernt; Web-App, PostgreSQL- und Secrets-Verbindungstests erfolgreich.
- [x] [Login-Release 36695423593](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36695423593): GitHub-Login aktiviert, Secrets-Schreiben/Lesen/Löschen erfolgreich; Health 200 und anonyme Session 401. OAuth-Weiterleitung, Client-ID, Callback, PKCE S256, State und sicheres Cookie live geprüft.
- [x] Echten GitHub-Login und Logout vom Benutzer bestätigt.
- [ ] Installation auf den benötigten Repositories und Fork-Voraussetzungen prüfen.
- [x] Fork-Auswahl, Speichern und Wiederöffnen implementiert und simuliert getestet; Live-Abnahme siehe [Forks und Navigation](forks-and-navigation.md).
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
Live-Aktivierung und Secrets-Rundtrip wurden mit Release `36695423593` erfolgreich abgeschlossen.
