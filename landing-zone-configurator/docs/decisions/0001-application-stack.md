# ADR 0001 – Sprache und Anwendungsstack

Stand: 2026-09-29. **Status: angenommen im Planungsgespräch.**

## Entscheidung

TypeScript als Hauptsprache für React-Oberfläche, Node.js-Backend und Worker. Gemeinsames Fachmodell, Laufzeitschemas, API-Verträge, Konfigurationscompiler und Graph-Modell als interne Pakete. Backend: Fastify; Frontend: React mit Vite. npm-Workspaces mit Lockfile. Runtime: Node.js 24.21.0 LTS und npm 11.19.0; konkrete Paketversionen in `app/package.json` und den Workspace-Manifests.

Go auf einen kleinen HCL-Importadapter begrenzen. OpenTofu wird als gepinnter externer Prozess in isolierten Runnern ausgeführt. Die App muss deshalb nicht in Go geschrieben sein. Für einen Runner-Supervisor erst dann zusätzlich Go wählen, wenn Packaging oder Prozesssteuerung einen konkreten Vorteil belegen.

## Warum das zum Configurator passt

Die Hauptarbeit besteht aus Formularen, Validierung, GitHub-/Cloud-APIs, Chat-Streaming und asynchroner Jobkoordination. TypeScript ermöglicht gemeinsame Verträge und Fachlogik zwischen Browser und Backend. Ein Sprachwechsel für jede Schemaänderung entfällt. Externe Eingaben dennoch immer zur Laufzeit validieren: TypeScript-Typen sind keine Autorisierungs- oder Validierungsgrenze.

Die eigentliche Infrastrukturarbeit übernimmt OpenTofu. CPU-intensive Verarbeitung großer Plans und HCL-Import gehören in begrenzte Worker/Adapter-Prozesse, nicht in den HTTP-Event-Loop. Für die erwarteten API-/I/O-Aufgaben ist Backend-Rohleistung nicht das ausschlaggebende Kriterium.

Cloud Foundry dokumentiert sowohl [Node.js](https://docs.cloudfoundry.org/buildpacks/node/) als auch [Go](https://docs.cloudfoundry.org/buildpacks/go/index.html). STACKIT beschreibt das Deployment mit Buildpacks und anderen Artefaktformen; die im Ziel angebotenen Versionen sind beim Spike zu prüfen. [STACKIT-App-Deployment](https://docs.stackit.cloud/products/runtime/cloud-foundry/getting-started/push-your-app-to-cloud-foundry/)

Für HCL stellt das Maintainer-Projekt einen Go-Parser und Go-APIs bereit. Daraus leitet sich der gezielte Go-Adapter ab, nicht die Notwendigkeit eines vollständigen Go-Backends. [HashiCorp HCL](https://github.com/hashicorp/hcl)

## Alternativen

| Variante | Stärke für diese Aufgabe | Aufwand / Nachteil |
| --- | --- | --- |
| TypeScript für Web/API/Worker plus kleiner Go-Adapter | Gemeinsame Fachlogik, kurze Wege zwischen Editor und API | Node-Abhängigkeiten pflegen; kleine zusätzliche Go-Toolchain |
| React/TypeScript plus Go-Backend | Direkte HCL-Integration, kompakte Backend-Binaries, gute Prozesswerkzeuge | Zwei vollwertige Anwendungsstacks; Verträge generieren und Validierungsgrenzen abstimmen |
| React/TypeScript plus Python-Backend | Sinnvoll bei ausgeprägter Python-Erfahrung oder eigener ML-Verarbeitung | Kein klarer Mehrwert für reine Model-Serving-API-Nutzung; ebenfalls zwei Stacks |
| React/TypeScript plus Java/Kotlin-Backend | Sinnvoll bei vorhandenem JVM-Team und etablierten Betriebsstandards | Für dieses neue Projekt ohne solche Vorgaben mehr initiale Struktur |

React plus Go wäre meine zweite Wahl, besonders bei einem überwiegend Go-erfahrenen Backend-Team. Python ist nicht erforderlich, nur weil ein Chatbot Bestandteil der App ist: Das Modell wird als Dienst angesprochen.

## Bewusste Grenzen

- Eigene CF-Deployables für API und Worker; keine langen OpenTofu-Läufe in HTTP-Requests.
- Gemeinsame Pakete enthalten keine Server-Secrets; Browser-Bundles werden darauf geprüft.
- Sicherheit und Mandantenisolation ergeben sich aus Architektur, Autorisierung und Tests, nicht aus der Sprache.
- Keine freie Ausführung von HCL oder Shell durch das Modell.
- Team-Erfahrung kann die Empfehlung ändern. Vor Umsetzung vorhandene TypeScript-/Go-Erfahrung und Wartungsverantwortung festhalten.

## Abschlusskriterien

- [x] Hauptsprache gemeinsam bestätigen.
- [x] Frontend-/Backend-Framework, Paketmanager und unterstützte Runtime-Versionen festlegen.
- [ ] Minimalen CF-Deploy von Web/API/Worker testen.
- [ ] HCL-Import mit allen acht Templates prototypisch validieren.
- [ ] Schema-Verträge, Build-Grenzen und Versionierung festlegen.

Die lokale Basis ist implementiert und getestet. CF-Deploy und HCL-Adapter sind noch offen. Node.js 24 wurde als LTS-Linie gewählt; Aktualisierungen erfolgen bewusst über Runtime-Pin und Lockfile. [Node.js Release-Status](https://nodejs.org/en/about/previous-releases)
