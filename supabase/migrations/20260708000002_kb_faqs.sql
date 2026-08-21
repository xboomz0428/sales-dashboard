-- 知識庫 FAQ：依品牌/產品分類，供內部查詢、匯出 Word、以及 AI 問答引用
create table if not exists public.kb_faqs (
  id            uuid primary key default gen_random_uuid(),
  brand         text not null default '',
  product       text not null default '',
  question      text not null,
  answer        text not null default '',
  tags          text[] default '{}',
  status        text not null default 'published',   -- published | draft
  compliance_ok boolean default false,               -- 已過人工合規審查
  author        text default '',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists idx_kb_faqs_brand on public.kb_faqs(brand);

alter table public.kb_faqs enable row level security;

drop policy if exists "auth read kb_faqs" on public.kb_faqs;
create policy "auth read kb_faqs"
  on public.kb_faqs for select to authenticated using (true);

drop policy if exists "manager+ insert kb_faqs" on public.kb_faqs;
create policy "manager+ insert kb_faqs"
  on public.kb_faqs for insert to authenticated
  with check (get_my_role() = any (array['admin','manager']));

drop policy if exists "manager+ update kb_faqs" on public.kb_faqs;
create policy "manager+ update kb_faqs"
  on public.kb_faqs for update to authenticated
  using (get_my_role() = any (array['admin','manager']));

drop policy if exists "manager+ delete kb_faqs" on public.kb_faqs;
create policy "manager+ delete kb_faqs"
  on public.kb_faqs for delete to authenticated
  using (get_my_role() = any (array['admin','manager']));
