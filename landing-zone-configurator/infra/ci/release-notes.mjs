const tag=process.env.LZC_RELEASE_TAG;
if(!/^v(?:[2-9]|[1-9][0-9]+)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(tag??""))throw new Error("Expected a stable product release tag");
const notes={
 "v2.0.0": {
  introduction:"First production release of the Landing Zone Configurator.",
  changes:[
   "Dedicated production infrastructure and public STACKIT login.",
   "Three web/API replicas, PostgreSQL replica set and rolling application deployments.",
   "Versioned, immutable application/Runner bundles; production activation requires manual approval.",
   "Shared foundations, Application Landing Zone upgrades and audit-log integration.",
  ],
 },
 "v2.0.1": {
  introduction:"Production fixes for the Landing Zone Configurator.",
  changes:[
   "Remove the obsolete Development badge from the application header.",
   "Wait for all three API replicas to become ready after activation, with a bounded timeout and unchanged availability checks.",
  ],
 },
};
const selected=notes[tag];
if(!selected)throw new Error("Curated release notes required for this version");
const limitations=process.env.LZC_RELEASE_MODE==="accepted-assistant-limitations";
console.log(`${selected.introduction}\n\n${selected.changes.map(change=>`- ${change}`).join("\n")}\n\n${limitations?"Known limitation: the enabled Assistant is not fully qualified; intermittent model-service HTTP 400 errors remain under investigation in #225.":"Assistant qualification is recorded in the attached source-bound release manifest."}\n\nOperator setup, credential rotation and recovery: [production runbook](https://github.com/stackitcloud/stackit-landing-zone/blob/${tag}/landing-zone-configurator/docs/production.md).`);
