# Site-to-Site VPN

## Purpose

Connect explicitly requested external networks to the platform through supported
site-to-site VPN gateways and tunnels. VPN is not required for project-to-project
communication inside an SNA and must not be introduced into an SNA-first task.

## Accelerator Contract

Native connectivity.vpn and supported connectivity_regions entries carry the
gateway, plan, routing type, connections, tunnel peers, routes/subnets and
IKE/IPsec settings defined by the root schema. vpn_pre_shared_keys is a separate
protected input. Use actual gateway/connection/tunnel keys; do not flatten the
contract or invent arbitrary VPN appliances. Regional root calls exist, but
service availability and plan compatibility still need authorized live checks.

## Dependencies

SNA routing, confirmed non-overlapping local/remote networks, reachable peers
and separate credential bindings. Public PIM product facts are not proof of
availability for the target project or region. A billing SKU is not a plan ID.

## Dialogue

First confirm that external connectivity is needed now. Ask about site count,
peer capability, required throughput/connections, local/remote networks and
availability. Use labels and business requirements, not requests for plan IDs.
Match live PIM attributes to authorized plan options when selecting; unavailable
eu02 data must not be substituted with eu01. Never ask for PSKs or private keys.

## Examples

Synthetic intent: one approved external site, two tunnels if the confirmed
connection contract calls for them, explicit peer subnets. connectivity.vpn =
null disables that optional configuration. This field fragment is not a full
gateway proposal and never contains a preshared key.

## Limits

Native Editor proposals support reviewed public VPN settings, not credentials.
Acceptance changes only the draft. Do not
assume compatible encryption, peer routes, performance or failover from a plan
name. Plans, quotas and tunnel state are live facts. Configuration does not
prove packets traverse the connection; routing and overlap checks are separate.

## Credentials

Provider access and tunnel PSKs use separate externally supplied bindings.
Never request or export PSK values through the model. Key rotation and gateway
creation need explicit authorized execution, not a conversational recommendation.

## Sources

Root variables, connectivity wiring and VPN implementation are manifest sources.
Re-review regional/plan/tunnel contract changes before regeneration. Live
catalogues/PIM remain separately fetched facts, not a frozen Markdown SKU list.