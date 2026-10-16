# Gemeinsamer Editor

Stand: 2026-10-15. Veröffentlichung auf `lzc-dev` ausschließlich vom Feature-Branch.

## Bedienung

Eine gültige App-Sitzung und ein aktueller STACKIT-Identitätsnachweis sind
getrennt: Die App-Sitzung bleibt acht Stunden bestehen, während der
STACKIT-Nachweis früher ablaufen kann. Name und **Abmelden** bedeuten weiterhin,
dass du im Configurator angemeldet bist. Falls ein aktueller Nachweis fehlt,
bietet die Kopfzeile **STACKIT bestätigen** an, nicht noch einmal **Mit STACKIT
anmelden**. Der Dialog erklärt, dass diese Bestätigung für geschützte
STACKIT-Aktionen nötig ist. Das Auslaufen des Nachweises meldet dich nicht aus
der App ab; es verlängert aber auch keine Cloud-Berechtigung. Ohne App-Sitzung
bleibt **Mit STACKIT anmelden** die eigentliche Anmeldung.

1. Eine beliebige Vorlage öffnen und **Konfiguration erstellen** wählen.
2. **Grundlagen → Ordner → Netzwerk → Plattform → Projekte → Betrieb → Prüfen**.
3. Einstellungen nur bei Bedarf aufklappen. **Accelerator-Standard verwenden** entfernt die
   eigene Einstellung und nutzt den Engine-Standard, nicht den Vorlagenwert. Der Export enthält weiterhin nur explizite Angaben;
   angezeigte Standardwerte werden nicht beim bloßen Öffnen materialisiert.
4. In **Projekte** Public, Corporate oder Sandbox hinzufügen. Public/Corporate
   können nach Bestätigung gewechselt werden. Der Zielordner wird angezeigt.
   Corporate benötigt eine passende Region und einen vorhandenen Bereich.
   Sandboxes haben einen eigenen Accelerator-Vertrag; ein Wechsel zu einer
   Landing Zone erfolgt durch bewusstes Neuanlegen und Entfernen.
5. **Prüfen** zeigt bekannte Konfigurationsfehler und getrennte Ausführungsgrenzen.
   Anschließend tfvars herunterladen oder JSON und tfvars gemeinsam im Fork speichern.

Einzelbereiche aus alten Hub-&-Spoke-Vorlagen können mit **Mehrere Netzwerkbereiche
verwalten** ohne Änderung der `default`-Referenz in eine Bereichsliste überführt
werden. Bereiche mit Projekt-, DNS-, Firewall-, VPN- oder Clusterreferenzen lassen
sich nicht versehentlich entfernen. Organisationsbaum und Netzwerkzuordnung
verwenden dieselben Daten; ein Hub-Projekt wird je Netzwerkbereich gezeigt.

Neue Standalone-Entwürfe markieren das Beispielprojekt ausdrücklich als Public
(Korrektur für #84). Der verlustfreie Import und bestehende Dokumente bleiben
unverändert; in einem älteren betroffenen Entwurf die Projektart ausdrücklich auf
**Public** setzen. Eigene Organisations-ID und Verantwortlichen-E-Mail-Adressen
ersetzen weiterhin die Platzhalter der Vorlage.

Unter **Plattform** stehen Git-Service, Plattform-Kubernetes, zentrales Observability
und Audit-Protokollierung. Kubernetes wird mit einer leeren Clusterliste deaktiviert,
Git-Service mit `null`. Das Entfernen konfigurierter Dienste verlangt eine Bestätigung;
verbleibende Namespace-Abhängigkeiten werden bei der Konfigurationsprüfung gemeldet.
Observability ist ein eigener Dienst. Die Audit-Protokollierung erstellt einen Telemetry
Router mit Zielen STACKIT Logs und S3-Archiv. Der Management-Archiv-Bucket existiert
auch bei deaktivierter Audit-Protokollierung.

Im Konfigurations-Chat zeigt der Änderungsvorschlag strukturierte Werte mit
Fachbezeichnungen und ihren Werten, beispielsweise **Aufbewahrung (Tage): 90**
für Audit-Protokollierung. Das gilt auch für Ausgangswerte, verschachtelte Objekte,
Listen und den Konfliktdialog. Leere Listen (`[]`) und Objekte (`{}`) bleiben von
**Nicht gesetzt** unterscheidbar. Der Hinweis **Vollständiger Ersatz** bedeutet,
dass die gesamte vorgeschlagene Einstellung übernommen wird, nicht nur einzelne
Unterfelder. Auswahl, ausdrückliche Übernahme und separates Speichern bleiben
unverändert; eine Vorschau ändert weder die Konfiguration noch Cloud-Ressourcen.

### Assistant und Application-Templates (Dev-Release vom 2026-10-15)

Neue Template-Vorschläge müssen Name, Art, Region und Einstellungen zusammen
enthalten. Bestehende Templates bleiben partiell änderbar. Der Assistant erhält
für Plattform-Entwürfe vorhandene Netzwerkbereichsschlüssel und Regionen, keine
Cloud-Ressourcenkennungen. Template-Entscheidungen referenzieren eine vorhandene
Benutzernachricht; deren Originaltext stellt der Server bereit.
Der daraus abgeleitete Einstellungsumfang begrenzt das geschlossene
Modell-Ausgabeschema: Eine reine Netzwerkanfrage bietet keine Observability-,
Secrets-Manager-, Namespace-Service- oder Parameter-Policy-Einstellungen an.
Explizit angeforderte zusätzliche Einstellungen bleiben unterstützt; der volle
Import-, Speicher- und Runtime-Vertrag wird nicht eingeschränkt.
Der Vorschlagsvergleich im Web-UI liest Templates aus derselben
ID-freien, nach stabilen Schlüsseln indizierten Projektion wie das Backend,
nicht als vermeintliche Terraform-Eingabe. Übernahme aktualisiert den lokalen
Entwurf; erst ausdrückliches Speichern persistiert die Templates.
Ungültige erzeugte Template-Strukturen werden als fehlgeschlagener
Assistant-Vorschlag gemeldet, nicht als Zugangsdaten im Benutzertext.
Gespeicherter Chat und Konfiguration bleiben bei einer Ablehnung unverändert.

Der Assistant unterscheidet anhand der referenzierten Benutzeranfrage zwischen
Ergänzungen, Korrekturen und einem gewünschten vollständigen Satz von Templates
oder DNS-Zonen. Eine Definition „Corporate und Public, keine Sandbox“ ist eine
Satzdefinition, nicht automatisch eine Ergänzung neben den Startbeispielen.
Ein ausdrücklich zusätzliches Template bzw. eine zusätzliche Zone bleibt additiv.
DNS-Korrekturen verwenden vorhandene stabile Zonenschlüssel; bei mehrdeutigen
Zielen ist eine Rückfrage erforderlich.
Bei einem Satzersatz zeigt die Vorschlagsliste jeden entfernten Eintrag mit
„Eintrag entfernen“ und eigenem Auswahlfeld. Abgewählte Einträge sowie unabhängige,
zwischenzeitliche Ergänzungen bleiben erhalten. Zwischenzeitliche Änderungen
an einem ausgewählten Eintrag benötigen weiterhin Konfliktbestätigung.
Beibehaltene Templates behalten ihre IDs und nicht angeforderten Einstellungen.
Restvorschläge werden nach einer Teilübernahme aus dem aktuellen Kandidaten
zusammengesetzt. Bereits übernommene Einträge bleiben auch bei einer späteren
Übernahme der verbliebenen Löschungen erhalten, sowohl im lokalen Vorschaupfad
als auch beim direkten, revisionsgeprüften Speichern über die API.
Keine dieser Änderungen speichert oder löscht automatisch Kundenkonfigurationen.
Die Nachbesserungen sind als Quelle `045eeafb9813e542f59062139d386b819a3792df`
committed, gepusht und über den erfolgreichen
[Dev-Release 38782981970](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/38782981970)
veröffentlicht. Die Freigabe erfolgte nach den normalen geschützten Dev-Gates.
Die lokale Regression besteht aus 718 bestandenen Unit-Tests (57 übersprungen),
51 isolierten PostgreSQL-Plan-/Broker-Tests, 53 PostgreSQL-Integrationstests und
302 Desktop-/Mobil-Browsertests.
Typprüfung, Build und generierte Assistant-Verträge sind geprüft. Dies ersetzt
keine erneute echte Modell- oder Kunden-Cloud-Abnahme; es wurde kein Kunden-Plan
oder Apply gestartet.

Der endgültige Release bestand auch in CI 718 Unit-, 53 Datenbank- und
302 Browsertests sowie die native Runner-/Image-/Archiv-Qualifikation.
Runner-Staging mit Image-/Engine-Prüfung, Migrationen, API-/Web-Deployment,
Service-Verbindungen, separate Runner-Organisation und Broker-Isolation sowie
öffentliche Routen sind erfolgreich. Nach dem Deployment entsprechen die tatsächlich
ausgelieferten JavaScript-/CSS-Dateien bytegenau dem freigegebenen Stand.
Acht öffentliche Auth-/PKCE-/Callback-/CSRF-Prüfungen sind bestanden. Echte anonyme
Desktop-/Mobil-Browser zeigen jeweils zehn Name-/Typ-Komponenten, funktionierendes
Auf-/Zuklappen per Tastatur und Maus sowie überlappungsfreie Vorschauen bei komplett
geöffneten Projekten, ohne Browserfehler oder Server-Mutationen.
Ein echter Benutzerlogin, Organisationsnachweis und Kunden-Plan wurden nicht
automatisiert durchgeführt.

Für den damaligen Release blieb die separate
[Validate-Configurator-Ausführung 38782981811](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/38782981811)
bei den Standalone-Vertrags- und STACKIT-/GitHub-Operator-Guard-Assertions rot.
Dieser historische Lauf wird nicht als bestanden gewertet. Die unten dokumentierte
Dev-Abnahme vom 2026-10-16 enthält die Korrekturen und einen vollständig grünen
neuen Validierungslauf.

Die echte Modell-Abnahme der Originalanfrage nach Corporate-/Public-Templates
mit lokalen Netzen ist in drei unabhängigen synthetischen Läufen bestanden:
zwei benannte Templates, gespeicherte Region, lokale Netze, keine Sandbox,
keine zusätzlichen Dienste und keine Rückfragen. Corporate verwendet den
vorhandenen `default`-Netzwerkbereich, auch ohne explizites Key-Override.
Die Quellenprüfung für Produktpläne, Adressen und IDs bleibt unverändert.
Die Modellabnahme ist synthetisch und verändert keine Kundenkonfiguration.
Die Korrekturen sind mit Nutzerfreigabe als `a031273` committed, gepusht und
über den erfolgreichen [Dev-Release 38710301311](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/38710301311)
veröffentlicht. Öffentliche Hosted-Prüfungen und der Abgleich des ausgelieferten
UI-Bundles mit diesem Release sind bestanden; die Abnahme führt keine
Kunden-Cloud-Ressourcen aus.

Auswahlfelder gibt es für Regionen, regionale Netzwerkkennungen, vorhandene
Netzwerkbereiche, Namespace-Projektkennungen sowie die durch den Accelerator
festgelegten Audit-Scope-, VPN-Routing-, Secret-Enforcement- und Firewall-Werte.
Nicht mehr passende importierte Werte bleiben sichtbar und werden nicht automatisch
ersetzt. Freie Bezeichnungen bleiben Textfelder. Regionale Produktangebote wie
Maschinentypen, Pläne und Versionen benötigen künftig API-basierte Kataloge; dafür
werden keine vermeintlich vollständigen statischen Listen vorgetäuscht.

### Template-Übersicht

Application-Templates erscheinen als auswählbare Übersichtskarten mit Namen,
stabiler Kennung, Art, Region, Zielordner und Netzzuordnung. Nur das ausgewählte
Template zeigt sein vollständiges Bearbeitungsformular. Neue Templates werden
direkt ausgewählt; nach Entfernen eines Templates bleibt ein vorhandenes Template
bearbeitbar. Die Strukturansicht gruppiert dieselben Templates nach Art und
Zielordner und öffnet beim Auswählen denselben Detailbereich.

Die Netzwerkansicht zeigt Corporate-Templates nur unter dem referenzierten
Netzwerkbereich ihrer Region; ein fehlendes Key-Override bedeutet weiterhin
`default`. Public-Templates werden nicht als zentrale Netzwerk-Spokes dargestellt.
Fehlende SNA- oder Ordnerreferenzen bleiben ausdrücklich sichtbar. Templates
bleiben Entwürfe für spätere Bestellungen, keine bereits angelegten Projekte.
Auswählen und Bearbeiten speichern oder deployen nichts automatisch.

Die Übersicht ist mit Nutzerfreigabe als Quelle `9c19327` über den erfolgreichen
[Dev-Release 38720037784](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/38720037784)
veröffentlicht. Alle 296 Desktop-/Mobil-Browsertests bestanden, einschließlich
Auswahl, gemeinsamer Strukturvorschau, Hinzufügen, Entfernen und leerem Zustand.
Die ausgelieferten JavaScript- und CSS-Bundles wurden mit der exakt gebauten
Quelle abgeglichen. Bestehende Kundenkonfigurationen wurden nicht verändert.

### Komponenten in der Strukturvorschau

Die Strukturvorschau zeigt unter den Plattformprojekten auch deren konfigurierte
Komponenten, jeweils nur mit Name und Typ: Automatisierungs-Service-Account,
Secrets Manager, Object-Storage-Buckets,
Observability, Audit Logs und Telemetry Router, zugeordnete SNA, Netze,
DNS-Zonen, Firewalls einschließlich eines konfigurierten HA-Partners, VPN-Gateways,
Git-Service sowie Kubernetes-Cluster und ihre optionalen Dienste.
Netzwerkkomponenten werden nach Region und Netzwerkbereich dem richtigen Hub
zugeordnet. SNA erscheinen als logisch zugeordnete Netzwerkbereiche, nicht als
Aussage über deren tatsächlichen Resource-Manager-Container.
Deaktivierte Dienste und lediglich referenzierte bestehende DNS-Zonen erscheinen
nicht als neu bereitzustellende Komponenten. Das Audit-Archiv bleibt entsprechend
dem Accelerator auch ohne aktivierte Audit-Protokollierung sichtbar.
Die Vorschau verwendet native Standardwerte ausschließlich zum Anzeigen; sie
materialisiert diese nicht im Entwurf und liest keine bestehenden Cloud-Ressourcen.
Projekte mit Komponenten sind zunächst eingeklappt und lassen sich über den Pfeil,
die gesamte Überschriftszeile oder per Tastatur öffnen und schließen.
Struktur- und Netzwerkvorschau bleiben im Editor untereinander im normalen
Dokumentfluss, auch wenn alle Projekte geöffnet sind; kein zweiter Sticky-Bereich
überdeckt die darunterliegenden Templates.

### Erstbereitstellungspläne

Die generelle Sperre für `audit_logs`, `observability`, `connectivity` und `devops`
ist durch geprüfte Unterstützung ersetzt. Für Connectivity umfasst diese
Netzwerkbereiche, DNS, Firewall-/HA-Infrastruktur und VPN-Gateways.
Das Firewall-Image ist die bereits im Accelerator verwendete, versions- und
SHA-256-gebundene OPNsense-Datei; der Runner prüft die tatsächlichen Image-Dateien
und ihre Paketierung. Ein alter Runner ohne passendes Image bleibt ausdrücklich
gesperrt, statt einen vermeintlich ausführbaren Plan mit `/dev/null` zu erstellen.

Das ist eine Plan-Freigabe, keine automatische Bereitstellung: Firewall-Policies,
Bootstrap, Appliance-Apply und VPN-Verbindungen mit vorab geteilten Schlüsseln
benötigen weiterhin ihre gesonderte Ausführungs- bzw. Secret-Binding-Unterstützung.
Audit-Ziele außerhalb des nachgewiesenen Organisationskontexts bleiben gesperrt.
Identitäts-/Owner-Nachweise, Mandantentrennung, Snapshot-Prüfung und explizite
Freigaben bleiben unverändert erforderlich. Die konkreten Grenzen sind im
[Runner-Vertrag](../runner/README.md) beschrieben.

Vorbereitungen sind unveränderliche Nachweise einschließlich Accelerator-Revision.
Gespeicherte Konfigurationen sind davon getrennt und bleiben nach einem
Configurator-Release weiter bearbeitbar und als Quelle neuer Vorbereitungen
nutzbar. Ein reiner Configurator-Versionswechsel verlangt keine neue Vorbereitung,
solange deren Accelerator-Vertrag weiterhin zum installierten Runner passt.
Der behobene Fehler betraf auch frisch erstellte Vorbereitungen: Die Oberfläche
verwendete noch die Basisrevision, während der Runner bereits den
Plattformvertrags-Root erwartete. Dafür ist keine Neuerstellung der Konfiguration
und kein neuer State erforderlich.
Die Oberfläche zeigt bei einem Runner mit Plattformvertrags-Root eine ausdrücklich
zu bestätigende Vorbereitung für dessen aktuellen Stand an. Ohne Bestätigung
bleibt deren Erstellung gesperrt. Passt die Revision einer älteren Vorbereitung
nicht zum Runner, nennt der Plan-Fehler jetzt diesen Grund und fordert eine neue
Vorbereitung an, statt nur eine ungültige Konfiguration zu melden. Bestehende
Vorbereitungen, State-Bindungen und Plan-Nachweise werden dabei nicht umgeschrieben;
Plan und Apply behalten ihre eigenen Freigaben.

Die Auswahl des aktuellen Accelerator-Stands ist auch für eine Erstbereitstellung
zulässig; sie setzt keine bereits bereitgestellte Plattform voraus. Ohne
State-Bindung oder mit einem leeren Standard-State (Version 0) kann eine neue
Vorbereitung entstehen. Das gilt auch nach einem fehlgeschlagenen ersten Plan.
Vorhandene Bindungen bleiben erhalten. Ein gesperrter State verhindert den
Wechsel weiterhin ausdrücklich; ein bereits gespeicherter Standard-State muss
vor dem Wechsel an sein S3-Backend übernommen werden. Ein ausgewähltes
S3-Backend ohne lesbaren State erlaubt weiterhin keinen Bootstrap.
Vorbereitungsfehler benennen State-Sperren, Backend-Konflikte, ungültige
Anfragen und abgelaufene Sicherheitsbestätigungen getrennt. Unbekannte
Serverfehler zeigen HTTP-Status und Fehlercode statt einer endlosen
Aufforderung zum Aktualisieren der Liste.

Der DNS-Zonentyp bezeichnet die Rolle `primary` oder `secondary`, nicht eine
Sichtbarkeit `public` oder `private`. Die gemeinsame Konfigurationsprüfung
beanstandet ungültige Typen am konkreten Zonenfeld, auch in regionalen
Connectivity-Konfigurationen. Der generische Assistant-Vertrag erlaubt dieselben
DNS-Rollen im Modell-Ausgabeschema und in der serverseitigen Übernahmeprüfung.
Das gilt auch für vollständige Netzwerkobjekte sowie direkte Feldvorschläge,
jeweils als Ergänzung oder Ersatz und in beiden Netzwerkmodellen.
Alte Entwürfe bleiben unverändert ladbar und
exportierbar; sie werden nicht stillschweigend umgedeutet. Für eine selbst
verwaltete neue Zone kann der Benutzer den Typ ausdrücklich auf `primary`
korrigieren. Anschließend speichern und eine neue Vorbereitung für diese
Revision erstellen; alte Vorbereitungen behalten ihren ursprünglichen Snapshot.
Diese ergänzende DNS-Validierung ist noch nicht Teil der folgenden Dev-Abnahme.

Bei Plattform-Plan und -Apply übermittelt der Runner während einer laufenden
OpenTofu-Phase alle zwei Sekunden einen bereinigten Ausgabestand. Die API speichert
ihn verschlüsselt und liefert ihn bereits während der Ausführung an die
Ausgabeansicht. Die Übertragungen erfolgen nacheinander; vor Ergebnisbestätigung
und Aufräumen werden ausstehende Übertragungen abgewartet. Unvollständige letzte
Zeilen werden erst nach ihrem Abschluss übertragen, damit keine nur teilweise
geschriebenen Zugangsdaten die Bereinigung umgehen. Nach dem Endstatus sind
weitere Änderungen des Protokolls gesperrt. „Ausgabe folgen“ steuert weiterhin
das automatische Scrollen, nicht die Übertragung. Der getrennte
Application-Runner behält seinen bisherigen einmaligen Abschlussbericht.
Diese Live-Ausgabekorrektur ist ebenfalls noch nicht veröffentlicht.

Die zugehörige lokale Regression umfasst frische und zuvor fehlgeschlagene
Erstpläne mit Standard- und S3-Backend bis zum erfolgreichen Plan-Nachweis,
ohne Apply. Sie prüft unveränderte Konfigurationen, alte Vorbereitungen,
State-Bindungen und weiterhin gesperrte Zustände. Desktop- und Mobiltests
decken außerdem die ausdrückliche Auswahl des aktuellen Accelerator-Stands
ohne vorhandenes S3-Backend sowie konkrete und unbekannte Fehlermeldungen ab.
**Dev-Abnahme vom 2026-10-16:** Die Nachbesserung ist als unveränderliche Quelle
`6a5014e7821586a60699bcd52d148f0d56718b8b` über den erfolgreichen
[Dev-Release 38867967256](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/38867967256)
veröffentlicht. Auch die zugehörige
[Validate-Configurator-Ausführung 38867967250](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/38867967250)
ist vollständig erfolgreich. Die normale geschützte Dev-Freigabe erfolgte erst
nach erfolgreicher separater Validierung und erfolgreichem Release-Build.
Beide Workflows bestanden 718 Unit-Tests (63 im normalen Unit-Lauf übersprungen),
57 ausdrücklich aktivierte PostgreSQL-Plan-/Broker-Tests, 53 API-Datenbanktests,
304 Desktop-/Mobiltests und 13 native Template-Vertragsprüfungen. Die separate
Validierung bestand außerdem alle sechs Infrastruktur-Roots einschließlich
Formatierung, Validierung und Mock-Plänen. Der Release bestand die native
Runner-/Provider-/Image-/Archiv-Qualifikation und die tatsächliche
Cloud-Foundry-Bereitstellung einschließlich Migrationen, Service-Verbindungen,
separater Runner-Organisation, abgewiesenem Job-Ticket und öffentlichen Routen.

Die ausgelieferten JavaScript-/CSS-Dateien entsprechen bytegenau dem freigegebenen
Build. Acht öffentliche Auth-/PKCE-/Callback-/CSRF-Prüfungen sind bestanden.
Echte anonyme Desktop-/Mobil-Browser zeigen jeweils zehn Name-/Typ-Komponenten,
funktionierendes Auf-/Zuklappen und überlappungsfreie Vorschauen ohne
Browserfehler oder Server-Mutationen. Die Anmeldung wurde nicht mit einem
echten Benutzer durchlaufen; ein Organisationsnachweis oder Kunden-Plan/Apply
wurde nicht ausgeführt. Gespeicherte Kundenkonfigurationen wurden nicht verändert.

Der separate Validierungsworkflow prüft die reale Release-Konfiguration im
Application-Job nach dem API-Build. Der Infrastruktur-Job benötigt weiterhin
keine Anwendungs-Abhängigkeiten. Der vorherige STACKIT-Fehler entstand durch
den dort fehlenden kompilierten Validator, nicht durch eine GitHub-Pflicht.
Der native Standalone-Test erwartet für das inzwischen ausdrücklich als Public
markierte Beispiel einen erfolgreichen Vertrag. Separate Negativtests prüfen
weiterhin, dass fehlendes oder ausdrücklich wahres `corporate` ohne zentrale
Connectivity abgewiesen wird; der native Standardwert bleibt unverändert.
Validierung und Release führen beide `npm run test:common-contract` und
`npm run test:platform-database` aus. Der zweite Befehl aktiviert die isolierte
PostgreSQL-Broker-Suite ausdrücklich, die im normalen Unit-Lauf übersprungen
wird. Dadurch prüfen auch kommende Releases die Erstbereitstellung und die
nativen Template-Verträge, nicht nur bereits vorhandenen Plattform-State.
Die API-Datenbankintegration verwendet in beiden Workflows dieselben zwei
Worker und 30 Sekunden Test-Timeout. Das bisherige 5-Sekunden-Limit im
Validierungsworkflow brach den mehrstufigen Vertrags-/Identitätsnachweis ab,
bevor dessen Aufräum- und Wiederherstellungsschritte abgeschlossen waren.

Die gemeinsame Release-Abnahme bestand 710 Unit-Tests (57 im Unit-Lauf
übersprungen), 51 PostgreSQL-Broker-Tests und 300 Desktop-/Mobil-Browsertests
sowie Typprüfung, Build und 19 gezielte Release-/Staging-/Runner-Evidence-Tests.
Native Vertrags-, Offline-Provider- und echte Image-/Archiv-Prüfungen
qualifizierten die Runner-Unterstützung zusätzlich.
Es gab keine Kunden-Cloud-Plans, Applies oder Destroys.

Komponenten-Vorschau, Plan-Unterstützung und die eindeutige STACKIT-Bestätigung
sind mit Nutzerfreigabe als Quelle `0cee76f` über den erfolgreichen
[Dev-Release 38769119929](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/38769119929)
veröffentlicht. Auf CF bestanden Image-SHA-Prüfung, native Runner-Checks,
Migrationen, Dienstverbindungen, Runner-Isolation und die kanonischen Routenprüfungen.
Die ausgelieferten JS-/CSS-Dateien stimmen bytegleich mit der gebauten Quelle
überein. Acht zusätzliche Live-Auth-/PKCE-Prüfungen und zwei echte anonyme
Desktop-/Mobil-Browserläufe bestanden; die Vorschau zeigte jeweils nur Name
und Typ, ohne Browserfehler, horizontalen Überlauf oder Server-Mutationen.

Das große Image fehlt nur im Hosted-Upload und wird beim Staging SHA-geprüft
ohne zweite Dateikopie ins unveränderliche Droplet verschoben. Dieses ist der
dauerhafte CF-Cache; ein redundantes großes Buildpack-Cache-Archiv entfällt.
Es gibt keinen Download pro Nutzer oder Plan. Web/API verwenden 6 GiB Disk
für die größere Inspektionskopie und Staging-Komprimierung; das qualifizierte
4-GiB-Budget der isolierten Runner-Jobs und Tasks bleibt unverändert.
Paketidentität und bytegleiche Wiederherstellung beider Archive sind geprüft.
Details stehen unter
[CF-Staging und Cache](../deploy/cloud-foundry/README.md#image-staging-and-caching).
Ein persönlicher STACKIT-Login, Live-Owner-Nachweis und Kunden-Cloud-Plan wurden
dadurch nicht ausgeführt oder vorgetäuscht.

Der separate
[Validate-Configurator-Lauf 38769119849](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/38769119849)
bleibt an den bereits bekannten Standalone-Template-Vertrags- und
STACKIT/GitHub-Operator-Guard-Assertions rot. Der erfolgreiche Release-Lauf
und die Live-Abnahme sind davon getrennt; nicht sämtliche Repository-CI ist grün.

## Kompatibilität und Grenzen

- Bestehende v1/v2-Dokumente bleiben im bisherigen Editor nutzbar. **Zum gemeinsamen
  Editor wechseln** ist eine ausdrückliche Migration; beim Wechsel werden die
  bisherigen Engine-Werte erhalten. Bestehende Deployment-Vorbereitungen bleiben unverändert.
- Der bisherige Standalone-Editor kann auf der Standalone-Vorschauseite weiterhin
  ausgewählt werden, einschließlich des bisherigen persönlichen Plan-Ablaufs.
- v3 wird im Fork und Browser-Arbeitsstand unterstützt. Vorlagen-Hashes,
  Mandanten-/Kontotrennung, Schreibbasis, Konfliktprüfung und atomarer Export bleiben erhalten.
- v3-Deployment-Vorbereitungen sind **serverseitig gesperrt**. Runner-Anbindung und
  geschützte zusätzliche Credential-Bindings werden separat abgenommen.
- Keine Secret-Felder in den Konfigurationsformularen. VPN-Schlüssel, Firewall-
  Passwörter/API-Secrets und Kubeconfigs dürfen nicht in Freitextfelder eingefügt werden.
- Die wirkungslose Ordnerbeschreibung wird nicht als bearbeitbares Feature angeboten.
- Formular- und Typabdeckung sind keine Provider-Validierung. Plan/Refresh,
  Dienstverfügbarkeit, Berechtigungen und jede Modul-Kombination benötigen weitere
  Ausführungsabnahme. Grenzen #37/#65/#80 bleiben sichtbar.
- Kein Kunden-Apply ohne ausdrückliche neue Freigabe, kein Destroy.

## Prüfung

- [x] Fachbezeichnungen für sämtliche nicht-sensiblen Schemafelder geprüft.
- [x] Projektarten, Referenzen und Bereichsnormalisierung als Domain-Tests.
- [x] v3-JSON/tfvars atomar gespeichert; Deployment-Guard im Backend getestet.
- [x] Neuer Editor, Typwechsel, Navigation und Bereichsreferenzen im Browser getestet.
- [x] v3-Fork speichern, Export, Wiederaufnahme und gesperrte Vorbereitung getestet.
- [x] Legacy-Editor, GitHub-Anmeldung, Fork-Konflikte, Credentials und Plan-Ablauf regressionsgeprüft.
- [x] Release auf lzc-dev und Live-Verbindungstests abgenommen.

Manuelle Prüfung nach Veröffentlichung: Hub-&-Spoke und Multi-Region öffnen,
Projektart/Bereich wechseln, Entwurf im eigenen Fork speichern, erneut öffnen und
Browser neu laden. Zusätzliche optionale Dienste unter Plattform/Betrieb prüfen.

## Live-Abnahme

Code `527bd9582f95d3cf845cfaf242f9022e1495fad8` veröffentlicht:

- [Validate Configurator 36745965890](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36745965890): erfolgreich.
- [Configurator Release 36745965953](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36745965953): erfolgreich.
- 95 Anwendungstests und 20 Desktop-/Mobil-Browserprüfungen, einschließlich v3-Speicherung und Legacy-Kompatibilität.
- Native HCL-/OpenTofu-Vertragstests und Infrastrukturprüfung erfolgreich.
- CF-Netzwerk, PostgreSQL/Secrets-Manager-Verbindungen, isolierter Runner und öffentliche Routen erfolgreich geprüft.
- Direkter Live-Browsercheck: Multi-Region-Vorlage öffnen, neuen Editor starten, Projektliste/Netzwerkansicht auf Desktop und Mobilgerät prüfen; keine Seitenfehler oder horizontales Überlaufen.
- Öffentliche JavaScript-/CSS-Dateien per SHA-256 mit dem getesteten Build abgeglichen; `/healthz` liefert `ok`, Sitzung ohne Anmeldung `401`.

[Live-Anwendung](https://lzc-dev-configurator.apps.01.cf.eu01.stackit.cloud).
Keine Kunden-Konfiguration angewendet und keine Änderung nach `main` übernommen.


### Live-Nachbesserung: Plattformdienste und Voreinstellungen

Code `10a6ec87f0d0fc9d32d4b9699bd8579fb651683c` veröffentlicht:

- [Validate Configurator 36752620342](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36752620342): erfolgreich.
- [Configurator Release 36752620332](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36752620332): erfolgreich.
- 96 Anwendungstests, 22 Desktop-/Mobil-Browserfälle und 11 native OpenTofu-Variablentests erfolgreich.
- Live-Build entspricht dem lokal geprüften Bundle; Gesundheitsprüfung `ok`, anonyme Sitzung `401`, keine Browserfehler.
- Live geprüft: neue Standalone-Konfiguration ist Public; Region ist eine Auswahl; Plattformdienste und Kubernetes-Deaktivierung vorhanden. Desktop-/Mobilansicht ohne horizontales Überlaufen, mobile Plattformansicht visuell geprüft.
- Verbindungstests zu PostgreSQL/Secrets Manager und Runner-Trennung erfolgreich.

Manuell: App neu laden, einen **neuen** Standalone-Entwurf öffnen, Organisations-ID
und eigene Verantwortlichen-E-Mail-Adressen setzen, unter Projekte Public prüfen
und speichern/exportieren. In einem vorhandenen betroffenen Entwurf Public einmal
ausdrücklich wählen. Unter Plattform Kubernetes konfigurieren/deaktivieren; unter
Netzwerk regionale Kennungen und Bereichsverweise auswählen.


## Nächster Bedienstand: Komponenten statt vollständiger Feldliste

Die [verbindlichen Designprinzipien](editor-design-principles.md) steuern die weitere
Entwicklung. Die erste Umsetzung betrifft Plattform- und Kubernetes-Namespace-Dienste:
Inaktive Komponenten sind über **Komponente hinzufügen** zugänglich, aktive
Komponenten bleiben sichtbar. Das Öffnen und Schließen des Katalogs verändert den
Export nicht. Eine leere Clusterliste ist inaktiv; ein nicht-null gesetzter
Observability-Konfigurationsblock aktiviert dagegen den Dienst auch mit Defaults.

Public-/Corporate-Projektkarten enthalten direkte Schalter für Secrets Manager und
Observability. Sandboxes besitzen diese Root-Optionen nicht. Netzwerkbezeichnungen
benennen Connectivity und SNA ausdrücklich; ein Hinweis erläutert automatisch
erzeugte Routing-Tabellen. Ein vereinheitlichter Regions-/SNA-Editor und der geführte
VPN-Ablauf sind noch offen und im Designplan separat aufgeführt.

Dieser Abschnitt beschreibt den Arbeitsstand; die oben protokollierten Live-Abnahmen
beziehen sich auf ihre ausdrücklich genannten Commits.


## Regions-/SNA-Ansicht und VPN-Assistent (Arbeitsstand 2026-10-01)

Netzwerk zeigt Connectivity als Regionskarten mit SNAs und optionalen DNS-,
Firewall- und VPN-Komponenten. Bestehendes `connectivity` bleibt im bisherigen
Engine-Format; neue leere Konfigurationen können explizite Regionen hinzufügen.
Für bestehende Standardregion-Konfigurationen gibt es keine automatische Migration
auf regionale Module. Beim Öffnen bleibt der Export unverändert.

Der [VPN-Assistent](vpn-configuration-scope.md) bildet den Accelerator-Vertrag ab
und prüft grundlegende Pflichtangaben. Geschützte Schlüssel, Live-Kataloge und
Deployment-Ausführung fehlen weiterhin. Die neue [Self-Service-Architektur](platform-application-architecture.md)
ist geplant; Rollen und Berechtigungen wurden dadurch noch nicht geändert.


## Live-Abnahme 2026-10-01: Regionen, SNAs und VPN

Code `78d8f7c6debeba29330fa2699d617da17c3ba3be` auf lzc-dev veröffentlicht.

- [Release 36830339767](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36830339767): erfolgreich, einschließlich PostgreSQL-/Secrets-Manager-Verbindungstests und Runner-Prüfung.
- [Validate 36830339847](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36830339847): erfolgreich.
- Release umfasst 97 Anwendungstests und 24 Desktop-/Mobil-Browserfälle.
- Live-Bundle `/assets/index-BjLAVHUk.js` entspricht dem geprüften Editor-Release.
- Direkter Gast-Browsercheck: bestehende Vorlagen/Projektansicht, Komponenten hinzufügen, Region eu01 hinzufügen, STACKIT VPN öffnen, Verbindung mit zwei Tunnelfeldern konfigurieren.
- Gesundheit `ok`, anonyme Sitzung `401`, keine Browserfehler und kein horizontales Überlaufen auf Mobilgerät. Keine Kundenressourcen angelegt.

Manuelle Abnahme: vorhandene Konfiguration öffnen und unverändert speichern; neue
Connectivity-Region/SNA konfigurieren; optionales VPN hinzufügen und dessen Umfang,
Pflichtangaben und Tunnel-Einstellungen prüfen. VPN-Ausführung bleibt gesperrt.

Der anschließend entstandene separate Application-Root und sein Compiler sind
ein lokaler bzw. im Feature-Branch prüfbarer Prototyp, kein Bestandteil der
aktivierten Self-Service-Oberfläche.
