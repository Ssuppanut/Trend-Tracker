-- Trend Tracker: Supabase Schema (Postgres + pgvector)
-- Phase 1 core: raw_items, trends, trend_snapshots
-- Phase 2 user: profiles, user_keywords

create extension if not exists vector;

-- ============================================
-- CATEGORIES (seed คงที่ ไม่ต้องมี UI จัดการ)
-- ============================================
create table categories (
  slug        text primary key,          -- 'crypto', 'tech-ai', 'design', ...
  name_th     text not null,
  name_en     text not null,
  sort_order  int default 0
);

insert into categories (slug, name_th, name_en, sort_order) values
  ('crypto',        'คริปโต/การเงิน',   'Crypto & Finance', 1),
  ('tech-ai',       'เทค/AI',           'Tech & AI',        2),
  ('design',        'ดีไซน์',            'Design',           3),
  ('entertainment', 'บันเทิง',           'Entertainment',    4),
  ('lifestyle',     'ไลฟ์สไตล์',         'Lifestyle',        5),
  ('news',          'ข่าว/สังคม',        'News & Society',   6);

-- ============================================
-- RAW ITEMS (ข้อมูลดิบจากทุก adapter)
-- ============================================
create table raw_items (
  id            bigint generated always as identity primary key,
  source        text not null,           -- 'reddit', 'youtube', 'pantip', ...
  external_id   text not null,           -- id จากแพลตฟอร์มต้นทาง (กัน insert ซ้ำ)
  title         text not null,
  url           text,
  body          text,                    -- เนื้อหาย่อ ตัดที่ ~2000 chars พอ
  lang          text not null,           -- 'th' | 'en'
  category_hint text references categories(slug),  -- เดาจาก source เช่น subreddit
  engagement    numeric default 0,       -- normalize แล้ว (upvotes+comments, views, ฯลฯ)
  engagement_raw jsonb,                  -- ค่าดิบเก็บไว้ debug
  published_at  timestamptz not null,
  fetched_at    timestamptz not null default now(),
  embedding     vector(1024),            -- bge-m3 = 1024 dims (null จนกว่า analyze จะรัน)
  trend_id      bigint,                  -- FK ใส่ทีหลัง (หลัง cluster)

  unique (source, external_id)           -- dedupe ตั้งแต่ระดับ DB
);

create index idx_raw_items_published on raw_items (published_at desc);
create index idx_raw_items_trend on raw_items (trend_id) where trend_id is not null;
create index idx_raw_items_unclustered on raw_items (fetched_at)
  where trend_id is null and embedding is not null;
-- vector index: สร้างเมื่อมีข้อมูล > ~10k rows แล้วค่อยทำ
-- create index on raw_items using hnsw (embedding vector_cosine_ops);

-- ============================================
-- TRENDS (cluster ที่ผ่านการ score + enrich แล้ว)
-- ============================================
create table trends (
  id            bigint generated always as identity primary key,
  title         text not null,           -- LLM ตั้งชื่อ
  summary       text,                    -- LLM: สรุป + "ทำไมเรื่องนี้ถึงมา"
  category      text not null references categories(slug),
  lang_scope    text not null default 'mixed',  -- 'th' | 'en' | 'mixed'
  status        text not null default 'active', -- 'active' | 'fading' | 'archived'

  -- คะแนน ณ ปัจจุบัน (คำนวณซ้ำทุกรอบ analyze)
  score           numeric not null default 0,
  volume_24h      int not null default 0,
  volume_7d_avg   numeric not null default 0,
  velocity        numeric not null default 0,   -- volume_24h / volume_7d_avg
  source_count    int not null default 1,       -- ปรากฏกี่แพลตฟอร์ม
  engagement_sum  numeric not null default 0,

  centroid      vector(1024),            -- ค่าเฉลี่ย embedding ของสมาชิก ใช้ match item ใหม่
  first_seen    timestamptz not null default now(),
  last_updated  timestamptz not null default now()
);

alter table raw_items
  add constraint fk_raw_items_trend
  foreign key (trend_id) references trends(id) on delete set null;

create index idx_trends_active on trends (category, score desc)
  where status = 'active';

-- ============================================
-- TREND SNAPSHOTS (time series สำหรับกราฟ velocity)
-- ============================================
create table trend_snapshots (
  trend_id    bigint not null references trends(id) on delete cascade,
  captured_at timestamptz not null default now(),
  score       numeric not null,
  volume_24h  int not null,
  velocity    numeric not null,
  primary key (trend_id, captured_at)
);

-- ============================================
-- PHASE 2: USERS
-- ============================================
create table profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  plan        text not null default 'free',    -- 'free' | 'pro'
  categories  text[] not null default '{}',    -- หมวดที่เลือกติดตาม
  digest_freq text not null default 'weekly',  -- 'daily' | 'weekly' | 'off'
  created_at  timestamptz not null default now()
);

create table user_keywords (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references profiles(user_id) on delete cascade,
  keyword   text not null,
  lang      text not null default 'th',
  created_at timestamptz not null default now(),
  unique (user_id, keyword)
);

-- ============================================
-- RLS (Row Level Security)
-- ============================================
-- ข้อมูล trend เป็น shared/public read, ข้อมูล user เป็นส่วนตัว
alter table raw_items enable row level security;
alter table trends enable row level security;
alter table trend_snapshots enable row level security;
alter table profiles enable row level security;
alter table user_keywords enable row level security;

create policy "public read trends" on trends
  for select using (true);
create policy "public read snapshots" on trend_snapshots
  for select using (true);

create policy "own profile" on profiles
  for all using (auth.uid() = user_id);
create policy "own keywords" on user_keywords
  for all using (auth.uid() = user_id);

-- raw_items: ไม่เปิด policy = client อ่านไม่ได้เลย
-- cron/pipeline ใช้ service role key ข้าม RLS อยู่แล้ว
-- ถ้าหน้า trend detail ต้องโชว์โพสต์ตัวอย่าง ให้เปิด read เฉพาะที่ cluster แล้ว:
-- create policy "read clustered items" on raw_items
--   for select using (trend_id is not null);
