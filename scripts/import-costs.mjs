/**
 * import-costs.mjs — 從 LC「商品資料.xls」把成本匯進儀表板的產品成本(user_costs)
 * ─────────────────────────────────────────────────────────────────────────────
 * 只「補缺」不覆蓋既有成本（避免蓋掉你手動調過的值）；名稱以精確比對為主、
 * 停售/空白等差異用正規化(去【..】與空白)再比一次。成本以 sales_data 實際出現
 * 過的品名為 key，確保毛利計算對得上。
 *
 * 用法：
 *   node scripts/import-costs.mjs "\\\\Wesmile_s1-pc\\lc\\20260706_商品資料.xls"
 *   node scripts/import-costs.mjs "<xls>" --overwrite   # 連既有成本一起以商品檔更新
 *   node scripts/import-costs.mjs "<xls>" --dry-run      # 只看會補多少，不寫入
 *
 * 需要 repo 根的 .env：VITE_SUPABASE_URL、VITE_SUPABASE_SERVICE_KEY
 * 欄位假設：商品資料含「料品名稱」「成本」欄（如未來欄名改變，調整 NAME_COL/COST_COL）
 */
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const NAME_COL = '料品名稱', COST_COL = '成本'

function loadEnv() {
  const p = resolve(ROOT, '.env')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const i = t.indexOf('='); if (i < 1) continue
    const k = t.slice(0, i).trim(), v = t.slice(i + 1).trim()
    if (k && process.env[k] == null) process.env[k] = v
  }
}
loadEnv()

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const overwrite = args.includes('--overwrite')
const file = args.find(a => !a.startsWith('--'))
if (!file || !existsSync(file)) { console.error(`❌ 找不到商品資料 xls：${file || '(未指定)'}`); process.exit(1) }

const URL = process.env.VITE_SUPABASE_URL, KEY = process.env.VITE_SUPABASE_SERVICE_KEY
if (!URL || !KEY) { console.error('❌ .env 缺少 VITE_SUPABASE_URL / VITE_SUPABASE_SERVICE_KEY'); process.exit(1) }

// ── 讀商品成本 ───────────────────────────────────────────────────────────────
const wb = XLSX.read(readFileSync(file), { type: 'buffer', cellDates: false })
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true })
const H = rows[0]; const iN = H.indexOf(NAME_COL), iC = H.indexOf(COST_COL)
if (iN < 0 || iC < 0) { console.error(`❌ 找不到欄位「${NAME_COL}」或「${COST_COL}」，實際表頭：${JSON.stringify(H)}`); process.exit(1) }

const norm = (s) => (s || '').toString().replace(/【[^】]*】/g, '').replace(/\s|\r|\n/g, '').toLowerCase()
const exact = new Map(), fuzzy = new Map()
for (let i = 1; i < rows.length; i++) {
  const r = rows[i]; if (!r) continue
  const name = (r[iN] || '').toString().trim(); const cost = parseFloat(r[iC]) || 0
  if (!name || cost <= 0) continue
  exact.set(name, cost)
  if (!fuzzy.has(norm(name))) fuzzy.set(norm(name), cost)
}
console.log(`📄 商品資料：${exact.size} 個有成本的品名`)

const supabase = createClient(URL, KEY, { auth: { persistSession: false } })

// ── sales_data 實際出現過的品名 ──────────────────────────────────────────────
const products = new Set()
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase.from('sales_data').select('product').range(from, from + 999)
  if (error) { console.error('❌ 讀 sales_data 失敗：' + error.message); process.exit(1) }
  if (!data.length) break
  data.forEach(r => r.product && products.add(r.product))
  if (data.length < 1000) break
}
console.log(`🧾 sales_data 不重複品名：${products.size}`)

const costForProduct = (p) => exact.get(p) ?? fuzzy.get(norm(p)) ?? null

// ── 更新每個 user_costs（通常只有店主一列）──────────────────────────────────
const { data: ucRows, error: ucErr } = await supabase.from('user_costs').select('user_id, costs')
if (ucErr) { console.error('❌ 讀 user_costs 失敗：' + ucErr.message); process.exit(1) }

let totalFilled = 0
for (const uc of ucRows) {
  const costs = uc.costs || {}
  let filled = 0
  for (const p of products) {
    const has = costs[p] != null && !isNaN(costs[p])
    if (has && !overwrite) continue
    const c = costForProduct(p)
    if (c != null && (!has || costs[p] !== c)) { costs[p] = c; filled++ }
  }
  const covered = [...products].filter(p => costs[p] != null).length
  console.log(`  user ${uc.user_id.slice(0, 8)}…：${overwrite ? '更新' : '補上'} ${filled} 項，覆蓋 ${covered}/${products.size} 品名`)
  totalFilled += filled
  if (!dryRun && filled > 0) {
    const { error } = await supabase.from('user_costs')
      .update({ costs, updated_at: new Date().toISOString() }).eq('user_id', uc.user_id)
    if (error) { console.error('❌ 寫入失敗：' + error.message); process.exit(1) }
  }
}

console.log(dryRun
  ? `🔍 --dry-run：預計補 ${totalFilled} 項，未寫入`
  : `✅ 完成，共補/更新 ${totalFilled} 項成本。使用者重新整理儀表板即可看到毛利更新。`)
