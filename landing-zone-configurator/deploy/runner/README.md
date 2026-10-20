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

## Optional one-shot warm pool

The warm pool is default-off (`LZC_RUNNER_POOL_SIZE=0`; the planned operator
setting accepts 0..4). A warm Runner keeps an idle Node process in the same CF
container, with only immutable packaged assets available. It creates no job
credentials, configuration or workspace before assignment. There is no shared
mutable workspace or reuse between jobs.

Pool bootstrap requires both `LZC_POOL_RUNNER_ID` (UUID) and `LZC_POOL_TICKET`
(43-character base64url opaque bootstrap token), plus the existing trusted
`LZC_BROKER_ORIGIN`. Pool mode rejects `LZC_RUN_ID`, `LZC_RUN_TICKET` and local
Runner mode. The bootstrap ticket authenticates only
`POST /api/internal/runner-pool/{id}/claim`; it is not a job ticket.
Only an unassigned `204` repeats, approximately once per second. A strict `200`
assignment supplies one job ID, job ticket and platform/application broker
profile, never a new origin, source or package root. Requests (including body
reads) time out after at most 10 seconds; redirects, malformed assignments,
authorization/conflict errors and network failures terminate without retrying,
because a lost response might already have consumed the assignment.

Idle Runners expire after 15 minutes and cancel idle polling/sleep on SIGTERM or
SIGINT. After one assignment the process invokes the existing worker once and
exits, including job or result-callback failure; it never accepts a second job.
Cold and local `main.js` entry behavior remains unchanged when pool bootstrap
variables are absent. These bootstrap semantics do not deploy infrastructure:
API/CF lifecycle integration and hosted qualification are separate operator
work, and no cloud deployment is authorized by enabling this source capability.

The worker omits the 993,525,760-byte image from non-firewall working directories.
Firewall Plan and saved-plan Apply verify the packaged regular, non-symlink file
against its pinned SHA-256 and retain `firewall-image.qcow2` at the original
relative path. Source materialization requests filesystem reflinks, falling back
to an independent copy when unavailable; it never hardlinks mutable job files.
This does not eliminate image hashing or the platform's per-job droplet copy.

Packaging expands the pinned provider archives once into the filesystem mirror's
unpacked layout, removes the archives and makes the mirror read-only. It then
proves offline init/validate against the unchanged lockfiles with
`-lockfile=readonly`. Each job can symlink these providers instead of extracting
them again. No direct registry/network fallback is configured; a missing or
checksum-mismatched provider still fails initialization.
The existing package qualification runs this real-mirror regression alongside
the verified-image worker tests, against the complete packaged Runner.

Local Linux measurements with OpenTofu **1.12.6** and all eight pinned providers
used three fresh working directories per mirror layout for offline
`init -backend=false -input=false -lockfile=readonly`. The filesystem cache was
warm and was not flushed; source copying and mirror preparation were outside
the timer, and other checks ran concurrently. Median init time was **2.391 s**
for packed archives versus **0.286 s** for the unpacked mirror. All eight provider
directories became symlinks; init-created regular-file content decreased from
383,566,252 to 1,745 bytes, with unchanged source lockfile bytes.
The tradeoff is **263,440,768 additional logical bytes** in the expanded mirror
(120,125,808 → 383,566,576 bytes).
These are local warm-cache, backend-disabled offline-init observations only:
they do not measure hosted cold starts or show that a minute-long hosted startup
delay is fixed. Droplet setup/copying, firewall image hashing, independent image
copies where reflinks are unavailable, provider checksum work and backend
initialization remain separate costs requiring hosted measurements.

Authenticated Runner output includes fixed-label startup phase durations and
cumulative elapsed milliseconds from a monotonic clock. These are observations,
not progress percentages or evidence of a measured hosted speedup.
Firewall administration, when supplied for firewall infrastructure, is strictly
validated and delivered only through child-process
`TF_VAR_firewall_admin_username` / `TF_VAR_firewall_admin_password`.
Neither value is added to public tfvars, hashes or command arguments, and both
are redacted from output, including failed commands. Apply consumes the exact
reviewed saved plan without replanning; application jobs reject these capabilities.
