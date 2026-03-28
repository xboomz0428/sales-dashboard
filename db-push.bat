@echo off
echo ========================================
echo  推送 DB migration 到 Supabase
echo ========================================
cd /d "%~dp0"
npx supabase link --project-ref rwmepdmsqtipznzuajkn
npx supabase db push --include-all
echo.
echo 完成！如需設定管理員角色，請至：
echo Supabase Console ^> Authentication ^> Users
echo 複製 UUID 後在 SQL Editor 執行：
echo update public.user_roles set role = 'admin' where id = 'your-uuid';
pause
