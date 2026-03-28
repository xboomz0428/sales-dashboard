/**
 * supabase-init.mjs
 * 一鍵完成 Supabase 初始化：
 *   1. 建立 Storage bucket (sales-files)
 *   2. 推送 DB migration（資料表 + RLS 政策）
 *
 * 使用方式：
 *   node supabase-init.mjs <service_role_key>
 *
 * service_role key 取得位置：
 *   Supabase Console → Project Settings → API → service_role (secret)
 *
 * ⚠️  執行前請確認已在此終端機執行過：
 *   npx supabase login
 *   npx supabase link --project-ref <your-project-ref>
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))

// ─── 讀取 .env ───────────────────────────────────────────────────────────────
function loadEnv() {
  const env = {}
  try {
    const text = readFileSync(join(__dir, '.env'), 'utf-8')
    for (const line of text.split('\n')) {
      const m = line.match(/^([^#=\s][^=]*)=(.*)$/)
      if (m) env[m[1].trim()] = m[2].trim()
    }
  } catch {}
  return env
}

const env             = loadEnv()
const SUPABASE_URL    = env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.argv[2]

// ─── 前置檢查 ────────────────────────────────────────────────────────────────
if (!SUPABASE_URL) {
  console.error('❌  找不到 VITE_SUPABASE_URL，請確認 .env 已設定')
  process.exit(1)
}
if (!SERVICE_ROLE_KEY) {
  console.error('❌  請提供 service_role key：')
  console.error('    node supabase-init.mjs <service_role_key>')
  console.error('')
  console.error('    取得位置：Supabase Console → Project Settings → API → service_role (secret)')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// ─── 主程式 ──────────────────────────────────────────────────────────────────
async function run() {
  console.log('╔══════════════════════════════════════════╗')
  console.log('║   銷售分析系統  Supabase 初始化          ║')
  console.log('╚══════════════════════════════════════════╝')
  console.log('')
  console.log('🔗 專案：', SUPABASE_URL)
  console.log('')

  let allOk = true

  // ── Step 1：建立 Storage Bucket ─────────────────────────────────────────
  console.log('[ 1 / 2 ]  建立 Storage bucket: sales-files …')

  const { error: bucketErr } = await supabase.storage.createBucket('sales-files', {
    public: false,
    fileSizeLimit: 52428800,  // 50 MB
    allowedMimeTypes: [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/octet-stream',
    ],
  })

  if (!bucketErr || bucketErr.message?.includes('already exists') || bucketErr.message?.includes('Duplicate')) {
    console.log('  ✅  sales-files bucket 就緒')
  } else {
    console.error('  ❌  Bucket 建立失敗：', bucketErr.message)
    console.error('      請確認 service_role key 正確，或至 Dashboard → Storage 手動建立')
    allOk = false
  }

  console.log('')

  // ── Step 2：推送 DB Migration ────────────────────────────────────────────
  console.log('[ 2 / 2 ]  推送 DB migration（資料表 + RLS）…')

  const migrationPath = join(__dir, 'supabase', 'migrations', '20260328000000_initial_setup.sql')
  if (!existsSync(migrationPath)) {
    console.error('  ❌  找不到 migration 檔案：', migrationPath)
    allOk = false
  } else {
    try {
      execSync('npx supabase db push --include-all', {
        cwd: __dir,
        stdio: 'inherit',
        env: { ...process.env },
      })
      console.log('  ✅  資料表與 RLS 政策建立完成')
    } catch (e) {
      console.error('')
      console.error('  ❌  db push 失敗（可能未登入 CLI 或未 link 專案）')
      console.error('      請在此終端機執行：')
      console.error('        npx supabase login')
      console.error('        npx supabase link --project-ref', new URL(SUPABASE_URL).hostname.split('.')[0])
      console.error('        npx supabase db push --include-all')
      allOk = false
    }
  }

  console.log('')
  if (allOk) {
    console.log('🎉  初始化完成！')
    console.log('')
    console.log('   接下來：')
    console.log('   1. Supabase Console → Authentication → Providers → Email → 確認已開啟')
    console.log('   2. npm run dev  啟動應用')
    console.log('   3. 用任意 email 註冊後，至 Authentication → Users 複製 UUID')
    console.log('      再執行 SQL 升級角色：')
    console.log("      update public.user_roles set role = 'admin' where id = '<uuid>';")
  } else {
    console.log('⚠️   部分步驟需手動完成，請參考上方說明。')
  }
}

run().catch(e => { console.error('❌  錯誤：', e.message); process.exit(1) })
