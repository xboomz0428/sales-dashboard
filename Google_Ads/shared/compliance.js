/**
 * marketingCompliance.js — 文案合規前置檢查（藥事法／食安法／化粧品法 常見違規字）
 * ─────────────────────────────────────────────────────────────────────────────
 * 這是「硬關卡」的第一道：規則式掃描，命中即標紅並給合法替代句。
 * 完整審查仍要跑 compliance-copywriting Skill（含裁處案例），但這裡先擋掉 80% 的明顯問題。
 * 範圍：好漢草（艾草包、足浴包、擦澡包、噴霧、皂）→ 全部是「一般商品／化粧品」，不得宣稱療效或生理功能。
 */

// [正則, 類別, 合法替代建議]
const RULES = [
  [/治療|療效|根治|痊癒|醫療/g,           '療效宣稱',   '改成使用情境：「泡腳的時光」「居家淨身的儀式」'],
  [/改善|緩解|舒緩|減輕|消除/g,            '功能宣稱',   '改成感受描述：「暖呼呼」「放鬆一下」「乾淨清爽」'],
  [/消炎|抗發炎|止痛|止癢/g,               '療效宣稱',   '刪除；不可提症狀'],
  [/抗菌|殺菌|除菌|消毒|滅菌|抑菌/g,        '衛生宣稱',   '改成「清潔」「淨化空間的氣味」'],
  [/預防|防止(?:感冒|生病|疾病)/g,         '療效宣稱',   '刪除'],
  [/促進(?:血液)?循環|活血|通經|化瘀/g,    '生理功能',   '改成「泡腳後整個人暖起來」'],
  [/促進代謝|新陳代謝|代謝|去濕|祛濕|除濕(?!機)|排毒|排濕/g, '生理功能', '改成「濕冷天的泡腳時光」'],
  [/助眠|安眠|好眠(?!PLUS|plus)|安神|改善睡眠|睡得更好/g, '生理功能', '改成「睡前放鬆的儀式」；產品名「足好眠」可寫但不可延伸'],
  [/減重|減肥|瘦身|瘦腿|消水腫|燃脂|塑身/g,  '生理功能',   '改成「輕盈的感覺」「忙碌一天後的犒賞」'],
  [/舒筋|活絡|鬆筋|解除疲勞|消除疲勞|恢復體力/g, '生理功能', '改成「運動後的泡腳時間」'],
  [/調理體質|調整體質|養肝|補腎|補氣|滋補|溫補|強身|增強免疫|提升免疫/g, '中醫療效', '改成「日常的照顧」「冬天的暖身習慣」'],
  [/手腳冰冷(?:改善|不再|掰掰)|不再手腳冰冷/g, '生理功能', '可寫「手腳冰冷的人冬天最愛泡腳」（描述族群，不保證效果）'],
  [/保證|百分之百|絕對有效|有效(?:改善|舒緩|去)/g, '保證句',  '刪除保證用語'],
  [/醫師(?:推薦|認證|背書)|中醫(?:推薦|認證)|藥房|藥局(?:推薦)?/g, '薦證', '非經實際授權不可用；可寫「中醫師公會客製訂單」這類事實'],
  [/平安(?:有效|保證|一定)/g,              '民俗保證',   '民俗用語可寫「祈求平安」「淨身安心」，不可保證'],
  [/驅邪|避邪|化煞|改運|轉運|招財/g,       '民俗過度宣稱', '改成「淨身」「祈安」「除舊佈新」'],
  [/藥用|藥效|中藥(?:材)?(?:功效|效果)|漢方(?:療效|藥效)/g, '藥品暗示', '改成「草本」「植物」'],
]

/**
 * 掃描一段文字
 * @returns {{word:string, category:string, suggestion:string, index:number}[]}
 */
export function checkText(text, extraBanned = []) {
  if (!text) return []
  const str = String(text)
  const hits = []
  for (const [re, category, suggestion] of RULES) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(str))) hits.push({ word: m[0], category, suggestion, index: m.index })
  }
  for (const w of extraBanned) {
    if (!w) continue
    let i = str.indexOf(w)
    while (i !== -1) { hits.push({ word: w, category: '自訂禁用字', suggestion: '請改寫', index: i }); i = str.indexOf(w, i + w.length) }
  }
  return hits.sort((a, b) => a.index - b.index)
}

/**
 * 遞迴掃描整張企劃卡（物件／陣列／字串），回傳 [{ path, text, hits }]
 * path 例：rsa_headlines[3]、social.fb
 */
export function checkBrief(obj, extraBanned = [], path = '') {
  const out = []
  if (obj == null) return out
  if (typeof obj === 'string') {
    const hits = checkText(obj, extraBanned)
    if (hits.length) out.push({ path, text: obj, hits })
  } else if (Array.isArray(obj)) {
    obj.forEach((v, i) => out.push(...checkBrief(v, extraBanned, `${path}[${i}]`)))
  } else if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'keywords' || k === 'negatives' || k === 'compliance') continue   // 關鍵字層允許功效字
      out.push(...checkBrief(v, extraBanned, path ? `${path}.${k}` : k))
    }
  }
  return out
}

/** 給 AI prompt 用的禁用字摘要 */
export function bannedSummary() {
  return [
    '療效類：治療、療效、改善、緩解、舒緩、消炎、止痛、預防',
    '衛生類：抗菌、殺菌、除菌、消毒',
    '生理功能：促進循環、活血、代謝、去濕、排毒、助眠、安神、減重、消水腫、舒筋、消除疲勞',
    '中醫療效：調理體質、補氣、滋補、溫補、增強免疫',
    '保證與薦證：保證、絕對有效、醫師推薦、中醫認證',
    '民俗過度：驅邪、避邪、化煞、改運、招財（可用：淨身、祈安、除舊佈新、祈求平安）',
    '藥品暗示：藥用、藥效、中藥功效（可用：草本、植物）',
  ].join('\n')
}
