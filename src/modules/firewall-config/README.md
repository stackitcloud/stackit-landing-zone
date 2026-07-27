# firewall-config

Pushes firewall rules, NAT and internet-facing hardening to an OPNsense appliance through
its API, using the [`browningluke/opnsense`](https://registry.terraform.io/providers/browningluke/opnsense/latest/docs)
provider.

The appliance itself is deployed by the `connectivity` module (`connectivity.firewall`);
this module only configures it. Wire it up through the root `firewall_config` variable
rather than calling it directly — see `src/config/hub-and-spoke-firewall.tfvars`.

## What it manages

- **Aliases** — named network, host, port or FQDN groups referenced from rules and NAT entries.
- **Static routes** — teaches the appliance which prefixes sit behind which gateway.
- **Filter rules** — pass, block or reject, per interface or floating.
- **Outbound NAT** — landing zones egress behind the firewall's public address.
- **Port forwards** — inbound exposure from the internet, guarded (see below).

The module contains no policy of its own. Every rule comes from the caller, so the
effective configuration is always readable in one place instead of being split between
tfvars and module internals.

## Rule ordering

Everything written here lands in OPNsense's *automation* ruleset, which is evaluated
ahead of the rules configured under **Firewall → Rules**. The full order is:

1. system rules (anti-lockout, DHCP, loopback)
2. automation **and** manual floating rules — priority `200000`
3. automation **and** manual interface *group* rules — `300000`
4. **automation** single interface rules — `400000`
5. **manual** single interface rules

Two consequences for this topology:

- The image's `Default allow LAN to any rule` is a manual interface rule, so it sits at
  step 5. A `block` rule written here on `lan` is reached first and wins, which is what
  makes a default-deny policy on the LAN side possible without touching the image.
- Within a step the lowest `sequence` wins, and rules default to `quick = true`, so the
  first match decides. Leave gaps between sequence numbers.

Setting `interfaces = []` produces a floating rule (step 2), the only way to get ahead of
a floating rule that the image already ships.

## Routes

Both appliance interfaces are DHCP clients on a `/28`, so out of the box OPNsense only
knows those two prefixes and a default route through WAN. The landing zones are further
inside the network area and reachable through the LAN gateway, which has to be stated:

```hcl
routes = {
  network-area-via-lan = {
    network = "10.0.0.0/16"
    gateway = "LAN_DHCP"
  }
}
```

Without it, spoke-bound traffic leaves through WAN and re-enters the network area from the
outside. That still reaches the spokes, because the WAN routing table carries system
routes, but it also drags landing-zone-to-landing-zone traffic across the WAN interface
where the egress NAT rule rewrites the source address — so the receiving spoke sees the
firewall instead of the sending spoke, and source based rules stop meaning anything.

`gateway` must name a gateway that already exists on the appliance. The STACKIT image
ships `LAN_DHCP` and `WAN_DHCP`, with `WAN_DHCP` marked as the default.

## Domain based rules

An alias with `type = "host"` accepts FQDNs, and the appliance re-resolves them on a
timer, so a rule pointing at it follows the addresses as they change. `type = "urltable"`
fetches a list of prefixes from a URL instead and requires `update_freq`, in days.

This is still packet filtering against resolved addresses, not name based filtering. A
client that resolves the same name to an address the appliance has not seen yet is
dropped, and anything else sharing an address that *was* resolved is let through. For a
hard guarantee, point at a mirror with a stable address or put a proxy in the path.

## Closing the web GUI to the internet

The STACKIT image ships a **floating** rule named `Initial webUI Access Rule` that passes
TCP/443 from any source to the firewall itself. After a plain deployment the web GUI
answers on the public IP.

Overriding it takes two rules, and both have to be floating as well: OPNsense evaluates
floating rules (priority group 200000) before interface-bound ones (400000), so a rule
attached to WAN never gets the chance to match first. `src/config/hub-and-spoke-firewall.tfvars`
carries the worked example:

| Sequence | Rule | Effect |
| --- | --- | --- |
| 10 | pass TCP → `(self):443` from a management alias | keeps administration working |
| 20 | block TCP → `(self):443` from any, floating | closes the GUI for everyone else |

Verified against a live appliance: an allowed source got `HTTP 200` while an internet
source that was not on the list was dropped.

> [!WARNING]
> The management alias has to contain whatever runs OpenTofu before the block rule is
> applied. Otherwise the apply that closes the GUI also cuts off the connection needed
> for the next run, and recovery goes through the serial console.

> [!NOTE]
> A "block RFC1918 on WAN" rule is a common hardening reflex but does not fit this
> topology unchecked: the appliance's WAN interface sits on a network area prefix
> (`wan_network_range`), not on an internet edge, so such a rule can drop legitimate
> internal traffic. Test it before adopting it.

## NAT

OPNsense splits NAT into three sections. The module covers the first two:

| OPNsense GUI | NAT direction | Module variable |
| --- | --- | --- |
| Firewall → NAT → Outbound | source NAT | `outbound_nat` |
| Firewall → NAT → Port Forward | destination NAT, i.e. inbound | `port_forwards` |
| Firewall → NAT → One-to-One | bidirectional 1:1 | not exposed |

Without at least one `outbound_nat` entry the landing zones have no egress identity,
because their default route ends at this appliance. Translate to `wanip`: the STACKIT
public IP is bound to the WAN interface address, so any other source address is not
translated at the network edge and never reaches the internet.

The image leaves **Firewall → NAT → Outbound** on `automatic`, and the API cannot change
that mode. It does not have to: rules created here are automation rules, which are applied
irrespective of the mode and match ahead of anything under `Firewall → NAT`. The automatic
rules the appliance generates only cover its own directly connected `/28`s, so they never
collide with landing zone traffic.

`disable_nat = true` marks traffic as untranslated *and stops outbound NAT processing for
it*, so a no-NAT entry only works if its `sequence` is lower than the entry it has to beat.

> [!IMPORTANT]
> A port forward only rewrites the destination address. The GUI offers to create the
> matching filter rule alongside it; the provider has no such option, so every forward
> needs its own pass rule in `rules` permitting the translated traffic on the WAN
> interface. Without it the packet is translated and then dropped.

Every entry in `port_forwards` opens a path from the internet, so the root variable
rejects an enabled forward whose `source_net` is still `any`. Narrow it, or disable the
entry.

NAT descriptions accept only alphanumerics, spaces and dots. Kebab-case map keys are
sanitised automatically when no explicit `description` is given.

## Reachability

The API lives on the appliance's web GUI on the LAN address inside the network area.
Whatever runs OpenTofu has to reach it from there — a bastion in the hub, a landing zone,
or the site-to-site VPN. A runner on the public internet only works while the GUI is
still exposed, which is exactly what the block rule removes.

## Provider choice

The generic [`Mastercard/restapi`](https://registry.terraform.io/providers/Mastercard/restapi/latest/docs)
provider also drives this API, but OPNsense answers reads in an expanded form (every
select field becomes an options object with `selected` flags) that never matches what was
written. Suppressing the resulting permanent diff with `ignore_all_server_changes` also
suppresses diffs coming from the configuration, which makes objects write-once — measured:
adding a CIDR to an alias reported `No changes` while the appliance kept the old content.

`browningluke/opnsense` maps the two forms internally, so in-place updates and drift
detection work. It is community maintained and its author advises against production use.
If an endpoint it does not cover is needed, the generic provider remains a viable
escape hatch for that specific object.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
| ---- | ------- |
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.10 |
| <a name="requirement_opnsense"></a> [opnsense](#requirement\_opnsense) | 0.24.0 |

## Providers

| Name | Version |
| ---- | ------- |
| <a name="provider_opnsense"></a> [opnsense](#provider\_opnsense) | 0.24.0 |

## Modules

No modules.

## Resources

| Name | Type |
| ---- | ---- |
| [opnsense_firewall_alias.this](https://registry.terraform.io/providers/browningluke/opnsense/0.24.0/docs/resources/firewall_alias) | resource |
| [opnsense_firewall_category.this](https://registry.terraform.io/providers/browningluke/opnsense/0.24.0/docs/resources/firewall_category) | resource |
| [opnsense_firewall_filter.this](https://registry.terraform.io/providers/browningluke/opnsense/0.24.0/docs/resources/firewall_filter) | resource |
| [opnsense_firewall_nat.this](https://registry.terraform.io/providers/browningluke/opnsense/0.24.0/docs/resources/firewall_nat) | resource |
| [opnsense_firewall_nat_port_forward.this](https://registry.terraform.io/providers/browningluke/opnsense/0.24.0/docs/resources/firewall_nat_port_forward) | resource |
| [opnsense_route.this](https://registry.terraform.io/providers/browningluke/opnsense/0.24.0/docs/resources/route) | resource |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| <a name="input_aliases"></a> [aliases](#input\_aliases) | Firewall aliases keyed by alias name. Reference an alias from a rule, route or NAT entry by using its key wherever a network is expected. type = "host" also accepts FQDNs, which the appliance re-resolves periodically. | <pre>map(object({<br/>    type        = optional(string, "network")<br/>    enabled     = optional(bool, true)<br/>    description = optional(string, null)<br/>    content     = optional(list(string), [])<br/>    update_freq = optional(number, null)<br/>    stats       = optional(bool, false)<br/>  }))</pre> | `{}` | no |
| <a name="input_category_name"></a> [category\_name](#input\_category\_name) | OPNsense category every object created by this module is tagged with, so managed objects are recognisable in the GUI. | `string` | `"landing-zone"` | no |
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
