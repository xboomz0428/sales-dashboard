-- 年度預測紀錄：儲存「當下做的年底預測」，隔年回頭對比實際值做閉迴路驗證
create table if not exists public.forecast_records (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz default now(),
  target_year     text not null,
  predictions     jsonb not null,
  ytd_at_save     numeric,
  projected_total numeric,
  author          text default ''
);
alter table public.forecast_records enable row level security;
drop policy if exists "auth read forecast_records" on public.forecast_records;
create policy "auth read forecast_records"
  on public.forecast_records for select to authenticated using (true);
drop policy if exists "manager+ insert forecast_records" on public.forecast_records;
create policy "manager+ insert forecast_records"
  on public.forecast_records for insert to authenticated
  with check (get_my_role() = any (array['admin','manager']));
drop policy if exists "manager+ delete forecast_records" on public.forecast_records;
create policy "manager+ delete forecast_records"
  on public.forecast_records for delete to authenticated
  using (get_my_role() = any (array['admin','manager']));
