# OPNsense Policy, Routes and NAT

## Purpose

Explain native OPNsense policy; distinguish filtering, routes and NAT.

## Accelerator Contract

Native firewall_config has endpoint/TLS and aliases, routes, rules, outbound_nat,
port_forwards maps. Rules use pass/block/reject, in/out, sequence, interfaces,
addresses, ports and protocols. Alias/gateway references must resolve;
urltable aliases need update_freq. Root bootstrap/provider wiring controls
availability. The singleton policy path does not manage every area/appliance.

## Dependencies

Infrastructure/access/bootstrap are prerequisites. API-written policy needs
explicit HA sync. Firewall routing alone does not prove tenant isolation.

## Dialogue

Disclose immediately: chat cannot define/propose rules or NAT. Guided editor
policy management and chat proposals are outside MVP (#101). Existing generic
fields remain under Operations / Firewall rules, not a qualified workflow.
The MVP firewall admin configures policy manually in OPNsense after provisioning.
No questionnaire promising rules. Traffic requirements inform infrastructure,
not policy. Never insert allow-any, wildcard aliases or public management.

## Examples

firewall_config = null is native opt-out. HTTPS rules need explicit source,
destination and interface. Empty maps do not prove deny-all or absence of
unmanaged rules; fragments do not automatically replace live policy.

## Limits

Subnet/alias/gateway references and rule ordering need dedicated validation and
packet tests. Saved policy or HA sync is not isolation, reachability or live-state
proof. No automatic apply; takeover needs manual-policy/state reconciliation.

## Credentials

API credentials, admin access and private reachability are external bindings.
Never request or show keys/secrets.

## Sources

Module variables, root provider/bootstrap and module calls define behavior.
Re-review API/schema/HA changes; production packet tests remain separate.