-- 月費用存放逐人薪資後，讀取權限由「全體登入者」收緊為 admin/manager
drop policy if exists "auth read monthly_expenses" on public.monthly_expenses;
create policy "manager+ read monthly_expenses"
  on public.monthly_expenses for select to authenticated
  using (get_my_role() = any (array['admin'::text, 'manager'::text]));
