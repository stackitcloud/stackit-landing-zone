import test from "node:test";
import assert from "node:assert/strict";
import { waitForProductionReplicas } from "./production-readiness.mjs";
const guid="11111111-2222-4333-8444-555555555555";
const processes=()=>({resources:[{type:"web",guid,instances:3}]});
const stats=states=>({resources:states.map(state=>({state}))});
function clock(){let elapsed=0;return{now:()=>elapsed,sleep:async ms=>{elapsed+=ms;},elapsed:()=>elapsed};}

test("accepts three ready replicas immediately",async()=>{
 const time=clock();
 await waitForProductionReplicas({readProcesses:processes,readStats:()=>stats(["RUNNING","RUNNING","RUNNING"]),...time});
 assert.equal(time.elapsed(),0);
});
test("waits for the third replica after CF start returns with two running",async()=>{
 const time=clock();let calls=0;
 await waitForProductionReplicas({readProcesses:processes,readStats:()=>stats(++calls===1?["STARTING","RUNNING","RUNNING"]:["RUNNING","RUNNING","RUNNING"]),...time});
 assert.equal(calls,2);assert.equal(time.elapsed(),5000);
});
test("waits for temporarily incomplete stats without accepting two replicas",async()=>{
 const time=clock();let calls=0;
 await waitForProductionReplicas({readProcesses:processes,readStats:()=>stats(++calls===1?["RUNNING","RUNNING"]:["RUNNING","RUNNING","RUNNING"]),...time});
 assert.equal(calls,2);assert.equal(time.elapsed(),5000);
});
test("fails within five minutes for permanently starting, down or crashed replicas",async()=>{
 for(const state of ["STARTING","DOWN","CRASHED"]){
  const time=clock();let calls=0;
  await assert.rejects(waitForProductionReplicas({readProcesses:processes,readStats:()=>{calls++;return stats([state,"RUNNING","RUNNING"]);},...time}),/readiness deadline/);
  assert.equal(time.elapsed(),300000);assert.equal(calls,61);
 }
});
test("rejects changed topology and malformed stats immediately",async()=>{
 for(const resources of [[],[{type:"web",guid,instances:2}],[{type:"web",guid:"invalid",instances:3}],[{type:"web",guid,instances:3},{type:"web",guid,instances:3}]]){
  await assert.rejects(waitForProductionReplicas({readProcesses:()=>({resources}),readStats:()=>{throw Error("must not read stats");},...clock()}),/replica count/);
 }
 for(const value of [{},{resources:null},stats(["UNKNOWN"]),stats(["RUNNING","RUNNING","RUNNING","RUNNING"])]){
  await assert.rejects(waitForProductionReplicas({readProcesses:processes,readStats:()=>value,...clock()}),/status is invalid/);
 }
});
test("does not hide CF API failures",async()=>{
 await assert.rejects(waitForProductionReplicas({readProcesses:processes,readStats:()=>{throw new Error("synthetic API failure");},...clock()}),/synthetic API failure/);
});
