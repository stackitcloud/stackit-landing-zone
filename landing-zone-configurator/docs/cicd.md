<a id="cicd-für-den-landing-zone-configurator"></a>
# CI/CD for the Landing Zone Configurator

[English](cicd.md) | [Deutsch](cicd.de.md)

Status: validation, bootstrap/backend and platform pipelines are implemented and have run successfully. OpenTofu is invoked directly in the workflows, with normal live logs. Runtime and app release, including connection tests from CF, have passed acceptance; drift remains planned. First environment: **lzc-dev / eu01**. Current operation: [CI operations](../infra/ci/README.md).

<a id="getrennte-lebenszyklen"></a>
## Separate lifecycles

| Workflow | Trigger | Responsibility |
| --- | --- | --- |
| `validate-configurator.yml` (existing) | PR, main, feature branch, manual | App checks, IaC validation and mock tests without cloud access |
| `configurator-bootstrap.yml` | Feature push: Plan; prepared for manual use on main | Create state infrastructure, configure versioning, later rotate credentials |
| `configurator-platform.yml` | Infrastructure changes on feature branch: Plan; prepared for manual use on main | Plan platform IaC, apply reviewed Plan |
| `configurator-runtime.yml` | Runtime/CI changes on feature branch; prepared for manual use on main | CF space, organization membership, space role and runtime user |
| `configurator-release.yml` | App/release files on feature branch; prepared for manual use on main | Build and check web/API, deploy packaged release to CF and test connections from CF |
| `configurator-drift.yml` | Optional scheduled/manual | Detect and report infrastructure drift; initially no automatic Apply |

A normal app release starts neither bootstrap nor platform Apply. Relevant paths also include shared deployment scripts, lockfiles and the respective workflow file. Changes exclusively to the Accelerator do not trigger a Configurator release. Customer Landing Zone deployments remain a separate, tenant-isolated Runner flow and receive no operator CI credentials.

<a id="state-und-credentials"></a>
## State and credentials

An independent management bucket was created and versioned by `seed` and `seed-protection`. Bootstrap and backend store their encrypted states there. The platform uses the workload state bucket, which is also versioned. Each root has its own permanently retained key; a missing deployment key causes an abort. Protected environment secrets supply existing keys and credentials to CI; no local seed file is required.

Native S3 locks failed the integration test. The confirmed interim solution permits only jointly serialized CI Applies; direct parallel access by other credential holders is operationally prohibited. GitHub artifacts serve only review and recovery, not as a permanent state backend.

The infrequent bootstrap still requires expiry monitoring and rotation of temporary S3 credentials, including updates to all consumers. Independent key custody and full restore acceptance remain separate operational tasks.

<a id="infrastruktur-pipeline"></a>
## Infrastructure pipeline

1. Check out a trusted commit of the approved branch; use pinned tools and provider lockfiles.
2. Select root and environment from a fixed allowlist; load remote state and existing keys.
3. Create and store an encrypted Plan. The manifest binds commit, environment, root, input digest, lockfile digest, Plan hash and short validity. Display normal OpenTofu Plan output live; publish no full state/Plan JSON or credential outputs.
4. The Apply job uses a protected GitHub environment and exactly the reviewed Plan artifact from the same trusted run. Approval applies to this Plan. Expired or stale Plans are recreated and reviewed again.
5. Since native S3 locking does not work reliably, cross-workflow GitHub concurrency serializes mutating platform/runtime/release jobs per environment; `cancel-in-progress: false` for ongoing mutations. Do not assume fairness or FIFO ordering; reject older releases before deployment.
6. Pass outputs to consumers only selectively and under protection; log recovery and audit.

Bootstrap and backend versioning run sequentially. After bootstrap Apply, the backend Plan is created with the now-existing credentials. The platform follows after proven versioning under the confirmed CI-only operating model. Runtime then needs the platform's CF credentials. No Plan with still-unknown provider credentials and no routine `-target`.

<a id="anwendung-häufig-und-unabhängig-ausliefern"></a>
## Release the application frequently and independently

The implemented release workflow checks and builds web/API once; the worker follows. It creates a release identifiable by commit and SHA-256. Redeploy and later promotion use the same reviewed package; historical artifacts must be retained durably according to the rollback period. No rebuild during rollback.

The lifecycle owner is clearly defined: OpenTofu manages services, CF org/spaces, roles and shared service instances. The declarative release process manages app objects, app routes, app bindings, process configuration and code. These resources are not additionally managed by the runtime root. This keeps app provisioning and bindings reproducible as code too.

Sequence: check release → run compatible DB migration with a separate migration identity → CF deployment → readiness/smoke tests → mark release. Rolling deployment is preferred where supported by the foundation, quota and app processes; this still needs checking on the specific STACKIT foundation. Workers need drain/lease semantics so that replacement does not run jobs twice. Destructive DB migrations follow later; an app rollback does not automatically roll back a database.

Development: automatically deploy after successful validation on main once the environment is operational. Production later: explicit promotion of the reviewed release with approval. A manual redeploy selects a known release ID, not an arbitrary fork or shell command.

<a id="identitäten-und-vertrauensgrenzen"></a>
## Identities and trust boundaries

- Bootstrap: separate operator identity with the necessary project/Object Storage permissions.
- Platform: scoped STACKIT access; app release does not receive it.
- Release target model: separate CF deployment identity only for the target space. The initial development version still uses the existing org manager and reads its credentials from encrypted platform state; app credentials are separate. DB migrations are not yet implemented.
- Customers' personal GitHub/STACKIT credentials remain in the application and do not enter operator workflows.
- GitHub environments separate at least bootstrap, platform and app per environment. Environment rules and branch protection are managed as repository configuration through IaC/API; initial GitHub administrative permission and secret injection remain a necessary trust foundation.
- Never expose secrets to PR code; no privileged `pull_request_target` checking out fork code. Pin Actions to commit SHAs, use minimum token permissions, never print credentials in shell output.
- Prefer short-lived federated identities where STACKIT demonstrably supports them for these services. Until then, use rotatable, protected service-account credentials; do not assume GitHub OIDC compatibility.

Availability of environment approval rules depends on the GitHub plan and repository visibility. Check before enabling. Also check Runner network access to CF, S3 and private database endpoints; required private Runners are operated separately from untrusted PR jobs and provisioned through IaC.

<a id="umsetzungsreihenfolge-und-abnahme"></a>
## Implementation order and acceptance

- [x] Separate lifecycles and credentials; validate all six IaC roots and the app.
- [x] Set up management and workload backends; check versioning and state encryption.
- [x] Set up GitHub environments and approvals; pass existing deployment keys under protection.
- [x] Run bootstrap/backend and platform pipelines; demonstrate platform recovery and subsequent no-op.
- [x] Test native S3 locks and document them as unreliable; explicitly define CI-only operation.
- [x] Invoke OpenTofu directly in workflows; live logs, standard timeout and protected state backup.
- [ ] Independent key custody, complete restore process and automated credential rotation.
- [x] CF runtime, backend environment variables and connectivity tests from CF.
- [ ] Release manifests, packaging, migrations, readiness and worker drain.
- [ ] Demonstrate two app releases, independent redeploy and rollback without infrastructure change.
- [ ] Enable optional drift workflow and alerting.

The next extension is CF runtime with access tests to the database and Secrets Manager. The previous one-off recovery was removed from the normal deployment path; incident and restoration are documented in [platform operational status](platform-readiness.md).

<a id="quellen"></a>
## Sources

- [GitHub Deployment Environments](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments)
- [GitHub deployment control and concurrency](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments)
- [GitHub environment availability and setup](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
- [Cloud Foundry Rolling Deployments](https://docs.cloudfoundry.org/devguide/deploy-apps/rolling-deploy.html)

Details of the implemented release and its limitations: [CF release](../deploy/cloud-foundry/README.md).
