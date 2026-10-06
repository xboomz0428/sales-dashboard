-- 行銷作戰室（好漢草）核心資料表 v1
-- 設定中心、行事曆／天氣、關鍵字與標題庫、企劃卡、警示、建議、同步 log、Google 資料日表
-- RLS 樣板同 business_data：authenticated 可讀；admin/manager 可寫；Worker 用 service key
-- 2026-10-06 已透過 Supabase MCP 分段套用到正式庫（內容與本檔一致）；本機 db push 時會因 if not exists 全部略過

-- ── 設定中心：只存被改過的值（value 為 null 代表用程式預設）────────────────
create table if not exists public.marketing_settings (
  key           text primary key,
  "group"       text not null,
  label         text not null,
  type          text not null,            -- number|percent|days|text|textarea|boolean|list|json
  value         jsonb,                     -- null = 用 default_value
  default_value jsonb,
  min           numeric, max numeric, unit text,
  help          text default '',
  role_required text not null default 'manager',   -- manager|admin
  sort          int default 0,
  updated_by    text,
  updated_at    timestamptz default now()
);
alter table public.marketing_settings enable row level security;
do $$ begin
  create policy "auth read marketing_settings" on public.marketing_settings for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "role write marketing_settings" on public.marketing_settings for update to authenticated
    using (public.get_my_role() = 'admin' or (public.get_my_role() = 'manager' and role_required = 'manager'))
    with check (public.get_my_role() = 'admin' or (public.get_my_role() = 'manager' and role_required = 'manager'));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "role insert marketing_settings" on public.marketing_settings for insert to authenticated
    with check (public.get_my_role() = 'admin' or (public.get_my_role() = 'manager' and role_required = 'manager'));
exception when duplicate_object then null; end $$;

insert into public.marketing_settings (key, "group", label, type, default_value, min, max, unit, help, role_required, sort) values
  ('scope.brand', 'scope', '品牌', 'text', '"好漢草"'::jsonb, null, null, null, '銷售資料的品牌欄位值；迴圈只處理這個品牌', 'admin', 0),
  ('scope.official_customer', 'scope', '官網客戶名稱', 'text', '"好漢草 品牌官網"'::jsonb, null, null, null, '銷售資料中代表官網訂單的客戶名稱（用來算直接歸因 ROAS）', 'admin', 1),
  ('scope.products', 'scope', '品項池（每行：分類｜關鍵字）', 'list', '["艾草平安包｜平安包","足沐湯浴包｜湯浴包","感溫足浴袋｜足浴袋","擦澡包｜擦澡包","淨境噴霧｜噴霧","平安皂｜平安皂"]'::jsonb, null, null, null, '分類名稱與產品名稱關鍵字，用來把銷售資料歸到品類', 'manager', 2),
  ('google.worker_url', 'google', 'Worker 網址', 'text', '""'::jsonb, null, null, null, '部署 workers/google-sync 後的網址，例如 https://google-sync.xxx.workers.dev', 'admin', 3),
  ('google.customer_id', 'google', 'Google Ads 客戶 ID', 'text', '""'::jsonb, null, null, null, '10 碼，不含連字號；可在「Google 廣告」頁從帳號清單點選', 'admin', 4),
  ('google.login_customer_id', 'google', '管理員帳戶（MCC）ID', 'text', '""'::jsonb, null, null, null, '帳號在 MCC 底下才需要填', 'admin', 5),
  ('google.geo_target', 'google', '關鍵字建議：地區常數', 'number', '2158'::jsonb, 1, 99999999, null, '台灣 2158', 'manager', 6),
  ('google.language', 'google', '關鍵字建議：語言常數', 'number', '1018'::jsonb, 1, 99999, null, '繁體中文 1018', 'manager', 7),
  ('google.idea_limit', 'google', '關鍵字建議：每次筆數', 'number', '50'::jsonb, 10, 500, '筆', '', 'manager', 8),
  ('budget.google_monthly_cap', 'budget', 'Google Ads 月預算上限', 'number', '30000'::jsonb, 0, 1000000, '元', '好漢草全通路月均約 60 萬 × 費率 5%', 'admin', 9),
  ('budget.google_monthly_start', 'budget', '起步月預算（前 3 個月）', 'number', '15000'::jsonb, 0, 1000000, '元', '先驗證每筆轉換成本，第 4 個月依建議調整', 'admin', 10),
  ('budget.campaign_month_cap', 'budget', '檔期月上限', 'number', '45000'::jsonb, 0, 1000000, '元', '費率紅燈 8% × 60 萬，大檔才用', 'admin', 11),
  ('budget.daily_cap_ratio', 'budget', '單日花費上限（月預算的 %）', 'percent', '8'::jsonb, 1, 100, '%', '防止單日失控', 'admin', 12),
  ('rate.yellow', 'budget', '廣告費率黃燈', 'percent', '5'::jsonb, 0, 100, '%', '沿用獲利分析的門檻', 'manager', 13),
  ('rate.red', 'budget', '廣告費率紅燈', 'percent', '8'::jsonb, 0, 100, '%', '沿用獲利分析的門檻', 'manager', 14),
  ('budget.outlier_months', 'budget', '預算公式排除的月份（每行一個 YYYY-MM）', 'list', '["2026-08"]'::jsonb, null, null, null, '單月大單等異常值，不納入月均計算', 'manager', 15),
  ('budget.reallocation_max', 'budget', '單通路單月調幅上限', 'percent', '30'::jsonb, 0, 100, '%', '預算重分配建議的最大變動', 'manager', 16),
  ('budget.google_expense_labels', 'budget', '月費用中屬於 Google 廣告的標籤（每行一個關鍵字）', 'list', '["網路廣告","經緯"]'::jsonb, null, null, null, '用來從月費用表認出 Google 廣告花費', 'manager', 17),
  ('bid.target_cpa', 'bid', '目標每筆轉換成本', 'number', '400'::jsonb, 0, 100000, '元', '官網客單約 580、毛利約 55%，CPA 要低於毛利額', 'manager', 18),
  ('bid.target_roas', 'bid', '目標 ROAS（直接歸因）', 'number', '3'::jsonb, 0, 100, '倍', '含平台外溢後實際 2 倍即可接受', 'manager', 19),
  ('bid.tcpa_factor', 'bid', 'tCPA ＝ 歷史 CPA ×', 'number', '0.9'::jsonb, 0.1, 2, '倍', '自動出價目標的保守係數', 'manager', 20),
  ('bid.schedule_boost', 'bid', '轉換高峰時段加碼', 'text', '"20-23 時 +15%"'::jsonb, null, null, null, '待 GA4 資料後修正', 'manager', 21),
  ('bid.region_weight', 'bid', '天氣觸發時北部加權', 'percent', '20'::jsonb, 0, 100, '%', '降溫檔期的地區出價調整', 'manager', 22),
  ('alert.cpa_over_ratio', 'alert', 'CPA 超過目標倍數', 'number', '1.3'::jsonb, 1, 5, '倍', '連續 2 天超過即警示', 'manager', 23),
  ('alert.zero_conv_days', 'alert', '零轉換天數', 'days', '2'::jsonb, 1, 30, '天', '且當期花費超過下方金額', 'manager', 24),
  ('alert.zero_conv_spend', 'alert', '零轉換的花費門檻', 'number', '1000'::jsonb, 0, 100000, '元', '', 'manager', 25),
  ('alert.spend_pace_low', 'alert', '檔期過半消耗低於', 'percent', '50'::jsonb, 0, 100, '%', '', 'manager', 26),
  ('alert.spend_pace_high', 'alert', '檔期過半消耗高於', 'percent', '80'::jsonb, 0, 100, '%', '', 'manager', 27),
  ('alert.asset_low_impr', 'alert', '素材 LOW 的最低曝光', 'number', '1000'::jsonb, 0, 1000000, '次', '曝光不足的素材不列入汰換', 'manager', 28),
  ('alert.wasted_term_cost', 'alert', '浪費字詞門檻（7 天花費）', 'number', '500'::jsonb, 0, 100000, '元', '0 轉換且超過此金額 → 建議否定', 'manager', 29),
  ('alert.funnel_drop_ratio', 'alert', '漏斗步驟惡化幅度', 'percent', '20'::jsonb, 0, 100, '%', '較 4 週均值', 'manager', 30),
  ('alert.pagespeed_min', 'alert', '落地頁手機分數下限', 'number', '50'::jsonb, 0, 100, '分', '', 'manager', 31),
  ('alert.rank_drop_top', 'alert', '核心字詞掉出前 N 名', 'number', '10'::jsonb, 1, 100, '名', '', 'manager', 32),
  ('alert.competitor_traffic_jump', 'alert', '競品流量週增', 'percent', '30'::jsonb, 0, 500, '%', '', 'manager', 33),
  ('weather.regions', 'weather', '觀測區域（每行一個縣市）', 'list', '["臺北市","新北市","桃園市"]'::jsonb, null, null, null, '中央氣象署一週預報的縣市名稱', 'manager', 34),
  ('weather.cold_min_temp', 'weather', '降溫：未來 3 天最低溫 ≤', 'number', '16'::jsonb, -5, 30, '°C', '推 足好暖湯浴包＋感溫足浴袋', 'manager', 35),
  ('weather.cold_drop', 'weather', '降溫：較前 3 天降 ≥', 'number', '5'::jsonb, 1, 20, '°C', '', 'manager', 36),
  ('weather.rain_pop', 'weather', '濕冷：連續 3 天降雨機率 ≥', 'percent', '70'::jsonb, 0, 100, '%', '且最高溫 ≤ 下方溫度 → 推 足好輕、淨境噴霧', 'manager', 37),
  ('weather.rain_max_temp', 'weather', '濕冷：最高溫 ≤', 'number', '20'::jsonb, 0, 35, '°C', '', 'manager', 38),
  ('weather.end_days', 'weather', '觸發結束：條件連續不成立', 'days', '3'::jsonb, 1, 14, '天', '建議暫停天氣檔', 'manager', 39),
  ('calendar.lead_major', 'calendar', '大檔提前天數', 'days', '21'::jsonb, 1, 60, '天', '雙 11、年貨節、母親節', 'manager', 40),
  ('calendar.lead_mid', 'calendar', '中檔提前天數', 'days', '10'::jsonb, 1, 60, '天', '99、雙 12、中秋、父親節', 'manager', 41),
  ('calendar.lead_purify', 'calendar', '淨身檔提前天數', 'days', '14'::jsonb, 1, 60, '天', '清明、媽祖生、鬼月、中元、年底除舊', 'manager', 42),
  ('calendar.lead_term', 'calendar', '節氣提前天數', 'days', '7'::jsonb, 1, 30, '天', '霜降、立冬、小雪、大雪、冬至', 'manager', 43),
  ('calendar.multiplier_major', 'calendar', '大檔銷量倍率（備貨用）', 'number', '3'::jsonb, 1, 10, '倍', '第一年用經驗值', 'manager', 44),
  ('calendar.multiplier_mid', 'calendar', '中檔銷量倍率', 'number', '1.8'::jsonb, 1, 10, '倍', '', 'manager', 45),
  ('calendar.multiplier_purify', 'calendar', '淨身檔銷量倍率', 'number', '2.5'::jsonb, 1, 10, '倍', '', 'manager', 46),
  ('calendar.multiplier_term', 'calendar', '節氣銷量倍率', 'number', '1.5'::jsonb, 1, 10, '倍', '', 'manager', 47),
  ('calendar.custom_events', 'calendar', '自訂檔期（每行：YYYY-MM-DD｜名稱｜提前天數｜品類）', 'list', '[]'::jsonb, null, null, null, '例：2026-11-20｜週年慶｜14｜平安包', 'manager', 48),
  ('repurchase.products', 'repurchase', '納入品類（每行一個）', 'list', '["艾草平安包","足沐湯浴包","擦澡包"]'::jsonb, null, null, null, '對應品項池的分類名稱', 'manager', 49),
  ('repurchase.pre_days', 'repurchase', '到期前提醒天數', 'days', '7'::jsonb, 0, 60, '天', '', 'manager', 50),
  ('repurchase.overdue_ratio', 'repurchase', '逾期提醒倍率', 'number', '1.5'::jsonb, 1, 5, '倍', '距上次購買 ÷ 平均間隔', 'manager', 51),
  ('repurchase.min_orders', 'repurchase', '納入門檻：至少購買次數', 'number', '3'::jsonb, 1, 20, '次', '沿用回購面板', 'manager', 52),
  ('repurchase.min_days', 'repurchase', '納入門檻：往來天數', 'days', '60'::jsonb, 1, 365, '天', '', 'manager', 53),
  ('repurchase.cooldown_days', 'repurchase', '同一客戶推播冷卻', 'days', '30'::jsonb, 1, 180, '天', '', 'manager', 54),
  ('repurchase.coupon_text', 'repurchase', '回購券文字', 'textarea', '"老朋友專屬：回購 9 折，輸入 BACK9"'::jsonb, null, null, null, '推播與 EDM 共用', 'manager', 55),
  ('stock.restock_lead_days', 'stock', '檔期前幾天出備貨建議', 'days', '21'::jsonb, 1, 90, '天', '', 'manager', 56),
  ('stock.safety_days', 'stock', '安全庫存天數', 'days', '14'::jsonb, 0, 90, '天', '庫存天數低於檔期天數即從廣告候選剔除', 'manager', 57),
  ('discount.min_samples', 'discount', '每桶最少交易筆數', 'number', '30'::jsonb, 5, 1000, '筆', '樣本不足的桶不算', 'manager', 58),
  ('discount.lookback_months', 'discount', '回看月數', 'number', '24'::jsonb, 6, 60, '月', '', 'manager', 59),
  ('discount.insensitive_below', 'discount', '折扣無感：彈性 <', 'number', '0.5'::jsonb, 0, 5, null, '打折只是送錢', 'manager', 60),
  ('discount.sensitive_above', 'discount', '折扣敏感：彈性 >', 'number', '1.5'::jsonb, 0, 10, null, '可當檔期引流品', 'manager', 61),
  ('gen.rsa_headlines', 'gen', 'Google 標題數', 'number', '15'::jsonb, 3, 15, '則', '每則 ≤ 30 字元', 'manager', 62),
  ('gen.rsa_descriptions', 'gen', 'Google 描述數', 'number', '4'::jsonb, 2, 4, '則', '每則 ≤ 90 字元', 'manager', 63),
  ('gen.social_posts', 'gen', '社群貼文版本數', 'number', '3'::jsonb, 1, 5, '版', 'FB／IG／Threads', 'manager', 64),
  ('gen.edm_subjects', 'gen', 'EDM 主旨數', 'number', '5'::jsonb, 1, 10, '則', '', 'manager', 65),
  ('gen.tone', 'gen', '品牌語氣', 'textarea', '"溫暖、台灣在地、長輩也看得懂、不賣弄中醫術語；像鄰居姐姐在分享生活，不是在推銷。"'::jsonb, null, null, null, '生成鏈每次都會帶入', 'manager', 66),
  ('gen.allowed_claims', 'gen', '允許的事實句（每行一句）', 'list', '["台灣製造","艾草產地台灣","無添加香精","可當伴手禮"]'::jsonb, null, null, null, '只放可以證明的事實，不放功效', 'manager', 67),
  ('gen.banned_words_extra', 'gen', '額外禁用字（每行一個）', 'list', '[]'::jsonb, null, null, null, '在藥事法清單之外再加', 'manager', 68),
  ('gen.compliance_hard_block', 'gen', '合規不過就不能核准', 'boolean', 'true'::jsonb, null, null, null, '好漢草固定開啟', 'admin', 69),
  ('competitors.domains', 'keywords', '競品網域（每行一個）', 'list', '["lomoji.com.tw","hanfangyupin.com.tw","pst1904.com","shuimu125.com","aitsao.com.tw","dechuantea.com","satitea.com"]'::jsonb, null, null, null, '主要 5 個＋次要 2 個', 'manager', 70),
  ('keywords.core', 'keywords', '核心關鍵字組（每行一組）', 'list', '["草本足浴包推薦 / 台灣在地足浴包","艾草淨身平安包 / 探病掃墓除穢","手腳冰冷泡腳配方 / 冬季暖身足浴","運動後泡腳 / 草本足浴","睡前泡腳儀式 / 紓壓草本包","坐月子擦澡包 / 產後草本沐浴","送禮長輩養生禮盒 / 節慶健康禮品推薦","艾草平安包 媽祖 虎爺 聯名 / 廟會 平安 伴手禮","感溫足浴袋 泡腳袋 推薦","探病 淨身 / 搬家 入厝 淨化"]'::jsonb, null, null, null, '功效字只留在關鍵字層，不進標題', 'manager', 71),
  ('keywords.negative_seed', 'keywords', '預設否定字（每行一個）', 'list', '["免費","教學","DIY","批發","工廠","做法","自製"]'::jsonb, null, null, null, '', 'manager', 72),
  ('keywords.seo_rank_min', 'keywords', 'SEO 產文：排名下限', 'number', '4'::jsonb, 1, 50, '名', '排名 4～10 且曝光達標的字詞', 'manager', 73),
  ('keywords.seo_rank_max', 'keywords', 'SEO 產文：排名上限', 'number', '10'::jsonb, 1, 100, '名', '', 'manager', 74),
  ('keywords.seo_min_impressions', 'keywords', 'SEO 產文：最低曝光', 'number', '500'::jsonb, 0, 100000, '次', '', 'manager', 75),
  ('keywords.seo_posts_per_week', 'keywords', '每週文章數', 'number', '2'::jsonb, 0, 10, '篇', '', 'manager', 76),
  ('sync.ads_lookback_days', 'notify', '廣告資料回抓天數', 'days', '7'::jsonb, 1, 30, '天', '轉換會延後回填', 'admin', 77),
  ('notify.line_daily_time', 'notify', '每日 LINE 摘要時間', 'text', '"07:00"'::jsonb, null, null, null, '台北時間', 'manager', 78),
  ('notify.weekly_report_day', 'notify', '週報發送日', 'text', '"週一"'::jsonb, null, null, null, '', 'manager', 79),
  ('notify.quiet_start', 'notify', '安靜時段開始', 'text', '"22:00"'::jsonb, null, null, null, '不推播', 'manager', 80),
  ('notify.quiet_end', 'notify', '安靜時段結束', 'text', '"07:00"'::jsonb, null, null, null, '', 'manager', 81)

on conflict (key) do update set "group" = excluded."group", label = excluded.label, type = excluded.type,
  default_value = excluded.default_value, min = excluded.min, max = excluded.max, unit = excluded.unit,
  help = excluded.help, role_required = excluded.role_required, sort = excluded.sort;

-- ── 行事曆（自訂與覆寫；內建節氣／民俗／電商由前端與 Worker 共用的程式產生）────
create table if not exists public.marketing_calendar (
  id           text primary key,
  date         date not null, end_date date,
  kind         text not null,              -- solar_term|lunar_festival|ecommerce|gift|weather|custom
  name         text not null,
  tier         text,                       -- major|mid|purify|term|minor
  lead_days    int default 10,
  product_tags text[] default '{}',
  enabled      boolean default true,
  note         text
);
alter table public.marketing_calendar enable row level security;
do $$ begin create policy "auth read marketing_calendar" on public.marketing_calendar for select to authenticated using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "manager+ write marketing_calendar" on public.marketing_calendar for all to authenticated using (public.get_my_role() in ('admin','manager')) with check (public.get_my_role() in ('admin','manager')); exception when duplicate_object then null; end $$;

-- ── 氣象 ──────────────────────────────────────────────────────────────────
create table if not exists public.weather_daily (
  region text, date date, t_min numeric, t_max numeric, pop int, wx text,
  fetched_at timestamptz default now(),
  primary key (region, date)
);
alter table public.weather_daily enable row level security;
do $$ begin create policy "auth read weather_daily" on public.weather_daily for select to authenticated using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "manager+ write weather_daily" on public.weather_daily for all to authenticated using (public.get_my_role() in ('admin','manager')) with check (public.get_my_role() in ('admin','manager')); exception when duplicate_object then null; end $$;

create table if not exists public.marketing_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null, kind text not null,     -- weather|calendar|manual
  condition jsonb default '{}', product_tags text[] default '{}', enabled boolean default true,
  created_at timestamptz default now()
);
alter table public.marketing_rules enable row level security;
do $$ begin create policy "auth read marketing_rules" on public.marketing_rules for select to authenticated using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "manager+ write marketing_rules" on public.marketing_rules for all to authenticated using (public.get_my_role() in ('admin','manager')) with check (public.get_my_role() in ('admin','manager')); exception when duplicate_object then null; end $$;

-- ── 關鍵字、標題庫、內容庫 ───────────────────────────────────────────────────
create table if not exists public.keyword_pool (
  keyword text, source text,                  -- gsc|ads_search_term|ubersuggest|competitor|manual
  volume int, clicks int, impressions int, conversions numeric, cost_micros bigint,
  position numeric, trend text, product_tag text,
  status text default 'candidate',            -- candidate|active|negative|retired
  updated_at timestamptz default now(),
  primary key (keyword, source)
);
alter table public.keyword_pool enable row level security;
do $$ begin create policy "auth read keyword_pool" on public.keyword_pool for select to authenticated using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "manager+ write keyword_pool" on public.keyword_pool for all to authenticated using (public.get_my_role() in ('admin','manager')) with check (public.get_my_role() in ('admin','manager')); exception when duplicate_object then null; end $$;

create table if not exists public.title_library (
  id uuid primary key default gen_random_uuid(),
  text text not null, channel text,           -- google_rsa|social|edm|gsc_page|competitor
  product_tag text, campaign_id text, label text, ctr numeric, impressions bigint,
  compliance_ok boolean default false, retired boolean default false,
  created_at timestamptz default now()
);
alter table public.title_library enable row level security;
do $$ begin create policy "auth read title_library" on public.title_library for select to authenticated using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "manager+ write title_library" on public.title_library for all to authenticated using (public.get_my_role() in ('admin','manager')) with check (public.get_my_role() in ('admin','manager')); exception when duplicate_object then null; end $$;

create table if not exists public.content_library (
  id uuid primary key default gen_random_uuid(),
  kind text, product_tag text, title text, body text, rating numeric, source text,
  created_at timestamptz default now()
);
alter table public.content_library enable row level security;
do $$ begin create policy "auth read content_library" on public.content_library for select to authenticated using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "manager+ write content_library" on public.content_library for all to authenticated using (public.get_my_role() in ('admin','manager')) with check (public.get_my_role() in ('admin','manager')); exception when duplicate_object then null; end $$;

-- ── 企劃卡與動作 ─────────────────────────────────────────────────────────────
create table if not exists public.marketing_briefs (
  id           uuid primary key default gen_random_uuid(),
  event_id     text, event_name text, trigger text,
  period_start date, period_end date,
  products     jsonb default '[]',
  draft        jsonb default '{}',           -- AI 產出的完整企劃卡
  flags        jsonb default '[]',           -- 合規前置檢查命中
  status       text not null default 'draft', -- draft|approved|live|done|rejected
  feedback     text,
  created_by   text, approved_by text,
  created_at   timestamptz default now(), approved_at timestamptz, updated_at timestamptz default now()
);
create index if not exists marketing_briefs_status_idx on public.marketing_briefs (status, created_at desc);
alter table public.marketing_briefs enable row level security;
do $$ begin create policy "auth read marketing_briefs" on public.marketing_briefs for select to authenticated using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "manager+ write marketing_briefs" on public.marketing_briefs for all to authenticated using (public.get_my_role() in ('admin','manager')) with check (public.get_my_role() in ('admin','manager')); exception when duplicate_object then null; end $$;

create table if not exists public.marketing_actions (
  id bigserial primary key,
  brief_id uuid references public.marketing_briefs(id) on delete set null,
  channel text, payload jsonb, external_id text,
  applied_by text, applied_at timestamptz default now()
);
alter table public.marketing_actions enable row level security;
do $$ begin create policy "auth read marketing_actions" on public.marketing_actions for select to authenticated using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "manager+ write marketing_actions" on public.marketing_actions for all to authenticated using (public.get_my_role() in ('admin','manager')) with check (public.get_my_role() in ('admin','manager')); exception when duplicate_object then null; end $$;

-- ── 警示、建議、實驗 ─────────────────────────────────────────────────────────
create table if not exists public.marketing_alerts (
  id bigserial primary key,
  rule text not null, level text default 'info',     -- info|warning|critical
  message text not null, data jsonb default '{}',
  created_at timestamptz default now(), acked_by text, acked_at timestamptz
);
create index if not exists marketing_alerts_open_idx on public.marketing_alerts (acked_at, created_at desc);
alter table public.marketing_alerts enable row level security;
do $$ begin create policy "auth read marketing_alerts" on public.marketing_alerts for select to authenticated using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "manager+ write marketing_alerts" on public.marketing_alerts for all to authenticated using (public.get_my_role() in ('admin','manager')) with check (public.get_my_role() in ('admin','manager')); exception when duplicate_object then null; end $$;

create table if not exists public.marketing_suggestions (
  id bigserial primary key,
  week date, kind text, suggestion text, evidence jsonb default '{}', expected jsonb default '{}',
  status text default 'open', applied_action_id bigint,
  created_at timestamptz default now()
);
alter table public.marketing_suggestions enable row level security;
do $$ begin create policy "auth read marketing_suggestions" on public.marketing_suggestions for select to authenticated using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "manager+ write marketing_suggestions" on public.marketing_suggestions for all to authenticated using (public.get_my_role() in ('admin','manager')) with check (public.get_my_role() in ('admin','manager')); exception when duplicate_object then null; end $$;

create table if not exists public.experiment_log (
  id bigserial primary key,
  suggestion_id bigint, brief_id uuid,
  changed_at timestamptz default now(), change jsonb, baseline jsonb, result_14d jsonb, verdict text
);
alter table public.experiment_log enable row level security;
do $$ begin create policy "auth read experiment_log" on public.experiment_log for select to authenticated using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "manager+ write experiment_log" on public.experiment_log for all to authenticated using (public.get_my_role() in ('admin','manager')) with check (public.get_my_role() in ('admin','manager')); exception when duplicate_object then null; end $$;

-- ── 同步 log 與 Google 資料日表 ──────────────────────────────────────────────
create table if not exists public.google_sync_log (
  id bigserial primary key, source text, run_at timestamptz default now(), rows int, ok boolean, error text
);
alter table public.google_sync_log enable row level security;
do $$ begin create policy "auth read google_sync_log" on public.google_sync_log for select to authenticated using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "manager+ write google_sync_log" on public.google_sync_log for all to authenticated using (public.get_my_role() in ('admin','manager')) with check (public.get_my_role() in ('admin','manager')); exception when duplicate_object then null; end $$;

create table if not exists public.google_ads_daily (
  customer_id text, campaign_id text, campaign_name text, date date,
  cost_micros bigint, impressions bigint, clicks bigint, conversions numeric(14,2), conv_value numeric(14,2),
  fetched_at timestamptz default now(),
  primary key (customer_id, campaign_id, date)
);
alter table public.google_ads_daily enable row level security;
do $$ begin create policy "auth read google_ads_daily" on public.google_ads_daily for select to authenticated using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "manager+ write google_ads_daily" on public.google_ads_daily for all to authenticated using (public.get_my_role() in ('admin','manager')) with check (public.get_my_role() in ('admin','manager')); exception when duplicate_object then null; end $$;

create table if not exists public.ga4_daily (
  property_id text, date date, source_medium text,
  sessions bigint, users bigint, purchases bigint, purchase_revenue numeric(14,2),
  primary key (property_id, date, source_medium)
);
alter table public.ga4_daily enable row level security;
do $$ begin create policy "auth read ga4_daily" on public.ga4_daily for select to authenticated using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "manager+ write ga4_daily" on public.ga4_daily for all to authenticated using (public.get_my_role() in ('admin','manager')) with check (public.get_my_role() in ('admin','manager')); exception when duplicate_object then null; end $$;

create table if not exists public.gsc_daily (
  site_url text, date date, query text, page text,
  clicks bigint, impressions bigint, ctr numeric(8,5), position numeric(8,2),
  primary key (site_url, date, query, page)
);
alter table public.gsc_daily enable row level security;
do $$ begin create policy "auth read gsc_daily" on public.gsc_daily for select to authenticated using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "manager+ write gsc_daily" on public.gsc_daily for all to authenticated using (public.get_my_role() in ('admin','manager')) with check (public.get_my_role() in ('admin','manager')); exception when duplicate_object then null; end $$;
