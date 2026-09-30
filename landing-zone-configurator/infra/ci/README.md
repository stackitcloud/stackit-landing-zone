# OpenTofu in GitHub Actions

Die ausführbaren Deployments stehen direkt in den Workflows:

- [Configurator Bootstrap](../../../.github/workflows/configurator-bootstrap.yml): `bootstrap` oder `backend`.
- [Configurator Platform](../../../.github/workflows/configurator-platform.yml): `platform`.
- [Configurator Runtime](../../../.github/workflows/configurator-runtime.yml): `runtime`.
- [Configurator Release](../../../.github/workflows/configurator-release.yml): gebautes Web/API-Paket mit direkten `cf`-Befehlen ausliefern.
- [Validierung](../../../.github/workflows/validate-configurator.yml): Formatierung, Validierung und Mock-Tests aller sechs Roots ohne Cloud-Credentials.

Jeder Deployment-Job zeigt die einzelnen Schritte: Credential-Vorbereitung, gegebenenfalls Lesen der vorherigen Backend-Outputs, `tofu init`, `tofu validate`, `tofu plan` beziehungsweise `tofu apply`. Es gibt keinen eigenen JavaScript-Deployment-Runner. Einmalige Recovery-Operationen gehören nicht in diesen normalen Ablauf.

## Plan und Apply

Plan und Apply sind getrennte Jobs. Der Plan wird mit `-out` gespeichert und durch die native OpenTofu-Konfiguration verschlüsselt. Der Apply lädt genau das Plan-Artefakt desselben Runs herunter. Nach Prüfung des Plans erfolgt die Freigabe im geschützten GitHub Environment. Eine kleine Integritätsprüfung bindet das Artefakt an Hash, Commit, Repository, Run, Root, Eingaben und IaC-Dateien; Pläne sind höchstens 24 Stunden gültig. OpenTofu prüft zusätzlich, ob der State seit der Planung verändert wurde. Re-runs sind gesperrt: einen neuen Run mit frischem Plan starten.

Die zentralen Befehle stehen sichtbar im Workflow, beispielsweise:

```sh
tofu -chdir="infra/$LZC_ROOT" init -input=false -lockfile=readonly -backend-config="$LZC_PRIVATE/$LZC_ROOT.backend.hcl"
tofu -chdir="infra/$LZC_ROOT" validate -no-color
tofu -chdir=infra/platform plan -input=false -no-color -var-file=../environments/lzc-dev.tfvars.json -out="$LZC_PLAN"
timeout --foreground --signal=INT --kill-after=10m 70m \
  tofu -chdir=infra/platform apply -input=false -no-color "$LZC_PLAN"
```

Die Workflows enthalten alle benötigten Umgebungsvariablen, Vorbereitungsschritte und Optionen. Diese Ausschnitte sind keine Anleitung für einen parallelen lokalen Apply.

## Logs und Secrets

Normale OpenTofu-Ausgaben erscheinen live im jeweiligen Schritt: Ressourcenänderungen, Fortschritt, Warnungen und Fehler. `sensitive`-Attribute/Outputs werden von OpenTofu maskiert; zusätzlich registriert die Vorbereitung die übergebenen Backend-Zugangsdaten und Verschlüsselungsschlüssel mit GitHubs `add-mask`. Kein `TF_LOG=DEBUG` und kein Shell-`set -x` für Deployment-Secrets.

`tofu output -json` und State-Ausgaben können sensible Werte enthalten. Deshalb werden ausschließlich diese Ausgaben direkt in private Dateien unter `$RUNNER_TEMP/lzc-private` umgeleitet, mit `umask 077`. Sie werden nicht als Klartext-Artefakte hochgeladen. Die Credential-Vorbereitung führt selbst keine OpenTofu-Befehle aus. Zum Jobende werden die temporären Dateien entfernt.

Quellen: [OpenTofu sensitive outputs](https://opentofu.org/docs/language/values/outputs/#sensitive--suppressing-values-in-cli-output), [GNU timeout](https://www.gnu.org/software/coreutils/manual/html_node/timeout-invocation.html).

## Kleine Hilfsprogramme

| Datei | Begrenzte Aufgabe |
| --- | --- |
| `prepare.mjs` | Private Credential-/Backend-Dateien und Umgebungsvariablen vorbereiten; vorhandene Workload-Outputs/Versionierung prüfen. Keine Prozessausführung. |
| `prepare-release.mjs` | Private Backend-Konfiguration und erlaubte App-Variablen für CF vorbereiten. Keine Prozessausführung. |
| `review.mjs` | Verschlüsselten Plan mit Manifest versehen beziehungsweise vor Apply prüfen. Keine Prozessausführung. |
| `protect-state.mjs`, `artifact.mjs` | Bereits erfasste State-Dateien für Recovery verschlüsseln. Keine Prozessausführung. |
| `context.mjs` | Eingaben, Workflow-Identität und Planbindung prüfen. |
| `configure-github.mjs` | Separates Operator-Werkzeug für Environment-Regeln und ausdrücklich freigegebene Secret-Transfers. Kein Bestandteil eines Deployments. |

## Backend- und Schlüsseltrennung

Bootstrap und Backend verwenden den Verwaltungs-Bucket. Der Plattform-Job initialisiert zunächst diese beiden Roots und liest ihre Outputs privat. Erst nach Prüfung der Bucket-Versionierung wechselt er für seinen eigenen State zu den Workload-S3-Credentials. Jeder Root behält seinen separaten State-Verschlüsselungsschlüssel. Seed-Schlüssel werden nicht an diese Deployment-Jobs übergeben.

| Environment | Zweck |
| --- | --- |
| `lzc-dev-bootstrap-plan` / `lzc-dev-bootstrap-apply` | Bootstrap-/Backend-Plan und freizugebender Apply |
| `lzc-dev-platform-plan` / `lzc-dev-platform-apply` | Plattform-Plan und freizugebender Apply |
| `lzc-dev-runtime-plan` / `lzc-dev-runtime-apply` | Space, Rollen und Laufzeitbenutzer |
| `lzc-dev-release` | CF-Release; Workload-S3-Zugang und Plattform-/Runtime-State-Schlüssel, kein Projekt-Service-Account |
| `lzc-dev-recovery` | Separat geschützte Seed-Recovery-Secrets, kein automatischer Recovery-Job |

Die Konfiguration steht in `github-environments.json`, `github-platform-environments.json`, `github-runtime-environments.json` und `github-release-environments.json`. Änderungen an Secret-Zielen oder Schlüsselübertragungen benötigen die entsprechende Benutzerautorisierung. Das Operator-Werkzeug lautet `node infra/ci/configure-github.mjs` beziehungsweise mit `--platform`, `--runtime` oder `--release` für die jeweiligen Environments.

## Serialisierung und Feature-Branch

Alle mutierenden Configurator-Workflows verwenden `concurrency.group: configurator-lzc-dev-mutation` und `cancel-in-progress: false`, einschließlich Plan und Freigabewartezeit. Native S3-Sperren haben den Integrationstest nicht bestanden; `backend-safety.json` hält diesen Befund fest. Lokale Remote-Applies und schreibende Parallelzugriffe außerhalb dieser CI-Gruppe bleiben im vereinbarten Betrieb ausgeschlossen. Direkte CLI-Aufrufe durch Credential-Inhaber lassen sich nicht durch einen lokalen Wrapper oder GitHub-Concurrency verhindern.

Feature-Pushes auf `feature/landing-zone-configurator` erzeugen normalerweise nur Pläne. `LZC_PLATFORM_CI_ENABLED=true` aktiviert die Plattform-Pipeline. Ein Feature-Apply braucht zusätzlich eine passende vollständige Commit-SHA in `LZC_PLATFORM_APPLY_COMMIT` beziehungsweise `LZC_BOOTSTRAP_APPLY_COMMIT` oder `LZC_RUNTIME_APPLY_COMMIT` und die Environment-Freigabe. Für einen Backend-Lauf wird `LZC_BOOTSTRAP_ROOT=backend` gesetzt. Diese Einmalvariablen nach dem Lauf entfernen. Der manuelle Hauptbranch-Pfad ist für die spätere Übernahme vorbereitet; derzeit wird nichts nach main gemergt.

Die vorhandene Plan-Service-Account-Rolle ist nicht rein lesend. Deshalb dürfen diese Workflows ausschließlich vertrauenswürdigen Code ausführen; sie sind nicht für externe Pull Requests vorgesehen.

## Timeouts und State-Sicherung

Die Grenze steht direkt am jeweiligen `tofu`-Befehl und verwendet GNU `timeout`:

| Schritt | Geordneter Abbruch nach | Zeit bis SIGKILL | Äußeres Joblimit |
| --- | --- | --- | --- |
| Plan | 15 Minuten | weitere 2 Minuten | 30 Minuten |
| Bootstrap-/Backend-Apply | 20 Minuten | weitere 5 Minuten | 45 Minuten |
| Plattform-Apply | 70 Minuten | weitere 10 Minuten | 100 Minuten |

Ein Timeout sendet zunächst `SIGINT`, damit OpenTofu Provider beenden und State persistieren kann. Der Exit-Code bleibt ein Fehler, auch wenn der Prozess danach geordnet endet. Ein dauerhaft blockierter Prozess kann nach der zusätzlichen Wartezeit hart beendet werden. Die kurzen Init-Schritte haben eigene Grenzen; Snapshot und Upload liegen außerhalb des Apply-Kommandos und vor dem äußeren Joblimit.

Nach einem gestarteten Apply versucht ein `always()`-Schritt ausdrücklich `tofu state pull`. `protect-state.mjs` verschlüsselt diesen Snapshot und einen gegebenenfalls vorhandenen `errored.tfstate` mit AES-256-GCM und einem per scrypt aus dem jeweiligen State-Schlüssel abgeleiteten Schlüssel. Das Format enthält `salt`, `nonce`, `tag` und `data` als Base64; der State kann zusätzlich OpenTofu-verschlüsselt sein. Nur diese geschützten Dateien werden sieben Tage als Recovery-Artefakt aufbewahrt. Plan-Artefakte bleiben einen Tag erhalten. Abrupte Runner-Verluste können weiterhin manuelle Recovery erfordern.

## Betriebsnachweise

Die bestehende Infrastruktur wurde durch diesen Umbau weder ersetzt noch migriert. Die erfolgreiche [Recovery und Plattform-Bereitstellung 36675347654](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36675347654) und der [No-op-Plan 36675895279](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36675895279) sind dokumentiert. Das abgeschlossene Recovery-Inventar liegt ausschließlich unter [docs/incidents](../../docs/incidents/2026-09-30-recovery-inventory.json); es ist kein ausführbarer Bestandteil der Pipeline. Aktuelle Abnahmen: [Plattform-Betriebsstand](../../docs/platform-readiness.md).

## Runtime und Release

Der Runtime-Root liest vorhandene Plattform-Ausgaben und verwaltet den CF-Space,
die ausdrücklich benötigte `organization_user`-Mitgliedschaft vor `space_developer`,
sowie separate PostgreSQL-/Secrets-Laufzeitbenutzer. Sein verschlüsselter State
liegt im Workload-Bucket. Der erste Teil-Apply wurde regulär gespeichert; ein
frischer Plan ergänzte die fehlenden CF-Rollen ohne Duplikate oder Recovery-Import.

`LZC_RUNTIME_CI_ENABLED` und `LZC_RELEASE_CI_ENABLED` aktivieren die entsprechenden
Workflows. Die Benutzerfreigabe vom 2026-09-30 umfasst notwendige Configurator-
Deployment-Applies bis MVP; Scope-/Planprüfung und Environment-Freigaben bleiben.
Der Release-Workflow baut ohne Cloud-Secrets, lädt ein Paket desselben Runs und
prüft dessen SHA-256. Erst der geschützte Deploy-Job liest Zugangsdaten. Die normalen
`cf push`-/Task-Logs bleiben sichtbar; Umgebungswerte sind maskiert. Der API-Zugang
bleibt bis zur Login-Implementierung gesperrt. [Release-Details](../../deploy/cloud-foundry/README.md).
