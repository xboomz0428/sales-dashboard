# Google Ads / GA4 / Search Console 串接規劃（Cloudflare 版，先規劃、未實作）

更新：2026-10-05　狀態：草案，待老闆決定第 9 節的問題後動工
部署位置：**Cloudflare Workers**（老闆指定）。儀表板本身維持在 Vercel，資料庫維持 Supabase。

---

## 0. 一句話結論

可以串，Google 自己就有官方 MCP（Ads、GA4 都有；GSC 只有社群版）。
但 MCP 只解決「用 Claude 問答分析」，**不會自動把數字寫進儀表板**。
要讓「廣告投資監控／ROAS」面板自動出現 Google Ads 的花費，要在 Cloudflare 上放一支
**每日排程的 Worker**（Cron Trigger），用 REST 拉 Google 資料寫進 Supabase。
選配再放一支 **遠端 MCP Worker**，讓 claude.ai 手機／桌面版用自訂連接器直接問廣告數據。

---

## 1. 現況盤點（repo 目前怎麼處理廣告費）

| 項目 | 現況 | 缺口 |
|---|---|---|
| 廣告費來源 | `monthly_expenses` 表，`category='廣告費用'`；由財政部進項發票、momo 對帳單、蝦皮對帳單匯入（`invoiceImport.js`、`momoStatement.js`、`shopeeStatement.js`） | 月粒度、無 campaign 層級、Google Ads 只會以「網路廣告」發票進來 |
| 通路歸戶 | `ProfitAnalysisPanel.jsx` 用 label 關鍵字（momo／蝦皮／日藥）歸戶，其餘算「其他/站外」 | Google Ads 現在被丟進「其他/站外」，無法對應官網營收 |
| ROAS 面板 | ③ 廣告投資監控：只有 momo、蝦皮、其他/站外三欄 | 沒有 Google Ads／官網這一欄，也沒有 GA4 轉換、GSC 搜尋量 |
| 自動化方式 | Windows 工作排程器跑 `erp-import.bat`、`lc-sync.bat`、`weekly-alert.mjs`（都在 ERP 主機上） | 這次改放 Cloudflare，不依賴那台電腦開機 |
| 部署 | 儀表板 `deploy.js` 推 Vercel；Supabase 有 `line-push` Edge Function 但仍是 Hello World 範本 | repo 內沒有任何 Cloudflare／wrangler 設定，要從零建 |
| GA / GSC | 你說已有串接，但 repo 內沒有 GA4／GSC 程式碼（只有 Vercel Analytics） | 推測是在 Google 後台串好，尚未進儀表板 |
| Meta Ads | Claude 已掛 `MetaAds_MCP` 連接器但尚未授權 | 授權後可與 Google Ads 同一套做法 |

---

## 2. 2026 年 Google Ads API 存取方式（重要變更）

依 Google 2026 年公告（developers.google.com 在本環境被擋，以下整理自多方轉述，動工前請到 Cloud Console 的「Google Ads API 總覽」頁再確認一次）：

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
- **Google Ads API 不接受純 service account**，要用使用者 OAuth 的 refresh token；GA4 與 GSC 則可用 service account。

---

## 3. MCP 選項比較

### 3.1 Google Ads

| 方案 | 性質 | 工具 | 讀/寫 | 費用 | 能放 Cloudflare？ |
|---|---|---|---|---|---|
| **官方 `googleads/google-ads-mcp`**（2026-04 釋出） | Python，本機跑 | `list_accessible_customers`、`search`（GAQL）、`get_resource_metadata` | 唯讀 | 免費 | ✗（Python）。本機 Claude Code 用它最安全 |
| 社群 `ivanfc/MyContentGoogleMCP` | **TypeScript，已是 Cloudflare Worker**，REST v25 | GAQL、campaign 總覽、變更紀錄；寫入走 plan/apply 兩段式確認 | 可寫 | 免費（自架） | ✅ 遠端 MCP 的最佳參考範本 |
| 社群 `cohnen/mcp-google-ads` | Python | 現成 campaign/keyword 報表 | 唯讀 | 免費 | ✗ |
| 託管（Windsor.ai、Adspirer、Ryze、Composio） | 雲端 OAuth，claude.ai 連接器可用 | 多平台 | 部分可寫 | 月費 | 不用自架 |
| Make（已連接） | 無程式碼 | Google Ads 模組 → Supabase 模組 | 可寫 | 依 Make 計次 | 替代同步方案 |

### 3.2 GA4：官方 `googleanalytics/google-analytics-mcp`（`pipx run analytics-mcp`，Python，本機用）
工具：`get_account_summaries`、`get_property_details`、`list_google_ads_links`、`run_report`、`run_funnel_report`、`run_realtime_report`、`get_custom_dimensions_and_metrics`。唯讀。
Cloudflare 上有社群範例 `bighadj22/cloudflare-mcp-google-oauth-analytics`（Google OAuth ＋ GA4，TS）。

### 3.3 Search Console：**沒有官方版**
- `ahonn/mcp-server-gsc`（Node，service account JSON，最多人用，本機）
- `david-wulf/gsc-mcp`（20 個工具：quick wins、內容衰退、CTR 基準、索引 API）
- `eduardmur/gsc-mcp`（`claude mcp add gsc -- npx -y @eduardmur/gsc-mcp`）

三者可共用**同一個 Google Cloud 專案**。

---

## 4. 建議架構（Cloudflare 版）

```
Google Cloud 專案（一個）                     Cloudflare 帳戶
 ├ Google Ads API  ← OAuth refresh token      ┌──────────────────────────────────────────┐
 ├ GA4 Data API    ← service account          │ Worker ① google-sync（Cron Trigger）      │
 └ GSC API         ← service account          │  每日 22:30 UTC（＝台北 06:30）            │
                                              │  1. Ads：REST googleAds:search(GAQL)      │
                                              │     近 7 天 campaign 日成本 → google_ads_daily
                                              │  2. GA4：runReport 日 sessions/purchase   │
                                              │     /revenue by source → ga4_daily        │
                                              │  3. GSC：searchAnalytics/query            │
                                              │     日 clicks/impressions → gsc_daily     │
                                              │  4. 月彙總 upsert → monthly_expenses      │
                                              │     (廣告費用, id='gads-YYYY-MM')         │
                                              │  5. 成功/失敗 → LINE 推播                 │
                                              │  寫入：Supabase REST + service key        │
                                              └──────────────────────────────────────────┘
                                              ┌──────────────────────────────────────────┐
                                              │ Worker ② google-mcp（選配，階段 2）       │
                                              │  Streamable HTTP /mcp                     │
                                              │  Google OAuth 登入＋ALLOWED_EMAILS 白名單 │
                                              │  工具：gaql_search、ga4_report、gsc_query │
                                              │  → claude.ai 自訂連接器（手機/桌面）      │
                                              └──────────────────────────────────────────┘
                                                            ▼
            Supabase（維持唯一真相）→ Vercel 儀表板：ROAS 面板加「Google Ads／官網」欄
                                                 新分頁「數位行銷」
本機 Claude Code（A 線）：掛官方 google-ads-mcp、analytics-mcp、社群 gsc-mcp，臨時查詢用
```

**為什麼 Cloudflare 上要用 REST、不用 Google 的 Node 套件**：`google-ads-api` 走 gRPC，Workers 跑不起來；
REST 端點 `https://googleads.googleapis.com/v21/customers/{id}/googleAds:search` 用 `fetch` 即可。
GA4／GSC 的 service account 簽 JWT 用 Workers 內建 WebCrypto（RS256）就能做，不需套件。

**為什麼資料仍寫 Supabase、不用 Cloudflare D1**：儀表板所有 hook 都讀 Supabase，RLS 與權限也在那裡；
D1 只會多一份要同步的資料。

**Cloudflare 方案限制（會影響設計）**
| 項目 | Free | Paid（US$5/月） |
|---|---|---|
| Cron Trigger 數 | 每帳戶 5 個 | 250 個 |
| 每次執行 CPU 時間 | 10 ms | 30 s |
| Cron 牆鐘時間 | 15 分鐘 | 15 分鐘 |
等待 `fetch()` 回應不算 CPU。但解析幾千列 JSON 再組 upsert，**Free 的 10 ms 很可能超**。
建議：先用 Free 試跑，把 Ads／GA4／GSC 拆成三個 cron 各自輕量執行；若撞 CPU 上限就升 Paid（一個月一杯咖啡）。

---

## 5. 資料模型（新增 Supabase migration）

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
create table google_sync_log (          -- 後台「同步狀態」面板讀這張
  id bigserial primary key, source text, run_at timestamptz default now(),
  rows int, ok boolean, error text
);
```
RLS 比照 `monthly_expenses`：authenticated 可讀，admin/manager 可寫；Worker 用 service key 走 REST
（`POST /rest/v1/google_ads_daily`，header `Prefer: resolution=merge-duplicates` 做 upsert）。
`monthly_expenses` 不改結構，彙總列固定 `id='gads-YYYY-MM'`，重跑即覆蓋。

---

## 6. 介面與設定規劃

### 6.1 儀表板（Vercel，React）
1. **獲利分析 ③ ROAS 監控**：新增「Google Ads／官網」一欄，廣告費來自 `google_ads_daily` 月彙總，
   營收對應官網通路（需確認 `sales_data` 裡官網的通路名稱，見第 9 節）。黃紅燈門檻沿用 5% / 8%。
2. **新分頁「數位行銷」**（或併入老闆視角）：
   - KPI 卡：本月廣告花費、官網營收、ROAS、GA4 轉換率、GSC 曝光
   - 圖：日花費 vs 日官網營收雙軸線；campaign 表（花費／點擊／轉換／CPA）；GSC 前 20 查詢字與週變化
   - 和農曆檔期面板（`LunarPanel`）對齊，看檔期投放效果
3. **後台 > 設定**：「Google 同步狀態」讀 `google_sync_log`（上次同步、筆數、錯誤），沿用 `DatabaseStatusPanel` 風格。

### 6.2 repo 結構（同一個 repo，新增 `workers/` 目錄）
```
workers/
  google-sync/
    wrangler.toml          # [triggers] crons、[vars] 非機密設定
    package.json           # 獨立 devDependencies：wrangler、typescript
    src/index.ts           # scheduled(controller, env, ctx) 依 controller.cron 分流
    src/google-auth.ts     # refresh token 換 access token；service account JWT(RS256)
    src/ads.ts             # GAQL → google_ads_daily
    src/ga4.ts             # runReport → ga4_daily
    src/gsc.ts             # searchAnalytics/query → gsc_daily
    src/supabase.ts        # REST upsert、月彙總、sync_log
    src/line.ts            # 推播（沿用 src/utils/lineMessage.js 的訊息格式）
  google-mcp/              # 階段 2 選配
```
`wrangler.toml` 範例：
```toml
name = "google-sync"
main = "src/index.ts"
compatibility_date = "2026-10-01"
[triggers]
crons = ["30 22 * * *", "40 22 * * *", "50 22 * * *"]   # UTC：Ads / GA4 / GSC 錯開
[vars]
GOOGLE_ADS_CUSTOMER_ID = "1234567890"
GOOGLE_ADS_LOGIN_CUSTOMER_ID = ""        # 在 MCC 底下才填
GA4_PROPERTY_ID = "123456789"
GSC_SITE_URL = "sc-domain:example.com.tw"
SUPABASE_URL = "https://rwmepdmsqtipznzuajkn.supabase.co"
```
機密用 `npx wrangler secret put <NAME>`，**不進 repo**：
`GOOGLE_OAUTH_CLIENT_ID`、`GOOGLE_OAUTH_CLIENT_SECRET`、`GOOGLE_ADS_REFRESH_TOKEN`、
`GOOGLE_SA_JSON`（整份 service account JSON）、`SUPABASE_SERVICE_KEY`、`LINE_CHANNEL_TOKEN`、`LINE_TARGET_ID`。

本機測試：`npx wrangler dev --test-scheduled` 後 `curl "http://localhost:8787/__scheduled?cron=30+22+*+*+*"`。
部署：`cd workers/google-sync && npx wrangler deploy`（之後可加 GitHub Actions 自動部署）。

### 6.3 本機 Claude Code MCP 註冊（A 線，一次性）
```bash
claude mcp add google-ads -e GOOGLE_PROJECT_ID=<id> -e GOOGLE_APPLICATION_CREDENTIALS=<adc.json> \
  -- pipx run --spec "git+https://github.com/googleads/google-ads-mcp.git" google-ads-mcp
claude mcp add analytics -e GOOGLE_PROJECT_ID=<id> -e GOOGLE_APPLICATION_CREDENTIALS=<adc.json> \
  -- pipx run analytics-mcp
claude mcp add gsc -e GOOGLE_APPLICATION_CREDENTIALS=<gsc-sa.json> -- npx -y mcp-server-gsc
```

### 6.4 遠端 MCP（階段 2 選配，Worker ②）
- 用 Cloudflare `agents` 套件的 `createMcpHandler()`（2026-07 起官方建議的無狀態寫法）＋ `workers-oauth-provider`，
  上游用 Google OAuth 登入，`ALLOWED_EMAILS` 白名單只放公司帳號。
- 工具先做三個唯讀：`gaql_search`、`ga4_run_report`、`gsc_query`；寫入（調預算、暫停）先不開。
- 連接方式：claude.ai → 設定 → 連接器 → 自訂連接器 → 貼 `https://google-mcp.<帳戶>.workers.dev/mcp`；
  Claude Code 則 `claude mcp add --transport http google https://google-mcp.<帳戶>.workers.dev/mcp`。
- 建議綁自訂網域，之後搬帳戶 URL 不變。

---

## 7. 一次性設定清單

### Google 端
1. Google Cloud Console 建專案（或沿用既有 GA/GSC 專案）。
2. 啟用 API：Google Ads API、Google Analytics Data API、Google Analytics Admin API、Search Console API。
3. OAuth 同意畫面：Internal（Workspace）或 External；scopes 加 `auth/adwords`、`auth/analytics.readonly`、`auth/webmasters.readonly`。
4. 建 OAuth 用戶端（Web application，redirect 先填 `https://developers.google.com/oauthplayground` 用來換 refresh token；
   階段 2 再加 Worker ② 的 callback URL）。用 OAuth Playground 以**廣告帳戶管理者的 Google 帳號**換一次 refresh token。
5. Cloud Console → Google Ads API Overview → 申請 **Explorer** 等級。
6. 建 service account，下載 JSON；到 GA4 資源「資源存取管理」與 Search Console 把
   `xxx@<project>.iam.gserviceaccount.com` 加為檢視者／使用者。
7. 記下：Ads customer ID、MCC ID（若有）、GA4 property ID、GSC site URL。

### Cloudflare 端
8. 建 Cloudflare 帳戶（Free 即可起步），本機 `npm i -D wrangler`、`npx wrangler login`。
9. `wrangler secret put` 放入第 6.2 的機密；`wrangler deploy`。
10. 在 Cloudflare 後台 Workers → google-sync → Triggers 確認三個 cron；手動 trigger 一次看 `google_sync_log`。

### 驗證順序
先用本機 MCP 跑 `list_accessible_customers` 與一句 GAQL 確認權限 → 再部署 Worker ① dry-run（只寫 log 不寫表）→ 正式啟用。

---

## 8. 風險與必須注意的事

1. **🔴 憑證外洩（現在就該處理）**：`.claude/settings.local.json` 已被 commit 進 git，裡面含 Supabase `service_role` key 明文。
   建議：到 Supabase 重新產生 key、把 `.claude/settings.local.json` 加進 `.gitignore` 並從 git 移除追蹤。
   Worker 的機密一律走 `wrangler secret`，`wrangler.toml` 只放非機密。
2. **費用雙重計算**：Google Ads 花費會同時以「進項發票：網路廣告」進 `monthly_expenses`，再加 Worker 的自動彙總就重複
   （v0.0.140／141 momo 雙重扣費的教訓）。規則建議：自動彙總列存在的月份，發票匯入把 Google 發票標為「已由 API 入帳」跳過；
   或反過來只用發票當會計數、API 數據只做 ROAS 分析不進損益表。**需你決定**。
3. **Workers Free 的 10 ms CPU**：解析大 JSON 會超。對策：三個 cron 拆開、GAQL 只選必要欄位、分頁 `pageSize` 小一點；仍超就升 Paid。
4. **Cron 是 UTC**：台北 06:30 ＝ UTC 22:30 前一天；日期切分要用 Google 帳戶時區（台北）而非 UTC。
5. 金額單位是 micros（除以 1,000,000）；幣別依 Google Ads 帳戶設定。
6. 轉換會延後回填，每日重抓近 7 天（upsert），不要只抓昨天。
7. Explorer 每日 2,880 次操作，日同步三個 API 各幾次綽綽有餘；本機 MCP 問答也算在內，正常使用不會爆。
8. Refresh token 綁個人 Google 帳號；該帳號改密碼、被移出廣告帳戶或 6 個月未用（External 測試模式）會失效，
   Worker 失敗時一定要 LINE 通知。建議 OAuth 同意畫面設為「正式發布」避免 7 天過期。
9. 遠端 MCP（Worker ②）等於把廣告資料開一個公網入口，白名單與 OAuth 不能省；第一版只做唯讀。

---

## 9. 需要你決定的問題

1. 官網（自營電商）在 `sales_data` 裡的通路名稱是什麼？ROAS 要用哪些通路的營收對 Google Ads 花費？
2. 第 8-2 的雙重計算規則，選哪一種？
3. Cloudflare 帳戶：已經有了嗎？用哪個 email？先 Free 試跑可以嗎？
4. Google Ads 帳戶是否在 MCC 底下？GA4 與 GSC 目前是用哪個 Google 帳號／Cloud 專案串的？
5. 遠端 MCP（手機上用 claude.ai 問廣告數據）要不要做？要的話排階段 2。
6. Meta Ads 要不要同一批做（連接器已掛，只差授權）？

---

## 10. 分階段實作（估時）

| 階段 | 內容 | 估時 |
|---|---|---|
| 0 | 第 8-1 憑證處理、Google Cloud 與 Cloudflare 設定（第 7 節） | 半天（多為等 Google 審核 Explorer） |
| 1 | 本機 A 線：三個 MCP 掛進 Claude Code，驗證查得到；寫 3～5 個常用 GAQL／GA4 範本進 `KnowledgeBase` | 半天 |
| 2 | Worker ① google-sync：migration ＋ Ads 同步 ＋ sync_log ＋ LINE 通知 ＋ wrangler 部署 | 1 天 |
| 3 | 儀表板：ROAS 面板加 Google Ads 欄、後台同步狀態 | 半天 |
| 4 | Worker ① 加 GA4、GSC；「數位行銷」分頁 | 1～1.5 天 |
| 5 | 週報 LINE 推播加廣告段落（`weekly-alert.mjs` 或改搬進 Worker） | 半天 |
| 6（選配） | Worker ② 遠端 MCP：OAuth、白名單、三個唯讀工具、claude.ai 連接器 | 1 天 |

---

## 參考來源
- 官方 Google Ads MCP：https://github.com/googleads/google-ads-mcp
- 官方 GA4 MCP：https://github.com/googleanalytics/google-analytics-mcp
- Cloudflare Worker 版 Google Ads MCP（REST v25、plan/apply）：https://github.com/ivanfc/MyContentGoogleMCP
- Cloudflare Worker 版 GA4 MCP：https://mcpservers.org/servers/bighadj22/cloudflare-mcp-google-oauth-analytics
- GSC 社群 MCP：https://github.com/ahonn/mcp-server-gsc 、https://github.com/david-wulf/gsc-mcp 、https://github.com/eduardmur/gsc-mcp
- 2026 存取等級／token 退場：https://developers.google.com/google-ads/api/docs/api-policy/access-levels 、
  https://paidmediacollective.com/newsfeed/google-ads-api-cloud-project-access-2026 、
  https://ppc.land/google-drops-developer-tokens-from-ads-api-access-decisions/
- Cloudflare Cron Triggers 與限制：https://cronuru.com/guides/cloudflare-workers-cron-triggers 、
  https://www.hesham.us/cloudflare-field-manual/cloudflare-workers-limits-cpu-time-not-wall-time
- 把 MCP 部署成 Claude 連接器（Cloudflare）：https://sunpeak.ai/blogs/deploying-claude-connectors/ 、
  https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- 方案比較：https://www.adspirer.com/blog/google-ads-mcp 、https://www.get-ryze.ai/blog/best-mcp-for-google-ads
