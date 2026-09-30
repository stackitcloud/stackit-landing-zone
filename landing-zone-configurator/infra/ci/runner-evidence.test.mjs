import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('./runner-evidence.mjs',import.meta.url));
test('emits only bounded timing values from this run, never raw log data',()=>{
 const secret='must-not-appear';
 const input=[`router GET /auth/github/callback?code=${secret}`,JSON.stringify({service:'plan-runner-isolation',runId:'11',ok:true,dispatchMilliseconds:1,completionMilliseconds:2}),`prefix ${JSON.stringify({service:'plan-runner-isolation',runId:'12',ok:true,dispatchMilliseconds:1234,completionMilliseconds:4321,token:secret})}`].join('\n');
 const result=spawnSync(process.execPath,[script,'12'],{input,encoding:'utf8'});
 assert.equal(result.status,0);assert.ok(!result.stdout.includes(secret));assert.ok(!result.stderr.includes(secret));
 assert.deepEqual(JSON.parse(result.stdout),{service:'plan-runner-isolation',runId:'12',ok:true,dispatchMilliseconds:1234,completionMilliseconds:4321});
 const invalid=spawnSync(process.execPath,[script,'13'],{input,encoding:'utf8'});assert.equal(invalid.status,1);assert.ok(!invalid.stdout.includes(secret));
});
