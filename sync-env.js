/**
 * sync-env.js
 * 將本機 .env 的 VITE_* 環境變數自動同步至 Vercel（production + preview）
 *
 * 使用方式：
 *   node sync-env.js
 *
 * 前置需求：
 *   1. 已安裝 vercel CLI：npm i -g vercel
 *   2. 已登入 vercel：vercel login
 *   3. 已連結專案：vercel link（第一次執行會自動提示）
 */

import { spawnSync, execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'

// ─── 讀取 .env ────────────────────────────────────────────────────────────────
function loadEnv(file = '.env') {
  const vars = {}
  if (!existsSync(file)) return vars
  readFileSync(file, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const idx = trimmed.indexOf('=')
    if (idx < 1) return
    const key = trimmed.slice(0, idx).trim()
    const val = trimmed.slice(idx + 1).trim()
    if (key && val) vars[key] = val
  })
  return vars
}

// ─── 執行 vercel env add（帶值寫入 stdin） ────────────────────────────────────
function vercelEnvAdd(name, value, envTarget) {
  // vercel env add NAME TARGET < value（non-interactive：--force 覆蓋已存在的值）
  const result = spawnSync(
    'vercel',
    ['env', 'add', name, envTarget, '--force'],
    {
      input: value + '\n',   // 從 stdin 傳入值
      encoding: 'utf8',
      shell: true,
      timeout: 30000,
    }
  )
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `exit code ${result.status}`)
  }
  return true
}

// ─── 確認 vercel CLI 已安裝，若無則自動安裝 ───────────────────────────────
function ensureVercelCLI() {
  try {
    execSync('vercel --version', { stdio: 'pipe', encoding: 'utf8' })
    return true
  } catch {
    console.log('vercel CLI 未安裝，正在安裝 (npm i -g vercel)...')
    try {
      execSync('npm install -g vercel', { stdio: 'inherit', encoding: 'utf8' })
      return true
    } catch {
      console.error('❌ 安裝失敗，請手動執行：npm install -g vercel')
      return false
    }
  }
}

// ─── 主流程 ────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║   同步環境變數至 Vercel                  ║')
  console.log('╚══════════════════════════════════════════╝\n')

  // 1. 確認 vercel CLI（自動安裝）
  if (!ensureVercelCLI()) process.exit(1)

  // 2. 確認已連結 Vercel 專案
  if (!existsSync('.vercel/project.json')) {
    console.log('\n首次執行：需先連結 Vercel 專案')
    console.log('請依照提示登入並選擇你的 Vercel 專案...\n')
    try {
      execSync('vercel link', { stdio: 'inherit', encoding: 'utf8' })
    } catch {
      console.error('❌ vercel link 失敗，請手動執行：vercel link')
      process.exit(1)
    }
    console.log()
  }

  // 3. 讀取 .env（只同步 VITE_* 變數）
  const env = loadEnv('.env')

  // 要同步的變數清單（只同步 VITE_* 環境變數，不同步 GOOGLE_AI_KEY 等本機工具用的 key）
  const SYNC_KEYS = Object.keys(env).filter(k => k.startsWith('VITE_'))

  if (!SYNC_KEYS.length) {
    console.warn('⚠️  .env 中沒有找到 VITE_* 環境變數')
    process.exit(0)
  }

  console.log(`📋 找到 ${SYNC_KEYS.length} 個 VITE_* 環境變數：`)
  SYNC_KEYS.forEach(k => {
    const val = env[k]
    const preview = val.length > 30 ? val.slice(0, 15) + '…' + val.slice(-8) : val
    console.log(`   ${k} = ${preview}`)
  })
  console.log()

  // 3. 同步至 production + preview
  const TARGETS = ['production', 'preview']
  let successCount = 0
  let failCount = 0

  for (const key of SYNC_KEYS) {
    const value = env[key]
    process.stdout.write(`  ▸ ${key}`)

    for (const target of TARGETS) {
      try {
        vercelEnvAdd(key, value, target)
        process.stdout.write(` [${target} ✓]`)
        successCount++
      } catch (e) {
        process.stdout.write(` [${target} ✗]`)
        failCount++
        // 繼續下一個，不中斷
      }
    }
    console.log()
  }

  console.log()
  if (failCount === 0) {
    console.log(`✅  全部同步完成（${successCount / TARGETS.length} 個變數 → production + preview）`)
  } else {
    console.log(`⚠️  完成，${successCount / TARGETS.length} 個成功，${failCount / TARGETS.length} 個失敗`)
    console.log('   失敗原因通常是：尚未執行 vercel link，或未登入（vercel login）')
  }

  console.log('\n📝 提醒：同步後需重新部署才會生效')
  console.log('   執行 deploy.bat 即可完成部署\n')
}

main().catch(e => {
  console.error('\n❌ 同步失敗：', e.message)
  process.exit(1)
})
