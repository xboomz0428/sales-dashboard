import { supabase } from '../config/supabase'

/**
 * textToSql.js — AI 問答的「🔍 直查明細」模式
 * 流程：問題 → Gemini 產生 SELECT SQL → 資料庫守門函式 ai_sql() 執行
 * （守門端：僅 SELECT / 唯讀交易 / 降權角色只能讀 sales_data / 8 秒逾時 / 強制 LIMIT 200）
 * → 查詢結果交回 AI 據實回答。SQL 全程透明顯示於對話泡泡。
 */

export const SQL_SCHEMA_DOC = `PostgreSQL 資料表 public.sales_data（銷售明細，2018 年至今，14.8 萬筆）：
- date text 'YYYY-MM-DD'（訂單日期）
- year_month text 'YYYY-MM'、year text 'YYYY'、month text 'MM'（01~12）
- channel text（通路名稱）、channel_type text（通路類型：網路經銷/實體經銷/百貨正櫃/網路自營/網路團購/單檔團購/一般終端/公司饋贈/其他）
- brand text（品牌，如 好漢草/HUGGER/2angels/Milton/BAILEY…）
- product text（品名）、order_id text（單號）、customer text（客戶名稱）
- quantity numeric（數量）、subtotal numeric（★金額請一律用 subtotal 加總；total 是訂單層級重複值，加總會灌水，禁止 sum(total)）

規則：
1. 只能輸出一句 SELECT（可用 WITH），只能查 sales_data，不得使用分號、註解、$ 符號。
2. 文字比對用 ilike '%關鍵字%'（品牌/產品/客戶名常有前後綴）。
3. 聚合請 round() 金額；結果請 order by 並自帶 limit（≤200，系統也會強制上限）。
4. 日期／年份欄位是文字：year='2025'、year_month between '2025-01' and '2025-08'。
5. 只輸出 SQL 本體，不要解釋文字。`

function extractSql(text) {
  const fence = text.match(/```(?:sql)?\s*([\s\S]*?)```/i)
  const raw = (fence ? fence[1] : text).trim()
  return raw.replace(/;\s*$/, '')
}

/** 讓 Gemini 依問題產生 SQL；retryFeedback 是上次執行的錯誤訊息（帶回去修正） */
export async function generateSql({ apiKey, model, question, retryFeedback = null, prevSql = null }) {
  const prompt = [
    SQL_SCHEMA_DOC,
    '',
    `使用者的問題：${question}`,
    retryFeedback ? `\n你上次產生的 SQL：\n${prevSql}\n執行失敗，錯誤：${retryFeedback}\n請修正後重新輸出 SQL。` : '',
  ].join('\n')
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1 } }),
    })
  if (!res.ok) throw new Error(`SQL 產生失敗（${res.status}）`)
  const j = await res.json()
  const text = j?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || ''
  const sql = extractSql(text)
  if (!/^\s*(select|with)\b/i.test(sql)) throw new Error('AI 未產生有效的 SELECT 查詢')
  return sql
}

/** 經守門函式執行；回 { rows } 或丟出錯誤 */
export async function runAiSql(sql) {
  const { data, error } = await supabase.rpc('ai_sql', { q: sql })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data?.rows || []
}

/** 完整流程：產生 → 執行 →（失敗回饋重試一次）；回 { sql, rows } */
export async function deepQuery({ apiKey, model, question }) {
  let sql = await generateSql({ apiKey, model, question })
  try {
    return { sql, rows: await runAiSql(sql) }
  } catch (e1) {
    const sql2 = await generateSql({ apiKey, model, question, retryFeedback: e1.message, prevSql: sql })
    return { sql: sql2, rows: await runAiSql(sql2) }
  }
}
