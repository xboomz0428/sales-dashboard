import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import https from 'https'
import readline from 'readline'

// 讀取 .env 檔案中的 API Key
function loadEnv() {
  if (existsSync('.env')) {
    const lines = readFileSync('.env', 'utf8').split('\n')
    for (const line of lines) {
      const [key, ...vals] = line.split('=')
      if (key?.trim() && vals.length) {
        process.env[key.trim()] = vals.join('=').trim()
      }
    }
  }
}

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}

function ask(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, ans => { rl.close(); resolve(ans.trim()) })
  })
}

function callClaude(apiKey, prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }]
    })
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve(JSON.parse(data).content?.[0]?.text || '') }
        catch { reject(new Error('API 回應解析失敗')) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function main() {
  loadEnv()

  console.log('\n================================')
  console.log('   自動部署到 Vercel')
  console.log('================================\n')

  // 確認有沒有變更
  const status = run('git status --short')
  if (!status) {
    console.log('沒有需要 commit 的變更。')
    return
  }

  // 讀取目前版本
  const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))
  const oldVersion = pkg.version

  // 顯示變更清單
  console.log('📝 變更檔案：')
  console.log(status)
  console.log()

  // 若無 API Key，詢問使用者（可直接 Enter 跳過）
  if (!process.env.ANTHROPIC_API_KEY) {
    const inputKey = await ask('🔑 Anthropic API Key（Enter 跳過 AI 說明）: ')
    if (inputKey) process.env.ANTHROPIC_API_KEY = inputKey
  }

  // 嘗試用 AI 自動生成說明
  let description = ''
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (apiKey) {
    try {
      process.stdout.write('🤖 AI 分析變更中...')
      // 取得 diff（限制長度避免 token 過多）
      let diff = ''
      try { diff = run('git diff --unified=2').slice(0, 4000) } catch {}

      const prompt = `你是前端開發助手，請根據以下 git 變更，用繁體中文寫出 1 句 commit 說明（30字以內，精確描述做了什麼，不加引號、不加標點以外的符號）：

變更檔案：
${status}

程式碼差異（節錄）：
${diff || '（無 diff 資訊）'}

只輸出那一句說明，不要其他內容。`

      description = await callClaude(apiKey, prompt)
      description = description.trim().replace(/["'「」]/g, '').slice(0, 60)
      console.log(` ✅\n💡 AI 說明：${description}\n`)
    } catch (e) {
      console.log(` ❌（${e.message}）\n`)
    }
  } else {
    console.log('⚠️  未設定 ANTHROPIC_API_KEY，將手動輸入說明\n')
    console.log('提示：在 .env 檔案加入 ANTHROPIC_API_KEY=你的key 即可啟用 AI 自動說明\n')
  }

  // 如果 AI 沒生成，改為手動輸入
  if (!description) {
    description = await ask('修改說明（直接 Enter 跳過）: ')
    if (!description) description = '更新'
  } else {
    // 讓使用者確認或修改
    const confirm = await ask(`確認說明（直接 Enter 使用，或輸入新說明覆蓋）: `)
    if (confirm) description = confirm
  }

  // 自動遞增 patch 版本號
  run('npm version patch --no-git-tag-version')
  const newVersion = JSON.parse(readFileSync('./package.json', 'utf8')).version

  // Git 操作
  run('git add .')
  run(`git commit -m "v${newVersion}: ${description}"`)
  run('git push')

  console.log('\n================================')
  console.log(` ✅  v${oldVersion} → v${newVersion}`)
  console.log(` 📌  ${description}`)
  console.log(' 🚀  Vercel 部署中，約 1 分鐘後生效')
  console.log('================================\n')
}

main().catch(e => {
  console.error('\n❌ 部署失敗：', e.message)
  process.exit(1)
})
