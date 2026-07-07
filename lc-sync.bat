@echo off
rem LC 半自動同步：把 LCTool 匯出到 NAS 資料夾的「最新 xls」匯入儀表板資料庫
rem 在「有 Node 的電腦」上跑（例如你的開發機）。可手動雙擊，或用工作排程器定時跑。
rem 需要 repo 根的 .env：VITE_SUPABASE_URL、VITE_SUPABASE_SERVICE_KEY
chcp 65001 >nul
cd /d %~dp0

rem ↓↓↓ 改成你 LCTool 實際匯出到的資料夾 ↓↓↓
set "FOLDER=\\Wsm_nas\雲端共用硬碟\ERP備份\銷售數據"

echo 從資料夾匯入最新 xls：%FOLDER%
node scripts\erp-import.mjs "%FOLDER%" --replace-all
if errorlevel 1 (
  echo.
  echo ❌ 匯入失敗，請看上方訊息
  exit /b 1
)
echo ✅ 完成。使用者重新整理儀表板即可看到最新資料。
