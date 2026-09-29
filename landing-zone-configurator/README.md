# Landing Zone Configurator

Zentral gehostete, mandantenfähige Anwendung zum Erstellen, Bearbeiten und Deployen von Konfigurationen des STACKIT Landing Zone Accelerators.

Status: lokale Entwicklungsbasis mit React-Startseite, Fastify-API, Tests und getrennter CI. Bootstrap-, Backend- und Plattform-IaC sind implementiert und lokal geprüft; Der separate Verwaltungs-Bucket samt Zugang und Versionierung ist per IaC provisioniert; die übrigen Plattformdienste stehen noch aus.

Start und Prüfungen: [Entwicklungsanleitung](app/README.md). Ergebnisse der lesenden Bestandsaufnahme: [Plattformprüfung](docs/platform-check.md).

## Dokumentation

- [Architektur, Roadmap und Checklisten](docs/planning.md)
- [Sprach- und Technologieempfehlung](docs/decisions/0001-application-stack.md)

## Struktur

```text
landing-zone-configurator/
  app/
    apps/
      web/                 # Browser-Oberfläche
      api/                 # Backend/BFF
      worker/              # Queue, Scheduler und Dispatcher
    packages/
      domain/              # Fachmodell, Schema, Validierung, Compiler
      contracts/           # API- und Job-Verträge ohne Secrets
  tools/
    hcl-adapter/           # Begrenzter Importadapter für bestehende tfvars
  runner/                  # Isolierte OpenTofu-Ausführung
  infra/
    bootstrap/             # State-/Betriebsgrundlage vor Plattformaufbau
    backend/               # S3-Versionierung nach dem State-Bootstrap
    platform/              # Eigener OpenTofu-Root für Configurator-Dienste
    modules/               # Nur Configurator-Infrastrukturmodule
    environments/          # Secretfreie Umgebungsparameter
  deploy/
    cloud-foundry/         # App-Manifeste und Release-Konfiguration
  docs/
    decisions/             # Architekturentscheidungen
```

Die Accelerator-Quellen bleiben unter `../src/`. Der Configurator bekommt eigene Abhängigkeiten, Build-Konfigurationen, Tests, Toolversionen und IaC-States. Keine App-Dateien in `../src/` und keine Vermischung der Plattform-IaC mit Kunden-Landing-Zones. Laufende Deployments verwenden eine freigegebene Accelerator-Revision; der benachbarte Ordner ist keine unversionierte Produktionsabhängigkeit.

Der App-Workspace verwendet npm mit gepinnten Abhängigkeiten und Lockfile. `validate-configurator.yml` prüft Configurator-Änderungen getrennt. Sobald der HCL-/Template-Import implementiert ist, zusätzlich durch Accelerator-Vertragsänderungen ausgelöste Kompatibilitätstests ergänzen.

## Lokale Plattform-Zugangsdaten

Vom Benutzer bereitgestellt und am bisherigen Ort belassen:

- `../landing-zone-configurator.env`: Angaben zum vorgesehenen Betreiberprojekt im `NAME=WERT`-Format; Variablen-Mapping für die IaC vor Nutzung festlegen.
- `../landing-zone-configurator-credentials.json`: Service-Account-Datei für dieses Projekt.

Beide Dateien sind im Root-`.gitignore` ausgeschlossen. Inhalte nicht in Git, Build-Kontexte, CF-Manifeste oder Planungsdokumente übernehmen. Künftige Deployment-Skripte lösen die Pfade explizit relativ zum Repository auf; sie laden die Dateien nicht implizit aus dem Arbeitsverzeichnis. Die vorhandene `.env` wird nicht als Shell-Skript ausgeführt.

Diese Identität ist für die Configurator-Plattform vorgesehen, nicht als Ersatz für persönliche Kunden-Deployment-Credentials. Projekt-Lesezugriff und ausgewählte Metadatenabfragen wurden geprüft; Erstellrechte für Object Storage und S3-Versionierung sind durch den Seed-Apply nachgewiesen. Erst später, nach Definition der Eingaben, den absoluten Credential-Pfad im Plattform-Deployment-Prozess an `STACKIT_SERVICE_ACCOUNT_KEY_PATH` übergeben; die Accelerator-Konfiguration in `../mise.toml` bleibt davon unabhängig.
