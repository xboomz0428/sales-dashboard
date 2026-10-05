# Google Ads / GA4 / Search Console 串接規劃（先規劃、未實作）

更新：2026-10-05　狀態：草案，待老闆決定第 9 節的問題後動工

---

## 0. 一句話結論

可以串，而且 Google 自己就有官方 MCP（Ads、GA4 都有；GSC 只有社群版）。
但 MCP 只解決「用 Claude 問答分析」，**不會自動把數字寫進儀表板**。
要讓「廣告投資監控／ROAS」面板自動出現 Google Ads 的花費，還是要比照現在的 `erp-import.mjs`，
做一支排程腳本把 Google 的資料寫進 Supabase。建議兩條線一起做，共用同一組 Google Cloud 憑證。

---

## 1. 現況盤點（repo 目前怎麼處理廣告費）

| 項目 | 現況 | 缺口 |
|---|---|---|
| 廣告費來源 | `monthly_expenses` 表，`category='廣告費用'`；由財政部進項發票、momo 對帳單、蝦皮對帳單匯入（`invoiceImport.js`、`momoStatement.js`、`shopeeStatement.js`） | 月粒度、無 campaign 層級、Google Ads 只會以「網路廣告」發票進來 |
| 通路歸戶 | `ProfitAnalysisPanel.jsx` 用 label 關鍵字（momo／蝦皮／日藥）歸戶，其餘算「其他/站外」 | Google Ads 現在被丟進「其他/站外」，無法對應官網營收 |
| ROAS 面板 | ③ 廣告投資監控：只有 momo、蝦皮、其他/站外三欄 | 沒有 Google Ads／官網這一欄，也沒有 GA4 轉換、GSC 搜尋量 |
| 自動化方式 | Windows 工作排程器跑 `erp-import.bat`、`lc-sync.bat`、`weekly-alert.mjs` | 可直接沿用這套模式 |
| GA / GSC | 你說已有串接，但 repo 內沒有任何 GA4／GSC 程式碼（只有 Vercel Analytics） | 推測是在 Google 後台或其他工具串好，尚未進儀表板 |
| Meta Ads | Claude 已掛 `MetaAds_MCP` 連接器但尚未授權 | 授權後可與 Google Ads 同一套做法 |

---

## 2. 2026 年 Google Ads API 存取方式（重要變更）

依 Google 2026 年公告（developers.google.com 本機被擋，以下整理自多方轉述，動工前請到 Cloud Console 的「Google Ads API 總覽」頁再確認一次）：

- **Developer token 已於 2026-09-09 退場**。原本在 Google Ads 管理員帳戶「API 中心」申請權杖的流程取消，
  改為**存取等級綁在 Google Cloud 專案**上，在 Cloud Console → Google Ads API Overview 申請。
- 現行四個等級：
  | 等級 | 可打正式帳戶？ | 每日操作上限 | 備註 |
  |---|---|---|---|
  | Test | 否（只能測試帳戶） | 15,000 | 預設 |
  | Explorer | 是 | 2,880 | **我們拉報表這個就夠**，不需品牌驗證 |
  | Basic | 是 | 15,000 | 新申請需品牌驗證 |
  | Standard | 是 | 無上限（多數服務） | 需用量審查 |
- 舊程式送 `developer-token` header 仍可用但會被忽略；官方 MCP README 目前還列 `GOOGLE_ADS_DEVELOPER_TOKEN`，
  實際上只需要 Cloud 專案有 Explorer 以上等級即可。
- 若帳戶在 MCC（管理員帳戶）底下，呼叫時要帶 `login-customer-id`（MCC 的 10 碼 ID）。

---

## 3. MCP 選項比較

### 3.1 Google Ads

| 方案 | 性質 | 工具 | 讀/寫 | 費用 | 適合 |
|---|---|---|---|---|---|
| **官方 `googleads/google-ads-mcp`**（2026-04 釋出） | Python，本機跑 | `list_accessible_customers`、`search`（GAQL）、`get_resource_metadata` | 唯讀 | 免費 | ✅ 建議。安全、Google 維護 |
| 社群 `cohnen/mcp-google-ads` | Python | 現成的 campaign/keyword 報表工具 | 唯讀 | 免費 | 不想自己寫 GAQL 時 |
| 託管（Windsor.ai、Adspirer、Ryze、Composio） | 雲端 OAuth，claude.ai 連接器可用 | 多平台（Ads+Meta+GA4） | 部分可寫 | 月費 | 不想裝東西、要手機上用 |
| Make（已連接）| 無程式碼 | Google Ads 模組 → Supabase 模組 | 可寫 | 依 Make 方案計次 | 第 5 節 B 線的替代做法 |

### 3.2 GA4：官方 `googleanalytics/google-analytics-mcp`（`pipx run analytics-mcp`）
工具：`get_account_summaries`、`get_property_details`、`list_google_ads_links`、`run_report`、`run_funnel_report`、`run_realtime_report`、`get_custom_dimensions_and_metrics`。唯讀。

### 3.3 Search Console：**沒有官方版**，社群可選
- `ahonn/mcp-server-gsc`（Node，service account JSON，最多人用）
- `david-wulf/gsc-mcp`（20 個工具：quick wins、內容衰退、CTR 基準、索引 API）
- `eduardmur/gsc-mcp`（`claude mcp add gsc -- npx -y @eduardmur/gsc-mcp`）

三者可共用**同一個 Google Cloud 專案**，Ads 與 GA4 用 `gcloud auth application-default login` 一次登入，GSC 用 service account。

---

## 4. 建議架構：兩條線

```
                 ┌──────────────── A 線：問答分析（MCP） ────────────────┐
Google Cloud 專案 │ Claude Code / Claude Desktop                          │
 ├ Google Ads API ├ google-ads-mcp  ──► GAQL 查 campaign/關鍵字/成本       │
 ├ GA4 Data API   ├ analytics-mcp   ──► run_report 查流量/轉換/營收         │
 └ GSC API        └ gsc-mcp         ──► 查詢字/曝光/點擊/索引             │
                 └────────────────────────────────────────────────────────┘
                 ┌──────────────── B 線：自動入帳（排程腳本） ───────────┐
                 │ scripts/google-marketing-import.mjs（每日 06:30）       │
                 │  1. GAQL 拉近 7 天 campaign 日成本 → google_ads_daily   │
                 │  2. GA4 拉日 sessions/purchase/revenue → ga4_daily      │
                 │  3. GSC 拉日 clicks/impressions → gsc_daily             │
                 │  4. 月彙總 upsert → monthly_expenses(廣告費用, label    │
                 │     'Google Ads 自動同步 YYYY-MM')                      │
                 │  5. 完成後 LINE 推播（沿用 weekly-alert 的 lineMessage）│
                 └────────────────────────────────────────────────────────┘
                                      ▼
                   儀表板：ROAS 面板新增「Google Ads／官網」欄
                           新分頁「數位行銷」：廣告花費 vs 官網營收、GA4 轉換、GSC 趨勢
```

**為什麼要 B 線而不是只靠 MCP**：MCP 是 Claude 在本機臨時呼叫，儀表板（Vercel 靜態站＋Supabase）看不到；
且官方 MCP 唯讀、無排程。B 線沿用現有 `erp-import` 的冪等寫入與 .env 模式，團隊已熟悉。

**B 線的替代**：Supabase Edge Function ＋ `pg_cron` 每日觸發（refresh token 放 Supabase secrets）。
好處是不靠 ERP 主機那台 Windows 常開；壞處是要多維護 Deno 函式。現有 `line-push` 函式還是 Hello World 範本，
若之後要把 LINE 推播也上雲，可以一併做，否則第一版先走 Windows 排程器，最省事。

---

## 5. 資料模型（新增 migration）

```sql
-- 廣告日粒度（存 micros 原值，顯示再 /1e6）
create table google_ads_daily (
  customer_id   text, campaign_id text, campaign_name text,
  date          date,
  cost_micros   bigint, impressions bigint, clicks bigint,
  conversions   numeric(14,2), conv_value numeric(14,2),
  fetched_at    timestamptz default now(),
  primary key (customer_id, campaign_id, date)
);
create table ga4_daily (
  property_id text, date date, source_medium text,
  sessions bigint, users bigint, purchases bigint, purchase_revenue numeric(14,2),
  primary key (property_id, date, source_medium)
);
create table gsc_daily (
  site_url text, date date, query text, page text,
  clicks bigint, impressions bigint, ctr numeric(8,5), position numeric(8,2),
  primary key (site_url, date, query, page)
);
```
RLS 比照 `monthly_expenses`：authenticated 可讀，admin/manager 可寫；腳本用 service key。
`monthly_expenses` 不改結構，彙總列用固定 `id = 'gads-YYYY-MM'`，重跑即覆蓋。

---

## 6. 介面與設定規劃

### 6.1 儀表板
1. **獲利分析 ③ ROAS 監控**：新增「Google Ads／官網」一欄，廣告費來自 `google_ads_daily` 月彙總，
   營收對應官網通路（需確認 `sales_data` 裡官網的通路名稱，見第 9 節）。黃紅燈門檻沿用 5% / 8%。
2. **新分頁「數位行銷」**（或併入老闆視角）：
   - KPI 卡：本月廣告花費、官網營收、ROAS、GA4 轉換率、GSC 曝光
   - 圖：日花費 vs 日官網營收雙軸線；campaign 表（花費／點擊／轉換／CPA）；GSC 前 20 查詢字與週變化
   - 和農曆檔期面板（`LunarPanel`）對齊，看檔期投放效果
3. **後台 > 設定**：顯示「Google 同步狀態」（上次同步時間、筆數、錯誤），沿用 `DatabaseStatusPanel` 風格。

### 6.2 `.env.example` 新增
```
# ── Google Ads / GA4 / GSC（B 線排程腳本用）────────────────
GOOGLE_PROJECT_ID=
GOOGLE_APPLICATION_CREDENTIALS=C:\Users\User\.config\gcloud\application_default_credentials.json
GOOGLE_ADS_CUSTOMER_ID=1234567890          # 投放帳戶 10 碼（不含連字號）
GOOGLE_ADS_LOGIN_CUSTOMER_ID=              # 若在 MCC 底下填 MCC ID
GA4_PROPERTY_ID=
GSC_SITE_URL=sc-domain:example.com.tw
GSC_SERVICE_ACCOUNT_JSON=C:\path\gsc-sa.json
```

### 6.3 Claude Code MCP 註冊（A 線，一次性）
```bash
claude mcp add google-ads -e GOOGLE_PROJECT_ID=<id> -e GOOGLE_APPLICATION_CREDENTIALS=<adc.json> \
  -- pipx run --spec "git+https://github.com/googleads/google-ads-mcp.git" google-ads-mcp
claude mcp add analytics -e GOOGLE_PROJECT_ID=<id> -e GOOGLE_APPLICATION_CREDENTIALS=<adc.json> \
  -- pipx run analytics-mcp
claude mcp add gsc -e GOOGLE_APPLICATION_CREDENTIALS=<gsc-sa.json> -- npx -y mcp-server-gsc
```
Claude Desktop 則把同樣內容放進 `claude_desktop_config.json` 的 `mcpServers`。

---

## 7. 一次性設定清單（Google 端）

1. Google Cloud Console 建專案（或沿用既有 GA/GSC 專案）。
2. 啟用 API：Google Ads API、Google Analytics Data API、Google Analytics Admin API、Search Console API。
3. OAuth 同意畫面：Internal（若是 Workspace）或 External；scopes 加
   `auth/adwords`、`auth/analytics.readonly`、`auth/webmasters.readonly`。
4. 建 OAuth 用戶端（Desktop app）；本機執行
   `gcloud auth application-default login --scopes=https://www.googleapis.com/auth/adwords,https://www.googleapis.com/auth/analytics.readonly,https://www.googleapis.com/auth/cloud-platform`
5. Cloud Console → Google Ads API Overview → 申請 **Explorer** 等級（Test 等級打不到正式帳戶）。
6. 建 service account，下載 JSON；到 Search Console 把 `xxx@<project>.iam.gserviceaccount.com` 加為該資源的使用者。
7. 記下：Ads customer ID、MCC ID（若有）、GA4 property ID、GSC site URL。
8. 先用 MCP 跑一次 `list_accessible_customers` 與 GAQL 驗證權限，再寫 B 線腳本。

---

## 8. 風險與必須注意的事

1. **🔴 憑證外洩（現在就該處理）**：`.claude/settings.local.json` 已被 commit 進 git，裡面含 Supabase `service_role` key 明文。
   建議：到 Supabase 專案重新產生 key、把 `.claude/settings.local.json` 加進 `.gitignore` 並從 git 移除追蹤。
   接下來要新增 Google 憑證，這條路一定要先堵住；Google 的 JSON 一律放 .env 指到的路徑，不進 repo。
2. **費用雙重計算**：Google Ads 花費會同時以「進項發票：網路廣告」進 `monthly_expenses`，再加上 B 線的自動彙總就重複了
   （v0.0.140／141 momo 雙重扣費的教訓）。規則建議：自動彙總列存在的月份，發票匯入把 Google 發票標為「已由 API 入帳」跳過；
   或反過來只用發票當會計數、API 數據只做 ROAS 分析不進損益表。**需你決定**。
3. 金額單位是 micros（除以 1,000,000）；幣別與時區依 Google Ads 帳戶設定（通常 TWD／台北）。
4. 轉換會延後回填，每日同步要重抓近 7 天（upsert），不要只抓昨天。
5. Explorer 每日 2,880 次操作，日同步 3 個 API 各一兩次綽綽有餘；MCP 問答也算在內，正常使用不會爆。
6. 官方 MCP 唯讀，不能調預算、暫停 campaign。若要「自動調整」屬下一階段，且需 Basic 以上等級與寫入權限，建議先不做。
7. ADC 的 refresh token 綁個人 Google 帳號；離職或改密碼會失效，排程腳本要有失敗 LINE 通知。

---

## 9. 需要你決定的問題

1. 官網（自營電商）在 `sales_data` 裡的通路名稱是什麼？ROAS 要用哪些通路的營收對 Google Ads 花費？
2. 第 8-2 的雙重計算規則，選哪一種？
3. B 線跑在 ERP 主機（Windows 排程器，與現有一致）還是 Supabase Edge Function？
4. Google Ads 帳戶是否在 MCC 底下？GA4 與 GSC 目前是用哪個 Google 帳號／Cloud 專案串的？
5. Meta Ads 要不要同一批做（連接器已掛，只差授權）？

---

## 10. 分階段實作（估時）

| 階段 | 內容 | 估時 |
|---|---|---|
| 0 | 第 8-1 憑證處理、Google Cloud 設定清單（第 7 節） | 半天（多為等 Google 審核 Explorer） |
| 1 | A 線：三個 MCP 掛進 Claude Code，驗證能查到資料；寫 3～5 個常用 GAQL／GA4 範本到 `KnowledgeBase` | 半天 |
| 2 | B 線：migration ＋ `google-marketing-import.mjs`（Ads 先）＋ `.bat` ＋ 排程器文件 | 1 天 |
| 3 | 儀表板：ROAS 面板加 Google Ads 欄、同步狀態 | 半天 |
| 4 | GA4、GSC 進 B 線＋「數位行銷」分頁 | 1～1.5 天 |
| 5 | 週報 LINE 推播加廣告段落（`weekly-alert.mjs`） | 半天 |

---

## 參考來源
- 官方 Google Ads MCP：https://github.com/googleads/google-ads-mcp
- 官方 GA4 MCP：https://github.com/googleanalytics/google-analytics-mcp
- GSC 社群 MCP：https://github.com/ahonn/mcp-server-gsc 、https://github.com/david-wulf/gsc-mcp 、https://github.com/eduardmur/gsc-mcp
- 社群 Ads MCP：https://github.com/cohnen/mcp-google-ads
- 2026 存取等級／token 退場：https://developers.google.com/google-ads/api/docs/api-policy/access-levels 、
  https://paidmediacollective.com/newsfeed/google-ads-api-cloud-project-access-2026 、
  https://ppc.land/google-drops-developer-tokens-from-ads-api-access-decisions/
- 方案比較：https://www.adspirer.com/blog/google-ads-mcp 、https://www.get-ryze.ai/blog/best-mcp-for-google-ads
