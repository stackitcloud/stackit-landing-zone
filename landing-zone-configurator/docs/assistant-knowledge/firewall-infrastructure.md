# OPNsense Firewall Infrastructure and HA

## Purpose

Central OPNsense active/passive HA; never implicit for SNA-only.

## Accelerator Contract

connectivity.firewall applies per area; firewalls maps stable area keys.
Native zone/flavor/name, volume class/size, LAN/WAN CIDRs/IPs; ha is an object
requiring a different backup_zone, with optional backup_name/node IPs/lan_vip/vhid.
LAN VIP is the platform next hop. HA uses unicast CARP, pfsync over LAN and XMLRPC.
Post-API policy sync separately replicates aliases/categories/rules/NAT/routes.

## Dependencies

SNA pools, area keys and authorized zones/flavors. Confirm free LAN/WAN subnets;
transfer network is not HA transport. Dependencies never activate services.

## Dialogue

Retain requested HA. Combined requests continue with firewall on complete saved
SNA; never force SNA-first or re-ask HA consent.
Broad setup asks one unresolved traffic/capacity/operations decision even with
HA patches; narrow changes need no questionnaire. Up to three missing native
inputs. Same-subnet traffic is not a routed path. Defaults are not consent;
SNA acceptance never proves whole-apply safety.

## Examples

ha = { backup_zone = "eu01-2" }: synthetic, not availability.
firewall=null disables natively, never via chat.

## Limits

No active/active, automatic public ingress IP failover, throughput/session/SLA
guarantee. Backup has its own WAN public IP; primary stays bound to its NIC.
Central single/map chat patches preserve forms/keys/HA and unrelated values.
Several areas require explicit target selection. New maps cover every area:
ask before enabling additional appliances; no implicit all-area scope.
New appliances require all five mandatory fields together; existing ones accept
partial updates. Validate containment in each affected area, non-overlapping
LAN/WAN/transfer, usable distinct IPs and different zones. Native cidrhost
defaults4/5/6 stay implicit; propose IPs only when saved/user-confirmed.
Project count proves neither free CIDRs nor
flavor capacity. Product choices need saved/user values or authorized catalogues.
No removal, regional conversion/patch, policy, access/bootstrap or execution.
Incomplete field selections save nothing. Acceptance saves only drafts;
Plan/Apply need separate review/authorization. No IPAM/failover proof.

## Credentials

Protected provisioning/node/API bindings; HA needs both nodes.
Never ask for or expose passwords, SSH keys or API secrets.

## Sources

Fingerprint local connectivity/policy. PR #55, d7633e2/1fb8f0c implemented HA;
#32 OPNsense, #51 VPN/policy. Implementation is not live failover qualification.