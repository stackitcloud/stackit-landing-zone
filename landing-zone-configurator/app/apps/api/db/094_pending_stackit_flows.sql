CREATE TABLE lzc_auth.pending_stackit_flows (
 scope text NOT NULL,
 key_hash text NOT NULL,
 payload bytea NOT NULL CHECK (octet_length(payload) BETWEEN 28 AND 262144),
 lease uuid,
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(scope,key_hash)
);
CREATE INDEX pending_stackit_flows_expiry ON lzc_auth.pending_stackit_flows(expires_at);
REVOKE ALL ON lzc_auth.pending_stackit_flows FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON lzc_auth.pending_stackit_flows TO configurator_app;
