# Assistant Service Knowledge

[English](README.md) | [Deutsch](README.de.md)

The [shared service guidance contract](../assistant-service-guidance.md) applies
to every topic. Editor and Assistant share one field-to-catalogue registry;
selection questions use server-authored project/region options, descriptions and
matched PIM facts. UI selectors, draft notices and reviewed English field
overviews are shared behavior. New services extend the registry/adapter and
reviewed facts, rather than introducing another service-specific question UI.

English is the canonical machine-ingested topic language. German topic companions
are human reading versions only; the manifest does not ingest them. Use the
catalogue below to switch languages without changing curated prompt sources.

## Architecture Contract

Approved architecture, 2026-10-10: curated Markdown per domain/service, with a
strict manifest and a generated backend bundle. The initial SNA/credential
pair is expanded to the complete topic catalogue below. No automatic ingestion of arbitrary documentation, websites,
customer files, states, plans or secrets. Markdown explains capabilities;
Accelerator input schemas, patch validation and the shared compiler decide
what can be configured. Knowledge never grants permissions or new features.

Source of truth:

- manifest.json: stable topic ID, Markdown file, topic version, checked date,
   local qualification, feature groups, mandatory flag, covered root inputs, dependencies, local
  authoritative source paths, external references and A01-A24 scenario IDs.
- Topic Markdown: curated service facts, dialogue requirements and examples.
- Generated knowledge-topics.generated.ts: deployable snapshot with topic and
  local-source SHA-256 hashes, engine revision and content. Do not edit manually.
- knowledge.ts: deterministic selection, global rules, generated field metadata,
  template metadata and complete bundle hash.

Editor chat now uses the [shared model-led consultation](../assistant-consultation.md).
The model chooses scoped knowledge, native-field/default and catalogue reads and
submits typed draft proposals for compiler validation. The server returns useful
validation feedback and a compiler-produced delta for the shared semantic final
review before the answer is presented. There is no per-service intent
classifier or scripted product dialogue in this runtime.

Mandatory knowledge and dependencies remain authoritative. All 19 topics are
available within selected feature groups. Mandatory rules and the active brief start
the consultation; native tools retrieve service facts, field metadata, current public
values and catalogue data. Already delivered rules are referenced rather than repeated. Configuration reads can select individual
paths such as `rm_folders[*].name`, preserving stable keys without exposing folder
IAM metadata. The API contains the compiled snapshot; it cannot read arbitrary
runtime documentation, URLs, State, secrets or customer files.

The stored source-bound brief retains confirmed requirements and open decisions.
The browser's explicit language controls replies. Numeric requirements are compared
with scoped offerings and reviewed ceilings using one shared evaluator. A uniquely
fitting recommendation remains visible while another decision is open; it is not
another required confirmation. Native-default selections resolve to actual native
values, including omission/null semantics, and remain reviewable draft changes.
Actual native defaults may also be labelled assumptions in an unapplied proposal.
Explicit restrictions and decisions the user reserves take precedence; an unanswered
question is not consent. The proposal displays default provenance for review.

Folder display-name changes preserve stable keys, parent bindings, permissions and
identities. Actual source checks, protected fields, the compiler, tenant ownership,
revision-bound acceptance and separate Save/Plan/Apply remain authoritative.
The model explains reviewed boundaries such as managed Git reachability, Git user
limits and State coordination using supplied facts rather than generic form copy.

The former controller remains temporarily available only as
`LegacyAssistantModelServing` for labelled historical comparison tests and the
separate template-advice implementation. Those comparison tests do not qualify
the new Editor runtime. See the consultation reference for transport, deadlines,
private memory and transition evidence requirements.

### Real-model qualification

Changes to service facts, prompts, knowledge selection or component contracts
require targeted synthetic tests against the configured real STACKIT models,
not just mocked responses. Run each affected case at least twice independently:

```sh
npm run test:assistant:live -- --topic dns-zones --repeat 2
npm run test:assistant:journey
```

For workstation-only credentials, append `--local-credentials`; never paste a
token into a command or test fixture. This reads the dedicated test token from
the private authenticated-encrypted platform recovery snapshot, only in memory;
it never falls back to the application token. Provisioning and the explicit
CI transfer are described in the [infrastructure runbook](../../infra/ci/README.md).
The harness rejects enabled execution,
uses synthetic identities and configuration drafts, and never calls Plan/Apply.
Proposals are locally applied, JSON-roundtripped and exported as native tfvars.
Receipts bind results to model IDs, knowledge/suite hashes, iteration and export
checksums. Every failed iteration remains a failure; repetitions are not retries.
The harness permits one to three iterations and paces model requests.
The production client permits one additional request only for allowlisted
temporary network failures before HTTP response headers arrive. A 250-500 ms
jittered delay and both attempts share the original request deadline (60 seconds
by default); cancellation stops the wait or request. Response-body interruptions,
HTTP errors, authentication failures and invalid model answers are not retried.
This reissues inference only, never Plan/Apply or configuration persistence;
a lost response can still mean the upstream processed the first inference.
Every recognized transport failure records its allowlisted code, attempt number
and retry decision in application logs and synthetic receipts, never raw errors,
tokens or request content. An exhausted request still fails its iteration.
The harness uses the same production retry policy, not a CI-only recovery path;
these attempts do not replace the required independent repetitions or erase
earlier failed receipts.
CI uses the application's configured response model, without a test-only intent
classifier. Qualification of another model does not qualify this runtime. The
complete repeated suite and continuous journey are required for shared changes.
DNS cases retain authoritative-role, visibility, contact and preservation checks.
Firewall cases retain setup/advice separation, requested HA, credential boundaries
and unrelated-field preservation. Lifecycle cases distinguish templates, platform
contracts, execution source and saved Plan review. None grants execution rights.

### Evidence and release status

Run-specific results belong to the source-bound receipts, CI artifacts and the
corresponding pull request, not a permanent public acceptance ledger. Preserve
failed experiments as evidence. A later passing run qualifies only its own
source and does not erase an earlier failure or certify a different deployment.
The protected `qualified` release workflow repeats qualification for its exact build;
local results alone never authorize promotion or deployment.

### Dev release without live Assistant qualification

During Model Serving outages, select
**release_mode=dev-skip-assistant-qualification** in
**Actions > Configurator Release > Run workflow**, branch **main**.
Leave **build_only** unchecked and **release_run_id** empty; set
**runner_pool_size=1**. Review the exact source/run and approve the existing
**lzc-dev-release** environment after all applicable build/publication checks.
This explicit Dev exception skips only the live Assistant qualification job.
`LZC_ASSISTANT_ENABLED` continues to use the existing environment setting;
the Assistant remains enabled when configured, without a new live qualification
receipt for this release. Model availability still determines whether inference
works. This is not a successful qualification and does not erase earlier failed
receipts. All non-Assistant checks, migrations, protected tags and Dev destination
guards remain in force. Conversations and proposals are preserved; existing
runtime validation, authorization and revision checks remain unchanged. No
production deployment or customer infrastructure Apply is authorized by this mode.

The manifest records Dev-only scope and `assistantQualified=false`; the build
job is named `build-dev-skip-assistant-qualification`. These artifacts cannot be
promoted using `release_run_id`, including as a qualified release. A deployment
failure requires inspection and a fresh manual run. `build_only=true` may build
this mode for inspection, but its artifact cannot subsequently be promoted.
A qualified release still requires a fresh **release_mode=qualified** run with
the complete source-bound live qualification. The default **qualified** path
and its promotion requirements are unchanged.

## Complete Topic Catalogue

| Topic | Scope | Languages |
| --- | --- | --- |
| credential-foundations | Provider, workload and native execution bindings | [EN](credential-foundations.md) / [DE](credential-foundations.de.md) |
| identity-foundations | Organization, owner, names/codes, region, labels, handoff namespace | [EN](identity-foundations.md) / [DE](identity-foundations.de.md) |
| governance-folders | Parents, folder roles, ownership and audit rights | [EN](governance-folders.md) / [DE](governance-folders.de.md) |
| management-state | Mandatory management project, state, Secrets Manager and operating identities | [EN](management-state.md) / [DE](management-state.de.md) |
| observability | Central, project and cluster telemetry/retention | [EN](observability.md) / [DE](observability.de.md) |
| audit-logs | Routing, archive, Object Lock and scope | [EN](audit-logs.md) / [DE](audit-logs.de.md) |
| federated-identities | Issuers/assertions for management operating identity | [EN](federated-identities.md) / [DE](federated-identities.de.md) |
| stackit-network-components | SNA, pools, transfer, prefixes and regional forms | [EN](sna.md) / [DE](sna.de.md) |
| dns-zones | Area zones, resolver selection and DNS dependencies | [EN](dns-zones.md) / [DE](dns-zones.de.md) |
| firewall-infrastructure | OPNsense appliance, LAN/WAN, zones, sizing and HA | [EN](firewall-infrastructure.md) / [DE](firewall-infrastructure.de.md) |
| firewall-policy | Aliases, routes, rules, NAT and port forwards | [EN](firewall-policy.md) / [DE](firewall-policy.de.md) |
| firewall-access-bootstrap | Administration, API bindings and bootstrap phases | [EN](firewall-access-bootstrap.md) / [DE](firewall-access-bootstrap.de.md) |
| vpn | Gateway/plan, peer/tunnel, routing and IKE/IPsec boundaries | [EN](vpn.md) / [DE](vpn.de.md) |
| devops-git | Managed Git service and ACLs | [EN](devops-git.md) / [DE](devops-git.de.md) |
| platform-kubernetes | SKE/node pools, DNS, monitoring, KMS and bastion | [EN](platform-kubernetes.md) / [DE](platform-kubernetes.de.md) |
| project-templates | Public/corporate projects, roles, services and application parameters | [EN](project-templates.md) / [DE](project-templates.de.md) |
| sandbox-projects | Sandbox ownership and native project list | [EN](sandbox-projects.md) / [DE](sandbox-projects.de.md) |
| namespace-services | Namespace/RBAC, secret policies, break-glass and explicit demos | [EN](namespace-services.md) / [DE](namespace-services.de.md) |
| configuration-lifecycle | Workspace, advice handoff, revision/expiry, versions and execution gates | [EN](configuration-lifecycle.md) / [DE](configuration-lifecycle.de.md) |

Every current root input has at least one manifest topic; the generator rejects
missing/unknown inputs. The existing 501-path catalogue remains the field-level
authority. A root mapping is not proof that every nested field has a qualified
dialogue. A01-A24 assignments cover the scenario catalogue, not successful tests
for all scenarios. New root inputs require explicit reviewed topic mappings.
New child-module options still require verified root wiring before advertising.

Template values are never user consent to configure or enable optional services.
"Firewall later" is not "deploy firewall now". Existing inherited settings must
be distinguished from requested changes and incompatible settings flagged.
A full native apply still includes mandatory foundations and every enabled
component; a focused chat step is not a targeted Terraform execution.

## Fixed Topic Structure

Every topic must have one H1 title and these H2 sections in this order. Do not
add, rename or omit sections; use H3 headings within a section if needed.

```markdown
# Service Name

## Purpose
User needs this service can solve.

## Accelerator Contract
Native fields, supported forms and compiler/patch restrictions.

## Dependencies
Relationships to other components and declared topic dependencies.

## Dialogue
Business questions, existing-context reuse and permissible assumptions.

## Examples
Synthetic user requirement and native configuration, never secret values.

## Limits
Unsupported capabilities and separate validation/execution gates.

## Credentials
Required external bindings and safe workflow, never credential values.

## Sources
Interpretation of manifest references, review triggers and existing tests.
```

Write precise facts, not an exhaustive encyclopedia. Separate mathematical
reasoning, user assumptions, implemented functionality and live facts. Lists of
current SKUs, prices, flavors and versions belong to authorized live catalogues
and public PIM, not copied static tables. Service-specific bindings must work
with the native Accelerator contract, not depend on hidden Configurator state.
Use examples without customer identifiers or secrets. Existing unknown import
fields must remain preserved outside the model context.

## Adding a Topic

1. Verify the Accelerator/module and shared feature contracts first. Missing
   features require concept, module/schema, validation, import/export, Editor,
   assistant, credentials and tests, not merely a knowledge file.
2. Add a topic using the structure above, then a manifest entry. Reuse existing
   documentation as authoritative sources instead of duplicating every detail.
3. Assign existing root inputs, feature groups and A01-A24 scenarios. Add explicit dependency
   IDs; unknown dependencies and cycles fail. Mandatory credential foundations
   and configuration lifecycle cannot be removed. Global contract rule IDs cannot be reused as topic IDs.
4. Review sources and content, update version/checkedOn, and generate the bundle
   from the app directory using the pinned repository toolchain:

```sh
npm run knowledge:generate
npm run knowledge:check
npm run check
```

5. Review both Markdown and generated changes, add focused behavioural tests to
   existing suites and qualify a synthetic model-to-native-export roundtrip.
   Generation and a clean test do not constitute a reviewed production release.

Reviewed context-budget decision for full scope, 2026-10-10: maximum 20 topics,
8000 characters per topic and 48000 characters
total, eight dependencies/groups per topic and twelve local source references.
The 19-topic catalogue fits without truncation; shared explanations were shortened.
Do not silently truncate required knowledge. Increase limits only with a reviewed
context-budget decision. External links are recorded but never fetched by the
generator or at runtime. Checked dates are author-maintained review metadata,
not an assertion that an external page was fetched recently.

## Versioning and Acceptance

### Provisional Response Streaming

Editor chat streams only the final validated explanation. Read/tool steps and
unvalidated proposals are not streamed as advice. Existing NDJSON and JSON clients
remain supported; cancellation and response limits still apply. The separate
legacy template-advice API retains its bounded contract. No stream grants
persistence or cloud execution.

### Conversation and Change Contracts

Questions expose bounded `text`, `options` and `multiple`, with up to six distinct
160-character choices and free text. Selection prepares question-associated user
text; it does not send, accept or mutate automatically. The combined message limit
still applies. Recommendation cards show source-bound requirements and facts and
persist with the scoped message; they are not another confirmation.

Diff selection requests a new reviewable proposal. The final diff is checked and
accepted explicitly; Save, Plan and Apply remain separate. Protected fields,
identity sources, native types, root completeness, tenant and revision guards
remain authoritative. Field defaults are read from the native contract, not a
parallel list. Display-name updates preserve folder keys and access metadata.

The consultation brief is private server state attached to the existing
conversation message. Confirmed decisions cite actual user turns; unsupported
memory is discarded. Knowledge hash changes invalidate the brief, not the original
history. Discarding closes pending context. New responses preserve the original
expiry and atomically replace the proposal and knowledge hash. Stale proposals
cannot be silently accepted. Migration 102 gives saved configurations one shared
conversation with workspace authorization and attributed messages. Existing private
histories require their author’s explicit sharing into an empty shared conversation.
The browser reloads on workspace/configuration switches and polls for team updates.
A different participant rebuilds the consultation brief from shared history using
their own current identity; another participant’s private brief is not reused.

The bundle hash includes curated content, manifest metadata, engine revision and
local source fingerprints. Source edits make generated knowledge stale and require
reviewed regeneration. Build/start do not automatically approve new knowledge.
