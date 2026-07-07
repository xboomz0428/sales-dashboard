-- 壓縮版銷售資料讀取：回傳「陣列的陣列」而非物件陣列，
-- 欄位名稱不重複出現 14 萬次，傳輸量約減半；且回傳值為單一 jsonb，
-- 不受 PostgREST max-rows（每頁 1000 筆）限制，一次可取 2 萬筆。
-- 前端對應：useCloudData.loadRowsFromDbCompact（失敗時 fallback 舊版分頁讀取）
create or replace function public.get_sales_compact(p_offset integer, p_limit integer)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_array(
    s._key, s.date, s.year_month, s.year, s.month,
    s.channel, s.channel_type, s.brand, s.agent_type, s.product,
    s.order_id, s.customer, s.quantity, s.subtotal, s.total, s.discount_rate
  ) order by s.id), '[]'::jsonb)
  from (
    select * from public.sales_data
    order by id
    offset p_offset
    limit p_limit
  ) s
$$;

revoke execute on function public.get_sales_compact(integer, integer) from public;
revoke execute on function public.get_sales_compact(integer, integer) from anon;
grant execute on function public.get_sales_compact(integer, integer) to authenticated;
grant execute on function public.get_sales_compact(integer, integer) to service_role;
