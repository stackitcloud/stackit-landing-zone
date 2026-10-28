# Platform Kubernetes, KMS and Bastion

## Purpose

Configure shared STACKIT Kubernetes with deliberate networking and node pools.
DNS, monitoring, encrypted storage and debug access are separate choices, not
implicit parts of an SNA request.

## Accelerator Contract

platform_kubernetes is a keyed map. Each entry has region and cluster with
name, kubernetes_version_min, node_pools and maintenance. Pools define name,
machine_type, minimum/maximum, availability_zones and optional system-component,
volume, OS and label settings. network uses sna_enabled, network_area_key,
sna_network_area_id, firewall_next_hop_ip and sna_network_prefix_length; root
resolves native area keys or an explicitly bound external area for eu01/eu02.
dns, observability, encrypted_volumes, debug_bastion and role_assignments are
separate options. KMS-backed storage classes do not encrypt every volume.
Debug bastion is a separate VM/SSH feature. Protected
platform_kubernetes_kube_config_override is not public chat configuration.

## Dependencies

SNA/region for corporate mode, governance/platform ownership and credential
foundations. DNS and observability are independent nested options. KMS needs
rights and compatible storage; namespaces consume the supported cluster/provider
path. Public mode is not private reachability by assumption.

## Dialogue

Ask about scale, connectivity, system/workload pools, availability, maintenance,
encryption and operational access.
Use live versions/machines/zones/volumes, not static default SKUs. Never create
a bastion, expose SSH to all networks or enable demos merely to "test SNA".

## Examples

Synthetic opt-out: platform_kubernetes = {}. Enabled clusters need confirmed
cluster/pool settings; a /24 or key default guarantees neither free addresses,
workload capacity, quotas nor namespace isolation.

## Limits

The Editor supports reviewed public cluster/KMS/bastion drafts, not credentials
or deployment. Validate region, prefixes, pool minimum/maximum, system pools
and area references. Defaults may contain regional zones. Connectivity, provider
access, KMS and node health need separate execution qualification.

## Credentials

Provider/KMS rights, Kubernetes access and bastion SSH need distinct secure
bindings. Never request kubeconfig, private SSH keys or KMS secrets; external
overrides must match the native contract.

## Sources

Root calls, cluster/bastion variables, providers and validation define this
scope. Review DNS, region, provider and encryption changes before generation.
Markdown does not certify private-cluster execution.