# Configurator-Infrastruktur

Alle Configurator-Dienste werden per OpenTofu verwaltet. Die Infrastruktur bleibt vom eigentlichen Landing Zone Accelerator getrennt. OpenTofu **1.12.6** und Provider-Versionen sind gepinnt; jeder ausführbare Root hat ein versioniertes Lockfile.

## Roots und Reihenfolge

| Root | Aufgabe | State |
| --- | --- | --- |
| `seed` | Verwaltungs-Bucket und dessen S3-Zugang | lokal verschlüsselt, mit verschlüsselter Remote-Sicherung |
| `seed-protection` | Versionierung des Verwaltungs-Buckets | lokal verschlüsselt, mit verschlüsselter Remote-Sicherung |
| `bootstrap` | Workload-State-Bucket und dessen S3-Zugang | Verwaltungs-Bucket |
| `backend` | Versionierung des Workload-State-Buckets | Verwaltungs-Bucket |
| `platform` | CF-Organisation/Manager, PostgreSQL/Datenbank/Migrationsnutzer, Secrets Manager/Provisionierungsnutzer, Artefakt-Bucket und Model-Serving-Token | Workload-Bucket |
| `runtime` | CF-Space, Organisations-/Space-Rollen, PostgreSQL-/Secrets-Laufzeitbenutzer | Workload-Bucket, eigener Schlüssel |

Bootstrap, Backend, Plattform und Runtime sind in `lzc-dev/eu01` provisioniert. Die Plattform enthält neun verwaltete Ressourcen; der [Betriebsstand](../docs/platform-readiness.md) dokumentiert Abnahme und offene Konnektivitätsarbeiten.

Der STACKIT-Provider aktiviert Object Storage und Model Serving bei der ersten Ressourcenerstellung. Für Bucket-Versionierung spricht der AWS-Provider ausschließlich die STACKIT-S3-API an; es werden keine AWS-Ressourcen angelegt.

## Deployment: direkte OpenTofu-Schritte in CI

[Bootstrap-Workflow](../../.github/workflows/configurator-bootstrap.yml), [Plattform-Workflow](../../.github/workflows/configurator-platform.yml) und [Runtime-Workflow](../../.github/workflows/configurator-runtime.yml) führen `tofu init`, `validate`, `plan` und `apply` direkt aus. Normale CLI-Ausgaben sind live sichtbar. Kleine Hilfsprogramme bereiten Credentials vor, prüfen das gespeicherte Plan-Artefakt und verschlüsseln Recovery-Snapshots; sie führen keine Deployments aus.

[CI-Betriebsanleitung](ci/README.md): Environments, Planfreigabe, Timeouts, State-Sicherung und Feature-Branch-Tests. Remote-Applies ausschließlich über die gemeinsam serialisierte CI; keine parallelen lokalen Applies. S3-Locking hat den Integrationstest nicht bestanden und wird nicht als funktionierender Schutz behauptet.

## Lokal validieren, ohne Cloud-Zugriff

Benötigt werden OpenTofu 1.12.6 und Node.js 24.21.0 für die reine Umgebungs-Vorbereitung. Aus `landing-zone-configurator/`, beispielhaft für `platform`:

```sh
node infra/prepare-local.mjs platform --validation
(
  . .local/validation/platform/environment.sh
  tofu -chdir=infra/platform init -backend=false -lockfile=readonly -input=false
  tofu -chdir=infra/platform validate -no-color
  tofu -chdir=infra/platform test -no-color
)
tofu -chdir=infra fmt -check -recursive
node --test infra/prepare-local.test.mjs infra/plan-guard.test.mjs infra/state-key.test.mjs infra/ci/*.test.mjs
```

Die Vorbereitung erzeugt nur eine private Umgebungsdatei und einen lokalen Testschlüssel. Sie führt keinen OpenTofu-Befehl aus. Die Testumgebung liegt separat unter `.local/validation/<root>` und verwendet keine produktiven Backend-Schlüssel. Für andere Roots `platform` durch den jeweiligen Namen ersetzen. Die Tests verwenden Mock-Provider. CI macht dieselben OpenTofu-Aufrufe direkt mit temporären Testschlüsseln.

## Seltene lokale Seed-Operationen

Der Verwaltungs-Seed existiert bereits. Folgende Befehle sind der dokumentierte Bedienweg für bewusst geplante Seed-Änderungen, kein notwendiger Schritt vor einem App-Deployment. Nur ein Operator arbeitet am Seed. Vor Änderungen unabhängige Schlüsselsicherung prüfen.

Eingaben bleiben in den ignorierten Dateien `landing-zone-configurator.env` und `landing-zone-configurator-credentials.json` im Repository-Root. Die env-Datei verwendet `NAME=WERT`: `PROJECT_ID`, `REGION`, `NAME_PREFIX`, `STATE_CREDENTIAL_EXPIRATION`. Credentials und State-Schlüssel niemals in Git übernehmen.

```sh
node infra/prepare-local.mjs seed
(
  . .local/seed/environment.sh
  tofu -chdir=infra/seed init -lockfile=readonly -backend-config=../../.local/seed/backend.hcl
  tofu -chdir=infra/seed plan -out=../../.local/seed/review.tfplan
  # Erst nach Prüfung des konkreten Plans:
  tofu -chdir=infra/seed apply ../../.local/seed/review.tfplan
  umask 077
  tofu -chdir=infra/seed output -json > .local/seed/outputs.json
)
node infra/prepare-local.mjs seed-protection
(
  . .local/seed-protection/environment.sh
  tofu -chdir=infra/seed-protection init -lockfile=readonly -backend-config=../../.local/seed-protection/backend.hcl
  tofu -chdir=infra/seed-protection plan -out=../../.local/seed-protection/review.tfplan
  # Erst nach Prüfung des konkreten Plans:
  tofu -chdir=infra/seed-protection apply ../../.local/seed-protection/review.tfplan
)
rm -f .local/seed/outputs.json .local/seed/environment.sh .local/seed-protection/environment.sh
```

Die Shell-Dateien enthalten sensible Werte, sind mit Modus 0600 angelegt und von Git ausgeschlossen. Die Umgebungen gelten nur in den gezeigten Subshells. Bereits vorhandene Schlüssel werden wiederverwendet; bei verlorenem Schlüssel eines bestehenden Workspace wird kein neuer erzeugt. Die Vorbereitung erlaubt Cloud-Konfiguration lokal ausschließlich für die beiden Seed-Roots.

## Recovery und verbleibende Arbeiten

Verschlüsselte Seed-Sicherungen liegen im Verwaltungs-Bucket unter `recovery/seed/terraform.tfstate` und `recovery/seed-protection/terraform.tfstate`; nach Seed-Änderungen erneuern. State-Schlüssel separat und unabhängig vom Bucket verwahren. Die Kopie im selben Bucket schützt nicht vor Verlust des gesamten Buckets.

Bei einem fehlgeschlagenen Apply zuerst CI-Logs, verschlüsselte Recovery-Artefakte und tatsächlichen Ressourcenbestand prüfen. Keinen alten Plan blind wiederholen, keinen existierenden State überschreiben. Imports und Credential-Rotation müssen zum konkreten Vorfall passen und unter derselben Single-Writer-Regel erfolgen. Der frühere automatische Einmal-Recovery-Pfad wurde nach Abschluss entfernt.

Die App und ihre CF-Umgebungsvariablen werden im separaten [Release-Workflow](../../.github/workflows/configurator-release.yml) durch das deklarative [CF-Manifest](../deploy/cloud-foundry/manifest.yml) verwaltet. Verbindungstests aus CF sind erfolgreich. Offen sind Anwendungsschema/RLS, automatisierte Credential-Rotation sowie ein vollständiger getesteter Betriebs-/Restore-Prozess. [Planung](../docs/planning.md).


Direkte CLI-Pipelines geprüft (2026-09-30): [Bootstrap 36677111141](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36677111141) und [Plattform 36677111032](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36677111032) zeigen jeweils `No changes`, mit sichtbaren nativen Init-/Plan-Logs und übersprungenem Apply. [Validierung 36677111055](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36677111055) bestätigt auch den GNU-Timeout-Test auf Linux. Aktuelle weitere Abnahmen stehen im [Plattform-Betriebsstand](../docs/platform-readiness.md).
