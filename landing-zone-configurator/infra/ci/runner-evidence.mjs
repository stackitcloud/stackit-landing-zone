// Never echo CF log lines: they can contain OAuth callback URLs.
import { createInterface } from "node:readline";
const runId=process.argv[2];
if(!/^\d+$/.test(runId??"")) throw new Error("Expected CI run ID");
let evidence;
for await(const line of createInterface({input:process.stdin})) {
  if(!line.includes('"service":"plan-runner-isolation"'))continue;
  const start=line.indexOf('{'),end=line.lastIndexOf('}');
  if(start<0||end<start)continue;
  try {
    const value=JSON.parse(line.slice(start,end+1));
    if(value.service!=="plan-runner-isolation"||value.runId!==runId||value.ok!==true)continue;
    if(![value.dispatchMilliseconds,value.completionMilliseconds].every(n=>Number.isInteger(n)&&n>=0&&n<=600000))continue;
    evidence={service:"plan-runner-isolation",runId,ok:true,dispatchMilliseconds:value.dispatchMilliseconds,completionMilliseconds:value.completionMilliseconds};
  }catch{}
}
if(evidence)console.log(JSON.stringify(evidence));
else {console.error("Runner timing evidence not yet available");process.exitCode=1;}
