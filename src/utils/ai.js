const LS_KEY = 'sdash_google_ai_key'

export function getStoredApiKey() {
  // 依序讀取所有已知 key 名稱（向下相容）
  return (
    localStorage.getItem(LS_KEY) ||
    localStorage.getItem('google_ai_studio_api_key') ||
    localStorage.getItem('sdash_anthropic_key') ||
    ''
  )
}

export function setStoredApiKey(key) {
  localStorage.removeItem('sdash_anthropic_key') // 清除舊 key
  if (key) localStorage.setItem(LS_KEY, key)
  else localStorage.removeItem(LS_KEY)
}

// 呼叫 Google AI Studio (Gemini) API
// opts.noThinking = true  → 關閉 Gemini 2.5 的思考模式（適合 JSON 輸出）
export async function callClaude(prompt, maxTokens = 1000, opts = {}) {
  const apiKey = getStoredApiKey()
  if (!apiKey) throw new Error('NO_API_KEY')

  const model = 'gemini-2.5-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const generationConfig = {
    maxOutputTokens: maxTokens,
    temperature: 0.7,
  }

  // 關閉思考模式：JSON 輸出場景不需要 thinking，關閉後更快、更穩定
  if (opts.noThinking) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 }
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig,
    }),
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    const msg = err.error?.message || `HTTP ${resp.status}`
    throw new Error(msg)
  }

  const data = await resp.json()

  // Gemini 2.5 Flash 啟用 thinking 時，parts[0] 是思考內容（thought:true），
  // parts[1] 才是實際回應。過濾掉思考 parts 取得真正文字。
  const parts = data.candidates?.[0]?.content?.parts || []
  const text = parts
    .filter(p => !p.thought)
    .map(p => p.text || '')
    .join('')
  return text || parts[0]?.text || ''
}

// 從 AI 回應中提取 JSON（支援 markdown code block 與 thinking 模式）
export function extractJSON(text) {
  // 1. 先嘗試從 markdown code block 取出
  const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (mdMatch) {
    try { return JSON.parse(mdMatch[1].trim()) } catch {}
  }

  // 2. 用括號平衡法找到第一個完整的 JSON 物件（比貪婪 regex 更可靠）
  let depth = 0, start = -1
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) start = i
      depth++
    } else if (text[i] === '}') {
      depth--
      if (depth === 0 && start !== -1) {
        try { return JSON.parse(text.slice(start, i + 1)) } catch {}
        start = -1
      }
    }
  }

  throw new Error('AI 未回傳有效 JSON')
}
