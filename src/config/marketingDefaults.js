/**
 * marketingDefaults.js — 行銷設定中心：所有可調參數的定義與預設值
 * ─────────────────────────────────────────────────────────────────────────────
 * 單一真相：前端設定頁、Worker、生成鏈都以這份定義為準；DB `marketing_settings` 只存「被改過的值」。
 * 預設值依好漢草 2025～2026 實際數字推算（見 docs/行銷內容自動化迴圈規劃.md 第 15 節）。
 *
 * type：number | percent | days | text | textarea | boolean | list（每行一項）| json
 * role：manager（管理者可改）| admin（只有系統管理員可改）
 */

export const SETTING_GROUPS = [
  { id: 'scope',      label: '品牌與範圍',   icon: '🌿', color: 'var(--mint-500)'  },
  { id: 'google',     label: 'Google 廣告',  icon: '📊', color: 'var(--sky-500)'   },
  { id: 'budget',     label: '預算與費率',   icon: '💰', color: 'var(--peach-500)' },
  { id: 'bid',        label: '出價與目標',   icon: '🎯', color: 'var(--sky-500)'   },
  { id: 'alert',      label: '警示門檻',     icon: '🔔', color: 'var(--coral-500)' },
  { id: 'weather',    label: '天氣觸發',     icon: '🌧️', color: 'var(--sky-500)'   },
  { id: 'calendar',   label: '檔期與提前天數', icon: '📅', color: 'var(--lilac-500)' },
  { id: 'repurchase', label: '回購提醒',     icon: '🔁', color: 'var(--mint-500)'  },
  { id: 'stock',      label: '備貨',         icon: '📦', color: 'var(--peach-500)' },
  { id: 'discount',   label: '折扣彈性',     icon: '🏷️', color: 'var(--lilac-500)' },
  { id: 'gen',        label: 'AI 生成',      icon: '✍️', color: 'var(--mint-500)'  },
  { id: 'keywords',   label: '競品與關鍵字', icon: '🔍', color: 'var(--sky-500)'   },
  { id: 'notify',     label: '同步與通知',   icon: '📣', color: 'var(--coral-500)' },
]

export const SETTING_DEFS = [
  // ── 品牌與範圍 ────────────────────────────────────────────────────────────
  { key: 'scope.brand', group: 'scope', label: '品牌', type: 'text', default: '好漢草', help: '銷售資料的品牌欄位值；迴圈只處理這個品牌', role: 'admin' },
  { key: 'scope.official_customer', group: 'scope', label: '官網客戶名稱', type: 'text', default: '好漢草 品牌官網', help: '銷售資料中代表官網訂單的客戶名稱（用來算直接歸因 ROAS）', role: 'admin' },
  { key: 'scope.products', group: 'scope', label: '品項池（每行：分類｜關鍵字）', type: 'list', default: [
    '艾草平安包｜平安包', '足沐湯浴包｜湯浴包', '感溫足浴袋｜足浴袋', '擦澡包｜擦澡包', '淨境噴霧｜噴霧', '平安皂｜平安皂',
  ], help: '分類名稱與產品名稱關鍵字，用來把銷售資料歸到品類', role: 'manager' },

  // ── Google 廣告 ───────────────────────────────────────────────────────────
  { key: 'google.worker_url', group: 'google', label: 'Worker 網址', type: 'text', default: '', help: '部署 workers/google-sync 後的網址，例如 https://google-sync.xxx.workers.dev', role: 'admin' },
  { key: 'google.customer_id', group: 'google', label: 'Google Ads 客戶 ID', type: 'text', default: '', help: '10 碼，不含連字號；可在「Google 廣告」頁從帳號清單點選', role: 'admin' },
  { key: 'google.login_customer_id', group: 'google', label: '管理員帳戶（MCC）ID', type: 'text', default: '', help: '帳號在 MCC 底下才需要填', role: 'admin' },
  { key: 'google.geo_target', group: 'google', label: '關鍵字建議：地區常數', type: 'number', default: 2158, min: 1, max: 99999999, unit: '', help: '台灣 2158', role: 'manager' },
  { key: 'google.language', group: 'google', label: '關鍵字建議：語言常數', type: 'number', default: 1018, min: 1, max: 99999, unit: '', help: '繁體中文 1018', role: 'manager' },
  { key: 'google.idea_limit', group: 'google', label: '關鍵字建議：每次筆數', type: 'number', default: 50, min: 10, max: 500, unit: '筆', help: '', role: 'manager' },

  // ── 預算與費率 ────────────────────────────────────────────────────────────
  { key: 'budget.google_monthly_cap', group: 'budget', label: 'Google Ads 月預算上限', type: 'number', default: 30000, min: 0, max: 1000000, unit: '元', help: '好漢草全通路月均約 60 萬 × 費率 5%', role: 'admin' },
  { key: 'budget.google_monthly_start', group: 'budget', label: '起步月預算（前 3 個月）', type: 'number', default: 15000, min: 0, max: 1000000, unit: '元', help: '先驗證每筆轉換成本，第 4 個月依建議調整', role: 'admin' },
  { key: 'budget.campaign_month_cap', group: 'budget', label: '檔期月上限', type: 'number', default: 45000, min: 0, max: 1000000, unit: '元', help: '費率紅燈 8% × 60 萬，大檔才用', role: 'admin' },
  { key: 'budget.daily_cap_ratio', group: 'budget', label: '單日花費上限（月預算的 %）', type: 'percent', default: 8, min: 1, max: 100, unit: '%', help: '防止單日失控', role: 'admin' },
  { key: 'rate.yellow', group: 'budget', label: '廣告費率黃燈', type: 'percent', default: 5, min: 0, max: 100, unit: '%', help: '沿用獲利分析的門檻', role: 'manager' },
  { key: 'rate.red', group: 'budget', label: '廣告費率紅燈', type: 'percent', default: 8, min: 0, max: 100, unit: '%', help: '沿用獲利分析的門檻', role: 'manager' },
  { key: 'budget.outlier_months', group: 'budget', label: '預算公式排除的月份（每行一個 YYYY-MM）', type: 'list', default: ['2026-08'], help: '單月大單等異常值，不納入月均計算', role: 'manager' },
  { key: 'budget.reallocation_max', group: 'budget', label: '單通路單月調幅上限', type: 'percent', default: 30, min: 0, max: 100, unit: '%', help: '預算重分配建議的最大變動', role: 'manager' },
  { key: 'budget.google_expense_labels', group: 'budget', label: '月費用中屬於 Google 廣告的標籤（每行一個關鍵字）', type: 'list', default: ['網路廣告', '經緯'], help: '用來從月費用表認出 Google 廣告花費', role: 'manager' },

  // ── 出價與目標 ────────────────────────────────────────────────────────────
  { key: 'bid.target_cpa', group: 'bid', label: '目標每筆轉換成本', type: 'number', default: 400, min: 0, max: 100000, unit: '元', help: '官網客單約 580、毛利約 55%，CPA 要低於毛利額', role: 'manager' },
  { key: 'bid.target_roas', group: 'bid', label: '目標 ROAS（直接歸因）', type: 'number', default: 3, min: 0, max: 100, unit: '倍', help: '含平台外溢後實際 2 倍即可接受', role: 'manager' },
  { key: 'bid.tcpa_factor', group: 'bid', label: 'tCPA ＝ 歷史 CPA ×', type: 'number', default: 0.9, min: 0.1, max: 2, unit: '倍', help: '自動出價目標的保守係數', role: 'manager' },
  { key: 'bid.schedule_boost', group: 'bid', label: '轉換高峰時段加碼', type: 'text', default: '20-23 時 +15%', help: '待 GA4 資料後修正', role: 'manager' },
  { key: 'bid.region_weight', group: 'bid', label: '天氣觸發時北部加權', type: 'percent', default: 20, min: 0, max: 100, unit: '%', help: '降溫檔期的地區出價調整', role: 'manager' },

  // ── 警示門檻 ──────────────────────────────────────────────────────────────
  { key: 'alert.cpa_over_ratio', group: 'alert', label: 'CPA 超過目標倍數', type: 'number', default: 1.3, min: 1, max: 5, unit: '倍', help: '連續 2 天超過即警示', role: 'manager' },
  { key: 'alert.zero_conv_days', group: 'alert', label: '零轉換天數', type: 'days', default: 2, min: 1, max: 30, unit: '天', help: '且當期花費超過下方金額', role: 'manager' },
  { key: 'alert.zero_conv_spend', group: 'alert', label: '零轉換的花費門檻', type: 'number', default: 1000, min: 0, max: 100000, unit: '元', help: '', role: 'manager' },
  { key: 'alert.spend_pace_low', group: 'alert', label: '檔期過半消耗低於', type: 'percent', default: 50, min: 0, max: 100, unit: '%', help: '', role: 'manager' },
  { key: 'alert.spend_pace_high', group: 'alert', label: '檔期過半消耗高於', type: 'percent', default: 80, min: 0, max: 100, unit: '%', help: '', role: 'manager' },
  { key: 'alert.asset_low_impr', group: 'alert', label: '素材 LOW 的最低曝光', type: 'number', default: 1000, min: 0, max: 1000000, unit: '次', help: '曝光不足的素材不列入汰換', role: 'manager' },
  { key: 'alert.wasted_term_cost', group: 'alert', label: '浪費字詞門檻（7 天花費）', type: 'number', default: 500, min: 0, max: 100000, unit: '元', help: '0 轉換且超過此金額 → 建議否定', role: 'manager' },
  { key: 'alert.funnel_drop_ratio', group: 'alert', label: '漏斗步驟惡化幅度', type: 'percent', default: 20, min: 0, max: 100, unit: '%', help: '較 4 週均值', role: 'manager' },
  { key: 'alert.pagespeed_min', group: 'alert', label: '落地頁手機分數下限', type: 'number', default: 50, min: 0, max: 100, unit: '分', help: '', role: 'manager' },
  { key: 'alert.rank_drop_top', group: 'alert', label: '核心字詞掉出前 N 名', type: 'number', default: 10, min: 1, max: 100, unit: '名', help: '', role: 'manager' },
  { key: 'alert.competitor_traffic_jump', group: 'alert', label: '競品流量週增', type: 'percent', default: 30, min: 0, max: 500, unit: '%', help: '', role: 'manager' },

  // ── 天氣觸發 ──────────────────────────────────────────────────────────────
  { key: 'weather.regions', group: 'weather', label: '觀測區域（每行一個縣市）', type: 'list', default: ['臺北市', '新北市', '桃園市'], help: '中央氣象署一週預報的縣市名稱', role: 'manager' },
  { key: 'weather.cold_min_temp', group: 'weather', label: '降溫：未來 3 天最低溫 ≤', type: 'number', default: 16, min: -5, max: 30, unit: '°C', help: '推 足好暖湯浴包＋感溫足浴袋', role: 'manager' },
  { key: 'weather.cold_drop', group: 'weather', label: '降溫：較前 3 天降 ≥', type: 'number', default: 5, min: 1, max: 20, unit: '°C', help: '', role: 'manager' },
  { key: 'weather.rain_pop', group: 'weather', label: '濕冷：連續 3 天降雨機率 ≥', type: 'percent', default: 70, min: 0, max: 100, unit: '%', help: '且最高溫 ≤ 下方溫度 → 推 足好輕、淨境噴霧', role: 'manager' },
  { key: 'weather.rain_max_temp', group: 'weather', label: '濕冷：最高溫 ≤', type: 'number', default: 20, min: 0, max: 35, unit: '°C', help: '', role: 'manager' },
  { key: 'weather.end_days', group: 'weather', label: '觸發結束：條件連續不成立', type: 'days', default: 3, min: 1, max: 14, unit: '天', help: '建議暫停天氣檔', role: 'manager' },

  // ── 檔期與提前天數 ─────────────────────────────────────────────────────────
  { key: 'calendar.lead_major', group: 'calendar', label: '大檔提前天數', type: 'days', default: 21, min: 1, max: 60, unit: '天', help: '雙 11、年貨節、母親節', role: 'manager' },
  { key: 'calendar.lead_mid', group: 'calendar', label: '中檔提前天數', type: 'days', default: 10, min: 1, max: 60, unit: '天', help: '99、雙 12、中秋、父親節', role: 'manager' },
  { key: 'calendar.lead_purify', group: 'calendar', label: '淨身檔提前天數', type: 'days', default: 14, min: 1, max: 60, unit: '天', help: '清明、媽祖生、鬼月、中元、年底除舊', role: 'manager' },
  { key: 'calendar.lead_term', group: 'calendar', label: '節氣提前天數', type: 'days', default: 7, min: 1, max: 30, unit: '天', help: '霜降、立冬、小雪、大雪、冬至', role: 'manager' },
  { key: 'calendar.multiplier_major', group: 'calendar', label: '大檔銷量倍率（備貨用）', type: 'number', default: 3.0, min: 1, max: 10, unit: '倍', help: '第一年用經驗值', role: 'manager' },
  { key: 'calendar.multiplier_mid', group: 'calendar', label: '中檔銷量倍率', type: 'number', default: 1.8, min: 1, max: 10, unit: '倍', help: '', role: 'manager' },
  { key: 'calendar.multiplier_purify', group: 'calendar', label: '淨身檔銷量倍率', type: 'number', default: 2.5, min: 1, max: 10, unit: '倍', help: '', role: 'manager' },
  { key: 'calendar.multiplier_term', group: 'calendar', label: '節氣銷量倍率', type: 'number', default: 1.5, min: 1, max: 10, unit: '倍', help: '', role: 'manager' },
  { key: 'calendar.custom_events', group: 'calendar', label: '自訂檔期（每行：YYYY-MM-DD｜名稱｜提前天數｜品類）', type: 'list', default: [], help: '例：2026-11-20｜週年慶｜14｜平安包', role: 'manager' },

  // ── 回購提醒 ──────────────────────────────────────────────────────────────
  { key: 'repurchase.products', group: 'repurchase', label: '納入品類（每行一個）', type: 'list', default: ['艾草平安包', '足沐湯浴包', '擦澡包'], help: '對應品項池的分類名稱', role: 'manager' },
  { key: 'repurchase.pre_days', group: 'repurchase', label: '到期前提醒天數', type: 'days', default: 7, min: 0, max: 60, unit: '天', help: '', role: 'manager' },
  { key: 'repurchase.overdue_ratio', group: 'repurchase', label: '逾期提醒倍率', type: 'number', default: 1.5, min: 1, max: 5, unit: '倍', help: '距上次購買 ÷ 平均間隔', role: 'manager' },
  { key: 'repurchase.min_orders', group: 'repurchase', label: '納入門檻：至少購買次數', type: 'number', default: 3, min: 1, max: 20, unit: '次', help: '沿用回購面板', role: 'manager' },
  { key: 'repurchase.min_days', group: 'repurchase', label: '納入門檻：往來天數', type: 'days', default: 60, min: 1, max: 365, unit: '天', help: '', role: 'manager' },
  { key: 'repurchase.cooldown_days', group: 'repurchase', label: '同一客戶推播冷卻', type: 'days', default: 30, min: 1, max: 180, unit: '天', help: '', role: 'manager' },
  { key: 'repurchase.coupon_text', group: 'repurchase', label: '回購券文字', type: 'textarea', default: '老朋友專屬：回購 9 折，輸入 BACK9', help: '推播與 EDM 共用', role: 'manager' },

  // ── 備貨 ──────────────────────────────────────────────────────────────────
  { key: 'stock.restock_lead_days', group: 'stock', label: '檔期前幾天出備貨建議', type: 'days', default: 21, min: 1, max: 90, unit: '天', help: '', role: 'manager' },
  { key: 'stock.safety_days', group: 'stock', label: '安全庫存天數', type: 'days', default: 14, min: 0, max: 90, unit: '天', help: '庫存天數低於檔期天數即從廣告候選剔除', role: 'manager' },

  // ── 折扣彈性 ──────────────────────────────────────────────────────────────
  { key: 'discount.min_samples', group: 'discount', label: '每桶最少交易筆數', type: 'number', default: 30, min: 5, max: 1000, unit: '筆', help: '樣本不足的桶不算', role: 'manager' },
  { key: 'discount.lookback_months', group: 'discount', label: '回看月數', type: 'number', default: 24, min: 6, max: 60, unit: '月', help: '', role: 'manager' },
  { key: 'discount.insensitive_below', group: 'discount', label: '折扣無感：彈性 <', type: 'number', default: 0.5, min: 0, max: 5, unit: '', help: '打折只是送錢', role: 'manager' },
  { key: 'discount.sensitive_above', group: 'discount', label: '折扣敏感：彈性 >', type: 'number', default: 1.5, min: 0, max: 10, unit: '', help: '可當檔期引流品', role: 'manager' },

  // ── AI 生成 ───────────────────────────────────────────────────────────────
  { key: 'gen.rsa_headlines', group: 'gen', label: 'Google 標題數', type: 'number', default: 15, min: 3, max: 15, unit: '則', help: '每則 ≤ 30 字元', role: 'manager' },
  { key: 'gen.rsa_descriptions', group: 'gen', label: 'Google 描述數', type: 'number', default: 4, min: 2, max: 4, unit: '則', help: '每則 ≤ 90 字元', role: 'manager' },
  { key: 'gen.social_posts', group: 'gen', label: '社群貼文版本數', type: 'number', default: 3, min: 1, max: 5, unit: '版', help: 'FB／IG／Threads', role: 'manager' },
  { key: 'gen.edm_subjects', group: 'gen', label: 'EDM 主旨數', type: 'number', default: 5, min: 1, max: 10, unit: '則', help: '', role: 'manager' },
  { key: 'gen.tone', group: 'gen', label: '品牌語氣', type: 'textarea', default: '溫暖、台灣在地、長輩也看得懂、不賣弄中醫術語；像鄰居姐姐在分享生活，不是在推銷。', help: '生成鏈每次都會帶入', role: 'manager' },
  { key: 'gen.allowed_claims', group: 'gen', label: '允許的事實句（每行一句）', type: 'list', default: ['台灣製造', '艾草產地台灣', '無添加香精', '可當伴手禮'], help: '只放可以證明的事實，不放功效', role: 'manager' },
  { key: 'gen.banned_words_extra', group: 'gen', label: '額外禁用字（每行一個）', type: 'list', default: [], help: '在藥事法清單之外再加', role: 'manager' },
  { key: 'gen.compliance_hard_block', group: 'gen', label: '合規不過就不能核准', type: 'boolean', default: true, help: '好漢草固定開啟', role: 'admin' },

  // ── 競品與關鍵字 ──────────────────────────────────────────────────────────
  { key: 'competitors.domains', group: 'keywords', label: '競品網域（每行一個）', type: 'list', default: ['lomoji.com.tw', 'hanfangyupin.com.tw', 'pst1904.com', 'shuimu125.com', 'aitsao.com.tw', 'dechuantea.com', 'satitea.com'], help: '主要 5 個＋次要 2 個', role: 'manager' },
  { key: 'keywords.core', group: 'keywords', label: '核心關鍵字組（每行一組）', type: 'list', default: [
    '草本足浴包推薦 / 台灣在地足浴包',
    '艾草淨身平安包 / 探病掃墓除穢',
    '手腳冰冷泡腳配方 / 冬季暖身足浴',
    '運動後泡腳 / 草本足浴',
    '睡前泡腳儀式 / 紓壓草本包',
    '坐月子擦澡包 / 產後草本沐浴',
    '送禮長輩養生禮盒 / 節慶健康禮品推薦',
    '艾草平安包 媽祖 虎爺 聯名 / 廟會 平安 伴手禮',
    '感溫足浴袋 泡腳袋 推薦',
    '探病 淨身 / 搬家 入厝 淨化',
  ], help: '功效字只留在關鍵字層，不進標題', role: 'manager' },
  { key: 'keywords.negative_seed', group: 'keywords', label: '預設否定字（每行一個）', type: 'list', default: ['免費', '教學', 'DIY', '批發', '工廠', '做法', '自製'], help: '', role: 'manager' },
  { key: 'keywords.seo_rank_min', group: 'keywords', label: 'SEO 產文：排名下限', type: 'number', default: 4, min: 1, max: 50, unit: '名', help: '排名 4～10 且曝光達標的字詞', role: 'manager' },
  { key: 'keywords.seo_rank_max', group: 'keywords', label: 'SEO 產文：排名上限', type: 'number', default: 10, min: 1, max: 100, unit: '名', help: '', role: 'manager' },
  { key: 'keywords.seo_min_impressions', group: 'keywords', label: 'SEO 產文：最低曝光', type: 'number', default: 500, min: 0, max: 100000, unit: '次', help: '', role: 'manager' },
  { key: 'keywords.seo_posts_per_week', group: 'keywords', label: '每週文章數', type: 'number', default: 2, min: 0, max: 10, unit: '篇', help: '', role: 'manager' },

  // ── 同步與通知 ────────────────────────────────────────────────────────────
  { key: 'sync.ads_lookback_days', group: 'notify', label: '廣告資料回抓天數', type: 'days', default: 7, min: 1, max: 30, unit: '天', help: '轉換會延後回填', role: 'admin' },
  { key: 'notify.line_daily_time', group: 'notify', label: '每日 LINE 摘要時間', type: 'text', default: '07:00', help: '台北時間', role: 'manager' },
  { key: 'notify.weekly_report_day', group: 'notify', label: '週報發送日', type: 'text', default: '週一', help: '', role: 'manager' },
  { key: 'notify.quiet_start', group: 'notify', label: '安靜時段開始', type: 'text', default: '22:00', help: '不推播', role: 'manager' },
  { key: 'notify.quiet_end', group: 'notify', label: '安靜時段結束', type: 'text', default: '07:00', help: '', role: 'manager' },
]

export const DEFAULTS = Object.fromEntries(SETTING_DEFS.map(d => [d.key, d.default]))

/** 把 list 型設定（每行一項）轉成陣列；容錯：字串用換行切 */
export function asList(v) {
  if (Array.isArray(v)) return v.map(s => String(s).trim()).filter(Boolean)
  if (typeof v === 'string') return v.split('\n').map(s => s.trim()).filter(Boolean)
  return []
}

/** 品項池：'分類｜關鍵字' → [{ category, keyword }] */
export function parseProductPool(list) {
  return asList(list).map(line => {
    const [category, keyword] = line.split(/[｜|]/).map(s => s.trim())
    return { category: category || line, keyword: keyword || category || line }
  })
}
