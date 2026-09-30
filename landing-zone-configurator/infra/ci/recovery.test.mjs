import test from "node:test";
import assert from "node:assert/strict";
import { recoverPlatform } from "./recovery.mjs";
const inputs={root:"platform",project:"project",commit:"a".repeat(40)};
const manifest={project:"project",failedRun:"123",lockId:"known-lock",imports:{"stackit_scf_organization.configurator":"project,eu01,id"}};
test("recovery rejects unapproved commit before any cloud access",async()=>{
  await assert.rejects(recoverPlatform({manifest,inputs}),/exact approved/);
});
test("active prior runner blocks unlocking and imports",async()=>{
  const original=globalThis.fetch;process.env.LZC_RECOVERY_COMMIT=inputs.commit;
  try { globalThis.fetch=async()=>({ok:true,json:async()=>({status:"in_progress",conclusion:null})});
    await assert.rejects(recoverPlatform({manifest,inputs,tofu:()=>assert.fail("must not mutate")}),/not completed/);
  }finally{globalThis.fetch=original;delete process.env.LZC_RECOVERY_COMMIT;}
});
test("failed import stops before credential revocation",async()=>{
  const original=globalThis.fetch;process.env.LZC_RECOVERY_COMMIT=inputs.commit;const calls=[];
  try { globalThis.fetch=async()=>({ok:true,json:async()=>({status:"completed",conclusion:"cancelled"})});
    await assert.rejects(recoverPlatform({manifest,inputs,tofu:async(_root,args)=>{calls.push(args);if(args[0]==="import")throw new Error("import failed")}}),/import failed/);
    assert.deepEqual(calls.map(x=>x[0]),["force-unlock","import"]);assert.equal(calls[0][2],"known-lock");
  }finally{globalThis.fetch=original;delete process.env.LZC_RECOVERY_COMMIT;}
});
