<a id="sandbox-projects"></a>

# Sandbox-Projekte

[English](sandbox-projects.md) | [Deutsch](sandbox-projects.de.md)

Deutsche Lesefassung. Der Assistant liest ausschliesslich die englische Quelle.

<a id="purpose"></a>

## Zweck

Explizit angeforderte experimentelle Projekte mit klarer Ownership unter
der Sandbox-Hierarchie erstellen, ohne sie als Corporate-Spokes oder Cluster
darzustellen.

<a id="accelerator-contract"></a>

## Accelerator-Vertrag

Natives `sandboxes` ist eine Liste aus `project_name`,
`project_owner_email` und optional `owner_emails`.
Root erstellt das Sandbox-Modul nur bei nicht leerer Liste und verwendet
den Sandbox-Ordner der Governance sowie ein abgeleitetes Namenspraefix.
Sandbox-Erstellung aktiviert keine Netzwerk-/DNS-/Secrets-Manager-Optionen
des Landing-Zone-Projekts.
Das gemeinsame Dokument erhaelt stabile Sandbox-Identitaeten bei
Bearbeitung/Import.

<a id="dependencies"></a>

## Abhaengigkeiten

Governance-/Identitaetsgrundlagen und Provider-Autorisierung.
Ein optionaler externer Anwendungsworkflow ist von dieser nativen Liste
getrennt; eine Wissensabhaengigkeit ist keine Anfrage zur Erstellung
von SNA oder Firewall fuer Sandbox-Eintraege.

<a id="dialogue"></a>

## Dialog

Owner jeder Sandbox, Zweck und erforderliche Isolation erfragen.
Lebenszyklus, Budgetkontrollen und Ablauf als getrennte explizite
Anforderungen behandeln, nicht als automatisch durch das Label Sandbox
implementierte Features.
Keine 100 Sandboxes aus einer Schaetzung spaeterer Projektzahlen
einer Organisation erfinden.

<a id="examples"></a>

## Beispiele

Synthetische Deaktivierung: `sandboxes = []`.
Eine neue Sandbox benoetigt bestaetigten `project_name` und
`project_owner_email`; optionale weitere Owner benoetigen explizite Auswahl.
Dieses Listenfragment ist keine Erlaubnis, bestehende deployte Projekte
zu entfernen.

<a id="limits"></a>

## Grenzen

Native Editor-Vorschlaege unterstuetzen gepruefte Sandbox-Konfiguration;
Plattformtemplates sind keine deployten Instanzen.
Dieses native Modul verspricht weder automatischen Ablauf noch
Kostenobergrenze, Corporate-Routing oder Anwendungsveroeffentlichung.
Loeschen von Konfigurationseintraegen benoetigt getrennten geprueften Plan
und Autorisierung; es ist kein Aufraeumen im Gespraech.

<a id="credentials"></a>

## Zugangsdaten

Provider-/Resource-Manager-Rechte bleiben extern; Owner-E-Mail ist weder
Zugangsdatenwert noch Freigabenachweis.
Niemals Passwoerter, Rollen-Secrets oder Tokens erfragen.

<a id="sources"></a>

## Quellen

Root-Sandbox-Verdrahtung, Modulvariablen und gemeinsame Dokumentidentitaeten
sind Manifest-Autoritaeten.
Listen-/Identitaets-/native Exportaenderungen vor Neugenerierung erneut
pruefen; Provider-Quoten und Lebenszyklusverhalten benoetigen getrennte
Qualifikation.
