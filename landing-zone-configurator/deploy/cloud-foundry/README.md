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
is rejected before deployment. GitHub concurrency is not FIFO: newer pending runs
can replace older pending runs. Never run local applies or pushes concurrently.

The initial single-instance `cf push` can interrupt service briefly. Immutable
archive/checksum retention is seven days; explicit rollback/promotion and rolling
releases are subsequent milestones. Versioned SQL migrations run before the web
release in `landing-zone-configurator-migrate`, a separate task-only app with no
route. Only this short-lived app receives the database-owner credentials; it is
deleted after migration and on failure. Migration checksums and an advisory lock
protect repeat execution. The web app uses its restricted runtime role and RLS.
Initial customer plan previews use ephemeral runner tasks. Apply/destroy are not implemented. See [plan execution](../../docs/plan-execution.md).

Raw CF logs are not exported to CI, since router URLs may contain OAuth codes.
Task status, sanitized diagnostics and public health checks provide release evidence.

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
