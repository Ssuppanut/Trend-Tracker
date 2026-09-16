-- Embedding provenance: which space each stored vector belongs to.
--
-- Jina and bge-m3 both emit 1024-dim vectors but occupy DIFFERENT embedding
-- spaces — comparing across them is meaningless. These columns identify the
-- space of every stored embedding so clustering / similarity never mix them,
-- and so a future re-embedding/migration can target a specific space.

alter table raw_items
  add column if not exists embedding_provider     text,
  add column if not exists embedding_model        text,
  add column if not exists embedding_dim          int,
  add column if not exists embedding_generated_at timestamptz;

-- Fetch of "unclustered items in the active space" filters on trend_id +
-- provider + model; index that partial set (mirrors idx_raw_items_unclustered).
create index if not exists idx_raw_items_space
  on raw_items (embedding_provider, embedding_model)
  where trend_id is null and embedding is not null;

-- A trend's centroid lives in one space too; tag it so new items only attach
-- to trends built in the same space.
alter table trends
  add column if not exists embedding_provider text,
  add column if not exists embedding_model    text;
