const tag=process.env.LZC_RELEASE_TAG;
if(!/^v(?:[2-9]|[1-9][0-9]+)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(tag??""))throw new Error("Expected a stable product release tag");
const notes={
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
const qualificationNote=process.env.LZC_RELEASE_MODE==="skip"?"Assistant live qualification was skipped for this release; known intermittent model-service HTTP 400 errors remain tracked in #225.":limitations?"Known limitation: the enabled Assistant is not fully qualified; intermittent model-service HTTP 400 errors remain under investigation in #225.":"Assistant qualification is recorded in the attached source-bound release manifest.";
console.log(`${selected.introduction}\n\n${selected.changes.map(change=>`- ${change}`).join("\n")}\n\n${qualificationNote}\n\nOperator setup, credential rotation and recovery: [production runbook](https://github.com/stackitcloud/stackit-landing-zone/blob/${tag}/landing-zone-configurator/docs/production.md).`);
