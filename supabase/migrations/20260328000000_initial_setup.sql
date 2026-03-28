-- ═══════════════════════════════════════════════════════════════════════════
-- 銷售數據分析系統 — 初始化 migration
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. 使用者角色資料表 ───────────────────────────────────────────────────
create table if not exists public.user_roles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'viewer'
               check (role in ('admin', 'manager', 'viewer')),
  created_at timestamptz default now()
);

-- ─── 2. 產品成本資料表 ────────────────────────────────────────────────────
create table if not exists public.user_costs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  costs      jsonb not null default '{}',
  updated_at timestamptz default now()
);

-- ─── 3. 啟用 RLS ─────────────────────────────────────────────────────────
alter table public.user_roles enable row level security;
alter table public.user_costs enable row level security;

-- ─── 4. RLS 政策：user_roles ──────────────────────────────────────────────
do $$ begin
  create policy "read own role"
    on public.user_roles for select
    using (auth.uid() = id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "insert own role"
    on public.user_roles for insert
    with check (auth.uid() = id);
exception when duplicate_object then null; end $$;

-- ─── 5. RLS 政策：user_costs ─────────────────────────────────────────────
do $$ begin
  create policy "manage own costs"
    on public.user_costs for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- ─── 6. Storage RLS 政策（shared/ 共用資料夾，見 migration 000004）────────
-- 舊的 per-user 政策已由 000004 取代，此處保留空白以維持版本順序
