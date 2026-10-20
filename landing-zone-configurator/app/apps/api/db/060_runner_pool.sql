CREATE TABLE lzc.runner_pool_slots (
 id uuid PRIMARY KEY,
 pool_key text NOT NULL,
 origin text NOT NULL,
 space_id uuid NOT NULL,
 source_droplet_id uuid NOT NULL,
 app_id uuid,
 token_hash text,
 status text NOT NULL CHECK (status IN ('warming','ready','reserved','assigned','consumed','retiring')),
 job_id uuid UNIQUE,
 is_probe boolean NOT NULL DEFAULT false,
 assignment bytea,
 created_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz,
 expires_at timestamptz NOT NULL,
 CHECK ((status='assigned') = (assignment IS NOT NULL)),
 CHECK (token_hash IS NULL OR token_hash ~ '^[a-f0-9]{64}$'),
 CHECK (status NOT IN ('reserved','assigned','consumed') OR job_id IS NOT NULL)
);
CREATE INDEX runner_pool_capacity ON lzc.runner_pool_slots(pool_key,status);
COMMENT ON TABLE lzc.runner_pool_slots IS 'Operator-owned one-shot runner leases, not tenant configuration. Assignment capabilities are encrypted and erased on consumption.';
REVOKE ALL ON lzc.runner_pool_slots FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON lzc.runner_pool_slots TO configurator_app;
