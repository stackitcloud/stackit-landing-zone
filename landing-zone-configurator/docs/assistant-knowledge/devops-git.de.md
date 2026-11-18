# DevOps-Git-Service

[English](devops-git.md) | [Deutsch](devops-git.de.md)

Deutsche Lesefassung. Der Assistant liest ausschliesslich die englische Quelle.

<a id="purpose"></a>

## Zweck

Explizites Managed Git, getrennt von GitHub-Login, Forks und Configurator-CI.

<a id="accelerator-contract"></a>

## Accelerator-Vertrag

`devops=null` ueberspringt das Modul. Root leitet Projekt, Ownership und
Benennung ab und uebergibt `git_flavor` sowie `allowed_network_ranges`.
`git_flavor` hat den Default `null`, NICHT `git-10/git-100`:
`null` erstellt keine Git-Instanz. Ein reines ACL-Objekt aktiviert Git nicht.
Root-Verdrahtung, nicht allein Child-Modulparameter, bestimmt Unterstuetzung.
Echte Groessen und regionale Verfuegbarkeit benoetigen autorisierte Kataloge.

<a id="dependencies"></a>

## Abhaengigkeiten

Management/Governance, Identitaetsgrundlagen, Provider-Rechte und bewusste ACLs.
Ein Repository-Fork beweist weder provisioniertes Git noch
Service-Account-Rechte.

<a id="dialogue"></a>

## Dialog

Git-Bedarf, Kapazitaet, Betreiber und Zugangsnetze klaeren.
Der Allow-All-ACL-Default ist KEINE Zustimmung zu oeffentlichem Zugriff.
Es gibt keinen aktivierten nativen Flavor-Default:
Wenn Git gewuenscht ist, aber kein ausgewaehlter/gepruefter Flavor vorliegt,
`null` erklaeren und nachfragen, statt `git-10` zu erfinden.
Explizite Nutzer-Flavors sind pruefbar, aber kein Verfuegbarkeitsnachweis.
Ein breiter Wunsch wie „Bitte eine zentrale Git-Instanz hinzufügen“ beginnt einen
Einrichtungsdialog und ist keine fehlerhafte Anfrage. Fehlende Größen- und
Zugangsentscheidungen erfragen; erst einen vollständigen neuen Dienst vorschlagen.
Nutzerauswahlen über Folgeantworten erhalten und nur offene Punkte erfragen.
Tatsächliche CIDRs als Freitext erfragen, ohne erfundene Beispiele oder Netzoptionen.
Eine fehlende oder leere Antwort erlaubt niemals den nativen Allow-All-Default.
Ein Katalog kann eine klar gekennzeichnete Empfehlung begründen, beweist aber
keine Berechtigung im Zielprojekt und ersetzt keine Zugangsentscheidung.
Keine Runner, Integrationen, Migrationen oder Secrets ableiten.

<a id="examples"></a>

## Beispiele

`devops=null` deaktiviert. Ein gewaehlter `git_flavor` plus bewusst gewaehlte
`allowed_network_ranges` kann Git vorschlagen.
`git-10` illustriert Syntax, keine Berechtigung oder Kapazitaet.

<a id="limits"></a>

## Grenzen

Typisierte native Editor-Vorschlaege aendern bei Annahme nur den lokalen
Entwurf. ACLs qualifizieren weder Backup/Restore noch Migration, SSO oder
CI-Ausfuehrung. Keine beliebigen Git-Appliances, Verfuegbarkeits-, Preis-
oder Leistungsversprechen.

<a id="credentials"></a>

## Zugangsdaten

Provisionierung und Git-Nutzerzugang sind getrennt.
Keine PATs, privaten SSH-Schluessel, Git-Passwoerter oder CI-Secrets im Chat;
keine versteckte Configurator-Profil-ID-Abhaengigkeit.

<a id="sources"></a>

## Quellen

Root-Aufrufe, DevOps-Variablen und Provider-Konfiguration im Manifest.
Engine-/Quellbindungen nach Pruefung erneuern; aktuelle Produktdaten bleiben
getrennt.


Sizing berücksichtigt dokumentierte Grenzen: Git10 bis10, Git100 bis100 Nutzer
pro Instanz sowie gemeinsame Repositories/CI/CD. Bei Unklarheit geplante Git-Nutzer
und Wachstum klären; unternehmensweit belegt nicht höchstens100 Nutzer. Darüber
getrennte Team-/Application-Projektinstanzen oder eine andere Architektur besprechen,
keinen größeren Flavor erfinden. Instanzen bieten keine transparente Föderation.
Application-Templates können eigenes verwaltetes Git über git.enabled/flavor/acl
bereitstellen; vor Vorschlägen zentrale Plattform und gewünschtes Projekt-Template
unterscheiden.
