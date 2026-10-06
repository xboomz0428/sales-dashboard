/**
 * calendar.js — 行銷行事曆：24 節氣 × 神明誕辰 × 宗教盛事 × 農曆民俗 × 電商檔期 × 送禮 × 自訂
 * ─────────────────────────────────────────────────────────────────────────────
 * buildYearCalendar(2026, getSetting) → [{ id, date, end_date, kind, tier, name, lead_days, multiplier, product_tags, note, estimated }]
 * upcomingEvents(events, today) → 已進入「醞釀期」的檔期（宗教盛事與神明誕辰預設提前 60 天）
 * yearList(events) → 全年清單（依月份分組），給「全年」分頁用
 *
 * 範圍：好漢草（艾草平安包、足沐湯浴包、感溫足浴袋、擦澡包、淨境噴霧、平安皂）。
 * 神明與盛事日期：農曆日期每年由程式換算；白沙屯、大甲等「擲筊決定」的活動用 KNOWN_DATES 記已公告日期，
 * 其餘年份用農曆估算並標 estimated=true，介面顯示「預估，待廟方公告」；也可在設定 calendar.religious_overrides 覆寫。
 */
import solarlunarPkg from 'solarlunar'
const solarlunar = solarlunarPkg.default || solarlunarPkg

export const KINDS = {
  solar_term:     { label: '節氣',     color: '#0b5536', bg: '#d6f3e4', dot: '#1fb473' },
  deity:          { label: '神明誕辰', color: '#8f1d1d', bg: '#ffe1d8', dot: '#c24a2c' },
  religious:      { label: '宗教盛事', color: '#7a2e00', bg: '#ffe4cc', dot: '#e0702a' },
  lunar_festival: { label: '民俗',     color: '#b3412a', bg: '#ffe1d8', dot: '#ff7557' },
  ecommerce:      { label: '電商檔期', color: '#0b4f7a', bg: '#dcefff', dot: '#2eb7f0' },
  gift:           { label: '送禮',     color: '#4b36a0', bg: '#e9e2fb', dot: '#8764e0' },
  weather:        { label: '天氣',     color: '#7a4a00', bg: '#ffefcf', dot: '#ffa322' },
  custom:         { label: '自訂',     color: '#2b332e', bg: '#ebede6', dot: '#8d968f' },
}

// tier → 提前天數與倍率的設定 key（預設值見 settings.js）
export const TIERS = {
  major:     { label: '大檔',     lead: 'calendar.lead_major',     mult: 'calendar.multiplier_major',     defLead: 21, defMult: 3   },
  mid:       { label: '中檔',     lead: 'calendar.lead_mid',       mult: 'calendar.multiplier_mid',       defLead: 10, defMult: 1.8 },
  purify:    { label: '淨身檔',   lead: 'calendar.lead_purify',    mult: 'calendar.multiplier_purify',    defLead: 14, defMult: 2.5 },
  term:      { label: '節氣',     lead: 'calendar.lead_term',      mult: 'calendar.multiplier_term',      defLead: 7,  defMult: 1.5 },
  minor:     { label: '小檔',     lead: 'calendar.lead_mid',       mult: 'calendar.multiplier_mid',       defLead: 10, defMult: 1.3 },
  deity:     { label: '神明誕辰', lead: 'calendar.lead_deity',     mult: 'calendar.multiplier_deity',     defLead: 60, defMult: 2   },
  religious: { label: '宗教盛事', lead: 'calendar.lead_religious', mult: 'calendar.multiplier_religious', defLead: 60, defMult: 2.5 },
}

/* ── 24 節氣：全部列出；focus=true 的才觸發企劃卡，其餘只顯示並提供文案意象 ─────────── */
export const SOLAR_TERMS = [
  { name: '立春', focus: false, tags: ['艾草平安包'],               note: '迎春、除舊布新；年節後淨化空間' },
  { name: '雨水', focus: false, tags: ['足沐湯浴包'],               note: '春雨濕冷、乍暖還寒，泡腳收尾冬天' },
  { name: '驚蟄', focus: true,  tier: 'minor', tags: ['艾草平安包', '淨境噴霧'], note: '打小人、去晦氣；開工開學淨身' },
  { name: '春分', focus: false, tags: ['擦澡包'],                   note: '日夜等長、換季整理；戶外踏青' },
  { name: '清明', focus: true,  tier: 'purify', tags: ['艾草平安包', '平安皂'], note: '掃墓回家淨身；艾草的傳統用法' },
  { name: '穀雨', focus: false, tags: ['淨境噴霧'],                 note: '潮濕悶熱開始、除濕去味' },
  { name: '立夏', focus: false, tags: ['擦澡包', '淨境噴霧'],       note: '夏天開始，清爽擦澡' },
  { name: '小滿', focus: false, tags: ['擦澡包'],                   note: '梅雨季、濕黏' },
  { name: '芒種', focus: false, tags: ['艾草平安包'],               note: '端午前後，艾草旺季' },
  { name: '夏至', focus: false, tags: ['擦澡包', '淨境噴霧'],       note: '最長的白天；冷氣房與戶外交替' },
  { name: '小暑', focus: false, tags: ['擦澡包'],                   note: '酷暑、流汗後擦澡' },
  { name: '大暑', focus: false, tags: ['擦澡包', '淨境噴霧'],       note: '一年最熱；室內空氣' },
  { name: '立秋', focus: false, tags: ['艾草平安包'],               note: '鬼月前後，平安淨身' },
  { name: '處暑', focus: false, tags: ['足沐湯浴包'],               note: '暑氣漸退、早晚轉涼' },
  { name: '白露', focus: false, tags: ['足沐湯浴包'],               note: '露水生、夜涼，泡腳季前奏' },
  { name: '秋分', focus: false, tags: ['足沐湯浴包', '禮盒'],       note: '中秋前後送禮、換季' },
  { name: '寒露', focus: true,  tier: 'term', tags: ['足沐湯浴包', '感溫足浴袋'], note: '「寒露腳不露」：泡腳季正式開始' },
  { name: '霜降', focus: true,  tier: 'term', tags: ['足沐湯浴包', '感溫足浴袋'], note: '秋末補冬前、第一波降溫' },
  { name: '立冬', focus: true,  tier: 'term', tags: ['足沐湯浴包', '感溫足浴袋'], note: '補冬、暖身；全年最強的泡腳意象' },
  { name: '小雪', focus: true,  tier: 'term', tags: ['足沐湯浴包'],               note: '濕冷；睡前泡腳' },
  { name: '大雪', focus: true,  tier: 'term', tags: ['足沐湯浴包', '感溫足浴袋'], note: '寒流前置、送禮開始' },
  { name: '冬至', focus: true,  tier: 'term', tags: ['足沐湯浴包', '禮盒'],       note: '湯圓、團圓、年終送禮' },
  { name: '小寒', focus: true,  tier: 'term', tags: ['足沐湯浴包'],               note: '一年最冷的開始' },
  { name: '大寒', focus: true,  tier: 'term', tags: ['足沐湯浴包', '艾草平安包'], note: '年前大掃除、除舊淨身' },
]
const TERM_INFO = Object.fromEntries(SOLAR_TERMS.map(t => [t.name, t]))

/* ── 農曆民俗（非神明誕辰）：[月, 日, 名稱, tier, 品類, 說明] ─────────────────────────── */
const LUNAR_EVENTS = [
  [1, 1,  '春節',        'major',  ['艾草平安包', '禮盒'],               '走春、拜拜、平安'],
  [1, 15, '元宵',        'minor',  ['艾草平安包'],                       '燈會、蜂炮、天燈（見宗教盛事）'],
  [2, 2,  '土地公生（頭牙）', 'minor', ['艾草平安包'],                   '福德正神聖誕；虎爺常陪祀土地公，廟口活動多'],
  [5, 5,  '端午',        'purify', ['艾草平安包', '淨境噴霧'],           '門口掛艾草、午時水；一年最強的艾草意象'],
  [7, 1,  '鬼月始（開鬼門）', 'purify', ['艾草平安包', '平安皂', '淨境噴霧'], '避煞、淨身、平安'],
  [7, 15, '中元普渡',    'purify', ['艾草平安包', '淨境噴霧'],           '普渡後淨身'],
  [7, 30, '關鬼門',      'minor',  ['艾草平安包'],                       '鬼月結束（月底），收尾檔'],
  [8, 15, '中秋',        'mid',    ['禮盒', '足沐湯浴包'],               '送禮、團圓'],
  [9, 9,  '重陽',        'minor',  ['足沐湯浴包', '感溫足浴袋'],         '敬老、孝親泡腳'],
  [12, 8, '臘八',        'minor',  ['足沐湯浴包'],                       '最冷的臘月'],
  [12, 16,'尾牙',        'minor',  ['禮盒'],                             '公司送禮'],
  [12, 24,'送神・除舊',  'purify', ['艾草平安包', '淨境噴霧', '平安皂'], '清屯、大掃除、淨宅'],
]

/* ── 神明誕辰／成道／飛昇（農曆）：[月, 日, 名稱, 品類, 說明] ───────────────────────────
 * 日期依台灣民間通行農民曆；各廟另有祭典日，可用設定「自訂檔期」補。
 * 媽祖：聖誕 3/23、飛昇（成道／昇天）9/9。虎爺：聖誕 6/6；另與土地公生（2/2）、各廟虎爺得道日由廟方公告。 */
const DEITY_EVENTS = [
  [1, 6,  '清水祖師聖誕',           ['艾草平安包'],                 '三峽祖師廟神豬祭典'],
  [1, 9,  '天公生（玉皇大帝聖誕）', ['艾草平安包', '平安皂'],       '拜天公、年節後第一個大日子'],
  [2, 3,  '文昌帝君聖誕',           ['艾草平安包'],                 '考生、開學；文昌平安'],
  [2, 19, '觀世音菩薩聖誕',         ['艾草平安包', '平安皂'],       '內門宋江陣同期（見宗教盛事）'],
  [3, 3,  '玄天上帝聖誕',           ['艾草平安包'],                 '上帝公生；北部廟會多'],
  [3, 15, '保生大帝聖誕',           ['艾草平安包', '足沐湯浴包'],   '醫神；保安宮保生文化祭'],
  [3, 20, '註生娘娘聖誕',           ['擦澡包', '艾草平安包'],       '求子、產後；擦澡包／月子'],
  [3, 23, '媽祖聖誕（天上聖母）',   ['艾草平安包-媽祖', '平安皂', '禮盒'], '全台媽祖廟祝壽；進香潮前後'],
  [4, 8,  '佛誕（浴佛節）',         ['平安皂', '擦澡包'],           '浴佛、淨身意象'],
  [5, 13, '霞海城隍聖誕',           ['艾草平安包'],                 '台北大稻埕迎城隍、夜巡'],
  [6, 6,  '虎爺聖誕',               ['艾草平安包-虎爺', '平安皂'],  '虎爺生；求財、小孩平安、咬錢虎；聯名平安包主檔'],
  [6, 19, '觀世音菩薩成道',         ['艾草平安包', '平安皂'],       ''],
  [6, 24, '關聖帝君聖誕',           ['艾草平安包', '禮盒'],         '武財神；商家拜拜'],
  [7, 7,  '七娘媽生（七夕）',       ['擦澡包', '禮盒'],             '做十六歲、情人節送禮'],
  [7, 30, '地藏王菩薩聖誕',         ['艾草平安包'],                 '鬼月最後一天（月底）'],
  [9, 9,  '媽祖飛昇（成道日）',     ['艾草平安包-媽祖', '平安皂'],  '天上聖母昇天紀念；北港、新港秋祭'],
  [9, 9,  '中壇元帥（三太子）聖誕', ['艾草平安包-虎爺', '艾草平安包'], '太子爺生；電音三太子、廟會'],
  [9, 19, '觀世音菩薩出家',         ['艾草平安包'],                 ''],
  [10, 15,'下元節（水官大帝）',     ['艾草平安包'],                 '三元節之末、謝平安'],
  [10, 22,'青山王聖誕',             ['艾草平安包'],                 '艋舺青山王祭正日（見宗教盛事）'],
]

/* ── 宗教盛事：rule 決定日期 ───────────────────────────────────────────────────────────
 * lunar: 農曆起日 + 天數；known: 已公告的國曆日期（擲筊決定者）；fallback 農曆估算 estimated=true
 * every: 幾年一科（東港迎王三年一科，2024 甲辰、2027 丁未、2030 庚戌） */
const RELIGIOUS_EVENTS = [
  { name: '鹽水蜂炮',           place: '台南鹽水武廟',   lunar: [1, 14], days: 2, tags: ['艾草平安包', '平安皂'], note: '元宵；關聖帝君遶境、炮城；全台三大炮' },
  { name: '平溪天燈節',         place: '新北平溪',       lunar: [1, 15], days: 1, tags: ['艾草平安包', '禮盒'], note: '元宵前後（實際場次依新北市公告）', estimate: true },
  { name: '台東炸寒單',         place: '台東市',         lunar: [1, 15], days: 2, tags: ['艾草平安包'], note: '元宵；寒單爺遶境' },
  { name: '內門宋江陣',         place: '高雄內門',       lunar: [2, 15], days: 7, tags: ['艾草平安包'], note: '觀音佛祖聖誕前後（國曆 3 月）', estimate: true },
  { name: '北港朝天宮迎媽祖',   place: '雲林北港',       lunar: [3, 19], days: 5, tags: ['艾草平安包-媽祖', '平安皂', '足沐湯浴包'], note: '3/19、3/20 遶境、3/23 祝壽；國家重要民俗' },
  { name: '保生文化祭',         place: '台北大龍峒保安宮', lunar: [3, 15], days: 1, tags: ['艾草平安包'], note: '保生大帝聖誕遶境、家姓戲（系列活動長達一個多月）' },
  { name: '白沙屯媽祖進香',     place: '苗栗通霄 → 北港', known: { 2026: ['2026-04-12', '2026-04-20'] }, lunar: [2, 26], days: 9, tags: ['艾草平安包-媽祖', '足沐湯浴包', '感溫足浴袋', '平安皂'], note: '每年元宵擲筊定日期；徒步 400 公里，香燈腳回家最需要泡腳', estimate: true },
  { name: '大甲媽祖遶境',       place: '台中大甲 → 新港', known: { 2026: ['2026-04-17', '2026-04-26'] }, lunar: [3, 1], days: 10, tags: ['艾草平安包-媽祖', '足沐湯浴包', '感溫足浴袋', '平安皂'], note: '每年元宵擲筊定日期；9 天 8 夜、數十萬人隨香', estimate: true },
  { name: '基隆中元祭',         place: '基隆',           lunar: [7, 1], days: 15, tags: ['艾草平安包', '淨境噴霧', '平安皂'], note: '7/14 放水燈遊行、7/15 普度；國家重要民俗' },
  { name: '頭城搶孤',           place: '宜蘭頭城',       lunar: [7, 'last'], days: 1, tags: ['艾草平安包', '平安皂'], note: '鬼月最後一夜（關鬼門前夕）' },
  { name: '東港迎王平安祭典',   place: '屏東東港東隆宮', lunar: [9, 11], days: 8, every: { base: 2024, n: 3 }, tags: ['艾草平安包', '平安皂', '足沐湯浴包'], note: '三年一科（2027 丁未正科）；請水、遶境、送王；國家重要民俗', estimate: true },
  { name: '艋舺青山王祭',       place: '台北萬華青山宮', lunar: [10, 20], days: 3, tags: ['艾草平安包', '淨境噴霧'], note: '10/20–21 暗訪、10/22 正日遶境；台北三大廟會' },
]

const pad = n => String(n).padStart(2, '0')
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`
function nthSunday(y, m, n) {
  const first = new Date(y, m - 1, 1).getDay()
  return iso(y, m, 1 + ((7 - first) % 7) + (n - 1) * 7)
}
function lastFriday(y, m) {
  const last = new Date(y, m, 0)
  return iso(y, m, last.getDate() - ((last.getDay() - 5 + 7) % 7))
}
/** 農曆 → 國曆 ISO；day='last' 取該月最後一天；轉換失敗回 null */
export function lunarToISO(lYear, lMonth, lDay) {
  try {
    const d = lDay === 'last' ? solarlunar.monthDays(lYear, lMonth) : lDay
    const dd = Math.min(d, solarlunar.monthDays(lYear, lMonth))
    const s = solarlunar.lunar2solar(lYear, lMonth, dd)
    if (!s || s === -1 || !s.cYear) return null
    return iso(s.cYear, s.cMonth, s.cDay)
  } catch { return null }
}

// 電商／送禮：固定西曆
function ecommerceEvents(y) {
  return [
    { date: iso(y, 1, 5),  end: iso(y, 1, 31), name: '年貨節',       tier: 'major', kind: 'ecommerce', tags: ['艾草平安包', '禮盒'] },
    { date: iso(y, 3, 1),  end: iso(y, 3, 8),  name: '38 女王節',    tier: 'mid',   kind: 'ecommerce', tags: ['足沐湯浴包', '感溫足浴袋'] },
    { date: nthSunday(y, 5, 2), end: null,     name: '母親節',       tier: 'major', kind: 'gift',      tags: ['禮盒', '足沐湯浴包', '感溫足浴袋'] },
    { date: iso(y, 6, 1),  end: iso(y, 6, 18), name: '618',          tier: 'mid',   kind: 'ecommerce', tags: ['艾草平安包'] },
    { date: iso(y, 7, 7),  end: null,          name: '77 購物節',    tier: 'minor', kind: 'ecommerce', tags: ['艾草平安包'] },
    { date: iso(y, 8, 8),  end: null,          name: '父親節',       tier: 'mid',   kind: 'gift',      tags: ['足沐湯浴包', '感溫足浴袋'] },
    { date: iso(y, 9, 9),  end: null,          name: '99 購物節',    tier: 'mid',   kind: 'ecommerce', tags: ['艾草平安包', '足沐湯浴包'] },
    { date: iso(y, 10, 10), end: null,         name: '雙 10',        tier: 'minor', kind: 'ecommerce', tags: ['足沐湯浴包'] },
    { date: iso(y, 11, 1), end: iso(y, 11, 11), name: '雙 11',       tier: 'major', kind: 'ecommerce', tags: ['艾草平安包', '足沐湯浴包', '感溫足浴袋'] },
    { date: lastFriday(y, 11), end: null,      name: '黑色星期五',   tier: 'minor', kind: 'ecommerce', tags: ['足沐湯浴包'] },
    { date: iso(y, 12, 12), end: null,         name: '雙 12',        tier: 'mid',   kind: 'ecommerce', tags: ['足沐湯浴包', '禮盒'] },
    { date: iso(y, 12, 25), end: null,         name: '聖誕',         tier: 'mid',   kind: 'gift',      tags: ['禮盒', '足沐湯浴包'] },
  ]
}

/** 設定「calendar.religious_overrides」：每行 '名稱｜YYYY-MM-DD｜YYYY-MM-DD'（結束日可省略） */
function parseOverrides(lines) {
  const map = {}
  for (const line of lines || []) {
    const [name, start, end] = String(line).split(/[｜|]/).map(s => s.trim())
    if (name && /^\d{4}-\d{2}-\d{2}$/.test(start || '')) map[`${name}@${start.slice(0, 4)}`] = { start, end: /^\d{4}-\d{2}-\d{2}$/.test(end || '') ? end : start }
  }
  return map
}

/**
 * @param {number} year
 * @param {(key:string)=>any} getSetting  設定讀取函式（可省略，用內建預設）
 */
export function buildYearCalendar(year, getSetting = () => undefined) {
  const lead = tier => { const v = Number(getSetting(TIERS[tier].lead)); return Number.isFinite(v) && v > 0 ? v : TIERS[tier].defLead }
  const mult = tier => { const v = Number(getSetting(TIERS[tier].mult)); return Number.isFinite(v) && v > 0 ? v : TIERS[tier].defMult }
  const overrides = parseOverrides(getSetting('calendar.religious_overrides'))
  const events = []
  const push = e => events.push({
    id: `${e.kind}-${year}-${e.name}`,
    year, date: e.date, end_date: e.end || e.date, kind: e.kind, name: e.name,
    tier: e.tier, lead_days: e.lead ?? lead(e.tier), multiplier: mult(e.tier),
    product_tags: e.tags || [], focus: e.focus !== false, note: e.note || '', place: e.place || '',
    estimated: !!e.estimated, lunar: e.lunar || '',
  })

  // 1) 逐日掃描：24 節氣與農曆民俗
  for (let m = 1; m <= 12; m++) {
    const days = new Date(year, m, 0).getDate()
    for (let d = 1; d <= days; d++) {
      let lu
      try { lu = solarlunar.solar2lunar(year, m, d) } catch { continue }
      if (lu.term) {
        const f = TERM_INFO[lu.term] || { focus: false, tags: [], note: '' }
        push({ date: iso(year, m, d), kind: 'solar_term', name: lu.term, tier: f.tier || 'term', tags: f.tags, note: f.note, focus: f.focus, lead: f.focus ? undefined : 0 })
      }
      if (!lu.isLeap) {
        const lastDay = solarlunar.monthDays(lu.lYear, lu.lMonth)
        for (const [lm, ld, name, tier, tags, note] of LUNAR_EVENTS) {
          const want = ld === 30 ? lastDay : ld
          if (lu.lMonth === lm && lu.lDay === want) push({ date: iso(year, m, d), kind: 'lunar_festival', name, tier, tags, note, lunar: `農曆 ${lm}/${ld === 30 ? '月底' : ld}` })
        }
        for (const [lm, ld, name, tags, note] of DEITY_EVENTS) {
          const want = ld === 30 ? lastDay : ld
          if (lu.lMonth === lm && lu.lDay === want) push({ date: iso(year, m, d), kind: 'deity', name, tier: 'deity', tags, note, lunar: `農曆 ${lm}/${ld === 30 ? '月底' : ld}` })
        }
      }
    }
  }

  // 2) 宗教盛事
  for (const r of RELIGIOUS_EVENTS) {
    if (r.every && ((year - r.every.base) % r.every.n !== 0)) continue
    const ov = overrides[`${r.name}@${year}`]
    let start, end, estimated = false
    if (ov) { start = ov.start; end = ov.end }
    else if (r.known && r.known[year]) { [start, end] = r.known[year] }
    else {
      start = lunarToISO(year, r.lunar[0], r.lunar[1])
      if (!start) continue
      end = addDays(start, (r.days || 1) - 1)
      estimated = !!r.estimate
    }
    if (!start || !start.startsWith(String(year))) continue
    push({ date: start, end, kind: 'religious', name: r.name, tier: 'religious', tags: r.tags, note: r.note, place: r.place, estimated,
      lunar: `農曆 ${r.lunar[0]}/${r.lunar[1] === 'last' ? '月底' : r.lunar[1]}${r.every ? `・${r.every.n} 年一科` : ''}` })
  }

  // 3) 電商與送禮
  for (const e of ecommerceEvents(year)) push(e)

  // 4) 自訂：'YYYY-MM-DD｜名稱｜提前天數｜品類,品類'
  for (const line of (getSetting('calendar.custom_events') || [])) {
    const [date, name, leadDays, tags] = String(line).split(/[｜|]/).map(s => s.trim())
    if (/^\d{4}-\d{2}-\d{2}$/.test(date || '') && name && date.startsWith(String(year))) {
      push({ date, kind: 'custom', name, tier: 'mid', lead: Number(leadDays) || 10, tags: tags ? tags.split(/[,，]/).map(s => s.trim()) : [] })
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'zh-Hant'))
}

/** 兩年份合併（跨年才看得到年貨節、春節） */
export function buildCalendarRange(fromYear, toYear, getSetting) {
  const out = []
  for (let y = fromYear; y <= toYear; y++) out.push(...buildYearCalendar(y, getSetting))
  return out
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate())
}
export function todayISO() { const d = new Date(); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()) }
export function daysBetween(a, b) { return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000) }

/** 階段：醞釀（提前期開始～31 天前）→ 準備（30～8 天）→ 衝刺（7 天內）→ 進行中 → 結束 */
export const STAGES = {
  brewing:  { label: '醞釀', hint: '找字、排內容、備貨與聯名洽談', color: '#4b36a0', bg: '#e9e2fb' },
  prepare:  { label: '準備', hint: '出企劃卡、寫文案、SEO 文章上線', color: '#0b4f7a', bg: '#dcefff' },
  sprint:   { label: '衝刺', hint: '廣告上線、每日看成效', color: '#7a4a00', bg: '#ffefcf' },
  live:     { label: '進行中', hint: '預算自動調整、每日觀察', color: '#0b5536', bg: '#d6f3e4' },
  done:     { label: '已結束', hint: '回收成效、回寫關鍵字池', color: '#2b332e', bg: '#ebede6' },
  later:    { label: '未到', hint: '', color: '#2b332e', bg: '#ebede6' },
}
export function eventStage(e, from = todayISO()) {
  const dt = daysBetween(from, e.date)
  if (from > e.end_date) return 'done'
  if (dt <= 0) return 'live'
  if (dt > e.lead_days) return 'later'
  if (dt <= Math.min(7, e.lead_days)) return 'sprint'
  if (dt <= Math.min(30, e.lead_days)) return 'prepare'
  return 'brewing'
}

/** 已進入提前期（或 N 天內）的檔期；宗教盛事與神明誕辰預設提前 60 天就出現 */
export function upcomingEvents(events, from = todayISO(), days = 60) {
  const to = addDays(from, days)
  return events
    .filter(e => e.focus && e.end_date >= from && (e.date <= to || addDays(e.date, -e.lead_days) <= from))
    .map(e => ({ ...e, days_to: daysBetween(from, e.date), in_lead: addDays(e.date, -e.lead_days) <= from && from <= e.end_date, stage: eventStage(e, from) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** 全年清單：依月份分組 { month:'2026-01', label:'1 月', items:[...] } */
export function yearList(events, year) {
  const groups = []
  for (let m = 1; m <= 12; m++) {
    const month = `${year}-${pad(m)}`
    const items = events.filter(e => e.date.startsWith(month))
    groups.push({ month, label: `${m} 月`, items })
  }
  return groups
}

/** 給月曆格子用：{ 'YYYY-MM-DD': [events] } */
export function eventsByDate(events) {
  const map = {}
  for (const e of events) {
    let d = e.date
    while (d <= e.end_date) { (map[d] ||= []).push(e); d = addDays(d, 1) }
  }
  return map
}
