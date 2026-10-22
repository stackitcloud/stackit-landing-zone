<a id="separate-application-landing-zone-root"></a>
# Separates Application-Landing-Zone-Root

[English](README.md) | [Deutsch](README.de.md)

Dieses Root plant **eine neue Anwendungsinstanz** unter Wiederverwendung von `../modules/landing-zone`.
Es erstellt keine Plattformordner, SNAs, Plattformdienste oder anderen Anwendungen.
Es funktioniert mit manuell aufgelösten CLI-Eingaben oder vom Configurator erzeugten Eingaben.
Für die direkte CLI-Nutzung sind weder Configurator-API, Datenbank, Sitzung, Jobfreigabe
noch Template-Engine erforderlich. Migrieren Sie bestehenden kombinierten State nicht durch
Verzeichniswechsel oder das Löschen seiner `landing_zones`-Einträge: Dies kann destruktive Änderungen planen.

Der Configurator löst Templates auf und prüft seine eigenen Identitäts-/Freigaberichtlinien.
CLI-Nutzer geben die aufgelösten Werte direkt an, einschließlich Eigentümer und
Diensteinstellungen. In beiden Betriebsarten setzen STACKIT IAM und Backend-Richtlinien
Berechtigungen durch; Eingabemetadaten, Template-Versionen und Herkunftslabels sind keine IAM-Grenze.

Das wiederverwendete Modul erstellt ein Projekt, ein Automatisierungsdienstkonto mit Schlüssel,
Object-Storage-Buckets/-Zugangsdaten sowie die ausgewählten Secrets-Manager- und
Observability-Dienste. Corporate-Instanzen referenzieren eine plattformeigene SNA und
erstellen ihr Projektnetzwerk/Routing. Public-Instanzen können optional mit
`network_enabled` ein lokales Projektnetzwerk und optional mit `network_prefix_length`
eine Präfixlänge festlegen. Dieses Netzwerk wird nicht über die SNA geroutet; bisherige
öffentliche Eingaben ohne diese Option erstellen weiterhin kein Netzwerk. Templates mit
Schema 2 legen diese Werte fest, statt Überschreibungen bei Bestellungen zu erlauben.
Das Root stellt eine nicht geheime `project_network`-Referenz bereit, keine
Dienstzugangsdaten. Ein lokales Netzwerk qualifiziert sein privates CIDR nicht als
Observability-ACL-Quelle. Dieser Umfang muss bei Template-Veröffentlichung und Plan-Prüfung
sichtbar sein. Generierte Zugangsdaten verbleiben im geschützten Application-State;
sie werden nicht über Root-Ausgaben offengelegt.

Bei Corporate-Projekten übernimmt `network_prefix_length = null` den aktuellen
Standard der SNA-Region durch eine lesende Provider-Abfrage während des Plans.
Explizite Präfixe und konfigurierte DNS-Server bleiben erhalten. Der verwendete
Zugang benötigt Leserechte für die SNA-Region. Ein geänderter SNA-Standard kann in
einem späteren Plan einen Austausch des Netzes bewirken; diese Änderung vor Apply
prüfen. Das funktioniert mit vorhandenen Plattformverträgen und benötigt weder
ein zusätzliches Vertragsfeld noch eine State-Migration.


<a id="independent-two-phase-cli-workflow"></a>
## Unabhängiger zweiphasiger CLI-Ablauf

<a id="phase-1-platform"></a>
### Phase 1: Plattform

Verwenden Sie das normale [Accelerator-Bootstrap-Verfahren](../../docs/getting-started.de.md).
Konfigurieren Sie für eine **neue**, reine Plattforminstallation ausdrücklich
`landing_zones = {}`, `sandboxes = []` und `landing_zone_namespace_services = {}`
vor dem ersten Apply. Behalten Sie die erforderlichen Plattformdienste und
Governance-Ordner bei. Das bestehende Root bleibt mit kombinierten Installationen
kompatibel; ein separates physisches Plattform-Root und die Migration bestehender
States werden hier nicht eingeführt.

Exportieren Sie nach Prüfung und Anwendung des Plattformplans nur die nicht geheime Übergabe:

```sh
tofu -chdir=src output -json platform_contract > platform-contract.json
```

Diese enthält Referenzen auf Organisation, Ordner, Region, SNA, Next-Hop und
Nameserver, nicht den vollständigen Plattform-State oder Zugangsdaten. Ihre Revision ist
eine deterministische UUID, abgeleitet aus Namespace und exportierten Referenzen.
Geänderte Referenzen ändern die Revision; bewahren Sie das geprüfte Artefakt mit der
Anwendungskonfiguration auf. `tenant_id` ist ein logischer Namespace, standardmäßig
die Organisations-UUID. Das optionale `platform_contract_namespace` erlaubt eine andere
stabile UUID, beispielsweise den vorgesehenen Configurator-Workspace. Für die
CLI-Nutzung ist keine vom Configurator ausgestellte UUID erforderlich.
Öffentliche Ziele sind `public-eu01`/`public-eu02`; Corporate-Zielschlüssel enthalten
einen stabilen Hash des Area-Schlüssels, damit beliebige Area-Namen keine ungültigen
oder kollidierenden normalisierten Zielnamen erzeugen können. Nur vorhandene
Governance-Ordner/SNAs werden exportiert. Ein exportiertes Ziel ist eine
Ressourcenreferenz, keine Berechtigung zur Bereitstellung dort.

<a id="phase-2-application"></a>
### Phase 2: Anwendung

Beginnen Sie mit [dem aufgelösten JSON-Beispiel](examples/application.tfvars.json.example).
Alle Beispiel-IDs sind fiktiv. Ersetzen Sie `platform_contract` durch das Artefakt aus
Phase 1 und füllen Sie die Anwendungswerte manuell aus. Template-Rendering ist nicht
erforderlich. Setzen Sie `application.tenant_id` und `application.platform_revision`
exakt aus diesem Artefakt; wählen Sie einen seiner Zielschlüssel. Vergeben Sie
`instance_id` einmalig (beispielsweise `uuidgen | tr '[:upper:]' '[:lower:]'`) und
halten Sie sie stabil. `template_id`/`template_version` dokumentieren die gewählte
Ausgangsbasis; ein veröffentlichtes Configurator-Template ist nicht erforderlich.
Eigentümer, Rollen, Netzwerk- und Diensteinstellungen müssen nach den
Bereitstellungsrichtlinien Ihrer Organisation geprüft werden.

Stellen Sie **vor** dem ersten Application-Plan einen Application-State-Bucket bereit.
Verwenden Sie [das Backend-Beispiel](examples/backend.hcl.example), ersetzen Sie
Bucket/Schlüssel und halten Sie den Schlüssel
`applications/<namespace>/<instance>/terraform.tfstate` eindeutig und unverändert.
Verwenden Sie angemessen eingeschränkte Backend-Zugangsdaten, keine Zugangsdaten,
die einem Application Owner Zugriff auf Plattform-State geben. Übergeben Sie S3-Zugangsdaten
über `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` und Provider-Zugangsdaten über die
Standardumgebung des STACKIT-Providers. Speichern Sie keine Geheimnisse in einem der
Artefakte. Der projekteigene tfstate-Bucket kann seinen ersten Plan nicht selbst bootstrappen.

Führen Sie mit geprüften Dateien namens `application.tfvars.json` und `backend.hcl`
im Application-Verzeichnis vom Repository-Root aus Folgendes aus:

```sh
tofu -chdir=src/application init -backend-config=backend.hcl
tofu -chdir=src/application validate
tofu -chdir=src/application plan -var-file=application.tfvars.json -out=application.tfplan
tofu -chdir=src/application apply application.tfplan
tofu -chdir=src/application plan -var-file=application.tfvars.json
```

Prüfen Sie den gespeicherten Plan, bevor Sie ihn ausdrücklich anwenden. Halten Sie
State, gespeicherte Pläne und Zugangsdaten privat. Deaktivieren Sie niemals die
Sperrung, um einen anderen aktiven Job zu umgehen. Verwenden Sie pro Instanz eine
separate initialisierte Arbeitskopie; wechseln Sie Instanzschlüssel nicht beiläufig
im selben Arbeitsverzeichnis. Upgrades erfordern einen geprüften neuen Plan, keine
automatischen Änderungen bei Veröffentlichung eines Templates oder Plattformvertrags.

<a id="provenance"></a>
## Herkunft

Ressourcen mit Label-Unterstützung erhalten `landing_zone_accelerator = "true"`.
Direkte CLI-Nutzung behauptet keine Configurator-Ausführung. Der Configurator setzt
`application.configurator_execution = true`, ergänzt
`landing_zone_configurator = "true"` und behält seine bisherigen `lzc_*`-Labels bei.
Labels sind beschreibend und können von berechtigten Cloud-Nutzern eingesehen/geändert
werden; sie sind kein manipulationssicherer Ausführungsnachweis. Bestehende festgelegte
Runner-Quellen werden durch diese Quelländerungen weder umgeschrieben noch aktiviert.

Offline-Prüfungen (ohne Kundenzugangsdaten oder -ressourcen):

```sh
tofu -chdir=src/application init -backend=false
tofu -chdir=src/application validate
tofu -chdir=src/application test
```

Die Configurator-Release-CI führt diese Prüfungen auch über `npm run test:plan` in
einer isolierten vorübergehenden Kopie mit leerer Zugangsdatenumgebung und deaktiviertem Backend aus.

Tests verwenden ausschließlich Mock-Provider und Plan-Befehle. Mock-UUIDs sind
Testdaten. Bekannte Provider-Deprecation-Warnungen stammen aus bestehenden
Observability-Ausgaben des gemeinsamen Moduls. Die Root-/Provider-Lockdatei sollte
beibehalten werden, wenn dieser Prototyp in die geprüfte Runner-Revision übernommen wird.

Das eingecheckte manuelle Beispiel ist in den Mock-Tests enthalten. Der unabhängige
Test für den reinen Plattformexport läuft ohne den Configurator:

```sh
LZC_TEST_TOFU_BIN="$(command -v tofu)" bash src/tests/check-cli-contract.sh
```

Der Helfer benötigt außerdem Node.js für strukturierte JSON-Prüfungen. Er wertet das
tatsächliche Standalone-Beispiel aus und prüft zusätzlich zu den nativen Mock-Tests
ohne Zugangsdaten das Ordnerschema des geprüften Providers.

Noch abzunehmen: echter, separat autorisierter zweiphasiger CLI-Plan/Apply,
Backend-Sperrung/-Wiederherstellung, minimal berechtigte Zugangsdaten, ausdrückliche
Migration bestehender States und vollständiger Configurator-Dispatch. Mock-Tests
sind keine Cloud-Abnahme.


<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
| ---- | ------- |
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.11 |
| <a name="requirement_stackit"></a> [stackit](#requirement\_stackit) | 0.114.0 |
| <a name="requirement_time"></a> [time](#requirement\_time) | 0.14.1 |

## Providers

| Name | Version |
| ---- | ------- |
| <a name="provider_terraform"></a> [terraform](#provider\_terraform) | n/a |

## Modules

| Name | Source | Version |
| ---- | ------ | ------- |
| <a name="module_application"></a> [application](#module\_application) | ../modules/landing-zone | n/a |

## Resources

| Name | Type |
| ---- | ---- |
| [terraform_data.contract](https://registry.terraform.io/providers/hashicorp/terraform/latest/docs/resources/data) | resource |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| <a name="input_application"></a> [application](#input\_application) | Resolved application instance supplied manually or by the Configurator. Identity and deployment authorization are enforced by the caller's IAM permissions. | <pre>object({<br/>    configurator_execution = optional(bool, false)<br/>    tenant_id              = string<br/>    instance_id            = string<br/>    platform_revision      = string<br/>    template_id            = string<br/>    template_version       = number<br/>    name                   = string<br/>    env                    = optional(string, null)<br/>    owner_email            = string<br/>    target_key             = string<br/>    network_enabled        = optional(bool, false)<br/>    network_prefix_length  = optional(number, null)<br/>    secretsmanager_enabled = bool<br/>    custom_roles = optional(list(object({<br/>      name        = string<br/>      description = string<br/>      permissions = list(string)<br/>    })), [])<br/>    role_assignments = optional(list(object({<br/>      role    = string<br/>      subject = string<br/>    })), [])<br/>    observability = object({<br/>      enabled       = bool<br/>      plan_name     = string<br/>      acl           = list(string)<br/>      access_source = optional(string, "explicit-cidrs")<br/>    })<br/>  })</pre> | n/a | yes |
| <a name="input_bucket_naming"></a> [bucket\_naming](#input\_bucket\_naming) | Object Storage bucket naming scheme: legacy preserves existing names; project-id includes the complete owning project UUID for STACKIT-wide uniqueness. Changing this for existing buckets requires a reviewed migration. | `string` | `"project-id"` | no |
| <a name="input_platform_contract"></a> [platform\_contract](#input\_platform\_contract) | Reviewed non-secret platform references supplied as a CLI artifact or by the Configurator. No remote-state access. | <pre>object({<br/>    schema_version  = number<br/>    tenant_id       = string<br/>    revision        = string<br/>    organization_id = string<br/>    targets = map(object({<br/>      folder_id            = string<br/>      region               = string<br/>      corporate            = bool<br/>      network_area_id      = optional(string, null)<br/>      firewall_next_hop_ip = optional(string, null)<br/>      ipv4_nameservers     = optional(list(string), null)<br/>    }))<br/>  })</pre> | n/a | yes |

## Outputs

| Name | Description |
| ---- | ----------- |
| <a name="output_application_resources"></a> [application\_resources](#output\_application\_resources) | Non-secret resource references; never publish service credentials or complete state. |
<!-- END_TF_DOCS -->
