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
Bestellungen behalten IaC-Quelle, Lock-/Werkzeugversionen und Ausführungsbindung
über Produkt-Releases. Aktuelle gepatchte Worker prüfen gebündelte historische
Quellen. Ein ausdrückliches Upgrade erhält dieselbe Bestellung und denselben
State; anschließend sind ein neuer geprüfter Plan und die normale Apply-Freigabe
nötig. Zurückgezogene Quellen benötigen einen geprüften Ersatzpfad, keine
Neubestellung. Der Chat führt kein Upgrade aus.
Die ursprüngliche Template-Quelle bleibt unverändert; ein ausdrückliches Upgrade
ändert nur den gewünschten Ausführungsstand. Zuletzt angewendet ändert sich erst
nach erfolgreichem Apply. Bei Fehlern bleibt der gewünschte Stand erhalten;
Recovery verwendet die Quelle des unterbrochenen Jobs, nicht zuletzt angewendet.
Der neue Plan vergleicht den tatsächlichen State, nicht zuletzt angewendet. Der gewünschte Stand
bezeichnet eine gewählte Accelerator-Git-Revision, keinen bearbeitbaren
Plattformentwurf. Zuletzt angewendet ist kein vollständiger aktueller
State-Snapshot: Ein fehlgeschlagener Apply kann State und Ressourcen bereits
verändert haben. Niemals unveränderten State oder Verlustfreiheit garantieren.
In den Bestelldetails unter Ausführungsstand ändert ein Upgrade ausschließlich
die gewünschte Quelle und startet keine Ausführung. Danach sind ein neuer Plan,
die Prüfung auf Änderungen, Ersetzungen und Löschungen sowie eine ausdrückliche
normale Apply-Freigabe nötig. Organisation, Projekt, Bestellung, Backend und
State-Zuordnung bleiben erhalten. Zurückgezogene Quellen dürfen nicht manuell
weiter angewendet werden. Offene Recovery sperrt das Upgrade; bei zurückgezogener
Quelle muss der Operator ein geprüftes kompatibles Paket bereitstellen.

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

Bei ausdrücklich auf Application-Quellen bezogener Lifecycle-Beratung gibt der
Assistant den festen Produktablauf mit Plan-/Apply-Grenze und Recovery-Regeln aus.
Dabei werden keine Bestelldaten gelesen oder Aktionen ausgeführt.
