# Platform Kubernetes, KMS and Bastion

## Purpose

Create shared STACKIT Kubernetes infrastructure with deliberate networking,
node pools and supported optional DNS, monitoring, encrypted storage and debug
access. These are separate choices, not implicit parts of an SNA request.

## Accelerator Contract

Native platform_kubernetes is a keyed map. Entries define region, cluster
(name/version/node_pools/maintenance), network, dns, observability,
encrypted_volumes, debug_bastion and role_assignments. Network settings include
sna_enabled, network_area_key and prefix; root resolves native area references
or an explicitly bound external area. Regional module calls select eu01/eu02.
KMS-backed storage-class configuration differs from enabling all-volume
encryption. Debug bastion is a separate VM/SSH access feature. Protected
platform_kubernetes_kube_config_override is not normal chat configuration.

## Dependencies

SNA/region for corporate mode, governance/platform ownership and credential
foundations. DNS and observability are independent nested options. KMS needs
rights and compatible storage; namespaces consume the supported cluster/provider
path. Public mode is not private reachability by assumption.

## Dialogue

Ask about workload scale, private/public connectivity, node-pool/system workload
roles, availability, maintenance, storage encryption and operational access.
Use live versions/machines/zones/volumes, not static default SKUs. Never create
a bastion, expose SSH to all networks or enable demos merely to "test SNA".

## Examples

Synthetic opt-out: platform_kubernetes = {}. An enabled entry needs confirmed
cluster/node-pool settings; a /24 network prefix or key default is not enough
to promise 100 workloads, cluster quotas or per-namespace isolation.

## Limits

Native Editor proposals support reviewed public cluster/KMS/bastion settings,
not credentials or deployment. Validate region,
prefix bounds, node min/max, system pools and area references. Template defaults
may contain region-specific zones. In-cluster connectivity, provider access,
KMS use and node health need separate real execution qualification.

## Credentials

Provider/KMS rights, Kubernetes access and bastion SSH are distinct secure
bindings. Never request kubeconfig contents, private SSH keys or KMS secret
material; externally supplied overrides must work with the native contract.

## Sources

Root calls, cluster/bastion variables, providers and shared validation define
the reviewed scope. Re-review DNS/region/provider and encryption changes before
generation; Markdown does not certify private-cluster execution.