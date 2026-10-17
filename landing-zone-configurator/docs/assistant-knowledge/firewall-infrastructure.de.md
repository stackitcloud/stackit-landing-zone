<a id="opnsense-firewall-infrastructure-and-ha"></a>

# OPNsense-Firewall-Infrastruktur und HA

[English](firewall-infrastructure.md) | [Deutsch](firewall-infrastructure.de.md)

Deutsche Lesefassung. Der Assistant liest ausschliesslich die englische Quelle.

<a id="purpose"></a>

## Zweck

Zentrale OPNsense Active/Passive-HA; niemals implizit bei reiner SNA-Arbeit.

<a id="accelerator-contract"></a>

## Accelerator-Vertrag

`connectivity.firewall` gilt je Area; `firewalls` bildet stabile Area-Schluessel
ab. Native Zone/Flavor/Name, Volume-Klasse/-Groesse, LAN-/WAN-CIDRs/-IPs;
`ha` ist ein Objekt mit verpflichtender anderer `backup_zone`, optional
`backup_name`/Node-IPs/`lan_vip`/`vhid`.
LAN-VIP ist der Plattform-Next-Hop. HA verwendet Unicast-CARP, pfsync ueber LAN
und XMLRPC. Nachgelagerter API-Policy-Sync repliziert getrennt
Aliases/Kategorien/Regeln/NAT/Routen.

<a id="dependencies"></a>

## Abhaengigkeiten

SNA-Pools, Area-Schluessel und autorisierte Zonen/Flavors.
Freie LAN-/WAN-Subnetze bestaetigen; Transfer-Netz ist kein HA-Transport.
Abhaengigkeiten aktivieren niemals Services.

<a id="dialogue"></a>

## Dialog

Angeforderte HA erhalten. Kombinierte Anfragen setzen bei vollstaendiger
gespeicherter SNA mit Firewall fort; niemals SNA zuerst erzwingen oder
HA-Zustimmung erneut abfragen.
Breites Setup erfragt auch bei HA-Patches eine offene
Traffic-/Kapazitaets-/Betriebsentscheidung; enge Aenderungen benoetigen keinen
Fragebogen. Bis zu drei fehlende native Eingaben.
Traffic im selben Subnetz ist kein gerouteter Pfad.
Defaults sind keine Zustimmung; SNA-Annahme beweist niemals die Sicherheit
eines vollstaendigen Applies.

<a id="examples"></a>

## Beispiele

`ha = { backup_zone = "eu01-2" }`: synthetisch, keine Verfuegbarkeitszusage.
`firewall=null` deaktiviert nativ, niemals ueber den Chat.

<a id="limits"></a>

## Grenzen

Kein Active/Active, automatischer Failover oeffentlicher Ingress-IPs oder
Durchsatz-/Session-/SLA-Versprechen. Backup besitzt eine eigene oeffentliche
WAN-IP; Primary bleibt an seine NIC gebunden.
Zentrale Einzel-/Map-Chat-Patches erhalten Form/Schluessel/HA und nicht
betroffene Werte. Mehrere Areas benoetigen explizite Zielauswahl.
Neue Maps decken jede Area ab: Vor Aktivierung weiterer Appliances fragen;
kein impliziter Umfang ueber alle Areas.
Neue Appliances benoetigen alle fuenf Pflichtfelder gemeinsam; bestehende
erlauben Teilaktualisierungen. Containment je betroffener Area,
nicht ueberlappende LAN-/WAN-/Transfer-Netze, nutzbare verschiedene IPs und
unterschiedliche Zonen validieren.
Native `cidrhost`-Defaults 4/5/6 bleiben implizit; IPs nur vorschlagen,
wenn gespeichert/vom Nutzer bestaetigt.
Projektanzahl beweist weder freie CIDRs noch Flavor-Kapazitaet.
Produktwahl benoetigt gespeicherte/Nutzerwerte oder autorisierte Kataloge.
Keine Entfernung, regionale Umwandlung/-Patches, Policy,
Zugriff/Bootstrap oder Ausfuehrung.
Unvollstaendige Feldauswahl speichert nichts. Annahme speichert nur Entwuerfe;
Plan/Apply benoetigen getrennte Pruefung/Autorisierung.
Kein IPAM-/Failover-Nachweis.

<a id="credentials"></a>

## Zugangsdaten

Geschuetzte Provisionierungs-/Node-/API-Bindungen; HA benoetigt beide Nodes.
Niemals Passwoerter, SSH-Schluessel oder API-Secrets anfordern oder offenlegen.

<a id="sources"></a>

## Quellen

Lokale Konnektivitaet/Policy per Fingerprint binden.
PR #55, `d7633e2/1fb8f0c` implementierten HA;
#32 OPNsense, #51 VPN/Policy.
Implementierung ist keine echte Failover-Qualifikation.
