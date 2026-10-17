<a id="opnsense-policy-routes-and-nat"></a>

# OPNsense-Policy, Routen und NAT

[English](firewall-policy.md) | [Deutsch](firewall-policy.de.md)

Deutsche Lesefassung. Der Assistant liest ausschliesslich die englische Quelle.

<a id="purpose"></a>

## Zweck

Native OPNsense-Policy erklaeren; Filterung, Routen und NAT unterscheiden.

<a id="accelerator-contract"></a>

## Accelerator-Vertrag

Natives `firewall_config` enthaelt Endpoint/TLS und Maps fuer `aliases`,
`routes`, `rules`, `outbound_nat`, `port_forwards`.
Regeln verwenden `pass/block/reject`, `in/out`, Reihenfolge, Interfaces,
Adressen, Ports und Protokolle. Alias-/Gateway-Referenzen muessen aufloesbar
sein; `urltable`-Aliases benoetigen `update_freq`.
Root-Bootstrap-/Provider-Verdrahtung steuert Verfuegbarkeit.
Der Singleton-Policy-Pfad verwaltet nicht jede Area/Appliance.

<a id="dependencies"></a>

## Abhaengigkeiten

Infrastruktur/Zugriff/Bootstrap sind Voraussetzungen.
Per API geschriebene Policy benoetigt expliziten HA-Sync.
Firewall-Routing allein beweist keine Tenant-Isolation.

<a id="dialogue"></a>

## Dialog

Sofort offenlegen: Der Chat kann keine Regeln oder NAT definieren/vorschlagen.
Gefuehrte Editor-Policy-Verwaltung und Chat-Vorschlaege liegen ausserhalb
des MVP (#101). Bestehende generische Felder bleiben unter
Operations / Firewall rules, nicht als qualifizierter Ablauf.
Der MVP-Firewall-Administrator konfiguriert Policy nach Provisionierung
manuell in OPNsense. Kein Fragebogen, der Regeln verspricht.
Traffic-Anforderungen informieren Infrastruktur, nicht Policy.
Niemals Allow-Any, Wildcard-Aliases oder oeffentliches Management einfuegen.

<a id="examples"></a>

## Beispiele

`firewall_config = null` ist native Deaktivierung.
HTTPS-Regeln benoetigen explizite Quelle, Ziel und Interface.
Leere Maps beweisen weder Deny-All noch das Fehlen unverwalteter Regeln;
Fragmente ersetzen nicht automatisch echte Policy.

<a id="limits"></a>

## Grenzen

Subnetz-/Alias-/Gateway-Referenzen und Regelreihenfolge benoetigen dedizierte
Validierung und Pakettests. Gespeicherte Policy oder HA-Sync beweisen weder
Isolation noch Erreichbarkeit oder echten Zustand.
Kein automatischer Apply; Uebernahme benoetigt Abgleich manueller Policy und
State.

<a id="credentials"></a>

## Zugangsdaten

API-Zugangsdaten, Admin-Zugang und private Erreichbarkeit sind externe Bindungen.
Niemals Schluessel/Secrets anfordern oder anzeigen.

<a id="sources"></a>

## Quellen

Modulvariablen, Root-Provider/-Bootstrap und Modulaufrufe bestimmen Verhalten.
API-/Schema-/HA-Aenderungen erneut pruefen; produktive Pakettests bleiben
getrennt.
