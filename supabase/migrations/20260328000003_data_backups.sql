-- ═══════════════════════════════════════════════════════════════════════════
-- 資料備份記錄資料表
-- 儲存各次備份的 metadata，含操作人員與時間
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.data_backups (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  creator_id    uuid references auth.users(id) on delete set null,
  creator_email text not null default '',
  costs         jsonb not null default '{}',
  file_paths    text[] not null default '{}',
  row_count     int not null default 0,
  created_at    timestamptz default now()
);

-- ─── 索引：依建立時間快速排序 ──────────────────────────────────────────────
create index if not exists data_backups_created_at_idx
  on public.data_backups (created_at desc);

create index if not exists data_backups_creator_id_idx
  on public.data_backups (creator_id);

-- ─── 啟用 RLS ──────────────────────────────────────────────────────────────
alter table public.data_backups enable row level security;

-- ─── RLS 政策：所有登入使用者可讀取備份記錄（審計用）────────────────────────
create policy "authenticated read backups"
  on public.data_backups for select
  to authenticated
  using (true);

-- ─── RLS 政策：登入使用者可建立備份 ────────────────────────────────────────
create policy "authenticated insert backup"
  on public.data_backups for insert
  to authenticated
  with check (auth.uid() = creator_id);

-- ─── RLS 政策：建立者或 admin 可刪除備份 ───────────────────────────────────
create policy "owner or admin delete backup"
  on public.data_backups for delete
  to authenticated
  using (
    auth.uid() = creator_id
    or public.get_my_role() = 'admin'
  );
