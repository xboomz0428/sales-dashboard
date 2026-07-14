-- 大量匯入（14 萬列的刪舊/驗證）會超過預設 8 秒 statement_timeout 造成上傳失敗，
-- 放寬已登入角色的單一語句上限至 120 秒（僅影響 authenticated，anon 維持預設）。
alter role authenticated set statement_timeout = '120s';
