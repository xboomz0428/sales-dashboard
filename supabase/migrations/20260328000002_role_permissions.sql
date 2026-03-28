-- ═══════════════════════════════════════════════════════════════════════════
-- 功能區塊權限設定資料表
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.role_permissions (
  role         text primary key check (role in ('manager', 'viewer')),
  allowed_tabs text[] not null default '{}',
  updated_at   timestamptz default now()
);

-- ─── 預設值 ────────────────────────────────────────────────────────────────
insert into public.role_permissions (role, allowed_tabs) values
  ('manager', ARRAY['summary','performance','comparison','trend','product',
                    'customer','channel','brand','heatmap','table',
                    'costs','goals','alerts','health','forecast','flow','backup']),
  ('viewer',  ARRAY['summary','performance','comparison','trend','product',
                    'customer','channel','brand','heatmap','table',
                    'health','forecast','flow'])
on conflict (role) do nothing;

-- ─── 啟用 RLS ──────────────────────────────────────────────────────────────
alter table public.role_permissions enable row level security;

-- ─── RLS 政策（do block 防止重複執行錯誤） ───────────────────────────────────
do $$ begin
  create policy "authenticated read role_permissions"
    on public.role_permissions for select
    to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin update role_permissions"
    on public.role_permissions for update
    using (public.get_my_role() = 'admin')
    with check (public.get_my_role() = 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin insert role_permissions"
    on public.role_permissions for insert
    with check (public.get_my_role() = 'admin');
exception when duplicate_object then null; end $$;
