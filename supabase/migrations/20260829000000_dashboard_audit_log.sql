-- 儀表板審計軌跡：記錄 誰/何時/對哪張表/做了什麼（整列 jsonb 快照）
create table if not exists public.dashboard_audit_log (
  id         bigint generated always as identity primary key,
  created_at timestamptz default now(),
  table_name text not null,
  action     text not null,
  row_key    text,
  old_row    jsonb,
  new_row    jsonb,
  actor      text
);
alter table public.dashboard_audit_log enable row level security;
drop policy if exists "admin read dashboard_audit_log" on public.dashboard_audit_log;
create policy "admin read dashboard_audit_log"
  on public.dashboard_audit_log for select to authenticated
  using (get_my_role() = 'admin');

create or replace function public.fn_dashboard_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_key text;
begin
  v_key := coalesce(
    (to_jsonb(coalesce(NEW, OLD)) ->> 'id'),
    (to_jsonb(coalesce(NEW, OLD)) ->> 'key'),
    (to_jsonb(coalesce(NEW, OLD)) ->> 'user_id'));
  insert into public.dashboard_audit_log(table_name, action, row_key, old_row, new_row, actor)
  values (TG_TABLE_NAME, TG_OP, v_key,
          case when TG_OP <> 'INSERT' then to_jsonb(OLD) end,
          case when TG_OP <> 'DELETE' then to_jsonb(NEW) end,
          coalesce(auth.jwt() ->> 'email', 'service'));
  return coalesce(NEW, OLD);
end $$;

drop trigger if exists trg_audit_kb_faqs on public.kb_faqs;
create trigger trg_audit_kb_faqs after insert or update or delete on public.kb_faqs
  for each row execute function public.fn_dashboard_audit();
drop trigger if exists trg_audit_dashboard_settings on public.dashboard_settings;
create trigger trg_audit_dashboard_settings after insert or update or delete on public.dashboard_settings
  for each row execute function public.fn_dashboard_audit();
drop trigger if exists trg_audit_forecast_records on public.forecast_records;
create trigger trg_audit_forecast_records after insert or update or delete on public.forecast_records
  for each row execute function public.fn_dashboard_audit();
drop trigger if exists trg_audit_user_permissions on public.user_permissions;
create trigger trg_audit_user_permissions after insert or update or delete on public.user_permissions
  for each row execute function public.fn_dashboard_audit();
