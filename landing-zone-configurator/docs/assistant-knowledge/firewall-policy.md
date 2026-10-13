# OPNsense Policy, Routes and NAT

## Purpose

Implement explicitly approved traffic policy on an existing supported firewall;
separate filtering rules, routing, outbound NAT and internet port forwarding.

## Accelerator Contract

Native firewall_config contains endpoint/TLS configuration and maps for aliases,
routes, rules, outbound_nat and port_forwards. Rule action supports pass/block/
reject, direction in/out; sequences, interfaces, address/port/protocol fields
control evaluation. Alias and gateway references must resolve to real supported
objects. urltable aliases require update_freq. Root bootstrap/provider wiring
determines policy availability. Multi-area/regional infrastructure does not
prove that the current singleton policy/bootstrap path manages every appliance.

## Dependencies

Firewall infrastructure and access/bootstrap knowledge. HA sync must follow the
implemented path; API-written policy does not independently replicate itself.
Routing to a firewall is not a complete tenant-isolation policy.

## Dialogue

Ask about allowed source/destination flows, direction, ports, required ingress,
egress/NAT and deny/logging intent. "Later a firewall" is not a rule request.
Explain internet exposure before recommending port forwards. Never silently
insert allow-any, wildcard aliases, public management access or inferred vendors.

## Examples

Synthetic opt-out: firewall_config = null. A requested HTTPS flow needs explicit
source, destination and interface selection before a native rules entry.
Empty maps do not prove the existing appliance is deny-all or has no unmanaged
rules; fragments are not automatic replacements of live policy.

## Limits

Current chat cannot patch the complex policy object. Cross-feature subnet,
alias/gateway references and effective rule ordering need dedicated validation
and packet tests. A saved policy or HA sync trigger is not evidence of isolation,
reachability or current cloud/appliance state. No automatic apply.

## Credentials

OPNsense API credentials, admin access and private reachability are external
bindings. Never request API key/secret values or copy them into policy examples.

## Sources

Firewall-config variables, root provider/bootstrap and module calls define
effective behavior. Re-review API/schema/HA changes before regenerating this
local draft; production traffic tests remain separate qualification.