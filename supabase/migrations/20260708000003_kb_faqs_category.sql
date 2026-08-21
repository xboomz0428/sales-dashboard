-- 知識庫加「分類」層：品牌 → 分類（如 背包、艾草包）→ 產品（可選）
alter table public.kb_faqs add column if not exists category text not null default '';
create index if not exists idx_kb_faqs_category on public.kb_faqs(brand, category);
