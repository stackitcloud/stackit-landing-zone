<a id="configurator-development-map"></a>
# Configurator-Entwicklungsübersicht

[English](development.md) | [Deutsch](development.de.md)

Beginne mit [CONTRIBUTING](../../CONTRIBUTING.de.md) und der
[lokalen Anwendungseinrichtung](../app/README.de.md). Diese Seite verzeichnet technische
Referenzen; das [Benutzerhandbuch](user-guide.de.md) beschreibt die Produktnutzung.

<a id="component-contracts"></a>
## Komponentenverträge

| Bereich | Referenz |
| --- | --- |
| Benachrichtigungen und E-Mail | [Benachrichtigungen](notifications.de.md), [MailOut-Betrieb](../infra/mailout/README.de.md) |
| Komponenten, Vertrauensgrenzen und Diagramme | [Architektur](architecture.de.md) |
| Native Schemas und Compiler | [Gemeinsames Funktionsmodell](common-feature-model.de.md), [gemeinsamer Editor](common-editor.de.md) |
| Vorlagenentwürfe und Parameter | [Projektvorlagenentwürfe](project-template-drafts.de.md), [Parameter und Bindungen](template-parameters-and-bindings.de.md) |
| Authentifizierung und Organisationsbindung | [Anmeldung](github-login.de.md) |
| Runner, Jobs und State | [Plan-Ausführung](plan-execution.de.md), [Application-Ausführungslebenszyklus](application-execution-lifecycle.de.md), [Application-Template-/Plattform-Upgrades](application-upgrades.de.md), [Runner-Paketierung](../deploy/runner/README.de.md) |
| Assistant-Fakten, Generierung und Qualifikation | [Wissensvertrag](assistant-knowledge/README.de.md) |
| Betreiber-IaC und verschlüsselter State | [Infrastruktur](../infra/README.de.md) |
| CI-Berechtigungen und manuelle Operationen | [CI-Betriebshandbuch](../infra/ci/README.de.md) |
| Paketierung, Migrationen und Promotion | [CF-Release](../deploy/cloud-foundry/README.de.md) |

Die älteren [Planungsnotizen](planning.de.md) und
die [Platform-/Application-Designbegründung](platform-application-architecture.de.md)
bewahren Designentscheidungen, nicht den aktuellen Abnahmestand oder Betreiberbefehle.
Nutze Code, aktuelle Verträge, Tests und Issue-Diskussionen für den Implementierungsstand.
Historische Arbeitsplatzübergaben und laufbezogene Abnahmeprotokolle gehören nicht
zur gepflegten Dokumentation.

<a id="account-and-workspace-boundaries"></a>
## Konto- und Arbeitsbereichsgrenzen

Migration `097_explicit_workspaces.sql` beendet automatisch erzeugte persönliche
Arbeitsbereiche. Ohne ausgewählten regulären Arbeitsbereich enthält die öffentliche
Sitzung `workspaceRequired` und keinen Tenant. Daten- und Ausführungs-APIs sperren
diesen Kontext serverseitig; Erstellung, Auswahl und Einladungsannahme behalten
Anmeldung und CSRF-Prüfung bei. Mitgliedschaftsentzug führt zur Auswahl zurück,
ohne Ersatzrechte im Login-Kontext zu gewähren.

Der interne `account`-Tenant ist ein stabiler unprivilegierter Login- und
Verschlüsselungskontext, kein angezeigter oder auswählbarer Arbeitsbereich. Seine
UUID und die unveränderliche Token-Bindung bleiben erhalten. Leere Altbereiche
werden Kontokontexte; Bereiche mit referenzierten Daten werden reguläre
unverifizierte Arbeitsbereiche mit unveränderten Ressourcen-, Konfigurations- und
Zugangs-IDs. Bisherige Administratoren behalten lokale Verwaltungsrechte, erhalten
aber keinen STACKIT-Nachweis. Eine fehlende Organisations-ID kann ein
Workspace-Verantwortlicher einmalig setzen; der normale Owner-Nachweis bleibt
erforderlich. Tests für Workspace-Funktionen müssen einen Bereich explizit
erstellen und auswählen.
Führe bei Änderungen an Anmeldung oder Arbeitsbereichen zusätzlich
`npm run test:platform-database` aus: `npm run check` überspringt diese isolierte
Docker-Testgruppe bewusst; CI und Release-Build verlangen sie dennoch.
DELETE-Anfragen ohne Inhalt dürfen kein `Content-Type: application/json` setzen;
ein leerer JSON-Body scheitert bereits vor der Berechtigungsprüfung. Browsertests
prüfen die tatsächlichen Header sowie erfolgreiche Löschung und fachliche Fehler.

<a id="interface-localization"></a>
## Übersetzung der Oberfläche

Nutze `t()` für Überschriften, Navigation, Schaltflächen, Hinweise, zugängliche
Beschriftungen und Diagnosemeldungen und ergänze englische Einträge in
`apps/web/src/locales/en.ts`. Übersetze gespeicherte Meldungskennungen und
Metadaten der Editor-Schritte erst beim Rendern, damit ein Sprachwechsel auch
bereits geöffnete Dialoge und Fehler aktualisiert. Übersetze umgebende
Oberflächentexte getrennt von Kundennamen, Eingaben, Ressourcenkennungen und
Assistant-generierten Inhalten; diese Werte bleiben unverändert.

`tests/i18n-coverage.test.ts` prüft statische Meldungseinträge und unübersetzte
JSX-Texte oder zugängliche Beschriftungen mit `npm run check`. Führe die
Playwright-Abläufe `i18n` und `english-interface` auf Desktop und Mobilgeräten
für dynamische Anzeigen, Sprachwechsel und den Erhalt von Kundendaten aus.
Prüfe auch deren Screenshots: Die Quellprüfung kann nicht jeden fehlenden
Übersetzungsaufruf für dynamische Werte erkennen.

Lesen der Konfigurationsliste darf eine neuere Aktualisierung nach dem Speichern
nicht mit einer älteren initialen Antwort oder einem Fehler überschreiben.
Erhalte die Reihenfolge der Anfragen und das erfasste Abort-Signal für die
Sitzungslebensdauer. Der Datenbank-Konfigurations-Browserablauf verzögert initiale
Lesezugriffe bis nach erfolgreichem Speichern, um diese Reihenfolge auf Desktop
und Mobilgeräten neben erneutem Öffnen, Revisionskonflikt und Löschen zu prüfen.
Die initiale Sitzungsabfrage beim Übergang von Gast zu authentifiziert erhält den
Editor-DOM, damit ein fokussiertes Eingabefeld nicht entfernt wird. Tatsächliche
Identitäts-/Arbeitsumgebungswechsel setzen weiterhin den Entwurf und den
bereichsgebundenen Katalogprovider zurück; private Kataloge dürfen nie über
diese Grenzen hinweg erhalten bleiben.
Heartbeat-Aktualisierungen dürfen keinen älteren Checkpoint über einen aktuellen
Entwurf zurückspielen oder fokussierte Eingaben entfernen. Bei Sitzungsablauf
bleiben Entwurf, Datenbankbindung und Revision sowie gespeicherte Vergleichsbasis
erhalten; Wiederherstellung verlangt denselben Benutzer und Arbeitsbereich.
Ausdrücklicher Logout löscht den Checkpoint auch in abgelaufenen Tabs; ein Logout
einer älteren Sitzung darf aber keine neuere Anmeldung löschen. Teste verzögerte
Refresh-Ergebnisse mit einem neuen unveränderlichen Session-Wert auf Desktop und
Mobilgeräten. Refresh-Zugänge bleiben serverseitig verschlüsselt; die absolute
App-Laufzeit darf nicht verlängert werden. Organisations-Owner-Nachweise werden
nicht blind verlängert: Gebundene Arbeitsbereiche prüfen Resource Manager und IAM
erneut. Persönliches Token, Identität, App-Sitzung und fünf Minuten begrenzen
den neuen Nachweis.
Siehe [Anmeldeverhalten](github-login.de.md) für Erneuerung und den Ausweichpfad
bei nicht verfügbarem Browserspeicher.

Die Navigation „Konfigurationen“ setzt den aktuellen Entwurf direkt im Editor
fort; der Brotkrumen-Link im Editor öffnet die gespeicherte Liste. Listenaktionen
öffnen direkt den Editor und fragen nur nach Ersetzen, wenn ein abweichender
ungespeicherter Entwurf verloren ginge. Unveränderte Entwürfe öffnen ohne
Bestätigung; Abbrechen erhält Entwurf und Speicherbindung. Die
Deployment-Phasen bleiben davon getrennte, ausdrückliche Aktionen.

Halte Frontend-Navigation und die explizite SPA-Routen-Allowlist der API synchron,
einschließlich Arbeitsumgebungs- und Deployment-Phasen-URLs. Direkte Aufrufe und
Neuladen müssen die kompilierte UI über die API ausliefern, nicht nur über den
History-Fallback des Entwicklungsservers. Die Static-Serving-API-Regression deckt
diese Pfade ab und erhält 404-Antworten für unbekannte Routen, API-/Auth-Pfade und
fehlende Assets; ersetze die Allowlist nicht durch einen Catch-all.

<a id="validation-versus-cloud-operations"></a>
## Validierung gegenüber Cloud-Operationen

Runner-Ausgabe verwendet einen authentifizierten NDJSON-Stream mit unveränderter
JSON-Snapshot-Kompatibilität. Halte den gemeinsamen Ausgabeereignisvertrag,
Worker-Redaktion und UTF-8-Bytegrenzen, die native UI-Ereignisprojektion und den
abschließenden menschenlesbaren gespeicherten Plan synchron. Teste Ausgabe vor
Prozessabschluss und vor HTTP-EOF, Zugriffsentzug, Verbindungsabbau und
Desktop-/Mobil-Einklappen/Wiederverbinden. Ersetze nativen Fortschritt nicht durch
erfundene Prozentangaben und lege weder rohe Maschinen-UI noch gespeichertes
Plan-JSON oder State offen. Assistant-Übernahme und Ausgabeansicht erteilen keine
Ausführungsberechtigung.

Der repositoryweite [Workflow-Katalog](../../docs/workflows.de.md) ist die zentrale
Tabelle für alle Pipelines, automatische/manuelle Auslöser, wiederverwendbare
Aufrufe, Eingaben und Startanweisungen für die GitHub-UI. Aktualisiere ihn bei
Workflow-Änderungen, statt hier ein zweites unvollständiges Inventar zu pflegen.

Ein Quellmerge löst kein Deployment aus. Kunden-Zugangsdaten, State, private
Inventare oder rohe Plan-Ausgabe gehören niemals in Issues, Chat oder Testartefakte.
Lokale Modellbelege qualifizieren nur ihre exakte Quelle und konfigurierten Modelle;
sie ersetzen nicht die Qualifikation des geschützten Release-Workflows.

## Gemeinsamer Template-Entwurf und geführter Ablauf

Der Konfigurationseditor und der erste Reiter von Application Landing Zones verwenden denselben kontrollierten Root-Entwurf, dieselbe Konfigurationsbindung und denselben gespeicherten Vergleichsstand. Beim Wechsel zwischen diesen Ansichten darf kein separater Entwurf oder implizites Speichern entstehen. Die Zuordnung einer Vorbereitung muss die gespeicherte Konfigurationsbindung verwenden, niemals die dokumentlokale `draft.id`: Beim Speichern und Kopieren entsteht eine separate Datenbank-ID, ohne das Dokument umzuschreiben. Diese Bindung muss durch beide Editorpfade weitergegeben werden; Testdaten verwenden unterschiedliche IDs. Die Plattformanbindung enthält Ausführungs- und Backend-Einrichtung vor der Veröffentlichung. Die Bearbeitung gehört zu Konfigurationen; Deployment-Phasen bleiben getrennte ausdrückliche Aktionen. Der Katalog-Provider muss an Arbeitsbereich und Plattformberechtigung gebunden bleiben, damit ein Rollenverlust private Katalogdaten entfernt, obwohl die Application-Ansicht zugänglich bleibt. Der Browsertest für den Platform-Owner-Ablauf prüft Speichern, Neuladen und Schrittfolge; sein Application-Owner-Fall prüft zusätzlich, dass keine privaten Konfigurationen gelesen werden.

Template-Entwürfe werden ausschließlich im ersten Reiter unter Application Landing Zones bearbeitet. Sie bleiben Teil desselben kontrollierten Konfigurationsentwurfs mit identischer Speicherbindung. Der Konfigurationseditor blendet den Projektschritt für Plattformentwürfe aus; konkrete Bestandsprojekte bleiben bearbeitbar. Alte Links auf den Template-Schritt öffnen die Application Landing Zones. Gäste können dort lokale Entwürfe bearbeiten, aber nicht veröffentlichen oder bestellen.

Der vollständige Projekt-IAM-Katalog bleibt vom Workload-Standard getrennt. Nach Abruf von `GET https://authorization.api.stackit.cloud/v2/permissions?resourceType=project` mit `npm run permissions:generate -- /private/project-permissions.json YYYY-MM-DD` aktualisieren, die generierte Datei mit Biome formatieren, Assistant-Wissen neu erzeugen und betroffene reale Modellfälle qualifizieren. Keine Kennungen erraten. Die Domain erhält begrenzte zukünftige Kennungen; vor Veröffentlichung bestätigt der Server neue Kennungen durch Snapshot oder authentifizierten Live-Katalog, nach Autorisierung und außerhalb der Veröffentlichungstransaktion. Bestellparameter können veröffentlichte Policies nicht überschreiben. Dienst-Ergänzungen im Assistant bilden eine deterministische Vereinigung aus dem vertrauenswürdigen Katalog, erhalten Owner und bestehende Listen und benötigen ein passendes Dienstzitat aus der aktuellen Anfrage. Vollständige Kennungslisten werden nicht an fachfremde Modellanfragen angehängt.

Owner-Aliase des Assistant verwenden ausschließlich E-Mail-Metadaten. Der Server verknüpft persönliche gespeicherte Zugangsprofile mit Vorbereitungen über aktuelle Profil-ID und Key sowie gespeicherte Konfigurations-ID und Entwurfsorganisation, innerhalb der bestehenden Mandanten-/Benutzertransaktion. Dokumentlokale IDs ersetzen diese Bindung nicht; entschlüsselte Zugangsdaten dürfen nicht in die Inferenz gelangen. Eine Vorbereitung ist kein erfolgreicher Zugriffscheck. Mehrere unterschiedliche Accounts bleiben eine Auswahl. Gemeinsame Owner-Antworten erhalten vorhandene ausdrückliche Owner; alte Rollenregeln werden nur nach erneuter geprüfter Bestätigung umgestellt und niemals still eingeschränkt.

## Upgrade-Regression ohne Dev-Deployment

Starte `npm run test:upgrade-journey` aus `app/`, nachdem die festgelegten Tools,
Docker und Playwright Chromium (`npx playwright install chromium`) installiert
sind. Der Befehl baut die UI, erstellt einen entbehrlichen PostgreSQL-Container
mit Loopback-Port, führt alle Migrationen aus und entfernt den Container danach.
Cloud-Zugriff und Kundendaten werden nicht verwendet. CI nutzt seine bestehende
lokale Testdatenbank und nach dem regulären Build `--no-build`.

Der Browser verwendet die gebaute SPA, echte HTTP-Routen, PostgreSQL-Sessions,
CSRF, RLS und Migrationsfunktionen. Die Testdaten enthalten einen erfolgreichen
historischen Plan/Apply und eine verbrauchte Plan-Freigabe statt nur einer leeren
Bestellung. Er wählt, prüft und speichert ein Upgrade, lädt es erneut, folgt dem
nächsten Schritt zu Plan und prüft die kompilierte Zielversion, freigegebene
Ausführungsquelle und unveränderte State-Zuordnung. Anschließend wird ein
synthetischer abgeschlossener Plan ohne Änderungen erfasst. Der Browser nimmt
das noch nicht angewendete Ziel zurück, lädt neu und wählt eine neuere Version
mit Kubernetes-Rechten. Der neu kompilierte Input muss diese Rechte und dieselbe
State-Zuordnung enthalten; der verworfene Plan bleibt gesperrt. Der Ablauf prüft
auch Session-, Herkunfts- und CSRF-Schutz der Rücknahme-Route. Ein Cloud-Plan oder
Apply wird nicht ausgeführt. Separate Datenbank-/Runner-Broker-Tests prüfen Dispatch
und Artefaktzulassung. Ersetze diese Upgrade-API-Antworten nicht durch
Browser-Routen-Mocks; solche Mocks würden Transaktionsfehler verdecken.

Upgrades widerrufen nur unverbrauchte alte Plan-Freigaben. Verbrauchte
historische Freigaben und Claims bleiben unveränderlich; eindeutige Claims und
die Prüfung der aktuellen Quelle bzw. Upgrade-Bindung verhindern eine erneute
Verwendung. Aktive Ausführungen und ungeklärte Recovery blockieren weiterhin.
SQL-Konflikte behalten ihren konkreten sicheren Fehlercode; ein unbekannter
Konflikt darf nicht als State-Backend-Konflikt gemeldet werden.

Entwurfs-Checkpoints angemeldeter Benutzer werden beim Bearbeiten verzögert und
bei `beforeunload` sowie `pagehide` synchron gesichert. Erfasse den Owner im
selben Render-Snapshot wie Entwurf, Bindung, gespeicherte Basis und Position;
sichere nur bei Übereinstimmung mit aktivem Konto/Arbeitsbereich. Explizites
Abmelden darf keinen Checkpoint wiederherstellen; bei Session-Ablauf darf der
private Entwurf des ursprünglichen Owners erhalten bleiben. Der Fork-Speicher-/
Reload-Browsertest pausiert die Verzögerung, weist den alten Checkpoint direkt
vor dem Reload nach und prüft danach das neue Plattform-Template samt
Parameterrichtlinie.
