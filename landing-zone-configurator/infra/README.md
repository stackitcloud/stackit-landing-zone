# Configurator-Infrastruktur

Alle Dienste und deren Aktivierung werden über IaC verwaltet. Keine manuelle Erstellung im Portal. Operator-Eingaben und sichere Übergabe von Credentials sind Konfiguration, keine alternative Provisionierung.

## Roots und Reihenfolge

0. **seed/** und **seed-protection/**: separater Verwaltungs-Bucket im bestehenden Projekt, Zugang und Versionierung; verschlüsselter lokaler Seed-State mit verschlüsselter Remote-Sicherung.
1. **bootstrap/**: aktiviert Object Storage über den ersten Bucket, erstellt State-Bucket, Credential-Gruppe und befristeten S3-Zugang. Verschlüsselter S3-State im Verwaltungs-Bucket.
2. **backend/**: aktiviert Bucket-Versionierung über die STACKIT-S3-API mit den nun existierenden Credentials; eigener verschlüsselter S3-State im Verwaltungs-Bucket.
3. **platform/**: S3-Backend im Bootstrap-Bucket, CF-Organisation und technischer Manager, PostgreSQL mit Datenbank/Migrationsnutzer, Secrets Manager mit Provisionierungsnutzer, Artefakt-Bucket und Model-Serving-Aktivierung/Token.
4. **runtime/** (noch zu implementieren): CF-Spaces, Rollen, gemeinsame Service-Instanzen, eingeschränkter DB-App-Zugang/RLS, Secret-Policies und Artefaktzugriffe. Eigener State; nur benötigte Outputs aus der vorigen Schicht im Speicher übergeben.

Diese Trennung verhindert, dass der CF-Provider einen noch nicht erzeugten Runtime-Zugang benötigt. Kein allgemeiner `-target`-Workflow und kein manueller Portal-Bootstrap. Weitere Dienste, etwa Observability, folgen ebenfalls als IaC-Ressourcen.

## Nachgewiesene Aktivierung im Provider

Der gepinnte STACKIT-Provider `0.114.0` ruft beim Erstellen von `stackit_objectstorage_bucket` zuerst `EnableProject` auf. Für `stackit_modelserving_token` aktiviert er zunächst den regionalen Model-Serving-Service und erstellt anschließend den Token. Beide Aktivierungen sind damit Bestandteil des jeweiligen OpenTofu-Apply.

Quellen: [Bucket-Create](https://github.com/stackitcloud/terraform-provider-stackit/blob/v0.114.0/stackit/internal/services/objectstorage/bucket/resource.go), [Model-Serving-Create](https://github.com/stackitcloud/terraform-provider-stackit/blob/v0.114.0/stackit/internal/services/modelserving/token/resource.go).

Für Bucket-Versionierung fehlt in diesem Provider eine eigene Ressource. `aws_s3_bucket_versioning` aus `hashicorp/aws` spricht ausschließlich den STACKIT-S3-Endpunkt an; es werden keine Ressourcen bei AWS angelegt. Tatsächliche API-Kompatibilität und Locking bleiben bis zum ersten Apply/Integrationstest unbestätigt.

## Werkzeug und lokale Dateien

OpenTofu **1.12.6**, Node.js **24.21.0**. Provider sind exakt gepinnt, alle drei `.terraform.lock.hcl` werden versioniert. Der Wrapper nutzt standardmäßig `tofu`; alternativ `LZC_TOFU_BIN=/absoluter/pfad/tofu` setzen.

Aus dem Verzeichnis `landing-zone-configurator/`:

```sh
node infra/tofu.mjs bootstrap init -backend=false
node infra/tofu.mjs bootstrap validate
node infra/tofu.mjs bootstrap test
node infra/tofu.mjs backend init -backend=false
node infra/tofu.mjs backend validate
node infra/tofu.mjs backend test
node infra/tofu.mjs platform init -backend=false
node infra/tofu.mjs platform validate
node infra/tofu.mjs platform test
```

Tests nutzen gemockte Provider; sie legen keine Cloud-Ressourcen an. Bei abweichender globaler Node-Version kann der aus der [App-Anleitung](../app/README.md) bekannte `npm exec`-Präfix verwendet werden.

Der Wrapper erzeugt root-spezifische Verschlüsselungs-Passphrases unter `../.local/<root>/state.passphrase`, Dateirechte 0600. State und gespeicherte Plans sind durch OpenTofu AES-GCM verschlüsselt; Passphrases werden nur über `TF_ENCRYPTION` übergeben. Nicht in tfvars, Git oder CF-Variablen übernehmen. **Vor dem ersten Apply die Schlüssel unabhängig und sicher sichern.** `.gitignore` ersetzt keine Sicherung und verhindert auch keine Betriebssystem-/Cloud-Drive-Synchronisation.

Bootstrap und Backend verwenden nun den separaten Verwaltungs-Bucket. Nur die Seed-Stufen verbleiben lokal: Sie erstellen den Bucket und dessen Versionierung selbst. `check-management-backend.mjs` sichert ihre verschlüsselten States unter `recovery/` im Bucket und prüft den Download per Hash. Die Schlüssel bleiben separat lokal; ihre dauerhafte unabhängige Hinterlegung im betrieblichen Secret-System/GitHub Environment ist noch offen. Die Kopie im selben Bucket schützt nicht vor Verlust des gesamten Buckets. Seed-Änderungen erfolgen bis zur Betriebsübergabe durch einen einzigen Operator; danach die Sicherung erneuern.

Der bisherige Bootstrap hatte nur einen Plan, keinen angewendeten State. Daher wurde kein existierender Ressourcen-State migriert. Bei künftigen Backend-Wechseln bestehende States ausdrücklich migrieren und niemals durch `init -reconfigure` verwerfen.

## Operator-Eingaben und Plan

Die erste Entwicklungsumgebung **lzc-dev in eu01** ist bestätigt und in der vorhandenen, ignorierten Root-Datei eingetragen. Der erste Backend-Zugang ist mit ungefähr 90 Tagen Laufzeit geplant. Beispiel für die relevanten Eingaben:

```dotenv
# PROJECT_ID und ORGANISATION_ID sind bereits vorhanden.
REGION=eu01
NAME_PREFIX=lzc-dev
STATE_CREDENTIAL_EXPIRATION=2026-12-28T00:00:00Z
```

Dies ist die bestätigte Entwicklungsumgebung, keine Produktionskonfiguration. Ablaufdatum bewusst wählen und vor Ablauf rotieren. `ORGANISATION_ID` wird nicht zur Erstellung einer neuen Organisation verwendet; dieses Vorhaben arbeitet im bestehenden Projekt.

Der Wrapper führt die Datei nicht als Shellcode aus und verwendet ausschließlich die zugehörige Service-Account-Datei. Für den Plattform-Root zusätzlich eine geprüfte lokale tfvars-Datei unter `.local/` bereitstellen; siehe [Parameterbeispiel](environments/development.tfvars.example). Keine Platzhalter in einen echten Apply übernehmen.

```sh
node infra/tofu.mjs bootstrap init
node infra/tofu.mjs bootstrap plan
# Nach Prüfung des angezeigten Plans und unabhängiger Schlüsselsicherung:
node infra/tofu.mjs bootstrap apply

node infra/tofu.mjs backend init
node infra/tofu.mjs backend plan
node infra/tofu.mjs backend apply

node infra/tofu.mjs platform init
node infra/tofu.mjs platform plan -var-file=../../.local/platform-inputs.tfvars
# Nach Prüfung des konkreten Plans:
node infra/tofu.mjs platform apply
```

`plan` speichert verschlüsselt unter `.local/<root>/review.tfplan`; `apply` führt ausschließlich diese Datei aus. Ein gespeicherter Plan wird von OpenTofu ohne weitere interaktive Bestätigung angewendet: Der explizite `apply`-Aufruf ist die Freigabe. Ein Manifest bindet den Plan an seinen Hash und die lokale `.env`-Konfiguration; fehlgeschlagene, verbrauchte oder mehr als 24 Stunden alte Plans werden abgewiesen. Nach Konfigurationsänderungen immer neu planen. `prevent_destroy` blockiert unbeabsichtigte Ersetzung/Löschung wichtiger Ressourcen, ersetzt aber kein Backup.

Der Wrapper liest für die Plattform die S3-Zugangsdaten aus den verschlüsselten Bootstrap-Outputs in den Arbeitsspeicher und setzt sie nur im Kindprozess. Backend-Konfiguration enthält keine Schlüssel. Die Plattforminitialisierung prüft zuvor die vom Backend-Root angewendete Versionierung. Der Wrapper verwaltet derzeit genau eine Umgebung pro Checkout; weitere Umgebungen benötigen getrennte State-/Schlüsselkontexte und dürfen nicht durch bloßes Umbenennen dieses Checkouts erzeugt werden. S3-Locking mit `use_lockfile` muss gegen STACKIT praktisch getestet werden, bevor mehrere Operatoren oder automatisierte Applies zugelassen werden.

## Implementierungsstand

- [x] Bootstrap-/Backend-/Plattform-Ressourcen als Code, Provider-Lockfiles und Verschlüsselung.
- [x] Alle drei Roots validiert; sieben Mock-Plan-Tests sowie drei Tests des Plan-Prüfmechanismus.
- [x] Eigene CI-Jobs ohne Cloud-Credentials vorbereitet.
- [x] Erster echter Bootstrap-Plan für lzc-dev/eu01: 3 Create, 0 Update, 0 Delete.
- [ ] Erstes Apply und S3-Versionierungs-/Locking-/Restore-Test.
- [ ] Runtime-Root, App-Bindings, eingeschränkte DB-Rollen und Secret-/Bucket-Policies.
- [ ] Automatisierte Credential-Rotation samt Bindings und Restore-Runbook.

Angewendet sind jetzt ausschließlich Verwaltungs-Bucket, Credentials-Gruppe, S3-Zugang und Versionierung. Bootstrap ist am Remote-Backend initialisiert und neu geplant; Plattformdienste sind noch nicht erstellt.

## CI/CD-Zielbild

Getrennte Bootstrap-, Plattform- und Release-Pipelines sind in [CI/CD](../docs/cicd.md) geplant. App-Objekte, Routen und App-Bindings gehören dabei dem deklarativen Release-Prozess. Vor Cloud-Applies in CI werden lokale Bootstrap-/Backend-States auf ein unabhängiges dauerhaftes Backend umgestellt und bestehende Verschlüsselungsschlüssel sicher eingebunden. Die Deployment-Pipelines sind noch nicht implementiert.

## Verwaltungs-Seed ausführen und wiederherstellen

```sh
node infra/tofu.mjs seed init
node infra/tofu.mjs seed plan
node infra/tofu.mjs seed apply
node infra/tofu.mjs seed-protection init
node infra/tofu.mjs seed-protection plan
node infra/tofu.mjs seed-protection apply
node infra/check-management-backend.mjs
# Nur bei einer erstmaligen Initialisierung ohne vorhandenen lokalen Ressourcen-State:
node infra/tofu.mjs bootstrap init -reconfigure
node infra/tofu.mjs bootstrap plan
```

Der Integrationscheck benötigt zusätzlich die AWS CLI, spricht aber ausschließlich den STACKIT-Endpunkt an. Er legt kurzlebige Testobjekt-Versionen an und entfernt nur diese; verschlüsselte Recovery-States bleiben erhalten. Wiederherstellung: passende Seed-State-Version aus `recovery/` herunterladen, lokalen State-Pfad und zugehörigen unabhängig gesicherten Schlüssel wiederherstellen, Seed initialisieren und zunächst einen Plan prüfen. Bei abgelaufenen S3-Zugängen ist eine Wiederherstellung des Zugangs über den Projekt-Service-Account erforderlich. Dieser Recovery-Pfad und Schlüsselrotation müssen vor CI-Freigabe vollständig geübt werden.

## CI-Übergabe: aktueller Stand

[Bootstrap-CI](ci/README.md) ist lokal implementiert und mit einem echten Plan geprüft. Der konkurrierende S3-Locking-Test ist **fehlgeschlagen**; `use_lockfile=true` bietet am getesteten Endpunkt keinen nachgewiesenen Schutz. `ci/backend-safety.json` sperrt deshalb Bootstrap-/Backend-/Plattform-Applies im Wrapper und im CI-Einstieg. Die oben gezeigten Apply-Befehle sind bis zur Lösung nicht ausführbar. Seed und Seed-Protection bleiben lokale Einzeloperator-Stufen.

Reproduktion des isolierten Tests: `node infra/check-state-lock.mjs`. Er nutzt ausschließlich einen eindeutigen `checks/locking/`-Präfix, erstellt keine Cloud-Infrastruktur und entfernt seine Testobjekt-Versionen nach dem Lauf. Verschlüsselung und Versionierung ersetzen kein funktionierendes Locking.

### Aktualisierte Betriebsfreigabe

Der Benutzer hat anschließend ausschließlich serialisierte CI-Applies bestätigt. Die vollständige Remote-Apply-Sperre ist dafür im CI-Einstieg aufgehoben; im lokalen Wrapper bleibt sie bestehen. Gemeinsame Concurrency-Gruppe aller mutierenden Workflows: `configurator-lzc-dev-mutation`, laufende Jobs nicht abbrechen. Native S3-Locking-Unterstützung wird weiterhin nicht behauptet. Details und Grenzen: [CI-Betrieb](ci/README.md).
