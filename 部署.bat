@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ================================
echo   Sales Dashboard 部署工具
echo ================================
echo.
npm run deploy
echo.
pause
