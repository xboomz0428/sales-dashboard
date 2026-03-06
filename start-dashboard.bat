@echo off
title Sales Dashboard
cd /d "%~dp0"
echo Starting Sales Dashboard server...
start "Sales Dashboard Server" cmd /k "npm run dev"
echo Waiting for server to start...
timeout /t 4 /nobreak >nul
start "" "http://localhost:5173"
echo Browser opened. Close the server window to stop.
