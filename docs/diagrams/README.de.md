<a id="architecture-diagrams"></a>
# Architekturdiagramme

[English](README.md) | [Deutsch](README.de.md)

<a id="customer-topology-diagrams"></a>
## Topologiediagramme für Kunden

Die kundenseitigen Topologiediagramme werden direkt als SVG-Dateien gepflegt. Sie zeigen bewusst die prägenden Netzwerkgrenzen, Projekte und Verkehrswege jeder vollständigen Konfiguration statt jeder einzelnen Terraform-Ressource.

- `standalone.svg`
- `hub-and-spoke.svg`
- `hub-and-spoke-firewall.svg`
- `hub-and-spoke-finance-research.svg`
- `hub-and-spoke-multi-area.svg`
- `hub-and-spoke-multi-region.svg`
- `hub-and-spoke-prod-nonprod-firewall.svg`
- `hub-and-spoke-tenant-isolation.svg`

Jeder Dateiname entspricht – abgesehen von der Bilddateiendung – seiner Quelldatei in `src/config/`. Halten Sie diese Diagramme stabil und prüfen Sie visuelle Änderungen zusammen mit der zugehörigen Konfiguration.

<a id="legacy-generator"></a>
## Bisheriger Generator

`scripts/generate_example_architecture.py` bleibt als manuelle Entwicklungshilfe verfügbar. Er wird weder von GitHub Actions noch von der Aufgabenverwaltung des Repositorys oder einer anderen automatisierten Pipeline aufgerufen. Seine Mermaid-Ausgabe ist vorübergehend und gehört nicht zur gepflegten Dokumentation.
