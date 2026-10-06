/**
 * marketingAI.js — AI 內容生成建議（企劃卡草稿）
 * ─────────────────────────────────────────────────────────────────────────────
 * 用儀表板既有的 AI 通道（utils/ai.js：Google AI Studio 金鑰，存在瀏覽器）產生一張企劃卡：
 * 受眾 → Google RSA 標題／描述 → 社群三版 → EDM 主旨 → LINE 推播 → 關鍵字分層 → 設定建議。
 * 所有數字（預算、CPA、客單）由程式帶入，AI 只負責文字；回來後立刻跑合規前置檢查。
 */
// 模型呼叫由 Worker 注入（worker/src/ai.ts 的 callModel），這裡只負責組 prompt 與解析
import { extractJSON } from './llm'
import { checkBrief, bannedSummary } from './compliance'
import { asList } from './settings'

/** ctx.callModel(prompt) 由呼叫端提供（Worker 用 secret 金鑰呼叫模型；測試可塞假函式） */
async function callModel(ctx, prompt) {
  if (typeof ctx.callModel !== 'function') throw new Error('缺少 ctx.callModel：請由 Worker 注入模型呼叫函式')
  return ctx.callModel(prompt, { maxTokens: 6000, noThinking: true })
}

export function buildBriefPrompt(ctx) {
  const { event, products = [], keywords = [], winningTitles = [], get, period, stats = {} } = ctx
  const n = k => Number(get(k))
  const tone = get('gen.tone') || ''
  const allowed = asList(get('gen.allowed_claims'))
  const extra = asList(get('gen.banned_words_extra'))
  const budget = Math.min(n('budget.google_monthly_cap'), event?.tier === 'major' ? n('budget.campaign_month_cap') : n('budget.google_monthly_cap'))

  return `你是台灣草本生活品牌「好漢草」的行銷企劃。請為下面這一檔活動產出一張「企劃卡」，只輸出 JSON，不要任何解釋文字。

【檔期】${event?.name || '手動企劃'}（${period?.start || ''}～${period?.end || ''}）
【觸發原因】${ctx.trigger || event?.kind || '手動'}
【主推品項】
${products.map(p => `- ${p.name}${p.price ? `（參考售價 ${p.price} 元`: ''}${p.margin ? `、毛利率 ${Math.round(p.margin * 100)}%` : ''}${p.price ? '）' : ''}${p.note ? `：${p.note}` : ''}`).join('\n') || '- （未指定，請依檔期挑最合適的好漢草品項：艾草淨身平安包、足沐湯浴包（足好眠/足好輕/足好勇/足好暖）、感溫足浴袋、大風草擦澡包、淨境噴霧、平安皂）'}
【可用的關鍵字方向（投放用，功效字只能留在關鍵字層，不可進標題與文案）】
${keywords.map(k => `- ${k}`).join('\n') || '- 無'}
【過去表現好的標題句型（可改寫，不可照抄）】
${winningTitles.map(t => `- ${t}`).join('\n') || '- 尚無資料'}
【品牌語氣】${tone}
【允許寫的事實句】${allowed.join('；') || '無'}
【去年同檔／近期數字】${JSON.stringify(stats)}
【預算與目標（由系統給定，請原樣放進 settings）】月預算上限 ${budget} 元、目標每筆轉換成本 ${n('bid.target_cpa')} 元、目標 ROAS ${n('bid.target_roas')} 倍

【硬性合規規則：台灣藥事法／食安法／化粧品法】
好漢草全部是一般商品與化粧品，絕對不能出現任何療效、生理功能、衛生、保證、薦證字眼。禁用清單：
${bannedSummary()}
${extra.length ? `額外禁用字：${extra.join('、')}` : ''}
產品名「足好眠」「足好輕」「足好勇」「足好暖」可以寫，但不可延伸成助眠、減重、舒筋、促進循環等功效句。民俗用語可寫「淨身」「祈安」「除舊佈新」「祈求平安」。
寫法要用「情境與感受」：泡腳的時光、暖呼呼、睡前的儀式、探病回家先淨身、送長輩的心意。

【輸出 JSON 格式】
{
  "campaign_name": "檔期名稱（10 字內）",
  "angle": "本檔一句話切角",
  "audiences": [{"name":"受眾名","who":"誰","pain":"在意什麼","hook":"切角"}],   // 2～3 個
  "rsa_headlines": ["..."],       // ${n('gen.rsa_headlines')} 則，每則 ≤ 30 個字元（中文一字算 2 字元，所以 ≤ 15 個中文字），不重複、不全用驚嘆號
  "rsa_descriptions": ["..."],    // ${n('gen.rsa_descriptions')} 則，每則 ≤ 90 字元（≤ 45 個中文字）
  "social": {"fb":"...", "ig":"...", "threads":"..."},   // FB 120～200 字含換行；IG 80～120 字＋5 個 hashtag；Threads 50 字內口語
  "edm_subjects": ["..."],        // ${n('gen.edm_subjects')} 則，≤ 20 個中文字
  "line_push": "...",             // ≤ 60 個中文字，含一個行動呼籲
  "keywords": {"exact": ["..."], "phrase": ["..."], "broad": ["..."]},   // 各 5～12 個
  "negatives": ["..."],           // 8～15 個否定字
  "settings": {"budget_monthly": ${budget}, "target_cpa": ${n('bid.target_cpa')}, "target_roas": ${n('bid.target_roas')}, "schedule": "${get('bid.schedule_boost') || ''}", "landing_page_hint": "建議落地頁內容重點", "utm_campaign": "英文代碼"},
  "compliance_self_check": ["你自己檢查後認為仍有疑慮的句子，沒有就空陣列"]
}`
}

/**
 * 產生企劃卡草稿
 * @returns {{ draft: object, flags: {path,text,hits}[], raw: string }}
 */
export async function generateBriefDraft(ctx) {
  const prompt = buildBriefPrompt(ctx)
  const raw = await callModel(ctx, prompt)
  const draft = extractJSON(raw)
  if (!draft || typeof draft !== 'object') throw new Error('AI 回應不是有效的 JSON，請再試一次')
  const extra = asList(ctx.get('gen.banned_words_extra'))
  const flags = checkBrief(draft, extra)
  return { draft, flags, raw, prompt }
}

/**
 * 依老闆的修改意見重生（保留原卡結構）
 */
export async function regenerateBriefDraft(ctx, previousDraft, feedback) {
  const base = buildBriefPrompt(ctx)
  const prompt = `${base}

【上一版草稿】
${JSON.stringify(previousDraft).slice(0, 6000)}

【老闆的修改意見】
${feedback || '請把被標紅的句子全部改成合規的情境描述，其餘保留。'}

請輸出修正後的完整 JSON。`
  const raw = await callModel(ctx, prompt)
  const draft = extractJSON(raw)
  if (!draft || typeof draft !== 'object') throw new Error('AI 回應不是有效的 JSON，請再試一次')
  const flags = checkBrief(draft, asList(ctx.get('gen.banned_words_extra')))
  return { draft, flags, raw, prompt }
}

/** 匯出成 Google Ads Editor 可貼的純文字（第一階段半自動上線用） */
export function briefToEditorText(brief) {
  const d = brief?.draft || brief || {}
  const lines = []
  lines.push(`# ${d.campaign_name || ''}｜${d.angle || ''}`)
  lines.push('', '## RSA 標題')
  ;(d.rsa_headlines || []).forEach((h, i) => lines.push(`${i + 1}. ${h}`))
  lines.push('', '## RSA 描述')
  ;(d.rsa_descriptions || []).forEach((h, i) => lines.push(`${i + 1}. ${h}`))
  lines.push('', '## 關鍵字')
  lines.push('[完全] ' + (d.keywords?.exact || []).map(k => `[${k}]`).join(' '))
  lines.push('[詞組] ' + (d.keywords?.phrase || []).map(k => `"${k}"`).join(' '))
  lines.push('[廣泛] ' + (d.keywords?.broad || []).join(' '))
  lines.push('[否定] ' + (d.negatives || []).join('、'))
  lines.push('', '## 設定')
  lines.push(JSON.stringify(d.settings || {}, null, 2))
  lines.push('', '## 社群')
  lines.push('FB：', d.social?.fb || '', '', 'IG：', d.social?.ig || '', '', 'Threads：', d.social?.threads || '')
  lines.push('', '## EDM 主旨', ...(d.edm_subjects || []).map((s, i) => `${i + 1}. ${s}`))
  lines.push('', '## LINE 推播', d.line_push || '')
  return lines.join('\n')
}
