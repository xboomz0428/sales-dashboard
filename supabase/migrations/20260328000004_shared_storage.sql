-- ═══════════════════════════════════════════════════════════════════════════
-- 改為共用資料夾（shared/）架構
-- 所有帳號皆可讀取 shared/ 資料夾的銷售檔案
-- 僅 admin / manager 可上傳或刪除
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 移除舊的個人資料夾政策 ──────────────────────────────────────────────
drop policy if exists "user upload own files"  on storage.objects;
drop policy if exists "user read own files"    on storage.objects;
drop policy if exists "user delete own files"  on storage.objects;
drop policy if exists "user update own files"  on storage.objects;
drop policy if exists "admin read all files"   on storage.objects;
drop policy if exists "admin delete all files" on storage.objects;

-- ─── 所有登入使用者可讀取 shared/ 資料夾 ────────────────────────────────
do $$ begin
  create policy "authenticated read shared files"
    on storage.objects for select
    to authenticated
    using (
      bucket_id = 'sales-files'
      and (storage.foldername(name))[1] = 'shared'
    );
exception when duplicate_object then null; end $$;

-- ─── admin / manager 可上傳至 shared/ 資料夾 ─────────────────────────────
do $$ begin
  create policy "uploader write shared files"
    on storage.objects for insert
    to authenticated
    with check (
      bucket_id = 'sales-files'
      and (storage.foldername(name))[1] = 'shared'
      and public.get_my_role() in ('admin', 'manager')
    );
exception when duplicate_object then null; end $$;

-- ─── admin / manager 可更新 shared/ 資料夾的檔案 ─────────────────────────
do $$ begin
  create policy "uploader update shared files"
    on storage.objects for update
    to authenticated
    using (
      bucket_id = 'sales-files'
      and (storage.foldername(name))[1] = 'shared'
      and public.get_my_role() in ('admin', 'manager')
    );
exception when duplicate_object then null; end $$;

-- ─── admin / manager 可刪除 shared/ 資料夾的檔案 ─────────────────────────
do $$ begin
  create policy "uploader delete shared files"
    on storage.objects for delete
    to authenticated
    using (
      bucket_id = 'sales-files'
      and (storage.foldername(name))[1] = 'shared'
      and public.get_my_role() in ('admin', 'manager')
    );
exception when duplicate_object then null; end $$;
