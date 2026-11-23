# Native staged retirement

[English](README.md) | [Deutsch](README.de.md)

This separate OpenTofu root removes an existing Accelerator's projects and resources
while preserving `module.governance` and its original folder addresses. A later
normal Plan removes the folders after STACKIT has permanently removed their projects.
It does not move projects, import the deployment into the Configurator, remove State
entries, or introduce a new backend service. There is no automatic waiting process.

This adapter currently supports State resources using the root STACKIT provider
(default, `eu01`, `eu02`), Random and Time. Remove private-provider workloads first
using their original source and reachable APIs. The inventory command rejects
remaining managed Vault, OPNsense, Kubernetes, Helm and module-local Grafana providers;
do not discard those resources from State to bypass the check. Historical or modified
sources need separate qualification. Existing Terraform deployments retain their
engine until a separately reviewed migration; these instructions target OpenTofu.

## Before starting

- One named operator owns the whole retirement. Disable normal Apply pipelines,
  project-factory dispatch, old approvals and every other State writer across all
  associated Application and Platform States. The retirement record remains in force
  between commands and during the purge wait. A State lock alone is insufficient.
- Inform affected Application owners and export required data. Remove dependent
  Application resources before shared platform dependencies. The Platform Owner may
  perform the authorized teardown; requester self-service deletion is optional.
- Verify that the backend bucket, its project, encryption keys, cleanup service
  account and this working environment survive the selected teardown. Migrate the
  backend into independent infrastructure first if needed and verify the resulting
  State identity. This adapter does not automatically protect a backend hosted in
  the management project that is about to be deleted.
- Preserve the original source, input files, provider versions/hashes, backend
  descriptor, workspace, encryption configuration and keys. Review retention,
  versioned/non-empty buckets and shared organization IAM. Never enable force-delete
  or remove retention locks merely to make the operation pass.

Follow the [State locking contract](../../docs/state-locking.md): STACKIT S3 does
not supply the qualified conditional-write lock. Native operation requires the
organizational single-writer procedure; do not assume `use_lockfile` protects it.

## Remove private-provider workloads with the original source

The standard Management module writes its Object Storage and automation credentials
with the Vault provider. Even a small default Landing Zone therefore needs this
preliminary step. Keep the original source, backend and live provider credentials
until it has finished; the reduced retirement root deliberately cannot authenticate
these providers. Removing a secret here deletes its managed Vault contents, not the
cloud service-account key or Object Storage credential itself. Independent cleanup
access and any required exports must already exist.

For a default Management deployment **without** Observability, Audit Logging,
firewall policy or Kubernetes workloads, the two targets below are the complete
private-provider set. Inspect your private original State first. Additional private
resources require additional exact targets and their original reachable control
planes. Do not copy this example as a universal target list.

```sh
umask 077
mkdir -p /absolute/private/retirement
tofu -chdir=/absolute/original/src state pull > /absolute/private/retirement/before-private.tfstate
tofu -chdir=/absolute/original/src plan -destroy -input=false \
  -var-file=/absolute/private/original.tfvars \
  -target=module.management.vault_kv_secret_v2.object_storage_credentials \
  -target=module.management.vault_kv_secret_v2.service_account_key_automation \
  -out=/absolute/private/retirement/private.tfplan
tofu -chdir=/absolute/original/src show -json /absolute/private/retirement/private.tfplan \
  > /absolute/private/retirement/private.plan.json
python3 src/retirement/guard.py check-private-plan \
  --state /absolute/private/retirement/before-private.tfstate \
  --plan /absolute/private/retirement/private.plan.json
tofu -chdir=/absolute/original/src show /absolute/private/retirement/private.tfplan
tofu -chdir=/absolute/original/src apply /absolute/private/retirement/private.tfplan
```

`-target` is confined to this reviewed preliminary deletion. Dependency expansion
must not delete projects, folders, service instances or access credentials. The
helper checks that **all** captured private-provider resources, and only those
resources, are deleted; public infrastructure may remain unchanged. If the Plan
includes other deletions or cannot reach a private endpoint, stop and resolve that
specific source/dependency problem. Do not bypass it with `state rm` or `-refresh=false`.
Retain the failed evidence and partial State after any error.

After success, switch directly to the reduced root below using the same authoritative
State/backend. Do not run the active original configuration again: it would recreate
the removed private resources. Python is optional if the same checks are performed
and recorded manually. This preliminary helper is locally tested; arbitrary historical
private-provider configurations are not claimed as live-qualified.

## Capture and bind the original State

Use an absolute private directory outside the deployment. Its contents can include
credentials in State and Plan files; do not upload them to issues or CI artifacts.
The paths below are placeholders. Work from the reviewed checkout's repository root.

```sh
umask 077
mkdir -p /absolute/private/retirement
# Run in the ORIGINAL initialized working directory and workspace:
tofu -chdir=/absolute/original/src state pull > /absolute/private/retirement/before.tfstate
python3 src/retirement/guard.py inventory \
  --state /absolute/private/retirement/before.tfstate \
  --out /absolute/private/retirement/inventory.json
```

Prepare `/absolute/private/retirement/retirement.tfvars.json` with the exact original
`organization_id`, `owner_email`, `region`, `rm_folder_parent_id`, `rm_folders`,
`organization_owners`, `organization_auditors` and `labels`. The native
`landing_zone_accelerator` label is retained automatically. Keep folder map keys, names and
assignments unchanged. Omitting existing assignments can propose deletion; the
Phase A guard rejects all governance deletions. Do not use new default folder names.

Select the same backend kind and exact object/workspace as the original deployment.
For S3, copy `backend.tf.example` as shown; for another backend supply its original
backend block instead. Reproduce the original encryption configuration separately.
Do not continue if State cannot be decrypted. Do not use the implicit local backend
for an existing remote deployment.

```sh
cp src/retirement/backend.tf.example src/retirement/backend.local.tf
export TF_DATA_DIR=/absolute/private/retirement/tofu-data
tofu -chdir=src/retirement init -input=false -reconfigure \
  -backend-config=/absolute/private/retirement/backend.hcl
tofu -chdir=src/retirement state pull > /absolute/private/retirement/current.tfstate
python3 src/retirement/guard.py verify-state \
  --inventory /absolute/private/retirement/inventory.json \
  --state /absolute/private/retirement/current.tfstate
```

Initialize using the reviewed provider lockfile. The root requires the same pinned
STACKIT, Time and Random versions as the qualified source; initialization may remove
unused provider requirements from a copied original lockfile. Review that change;
never upgrade the provider during retirement. Commit/use the qualified reduced
lockfile for subsequent `init -lockfile=readonly`. State identity verification must
succeed before planning; never accept a newly created empty State as a substitute.

## Phase A: resources and projects, folders retained

```sh
tofu -chdir=src/retirement plan -input=false \
  -var-file=/absolute/private/retirement/retirement.tfvars.json \
  -var=retirement_phase=remove_projects \
  -out=/absolute/private/retirement/projects.tfplan
tofu -chdir=src/retirement show -json /absolute/private/retirement/projects.tfplan \
  > /absolute/private/retirement/projects.plan.json
python3 src/retirement/guard.py check-plan \
  --inventory /absolute/private/retirement/inventory.json \
  --state /absolute/private/retirement/current.tfstate \
  --plan /absolute/private/retirement/projects.plan.json --phase remove_projects
# Independently review the human-readable saved Plan and its exact scope.
tofu -chdir=src/retirement show /absolute/private/retirement/projects.tfplan
tofu -chdir=src/retirement apply /absolute/private/retirement/projects.tfplan
```

The guard rejects creates, updates, replacements, unreviewed identities, governance
deletions and disappearance during refresh. In particular, the pinned project
provider may remove a project from its refreshed State on HTTP 403. That must be
investigated with authorized cloud reads, not counted as successful deletion.
The guard is an offline review aid, not a cloud authorization or purge oracle.
Python is optional: the infrastructure operations use OpenTofu alone. If you omit
the guard, independently perform and record the same State-identity, resource-ID,
refresh-drift and delete-only checks before each Apply. Omitting the helper does
not waive these checks.

An unsuccessful Apply remains unsuccessful. Preserve partial State and output,
reconcile the actual completed operations and generate a fresh Plan in this same
phase. Do not rerun the original active configuration, reuse an old saved Plan,
force-unlock an unknown writer, or hide errors with `-refresh=false` or `state rm`.

## Wait and finalize

Projects can remain pending permanent removal after Phase A. Keep the freeze,
State, original project/folder inventory and independent credentials. No running
OpenTofu process is needed. Seven elapsed days or a project disappearing from State
is not proof of purge. A foreign child or a missing permission requires investigation.

After authorized review, refresh `current.tfstate` using `state pull` and run
`verify-state` again. Create a **fresh normal Plan** with
`-var=retirement_phase=finalize_folders`, save it as `folders.tfplan`, render its JSON
and call `check-plan --phase finalize_folders` with the same inventory and current
State. It may delete only captured folders and their folder-level assignments.
Review and apply that saved Plan explicitly, as in Phase A.

If the folder API returns the expected HTTP 409, retain the failed Apply and partial
State, continue waiting and create another fresh finalization Plan later. Do not
relocate projects or retry arbitrary errors automatically. A successful folder
Delete and authorized verification of the intended final hierarchy complete that
scope. An empty State, HTTP 403/404 alone, or a no-change Plan does not replace this
evidence. Retained organization assignments remain managed in this State; deleting
shared organization Owners/auditors is a separate reviewed handoff, not a global
`destroy` at the end of this procedure. Archive the retirement evidence and keep the
old factory publication disabled.

## Local qualification

```sh
tofu -chdir=src/retirement init -backend=false
tofu -chdir=src/retirement validate
tofu -chdir=src/retirement test
python3 -m unittest discover -s src/retirement -p 'test_*.py'
LZC_TEST_TOFU_BIN=/absolute/path/to/tofu \
  python3 -m unittest discover -s src/tests -p test_retirement_native.py
```

Tests use mocked resources or an isolated loopback API with synthetic local State.
The real-provider test verifies same-State project removal, retained folder identity,
HTTP-403 false disappearance rejection, HTTP-409 waiting and later folder deletion.
It creates no STACKIT resources. A disposable Dev pilot remains necessary before
claiming live qualification. See the [lifecycle concept](../../docs/destroy-lifecycle-concept.md)
for the complete Configurator coordinator, authorization and notification contract.
