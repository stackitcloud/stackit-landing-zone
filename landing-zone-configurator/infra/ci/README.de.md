# OpenTofu in GitHub Actions

[English](README.md) | [Deutsch](README.de.md)

Die zentrale [Workflow-Uebersicht](../../../docs/workflows.de.md) beschreibt alle
Pipelines, automatische und manuelle Ausloeser, Eingaben und den Start im
GitHub-UI. Diese Seite vertieft die Operator- und Freigabevertraege.

Die ausführbaren Deployments stehen direkt in den Workflows:

- [Configurator Bootstrap](../../../.github/workflows/configurator-bootstrap.yml): `bootstrap` oder `backend`.
- [Configurator Platform](../../../.github/workflows/configurator-platform.yml): `platform`.
- [Configurator Runtime](../../../.github/workflows/configurator-runtime.yml): `runtime`.
- [Configurator Release](../../../.github/workflows/configurator-release.yml): gebautes Web/API-Paket mit direkten `cf`-Befehlen ausliefern.
- [Validierung](../../../.github/workflows/validate-configurator.yml): Formatierung, Validierung und Mock-Tests aller sechs Roots ohne Cloud-Credentials.

Jeder Deployment-Job zeigt die einzelnen Schritte: Credential-Vorbereitung, gegebenenfalls Lesen der vorherigen Backend-Outputs, `tofu init`, `tofu validate`, `tofu plan` beziehungsweise `tofu apply`. Es gibt keinen eigenen JavaScript-Deployment-Runner. Einmalige Recovery-Operationen gehören nicht in diesen normalen Ablauf.

<a id="plan-and-apply"></a>

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

<a id="logs-and-secrets"></a>

### Dev-Release mit deaktiviertem Assistant

Bei Model-Serving-Ausfällen unter **Actions > Configurator Release > Run workflow**
auf Branch **main** ausdrücklich **release_mode=dev-assistant-disabled** wählen.
**build_only** nicht anhaken, **release_run_id** leer lassen und
**runner_pool_size=1** setzen. Den genauen Quellstand/Lauf prüfen und nach allen
anwendbaren Build-/Veröffentlichungsprüfungen die bestehende Umgebung
**lzc-dev-release** freigeben. Dieser Modus überspringt die Live-Qualifikation
des Assistant und erzwingt `LZC_ASSISTANT_ENABLED=false`, auch wenn die
Umgebungsvariable ihn aktiviert. Alle übrigen Prüfungen, Migrationen, geschützten
Tags und Dev-Zielprüfungen bleiben erhalten. Die Assistant-API-Routen sind nicht
registriert; die Oberfläche zeigt einen Deaktivierungshinweis. Vorlagen und Editor
bleiben nutzbar. Gespeicherte Gespräche und Vorschläge bleiben erhalten.
Der Modus autorisiert weder Produktion noch Kunden-Infrastruktur-Apply.

Das Manifest vermerkt die Beschränkung auf Dev, den deaktivierten Assistant und
die fehlende Assistant-Qualifikation; der Build-Job heißt
`build-dev-assistant-disabled`. Diese Artefakte können nicht mit `release_run_id`
übernommen werden, weder als normaler noch als weiterer deaktivierter Release.
Nach einem Deploymentfehler sind Untersuchung und ein neuer manueller Lauf nötig.
`build_only=true` erlaubt einen Build zur Prüfung, dessen Artefakt anschließend
nicht übernommen werden kann. Zum Reaktivieren ist ein neuer Release mit
**release_mode=qualified** und vollständiger quellstandsgebundener
Live-Qualifikation erforderlich; eine Umgebungsvariablenänderung aktiviert den
Assistant in diesem Modus nicht. Der Standardpfad **qualified** und dessen
Übernahmebedingungen bleiben unverändert.


## Logs und Secrets

Normale OpenTofu-Ausgaben erscheinen live im jeweiligen Schritt: Ressourcenänderungen, Fortschritt, Warnungen und Fehler. `sensitive`-Attribute/Outputs werden von OpenTofu maskiert; zusätzlich registriert die Vorbereitung die übergebenen Backend-Zugangsdaten und Verschlüsselungsschlüssel mit GitHubs `add-mask`. Kein `TF_LOG=DEBUG` und kein Shell-`set -x` für Deployment-Secrets.

`tofu output -json` und State-Ausgaben können sensible Werte enthalten. Deshalb werden ausschließlich diese Ausgaben direkt in private Dateien unter `$RUNNER_TEMP/lzc-private` umgeleitet, mit `umask 077`. Sie werden nicht als Klartext-Artefakte hochgeladen. Die Credential-Vorbereitung führt selbst keine OpenTofu-Befehle aus. Zum Jobende werden die temporären Dateien entfernt.

Quellen: [OpenTofu sensitive outputs](https://opentofu.org/docs/language/values/outputs/#sensitive--suppressing-values-in-cli-output), [GNU timeout](https://www.gnu.org/software/coreutils/manual/html_node/timeout-invocation.html).

<a id="small-utilities"></a>

## Kleine Hilfsprogramme

| Datei | Begrenzte Aufgabe |
| --- | --- |
| `prepare.mjs` | Private Credential-/Backend-Dateien und Umgebungsvariablen vorbereiten; vorhandene Workload-Outputs/Versionierung prüfen. Keine Prozessausführung. |
| `prepare-release.mjs` | Private Backend-Konfiguration und erlaubte App-Variablen für CF vorbereiten. Keine Prozessausführung. |
| `buildpack-source.mjs` | Im isolierten Release-Job den geschützten, SHA-gebundenen Buildpack-Tag anlegen; im Deployment nur lesend prüfen. Keine Tag-Updates oder -Löschungen. |
| `review.mjs` | Verschlüsselten Plan mit Manifest versehen beziehungsweise vor Apply prüfen. Keine Prozessausführung. |
| `protect-state.mjs`, `artifact.mjs` | Bereits erfasste State-Dateien für Recovery verschlüsseln. Keine Prozessausführung. |
| `context.mjs` | Eingaben, Workflow-Identität und Planbindung prüfen. |
| `configure-github.mjs` | Separates Operator-Werkzeug für Environment-Regeln und ausdrücklich freigegebene Secret-Transfers. Kein Bestandteil eines Deployments. |

<a id="backend-and-key-separation"></a>

## Backend- und Schlüsseltrennung

Bootstrap und Backend verwenden den Verwaltungs-Bucket. Der Plattform-Job initialisiert zunächst diese beiden Roots und liest ihre Outputs privat. Erst nach Prüfung der Bucket-Versionierung wechselt er für seinen eigenen State zu den Workload-S3-Credentials. Jeder Root behält seinen separaten State-Verschlüsselungsschlüssel. Seed-Schlüssel werden nicht an diese Deployment-Jobs übergeben.

| Environment | Zweck |
| --- | --- |
| `lzc-dev-bootstrap-plan` / `lzc-dev-bootstrap-apply` | Bootstrap-/Backend-Plan und freizugebender Apply |
| `lzc-dev-platform-plan` / `lzc-dev-platform-apply` | Plattform-Plan und freizugebender Apply |
| `lzc-dev-runtime-plan` / `lzc-dev-runtime-apply` | Space, Rollen und Laufzeitbenutzer |
| `lzc-dev-release` | CF-Release; Workload-S3-Zugang und Plattform-/Runtime-State-Schlüssel, kein Projekt-Service-Account |
| `lzc-dev-recovery` | Separat geschützte Seed-Recovery-Secrets, kein automatischer Recovery-Job |
| `assistant-tests` | Nur der dedizierte Model-Serving-Testtoken; keine Cloud-, State- oder Ausführungs-Credentials |

Die Konfiguration steht in `github-environments.json`, `github-platform-environments.json`, `github-runtime-environments.json` und `github-release-environments.json`. Änderungen an Secret-Zielen oder Schlüsselübertragungen benötigen die entsprechende Benutzerautorisierung. Das Operator-Werkzeug lautet `node infra/ci/configure-github.mjs` beziehungsweise mit `--platform`, `--runtime` oder `--release` für die jeweiligen Environments.

Für die Assistant-Qualifikation verwaltet `github-assistant-environments.json` ausschließlich `assistant-tests`, beschränkt auf `main` und `feature/landing-zone-configurator`. Nach dem freigegebenen Plattform-Apply liest `node infra/ci/configure-github.mjs --assistant` den neuen Testtoken aus der privaten, unverändert verschlüsselten Recovery-Datei `.local/assistant-test-platform-state.enc.json` und überträgt nur `LZC_MODEL_SERVING_TOKEN` über stdin an `gh secret set`. Dafür Node.js 24.21.0 verwenden; dieser Modus benötigt weder Seed-Zugriff noch einen OpenTofu-Unterprozess. Die Datei stammt aus der Recovery-Sicherung des erfolgreichen Applies und wird ausschließlich im Speicher entschlüsselt; vorhandene native State-Snapshots bleiben unverändert. Tokenwerte erscheinen weder im Terminal noch in Git; allgemeine STACKIT-Zugangsdaten und State-Schlüssel werden nicht an die Testumgebung übertragen. Das Environment benötigt keine manuelle Testfreigabe, erlaubt aber keine fremden Branches oder Tags.

<a id="manual-triggering-and-serialization"></a>

## Manuelle Ausloesung und Serialisierung

Alle mutierenden Configurator-Workflows verwenden `concurrency.group: configurator-lzc-dev-mutation` und `cancel-in-progress: false`, einschließlich Plan und Freigabewartezeit. Native S3-Sperren haben den Integrationstest nicht bestanden; `backend-safety.json` hält diesen Befund fest. Lokale Remote-Applies und schreibende Parallelzugriffe außerhalb dieser CI-Gruppe bleiben im vereinbarten Betrieb ausgeschlossen. Direkte CLI-Aufrufe durch Credential-Inhaber lassen sich nicht durch einen lokalen Wrapper oder GitHub-Concurrency verhindern.

Pushes und Pull Requests starten keine Infrastrukturplaene oder Deployments.
Bootstrap, Platform und Runtime werden ausschliesslich per `workflow_dispatch`
von `main` gestartet; Apply benoetigt zusaetzlich `apply=true` und die
Environment-Freigabe. Fuer den Backend-Root `root=backend` auswaehlen.
Die `LZC_PLATFORM_CI_ENABLED`-/`LZC_RUNTIME_CI_ENABLED`-Schalter bleiben zusaetzliche
Betreibergates, ersetzen aber keine manuelle Ausloesung. Alte Commit-SHA-
Freigabevariablen fuer Feature-Pushes werden nicht mehr ausgewertet.
Auch der Application-Release ist ausschliesslich manuell; ein Merge loest ihn
nicht aus. Die vorhandenen Workflows betreffen die Entwicklungsumgebung,
nicht eine neue Produktionsumgebung.

Nach erfolgreicher Assistant-Qualifikation und Build veroeffentlicht der
isolierte Release-Job `publish_buildpack` den fehlenden Buildpack-Tag.
Das gilt auch fuer `build_only=true`, solange der qualifizierte Commit noch
Branch-HEAD ist; ein Build-only-Lauf fuehrt weiterhin kein Deployment aus.
Nur dieser Job besitzt `contents: write`; er hat kein Cloud-Environment und
keine Cloud-Credentials. Bei Artefakt-Promotion wird dieser schreibfaehige Job
uebersprungen. Der Deployment-Job prueft erneut die erfolgreichen
Qualifikations-/Build-Jobs und verlangt den bereits vorhandenen, exakt
SHA-gebundenen und unveraenderlich geschuetzten Tag.
Er bleibt lesend und prueft den Tag vor dem Lesen der Deployment-Credentials.
GitHub kann fuer das Taggen historischer Commits zusaetzlich `workflows: write`
verlangen; diese Berechtigung ist fuer `GITHUB_TOKEN` nicht verfuegbar.
Fehlt bei einem aelteren qualifizierten Build der Tag, ist ein ausdruecklich
autorisierter Operator-Backfill erforderlich: Quelle zuerst mit
`release-artifact.mjs source` validieren, dann `buildpack-source.mjs publish`
mit genau dieser Revision und Operator-Authentifizierung ausfuehren.
Den Operator-Token niemals in CI hinterlegen oder den Tag-Schutz lockern.
Ein fehlgeschlagenes Deployment macht einen zuvor
erfolgreich qualifizierten Build nicht ungueltig: Ein neuer manueller Run kann
ihn mit `release_run_id` uebernehmen, solange das Artefakt nicht abgelaufen ist.

Die vorhandene Plan-Service-Account-Rolle ist nicht rein lesend. Deshalb dürfen diese Workflows ausschließlich vertrauenswürdigen Code ausführen; sie sind nicht für externe Pull Requests vorgesehen.

<a id="timeouts-and-state-backup"></a>

## Timeouts und State-Sicherung

Die Grenze steht direkt am jeweiligen `tofu`-Befehl und verwendet GNU `timeout`:

| Schritt | Geordneter Abbruch nach | Zeit bis SIGKILL | Äußeres Joblimit |
| --- | --- | --- | --- |
| Plan | 15 Minuten | weitere 2 Minuten | 30 Minuten |
| Bootstrap-/Backend-Apply | 20 Minuten | weitere 5 Minuten | 45 Minuten |
| Plattform-Apply | 70 Minuten | weitere 10 Minuten | 100 Minuten |

Ein Timeout sendet zunächst `SIGINT`, damit OpenTofu Provider beenden und State persistieren kann. Der Exit-Code bleibt ein Fehler, auch wenn der Prozess danach geordnet endet. Ein dauerhaft blockierter Prozess kann nach der zusätzlichen Wartezeit hart beendet werden. Die kurzen Init-Schritte haben eigene Grenzen; Snapshot und Upload liegen außerhalb des Apply-Kommandos und vor dem äußeren Joblimit.

Nach einem gestarteten Apply versucht ein `always()`-Schritt ausdrücklich `tofu state pull`. `protect-state.mjs` verschlüsselt diesen Snapshot und einen gegebenenfalls vorhandenen `errored.tfstate` mit AES-256-GCM und einem per scrypt aus dem jeweiligen State-Schlüssel abgeleiteten Schlüssel. Das Format enthält `salt`, `nonce`, `tag` und `data` als Base64; der State kann zusätzlich OpenTofu-verschlüsselt sein. Nur diese geschützten Dateien werden sieben Tage als Recovery-Artefakt aufbewahrt. Plan-Artefakte bleiben einen Tag erhalten. Abrupte Runner-Verluste können weiterhin manuelle Recovery erfordern.

<a id="operational-evidence"></a>

## Betriebsnachweise

Die bestehende Infrastruktur wird durch diese CI-Anpassung weder ersetzt noch
migriert. Historische Recovery-Inventare sind keine Pipeline-Eingaben und
gehoeren in die private Betriebsdokumentation. Fuer die aktuellen State- und
Recovery-Vertraege gelten [Architektur](../../docs/architecture.de.md) und
[Plattform-Betriebsstand](../../docs/platform-readiness.de.md).

<a id="runtime-and-release"></a>

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
bleibt bis zur Login-Implementierung gesperrt. [Release-Details](../../deploy/cloud-foundry/README.de.md).
