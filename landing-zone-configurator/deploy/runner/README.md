# Pinned Accelerator for customer Plans

[English](README.md) | [Deutsch](README.de.md)

<a id="gepinnter-accelerator-für-kunden-pläne"></a>

Source: `stackitcloud/stackit-landing-zone`, commit
`a256f6896d11134fdc351786f1be5eba4e56b2e2` (the same version as preparations).
Engine: OpenTofu **1.12.6**. `accelerator.lock.hcl` was generated from a clean
`git archive` of this commit using `tofu init -backend=false` and
`tofu providers lock -platform=linux_amd64 -platform=darwin_arm64`.
The source commit contains no checked-in root lockfile. The Configurator
therefore owns a separate lock for exactly this code version; the original Accelerator
is not modified. Provider updates require new joint qualification.

In the later build, the file is copied into the isolated Accelerator package as
`src/.terraform.lock.hcl`. Subsequently use only `tofu init -lockfile=readonly`.
Linux checksums are recorded. The release pipeline checks init/validate and
CF isolation before acceptance; the acceptance document records the current status.
The opnsense provider was offered by the registry download without a GPG signature;
checksums are pinned, but this is not proof of that provider's signature.

`package.sh` builds a separate binary package with Node, OpenTofu and
a provider mirror; `manifest.yml` stages a task-only CF template without bindings.
The final image buildpack is pinned to the approved release commit through
`LZC_IMAGE_BUILDPACK`; the protected pipeline supplies the Runner variables file.
Hosted archives contain the qualified image SHA instead of the large QCOW2 file.
During staging, it is downloaded from STACKIT Object Storage, SHA-verified and
moved into the droplet at the original path without an additional file copy.
The immutable CF droplet is the durable cache; a redundant large
buildpack cache archive is avoided.
CI checks byte-identical restoration and unchanged package identity.
Local archives remain complete. There is no download per user or Plan.
Details and limits: [CF staging and cache](../cloud-foundry/README.md#image-staging-and-caching).
The dispatcher copies its droplet into a new app per job. Direct
OpenTofu steps are in `run-plan.sh`. Process and approval boundaries: [Plan execution](../../docs/plan-execution.md).
