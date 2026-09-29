# Lesende Plattformprüfung

Stand: 2026-09-29. Ziel: Betreiberprojekt aus der lokalen `landing-zone-configurator.env`, Authentisierung mit der zugehörigen Service-Account-Datei. IDs, Schlüssel und Tokens werden hier bewusst nicht wiederholt.

## Ergebnis

| Prüfung | Beobachtung | Aussage / Grenze |
| --- | --- | --- |
| Service-Account-Authentisierung | Kurzlebiger Token erfolgreich bezogen | Kein persistenter CLI-Login geändert |
| Projekt lesen | Erfolgreich; zurückgegebene Projekt-ID stimmt mit Eingabe überein | Projekt-Lesezugriff nachgewiesen; keine Prüfung von Schreibrechten oder Organisationszuordnung |
| CF-Organisationen | HTTP 200; 0 Einträge | Im abgefragten Projekt/Region keine Organisation sichtbar |
| CF-Plattformangebote | HTTP 200; 2 Einträge | Angebote erreichbar; konkrete Foundation/Quota noch auswählen |
| PostgreSQL-Flex-Instanzen | HTTP 200; 0 Einträge | Keine Instanz sichtbar |
| PostgreSQL-Flavors | HTTP 200; 10 Einträge | Angebot lesbar; HA, Größe, Backup und Kosten noch entscheiden |
| Secrets-Manager-Instanzen | HTTP 200; 0 Einträge | Keine Instanz sichtbar; konkrete Policies/Isolation noch nicht prüfbar |
| Model-Serving-Katalog | HTTP 200; 10 Modelle | Allgemeiner Katalog lesbar; kein Nachweis projektbezogener Aktivierung, Inferenzrechte oder gebuchter Kapazität |
| Object-Storage-Service-Status | HTTP 404 | Nach Abgleich mit der offiziellen CLI: Dienst im Projekt/Region noch nicht aktiviert; der erste IaC-Bucket aktiviert ihn |

Die erste Abfrage verwendete `eu01` als Probe-Region. Anschließend wurden **lzc-dev/eu01** als erste Entwicklungsumgebung bestätigt und lokal eingetragen. Leere Listen sind keine Zusage, dass Erstellen erlaubt ist. Listenantworten beschreiben die aktuelle Sicht des Service Accounts, nicht sämtliche eventuell anderswo vorhandenen Ressourcen.

Der Object-Storage-404 trat sowohl über die installierte STACKIT-CLI als auch direkt am dokumentierten v2-Service-Status-Endpunkt auf. Die offizielle CLI behandelt genau diesen Service-Status-404 in `ProjectEnabled` als nicht aktiviert. Der Provider aktiviert Object Storage beim Erstellen des ersten Buckets. Es wurde kein Bucket angelegt und es gab keinen fehlgeschlagenen Zugriff auf einen von uns erstellten Bucket.

Quellen: [CLI-Auswertung](https://github.com/stackitcloud/stackit-cli/blob/main/internal/pkg/services/object-storage/utils/utils.go), [Bucket-Aktivierung im gepinnten Provider](https://github.com/stackitcloud/terraform-provider-stackit/blob/v0.114.0/stackit/internal/services/objectstorage/bucket/resource.go).

## Wiederholen

Siehe [Entwicklungsanleitung](../app/README.md): `npm run platform:check`. Das Skript nutzt Node.js-Systemzertifikate, begrenzte Timeouts, keine HTTP-Redirects mit Token und gibt nur aggregierte Metadaten aus. Es liefert Exitcode 1 bei unerwarteten Fehlern. Der bekannte Object-Storage-404 ist jetzt eine erfolgreiche Statusbestimmung mit `enabled: false`; das bedeutet noch keine Deployment-Bereitschaft.

Installierte STACKIT-CLI beim Test: `0.61.0`. Deshalb wurden die Dienstlisten direkt über die bestätigten APIs nachgeprüft; die CLI bleibt für den Token-Austausch und Projekt-Lesezugriff im Skript. Eine ältere CLI-Ausgabe ohne JSON wurde nicht als leere Liste gewertet.

API-Verträge aus dem offiziellen SDK: [SCF](https://github.com/stackitcloud/stackit-sdk-go/tree/main/services/scf), [PostgreSQL Flex](https://github.com/stackitcloud/stackit-sdk-go/tree/main/services/postgresflex), [Secrets Manager](https://github.com/stackitcloud/stackit-sdk-go/tree/main/services/secretsmanager), [Model Serving](https://github.com/stackitcloud/stackit-sdk-go/tree/main/services/modelserving), [Object Storage](https://github.com/stackitcloud/stackit-sdk-go/tree/main/services/objectstorage).

## Konsequenzen für den nächsten Schritt

- [x] Projekt-Lesezugriff mit bereitgestellter Identität bestätigen.
- [x] CF-/DB-/Secret-Angebote beziehungsweise Bestandslisten und Modellkatalog lesen.
- [x] Zielregion eu01 und Name lzc-dev für Entwicklung bestätigen.
- [ ] CF-Foundation/Quota festlegen.
- [x] Object-Storage-404 klären: noch nicht aktiviert; Aktivierung als Teil der Bucket-IaC.
- [x] State-Bootstrap und separaten Versionierungs-Root implementieren; erster realer Bootstrap-Plan erfolgreich.
- [ ] Bootstrap/Versionierung anwenden und S3-Locking sowie Restore praktisch testen.
- [ ] Erforderliche Create-/Update-Rechte anhand der geplanten Ressourcen prüfen; aus den GETs nicht ableiten.
- [ ] CF-Organisation und technischen CF-Zugang per IaC planen.
- [ ] DB-Plan, Secret-Policies und Modell-/Kapazitätsauswahl entscheiden.
- [ ] Runner-Isolation, private Erreichbarkeit und S3-Locking praktisch nachweisen.

STACKIT-Projekt-Service-Account und CF-Runtime-Service-Account sind unterschiedliche Zugänge. Der offizielle IaC-Leitfaden provisioniert eine CF-Organisation und einen technischen Org-Manager über den STACKIT-Provider; anschließend verwaltet der CF-Provider die Runtime-Ressourcen. Die vorhandene JSON-Datei ist deshalb nicht automatisch ein funktionierender `cf login`-Zugang. Der Bootstrap und die sichere Ablage der erzeugten Zugangsdaten bleiben zu planen. [Offizieller CF-IaC-Leitfaden](https://github.com/stackitcloud/terraform-provider-stackit/blob/main/docs/guides/scf_cloudfoundry.md)

## Lokale Entwicklungsprüfung

- [x] Reproduzierbare Installation mit Node.js 24.21.0, npm 11.19.0 und `npm ci`.
- [x] Biome-Lint/Format und strikte TypeScript-Prüfung einschließlich Testcode.
- [x] Produktionsbuild von API, gemeinsamen Paketen und React-Oberfläche.
- [x] Fünf Tests: Tenant-Grenze, Rollenabgrenzung, ungültige Identitäten, Health-Vertrag, abgewiesene gefälschte Login-Header.
- [x] HTTP-Smoke-Test: gebaute API, Vite-UI-Dokument und Entwicklungsproxy; Prozesse danach beendet.
- [ ] Visuelle Browser-Abnahme (noch keine funktionale Editoroberfläche).
- [ ] GitHub-CI-Ausführung (Workflow angelegt, noch nicht gepusht/ausgeführt).
- [ ] CF-Deployment (noch keine Cloud-Mutation).

## IaC-Fortschritt nach der Bestandsaufnahme

Die bestätigte Umgebung ist lzc-dev/eu01. Ein echter Bootstrap-Plan wurde erfolgreich erstellt und anschließend aus der verschlüsselten Plan-Datei überprüft: **3 Create, 0 Update, 0 Delete**. Geplant sind Bucket, Credential-Gruppe und S3-Zugang bis 2026-12-28. Kein Apply wurde ausgeführt.

Die erste gemeinsame Planung mit S3-Versionierung schlug fehl, weil der S3-Provider bereits zum Plan-Zeitpunkt gültige Credentials braucht. Die endgültige Struktur verwendet deshalb getrennte Roots `bootstrap`, `backend` (Versionierung) und `platform`. Alle drei sind validiert; sieben Mock-Plan-Tests und drei Tests für Plan-Hash/Kontext/Ablauf bestehen. Die IaC-CI ist entsprechend erweitert.

Der bereinigte Plattform-Check wurde erneut ausgeführt und endet jetzt erfolgreich: Object Storage meldet nachvollziehbar `enabled: false` mit anstehender IaC-Provisionierung. Dies ist kein Nachweis einer bereits angelegten Umgebung.

## Erstes Verwaltungs-Backend angewendet

Seed: 3 Ressourcen erstellt, Seed-Protection: Versionierung aktiviert. Bootstrap-Remote-Backend initialisiert und Plan erfolgreich. S3-Versionierung, Auslesen einer früheren Testobjekt-Version und Hash-verifizierte Sicherung der verschlüsselten Seed-States erfolgreich. Schlüssel verbleiben separat lokal; unabhängige dauerhafte Schlüsselverwahrung und konkurrierender Lock-Test stehen aus.

## S3-Locking: negatives Integrationsergebnis

Zwei getrennte OpenTofu-Datenverzeichnisse, derselbe isolierte S3-State-Key: erster Apply hält eine sichtbare `.tflock`, zweiter Plan mit `-lock-timeout=0s` läuft dennoch erfolgreich. Separater Test mit AWS CLI: wiederholtes `put-object --if-none-match '*'` auf ein bestehendes Testobjekt wird nicht mit 412 abgewiesen. Native S3-Sperrwirkung ist damit am getesteten eu01-Endpunkt nicht gegeben. Testobjekte und Versionen wurden entfernt; produktive States wurden nicht verändert.
