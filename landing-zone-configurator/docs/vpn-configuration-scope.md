<a id="stackit-vpn-umfang-des-geführten-editors"></a>
# STACKIT VPN: scope of the guided editor

[English](vpn-configuration-scope.md) | [Deutsch](vpn-configuration-scope.de.md)

As of 2026-10-01. The assistant describes the contract supported by the Accelerator, not a complete replica of the STACKIT Portal.

<a id="bedienung"></a>
## Usage

1. Gateway: display name, performance plan and availability zones of both tunnels.
2. Routing: route-based with static routes or policy-based with local/remote networks. BGP is not supported by the current module; [#86](https://github.com/stackitcloud/stackit-landing-zone/issues/86) tracks the extension.
3. Connections: stable connection identifier, peer addresses for two tunnels, optional advanced peering/IPsec settings.
4. Summary: generated STACKIT resources and remaining work on the peer.

Navigation, opening and closing do not change any configuration. Changes to one field preserve all other values, especially tunnel and routing settings. Switching the routing method does not delete existing fields; fields for other routing methods remain accessible under additional settings. The assistant is not a semantic VPN connection check. Product catalogues for plans and availability zones are not yet queried; no supposedly complete static selection is presented instead.

<a id="bestätigte-accelerator-grenze-identisches-vpn-pro-sna"></a>
## Confirmed Accelerator limitation: identical VPN per SNA

The [VPN resources](../../src/modules/connectivity/7-vpn.tf) create a gateway for **every** entry in `var.network_areas`. Connections are created using the Cartesian product of SNA keys and VPN connection keys. Each SNA therefore receives the same gateway settings and all configured connections. `connectivity.vpn` contains no `network_area_key` and no selection of individual SNAs; the same applies within a regional connectivity configuration.

The editor makes this duplication visible and does not offer a misleading SNA selector. Future targeted assignment requires extending the Accelerator contract first. This is independent of automatic inter-region routing and firewall policy automation.

<a id="zugangsdaten-und-ausführung"></a>
## Credentials and execution

The [root contract](../../src/variables.tf) keeps pre-shared keys separately under `vpn_pre_shared_keys`; [the module](../../src/modules/connectivity/7-vpn.tf) reads two keys per connection identifier. Keys are not included in the topology editor or committable configuration. Protected key binding remains open.

The common editor can save and export this configuration. VPN deployments through this editor remain blocked. A future deployment flow must check key references, routing plausibility, available product parameters and the effects of duplication per SNA. Even after a successful STACKIT deployment, the remote VPN device must be configured and the connection tested. A gateway without configured connections is not yet a functioning VPN.

<a id="dokumentationsanschluss"></a>
## Documentation integration

The assistant links to the [STACKIT VPN documentation](https://docs.stackit.cloud/products/network/connectivity-hybrid-multi-cloud/vpn/), [gateway/connection options](https://docs.stackit.cloud/products/network/connectivity-hybrid-multi-cloud/vpn/basics/gateway-and-connection-options/) and [connection creation](https://docs.stackit.cloud/products/network/connectivity-hybrid-multi-cloud/vpn/getting-started/connection-create/). The domain sequence and terminology follow gateway → routing → connection → tunnel. No equivalence with the current portal is claimed.


The missing selective SNA assignment was recorded as [#85](https://github.com/stackitcloud/stackit-landing-zone/issues/85)
after comparison with current `main` and existing issues.
