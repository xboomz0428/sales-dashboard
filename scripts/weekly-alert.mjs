/**
 * weekly-alert.mjs — 每週「需行動清單」自動推送 LINE
 * ─────────────────────────────────────────────────────────────────────────────
 * 用 Windows 工作排程器每週一 09:00 跑（與 lc-sync / monthly-report 同一台電腦）。
 * 內容：①上週業績 vs 前週/去年同週 ②回購逾期客戶 Top 10（該拜訪誰）
 *       ③品牌週變化警示 ④未來三週民俗檔期備貨提醒（農曆對應）
 *
 * .env 需求：VITE_SUPABASE_URL、VITE_SUPABASE_SERVICE_KEY
 * 選配：LINE_CHANNEL_TOKEN / LINE_TARGET_ID（覆寫面板設定）
 * 測試：node scripts/weekly-alert.mjs --dry-run
 */
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import solarlunarPkg from 'solarlunar'
const solarlunar = solarlunarPkg.default || solarlunarPkg

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

const pad = n => String(n).padStart(2, '0')
const dstr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fmtW = v => v >= 1e4 ? `${Math.round(v / 1e4).toLocaleString()}萬` : Math.round(v).toLocaleString()
const pct = (cur, prev) => prev > 0 ? `${cur >= prev ? '▲+' : '▼-'}${Math.abs((cur - prev) / prev * 100).toFixed(0)}%` : '—'

// 期間：上週（最近 7 個完整日）與各對比期
const today = new Date(); today.setHours(0, 0, 0, 0)
const wEnd = new Date(today); wEnd.setDate(wEnd.getDate() - 1)                 // 昨天
const wStart = new Date(wEnd); wStart.setDate(wStart.getDate() - 6)           // 7 天窗
const pEnd = new Date(wStart); pEnd.setDate(pEnd.getDate() - 1)
const pStart = new Date(pEnd); pStart.setDate(pStart.getDate() - 6)
const lyStart = new Date(wStart); lyStart.setFullYear(lyStart.getFullYear() - 1)
const lyEnd = new Date(wEnd); lyEnd.setFullYear(lyEnd.getFullYear() - 1)
const twoYearsAgo = new Date(today); twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)

async function fetchRows(fromDate, toDate, cols) {
  const all = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('sales_data').select(cols)
      .gte('date', dstr(fromDate)).lte('date', dstr(toDate)).range(from, from + 999)
    if (error) throw error
    all.push(...data)
    if (data.length < 1000) break
  }
  return all
}

console.log(`📆 週報窗：${dstr(wStart)} ~ ${dstr(wEnd)}`)
const [weekRows, prevRows, lyRows, hist] = await Promise.all([
  fetchRows(wStart, wEnd, 'date,subtotal,brand,customer'),
  fetchRows(pStart, pEnd, 'subtotal'),
  fetchRows(lyStart, lyEnd, 'subtotal'),
  fetchRows(twoYearsAgo, wEnd, 'date,subtotal,customer'),
])
const sum = rows => rows.reduce((s, r) => s + (Number(r.subtotal) || 0), 0)
const wTotal = sum(weekRows), pTotal = sum(prevRows), lyTotal = sum(lyRows)

// ② 回購逾期：近 2 年 ≥3 個下單日的客戶，平均回購間隔 ×1.5 仍未回購者
const byCust = {}
for (const r of hist) {
  const c = r.customer; if (!c) continue
  ;(byCust[c] ||= { dates: new Set(), total: 0 }).dates.add(r.date)
  byCust[c].total += Number(r.subtotal) || 0
}
const overdue = []
for (const [name, d] of Object.entries(byCust)) {
  const ds = [...d.dates].sort()
  if (ds.length < 3) continue
  const span = (new Date(ds[ds.length - 1]) - new Date(ds[0])) / 86400000
  const avgGap = span / (ds.length - 1)
  if (avgGap < 3) continue
  const sinceLast = (today - new Date(ds[ds.length - 1])) / 86400000
  if (sinceLast > avgGap * 1.5) overdue.push({ name, total: d.total, sinceLast: Math.round(sinceLast), avgGap: Math.round(avgGap) })
}
overdue.sort((a, b) => b.total - a.total)

// ③ 品牌週變化（上週 vs 前週，只列變化大的前 3）
const brandPrevRows = await fetchRows(pStart, pEnd, 'subtotal,brand')
const bw = {}, bp = {}
for (const r of weekRows) if (r.brand) bw[r.brand] = (bw[r.brand] || 0) + (Number(r.subtotal) || 0)
for (const r of brandPrevRows) if (r.brand) bp[r.brand] = (bp[r.brand] || 0) + (Number(r.subtotal) || 0)
const brandMoves = Object.keys({ ...bw, ...bp })
  .map(b => ({ b, cur: bw[b] || 0, prev: bp[b] || 0 }))
  .filter(x => x.cur + x.prev > 50000)
  .map(x => ({ ...x, chg: x.prev > 0 ? (x.cur - x.prev) / x.prev : 1 }))
  .sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg)).slice(0, 3)

// ④ 未來 21 天民俗檔期（農曆對應）
const FESTS = [[1,1,'🧧春節'],[1,15,'🏮元宵'],[3,23,'⛩媽祖生'],[5,5,'🐉端午'],[7,1,'🕯鬼月始'],[7,15,'🕯中元'],[8,15,'🌕中秋'],[9,9,'🍊重陽']]
const upcoming = []
for (let i = 0; i <= 21; i++) {
  const d = new Date(today); d.setDate(d.getDate() + i)
  try {
    const lu = solarlunar.solar2lunar(d.getFullYear(), d.getMonth() + 1, d.getDate())
    if (!lu.isLeap) for (const [lm, ld, label] of FESTS)
      if (lu.lMonth === lm && lu.lDay === ld) upcoming.push(`${label} ${d.getMonth() + 1}/${d.getDate()}（${i} 天後）`)
  } catch { /* 跳過 */ }
}

// ── 組訊息 ──────────────────────────────────────────────────────────────────
const lines = [
  `📋 本週需行動清單（${dstr(wStart).slice(5)}~${dstr(wEnd).slice(5)}）`,
  '',
  `💰 上週業績 ${fmtW(wTotal)}`,
  `　vs 前週 ${fmtW(pTotal)}（${pct(wTotal, pTotal)}）｜vs 去年同週 ${fmtW(lyTotal)}（${pct(wTotal, lyTotal)}）`,
]
if (upcoming.length) {
  lines.push('', '🏮 檔期備貨提醒（未來三週）')
  upcoming.forEach(u => lines.push(`　${u}`))
}
if (overdue.length) {
  lines.push('', `⏰ 回購逾期客戶 Top ${Math.min(10, overdue.length)}（建議本週聯繫）`)
  overdue.slice(0, 10).forEach((o, i) =>
    lines.push(`　${i + 1}. ${o.name}：${o.sinceLast} 天未回購（平常 ${o.avgGap} 天）｜2年貢獻 ${fmtW(o.total)}`))
} else lines.push('', '✅ 無回購逾期客戶')
if (brandMoves.length) {
  lines.push('', '📊 品牌週變化')
  brandMoves.forEach(x => lines.push(`　${x.b}：${fmtW(x.cur)}（${pct(x.cur, x.prev)}）`))
}
lines.push('', '— sales.wesmilegood.com 領航員')
const message = lines.join('\n')
console.log('\n' + message + '\n')

// ── 發送 ────────────────────────────────────────────────────────────────────
let token = process.env.LINE_CHANNEL_TOKEN, target = process.env.LINE_TARGET_ID
if (!token || !target) {
  const { data } = await supabase.from('dashboard_settings').select('key,value').in('key', ['line_channel_token', 'line_target_id'])
  const map = Object.fromEntries((data || []).map(r => [r.key, r.value]))
  token ||= map.line_channel_token
  target ||= map.line_target_id
}
if (!token || !target) { console.error('❌ 找不到 LINE 設定（面板「LINE 通知」頁或 .env）'); process.exit(1) }
if (dryRun) { console.log('🔍 --dry-run：未發送'); process.exit(0) }

const res = await fetch('https://api.line.me/v2/bot/message/push', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ to: target, messages: [{ type: 'text', text: message }] }),
})
if (!res.ok) { console.error(`❌ LINE 發送失敗（${res.status}）：` + await res.text()); process.exit(1) }
console.log('🎉 週行動清單已推送到 LINE')
