const tag=process.env.LZC_RELEASE_TAG;
if(!/^v(?:[2-9]|[1-9][0-9]+)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(tag??""))throw new Error("Expected a stable product release tag");
const notes={
 "v2.2.6": {
  introduction:"Reliable invitation batches and quota-aware email delivery.",
  changes:[
   "Allow up to 100 email invitations per inviter per hour, including training workspaces.",
   "Pace email dispatch across all application replicas to the configured MailOut quota; retain eligible invitations through temporary throttling instead of failing after five attempts.",
   "Show pending-delivery guidance and provide a dedicated platform Retire tab; staged retirement remains opt-in.",
  ],
 },
 "v2.2.5": {
  introduction:"More reliable Assistant follow-ups and source-checked configuration proposals.",
  changes:[
   "Retain displayed choices and recommendations across follow-ups; keep rejected proposals out of subsequent answers.",
   "Use typed final reviews, actionable knowledge feedback and user-source checks for additional service permissions.",
   "Clarify audit query access, Observability plan requirements and the protection of provisioned secrets in Terraform/OpenTofu State.",
  ],
  limitations:"Assistant qualification remains incomplete. Remaining timeouts, service guidance, proposal preservation and test-oracle findings are tracked separately in #292, #293, #294 and #295. Intermittent serving errors remain under investigation in #225.",
 },
 "v2.2.4": {
  introduction:"Correct Audit Logging removal without recreating its archive bucket.",
  changes:[
   "Create audit archive storage only while Audit Logging is enabled; disabling it plans removal without an unlocked replacement bucket.",
   "Preserve existing enabled archive identity through a declared State move; keep default and Terraform State buckets unchanged.",
   "Register the corrected Accelerator source for fresh reviewed platform Plans, with offline legacy-State regressions against the pinned provider.",
  ],
 },
 "v2.2.3": {
  introduction:"Collaborative configuration conversations, production email and S3 Apply recovery.",
  changes:[
   "Let authorized Platform Engineers read and continue one Assistant conversation per saved configuration, with authors and concurrent-update protection.",
   "Load the matching conversation when switching workspace or configuration, and refresh teammate replies while preserving unsent input.",
   "Preserve existing private histories and offer explicit sharing by their author; proposals still require acceptance and configuration changes require saving.",
   "Include dedicated production MailOut provisioning and verified backend SMTP binding, plus source-verified runner retirement after reported S3 Apply failures while retaining State and recovery holds.",
  ],
 },
 "v2.2.2": {
  introduction:"Production email delivery and reliable recovery after reported S3 Apply failures.",
  changes:[
   "Provision a dedicated production MailOut sender and bind SMTP only to the application backend, with DNS validation and deployment verification.",
   "Stop source-verified runners after explicitly reported S3 Apply failures so checkpoint inspection can proceed; retain State and require independent process checks and owner confirmation.",
   "Preserve recovery holds for timeouts, ambiguous interruptions, pending migrations and separate recovery States.",
  ],
 },
 "v2.2.1": {
  introduction:"Context-aware service consultation in the Landing Zone Configurator.",
  changes:[
   "Recommend Git100 for approximately 80 developers using the documented user limits, instead of asking users to choose an undersized plan.",
   "Retain recommendations through access-setting replies; resolve Accelerator defaults directly into reviewable proposals.",
   "Use shared read-only knowledge, native-default and catalogue tools across services, with compiler feedback and source-bound conversation context.",
   "Share saved configurations between Platform Engineers in the same workspace, with revision conflict protection.",
   "Allow reviewed replanning after a reported S3 Apply failure while retaining existing State and resources.",
  ],
 },
 "v2.2.0": {
  introduction:"Guided service configuration and dedicated Application Git for the Landing Zone Accelerator.",
  changes:[
   "Guide service setup with shared, described catalogue choices, documented Git user limits and consistent English/German replies.",
   "Offer optional dedicated managed Git instances in Application Landing Zone templates.",
   "Coordinate Configurator State writers through PostgreSQL; document single-writer operation for standalone STACKIT S3 backends.",
   "Preserve requested native firewall HA proposals and clarify review of concrete Platform Plan impacts.",
  ],
 },
 "v2.1.2": {
  introduction:"More reliable Assistant setup conversations for the Landing Zone Configurator.",
  changes:[
   "Ask focused follow-up questions when a proposed Editor value lacks a confirmed source; keep grounded catalogue recommendations reviewable.",
   "Guide central Git setup through missing size and access choices without incomplete proposals or implicit public access.",
   "Improve English/German dialogue consistency and expand central live regressions for short requests, partial answers and follow-ups.",
  ],
 },
 "v2.1.1": {
  introduction:"Assistant folder-naming and deployment fixes for the Landing Zone Configurator.",
  changes:[
   "Keep existing application instances serving while staging a release before its gated activation.",
   "Propose concrete prefixed folder names alongside company settings and reuse a previously proposed prefix in follow-up requests.",
   "Show folder proposals in the conversation language while preserving folder identities, access settings and unrelated configuration.",
  ],
 },
 "v2.0.0": {
  introduction:"First production release of the Landing Zone Configurator.",
  changes:[
   "Dedicated production infrastructure and public STACKIT login.",
   "Three web/API replicas, PostgreSQL replica set and rolling application deployments.",
   "Versioned, immutable application/Runner bundles; production activation requires manual approval.",
   "Shared foundations, Application Landing Zone upgrades and audit-log integration.",
  ],
 },
 "v2.1.0": {
  introduction:"Notifications and workspace management for the Landing Zone Configurator.",
  changes:[
   "Add the notification inbox and branded German/English MailOut emails with per-user topic preferences.",
   "Refresh member and invitation management with clear recipients and delivery status.",
   "Use explicit workspaces, improve English interface coverage and correct bodyless deletion requests.",
   "Show organization verification consistently in workspace selection.",
   "Build once and reuse the same immutable package for Dev and manually approved production, with optional Assistant qualification.",
  ],
 },
 "v2.0.1": {
  introduction:"Production fixes for the Landing Zone Configurator.",
  changes:[
   "Remove the obsolete Development badge from the application header.",
   "Enable Runner callbacks and shared warm reserves for the explicitly trusted production address.",
   "Wait for all three API replicas to become ready after activation, with a bounded timeout and unchanged availability checks.",
  ],
 },
};
const selected=notes[tag];
if(!selected)throw new Error("Curated release notes required for this version");
const limitations=["skip","accepted-assistant-limitations"].includes(process.env.LZC_RELEASE_MODE);
const qualificationNote=limitations&&selected.limitations?selected.limitations:process.env.LZC_RELEASE_MODE==="skip"?"Assistant live qualification was skipped. Intermittent model-service errors (#225), dialogue timeouts and incomplete multi-topic qualification (#275) remain known limitations.":limitations?"Known limitation: the enabled Assistant is not fully qualified; intermittent model-service HTTP 400 errors remain under investigation in #225.":"Assistant qualification is recorded in the attached source-bound release manifest.";
console.log(`${selected.introduction}\n\n${selected.changes.map(change=>`- ${change}`).join("\n")}\n\n${qualificationNote}\n\nOperator setup, credential rotation and recovery: [production runbook](https://github.com/stackitcloud/stackit-landing-zone/blob/${tag}/landing-zone-configurator/docs/production.md).`);
