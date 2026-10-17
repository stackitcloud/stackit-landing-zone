# STACKIT Network Areas (SNA)

[English](sna.md) | [Deutsch](sna.de.md)

Deutsche Lesefassung. Der Assistant liest ausschliesslich die englische Quelle.

<a id="purpose"></a>

## Zweck

SNA ist die STACKIT Network Area fuer zentrale Projektvernetzung, nicht AWS VPC,
Shared VPC oder Direct Connect. Von Firewall, VPN und externen Standorten
unterscheiden.

<a id="accelerator-contract"></a>

## Accelerator-Vertrag

Native Einzelform: `connectivity.network_area`; Map:
`connectivity.network_areas` mit stabilen Schluesseln; regionale Form:
`connectivity_regions`. Formen niemals mischen.
Area-Felder: `ranges`, `transfer_network` (IPv4-CIDRs), `min_prefix_length`,
`max_prefix_length`, `default_prefix_length`, optional `name/default_nameservers`.
Praefixreihenfolge: `min <= default <= max`, Ganzzahlen in 0..32.
Backend-Patch-Schema und gemeinsamer Compiler entscheiden ueber editierbare
Faehigkeiten, nicht der Wissenstext.

<a id="dependencies"></a>

## Abhaengigkeiten

Zugangsdaten-/Governance-Grundlagen gelten. Corporate-Projekte benoetigen eine
Area in derselben Region; ausgelassenes Corporate behaelt den Corporate-Default.
Referenzierte Area-Schluessel erhalten. Projektanzahl garantiert keine Quote.
OPNsense ist die unterstuetzte zentrale Firewall, nicht Palo Alto/Fortinet/AWS
Network Firewall; eine SNA impliziert niemals deren Aktivierung.

<a id="dialogue"></a>

## Dialog

Kontext/Antworten wiederverwenden; hoechstens drei fehlende Angaben erfragen:
ungenutzter Pool, Projekt-Subnetzgroesse und freies Transfer-Subnetz.
CIDRs und erforderliche Kommunikation erklaeren, keine erfundenen
Isolationsschalter. Ein /16 enthaelt vor Reservierungen 256 /24-Netze:
Arithmetik, keine Quote. Ein /16 enthaelt 512 /25-Netze; /25 hat 128 Adressen,
nicht 128 Projekt-Subnetze. Infrastrukturreservierungen reduzieren die
nutzbare Kapazitaet. Ein vorgeschlagener Pool ist eine Annahme, bis seine freie
Verwendbarkeit bestaetigt ist.
Sobald Eingaben bekannt sind, einen SNA-Patch statt eines weiteren Fragebogens
vorschlagen. Unveraenderte Firma/Eigentuemer/Region nicht erneut abfragen; keine
Firewall-/VPN-/Secret-Versionen erfragen, wenn diese spaeter folgen.
Geerbte Firewall-/DNS-Werte sind keine Zustimmung: Vor widerspruechlichen Pools
oder aktivierten Services warnen, ohne sie still zu aendern.
Explizite kombinierte SNA-/Firewall-Anfragen behalten Firewall-/HA-Anforderungen:
Vollstaendige gespeicherte SNA wiederverwenden und den Firewall-Vertrag
fortsetzen, statt kuenstlich "SNA zuerst" einzuschraenken.
Fehlende SNA-Eingaben bleiben echte Abhaengigkeiten.
Projektspezifische Praefixe ueberschreiben SNA-Defaults.

<a id="examples"></a>

## Beispiele

Synthetischer bestaetigter Pool `10.64.0.0/16`, Transfer `10.63.0.0/24`,
fest /24, `eu01`/Schluessel `default`, Firewall spaeter.
`network_areas.default` enthaelt diese Felder; in vorhandenen
Einzelentwuerfen `network_area` beibehalten. Keine implizite Firewall/Routen.
Native tfvars exportieren, kein freies Terraform.

<a id="limits"></a>

## Grenzen

Der spezialisierte SNA-Dialog unterstuetzt Einzel-/Map-Hinzufuegen/-Bearbeiten.
Andere gepruefte oeffentliche Einstellungen nutzen typisierte native
Editor-Vorschlaege, niemals implizite Migrationen oder Ausfuehrung.
Firewall nutzt ihren getrennten geprueften zentralen Infrastruktur-/HA-Patch-Vertrag,
nicht einen impliziten Bestandteil der SNA.
Unbekannte Importe ausserhalb des Modellkontexts erhalten.
Vor Anzeige/Annahme validieren; nur explizite autorisierte Annahme speichert.
Niemals Deployment behaupten. Vollstaendige Ueberlappungs-, Quoten-,
Verfuegbarkeits- und Firewall-Containment-Pruefungen bleiben getrennt;
saubere Kompilierung ist kein Nachweis. Nur gepruefte Editor-Pfade duerfen
sich aendern; geschuetzte Eingaben bleiben ausgeschlossen.

<a id="credentials"></a>

## Zugangsdaten

Externe Provider-Zugangsdaten/aktuelle Rechte sind fuer Provisionierung
erforderlich, nicht fuer reine Entwurfsberatung.
Keine Schluessel, Passwoerter, IDs, States, Plaene oder Profile im Modellkontext;
keine fehlenden Berechtigungen erfinden.

<a id="sources"></a>

## Quellen

Manifest-Hashes binden lokale Konnektivitaets-/Validierungsquellen.
Externe Provider-Links dienen der Information, nicht als aktuelles
Laufzeitverhalten. Vertragsaenderungen erneut pruefen; Assistant-,
Common-Configuration- und Identitaetstests bleiben getrennte Nachweise.
