<a id="configurator-development"></a>

# Configurator-Entwicklung

[English](README.md) | [Deutsch](README.de.md)

TypeScript-Workspace mit React/Vite, Fastify, Fachmodell und API-Verträgen. Abhängigkeiten sind exakt gepinnt, das npm-Lockfile wird versioniert. Voraussetzungen: Node.js **24.21.0**, npm **11.19.0**. `../mise.toml` und `.node-version` dokumentieren die Runtime unabhängig vom Accelerator.

<a id="install-and-check"></a>

## Installieren und prüfen

Im Verzeichnis `landing-zone-configurator/app`:

```sh
npm ci
npm run check
```

`check` führt Biome, TypeScript-Prüfung einschließlich Tests, Produktionsbuild und Vitest aus. `npm run format` korrigiert Formatierung und Importreihenfolge.

`npm run test:plan` prüft zusätzlich den echten gepinnten STACKIT-Netzwerkprovider
über `scripts/test-application-network.sh`. Die Prüfung verwendet frischen
temporären lokalen State, eine bereinigte Umgebung, Dummy-Authentifizierung und
einen Loopback-IaaS-Endpunkt. Sie deckt fehlende Präfixe mit gefüllter/leerer
DNS-Liste, SNA-Standard `/28`, explizite `/24` und `/26`, verzögerte Präfixauflösung
sowie automatische Größe ohne konfigurierte DNS-Server ab. Gewöhnliche Provider-Mocks umgehen diese Validierung; es gibt
keinen Apply und keinen Zugriff auf eine Kunden-Cloud.

Falls die passende Runtime lokal noch fehlt, funktioniert ohne globale Installation beispielsweise:

```sh
npm exec --yes --package=node@24.21.0 --package=npm@11.19.0 -- npm ci
npm exec --yes --package=node@24.21.0 --package=npm@11.19.0 -- npm run check
```

<a id="start-locally"></a>

## Lokal starten

<a id="automated-assistant-topic-checks"></a>

### Automatisierte Assistant-Themenpruefung

Der [Testkatalog](../docs/assistant-test-catalogue.json) fuehrt jedes
Editor-/Accelerator-Feld genau einem Wissensthema zu: Typ, Optionalitaet,
Verantwortlichkeit, tatsaechlicher Vorschlagsmodus und erlaubter Patch-Pfad.
Regionale DNS-Formen, geschuetzte Werte und nur beratend unterstuetzte Komponenten
werden nicht als uebernehmbare Vorschlaege ausgegeben. Workflow-Themen ohne eigene
Felder sind ebenfalls enthalten. Fehlende/doppelte Zuordnungen und Drift brechen
`npm run assistant:check` sowie den normalen `npm run check` ab.

Die [synthetischen Chatfaelle](scripts/assistant-scenarios.ts) enthalten fuer jedes
Wissensthema eine feste Frage. Zusaetzliche Regressionen pruefen exakte
Grundlagenwiederherstellung, DNS-Kontaktprioritaet inklusive Template-Platzhaltern,
Domain-/Netzerhalt, vollstaendige SNA-Werte und additive Organisations-/Folder-Rollen
mit gespeicherten oder verifizierten E-Mail-Quellen. Unit-Tests pruefen auch, dass die
Pruefer fehlerhafte Antworten tatsaechlich ablehnen. Neue Felder/Themen erfordern
Review der Zuordnung und Fragen, danach `npm run assistant:generate` und Formatierung
des generierten Wissensbundles. Regenerieren allein ist kein fachlicher Nachweis.

Die Uebersichtsfaelle fuer Grundlagen, Governance, Firewall-Policy und Sandboxes
pruefen zusaetzlich konkrete native Feldnamen und wichtige Grenzen, nicht nur eine
Themenreferenz. Der Intentklassifikator erkennt reine Felduebersichten semantisch;
fuer diese vier Themen antwortet der Backend-Wissensvertrag direkt aus dem
Feldinventar und geprueften Grenzen, ohne eine zweite freie Modellformulierung.
Das ist ein eigener Beratungspfad, kein Ersatz fuer eine fehlgeschlagene
Modellantwort. Ausdrueckliche Rollenwuensche haben ebenfalls einen geprueften
Entwurfspfad: Der Intent bestimmt Rolle, E-Mail-Quelle und explizite Folder-Auswahl;
der Backend-Vertrag bildet daraus additive Felder ohne zweite freie Modellantwort.
Andere Anforderungen, Rueckfragen und Vorschlaege verwenden weiterhin das
Antwortmodell. Alle vertrauenswuerdigen Systemanweisungen werden in einer einzigen
Systemnachricht gesendet, damit Serving-Chatvorlagen keine frueheren Vertraege
verlieren. Tokenlimit-Abbrueche bleiben explizite Fehler (`completion_truncated`),
ohne automatische Wiederholung oder Teilannahme. SNA-Vorschlagstexte und deren
Streaming zeigen nur gepruefte Werte und bestaetigen niemals eine bereits
erfolgte Speicherung.

Firewall-Infrastruktur und HA unter `connectivity.firewall`/`firewalls` sind
als einzelne Entwurfsfelder vorschlagbar. Native HA ist ein Objekt mit
`backup_zone`, keine Checkbox/Boolean; weitere HA-Felder sind separat waehlbar.
Bestehende Single-/Map-Formen, Area-Keys und nicht angefragte Werte bleiben erhalten.
Neue Appliances brauchen Name, Zone, Flavor und beide bestaetigten freien Subnetze
zusammen; eine neue HA-Konfiguration ihre Backup-Zone. Unvollstaendige Auswahl
wird ohne Speicherung abgelehnt. Adresscontainment, Ueberlappungen, Node-/VIP-IPs
und unterschiedliche Zonen werden validiert. Unbekannte Produkte oder freie
Netze werden nicht aus Projektzahlen erfunden. Optionale Node-/VIP-IPs werden im
Modellvertrag auf gespeicherte oder benutzerbestaetigte Adressen begrenzt;
berechnete native Defaults bleiben ohne ungefragte explizite IP-Aenderungen erhalten.
Bei kombinierten Netzwerk-/Firewall-
Auftraegen wird ein vollstaendiges gespeichertes SNA wiederverwendet statt die
Firewall pauschal aufzuschieben. /16 bietet rechnerisch512 /25-Subnetze mit je128
Adressen vor Reservierungen, nicht128 Projektnetze. Regional-Patches, Policies,
Operator-Zugaenge, Entfernung und Ausfuehrung bleiben ausserhalb dieses Vertrags.
Feldannahme ist kein Deployment, Durchsatznachweis oder oeffentliches IP-Failover.
Breite Firewall-Einrichtung zeigt vorhandene Entwurfswerte und fragt auch neben
einem HA-Vorschlag nach der naechsten unbeantworteten Verkehrs-, Kapazitaets- oder
Betriebsentscheidung. Gezielte Einzelfeldaenderungen bleiben ohne Fragebogen.
Antworten zu Verkehrsregeln und Kapazitaet setzen einen laufenden Firewall-
Einrichtungsauftrag fort, statt ihn in isolierte Beratung umzuwandeln.
Explizit unbekannte Kapazitaet bleibt als offener Sizing-/Benchmark-Punkt erhalten;
danach folgt die noch fehlende Unterbrechungs-/Betriebsentscheidung. Bereits
benannte Betreiber und bestaetigte Verkehrswege werden nicht erneut abgefragt.
Regelanforderungen werden zusammengefasst, nicht als konfigurierte Regeln
ausgegeben. Bestaetigungen verweisen auf tatsaechliche Nutzeraussagen; interne
Steuertexte werden nicht als Rueckfragen angezeigt.
Der native Accelerator verwaltet Regeln, Aliase, Routen und NAT ueber
`firewall_config`; der aktuelle Chat kann diese Policy weder definieren noch
als Vorschlag uebernehmen. Gefuehrte Editor-Policy-Bearbeitung und
Assistant-Regel-/NAT-Vorschlaege sind gemaess Benutzerentscheidung Post-MVP
([#101](https://github.com/stackitcloud/stackit-landing-zone/issues/101)).
Im MVP pflegt der Firewall-Admin die Policy manuell in OPNsense.
Der gemeinsame Editor hat unter Betrieb / Firewall-Regeln bereits generische
native Felder, keine qualifizierte Policy-Verwaltung; sie bleiben erhalten.
Faehigkeits- und Definitionsanfragen erhalten die Grenze ausdruecklich,
ohne einen Regelvorschlag versprechende Rueckfragen. Infrastruktur/HA allein
garantiert weder Isolation noch Internetzugriff oder NAT.
Explizite Themenwechsel haben Vorrang vor alten Netzwerk-/Firewall-Merkmalen.
"Als naechstes Audit-Protokollierung einrichten" ist ein aktueller Auftrag,
keine Vertagung. Historische Netzwerkziele werden im anderen Thema nicht als
aktive Anforderungen weitergereicht; Belegpruefungen bleiben erhalten.
Audit Logging hat einen nativen Telemetry-Link/Router-/Logs-/Archiv-Vertrag
und generische Editorfelder unter Plattform. Der Chat verwendet jetzt denselben
nativen Eingabevertrag fuer uebernehmbare Audit-, Observability-, Federation-,
VPN-, DevOps-, Kubernetes-, Projekt-/Vorlagen- und Namespace-Vorschlaege.
Geschuetzte Bindings, Veroeffentlichung, Cloud-Ausfuehrung und Firewall-Policy
bleiben separate Workflows. Neue Audit-Konfigurationen benoetigen Retention,
ACL und die ausdrueckliche Object-Lock-Auswahl zusammen; mit Object Lock gilt
der Bereich 1-365 Tage. Es wird keine Einrichtung oder Ereigniszustellung behauptet.

Editor-Vorschlaege nutzen `merge` fuer partielle Objekt-/Map-Aenderungen,
`replace` fuer einen atomar geprueften vollstaendigen Ersatz und `default`
zum Entfernen eines optionalen Overrides. Listen bleiben atomar.
Ausgelassene Merge-Felder und bestehende Ressourcenkennungen bleiben erhalten.
Plattform-Entwuerfe bearbeiten Projektvorlagen nach stabilen Schluesseln;
Vorlagenkennungen entstehen serverseitig, nicht im Modell. Neue/entfernte
Vorlagen, Einstellungen und Parameterregeln bleiben lokale Entwurfsaenderungen.
Feldabdeckung und echte Compiler-/Export-/Identitaetspruefungen liegen in
[assistant-editor.test.ts](tests/assistant-editor.test.ts).
Abgelehnte Modellantworten liefern eine sichere Fehlerkategorie und
Diagnosekennung, keine Rohantworten oder Zugangsdaten. Konfigurations-Chat und
Template-Beratung zeigen lokalisierte Ursachen und naechste Schritte; Nachricht
und Antwortauswahl bleiben erhalten. HTTP und Antwortstreams nutzen denselben
Fehlervertrag. Es gibt keine automatische Wiederholung oder Teiluebernahme.
Chat und Feldannahme funktionieren auch mit ungespeicherten Editoraenderungen.
Der Chat erhaelt nur die freigegebenen Werte des aktuellen lokalen Entwurfs.
Rueckfragen im Konfigurations-Chat und in der Template-Beratung werden mit
`Antwort senden` direkt abgeschickt, ohne einen separaten Vorbereitungsschritt.
Vorhandener Text im Nachrichtenfeld wird mitgesendet. Bei einem Fehler bleiben
Text und Antwortauswahl fuer einen erneuten Versuch erhalten.
Vorschlaege werden ausschliesslich in den lokalen Entwurf uebernommen; Speichern
bleibt separat. Ein Drei-Wege-Abgleich bewahrt unabhaengige lokale und gespeicherte
Aenderungen. Nur echte Konflikte benoetigen eine ausdrueckliche Bestaetigung;
eine andere Revision allein sperrt die Uebernahme nicht. Aeltere Vorschlaege ohne
nachweisbaren Ausgangswert benoetigen eine Wertepruefung. Migration057 speichert
nur freigegebene Vorschlags-Ausgangswerte, keine vollstaendigen Entwuerfe/Secrets.
Die Vorschau veraendert weder die Konfiguration noch das gespeicherte Gespraech.
Ohne `draft`/`savedDraft` behaelt der API-Annahmepfad sein bisheriges transaktionales
Speicherverhalten und seine strikte Revisionspruefung.

`organization_owners` und `organization_auditors` sowie
`rm_folders[*].owner_emails`/`reader_emails` sind bei explizitem Rollenauftrag
einzeln uebernehmbare Vorschlagsfelder. Bekannte E-Mails werden nur aus der
angefragten Quelle verwendet; Template-Platzhalter, Entwicklerlogin und
Service Account ersetzen keine verifizierte menschliche Anmeldung. Unbekannte
E-Mail oder nicht benannte Folder bleiben Rueckfragen. Bestehende Zuweisungen
werden nicht entfernt und Namensdelegation erlaubt keine Rollenaenderung.
Organisation-Owner deckt die Folder bereits ab; der native Accelerator vermeidet
doppelte Folder-Zuweisungen. Reader werden nativ als `auditor` zugewiesen.
Uebernahme speichert nur Konfiguration, nicht STACKIT-IAM oder Configurator-Rollen;
IAM-Aenderungen bleiben an geprueften Plan und separate Apply-Freigabe gebunden.

```sh
# Ohne Credentials: Inventar, Wissensfrische und Testfragen pruefen
npm run assistant:check
# Echter Modelllauf mit allen Themen; vorhandenen privaten lokalen Zugang nutzen
LZC_MODEL_SERVING_INTENT_MODEL=openai/gpt-oss-120b npm run test:assistant:live -- --local-credentials
# Nur ein Thema oder eine Regression
LZC_MODEL_SERVING_INTENT_MODEL=openai/gpt-oss-120b npm run test:assistant:live -- --local-credentials --topic dns-zones
LZC_MODEL_SERVING_INTENT_MODEL=openai/gpt-oss-120b npm run test:assistant:live -- --local-credentials --case foundations-restoration
# Zusammenhaengender Dialog mit GPT-OSS 120B fuer beide Modellrollen
LZC_MODEL_SERVING_MODEL=openai/gpt-oss-120b \
  LZC_MODEL_SERVING_INTENT_MODEL=openai/gpt-oss-120b \
  npm run test:assistant:journey -- --local-credentials
```

Der Journey-Test durchlaeuft zwoelf Schritte von Grundlagen und Rollen ueber
SNA/Firewall, den Policy-MVP-Hinweis und Audit-Rueckfragen bis Observability,
DevOps, Kubernetes und Labels. Jeder Schritt nutzt denselben fortgeschriebenen
Entwurf und die tatsaechliche Gespraechshistorie. Fachlich passende Vorschlaege
werden im Speicher uebernommen, per JSON-Roundtrip geprueft und abschliessend als
tfvars exportiert. Fehlerhafte Vorschlaege werden nicht uebernommen; abgelehnte
Modell-/Anwendungsergebnisse werden wie im API-Service nicht als erfolgreiche
Gespraechsantwort gespeichert. Modellnamen, Wissens-/Journey-Hashes,
Einzelergebnisse und Antwortzeiten werden ausgegeben. Dies ersetzt keine
Browser-, PostgreSQL- oder Cloud-Ausfuehrungspruefung. Beide Live-Runner sperren
aktivierte Ausfuehrungsflags; sie aendern weder die laufende Modellauswahl noch
Kundenkonfigurationen und verwenden keine automatischen Wiederholungen.

Beide Runner lassen zwischen tatsaechlichen Serving-Requests mindestens 2500 ms
Abstand, auch zwischen Intent und Antwort desselben Schritts. Diese Begrenzung
gilt nur fuer die Tests, nicht fuer den produktiven Assistant. Ausgegebene
Antwortzeiten enthalten die Wartezeit und sind deshalb nicht direkt mit
Messungen ohne diese Begrenzung vergleichbar. Quotenfehler bleiben sichtbare Fehler;
sie werden nicht durch automatische Wiederholungen verdeckt.

<a id="add-further-assistant-components"></a>

#### Weitere Assistant-Komponenten ergaenzen

1. Zuerst den nativen Input-Typ und den manuellen Editor-/Compiler-Pfad pruefen.
   Der Assistant leitet Pfade, Werte und Pflichtfelder aus demselben Inventar ab;
   keine zweite, handgeschriebene Komponentenstruktur oder freien HCL-Patches.
2. Einen geprueften Wissenstopic mit nativen Inputs, Feldpfaden, Quellen und
   Abhaengigkeiten hinterlegen. Intent und Rueckfragen werden darauf begrenzt.
3. Nur fachliche Anforderungen ueber den nativen Typ hinaus in
   `assistantEditorPolicies` ergaenzen, beispielsweise ausdrueckliche
   Audit-Erstellungsentscheidungen und Freitext statt erfundener ACL-Auswahlwerte.
   Policy-Feldpfade muessen im nativen Inventar existieren.
4. Erstellung und Aktualisierung getrennt pruefen: neue Objekte verwenden
   typisierte Konstruktor-Slots fuer einfache Skalare und Listen; optionale
   Null-Slots bedeuten native Defaults und werden nur bei Erstellung ohne
   vorherigen Wert ausgelassen. Komplexe optionale Collections bleiben optional;
   etwa sind leere Audit-Link-Scopes kein Organisationsdefault.
   Bestehende Objekte werden partiell geaendert, neue Map-Eintraege brauchen native
   Pflichtfelder. Ersetzen und Default-Reset bleiben explizite, atomare Operationen.
5. Tests fuer reale Uebernahme, Geschwistererhalt, Identitaeten, Quellenbindung,
   fehlende Entscheidungen, Themenwechsel und DE/EN hinzufuegen. Auch eine vom
   Serving akzeptierte Antwort wird gegen den angebotenen Schema-Vertrag und
   anschliessend gegen die unveraenderte native Laufzeitvalidierung geprueft.
6. Nach Wissensgenerierung erst gezielte Offline-/Modellfaelle, dann den seriellen
   Journey- und vollstaendigen Szenarienlauf qualifizieren. Hashes und verbleibende
   Fehler dokumentieren; kein Modell-/API-Rollout allein aufgrund gruener Mocks.

Vorschlagstexte mit Aenderungen werden serverseitig als lokale Entwurfsvorschlaege
formuliert, nicht als vom Modell behauptete Speicherung oder Berechtigungsvergabe.
Firewall-Policy, Credentials, Organisationsbindung, Publikation und Ausfuehrung
bleiben getrennte, geschuetzte Workflows.

Der Live-Test verwendet die echte Assistant-Orchestrierung, Intentklassifikation,
Wissensauswahl, Antwortvalidierung und den lokalen Compiler, aber ausschliesslich
synthetische Konfigurationen im Speicher. Kein Browser, Benutzer-SSO oder Zugriff
auf Kundengespraeche/-datenbanken; keine automatische Annahme und kein Cloud-Auftrag.
Die HTTP-/Session-/Transaktionspfade bleiben durch Unit-/Datenbanktests abgedeckt.
Der Lauf meldet pro Fall Antwort, Fehlercodes, Laufzeit und abschliessend
Modell-/Wissensversion und Zaehler; jeder Fehler ergibt Exitcode 1. Fehlende Zugriffe
werden nicht uebersprungen. Live-Aufrufe verursachen Model-Serving-Kosten.
Themen-Smokes pruefen Referenz, gueltigen Antwortvertrag und Beratungsmodus, nicht
automatisch die fachliche Richtigkeit jeder Textaussage oder jedes einzelnen Feldes.
Ein gruener Smoke ist keine vollstaendige Komponenten-/Cloud-Qualifikation.

Ohne `--local-credentials` wird `LZC_MODEL_SERVING_TOKEN` aus der Prozessumgebung
erwartet. Lokal liest der gemeinsame sichere Loader den bereits vorhandenen
verschluesselten State mit Originalschluessel; private Dateien muessen dem aktuellen
Benutzer gehoeren und duerfen keine Gruppen-/Weltrechte haben. Token/Schluessel werden
nicht ausgegeben oder in Tests/Reports geschrieben. Keine neuen Credentials im Git,
keine Rotation bestehender Schluessel und keine SSO-Automatisierung.

Der manuell ausloesbare [GitHub-Workflow](../../.github/workflows/assistant-live.yml)
verwendet die Umgebung `assistant-tests`. Dort `LZC_MODEL_SERVING_TOKEN` als
Environment-Secret mit Freigabe-/Branchschutz hinterlegen; keine Tokens in Chat,
Workflow-Dateien oder Kommandozeilen schreiben. Normale PR-Checks bleiben offline
und benoetigen keine Cloud-Secrets. Ein Service-Account fuer spaetere lesende
Produktkatalogtests muss separat mit minimalen Rechten und Testprojekt eingerichtet
werden; er ersetzt keine menschliche Identitaet fuer Benutzer-/SSO-Rechtepruefungen.

Zwei Terminals im App-Verzeichnis:

```sh
# Terminal 1: API auf http://127.0.0.1:3000
npm run dev
```

```sh
# Terminal 2: UI auf http://127.0.0.1:5173
npm run dev:web
```

Auch diese Befehle können bei abweichender lokaler Node-Version mit dem oben gezeigten `npm exec`-Präfix ausgeführt werden. Der Vite-Entwicklungsserver leitet `/healthz`, `/auth` und `/api` an die lokale API weiter. Gemeinsame Pakete vor UI-Start bauen (`npm run build:packages`, bereits Teil von `npm run dev`). Nach Änderungen an gemeinsamen Paketen erneut bauen; automatischer Workspace-Watch folgt später.

<a id="ubuntu-workstation-with-developer-login-and-https"></a>

### Ubuntu-Workstation mit Entwicklerlogin und HTTPS

Dieser separate Starter ist fuer die persoenliche Ubuntu-Entwicklung ohne
registrierten OIDC-Webclient gedacht, **nicht** fuer Cloud Foundry oder Produktion.
Er akzeptiert ausschliesslich eine kanonische HTTPS-Origin, aktiviert keinen
STACKIT-CLI-Callback und erstellt einen eigenen persoenlichen Arbeitsbereich.
Er behauptet keine verifizierte STACKIT-Benutzeridentitaet und vergibt keine
organisationsbezogenen Produktrollen. Bestehende Arbeitsbereiche, Entwuerfe und
Chats werden weder uebernommen noch veraendert.

```sh
npm run build
LZC_DEVELOPMENT_ORIGIN=https://work.lukas.runs.onstackit.cloud:4181 \
  LZC_RUNNER_PACKAGE_DIR=/absoluter/pfad/zum/geprueften/runner \
  npm run dev:workstation -- --execution \
  --service-account-file /absoluter/pfad/zur/privaten-service-account-key.json \
  --organization ORGANISATION_UUID
```

Ohne `--execution` bleiben Plan/Apply deaktiviert. Mit dem Schalter ist der
vorhandene native Plattform-Runner verfuegbar; es startet **kein** Cloud-Job.
Preparation, Plan, State-Zuordnung und Apply-Freigabe behalten ihre bestehenden
Pruefungen. Der separate Application-Runner bleibt unabhaengig deaktiviert.
GitHub-Verknuepfung und SSO-abhaengige Organisation-Funktionen sind in diesem
Modus nicht verfuegbar.

Der einmalige Benutzername ist `developer`. Das zufaellige initiale Passwort
steht ausschliesslich in der privaten lokalen Datei
`../.local/development/initial-password` (0600), nicht in Logs oder Antworten.
Nach sicherer Uebernahme in einen Passwortmanager kann diese Datei geloescht
werden. `../.local/development/account.json` enthaelt den gesalzenen scrypt-Hash
und die dauerhafte Dev-Principal-ID; diese Datei behalten und nicht einchecken.
Login, Logout und API-Mutationen verwenden weiterhin Secure/HttpOnly-Cookies,
die exakte HTTPS-Origin, CSRF-Token und bestehende Tenant/RLS-Pruefungen.
Es gelten maximal zehn Login-Versuche pro 15 Minuten und API-Instanz.

`--service-account-file` akzeptiert nur eine kleine, regulaere, nicht verlinkte
Datei des aktuellen Benutzers ohne Gruppen-/Weltrechte. Der Schluessel wird
idempotent als eigenes Credential-Profil im bestehenden verschluesselten
Secret Store gespeichert; keine Zuordnung zu einem vorhandenen Benutzer.
`--organization` prueft ausschliesslich den technischen Org-Lesezugriff; es
ist **kein** menschlicher Organisationsnachweis. Dieser explizite Import kann
bei spaeteren Starts entfallen. Keine Secrets in Shell-Argumenten uebergeben.

Fuer die TLS-Auslieferung Caddy installieren und separat starten:

```sh
sudo caddy run --config "$PWD/scripts/workstation.Caddyfile" --adapter caddyfile
```

Die API samt gebautem UI bleibt auf `127.0.0.1:3000`; ein eigener Vite-Preview
auf Port 4181 darf nicht parallel laufen. Caddy liefert die Anwendung unter
`https://work.lukas.runs.onstackit.cloud:4181/` aus. TCP 4181 muss fuer den Browser,
TCP 80 fuer oeffentliche ACME-HTTP-Pruefungen und spaetere Erneuerungen erreichbar
sein. Port 80 liefert nur Challenge/HTTPS-Weiterleitung. Bei anderem Host
`LZC_DEVELOPMENT_HOST` fuer Caddy und die dazu passende `LZC_DEVELOPMENT_ORIGIN`
fuer die API setzen; der HTTPS-Port dieses Caddy-Beispiels ist 4181.
Kein selbstsigniertes Zertifikat und kein unsicherer HTTP-Login-Fallback.
Die Prozesse laufen nur waehrend ihrer gestarteten Sitzung; es wird kein
Autostart-Service fuer diese Entwicklung eingerichtet.

Gezielte Pruefungen:

```sh
npx vitest run tests/development-login.test.ts tests/auth-routes.test.ts
# Ausschliesslich isoliertes configurator_test auf einer lokalen Testdatenbank:
LZC_TEST_DATABASE_URL=postgres://.../configurator_test \
  npx vitest run integration/development-login.test.ts
npx playwright test e2e/development-login.spec.ts
```

<a id="local-stackit-login"></a>

### Lokaler STACKIT-Login

Nach ausdrücklicher Freigabe der CLI-Client-Nutzung kann der echte Login ohne
Dev-Datenbank und Secrets-Manager-Zugang lokal gestartet werden. Docker muss laufen:

```sh
LZC_STACKIT_CLI_CLIENT_APPROVED=true npm run dev:login
```

Das Backend läuft ausschließlich auf `127.0.0.1:3000`; die zugehörige gebaute
UI-Vorschau muss auf `http://127.0.0.1:4181` laufen. Der Starter legt den eigenen
Docker-Container `lzc-local-stackit-login` mit PostgreSQL 17 an, bindet dessen Port
nur an Loopback und wendet die bestehenden Migrationen an. Zufällige
Datenbankpasswörter werden nicht ausgegeben; die Runtime verwendet weiterhin
`configurator_app`, nicht die Migrationsidentität. Die lokale Datenbank bleibt
bei einem API-Neustart erhalten; der Starter löscht keine Nutzer oder Entwürfe.

STACKIT-Identitätsprüfung, Sessions, Credential-Profile und Produktkataloge sind echt.
Technische STACKIT-Abfragen verwenden den im aktiven Tenant gespeicherten Service
Account. Platform Engineers können Zugänge auch in Organisationstenants verwalten;
Profile bleiben an Tenant und Besitzer gebunden. Im persönlichen Tenant wird ein
zugängliches aktives Referenzprojekt automatisch ermittelt, im Organisationstenant
wird die Suche auf dessen Organisation begrenzt.

Nur im lokalen Starter ersetzt eine AES-256-GCM-Ablage den Secrets Manager.
Schlüsseldateien sind unter `../.local/credential-secrets/` verschlüsselt; das
separate lokale Verschlüsselungsgeheimnis `master.key` und der Ordner sind nur für
den Betriebssystembenutzer zugänglich. Das ist kein Ersatz für einen produktiven
Secrets Manager: Wer auf Ordner und Verschlüsselungsgeheimnis zugreifen kann,
kann die Daten entschlüsseln. Den Ordner nicht teilen oder ins Repository aufnehmen.
Er bleibt wie die Datenbank über Neustarts erhalten.

`dev:login` aktiviert keinen Runner und übernimmt keine Dev-Daten. Mit einem
vorbereiteten nativen Paket aktiviert `dev:execution` lokale Plattform-Plans und
den ausdrücklich freizugebenden Apply-Pfad. Organisations-Platform-Engineers
verwenden weiterhin private, tenantgebundene Vorbereitungen und Zugänge.
HTTP wird ausschließlich für ausdrücklich aktivierte, kanonische Loopback-
Ursprünge erlaubt; Produktionskonfigurationen verlangen unverändert HTTPS.
Ein bloßes `vite preview` ohne dieses Backend kann keine Anmeldung durchführen.

<a id="recovery-review-evidence"></a>

### Recovery-Pruefbelege

Nach Anwendung der Migrationen 051 und 052 kann der separate Opt-in
`LZC_APPLICATION_RECOVERY_REVIEWS_ENABLED=true` Recovery-Pruefbelege aktivieren.
Default ist deaktiviert. Der lokale Login-Starter wendet beim naechsten Start
die vorhandenen neuen Migrationen an; ein Neustart ist deshalb ein kontrollierter
Migrationsschritt, auch wenn native Runner ausgeschaltet bleiben.

Die Aktion ist auf den urspruenglich freigebenden Platform Engineer mit aktueller
Session und gueltiger menschlicher STACKIT-Identitaet beschraenkt. Sie protokolliert
nur die ausdrueckliche Pruefung des gebundenen Diagnose-Stands. Sie aendert keinen
Jobstatus und hebt keine State-/Recovery-Sperre auf. Ohne neue Migration muss der
Opt-in ausgeschaltet bleiben. Der gehostete Start prueft bei Opt-in die Tabelle
und die neue Abgleichsfunktion aus Migration 052. Der lesende Pruefkontext zeigt
gespeicherte Runner-ID, Report-Hashes, Ticket-Fenster und Grant-/Delegationswiderruf.
Startunsicherheit, fehlender Abschluss und gespeicherter Recovery-State bleiben
unterschiedliche Feststellungen. Ticket-Ablauf oder Delegationswiderruf belegen
weder Runner-Stillstand noch Widerruf bereits ausgegebener Cloud-Credentials.
Cloud-Abgleich, Runner-Stillstand, State-Wiederherstellung und Ausfuehrungsfreigabe
bleiben separate Vorgänge mit eigenen Nachweisen und Freigaben.

<a id="local-planapply-execution"></a>

### Lokale Plan-/Apply-Ausführung

Mit Node 24.21.0, npm 11.19.0 und checksum-geprüftem OpenTofu 1.12.6 im `PATH`:

```sh
npm run build
LZC_LOCAL_RUNNER_PACKAGE=true bash ../deploy/runner/package.sh
LZC_STACKIT_CLI_CLIENT_APPROVED=true npm run dev:execution
```

Die Paketierung verlangt ein neues Zielverzeichnis und überschreibt kein
bestehendes Paket. `LZC_RUNNER_PACKAGE_DIR` kann ein anderes geprüftes Paket
angeben. Der native Modus ist ausschließlich für die lokale Entwicklung gedacht,
nicht als Ersatz für die produktive CF-Isolation. Jobs laufen mit minimaler
Umgebung unter `~/.local/share/landing-zone-configurator/runner-jobs`, außerhalb
des Workspace; Paketinhalt und Laufzeit sind an den gespeicherten Plan gebunden.
Nach einem API-Absturz werden unklar laufende Jobs nicht automatisch wiederholt
oder über fremde Prozess-IDs beendet. Recovery-Dateien verhindern Cleanup.

Der native Worker erzeugt seine CLI-Konfiguration mit dem Paket-Mirror-Pfad und
verwendet fuer Provider-Sockets ein kurzes privates Temp-Verzeichnis, das beim
Cleanup entfernt wird. Init erlaubt Provider-Dateien bis 256 MiB; andere Phasen
behalten das Limit von 64 MiB. Der echte Paket-Init/Validate-Test stoppt vor Plan
und verwendet weder Kunden-Credentials noch Kunden-State:

```sh
LZC_NATIVE_RUNNER_TEST=true LZC_RUNNER_PACKAGE_DIR=../.local/runner-local-20261003-mirror-init npm exec -- vitest run tests/platform-worker.test.ts -t 'real native providers'
```

Unter **OpenTofu-Ausgabe** zeigen Plattformauftraege auch in Cloud Foundry
Live-Fortschritt ueber einen authentifizierten NDJSON-Kanal. Der Worker liest
vollstaendige Zeilen alle 500 ms; nur geaenderter, redigierter Text wird
verschluesselt gesichert und weitergegeben. Der Plan liefert native
OpenTofu-UI-Ereignisse, bevor der fertige Diff verfuegbar ist; rohe Ereignisobjekte
und deren Output-Daten werden nicht an den Browser gegeben. **Ausgabe folgen** laesst sich zum Pruefen aelterer
Zeilen anhalten. Einklappen und Navigation trennen die Verbindung; erneutes
Oeffnen setzt beim aktuellen Mitschnitt fort. JSON-Snapshots bleiben kompatibel.
Erfolgreiche Plattform-Plans werden
read-only mittels `tofu show -no-color` aus dem unveraenderten gespeicherten
Artefakt dargestellt, einschliesslich Ressourcen und Attributaenderungen.
OpenTofu maskiert sensitive Werte wie in der CLI. Die separate Ausgabe-Route
verlangt Sitzung, Deployment-Rolle und private Eigentuemer-/Tenant-Zuordnung;
rohes Plan-Binary oder `show -json` werden nicht an den Browser geliefert.
Jeder Plan bleibt an sein unveraenderliches Runner-Paket gebunden. Ein Paketwechsel
erfordert einen neuen Plan und dessen ausdrueckliche Freigabe.
Laufende Apply-Ausgaben werden ebenfalls aktualisiert. Vor dem terminalen Ergebnis
sichert der Worker den letzten redigierten CLI-Text verschluesselt beim Broker;
er bleibt nach Cleanup und Reload unter derselben privaten Zugriffskontrolle lesbar.
**Apply-Nachweise** zeigen Plan-ID, SHA-256, Zielorganisation, State-Backend des
Auftrags und Abschlusszeit. Die bestehende exakte Organisationsbestaetigung und
gegebenenfalls destruktive Freigabe bleiben erforderlich; kein automatischer Retry.
Ausgaben sind auf 2 MiB begrenzt; eine Kuerzung wird angezeigt. Die Sicherung ist
best-effort: bei hartem Prozessabbruch oder fehlgeschlagenem Upload ist ein
vollstaendiger historischer Mitschnitt nicht garantiert. Bereits gesicherter
Text benoetigt keinen laufenden nativen Runner. Waehrend des Streams werden
Sitzung, Tenant, Rolle und Eigentuemerschaft erneut geprueft. Verbindungen werden
spaetestens nach 35 Sekunden beendet und bei aktivem Auftrag neu geoeffnet;
Backpressure, Byte-Limit und hoechstens acht Streams pro Eigentuemer/Tenant und
API-Instanz begrenzen die Ressourcen. Details: [Plan-Ausfuehrung](../docs/plan-execution.de.md).

Für neue Plattformen ist **Accelerator-Standard · Management-S3** der Default.
Der ausgewählte Service Account führt den freigegebenen Bootstrap-Apply aus;
Terraform verwaltet Management-Projekt, `*-tfstate`-Bucket, S3-Zugang und dessen
Management-Secrets-Manager-Eintrag. Anschließend verifiziert der Broker die
Migration zu `terraform.tfstate` in eu01. Es sind keine manuellen S3-Keys nötig.
**Bestehendes S3-Backend registrieren** bleibt die optionale Bestandsanbindung.
Der Bucket wird nicht außerhalb des Terraform-State vorab angelegt. Plan und
Apply starten nur über ihre jeweiligen ausdrücklichen Aktionen in der UI.

`npm run build` erzeugt API-/Paket-Artefakte und `apps/web/dist`. `npm start` startet die gebaute API. Mit `LZC_WEB_ROOT` liefert sie auch das gebaute UI aus. Das [CF-Manifest](../deploy/cloud-foundry/manifest.yml) setzt den Pfad, `HOST=0.0.0.0` und verwendet den von CF bereitgestellten `PORT`. `vite preview` ist kein Produktionsserver.

<a id="workspace-and-configuration"></a>

## Arbeitsbereich und Konfiguration

Der regulaere Einstieg ist **Anmelden > Arbeitsbereich oeffnen > Konfiguration
oeffnen oder erstellen > Bearbeiten > Plan > Apply**. Beim ersten Einstieg lassen
sich der persoenliche oder ein Organisationsarbeitsbereich oeffnen und neue
Arbeitsbereiche erstellen. Bei spaeterem Einstieg ueber `/` wird der zuletzt
geoeffnete, weiterhin zugaengliche Arbeitsbereich wieder aufgenommen. Explizite
Seiten-URLs bleiben erhalten; der Arbeitsbereichswechsel steht im Header bereit.

**Arbeitsbereiche** steht an erster Stelle der Hauptnavigation. Oeffnen fuehrt zu
den Konfigurationen des gewaehlten Bereichs, fuer Application Owner zur eigenen
Application-Ansicht. **Benutzerverwaltung** verwaltet Mitglieder, Rollen und
Gruppen des aktiven Bereichs. Berechtigte Platform Engineers koennen eigene
Gruppen anlegen und loeschen sowie Mitglieder zuweisen und wieder entfernen.
Gruppenmitglieder werden mit ihrer bestaetigten STACKIT-E-Mail angezeigt;
Benutzer-IDs bleiben intern. Legacy-Konten ohne STACKIT-E-Mail behalten ihren
Benutzernamen, unbekannte Namen werden nicht durch IDs ersetzt.
Die automatische Gruppe **Application Owners** folgt den Rollen und ist nicht
manuell aenderbar. Gruppen mit Template-Freigaben koennen erst nach deren
Entfernung geloescht werden; Arbeitsbereichsmitglieder bleiben erhalten.
Template-Gruppenfreigaben liegen weiterhin unter **Application Landing Zones >
Veroeffentlichung**, nicht in einem zusaetzlichen Gruppen-Reiter. Auswahl und
Erstellung anderer Arbeitsbereiche liegen nicht in der Benutzerverwaltung.
Auch eine neue inline STACKIT-Anmeldung von einer zuvor offenen Verwaltungsseite
fuehrt ohne offenen Entwurf zum Arbeitsbereichseinstieg. Bereits angemeldete
Deep Links und gesicherte Login-Entwuerfe bleiben erhalten.

**Konfigurationen** ist die Plattformuebersicht. **Neue Konfiguration** fuehrt zur
Template-Auswahl. Eine geoeffnete Konfiguration hat den Kontext **Konfiguration >
Bereitstellung > Verlauf** mit sichtbarer gespeicherter Revision.
**Speichern und zur Bereitstellung** uebernimmt die vom Server neu gespeicherte
Revision, nicht den alten Entwurfsstand. Ungespeicherte Aenderungen sperren den
direkten Bereitstellungstab; ein Arbeitsbereichswechsel fragt vor ihrem Verlust.
Der Verlauf ist nur lesbar und auf die betreffende Konfiguration begrenzt.

Die Bereitstellung zeigt pro Konfiguration den neuesten Lauf, sofern er nicht
abgelaufen oder bereits verwendet ist, sowie laufende Ausfuehrungen und
erforderliche Wiederherstellungen. Aeltere,
abgelaufene oder bereits fuer Apply verwendete Plaene liegen standardmaessig
unter **Historie (Anzahl)**. Ihre Details sind einzeln aufklappbar und ohne
Apply-Freigabe; CLI-Ausgaben und Nachweise bleiben lesbar. Ablauf verschiebt einen
Plan auch ohne Reload in die Historie. Die Ansicht loescht oder erneuert keine
Artefakte und hebt keine laufenden Ausfuehrungs-/Recovery-Sperren auf.

Reload liest die gemerkte Konfigurations-ID innerhalb des Benutzer-/Arbeitsbereichs
erneut vom Server. Zugaenge und Apply-Freigaben werden dadurch nicht gespeichert
oder bestaetigt. Vorbereitung, Plan und Apply bleiben ausdrueckliche Aktionen;
vorhandene Plan-Artefakte werden durch Navigation nicht erneuert oder umgebunden.
Application Owner behalten ihren getrennten Application-Landing-Zone-Einstieg.

<a id="current-functionality"></a>

## Aktueller Funktionsumfang

- Private Konfigurationen in PostgreSQL, pro Benutzer und aktivem Arbeitsbereich.
	Unter **Konfigurationen** lassen sich auch unvollstaendige Entwuerfe speichern,
	wieder oeffnen, als neue Kopie speichern und loeschen. Revisionen verhindern
	das Ueberschreiben durch parallele Tabs; im Konflikt bleibt der Entwurf erhalten.
	GitHub ist dafuer nicht erforderlich und bleibt als optionaler versionierter
	Speicherort verfuegbar. Der Datenbankweg benoetigt Migration
	`015_configuration_storage.sql`; vorhandene Konfigurationen sind nur fuer ihren
	Ersteller sichtbar. In Organisationsarbeitsbereichen ist die Rolle Platform
	Engineer erforderlich. Browser-Zwischenstaende ersetzen diese Speicherung nicht.
- Template-Katalog, Standalone-Editor mit Feldhilfen und grafischer Struktur.
- Nativer `.tfvars`-Download und atomarer GitHub-Export mit JSON, tfvars, CLI-Anleitung und optional verifiziertem S3-Backend.
- GitHub-Login, PostgreSQL-Sessions/RLS und persönliche Tokens im Secrets Manager.
- Persönliche Deployment-Zugänge: Service-Account-Key-Datei speichern/löschen; Anmeldung und Organisations-Lesezugriff prüfen. [Details](../docs/deployment-credentials.de.md).
- Unveränderliche Deployment-Vorbereitungen aus Fork-Konfiguration, Ziel und persönlichem Zugang. [Details](../docs/deployment-preparation.de.md).
- Browser-Zurück/Vorwärts und direkte Seiten-URLs.
- Erstbereitstellungspläne und freigabegebundener Plattform-Apply-Pfad: RLS-Aufträge, isolierte CF-Tasks und wertfreie Ergebnisanzeige; siehe [Ablauf und Abnahme](../docs/plan-execution.de.md). Kein Kunden-Apply in dieser Abnahme; Chat bleibt offen.
- Application-Testkatalog: unveränderliche tenantgebundene Projekt-Template-Versionen, Bestellungen ohne Fork, idempotente Instanzaufträge und ausdrückliche Planblocker. Keine Application-Cloud-Ausführung; siehe [Veröffentlichung und Bestellung](../docs/template-parameters-and-bindings.de.md#tenantgebundener-testkatalog-und-bestellungen).

Der Application-Dienst ist standardmäßig deaktiviert. Nach Anwendung der Migration
`010_application_catalogue.sql` mit der bestehenden Migrationsidentität aktiviert
`LZC_APPLICATIONS_ENABLED=true` die API im authentifizierten Server. Fehlende Tabellen
verhindern dessen Start. `/applications` ist die eigene SPA-Route; die API liegt unter
`/api/v1/applications/templates` und `/api/v1/applications/instances`. Alle Anfragen
benötigen den aktiven Tenant-Header, Mutationen zusätzlich Origin-/CSRF-Prüfung.
Das Featureflag aktiviert ausschließlich den Testkatalog und Bestellaufträge, niemals
einen Runner oder Apply. Die bestehende Plattform-Plan-Pipeline bleibt unverändert.

Details und Grenzen: [Forks und Navigation](../docs/forks-and-navigation.de.md),
[GitHub-Login](../docs/github-login.de.md). HCL-Export-Roundtrip prüfen mit Node 24 im PATH:
`cd ../tools/hcl-adapter && go test ./... && go run . -check`.

<a id="state-backend-and-independent-export"></a>

## State-Backend und unabhängiger Export

Der Plattform-Bootstrap verwendet temporär einen dauerhaften verschlüsselten
HTTP-State. Nach dem freigegebenen Bootstrap-Apply wird zum LZA-Management-Bucket
migriert; erst nach serverseitigem Hash-/Versionsnachweis wird der HTTP-Primärstate
entfernt. Native S3-States verwenden `use_lockfile = true`; Application-Instanzen
haben jeweils eigene State-Keys. Legacy-State-Zuordnungen bleiben bis zur expliziten
Migration gesperrt. Unbestätigte Migration/Recovery benötigt einen State-Export
und operativen Abgleich; vollständige automatische Recovery bei hartem
Runner-Verlust ist nicht garantiert. Cloud-Locking wurde nicht live getestet.

GitHub speichert unter `src/config/custom/<id>/` JSON, tfvars und eine CLI-Anleitung,
zusätzlich `backend.tf.json`, wenn die API die Quellbindung verifiziert hat.
Die erste Speicherung eines DB-Entwurfs erhält dessen ID; vorhandene Git-Bindungen
behalten ihre eigene ID. Der Browser kann keine Backend-Deskriptoren vorgeben.
Exportiert werden weder AWS-/SA-Schlüssel noch State-Dateien. Backend-Servicefehler,
manuell veränderte Backend-Dateien und verlorene Bindungen brechen den Export ab.
Ein abweichender Quell-ID-Alias wird beim Export nicht neu registriert; für die
Vorbereitung ist die ausdrückliche Auswahl des bestehenden Backend-ID nötig.

CLI-Betrieb benötigt den geprüften Accelerator-Code und den Management-Zugang
aus dem LZA Secrets Manager. Ursprünglichen Backend-Block in `src/backend.tf`
deaktivieren, exportiertes `backend.tf.json` nach `src/` kopieren und genau einen
aktiven Backend-Block behalten. AWS-Schlüssel als `AWS_ACCESS_KEY_ID` und
`AWS_SECRET_ACCESS_KEY` setzen, dann in `src`:

```sh
tofu init
tofu plan -var-file=config/custom/<id>/landing-zone.tfvars
```

Ohne verifizierte Bindung zuerst den LZA-Bootstrap mit gesichertem State und
anschließender geprüfter S3-Migration durchführen. Export führt weder Apply noch
Migration aus. [Lifecycle und Recovery-Grenzen](../docs/plan-execution.de.md#state-lebenszyklus-gemäß-lza).

<a id="read-only-platform-check"></a>

## Lesende Plattformprüfung

```sh
npm run platform:check
```

Benötigt die STACKIT-CLI sowie die beiden ignorierten Dateien im Repository-Root. Liest `PROJECT_ID` und optional `REGION`; ohne Region wird ausschließlich für die Bestandsaufnahme `eu01` verwendet. `ORGANISATION_ID` bleibt für die spätere Organisationszuordnung reserviert.

Das Skript führt die `.env` nicht als Shellcode aus. Es bezieht einen kurzlebigen Token ohne CLI-Login-Persistierung und fragt ausschließlich Metadaten per GET ab. Ausgabe enthält Statuscodes/Anzahlen, keine Tokens oder Rohantworten. Unerwartete Fehler führen zu Exitcode 1; der bekannte Object-Storage-Status 404 wird als `enabled: false` und anstehende IaC-Provisionierung gemeldet. Der Check provisioniert oder aktiviert nichts. Betriebssystem-Zertifikate sind für Unternehmensproxys aktiviert; TLS-Prüfung bleibt eingeschaltet.

Der Modellkatalog beweist keine projektbezogene Inferenzaktivierung. Leserechte beweisen keine Erstell-/Änderungsrechte. CF-Plattformangebote ersetzen weder CF-Organisation noch Runtime-Zugang. Ergebnisse: [Plattformprüfung](../docs/platform-check.de.md).
