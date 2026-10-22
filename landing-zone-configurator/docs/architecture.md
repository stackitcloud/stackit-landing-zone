<a id="stackit-zielarchitektur-des-landing-zone-configurators"></a>
# STACKIT target architecture of the Landing Zone Configurator

[English](architecture.md) | [Deutsch](architecture.de.md)

This reference describes the implemented components and their
trust boundaries. The development environment uses STACKIT OIDC; custom
password management is not planned. Operation in development
is not evidence of a production-qualified environment. The separate
[MVP limitations](mvp-scope.md) and [development references](development.md) identify
remaining tasks.

<a id="technische-praesentationssicht"></a>
## Technical presentation view

![STACKIT target architecture of the Landing Zone Configurator](architecture/stackit-overview.svg)

[Full-size SVG overview](architecture/stackit-overview.svg) ·
[PNG for presentations](architecture/stackit-overview.png)

The overview is a deliberately simplified 16:9 presentation graphic:
core components each have a title and subtitle. It shows the
main flow UI -> backend -> Runner -> Landing Zone and connected
identity, repository, database and AI services. Lines show basic
relationships, not individual protocols or data flows. The blue
background identifies STACKIT infrastructure; only GitHub with the
Accelerator repository is outside it. The darker CF area contains
Web UI, Configurator API and Runner.

Editor and chat are parts of the same Web UI. The Configurator API hosts
Assistant logic, knowledge, validation and orchestration. Model Serving provides
the two model roles for responses and intent detection; it does not run
the actual Configurator Assistant. Two model roles do not have to be
two different models: without a separate intent override, both
roles use the configured response model.

GitHub and its Accelerator repository connect to the API:
the API works with templates and input contracts derived from them.
These are incorporated as versioned build inputs; the graphic does not claim
live downloads of arbitrary repository revisions. The Runner executes the matching
pinned Accelerator/provider revision with OpenTofu.

The CF grouping shows the hosting platform, not a shared CF organization
or service bindings for all components. Web UI and API are
delivered together; Runners remain isolated. Router, secrets/state management,
CI/CD and migrations are deliberately omitted from the presentation view.
The SVG is directly editable.

<a id="logische-praesentationssicht"></a>
## Logical presentation view

![From templates to Landing Zones](architecture/landing-zone-logical.svg)

[Logical view as SVG](architecture/landing-zone-logical.svg) ·
[PNG for presentations](architecture/landing-zone-logical.png)

The second drawing shows the domain relationships without runtime services:

- The **Platform Engineer** uses platform templates as a starting point,
  creates the platform configuration and provisions the **Platform Landing Zone**.
- In this draft, they also define **Application templates** and release
  reviewed versions to the catalogue.
- The **Application Owner** selects an approved template and adds the
  concrete project parameters in an order. This produces
  **Application Landing Zones** based on the common platform.

Additions in the logical view:

- **GitHub Repository / Landing Zone Configurator:** version foundation of the
  application and its configuration contracts. Configurator code currently resides
  in the `landing-zone-configurator` subdirectory of the shared
  `stackitcloud/stackit-landing-zone` repo; the drawing does not claim an
  additional independent repository. Customer configurations can
  be versioned separately in personal Accelerator forks. The line
  does not mean customer documents end up in the Configurator source repo.
- **Green AI marking:** assistance with platform configuration and
  Application template drafts. It represents proposals and
  questions, not automatic publication, role assignment or
  cloud execution. For already published templates, the
  marking refers to their preceding draft, not a silent change
  to published versions.
- **Platform Engineer -> Application Owner / authorized:** granting
  tenant-bound membership or catalogue authorization.
  Membership management requires the separately delegated administrative capability;
  the Platform Engineer role alone does not automatically grant it.
- **STACKIT Service Account:** authorized technical cloud access for
  provisioning platform and applications. It is not a user login
  and replaces neither Configurator roles nor required approval.
  Credentials are not handed out to the Application Owner; usage
  is server-side and job-bound.

The arrows condense deliberate work steps, not automatic
publication or Apply approval. Platform configuration does not
already create Application instances. Template versions and concrete orders
remain separate objects; roles apply per working environment.

Template retirement and catalogue deletion are separate append-only records.
Retired versions appear in the Platform Engineer archive. The deletion function
revalidates the current tenant session and Platform Engineer role, takes the same
transaction advisory lock as ordering/retirement and rejects any historical order,
including tombstoned orders. Only unused retired versions can leave the archive.
Publication documents, version numbers, deletion receipts, orders and State bindings
remain immutable; a new publication cannot reuse a deleted version number.

<a id="technische-detailreferenz"></a>
## Technical detail reference

For complete relationships, the separate CF Control Plane,
the migration app and remote-state verification, see also the
[detailed SVG drawing](architecture/stackit-target.svg) and its
[editable Mermaid source](architecture/stackit-target.mmd).

**Reading the detailed drawing:** arrows show calls or the labeled
data flow. Double arrows combine request and response. Dashed
arrows describe the release/migration path, not customer provisioning.
Boxes distinguish operator runtime, Runner isolation, managed services,
GitHub and customer resources; they do not promise private network connections.
The STACKIT API box represents the addressed target organization, not
API servers physically running within it.

<a id="bereitstellung-und-verantwortlichkeiten"></a>
## Deployment and responsibilities

| Component | Deployment model | Purpose |
|---|---|---|
| Web UI | React SPA, served by the CF web process | Editor and chat, templates, job status and explicit approvals |
| Configurator API | Node.js/Fastify in the same CF app | Authentication, tenants/roles, validation, configuration compiler, AI Assistant, GitHub integration and job broker |
| CF Router | Cloud Foundry routing and HTTPS route | Browser access to UI and API; no direct browser connection to DB or Secrets Manager |
| Runner | Separate CF organization and space; one-shot warm process or cold app/task per job | Pinned OpenTofu/provider/Accelerator execution; cleanup afterwards |
| PostgreSQL Flex | STACKIT Managed Database | Sessions, memberships, drafts, templates, jobs, audit and encrypted Plan/recovery artifacts |
| Secrets Manager | STACKIT Managed Service | Protected service-account keys, GitHub tokens and backend credentials |
| Model Serving | STACKIT AI Model Serving | Models used by the backend for responses and intent detection |
| STACKIT IDP | STACKIT Production; separate client per application environment | OIDC Authorization Code Flow with PKCE S256; dev CF app does not mean dev IDP |
| GitHub | External platform | Optional user connection for forks, configurations and pull requests; separate from STACKIT login |
| Landing Zone Accelerator Repo | `stackitcloud/stackit-landing-zone` on GitHub | Versioned infrastructure source; approved revision pinned and packaged in the build |
| GitHub Actions | Protected CI/CD pipeline | Tests, release artifacts, promotion, Runner staging and migrations |
| Object Storage / S3 | State backend of the customer's Landing Zone | Durable OpenTofu state, lockfiles and separate state keys |
| STACKIT APIs / target resources | Selected customer organization and projects | Technical permission verification, catalogues and approved provisioning |
| Migration app | Short-lived CF app without a route | Versioned DB migrations with separate owner role; no owner credentials in the web process |

**UI and backend are logical services, not already-decided separate
CF microservices.** The current release delivers both in one CF app.
Later physical separation is possible, but not part of this drawing.
Backend functions are currently also modules of one API process.

## Optional one-shot warm Runner pool

`LZC_RUNNER_POOL_SIZE=0` preserves cold dispatch. Values `1`–`4` maintain that many
idle, route-free CF processes with the pinned package already loaded. The manual
development release exposes the same `runner_pool_size` choice. Each reserve
uses 1 GiB RAM and a 4 GiB disk budget; active jobs and replacements need additional
quota. This is not an arbitrary Terraform execution service.

The API stores operator-owned slot metadata in PostgreSQL, independently of tenant
configuration. A fresh bootstrap capability can poll only its own slot. The pool
holds no customer credentials, state or working directory while idle. Assignment
atomically reserves a fresh heartbeat and matching origin/template/droplet,
records the job's execution identity, then publishes an encrypted, job-bound
capability. Consumption clears the ciphertext and revokes the bootstrap token.
The worker accepts exactly one assignment and runs the unchanged authorized job
broker flow. It never accepts another tenant's job in the same environment.

Warm dispatch avoids per-job CF app creation, droplet copying and process startup
when capacity is ready. Backend initialization, state locking, source verification
and explicit saved-plan Apply approval remain required. An empty pool uses the
existing cold path; assignment/recording failures do not silently retry on another
Runner. Standbys are replenished, expired or unhealthy slots are removed, and
setting capacity to zero drains idle capacity without terminating active jobs.
Old package identities cannot be leased by a new release.

Release qualification claims a warm slot using an intentionally unknown job,
which cannot retrieve execution credentials, and checks consumption, cleanup and
replacement readiness. Only bounded timing values are exported. The probe is not
a customer Plan/Apply or a Firewall failover qualification.

<a id="die-vier-wesentlichen-ablaeufe"></a>
## The four key flows

<a id="1-anmeldung-und-organisationszugriff"></a>
### 1. Login and organization access

The browser redirects to the STACKIT IDP. The backend callback exchanges the
authorization code with PKCE, checks identity and creates an opaque
Configurator session. Organization access and binding authority are separately
checked through the designated STACKIT APIs. Login, tenant membership and
cloud permissions are different evidence.

GitHub remains an optional second connection **for repository features**,
not a replacement for STACKIT login or organization permissions.

<a id="2-entwurf-und-assistant"></a>
### 2. Draft and Assistant

UI inputs and Assistant proposals pass through the same native
configuration contracts. Only the backend calls Model Serving. It passes
the bounded configuration context, no service-account keys or
GitHub tokens. A model call starts neither a Runner nor an Apply.
Proposal acceptance, saving, Plan and Apply remain separate steps.

<a id="3-freigegebene-ausfuehrung"></a>
### 3. Approved execution

The backend checks role, tenant, target, configuration/source version,
state binding and required approval. It dispatches the job through
the CF API into the **separate Runner organization**. The Runner receives only
job-specific inputs and credentials through a limited job ticket.
It has no Configurator DB/Secrets Manager service bindings and no
CF dispatcher credentials.

The Runner reports status and results to the broker, which persists
them in PostgreSQL. Cloud operations use the explicitly authorized
service account, not the human login token. Plan and Apply are
different operations; Apply requires the reviewed saved Plan
and matching approval.

### Execution and state

**State is not the configuration database:** the first platform bootstrap
temporarily uses the API's persistent encrypted HTTP state backend.
Only after the approved bootstrap Apply is state migrated to the customer
S3 bucket created by the Accelerator and verified. Platform and
Application states receive separate keys with lockfiles. The
Configurator's own infrastructure state is separate again.

The backend stores Plan artifacts encrypted in PostgreSQL.
CI release artifacts reside in GitHub Actions. The artifacts bucket
additionally defined in operator IaC is **not** evidence that these artifacts
are already offloaded there; it is therefore not drawn as an active data path.

<a id="4-software-lieferkette"></a>
### 4. Software supply chain

CI builds and tests a fixed Accelerator revision, the API/UI release
and Runner package. The qualified artifact is delivered through protected
promotion; Runner jobs do not arbitrarily load the current
repository head. Versioned DB migrations run beforehand in a separate
short-lived migration app. Application release and customer Plan/Apply are
independent approvals.

<a id="wesentliche-ergaenzungen-zur-urspruenglichen-komponentenliste"></a>
## Key additions to the original component list

1. **Secrets Manager:** necessary for technical credential management.
2. **Object Storage / state backend including locking:** necessary for
   reproducible and conflict-free infrastructure management.
3. **STACKIT APIs and customer resources:** make visible what the Runner
   actually manages and with which technical credentials.
4. **CF Router and Control Plane:** separate user access from task dispatch.
5. **CI/CD, release artifacts and migration app:** show source, supply chain and
   separation of DB owner and runtime permissions.

A production-ready operational architecture must also define:

- Central logs, metrics, alerting and retention. CF logs and
  database audit do not replace a complete monitoring/alerting concept.
  A concrete Observability/Telemetry Router integration for the **Configurator**
  is not presented here as already configured.
- Verified DB backups, secret/artifact key recovery, S3 versioning
  and restore tests. Loss of the existing artifact key
  must not be concealed by spontaneous rotation.
- Scaling/HA and shared storage or sticky routing for ongoing
  OIDC flows. The current single-instance application is not HA evidence.
- Network paths, ACLs and egress rules. A CF Runner does not automatically
  have access to private Kubernetes/Helm/firewall endpoints in customer SNAs.
  This execution boundary remains separately resolvable (#37).
- Narrowly scoped operational/deployment identities, controlled CF space rights
  and least-privilege qualification of the OIDC client.

**No** additional queue service is assumed: job metadata
resides in PostgreSQL, and the broker dispatches CF tasks. A general scheduler
would be a separate later architecture decision.

<a id="grundlagen-und-weiterfuehrung"></a>
## Background and further reading

- [CF release and service bindings](../deploy/cloud-foundry/README.md)
- [Runner package and Accelerator pin](../deploy/runner/README.md)
- [Plan execution, broker and state lifecycle](plan-execution.md)
- [Login and organization proof](github-login.md)
- [Platform/Application contracts](platform-application-architecture.md)
- [PostgreSQL Flex](../infra/platform/2-database.tf),
  [Secrets Manager](../infra/platform/3-secrets.tf) and
  [Model Serving](../infra/platform/5-model-serving.tf)

The detail SVG is rendered locally with Mermaid CLI 11.12.0 from the Mermaid source.
The overview uses exclusively local SVG shapes and system fonts.
No credentials, configurations or diagram sources are sent to an
online renderer.
