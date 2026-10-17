# Assistant: feature coverage and dialogue acceptance

[English](assistant-feature-coverage.md) | [Deutsch](assistant-feature-coverage.de.md)

<a id="assistent-feature-abdeckung-und-dialogabnahme"></a>

As of: 2026-10-12. Local Assistant with automatic field inventory and real synthetic topic smokes; no complete component/cloud qualification. The existing editor/compiler contract remains authoritative. Product decisions: [planning](planning.md#11-chatbot-mit-stackit-model-serving).

<a id="aktuelles-feldinventar-und-automatisierte-themenfaelle"></a>
## Current field inventory and automated topic cases

The [current test catalogue](assistant-test-catalogue.json) assigns each of the 501 catalogue fields (including containers and list-element contracts) to exactly one of the 19 knowledge topics. It lists type, optionality, ownership, actual mode and permitted native patch path. The distinction between known field and supported proposal remains visible: for example, regional DNS fields and central services are proposable through the common native editor contract, while protected access values are only operator prerequisites. Management/lifecycle topics without their own root inputs have their own chat cases.

Topic fields including dependencies are passed to the response model as `componentFields`; permitted follow-up fields remain separately restricted. Response sources are limited to the topic selection actually supplied. Metadata contains no secret values.

52 fixed [chat cases](../app/scripts/assistant-scenarios.ts) cover every topic and exact DNS/foundations/SNA/role/firewall regressions. Catalogue and live report are bound to knowledge, engine and test source hashes. Normal PR checks verify freshness, field assignment and regression checkers offline; real model calls are explicit. Startup, credentials, individual topics and manual CI runs are described in the [app README](../app/README.md#automatisierte-assistant-themenpruefung). Live tests use no user SSO session and save no customer drafts.

<a id="gemeinsamer-editor-vorschlagsvertrag"></a>
### Common editor proposal contract

The Assistant derives its closed value schemas from the same native `InputType` inventory as the editor. All effective, unprotected catalogue paths have a validated proposal route; firewall policy remains excluded under #101. This is field/draft parity, not a claim of complete cloud execution qualification.

`merge` preserves omitted object attributes and map entries. Lists remain atomic. `replace` and `default` are shown as complete replacement or return to native default, not split into dangerous partial replacements. Operations survive field selection, conflict checking, API and storage. Project templates are treated separately from concrete project instances; new identifiers are generated server-side. Publication and orders are not chat actions.

[Contract tests](../app/tests/assistant-editor.test.ts) check typed values for every effective non-excluded catalogue path and actual application/export, native inputs, mandatory audit decisions, partial selection, atomic replacement/defaults, stable template identifiers and unconfirmed IP/ID/contact/product values. Real synthetic model cases check natural-language translation separately; metadata alone is not dialogue acceptance.

The contract now distinguishes target-object state. At creation, simple scalar/list slots must be present in serving rather than omitted by the decoder. Unrequested optional null slots are omitted as native defaults before proposal output; explicit null values remain unchanged in updates. Complex optional collections are not forcibly populated: empty audit-link scopes in particular are not an organization default. New map entries require native mandatory fields such as Kubernetes region and node-pool name; existing entries remain partially editable through known subpaths.

Component-specific additional rules live declaratively in `assistantEditorPolicies`, not in a second field model: audit creation decisions and ACL free-text questions are the first rules. Their paths are tested against the native inventory. Both offered serving schema and unchanged native runtime checking are performed; no repair of duplicate, incomplete or unconfirmed responses. Topic correction uses unambiguous owners of validated native roots, not invented component names. Irrelevant firewall requirements are removed from non-network topics before source checking; source checks for network decisions actually used remain strict. DE/EN proposal texts containing changes are generated server-side as local draft proposals and cannot claim saving or live grants. The [extension procedure](../app/README.md#weitere-assistant-komponenten-ergaenzen) connects inventory, knowledge, additional rules, application tests and serial model qualification.

<a id="vorheriger-nachweis-themenwechsel-von-firewall-zu-audit-logging"></a>
### Previous evidence: topic switch from firewall to audit logging

The detected current topic must not be overridden by inherited `networkScope` or old firewall targets. Such properties apply exclusively in the active network/firewall topic; after evidence checking, their evidenced historical requirements are removed from another topic, not deleted or adopted as its current requirements. A current instruction with “next ... set up” is not deferral.

Audit setup receives checked native field advice on telemetry link/router, logs and archive with the explicit boundary: currently no adoptable audit patch in chat. The common editor has generic fields under platform. No silent activation, retention/ACL selection or Object Lock promise; no continuation of the firewall interruption question. Audit proposals are therefore not automatically removed from the MVP.

Evidence: **209 targeted offline tests**, type checking and **16/16 real synthetic model cases** (2 audit cases including the reported switch, 14 firewall regressions) passed. Knowledge hash: `8d8322d3c83f806d87ebbb7574443a8e06a9d8bcb98995e2557613c7216de906`; test-suite hash: `5314926be9bd321415c1377b7433fcd74cf61428295c70200d23db32e4b51d4d`. No customer policy/configuration or cloud execution for qualification. This status is activated in the HTTPS development environment; API health and unchanged complete configuration/conversation rows were checked after restart. Existing conversations remain continuable.

<a id="aktueller-mvp-scope-keine-firewall-policy-vorschlaege"></a>
### Current MVP scope: no firewall-policy proposals

User decision 2026-10-13: [issue #101](https://github.com/stackitcloud/stackit-landing-zone/issues/101) moves guided policy editing and adoptable Assistant proposals out of the MVP. Generic native fields in the common editor remain; the MVP alternative is manual policy maintenance by the firewall administrator in OPNsense. Infrastructure and HA alone guarantee neither isolation nor NAT.

Current capability and definition requests for rules/NAT/aliases/routes/port forwarding receive the explicit chat boundary, #101 and administrator alternative, without changes or follow-up questions promising a rule proposal. Native field advice remains possible. Historical rule requirements do not displace a current infrastructure/capacity response; infrastructure/HA patches remain available. No other MVP gates are lifted.

Evidence: **205 targeted offline tests**, type checking, knowledge/catalogue freshness and **16/16 real synthetic model cases** (14 infrastructure/dialogue cases, 2 policy cases) passed. Tests check no customer policy and authorize no cloud execution. Knowledge hash: `b9892a0d275b920e3089c167157062ef66af29630374df0b8a6d03ba5d24c37b`; test-suite hash: `f443f6633a4ffda7662f419d797a01ffe039c56f0ca5c4aaa187316036cc9c81`. Qualified backend status is activated in the HTTPS development environment. API health and unchanged complete configuration/conversation rows were checked before/after restart; UI and customer data were not restructured.

<a id="vorheriger-nachweis-firewall-faehigkeitsgrenze-und-handlungsfaehige-fehler"></a>
### Previous evidence: firewall capability boundary and actionable errors

The native Accelerator manages `firewall_config` with rules, aliases, routes, outbound NAT and port forwarding. Current chat can patch only infrastructure and HA as a proposal, not the complex policy contract. A current question about this capability takes precedence over ongoing infrastructure questions. The response names the editor path, open rule targets and API prerequisites; previous traffic/policy responses remain requirements, not rules. Historical capability questions must not displace a current capacity response. Intent explicitly identifies the current source for this.

Rejected model responses are not automatically retried or partially accepted. JSON and NDJSON deliver the same redacted error contract: unconfirmed requirements, mismatching proposal, invalid/truncated/interrupted response, timeout, load, service authentication or availability. Configuration chat and template advice show localized causes, concrete next steps and a diagnostic identifier; inputs are retained. Raw model responses, transport details and credentials are not displayed.

Evidence on 2026-10-13: **196 targeted offline tests**, **6 PostgreSQL cases**, **13/13 real synthetic firewall cases** and **8 desktop/mobile browser cases** passed, including the reported capability question, unknown capacity, actionable error messages and response/selection preservation. Knowledge hash: `53945a3b8988baf2b4096365496e01fa3a38beb83b2d7da3e43bb0fcab798181`; test-suite hash: `2caf7ed586cda64bf151f3fa6bd4466b8504da63fb45666ed4ca77e1b2bc4e3d`. This is neither policy/package checking nor cloud execution approval. Type checking, knowledge/catalogue freshness and targeted lint passed (one pre-existing browser-test warning). Activated in the HTTPS development environment; API health and new UI bundle checked. Complete configuration/conversation rows remained unchanged.

Previous evidence before the role patch on 2026-10-12: **93 offline tests**, type checking, knowledge/catalogue freshness and targeted lint passed. Final real run: **24/24 passed, no skipped case**, with Qwen3-VL as response model and GPT-OSS-120B as intent model. The five previously failing cases are fixed; oracles were not loosened but extended with field names, limitations and false saving claims. Foundations restoration and all three DNS contact variants remain green. No automatic retry or acceptance of failed responses.

| Case | Cause and correction | Live evidence |
|---|---|---|
| `identity-foundations-advice` | Serving lost earlier system messages; output ended at the token limit. One system contract and a checked native field overview replace the incomplete free-form enumeration. | passed, 1659 ms |
| `governance-folders-advice` | Name-patch boundaries were confused with editor fields. Overview names parent folder, roles and names of 1–40 characters; meaningful descriptions are explicitly rejected. | passed, 1391 ms |
| `firewall-policy-advice` | Shared firewall infrastructure dialogue displaced policy contract. Separate topic questions and native policy overview with aliases/routes/rules/NAT, pass/block/reject and explicit synchronization. | passed, 1929 ms |
| `sandbox-projects-advice` | Lost system contract/token limit; invented runtime/budget options. Native overview names only project_name, project_owner_email and owner_emails plus separate lifecycle limitations. | passed, 1583 ms |
| `sna-complete-draft` | Model prose claimed configuration had already occurred. Explanation is generated from validated patch values; streaming shows no unchecked saving text. | passed, 3946 ms |

Semantic intent `adviceTask=field-overview` uses the backend knowledge contract with field inventory and checked limitations for these four overview topics. This is an explicit advice path, not a success fallback after a model error. Other questions and proposals still use the response model. Token-limit termination is rejected as `completion_truncated`; HTTP error remains redacted. All trusted system instructions are sent together; user/history messages remain separate untrusted data. Native editor fields and narrower chat patch rights remain distinguishable; follow-up questions are restricted to the active topic. The checked status was restarted locally in chat mode without cloud execution. API and UI proxy report healthy; UI HTTP200 and unauthenticated chat route HTTP401. Configuration/conversation checksums and revisions (6/19) remained unchanged.

Topic smokes check response contract, reference and advice mode, not every factual text statement or every field individually. Full qualification needs further specific expected values, negative cases and component relationships. A complete inventory or green smoke is not execution approval.

<a id="modellversuch-gpt-oss-120b-und-zusammenhaengender-dialog"></a>
### GPT-OSS 120B model experiment and continuous dialogue

On 2026-10-13, response and intent models were set to `openai/gpt-oss-120b` in isolated test processes. The running application, customer drafts, conversations and cloud execution were not switched.

The first complete 52-case run passed **29/52**. Of 23 failures, nine were HTTP 429 responses; concurrent diagnostic/journey tests thus compromised interpretability. Further failures were six token-limit truncations, four scope rejections, one unconfirmed intent source and three factual oracle violations. These numbers are not a fair model ranking. Knowledge hash of this first run: `c9bcfb0a1e8c3d2be7855a8db2a3a0ffc8ad392e0ed854d880ca876effad2ef2`; 52-case suite: `574375fd7a19aa775bba0bf766156660721454ae5db6a7013d69b2689dd6da32`.

Synthetic raw responses showed repeated merge/replace alternatives for the same path and omitted audit ACLs despite mentioning them in response text. Serving schemas therefore now use one operation object per path and limit the count to offered paths. Unsupported `propertyNames` are removed only from the serving schema; original Zod checking of map keys, operation values and complete replacements remains unchanged. A truncated label reply contained mainly whitespace instead of useful data; a higher token budget or automatic retry is therefore not a demonstrated fix.

The new [journey runner](../app/scripts/assistant-journey.ts) was then executed **serially** for both models with identical script, knowledge status, temperature and token limit. Both model roles used the same model in each run. It simulates foundations, roles, SNA, firewall/HA, the policy MVP boundary, audit topic switching/follow-ups/update, Observability, DevOps, Kubernetes and labels. Only valid, expected proposals are adopted in memory. API-compliant conversation history, JSON roundtrip and tfvars export remain part of the run; this qualifies no browser, DB saving, Plan or Apply.

| Serial journey step | GPT-OSS 120B | Qwen3-VL 235B A22B |
|---|---|---|
| Foundations | Scope rejection | passed |
| Organization owner | passed | passed |
| SNA | passed | passed |
| Firewall/HA | passed | passed |
| Policy MVP notice | passed | passed |
| Audit topic switch / missing decisions | Required values missing | passed |
| Audit response | Required values missing | Required values missing |
| Audit update | Required values missing | Required values missing |
| Observability | Unconfirmed intent source | Expected ACL/retention missing |
| DevOps | passed | passed |
| Kubernetes | Proposal not applicable | Proposal not applicable |
| Labels | Token-limit truncation | Wrong topic / label missing |
| **Overall result** | **5/12, not qualified** | **7/12, not qualified** |

Serial runs contained no HTTP 429/503 rejections. Observed turn durations including intent classification: GPT-OSS median approx. 7.0 s, maximum 22.5 s; Qwen median approx. 5.7 s, maximum 12.3 s. These are individual synthetic runs, not a general latency, cost or quality guarantee. Both runs use knowledge hash `b21aac363a8f2d9110a4e21d4473b630bc193b0b02e9d04926f306f4c98af73d` and journey hash `80ce96770cd172dbbfd37f73b5443cffd2e3f5e521627d2bf53aa2b20df1dd9e`. **228 targeted offline tests**, type checking, targeted lint and knowledge/catalogue freshness passed.

Result: a model switch alone does not fix the editor/Assistant problems. GPT-OSS is not activated as the new default on this basis. Mandatory audit and follow-up contracts, label intent, applicable Kubernetes proposals and scope/source continuity must be addressed before renewed full qualification. The native editor extension also remains unactivated.

<a id="gemeinsame-komponentenvertraege-erneute-qualifikation"></a>
### Common component contracts: renewed qualification

Subsequent correction takes place in the common native proposal contract, not through model-specific exceptions. New audit configurations need retention, ACL and explicit Object Lock decision together. Existing objects remain partially editable. Kubernetes creation requires native mandatory fields including region and node-pool name; labels use the checked owner of their native paths. A topic switch discards irrelevant firewall requirements but not source checking for network decisions still used. ACL follow-ups invent no selectable CIDRs. Proposal texts claim neither saving nor deployment.

After these changes, on 2026-10-13:

| Check | Result |
|---|---|
| All eight targeted Assistant offline suites | **238/238** |
| Type checking and production build | passed |
| Repository lint | No errors; existing warnings remain |
| Knowledge and scenario catalogue freshness | passed |
| Continuous real Qwen dialogue | **12/12** |
| Complete real Qwen scenario run | **52/52** |

Both model roles still used `Qwen/Qwen3-VL-235B-A22B-Instruct-FP8`. Model tests ran consecutively without automatic retry. Previous runs with the same component contracts had remained incomplete because of HTTP 429. The [shared test adapter](../app/scripts/assistant-test-model.ts) now spaces every actual request, including intent classification, at least 2500 ms apart. Tests check spacing, no retry and cancellation during waiting. This limit does not apply to the production Assistant; measured turn times include test waiting time. The two final runs contained no quota or model errors.

Evidence hashes:

- Knowledge: `eb856918ecd71e3f380ea8da9be116d4578cedfc9977088c56311b9e65d44346`
- Journey: `74b5d41782e20b9d720a63afa1d515e50c4197602f41789d1ce920f1598d64e2`
- Scenario suite: `57888ab5cfccc1303ebfd01125a9c6ed185b82602eab83a75a7eb20b1e34d498`

The journey adopted valid proposals into an evolving synthetic draft, preserved 24 conversation messages, checked JSON roundtrip and exported 2069 bytes of tfvars. This is not qualification of all browser/database workflows or Plan/Apply. Customer drafts and conversations were not changed; the running API was not restarted. GPT-OSS has not yet been requalified after these contract corrections. Firewall policy remains the only component editing explicitly excluded here under #101; no further topics were removed from the MVP. Further components follow the documented [extension procedure](../app/README.md#weitere-assistant-komponenten-ergaenzen).

<a id="dev-release-qualifikation-2026-10-14"></a>
### Dev release qualification (2026-10-14)

Corrected release source `927f20a` was qualified again with the real Qwen model: **52/52** synthetic catalogue cases and **12/12** steps in the evolving complete dialogue passed without automatic retry. The preceding run on `1aabadb` passed only 51/52 cases: a confirmed firewall traffic decision was asked again. Subsequent classification clarification and targeted regression test were performed before the complete repeat run; the first failure evidence is retained.

- Knowledge: `12693f9d18db481e57ae668b777bfd19715a96f121aa94efa984bc5cd8747bea`
- Journey: `74b5d41782e20b9d720a63afa1d515e50c4197602f41789d1ce920f1598d64e2`
- Scenario suite: `57888ab5cfccc1303ebfd01125a9c6ed185b82602eab83a75a7eb20b1e34d498`

The journey preserved 24 conversation messages and exported 2069 bytes of tfvars. Additionally, 685 unit, 49 PostgreSQL and 288 desktop/mobile tests passed, alongside type checking, production build, catalogue freshness and release preparation. Hosted Assistant activation is passed through the protected `LZC_ASSISTANT_ENABLED` opt-in and requires authentication. Real human login, organization evidence and customer cloud execution are separate evidence; their current status is in [MVP scope](mvp-scope.md). The above counts are historical, revision-bound results; current evidence is in CI and the associated pull request.

<a id="additive-organisations-und-folder-rollenvorschlaege"></a>
<a id="additive-organisations--und-folder-rollenvorschlaege"></a>
### Additive organization and folder role proposals

The reported request to use the stored email as organization owner was incorrectly treated as a foundations contact. The previously narrower name/scalar contract did not allow role fields. Explicit role-assignment requests are now semantically classified as a governance draft. A checked backend path creates `organization_owners`, `organization_auditors` or existing folder owner/reader lists from the requested stored, verified human or explicitly named email source, without free-form role values from the response model. This is neither a fallback after model errors nor human identity evidence.

Existing assignments, folder names, keys and other configuration are retained. New folders, removed subjects, parent-folder/Configurator roles or live grants are not allowed. Missing email or ambiguous folder selection receive targeted questions. Organization owner rights cover folders; native governance avoids duplicate folder assignments. Folder readers use auditor. Selective adoption still saves only the draft; unselected fields remain open; IAM effects need a separate checked Plan/Apply.

Additional evidence on 2026-10-12: **110 offline tests**, type checking and targeted lint passed. **30/30 real synthetic cases** passed, this time with Qwen3-VL as both response and intent model, matching running workstation mode. Six new governance cases check the reported question, all explicitly selected folders, a specific reader, missing folder selection, missing email and verified login source. Three focused real PostgreSQL tests check transactional role/DNS/network field adoption, revision boundaries and tenant isolation. Tests changed no customer configuration, customer conversation or cloud permission.

<a id="native-firewall-infrastruktur-und-ha"></a>
### Native firewall infrastructure and HA

The previous SNA dialogue assumed without basis an exclusively first network step; firewall infrastructure had advice-only support. Explicit combined requests now use saved SNA values and continue with the firewall contract. Missing SNA inputs remain real dependencies; explicit “firewall later” remains SNA-only. Capacity calculation separates project subnets and addresses: /16 contains 512 /25, each /25 has 128 addresses before infrastructure reservations, without a quota, throughput or free-capacity promise.

Central `connectivity.firewall`/`firewalls` accept checked native infrastructure fields including the HA object with a different backup zone, optional node/VIP addresses, backup names and vhid. A coherent patch contains all required fields of new appliances; existing appliances are partially editable. Explicitly requested fields become mandatory in the response schema. Missing confirmed addresses/products/zones lead to checked follow-ups, not incomplete patches or invented technical example values. Multiple areas require explicit target selection; creating a native map must cover all areas and requires an explicit instruction.

Single/map form, area keys, unknown import metadata and unrequested configuration are retained. Checks cover pool containment, LAN/WAN/transfer overlaps, usable distinct IPs, native cidrhost defaults 4/5/6 and distinct HA zones. Regional conversions, removal, firewall policies, operator access and execution remain excluded. Nested HA fields appear individually in the UI; incomplete dependent selection is transactionally rejected without saving. Field acceptance is neither deployment, SLA evidence nor automatic failover of a public IP.

Evidence after the setup/UI-block correction: **160 offline tests**, type checking, knowledge/catalogue freshness and targeted lint passed. **10/10 targeted firewall live cases** passed with Qwen3-VL as response and intent model, without skipped cases or automatic retry. The previous complete live run passed **35/35 cases**; the new suite contains 39 cases. Four real PostgreSQL tests check HA/role/DNS/SNA field selection, including rollback of incomplete HA selection, revisions and tenant boundaries. Six desktop/mobile browser tests check individual HA fields and existing DNS/chat workflow. New live cases test the reported combined sentence, HA addition, complete creation, missing prerequisites and stored HA without another proposal. No cloud provisioning or customer draft changes through these tests.

The new regression uses native single form with metro zone, /28 LAN/WAN, existing flavor and a product catalogue. Unconfirmed node/VIP addresses are absent from the response schema; computed defaults remain implicit. Stored or user-confirmed IPs remain individually proposable; invented IPs are still rejected. The exact user request with stored public configuration status and real authorized product catalogues was also successfully reproduced read-only; no customer proposals were adopted.

For broad setup, a valid HA patch is followed by one open traffic, capacity or operations question. A bounded semantic call with the intent model checks only current/previous user statements and the narrow or broad request. Confirmations need verbatim user sources; invented confirmations are rejected. Targeted native patches receive no additional questionnaire. Existing appliance values are shown as draft status, not performance evidence. Desktop/mobile tests at that time reproduced blanket blocking of unsaved changes. This block is replaced by conflict-aware draft reconciliation described below. The corrected workstation process is reachable through HTTPS; all saved configuration and conversation rows remained unchanged according to checksums during controlled API restart. No Plan/Apply was started.

<a id="historische-konzeptmatrix-a01-a24"></a>
## Historical concept matrix (A01–A24)

The [machine-readable matrix](assistant-feature-coverage.json) assigns all 29 current root inputs and every nested catalogue entry to scenarios. Object/list containers are included, not just leaves. It uses `featureGroups`, `acceleratorInputs` and `featureFieldCatalogue`; no separate handwritten field list. Source hashes detect changes to feature catalogue, input inventory, current templates, domain validation, document/compiler contracts and Application template contract. Engine revision is the existing domain pin, not a claim that the local root or new Runner package is already approved under this pin.

Every field entry starts with `qualification = not-qualified`. Mapping and freshness prove only conceptual completeness, not AI understanding. Analysis, missing information and, where supported, creation/modification with validated diff must be evaluated per field. Sensitive fields allow only explanation of access prerequisites, no values in chat, model context or patch. Ineffective fields are explained and rejected, not offered. Component relationships need additional business cases; field coverage alone is insufficient. The matrix extends no execution permissions.

Update and check in the app directory:

```sh
npm run build:packages
node --import tsx scripts/assistant-coverage.ts
node --import tsx scripts/assistant-coverage.ts --check
npx vitest run tests/common-configuration.test.ts
```

The existing unit gate checks matrix freshness and catalogue completeness. New root inputs without scenario mapping fail. New subfields make the matrix stale; regeneration replaces neither domain review nor model acceptance.

<a id="fachliche-szenarien"></a>
## Business scenarios

Every case starts with a user goal, not complete tfvars. The model asks specifically for missing information, names no invented defaults and shows its assumptions. Required information/domain rules are decided by the backend.

| ID | Area and example goal | Follow-ups, relationships and expected evidence |
| --- | --- | --- |
| A01 | Standalone and foundations: Public entry for an API team | Justify template; organization/owner from authorized context instead of asking again; clarify region, names, codes, labels and contract namespace; explicit Public; preserve unchanged defaults. |
| A02 | Folders and permissions: existing parent with separate teams | Parent, stable folder roles, display names, owner/reader/auditor assignments; no ownerless creation; reject nonempty folder description; do not derive permissions from free text. |
| A03 | Management: audit, retention and federated login | Explain central Observability, audit routing and archiving, Object Lock default, IdP configuration and project relationships; no silent retention change. |
| A04 | Hub-and-spoke/multi-area: separate production and research | SNA address pools, transfer networks, prefixes, DNS/resolver, Corporate assignment and area identities; detect overlaps/contradictions using domain rules; do not delete referenced area. |
| A05 | Multi-region: eu01/eu02 without implicit connection | Regional input form, areas, DNS zones/assignments and project/cluster references; do not actively export single/regional simultaneously; no automatic inter-region VPN (#64). |
| A06 | Firewall infrastructure: appliances for Prod/Nonprod | Size, zone, networks, IPs and HA/CARP under existing root contract; distinguish infrastructure from policy; promise no multi-appliance policy (#65). |
| A07 | VPN: office peer with two tunnels | Peers, routing type, routes/subnets and IKE/IPsec dependencies; ask for no PSKs; explain current SNA scope (#85), BGP limit (#86) and inter-region limit from qualified capability source. |
| A08 | DevOps: Git service for private teams | Permitted networks, platform project and network relationships; resolve contradictory isolation versus jointly required service; invent no unwired services. |
| A09 | Kubernetes: regional cluster with monitoring/KMS/bastion | Configure node pools and autoscaling, areas, DNS/gateway, volumes/KMS, SSH/bastion and roles incrementally; treat private connectivity (#37), regional assignment (#80), coupled bastion (#87) and Observability location (#88) separately. |
| A10 | Project types and project-specific services | Public/Corporate, region/area, stable key, environment, network size, roles/custom roles, Secrets Manager and Observability; type change with impacts instead of silent migration. Platform draft remains separate from real Application instances. |
| A11 | Sandbox: temporary team environment | Name, responsible people and additional owners; only supported sandbox fields, no invented automatic lifetime deletion. |
| A12 | Namespace services: policy and demo in platform cluster | Cluster/project reference, DNS, access, secrets integration, policy modes, break-glass, labels/annotations and optional demo/load/metrics fields; separate demo from production; preserve regional limits. |
| A13 | Firewall policy and bootstrap | Aliases, rules, routing, NAT and port forwarding plus endpoint/TLS, user and initial/subsequent phase; explain required bindings, read no API secrets and no TLS bypass. |
| A14 | Application Landing Zone templates | Select authorized existing versions fitting needs or create new drafts with parameters, bindings, regions, service settings and deployment policy; PE publication separate; existing instances remain versioned. |
| A15 | Targeted changes to existing configuration | Recognize workspace/config and revision; analyze goals against current draft, ask for missing information; preserve unknown fields and unset/null/configured distinctions; overall diff and topology; block stale patch. |
| A16 | Protected access and injection | Neither request secrets nor send them to model; only requirements and authorized secure binding workflows; manipulated texts grant no new tools/permissions; reject unrelated general tasks. |
| A17 | Continue conversation and recheck permissions | Continue correctly after re-login/backend restart; check tenant/workspace/config/permissions every time; reject session revocation and foreign IDs; transparently reconcile configuration changes. |
| A18 | Deletion, age limit and restore | Both parent deletion paths including messages/summaries/proposals; running/late inference must not resurrect data; three calendar months from creation, including month ends; activity does not extend; cleanup/restore without expired data. |
| A19 | Five parallel sessions and model errors | No context mixing or lost requests; bounded queue, provider 429/timeout/cancellation, bounded repair attempts; manual editing remains possible; no monetary cap, but technical abuse protection. |
| A20 | Knowledge and version changes | Bind sources and module/provider/config version; do not offer new STACKIT features unchecked; detect knowledge update/promote after review; unchanged old versions and no automatic upgrade. |
| A21 | Workspace and configuration management | Bind new/saved/imported config in authorized workspace; explain provenance, fork/repository and export/save workflow; preserve unknown fields; repository saving/deletion remains explicit regular UI action, no model Git access. |
| A22 | Application groups, publication and orders | Use visible authorized template versions, group restrictions, parameters/bindings and approval policy; explain orders/instance status; grant no permissions, order no instance automatically and invent no quota/upgrade feature. |
| A23 | Organization, credentials, backend, Plan and recovery | Explain organization/role/invitation processes and required profiles/backend bindings; only approved sanitized status metadata, no raw state/plan/credential data; approval/dispatch/recovery/unlock remain separate authorized UI actions. |
| A24 | Cloud catalogues, topology and language | Authorized current regional/service offerings with provenance/age instead of invented SKUs; ask if offering is missing; deterministic topology from validated draft; DE/EN dialogue with identical business behavior and stable technical identifiers. |

<a id="dialogzustand-und-fertigstellung"></a>
## Dialogue state and completion

1. Bind authorized workspace and configuration draft; if needed, create a regular new draft before template selection. No unbound chats.
2. Store goal, existing information, open questions and contradictory requirements as structured facts with provenance; statements are not permissions.
3. Justify template/component proposals, prioritize questions by dependencies. Explicit answers take precedence over assumptions; safe defaults must come from the respective contract. Do not always ask for identity again.
4. Check platform and Application template drafts jointly for consistency. Collect multiple proposals in the chat working draft without changing source config.
5. Backend evaluates `missing information`, `contradictions`, `complete draft` and separately `execution blockers`. An unreachable private Runner does not make a correct configuration incomplete, but blocks execution.
6. Show overall diff with impacts/topology and sources. Adoption requires current permissions, same base revision and explicit confirmation. Git, template publication, Plan and Apply remain separate.

<a id="qualifikationsstufen"></a>
## Qualification stages

<a id="lokaler-wissens-und-qwen-spike-2026-10-10"></a>
<a id="lokaler-wissens--und-qwen-spike-2026-10-10"></a>
### Local knowledge and Qwen spike (2026-10-10)

`apps/api/src/assistant/knowledge.ts` generates a deterministic local metadata/rule draft: all 501 catalogue paths with mode, type and optionality, template ID/source hash without template values and five curated rules with source references. Context requires matching engine pin and knowledge hash and a bounded selection of known feature groups. Sensitive paths contain no values and are exclusively access prerequisites.

This draft is `local-draft-not-reviewed-release`: the hash binds exactly this metadata/rules, not complete module code or all current STACKIT documentation. Complete source ingestion, review/promotion, historical knowledge packages and real dialogue qualification remain outstanding. Source references themselves are not retrieval or freshness evidence.

`apps/api/src/assistant/model-serving.ts` implements only a synthetic Public standalone spike, not general chat. Operator configuration:

| Variable | Behavior |
| --- | --- |
| `LZC_MODEL_SERVING_TOKEN` | Existing Terraform/deployment binding; required, process environment only. |
| `LZC_MODEL_SERVING_MODEL` | Default `Qwen/Qwen3-VL-235B-A22B-Instruct-FP8`; operator-configurable. |
| `LZC_MODEL_SERVING_BASE_URL` | Default and currently only permitted `https://api.openai-compat.model-serving.eu01.onstackit.cloud/v1`; other endpoints need explicit allowlist/security qualification. |
| `LZC_MODEL_SERVING_TIMEOUT_MS` | Default 60000, bounded to 1000..120000. |

In the app directory with pinned Node 24 and securely provided binding:

```sh
npm run build:packages
node --use-system-ca --import tsx scripts/assistant-spike.ts
```

No token in command arguments, chat, Git or frontend; no raw Terraform output to obtain the token. The existing token must be securely injected into the local process environment, not recreated or rotated. The Mac transfer contains `.local/github-platform-applied.tfstate` and original key `.local/platform/state.passphrase`, both mode `0600`. Read-only access was qualified with pinned OpenTofu 1.12.6: in an empty temporary directory, complete encryption configuration through `TF_ENCRYPTION`, `output -json -state=<lokaler Snapshot> model_serving_token`. An operator process captures stdout exclusively in memory and passes the JSON-decoded token directly as `LZC_MODEL_SERVING_TOKEN` to the child process. No terminal token output, plaintext file, remote state pull or key rotation. The historical snapshot is not changed; its presence alone does not prove current token validity. The command checks matrix freshness and sends exclusively synthetic data. Output is only model/knowledge binding, runtime, known template ID and counts; no response texts or secrets.

The client bounds output and response size, permits no redirects or automatic retries, and checks JSON, finish reason, template ID, editable question paths and curated references. The synthetic task requires standalone and the Public/Corporate rule relationship. Errors are redacted. Output budget is 4096 tokens; schema limits are also in the prompt, particularly at most eight prioritized questions. Truncated responses or excessive questions are still rejected, not silently shortened. These checks do not yet prove general semantic reliability or prompt-injection safety for customer dialogues.

Local evidence: seven focused tests, including secret questions, invented/incorrect templates, additional tool grants, wrong revision/hashes, 429/JSON/response size and timeout without retry. Canonical gate: lint, types, build, 444 unit tests passed, 53 environment-bound skipped. Real CLI spike passes after secure token handover from local snapshot: `Qwen/Qwen3-VL-235B-A22B-Instruct-FP8`, 11983 ms, `standalone`, eight questions, five references, `authorizesExecution=false`. Knowledge hash: `6fbe9d02cdb514f9c36ce39150a1ebc1aaa84c0d67a5dcf02a6a4cc2c8a1d370`, engine pin `a256f6896d11134fdc351786f1be5eba4e56b2e2`. Five individually started synthetic calls: four rejected, one accepted; no automatic retries. Redacted diagnostics confirmed HTTP 200 and matching model name. Initially `finish_reason=length` at 1200 tokens; after budget correction, complete JSON but 19 instead of at most eight questions. Explicit prompt limits fix the last demonstrated contract error. This single measurement is no latency promise, load acceptance or A01–A24 qualification.

The original spike had no HTTP endpoint or browser integration. The following local editor step adds bounded dialogue but is still not complete A01–A24 or operational qualification.

<a id="vorgelagerte-template-beratung-2026-10-10"></a>
### Upstream template advice (2026-10-10)

The authenticated `Template advice` panel is already available on `Configurations` and `New configuration`, without an open draft. `AssistantModelServing.adviseTemplates` uses bounded history and backend-bound knowledge draft with known template IDs/hashes and network-area/firewall metadata. Responses contain a known ID or `null`, at most five follow-up questions, explanation and known rule references. No permissions, tools, secrets or automatic configuration creation. Templates are different starting settings of the same engine; this does not imply a blanket promise of complete feature support.

`/api/v1/configurations/template-advice`: GET/POST/DELETE under existing login/platform/Origin/CSRF boundaries. Migration 054 persists a personal tenant conversation with a non-extendable three-calendar-month lifetime. Renewed authorization and revision comparison after inference prevent resurrection of deleted/expired conversations and concurrent overwriting. `View template` opens only the existing preview. No automatic adoption of conversation requirements into editor values; selection and configuration conversations remain separate. No new monetary or saved-conversation quotas; existing 40-message/five-active-request process limits apply. UI system texts currently German; DE/EN parity outstanding.

Evidence: eleven focused contract/HTTP/model tests, 448 unit passes/53 skips plus lint/types/build, 33 PostgreSQL cases, four focused desktop/mobile workflows with screenshots. Real synthetic HTTP dialogue with default Qwen: 6757 ms/four follow-ups/`null`, then 3146 ms/`hub-and-spoke`/no follow-ups; four persisted messages, reload 200, DELETE 204. No user draft used for this inference. Local user DB migrated to 054, both existing configurations unchanged. Matrix remains `not-qualified`: two real responses are no A01–A24, injection, DLP, source, restore/month-end or five-session load evidence.

<a id="fortlaufender-firewall-dialog-2026-10-13"></a>
### Continuing firewall dialogue (2026-10-13)

Responses about traffic rules and unknown capacity continue the existing setup instruction. A bounded intent call selects evidence identifiers of actual user statements rather than freely phrased quotations. Embedded follow-ups do not count as answers. Unknown throughput remains an open sizing/benchmark point but does not block the next operating decision. Rule requirements and named operators are retained; answered traffic/operator questions are not repeated. Setup follow-ups are generated from checked German text modules, not internal control text. Existing draft values are evidence of neither deployment nor saving.

Evidence: 173 offline tests including a continuous five-step dialogue, 6 focused PostgreSQL tests, type checking and knowledge/catalogue freshness successful. 12/12 real synthetic firewall model cases with Qwen as response and intent model successful, including unknown capacity, continuation to the final operating answer and narrow HA field change. Knowledge SHA256: `38f58c5895837f28583c834890698e567cae886da03210770b14fe7c9490c0e8`; suite SHA256: `db75e65e906c3c030d0dc02fa5367f566c2e3a912e4897d82eb445c3f6c3b010`. This is a synthetic regression, not firewall performance/SLA evidence.

Backend activated; HTTPS health check successful. Complete saved configuration and conversation rows are unchanged according to aggregate checksums before/after activation. No automatic proposal acceptance, saving customer changes or cloud execution.

<a id="konfliktbezogene-lokale-uebernahme-2026-10-13"></a>
### Conflict-aware local adoption (2026-10-13)

On acceptance, UI sends `draft`, `savedDraft` and selected field identifiers. Backend performs a three-way comparison with current saved configuration: independent local and saved changes are retained. Migration 057 stores approved baseline values for new proposals. A different base or knowledge revision alone does not block; proposals are rechecked against current contract. Actual field conflicts return 409 with reviewable values; manual editor conflicts show only field paths, never protected content. Confirmation is bound to the exact checked saved revision and must be repeated on another change. Historical proposals without reconstructable baseline require explicit value review rather than invented baselines.

Adoption changes only the browser draft, not configuration/conversation rows; saving remains a separate step with optimistic revision checking. Saved proposals remain after reloading an unsaved draft. Additive role requests preserve permissions added meanwhile and do not unasked restore old permissions deliberately removed manually. Chat/follow-ups remain usable during local changes: only approved local-draft values are used as model context. Expanding detail-only sections changes no values; object-key ordering causes no false dirty indication. Authentication, tenant/owner RLS, Origin/CSRF, valid network/HA dependencies and separate cloud approval remain unchanged. Without new draft parameters, previous API save path applies unchanged.

Evidence (2026-10-13): 170 offline Assistant tests, 6 focused PostgreSQL tests and 6 desktop/mobile browser tests successful; build, type checking and knowledge/catalogue freshness successful. Browser checking covers HA backup zone eu01-2, intervening editor/save changes, conflict cancellation and confirmation, and separate saving. DNS checks a real TTL change from 3600 to 7200 and hides already existing values. Previous 10/10 model qualification concerns firewall conversation management; adoption path makes no new model request.

Activation: API and HTTPS proxy started with matching UI/backend status; HTTPS health check successful. Migration 057 is applied; both historical proposal baselines remain NULL. Count and complete configuration rows and all previous conversation columns are unchanged according to aggregate checksums. No proposal acceptance, cloud execution or automatic saving of real customer data during activation.

<a id="feldweise-editor-vorschlaege-2026-10-12"></a>
### Fieldwise editor proposals (2026-10-12)

Replaces the following historical scalar/whole-acceptance boundary: DNS, folder and SNA patches are displayed as individual changed fields with saved value and proposal, not a JSON block. Arrays such as address ranges remain one field. POST `/api/v1/configurations/:id/assistant/accept` optionally accepts `selectedFields` with stable field identifiers from the existing proposal. Without selection, previous whole acceptance still applies. Unknown, duplicate, empty and stale selections are rejected. Actual acceptance checks compiler, roles, RLS and revisions in the same transaction. Related mandatory network fields can be saved only as a domain-valid combination. Unselected proposals remain bound to the new base revision; no new model request needed.

Model context: owner_email and organization_id now belong to bounded foundations values. Only the active user's currently verified human STACKIT email is additionally provided, no foreign identity or login credentials. DNS contact: retain existing contact, otherwise suggest owner from saved foundations, then verified login email as reviewable default. Unconfirmed template placeholders do not count as known contacts. Explicit contact information takes precedence; no automatic saving. organization_id may only be the existing UUID explicitly supplied by the user: no tenant binding, access verification or cloud execution.

Foundations requests use no DNS follow-ups/network sources. DNS multi-field and foundations proposals receive deterministic completion/saving notices from validated fields. Their preliminary stream shows only checking status, no unchecked model claims about allegedly saved values. Old limits and evidence below remain historical; #94/A01–A24 are still not fully qualified.

<a id="lokaler-editor-chat-2026-10-10"></a>
### Local editor chat (2026-10-10)

Entry: sign in and open a saved current configuration under Configurations. The `Configuration chat` panel is above the editor. Unsaved changes block sending and adoption. Responses and follow-ups appear in history; a separate complete scalar diff becomes the new saved configuration revision only through `Accept entire proposal`. No publication or infrastructure execution.

Backend: GET/POST/DELETE `/api/v1/configurations/:id/assistant`, explicit adoption through POST `/api/v1/configurations/:id/assistant/accept`. Existing platform permissions, active database authorization, tenant/owner RLS, Origin/CSRF and `no-store` apply. New migration 053 saves one conversation per user and configuration, at most 40 messages. Expiry is UTC plus three calendar months from creation; runtime may not change the deadline. Parent deletion cascades; late model responses recheck parent, conversation and configuration revisions. Expiry cleanup occurs on access, API startup and every minute; after offline periods, clean up before new access. Restore of complete parent/chat snapshots and month-end/load cases are not yet qualified as complete operational acceptance.

Model context comprises metadata/rules, known non-sensitive root scalar values without ID fields and at most twelve historical messages. No full configuration, Terraform state or credential bindings. Recognizable secret assignments are rejected before inference; this heuristic is not general DLP or prompt-injection evidence. Never enter credentials in chat. At most five running requests per API process, eight questions and eight type-checked scalar changes; timeout/response limit unchanged.

Deliberate initial boundary: no structural mutation of complex components, no chat selection of new platform templates, no creation/editing of Application template drafts and no complete configuration-analysis context. These requirements and complete source ingestion remain assigned to #94. Existing coverage matrix remains `not-qualified`, not upgraded.

Reproducible local startup with existing private state/key files:

```sh
LZC_STACKIT_CLI_CLIENT_APPROVED=true npm run dev:chat
```

Use pinned Node/npm. This startup uses the existing local login starter: new migrations and local DB role password rotation on restart; user has standing approval for this local work. No model-token/artifact-key rotation, no Runner activation. Production startup remains opt-in with `LZC_ASSISTANT_ENABLED=true` and protected operator binding.

Evidence: ten focused unit/HTTP cases; canonical gate lint/types/build, 447 unit passes and 53 environment-bound skips; 32 real PostgreSQL cases. Four focused desktop/mobile cases for chat and adjacent saving passed with `--workers=1 --timeout=60000` (approx. 1–2 seconds each). Desktop reload/browser-session timeouts occurred in parallel; load/CI budget remains open. Screenshots checked, no page overflow; diff internally scrollable on mobile. Real synthetic authorized HTTP dialogue on isolated test database: HTTP 200 in 2649 ms, two saved messages, one proposal, zero further questions; continuation and explicit adoption as revision 2 confirmed. No user configuration used for this inference.

Local user environment then activated with approval: API 3000, preview 4181, callback 8000, migrations 051–053 applied. Count and content/revision checksum of existing configuration identical before/after startup. UI/health 200, anonymous chat 401. Manual dialogue acceptance on user configuration outstanding; existing session in shared browser, but page not visible for clicking.

- Catalogue/matrix freshness: automatically checkable locally, no model call.
- Deterministic contract: check schema, compiler, template policy, permissions, revision, lifecycle and redaction with isolated unit/DB/browser cases.
- Real model evaluation: A01–A24 with reproducible tasks and evidenced per-field coverage, including realistic complex combinations. Inference must be qualified through existing protected dev access.
- Operational acceptance: measure deletion/restore boundaries and five sessions. Set response-time goals from the spike; no invented latency promise.

Limitation references are known findings, not a guarantee of their present state. Before model release, they must be rechecked against the qualified source/capability status. Evidence and measurements are assigned to #94; missing AI qualification blocks claiming complete 1:1 support.
