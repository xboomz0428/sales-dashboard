# LC(ERP) 自動匯入 — 在 ERP 主機上設定

因為 ERP 的 MariaDB 只開放本機連線，最穩的做法是**把自動匯入跑在 ERP 主機 `WESMILE_S1-PC` 上**（用 `localhost` 連 DB，天生有權限，不必改資料庫授權）。

## 一、一次性安裝（在 WESMILE_S1-PC 上）

1. 安裝 **Node.js LTS**：https://nodejs.org
2. 取得本專案到該機（擇一）：
   - `git clone https://github.com/xboomz0428/sales-dashboard.git`，或
   - 直接把整個 repo 資料夾複製過去
3. 在 repo 目錄開 PowerShell 或 CMD，執行：`npm install`
4. 複製 `.env.example` 為 `.env`，填入：
   - `LC_DB_HOST=localhost`、`LC_DB_USER` / `LC_DB_PASS`（ERP 的**資料庫**帳密）、`LC_DB_NAME=lcdata`
   - `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_SERVICE_KEY`（寫入儀表板資料庫用，跟你開發機那份 `.env` 一樣）

## 二、探查結構（第一次，給我看 schema）

```
node scripts/lc-inspect.mjs > lc-schema.txt
```
把 `lc-schema.txt` 內容貼回對話。我會據此寫好 `scripts/lc-import.mjs`（唯讀查 `lcdata` → 冪等寫入 `sales_data`，比照現有 `erp-import.mjs` 的「插新→驗證→刪舊」安全順序）。

## 三、之後每天自動匯入（工作排程器）

`lc-import.mjs` 完成後：
1. 開「工作排程器」→「建立基本工作」
2. 名稱 `LC銷售自動匯入`；觸發：每天（建議 ERP 日結後，如 06:30）
3. 動作：啟動程式 → 程式填 `node`、引數填 `scripts\lc-import.mjs`、「開始位置」填 repo 目錄
4. 右鍵該工作 →「執行」測試一次，看到 `🎉 完成` 即可

> 全程唯讀查 ERP、只寫入 Supabase 的 `sales_data`；不會改動 ERP 任何資料。
