# Plattform-Betriebsstand nach Bootstrap und Backend

**Aktuell (2026-09-30):** Plattform-Recovery und Apply erfolgreich. Neun Ressourcen sind im verschlüsselten Remote-State erfasst. PostgreSQL ist `READY`, CF aktiv, Secrets Manager `Running`. [Recovery-/Apply-Run 36675347654](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36675347654). CF-Runtime und Zugriffstests sind weiterhin offen.

## Abgeschlossen

- [x] Bootstrap-State-Bucket und S3-Zugang via CI erstellt.
- [x] Versionierung dieses Buckets via Backend-Root aktiviert: [Run 36602706599](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36602706599), Commit `d68c0a1a1199c34cf529ef0a87d62943c35a0585`.
- [x] `Enabled` direkt über S3 API sowie verschlüsselten Backend-State unabhängig geprüft.
- [x] Einmalige Commit-/Root-Freigaben nach Apply entfernt.
- [x] Begleitende App-/IaC-Validierung erfolgreich: [Run 36602706648](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36602706648).

## Aus Katalogen vorbereitete Entwicklungsparameter

Die folgenden Werte wurden anhand der Projektkataloge ausgewählt. Verbindliche Deployment-Eingaben einschließlich getrennter Netzwerk-ACLs stehen in `infra/environments/lzc-dev.tfvars.json`.

| Parameter | Auswahl | Grund |
| --- | --- | --- |
| Foundation | Öffentliche CF `01.cf.eu01` | Geplante Anwendung für unabhängige Kunden |
| CF Quota | small: 10 GiB RAM, 10 Service-Instanzen | Raum für Web/API/Worker und zusätzliche Instanzen bei Deployments; default ist auf drei App-Instanzen begrenzt |
| PostgreSQL | Version 17, Flavor 2.16 | Verfügbar: 2 CPUs und 16 GiB RAM |
| Speicher | 20 GiB, premium-perf2-stackit | Im Katalog verfügbar, gültiger Größenbereich 5–4000 GiB |
| Backups | Täglich 02:00, Retention 32 Tage | Entwicklungsdefault; Produktivziele separat festlegen |

## Plattform und verbleibende Abnahmen

- [x] Netzwerkannahme korrigiert: CF-Egress-IP-Adressen sind laut Betreiberwissen nicht dokumentiert und nicht stabil; keine CF-spezifische IP-Allowlist voraussetzen.
- [ ] Dokumentierte STACKIT-Service-Netze für PostgreSQL als Zugangsmodell evaluieren und Zugriff aus CF testen.
- [ ] Zugangsmodell des Secrets Managers separat klären; PostgreSQL-Netzfreigaben nicht ungeprüft übertragen.
- [x] Migrationen als CF-Tasks vorgesehen; technische Umsetzung und Operator-Zugriff noch offen.
- [x] Plattform-CI mit getrennten Environments und eigenem State-Key anbinden.
- [x] Konkreten Plattform-Plan prüfen und anschließend deployen.

Der erste Plattform-Apply wurde wegen des Job-Zeitlimits abgebrochen. Der Teilbestand wurde inzwischen erfolgreich importiert und das Deployment vervollständigt; siehe die Recovery-Abnahme unten. Alle Arbeiten verbleiben auf `feature/landing-zone-configurator`.

## Korrigiertes Netzwerkmodell

Die Anwendung darf nicht von einzelnen, beobachteten CF-Ausgangs-IP-Adressen abhängen. Auch eine einmalige Messung per Test-App würde keine stabile Allowlist ergeben. Service-Bindings liefern Zugangsdaten und Verbindungsparameter; sie sind kein Nachweis, dass eine Netzwerk-ACL umgangen oder automatisch gepflegt wird.

Für PostgreSQL Flex nennt die offizielle Dokumentation `193.148.160.0/19` und `45.129.40.0/21` ausdrücklich für den Zugriff aus STACKIT-Diensten. Diese dokumentierten Anbieter-Netze sind ein Kandidat für den Konnektivitätstest, keine exklusiven Netze unserer Anwendung oder unseres Mandanten. TLS mit Zertifikatsprüfung, getrennte App-/Migrationsidentitäten und Datenbankautorisierung bleiben erforderlich. Änderungen der unterstützten Netze müssen über IaC nachvollzogen werden; die Adressen sind keine zugesicherten CF-Egress-CIDRs.

Für den Secrets Manager muss dessen unterstütztes Zugangsmodell unabhängig geprüft werden. Der bisherige gemeinsame Parameter `service_access_cidrs` für beide Dienste darf vor dem Plattform-Apply nicht einfach mit den PostgreSQL-Netzen gefüllt werden. Separate ACL-Eingaben sind bei unterschiedlichen Dienstanforderungen vorzusehen. Ein eigener Zugangsproxy ist erst dann zu planen, wenn das unterstützte direkte Zugangsmodell nicht ausreicht. Keine pauschale Öffnung auf `0.0.0.0/0` aus dieser Korrektur ableiten.

Datenbankmigrationen sollen später als CF-Task mit separater Migrationsidentität laufen. GitHub Actions startet und überwacht die Task; dafür muss die Datenbank nicht für wechselnde GitHub-Runner-IP-Adressen geöffnet werden. Der technische Nachweis einschließlich Credentials-Bindung steht noch aus.

Quellen: [PostgreSQL-Instanzen und ACLs](https://docs.stackit.cloud/products/databases/postgresql-flex/how-tos/create-and-manage-instances-for-postgresql-flex/), [Secrets-Manager-Konfiguration](https://docs.stackit.cloud/products/security/secrets-manager/getting-started/configure-the-secrets-manager/), [CF-Service-Bindings](https://docs.cloudfoundry.org/devguide/services/application-binding.html).

## Konkreter Plattform-Entwurf

Die versionierte Datei `infra/environments/lzc-dev.tfvars.json` enthält jetzt die ausgewählten Katalogparameter. Datenbank und Secrets Manager verwenden unabhängige ACL-Variablen. Für den Entwicklungsentwurf sind beide bewusst auf die STACKIT-Netze `193.148.160.0/19` und `45.129.40.0/21` begrenzt. Für PostgreSQL sind diese Netze dokumentiert; beim Secrets Manager ist dies eine explizite Netzfreigabe als Ausgangskonfiguration, keine Behauptung einer dokumentierten CF-Netzgarantie. Erreichbarkeit und Authentifizierung sind aus einer CF-Test-App beziehungsweise CF-Task vor Nutzung mit Kundendaten zu prüfen. Bei fehlender Erreichbarkeit wird die Netzkonfiguration anhand von Nachweisen angepasst, nicht pauschal geöffnet.

Die eigene Pipeline `configurator-platform.yml` verwendet denselben Serialisierungsmechanismus wie Bootstrap, aber eigene GitHub-Environments und einen separaten Verschlüsselungsschlüssel. Sie liest Bootstrap-/Backend-Outputs geschützt im Arbeitsspeicher, prüft den angewendeten Versionierungsstatus und verwendet anschließend den Workload-State-Bucket. Plattformparameter, Commit, Root und Plan-Hash sind an die Apply-Prüfung gebunden.

Die gesonderte Freigabe zur Secret-Hinterlegung in `lzc-dev-platform-plan` und `lzc-dev-platform-apply` liegt vor. Die Bereitstellung wird nun über einen frischen CI-Plan und einen daran gebundenen Apply ausgeführt.

Lokaler technischer Nachweis: echter Plattform-Plan erfolgreich, **9 Create / 0 Update / 0 Delete** (CF-Organisation und Manager, PostgreSQL-Instanz/Datenbank/Migrationsnutzer, Secrets-Manager-Instanz/Provisionierungsnutzer, Artefakt-Bucket und Model-Serving-Token). Sechs Plattform-Mock-Tests, 16 Node-Tests und Workflow-Prüfung erfolgreich. Der lokale Provider-Download hing; die Prüfung wurde mit bereits installierten, gegen das Lockfile geprüften Provider-Binaries wiederholt. Dieser lokale Nachweis führte keinen Apply aus. Die Plattform-Pipeline ist nach der genehmigten Environment-/Secret-Einrichtung über `LZC_PLATFORM_CI_ENABLED` aktiviert.

## Vorfall 2026-09-30: erster Plattform-Apply unvollständig

- [x] Secrets mit ausdrücklicher Benutzerfreigabe in die beiden Plattform-Environments übertragen; Werte nicht protokolliert.
- [x] CI-Plan und verschlüsseltes Artefakt geprüft: Commit `3322dd99a37a495fda8ba46fc4eb6284895d4316`, neun Create, keine Update/Delete; Hash und Run-Zuordnung geprüft.
- [x] [Validierung 36632950763](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36632950763) erfolgreich.
- [x] Genehmigten Apply gestartet: [Run 36632950493](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36632950493).
- [ ] Plattform-Apply erfolgreich abschließen: Job nach 45 Minuten durch GitHub abgebrochen (`maximum execution time of 45m0s`).
- [x] Einmalige Variable `LZC_PLATFORM_APPLY_COMMIT` entfernt und `LZC_PLATFORM_CI_ENABLED=false` gesetzt; keine automatischen Wiederholungen.

Direkte API-Prüfung nach dem Abbruch: PostgreSQL `lzc-dev-db` wechselte von `PENDING` nach `PROGRESSING`; Secrets Manager `lzc-dev-secrets` meldete `Running`, die CF-Organisation `active`. Das belegt einen Teilbestand, nicht die Vollständigkeit aller neun Ressourcen oder die Nutzbarkeit der Anwendung. Die serverseitige Datenbankbereitstellung läuft unabhängig vom beendeten Runner weiter.

Der erwartete Plattform-State im Workload-Bucket ist nicht vorhanden (`NoSuchKey`). Auch die Objektversionsliste enthält keinen Plattform-State, aber ein verbliebenes `.tflock`-Objekt. Dieses ist kein Ersatz für den State und wurde nicht entfernt. Es wurde kein weiterer Apply gestartet. Der ursprüngliche Plan darf nicht wiederverwendet werden: Er plant neue Ressourcen und kennt den inzwischen vorhandenen Teilbestand nicht.

### Wiederaufnahme und Abnahme (abgeschlossen, Details unten)

- [x] PostgreSQL-Endzustand über die API prüfen (`READY`); bei weiterhin festhängender Bereitstellung STACKIT-Service-Diagnose mit Instanz-ID aus dem lokalen Inventar veranlassen.
- [x] Vollständiges Inventar aller neun geplanten Ressourcen einschließlich technischer Benutzer und Model-Serving-Token erstellen; IDs und Zugangsdaten geschützt behandeln.
- [x] State-Recovery über einen dedizierten, serialisierten CI-Weg durchführen: vorhandene importierbare Ressourcen importieren, nicht wiederherstellbare Einmal-Credentials kontrolliert rotieren. Keine Doppelanlage oder ungeprüfte Löschung.
- [x] Verbliebenes Lock erst nach Prüfung auf beendete Runner und vor kontrollierter Recovery behandeln; native S3-Sperre bleibt als unzuverlässig dokumentiert.
- [x] CI-Prozesssteuerung verbessern: rechtzeitiger geordneter OpenTofu-Abbruch vor dem äußeren Job-Zeitlimit, geschützte Diagnose und verschlüsselte Recovery-Artefakte. Nur das Timeout zu erhöhen behebt den fehlenden State nicht.
- [x] Nach Recovery frischen Plan prüfen; erst dann Plattform-CI wieder aktivieren und neue konkrete Apply-Freigabe setzen.
- [x] Verschlüsselten Remote-State, vollständige Ressourcen und anschließenden No-op-Plan unabhängig verifizieren.
- [ ] CF-Runtime (Space, Apps, Bindings, separate Laufzeitidentitäten) per IaC erstellen und PostgreSQL-/Secrets-Zugriff aus CF testen.


## Erfolgreiche Recovery und Plattform-Abnahme

Commit `1843069ce6914c26d04a7461d0799fc1c58794d7`, [Run 36675347654](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36675347654): Recovery, Plan und Apply erfolgreich. [Validierungs-Run 36675347681](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36675347681) ebenfalls erfolgreich.

Sechs vorhandene Ressourcen wurden importiert, ohne die Instanzen, CF-Organisation oder den Artefakt-Bucket neu anzulegen. Der verwaiste Model-Serving-Token wurde widerrufen. Der frisch geprüfte Plan erstellte Datenbank, Migrationsbenutzer und neuen Model-Serving-Token; CF-Manager und Secrets-Provisionierungsbenutzer wurden wegen der verlorenen Passwörter ersetzt. Das PostgreSQL-Update betraf berechnete Flavor-Metadaten, bei unveränderter Flavor-ID und unveränderten Infrastrukturparametern.

Unabhängige Abnahme:

- [x] Verschlüsseltes State-Objekt im Workload-Bucket vorhanden; neun verwaltete Ressourcen geprüft.
- [x] Beide getrennten Netzwerk-ACLs entsprechen den geplanten Netzen.
- [x] PostgreSQL `READY`, Datenbank `configurator` mit Owner `configurator_migration` vorhanden.
- [x] CF-Organisation aktiv und Secrets Manager `Running`.
- [x] Neue technische Benutzer und genau ein neuer aktiver Configurator-Model-Serving-Token in der API bestätigt; alte Identitäten ersetzt.
- [x] Erforderliche Passwörter und Token im verschlüsselten State vorhanden, ohne Werte auszugeben.
- [x] Geschützte Diagnose und State-Snapshot aus GitHub heruntergeladen; authentifizierte Entschlüsselung und JSON-Integrität geprüft.
- [x] Beide Einmalvariablen `LZC_PLATFORM_RECOVERY_COMMIT` und `LZC_PLATFORM_APPLY_COMMIT` entfernt. Plattform-CI wieder für Plan-Läufe aktiv.
- [x] Abschließenden Plan ohne Änderungen bestätigen: [Run 36675895279](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36675895279), alle neun Ressourcen `no-op`; Recovery/Apply übersprungen. Commit, Run und Plan-Hash unabhängig geprüft. [Begleitende Validierung](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36675895374) erfolgreich.

Plattform-Jobs haben jetzt ein äußeres Zeitlimit von 100 Minuten. OpenTofu-Apply erhält maximal 70 Minuten und danach bis zu zehn Minuten zum geordneten Beenden; eine zusätzliche Gesamtlaufzeitgrenze des Skripts hält Puffer für Artefakte frei. 22 lokale Tests einschließlich Abbruchverhalten, verschlüsselter Diagnose und Recovery-Sperren sowie Workflow-Prüfung bestanden.

Nächster Ausbau: CF-Space und App-/Task-Runtime per IaC, getrennte Laufzeitidentitäten/Bindings und echte TLS-/Authentifizierungstests aus CF. Die Infrastrukturabnahme belegt noch keinen erfolgreichen App-Zugriff auf Datenbank oder Secrets Manager.


## CI-Vereinfachung 2026-09-30

Die Workflows führen OpenTofu jetzt direkt aus. Der bisherige Deployment-Runner, Prozessmanager und automatische Einmal-Recovery-Pfad sind entfernt. Normale Plan-/Apply-Logs erscheinen live; Credential-Outputs und State-Snapshots bleiben gezielt geschützt. GNU `timeout` übernimmt SIGINT und die anschließende Wartezeit; keine eigene Signalsteuerung. Die geltenden Zeitlimits und Befehle stehen in der [CI-Betriebsanleitung](../infra/ci/README.md). Das historische Recovery-Inventar liegt unter `docs/incidents`, ohne aktive Ausführung.


Abnahme der direkten CLI-Pipelines: Bootstrap-Run 36677111141 und Plattform-Run 36677111032 erfolgreich, jeweils `No changes`, Apply übersprungen. Die normalen Init-/Plan-Details sind live sichtbar. Logs gegen bekannte Deployment-Credentials und State-Schlüssel geprüft, keine Treffer. Validierung 36677111055 erfolgreich, einschließlich des GNU-Timeout-Tests in allen fünf Linux-Matrix-Jobs. Keine Infrastrukturänderung durch den Umbau.
