import { setTimeout as delay } from "node:timers/promises";
import { deploymentStage } from "./stages.mjs";
const origin=deploymentStage("lzc-prod").publicOrigin;
// STACKIT issues a custom-domain certificate asynchronously after route mapping.
const deadline=Date.now()+65*60_000;
for (;;) {
  let ready=false;
  try {
    const response=await fetch(`${origin}/healthz`,{redirect:"error",signal:AbortSignal.timeout(15_000)});
    const health=await response.json();
    ready=response.ok&&health.status==="ok"&&health.authentication==="stackit";
  } catch { /* Retry readiness without weakening TLS validation or logging callback URLs. */ }
  if(ready)break;
  if(Date.now()>=deadline)throw new Error("Production TLS/health readiness timed out; inspect DNS, route and certificate issuance");
  await delay(15_000);
}
const status=await fetch(`${origin}/auth/status`,{redirect:"error",signal:AbortSignal.timeout(15_000)});
const auth=await status.json();
if(!status.ok||auth.primary!=="stackit"||auth.stackit!==true||auth.stackitFlow!=="authorization-code")throw new Error("Production STACKIT login configuration is invalid");
for(const path of ["/api/v1/session","/api/v1/configurations/template-advice","/api/v1/applications/templates","/api/v1/applications/instances"]){
 const response=await fetch(`${origin}${path}`,{redirect:"error",signal:AbortSignal.timeout(15_000)});
 if(response.status!==401)throw new Error("Production requires authentication on every protected entrypoint");
 await response.body?.cancel();
}
console.log("Production HTTPS, STACKIT PKCE and unauthenticated access checks passed.");
