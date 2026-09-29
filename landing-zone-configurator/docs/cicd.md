# CI/CD für den Landing Zone Configurator

Status: Architektur und Umsetzungsliste; die vorhandene Validierungs-CI ist implementiert. Die hier beschriebenen Deployment-Workflows sind noch nicht implementiert oder ausgeführt. Erste Umgebung: **lzc-dev / eu01**.

## Getrennte Lebenszyklen

| Workflow (geplanter Dateiname) | Auslöser | Verantwortung |
| --- | --- | --- |
| `validate-configurator.yml` (vorhanden) | PR, main, manuell | App-Prüfungen, IaC-Validierung und Mock-Tests ohne Cloud-Zugang |
| `configurator-bootstrap.yml` | Ausschließlich manuell, Umgebung und Phase auswählen | State-Infrastruktur erstellen, Versionierung konfigurieren, später Credentials rotieren |
| `configurator-platform.yml` | Infrastrukturänderungen auf main: Plan; manuell | Plattform- und Runtime-IaC planen, geprüften Plan anwenden |
| `configurator-release.yml` | App-/Release-Dateien auf main; manuell für Redeploy/Rollback | Einmal bauen, prüfen, unveränderliches Release nach CF deployen |
| `configurator-drift.yml` | Optional zeitgesteuert/manuell | Infrastruktur-Drift erkennen und melden; zunächst kein automatisches Apply |

Ein normales App-Release startet weder Bootstrap noch Plattform-Apply. Relevante Pfade umfassen auch gemeinsame Deployment-Skripte, Lockfiles und die jeweilige Workflow-Datei. Änderungen ausschließlich am Accelerator lösen keinen Configurator-Release aus. Kunden-Landing-Zone-Deployments bleiben ein eigener, mandantenisolierter Runner-Ablauf und erhalten keine Betreiber-CI-Credentials.

## State vor Automatisierung lösen

Der aktuelle Operator-Wrapper nutzt lokale Bootstrap-/Backend-States und lokal erzeugte Schlüssel. Flüchtige GitHub-Runner dürfen dieses Verhalten nicht unverändert übernehmen: Ein neuer Schlüssel oder verlorener State nach einem Lauf wäre kein belastbarer Betrieb.

Ziel ist ein **unabhängiges, dauerhaftes Verwaltungs-Backend** für Bootstrap und Backend-Root, getrennt vom Bucket, den diese verwalten. Es muss vor deren erstem CI-Apply existieren, verschlüsselte States, Sperren und Wiederherstellung unterstützen. Bevorzugt wird ein vorhandenes Organisations-Backend. Falls keines existiert, wird dessen Einrichtung als eigene IaC-Seed-Stufe mit gesicherter initialer State-Übergabe geplant. Entscheidung: separater Verwaltungs-Bucket im bestehenden STACKIT-Projekt, erstellt durch die lokalen IaC-Roots `seed` und `seed-protection`. Die dauerhafte Schlüsselübergabe an CI bleibt offen; der Configurator darf sein einziges Recovery-Backend nicht selbst voraussetzen.

Platform und Runtime erhalten getrennte State-Keys im Configurator-State-Bucket. Jeder Root und jede Umgebung bekommt einen dauerhaft verwahrten Verschlüsselungsschlüssel. CI lädt Schlüssel aus geschützten Environment-Secrets oder dem unabhängigen Secret-System; ein fehlender Schlüssel führt zum Abbruch. GitHub-Artefakte und Caches dienen nicht als dauerhaftes State-Backend. Bestehende States werden migriert, nicht durch erneutes Anlegen ersetzt.

Der seltene Bootstrap-Workflow benötigt trotzdem einen regelmäßigen Betriebsprozess für die befristeten S3-Credentials: Ablaufüberwachung, Rotation vor Ablauf, Aktualisierung aller Consumer und Test mit dem neuen Zugang vor Widerruf des alten.

## Infrastruktur-Pipeline

1. Vertrauenswürdigen Commit von main auschecken; gepinnte Tools und Provider-Lockfiles verwenden.
2. Root und Umgebung aus fester Allowlist wählen; Remote-State und bestehende Schlüssel laden.
3. Plan erstellen und verschlüsselt speichern. Manifest bindet Commit, Umgebung, Root, Eingabedigest, Lockfile-Digest, Plan-Hash und kurze Gültigkeit. Nur bereinigte Ressourcenaktionen als Review-Zusammenfassung veröffentlichen, keine vollständigen State-/Plan-JSONs.
4. Apply-Job nutzt ein geschütztes GitHub Environment und exakt das geprüfte Plan-Artefakt desselben vertrauenswürdigen Runs. Freigabe gilt für diesen Plan. Abgelaufene oder veraltete Plans werden neu erstellt und erneut geprüft.
5. Backend-Locking verhindert parallele State-Schreiber. Übergreifende GitHub-Concurrency pro Umgebung serialisiert mutierende Plattform-/Runtime-/Release-Jobs; `cancel-in-progress: false` für laufende Mutationen. Keine Fairness oder FIFO-Reihenfolge voraussetzen, ältere Releases vor Deployment abweisen.
6. Outputs nur gezielt und geschützt an Consumer übergeben, Recovery und Audit protokollieren.

Bootstrap und Backend-Versionierung laufen nacheinander. Nach Bootstrap-Apply wird der Backend-Plan mit den jetzt vorhandenen Zugangsdaten erstellt. Plattform folgt erst nach nachgewiesener Versionierung und erfolgreichem Locking-/Restore-Test. Runtime benötigt anschließend die CF-Zugänge der Plattform. Kein Plan über noch unbekannte Provider-Credentials und kein routinemäßiges `-target`.

## Anwendung häufig und unabhängig ausliefern

Der Release-Workflow prüft und baut Web/API/Worker einmal und erstellt ein über Commit und SHA-256 identifizierbares Release. Redeploy und spätere Promotion verwenden dasselbe geprüfte Paket; historische Artefakte sind entsprechend der Rollback-Frist dauerhaft aufzubewahren. Kein erneuter Build beim Rollback.

Der Lifecycle-Owner wird eindeutig festgelegt: OpenTofu verwaltet Dienste, CF-Org/Spaces, Rollen und gemeinsame Service-Instanzen. Der deklarative Release-Prozess verwaltet App-Objekte, App-Routen, App-Bindings, Prozesskonfiguration und Code. Diese Ressourcen werden nicht zusätzlich vom Runtime-Root verwaltet. So bleiben auch App-Provisionierung und Bindings als Code reproduzierbar.

Ablauf: Release prüfen → kompatible DB-Migration mit separater Migrationsidentität ausführen → CF-Deployment → Readiness-/Smoke-Tests → Release markieren. Rolling Deployment ist die bevorzugte Strategie, sofern Foundation, Quota und App-Prozesse es unterstützen; dies ist auf der konkreten STACKIT-Foundation noch zu prüfen. Worker benötigen Drain/Lease-Semantik, damit beim Austausch keine Jobs doppelt laufen. Destruktive DB-Migrationen folgen zeitversetzt; ein App-Rollback setzt keine Datenbank automatisch zurück.

Entwicklung: nach erfolgreicher Validierung auf main automatisch deployen, sobald die Umgebung betriebsbereit ist. Produktion später: explizite Promotion des geprüften Releases mit Freigabe. Ein manueller Redeploy wählt eine bekannte Release-ID, keinen beliebigen Fork oder Shell-Befehl.

## Identitäten und Vertrauensgrenzen

- Bootstrap: gesonderte Betreiberidentität mit den notwendigen Projekt-/Object-Storage-Rechten.
- Plattform: scoped STACKIT-Zugang; App-Release erhält diesen Zugang nicht.
- Release: CF-Deployment-Identität auf den Ziel-Space beschränkt; DB-Migrationszugang nur im Migrationsschritt.
- Persönliche GitHub-/STACKIT-Zugänge der Kunden bleiben in der Anwendung und gelangen nicht in Betreiber-Workflows.
- GitHub Environments trennen mindestens Bootstrap, Plattform und App je Umgebung. Environment-Regeln und Branch-Schutz werden als Repository-Konfiguration per IaC/API verwaltet; initiale GitHub-Administrationsberechtigung und Secret-Einspeisung bleiben eine notwendige Vertrauensbasis.
- Secrets niemals aus PR-Code zugänglich machen; kein privilegiertes `pull_request_target` mit Checkout von Fork-Code. Actions auf Commit-SHAs pinnen, minimale Token-Rechte, keine Shell-Ausgabe von Credentials.
- Kurzlebige föderierte Identitäten bevorzugen, sofern STACKIT sie für diese Dienste nachweislich unterstützt. Bis dahin rotierbare, geschützte Service-Account-Zugänge; GitHub-OIDC-Kompatibilität nicht voraussetzen.

Die Verfügbarkeit von Environment-Freigaberegeln hängt vom GitHub-Tarif und der Repository-Sichtbarkeit ab. Vor Aktivierung prüfen. Runner-Netzzugang zu CF, S3 und privaten Datenbankendpunkten ebenfalls prüfen; erforderliche private Runner werden getrennt von untrusted PR-Jobs betrieben und über IaC provisioniert.

## Umsetzungsreihenfolge und Abnahme

- [x] Workflows nach Lebenszyklus und Credentials getrennt planen.
- [x] Validierungs-CI für App und die drei vorhandenen IaC-Roots angelegt.
- [ ] Unabhängiges Verwaltungs-Backend auswählen/einrichten; Schlüsselhaltung und Recovery testen.
- [x] CI-Schutz gegen lokale Cloud-States und automatische Erzeugung von Deployment-Schlüsseln; vier Tests in der Validierungs-CI.
- [ ] CI-Modus des Wrappers: explizite Umgebung, Remote-State, bestehende Schlüssel, Plan-Bindung an Commit/Eingaben.
- [ ] GitHub-Environments, Schutzregeln und getrennte Deployment-Identitäten als Code definieren.
- [ ] Bootstrap-/Backend-Pipeline implementieren; Wiederholung ohne Änderungen und Credential-Rotation nachweisen.
- [ ] S3-Versionierung, konkurrierendes Locking und Wiederherstellung praktisch testen.
- [ ] Plattform-/Runtime-Pipeline implementieren und konkrete Foundation, Quota, DB-Größe und Netzfreigaben festlegen.
- [ ] CF-Release-Manifeste, Paketierung, Migrationen, Readiness und Worker-Drain implementieren.
- [ ] App-Release-Pipeline: zwei Releases, unabhängiger Redeploy und Rollback nachweisen, ohne Infrastrukturänderung.
- [ ] Optionalen Drift-Workflow und Alarmierung aktivieren.

Nächster Umsetzungsschritt ist das dauerhafte CI-State-/Secret-Fundament. Anschließend kann der erste Bootstrap-Apply direkt aus CI erfolgen; ein lokales Apply ist dafür keine Voraussetzung.

## Quellen

- [GitHub Deployment Environments](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments)
- [GitHub Deployment-Steuerung und Concurrency](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments)
- [GitHub Environment-Verfügbarkeit und Einrichtung](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
- [Cloud Foundry Rolling Deployments](https://docs.cloudfoundry.org/devguide/deploy-apps/rolling-deploy.html)

### Aktueller technischer Fortschritt

Der Wrapper erkennt GitHub Actions/CI und erlaubt dort derzeit ausschließlich lokale Validierungsbefehle einschließlich `init -backend=false`. Cloud-Operationen brechen ab, solange die Remote-State-Anbindung fehlt. Die extrahierte Schlüsselverwaltung unterstützt bestehende, im Speicher übergebene Deployment-Schlüssel ohne Dateipersistierung; der Wrapper entfernt die Schlüsselvariablen anderer Roots aus der Kindprozess-Umgebung. Diese Vorarbeit aktiviert noch keine Deployment-Pipeline.

### Verwaltungs-Backend bereitgestellt

Der separate STACKIT-Verwaltungs-Bucket wurde per IaC erstellt und versioniert. Bootstrap nutzt nun dessen S3-Backend; der Backend-Root ist ebenfalls darauf umgestellt. Seed-States bleiben verschlüsselt lokal und erhalten verschlüsselte Recovery-Kopien im Bucket. Vor Aktivierung der Cloud-Pipelines fehlen noch unabhängige Schlüsselverwahrung, CI-Zugangsinjektion ohne lokale Seed-Outputs und vollständige Lock-/Recovery-Abnahme. Keine GitHub-Secrets oder Deployment-Workflows wurden aktiviert.

### CI-Implementierung und fehlgeschlagene Locking-Abnahme

Plan-/Apply-Workflow für Bootstrap und Backend sowie deklarative GitHub-Environment-Einrichtung sind implementiert, lokal geprüft und noch nicht veröffentlicht. Details: [CI-Betrieb](../infra/ci/README.md). Secret-Upload wartet auf ausdrückliche Freigabe nach automatischer Sicherheitsprüfung.

Der echte Parallelitätstest zeigt: Eine vorhandene `.tflock` blockiert einen zweiten OpenTofu-Plan nicht. Ein zusätzlicher S3-Test bestätigt, dass ein zweites PUT mit `If-None-Match: *` auf dasselbe existierende Objekt akzeptiert wird. Remote-Applies bleiben daher technisch gesperrt. GitHub-Concurrency allein schützt nur kooperierende Workflows desselben Repositories; lokale oder andere Clients sind davon nicht erfasst. Als Alternativen stehen ein PostgreSQL-Backend mit nativem Locking oder ein ausdrücklich begrenzter CI-only-Betrieb zur Entscheidung. Der Bucket kann weiter für verschlüsselte Backups verwendet werden.

Quellen: [STACKIT Issue 1534](https://github.com/stackitcloud/terraform-provider-stackit/issues/1534), [OpenTofu S3-Lock-Implementierung](https://github.com/opentofu/opentofu/blob/v1.12.6/internal/backend/remote-state/s3/client.go).

### Bestätigte Übergangslösung: ein schreibender CI-Lauf

Der Benutzer hat den CI-only-Betrieb trotz fehlender nativer S3-Sperren bestätigt. Alle mutierenden Configurator-Workflows verwenden repositoryweit `configurator-lzc-dev-mutation` mit `cancel-in-progress: false`; lokale Remote-Applies bleiben gesperrt. Diese Entscheidung ersetzt die vorherige vollständige Apply-Sperre und die offene PostgreSQL-Alternative. Sie gilt für kooperierende CI-Läufe, nicht für direkte Zugriffe anderer Credential-Inhaber. Die ausdrückliche Freigabe der benannten Secrets und GitHub-Ziel-Environments wurde erteilt.

GitHub-Einrichtung abgeschlossen: `lzc-dev-bootstrap-plan`, `lzc-dev-bootstrap-apply` und `lzc-dev-recovery` existieren mit main-Beschränkung. Apply/Recovery erfordern Freigabe; Admin-Bypass ist deaktiviert. Die freigegebenen Secrets sind hinterlegt und ihre Namen über die API verifiziert. Noch kein Workflow veröffentlicht oder gestartet.
