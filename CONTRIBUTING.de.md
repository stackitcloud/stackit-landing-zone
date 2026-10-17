<a id="contributing"></a>
# Mitwirken

[English](CONTRIBUTING.md) | [Deutsch](CONTRIBUTING.de.md)

Vielen Dank, dass Sie sich die Zeit nehmen, einen Beitrag zu leisten. Dieses Dokument beschreibt die lokale Einrichtung, die Konventionen dieses Repositorys und den erwarteten Inhalt eines Pull Requests.

<a id="local-setup"></a>
## Lokale Einrichtung

Die Werkzeugversionen sind in `mise.toml` festgelegt. Installieren Sie sie einmalig:

```bash
mise install
```

Damit stehen OpenTofu, die STACKIT CLI, `terraform-docs` und `pre-commit` in den Versionen bereit, gegen die dieses Repository getestet wird.

Installieren Sie die Git-Hooks:

```bash
pre-commit install
```

Die Hooks führen `tofu fmt` aus und erzeugen die Moduldokumentation neu. Wenn ein Hook eine Datei umschreibt, nehmen Sie das Ergebnis in den Staging-Bereich auf und versuchen Sie den Commit erneut.

Der Dokumentations-Hook ruft `terraform-docs` über `mise exec` auf. So verwendet er die in `mise.toml` festgelegte Version und funktioniert auch, wenn Git aus einem Editor ohne geladene mise-Umgebung gestartet wird.

Für eine Bereitstellung in einer echten STACKIT-Organisation ist zusätzlich ein Dienstkontoschlüssel erforderlich. `mise.toml` erwartet ihn unter `~/.stackit/credentials.json`; siehe [docs/getting-started.md](docs/getting-started.de.md).

<a id="before-you-open-a-pull-request"></a>
## Vor dem Öffnen eines Pull Requests

```bash
cd src
tofu fmt -recursive
tofu init -backend=false
tofu validate
tofu test
```

`tofu test` führt die Konfigurationssuiten in `src/tests/` als lokale, reine
Plan-Läufe mit Mock-Providern aus. Diese Tests erstellen keine Cloud-Ressourcen.
Die Prüfung in der echten Cloud ist ein separater, manuell gestarteter Workflow,
keine gewöhnliche PR-Prüfung.

<a id="conventions"></a>
## Konventionen

<a id="changes-that-cross-the-accelerator-and-configurator"></a>
### Änderungen über Accelerator und Configurator hinweg

Der Accelerator bleibt unabhängig nutzbar. Configurator-Funktionen betreffen oft
mehrere Komponenten; aktualisieren Sie den vollständigen Vertrag, nicht nur ein
sichtbares UI-Feld. Lesen Sie zuerst die
[Entwicklungsübersicht](landing-zone-configurator/docs/development.de.md) und die
[Architektur](landing-zone-configurator/docs/architecture.de.md).

1. **Native Infrastruktur:** Ergänzen oder ändern Sie Root-/Moduleingaben und -ausgaben,
   Standardwerte, Validierung und Modultests in `src/`. Bewahren Sie State-Adressen und
   Kompatibilität oder dokumentieren Sie die Migration ausdrücklich.
2. **Eingabe-/Katalogadapter:** Aktualisieren Sie HCL-Import/-Export und erzeugen Sie
   die geprüften Kataloge für native Eingaben und Templates über die bestehenden
   [Adapterbefehle](landing-zone-configurator/tools/hcl-adapter/README.de.md) neu.
3. **Domain/Compiler:** Verdrahten Sie native Felder, die Semantik von optional/null/Standardwerten,
   die Erhaltung von Werten und deterministische Validierung in `app/packages/domain`.
4. **API/Verträge:** Aktualisieren Sie gemeinsame Anfrage-/Jobverträge und serverseitige Mandanten-,
   Berechtigungs-, Revisions- und Lebenszyklusprüfungen. Verlassen Sie sich nicht auf reine Browserprüfungen.
5. **Frontend:** Bilden Sie denselben Vertrag, beide Sprachen, hilfreiche Validierung und
   ausdrückliche Prüfung/Annahme ab. Testen Sie Desktop/Mobilgeräte und den Erhalt von Entwürfen.
6. **Runner/Release:** Führen Sie geänderte Eingaben und Ausgaben durch Broker, State,
   Migrationen, festgelegte Pakete und Jobergebnisse. Halten Sie die Quellherkunft von API/UI
   und Runner konsistent; führen Sie niemals einen beliebigen Repository-Head aus.
7. **Assistant:** Prüfen Sie Themenzuständigkeit, kuratierte Fakten, Berechtigungen und Vorschlagsschemata.
   Erzeugen Sie Wissen/Abdeckung neu, ergänzen Sie faktische positive und negative
   Oracle-Tests und qualifizieren Sie betroffene Fälle mit dem echten Modell mindestens zweimal.
   Eine neue Fähigkeit oder eine breite Vertragsänderung benötigt außerdem die vollständige
   wiederholte Suite und den durchgängigen Dialog. Schwächen Sie kein Oracle ab, um einen echten Fehler zu verbergen.
8. **Dokumentation:** Aktualisieren Sie sichtbares Benutzerverhalten, Architektur und Hinweise
   für Mitwirkende. Verlinken Sie Folge-Issues für bewusst gesetzte Grenzen.

Verwenden Sie für die Configurator-Einrichtung Node **24.21.0**, npm **11.19.0** und dessen eigene Lockdatei:

```sh
cd landing-zone-configurator/app
npm ci
npm run check
```

Verwenden Sie während der Entwicklung die kleinsten relevanten Tests und vor der
Prüfung die zutreffenden Integrationsprüfungen:

| Änderung | Erforderlicher Nachweis |
| --- | --- |
| Native Eingaben/Templates | Modultests; Adapter `go test ./...` und Katalogprüfungen; `npm run test:common-contract` |
| Domain/API/UI | `npm run check`; relevante Datenbank- und Playwright-Tests |
| Broker, Vorbereitungen, Runner oder State | Relevante Worker-/Brokertests; `npm run test:platform-database`; Paketierungs- und State-Regressionstests |
| Assistant | `npm run assistant:generate`, Formatierung generierter Dateien, `npm run assistant:check`, faktische Unit-Tests und quellgebundene Live-Nachweise |
| Operator-CI/IaC | Relevante `node --test`-Prüfungen; Workflow-Lint; Formatierung/Initialisierung/Validierung und Mock-Tests für betroffene IaC-Roots |

Die [Anwendungs-README](landing-zone-configurator/app/README.de.md) dokumentiert die
genauen Befehle für Generierung, Datenbank, Browser und das echte Modell.
Datenbank-/Browsertests verwenden isolierte Testdienste. Gewöhnliche PR-Prüfungen
dürfen keine Kundeninfrastruktur bereitstellen. Teilen Sie keine
Ausführungszugangsdaten mit der ausschließlich für Inferenz vorgesehenen Umgebung
`assistant-tests`. Configurator-Provisionierung und -Bereitstellung bleiben manuell;
die Produktionseinrichtung ist eine separate Aufgabe.

Der [Workflow-Katalog](docs/workflows.de.md) führt alle Pipelines, automatischen/manuellen
Auslöser und Startanleitungen für die Oberfläche auf. Aktualisieren Sie ihn bei Änderungen
an Workflow-Namen, Auslösern, Eingaben oder betrieblichen Freigabeschranken; halten Sie
die Bereitstellungsfreigabe getrennt von der PR-Freigabe.

<a id="terraform-conventions"></a>
### Terraform-Konventionen

Befolgen Sie neben den folgenden bestehenden Modulkonventionen den vollständigen
[Terraform-Stilleitfaden](docs/terraform-style.de.md).

**Terraform-Struktur.** Jedes Modul hält seinen `terraform`-Block in `terraform.tf`, seine Variablen in `variables.tf` und seine Ausgaben in `outputs.tf`. Ressourcendateien erhalten ein numerisches Präfix, wenn die Lesereihenfolge wichtig ist; jede Ressourcengruppe wird durch einen eingerahmten Abschnittskopf eingeleitet.

**Provider-Versionen.** Das Root-Modul in `src/terraform.tf` legt jeden Provider auf eine exakte Version fest. Child-Module unter `src/modules/` deklarieren nur eine Mindestversion mit `>=`. Fügen Sie niemals eine Obergrenze in einem Child-Modul hinzu; diese blockiert unbemerkt ein Upgrade im Root-Modul.

**Benennung.** `snake_case` für alle Blockbezeichnungen, Variablen, Ausgaben und lokalen Werte. Ressourcennamen wiederholen den Ressourcentyp nicht.

**Variablen und Ausgaben.** Jede Variable benötigt `type` und `description`. Jede Ausgabe benötigt `description` vor `value`.

**Kommentare.** Ein Kommentar erklärt eine Einschränkung, die der Code nicht zeigen kann, etwa einen Provider-Fehler oder eine Besonderheit der OPNsense-API. Beschreibungen der Funktionsweise des Codes oder des Architekturzusammenhangs gehören in [docs/architecture.md](docs/architecture.de.md).

**Dokumentation.** Modul-READMEs werden generiert. Bearbeiten Sie den Block zwischen den Markern `BEGIN_TF_DOCS` und `END_TF_DOCS` nicht von Hand; führen Sie stattdessen den pre-commit-Hook aus.

**Beispielkonfiguration.** Die tfvars-Dateien in `src/config/` dienen als Dokumentation. Belassen Sie Platzhalterwerte wie `owner@example.com` und eine Null-UUID für die Organisation. Committen Sie niemals eine Kennung aus einer echten Umgebung.

<a id="bilingual-documentation"></a>
### Zweisprachige Dokumentation

Englische `.md`-Dateien sind maßgeblich; Dokumentation für Menschen erhält
vollständige deutsche `.de.md`-Pendants, keine Zusammenfassungen. Setzen Sie die
wechselseitige Navigation `[English](name.md) | [Deutsch](name.de.md)` unmittelbar
nach jede H1 und aktualisieren Sie bei Prosaänderungen beide Sprachen. Bewahren Sie
Befehle, Beispiele, exakte Werte und bestehende Überschriftenanker.

Lassen Sie generatorverwaltete Verträge unverändert: Erzeugen Sie die englische
Referenz mit den bestehenden Werkzeugen neu und übernehmen Sie ihre technischen
Blöcke wortgetreu in das deutsche Pendant, mit einer deutschen Einleitung samt
Link zur maßgeblichen Referenz. Maschinell eingelesene Assistant-Themen bleiben
unverändert auf Englisch; verzeichnen Sie ihre separaten deutschen Übersetzungen
für Menschen in der Assistant-Wissens-README, statt die eingelesenen Themen zu ändern.

<a id="commits-and-pull-requests"></a>
## Commits und Pull Requests

Commit-Nachrichten folgen [Conventional Commits](https://www.conventionalcommits.org/), mit dem Modul als optionalem Scope:

```
feat(connectivity): add active/passive CARP support
fix(audit-logs): add HTTPS scheme to URLs
docs: clarify firewall bootstrap steps
```

Öffnen Sie den Pull Request gegen `main`. Beschreiben Sie, was sich für Nutzer der Landing Zone ändert, und geben Sie an, mit welcher Variante Sie getestet haben. CI führt Formatierung, Validierung, TFLint und die Testsuiten aus; alle müssen vor der Prüfung erfolgreich sein.
