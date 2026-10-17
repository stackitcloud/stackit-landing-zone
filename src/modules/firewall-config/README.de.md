# firewall-config

[English](README.md) | [Deutsch](README.de.md)

Überträgt Firewallregeln, NAT und internetseitige Härtung über die API an eine
OPNsense-Appliance mithilfe des Providers
[`browningluke/opnsense`](https://registry.terraform.io/providers/browningluke/opnsense/latest/docs).

Die Appliance selbst wird vom Modul `connectivity` bereitgestellt (`connectivity.firewall`);
dieses Modul konfiguriert sie nur. Binden Sie es über die Root-Variable `firewall_config`
ein, statt es direkt aufzurufen – siehe `src/config/hub-and-spoke-firewall.tfvars`.

<a id="what-it-manages"></a>
## Verwaltete Bestandteile

- **Aliase** — benannte Netzwerk-, Host-, Port- oder FQDN-Gruppen, die Regeln und NAT-Einträge referenzieren.
- **Statische Routen** — teilen der Appliance mit, welche Präfixe hinter welchem Gateway liegen.
- **Filterregeln** — pass, block oder reject, pro Schnittstelle oder als Floating-Regel.
- **Outbound NAT** — ausgehender Verkehr der Landing Zones hinter der öffentlichen Adresse der Firewall.
- **Portweiterleitungen** — eingehende Freigaben aus dem Internet mit Schutzprüfung (siehe unten).

Das Modul enthält keine eigene Richtlinie. Jede Regel kommt vom Aufrufer, sodass
die wirksame Konfiguration immer an einer Stelle lesbar ist, statt auf tfvars und
Modulinterna verteilt zu sein.

<a id="rule-ordering"></a>
## Regelreihenfolge

Alles hier Geschriebene landet im *Automation*-Regelsatz von OPNsense, der vor den
unter **Firewall → Rules** konfigurierten Regeln ausgewertet wird. Die vollständige Reihenfolge:

1. Systemregeln (Anti-Lockout, DHCP, Loopback)
2. Automatisierte **und** manuelle Floating-Regeln — Priorität `200000`
3. Automatisierte **und** manuelle Schnittstellen*gruppen*regeln — `300000`
4. **Automatisierte** Regeln einzelner Schnittstellen — `400000`
5. **Manuelle** Regeln einzelner Schnittstellen

Zwei Folgen für diese Topologie:

- Die `Default allow LAN to any rule` des Images ist eine manuelle Schnittstellenregel
  und steht daher in Schritt 5. Eine hier auf `lan` geschriebene `block`-Regel wird
  zuerst erreicht und gewinnt. Dadurch ist eine Default-Deny-Richtlinie auf der
  LAN-Seite möglich, ohne das Image anzupassen.
- Innerhalb eines Schritts gewinnt die niedrigste `sequence`. Regeln haben standardmäßig
  `quick = true`, sodass der erste Treffer entscheidet. Lassen Sie Lücken zwischen Sequenznummern.

`interfaces = []` erzeugt eine Floating-Regel (Schritt 2), die einzige Möglichkeit,
einer bereits im Image enthaltenen Floating-Regel zuvorzukommen.

<a id="routes"></a>
## Routen

Beide Appliance-Schnittstellen sind DHCP-Clients in einem `/28`; OPNsense kennt
anfangs daher nur diese beiden Präfixe und eine Standardroute über WAN. Die Landing
Zones liegen weiter innerhalb der Network Area und sind über das LAN-Gateway
erreichbar, was ausdrücklich angegeben werden muss:

```hcl
routes = {
  network-area-via-lan = {
    network = "10.0.0.0/16"
    gateway = "LAN_DHCP"
  }
}
```

Ohne diese Route verlässt Verkehr zu Spokes die Appliance über WAN und tritt von
außen wieder in die Network Area ein. Er erreicht die Spokes weiterhin, da die
WAN-Routingtabelle Systemrouten enthält. Allerdings wird dadurch auch
Landing-Zone-zu-Landing-Zone-Verkehr über die WAN-Schnittstelle geführt, wo die
Egress-NAT-Regel die Quelladresse umschreibt. Der empfangende Spoke sieht dann die
Firewall statt des sendenden Spokes; quellbasierte Regeln verlieren ihre Aussagekraft.

`gateway` muss ein bereits auf der Appliance vorhandenes Gateway benennen. Das
STACKIT-Image enthält `LAN_DHCP` und `WAN_DHCP`, wobei `WAN_DHCP` als Standard markiert ist.

<a id="domain-based-rules"></a>
## Domainbasierte Regeln

Ein Alias mit `type = "host"` akzeptiert FQDNs, die die Appliance zeitgesteuert erneut
auflöst. Eine darauf verweisende Regel folgt daher Adressänderungen.
`type = "urltable"` lädt stattdessen eine Präfixliste von einer URL und benötigt
`update_freq` in Tagen.

Dies bleibt Paketfilterung anhand aufgelöster Adressen, keine namensbasierte Filterung.
Ein Client, der denselben Namen zu einer der Appliance noch unbekannten Adresse
auflöst, wird blockiert. Alles andere, das eine bereits aufgelöste Adresse teilt,
wird durchgelassen. Für eine harte Garantie verwenden Sie einen Mirror mit stabiler
Adresse oder schalten Sie einen Proxy in den Pfad.

<a id="closing-the-web-gui-to-the-internet"></a>
## Web-GUI gegenüber dem Internet schließen

Das STACKIT-Image enthält eine **Floating**-Regel namens `Initial webUI Access Rule`,
die TCP/443 von jeder Quelle zur Firewall selbst zulässt. Nach einer einfachen
Bereitstellung antwortet die Web-GUI auf der öffentlichen IP.

Zum Überschreiben sind zwei Regeln erforderlich, beide ebenfalls als Floating-Regeln:
OPNsense wertet Floating-Regeln (Prioritätsgruppe 200000) vor schnittstellengebundenen
Regeln (400000) aus. Eine WAN-gebundene Regel kann deshalb niemals zuerst greifen.
`src/config/hub-and-spoke-firewall.tfvars` enthält das ausgearbeitete Beispiel:

| Sequenz | Regel | Wirkung |
| --- | --- | --- |
| 10 | pass TCP → `(self):443` von einem Management-Alias | erhält den Administrationszugriff |
| 20 | block TCP → `(self):443` von any, floating | schließt die GUI für alle anderen |

An einer echten Appliance überprüft: Eine erlaubte Quelle erhielt `HTTP 200`,
während eine nicht gelistete Internetquelle verworfen wurde.

> [!WARNING]
> Der Management-Alias muss das System, das OpenTofu ausführt, enthalten, bevor die
> Blockregel angewendet wird. Andernfalls trennt das Apply, das die GUI schließt,
> zugleich die für den nächsten Lauf erforderliche Verbindung; die Wiederherstellung
> erfolgt dann über die serielle Konsole.

> [!NOTE]
> Eine Regel „RFC1918 auf WAN blockieren“ ist ein üblicher Härtungsreflex, passt
> jedoch nicht ungeprüft zu dieser Topologie: Die WAN-Schnittstelle der Appliance
> liegt auf einem Network-Area-Präfix (`wan_network_range`), nicht an einer
> Internetgrenze. Eine solche Regel kann legitimen internen Verkehr verwerfen.
> Testen Sie sie vor der Übernahme.

## NAT

OPNsense unterteilt NAT in drei Bereiche. Das Modul deckt die ersten beiden ab:

| OPNsense-GUI | NAT-Richtung | Modulvariable |
| --- | --- | --- |
| Firewall → NAT → Outbound | Quell-NAT | `outbound_nat` |
| Firewall → NAT → Port Forward | Ziel-NAT, also eingehend | `port_forwards` |
| Firewall → NAT → One-to-One | bidirektional 1:1 | nicht verfügbar |

Ohne mindestens einen `outbound_nat`-Eintrag haben die Landing Zones keine
Egress-Identität, da ihre Standardroute an dieser Appliance endet. Übersetzen Sie
auf `wanip`: Die öffentliche STACKIT-IP ist an die WAN-Schnittstellenadresse
gebunden. Jede andere Quelladresse wird daher an der Netzwerkgrenze nicht übersetzt
und erreicht niemals das Internet.

Das Image belässt **Firewall → NAT → Outbound** auf `automatic`; die API kann
diesen Modus nicht ändern. Das muss sie auch nicht: Hier erzeugte Regeln sind
Automatisierungsregeln, die unabhängig vom Modus angewendet werden und vor allen
Einträgen unter `Firewall → NAT` greifen. Die automatisch von der Appliance
erzeugten Regeln decken nur ihre eigenen direkt verbundenen `/28`s ab und
kollidieren daher niemals mit Landing-Zone-Verkehr.

`disable_nat = true` markiert Verkehr als unübersetzt *und beendet dafür die
Outbound-NAT-Verarbeitung*. Ein No-NAT-Eintrag funktioniert daher nur, wenn seine
`sequence` niedriger ist als die des zu übersteuernden Eintrags.

> [!IMPORTANT]
> Eine Portweiterleitung schreibt nur die Zieladresse um. Die GUI bietet an,
> gleichzeitig die passende Filterregel zu erstellen; der Provider hat diese
> Option nicht. Jede Weiterleitung benötigt daher eine eigene Pass-Regel in
> `rules`, die den übersetzten Verkehr auf der WAN-Schnittstelle erlaubt.
> Ohne sie wird das Paket übersetzt und anschließend verworfen.

Jeder Eintrag in `port_forwards` öffnet einen Pfad aus dem Internet. Daher weist
die Root-Variable eine aktivierte Weiterleitung zurück, deren `source_net`
weiterhin `any` ist. Grenzen Sie es ein oder deaktivieren Sie den Eintrag.

NAT-Beschreibungen akzeptieren nur alphanumerische Zeichen, Leerzeichen und Punkte.
Map-Schlüssel in Kebab-Case werden automatisch bereinigt, wenn keine ausdrückliche
`description` angegeben ist.

<a id="reachability"></a>
## Erreichbarkeit

Die API läuft auf der Web-GUI der Appliance an der LAN-Adresse innerhalb der
Network Area. Das System, das OpenTofu ausführt, muss sie von dort erreichen können –
eine Bastion im Hub, eine Landing Zone oder das Site-to-Site-VPN. Ein Runner im
öffentlichen Internet funktioniert nur, solange die GUI noch öffentlich erreichbar
ist; genau das entfernt die Blockregel.

<a id="provider-choice"></a>
## Provider-Auswahl

Der generische Provider
[`Mastercard/restapi`](https://registry.terraform.io/providers/Mastercard/restapi/latest/docs)
kann diese API ebenfalls ansteuern. OPNsense beantwortet Lesezugriffe jedoch in
einer erweiterten Form (jedes Auswahlfeld wird zu einem Optionsobjekt mit
`selected`-Flags), die nie den geschriebenen Daten entspricht. Unterdrückt man die
daraus entstehende permanente Differenz mit `ignore_all_server_changes`, werden
auch Konfigurationsänderungen unterdrückt. Objekte werden dadurch faktisch nur
einmal beschreibbar: Das Ergänzen eines CIDRs zu einem Alias meldet `No changes`,
während die Appliance den alten Inhalt behält.

`browningluke/opnsense` bildet die beiden Formen intern aufeinander ab, sodass
In-place-Updates und Drift-Erkennung funktionieren. Er wird von der Community
gepflegt, und sein Autor rät vom Produktionseinsatz ab. Wird ein nicht abgedeckter
Endpunkt benötigt, bleibt der generische Provider für dieses konkrete Objekt ein
brauchbarer Ausweg.

Der folgende generatorverwaltete technische Block bleibt unverändert auf Englisch;
maßgeblich ist die [kanonische englische Referenz](README.de.md).

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
| ---- | ------- |
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.11 |
| <a name="requirement_opnsense"></a> [opnsense](#requirement\_opnsense) | >= 0.26.0 |

## Providers

| Name | Version |
| ---- | ------- |
| <a name="provider_opnsense"></a> [opnsense](#provider\_opnsense) | >= 0.26.0 |
| <a name="provider_terraform"></a> [terraform](#provider\_terraform) | n/a |

## Modules

No modules.

## Resources

| Name | Type |
| ---- | ---- |
| [opnsense_firewall_alias.this](https://registry.terraform.io/providers/browningluke/opnsense/latest/docs/resources/firewall_alias) | resource |
| [opnsense_firewall_category.this](https://registry.terraform.io/providers/browningluke/opnsense/latest/docs/resources/firewall_category) | resource |
| [opnsense_firewall_filter.this](https://registry.terraform.io/providers/browningluke/opnsense/latest/docs/resources/firewall_filter) | resource |
| [opnsense_firewall_nat.this](https://registry.terraform.io/providers/browningluke/opnsense/latest/docs/resources/firewall_nat) | resource |
| [opnsense_firewall_nat_port_forward.this](https://registry.terraform.io/providers/browningluke/opnsense/latest/docs/resources/firewall_nat_port_forward) | resource |
| [opnsense_route.this](https://registry.terraform.io/providers/browningluke/opnsense/latest/docs/resources/route) | resource |
| [terraform_data.ha_sync](https://registry.terraform.io/providers/hashicorp/terraform/latest/docs/resources/data) | resource |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| <a name="input_admin_password"></a> [admin\_password](#input\_admin\_password) | Password of admin\_username, used by the HA sync trigger. Defaults to the password baked into the STACKIT OPNsense image. Only used when ha\_sync is set. | `string` | `"STACKIT123!"` | no |
| <a name="input_admin_username"></a> [admin\_username](#input\_admin\_username) | Appliance login used by the HA sync trigger. Only used when ha\_sync is set. | `string` | `"root"` | no |
| <a name="input_aliases"></a> [aliases](#input\_aliases) | Firewall aliases keyed by alias name. Reference an alias from a rule, route or NAT entry by using its key wherever a network is expected. type = "host" also accepts FQDNs, which the appliance re-resolves periodically. | <pre>map(object({<br/>    type        = optional(string, "network")<br/>    enabled     = optional(bool, true)<br/>    description = optional(string, null)<br/>    content     = optional(list(string), [])<br/>    update_freq = optional(number, null)<br/>    stats       = optional(bool, false)<br/>  }))</pre> | `{}` | no |
| <a name="input_category_name"></a> [category\_name](#input\_category\_name) | OPNsense category every object created by this module is tagged with, so managed objects are recognisable in the GUI. | `string` | `"landing-zone"` | no |
| <a name="input_endpoint"></a> [endpoint](#input\_endpoint) | Base URL of the OPNsense API on the primary node, e.g. https://10.0.2.4. Only used by the HA sync trigger; the provider itself is configured in the root module. | `string` | `null` | no |
| <a name="input_ha_sync"></a> [ha\_sync](#input\_ha\_sync) | Push this policy to the HA peer after every change (POST /api/core/hasync\_status/restart\_all on the primary). Required for the active/passive CARP pair: OPNsense's own config sync never fires on API writes, so without it the backup runs an empty ruleset. Enabled automatically when connectivity.firewall.ha is set. | `bool` | `false` | no |
| <a name="input_outbound_nat"></a> [outbound\_nat](#input\_outbound\_nat) | Additional outbound NAT rules keyed by name. target\_ip accepts an address, an alias, or <int>ip such as wanip. | <pre>map(object({<br/>    sequence        = optional(number, 200)<br/>    enabled         = optional(bool, true)<br/>    interface       = optional(string, "wan")<br/>    protocol        = optional(string, "any")<br/>    ip_protocol     = optional(string, "inet")<br/>    source_net      = optional(string, "any")<br/>    destination_net = optional(string, "any")<br/>    target_ip       = optional(string, "wanip")<br/>    disable_nat     = optional(bool, false)<br/>    log             = optional(bool, false)<br/>    description     = optional(string, null)<br/>  }))</pre> | `{}` | no |
| <a name="input_port_forwards"></a> [port\_forwards](#input\_port\_forwards) | Inbound port forwards from the internet keyed by name. Every entry punches a hole through the WAN, so keep the list short and set source\_net where possible. | <pre>map(object({<br/>    sequence         = optional(number, 100)<br/>    enabled          = optional(bool, true)<br/>    interfaces       = optional(list(string), ["wan"])<br/>    protocol         = optional(string, "TCP")<br/>    ip_protocol      = optional(string, "inet")<br/>    source_net       = optional(string, "any")<br/>    destination_net  = optional(string, "wanip")<br/>    destination_port = string<br/>    target_ip        = string<br/>    target_port      = optional(string, null)<br/>    nat_reflection   = optional(string, "default")<br/>    log              = optional(bool, true)<br/>    description      = optional(string, null)<br/>  }))</pre> | `{}` | no |
| <a name="input_routes"></a> [routes](#input\_routes) | Static routes keyed by name. gateway must name a gateway that exists on the appliance; the STACKIT image ships LAN\_DHCP and WAN\_DHCP. | <pre>map(object({<br/>    enabled     = optional(bool, true)<br/>    network     = string<br/>    gateway     = string<br/>    description = optional(string, null)<br/>  }))</pre> | `{}` | no |
| <a name="input_rules"></a> [rules](#input\_rules) | Firewall filter rules keyed by name. An empty interfaces list creates a floating rule, which OPNsense evaluates before interface-bound rules. | <pre>map(object({<br/>    sequence           = optional(number, 100)<br/>    enabled            = optional(bool, true)<br/>    action             = optional(string, "pass")<br/>    direction          = optional(string, "in")<br/>    interfaces         = optional(list(string), ["lan"])<br/>    protocol           = optional(string, "any")<br/>    ip_protocol        = optional(string, "inet")<br/>    quick              = optional(bool, true)<br/>    source_net         = optional(string, "any")<br/>    source_port        = optional(string, null)<br/>    source_invert      = optional(bool, false)<br/>    destination_net    = optional(string, "any")<br/>    destination_port   = optional(string, null)<br/>    destination_invert = optional(bool, false)<br/>    log                = optional(bool, false)<br/>    description        = optional(string, null)<br/>  }))</pre> | `{}` | no |

## Outputs

| Name | Description |
| ---- | ----------- |
| <a name="output_category"></a> [category](#output\_category) | Name and UUID of the category every object created by this module is tagged with. Filtering on the name in the OPNsense GUI shows exactly what OpenTofu manages and nothing else. |
| <a name="output_managed_objects"></a> [managed\_objects](#output\_managed\_objects) | Names of the objects this module holds on the appliance, by kind. Read from the resources rather than the inputs, so it reflects what was actually pushed. |
| <a name="output_rule_evaluation_order"></a> [rule\_evaluation\_order](#output\_rule\_evaluation\_order) | Filter rules in the order the appliance evaluates them. Every rule defaults to quick, so the first match decides and this is the list to read when a rule does not behave as expected. Derived from the inputs, so it is reviewable in a plan before anything is pushed. |
<!-- END_TF_DOCS -->
