# google-sync Worker（Cloudflare）

好漢草行銷迴圈的排程程式。第一階段只做「氣象預報 → 天氣觸發 → 警示＋LINE」；Google Ads／GA4／GSC 同步為第二階段。

## 一次性設定

```bash
cd workers/google-sync
npm install
npx wrangler login                         # 用老闆的 Cloudflare 帳號

# 機密（不進 repo）
npx wrangler secret put SUPABASE_SERVICE_KEY   # Supabase 專案的 service_role key（換新後的）
npx wrangler secret put CWA_API_KEY            # 中央氣象署開放資料平臺 → 會員 → 取得授權碼（免費）
npx wrangler secret put RUN_TOKEN              # 任意長字串，手動觸發 /run/weather 用
# 選配（不填就讀 dashboard_settings 裡 LINE 通知頁同步的 token）
npx wrangler secret put LINE_CHANNEL_TOKEN
npx wrangler secret put LINE_TARGET_ID

npx wrangler deploy
```

## 本機測試

```bash
npm run dev
curl "http://localhost:8787/__scheduled?cron=0+21+*+*+*"
```

## 部署後驗證

1. Cloudflare 後台 → Workers → google-sync → Triggers 看到兩個 cron。
2. `curl -H "x-run-token: <RUN_TOKEN>" https://google-sync.<帳戶>.workers.dev/run/weather`
3. 儀表板「行銷作戰室 → 總覽」的天氣卡出現三個縣市的預報；`google_sync_log` 有 `weather` 一列。
4. 若解析到的欄位是空的，`npm run tail` 看 log，調整 `src/weather.ts` 的 `pickElement`。

## 所有門檻都在儀表板「行銷作戰室 → 設定」改

Worker 每次執行都讀 `marketing_settings`，改完下次執行即生效，不用重新部署。
