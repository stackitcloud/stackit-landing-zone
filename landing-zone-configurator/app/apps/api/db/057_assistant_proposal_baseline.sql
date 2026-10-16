ALTER TABLE lzc.assistant_conversations
 ADD COLUMN proposal_baseline jsonb CHECK (proposal_baseline IS NULL OR jsonb_typeof(proposal_baseline)='object');

GRANT UPDATE(proposal_baseline) ON lzc.assistant_conversations TO configurator_app;
