-- 壓縮版 v2：再瘦身約 40% —— 移除 _key（前端重建）與 year_month/year/month（由 date 導出）
create or replace function public.get_sales_compact2(p_offset integer, p_limit integer)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_array(
    s.date,
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
revoke execute on function public.get_sales_compact2(integer, integer) from public;
revoke execute on function public.get_sales_compact2(integer, integer) from anon;
grant execute on function public.get_sales_compact2(integer, integer) to authenticated;
grant execute on function public.get_sales_compact2(integer, integer) to service_role;
