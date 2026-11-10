// Local bootstrap only; remote roots remain exclusive to serialized GitHub workflows.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { stateKey } from "../state-key.mjs";
const [root, configPath] = process.argv.slice(2);
if (!["operator-project", "seed", "seed-protection"].includes(root) || !configPath || process.argv.length!==4 || process.env.CI || process.env.GITHUB_ACTIONS) throw new Error("Usage: prepare-production-bootstrap.mjs operator-project|seed|seed-protection PRIVATE_CONFIG");
process.umask(0o077);
const config=JSON.parse(readFileSync(resolve(configPath),"utf8"));
if(!/^[a-f0-9-]{36}$/.test(config.projectId??"") || !config.ownerEmail || !config.centralKeyPath || !config.parentContainerId || !config.existingProjectContainerId || !Number.isFinite(Date.parse(config.credentialExpiration))) throw new Error("Incomplete explicit production bootstrap configuration");
const base=resolve(".local/lzc-prod"),dir=resolve(base,root);
mkdirSync(dir,{recursive:true,mode:0o700});
const passphrase=stateKey(dir,{validation:false});
const env={TF_INPUT:"0",TF_DATA_DIR:resolve(dir,"data"),TF_ENCRYPTION:JSON.stringify({key_provider:{pbkdf2:{state:{passphrase}}}}),TF_VAR_region:"eu01"};
if(root==="operator-project"){
 Object.assign(env,{STACKIT_SERVICE_ACCOUNT_KEY_PATH:resolve(config.centralKeyPath),TF_VAR_operator_service_account_email:config.centralServiceAccountEmail,TF_VAR_owner_email:config.ownerEmail,TF_VAR_project_name:"Landing Zone Configurator - Prod",TF_VAR_parent_container_id:config.parentContainerId,TF_VAR_existing_project_container_id:config.existingProjectContainerId});
}else if(root==="seed"){
 const output=JSON.parse(readFileSync(resolve(base,"operator-project/outputs.json"),"utf8"));
 if(output.project?.value?.id!==config.projectId)throw new Error("Bootstrap project does not match");
 const key=output.provisioning_key?.value;
 const credentialPath=resolve(base,"provisioning-key.json");
 const credential=typeof key==="string"?JSON.parse(key):key;
 if(!credential || typeof credential!=="object")throw new Error("Missing dedicated production provisioning key");
 writeFileSync(credentialPath,JSON.stringify(credential),{mode:0o600});
 Object.assign(env,{STACKIT_SERVICE_ACCOUNT_KEY_PATH:credentialPath,TF_VAR_project_id:config.projectId,TF_VAR_name_prefix:"lzc-prod",TF_VAR_state_credential_expiration:config.credentialExpiration});
}else{
 const output=JSON.parse(readFileSync(resolve(base,"seed/outputs.json"),"utf8"));
 if(output.backend?.value?.bucket!==`lzc-prod-management-${config.projectId.slice(0,8)}`)throw new Error("Wrong production seed");
 const credentials=output.backend_credentials?.value;
 if(!credentials?.access_key||!credentials?.secret_key)throw new Error("Missing management credentials");
 Object.assign(env,{AWS_ACCESS_KEY_ID:credentials.access_key,AWS_SECRET_ACCESS_KEY:credentials.secret_key,TF_VAR_state_bucket_name:output.backend.value.bucket});
}
writeFileSync(resolve(dir,"backend.hcl"),`path = ${JSON.stringify(resolve(dir,"terraform.tfstate"))}\n`,{mode:0o600});
const quote=value=>`'${String(value).replaceAll("'","'\\''")}'`;
const inherited=Object.keys(process.env).filter(key=>/^(AWS_|STACKIT_|TF_VAR_|TF_CLI_ARGS|TF_LOG)/.test(key)&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(key));
writeFileSync(resolve(dir,"environment.sh"),(inherited.length?`unset ${inherited.join(" ")}\n`:"")+Object.entries(env).map(([name,value])=>`export ${name}=${quote(value)}`).join("\n")+"\n",{mode:0o600});
console.log(`Prepared isolated production ${root}; run OpenTofu explicitly. Credentials were not displayed.`);
