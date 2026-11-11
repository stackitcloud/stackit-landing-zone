import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mailoutKeys } from '../mailout/bindings.mjs';

export function assertMailoutBinding(expected,actual) {
 for(const key of [...mailoutKeys,'LZC_PUBLIC_ORIGIN']) {
  if(typeof expected[key]!=='string'||actual[key]!==expected[key])throw Error('CF MailOut binding does not match the approved release');
 }
 return {service:'mailout-binding',ok:true,enabled:actual.LZC_MAILOUT_ENABLED==='true'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
 try {
 const expected=JSON.parse(readFileSync(resolve(process.env.LZC_PRIVATE,'app-vars.json'),'utf8'));
 const app=execFileSync('cf',['app','landing-zone-configurator','--guid'],{encoding:'utf8'}).trim();
 if(!/^[a-f0-9-]{36}$/.test(app))throw Error('Expected application identity');
 const actual=JSON.parse(execFileSync('cf',['curl',`/v3/apps/${app}/environment_variables`],{encoding:'utf8',maxBuffer:4*1024*1024}));
 console.log(JSON.stringify(assertMailoutBinding(expected,actual.var)));
 } catch {
  console.error(JSON.stringify({service:'mailout-binding',ok:false}));
  process.exitCode=1;
 }
}
