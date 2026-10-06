/**
 * marketingCalendar.js — 行銷行事曆：節氣 × 農曆民俗 × 電商檔期 × 送禮 × 自訂
 * ─────────────────────────────────────────────────────────────────────────────
 * buildYearCalendar(2026, settings) → [{ id, date, end_date, kind, name, lead_days, product_tags, tier }]
 * 顏色與分類給介面用（KINDS）；提前天數與倍率由行銷設定中心控制。
 * 範圍：好漢草（平安包、湯浴包、足浴袋、擦澡包、噴霧、平安皂）。
 */
import solarlunarPkg from 'solarlunar'
const solarlunar = solarlunarPkg.default || solarlunarPkg

export const KINDS = {
  solar_term:     { label: '節氣',     color: 'var(--mint-600)',  bg: 'var(--mint-100)',  dot: '#1fb473' },
  lunar_festival: { label: '民俗',     color: '#b3412a',          bg: 'var(--coral-100)', dot: '#ff7557' },
  ecommerce:      { label: '電商檔期', color: '#0b6ea3',          bg: 'var(--sky-100)',   dot: '#2eb7f0' },
  gift:           { label: '送禮',     color: '#5a3fb0',          bg: 'var(--lilac-100)', dot: '#8764e0' },
  weather:        { label: '天氣',     color: '#9a5a00',          bg: 'var(--peach-100)', dot: '#ffa322' },
  custom:         { label: '自訂',     color: 'var(--ink-700)',   bg: 'var(--bg-muted)',  dot: '#8d968f' },
}

// tier → 提前天數與倍率的設定 key
export const TIERS = {
  major:  { label: '大檔',   lead: 'calendar.lead_major',  mult: 'calendar.multiplier_major'  },
  mid:    { label: '中檔',   lead: 'calendar.lead_mid',    mult: 'calendar.multiplier_mid'    },
  purify: { label: '淨身檔', lead: 'calendar.lead_purify', mult: 'calendar.multiplier_purify' },
  term:   { label: '節氣',   lead: 'calendar.lead_term',   mult: 'calendar.multiplier_term'   },
  minor:  { label: '小檔',   lead: 'calendar.lead_mid',    mult: 'calendar.multiplier_mid'    },
}

// 農曆：[月, 日, 名稱, tier, 品類]
const LUNAR_EVENTS = [
  [1, 1,  '春節',        'major',  ['艾草平安包', '禮盒']],
  [1, 15, '元宵',        'minor',  ['艾草平安包']],
  [2, 2,  '土地公生',    'minor',  ['艾草平安包']],
  [3, 23, '媽祖生',      'purify', ['艾草平安包-媽祖', '平安皂']],
  [5, 5,  '端午',        'purify', ['艾草平安包', '淨境噴霧']],
  [7, 1,  '鬼月始',      'purify', ['艾草平安包', '平安皂', '淨境噴霧']],
  [7, 15, '中元',        'purify', ['艾草平安包', '淨境噴霧']],
  [8, 15, '中秋',        'mid',    ['禮盒', '足沐湯浴包']],
  [9, 9,  '重陽',        'minor',  ['足沐湯浴包', '感溫足浴袋']],
  [12, 8, '臘八',        'minor',  ['足沐湯浴包']],
  [12, 16,'尾牙',        'minor',  ['禮盒']],
  [12, 24,'送神・除舊',  'purify', ['艾草平安包', '淨境噴霧', '平安皂']],
]

// 節氣：主推品類（其餘節氣只顯示，不觸發）
const TERM_FOCUS = {
  清明: { tier: 'purify', tags: ['艾草平安包', '平安皂'] },
  霜降: { tier: 'term', tags: ['足沐湯浴包', '感溫足浴袋'] },
  立冬: { tier: 'term', tags: ['足沐湯浴包', '感溫足浴袋'] },
  小雪: { tier: 'term', tags: ['足沐湯浴包'] },
  大雪: { tier: 'term', tags: ['足沐湯浴包', '感溫足浴袋'] },
  冬至: { tier: 'term', tags: ['足沐湯浴包', '禮盒'] },
  小寒: { tier: 'term', tags: ['足沐湯浴包'] },
  大寒: { tier: 'term', tags: ['足沐湯浴包', '艾草平安包'] },
}

const pad = n => String(n).padStart(2, '0')
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`
function nthSunday(y, m, n) {            // 第 n 個星期日
  const first = new Date(y, m - 1, 1).getDay()
  const day = 1 + ((7 - first) % 7) + (n - 1) * 7
  return iso(y, m, day)
}
function lastFriday(y, m) {
  const last = new Date(y, m, 0)
  const back = (last.getDay() - 5 + 7) % 7
  return iso(y, m, last.getDate() - back)
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

/**
 * @param {number} year
 * @param {(key:string, fallback?:any)=>any} getSetting  行銷設定讀取函式（可省略，用內建預設）
 */
export function buildYearCalendar(year, getSetting = () => undefined) {
  const lead = tier => Number(getSetting(TIERS[tier].lead) ?? { major: 21, mid: 10, purify: 14, term: 7, minor: 7 }[tier])
  const mult = tier => Number(getSetting(TIERS[tier].mult) ?? { major: 3, mid: 1.8, purify: 2.5, term: 1.5, minor: 1.3 }[tier])
  const events = []
  const push = e => events.push({
    id: `${e.kind}-${year}-${e.name}`,
    year, date: e.date, end_date: e.end || e.date, kind: e.kind, name: e.name,
    tier: e.tier, lead_days: e.lead ?? lead(e.tier), multiplier: mult(e.tier),
    product_tags: e.tags || [], focus: e.focus !== false,
  })

  // 逐日掃描：節氣與農曆節慶
  for (let m = 1; m <= 12; m++) {
    const days = new Date(year, m, 0).getDate()
    for (let d = 1; d <= days; d++) {
      let lu
      try { lu = solarlunar.solar2lunar(year, m, d) } catch { continue }
      if (lu.term) {
        const f = TERM_FOCUS[lu.term]
        push({ date: iso(year, m, d), kind: 'solar_term', name: lu.term, tier: f ? f.tier : 'term', tags: f ? f.tags : [], focus: !!f, lead: f ? undefined : 0 })
      }
      if (!lu.isLeap) {
        for (const [lm, ld, name, tier, tags] of LUNAR_EVENTS) {
          if (lu.lMonth === lm && lu.lDay === ld) push({ date: iso(year, m, d), kind: 'lunar_festival', name, tier, tags })
        }
      }
    }
  }
  for (const e of ecommerceEvents(year)) push(e)

  // 自訂：'YYYY-MM-DD｜名稱｜提前天數｜品類,品類'
  for (const line of (getSetting('calendar.custom_events') || [])) {
    const [date, name, leadDays, tags] = String(line).split(/[｜|]/).map(s => s.trim())
    if (/^\d{4}-\d{2}-\d{2}$/.test(date || '') && name && date.startsWith(String(year))) {
      push({ date, kind: 'custom', name, tier: 'mid', lead: Number(leadDays) || 10, tags: tags ? tags.split(/[,，]/).map(s => s.trim()) : [] })
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date))
}

/** 兩年份合併（跨年才看得到年貨節） */
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

/** 接下來 N 天內的檔期（含「已進入提前期」的） */
export function upcomingEvents(events, from = todayISO(), days = 45) {
  const to = addDays(from, days)
  return events
    .filter(e => e.focus && e.end_date >= from && e.date <= to)
    .map(e => ({ ...e, days_to: daysBetween(from, e.date), in_lead: addDays(e.date, -e.lead_days) <= from && from <= e.end_date }))
    .sort((a, b) => a.date.localeCompare(b.date))
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
