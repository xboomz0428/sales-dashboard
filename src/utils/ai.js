const LS_KEY = 'sdash_google_ai_key'

export function getStoredApiKey() {
  // 同時支援舊 key 名稱（向下相容）
  return localStorage.getItem(LS_KEY) || localStorage.getItem('sdash_anthropic_key') || ''
}

export function setStoredApiKey(key) {
  localStorage.removeItem('sdash_anthropic_key') // 清除舊 key
  if (key) localStorage.setItem(LS_KEY, key)
  else localStorage.removeItem(LS_KEY)
}

// 呼叫 Google AI Studio (Gemini) API
export async function callClaude(prompt, maxTokens = 1000) {
  const apiKey = getStoredApiKey()
  if (!apiKey) throw new Error('NO_API_KEY')

  const model = 'gemini-2.0-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
    }),
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    const msg = err.error?.message || `HTTP ${resp.status}`
    throw new Error(msg)
  }
  const data = await resp.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

export function extractJSON(text) {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AI 未回傳有效 JSON')
  return JSON.parse(match[0])
}
