-- 銷售資料主表 sales_data
-- 說明：App 登入後優先從此表讀取（useCloudData.loadRowsFromDb），讀不到才退回
--       Storage 的 Excel 檔在瀏覽器解析。金額欄為 subtotal（小計）。
-- 冪等匯入：以 source_file 為單位，import_batch 為批次；上傳時先插新批次、
--           驗證筆數相符後才刪舊批次（見 useCloudData.importRowsToDb）。
-- 注意：本表最初於 2026-07-07 以 Supabase MCP 直接建立，此檔為補進版控用。

create table if not exists public.sales_data (
  id            bigint generated always as identity primary key,
  _key          text,
  date          text not null,
  year_month    text,
  year          text,
  month         text,
  channel       text default '',
  channel_type  text default '',
  brand         text default '',
  agent_type    text default '',
  product       text default '',
  order_id      text default '',
  customer      text default '',
  quantity      numeric default 0,
  subtotal      numeric default 0,
  total         numeric default 0,
  discount_rate numeric default 0,
  source_file   text,
  import_batch  bigint,
  created_at    timestamptz default now()
);

create index if not exists idx_sales_data_date          on public.sales_data(date);
create index if not exists idx_sales_data_year          on public.sales_data(year);
create index if not exists idx_sales_data_key           on public.sales_data(_key);
create index if not exists idx_sales_data_source        on public.sales_data(source_file);
create index if not exists idx_sales_data_source_batch  on public.sales_data(source_file, import_batch);

alter table public.sales_data enable row level security;

-- 已登入者可讀（與 invoice_records / monthly_expenses 一致）
drop policy if exists "sales_data authenticated read" on public.sales_data;
create policy "sales_data authenticated read"
  on public.sales_data for select
  to authenticated
  using (true);

-- 僅 admin / manager 可寫（get_my_role() 由既有的角色機制提供）
drop policy if exists "manager+ insert sales_data" on public.sales_data;
create policy "manager+ insert sales_data"
  on public.sales_data for insert to authenticated
  with check (get_my_role() = any (array['admin','manager']));

drop policy if exists "manager+ delete sales_data" on public.sales_data;
create policy "manager+ delete sales_data"
  on public.sales_data for delete to authenticated
  using (get_my_role() = any (array['admin','manager']));
