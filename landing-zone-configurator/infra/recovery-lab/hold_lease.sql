WITH candidate AS (
 SELECT id FROM lzc.runner_pool_slots
 WHERE space_id=$1 AND origin=$2 AND source_droplet_id=$3 AND status='ready'
  AND job_id IS NULL AND app_id IS NOT NULL AND NOT is_probe
  AND last_seen_at>now()-interval '10 seconds' AND expires_at>now()+interval '30 seconds'
 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
)
UPDATE lzc.runner_pool_slots slot
 SET status='warming',token_hash=$4,last_seen_at=NULL,expires_at=now()+interval '2 minutes'
 FROM candidate WHERE slot.id=candidate.id
 RETURNING slot.id,slot.app_id,slot.source_droplet_id;
