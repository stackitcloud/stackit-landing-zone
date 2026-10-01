# STACKIT VPN: Umfang des geführten Editors

Stand: 2026-10-01. Der Assistent beschreibt den vom Accelerator unterstützten Vertrag, keine vollständige Nachbildung des STACKIT Portals.

## Bedienung

1. Gateway: Anzeigename, Leistungsplan und Verfügbarkeitszonen der beiden Tunnel.
2. Routing: Route-based mit statischen Routen oder Policy-based mit lokalen/entfernten Netzen. BGP ist im aktuellen Modul nicht unterstützt.
3. Verbindungen: stabile Verbindungskennung, Gegenstellenadressen für zwei Tunnel, optional erweiterte Peering-/IPsec-Einstellungen.
4. Zusammenfassung: erzeugte STACKIT-Ressourcen und verbleibende Arbeiten an der Gegenstelle.

Navigation, Öffnen und Schließen verändern keine Konfiguration. Änderungen an einem Feld erhalten alle übrigen Werte, insbesondere Tunnel- und Routing-Einstellungen. Ein Wechsel des Routingverfahrens löscht bestehende Felder nicht; abweichende Routingfelder bleiben unter den weiteren Einstellungen zugänglich. Der Assistent ist keine semantische VPN-Verbindungsprüfung. Produktkataloge für Pläne und Verfügbarkeitszonen werden noch nicht abgefragt; dafür wird keine vermeintlich vollständige statische Auswahl vorgetäuscht.

## Bestätigte Accelerator-Grenze: identisches VPN pro SNA

Die [VPN-Ressourcen](../../src/modules/connectivity/7-vpn.tf) erzeugen ein Gateway für **jeden** Eintrag von `var.network_areas`. Die Verbindungen werden über das kartesische Produkt der SNA-Schlüssel und der VPN-Verbindungsschlüssel erzeugt. Jede SNA erhält damit dieselben Gateway-Einstellungen und alle konfigurierten Verbindungen. `connectivity.vpn` enthält keinen `network_area_key` und keine Auswahl einzelner SNAs; dasselbe gilt innerhalb einer regionalen Connectivity-Konfiguration.

Der Editor macht diese Vervielfachung sichtbar und bietet keinen irreführenden SNA-Auswahlschalter an. Für eine spätere gezielte Zuordnung muss zuerst der Accelerator-Vertrag erweitert werden. Das ist unabhängig von automatischem Inter-Region-Routing und von Firewall-Policy-Automation.

## Zugangsdaten und Ausführung

Der [Root-Vertrag](../../src/variables.tf) hält Pre-Shared Keys getrennt unter `vpn_pre_shared_keys`; [das Modul](../../src/modules/connectivity/7-vpn.tf) liest pro Verbindungskennung zwei Schlüssel. Die Schlüssel werden nicht in den Topologieeditor oder die committierbare Konfiguration aufgenommen. Die geschützte Schlüsselanbindung ist noch offen.

Der gemeinsame Editor kann diese Konfiguration speichern und exportieren. VPN-Deployments über diesen Editor sind weiterhin gesperrt. Ein späterer Deployment-Flow muss Schlüsselreferenzen, Routing-Plausibilität, verfügbare Produktparameter und die Auswirkungen der Vervielfachung pro SNA prüfen. Selbst nach einem erfolgreichen STACKIT-Deployment müssen das entfernte VPN-Gerät eingerichtet und die Verbindung geprüft werden. Ein Gateway ohne konfigurierte Verbindungen ist noch kein funktionsfähiges VPN.

## Dokumentationsanschluss

Der Assistent verlinkt die [STACKIT VPN-Dokumentation](https://docs.stackit.cloud/products/network/connectivity-hybrid-multi-cloud/vpn/), die [Gateway-/Verbindungsoptionen](https://docs.stackit.cloud/products/network/connectivity-hybrid-multi-cloud/vpn/basics/gateway-and-connection-options/) und die [Verbindungsanlage](https://docs.stackit.cloud/products/network/connectivity-hybrid-multi-cloud/vpn/getting-started/connection-create/). Fachliche Reihenfolge und Begriffe folgen Gateway → Routing → Verbindung → Tunnel. Eine Gleichheit mit dem jeweils aktuellen Portal wird nicht behauptet.


Die fehlende selektive SNA-Zuordnung wurde nach Abgleich mit aktuellem `main` und
bestehenden Issues als [#85](https://github.com/stackitcloud/stackit-landing-zone/issues/85) erfasst.
