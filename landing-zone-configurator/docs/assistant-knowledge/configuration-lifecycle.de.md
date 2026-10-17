<a id="configuration-conversation-and-execution-lifecycle"></a>

# Lebenszyklus von Konfiguration, Gespraech und Ausfuehrung

[English](configuration-lifecycle.md) | [Deutsch](configuration-lifecycle.de.md)

Deutsche Lesefassung. Der Assistant liest ausschliesslich die englische Quelle.

<a id="purpose"></a>

## Zweck

Verpflichtend fuer jede Service-/Template-Beratung: autorisierter
Arbeitsbereich und autorisierte Konfiguration; Anforderungen, Defaults,
Vorschlaege, Annahme und Deployment unterscheiden.

<a id="accelerator-contract"></a>

## Accelerator-Vertrag

Das gemeinsame Dokument/der Compiler erzeugt native tfvars fuer den passenden
Accelerator. Template-Auswahl liefert Defaults, keine Zustimmung zur
Aktivierung optionaler Services. Unterstuetzte Patches: Firmenname/-code/Region,
bestehende Ordnernamen und natives SNA.
Explizite Namensdelegation erlaubt gewaehlte Firmen-/Ordnernamen, nicht Region,
IDs, Zugang, Eigentuemerschaft oder Rollen. Bestehende Strukturschluessel und
Metadaten erhalten. Andere Themen bleiben Beratung, niemals zusaetzliche
Mutationsrechte oder abgeleitete Zugriffswerte.
Gespeicherte Konfiguration, Application-Template-Veroeffentlichung, Bestellung,
Plan, Apply, Destroy und Recovery sind unabhaengige Vorgaenge. Kein freies
Terraform oder zweites YAML-Schema. Ein vollstaendiger Apply umfasst
verpflichtende Grundlagen und alle aktivierten Eingaben.

<a id="dependencies"></a>

## Abhaengigkeiten

Service-Wissen und Zugangsdaten-Grundlagen aktivieren keine Services.
Katalogfakten, aktuelle Werte, Nutzeraussagen und Schaetzungen sind keine
Ausfuehrung.

<a id="dialogue"></a>

## Dialog

Bestaetigte fruehere Anforderungen wiederverwenden, offene Annahmen benennen,
den aktuellen Schritt priorisieren und widerspruechliche geerbte Einstellungen
erklaeren. "Spaeter" bedeutet nicht "jetzt aktivieren". Themen-/Modusplanung
nutzt den gespeicherten Verlauf einschliesslich unbenannter Folgeantworten;
explizite Themenwechsel ersetzen den bisherigen Fokus. Planung ist keine
Autorisierung. Fachliche Entscheidungen, abgeleitete technische Werte und
rein operatorseitige sichere Einrichtung unterscheiden. Jeweils nur eine
fehlende Firewall-Entscheidung erfragen.
`options` sind Antwortvorschlaege, keine Patches/Zustimmung. `multiple=true`
erlaubt kompatible kombinierte Antworten; Freitext bleibt moeglich. Teilmengen
fordern einen neuen validierten Vorschlag an; nur explizite Annahme des gesamten
Vorschlags speichert Aenderungen.
Neue Konfigurationen koennen eigene Template-Beratung explizit ueber einen
revisionsgebundenen serverseitigen Kontext erben; bestehende Konfigurationen
werden nicht stillschweigend nachgeruestet. Application-Gruppen und
Parameterbindungen begrenzen autorisierte Versionen und Auswahlmoeglichkeiten;
niemals Rechte oder Bestellungen aus dem Chat erzeugen.

<a id="examples"></a>

## Beispiele

"SNA first, firewall later": Nur unterstuetzte SNA-Aenderungen vornehmen und
geerbte Firewall-Einstellungen offenlegen. Kein selektiver Cloud-Apply; native
tfvars benoetigen getrennte, extern bereitgestellte Zugangsdaten und
Backend-Voraussetzungen.

<a id="limits"></a>

## Grenzen

Bei Annahme Berechtigung, Basisrevision und Kandidatenvalidierung erneut pruefen.
Unbekannte Importfelder bleiben ausserhalb des Modellkontexts erhalten.
Gespraeche verfallen drei Kalendermonate nach Erstellung, nicht nach letzter
Aktivitaet; Quellenloeschung entfernt abgeleiteten Kontext und spaete Inferenz
darf ihn nicht wiederherstellen. Gespraeche mit aktuellem Wissen fortsetzen;
alte Vorschlaege muessen neu erzeugt werden. Keine Loeschung oder
Ablaufverlaengerung. Fuenf gleichzeitige Sitzungen sind ein Lastziel, keine
Quote gespeicherter Chats; aktuelle Prozesslimits sind keine gemessene
Lastqualifikation. Schema-/Modellfehler erhalten den Entwurf.
Keine automatische Git-/Repository-Mutation, Veroeffentlichung, Bestellung,
Recovery-Entsperrung oder Inspektion roher States/Plaene.

<a id="credentials"></a>

## Zugangsdaten

Eigentuemer-/Tenant-/Arbeitsbereichsrechte bei jedem Vorgang erneut pruefen,
auch nach Inferenz und erneuter Authentifizierung. Sitzungszustand ist keine
Rechteausweitung. Tokens, Schluessel, rohe Provider-Fehler und geschuetzte Daten
gelangen niemals in den Modellkontext.

<a id="sources"></a>

## Quellen

Das Manifest bindet Dokument, Funktionen und Service.
Release/Promotion, Planung, Aufbewahrung/Restore/Last/DE-EN-Paritaet und A01-A24
benoetigen getrennte Abnahme.
