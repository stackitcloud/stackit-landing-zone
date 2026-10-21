<a id="persönliche-deployment-zugänge"></a>
# Personal deployment credentials

[English](deployment-credentials.md) | [Deutsch](deployment-credentials.de.md)

As of 2026-09-30. Next building block after fork storage and tfvars export.

<a id="umfang-und-benutzerablauf"></a>
## Scope and user flow

1. Sign in with GitHub and open **Deployment credentials** (`/credentials`).
2. Enter a profile name and select a STACKIT service-account key file as
   JSON containing a private RSA key.
3. **Save credentials securely**. The list shows name, service account and status;
   the key is not shown again or offered for download.
4. **Delete credentials** removes all secret versions from the Configurator. This
   does not revoke the key at STACKIT. Revoke it separately in
   STACKIT service-account management.

## Optional Firewall HA administration

Use the current appliance login, not a desired future password. A freshly booted
pinned image retains its image account until an operator changes it; storing the
profile does not create a user or configure either VM. Check both WAN login pages
in the connectivity project. If an Apply already created the VMs, correct the
profile and use a new preparation/Plan against the retained checkpoint; do not
recreate the VMs or reuse the consumed saved Plan.


For Firewall HA, enable **Store OPNsense administration credentials for Firewall
HA** when creating the profile and enter the existing GUI administrator username
and password for both appliances. Single-node Firewall infrastructure does not
require this additional credential. Saving a profile does **not** set or rotate
an appliance password; the supplied credentials must match the pinned image or
the independently administered appliances.

The administration credentials are stored with the service-account key in the
same owner-/tenant-bound secret, never in configuration, tfvars, Assistant
proposals, browser storage or profile responses. PostgreSQL holds only the
`firewall_administration_configured` capability flag, added by migration
`059_firewall_administration.sql`. The username and password are never read back
to the UI. The password input is cleared after every save attempt.

Create a **new preparation and Plan** with this profile. The immutable preparation
binds the profile, secret version, key identity and administration capability;
the Runner receives the administration values only for an authorized HA job.
Older HA preparations and Plans cannot acquire this binding retroactively.
The error `firewall_administration_required` therefore requires a new profile,
preparation and Plan, not merely another Apply attempt. Existing configurations
and Plan evidence remain intact.

This enables native Firewall/HA infrastructure execution, not firewall policy,
API-key bootstrap or VPN PSKs. Apply still requires explicit saved-plan approval
and all source, state, organization and authorization checks. Local contract tests
do not qualify real appliance reachability or HA failover; these require a
separately authorized environment test. See [Plan execution](plan-execution.md).

Initially supported: Key Flow with an embedded RSA key of at least 2048 bits.
Files with a disabled or already expired key, conflicting IDs,
missing private key or unknown audience are rejected. This
check confirms only the file format and local key readability. A valid
format proves neither current STACKIT permissions nor correspondence with the public key
registered at STACKIT. The status therefore explicitly reads **Permissions
not yet checked**. Separate PEM files, WIF, rotation within an existing profile,
delegation and automatic cloud permission checks follow later.

[Official STACKIT key file format](https://docs.stackit.cloud/platform/access-and-identity/service-accounts/how-tos/manage-service-account-keys/).

<a id="daten-und-zugriff"></a>
## Data and access

- `lzc.credential_profiles` contains metadata only: UUID, tenant,
  owner, profile name, service-account email, key ID, storage status and timestamps.
- Migration `002_credential_profiles.sql` runs through the existing separate
  CF migration task as `configurator_migration`. The runtime role retains neither
  table ownership nor BYPASSRLS. No new cloud resource or manual
  permission expansion is required; existing IaC-provisioned services are used.
- Forced RLS requires the current tenant, membership and owner. Even
  other administrators in the same tenant cannot see or delete personal profiles.
  Creation requires `admin` or `deployer`. Roles/identity come from the
  backend session, never the request body.
- Secret path in the dedicated Configurator instance:
  `configurator/tenants/<tenant>/users/<user>/credentials/<profile>`.
  UUIDs are generated/validated server-side. Secret data binds tenant, user,
  profile and type; no GitHub session binding, so profiles survive a new login.
- The UI sends the file only on explicit save over HTTPS. No Git commit,
  browser storage, query parameter or secret download endpoint. The
  file input is cleared after the attempt; navigation/sign-out removes the
  component. JavaScript does not guarantee physical memory erasure.
- GET lists metadata. POST and DELETE require session, exact origin and CSRF.
  `Cache-Control: no-store`; no body/secret/parser errors in application logs.
- Maximum 20 profiles per user and tenant; concurrent creation is
  serialized by a PostgreSQL advisory lock during reservation. UI file limit 24 KiB,
  API body limit 32 KiB. No automatic POST retry.

The app user has the already approved instance-wide Secrets Manager permissions.
Personal secret separation is implemented through backend paths, session and database RLS;
there are not yet separate Vault policies per tenant. A
compromised backend therefore remains inside the trust boundary.

<a id="fehler-und-löschung"></a>
## Errors and deletion

Before writing the secret, a `pending` metadata record is durably reserved.
A transaction then locks exactly this row, writes with Vault CAS `0` and
sets `stored` on success. Create/Delete cannot thereby remove the same profile
from each other while writing. After a crash or ambiguous response,
at least the metadata record remains for cleanup. `pending` means
unusable; the UI offers deletion and recreation, not blind retry.

Deletion locks the authorized row, first removes Vault metadata including
all secret versions, then the DB record. A 404 during secret deletion counts as
already removed. An interruption may leave a metadata record whose secret is already
missing; deletion is repeatable. The Runner must therefore never rely solely
on `stored`, but must recheck existence, secret identity and authorization before
every use. The authenticated job broker performs these checks before handing
credentials to an authorized job; there is no general-purpose secret read endpoint.
Vault login tokens are revoked after every operation, including failures.

<a id="abnahme-und-weitere-arbeit"></a>
## Acceptance and further work

- [x] Check key file formally and cryptographically locally.
- [x] Create, list and delete personal profiles; no key read endpoint.
- [x] Session/CSRF/identity injection and secret-path negative tests.
- [x] Real PostgreSQL: other tenants, other owners within the same tenant,
  missing role, no secret in metadata and repeatable error cleanup.
- [x] Qualify feature-branch release including migration on lzc-dev.
- [x] Qualify personal profile through the live UI (user confirmation).
- [x] Add STACKIT authentication and read-only organization check; [flow and acceptance](deployment-preparation.md).
- [x] Bind fixed Accelerator reference and immutable configuration in a preparation; cloud/Plan qualification remains open.
- [ ] Add customer-specific remote state, Runner, queue, Plan and explicit Apply.
- [ ] Expand rotation, automatic cleanup, audit events and delegations.

The operator key file from the repository root is not imported as a user profile.
Local tests use only generated or artificial test keys.

<a id="technische-release-abnahme"></a>
## Technical release acceptance

Code commit `629fab6` on `feature/landing-zone-configurator`.
[Validation 36706267168](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36706267168)
and [release 36706267163](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36706267163)
successful. 38 application tests, nine real PostgreSQL tests and 14 browser cases
passed. Migration and CF connection tests to PostgreSQL and Secrets Manager green.
Mobile profile management visually checked using the test screenshot.
Live confirmed: `/credentials`, reload, mobile width, no browser errors and
401 for anonymous GET/POST/DELETE. No real key uploaded for live acceptance;
the user's personal upload remains a separate acceptance item.

<a id="korrektur-aktuelles-stackit-accounts-schlüsselformat"></a>
## Correction: current STACKIT Accounts key format

The original audience allowlist considered only the older service-account
hosts and rejected valid files with `credentials.aud = https://accounts.stackit.cloud`.
Validation now also accepts this audience and preserves the optional
`credentials.tokenEndpoint`, especially `https://accounts.stackit.cloud/oauth/v2/token`.
Only explicitly known HTTPS endpoints are allowed; no arbitrary upload URLs.
Regression test: current format accepted and passed completely to the secret store;
manipulated token endpoints rejected. Existing older files
without `tokenEndpoint` remain supported. A rejected upload triggered no profile
or secret write operation.

Sources: [STACKIT token retrieval](https://docs.stackit.cloud/platform/access-and-identity/service-accounts/how-tos/get-access-token/),
[SDK support for tokenEndpoint](https://github.com/stackitcloud/stackit-sdk-go/releases/).

Fix acceptance: commit `6c95098`, [validation 36711832436](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36711832436)
and [release 36711832452](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36711832452)
successful. 39 application tests green. The existing local STACKIT key file
passes format validation including token endpoint preservation; no
upload or key content output. Live page and anonymous access protection
checked after release; personal repeat upload acceptance remains with the user.

Current follow-up: [Credential check and deployment preparation](deployment-preparation.md). The original storage described above is now extended with internal secret reads exclusively for authorized checks; raw keys remain inaccessible to the browser.
