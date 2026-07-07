/**
 * erp-import.mjs — ERP 銷售資料自動匯入
 * ─────────────────────────────────────────────────────────────────────────────
 * 在本機（或排程）執行：讀取 ERP 匯出的 .xls → 解析 → 冪等寫入 Supabase sales_data。
 * 解析邏輯直接重用前端的 excelCore.parseBuffer，保證與手動上傳結果一致。
 *
 * 用法：
 *   node scripts/erp-import.mjs "\\\\Wsm_nas\\雲端共用硬碟\\ERP備份\\銷售數據\\20180101_20251231.xls"
 *   node scripts/erp-import.mjs <檔案路徑> --dry-run       # 只解析驗證，不寫入
 *   node scripts/erp-import.mjs <檔案路徑> --replace-all    # 清空整表後匯入（完整歷史檔用）
 *
 * 不帶 --replace-all 時為「檔案層級取代」：同檔名的舊資料會被新資料取代，
 * 其他檔案的資料保留。⚠️ 若新檔日期範圍與其他既有檔案重疊，會造成重複計算，
 * 此時請用 --replace-all 或先確認檔案切割不重疊。
 *
 * 需要 .env（repo 根目錄）：VITE_SUPABASE_URL、VITE_SUPABASE_SERVICE_KEY
 * Windows 排程：用工作排程器執行 erp-import.bat（見 scripts/README-ERP自動匯入.md）
 */
import { readFileSync, existsSync } from 'fs'
import { basename, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { parseBuffer } from '../src/utils/excelCore.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ── 讀 .env ──────────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = resolve(ROOT, '.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 1) continue
    const k = t.slice(0, i).trim(), v = t.slice(i + 1).trim()
    if (k && v && process.env[k] == null) process.env[k] = v
  }
}
loadEnv()

// ── 參數 ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const replaceAll = args.includes('--replace-all')
const filePath = args.find(a => !a.startsWith('--')) || process.env.ERP_FILE

if (!filePath) {
  console.error('❌ 請指定檔案路徑：node scripts/erp-import.mjs <xls 路徑> [--dry-run] [--replace-all]')
  process.exit(1)
}
if (!existsSync(filePath)) {
  console.error(`❌ 找不到檔案：${filePath}（NAS 未連線？）`)
  process.exit(1)
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_KEY  = process.env.VITE_SUPABASE_SERVICE_KEY
if (!dryRun && (!SUPABASE_URL || !SERVICE_KEY)) {
  console.error('❌ .env 缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_SERVICE_KEY')
  process.exit(1)
}

// ── 解析 ─────────────────────────────────────────────────────────────────────
const sourceFile = basename(filePath)
console.log(`📄 讀取 ${filePath}`)
const buf = readFileSync(filePath)
const { rows } = parseBuffer(new Uint8Array(buf).buffer)

if (!rows.length) { console.error('❌ 檔案無可解析的資料列'); process.exit(1) }

const byYear = {}
for (const r of rows) {
  if (!byYear[r.year]) byYear[r.year] = { rows: 0, subtotal: 0 }
  byYear[r.year].rows++
  byYear[r.year].subtotal += r.subtotal
}
console.log(`✅ 解析成功：${rows.length.toLocaleString()} 筆（${rows[0].date} ~ ${rows[rows.length - 1].date}）`)
for (const y of Object.keys(byYear).sort()) {
  console.log(`   ${y}：${byYear[y].rows.toLocaleString()} 筆，小計 ${Math.round(byYear[y].subtotal).toLocaleString()}`)
}

if (dryRun) { console.log('🔍 --dry-run：僅驗證解析，未寫入資料庫'); process.exit(0) }

// ── 寫入（與前端 importRowsToDb 相同的安全順序：插新批次→驗證→刪舊）──────────
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
const batch = Date.now()
const CHUNK = 2000

const toDb = (r) => ({
  _key: r._key, date: r.date, year_month: r.yearMonth, year: r.year, month: r.month,
  channel: r.channel ?? '', channel_type: r.channelType ?? '', brand: r.brand ?? '',
  agent_type: r.agentType ?? '', product: r.product ?? '', order_id: r.orderId ?? '',
  customer: r.customer ?? '', quantity: r.quantity ?? 0, subtotal: r.subtotal ?? 0,
  total: r.total ?? 0, discount_rate: r.discountRate ?? 0,
  source_file: sourceFile, import_batch: batch,
})

async function rollback() {
  await supabase.from('sales_data').delete().eq('source_file', sourceFile).eq('import_batch', batch)
}

console.log(`⬆️  寫入資料庫（批次 ${batch}）…`)
let inserted = 0
for (let i = 0; i < rows.length; i += CHUNK) {
  const chunk = rows.slice(i, i + CHUNK).map(toDb)
  const { error } = await supabase.from('sales_data').insert(chunk)
  if (error) {
    console.error(`❌ 寫入失敗（第 ${i + 1} 筆起）：${error.message}，還原本批次…`)
    await rollback()
    process.exit(1)
  }
  inserted += chunk.length
  process.stdout.write(`\r   已寫入 ${inserted.toLocaleString()} / ${rows.length.toLocaleString()}`)
}
console.log()

// 驗證筆數
const { count, error: cErr } = await supabase
  .from('sales_data').select('*', { count: 'exact', head: true })
  .eq('source_file', sourceFile).eq('import_batch', batch)
if (cErr || count !== rows.length) {
  console.error(`❌ 驗證失敗（送出 ${rows.length}，實得 ${count ?? '?'}），還原本批次…`)
  await rollback()
  process.exit(1)
}
console.log(`✅ 驗證通過：資料庫實得 ${count.toLocaleString()} 筆`)

// 刪除舊資料
if (replaceAll) {
  const { error } = await supabase.from('sales_data').delete().neq('import_batch', batch)
  if (error) { console.error(`❌ 清除舊資料失敗：${error.message}`); process.exit(1) }
  console.log('🧹 已清除本批次以外的所有舊資料（--replace-all）')
} else {
  const { error } = await supabase.from('sales_data').delete()
    .eq('source_file', sourceFile).neq('import_batch', batch)
  if (error) { console.error(`❌ 清除同檔舊批次失敗：${error.message}`); process.exit(1) }
  console.log(`🧹 已清除「${sourceFile}」的舊批次資料`)
}

const { count: finalCount } = await supabase
  .from('sales_data').select('*', { count: 'exact', head: true })
console.log(`🎉 完成。sales_data 目前共 ${finalCount?.toLocaleString() ?? '?'} 筆。`)
console.log('   （使用者下次開啟儀表板時會自動偵測資料變動並更新）')
