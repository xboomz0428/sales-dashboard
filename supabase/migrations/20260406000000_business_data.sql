-- ═══════════════════════════════════════════════════════════════════════════
-- 發票對帳記錄 & 月費用記錄 資料表
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 發票對帳記錄 ─────────────────────────────────────────────────────────────
create table if not exists public.invoice_records (
  id               text primary key,          -- 客戶端產生的 ID
  month            text not null,             -- YYYY-MM，方便依月份查詢
  store            text not null default '',
  invoice_no       text not null default '',  -- 草稿時可為空
  billing_start    date,
  billing_end      date,
  amount           numeric(14,2) not null default 0,
  invoice_type     text not null default 'electronic',
  payment_method   text not null default 'transfer',
  payment_term     int not null default 30,
  issue_date       date,
  status           text not null default 'pending',
  confirmed_at     date,
  confirmed_amount numeric(14,2),
  note             text not null default '',
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create index if not exists invoice_records_month_idx
  on public.invoice_records (month desc);

alter table public.invoice_records enable row level security;

-- 全部已登入使用者可讀
do $$ begin
  create policy "auth read invoice_records"
    on public.invoice_records for select
    to authenticated using (true);
exception when duplicate_object then null; end $$;

-- admin 或 manager 可寫入
do $$ begin
  create policy "manager+ insert invoice_records"
    on public.invoice_records for insert
    to authenticated
    with check (public.get_my_role() in ('admin','manager'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "manager+ update invoice_records"
    on public.invoice_records for update
    to authenticated
    using (public.get_my_role() in ('admin','manager'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "manager+ delete invoice_records"
    on public.invoice_records for delete
    to authenticated
    using (public.get_my_role() in ('admin','manager'));
exception when duplicate_object then null; end $$;


-- ── 月費用記錄 ───────────────────────────────────────────────────────────────
create table if not exists public.monthly_expenses (
  id         text primary key,           -- 客戶端產生的 ID
  month      text not null,              -- YYYY-MM
  category   text not null default '其他',
  label      text not null default '',
  count      numeric(10,2),
  unit_cost  numeric(14,2),
  amount     numeric(14,2) not null default 0,
  note       text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists monthly_expenses_month_idx
  on public.monthly_expenses (month desc);

alter table public.monthly_expenses enable row level security;

do $$ begin
  create policy "auth read monthly_expenses"
    on public.monthly_expenses for select
    to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "manager+ insert monthly_expenses"
    on public.monthly_expenses for insert
    to authenticated
    with check (public.get_my_role() in ('admin','manager'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "manager+ update monthly_expenses"
    on public.monthly_expenses for update
    to authenticated
    using (public.get_my_role() in ('admin','manager'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "manager+ delete monthly_expenses"
    on public.monthly_expenses for delete
    to authenticated
    using (public.get_my_role() in ('admin','manager'));
exception when duplicate_object then null; end $$;
