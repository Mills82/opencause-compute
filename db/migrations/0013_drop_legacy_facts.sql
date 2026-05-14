-- Breaking private-alpha migration: Cancer Knowledge Miner now stores only canonical claims-v2 candidate evidence.
DROP TABLE IF EXISTS extracted_facts;
ALTER TABLE work_packets ALTER COLUMN extractor SET DEFAULT 'local-llm-v2';
