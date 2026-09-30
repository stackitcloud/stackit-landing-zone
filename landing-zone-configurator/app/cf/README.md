# CF application release

`.github/workflows/configurator-release.yml` builds and tests the application,
packages production dependencies and the checksum-pinned Node 24.21.0 Linux runtime,
and deploys the same archive with explicit `cf` CLI commands. The CF node buildpack
currently offers an older Node version, so this release uses `binary_buildpack`.
Update the version and checksum together when upgrading Node. The CF stack remains
platform-maintained (`cflinuxfs4`).

`manifest.yml` owns the application, route, process size, health check and backend
environment bindings. OpenTofu owns the CF org/space/roles and backing services;
it does not also manage the application. The worker is not deployed yet.

The protected `lzc-dev-release` Environment contains workload S3 credentials and
platform/runtime state keys. No project service-account key is supplied to the
release workflow. `tofu output -json` writes private files; `prepare-release.mjs`
only extracts explicitly allowed backend variables and masks them. `cf push`
uses a private variables file and `--redact-env`; neither credentials nor decrypted
states are included in the application artifact. The app receives only its own
PostgreSQL/Secrets credentials and the operator Model Serving token.

For this development milestone the CF deployment identity is still the existing
org manager with explicit space developer membership, and release reads platform
state. A dedicated space-only deployer and narrower state/credential publication
are required before production. CF environment variables are visible to authorized
space developers; restrict and audit those roles. The public app remains a foundation
page: protected API routes refuse requests until real authentication exists.

After push, a CF task performs PostgreSQL authentication, a query with verified TLS,
and Secrets Manager authentication plus instance-specific read authorization and
metadata access. No tenant secrets are read or written. Diagnostic logs only show
service names, result and sanitized failure categories. The task revokes its Vault
token. A health check alone does not prove service connectivity.

All mutations share `configurator-lzc-dev-mutation` with infrastructure workflows.
Feature-branch releases require Environment approval. A superseded branch revision
is rejected before deployment. GitHub concurrency is not FIFO: newer pending runs
can replace older pending runs. Never run local applies or pushes concurrently.

The initial single-instance `cf push` can interrupt service briefly. Immutable
archive/checksum retention is seven days; explicit rollback/promotion and rolling
releases are subsequent milestones. DB migrations, schema grants, RLS, personal
credential storage and customer deployment execution are not part of this release.
