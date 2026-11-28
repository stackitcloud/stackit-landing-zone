const tag=process.env.LZC_RELEASE_TAG;
if(!/^v(?:[2-9]|[1-9][0-9]+)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(tag??""))throw new Error("Expected a stable product release tag");
const notes={
 "v2.3.8": {
  introduction:"Complete retirement of non-empty buckets, including existing partial retirements.",
  changes:[
   "Add explicit bucket-content approval and automatic version, marker and multipart cleanup before OpenTofu Apply, using independent expiring credentials.",
   "Resume existing retirement State after original S3 credentials have been deleted; preserve retention protections, progress and partial-failure evidence.",
   "Provide an independent OpenTofu cleanup helper and recovery instructions without requiring the Configurator.",
  ],
 },
 "v2.3.7": {
  introduction:"More reliable retirement startup and live OpenTofu output.",
  changes:["Wait for slow Cloud Foundry runner package copies before starting retirement jobs.","Stream retirement OpenTofu progress using the same transport as Plan and Apply; clarify startup failures."],
 },
 "v2.3.6": {
  introduction:"Complete interrupted retirement reviews after pausing and resuming.",
  changes:[
   "Offer an explicit completion check for a reported run from before a pause, so the owner can resolve it and create a fresh Plan.",
   "Keep earlier-generation plans out of deletion approval and retain existing generation, State and execution checks; no Plan or Apply is replayed.",
  ],
  limitations:"Assistant behavior is unchanged: combined requests can still exceed the response deadline; full multi-topic qualification remains incomplete (#275), and intermittent serving errors are tracked in #225.",
 },
 "v2.3.5": {
  introduction:"A guided retirement workflow with clear current actions and read-only history.",
  changes:[
   "Keep the current retirement, its phase, plan output and deletion approval together; move cancelled attempts and superseded runs into collapsed history.",
   "Show actionable steps first, preserve unresolved recovery work, and separate pause/cancel controls from the normal workflow.",
  ],
  limitations:"Assistant behavior is unchanged: combined requests can still exceed the response deadline; full multi-topic qualification remains incomplete (#275), and intermittent serving errors are tracked in #225.",
 },
 "v2.3.4": {
  introduction:"Retirement completion checks now run automatically.",
  changes:[
   "Verify completed retirement Plans and Applies automatically, retry temporary completion-check failures and keep deletion approval tied to the reviewed native Plan.",
   "Explain pending approval in the interface without requiring users to stop runners; preserve explicit handling of interrupted executions and State recovery.",
  ],
  limitations:"Assistant behavior is unchanged: combined requests can still exceed the response deadline; full multi-topic qualification remains incomplete (#275), and intermittent serving errors are tracked in #225.",
 },
 "v2.3.3": {
  introduction:"Reliable retirement planning with live OpenTofu diagnostics.",
  changes:[
   "Compare retirement snapshots against the exact authoritative backend State, avoiding false failures when OpenTofu reserializes check results.",
   "Refresh retirement status automatically and show bounded, redacted OpenTofu progress, native diagnostics and the reviewed deletion details.",
   "Show the staged service, project and folder cleanup sequence, with technical evidence kept under optional details.",
  ],
  limitations:"Assistant behavior is unchanged: combined requests can still exceed the response deadline; full multi-topic qualification remains incomplete (#275), and intermittent serving errors are tracked in #225.",
 },
 "v2.3.2": {
  introduction:"Simpler retirement with automatic service-account project verification.",
  changes:[
   "Automatically identify and verify the project in which the selected service account was created, including existing credential profiles; no manual project ID is required.",
   "Keep project details optional, offer an in-place verification retry and keep State handover blocked until verification succeeds.",
   "Use a clear Continue retirement action and verify that the cleanup account survives outside the complete retirement target ancestry.",
  ],
  limitations:"Assistant behavior is unchanged: combined requests can still exceed the response deadline; full multi-topic qualification remains incomplete (#275), and intermittent serving errors are tracked in #225.",
 },
 "v2.3.1": {
  introduction:"Retire applied platform Landing Zones directly from the platform workflow.",
  changes:[
   "Select a successful current platform Apply without creating an Application platform binding or publishing templates.",
   "Read native folder scope from the existing State and freeze new admissions before staged retirement.",
   "Accept verified completed S3 backend migrations while retaining checks for open or inconsistent migrations.",
   "Preserve CF runtime toggles for Retirement, Assistant and MailOut across deployments.",
  ],
  limitations:"Assistant behavior is unchanged: combined requests can still exceed the response deadline; full multi-topic qualification remains incomplete (#275), and intermittent serving errors are tracked in #225.",
 },
 "v2.3.0": {
  introduction:"Simpler planning, reviewed Apply retries and safe configuration cleanup.",
  changes:[
   "Start a Plan from the current configuration and create missing credentials inline; guide Application template publication while keeping expert controls under Advanced.",
   "Retry failed Platform and Application Applies through a fresh Plan against the existing State, with internal execution checks and renewed Apply approval.",
   "Delete saved configurations from the list or editor; delete all workspace configurations together once deployed Landing Zones are fully retired.",
   "Reduce Assistant catalogue and tool overhead, cache public product data and show progress while responses are reviewed.",
  ],
  limitations:"Assistant quality checks remain enabled. Combined requests can still exceed the response deadline; full multi-topic qualification remains incomplete (#275), and intermittent serving errors are tracked in #225.",
 },
 "v2.2.7": {
  introduction:"Restore first-time Application Landing Zone planning.",
  changes:[
   "Recognize OpenTofu's pristine empty State for new orders and avoid starting IAM migration checks before a project exists.",
   "Keep existing State and IAM protections; retry the same order without recreating its platform binding or project.",
  ],
 },
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
