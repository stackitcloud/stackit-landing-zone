<div align="center">
<br>
<img src=".github/images/stackit-logo.svg" alt="STACKIT logo" width="50%"/>
<br>
<br>
</div>

# Landing Zone Accelerator

[English](README.md) | [Deutsch](README.de.md)

[![Terraform](https://img.shields.io/badge/Terraform-1.15+-623CE4?logo=terraform&logoColor=white)](https://www.terraform.io/)
[![OpenTofu](https://img.shields.io/badge/OpenTofu-1.12+-FFDA18?logo=opentofu&logoColor=black)](https://opentofu.org/)
[![STACKIT](https://img.shields.io/badge/STACKIT-Cloud-004E5A)](https://www.stackit.de/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

Der STACKIT Landing Zone Accelerator bietet ein umfassendes Terraform-basiertes Framework für die Bereitstellung sicherer, skalierbarer und durchdacht aufgebauter Cloud-Umgebungen auf STACKIT. Auf Basis bewährter Unternehmenspraktiken können Teams damit schnell Grundlagen für Governance, Netzwerke und Sicherheit schaffen.

Der Accelerator bleibt mit Terraform/OpenTofu unabhängig nutzbar. Der
Configurator ist ein optionales Werkzeug, keine erforderliche API, Template-Engine
oder Zustandsverwaltung. Für getrennte Platform- und Application-Phasen siehe den
[unabhängigen CLI-Ablauf](src/application/README.de.md#independent-two-phase-cli-workflow).
Die Plattform exportiert geprüfte, nicht geheime Referenzen; Application-Eingaben
können manuell ausgefüllt werden und verwenden ein separates Backend mit eigenem State.

<a id="-documentation"></a>
## 📚 Dokumentation

- [Erste Schritte](docs/getting-started.de.md)
- [Architektur/Module](docs/architecture.de.md)
- [Corporate-VM: Firewall, NAT und SSH](docs/corporate-vm-connectivity.de.md)
- [Landing Zone Configurator](landing-zone-configurator/README.de.md)
- [Configurator-Architektur](landing-zone-configurator/docs/architecture.de.md)
- [Configurator-Benutzerhandbuch](landing-zone-configurator/docs/user-guide.de.md)
- [Configurator-Entwicklung](landing-zone-configurator/docs/development.de.md)
- [GitHub-Actions-Workflows](docs/workflows.de.md) – alle Pipelines, automatische/manuelle Auslöser, Startanleitungen für die Oberfläche, Eingaben und Auswirkungen auf Bereitstellungen

<a id="-contributing"></a>
## 🤝 Mitwirken

Beiträge sind willkommen. [CONTRIBUTING.md](CONTRIBUTING.de.md) beschreibt die lokale Einrichtung, die Konventionen dieses Repositorys und den erwarteten Inhalt eines Pull Requests.

<a id="-license"></a>
## 📄 Lizenz

Dieses Projekt ist unter der Apache 2.0 License lizenziert – Einzelheiten stehen in [LICENSE](LICENSE).
