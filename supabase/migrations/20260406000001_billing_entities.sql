-- ═══════════════════════════════════════════════════════════════════════════
-- 常用發票抬頭設定 & invoice_records 補充欄位
-- ═══════════════════════════════════════════════════════════════════════════

-- ── invoice_records 新增欄位 ─────────────────────────────────────────────────
alter table public.invoice_records
  add column if not exists billing_name  text not null default '',
  add column if not exists tax_id        text not null default '',
  add column if not exists merged_stores text[] not null default '{}';

-- ── 常用抬頭 ─────────────────────────────────────────────────────────────────
create table if not exists public.billing_entities (
  id         text primary key,
  name       text not null,          -- 抬頭（e.g. 全聯福利中心）
  tax_id     text not null default '',
  stores     text[] not null default '{}', -- 對應的門市名稱列表
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.billing_entities enable row level security;

do $$ begin
  create policy "auth read billing_entities"
    on public.billing_entities for select
    to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "manager+ insert billing_entities"
    on public.billing_entities for insert
    to authenticated
    with check (public.get_my_role() in ('admin','manager'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "manager+ update billing_entities"
    on public.billing_entities for update
    to authenticated
    using (public.get_my_role() in ('admin','manager'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "manager+ delete billing_entities"
    on public.billing_entities for delete
    to authenticated
    using (public.get_my_role() in ('admin','manager'));
exception when duplicate_object then null; end $$;
