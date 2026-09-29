# Bootstrap-CI

Implementiert, noch nicht auf GitHub veröffentlicht/ausgeführt. Der Workflow `.github/workflows/configurator-bootstrap.yml` wird manuell auf main gestartet: zuerst Root `bootstrap`, anschließend `backend`. Plan und Apply sind getrennte Jobs; Apply verlangt die Environment-Freigabe und verwendet das verschlüsselte Plan-Artefakt desselben Runs. Re-runs werden abgewiesen: immer einen neuen Workflow-Lauf mit neuem Plan starten.

## Betriebsentscheidung: ausschließlich serialisierte CI-Applies

Native S3-Sperren funktionieren im Integrationstest nicht. Der Benutzer hat als Übergang den Betrieb mit genau einem schreibenden CI-Lauf bestätigt. S3 bleibt State-Backend. Der gesamte Workflow einschließlich Plan, Freigabewartezeit und Apply nutzt `concurrency.group: configurator-lzc-dev-mutation` und `cancel-in-progress: false`.

Alle zukünftigen mutierenden Configurator-Workflows im selben Repository müssen dieselbe Gruppe verwenden. GitHub serialisiert aktive Läufe dieser Gruppe; wartende Läufe bilden keine garantierte FIFO-Warteschlange und können durch spätere Anfragen ersetzt werden. Lokale Remote-Applies bleiben im Operator-Wrapper gesperrt. Der CI-Einstieg erlaubt Apply nur im freigegebenen Workflow auf main. Umgebungsvariablen sind dabei keine unabhängige Authentifizierung: Direkte OpenTofu-Aufrufe durch Inhaber der Credentials oder andere Repositories werden nicht von GitHub-Concurrency erfasst und sind im vereinbarten Betrieb ausgeschlossen.

`backend-safety.json` dokumentiert diesen Modus, ohne den fehlgeschlagenen S3-Locking-Test als erfolgreich zu markieren. Der lokale CI-Plan-Smoke-Test gegen das echte S3-Backend war erfolgreich, ohne Apply.

Die ausdrückliche Freigabe für die bezeichneten GitHub-Environment-Secrets liegt vor. Alle drei Environments wurden angelegt und per API geprüft: ausschließlich main, kein Admin-Bypass, erforderliche Freigabe für Apply und Recovery. Fünf Secrets je Plan-/Apply-Environment und vier Recovery-Secrets sind hinterlegt; Werte wurden nicht ausgegeben. Der Workflow ist bislang nur lokal vorbereitet und muss vor dem ersten GitHub-Lauf auf main veröffentlicht werden.

## Reproduzierbare GitHub-Einrichtung

`github-environments.json` beschreibt Repository, erlaubten Branch, Reviewer und drei getrennte Environments. `configure-github.mjs` setzt die Konfiguration über GitHub API/CLI, prüft Schutzregeln und lädt Secret-Werte über stdin hoch; keine Werte in Argumenten, Logs oder Dateien im Repository. Die ausdrückliche Freigabe des Secret-Transfers wurde erteilt:

```sh
node infra/ci/configure-github.mjs
```

| Environment | Verwendung | Secrets |
| --- | --- | --- |
| lzc-dev-bootstrap-plan | Plan auf main | Projekt-Service-Account, Management-S3-Zugang, Bootstrap-/Backend-State-Schlüssel |
| lzc-dev-bootstrap-apply | Apply auf main, Freigabe durch lweberru | Gleiche Deployment-Secrets |
| lzc-dev-recovery | Separat geschützter Recovery-Kontext, Freigabe durch lweberru | Management-S3-Zugang und Seed-/Seed-Protection-State-Schlüssel |

Das vorhandene Projekt-Service-Account-Recht ist breiter als eine reine Plan-Leserolle. Der Plan-Job ist deshalb auf vertrauenswürdigen main-Code beschränkt. Eine separate minimal berechtigte Plan-Identität ist ein weiterer Härtungsschritt. Die Apply-Freigabe verhindert keinen missbräuchlichen Code auf main mit den Plan-Credentials; Branch-/PR-Reviews bleiben erforderlich.

GitHub-Secrets sind nicht per API im Klartext exportierbar. Ihre Hinterlegung ersetzt kein unabhängig abrufbares Recovery-Backup der Schlüssel. Ein Recovery-Workflow und eine externe Schlüsselverwahrung müssen vor Betriebsfreigabe ergänzt und getestet werden. Seed-Schlüssel gehören nicht in normale Deployment-Jobs.

## Planbindung und Credentials

`run.mjs` liest ausschließlich explizite CI-Eingaben und bestehende Schlüssel. Es benötigt keine lokalen Seed-States oder Operator-env-Dateien. Credentials werden nur im Jobprozess beziehungsweise in einer restriktiven temporären Service-Account-Datei genutzt, die im finally-Block entfernt wird. Der CI-Job lädt ausschließlich Plan, Manifest und bereinigte Review-Zusammenfassung hoch.

Der Apply-Prüfmechanismus bindet Plan-Hash, Repository, Commit, Workflow-Lauf, Root, Umgebung, Eingaben sowie Terraform-Dateien und Provider-Lockfiles. Die Gültigkeit beträgt maximal 24 Stunden. OpenTofu prüft zusätzlich den State-Stand. Fehlerhafte Läufe werden nicht automatisch wiederholt.

## Nachweise

- Lokaler CI-Planpfad gegen Management-S3: erfolgreich, drei geplante Bootstrap-Ressourcen.
- Beide Workflow-Dateien mit actionlint 1.7.7 validiert.
- Zwölf Node-Tests für Planbindung, Schlüsselhaltung und Apply-Sperre erfolgreich.
- Kein GitHub-Workflow gestartet und kein Plattform-Apply durchgeführt.
