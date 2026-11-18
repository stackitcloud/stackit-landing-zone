# DevOps-Git-Service

[English](devops-git.md) | [Deutsch](devops-git.de.md)

Deutsche Lesefassung. Der Assistant liest die englische Quelle.

<a id="purpose"></a>
## Zweck

Managed Git, getrennt von GitHub-Anmeldung und Configurator-CI.

<a id="accelerator-contract"></a>
## Accelerator-Vertrag

Root leitet Projekt, Verantwortlichen und Namen ab. `devops=null` überspringt
die Bereitstellung; `git_flavor=null` erstellt auch mit ACLs keine Instanz.
Eingaben sind `git_flavor` und `allowed_network_ranges`. Der native Allow-All-
ACL-Default ist keine Zustimmung zu öffentlichem Zugriff.

<a id="dependencies"></a>
## Abhängigkeiten

Management/Governance, Identität, Provider-Rechte und bewusst gewählte Quellnetze.
Verfügbarkeit und Preise sind aktuelle Katalogdaten.

<a id="dialogue"></a>
## Dialog

Fachliche Wünsche führen zu Beratung statt einem leeren technischen Flavor-Feld.
Git100 als Ausgangsempfehlung für unternehmensweites Git erklären: dokumentiert
für bis zu 100 Nutzer, gemeinsame Repositories und CI/CD. Git10 passt zu kleinen
Teams/Piloten bis zu zehn Nutzern. Tatsächliche Katalogoptionen anbieten, oder
bei fehlendem Katalog ausdrücklich dokumentierte Optionen, ohne eine
Berechtigung oder Bestellbarkeit zu behaupten.

„Nimm einen sinnvollen Standard für unternehmensweites Git“ delegiert die
Empfehlung. Diese Entscheidung erhalten und nur noch den Zugriff klären.
Vorhandene eingeschränkte Allowlists oder Firmen-/VPN-Ausgangsnetze zur Auswahl
anbieten. Tatsächliche öffentliche Quell-CIDRs nur erfragen, wenn sie unbekannt
sind; niemals aus Firmennamen oder privaten SNA-Netzen ableiten. Öffentliches
`0.0.0.0/0` verlangt eine ausdrückliche Auswahl. Beispiele sind keine Zustimmung.
Die explizite UI-Sprache verwenden, auch nach zitierten anderssprachigen Fragen.

Sizing berücksichtigt dokumentierte Grenzen: Git10 bis10, Git100 bis100 Nutzer
pro Instanz sowie gemeinsame Repositories/CI/CD. Bei Unklarheit geplante Git-Nutzer
und Wachstum klären; unternehmensweit belegt nicht höchstens100 Nutzer. Darüber
getrennte Team-/Application-Projektinstanzen oder eine andere Architektur besprechen,
keinen größeren Flavor erfinden. Instanzen bieten keine transparente Föderation.
Application-Templates können eigenes verwaltetes Git über git.enabled/flavor/acl
bereitstellen; vor Vorschlägen zentrale Plattform und gewünschtes Projekt-Template
unterscheiden.
Die nativen Flavor-IDs lauten `git-10` und `git-100`; Git10/Git100 sind Anzeigenamen. Das zentrale `devops`-Objekt erzeugt eine Instanz; weitere Team-/Projektinstanzen werden über Projekt-Git getrennt bereitgestellt.

<a id="examples"></a>
Die Nutzergrenzen gelten pro Instanz: Git10 höchstens 10, Git100 höchstens 100.
Automatisches Speicherwachstum erhöht diese Grenzen nicht. Bei mehr als 100
Nutzern zuerst getrennte Team-/Projektinstanzen oder einen kleineren anfänglichen
Umfang besprechen. Keine erfundenen größeren Tarife, automatische Verteilung oder
transparente Föderation. Die zentrale devops-Einstellung konfiguriert eine Instanz;
weitere Instanzen benötigen separat geprüfte Konfiguration. Diese Anforderung
bleibt bei folgenden Zugriffsantworten erhalten.

## Beispiele

Größe und Zugriff wählen; vollständige Editor-Vorschläge bleiben prüfbare
Entwürfe. Der native Default ist kein Git, weder Git10 noch Git100.

<a id="limits"></a>
## Grenzen

Provider 0.114.0 verlangt bei Flavor- oder ACL-Änderungen eine Ersetzung, kein
Update der bestehenden Instanz. Keine Zusage für Unterbrechungsfreiheit,
Datenverlustfreiheit, Backup, Restore, Migration, SSO, CI oder beliebige
Appliances. Die native Root-Verdrahtung ist maßgeblich. Die Übernahme erstellt
keine Ressourcen und gewährt keine Rechte.

<a id="credentials"></a>
## Zugangsdaten

Provider- und Git-Nutzerzugang unterscheiden sich. Keine PATs, SSH-Schlüssel,
Passwörter oder CI-Secrets im Chat. Keine versteckte Configurator-Profil-ID.

<a id="sources"></a>
## Quellen

Das Manifest bindet native Eingaben, Entscheidungspolicy, Provider und offizielle
Größenplanung.
