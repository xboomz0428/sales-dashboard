-- ═══════════════════════════════════════════════════════════════════════════
-- Admin 管理員 RLS 政策
-- 允許 admin 角色讀取/更新/刪除所有 user_roles 紀錄
-- ═══════════════════════════════════════════════════════════════════════════

-- Helper function：依 auth.uid() 查詢角色
create or replace function public.get_my_role()
returns text
language sql
stable
security definer
as $$
  select role from public.user_roles where id = auth.uid()
$$;

-- ─── user_roles：admin 可讀取所有人的角色 ─────────────────────────────────
create policy "admin read all roles"
  on public.user_roles for select
  using (public.get_my_role() = 'admin');

-- ─── user_roles：admin 可更新所有人的角色 ─────────────────────────────────
create policy "admin update all roles"
  on public.user_roles for update
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- ─── user_roles：admin 可為其他使用者插入角色紀錄 ─────────────────────────
create policy "admin insert any role"
  on public.user_roles for insert
  with check (public.get_my_role() = 'admin');

-- ─── user_roles：admin 可刪除使用者角色紀錄 ──────────────────────────────
create policy "admin delete any role"
  on public.user_roles for delete
  using (public.get_my_role() = 'admin');

-- ─── Storage：admin 可讀取所有使用者的檔案 ────────────────────────────────
create policy "admin read all files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'sales-files'
    and public.get_my_role() = 'admin'
  );

-- ─── Storage：admin 可刪除所有使用者的檔案 ────────────────────────────────
create policy "admin delete all files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'sales-files'
    and public.get_my_role() = 'admin'
  );
