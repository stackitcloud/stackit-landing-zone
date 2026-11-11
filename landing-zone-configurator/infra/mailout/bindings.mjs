// Shared release binding validation: credentials never enter the frontend or Runner.
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const mailoutKeys=Object.freeze(['LZC_MAILOUT_ENABLED','LZC_MAILOUT_HOST','LZC_MAILOUT_PORT','LZC_MAILOUT_USERNAME','LZC_MAILOUT_PASSWORD','LZC_MAILOUT_FROM']);
export function mailoutEnvironment(raw,stage,projectId) {
 if(!raw)return {LZC_MAILOUT_ENABLED:'false',LZC_MAILOUT_HOST:'',LZC_MAILOUT_PORT:'25',LZC_MAILOUT_USERNAME:'',LZC_MAILOUT_PASSWORD:'',LZC_MAILOUT_FROM:''};
 let b;try{b=JSON.parse(raw);}catch{throw Error('mailout_bindings_invalid');}
 const domain=stage==='lzc-dev'?'dev.landing-zone.runs.onstackit.cloud':stage==='lzc-prod'?'landing-zone.runs.onstackit.cloud':null;
 if(!domain||b.schemaVersion!==1||b.projectId!==projectId||!uuid.test(b.domainId)||!uuid.test(b.senderId)||b.from!==`notifications@${domain}`||!/^smtp[0-9]*\.[a-z0-9.-]+\.stackit\.cloud$/.test(b.host)||![25,465,587].includes(b.port)||typeof b.username!=='string'||!b.username||typeof b.password!=='string'||!b.password)throw Error('mailout_bindings_invalid');
 return {LZC_MAILOUT_ENABLED:'true',LZC_MAILOUT_HOST:b.host,LZC_MAILOUT_PORT:String(b.port),LZC_MAILOUT_USERNAME:b.username,LZC_MAILOUT_PASSWORD:b.password,LZC_MAILOUT_FROM:b.from};
}
