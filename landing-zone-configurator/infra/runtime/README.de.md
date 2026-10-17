<a id="configurator-runtime-infrastructure"></a>

# Configurator-Runtime-Infrastruktur

[English](README.md) | [Deutsch](README.de.md)

Dieser Root erstellt den Space `configurator` in der bestehenden CF-Organisation `lzc-dev`,
weist der Deployment-Identität die Organisationsmitgliedschaft und die Space-Developer-Rolle zu und erstellt separate
PostgreSQL- und schreibgeschützte Secrets-Manager-Anwendungsbenutzer. Die Datenbankmigrations-
und Secrets-Provisionierungszugangsdaten der Plattform sind keine Anwendungszugangsdaten.

Apply läuft ausschließlich in `.github/workflows/configurator-runtime.yml` mit sichtbaren
Schritten für `tofu init`, `tofu plan` und `tofu apply`. State wird mit einem eigenen
Schlüssel unter `configurator/lzc-dev/runtime/terraform.tfstate` im Workload-Bucket verschlüsselt.
Dieselbe Concurrency-Gruppe `configurator-lzc-dev-mutation` auf Workflow-Ebene serialisiert
alle Configurator-Mutationen. Lokale Applies auf Remote-State werden nicht unterstützt.

Plattform-Outputs liefern CF-Authentifizierung und bestehende Service-IDs über private
Dateien. Der sensitive Output `app_environment` ist ausschließlich für die Backend-CF-
Anwendung bestimmt; niemals in Logs, Frontend-Builds oder unverschlüsselten Artefakten offenlegen.
Die App hat noch keine Datenbankschema-Berechtigungen, und der Secrets-Zugriff ist für diesen
Konnektivitätsmeilenstein schreibgeschützt. Tenant-Autorisierung und schreibende Credential-Operationen benötigen
eine separate Anwendungsimplementierung, bevor Benutzer aufgenommen werden.

Benutzerfreigabe (2026-09-30): Notwendige Configurator-Deployment-Applies sind
bis zum MVP-Meilenstein genehmigt. Gespeicherte Pläne werden weiterhin auf ihren Umfang geprüft, und
die GitHub-Environment-Freigabe bleibt erhalten. Änderungen bleiben auf dem Feature-Branch.
