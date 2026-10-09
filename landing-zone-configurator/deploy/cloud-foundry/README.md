# CF application release

`.github/workflows/configurator-release.yml` builds and tests the application,
packages production dependencies and the checksum-pinned Node 24.21.0 Linux runtime,
and deploys the same archive with explicit `cf` CLI commands. The CF node buildpack
currently offers an older Node version, so this release uses `binary_buildpack`.
Update the version and checksum together when upgrading Node. The CF stack remains
platform-maintained (`cflinuxfs4`).

`manifest.yml` owns the application, route, process size, health check and backend
environment bindings. OpenTofu owns the CF org/space/roles and backing services;
it does not also manage the application. The plan runner is staged separately in `lzc-dev-runners/plans`, without application service bindings.

The protected `lzc-dev-release` Environment contains workload S3 credentials and
platform/runtime state keys. No project service-account key is supplied to the
release workflow. `tofu output -json` writes private files; `prepare-release.mjs`
only extracts explicitly allowed backend variables and masks them. `cf push`
uses a private variables file and `--redact-env`; neither credentials nor decrypted
states are included in the application artifact. The app receives only its own
PostgreSQL/Secrets credentials, the operator Model Serving token and the GitHub
App OAuth client credentials. The user explicitly approved the latter transfer to
`lzc-dev-release` and CF backend variables on 2026-09-30. `LZC_AUTH_ENABLED=true`
activates login; the client secret never enters the frontend build.

STACKIT becomes the primary login when the protected Environment sets both
`LZC_STACKIT_DEVICE_ENABLED=true` and `LZC_AUTH_ENABLED=true`. The legacy
`DEVICE_ENABLED` name is a provider toggle, not an authentication-method selector.
Local and hosted startup use the same `configuredStackitFlow` implementation.
The protected Environment supplies the explicit PKCE configuration:

| Variable | Hosted configuration |
| --- | --- |
| `LZC_STACKIT_AUTH_FLOW` | `authorization-code` |
| `LZC_STACKIT_CLIENT_ID` | Registered public Web client supporting PKCE |
| `LZC_STACKIT_REDIRECT_URI` | Public origin followed by `/auth/stackit/callback` |

Register both login and `/auth/stackit/proof-callback` HTTPS callbacks with that
client. The callbacks must belong to the configured `LZC_PUBLIC_ORIGIN`; query
strings, fragments and embedded credentials are rejected. There is no silent
fallback to Device Flow. `LZC_STACKIT_CLI_CLIENT_APPROVED` only grants explicit
local CLI-client reuse: that client remains restricted to loopback applications
and its registered localhost ports. A hosted Web client needs no CLI approval.
The local development helper supplies loopback defaults and a callback relay;
it does not select a different implementation of PKCE.

The successful provider switch on 2026-10-07 used Device Flow and therefore did
not qualify hosted PKCE. A registered Web client and both HTTPS callbacks are
required before deploying this version. Release preparation validates the actual
compiled artifact's configuration before the first CF staging, and public route
checks require `stackitFlow: "authorization-code"` as well as the primary provider.
GitHub remains an optional repository connection. GitHub credentials are optional in
STACKIT mode but must be configured as a complete pair if repository access is
enabled. All missing versioned migrations run before the new application starts.
Bind existing GitHub users through a valid session before switching their login;
there is no automatic account merge by email.

For this development milestone the CF deployment identity is still the existing
org manager with explicit space developer membership, and release reads platform
state. A dedicated space-only deployer and narrower state/credential publication
are required before production. CF environment variables are visible to authorized
space developers; restrict and audit those roles. Unauthenticated
requests to protected API routes remain denied. GitHub login uses server-side
opaque sessions; see [login architecture and acceptance](../../docs/github-login.md).

After push, a CF task performs PostgreSQL authentication, a query with verified TLS,
and Secrets Manager authentication plus a GET on the reserved operator probe path
`configurator/connectivity-probe`. Anonymous access must be denied; authenticated
access may return 404 for the absent key. No tenant secrets are read or written.
When login is enabled, the task additionally writes, reads and permanently deletes
a random probe key, then checks that it is absent. The runtime identity has explicitly
approved write access to the dedicated Configurator Secrets Manager instance. Diagnostic logs only show
service names, result and sanitized failure categories. The task revokes its Vault
token. A health check alone does not prove service connectivity.

All mutations share `configurator-lzc-dev-mutation` with infrastructure workflows.
Feature-branch releases require Environment approval. A superseded branch revision
is rejected for a new build; an explicit promotion uses the selected qualified
build's exact source revision, even when the branch has advanced. GitHub concurrency is not FIFO: newer pending runs
can replace older pending runs. Never run local applies or pushes concurrently.

The initial single-instance `cf push` can interrupt service briefly. Rolling
releases remain a subsequent milestone. Versioned SQL migrations run before the web
release in `landing-zone-configurator-migrate`, a separate task-only app with no
route. Only this short-lived app receives the database-owner credentials; it is
deleted after migration and on failure. Migration checksums and an advisory lock
protect repeat execution. The web app uses its restricted runtime role and RLS.
Customer Plans and explicitly confirmed saved-plan Applies/Destroy use ephemeral
runner tasks. Application drift is read-only. Hosted execution additionally needs
`LZC_EXECUTION_ENABLED=true`, `LZC_APPLICATION_EXECUTION_ENABLED=true` and the
protected Environment secret `LZC_DEPLOYMENT_ARTIFACT_KEY` (canonical Base64 of
32 random bytes). Keep that key across releases; never replace it to repair a job.
The release binds execution to the exact staged droplet and packages the same
OpenTofu/provider/source bytes in the API for backend-free saved-plan inspection.
Only the isolated runner receives job credentials. The API inspection subprocess
has a minimal environment without database, Vault or Cloud credentials. The API
uses 1024 MiB memory and 4096 MiB disk for this inspection; the release validates
both native roots and probes both broker namespaces with invalid tickets.
Old plans are not rebound after a droplet change. See [plan execution](../../docs/plan-execution.md).

### Dev Activation Prerequisite (2026-10-09)

The sole target origin is
`https://lzc-dev-configurator.apps.01.cf.eu01.stackit.cloud`, without a suffix.
The STACKIT public Web client has already been requested for this origin;
provisioning and its public client ID are still pending. No second client request
is required. The existing suffixed route was checked only as a read-only baseline,
not chosen as a deployment target. The release route, Public Origin and callbacks
all use the suffix-free origin.

Before promotion, set `LZC_STACKIT_AUTH_FLOW=authorization-code`, the provisioned
public `LZC_STACKIT_CLIENT_ID`,
`LZC_STACKIT_REDIRECT_URI=https://lzc-dev-configurator.apps.01.cf.eu01.stackit.cloud/auth/stackit/callback`
and `LZC_STACKIT_CLI_CLIENT_APPROVED=false` in `lzc-dev-release`. The requested
PKCE/S256 client needs both HTTPS callbacks, `/auth/stackit/callback` and
`/auth/stackit/proof-callback`. The CLI client cannot be reused for a public
callback. No Device Flow or GitHub fallback is performed.
The user approved Commit/Push/Dev deployment but requested no additional database
backups, relying on scheduled STACKIT backups. Customer Plan/Apply/Destroy remain
separate explicit operations, not part of application release validation.

Raw CF logs are not exported to CI, since router URLs may contain OAuth codes.
Task status, sanitized diagnostics and public health checks provide release evidence.

## Immutable release and promotion

Build once; deploy the same bytes. The workflow publishes one immutable GitHub
artifact, `configurator-release-<build-run-id>`, containing a central
`configurator-release.tar.gz` and its SHA-256 checksum. Inside are the compiled
API, Web assets, migrations and pinned Node runtime in `release.tar.gz`, plus the
isolated `runner.tar.gz` and `release-manifest.json`. The manifest binds both
packages to the build run ID and source commit through their SHA-256 checksums.
No stage configuration or credentials enter this release.

Build and qualify without changing CF:

```sh
gh workflow run configurator-release.yml \
	--ref feature/landing-zone-configurator -f build_only=true
```

Promote that successful build to the protected Dev Environment without rebuilding:

```sh
gh workflow run configurator-release.yml \
	--ref feature/landing-zone-configurator -f release_run_id=<build-run-id>
```

Promotion verifies the repository, allowed source branch and event, workflow,
successful build job, original run attempt, unexpired immutable artifact ID and
matching source SHA. It checks out that source revision, verifies the central
archive and manifest before extracting the application, then injects the current
protected Environment's runtime variables and secrets. Environment approval,
destination restrictions, migration guards and service checks still apply.
Artifact retention is 30 days; expired artifacts are not silently rebuilt.

Only Dev is currently an enabled deployment target. Additional stages need their
own reviewed destination configuration and protected Environments, not separate
application builds or authentication implementations. Promoting older bytes is
not an automatic database rollback: migrations are forward-only, and reverting
application code requires explicit schema compatibility qualification.

## Network verification

The release includes a diagnostic CF task for DNS/TCP and an HTTPS request to the
Configurator's own route. The matching CF router entry identifies the observed
source network without contacting an external IP-diagnostic service. This is a
point-in-time observation, not a promise of stable CF egress addresses.

The first connection test exposed a missing STACKIT network in the service ACLs.
The official eu01 catalog and our own router logs support adding
`45.135.244.0/22` through platform IaC. Network policy changes require a reviewed
platform plan and then a fresh CF connectivity test. The public UI/API checks run
even if a service connection fails, so route health and service health remain
separately visible. See [platform acceptance](../../docs/platform-readiness.md).

The API dispatcher additionally receives the manager credentials for the dedicated
runner organisation, not the Configurator organisation. This isolates CF control
from the database/secret/model bindings of the web app. These credentials never
enter the runner package or job app. Release verifies the runner organisation and
space IDs, stages the provider mirror, tests the engine and probes a disposable
runner app with an unregistered ticket.
