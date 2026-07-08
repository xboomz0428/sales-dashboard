-- 儀表板全域設定（key-value）。LINE 通知面板會把 channel token / target id 同步到這，
-- 讓排程腳本（scripts/monthly-report.mjs，以 service key 執行）讀取同一組設定。
create table if not exists public.dashboard_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz default now()
);
alter table public.dashboard_settings enable row level security;

drop policy if exists "auth read dashboard_settings" on public.dashboard_settings;
create policy "auth read dashboard_settings"
  on public.dashboard_settings for select to authenticated using (true);

drop policy if exists "manager+ write dashboard_settings" on public.dashboard_settings;
create policy "manager+ write dashboard_settings"
  on public.dashboard_settings for insert to authenticated
  with check (get_my_role() = any (array['admin','manager']));

drop policy if exists "manager+ update dashboard_settings" on public.dashboard_settings;
create policy "manager+ update dashboard_settings"
  on public.dashboard_settings for update to authenticated
  using (get_my_role() = any (array['admin','manager']));
