-- ═══════════════════════════════════════════════════════════════════════════
-- 銷售數據分析系統 — Supabase 初始化腳本
--
-- ⚠️  執行前請先完成 Step 0（手動建立 Storage Bucket），再執行此 SQL
--
-- Step 0：Supabase Console → Storage → New Bucket
--   Bucket name : sales-files
--   Public       : 關閉（Private）
--   → 按 Save
--
-- Step 1：將此檔案全部貼入 SQL Editor → Run
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

-- ─── 3. 啟用 RLS（Row Level Security）────────────────────────────────────
alter table public.user_roles enable row level security;
alter table public.user_costs enable row level security;

-- ─── 4. RLS 政策：user_roles ──────────────────────────────────────────────
-- 只能讀自己的角色
create policy "read own role"
  on public.user_roles for select
  using (auth.uid() = id);

-- 只能新增自己的角色（新使用者首次登入時自動建立）
create policy "insert own role"
  on public.user_roles for insert
  with check (auth.uid() = id);

-- ─── 5. RLS 政策：user_costs ─────────────────────────────────────────────
create policy "manage own costs"
  on public.user_costs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── 6. Storage RLS 政策（需先在 Dashboard 建立 sales-files bucket）────────
-- 路徑格式：sales-files/{user_id}/{filename}
-- 每位使用者只能存取自己的資料夾

create policy "user upload own files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'sales-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "user read own files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'sales-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "user delete own files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'sales-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "user update own files"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'sales-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- Step 2（完成後）：
-- Supabase Console → Authentication → Providers → Email
--   • Enable Email Provider：開啟
--   • Confirm email：可先關閉方便測試
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 管理員角色設定 ──────────────────────────────────────────────────────
-- 使用者登入後，至 Authentication → Users 複製該使用者的 UUID
-- 再執行下列指令升級角色（擇一）：
--
-- update public.user_roles set role = 'admin'   where id = 'your-user-uuid';
-- update public.user_roles set role = 'manager' where id = 'your-user-uuid';
