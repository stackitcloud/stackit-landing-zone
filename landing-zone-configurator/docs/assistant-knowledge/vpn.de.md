# Site-to-Site-VPN

[English](vpn.md) | [Deutsch](vpn.de.md)

Deutsche Lesefassung. Der Assistant liest ausschliesslich die englische Quelle.

<a id="purpose"></a>

## Zweck

Explizit angeforderte externe Netze ueber unterstuetzte Site-to-Site-VPN-Gateways
und Tunnel mit der Plattform verbinden.
VPN ist fuer Projekt-zu-Projekt-Kommunikation innerhalb einer SNA nicht
erforderlich und darf nicht in eine SNA-zuerst-Aufgabe eingefuehrt werden.

<a id="accelerator-contract"></a>

## Accelerator-Vertrag

Natives `connectivity.vpn` und unterstuetzte `connectivity_regions`-Eintraege
tragen Gateway, Plan, Routing-Typ, Verbindungen, Tunnel-Peers, Routen/Subnetze
und die vom Root-Schema definierten IKE-/IPsec-Einstellungen.
`vpn_pre_shared_keys` ist eine getrennte geschuetzte Eingabe.
Tatsaechliche Gateway-/Verbindungs-/Tunnelschluessel verwenden; Vertrag nicht
abflachen oder beliebige VPN-Appliances erfinden.
Regionale Root-Aufrufe existieren; Service-Verfuegbarkeit und Plan-Kompatibilitaet
benoetigen weiterhin autorisierte aktuelle Pruefungen.
Native Defaults: `plan_id = "p100"` und `routing_type = "ROUTE_BASED"`
(nicht `static`/`dynamic`). Beide Tunnel verwenden native Peering-,
`phase1`- und `phase2`-Einstellungen.

<a id="dependencies"></a>

## Abhaengigkeiten

SNA-Routing, bestaetigte nicht ueberlappende lokale/entfernte Netze,
erreichbare Peers und getrennte Zugangsdaten-Bindungen.
Oeffentliche PIM-Produktdaten beweisen keine Verfuegbarkeit fuer Zielprojekt
oder Region. Eine Abrechnungs-SKU ist keine Plan-ID.

<a id="dialogue"></a>

## Dialog

Zuerst bestaetigen, dass externe Konnektivitaet jetzt benoetigt wird.
Standortanzahl, Peer-Faehigkeiten, benoetigten Durchsatz/Verbindungen,
lokale/entfernte Netze und Verfuegbarkeit erfragen.
Labels und fachliche Anforderungen verwenden, keine Plan-IDs anfordern.
Bei Auswahl aktuelle PIM-Attribute mit autorisierten Planoptionen abgleichen;
fehlende eu02-Daten nicht durch eu01 ersetzen.
Niemals PSKs oder private Schluessel erfragen.

<a id="examples"></a>

## Beispiele

Synthetischer Wunsch: ein freigegebener externer Standort, zwei Tunnel, sofern
der bestaetigte Verbindungsvertrag sie vorsieht, explizite Peer-Subnetze.
`connectivity.vpn = null` deaktiviert diese optionale Konfiguration.
Dieses Feldfragment ist kein vollstaendiger Gateway-Vorschlag und enthaelt
niemals einen Preshared-Key.

<a id="limits"></a>

## Grenzen

Native Editor-Vorschlaege unterstuetzen gepruefte oeffentliche VPN-Einstellungen,
keine Zugangsdaten. Annahme aendert nur den Entwurf.
Kompatible Verschluesselung, Peer-Routen, Leistung oder Failover nicht aus
einem Plannamen ableiten.
Plaene, Quoten und Tunnelzustand sind aktuelle Betriebsfakten.
Konfiguration beweist keinen Paketfluss; Routing- und Ueberlappungspruefungen
bleiben getrennt.

<a id="credentials"></a>

## Zugangsdaten

Provider-Zugriff und Tunnel-PSKs nutzen getrennte extern bereitgestellte
Bindungen. PSK-Werte niemals ueber das Modell anfordern oder exportieren.
Schluesselrotation und Gateway-Erstellung benoetigen explizite autorisierte
Ausfuehrung, keine Gespraechsempfehlung.
`vpn_pre_shared_keys` je Verbindung/Tunnel ueber
`TF_VAR_vpn_pre_shared_keys` oder gitignorierte tfvars ausserhalb des
Assistants bereitstellen.

<a id="sources"></a>

## Quellen

Root-Variablen, Konnektivitaetsverdrahtung und VPN-Implementierung sind
Manifest-Quellen. Regionale/Plan-/Tunnel-Vertragsaenderungen vor Neugenerierung
erneut pruefen. Aktuelle Kataloge/PIM bleiben separat geladene Fakten,
keine eingefrorene Markdown-SKU-Liste.
