# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概要

銷售數據分析儀表板（繁體中文 UI）。React 18 + Vite + Tailwind + Recharts 的純前端 SPA，
部署在 Vercel；資料與登入在 Supabase（專案 ref `rwmepdmsqtipznzuajkn`）。
資料來源是公司 ERP（LC，MariaDB）匯出的銷售 Excel，加上財政部進項發票、momo／蝦皮對帳單。
程式註解、commit、CHANGELOG 全用繁體中文；新寫的東西比照。

## 常用指令

```bash
npm run dev            # Vite 開發伺服器 http://localhost:5173
npm run build          # 產出 dist/
npm run test:run       # vitest 一次跑完；npm test 為 watch 模式；npm run test:ui 開 UI
npx vitest run src/tests/unit/dateUtils.test.js        # 跑單一測試檔
npx vitest run -t "關鍵字"                              # 依測試名稱篩選
npm run deploy         # = node deploy.js（見下方「版本與部署流程」）
npx supabase db push --include-all                      # 推 supabase/migrations（db-push.bat 會先 link）
```

- vitest、jsdom、@testing-library/* **不在** package.json 的 devDependencies；第一次跑測試要先
  `npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event`
  （TEST_PLAN.md 有說明）。測試設定在 `vite.config.js` 的 `test` 區塊，setup 檔 `src/tests/setup.js`。
- 沒有 lint／format 設定（無 ESLint、Prettier）。
- `.env` 由 `.env.example` 複製；`VITE_SUPABASE_URL`／`VITE_SUPABASE_ANON_KEY` 未填時整個 app 進「示範模式」
  （`supabaseReady=false`，AuthContext 用 `admin@demo.com` 等假帳號、資料走 localStorage）。
- 根目錄的 `*.bat` 是給 Windows 工作排程器／老闆雙擊用的包裝，不要刪。

## 版本與部署流程（重要慣例）

`deploy.js` 是唯一的正式發版路徑：`git pull --rebase` → `npm version patch`（不打 tag）→
`git commit -m "v0.0.NNN: 說明"` → push → Vercel 自動部署。所以：

- **版本號 = `package.json.version`**，`ChangelogModal.jsx` 直接讀它顯示；不要手改。
- 每個功能版本要在 `CHANGELOG.md` 最上方加一段 `## v0.0.NNN（YYYY-MM-DD）— emoji 標題`，條列說明，
  app 內的「更新日誌」Modal 讀這個檔。
- commit 訊息格式沿用 `v0.0.NNN 描述`（git log 可見），非發版的 commit 用一般描述即可。
- 不要用 `git push --force`；`deploy.js` 假設 main 是線性歷史。

## 架構

### 資料流（讀多檔才看得出來的部分）

1. **Excel 解析只有一份邏輯**：`src/utils/excelCore.js`（`FIELD_MAP` 中文欄名對應、`parseBuffer`）。
   前端 `dataProcessor.js` 優先丟進 Web Worker（`excelWorker.js`）跑它，失敗退回主執行緒；
   後端腳本 `scripts/erp-import.mjs` 也直接 import 它，保證手動上傳與排程匯入結果一致。
   改欄位對應或 `_key` 去重規則時，兩邊同時受影響。
2. **銷售資料的真相在 Supabase `sales_data`**，Storage bucket `sales-files` 只是 Excel 備份。
   `useCloudData.js` 載入順序：IndexedDB 快取（`salesCache.js`）→ 比對 DB 戳記（筆數＋最大 id）→
   不一致才呼叫 RPC `get_sales_compact2`（陣列壓縮格式，前端重建欄位與 `_key`）→ 舊版分頁 fallback。
   改 `sales_data` 欄位時要同步改 RPC（migration）、`rowToDb`／壓縮解碼、以及 `erp-import.mjs`。
3. **篩選與衍生指標**集中在 `hooks/useSalesData.js`（`filtered`、活躍產品＝近兩年有銷售、各種聚合），
   所有分析分頁都吃它的輸出；`App.jsx`（1500 行）負責 Tab 路由、頂欄、把 hook 結果派給面板。
4. **費用／發票／開票主體**走 `hooks/useBusinessData.js`：state 形狀是 `{ 'YYYY-MM': [items] }`，
   存檔時同步 localStorage，再以「月份為單位先刪後插」寫 Supabase（`monthly_expenses`、`invoice_records`、`billing_entities`）。
   匯入解析器在 `utils/invoiceImport.js`（進項發票）、`utils/momoStatement.js`、`utils/shopeeStatement.js`。
5. **獲利口徑**（`charts/ProfitAnalysisPanel.jsx`、`utils/opMargin.js`）：
   通路直接費用靠 `monthly_expenses.label` 關鍵字歸戶（momo／蝦皮／日藥本舖），其餘算共同費用；
   momo／蝦皮銷售額已是平台扣費後淨額，哪些發票要略過有歷史決策（CHANGELOG v0.0.140～141），改費用規則前先讀。

### 權限

`contexts/AuthContext.jsx`：角色 `admin`／`manager`／`viewer`，來自 `user_roles` 表；
可見分頁由 `role_permissions.allowed_tabs` 控制（DB 沒設定時用 `ROLE_TABS_DEFAULT`），`backup/tools/users/database` 固定只給 admin。
DB 端用 `get_my_role()` 寫 RLS（讀：authenticated；寫：admin/manager）。新增表時照 `supabase/migrations/20260406000000_business_data.sql` 的 policy 樣板。
`supabaseAdmin`（service key）只用於前端 admin 管理使用者與 Storage 讀取，一般功能走 anon client。

### Supabase

- migrations 在 `supabase/migrations/`，檔名 `YYYYMMDDnnnnnn_描述.sql`；`supabase/functions/line-push` 目前仍是範本未實作。
- 主要表：`sales_data`、`user_costs`（商品成本）、`monthly_expenses`、`invoice_records`、`billing_entities`、
  `dashboard_settings`（LINE token 等面板設定，腳本也讀）、`kb_faqs`、`forecast_records`、`data_backups`、`dashboard_audit_log`。
- `ai_sql` 函式是唯讀 text-to-SQL 入口（`utils/textToSql.js`、`AIAnalysis.jsx`）。

### 排程腳本（`scripts/`，在 ERP 主機 Windows 工作排程器跑）

都用同一套 `loadEnv()` 讀根目錄 `.env`，需要 `VITE_SUPABASE_SERVICE_KEY`，都支援 `--dry-run`：
`erp-import.mjs`（銷售匯入，`--replace-all` 語意見 `scripts/README-ERP自動匯入.md`）、`import-costs.mjs`（只補缺不覆蓋）、
`monthly-report.mjs`／`weekly-alert.mjs`（LINE 推播）、`lc-inspect.mjs`（唯讀探查 MariaDB）。
新腳本照這個樣板寫，並附對應 `.bat`。

## 其他注意

- 根目錄有兩個 80MB+ 的 PDF 與一個 11MB 的 xls 是老闆的參考資料，不要動也不要 grep 進去。
- `docs/` 放企劃與規劃文件（含 Google Ads／GA4／GSC 串接規劃），`AI_data/` 是 dev server 的 `/api/save-analysis` 存檔處。
- 中文品牌／通路名稱是資料的一部分（例如 `'momo'`、`'蝦皮'`、`'日藥本舖'`、`'廣告費用'`），在程式裡當常數用是刻意的。
