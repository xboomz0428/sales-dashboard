/**
 * monthly-report.mjs — 每月經營月報自動推送 LINE
 * ─────────────────────────────────────────────────────────────────────────────
 * 用 Windows 工作排程器每月 1 號跑（同 lc-sync 那台電腦即可）。流程：
 *   讀 Supabase sales_data（上月 + 對比期間）→ 組月報 → (選配) Gemini AI 摘要
 *   → 用「LINE 通知面板」設定的 token 推送（面板已自動同步到 dashboard_settings 表）
 *
 * .env 需求：VITE_SUPABASE_URL、VITE_SUPABASE_SERVICE_KEY
 * 選配：GEMINI_API_KEY（有填才附 AI 摘要）；LINE_CHANNEL_TOKEN / LINE_TARGET_ID（覆寫面板設定）
 * 測試：node scripts/monthly-report.mjs --dry-run   # 只印訊息，不發送
 */
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { formatMonthlyReport } from '../src/utils/lineMessage.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv() {
  const p = resolve(ROOT, '.env'); if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const i = t.indexOf('='); if (i < 1) continue
    const k = t.slice(0, i).trim(); if (process.env[k] == null) process.env[k] = t.slice(i + 1).trim()
  }
}
loadEnv()

const dryRun = process.argv.includes('--dry-run')
const URL = process.env.VITE_SUPABASE_URL, KEY = process.env.VITE_SUPABASE_SERVICE_KEY
if (!URL || !KEY) { console.error('❌ .env 缺少 VITE_SUPABASE_URL / VITE_SUPABASE_SERVICE_KEY'); process.exit(1) }
const supabase = createClient(URL, KEY, { auth: { persistSession: false } })

// ── 抓需要的期間資料（上月、上上月、去年同月、本年+去年累計）────────────────
const pad = n => String(n).padStart(2, '0')
const now = new Date()
const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
const y = prev.getFullYear(), m = prev.getMonth() + 1
const months = [
  `${y}-${pad(m)}`,                                  // 上月（目標月）
  m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`,    // 上上月
  `${y - 1}-${pad(m)}`,                              // 去年同月
]

async function fetchRows(filter) {
  const all = []
  for (let from = 0; ; from += 1000) {
    let q = supabase.from('sales_data')
      .select('date,year_month,year,subtotal,quantity,brand,product,customer')
      .range(from, from + 999)
    q = filter(q)
    const { data, error } = await q
    if (error) throw error
    all.push(...data)
    if (data.length < 1000) break
  }
  return all
}

console.log(`📆 目標月份：${months[0]}`)
// 一次撈「本年 + 去年、且 <= 目標月」的所有列：
// 已同時涵蓋 目標月、上上月、去年同月、兩年累計，每一筆只出現一次（不需去重）。
const raw = await fetchRows(q => q.in('year', [String(y), String(y - 1)]).lte('year_month', `${y}-${pad(m)}`))
if (!raw.length) { console.error('❌ 目標期間查無資料'); process.exit(1) }
const rows = raw.map(r => ({ ...r, yearMonth: r.year_month }))
console.log(`   取得 ${rows.length.toLocaleString()} 筆（${String(y - 1)}~${y} 年 ≤ ${months[0]}）`)

// 成本（毛利用）
let costs = {}
try {
  const { data } = await supabase.from('user_costs').select('costs').limit(1)
  costs = data?.[0]?.costs || {}
} catch { /* 無成本則月報不含毛利 */ }

let message = formatMonthlyReport({ allRows: rows, costs })
console.log('\n===== 月報內容 =====\n' + message + '\n====================')

// ── (選配) Gemini AI 摘要 ───────────────────────────────────────────────────
const GKEY = process.env.GEMINI_API_KEY
if (GKEY) {
  try {
    const prompt = `你是威斯邁國際（台灣母嬰多品牌經銷商）的經營顧問。以下是本月經營月報數據，請用繁體中文寫「AI 洞察」：3 個重點觀察 + 1 個風險提醒 + 1 個下月具體行動建議。總長 ≤400 字、純文字（會發送到 LINE，禁用 markdown 符號與表格）、每點一行以「•」開頭、數字要引用月報內的實際數據。\n\n${message}`
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GKEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 1024 } }),
    })
    if (res.ok) {
      const data = await res.json()
      const ai = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
      if (ai) { message = `${message}\n\n🤖 AI 洞察\n${'─'.repeat(22)}\n${ai}`.slice(0, 4900); console.log('✅ 已附加 AI 摘要') }
    } else console.warn('⚠️ Gemini 呼叫失敗（' + res.status + '），改發純統計版')
  } catch (e) { console.warn('⚠️ AI 摘要失敗：' + e.message + '，改發純統計版') }
} else console.log('ℹ️ 未設定 GEMINI_API_KEY，發送純統計版月報')

// ── 取 LINE 設定（.env 覆寫 > 面板同步的 dashboard_settings）────────────────
let token = process.env.LINE_CHANNEL_TOKEN, target = process.env.LINE_TARGET_ID
if (!token || !target) {
  const { data } = await supabase.from('dashboard_settings').select('key,value').in('key', ['line_channel_token', 'line_target_id'])
  const map = Object.fromEntries((data || []).map(r => [r.key, r.value]))
  token  ||= map.line_channel_token
  target ||= map.line_target_id
}
if (!token || !target) {
  console.error('❌ 找不到 LINE 設定：請在儀表板「LINE 通知」頁填好 Token 與對象 ID（會自動同步），或在 .env 設 LINE_CHANNEL_TOKEN / LINE_TARGET_ID')
  process.exit(1)
}

if (dryRun) { console.log('🔍 --dry-run：未發送'); process.exit(0) }

const res = await fetch('https://api.line.me/v2/bot/message/push', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ to: target, messages: [{ type: 'text', text: message }] }),
})
if (!res.ok) { console.error(`❌ LINE 發送失敗（${res.status}）：` + await res.text()); process.exit(1) }
console.log('🎉 月報已推送到 LINE')
