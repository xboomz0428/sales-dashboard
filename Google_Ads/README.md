# 好漢草 Google Ads 工具（獨立新程式）

全 Cloudflare：網站 Pages、API 與排程 Workers、資料庫 D1、token 存 KV、登入 Cloudflare Access。
**不整合進銷售儀表板**，只用唯讀角色每天抓儀表板（Supabase）的好漢草彙總數字。

- 規劃書：`docs/規劃書.md`（圖文版 https://claude.ai/artifact/M65RBTe7BaJeM6BtWSVRcw ）
- 介面畫布（桌機 3 張、手機 5 張）：https://claude.ai/artifact/6nSuvLeNRpDvKPT84jjiN7 ；原始檔 `docs/design/*.dc.html`
- 全年行事曆清單：`docs/行事曆_全年清單_2026.md`、`docs/行事曆_全年清單_2027.md`（`npm run calendar:list -- 2027`）

## 目錄

```
shared/      前後端共用純函式（calendar 行事曆、compliance 合規、settings 設定定義、ai 企劃卡 prompt、llm 解析）
worker/      Cloudflare Worker：wrangler.toml、schema.sql（D1）、src/*.ts
  src/google.ts     OAuth、GAQL、Keyword Planner、活動成效、搜尋字詞（可直接用）
  src/sources.ts    GSC、GA4、Trends CSV、四來源關鍵字判斷 judgeKeyword
  src/budget.ts     上線後每日觀察、預算自動優化（suggest / auto / off）
  src/launch.ts     企劃卡 → Google Ads mutate（plan / validateOnly / apply）、上線前串接檢查
  src/seo-plan.ts   關鍵字池 × 行事曆 → SEO 文章／活動規劃表
  src/weather.ts    中央氣象署一週預報
  src/index.ts、auth.ts、ads-sync.ts、supabase.ts  從儀表板分支搬來的舊版（寫 Supabase），改 Hono + D1 時當樣板
web/         React 18 + Vite + Tailwind 前端（依 docs/design 畫布實作，尚未開始）
scripts/     calendar-list.mjs（全年清單）、calendar-check.mjs（日期自我檢查）
docs/        規劃書、全年清單、設計原始檔、參考截圖
```

## 帳號（不含任何金鑰）

| 項目 | 值 |
|---|---|
| Google Ads 客戶 ID | 601-940-4710（威斯邁） |
| GA4 資源 | 354485202（好漢草QDM_GA4） |
| Search Console | https://www.heroherb.co/ |
| Merchant Center | 好漢草漢方(QDM) |

金鑰一律 `npx wrangler secret put`（見 `.env.example` 的名單），不進 repo。

## 開始

```bash
npm install
npm run calendar:check          # 行事曆關鍵日期自我檢查（14 項）
npm run calendar:list -- 2026   # 產生全年清單 Markdown
cd worker && npx wrangler d1 create heroherb-ads && npx wrangler d1 execute heroherb-ads --file=schema.sql
```
