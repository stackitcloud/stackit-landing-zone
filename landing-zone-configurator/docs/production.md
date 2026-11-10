# Production operations

[English](production.md) | [Deutsch](production.de.md)

Production uses an independent STACKIT project, encryption keys, databases,
Secrets Manager, model token, storage buckets, CF organizations and GitHub
Environments. Its public origin is `https://app.landing-zone.runs.onstackit.cloud`.
The native Accelerator in `src/` remains independently usable.

## Deployment and availability

The reviewed `lzc-prod` stage defines three web/API instances, two shared warm
one-shot Runner reserves and PostgreSQL 17 on the `2.4-replica` replica-set flavor.
The database has 20 GB storage, a nightly 02:00 UTC backup schedule and 32-day
retention. CF application and Runner organizations each use the public EU01
platform and a separately selected quota; `small` offers 10 GB memory and no
three-instance cap. Allow capacity for staging, migration, checks and the extra
web process during rolling deployment. Warm reserves are shared through PostgreSQL
locks, not multiplied by the web replica count. Infrastructure jobs and release
activation share `configurator-lzc-prod-mutation` as their single writer.

Login state, sessions and job records use PostgreSQL; no sticky browser session
is required. Runtime users lack database administration privileges. Application
and Runner credentials are separate `space-scoped-service-account` services with
the `space-deployer` plan. Release jobs receive neither organization-manager
credentials nor state keys/S3 access. Provisioning uses a separate service account
with owner rights limited to the operator project and a 90-day key.

Rolling activation keeps the existing web processes running until replacement
processes are ready. The initial deployment starts three processes. Activation
checks all three processes and rejects canceled or incomplete deployments.
This configuration does not itself demonstrate zone-level placement, database
failover, or a tested disaster-recovery time: record those operational exercises
before promising an availability target.

## Bootstrap an existing project

Use pinned OpenTofu 1.12.6 and the pinned Node/npm versions from the app README.
All following commands run from `landing-zone-configurator/`. Create a private
`.local/lzc-prod/operator.json` (mode `0600`) with this schema; replace placeholders:

```json
{
  "projectId": "00000000-0000-4000-8000-000000000001",
  "existingProjectContainerId": "operator-project-readable-id",
  "parentContainerId": "parent-folder-readable-id",
  "ownerEmail": "owner@example.com",
  "centralServiceAccountEmail": "bootstrap@sa.stackit.cloud",
  "centralKeyPath": "/private/bootstrap-service-account.json",
  "credentialExpiration": "2027-02-08T00:00:00Z",
  "cfPlatformId": "00000000-0000-4000-8000-000000000002",
  "cfQuotaId": "00000000-0000-4000-8000-000000000003",
  "reviewer": "github-operator",
  "stackitClientId": "registered-production-public-client"
}
```

The project resource imports by **container ID**, not project UUID. It preserves
existing billing/scope labels and the initial owner. Its lifecycle prevents
project destruction. The local `operator-project`, `seed` and `seed-protection`
roots are the bootstrap exception; never apply the four remote roots locally.
For each bootstrap root, prepare its isolated environment, review its saved plan,
then apply that exact plan:

```sh
node infra/ci/prepare-production-bootstrap.mjs operator-project .local/lzc-prod/operator.json
. .local/lzc-prod/operator-project/environment.sh
tofu -chdir=infra/operator-project init -lockfile=readonly -backend-config=../../.local/lzc-prod/operator-project/backend.hcl
tofu -chdir=infra/operator-project plan -out=../../.local/lzc-prod/operator-project/review.tfplan
# Inspect the plan before this separate mutation:
tofu -chdir=infra/operator-project apply ../../.local/lzc-prod/operator-project/review.tfplan
umask 077
tofu -chdir=infra/operator-project output -json > .local/lzc-prod/operator-project/outputs.json
```

Repeat the same sequence for `seed`, then `seed-protection`, replacing the root
in every path. The seed preparation reads the project output and writes the
new project-scoped provisioning key privately. Seed-protection enables bucket
versioning. Capture each root's outputs privately. Preserve encrypted bootstrap
states in separate operator backup custody and their passphrases in a separate
secret store; `.local` is not a backup. Never commit or log outputs/passphrases.

Publish production infrastructure credentials using the operator's GitHub admin
session, with values transferred through stdin:

```sh
node infra/ci/configure-production.mjs infrastructure .local/lzc-prod/operator.json
```

This creates independent plan/apply Environments restricted to `main`; Apply
requires the named reviewer and administrators cannot bypass approval. Run
**Configurator Bootstrap** with `environment=lzc-prod`, first root `bootstrap`,
then `backend`; next run **Configurator Platform**, then **Configurator Runtime**.
Each workflow creates a source/run-bound encrypted plan. With `apply=true`, its
Apply job waits for approval of that plan. Apply only the saved plan from the same
run; retries, expired plans and cross-stage reuse fail closed.

## Domain, login and release bindings

Runtime IaC creates zone `landing-zone.runs.onstackit.cloud`, its `app` CNAME to
`console.apps.01.cf.eu01.stackit.cloud.` and the private CF application domain.
After route mapping, STACKIT issues TLS asynchronously. Public readiness waits
with normal certificate validation; it never bypasses TLS checks. Verify public
DNS delegation and certificate issuance for the first deployment.

Register a dedicated **public** STACKIT IDP client with PKCE S256 and these exact
redirects; no STACKIT client secret is required:

- `https://app.landing-zone.runs.onstackit.cloud/auth/stackit/callback`
- `https://app.landing-zone.runs.onstackit.cloud/auth/stackit/proof-callback`

Everyone able to authenticate through STACKIT IDP can sign in. Workspace isolation
and verified organization/landing-zone permissions still govern access and
execution. Development login is not enabled by the production release.

Read platform/runtime outputs privately with their respective production state
keys into `.local/lzc-prod/platform/outputs.json` and
`.local/lzc-prod/runtime/outputs.json`; follow the remote-state preparation in the
[CI workflow](../infra/ci/README.md), without a local Apply. Create a durable,
independent 32-byte base64 artifact encryption key in `.local/lzc-prod/artifact.key`
(mode `0600`), once, and back it up separately. Fill `stackitClientId` in the private
config, then publish the explicit allowlisted binding:

```sh
node infra/ci/configure-production.mjs release .local/lzc-prod/operator.json
```

The publisher excludes organization-manager and Assistant-test credentials.
Repeat after credential rotation; do not regenerate the artifact key. Rotating it
without recovering/re-encrypting existing artifacts makes them unreadable.

## Publish and activate a version

1. Merge the checked source to `main`.
2. Run **Configurator Release** with `build_only=true` and the selected
   `release_mode`. All non-inference application, browser, database, native and
   packaging checks remain mandatory. The build publishes its immutable artifact
   and protected source-bound image buildpack tag.
3. Run **Configurator Production Release** on the same `main` revision, supplying
   `version=v2.0.0`, that successful build run ID and its exact release mode.
4. The workflow verifies the artifact and publishes a stable GitHub Release with
   concise notes, checksums, provenance and durable application/Runner assets.
   It then prepares the `lzc-prod-release` job for **manual approval**.
5. Review the published source, notes and known limitations, then approve in
   GitHub. The job downloads those published bytes unchanged, validates both
   Runner and database migration, and activates only after all staging lanes
   succeed. It checks HTTPS, STACKIT PKCE, unauthenticated tenant boundaries and
   the isolated Runner afterward.

A human-published GitHub Release with the same assets also triggers this workflow.
The in-workflow publication continues directly to the protected job because events
created with `GITHUB_TOKEN` do not start another workflow. Arbitrary Actions
artifacts, pre-releases and Dev exception artifacts cannot deploy to production.

For the initial release, `accepted-assistant-limitations` is an explicit operator
acceptance: the manifest records `assistantQualified: false` and links
[issue #225](https://github.com/stackitcloud/stackit-landing-zone/issues/225).
The Assistant is enabled; intermittent model-service HTTP 400 failures and full
qualification remain open. This mode never claims successful qualification.
`qualified` still requires the repeated live suite. The existing
`dev-skip-assistant-qualification` mode remains Dev-only and non-promotable.

## Recovery and rotation

Keep previous published release assets and their protected buildpack tags.
Re-running a failed job is deliberately rejected: start a new workflow and review
a new plan/release run. For an application rollback, start **Configurator Production Release** with
`publish=false` and a previously published compatible version tag; preserve the
database, artifact key and customer state.
Schema migrations are forward changes: review backward compatibility first and
use a tested database restore when required. Do not restore an older app blindly
over incompatible schema or automatically undo customer infrastructure.

Before production acceptance, exercise database restore into an isolated target,
bootstrap-state recovery and secret/artifact-key recovery. Record actual recovery
times. Nightly retention and bucket versioning alone are not restore evidence.
Rotate the 90-day provisioning key, expiring state-storage credentials and bounded
model tokens before expiry; republish only the affected protected credentials.
Monitor three web replicas, database health, failed jobs, Runner capacity, HTTP
errors and backup age. HA topology does not replace alerts or an on-call process.
