<a id="zugang-prüfen-und-deployment-vorbereiten"></a>
# Check credentials and prepare deployment

[English](deployment-preparation.md) | [Deutsch](deployment-preparation.de.md)

As of 2026-09-30. Three connected steps: check personal authentication,
check the target organization read-only and save an immutable preparation.

<a id="prüfliste-für-die-benutzerabnahme"></a>
## User acceptance checklist

- [ ] **Deployment credentials:** enter the target organization UUID for the saved
  profile and select **Check credentials**. Result and check time remain visible after
  reload. The file does not need to be uploaded again.
- [ ] Missing permission produces a clear organization-access error;
  a rejected/expired key receives a different error. An error
  replaces an earlier successful profile check status.
- [ ] In **GitHub forks**, select the fork and choose **Prepare deployment**
  for a saved configuration. Check name, Git version and target organization.
  An unsaved local draft is not used.
- [ ] Select personal credentials and choose **Check credentials and save preparation**.
  After a successful fresh organization check, the preparation appears
  under **Deployments**, including after reload.
- [ ] Under **Version evidence**, inspect configuration commit, Accelerator reference and
  tfvars checksum. A later fork commit does not change this snapshot.
- [ ] Remove a test preparation. This deletes neither configuration nor resources.
  Optionally delete credentials created solely for testing: existing
  preparations must then display “Credentials deleted”.

<a id="was-der-zugangstest-nachweist"></a>
## What the credential check proves

The backend reads only the user's own fully stored credential profile under
RLS and row lock. It requires the `admin` or `deployer` role, reads the secret
and compares tenant, owner, profile, type, key ID and service account. The
secret version is carried along. There is still no key read endpoint for
the browser or user API.

An RS512-signed JWT with `kid`, `iss`, `sub`, `aud`, random `jti` and at most
ten minutes validity is sent to an explicitly allowlisted STACKIT token endpoint.
Fixed HTTPS targets, no redirects, 15-second timeout each. Access token
and assertion remain in backend memory; they are not written to DB, logs, browser,
Git or manifest. No refresh/token cache.

Then the backend reads only
`GET https://resource-manager.api.stackit.cloud/v2/organizations/<uuid>`.
The response must contain the requested organization ID and `ACTIVE` status.
A successful check confirms authentication and `resource-manager.organization.get`;
**not** write permissions, project creation, service activation, Plan or Apply rights.
Neither `stored` nor an older positive check result is deployment approval.

Sources: [STACKIT token retrieval](https://docs.stackit.cloud/platform/access-and-identity/service-accounts/how-tos/get-access-token/),
[official Resource Manager client](https://github.com/stackitcloud/stackit-sdk-go/blob/main/services/resourcemanager/api_default.go),
[organization response](https://github.com/stackitcloud/stackit-sdk-go/blob/main/services/resourcemanager/model_organization_response.go).

Read-only protocol test with the existing **operator/project service account**:
token retrieval HTTP 200, reading the configured organization HTTP 403. This requires
permissions on the target organization; project access alone is insufficient
for this check. No automatic permission expansion and no import of this key
as a customer profile. This test does not prove permissions for another profile
uploaded by the user.

<a id="unveränderliche-vorbereitung"></a>
## Immutable preparation

1. Check permission and ownership of the credential profile server-side.
2. Use the GitHub user token from the session; recheck repository ID, origin and
   current fork access. No operator or installation token.
3. Confirm the selected head of `lzc/configurations` and read Git tree and
   `landing-zone.json` through immutable object IDs. Other revisions
   are not silently adopted.
4. Validate domain model and template hash. Existing `landing-zone.tfvars` must
   be a regular blob and exactly match deterministic export.
   Missing or manually changed exports block preparation.
5. Take the target organization exclusively from the validated Git document;
   the API accepts neither a separate target nor freely selected Accelerator code.
6. Check personal STACKIT credentials again. Save the manifest only on success.
   After external requests, recheck profile existence and permissions.

`lzc.deployment_preparations` contains owner/tenant and an immutable
snapshot of domain configuration, repository/branch/commit, SHA-256 of tfvars,
export/schema version, fixed Accelerator reference commit, credential ID/secret version,
key ID, organization and check result. Maximum 100 preparations per owner and
tenant. No update permission for runtime; removal is possible. Forced RLS
prevents access by other users even within the same tenant and linking
others' credential profiles.

The Accelerator reference is explicitly `a256f6896d11134fdc351786f1be5eba4e56b2e2` from
`stackitcloud/stackit-landing-zone`. This freezes the code reference; it is not yet
cloud/Plan qualification of this revision. The user's fork supplies configuration data only.
A later Runner requires a more comprehensive approved execution contract.

When a credential is deleted, the foreign key sets the active profile binding
to `NULL`; historical manifest evidence remains. The UI shows the
preparation as unusable. Permissions can also change: before every
future Plan/Apply, access, secret version and target must be checked again.

<a id="lokaler-platform-upgrade-plan"></a>
## Local platform upgrade Plan

Addition from 2026-10-06: ordinary preparation remains bound to `a256f68`.
For contract output, an additional preparation can explicitly
select the fixed qualified commit `08ac257de1548c8ec5e83dae1a79373711c3d644`.
This is currently a local opt-in execution path, not general source selection or
production approval.

The new package is built with `LZC_LOCAL_RUNNER_PACKAGE=true`,
`LZC_PACKAGE_PLATFORM_UPGRADE_ROOT=true` and a new
`LZC_RUNNER_PACKAGE_DIR`. Existing directories are not overwritten.
The source metadata file `platform-source.json` is strictly validated and part of
the package fingerprint. The Runner accepts only the matching source commit;
saved Plans from another package remain invalid for this Runner.

`POST /api/v1/preparations` uses the existing saved configuration,
revision and own credential profile. The additional selection is:

```json
{
  "platformUpgrade": {
    "confirm": true,
    "acceleratorCommit": "08ac257de1548c8ec5e83dae1a79373711c3d644"
  }
}
```

The server requires a matching qualified package and preserves the existing state
binding. An initialized platform normally requires an unlocked S3 state. A
partially failed Bootstrap Apply can instead use its existing encrypted checkpoint
only after the owner explicitly reviews and reconciles it through “Check checkpoint”.
The reconciliation receipt must match the exact current state version, configuration
and tenant. The failed Apply must have used the current pinned platform source or
its supported predecessor `c4b43c36af198985980b17626c48d357795e3fbd`.
Locks, pending migrations, separate recovery state and active runs block this path;
a changed checkpoint requires renewed review. This does not create an empty state
or migrate the backend. Other revisions, extra namespace/tenant fields and different
backend bindings are rejected. The new preparation uses the same state and
configuration. Old manifests, artifacts, revisions and approvals are not rewritten.

The contract namespace comes from the authenticated server session and is part of
the exact new tfvars hash. The API does not relax its tenant/organization check.
The optional CLI namespace remains in the independent Accelerator;
no Configurator runtime dependency is introduced.

Only a new complete saved real Plan shows actual
resource/output changes. Even an output-only Plan requires explicit
approval of its specific SHA-256. Expired Plans are neither extended nor
applied; a new Plan needs its own approval. An Apply is not
automatically retried.

<a id="bewusste-grenze-und-nächste-schritte"></a>
## Deliberate boundary and next steps

This preparation is **not an OpenTofu Plan**, an approved deployment or a
complete Runner job. No customer resources are created. Open tasks:

- [ ] Configure customer-specific remote state and backend credentials.
- [ ] Isolated Runners, queue, cancellation and restart without duplicate Apply.
- [ ] Complete execution contract with engine/provider lockfile and artifact digests.
- [ ] `init`, `validate`, `plan`, redacted Plan presentation and exact Apply approval.
- [ ] Multi-tenant/quota, audit, expiry and rotation extensions.

<a id="technische-abnahme"></a>
## Technical acceptance

- [x] Test JWT signature, claims, new `jti`, fixed endpoints and negative cloud responses.
- [x] Check secret identity and version, no raw secrets in result or manifest.
- [x] Reject stale Git head and missing/manually changed tfvars.
- [x] Real PostgreSQL: RLS, roles, immutable preparation and deletion invalidation.
- [x] Browser flow qualified on desktop and mobile; mobile presentation visually checked.
- [x] Feature-branch release including migration and CF connection tests.
- [x] Personal success case with a profile authorized on the target organization (user confirmed, 2026-09-30).

<a id="release-abnahme"></a>
### Release acceptance

Code commit `366cc3c`, [validation 36716027326](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36716027326)
and [release 36716027274](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36716027274)
successful. 47 application tests, ten PostgreSQL tests and 16 browser cases green.
Migration and CF connection tests to PostgreSQL and Secrets Manager successful.
Live checked: `/deployments`, reload, mobile width, no browser errors and 401
for anonymous preparation listing, creation, removal and credential checking. No
personal credentials used and no preparation created. Known local
credential values were not found in release logs. The user subsequently confirmed full preparation and credential checking with
a suitable combination of organization and personal service account.
The earlier rejection resulted from a mismatched combination.
The remaining individual checklist items are not automatically accepted thereby.

<a id="freigabegrenze-für-die-nächste-phase"></a>
## Approval boundary for the next phase

User decision from 2026-09-30: customer Plan may be tested. Every
customer Apply needs new explicit user approval. Existing
Configurator infrastructure approval does not apply to customer resources. No Destroy;
the user points out the currently missing folder Destroy option.
Further work and open prerequisites: [Plan execution](plan-execution.md).
