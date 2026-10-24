// Run as a route-free, short-lived Dev operator task using the deployed API image.
// Only read-only SQL transactions; no sessions, job dispatch or cloud operations.
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash = /^[a-f0-9]{64}$/;
const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
export function configuration(raw, env, now = Date.now()) {
  const c = JSON.parse(raw), cf = JSON.parse(env.VCAP_APPLICATION || "null");
  const b = c?.binding, d = b?.backend;
  if (!c || Object.keys(c).sort().join() !== "binding,expiresAt,startedAt" ||
      !b || Object.keys(b).sort().join() !== "backend,backendSha256,creates,instanceId,planId,runnerSpace,runnerTemplate,sourceDropletId,tenantId,version" ||
      ![b.instanceId,b.tenantId,b.planId,b.runnerSpace,b.runnerTemplate,b.sourceDropletId].every(x => typeof x === "string" && uuid.test(x)) ||
      b.version !== 1 || !hash.test(b.backendSha256) || !Number.isSafeInteger(b.creates) || b.creates < 2 || b.creates > 1000 ||
      !d || Object.keys(d).sort().join() !== "bucket,endpoint,key,region,useLockfile" ||
      d.endpoint !== "https://object.storage.eu01.onstackit.cloud" || d.region !== "eu01" || d.useLockfile !== true ||
      !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(d.bucket) || d.key !== `applications/${b.tenantId}/${b.instanceId}/terraform.tfstate` ||
      !utc.test(c.startedAt) || !utc.test(c.expiresAt) || !Number.isFinite(Date.parse(c.startedAt)) || !Number.isFinite(Date.parse(c.expiresAt)) ||
      Date.parse(c.startedAt) > now + 1000 || Date.parse(c.startedAt) < now - 300000 ||
      Date.parse(c.expiresAt) <= now || Date.parse(c.expiresAt) > now + 900000 || Date.parse(c.expiresAt)-Date.parse(c.startedAt)>900000 ||
      env.LZC_DATABASE_USER !== "configurator_migration" || env.LZC_DATABASE_NAME !== "configurator" ||
      cf?.cf_api !== "https://api.system.01.cf.eu01.stackit.cloud" || cf.organization_name !== "lzc-dev" || cf.space_name !== "configurator" ||
      !/^lzc-recovery-drill-operator-[a-f0-9]{12}$/.test(cf.application_name) || !uuid.test(cf.application_id) ||
      !Array.isArray(cf.application_uris) || cf.application_uris.length) throw new Error("Exact short-lived Dev observer configuration required");
  return c;
}

export const planQuery = `SELECT p.id, d.status, d.runner_package_id, r.sha256, r.summary,
 to_regclass('lzc.application_apply_interruptions') IS NOT NULL AS diagnosis_available,
 b.descriptor=$4::jsonb AS exact_backend,
 p.expires_at>clock_timestamp() AS unexpired,
 EXISTS(SELECT 1 FROM lzc.application_jobs WHERE instance_id=p.instance_id AND operation='apply') AS already_applied
 FROM lzc.application_jobs p JOIN lzc.application_dispatches d ON d.job_id=p.id
 JOIN lzc.application_runner_records r ON r.job_id=p.id AND r.kind='artifact'
 JOIN lzc.application_job_backends b ON b.job_id=p.id
 WHERE p.id=$2::uuid AND p.instance_id=$1::uuid AND p.tenant_id=$3::uuid AND p.operation='plan'
 AND coalesce(p.inputs->>'purpose','standard')='standard'`;

export const candidateQuery = `SELECT j.id AS job_id, j.created_at, d.status, d.runner_app_id,
 d.runner_package_id, encode(sha256(convert_to(b.descriptor::text,'UTF8')),'hex') AS backend_sha256
 FROM lzc.application_jobs j JOIN lzc.application_dispatches d ON d.job_id=j.id AND d.tenant_id=j.tenant_id AND d.instance_id=j.instance_id AND d.owner_user_id=j.owner_user_id
 JOIN lzc.application_job_grants g ON g.job_id=j.id AND g.tenant_id=j.tenant_id AND g.owner_user_id=j.owner_user_id AND g.binding_sha256=j.binding_sha256
 JOIN lzc.application_job_backends b ON b.job_id=j.id AND b.tenant_id=j.tenant_id AND b.owner_user_id=j.owner_user_id
 JOIN lzc.application_runner_tickets t ON t.job_id=j.id AND t.tenant_id=j.tenant_id AND t.consumed_at IS NOT NULL AND t.runner_package_id=d.runner_package_id
 JOIN lzc.application_job_claims claim ON claim.job_id=j.id AND claim.tenant_id=j.tenant_id AND claim.owner_user_id=j.owner_user_id
 JOIN lzc.application_jobs p ON p.id=j.plan_id AND p.operation='plan' AND p.instance_id=j.instance_id AND p.tenant_id=j.tenant_id AND p.owner_user_id=j.owner_user_id
 JOIN lzc.application_runner_records r ON r.job_id=p.id AND r.tenant_id=j.tenant_id AND r.owner_user_id=j.owner_user_id AND r.kind='artifact' AND r.sha256=j.artifact_sha256
 WHERE j.instance_id=$1::uuid AND j.plan_id=$2::uuid AND j.tenant_id=$3::uuid
 AND j.created_at >= $4::timestamptz AND j.operation='apply' AND coalesce(j.inputs->>'purpose','standard')='standard'
 AND b.descriptor=$5::jsonb AND g.state_key=$6 AND b.approved_by=g.approved_by
 AND d.runner_package_id=$7::uuid AND d.runner_app_id IS NOT NULL
 AND g.revoked_at IS NULL AND g.expires_at>clock_timestamp() AND t.expires_at>clock_timestamp() AND claim.expires_at>clock_timestamp()
 ORDER BY j.created_at DESC LIMIT 2`;

export async function readonly(client, sql, values) {
  await client.query("BEGIN READ ONLY");
  try {
    await client.query("SET LOCAL statement_timeout='2s'");
    const result = await client.query(sql, values);
    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function preflight(client, c) {
  const b = c.binding;
  const rows = await readonly(client, planQuery, [b.instanceId,b.planId,b.tenantId,JSON.stringify(b.backend)]);
  if (rows.length !== 1 || rows[0].status !== "succeeded" || rows[0].runner_package_id !== b.sourceDropletId ||
      !hash.test(rows[0].sha256) || !rows[0].diagnosis_available || !rows[0].exact_backend || !rows[0].unexpired || rows[0].already_applied ||
      rows[0].summary?.resources?.create !== b.creates ||
      ["update","delete","replace"].some(key => rows[0].summary?.resources?.[key] !== 0))
    throw new Error("Unapplied, current-source initial Plan required");
}

export async function inspect(client, c) {
  const b = c.binding;
  const rows = await readonly(client, candidateQuery,
    [b.instanceId,b.planId,b.tenantId,c.startedAt,JSON.stringify(b.backend),b.backend.key,b.sourceDropletId]);
  if (rows.length > 1) throw new Error("Ambiguous concurrent Apply candidates");
  const r = rows[0];
  if (!r) return {event:"application_apply_observer_idle",observedAt:new Date().toISOString()};
  if (![r.job_id,r.runner_app_id,r.runner_package_id].every(x=>typeof x==="string" && uuid.test(x)) ||
      r.runner_package_id !== b.sourceDropletId || r.backend_sha256 !== b.backendSha256 ||
      !(r.created_at instanceof Date) || !Number.isFinite(r.created_at.getTime()) || r.created_at.getTime()<Date.parse(c.startedAt))
    throw new Error("Candidate binding changed");
  return {event:"application_apply_candidate",instanceId:b.instanceId,planId:b.planId,jobId:r.job_id,
    appId:r.runner_app_id,sourceDropletId:r.runner_package_id,backendSha256:r.backend_sha256,
    jobCreatedAt:r.created_at.toISOString(),observedAt:new Date().toISOString(),status:r.status};
}

export async function run(env) {
  const c=configuration(env.LZC_RECOVERY_DRILL,env);
  const {default:pg}=await import("pg");
  const {pathToFileURL}=await import("node:url");
  const {resolve}=await import("node:path");
  const {databaseConfig}=await import(pathToFileURL(resolve("apps/api/dist/storage/database.js")).href);
  const client=new pg.Client(databaseConfig());
  await client.connect();
  try {
    await preflight(client,c);
    console.log(JSON.stringify({event:"apply-db-observer-ready",qualifiesRecovery:false}));
    while(Date.now()<Date.parse(c.expiresAt)) {
      console.log(JSON.stringify(await inspect(client,c)));
      await new Promise(done=>setTimeout(done,1000));
    }
  } finally {await client.end();}
}

if(process.env.LZC_RECOVERY_DRILL) {
  run(process.env).catch(()=>{
    console.error(JSON.stringify({event:"apply-db-observer-failed",qualifiesRecovery:false}));
    process.exitCode=1;
  });
}
