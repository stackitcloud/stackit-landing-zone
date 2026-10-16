import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const binary=["timeout","gtimeout"].find(cmd=>spawnSync(cmd,["--version"],{encoding:"utf8"}).status===0);
test("GNU timeout streams progress, allows cleanup after SIGINT and remains a failure",{skip:!binary&&"GNU coreutils unavailable; executed on the Linux CI runner"},()=>{
 const r=spawnSync(binary,["--foreground","--signal=INT","--kill-after=2s","0.5s",process.execPath,"-e",'console.log("progress");process.on("SIGINT",()=>setTimeout(()=>{console.log("state saved");process.exit(0)},80));setInterval(()=>{},20)'],{encoding:"utf8",timeout:5000});
 assert.equal(r.status,124);assert.match(r.stdout,/progress/);assert.match(r.stdout,/state saved/);
});
