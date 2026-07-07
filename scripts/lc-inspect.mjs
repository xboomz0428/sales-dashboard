/**
 * lc-inspect.mjs — 唯讀探查 LC 的 MariaDB(lcdata) 結構 + 樣本資料
 * ─────────────────────────────────────────────────────────────────────────────
 * 在「ERP 主機(WESMILE_S1-PC)」上跑最順：DB 就在本機，用 localhost 天生有權限。
 * 目的：一次抓出「表清單 + 候選銷貨表的欄位 + 幾筆樣本」，好對應到儀表板欄位。
 * 只做 SELECT / SHOW，不寫入。
 *
 * 用法（在 ERP 主機）：
 *   1) 安裝 Node.js（https://nodejs.org LTS）
 *   2) 把本 repo 複製到該機，於 repo 目錄執行： npm install
 *   3) 複製 .env.example 為 .env，把 LC_DB_HOST 設為 localhost、填入 DB 帳密
 *   4) node scripts/lc-inspect.mjs > lc-schema.txt
 *   5) 把 lc-schema.txt 內容貼回對話，我就寫 lc-import.mjs
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
  host: process.env.LC_DB_HOST || 'localhost', port: +(process.env.LC_DB_PORT || 3306),
  user: process.env.LC_DB_USER, password: process.env.LC_DB_PASS,
  database: process.env.LC_DB_NAME || 'lcdata', dateStrings: true,
}
if (!cfg.user) { console.error('❌ .env 缺少 LC_DB_USER（見本檔頂註解）'); process.exit(1) }

const conn = await mysql.createConnection(cfg).catch(e => { console.error('❌ 連線失敗：' + e.message); process.exit(1) })
console.log(`✅ 已連線 ${cfg.host}/${cfg.database}\n`)

const [tables] = await conn.query(
  `select table_name, table_rows from information_schema.tables
   where table_schema = ? order by table_rows desc`, [cfg.database])
console.log('=== 全部表（依筆數，估）===')
for (const t of tables) console.log(`  ${t.TABLE_NAME}  ~${t.TABLE_ROWS}`)

const [cols] = await conn.query(
  `select table_name, column_name, data_type from information_schema.columns
   where table_schema = ? order by table_name, ordinal_position`, [cfg.database])
const byTable = {}
for (const c of cols) (byTable[c.TABLE_NAME] ||= []).push(`${c.COLUMN_NAME}:${c.DATA_TYPE}`)

// 候選：關鍵字命中，或筆數最多的前 10 張表
const KW = /sale|order|detail|item|invoice|銷|貨|訂|明細|出貨|date|amount|qty|price|cust|客|product|品|goods/i
const candidates = new Set()
for (const [tbl, list] of Object.entries(byTable))
  if (KW.test(tbl) || list.some(c => KW.test(c))) candidates.add(tbl)
tables.slice(0, 10).forEach(t => candidates.add(t.TABLE_NAME))

console.log('\n=== 候選表：欄位 + 2 筆樣本（前 30 欄）===')
for (const tbl of candidates) {
  console.log(`\n【${tbl}】(~${tables.find(t => t.TABLE_NAME === tbl)?.TABLE_ROWS ?? '?'} 列)`)
  console.log('  欄位: ' + (byTable[tbl] || []).slice(0, 60).join('  '))
  try {
    const [rows] = await conn.query(`select * from \`${tbl}\` limit 2`)
    rows.forEach((r, i) => {
      const trimmed = {}
      Object.keys(r).slice(0, 30).forEach(k => {
        let v = r[k]
        if (typeof v === 'string' && v.length > 40) v = v.slice(0, 40) + '…'
        trimmed[k] = v
      })
      console.log(`  樣本${i + 1}: ` + JSON.stringify(trimmed))
    })
  } catch (e) { console.log('  (讀樣本失敗: ' + e.message + ')') }
}

await conn.end()
console.log('\n👉 把以上輸出貼回對話，我就寫對應的 lc-import.mjs（唯讀查 lcdata → 冪等寫入 sales_data）。')
