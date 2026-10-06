# google-sync Worker（Cloudflare）

好漢草行銷迴圈的排程與 Google Ads 橋接程式。儀表板「行銷作戰室 → Google 廣告」透過它讀 Google Ads：
帳號清單、活動成效、搜尋字詞、關鍵字建議（Keyword Planner）。身分驗證直接用儀表板的 Supabase 登入，不另設密碼。

## 一次性設定（約 30 分鐘）

### 1. Google Cloud
1. https://console.cloud.google.com 建專案（或沿用 GA4 的專案）→ API 與服務 → 啟用「Google Ads API」。
2. OAuth 同意畫面：外部，加 scope `https://www.googleapis.com/auth/adwords`，發布為「正式」（避免 7 天過期）。
3. 憑證 → 建立 OAuth 用戶端 ID → 類型「網頁應用程式」→ 已授權的重新導向 URI 填
   `https://google-sync.<你的帳戶>.workers.dev/auth/callback`（部署後把實際網址填回來）。
4. Google Ads API 總覽頁申請存取等級：**Explorer** 可讀報表；**關鍵字建議需要 Basic**（需品牌驗證）。

### 2. Cloudflare
```bash
cd workers/google-sync
npm install
npx wrangler login
npx wrangler kv namespace create TOKENS        # 把回傳的 id 填進 wrangler.toml 的 [[kv_namespaces]]

npx wrangler secret put SUPABASE_SERVICE_KEY   # Supabase service_role key（換新後的）
npx wrangler secret put CWA_API_KEY            # 中央氣象署開放資料平臺授權碼（免費）
npx wrangler secret put GOOGLE_OAUTH_CLIENT_ID
npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
npx wrangler secret put RUN_TOKEN              # 任意長字串，手動觸發用
# 選配
npx wrangler secret put GOOGLE_ADS_DEVELOPER_TOKEN   # 2026-09 後非必要
npx wrangler secret put LINE_CHANNEL_TOKEN
npx wrangler secret put LINE_TARGET_ID

npx wrangler deploy
```
部署後把 `https://google-sync.<帳戶>.workers.dev` 填到儀表板「行銷作戰室 → 設定 → Google 廣告 → Worker 網址」。

### 3. 連結帳號（在儀表板操作）
行銷作戰室 → Google 廣告 → 「連結 Google Ads」→ 用管理廣告帳戶的 Google 帳號同意 → 自動回到儀表板
→ 從帳號清單選客戶 ID → 儲存。之後成效與關鍵字建議就會直接顯示。

## 本機測試
```bash
npm run dev
curl "http://localhost:8787/__scheduled?cron=0+21+*+*+*"
```

## 部署後驗證
1. `curl https://google-sync.<帳戶>.workers.dev/health` → `{"ok":true,"connected":false}`
2. 儀表板連結帳號後 `connected` 變 true，Google 廣告頁能列出帳號。
3. 隔天 `google_sync_log` 有 `weather` 與 `google_ads` 各一列。

## 所有門檻都在儀表板「行銷作戰室 → 設定」改
Worker 每次執行都讀 `marketing_settings`，改完下次執行即生效。
