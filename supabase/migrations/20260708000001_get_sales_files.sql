-- 資料庫檔案清單：sales_data 依 source_file 彙總（給前端「資料庫資料管理」用）
-- batches > 1 代表同檔案有多個批次殘留（上傳中斷造成的重複），前端會提供一鍵清理。
create or replace function public.get_sales_files()
returns table(
  source_file text,
  rows bigint,
  batches bigint,
  latest_batch bigint,
  min_date text,
  max_date text,
  subtotal numeric
)
language sql
stable
set search_path = public
as $$
  select
    coalesce(source_file, '(未標記檔案)'),
    count(*),
    count(distinct coalesce(import_batch, 0)),
    max(coalesce(import_batch, 0)),
    min(date),
    max(date),
    round(sum(subtotal))
  from sales_data
  group by coalesce(source_file, '(未標記檔案)')
  order by min(date)
$$;

revoke execute on function public.get_sales_files() from public;
revoke execute on function public.get_sales_files() from anon;
grant execute on function public.get_sales_files() to authenticated;
grant execute on function public.get_sales_files() to service_role;
