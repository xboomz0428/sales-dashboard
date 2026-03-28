-- ═══════════════════════════════════════════════════════════════════════════
-- 資料備份記錄資料表
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

create index if not exists data_backups_created_at_idx
  on public.data_backups (created_at desc);

create index if not exists data_backups_creator_id_idx
  on public.data_backups (creator_id);

alter table public.data_backups enable row level security;

do $$ begin
  create policy "authenticated read backups"
    on public.data_backups for select
    to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "authenticated insert backup"
    on public.data_backups for insert
    to authenticated
    with check (auth.uid() = creator_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "owner or admin delete backup"
    on public.data_backups for delete
    to authenticated
    using (
      auth.uid() = creator_id
      or public.get_my_role() = 'admin'
    );
exception when duplicate_object then null; end $$;
