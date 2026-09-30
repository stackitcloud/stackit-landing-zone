# Bootstrap-CI

Implementiert und auf dem Feature-Branch veröffentlicht; erster Bootstrap-Plan und Apply erfolgreich. Der Workflow `.github/workflows/configurator-bootstrap.yml` wird manuell auf main gestartet: zuerst Root `bootstrap`, anschließend `backend`. Plan und Apply sind getrennte Jobs; Apply verlangt die Environment-Freigabe und verwendet das verschlüsselte Plan-Artefakt desselben Runs. Re-runs werden abgewiesen: immer einen neuen Workflow-Lauf mit neuem Plan starten.

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

## Erster Test vom Feature-Branch

Pushes auf den exakten Branch `feature/landing-zone-configurator` starten bei Änderungen an IaC oder Bootstrap-Workflow automatisch einen Bootstrap-Plan. Nur das Plan-Environment erlaubt zusätzlich diesen Branch. Apply und Recovery bleiben auf main beschränkt; Feature-Pushes können keinen Apply-Job starten. Der CI-Einstieg prüft Branch/Event ebenfalls und bindet beides an das Planmanifest. Die Validierungs-CI läuft nun ebenfalls auf diesem Feature-Branch.

## Einmaliger Bootstrap-Apply vom Feature-Branch

Ein Feature-Push darf zusätzlich einen Apply-Job anfordern, wenn die Repository-Variable `LZC_BOOTSTRAP_APPLY_COMMIT` exakt seiner vollständigen Commit-SHA entspricht. Der CI-Einstieg prüft diesen Wert erneut, erlaubt dabei nur Root bootstrap und verlangt die korrekte Workflow-Identität. Das Apply-Environment erlaubt den exakten Feature-Branch, behält aber seine Reviewer-Freigabe. Die Variable wird nach dem Lauf entfernt; normale Feature-Pushes bleiben Plan-only. Wiederholungen benötigen einen neuen Run/Commit und einen neu geprüften Plan.

## Ausgeführte Läufe

- Erster Feature-Plan: [36599754659](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36599754659), erfolgreich, Apply übersprungen.
- Erster ausdrücklich freigegebener Bootstrap-Apply: [36601941540](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36601941540), Commit `59edaca69201d14083d7a6afd24cdf6cc3d7d267`, Plan und Apply erfolgreich. Drei Ressourcen erstellt; verschlüsselter Remote-State unabhängig überprüft. Die Variable `LZC_BOOTSTRAP_APPLY_COMMIT` wurde nach Abschluss entfernt.
- Begleitende Validierung: [36601941480](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36601941480), alle Jobs erfolgreich.

Keine Übernahme nach main. Der separate Backend-Root und Plattformdienste wurden noch nicht angewendet.

## Backend-Root über den Feature-Branch

Für einen gezielten Backend-Lauf setzt der Operator zusätzlich `LZC_BOOTSTRAP_ROOT=backend`. Die Freigabe ist an Commit **und** Root gebunden; nur bootstrap/backend sind erlaubt. Nach dem Lauf werden Root-Auswahl und Commit-Freigabe entfernt. Ohne diese Variablen starten Feature-Pushes weiterhin ausschließlich einen Bootstrap-Plan.

## Separate Plattform-Pipeline

`configurator-platform.yml` plant ausschließlich den Plattform-Root. Plan/Apply verwenden `lzc-dev-platform-plan` und `lzc-dev-platform-apply`, gemeinsam mit Bootstrap die Concurrency-Gruppe `configurator-lzc-dev-mutation`. Für den Feature-Branch schaltet ausschließlich eine passende `LZC_PLATFORM_APPLY_COMMIT` einen reviewerpflichtigen Apply frei; Root und Workflow werden im CI-Einstieg zusätzlich geprüft.

`node infra/ci/configure-github.mjs --platform` richtet die in `github-platform-environments.json` beschriebenen Environments ein. Es überträgt Projekt-Service-Account, Management-S3-Zugang und Bootstrap-/Backend-/Plattform-State-Schlüssel nach ausdrücklicher Ziel-Freigabe. Keine Seed-Schlüssel gelangen in diese Deployment-Jobs. Plattform-State liegt mit eigener Verschlüsselung im bereits versionierten Workload-Bucket, nicht im Verwaltungs-Bucket.

## Plattform-Bereitstellung freigegeben

Der Benutzer hat am 2026-09-29 ausdrücklich die Secret-Hinterlegung in `lzc-dev-platform-plan` und `lzc-dev-platform-apply` freigegeben und die Fortsetzung der Plattform-Bereitstellung beauftragt. Der erste CI-Apply wird über eine einzelne Commit-SHA in `LZC_PLATFORM_APPLY_COMMIT` angefordert; die Environment-Freigabe erfolgt erst nach Prüfung des konkreten Plans und erfolgreicher Validierung.


## Plattform-Recovery nach abgebrochener Erstbereitstellung

Der freigegebene Lauf vom 2026-09-29 wurde nach 45 Minuten beendet, bevor ein Plattform-State gespeichert war. Die am 2026-09-30 geprüfte Datenbank ist `READY`. Das fest eingegrenzte Inventar in `recovery/lzc-dev-20260930.json` enthält sechs importierbare Ressourcen und genau einen verwaisten Model-Serving-Token. Ressourcen-IDs sind keine Zugangsdaten.

Der optionale `recover`-Job in `configurator-platform.yml` benötigt `LZC_PLATFORM_RECOVERY_COMMIT` gleich dem aktuellen Feature-Commit, `LZC_PLATFORM_CI_ENABLED=true` und das geschützte Apply-Environment. Er prüft den abgeschlossenen Quell-Run, entfernt dessen konkretes verwaistes Lock, importiert die sechs Ressourcen und widerruft den eindeutig identifizierten Token, dessen Wert nicht wiederherstellbar ist. Der STACKIT-Provider 0.114.0 unterstützt keinen Model-Serving-Token-Import. Der anschließende Plan ersetzt explizit die beiden importierten technischen Benutzer, deren Passwörter ebenfalls verloren sind. Instanzen, Organisation und Bucket bleiben bestehen. Der eigentliche Apply erfordert weiterhin einen getrennten, konkret geprüften Plan und die normale Commit-Freigabe.

Diese Recovery ist absichtlich ein einmaliger Vorgang. Bei einem Teilfehler zuerst Inventar und State neu prüfen; nicht denselben Import blind wiederholen. Nach Abschluss beide Einmalvariablen entfernen. Normale Plan-Läufe überspringen Recovery.

### Zeitlimits und Diagnose

Plattform-Jobs haben 100 Minuten statt 45 Minuten Laufzeit. Ein Plattform-Apply erhält maximal 70 Minuten; spätestens nach insgesamt 80 Minuten Skriptlaufzeit beginnt ein geordneter Abbruch. Der Prozess erhält genau ein `SIGINT` und bis zu zehn Minuten für Provider-Abbruch und State-Persistierung. Erst danach wird ein nicht reagierender Prozess beendet. Andere Roots behalten kürzere interne Grenzen. Ein Interrupt gilt auch bei Exit-Code 0 als fehlgeschlagener Versuch und darf nicht als erfolgreicher Apply gemeldet werden.

Nach Apply/Recovery wird ein Remote-State-Snapshot versucht; ein lokaler `errored.tfstate` wird ebenfalls geschützt gesichert. Diagnose und Snapshots liegen ausschließlich als AES-256-GCM-Envelope in `.local/ci-recovery/*.enc.json` und werden auch bei fehlgeschlagenen Jobs für sieben Tage als GitHub-Artefakt hochgeladen. Schlüssel ist der jeweilige State-Schlüssel, daraus wird per scrypt mit zufälligem Salt ein Artefaktschlüssel abgeleitet. Der Envelope enthält `salt`, `nonce`, `tag` und `data` als Base64; Klartext darf nur lokal mit restriktiven Dateirechten entschlüsselt werden. Ein Snapshot kann zusätzlich OpenTofu-verschlüsselt sein. Abrupte Runner-Verluste können weiterhin Recovery erfordern; die Prozesssteuerung ersetzt keine erfolgreiche State-Persistierung.
