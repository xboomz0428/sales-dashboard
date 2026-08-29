@echo off
cd /d "%~dp0.."
node scripts\weekly-alert.mjs >> weekly-alert.log 2>&1
