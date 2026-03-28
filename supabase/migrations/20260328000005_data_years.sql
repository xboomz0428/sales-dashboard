-- ═══════════════════════════════════════════════════════════════════════════
-- 新增資料年限欄位至 role_permissions
-- data_years: NULL = 不限制; 正整數 = 從今天往前回推的年數
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.role_permissions
  add column if not exists data_years integer default null;
