# Separate Application Landing Zone root

This root plans **one new application instance**, reusing `../modules/landing-zone`.
It does not create platform folders, SNAs, platform services or other applications.
It works with manually resolved CLI inputs or Configurator-generated inputs.
No Configurator API, database, session, job grant or template engine is required
for direct CLI use. Do not migrate existing combined state by changing directories
or deleting its `landing_zones` entries: that can plan destructive changes.

The Configurator resolves templates and checks its own identity/approval policies.
CLI users supply the resolved values directly, including owner and service
settings. In either mode, STACKIT IAM and backend policy enforce permissions;
input metadata, template versions and provenance labels are not an IAM boundary.

The reused module creates a project, an automation service account and its key,
Object Storage buckets/credentials, plus the selected Secrets Manager and
Observability services. Corporate instances reference a platform-owned SNA and
create their project network/routing. Public instances can optionally create a
local project network using `network_enabled`, with an optional
`network_prefix_length`. This network is not SNA-routed; legacy public inputs
without the option continue to create no network. Schema 2 templates fix these
values rather than allowing order overrides. The root exposes a non-secret
`project_network` reference, not service credentials. A local network does not
qualify its private CIDR as an Observability ACL source. This scope must appear in template
publication and plan review. Generated credentials remain in the protected
application state; they are not exposed by the root outputs.

## Independent two-phase CLI workflow

### Phase 1: Platform

Use the normal [Accelerator bootstrap procedure](../../docs/getting-started.md).
For a **new** platform-only installation, explicitly configure `landing_zones = {}`,
`sandboxes = []` and `landing_zone_namespace_services = {}` before the first Apply.
Retain the required platform services and governance folders. The existing root
remains compatible with combined installations; a separate physical platform root
and existing-state migration are not introduced here.

After reviewing and applying the platform plan, export only the non-secret handoff:

```sh
tofu -chdir=src output -json platform_contract > platform-contract.json
```

This contains organization, folder, region, SNA, next-hop and nameserver references,
not complete platform state or credentials. Its revision is a deterministic UUID
derived from the namespace and exported references. Changed references change the
revision; retain the reviewed artifact with the application configuration.
`tenant_id` is a logical namespace, defaulting to the organization UUID. Optional
`platform_contract_namespace` allows another stable UUID, for example the intended
Configurator workspace. No Configurator-issued UUID is required for CLI use.
Public targets are `public-eu01`/`public-eu02`; corporate target keys contain a stable
hash of the area key, so arbitrary area names cannot create invalid/colliding
normalized target names. Only present governance folders/SNAs are exported.
An exported target is a resource reference, not permission to deploy there.

### Phase 2: Application

Start with [the resolved JSON example](examples/application.tfvars.json.example).
All example IDs are fictitious. Replace `platform_contract` with the Phase 1
artifact and fill in the application values manually. No template rendering is
needed. Set `application.tenant_id` and `application.platform_revision` exactly
from that artifact; choose one of its target keys. Allocate `instance_id` once
(for example `uuidgen | tr '[:upper:]' '[:lower:]'`) and keep it stable.
`template_id`/`template_version` record your chosen baseline; they do not require a
published Configurator template. Owner, roles, network and service settings must
be reviewed under your organization's deployment policy.

Provision an application-state bucket **before** the first Application Plan.
Use [the backend example](examples/backend.hcl.example), replace its bucket/key,
and keep the key `applications/<namespace>/<instance>/terraform.tfstate` unique
and unchanged. Use appropriately restricted backend credentials, not credentials
that give an Application Owner access to platform state. Supply S3 credentials
through `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, and provider credentials through
the standard STACKIT provider environment. Do not put secrets into either artifact.
The project's own tfstate bucket cannot bootstrap its own first plan.

With reviewed files named `application.tfvars.json` and `backend.hcl` under the
Application directory, run from the repository root:

```sh
tofu -chdir=src/application init -backend-config=backend.hcl
tofu -chdir=src/application validate
tofu -chdir=src/application plan -var-file=application.tfvars.json -out=application.tfplan
tofu -chdir=src/application apply application.tfplan
tofu -chdir=src/application plan -var-file=application.tfvars.json
```

Review the saved plan before explicitly applying it. Keep state, saved plans and
credentials private. Never disable locking to work around another active job.
Use a separate initialized working copy per instance; do not switch instance
keys casually in one working directory. Upgrades require a reviewed new Plan,
not automatic changes when a template or platform contract is published.

## Provenance

Resources that support labels receive `landing_zone_accelerator = "true"`.
Direct CLI use does not claim Configurator execution. The Configurator sets
`application.configurator_execution = true`, adding
`landing_zone_configurator = "true"` and retaining its legacy `lzc_*` labels.
Labels are descriptive and can be inspected/changed by authorized cloud users;
they are not tamper-proof execution evidence. Existing pinned runner sources are
not rewritten or activated by these source changes.

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

The checked-in manual example is included in the mock tests. The independent
platform-only export test runs without the Configurator:

```sh
LZC_TEST_TOFU_BIN="$(command -v tofu)" bash src/tests/check-cli-contract.sh
```

Remaining acceptance: real separately authorized two-phase CLI Plan/Apply,
backend lock/recovery, least-privilege credentials, explicit existing-state
migration and completed Configurator dispatch. Mock tests are not cloud acceptance.
