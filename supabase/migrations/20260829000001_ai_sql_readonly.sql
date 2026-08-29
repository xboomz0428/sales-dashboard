-- text-to-SQL 守門：AI 產生的 SQL 只能經 ai_sql() 執行
-- 縱深防禦：語法白名單→唯讀交易→降權 ai_readonly（僅 sales_data SELECT）→8s 逾時→強制 LIMIT 200
-- 註：SET ROLE 不能用於 security definer 函式，故採 security invoker＋grant ai_readonly to authenticated
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'ai_readonly') then
    create role ai_readonly nologin;
  end if;
end $$;
grant usage on schema public to ai_readonly;
grant select on public.sales_data to ai_readonly;
grant ai_readonly to postgres;
grant ai_readonly to authenticated;

drop policy if exists "ai_readonly select" on public.sales_data;
create policy "ai_readonly select" on public.sales_data
  for select to ai_readonly using (true);

create or replace function public.ai_sql(q text)
returns jsonb language plpgsql security invoker set search_path = public as $fn$
declare
  qq text; result jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('error', '未登入'); end if;
  qq := btrim(coalesce(q, ''));
  qq := regexp_replace(qq, ';\s*$', '');
  if length(qq) = 0 or length(qq) > 4000 then return jsonb_build_object('error', 'SQL 長度不合法'); end if;
  if qq !~* '^\s*(select|with)\M' then return jsonb_build_object('error', '只允許 SELECT 查詢'); end if;
  if position(';' in qq) > 0 then return jsonb_build_object('error', '不允許多重語句'); end if;
  if qq ~ '--' or qq ~ '/\*' or position('$' in qq) > 0 then return jsonb_build_object('error', '不允許註解或 $ 符號'); end if;
  if qq ~* '\m(insert|update|delete|merge|drop|alter|create|grant|revoke|truncate|copy|execute|call|do|vacuum|listen|notify|set|reset|show|prepare|deallocate|lock|refresh|reindex|cluster|comment|security|definer|pg_sleep|pg_read_file|pg_ls_dir|dblink|lo_import|lo_export)\M' then
    return jsonb_build_object('error', '包含不允許的關鍵字');
  end if;
  perform set_config('statement_timeout', '8000', true);
  perform set_config('transaction_read_only', 'on', true);
  set local role ai_readonly;
  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from (%s) x limit 200) t', qq) into result;
  reset role;
  return jsonb_build_object('rows', result);
exception when others then
  begin reset role; exception when others then null; end;
  return jsonb_build_object('error', SQLERRM);
end $fn$;

revoke all on function public.ai_sql(text) from public;
revoke all on function public.ai_sql(text) from anon;
grant execute on function public.ai_sql(text) to authenticated;
