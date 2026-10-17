# OpenTofu Runner

[English](README.md) | [Deutsch](README.de.md)

Isolated runtime and run protocol; separate from the API and worker. Pinned engine, providers and Accelerator revision. The implementation language of the small supervisor remains open; a dedicated Go runtime only with a demonstrated benefit.

No backend/Model Serving bindings; only run-specific customer credentials and state access. Demonstrate CF suitability, limits and private connectivity before implementation.

<a id="plattform-plan-und-freigegebener-apply"></a>

## Platform Plan and approved Apply

The worker starts only through its explicit process entrypoint. The importable
supervisor in `app/apps/worker/src/runner.ts` starts no jobs on import.
There is no `AllowApply` environment switch. Only a broker-issued
`platform-apply` job may execute a saved Plan.
The API must first verify explicit approval and bind the artifact to the job,
tenant, configuration hash, Accelerator commit, engine and provider lock.
The worker does not replace this binding or encryption.

`POST /api/runner/input` uses the run-specific bearer ticket. An absent mode
continues to mean `initial-plan-only`; this mode remains backend-free and cannot
apply. `platform-plan` and `platform-apply` use the broker-supplied
backend. `kind:"s3"` is validated by the shared contract:
`{kind:"s3",descriptor:{bucket,endpoint:"https://object.storage.eu01.onstackit.cloud",region:"eu01",key,useLockfile:true},credentials:{accessKeyId,secretAccessKey}}`.
Before `init`, the worker replaces the hashed source file only in the private
working copy with `backend.tf.json` from the shared renderer, using
the native S3 backend and `use_lockfile:true`. AWS credentials reside only in the
explicit child environment (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AWS_REGION`, `AWS_DEFAULT_REGION`), not in the backend file or CLI flags.
Native S3 jobs receive no `TF_HTTP_*` variables or inherited AWS profiles.

The temporary `kind:"bootstrap"` requires exactly the stable broker addresses
`/api/runner/state`, `/api/runner/state/lock`
and `/api/runner/state/unlock`, user `runner` and its own ticket as
password. Foreign origins, query parameters and other credentials are rejected before
`init`. The known pinned `backend.tf` is replaced with an HTTP backend
only in a private temporary working directory.
A backend without `kind` is accepted only after the same strict bootstrap check.
HTTP authentication is set only through child ENV, not through a backend file
or CLI configuration. Engine **1.12.6**, immutable Accelerator commit and
provider lock remain unchanged; `init` uses `-lockfile=readonly`.

`platform-plan` reports `initializing`, `validating`, `planning` and creates
`plan.bin`. Only its sanitized counts enter the summary.
Immediately before reporting success, the worker uploads the binary artifact through
`POST /api/runner/artifact` as `{data:base64,summary}`. The SHA256 returned by the
broker must match exactly. Only then does it report
`{status:"succeeded",summary,artifactSha256}`. Upload errors do not authorize
Apply. Artifacts are limited to 16 MiB.

`platform-apply` additionally receives `plan:{data:base64,sha256}`. Canonical
Base64, size and SHA256 are checked before `init`. After `initializing` and
`validating` comes `applying`; OpenTofu receives only `saved-plan.bin`, never
a new Plan, `-auto-approve` or an Apply varfile. There is no
automatic Apply retry, force-unlock, Destroy or Cancel. Provider logs,
Plan JSON and secrets remain private and are subsequently removed.
For Apply, the worker reports only success or a fixed error code, no
provider output or Plan values.

Only after a successful bootstrap Apply does the worker call
`POST /api/runner/migration` with `{phase:"prepare"}`. The response must
contain `{backend:S3RunnerBackend}`; the broker determines the target, credentials
and an empty or verified matching target from management state,
not from the browser. The worker validates the complete S3 contract,
writes the native backend and runs only
`tofu init -migrate-state -force-copy -input=false -no-color -lockfile=readonly`
with the previous HTTP and new AWS environment. No replan or further Apply.
Only after a successful `POST /api/runner/migration` with `{phase:"complete"}`
does `{status:"succeeded"}` follow. Migration errors report `state_failed`.

The HTTP broker must store state durably and encrypted in PostgreSQL
and provide state/artifacts only within the bound job. Local
state is not the regular backend. Even after a failed
Apply, the broker must not delete already stored state. An existing
`errored.tfstate` is checked before the terminal failure report for a maximum of 16 MiB,
state version 4, UUID lineage and a nonnegative integer serial.
`POST /api/runner/recovery` receives `{data:<canonical Base64>,sha256:<SHA256 of file bytes>}`
and must acknowledge `{sha256:<same hash>}` after durable encrypted
storage. Only then does the worker delete the local emergency copy. The job
remains failed (`{status:"failed",errorCode:"state_failed"}`), even if
Tofu exits with code 0 despite the recovery file. A recovery upload has its own
bounded delivery window of 60 seconds even after job timeout.
If the acknowledgment is missing/incorrect or the file invalid, only
the private `errored.tfstate` is retained; credentials, logs and all other files
are removed. The broker must derive `recovery_required` from this and prevent
CF cleanup. Without confirmed delivery, there is no evidence of protection against
hard Runner loss; the local copy is not persistent CF storage.
On timeout, the worker first terminates the process group with SIGTERM,
then SIGKILL if necessary. Remote state and locks are not deleted;
recovery and any lock release require deliberate review.

<a id="lokale-entwicklung"></a>

## Local development

Ordinary worker unit tests use an executable fake Tofu and a
mock broker. No real customer credentials, cloud Apply or
real Runner dispatch for local validation:

```sh
cd landing-zone-configurator/app
npm exec --yes --package=node@24.21.0 --package=npm@11.19.0 -- node node_modules/vitest/vitest.mjs run tests/platform-worker.test.ts
npm exec --yes --package=node@24.21.0 --package=npm@11.19.0 -- node --test ../infra/ci/runner-evidence.test.mjs
```

Before real commissioning, API approval, additive stage/result
schemas, encrypted state/artifact broker including job binding,
state lock behavior and the pinned staged Runner package must be accepted together.
An older broker without these extensions is not Apply-capable.

<a id="erstbereitstellung-qualifizierte-plattformdienste"></a>

## Initial provisioning: qualified platform services

The shared execution check permits the following in **eu01**, in addition to the previous
governance/Public project scope:

- `audit_logs`: Logs instance, read/write token, Telemetry Router with
  Logs and S3 archive destinations and sensitive storage in Secrets Manager.
  Without `link_scopes`, the verified organization applies; explicit targets
  must be that same organization. Folder, project or other
  organization targets remain blocked without their own membership evidence.
  The native Object Lock default remains unchanged: `{}` enables
  GOVERNANCE retention; `s3_object_lock = false` explicitly disables it.
- `observability`: instance, retention/ACL and generated credentials
  including sensitive storage in Secrets Manager.
- `connectivity`: single area (`network_area`) or multiple
  `network_areas`, area-bound DNS zones and single and
  area-bound firewall appliances including HA as an
  **infrastructure Plan without Apply**. A VPN gateway without connections
  needs no PSKs and is also qualified.
- `devops`: DevOps project and optional STACKIT Git with flavor and ACL.
  This requires neither a GitHub repository nor a GitHub token.

Firewall API policy/bootstrap, appliance Apply, VPN connections with PSKs, regional connectivity,
Kubernetes, federation and additional Corporate/project features remain
separately blocked. Connectivity diagnostics now identify the specific
policy/bootstrap/VPN dependency instead of blocking the entire component.
Saved configurations and exports are not rewritten.

There are no new execution or credential side channels: the same
saved inputs and hashes pass through preparation, organization/
identity verification, credential versioning, tenant checks, a one-time
Runner ticket and explicit Plan/Apply approvals. The existing native root
already contains these services; no replacement resources are generated.

Before archiving, `deploy/runner/package.sh` qualifies the actual
packaged root and provider lock. Twelve approved native **mock-provider Plan runs**
check resources including audit routing/archive, sensitive
Vault storage, Git ACL, multiple network areas, legacy single area and
governance baseline, VPN gateway and single, HA and mixed
area-bound firewalls. These appliance Plans use the actual
previously SHA256-verified QCOW2 path, never `/dev/null`.
Two additional, still blocked firewall/HA policy Plan probes demonstrate
the policy missing during bootstrap; an expected native validation violation demonstrates the
PSK requirement for VPN connections. Root files must match the pinned
Git commit in both directions. No customer credentials, cloud Plans or Applies
are used; all providers are mocked and the environment is sanitized.
A further **real Vault provider test** uses the same packaged
userpass configuration with login outputs known only after Apply,
but replaces only the address with a rejecting loopback server.
Vault 5.11.0 can plan new secret resources without attempting authentication
(zero HTTP requests). This disproves a blanket
Vault bootstrap Plan blocker, but qualifies neither live authentication,
permissions, reachability nor an existing Vault secret query.
The provider version and checksums come from the packaged lock; only its
Vault entry is retained for the isolated test.
An additional **real STACKIT provider test** using the packaged
0.114.0 lock plans the actual QCOW2 and natively rejects a missing image path.
It uses only synthetic test authentication,
a rejecting loopback IaaS endpoint and loopback proxies; all
API/proxy calls must remain at zero. The image ID remains computed; no
existing or invented cloud image ID is used. The provider
validates the file during Plan; image creation and upload occur only during
the still blocked Apply.
For each pinned revision, these are 15 native contract cases and three real
offline provider probes. In addition, two artifact-bound tests check
positive package inspection and the actual packaged worker with the real
image in both Plan modes; only its engine/broker are fakes.
These two tests run automatically during packaging and are deliberately skipped in ordinary
unit runs without `LZC_FIREWALL_IMAGE_PACKAGE`.
This is not evidence of a live provisioned service or a Plan
against a real STACKIT endpoint. A real Runner Plan still needs
the existing organization/job-bound STACKIT permissions
and provider reachability; this check does not replace live acceptance.

<a id="verifiziertes-appliance-image-und-verbleibende-plan-apply-grenzen"></a>

### Verified appliance image and remaining Plan/Apply boundaries

- **Appliance image:** Both approved native revisions actually use `/dev/null`
  as the image source in `src/modules/connectivity/5-firewall.tf:6,47`
  without `firewall-image.qcow2`.
  Therefore, through `scripts/prepare-firewall-image.mjs`, `package.sh` includes
  exactly the public image already pinned in `.github/workflows/verify-deployment.yml`:
  `https://opnsense.object.storage.eu01.onstackit.cloud/opnsense-26.1-amd64-21-05-2026.qcow2`,
  SHA256 `5d0fb1cb4375eb258859cafc688f1e5e6f830f54f8d86b9e8bb815611bae1068`
  (993525760 bytes, around 948 MiB).
  The private, ignored cache resides under `.local/firewall-images/<sha256>.qcow2`.
  The download, existing cache and every immutable root copy are
  verified through streaming; incorrect bytes or symlinks abort.
  `platform-source.json` binds the commit and image SHA. Local
  package inspection and the worker check the actual image bytes;
  CF adopts the capability only from the inspected package
  bound to the droplet. Old packages without a qualified image may still
  execute governance/service Plans, but no appliance Plans
  (`runner_firewall_image_unavailable`).
  Automatic qualification additionally checks the complete package
  plus an independently initialized image/root/provider working copy and
  256 MiB reserve against the unchanged 4096-MiB droplet limit.
  Reflink savings are not assumed.
  Measured including the application root: at most 1362381112 bytes for the package,
  1377552902 bytes for the initialized working copy and 268435456 bytes reserve,
  totaling 3008369470 bytes (2.80 GiB) out of 4294967296 bytes.
  The release pipeline continues to copy the complete root through
  `cp -R` to `inspection` and compares it byte-for-byte before deployment.
  Local complete archives are about 1.17 GB. Hosted archives omit only
  the QCOW2 file and must remain smaller than 384 MiB. The final buildpack, pinned to
  the approved release commit, restores the file during staging
  from regional Object Storage with SHA verification.
  The temporary download is moved into the application without a second file copy;
  an additional large CF build-cache copy is omitted. The stored droplet
  is the durable image cache and contains the complete
  file; there is no runtime download per job. The API inspection copy
  is treated identically. CI compares both restored roots
  byte-for-byte with the qualified package and checks the same package identity.
  This keeps the measured runtime disk budget unchanged. Cache and
  download errors abort staging before the web application is replaced.
- **HA is not itself a Plan authentication blocker:** The two
  `terraform_data.firewall_ha_*` provisioners in `5-firewall.tf` use
  administrative access only during Apply; CARP credentials are created natively.
  Appliance/HA infrastructure Plans are possible with the qualified image.
  This provides neither secure administrative access during Apply nor a
  complete firewall policy. The API does not show such Plans as
  Apply-capable and rejects even explicit Apply approval with
  `configuration_apply_not_supported`. The worker accepts the
  bound appliance contract only for platform Plan modes.
- **Configured policy:** `_firewall-bootstrap.tf:30-34,41-61,88-96`
  disables policy in the first Plan when `firewall_bootstrap=true` and
  initially plans only the Apply provisioner that creates API credentials. Without bootstrap,
  an existing Secrets Manager secret is read instead. Therefore,
  the unchanged native greenfield root configuration cannot represent all
  configured policy in the first Plan. The smallest required
  product decision is a visibly multistage infrastructure/credential/policy
  workflow, with fresh confirmation at every stage; alternatively,
  the native bootstrap contract would need to change. Silently omitting policy or
  declaring `unset` credentials complete is not a solution.
- **VPN connections:** `modules/connectivity/variables.tf:274-285` requires
  both PSKs per connection; `7-vpn.tf` indexes exactly these keys.
  Public configurations exclude `vpn_pre_shared_keys`
  (`features.ts`), and `credentials/key.ts` and the worker currently bind
  a STACKIT service account key, not a VPN secret set. The sanitized
  child environment inherits no `TF_VAR_*`. The smallest prerequisite
  is therefore a dedicated authorized, versioned PSK contract bound to tenant/job
  and connection key. Neither invented PSKs nor values
  in the draft, chat or general environment may replace it.

Manually against an existing, unchanged **image-qualified** Runner package:

```sh
cd landing-zone-configurator/app
npm run build:packages
LZC_TEST_RUNNER_ROOT=/absolute/path/to/runner bash scripts/test-initial-plan-contract.sh
```

<a id="nativer-lokaler-runner"></a>

## Native local Runner

With `npm run dev:execution`, the local launcher can run the same worker contract
against the fixed broker `http://127.0.0.1:3000`. Only explicit
local mode permits this origin; CF workers remain bound to the fixed HTTPS origin.
`LZC_LOCAL_RUNNER_PACKAGE=true` creates a native `runner-local` package through
the existing packaging script, with OpenTofu 1.12.6 and
a host provider mirror. Package contents, Zod, Node runtime and provider mirror are
fingerprint-checked before dispatch; changes invalidate the package binding.

The dispatcher stores its identity before starting, inherits no cloud or
backend credentials from the API process and discards raw process output.
Credentials arrive only through the bound job ticket. Private job directories
reside under `~/.local/share/landing-zone-configurator/runner-jobs`. Recovery
remains there until durable acknowledgment and prevents cleanup.
After API loss, ambiguous processes require operational reconciliation;
the adapter does not signal unverified process IDs or repeat Apply.

The customer state lifecycle remains unchanged: Accelerator bootstrap with the
selected service account, followed by migration to the Terraform-managed
management S3 bucket. A successful local dispatch does not prove a real
customer Apply or live S3 migration. The native adapter is a local
development feature, not production sandbox isolation.
