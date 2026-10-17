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
