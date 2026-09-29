# Cloud-Foundry-Releases

Hier künftig Manifeste und Release-Einstellungen für Web/API/Worker beziehungsweise getrennte Runner-Apps verwalten. Infrastruktur-Lifecycle in `../../infra/`; App-Versionen und Startkommandos hier. Eine Ressource erhält einen eindeutigen Lifecycle-Owner, keine konkurrierende Verwaltung durch OpenTofu und `cf push`. Secrets nur geschützt zur Laufzeit injizieren.

Das [CI/CD-Konzept](../../docs/cicd.md) legt den Release-Prozess als Owner für App-Objekte, App-Routen, App-Bindings und Code fest. OpenTofu verwaltet die zugrunde liegenden Dienste, Spaces und Rollen. Deployment-Workflows und Release-Manifeste sind noch umzusetzen.
