/**
 * lc-inspect.mjs — 唯讀探查 LC 的 MariaDB(lcdata) 結構
 * ─────────────────────────────────────────────────────────────────────────────
 * 目的：在寫「LC 自動匯入」前，先看清楚哪張表/哪些欄位是銷貨明細，
 *       以便對應到儀表板需要的欄位（日期、單號、客戶、產品、數量、金額…）。
 * 本腳本只做 SELECT / SHOW，不寫入任何資料。
 *
 * 用法：node scripts/lc-inspect.mjs
 * 需要 repo 根 .env（不要把密碼貼到對話裡）：
 *   LC_DB_HOST=192.168.1.13        # 或 WESMILE_S1-PC
 *   LC_DB_PORT=3306
 *   LC_DB_USER=xxx
 *   LC_DB_PASS=xxx
 *   LC_DB_NAME=lcdata
 */
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import mysql from 'mysql2/promise'

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

const cfg = {
  host: process.env.LC_DB_HOST, port: +(process.env.LC_DB_PORT || 3306),
  user: process.env.LC_DB_USER, password: process.env.LC_DB_PASS,
  database: process.env.LC_DB_NAME || 'lcdata',
}
if (!cfg.host || !cfg.user) { console.error('❌ .env 缺少 LC_DB_HOST / LC_DB_USER（見本檔頂註解）'); process.exit(1) }

const conn = await mysql.createConnection(cfg).catch(e => { console.error('❌ 連線失敗：' + e.message); process.exit(1) })
console.log(`✅ 已連線 ${cfg.host}/${cfg.database}\n`)

// 1) 所有表 + 筆數（估）
const [tables] = await conn.query(
  `select table_name, table_rows from information_schema.tables
   where table_schema = ? order by table_rows desc`, [cfg.database])
console.log('=== 表（依筆數）===')
for (const t of tables) console.log(`  ${t.TABLE_NAME}  ~${t.TABLE_ROWS} 列`)

// 2) 找可能的銷貨明細表（表名或欄名含關鍵字）
const [cols] = await conn.query(
  `select table_name, column_name, data_type from information_schema.columns
   where table_schema = ? order by table_name, ordinal_position`, [cfg.database])
const byTable = {}
for (const c of cols) (byTable[c.TABLE_NAME] ||= []).push(`${c.COLUMN_NAME}:${c.DATA_TYPE}`)

const KW = /sale|order|detail|item|銷|貨|訂|明細|出貨|date|amount|qty|price|cust|客|product|品/i
console.log('\n=== 可能相關的表（表名或欄位含關鍵字）===')
for (const [tbl, list] of Object.entries(byTable)) {
  if (KW.test(tbl) || list.some(c => KW.test(c))) {
    console.log(`\n【${tbl}】`)
    console.log('  ' + list.join('  '))
  }
}

await conn.end()
console.log('\n👉 把上面輸出貼回對話（或告訴我哪張是銷貨明細），我就寫對應的 lc-import.mjs 自動匯入。')
