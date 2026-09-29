# Plattform-Vorbereitung nach Bootstrap und Backend

## Abgeschlossen

- [x] Bootstrap-State-Bucket und S3-Zugang via CI erstellt.
- [x] Versionierung dieses Buckets via Backend-Root aktiviert: [Run 36602706599](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36602706599), Commit `d68c0a1a1199c34cf529ef0a87d62943c35a0585`.
- [x] `Enabled` direkt über S3 API sowie verschlüsselten Backend-State unabhängig geprüft.
- [x] Einmalige Commit-/Root-Freigaben nach Apply entfernt.
- [x] Begleitende App-/IaC-Validierung erfolgreich: [Run 36602706648](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36602706648).

## Aus Katalogen vorbereitete Entwicklungsparameter

Die folgenden Werte wurden anhand der Projektkataloge ausgewählt, noch nicht provisioniert. Eine lokale `platform-selection.tfvars.json` enthält die IDs und Datenbankparameter; sie enthält bewusst noch keine Netzwerk-ACL und ist kein vollständiger ausführbarer Plattform-Plan.

| Parameter | Auswahl | Grund |
| --- | --- | --- |
| Foundation | Öffentliche CF `01.cf.eu01` | Geplante Anwendung für unabhängige Kunden |
| CF Quota | small: 10 GiB RAM, 10 Service-Instanzen | Raum für Web/API/Worker und zusätzliche Instanzen bei Deployments; default ist auf drei App-Instanzen begrenzt |
| PostgreSQL | Version 17, Flavor 2.16 | Verfügbar: 2 CPUs und 16 GiB RAM |
| Speicher | 20 GiB, premium-perf2-stackit | Im Katalog verfügbar, gültiger Größenbereich 5–4000 GiB |
| Backups | Täglich 02:00, Retention 32 Tage | Entwicklungsdefault; Produktivziele separat festlegen |

## Vor dem Plattform-Plan offen

- [x] Netzwerkannahme korrigiert: CF-Egress-IP-Adressen sind laut Betreiberwissen nicht dokumentiert und nicht stabil; keine CF-spezifische IP-Allowlist voraussetzen.
- [ ] Dokumentierte STACKIT-Service-Netze für PostgreSQL als Zugangsmodell evaluieren und Zugriff aus CF testen.
- [ ] Zugangsmodell des Secrets Managers separat klären; PostgreSQL-Netzfreigaben nicht ungeprüft übertragen.
- [ ] Zugangsweg für Migrationen/Operator-Zugriffe festlegen; dynamische GitHub-Runner-IPs nicht pauschal freigeben.
- [ ] Plattform-CI mit getrennten Environments und eigenem State-Key anbinden.
- [ ] Konkreten Plattform-Plan prüfen und anschließend deployen.

Aktuell sind noch keine CF-Organisation, PostgreSQL-Instanz, Secrets-Manager-Instanz oder Model-Serving-Tokens durch den Plattform-Root erstellt. Alle Arbeiten verbleiben auf `feature/landing-zone-configurator`.

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

Lokaler technischer Nachweis: echter Plattform-Plan erfolgreich, **9 Create / 0 Update / 0 Delete** (CF-Organisation und Manager, PostgreSQL-Instanz/Datenbank/Migrationsnutzer, Secrets-Manager-Instanz/Provisionierungsnutzer, Artefakt-Bucket und Model-Serving-Token). Sechs Plattform-Mock-Tests, 16 Node-Tests und Workflow-Prüfung erfolgreich. Der lokale Provider-Download hing; die Prüfung wurde mit bereits installierten, gegen das Lockfile geprüften Provider-Binaries wiederholt. Kein Apply durchgeführt. Die neue Plattform-Pipeline bleibt bis zur Environment-/Secret-Einrichtung über `LZC_PLATFORM_CI_ENABLED` deaktiviert.
