# Separate Application Landing Zone root (prototype)

This root plans **one new application instance**, reusing `../modules/landing-zone`.
It does not create platform folders, SNAs, platform services or other applications.
It is not yet connected to the Configurator API/runner and must not be used to
migrate an existing combined state by changing its working directory.

Inputs are compiled on the server from a published template, a verified user and
an approved platform contract. The first template fixes service settings and only
allows the application name and a published target to be chosen. The OpenTofu
root is not an IAM boundary: callers able to bypass the server also need to be
restricted by STACKIT permissions and backend policy.

The reused module creates a project, an automation service account and its key,
Object Storage buckets/credentials, plus the selected Secrets Manager and
Observability services. Corporate instances reference a platform-owned SNA and
may create their project network/routing. This scope must appear in template
publication and plan review. Generated credentials remain in the protected
application state; they are not exposed by the root outputs.

The partial S3 backend must be initialized with the existing customer bootstrap
backend and an instance-specific key allocated by the server. The instance's
own tfstate bucket is a module resource and cannot bootstrap its own first plan.
Do not pass platform-state credentials to Application Owners. A template's future
`direct` Apply policy does not authorize Apply in this prototype.

Offline checks (no customer credentials or resources):

```sh
tofu -chdir=src/application init -backend=false
tofu -chdir=src/application validate
tofu -chdir=src/application test
```

The Configurator release CI also runs these checks through `npm run test:plan` in an
isolated temporary copy with an empty credential environment and disabled backend.

Tests use mock providers and plan commands only. Mock UUIDs are fixture data.
Known provider deprecation warnings originate from existing Observability outputs
in the shared module. The root/provider lock file should be retained when this
prototype is promoted into the reviewed runner revision.

Remaining: dedicated platform root/export, verified contract publication,
immutable template persistence/digests, tenant roles and identity onboarding,
instance allocation and idempotency, least-privilege credential delegation,
API/queue/runner integration, actual authorized cloud-plan test and migration.
