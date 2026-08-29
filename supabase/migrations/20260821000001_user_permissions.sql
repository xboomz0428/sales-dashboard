-- 個人權限表：AuthContext 一直在查這張表但從未建立，造成每次載入 404 連發
create table if not exists public.user_permissions (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  allowed_tabs text[],
  data_years   integer,
  updated_at   timestamptz default now()
);
alter table public.user_permissions enable row level security;
drop policy if exists "read own or admin" on public.user_permissions;
create policy "read own or admin"
  on public.user_permissions for select to authenticated
  using (auth.uid() = user_id or get_my_role() = 'admin');
drop policy if exists "admin write user_permissions" on public.user_permissions;
create policy "admin write user_permissions"
  on public.user_permissions for all to authenticated
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');
