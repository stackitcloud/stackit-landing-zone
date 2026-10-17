# MVP scope and limits

[English](mvp-scope.md) | [Deutsch](mvp-scope.de.md)

The MVP connects the independently usable Accelerator to a tenant-aware editor,
reviewed Assistant proposals and explicitly authorized execution. It does not
turn a configuration draft into an autonomous deployment agent.

## Included implementation

- STACKIT OIDC login, tenant membership and separate technical execution grants.
- Shared native editor/compiler contracts, import/export and preservation of
  existing resource identities.
- Platform drafts, project template drafts, immutable publication and separate
  Application instances.
- Reviewed, revision-bound Assistant proposals; curated service knowledge,
  deterministic validation and real-model regression qualification.
- Separate preparation, Plan and Apply; isolated pinned Runners, progress output,
  encrypted artifacts and state/recovery handling.
- Automatic source validation and manually initiated operator provisioning and
  application release workflows.

Implementation, automated tests, a successful cloud operation and production
acceptance are different evidence. No list here certifies every possible
customer configuration or network topology.

## Deliberate boundaries

- **Production is deferred.** No production environment is created as part of
  the MVP source merge. Production needs its own identity, network, backup,
  recovery, observability, capacity and operational acceptance.
- **Firewall policy is post-MVP** ([#101](https://github.com/stackitcloud/stackit-landing-zone/issues/101)).
  Appliance/HA proposals are supported, but guided policy/NAT/route management
  is not. The firewall administrator maintains policy in OPNsense.
- **Private execution paths need separate qualification**
  ([#37](https://github.com/stackitcloud/stackit-landing-zone/issues/37)).
  A hosted Runner does not automatically reach private firewall, Kubernetes or
  Helm endpoints in customer networks.
- **DNS roles are not visibility controls.** Primary and Secondary are native
  authoritative roles; the Secondary server configuration is not complete.
- **Managed Private DNS Resolver integration is deferred**
  ([#100](https://github.com/stackitcloud/stackit-landing-zone/issues/100)).
  Existing zone/area DNS settings do not implement that separate product.
- **Cloud facts remain external.** Availability, entitlement, throughput, usable
  networks and effective permissions require current authoritative verification.
- **Assistant qualification is bounded.** Passing synthetic scenarios does not
  prove universal factual correctness. Every failed repetition remains blocking;
  changing the qualified source requires new evidence.

Open work is tracked in [GitHub issues](https://github.com/stackitcloud/stackit-landing-zone/issues),
not in dated public handoff or acceptance ledgers. See the
[user guide](user-guide.md), [architecture](architecture.md) and
[development map](development.md).
