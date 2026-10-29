# Assistant Service Knowledge

[English](README.md) | [Deutsch](README.de.md)

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

Editor dialogue uses selected feature groups and their topic dependencies.
Credential foundations and configuration lifecycle are always included.
Template advice receives the bounded complete topic set. Current editor requests
select all feature groups, so all 19 topics are available; this is not semantic
retrieval by message. Dependencies select knowledge, not service activation.
There is no vector database, model-controlled retrieval or runtime filesystem
access to docs. The compiled API artifact contains the generated snapshot.
Topic text is supplied once as trusted curated rules; provenance is separate.
Customer input/history and PIM labels remain untrusted data, not instructions.

### Topic delivery contract

The generic Editor proposal path previously passed topic/field metadata without
the curated rule texts. This affected all 14 topics with native Editor proposals,
not just DNS. Editor proposals and conversational advice now share topic scoping:
the current topic, transitive dependencies, mandatory topics and all global rules.
Cross-topic Editor proposals also include the owners of every exposed field.
Unrelated topic texts stay out of the scoped answer context. Missing dependencies
fail explicitly; a restricted feature-group selection is preserved.

Intent classification deliberately receives topic summaries, not the full
advisory knowledge. DNS classification also receives the stable saved-zone keys and validated presence flags for domain, display name,
description and contact, plus confirmed owner/human contact availability. Actual
domain/contact values, unknown fields and credentials are excluded from this
additional classification context. The serving contract requires an explicit
DNS-task decision rather than suggesting the parser's legacy default. An explicit semantic
`remaining-settings` decision uses draft mode even if the classifier emitted a
contradictory advice mode. Existing domains and metadata are not missing setup
choices. Informational/no-change questions remain advice; completion still passes
all proposal, contact-source, preservation and explicit-acceptance guards. Firewall evidence classification receives user statements
only. Deterministic field overviews and the policy boundary use reviewed local
contracts without a second model call. Starting-template advice and synthetic
qualification retain their complete selected rule texts.

Regression tests inspect the actual outgoing model requests for all 19 advice
topics and all 14 Editor topics, including exact full texts, indirect dependencies,
mandatory/global rules, unrelated-topic exclusion and cross-topic proposals.
These mocked transport tests prove knowledge delivery, not the factual quality
of a live model answer or execution qualification. DNS guidance distinguishes
primary/secondary roles from visibility, explains that both are authoritative,
and states the native module's incomplete secondary-server setup.

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
CI uses the application configuration defaults for both answer and intent models,
without a CI-only classifier override. The effective model IDs are recorded in
every receipt. Qualification of an alternative model does not qualify the
application's configured model.

Active Firewall drafts and multi-turn Firewall conversations always use the
dedicated setup-scope/evidence classifier. A general field hint such as `ha`
must not bypass it: continuing broad setup with HA retains the remaining
traffic, capacity and interruption decisions. An explicit narrow native update
remains a field update, even after an earlier broad setup conversation, and does
not add unrelated setup questions. If no bounded user-evidence fragments exist,
evidence fields permit only null rather than an empty enumeration.

Intent and evidence schema descriptions are also sent in the classifier's system
context, not only as a structured-decoding constraint. Answer generation receives
the reviewed field and topic knowledge, without a second full schema dump.
For an explicitly named additional
DNS zone, source-grounded requested fields are required in that zone's proposal
schema. A requested contact cannot be mentioned only in the explanation or
silently omitted; fields requested for one zone are not required in other zones.
Runtime source, scope and native-configuration checks remain in place.

DNS cases check role meanings, authoritative answers, visibility separation,
the Primary recommendation, the incomplete native Secondary setup, correction
of earlier false advice and preservation when adding a zone. Their semantic
checks reject misleading answers and keyword-only replies, but remain bounded
regression criteria rather than a proof of universal factual correctness.
The continuous multi-topic journey also checks the DNS explanation after earlier
configuration steps and verifies that advice does not mutate the draft.

Default `qualified` release builds depend on the reusable live workflow: all topics run twice,
followed by the continuous dialogue even if individual model cases fail.
Raw synthetic receipts are retained as CI artifacts. Promotion requires the
original build's successful live-qualification job as well as its build job;
older builds without that proof cannot bypass qualification. A missing token,
unavailable model or failed criterion blocks qualification, not a silent skip.
General advice ends its merged trusted system context with an explicit
answer-completeness instruction: the explanation must contain the actual requested facts, native
defaults, limits and exclusions, not just introduce a missing list or refer to
contract metadata. Follow-up questions cannot replace the factual answer.
Compact field-family bullets target at most 2400 characters within the unchanged
3000-character response schema. Equivalent regional forms should be grouped,
not repeated until the answer is cut off. Pure informational field/default/limit
overviews need no configuration decisions and return no follow-up questions;
other advice still asks only missing business decisions, never protected inputs.
The bounded firewall requirements dialogue retains its separate short-answer
contract. Transport tests check this instruction's delivery; real-model factual
criteria still decide whether the resulting answers qualify.
Firewall access/bootstrap workflow overviews also use reviewed native-field metadata and bounded access/phase facts after semantic intent classification. This avoids a second generative request for a static overview. Admin login, API credentials and secure operator bindings remain separate; the overview never activates bootstrap, reads secrets or starts execution. Other advice retains the normal scoped generation path.

Template-version, platform-contract and execution-source upgrade advice use three closed semantic tasks. Only current-turn configuration-lifecycle advice selects their reviewed, bounded workflow descriptions; historical intent, proposals and other topics do not. These responses explain retained identity, explicit binding, fresh Plan and separate Apply, plus the distinct shared-platform and recovery boundaries, without a second generative call. They never inspect or change an order. Other advice keeps scoped answer generation.

For native field overviews, semantic intent classification selects the existing
reviewed-metadata response when available, rather than generating the same static
contract again. VPN, DevOps Git and DNS field/role semantics use this path with a
tested 2400-character bound, no questions
or draft changes, native routing/plan defaults and the separate protected PSK
binding. Its factual oracle requires these details and rejects invented
static/dynamic routing types. DevOps requires its native fields and the
`git_flavor=null` no-instance boundary, without implying an enabled default.
This does not replace live availability checks or
authorize configuration; unsupported overview topics retain the advice path.
DNS role explanations retain the existing primary/secondary, authoritative-role,
visibility and native Secondary-configuration-limit criteria, including correction
of earlier misleading advice. Actual DNS setup continues through the existing
reviewable proposal flow.
CI needs `LZC_MODEL_SERVING_TOKEN` available to the protected `assistant-tests`
environment. Local receipts do not certify that remote environment or authorize
deployment. CI qualification jobs share a non-cancelling concurrency group to
avoid competing model requests from manual and release runs. Review and extend the factual criteria whenever new capabilities
are added; unresolved or ambiguous answers still need human review.

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

Both chats request an optional `application/x-ndjson` POST response. The model
client parses bounded SSE events using `eventsource-parser` and incomplete JSON
using `partial-json`; only provisional `explanation` text is forwarded. Partial
text is visibly unreviewed, never a stored/acceptable proposal. The validated
complete JSON still goes through existing model, field, scope, native compiler,
authorization, revision and expiry checks before persistence and the final UI
event. Interrupted, oversized, malformed or wrong-model streams fail closed.
Disconnects cancel model requests and are checked before saving. Existing JSON
clients are supported; no automatic retry or execution. Both message containers
scroll to their end on history changes and provisional text updates.

The optional `LZC_MODEL_SERVING_INTENT_MODEL` selects only the classifier;
`LZC_MODEL_SERVING_MODEL` still selects answers. Local test activation on
2026-10-11 uses GPT-OSS-120B intent plus the established Qwen answer model with
explicit user permission. This is not a production or full dialogue-quality
qualification. Streaming exposes text earlier, not more trustworthy text.

### Conversation and Change Contracts

Questions expose bounded `text`, `options` and `multiple`: up to six distinct
160-character choices, native radio/checkbox selection and an always-available
free-text answer. New inference transport requires structured questions; stored
legacy questions without options remain valid. Options undergo protected-question
checks too. Selection only prepares question-associated user text; it never
sends, accepts or mutates automatically. Existing compose text is retained and
the combined 4000-character limit is checked before insertion. Choices appear
only from the completed validated response, not provisional streaming text.

Diff checkboxes prepare a request for a new proposal containing the selected
paths/values. No direct partial-acceptance endpoint or selected-field mutation
exists. Whole acceptance is disabled while a subset is selected. The new result
is validated and reviewed normally; the user must inspect its entire diff and
explicitly accept it. Related native changes remain atomic; a component-map
entry is not split into individual nested fields. No execution permission.

Configuration dialogue has two bounded model calls: first classify topic/mode
from saved user/assistant history, then answer under backend-owned capabilities.
The classifier cannot grant permissions. Follow-ups need not repeat a topic
keyword; explicit topic changes override history. The full saved user history
also accompanies advice so earlier requirements do not disappear after the
recent-turn window. Assistant suggestions and template defaults are not consent.
Firewall planning records exact user quotes for traffic, capacity and operations.
The backend rejects quotes not present in user messages and selects the next
unresolved decision/path deterministically. Quote categorization remains model
interpretation, not proof of deployment suitability. The advisory request gets
only relevant topics/dependencies plus mandatory knowledge, not all services;
firewall sizing is separated from managed VPN product plans.

Field contracts distinguish user decisions from operator-managed access details.
Only explicitly listed company name/code/region scalar proposals, name-only
updates to existing `rm_folders`, and native SNA proposals are supported; no
blanket scalar or structure permission. Identity values need literal user
evidence unless the user explicitly delegates choosing company names/codes or
folder names. Such delegation references an original user message through a
backend-enumerated source ID, never a model-rewritten quote or assistant turn.
Nonempty delegated paths require an existing user source. This bounded semantic
classification is not general consent or deployment authorization. Folder
names are 1-40 characters; keys, owners, readers, descriptions and identities
are preserved. Implicit native folder defaults are projected as names only;
explicit empty maps are not replaced. New folders, Cloud IDs, region choices,
IAM and operator access settings are not delegated. Admin account,
API-secret version and bootstrap are excluded from chat questions/changes,
including when accepting older proposals. Bootstrap means initial management
access setup, not firewall HA enablement or deployment authorization.

Firewall advice translates traffic scope, capacity and failure/operations into
human decisions. Its model-generated explanation is bounded to 800 characters
and at most one native decision question. No fixed answer replacement. Other
component topics remain advisory unless the backend has an explicit translator.
This is a firewall dialogue pilot, not a complete semantic configuration compiler
or production-qualified conversational state machine. Two inference calls add
latency; persisted intent summaries and full load qualification remain open.

Bundle hash includes curated content, manifest metadata, engine revision and
local source fingerprints. A source edit makes the generated snapshot stale;
the required check fails. Regeneration must follow source review, not silently
make changed sources authoritative. No automatic update during build/start.
Knowledge changes do not require a new conversation. Each new message uses the
current bundle and preserves history, identity and the original expiry. The
new response atomically replaces the proposal and its knowledge hash. Old
proposals remain stale and cannot be accepted before regeneration with current
knowledge. No deletion, expiry extension or silent proposal acceptance.

All topics remain local-draft-not-reviewed-release. Sources are allowlisted local
Terraform, curated Markdown and domain/API TypeScript; only fingerprints, not
source-file contents, are sent with provenance. No environment, credential or
state files are source inputs. Complete external source
retrieval, reviewed historical knowledge releases, automatic promotion and full
A01-A24 conversational qualification are not implemented by this architecture.
Future topic partitioning should be explicit and testable before adding RAG.