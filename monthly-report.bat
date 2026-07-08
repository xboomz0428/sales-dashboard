@echo off
rem 每月經營月報推送 LINE（給 Windows 工作排程器：每月 1 日 09:00 執行）
rem 需要 .env：VITE_SUPABASE_URL、VITE_SUPABASE_SERVICE_KEY；選配 GEMINI_API_KEY（附 AI 摘要）
rem LINE 設定自動讀取儀表板「LINE 通知」頁同步到資料庫的 Token/對象 ID
chcp 65001 >nul
cd /d %~dp0
node scripts\monthly-report.mjs %*
if errorlevel 1 (
  echo.
  echo ❌ 月報發送失敗，請看上方訊息
  exit /b 1
)
