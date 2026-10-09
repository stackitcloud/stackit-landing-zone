# Landing Zone Configurator

Zentral gehostete, mandantenfähige Anwendung zum Erstellen, Bearbeiten und Deployen von Konfigurationen des STACKIT Landing Zone Accelerators.

Status vom 2026-10-09: STACKIT-Login, Organisationsbindung sowie Platform- und
Application-Plan/Apply sind lokal implementiert, ebenso Application-Destroy und
read-only Drift Detection. Das gehostete Release ist qualifiziert, aber wegen der
noch fehlenden öffentlichen ID des bereits angeforderten Web-Clients nicht aktiviert.
Recovery-Abgleich, explizite Application-Upgrades, Quoten und Model-Serving-Chat
bleiben offene MVP-Themen.

**Rechnerwechsel und aktueller Arbeitsstand:**
[Entwicklungsübergabe](docs/development-handoff-2026-10-09.md) und
[bereinigter Chat-Export](docs/development-chat-2026-10-09.md).

**Aktuelle Arbeitspakete und Abnahme: [MVP-Arbeitsliste](docs/mvp-readiness.md).**
[Priorisierte Accelerator-Issues](docs/backlog-priorities.md).

Entwicklungsumgebung: [Configurator öffnen](https://lzc-dev-configurator.apps.01.cf.eu01.stackit.cloud).
Start und Prüfungen: [Entwicklungsanleitung](app/README.md).
[Betriebsstand](docs/platform-readiness.md), [IaC-Bedienung](infra/README.md),
[CI-Betrieb](infra/ci/README.md).

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
      worker/              # Isolierter Plan-Worker und Ergebnisprojektion
    packages/
      domain/              # Fachmodell, Schema, Validierung, Compiler
      contracts/           # API- und Job-Verträge ohne Secrets
  tools/
    hcl-adapter/           # Begrenzter Importadapter für bestehende tfvars
  infra/
    bootstrap/             # State-/Betriebsgrundlage vor Plattformaufbau
    backend/               # S3-Versionierung nach dem State-Bootstrap
    platform/              # Eigener OpenTofu-Root für Configurator-Dienste
    runtime/               # CF-Space, Rollen und Laufzeitidentitäten
    environments/          # Secretfreie Umgebungsparameter
  deploy/
    cloud-foundry/         # App-Manifeste und Release-Konfiguration
    runner/                # Isolierte OpenTofu-Ausführung und Paketierung
  docs/
    decisions/             # Architekturentscheidungen
```

Die Accelerator-Quellen bleiben unter `../src/`. Der Configurator bekommt eigene Abhängigkeiten, Build-Konfigurationen, Tests, Toolversionen und IaC-States. Keine App-Dateien in `../src/` und keine Vermischung der Plattform-IaC mit Kunden-Landing-Zones. Laufende Deployments verwenden eine freigegebene Accelerator-Revision; der benachbarte Ordner ist keine unversionierte Produktionsabhängigkeit.

Der App-Workspace verwendet npm mit gepinnten Abhängigkeiten und Lockfile. `validate-configurator.yml` prüft Configurator-Änderungen getrennt. Der HCL-Adapter prüft Template- und Root-Eingabekataloge gegen die Accelerator-Quellen; Änderungen am Ausführungsvertrag benötigen zusätzlich passende Runner-Tests.

## Lokale Plattform-Zugangsdaten

Vom Benutzer bereitgestellt und am bisherigen Ort belassen:

- `../landing-zone-configurator.env`: Angaben zum vorgesehenen Betreiberprojekt im `NAME=WERT`-Format; Variablen-Mapping für die IaC vor Nutzung festlegen.
- `../landing-zone-configurator-credentials.json`: Service-Account-Datei für dieses Projekt.

Beide Dateien sind im Root-`.gitignore` ausgeschlossen. Inhalte nicht in Git, Build-Kontexte, CF-Manifeste oder Planungsdokumente übernehmen. Künftige Deployment-Skripte lösen die Pfade explizit relativ zum Repository auf; sie laden die Dateien nicht implizit aus dem Arbeitsverzeichnis. Die vorhandene `.env` wird nicht als Shell-Skript ausgeführt.

Diese Identität ist für die Configurator-Plattform vorgesehen, nicht als Ersatz für persönliche Kunden-Deployment-Credentials. Projekt-Lesezugriff und ausgewählte Metadatenabfragen wurden geprüft; Erstellrechte für Object Storage und S3-Versionierung sind durch den Seed-Apply nachgewiesen. Erst später, nach Definition der Eingaben, den absoluten Credential-Pfad im Plattform-Deployment-Prozess an `STACKIT_SERVICE_ACCOUNT_KEY_PATH` übergeben; die Accelerator-Konfiguration in `../mise.toml` bleibt davon unabhängig.
