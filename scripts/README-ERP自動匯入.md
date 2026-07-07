# ERP 自動匯入設定說明

## 這是什麼

`scripts/erp-import.mjs` 會讀取 ERP 匯出的 `.xls`，用**跟儀表板完全相同的解析邏輯**寫入 Supabase `sales_data` 表。寫入採「先插新批次 → 驗證筆數 → 才刪舊資料」的安全順序，中途失敗會自動還原，不會留下半套資料。

使用者下次開啟儀表板時會自動偵測資料變動並更新（本地快取戳記比對）。

## 手動執行

```bat
:: 預設 NAS 路徑（見 erp-import.bat 內設定）
erp-import.bat

:: 指定檔案
erp-import.bat "\\Wsm_nas\雲端共用硬碟\ERP備份\銷售數據\20180101_20251231.xls"

:: 只驗證解析結果，不寫入（第一次建議先跑這個看數字對不對）
node scripts\erp-import.mjs "<路徑>" --dry-run

:: 匯入完整歷史檔（清空整表重灌，檔案日期範圍有重疊時用這個）
erp-import.bat "<路徑>" --replace-all
```

## ⚠️ 重要：--replace-all 什麼時候用

- **不帶** `--replace-all`：只取代「同檔名」的舊資料，其他檔案的資料保留。
  適合固定檔名、固定切割（例如歷史檔 + 當年檔）的流程。
- **帶** `--replace-all`：清空整表後只留這次匯入。
  適合「每次都從 ERP 匯出完整歷史」的流程。
- 如果新檔的日期範圍跟既有其他檔案**重疊**，不帶 `--replace-all` 會造成重複計算——不確定就用 `--replace-all` 配完整歷史檔，最不會出錯。

## 設定每日自動執行（Windows 工作排程器）

1. 開始 → 搜尋「工作排程器」（Task Scheduler）→ 開啟
2. 右側「建立基本工作」
   - 名稱：`ERP銷售資料匯入`
   - 觸發程序：每天（建議凌晨，例如 06:00，ERP 備份完成後）
   - 動作：啟動程式
     - 程式：`C:\Users\Username\sales-dashboard\erp-import.bat`（依實際 repo 位置調整）
     - 「開始位置」填 repo 目錄
3. 完成後，右鍵該工作 →「執行」測試一次，確認主控台輸出 `🎉 完成`

## 前置需求

- 這台電腦要能連到 NAS（`\\Wsm_nas\...`）
- repo 根目錄的 `.env` 要有 `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_SERVICE_KEY`
- 已 `npm install`（腳本用到 repo 內的 xlsx 與 supabase-js）
