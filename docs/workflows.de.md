<a id="github-actions-workflows"></a>
# GitHub-Actions-Workflows

[English](workflows.md) | [Deutsch](workflows.de.md)

Dies ist der Einstieg zum Auswählen und Starten einer Pipeline. Workflow-Namen
verlinken direkt auf ihre **Actions**-Seiten; **Quelltext**-Links zeigen die
ausführbare Definition. Die zehn aktuellen Repository-Workflows sind unten
aufgeführt. Historische Einträge und von GitHub verwaltete Workflows sind
[separat aufgeführt](#other-entries-in-the-actions-sidebar).

**Ein Merge stellt den Configurator nicht bereit.** Configurator-Provisionierung
und Anwendungs-Releases erfolgen manuell und zielen derzeit auf Entwicklung, nicht
Produktion. Einen Workflow zu starten ist nicht dasselbe wie seinen geschützten
Bereitstellungsjob freizugeben.

<a id="which-workflow-do-i-need"></a>
## Welchen Workflow benötige ich?

| Aufgabe | Workflow |
| --- | --- |
| Accelerator-Änderungen ohne Ressourcenbereitstellung prüfen | **Validate** |
| Änderungen an Configurator, Katalog, Datenbank, Browser und Operator-IaC prüfen | **Validate Configurator** |
| Assistant-Antworten gegen das echte Modell testen | **Assistant live regression** |
| Neue Configurator-Version einschließlich API/UI und Runner bereitstellen | **Configurator Release**, nicht Publish Release |
| Eigenen State-Speicher, verwaltete Dienste oder CF-Identitäten des Configurators ändern | **Configurator Bootstrap**, **Platform** oder **Runtime** |
| Echte Accelerator-Bereitstellung und Bereinigung ausführen | **Verify Deployment** |
| Accelerator-GitHub-Release nach echter Bereitstellungsprüfung veröffentlichen | **Publish Release** |
| Konfigurierte Maschinen-Flavors mit dem aktuellen STACKIT-Katalog vergleichen | **Validate STACKIT Flavors** |

<a id="current-repository-workflows"></a>
### Dev-Release ohne Live-Qualifikation des Assistant

Bei Model-Serving-Ausfällen unter
**Actions > Configurator Release > Run workflow** auf Branch **main** ausdrücklich
**release_mode=dev-skip-assistant-qualification** wählen. **build_only** nicht
anhaken, **release_run_id** leer lassen und **runner_pool_size=1** setzen.
Den genauen Quellstand/Lauf prüfen und nach allen anwendbaren Build-/
Veröffentlichungsprüfungen die bestehende Umgebung **lzc-dev-release** freigeben.
Diese ausdrückliche Dev-Ausnahme überspringt nur den Live-Qualifikationsjob des
Assistant. `LZC_ASSISTANT_ENABLED` übernimmt weiterhin die bestehende
Umgebungseinstellung; ein konfigurierter Assistant bleibt aktiviert, ohne neuen
Live-Qualifikationsnachweis für diesen Release. Ob Inferenz funktioniert, hängt
weiterhin von der Modellverfügbarkeit ab. Dies gilt nicht als erfolgreiche
Qualifikation und löscht keine früheren fehlgeschlagenen Nachweise. Alle übrigen
Prüfungen, Migrationen, geschützten Tags und Dev-Zielprüfungen bleiben erhalten.
Gespräche und Vorschläge bleiben gespeichert; bestehende Laufzeitvalidierung,
Autorisierung und Revisionsprüfungen bleiben unverändert. Der Modus autorisiert
weder Produktion noch Kunden-Infrastruktur-Apply.

Das Manifest vermerkt die Beschränkung auf Dev und `assistantQualified=false`;
der Build-Job heißt `build-dev-skip-assistant-qualification`. Diese Artefakte
können nicht mit `release_run_id` übernommen werden, auch nicht als qualifizierter
Release. Nach einem Deploymentfehler sind Untersuchung und ein neuer manueller
Lauf nötig. `build_only=true` erlaubt einen Build zur Prüfung, dessen Artefakt
anschließend nicht übernommen werden kann. Ein qualifizierter Release erfordert
weiterhin einen neuen Lauf mit **release_mode=qualified** und vollständiger
quellstandsgebundener Live-Qualifikation. Der Standardpfad **qualified** und dessen
Übernahmebedingungen bleiben unverändert.


## Aktuelle Repository-Workflows

**Automatisch** beschreibt Repository-Ereignisse, keinen manuellen Klick.
**Wiederverwendbar** bedeutet, dass ein anderer Workflow ihn über `workflow_call`
aufrufen kann; dies ist keine separate UI-Freigabe. Alle zehn Definitionen bieten
`workflow_dispatch`, aber Berechtigungen, Branch-Beschränkungen, Operatorschalter
und Umgebungsschutz gelten weiterhin.

| Workflow und Definition | Zweck | Automatischer Start | Manueller Start in Actions | Wiederverwendung / Auswirkungen |
| --- | --- | --- | --- | --- |
| [Validate](https://github.com/stackitcloud/stackit-landing-zone/actions/workflows/validate.yml) · [Quelltext](../.github/workflows/validate.yml) | Accelerator-Formatierung, Lint, Validierung und Konfigurationstests mit Mocks | Jeder PR; Push auf `main`. Aufwendige Jobs laufen nur bei relevanten nativen/Werkzeugänderungen; manueller Dispatch erzwingt ihre Ausführung. | **Run workflow**, keine Eingaben | Keine echte Infrastrukturprovisionierung |
| [Validate Configurator](https://github.com/stackitcloud/stackit-landing-zone/actions/workflows/validate-configurator.yml) · [Quelltext](../.github/workflows/validate-configurator.yml) | HCL-/Katalogaktualität, App-Lint/-Build/-Unit-Tests, PostgreSQL, Desktop-/Mobil-Browsertests und sechs Operator-IaC-Roots mit Mocks | PRs und Pushes auf `main`, die `landing-zone-configurator/**`, `src/**` oder die ausdrücklich aufgelisteten Workflow-Dateien betreffen | **Run workflow**, keine Eingaben; läuft manuell ohne Pfadfilter | Keine echte Infrastrukturprovisionierung oder Qualifikation mit echtem Modell |
| [Validate STACKIT Flavors](https://github.com/stackitcloud/stackit-landing-zone/actions/workflows/validate-stackit-flavors.yml) · [Quelltext](../.github/workflows/validate-stackit-flavors.yml) | Konfigurierte Flavors mit aktuellen STACKIT-SKUs vergleichen | Montags, **05:17 UTC**, auf dem Standardbranch (`17 5 * * 1`); GitHub kann geplante Läufe verzögern | **Run workflow**, keine Eingaben | Liest externen Katalog; keine Bereitstellung |
| [Assistant live regression](https://github.com/stackitcloud/stackit-landing-zone/actions/workflows/assistant-live.yml) · [Quelltext](../.github/workflows/assistant-live.yml) | Wiederholte faktische Fälle und durchgängiger Dialog über mehrere Themen mit echtem Model Serving | Nicht bei Push/PR; wird von einem neuen Configurator Release aufgerufen | **Run workflow** mit Thema und Wiederholungszahl | Wiederverwendbar durch **Configurator Release**. Inferenzkosten; kein Cloud-Plan/Apply. Verwendet `assistant-tests`. |
| [Verify Deployment](https://github.com/stackitcloud/stackit-landing-zone/actions/workflows/verify-deployment.yml) · [Quelltext](../.github/workflows/verify-deployment.yml) | Echter Accelerator-Plan, Apply und Bereinigung in der konfigurierten Testorganisation | Nicht bei Push/PR; wird von Publish Release aufgerufen | **Run workflow** mit Variablendateipfad | Wiederverwendbar durch **Publish Release**. **Erstellt und zerstört echte Cloud-Ressourcen** über `terraform-plan`. Behält das Governance-Ordnergerüst bei; fehlgeschlagene Bereinigung kann Ressourcen hinterlassen. |
| [Publish Release](https://github.com/stackitcloud/stackit-landing-zone/actions/workflows/publish-release.yml) · [Quelltext](../.github/workflows/publish-release.yml) | Accelerator prüfen, dann GitHub-Release/-Tag mit Quellarchiven und Herkunftsnachweis erstellen | Keiner; wird nicht durch Push eines Tags ausgelöst | **Run workflow** auf `main`, mit Version | Ruft zuerst **Verify Deployment** auf: **echte Cloud-Änderungen und Kosten**, danach GitHub-Release-Veröffentlichung. Stellt den Configurator nicht bereit. |
| [Configurator Bootstrap](https://github.com/stackitcloud/stackit-landing-zone/actions/workflows/configurator-bootstrap.yml) · [Quelltext](../.github/workflows/configurator-bootstrap.yml) | Workload-State-Bucket/-Zugriff (`bootstrap`) oder dessen Versionierung (`backend`) planen | Keiner | **Run workflow** auf `main`; Root wählen und optional Apply | Echter Backend-/Zugangsdatenzugriff für Plan; `apply=true` ermöglicht Cloud-Änderungen nach Freigabe der geschützten Umgebung |
| [Configurator Platform](https://github.com/stackitcloud/stackit-landing-zone/actions/workflows/configurator-platform.yml) · [Quelltext](../.github/workflows/configurator-platform.yml) | Gemeinsame Configurator-Dienste planen: CF-Organisation, Datenbank, Secrets Manager, Artefaktspeicher und Modell-Token | Keiner | **Run workflow** auf `main`; optional Apply; benötigt `LZC_PLATFORM_CI_ENABLED=true` | Echter Backend-/Zugangsdatenzugriff für Plan; optionaler freigegebener Cloud-Apply |
| [Configurator Runtime](https://github.com/stackitcloud/stackit-landing-zone/actions/workflows/configurator-runtime.yml) · [Quelltext](../.github/workflows/configurator-runtime.yml) | CF-Space/-Rollen und Datenbank-/Secrets-Laufzeitnutzer planen | Keiner | **Run workflow** auf `main`; optional Apply; benötigt `LZC_RUNTIME_CI_ENABLED=true` | Echter Backend-/Zugangsdatenzugriff für Plan; optionaler freigegebener Cloud-Apply. Veröffentlicht keinen Anwendungscode. |
| [Configurator Release](https://github.com/stackitcloud/stackit-landing-zone/actions/workflows/configurator-release.yml) · [Quelltext](../.github/workflows/configurator-release.yml) | API/UI und Runner gemeinsam qualifizieren, bauen und paketieren oder einen bestehenden qualifizierten Build übernehmen | Keiner; ein Merge startet ihn nicht | **Run workflow** auf `main`; Build-only, neues Release oder Promotion wählen; benötigt `LZC_RELEASE_CI_ENABLED=true` | Neue Builds rufen **Assistant live regression** auf und veröffentlichen einen geschützten Buildpack-Tag. Außer bei Build-only erfolgt nach Freigabe von `lzc-dev-release` die Entwicklungsbereitstellung einschließlich Migrationen und Laufzeitprüfungen. |

Der genaue Configurator-Pfadfilter steht im verlinkten YAML. Ein übersprungener
reiner Accelerator-Job bei einem Configurator-PR ist beabsichtigt und keine
Bereitstellung. Machen Sie einen pfadgefilterten Job nicht global zur
Pflichtprüfung, ohne sicherzustellen, dass er für jeden relevanten PR ein Ergebnis meldet.

<a id="start-a-workflow-in-the-github-ui"></a>
## Workflow in der GitHub-Oberfläche starten

1. Öffnen Sie den [Actions-Tab](https://github.com/stackitcloud/stackit-landing-zone/actions)
   des Repositorys oder den Workflow-Link in der Tabelle.
2. Wählen Sie den Workflow und anschließend **Run workflow**. Verwenden Sie **main**
   für gewöhnliche betriebliche Läufe; eine Branch-Auswahl überschreibt keine Job-/Umgebungsschranken.
3. Füllen Sie die folgenden Eingaben aus und starten Sie den Lauf. Eine fehlende
   Schaltfläche kann auf unzureichende Repository-Berechtigungen, deaktivierte
   Actions oder eine Definition ohne `workflow_dispatch` auf dem Standardbranch
   hinweisen. Alte Seitenleisteneinträge belegen nicht, dass ein Workflow noch existiert.
4. Verfolgen Sie den neuen Lauf. Bei einem geschützten Job muss ein berechtigter
   Prüfer **Review deployments** verwenden, die Umgebung auswählen und freigeben.
   PR-Merge-Freigabe/Admin-Bypass gibt eine Bereitstellung **nicht** frei.
5. Prüfen Sie den gesamten Lauf, nicht nur den erfolgreichen Dispatch oder den
   ersten grünen Job. Ein angenommener Dispatch kann bei deaktivierter
   Freigabeschranke trotzdem übersprungene Jobs enthalten.

<a id="manual-start-and-inputs"></a>
### Manueller Start und Eingaben

| Workflow | Eingaben und Voraussetzungen |
| --- | --- |
| Validate / Validate Configurator / Validate STACKIT Flavors | Keine Workflow-Eingaben |
| Assistant live regression | Standardmäßig `topic=all` oder eine Wissensthemen-ID; standardmäßig `repetitions=2`, unterstützter Bereich 1-3. Der durchgängige Dialog läuft auch bei themenbezogener Qualifikation. Die geschützte Umgebung `assistant-tests` erlaubt derzeit `main` und den ausdrücklich zugelassenen bisherigen Configurator-Feature-Branch. |
| Verify Deployment | Standardmäßig `var_file=config/hub-and-spoke-firewall.tfvars`; muss ein existierender relativer Pfad unter `src/` sein. Manuelle Läufe verwenden die ausgewählte Revision. Der wiederverwendbare Aufruf akzeptiert zusätzlich `ref`; das ist keine Dispatch-Eingabe. |
| Publish Release | `version` ist erforderlich. Wählen Sie `main`; andere Branches bestehen die Schranke des Prüfjobs nicht. |
| Configurator Bootstrap | Standardmäßig `root=bootstrap` oder `backend`; standardmäßig `apply=false`. Apply verwendet `lzc-dev-bootstrap-apply`. |
| Configurator Platform | `root=platform`; standardmäßig `apply=false`. Benötigt den obigen Plattform-Operatorschalter; Apply verwendet `lzc-dev-platform-apply`. |
| Configurator Runtime | `root=runtime`; standardmäßig `apply=false`. Benötigt den obigen Laufzeit-Operatorschalter; Apply verwendet `lzc-dev-runtime-apply`. |
| Configurator Release | Standardmäßig `release_mode=qualified` und `build_only=false`; leere `release_run_id` bedeutet einen neuen Build im gewählten Modus. Setzen Sie `build_only=true` für einen Build ohne CF-Bereitstellung; die Veröffentlichung des geschützten Tags erfolgt trotzdem; echte Modellaufrufe laufen im Modus `qualified`. Um einen bestehenden qualifizierten Build zu übernehmen, lassen Sie Build-only deaktiviert und geben Sie dessen numerische Run-ID an; das aufbewahrte Artefakt/Tag muss weiterhin gültig sein. |

Für die normale Configurator-Bereitstellung: Wählen Sie **Configurator Release**,
**runner_pool_size=1** für einen vorbereiteten Einmal-Runner in Dev
(`0` deaktiviert/baut den Pool ab; Standard `0`, Maximum `4`, 1 GiB RAM je Reserve),
`main`, lassen Sie **build_only deaktiviert** und **release_run_id leer**, und geben
Sie bei Aufforderung `lzc-dev-release` frei. Dies stellt die Entwicklungsumgebung
bereit, keine neue Produktionsumgebung. Siehe das
[Release-Runbook](../landing-zone-configurator/deploy/cloud-foundry/README.de.md#manual-development-release-in-github)
für Promotion und Fehlerbehandlung.

Bootstrap, Platform, Runtime und Release lehnen **Re-run jobs**-Versuche ab:
Starten Sie stattdessen einen **neuen Run workflow**. Infrastruktur-Apply verwendet
den geprüften verschlüsselten Plan aus demselben Lauf, keinen Plan eines älteren
Laufs. Ein neuer Promotion-Lauf kann einen bestehenden qualifizierten Release-Build
wiederverwenden; verwechseln Sie dies nicht mit der erneuten Ausführung der
ursprünglichen Bereitstellung. Fehlgeschlagene Qualifikationen bleiben Fehlschläge.

Alle vier verändernden Configurator-Workflows teilen sich die Warteschlange
`configurator-lzc-dev-mutation` und brechen eine aktive Änderung nicht ab.
Assistant-Modellläufe haben eine eigene serialisierte Warteschlange. Starten Sie
niemals parallele lokale Cloud-Schreibvorgänge, um diese Schutzmaßnahmen zu umgehen.

<a id="cli-equivalent"></a>
### CLI-Entsprechung

Aus einem mit GitHub CLI authentifizierten Terminal, beispielsweise zur Configurator-Prüfung:

```sh
gh workflow run validate-configurator.yml \
  --repo stackitcloud/stackit-landing-zone --ref main
```

Verwenden Sie den Workflow-Dateinamen aus dem **Quelltext**-Link, um einen anderen
Workflow auszuwählen. Übergeben Sie Eingaben mit `-f name=value`; dies hat dieselben
Auswirkungen und Berechtigungsanforderungen wie die Oberfläche. Zum Beispiel wählt
`-f root=backend -f apply=false` einen reinen Plan-Lauf von Bootstrap. Geben Sie
keine Zugangsdaten, rohen Pläne oder State in Eingaben an.
`gh run list --repo stackitcloud/stackit-landing-zone --workflow validate-configurator.yml --limit 5`
zeigt die letzten Läufe;
`gh run watch RUN_ID --repo stackitcloud/stackit-landing-zone`
verfolgt einen Lauf. Ein erfolgreicher Dispatch allein bedeutet nicht, dass seine
Jobs erfolgreich waren.

<a id="other-entries-in-the-actions-sidebar"></a>
## Weitere Einträge in der Actions-Seitenleiste

GitHub bewahrt Workflow-Verläufe nach dem Entfernen von Dateien auf und zeigt
außerdem von GitHub selbst verwaltete Workflows. Diese sind keine zusätzlichen
aktuellen Repository-Definitionen.

| Seitenleisteneintrag | Herkunft | Start / Vorgehen |
| --- | --- | --- |
| [Terraform Plan](https://github.com/stackitcloud/stackit-landing-zone/actions/workflows/terraform-plan.yml) | Historischer Workflow; sein YAML existiert auf `main` nicht mehr | Kein aktueller manueller Einstiegspunkt. Verwenden Sie das aktuelle Verzeichnis oben; ein alter Lauf oder GitHubs Workflow-Statuslabel stellt die gelöschte Definition nicht wieder her. |
| [Terraform Apply](https://github.com/stackitcloud/stackit-landing-zone/actions/workflows/terraform-apply.yml) | Historischer Workflow; sein YAML existiert auf `main` nicht mehr | Führen Sie historische Cloud-Schreibvorgänge nicht als Ersatz für einen autorisierten aktuellen Plan-/Apply-Ablauf erneut aus. Keine aktuelle `Run workflow`-Definition auf `main`. |
| Copilot cloud agent | Von GitHub verwalteter Agent-Workflow, kein YAML in diesem Repository | Start über GitHubs Copilot-Agent-Aufgabenoberfläche, abhängig von Repository-Richtlinien und Zugriff; nicht über unsere `workflow_dispatch`-Eingaben |
| Dependabot Updates | Von GitHub verwaltete Update-Jobs, konfiguriert in [dependabot.yml](../.github/dependabot.yml) | Wöchentlich sonntags für Terraform-Provider und GitHub Actions; GitHubs Dependabot-Oberfläche verwaltet Update-Prüfungen. Entstehende PRs durchlaufen die normale Repository-Validierung, keine automatische Bereitstellung. |

<a id="maintaining-this-catalogue"></a>
## Diesen Katalog pflegen

Aktualisieren Sie diese Seite bei Änderungen an Workflow-Namen, Auslösern, Eingaben,
Branch-Schranken, Umgebungsfreigaben oder betrieblichen Auswirkungen. Unterscheiden
Sie wiederverwendbare Aufrufe von automatischen Push-/PR-Auslösern. Workflow-YAML
und verlinkte Operator-Runbooks sind maßgeblich; dieser Katalog ist keine
Bereitstellungsfreigabe.

Weitere Referenzen: [Mitwirken](../CONTRIBUTING.de.md),
[Configurator-Entwicklung](../landing-zone-configurator/docs/development.de.md),
[Operator-CI und Umgebungsschranken](../landing-zone-configurator/infra/ci/README.de.md).

Der Job `Isolated recovery lab` in **Validate Configurator** prüft einen lokalen
PostgreSQL-Restore und native OpenTofu-1.12.6-Abbrüche mit synthetischen Fixtures.
Er unterbricht keine gehosteten Runner und führt keinen Cloud-Apply aus. Siehe die
[Lab-Anleitung](../landing-zone-configurator/infra/recovery-lab/README.de.md).
