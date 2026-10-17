# Landing Zone Configurator

[English](README.md) | [Deutsch](README.de.md)

Der Configurator ist eine optionale, gehostete Oberfläche für den
[STACKIT Landing Zone Accelerator](../README.de.md). Er verbindet einen Konfigurationseditor,
einen Assistant, versionierte Projektvorlagen und ausdrücklich autorisierte
Infrastrukturoperationen. Der Accelerator bleibt unabhängig mit
Terraform/OpenTofu nutzbar.

<a id="start-here"></a>
## Einstieg

| Zielgruppe | Dokumentation |
| --- | --- |
| Benutzer | [Benutzerhandbuch](docs/user-guide.de.md) und [MVP-Umfang und Grenzen](docs/mvp-scope.de.md) |
| Architekten | [Komponenten, Diagramme und Vertrauensgrenzen](docs/architecture.de.md) |
| Mitwirkende | [Entwicklungsübersicht](docs/development.de.md), [lokale Einrichtung](app/README.de.md) und [Mitwirken](../CONTRIBUTING.de.md) |
| Betreiber | [Infrastruktur](infra/README.de.md), [manueller CI-Betrieb](infra/ci/README.de.md) und [CF-Releases](deploy/cloud-foundry/README.de.md) |

Die [Entwicklungsumgebung](https://lzc-dev-configurator.apps.01.cf.eu01.stackit.cloud)
ist kein Produktionsdienst. Produktionsbereitstellung und betriebliche Abnahme
sind separate Folgeaufgaben; das Zusammenführen von Quellcode deployt die Anwendung nicht.

<a id="how-it-fits-together"></a>
## Zusammenspiel

![Configurator-Komponenten](docs/architecture/stackit-overview.svg)

Der Browser kommuniziert mit der API, die Mandantenautorisierung und deterministische
Konfigurationsvalidierung durchsetzt. Nur die API ruft Model Serving auf. Angenommene
Assistant-Vorschläge ändern einen Entwurf, keine Infrastruktur. Ein separater, isolierter
Runner führt den gepinnten Accelerator erst nach den erforderlichen Plan-/Apply-Freigaben aus.

![Plattform- und Application-Lebenszyklus](docs/architecture/landing-zone-logical.svg)

Plattformkonfiguration, veröffentlichte Vorlagenversionen und Application-Instanzen
haben getrennte Lebenszyklen. STACKIT-Anmeldung, Mandantenmitgliedschaft, optionaler
GitHub-Zugriff und technische Cloud-Ausführungszugänge sind unterschiedliche Berechtigungen.

<a id="repository-layout"></a>
## Repository-Struktur

- [app/](app/): API, React-Frontend, Worker, Domain/Compiler und gemeinsame Verträge.
- [tools/hcl-adapter/](tools/hcl-adapter/): nativer Eingabekatalog und HCL-Roundtrips.
- [deploy/](deploy/): Cloud-Foundry-Paketierung, Migrationen und isolierter Runner.
- [infra/](infra/): Betreiberinfrastruktur mit getrennten verschlüsselten States.
- [docs/](docs/): Benutzer-, Architektur- und Entwicklungsreferenzen.
- [../src/](../src/): unabhängig nutzbare Accelerator-Infrastruktur.

Anwendungsabhängigkeiten und Lockfiles sind vom Accelerator getrennt.
Builds pinnen ihre Accelerator-Revision und binden API/UI- und Runner-Artefakte
an dieselbe Quelle. Der Infrastruktur-State des Kunden ist weder die
Konfigurationsdatenbank des Configurators noch der State seiner Betreiberinfrastruktur.
