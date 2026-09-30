# CI/CD für den Landing Zone Configurator

Status: Validierung, Bootstrap-/Backend- und Plattform-Pipelines sind implementiert und erfolgreich ausgeführt. OpenTofu wird direkt in den Workflows aufgerufen, mit normalen Live-Logs. Runtime und App-Release sind implementiert und werden gegen CF abgenommen; Drift bleibt geplant. Erste Umgebung: **lzc-dev / eu01**. Aktuelle Bedienung: [CI-Betrieb](../infra/ci/README.md).

## Getrennte Lebenszyklen

| Workflow | Auslöser | Verantwortung |
| --- | --- | --- |
| `validate-configurator.yml` (vorhanden) | PR, main, Feature-Branch, manuell | App-Prüfungen, IaC-Validierung und Mock-Tests ohne Cloud-Zugang |
| `configurator-bootstrap.yml` | Feature-Push: Plan; manuell auf main vorbereitet | State-Infrastruktur erstellen, Versionierung konfigurieren, später Credentials rotieren |
| `configurator-platform.yml` | Infrastrukturänderungen auf Feature-Branch: Plan; manuell auf main vorbereitet | Plattform-IaC planen, geprüften Plan anwenden |
| `configurator-runtime.yml` | Runtime-/CI-Änderungen auf Feature-Branch; manuell auf main vorbereitet | CF-Space, Organisationsmitgliedschaft, Space-Rolle und Laufzeitbenutzer |
| `configurator-release.yml` | App-/Release-Dateien auf Feature-Branch; manuell auf main vorbereitet | Web/API bauen, prüfen, gepacktes Release nach CF deployen und Verbindungen aus CF testen |
| `configurator-drift.yml` | Optional zeitgesteuert/manuell | Infrastruktur-Drift erkennen und melden; zunächst kein automatisches Apply |

Ein normales App-Release startet weder Bootstrap noch Plattform-Apply. Relevante Pfade umfassen auch gemeinsame Deployment-Skripte, Lockfiles und die jeweilige Workflow-Datei. Änderungen ausschließlich am Accelerator lösen keinen Configurator-Release aus. Kunden-Landing-Zone-Deployments bleiben ein eigener, mandantenisolierter Runner-Ablauf und erhalten keine Betreiber-CI-Credentials.

## State und Credentials

Ein unabhängiger Verwaltungs-Bucket wurde durch `seed` und `seed-protection` angelegt und versioniert. Bootstrap und Backend speichern dort ihre verschlüsselten States. Die Plattform verwendet den ebenfalls versionierten Workload-State-Bucket. Jeder Root hat einen eigenen dauerhaft verwahrten Schlüssel; ein fehlender Deployment-Schlüssel führt zum Abbruch. Geschützte Environment-Secrets liefern die vorhandenen Schlüssel und Credentials an CI, keine lokale Seed-Datei wird benötigt.

Native S3-Sperren haben den Integrationstest nicht bestanden. Die bestätigte Übergangslösung erlaubt ausschließlich gemeinsam serialisierte CI-Applies; direkte parallele Zugriffe durch andere Credential-Inhaber sind betrieblich ausgeschlossen. GitHub-Artefakte dienen nur für Review und Recovery, nicht als dauerhaftes State-Backend.

Der seltene Bootstrap benötigt weiterhin Ablaufüberwachung und Rotation der befristeten S3-Credentials einschließlich Aktualisierung aller Consumer. Unabhängige Schlüsselverwahrung und vollständige Restore-Abnahme bleiben eigene Betriebsaufgaben.

## Infrastruktur-Pipeline

1. Vertrauenswürdigen Commit des freigegebenen Branches auschecken; gepinnte Tools und Provider-Lockfiles verwenden.
2. Root und Umgebung aus fester Allowlist wählen; Remote-State und bestehende Schlüssel laden.
3. Plan erstellen und verschlüsselt speichern. Manifest bindet Commit, Umgebung, Root, Eingabedigest, Lockfile-Digest, Plan-Hash und kurze Gültigkeit. Normale OpenTofu-Plan-Ausgabe live anzeigen; keine vollständigen State-/Plan-JSONs oder Credential-Outputs veröffentlichen.
4. Apply-Job nutzt ein geschütztes GitHub Environment und exakt das geprüfte Plan-Artefakt desselben vertrauenswürdigen Runs. Freigabe gilt für diesen Plan. Abgelaufene oder veraltete Plans werden neu erstellt und erneut geprüft.
5. Da natives S3-Locking nicht zuverlässig funktioniert, übernimmt übergreifende GitHub-Concurrency pro Umgebung serialisiert mutierende Plattform-/Runtime-/Release-Jobs; `cancel-in-progress: false` für laufende Mutationen. Keine Fairness oder FIFO-Reihenfolge voraussetzen, ältere Releases vor Deployment abweisen.
6. Outputs nur gezielt und geschützt an Consumer übergeben, Recovery und Audit protokollieren.

Bootstrap und Backend-Versionierung laufen nacheinander. Nach Bootstrap-Apply wird der Backend-Plan mit den jetzt vorhandenen Zugangsdaten erstellt. Plattform folgt nach nachgewiesener Versionierung unter dem bestätigten CI-only-Betriebsmodell. Runtime benötigt anschließend die CF-Zugänge der Plattform. Kein Plan über noch unbekannte Provider-Credentials und kein routinemäßiges `-target`.

## Anwendung häufig und unabhängig ausliefern

Der implementierte Release-Workflow prüft und baut Web/API einmal; der Worker folgt. Er und erstellt ein über Commit und SHA-256 identifizierbares Release. Redeploy und spätere Promotion verwenden dasselbe geprüfte Paket; historische Artefakte sind entsprechend der Rollback-Frist dauerhaft aufzubewahren. Kein erneuter Build beim Rollback.

Der Lifecycle-Owner wird eindeutig festgelegt: OpenTofu verwaltet Dienste, CF-Org/Spaces, Rollen und gemeinsame Service-Instanzen. Der deklarative Release-Prozess verwaltet App-Objekte, App-Routen, App-Bindings, Prozesskonfiguration und Code. Diese Ressourcen werden nicht zusätzlich vom Runtime-Root verwaltet. So bleiben auch App-Provisionierung und Bindings als Code reproduzierbar.

Ablauf: Release prüfen → kompatible DB-Migration mit separater Migrationsidentität ausführen → CF-Deployment → Readiness-/Smoke-Tests → Release markieren. Rolling Deployment ist die bevorzugte Strategie, sofern Foundation, Quota und App-Prozesse es unterstützen; dies ist auf der konkreten STACKIT-Foundation noch zu prüfen. Worker benötigen Drain/Lease-Semantik, damit beim Austausch keine Jobs doppelt laufen. Destruktive DB-Migrationen folgen zeitversetzt; ein App-Rollback setzt keine Datenbank automatisch zurück.

Entwicklung: nach erfolgreicher Validierung auf main automatisch deployen, sobald die Umgebung betriebsbereit ist. Produktion später: explizite Promotion des geprüften Releases mit Freigabe. Ein manueller Redeploy wählt eine bekannte Release-ID, keinen beliebigen Fork oder Shell-Befehl.

## Identitäten und Vertrauensgrenzen

- Bootstrap: gesonderte Betreiberidentität mit den notwendigen Projekt-/Object-Storage-Rechten.
- Plattform: scoped STACKIT-Zugang; App-Release erhält diesen Zugang nicht.
- Release-Zielbild: eigene CF-Deployment-Identität nur für den Ziel-Space. Der erste Entwicklungsstand nutzt noch den vorhandenen Org-Manager und liest dessen Zugang aus dem verschlüsselten Plattform-State; App-Zugänge sind davon getrennt. DB-Migrationen sind noch nicht implementiert.
- Persönliche GitHub-/STACKIT-Zugänge der Kunden bleiben in der Anwendung und gelangen nicht in Betreiber-Workflows.
- GitHub Environments trennen mindestens Bootstrap, Plattform und App je Umgebung. Environment-Regeln und Branch-Schutz werden als Repository-Konfiguration per IaC/API verwaltet; initiale GitHub-Administrationsberechtigung und Secret-Einspeisung bleiben eine notwendige Vertrauensbasis.
- Secrets niemals aus PR-Code zugänglich machen; kein privilegiertes `pull_request_target` mit Checkout von Fork-Code. Actions auf Commit-SHAs pinnen, minimale Token-Rechte, keine Shell-Ausgabe von Credentials.
- Kurzlebige föderierte Identitäten bevorzugen, sofern STACKIT sie für diese Dienste nachweislich unterstützt. Bis dahin rotierbare, geschützte Service-Account-Zugänge; GitHub-OIDC-Kompatibilität nicht voraussetzen.

Die Verfügbarkeit von Environment-Freigaberegeln hängt vom GitHub-Tarif und der Repository-Sichtbarkeit ab. Vor Aktivierung prüfen. Runner-Netzzugang zu CF, S3 und privaten Datenbankendpunkten ebenfalls prüfen; erforderliche private Runner werden getrennt von untrusted PR-Jobs betrieben und über IaC provisioniert.

## Umsetzungsreihenfolge und Abnahme

- [x] Lebenszyklen und Credentials trennen; Validierung aller sechs IaC-Roots und der App.
- [x] Verwaltungs- und Workload-Backend einrichten, Versionierung und State-Verschlüsselung prüfen.
- [x] GitHub-Environments und Freigaben einrichten; bestehende Deployment-Schlüssel geschützt übergeben.
- [x] Bootstrap-/Backend- und Plattform-Pipelines ausführen; Plattform-Recovery und anschließenden No-op nachweisen.
- [x] Native S3-Sperren testen und als nicht zuverlässig dokumentieren; CI-only-Betrieb explizit festlegen.
- [x] OpenTofu direkt in den Workflows aufrufen; Live-Logs, Standard-Timeout und geschützte State-Sicherung.
- [ ] Unabhängige Schlüsselverwahrung, vollständiger Restore-Prozess und automatisierte Credential-Rotation.
- [ ] CF-Runtime, Bindings und Konnektivitätstests aus CF.
- [ ] Release-Manifeste, Paketierung, Migrationen, Readiness und Worker-Drain.
- [ ] Zwei App-Releases, unabhängigen Redeploy und Rollback ohne Infrastrukturänderung nachweisen.
- [ ] Optionalen Drift-Workflow und Alarmierung aktivieren.

Nächster Ausbau ist die CF-Runtime mit Zugriffstests zu Datenbank und Secrets Manager. Die bisherige einmalige Recovery wurde aus dem normalen Deployment-Pfad entfernt; Vorfall und Wiederherstellung stehen im [Plattform-Betriebsstand](platform-readiness.md).

## Quellen

- [GitHub Deployment Environments](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments)
- [GitHub Deployment-Steuerung und Concurrency](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments)
- [GitHub Environment-Verfügbarkeit und Einrichtung](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
- [Cloud Foundry Rolling Deployments](https://docs.cloudfoundry.org/devguide/deploy-apps/rolling-deploy.html)

Details zum implementierten Release und seinen Grenzen: [CF-Release](../deploy/cloud-foundry/README.md).
