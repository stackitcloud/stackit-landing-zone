ALTER TABLE lzc.plan_runs
 ADD COLUMN output_ciphertext bytea CHECK(octet_length(output_ciphertext) BETWEEN 28 AND 2097180),
 ADD COLUMN output_truncated boolean NOT NULL DEFAULT false;

GRANT UPDATE(output_ciphertext,output_truncated) ON lzc.plan_runs TO configurator_app;