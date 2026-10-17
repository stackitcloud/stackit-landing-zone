<a id="terraform-style-guide"></a>
# Terraform-Stilleitfaden

[English](terraform-style.md) | [Deutsch](terraform-style.de.md)

Diese Datei definiert die Terraform-Stilkonventionen für dieses Repository auf Grundlage des [HashiCorp Terraform Style Guide](https://developer.hashicorp.com/terraform/language/style). Sämtlicher Terraform-Code in diesem Workspace MUSS diesen Regeln entsprechen. Setzen Sie bei der Prüfung oder Generierung von Terraform-Code jede der folgenden Regeln durch.

---

<a id="code-formatting"></a>
## Codeformatierung

- Rücken Sie pro Verschachtelungsebene um **zwei Leerzeichen** ein.
- Richten Sie `=`-Zeichen aus, wenn mehrere einzeilige Argumente in aufeinanderfolgenden Zeilen derselben Verschachtelungsebene stehen:
  ```hcl
  ami           = "abc123"
  instance_type = "t2.micro"
  ```
- Platzieren Sie alle Argumente **oben** im Block und verschachtelte Blöcke **darunter**, getrennt durch eine Leerzeile.
- Trennen Sie logische Argumentgruppen innerhalb eines Blocks durch **Leerzeilen**.
- **Meta-Argumente zuerst**: Führen Sie Meta-Argumente (`count`, `for_each`) oben in einem Ressourcenblock auf, durch eine Leerzeile von anderen Argumenten getrennt.
- **Meta-Argumentblöcke zuletzt**: Platzieren Sie `lifecycle`- und `depends_on`-Blöcke unten, durch eine Leerzeile von anderen Blöcken getrennt.
  ```hcl
  resource "aws_instance" "example" {
    # meta-argument first
    count = 2

    ami           = "abc123"
    instance_type = "t2.micro"

    network_interface {
      # ...
    }

    # meta-argument block last
    lifecycle {
      create_before_destroy = true
    }
  }
  ```
- Trennen Sie **Blöcke auf oberster Ebene** durch genau eine Leerzeile.
- Trennen Sie **verschachtelte Blöcke** durch Leerzeilen, außer bei der Gruppierung zusammengehöriger Blöcke desselben Typs.
- Führen Sie vor dem Commit `terraform fmt` aus. Verwenden Sie `-recursive`, um Unterverzeichnisse zu formatieren.

<a id="code-validation"></a>
## Codevalidierung

- Führen Sie vor dem Commit `terraform validate` aus, um Syntax und interne Konsistenz zu prüfen.

<a id="comments"></a>
## Kommentare

- Verwenden Sie `#` für **alle** Kommentare (einzeilig und mehrzeilig). Verwenden Sie NICHT `//` oder `/* */`.
- Schreiben Sie selbsterklärenden Code; fügen Sie Kommentare nur hinzu, wenn sie zur Erläuterung von Komplexität erforderlich sind.

<a id="resource-naming"></a>
## Ressourcenbenennung

- Verwenden Sie für jeden Ressourcennamen ein **aussagekräftiges Substantiv**.
- Trennen Sie Wörter durch **Unterstriche** (`_`), nicht durch Bindestriche oder camelCase.
- Nehmen Sie den Ressourcentyp NICHT in den Ressourcennamen auf (die Adresse enthält ihn bereits).
- Setzen Sie sowohl Ressourcentyp als auch Namen in **doppelte Anführungszeichen**.

  **Schlecht:**
  ```hcl
  resource aws_instance webAPI-aws-instance {...}
  ```
  **Gut:**
  ```hcl
  resource "aws_instance" "web_api" {...}
  ```

<a id="resource-order"></a>
## Ressourcenreihenfolge

- Definieren Sie **Datenquellen vor** den Ressourcen, die sie referenzieren, damit der Code „auf sich selbst aufbaut“.
- Ordnen Sie Parameter innerhalb eines Ressourcenblocks wie folgt:
  1. Meta-Argument `count` oder `for_each`
  2. Ressourcenspezifische Parameter, die keine Blöcke sind
  3. Ressourcenspezifische Blockparameter
  4. `lifecycle`-Block (falls erforderlich)
  5. `depends_on` (falls erforderlich)

<a id="variables"></a>
## Variablen

- Jede Variable MUSS `type` und `description` besitzen.
- Geben Sie für optionale Variablen einen `default` an.
- Setzen Sie `sensitive = true` für Passwörter, private Schlüssel und andere Geheimnisse.
- Verwenden Sie `validation`-Blöcke nur, wenn für Werte besonders einschränkende Anforderungen gelten.
- Ordnen Sie Variablenparameter wie folgt:
  1. `type`
  2. `description`
  3. `default` (optional)
  4. `sensitive` (optional)
  5. `validation`-Blöcke

  ```hcl
  variable "db_disk_size" {
    type        = number
    description = "Disk size for the API database"
    default     = 100
  }

  variable "db_password" {
    type        = string
    description = "Database password"
    sensitive   = true
  }
  ```

<a id="outputs"></a>
## Ausgaben

- Jede Ausgabe MUSS eine `description` besitzen.
- Ordnen Sie Ausgabeparameter wie folgt:
  1. `description`
  2. `value`
  3. `sensitive` (optional)

  ```hcl
  output "web_public_ip" {
    description = "Public IP of the web instance"
    value       = aws_instance.web.public_ip
  }
  ```

<a id="local-values"></a>
## Lokale Werte

- Verwenden Sie lokale Werte **sparsam**; übermäßige Verwendung erschwert das Verständnis des Codes.
- Definieren Sie lokale Werte in einer Datei `locals.tf`, wenn sie in mehreren Dateien referenziert werden.
- Definieren Sie lokale Werte **oben** in einer Datei, wenn sie nur dort verwendet werden.
- Verwenden Sie aussagekräftige Substantive mit Unterstrichen für die Namen lokaler Werte.

<a id="provider-configuration"></a>
## Provider-Konfiguration

- Nehmen Sie immer eine **Standard-Provider-Konfiguration** (ohne `alias`) auf.
- Definieren Sie **alle Provider** in derselben Datei.
- Definieren Sie bei mehreren Instanzen eines Providers den **Standard zuerst**.
- Bei nicht standardmäßigen Providern muss der Parameter `alias` der **erste** Parameter im Block sein.

<a id="dynamic-resource-count-count--for_each"></a>
## Dynamische Ressourcenanzahl (`count` / `for_each`)

- Verwenden Sie `count` und `for_each` **sparsam**; sie erhöhen die Komplexität.
- Verwenden Sie `count`, wenn Ressourcen nahezu identisch sind.
- Verwenden Sie `for_each`, wenn Argumente unterschiedliche, nicht aus einer Ganzzahl ableitbare Werte benötigen.
- Ein übliches Muster für bedingte Ressourcen: `count = var.condition ? 1 : 0`.
- Fügen Sie einen Kommentar hinzu, wenn die Wirkung eines Meta-Arguments nicht sofort ersichtlich ist.

<a id="file-naming-conventions"></a>
## Konventionen für Dateinamen

- `main.tf` — Ressourcen- und Datenquellenblöcke (oder bei wachsendem Code nach logischen Gruppen aufteilen).
- `variables.tf` — alle Variablenblöcke in **alphabetischer Reihenfolge**.
- `outputs.tf` — alle Ausgabeblöcke in **alphabetischer Reihenfolge**.
- `providers.tf` — alle `provider`-Blöcke und deren Konfiguration.
- `terraform.tf` — einzelner `terraform`-Block mit `required_version` und `required_providers`.
- `backend.tf` — Backend-Konfiguration.
- `locals.tf` — lokale Werte (wenn von mehreren Dateien verwendet).
- `override.tf` — Überschreibungsdefinitionen (sparsam verwenden, ursprüngliche Ressource kommentieren).
- Teilen Sie Ressourcen bei wachsendem Code in logisch benannte Dateien auf (z. B. `network.tf`, `storage.tf`, `compute.tf`). Es sollte sofort klar sein, wo eine Ressource zu finden ist.

<a id="version-pinning"></a>
## Versionsfestlegung

- Legen Sie **Provider-Versionen** in `required_providers` fest.
- Legen Sie **Modulversionen** auf eine bestimmte Major- und Minor-Version fest.
- Setzen Sie im `terraform`-Block eine Mindestversion `required_version` für das Terraform-Programm.
  ```hcl
  terraform {
    required_providers {
      aws = {
        source  = "hashicorp/aws"
        version = "5.34.0"
      }
    }
    required_version = ">= 1.7"
  }
  ```
- Verwenden Sie für Registry-Module den Parameter `version` im `module`-Block.

<a id="module-structure"></a>
## Modulstruktur

- Gruppieren Sie logisch zusammengehörige Ressourcen in Modulen.
- Speichern Sie lokale (Child-)Module in `./modules/<module_name>`.
- Befolgen Sie die [Standardmodulstruktur](https://developer.hashicorp.com/terraform/language/modules/develop/structure).
- Benennen Sie Modul-Repositories bei Veröffentlichung in einer Registry nach `terraform-<PROVIDER>-<NAME>`.

## .gitignore

Committen Sie NICHT:
- `terraform.tfstate` und `terraform.tfstate.*`-Sicherungsdateien.
- `.terraform.tfstate.lock.info`.
- Das Verzeichnis `.terraform/`.
- Gespeicherte Plandateien (aus `terraform plan -out`).
- `.tfvars`-Dateien mit sensiblen Informationen.

Committen Sie immer:
- Den gesamten `.tf`-Code.
- Die Abhängigkeits-Lockdatei `.terraform.lock.hcl`.
- `.gitignore`.
- `README.md`.

<a id="secrets-management"></a>
## Geheimnisverwaltung

- Speichern Sie niemals Geheimnisse im Klartext in Terraform-Dateien.
- Verwenden Sie providerspezifische Umgebungsvariablen für Zugangsdaten.
- Verwenden Sie nach Möglichkeit einen Secrets Manager (z. B. HashiCorp Vault).
- Markieren Sie sensible Variablen mit `sensitive = true`.

<a id="testing"></a>
## Tests

- Schreiben Sie Tests für Terraform-Module.
- Führen Sie Tests vor dem Merge in Pull Requests oder als CI/CD-Pipelineschritte aus.

<a id="linting"></a>
## Linting

- Verwenden Sie einen Linter wie [TFLint](https://github.com/terraform-linters/tflint), um Codierungsstandards durchzusetzen.
- Führen Sie vor jedem Commit `terraform fmt` und `terraform validate` aus.
