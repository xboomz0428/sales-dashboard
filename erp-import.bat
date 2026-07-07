@echo off
rem ERP 銷售資料自動匯入（給 Windows 工作排程器用）
rem 用法：erp-import.bat [xls路徑] [--replace-all]
rem 未帶路徑時使用下面的預設 NAS 路徑
cd /d %~dp0
set "DEFAULT_FILE=\\Wsm_nas\雲端共用硬碟\ERP備份\銷售數據\20180101_20251231.xls"
if "%~1"=="" (
  node scripts\erp-import.mjs "%DEFAULT_FILE%"
) else (
  node scripts\erp-import.mjs %*
)
if errorlevel 1 (
  echo.
  echo 匯入失敗，請檢查上方錯誤訊息
  exit /b 1
)
