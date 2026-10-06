/** llm.js — 模型回應解析（從儀表板 utils/ai.js 搬出的純函式，不含金鑰） */
export function extractJSON(text) {
  const mdMatch = String(text).match(/```(?:json)?\s*([\s\S]*?)```/)
  if (mdMatch) { try { return JSON.parse(mdMatch[1].trim()) } catch {} }
  let depth = 0, start = -1
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') { if (depth === 0) start = i; depth++ }
    else if (text[i] === '}') {
      depth--
      if (depth === 0 && start !== -1) { try { return JSON.parse(text.slice(start, i + 1)) } catch {} ; start = -1 }
    }
  }
  throw new Error('AI 未回傳有效 JSON')
}
