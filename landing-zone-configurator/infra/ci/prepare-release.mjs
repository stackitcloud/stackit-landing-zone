// File preparation only; tofu and cf remain explicit commands in the workflow.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
const mode=process.argv[2];
if(!["backend","application"].includes(mode)) throw new Error("Expected backend or application");
const required=name=>{if(!process.env[name])throw new Error(`Missing ${name}`);return process.env[name];};
if(required("GITHUB_REPOSITORY")!=="stackitcloud/stackit-landing-zone" || !["refs/heads/main","refs/heads/feature/landing-zone-configurator"].includes(required("GITHUB_REF")))throw new Error("Unexpected release source");
process.umask(0o077);
const dir=resolve(required("RUNNER_TEMP"),"lzc-release");mkdirSync(dir,{recursive:true,mode:0o700});
const mask=value=>console.log(`::add-mask::${String(value).replaceAll("%","%25").replaceAll("\r","%0D").replaceAll("\n","%0A")}`);
function publish(name,value,secret=false){if(secret)mask(value);const d=`lzc_${randomUUID()}`;appendFileSync(required("GITHUB_ENV"),`${name}<<${d}\n${value}\n${d}\n`);}
if(mode==="backend") {
  const bucket=required("LZC_WORKLOAD_BUCKET");
  if(bucket!=="lzc-dev-state-7dbff805")throw new Error("Unexpected workload bucket");
  for(const root of ["platform","runtime"]){
    const passphrase=required(`LZC_STATE_KEY_${root.toUpperCase()}`).trim();
    if(passphrase.length<32)throw new Error("Invalid state key");
    mask(passphrase);
    writeFileSync(resolve(dir,`${root}.encryption.json`),JSON.stringify({key_provider:{pbkdf2:{state:{passphrase}}}}),{mode:0o600});
    const backend={bucket,key:`configurator/lzc-dev/${root}/terraform.tfstate`,region:"eu01",endpoints:{s3:"https://object.storage.eu01.onstackit.cloud"},use_path_style:true,use_lockfile:true,skip_credentials_validation:true,skip_region_validation:true,skip_requesting_account_id:true,skip_metadata_api_check:true,skip_s3_checksum:true};
    writeFileSync(resolve(dir,`${root}.backend.hcl`),Object.entries(backend).map(([k,v])=>`${k} = ${JSON.stringify(v)}`).join("\n"),{mode:0o600});
  }
  publish("AWS_ACCESS_KEY_ID",required("LZC_WORKLOAD_ACCESS_KEY"),true);
  publish("AWS_SECRET_ACCESS_KEY",required("LZC_WORKLOAD_SECRET_KEY"),true);
  publish("CF_HOME",resolve(dir,"cf"));
} else {
  const platform=JSON.parse(readFileSync(resolve(dir,"platform-outputs.json"),"utf8"));
  const runtime=JSON.parse(readFileSync(resolve(dir,"runtime-outputs.json"),"utf8"));
  const cf=platform.cf_runtime?.value, space=runtime.space?.value, values=runtime.app_environment?.value;
  if(cf?.api_url!=="https://api.system.01.cf.eu01.stackit.cloud" || cf?.org_id!=="a4514c42-d378-4e36-90eb-a3a1e3017e65" || space?.name!=="configurator" || !space.id || !cf.username || !cf.password || !values)throw new Error("Unexpected CF destination or incomplete runtime");
  const keys=["LZC_DATABASE_HOST","LZC_DATABASE_PORT","LZC_DATABASE_NAME","LZC_DATABASE_USER","LZC_DATABASE_PASSWORD","LZC_SECRETS_ADDRESS","LZC_SECRETS_INSTANCE_ID","LZC_SECRETS_USERNAME","LZC_SECRETS_PASSWORD","LZC_MODEL_SERVING_TOKEN"];
  const vars={};for(const key of keys){if(typeof values[key]!=="string"||!values[key])throw new Error(`Missing runtime input ${key}`);mask(values[key]);vars[key]=values[key];}
  writeFileSync(resolve(dir,"app-vars.json"),JSON.stringify(vars),{mode:0o600});
  publish("CF_API_URL",cf.api_url);publish("CF_USERNAME",cf.username,true);publish("CF_PASSWORD",cf.password,true);publish("LZC_CF_SPACE_ID",space.id);
}
publish("LZC_PRIVATE",dir);
