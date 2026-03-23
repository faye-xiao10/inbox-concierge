-- Run this ONCE before applying migrations (requires superuser or appropriate privileges).
-- Safe to re-run (all statements use IF NOT EXISTS / IF EXISTS guards).

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. After migrations run, replace the btree embedding index with HNSW for similarity search:
-- DROP INDEX IF EXISTS classifications_embedding_idx;
-- CREATE INDEX classifications_embedding_hnsw_idx
--   ON classifications USING hnsw (embedding vector_cosine_ops)
--   WITH (m = 16, ef_construction = 64);
--
-- DROP INDEX IF EXISTS category_exemplars_bucket_id_idx;  -- keep btree for bucketId lookups
