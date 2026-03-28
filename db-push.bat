@echo off
cd /d "%~dp0"
echo Linking Supabase project...
npx supabase link --project-ref rwmepdmsqtipznzuajkn
echo Pushing DB migrations...
npx supabase db push --include-all
echo Done.
pause
