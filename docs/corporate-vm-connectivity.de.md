# Corporate-VM über OPNsense anbinden

[English](corporate-vm-connectivity.md) | [Deutsch](corporate-vm-connectivity.de.md)

Ein erfolgreicher Corporate-Application-Apply erstellt die Projekt-/Netzgrundlage;
er richtet allein noch keine Firewall-Policy für Anwendungen ein. Diese Anleitung
beschreibt IPv4-Internetzugang und optional eingehendes SSH für eine VM im bestehenden
Netz. Sie gilt für eigenständige Accelerator-Deployments und die manuelle Übergabe
an Firewall-Administratoren im Configurator. Verwende die tatsächlich zugewiesenen
Präfixe und Adressen; alle folgenden Adressen sind Dokumentationsbeispiele und keine
Deployment-Standardwerte.

## Zuerst den Verkehrsweg prüfen

```text
VM → STACKIT-Netzgateway → Application-Routing-Tabelle → Firewall-LAN
   → Firewall-WAN → STACKIT-Public-IP-Übersetzung → Internet
```

Prüfe die Zugehörigkeit der VM-NIC zum gewünschten Corporate-Netz, dessen Zuordnung
zur richtigen Routing-Tabelle und die Route `0.0.0.0/0` zur Firewall-LAN-Adresse der
Plattform (bei HA zur CARP-LAN-VIP). Prüfe auch System-/dynamische und spezifischere
Routen: Eine Default-Route beweist allein nicht, dass jeder Datenstrom die Firewall
durchläuft. Der Gast verwendet normalerweise das per DHCP verteilte STACKIT-
Subnetzgateway als Default-Gateway, nicht direkt die Firewall-Adresse. Ersetze es
nicht ungeprüft.

Eine Corporate-Route verhindert nicht, dass ausreichend berechtigte Benutzer Public
IPs oder weitere Netzwerkpfade anlegen. Für eine ausschließliche Firewall-Anbindung
entfernst du eine unnötige Public-IP-Zuordnung der VM nach Prüfung des vorgesehenen
Zugriffswegs, prüfst weitere NICs/Routen und setzt die Projektberechtigungen des
Kunden durch. Die unten beschriebene Abnahme hat die Verhinderung direkten öffentlichen
Zugriffs nicht qualifiziert.

## Rückroute auf der Firewall konfigurieren

OPNsense muss wissen, dass die Application-Präfixe über das LAN-Gateway erreichbar
sind. Lege unter **System → Routes → Configuration** eine Route zum zugewiesenen
Application-Präfix oder einem bewusst gewählten SNA-Aggregat über das Gateway des
LAN-Netzes an (üblicherweise `LAN_DHCP`; tatsächlichen Namen und Adresse auf der
Appliance prüfen). Die Internet-Default-Route bleibt auf WAN. Prüfe die effektive
Route zur VM. Ein zu breites Aggregat darf das WAN-Gateway oder fremde Ziele nicht
über LAN umleiten.

Ohne diese Route kann die Firewall Pakete zu Spokes über WAN senden. Eine
funktionierende Verbindung belegt deshalb allein noch keinen symmetrischen LAN-Pfad.
Siehe den nativen [Firewall-Routenvertrag](../src/modules/firewall-config/README.de.md#routes).

## Erforderlichen ausgehenden Verkehr erlauben

Erlaube unter **Firewall → Rules → LAN** beziehungsweise im passenden Automations-
Regelwerk den vom tatsächlichen Application-Präfix eintreffenden Verkehr zu den
freigegebenen Zielen und Ports. Das direkt angeschlossene **LAN net** ist das
Transitnetz der Firewall, nicht das entfernte Application-Subnetz. Prüfe die
Reihenfolge von Floating-, Gruppen- und Interface-Regeln und aktiviere für die
Diagnose das Logging der betreffenden Regeln.

Erlaube beispielsweise UDP und TCP Port 53 zu den konfigurierten DNS-Resolvern und
TCP Port 443 zu freigegebenen Diensten. Ergänze ICMP nur, wenn Test oder Policy es
benötigen. Eine vorübergehende Allow-All-Regel kann einen Filterfehler eingrenzen;
ersetze sie nach dem Test durch die vorgesehene Kunden-Policy. Ein Pass-Log beweist
nur die Freigabe dieses Pakets, nicht erfolgreiches NAT oder Rückverkehr.

## Ausgehendes Source NAT ergänzen

Im getesteten Deployment enthielt das automatische Outbound NAT keine Regel für
das entfernte Application-Präfix. DNS-Anfragen erreichten die Firewall, aber weder
Namensauflösung noch ein IP-Konnektivitätstest ins Internet funktionierten. Eine
explizite Outbound-NAT-Regel reparierte diesen Pfad. Verlasse dich nicht darauf,
dass automatische Regeln geroutete Application-Netze einschließen.

Öffne für eine manuell in der GUI verwaltete Regel **Firewall → NAT → Outbound**
(in neueren Oberflächen auch **Source NAT**), wähle **Hybrid**, um automatische
Regeln zu erhalten und manuelle ergänzen zu können, speichere und lege Folgendes an:

| Feld | Wert |
| --- | --- |
| Interface | WAN |
| IP-Version / Protokoll | IPv4 / any |
| Quelle | Tatsächliches Application-Subnetz, zum Beispiel `10.42.3.0/24` |
| Quellport | any |
| Ziel / Port | any oder die von der Policy benötigten Ziele |
| Übersetzungsadresse | WAN-Interface-Adresse |
| Static port | Deaktiviert, sofern kein bestimmtes Protokoll es benötigt |

Speichern und anwenden. Die WAN-Adresse der Appliance ist in dieser Topologie privat;
STACKIT übersetzt die zugeordnete Public IP am Netzrand. Verwende weder die Public IP
der VM noch eine beliebige öffentliche Adresse als Übersetzungsziel. Begrenze die
Quelle auf das freigegebene Präfix; benötigte No-NAT-Ausnahmen stehen vor einer
allgemeinen Regel.

GUI-Regeln und vom Provider verwaltete Automationsregeln sind unterschiedliche Wege.
Die nativen Automationsregeln aus `firewall_config.outbound_nat` benötigen keine
Umschaltung des GUI-Modus; siehe die [NAT-Moduldokumentation](../src/modules/firewall-config/README.de.md#nat).
Verwalte dieselbe Policy nicht ohne ausdrückliche Zuständigkeitsregelung an beiden
Stellen. GUI-Modus und Filterregelzuordnung beschreibt das
[offizielle OPNsense-NAT-Handbuch](https://docs.opnsense.org/manual/nat.html).

## DNS getrennt von IP-Konnektivität prüfen

Führe im Gast über SSH oder den Server-Agent lesende Befehle aus:

```sh
ip -4 route
cat /etc/resolv.conf
resolvectl status
getent ahostsv4 example.com
curl -I --connect-timeout 5 https://example.com
```

Nutze ein freigegebenes numerisches Ziel mit `ping -n -c 3 -W 2 <test-ip>`, falls
ICMP erlaubt ist. Ein fehlgeschlagener Ping beweist allein keinen vollständigen
Ausfall der IP-Konnektivität. `127.0.0.53` in `/etc/resolv.conf` ist bei systemd-resolved
normal; prüfe die tatsächlichen Upstream-Resolver mit `resolvectl`. Vergleiche
Firewall-Mitschnitte/Logs auf LAN und WAN: erlaubte Anfrage, übersetzte WAN-Quelle
und zurückkehrende Antwort. STACKIT-Security-Group-Egress und Gast-Firewall sind
unabhängige Prüfpunkte.

## Optional: externes SSH über die Firewall

Die VM benötigt für diesen Weg keine eigene Public IP:

```text
freigegebener Client → öffentliche Firewall-IPv4:2222 → DNAT → private VM-IPv4:22
```

Lege unter **Firewall → NAT → Port Forward / Destination NAT** einen Eintrag an:

| Feld | Wert |
| --- | --- |
| Interface / Version / Protokoll | WAN / IPv4 / TCP |
| Quelle | Freigegebene öffentliche Client-IP/CIDR, zum Beispiel `198.51.100.25/32` |
| Quellport | any |
| Ziel | WAN-Adresse |
| Zielport | `2222` |
| Umleitungsziel | Private VM-Adresse, zum Beispiel `10.42.3.20` |
| Umleitungsport | `22` |

Erstelle oder verknüpfe die passende WAN-Pass-Regel für das **übersetzte** Ziel
(private VM-Adresse, TCP/22), begrenzt auf dieselbe Quelle. Die Beschriftungen hängen
von der OPNsense-Version ab. Das native `firewall_config.port_forwards` benötigt eine
explizite passende Filterregel; der Provider erstellt sie nicht automatisch.

Prüfe die weiteren Ebenen unabhängig:

- Security Group der Firewall-WAN-NIC: eingehend TCP/2222 vom freigegebenen Client.
- Security Group der VM-NIC: eingehend TCP/22 von diesem Client, sofern DNAT dessen
  ursprüngliche Quelle erhält. Die Gruppe muss an der VM hängen; bloßes Anlegen
  reicht nicht. Bei bewusst zusätzlichem Source NAT die tatsächliche Quelle an
  der VM prüfen.
- Gast: SSH-Dienst lauscht, Host-Firewall erlaubt den Zugriff, der gewünschte
  Benutzer existiert und dessen `authorized_keys` enthält den passenden Schlüssel.

Teste von außen gegen die öffentliche Firewall-Adresse:

```sh
ssh -i ~/.ssh/your_application_key -o IdentitiesOnly=yes \
  -o PreferredAuthentications=publickey -p 2222 \
  <existing-user>@<firewall-public-ip>
```

Gehe nicht davon aus, dass ein Ubuntu-Image den Benutzer `ubuntu` besitzt: Bei der
getesteten VM fehlte er. Prüfe `getent passwd <user>` über den Server-Agent und richte
den gewünschten Benutzer/Schlüssel über den freigegebenen Bootstrap-Prozess ein.
Private Schlüssel gehören nicht in Diagnoseausgaben. `Too many authentication failures`
kann durch zu viele unpassende Schlüsselangebote des SSH-Agenten entstehen; eine
explizite Identität vermeidet das. Eine Passwortabfrage nach Schlüsselablehnung
weist auf Benutzer-/Schlüssel-/Authentifizierungskonfiguration im Gast hin, nicht
auf einen defekten TCP-Weiterleitungspfad. Verwende das Firewall-Admin-Passwort
nicht als Gastpasswort.

## Abnahmegrenzen und HA

Der vom Benutzer bestätigte Corporate-Test belegte erfolgreiche Apply-Recovery,
Internet/DNS nach manuellem Outbound NAT und externes SSH nach manuellem DNAT,
Security-Group-Zuordnung und Gastbenutzer-/Schlüsseleinrichtung. HA-Policy-
Synchronisierung, Failover, vollständige Verkehrsführung und die Isolation nicht
freigegebener Clients wurden damit nicht qualifiziert und sind separat zu prüfen.
Eine LAN-CARP-VIP bietet nicht automatisch einen beweglichen öffentlichen WAN-Einstieg.
Verwalte bei HA ausdrücklich die knotenspezifischen Routen, Policy-Synchronisierung
und die für eingehende Zugriffe verwendete öffentliche Adresse; teste jeden
benötigten Ausfallpfad.

Halte gewünschte Routen, Regeln und NAT in der vom Kunden gewählten Konfigurationsquelle
fest. Ein späterer Apply darf nicht unbemerkt mit manuellen Änderungen kollidieren.
Geführte Policy-Bearbeitung und Assistant-Regel-/NAT-Vorschläge bleiben in
[#101](https://github.com/stackitcloud/stackit-landing-zone/issues/101), Policy-Automatisierung
für mehrere Appliances in [#65](https://github.com/stackitcloud/stackit-landing-zone/issues/65) erfasst.
